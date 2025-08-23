export class PathFinder {
  constructor(obstacles = [], opts = {}) {
    this.cellSize = opts.cellSize || 1;
    this.climbable = opts.climbable ?? 1;
    this.grid = new Set();
    this.bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this.lastDuration = 0;
    this.setObstacles(obstacles);
  }

  setObstacles(obstacles = []) {
    this.obstacles = obstacles;
    this.grid.clear();
    const cs = this.cellSize;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const bb of obstacles) {
      const height = bb.max.y - bb.min.y;
      if (height <= this.climbable) continue;
      const x0 = Math.floor(bb.min.x / cs);
      const x1 = Math.floor(bb.max.x / cs);
      const z0 = Math.floor(bb.min.z / cs);
      const z1 = Math.floor(bb.max.z / cs);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          this.grid.add(x + ',' + z);
        }
      }
      if (x0 < minX) minX = x0;
      if (x1 > maxX) maxX = x1;
      if (z0 < minZ) minZ = z0;
      if (z1 > maxZ) maxZ = z1;
    }
    if (!isFinite(minX)) { minX = maxX = minZ = maxZ = 0; }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  _isBlockedCell(ix, iz) {
    return this.grid.has(ix + ',' + iz);
  }

  isBlocked(x, z) {
    const cs = this.cellSize;
    const ix = Math.round(x / cs);
    const iz = Math.round(z / cs);
    return this._isBlockedCell(ix, iz);
  }

  findPath(start, goal) {
    const t0 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    const cs = this.cellSize;
    const sx = Math.round(start.x / cs);
    const sz = Math.round(start.z / cs);
    const gx = Math.round(goal.x / cs);
    const gz = Math.round(goal.z / cs);

    let minX = Math.min(this.bounds.minX, sx, gx) - 1;
    let maxX = Math.max(this.bounds.maxX, sx, gx) + 1;
    let minZ = Math.min(this.bounds.minZ, sz, gz) - 1;
    let maxZ = Math.max(this.bounds.maxZ, sz, gz) + 1;
    const width = maxX - minX + 1;
    const toIndex = (ix, iz) => (iz - minZ) * width + (ix - minX);

    const open = new Map();
    const closed = new Set();
    const startKey = toIndex(sx, sz);
    const startNode = { x: sx, z: sz, g: 0, f: Math.abs(gx - sx) + Math.abs(gz - sz), parent: null };
    open.set(startKey, startNode);

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    while (open.size) {
      let currentKey = null;
      let currentNode = null;
      let bestF = Infinity;
      for (const [k, n] of open) {
        if (n.f < bestF) {
          bestF = n.f;
          currentKey = k;
          currentNode = n;
        }
      }
      if (!currentNode) break;
      if (currentNode.x === gx && currentNode.z === gz) {
        const out = [];
        let c = currentNode;
        while (c) {
          out.push({ x: c.x * cs, z: c.z * cs });
          c = c.parent;
        }
        this.lastDuration = ((typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now()) - t0;
        return out.reverse();
      }
      open.delete(currentKey);
      closed.add(currentKey);

      for (const [dx, dz] of dirs) {
        const nx = currentNode.x + dx;
        const nz = currentNode.z + dz;
        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) continue;
        const nKey = toIndex(nx, nz);
        if (closed.has(nKey)) continue;
        if (this._isBlockedCell(nx, nz)) {
          closed.add(nKey);
          continue;
        }
        const g = currentNode.g + 1;
        const h = Math.abs(gx - nx) + Math.abs(gz - nz);
        const f = g + h;
        const existing = open.get(nKey);
        if (!existing || g < existing.g) {
          open.set(nKey, { x: nx, z: nz, g, f, parent: currentNode });
        }
      }
    }
    this.lastDuration = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now()) - t0;
    return [];
  }
}
