// Simple pathfinding module for enemy navigation.
// Uses A* search on a coarse grid derived from obstacle AABBs.
// Paths are cached per enemy for a short duration to avoid oscillation.
// The A* open set leverages a tiny binary heap for efficient retrieval of the
// lowest-f node without scanning arrays. The heap stores lightweight objects
// and, given our local grid sizes, the extra memory overhead is minimal.
//
// To avoid main-thread stalls, searches execute inside a Web Worker when the
// environment supports it. The worker keeps memory usage low by retaining only
// the minimal grid and open/closed sets needed for the current request.

import MinHeap from './util/MinHeap.js';

// Cache of paths per enemy: enemy -> { path, expires, index, requestId? }
const _cache = new WeakMap();

// Pending worker requests: id -> { resolve, reject, enemy, cacheFor }
const _pending = new Map();
let _seq = 0;
let _worker = null;

function _ensureWorker() {
  if (_worker || typeof Worker === 'undefined') return;
  _worker = new Worker(new URL('./worker/pathWorker.js', import.meta.url), { type: 'module' });
  _worker.onmessage = (e) => {
    const { id, path } = e.data || {};
    const pending = _pending.get(id);
    if (!pending) return;
    _pending.delete(id);
    const { enemy, cacheFor, resolve } = pending;
    const entry = _cache.get(enemy);
    if (entry && entry.requestId === id) {
      _cache.set(enemy, { path, expires: Date.now() + cacheFor, index: 0 });
    }
    resolve(path);
  };
}

function _hash(ix, iz) { return ix + ',' + iz; }

function _buildGrid(start, goal, obstacles, gridSize, radius) {
  const minX = Math.floor(Math.min(start.x, goal.x) - radius);
  const maxX = Math.ceil(Math.max(start.x, goal.x) + radius);
  const minZ = Math.floor(Math.min(start.z, goal.z) - radius);
  const maxZ = Math.ceil(Math.max(start.z, goal.z) + radius);
  const width = Math.ceil((maxX - minX) / gridSize) + 1;
  const height = Math.ceil((maxZ - minZ) / gridSize) + 1;

  const blocked = new Array(width * height).fill(false);
  const margin = 0.5; // expand obstacles slightly for enemy radius
  for (const ob of obstacles || []) {
    const minix = Math.floor((ob.min.x - margin - minX) / gridSize);
    const maxix = Math.floor((ob.max.x + margin - minX) / gridSize);
    const miniz = Math.floor((ob.min.z - margin - minZ) / gridSize);
    const maxiz = Math.floor((ob.max.z + margin - minZ) / gridSize);
    for (let ix = minix; ix <= maxix; ix++) {
      if (ix < 0 || ix >= width) continue;
      for (let iz = miniz; iz <= maxiz; iz++) {
        if (iz < 0 || iz >= height) continue;
        blocked[ix + iz * width] = true;
      }
    }
  }
  return { minX, minZ, width, height, blocked };
}

function _heuristic(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz; return Math.abs(dx) + Math.abs(dz);
}

