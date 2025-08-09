import { makeSeededRng } from '../util/rng.js';

export class MazeGenerator {
  constructor(THREE) {
    this.THREE = THREE;
    this.meshes = [];
    this.placed = null; // structure of placed edges
  }

  clear(scene) {
    if (this.meshes) {
      for (const m of this.meshes) scene.remove(m);
    }
    this.meshes = [];
    this.placed = null;
  }

  build({ scene, mats, seed, grid = 6, bounds = { min: -36, max: 36 }, coverageCap = 0.2, spawnPoints = [] }) {
    const THREE = this.THREE;
    this.clear(scene);

    const rng = makeSeededRng(seed);
    const min = bounds.min, max = bounds.max;
    const innerSize = max - min; // e.g. 72
    const cell = innerSize / grid; // e.g. 12
    const wallT = 0.6; // keep corridors >= 1.5 comfortably
    const wallH = 2.0;
    const arenaArea = innerSize * innerSize;
    const maxArea = coverageCap * arenaArea;
    let usedArea = 0;

    // Track walls; start full, then carve corridors with randomized Prim to guarantee a maze of corridors
    const V = Array.from({ length: grid }, () => Array(grid - 1).fill(true));
    const H = Array.from({ length: grid - 1 }, () => Array(grid).fill(true));

    // Randomized Prim's algorithm to create a spanning tree of cells (corridors)
    const inMaze = Array.from({ length: grid }, () => Array(grid).fill(false));
    const frontier = [];
    const addFrontier = (r, c) => {
      if (r < 0 || c < 0 || r >= grid || c >= grid) return;
      if (inMaze[r][c]) return;
      frontier.push({ r, c });
    };
    const startR = Math.floor(rng() * grid);
    const startC = Math.floor(rng() * grid);
    inMaze[startR][startC] = true;
    addFrontier(startR - 1, startC);
    addFrontier(startR + 1, startC);
    addFrontier(startR, startC - 1);
    addFrontier(startR, startC + 1);
    while (frontier.length) {
      const idx = Math.floor(rng() * frontier.length);
      const cell = frontier.splice(idx, 1)[0];
      const neighbors = [];
      if (cell.r > 0 && inMaze[cell.r - 1][cell.c]) neighbors.push({ r: cell.r - 1, c: cell.c });
      if (cell.r < grid - 1 && inMaze[cell.r + 1][cell.c]) neighbors.push({ r: cell.r + 1, c: cell.c });
      if (cell.c > 0 && inMaze[cell.r][cell.c - 1]) neighbors.push({ r: cell.r, c: cell.c - 1 });
      if (cell.c < grid - 1 && inMaze[cell.r][cell.c + 1]) neighbors.push({ r: cell.r, c: cell.c + 1 });
      if (!neighbors.length) continue;
      const nb = neighbors[Math.floor(rng() * neighbors.length)];
      // Remove wall between cell and nb to carve corridor
      if (nb.r === cell.r) {
        const c0 = Math.min(nb.c, cell.c);
        V[cell.r][c0] = false;
      } else if (nb.c === cell.c) {
        const r0 = Math.min(nb.r, cell.r);
        H[r0][cell.c] = false;
      }
      // Add cell to maze and add its frontiers
      inMaze[cell.r][cell.c] = true;
      addFrontier(cell.r - 1, cell.c);
      addFrontier(cell.r + 1, cell.c);
      addFrontier(cell.r, cell.c - 1);
      addFrontier(cell.r, cell.c + 1);
    }

    // Optional: add a few extra openings to create loops
    let extraOpens = Math.floor(grid); // e.g., 6
    while (extraOpens-- > 0) {
      if (rng() < 0.5) {
        const r = Math.floor(rng() * grid);
        const c = Math.floor(rng() * (grid - 1));
        V[r][c] = false;
      } else {
        const r = Math.floor(rng() * (grid - 1));
        const c = Math.floor(rng() * grid);
        H[r][c] = false;
      }
    }

    // Helper to test connectivity west→east and north→south given current walls
    const hasConnectivity = () => {
      const seen = Array.from({ length: grid }, () => Array(grid).fill(false));
      const q = [];
      for (let r = 0; r < grid; r++) { q.push([r, 0]); seen[r][0] = true; }
      const pushIfFree = (nr, nc) => { if (nr >= 0 && nr < grid && nc >= 0 && nc < grid && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nr, nc]); } };
      while (q.length) {
        const [r, c] = q.shift();
        if (c > 0 && !V[r][c - 1]) pushIfFree(r, c - 1);
        if (c < grid - 1 && !V[r][c]) pushIfFree(r, c + 1);
        if (r > 0 && !H[r - 1][c]) pushIfFree(r - 1, c);
        if (r < grid - 1 && !H[r][c]) pushIfFree(r + 1, c);
      }
      let westToEast = false; for (let r = 0; r < grid; r++) { if (seen[r][grid - 1]) { westToEast = true; break; } }
      for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) seen[r][c] = false;
      q.length = 0; for (let c = 0; c < grid; c++) { q.push([0, c]); seen[0][c] = true; }
      while (q.length) {
        const [r, c] = q.shift();
        if (c > 0 && !V[r][c - 1]) pushIfFree(r, c - 1);
        if (c < grid - 1 && !V[r][c]) pushIfFree(r, c + 1);
        if (r > 0 && !H[r - 1][c]) pushIfFree(r - 1, c);
        if (r < grid - 1 && !H[r][c]) pushIfFree(r + 1, c);
      }
      let northToSouth = false; for (let c = 0; c < grid; c++) { if (seen[grid - 1][c]) { northToSouth = true; break; } }
      return westToEast && northToSouth;
    };

    // Now V/H indicate walls to keep. Enforce spawn fairness by removing walls too close to spawn ring lines (±24)
    const rectDistance = (px, pz, cx, cz, hx, hz) => {
      const dx = Math.abs(px - cx) - hx;
      const dz = Math.abs(pz - cz) - hz;
      const ax = Math.max(dx, 0);
      const az = Math.max(dz, 0);
      if (dx <= 0 && dz <= 0) return 0; // inside
      return Math.hypot(ax, az);
    };
    const margin = 1.5;
    const ringLines = [-24, 24];
    const nearRing = (cx, cz, hx, hz) => {
      // distance to infinite vertical lines x=±24 or horizontal lines z=±24
      for (const lx of ringLines) { if (Math.abs(cx - lx) <= hx + margin) return true; }
      for (const lz of ringLines) { if (Math.abs(cz - lz) <= hz + margin) return true; }
      return false;
    };
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid - 1; c++) {
        if (!V[r][c]) continue;
        const cx = min + (c + 1) * cell;
        const cz = min + (r + 0.5) * cell;
        const hx = wallT / 2, hz = cell / 2;
        if (nearRing(cx, cz, hx, hz)) V[r][c] = false;
      }
    }
    for (let r = 0; r < grid - 1; r++) {
      for (let c = 0; c < grid; c++) {
        if (!H[r][c]) continue;
        const cx = min + (c + 0.5) * cell;
        const cz = min + (r + 1) * cell;
        const hx = cell / 2, hz = wallT / 2;
        if (nearRing(cx, cz, hx, hz)) H[r][c] = false;
      }
    }

    // Balance coverage: try to raise wall coverage toward target (~16%) without breaking cross connectivity
    const segAreaV = wallT * cell;
    const segAreaH = cell * wallT;
    const targetArea = Math.min(maxArea, arenaArea * 0.16);
    let area = 0;
    for (let r = 0; r < grid; r++) for (let c = 0; c < grid - 1; c++) if (V[r][c]) area += segAreaV;
    for (let r = 0; r < grid - 1; r++) for (let c = 0; c < grid; c++) if (H[r][c]) area += segAreaH;

    let attempts = 1200; // cap iterations for perf
    while (area < targetArea && attempts-- > 0) {
      const pickV = rng() < 0.5;
      if (pickV) {
        const r = Math.floor(rng() * grid);
        const c = Math.floor(rng() * (grid - 1));
        if (!V[r][c]) {
          // Check spawn fairness for this segment
          const cx = min + (c + 1) * cell;
          const cz = min + (r + 0.5) * cell;
          const hx = wallT / 2, hz = cell / 2;
          if (nearRing(cx, cz, hx, hz)) { continue; }
          V[r][c] = true;
          if (!hasConnectivity()) { V[r][c] = false; continue; }
          area += segAreaV;
        }
      } else {
        const r = Math.floor(rng() * (grid - 1));
        const c = Math.floor(rng() * grid);
        if (!H[r][c]) {
          const cx = min + (c + 0.5) * cell;
          const cz = min + (r + 1) * cell;
          const hx = cell / 2, hz = wallT / 2;
          if (nearRing(cx, cz, hx, hz)) { continue; }
          H[r][c] = true;
          if (!hasConnectivity()) { H[r][c] = false; continue; }
          area += segAreaH;
        }
      }
    }

    // Ensure we never exceed cap (drop random segments if over)
    while (area > maxArea) {
      if (rng() < 0.5) {
        const r = Math.floor(rng() * grid);
        const c = Math.floor(rng() * (grid - 1));
        if (V[r][c]) { V[r][c] = false; area -= segAreaV; }
      } else {
        const r = Math.floor(rng() * (grid - 1));
        const c = Math.floor(rng() * grid);
        if (H[r][c]) { H[r][c] = false; area -= segAreaH; }
      }
    }

    // hasConnectivity defined above

    // Final safety: if connectivity somehow broke, carve a guaranteed straight corridor both directions
    if (!hasConnectivity()) {
      const mid = Math.floor(grid / 2);
      for (let c = 0; c < grid - 1; c++) V[mid][c] = false;
      for (let r = 0; r < grid - 1; r++) H[r][mid] = false;
    }

    // Material
    const mat = mats?.wall || new THREE.MeshLambertMaterial({ color: 0x7aa7c7 });

    // Create meshes for placed segments (only if any remain after constraints)
    const addMesh = (x, z, sx, sz) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, wallH, sz), mat);
      mesh.position.set(x, wallH / 2, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    };

    let any = false;
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid - 1; c++) {
        if (V[r][c]) {
          const x = min + (c + 1) * cell;
          const z = min + (r + 0.5) * cell;
          addMesh(x, z, wallT, cell);
          any = true;
        }
      }
    }
    for (let r = 0; r < grid - 1; r++) {
      for (let c = 0; c < grid; c++) {
        if (H[r][c]) {
          const x = min + (c + 0.5) * cell;
          const z = min + (r + 1) * cell;
          addMesh(x, z, cell, wallT);
          any = true;
        }
      }
    }

    // Fallback: if constraints nuked everything, add a simple plus corridor to ensure visible cover
    if (!any) {
      const mid = Math.floor(grid / 2);
      const z = min + (mid + 0.5) * cell;
      for (let c = 0; c < grid - 1; c++) {
        const x = min + (c + 1) * cell;
        addMesh(x, z, wallT, cell);
      }
    }

    this.placed = { V, H, grid, min, cell, wallT, wallH };
    return this.meshes;
  }
}


