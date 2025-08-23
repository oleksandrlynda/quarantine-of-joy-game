export class PathFinder {
  constructor(obstacles = [], opts = {}) {
    this.cellSize = opts.cellSize || 1;
    this.climbable = opts.climbable ?? 1;
    this.setObstacles(obstacles);
  }

  setObstacles(obstacles = []) {
    this.obstacles = obstacles;
  }

  isBlocked(x, z) {
    const cs = this.cellSize * 0.5;
    for (const bb of this.obstacles) {
      const height = bb.max.y - bb.min.y;
      if (height <= this.climbable) continue;
      if (x + cs <= bb.min.x || x - cs >= bb.max.x) continue;
      if (z + cs <= bb.min.z || z - cs >= bb.max.z) continue;
      return true;
    }
    return false;
  }

  findPath(start, goal) {
    const cs = this.cellSize;
    const sx = Math.round(start.x / cs);
    const sz = Math.round(start.z / cs);
    const gx = Math.round(goal.x / cs);
    const gz = Math.round(goal.z / cs);

    let minX = Math.min(sx, gx), maxX = Math.max(sx, gx);
    let minZ = Math.min(sz, gz), maxZ = Math.max(sz, gz);
    for (const bb of this.obstacles) {
      minX = Math.min(minX, Math.floor(bb.min.x / cs) - 1);
      maxX = Math.max(maxX, Math.floor(bb.max.x / cs) + 1);
      minZ = Math.min(minZ, Math.floor(bb.min.z / cs) - 1);
      maxZ = Math.max(maxZ, Math.floor(bb.max.z / cs) + 1);
    }
    const width = maxX - minX + 1;
    const height = maxZ - minZ + 1;
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
        const wx = nx * cs;
        const wz = nz * cs;
        if (this.isBlocked(wx, wz)) {
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
    return [];
  }
}