// Synchronous A* search used by the worker and as a fallback when Web Workers
// are unavailable (e.g. during tests or in legacy environments).
export function findPath(start, goal, obstacles, opts = {}) {
  const gridSize = opts.gridSize || 1;
  const radius = opts.radius || 20;
  const grid = _buildGrid(start, goal, obstacles, gridSize, radius);
  const sx = Math.round((start.x - grid.minX) / gridSize);
  const sz = Math.round((start.z - grid.minZ) / gridSize);
  const gx = Math.round((goal.x - grid.minX) / gridSize);
  const gz = Math.round((goal.z - grid.minZ) / gridSize);

  const open = new MinHeap((a, b) => a.f - b.f);
  open.push({ ix: sx, iz: sz, g: 0, f: _heuristic(sx, sz, gx, gz) });
  const came = new Map();
  const g = new Map(); g.set(_hash(sx, sz), 0);

  while (open.size() > 0) {
    const current = open.pop();
    const curKey = _hash(current.ix, current.iz);
    if (current.g !== (g.get(curKey) ?? Infinity)) continue; // stale entry
    if (current.ix === gx && current.iz === gz) {
      const path = [];
      let cx = current.ix, cz = current.iz;
      let key = _hash(cx, cz);
      while (true) {
        path.unshift({ x: cx * gridSize + grid.minX, z: cz * gridSize + grid.minZ });
        const prev = came.get(key); if (!prev) break;
        cx = prev.ix; cz = prev.iz; key = _hash(cx, cz);
      }
      path[path.length - 1] = { x: goal.x, z: goal.z }; // ensure exact goal
      return path;
    }
    const neighbors = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    for (const [dx, dz] of neighbors) {
      const nix = current.ix + dx;
      const niz = current.iz + dz;
      if (nix < 0 || niz < 0 || nix >= grid.width || niz >= grid.height) continue;
      if (grid.blocked[nix + niz * grid.width]) continue;
      const key = _hash(nix, niz);
      const tentative = current.g + Math.hypot(dx, dz);
      if (tentative < (g.get(key) ?? Infinity)) {
        came.set(key, { ix: current.ix, iz: current.iz });
        g.set(key, tentative);
        const score = tentative + _heuristic(nix, niz, gx, gz);
        open.push({ ix: nix, iz: niz, g: tentative, f: score });
      }
    }
  }
  return [];
}

function _requestPath(enemy, start, goal, obstacles, opts = {}) {
  const cacheFor = (opts.cacheFor || 5) * 1000;
  _ensureWorker();
  if (!_worker) {
    const path = findPath(start, goal, obstacles, opts);
    _cache.set(enemy, { path, expires: Date.now() + cacheFor, index: 0 });
    return Promise.resolve(path);
  }
  const id = ++_seq;
  const p = new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject, enemy, cacheFor });
  });
  const entry = _cache.get(enemy) || {};
  entry.requestId = id;
  entry.pending = p;
  _cache.set(enemy, entry);
  _worker.postMessage({ id, start, goal, obstacles, opts });
  return p;
}

export function recomputeIfStale(enemy, playerPos, obstacles, opts = {}) {
  const now = Date.now();
  const entry = _cache.get(enemy);
  const cacheFor = (opts.cacheFor || 5) * 1000;
  let need = false;
  if (!entry || !entry.path) need = true;
  else if (now > entry.expires) need = true;
  else if (entry.path.length === 0) need = true;
  else {
    const last = entry.path[entry.path.length - 1];
    const dx = last.x - playerPos.x; const dz = last.z - playerPos.z;
    if (dx * dx + dz * dz > 1) need = true;
  }
  if (need) {
    const startPos = enemy.root?.position || enemy.position || { x: 0, y: 0, z: 0 };
    return _requestPath(enemy, startPos, playerPos, obstacles, opts);
  }
  return Promise.resolve(entry.path);
}

export function nextWaypoint(enemy) {
  const entry = _cache.get(enemy);
  if (!entry || !entry.path || entry.path.length === 0) return null;
  const pos = enemy.root?.position || enemy.position;
  if (!pos) return null;
  let idx = entry.index || 0;
  const wp = entry.path[idx];
  const dx = wp.x - pos.x; const dz = wp.z - pos.z;
  if (dx * dx + dz * dz < 0.25) {
    idx++; entry.index = idx;
    if (idx >= entry.path.length) return null;
    return entry.path[idx];
  }
  return wp;
}

export function clear(enemy) {
  const entry = _cache.get(enemy);
  if (entry && entry.requestId != null) {
    const pending = _pending.get(entry.requestId);
    if (pending) _pending.delete(entry.requestId);
  }
  _cache.delete(enemy);
}

export default { findPath, nextWaypoint, recomputeIfStale, clear };

