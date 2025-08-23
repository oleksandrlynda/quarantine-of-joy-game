// Web Worker that performs A* pathfinding off the main thread.
// Receives {id, start, goal, obstacles, opts} messages and replies with
// {id, path} once the search completes.

import MinHeap from '../util/MinHeap.js';

function hash(ix, iz) { return ix + ',' + iz; }

function buildGrid(start, goal, obstacles, gridSize, radius) {
  const minX = Math.floor(Math.min(start.x, goal.x) - radius);
  const maxX = Math.ceil(Math.max(start.x, goal.x) + radius);
  const minZ = Math.floor(Math.min(start.z, goal.z) - radius);
  const maxZ = Math.ceil(Math.max(start.z, goal.z) + radius);
  const width = Math.ceil((maxX - minX) / gridSize) + 1;
  const height = Math.ceil((maxZ - minZ) / gridSize) + 1;

  const blocked = new Array(width * height).fill(false);
  const margin = 0.5;
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

function heuristic(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz; return Math.abs(dx) + Math.abs(dz);
}

function findPath(start, goal, obstacles, opts = {}) {
  const gridSize = opts.gridSize || 1;
  const radius = opts.radius || 20;
  const grid = buildGrid(start, goal, obstacles, gridSize, radius);
  const sx = Math.round((start.x - grid.minX) / gridSize);
  const sz = Math.round((start.z - grid.minZ) / gridSize);
  const gx = Math.round((goal.x - grid.minX) / gridSize);
  const gz = Math.round((goal.z - grid.minZ) / gridSize);

  const open = new MinHeap((a, b) => a.f - b.f);
  open.push({ ix: sx, iz: sz, g: 0, f: heuristic(sx, sz, gx, gz) });
  const came = new Map();
  const g = new Map(); g.set(hash(sx, sz), 0);

  while (open.size() > 0) {
    const current = open.pop();
    const curKey = hash(current.ix, current.iz);
    if (current.g !== (g.get(curKey) ?? Infinity)) continue;
    if (current.ix === gx && current.iz === gz) {
      const path = [];
      let cx = current.ix, cz = current.iz;
      let key = hash(cx, cz);
      while (true) {
        path.unshift({ x: cx * gridSize + grid.minX, z: cz * gridSize + grid.minZ });
        const prev = came.get(key); if (!prev) break;
        cx = prev.ix; cz = prev.iz; key = hash(cx, cz);
      }
      path[path.length - 1] = { x: goal.x, z: goal.z };
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
      const key = hash(nix, niz);
      const tentative = current.g + Math.hypot(dx, dz);
      if (tentative < (g.get(key) ?? Infinity)) {
        came.set(key, { ix: current.ix, iz: current.iz });
        g.set(key, tentative);
        const score = tentative + heuristic(nix, niz, gx, gz);
        open.push({ ix: nix, iz: niz, g: tentative, f: score });
      }
    }
  }
  return [];
}

self.onmessage = (e) => {
  const { id, start, goal, obstacles, opts } = e.data || {};
  const path = findPath(start, goal, obstacles, opts);
  self.postMessage({ id, path });
};

