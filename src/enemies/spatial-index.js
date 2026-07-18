const cellCoord = (value, cellSize) => Math.floor(value / cellSize);
const cellKey = (x, y, z) => `${x},${y},${z}`;

export function closestPointOnSegmentXZ(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 1e-9
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq))
    : 0;
  const x = start.x + dx * t;
  const z = start.z + dz * t;
  return { t, x, z, distance: Math.hypot(point.x - x, point.z - z) };
}

export function segmentIntersectsBody(start, end, entry, padding = 0) {
  if (!entry?.root?.position || !entry.profile) return null;
  const closest = closestPointOnSegmentXZ(entry.root.position, start, end);
  const radius = entry.profile.collisionRadius + padding;
  if (closest.distance > radius) return null;
  const lineY = start.y + (end.y - start.y) * closest.t;
  const bottom = entry.profile.movementLayer === 'ground'
    ? entry.root.position.y - entry.profile.groundOffset
    : entry.root.position.y - entry.profile.collisionHeight * 0.5;
  const top = bottom + entry.profile.collisionHeight;
  if (lineY < bottom - padding || lineY > top + padding) return null;
  return { ...closest, radius, entry };
}

export function verticalSpansOverlap(aRoot, aProfile, bRoot, bProfile, tolerance = 0.02) {
  const aBottom = aProfile.movementLayer === 'ground'
    ? aRoot.position.y - aProfile.groundOffset
    : aRoot.position.y - aProfile.collisionHeight * 0.5;
  const bBottom = bProfile.movementLayer === 'ground'
    ? bRoot.position.y - bProfile.groundOffset
    : bRoot.position.y - bProfile.collisionHeight * 0.5;
  const aTop = aBottom + aProfile.collisionHeight;
  const bTop = bBottom + bProfile.collisionHeight;
  return aTop > bBottom + tolerance && bTop > aBottom + tolerance;
}

export class EnemySpatialIndex {
  constructor({ cellSize = 4, verticalCellSize = 3 } = {}) {
    this.cellSize = cellSize;
    this.verticalCellSize = verticalCellSize;
    this.cells = new Map();
    this.entryByRoot = new WeakMap();
    this.size = 0;
  }

  clear() {
    this.cells.clear();
    this.entryByRoot = new WeakMap();
    this.size = 0;
  }

  rebuild(roots, profileForRoot) {
    this.clear();
    for (const root of roots || []) {
      if (!root?.position) continue;
      const profile = profileForRoot(root);
      const entry = { root, profile };
      this.entryByRoot.set(root, entry);
      const cx = cellCoord(root.position.x, this.cellSize);
      const cy = cellCoord(root.position.y, this.verticalCellSize);
      const cz = cellCoord(root.position.z, this.cellSize);
      const key = cellKey(cx, cy, cz);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(entry);
      this.size++;
    }
  }

  entry(root) {
    return this.entryByRoot.get(root) || null;
  }

  queryRadius(position, radius, { excludeRoot = null, layer = null, verticalRadius = Infinity, out = [] } = {}) {
    out.length = 0;
    if (!position || radius < 0) return out;
    const minX = cellCoord(position.x - radius, this.cellSize);
    const maxX = cellCoord(position.x + radius, this.cellSize);
    const minZ = cellCoord(position.z - radius, this.cellSize);
    const maxZ = cellCoord(position.z + radius, this.cellSize);
    const minY = Number.isFinite(verticalRadius)
      ? cellCoord(position.y - verticalRadius, this.verticalCellSize)
      : -100;
    const maxY = Number.isFinite(verticalRadius)
      ? cellCoord(position.y + verticalRadius, this.verticalCellSize)
      : 100;
    const radiusSq = radius * radius;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const bucket = this.cells.get(cellKey(cx, cy, cz));
          if (!bucket) continue;
          for (const entry of bucket) {
            if (entry.root === excludeRoot) continue;
            if (layer && entry.profile.movementLayer !== layer) continue;
            const dx = entry.root.position.x - position.x;
            const dz = entry.root.position.z - position.z;
            if (dx * dx + dz * dz > radiusSq) continue;
            if (Number.isFinite(verticalRadius) && Math.abs(entry.root.position.y - position.y) > verticalRadius) continue;
            out.push(entry);
          }
        }
      }
    }
    return out;
  }

  firstBodyOnSegment(start, end, {
    excludeRoot = null,
    padding = 0,
    layer = null,
    out = []
  } = {}) {
    const midpoint = {
      x: (start.x + end.x) * 0.5,
      y: (start.y + end.y) * 0.5,
      z: (start.z + end.z) * 0.5
    };
    const halfLength = Math.hypot(end.x - start.x, end.z - start.z) * 0.5;
    this.queryRadius(midpoint, halfLength + 2.5 + padding, {
      excludeRoot,
      layer,
      verticalRadius: Math.abs(end.y - start.y) * 0.5 + 4,
      out
    });
    let best = null;
    for (const entry of out) {
      const hit = segmentIntersectsBody(start, end, entry, padding);
      if (!hit || (best && hit.t >= best.t)) continue;
      best = hit;
    }
    return best;
  }
}
