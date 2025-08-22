import { makeSeededRng } from '../util/rng.js';
import { Destructible } from './destructible.js';
import { MazeGenerator } from './maze.js';
import { generatePlatforms } from './platforms.js';

export class ObstacleManager {
  constructor(THREE, scene, mats) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.obstacles = new Set(); // set of root meshes
    this.objects = null; // reference to shared collidable list
    this.rng = null;

    // destructible bookkeeping
    this.rootToDestructible = new WeakMap();
    this.destroyCount = 0;
    this.lastDropGate = 0; // count snapshot when a drop was last allowed

    // hooks set later from main
    this.enemyManager = null;
    this.pickups = null;
    this.onScore = null; // (points)=>void
    this.onPlayerDamage = null; // (amount)=>void
    this.onCollidersChanged = null; // (colliders: THREE.Object3D[])=>void

    // debris pooling
    this._debrisPool = [];
    this._debrisActive = [];

    // maze system
    // Maze system (disabled for now)
    this.maze = new MazeGenerator(this.THREE);
    this._mazeMeshes = [];
    this._mazeWaveReconfigEvery = 2;
    this._lastMazeSeed = null;
    this._mazeEnabled = false;

    // Feature flags
    this._platformsEnabled = false;

    // Merged static mesh cache
    this._mergedStatic = null; // { mesh, byMaterial: Map }
    // Deferred additions to shared collider list (for post-merge push)
    this._deferred = [];
  }

  generate(seed, objects) {
    this.clear();
    this.objects = objects;
    // Derive a deterministic RNG for obstacles from the arena seed
    this.rng = makeSeededRng(`obstacles:${seed}`);

    // Mix of destructibles: crates, barricades, barrels
    const counts = { crate: 10, barricade: 6, barrel: 6 };
    const placed = [];
    const tryPlace = (inst) => {
      const THREE = this.THREE;
      // Attempt several times to avoid overlap with placed and static objects
      const attempts = 28;
      for (let i = 0; i < attempts; i++) {
        const x = (this.rng() * 70 - 35) | 0;
        const z = (this.rng() * 70 - 35) | 0;
        const y = inst.root.position.y || 0;
        inst.root.position.set(x, y, z);

        // Random rotate barricades 0 or 90 degrees
        if (inst.type === 'barricade') {
          const rot = (this.rng() < 0.5) ? 0 : Math.PI / 2;
          inst.root.rotation.y = rot;
        } else {
          inst.root.rotation.y = (this.rng() * Math.PI * 2);
        }

        // Compute AABB from half extents accounting for rotation (approx by swapping x/z on ~90deg)
        const hx = (inst.type === 'barricade' && Math.abs(Math.sin(inst.root.rotation.y)) > 0.707)
          ? inst.aabbHalf.z : inst.aabbHalf.x;
        const hz = (inst.type === 'barricade' && Math.abs(Math.sin(inst.root.rotation.y)) > 0.707)
          ? inst.aabbHalf.x : inst.aabbHalf.z;
        const hy = inst.aabbHalf.y;
        const min = new THREE.Vector3(x - hx, y - hy, z - hz);
        const max = new THREE.Vector3(x + hx, y + hy, z + hz);
        const bb = new THREE.Box3(min, max);

        // Check against world objects (walls)
        let collides = false;
        if (this.objects) {
          for (const o of this.objects) {
            const obb = new THREE.Box3().setFromObject(o);
            if (bb.intersectsBox(obb)) { collides = true; break; }
          }
        }
        if (collides) continue;
        // Check against already placed destructibles
        for (const p of placed) { if (bb.intersectsBox(p.bb)) { collides = true; break; } }
        if (collides) continue;

        // Place (defer merge until end)
        this._addDestructible(inst, { defer: true });
        placed.push({ bb });
        return true;
      }
      return false;
    };

    const create = (type) => new Destructible({ THREE: this.THREE, mats: this.mats, type, position: new this.THREE.Vector3(0, type==='barrel'?0.6: (type==='barricade'?1:1), 0) });

    for (let i = 0; i < counts.crate; i++) tryPlace(create('crate'));
    for (let i = 0; i < counts.barricade; i++) tryPlace(create('barricade'));
    for (let i = 0; i < counts.barrel; i++) tryPlace(create('barrel'));

    // Merge placed destructibles by material into a single mesh per material
    this._mergeStaticByMaterial();

    // Future: other obstacle types can be added here using this.rng

    // --- Low platforms (disabled by default) ---
    if (this._platformsEnabled) {
      const existingAABBs = [];
      if (this.objects && this.objects.length) {
        for (const o of this.objects) {
          try { existingAABBs.push(new this.THREE.Box3().setFromObject(o)); } catch(_){}
        }
      }
      const { meshes: platformMeshes } = generatePlatforms({
        THREE: this.THREE,
        rng: this.rng,
        objects: this.objects,
        existingAABBs,
        max: 6
      });
      for (const m of platformMeshes) { this.scene.add(m); this.obstacles.add(m); if (this.objects) this.objects.push(m); }
    }

    // Ensure deferred destructibles are registered as colliders in one batch and notify listeners
    this._flushDeferred();
  }

  // Load a deterministic map from JSON and place obstacles exactly as specified.
  // Returns { playerSpawn?: THREE.Vector3, enemySpawnPoints?: THREE.Vector3[] }
  loadFromMap(map, objects) {
    this.clear();
    this.objects = objects;
    const THREE = this.THREE;
    const result = { playerSpawn: null, enemySpawnPoints: [] };

    if (!map || typeof map !== 'object') return result;

    // Optional: interior static walls/blocks (non-destructible)
    // Schema: walls: [{ shape:'box', w,h,d, x,y,z, rotY }]
    if (Array.isArray(map.walls)) {
      for (const w of map.walls) {
        if (!w || w.shape !== 'box') continue;
        const width = Number(w.w) || 1;
        const height = Number(w.h) || 1;
        const depth = Number(w.d) || 1;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
        mesh.position.set(Number(w.x) || 0, Number(w.y) || (height * 0.5), Number(w.z) || 0);
        if (w.rotY) mesh.rotation.y = Number(w.rotY) || 0;
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.obstacles.add(mesh);
        if (this.objects) this.objects.push(mesh);
      }
    }

    // Ramps (static, non-destructible)
    // Schema: ramps: [{ w,h,d, steps, x,y,z, rotY }]
    if (Array.isArray(map.ramps)) {
      for (const r of map.ramps) {
        if (!r) continue;
        const w = Number(r.w) || 4;
        const steps = Math.max(1, Math.floor(Number(r.steps) || 6));
        // Support either total h/d or per-step stepH/stepD
        const stepH = (r.stepH != null) ? Number(r.stepH) : ((Number(r.h) || 2) / steps);
        const stepD = (r.stepD != null) ? Number(r.stepD) : ((Number(r.d) || 6) / steps);
        const rotY = Number(r.rotY) || 0;
        const x = Number(r.x) || 0;
        const z = Number(r.z) || 0;
        // y is the bottom of the ramp (not the center)
        const y = (r.y != null) ? Number(r.y) : 0;
        const group = this._buildRamp({ w, steps, stepH, stepD, rotY, x, y, z });
        if (group) {
          this.scene.add(group);
          this.obstacles.add(group);
          if (this.objects) this.objects.push(group);
        }
      }
    }

    // Destructible placements
    // Schema: obstacles: [{ type:'crate'|'barricade'|'barrel', x,y,z, rotY? }]
    if (Array.isArray(map.obstacles)) {
      for (const o of map.obstacles) {
        if (!o || !o.type) continue;
        const yDefault = o.type === 'barrel' ? 0.6 : 1.0;
        const inst = new Destructible({ THREE: this.THREE, mats: this.mats, type: o.type, position: new this.THREE.Vector3(Number(o.x)||0, (o.y!=null?Number(o.y):yDefault), Number(o.z)||0) });
        if (inst && inst.root) {
          if (o.rotY) inst.root.rotation.y = Number(o.rotY) || 0;
          this._addDestructible(inst);
        }
      }
    }

    // Optional enemy spawn pads
    if (Array.isArray(map.enemySpawns)) {
      for (const s of map.enemySpawns) {
        if (!s) continue;
        const v = new THREE.Vector3(Number(s.x)||0, (s.y!=null?Number(s.y):0.8), Number(s.z)||0);
        result.enemySpawnPoints.push(v);
      }
    }

    // Optional player spawn
    if (map.playerSpawn && typeof map.playerSpawn === 'object') {
      const p = map.playerSpawn;
      result.playerSpawn = new THREE.Vector3(Number(p.x)||0, (p.y!=null?Number(p.y):1.7), Number(p.z)||8);
    }

    // Notify consumers that colliders changed
    this._notifyCollidersChanged();
    return result;
  }

  _buildRamp({ w, steps = 6, stepH = 0.3, stepD = 1.0, rotY = 0, x = 0, y = 0, z = 0 }) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const mat = this.mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 });
    const totalH = steps * stepH;
    const totalD = steps * stepD;
    for (let i = 0; i < steps; i++) {
      const sx = w;
      const sy = stepH;
      const sz = stepD * (i + 1);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      const px = 0;
      // Build from bottom: base at y, so each step sits directly on previous with no gaps
      const py = y + (sy * 0.5) + (stepH * i);
      const pz = (sz * 0.5) - (totalD * 0.5) + stepD * i;
      mesh.position.set(px, py, pz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.rotation.y = rotY;
    group.position.set(x, 0, z);
    return group;
  }

  clear() {
    if (!this.obstacles.size) return;
    for (const o of this.obstacles) {
      if (this.scene) this.scene.remove(o);
      // Remove from shared collidable list if present
      if (this.objects) {
        const idx = this.objects.indexOf(o);
        if (idx !== -1) this.objects.splice(idx, 1);
      }
    }
    this.obstacles.clear();
    this.rootToDestructible = new WeakMap();
    this._deferred = [];
    // clear maze
    if (this.maze) this.maze.clear(this.scene);
    this._mazeMeshes = [];
    this._notifyCollidersChanged();
  }

  update(dt) {
    // Debris update
    for (let i = this._debrisActive.length - 1; i >= 0; i--) {
      const p = this._debrisActive[i];
      p.vy -= 9.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.life -= dt;
      if (p.mesh.material.opacity !== undefined) {
        p.mesh.material.opacity = Math.max(0, p.life / p.lifeMax);
      }
      if (p.life <= 0 || p.mesh.position.y < -0.5) {
        this.scene.remove(p.mesh);
        this._debrisActive.splice(i, 1);
        this._debrisPool.push(p);
      }
    }
  }

  maybeReconfigureMaze(seed, wave) {
    if (!this.maze || !this._mazeEnabled) return;
    // Lock during boss waves
    if (wave % 5 === 0) return;
    if (wave % this._mazeWaveReconfigEvery !== 0) return;
    const mazeSeed = `${seed}:maze:w${wave}`;
    if (mazeSeed === this._lastMazeSeed) return;
    // Remove previous maze meshes from collidable objects
    if (this._mazeMeshes && this.objects) {
      for (const m of this._mazeMeshes) {
        const idx = this.objects.indexOf(m);
        if (idx !== -1) this.objects.splice(idx, 1);
      }
    }
    // Build maze within coverage cap and spawn fairness
    const meshes = this.maze.build({
      scene: this.scene,
      mats: this.mats,
      seed: mazeSeed,
      grid: 6,
      bounds: { min: -36, max: 36 },
      coverageCap: 0.2,
      spawnPoints: this._getSpawnRingPoints()
    });
    // Add to collidable objects
    this._mazeMeshes = [];
    for (const m of meshes) {
      this._mazeMeshes.push(m);
      if (this.objects) this.objects.push(m);
    }
    this._lastMazeSeed = mazeSeed;
    // Notify consumers that colliders changed
    this._notifyCollidersChanged();
  }

  _getSpawnRingPoints() {
    const THREE = this.THREE;
    const pts = [];
    const ringMin = -38, ringMax = 38;
    const step = 3;
    for (let x = ringMin; x <= ringMax; x += step) { pts.push(new THREE.Vector3(x, 0.8, ringMin)); }
    for (let z = ringMin; z <= ringMax; z += step) { pts.push(new THREE.Vector3(ringMax, 0.8, z)); }
    for (let x = ringMax; x >= ringMin; x -= step) { pts.push(new THREE.Vector3(x, 0.8, ringMax)); }
    for (let z = ringMax; z >= ringMin; z -= step) { pts.push(new THREE.Vector3(ringMin, 0.8, z)); }
    const midMin = -24, midMax = 24;
    for (let x = midMin; x <= midMax; x += step) { pts.push(new THREE.Vector3(x, 0.8, midMin)); }
    for (let z = midMin; z <= midMax; z += step) { pts.push(new THREE.Vector3(midMax, 0.8, z)); }
    for (let x = midMax; x >= midMin; x -= step) { pts.push(new THREE.Vector3(x, 0.8, midMax)); }
    for (let z = midMax; z >= midMin; z -= step) { pts.push(new THREE.Vector3(midMin, 0.8, z)); }
    return pts;
  }

  _addDestructible(inst, { defer = false } = {}) {
    this.scene.add(inst.root);
    this.obstacles.add(inst.root);
    this.rootToDestructible.set(inst.root, inst);
    if (defer) {
      this._deferred.push(inst.root);
    } else {
      if (this.objects) this.objects.push(inst.root);
      this._notifyCollidersChanged();
    }
  }

  _mergeStaticByMaterial(){
    const THREE = this.THREE;
    if (!this.obstacles.size) return;
    const groups = new Map(); // key: material.uuid -> { material, geos: [] }
    for (const root of Array.from(this.obstacles)){
      // Only merge simple Mesh children without userData.destructible? Keep as is; destructibles are dynamic, so we skip merge to avoid breakage.
      // Instead: merge only editor/level static meshes (currently none here). Leaving hook for future.
    }
    // Currently a no-op to avoid altering destructible behavior; the hook is ready for static groups.
  }

  // Push deferred roots to shared collider list and notify once
  _flushDeferred(){
    try {
      if (!this.objects) { this._deferred = []; this._notifyCollidersChanged(); return; }
      if (this._deferred && this._deferred.length) {
        for (const root of this._deferred) {
          if (this.objects.indexOf(root) === -1) this.objects.push(root);
        }
        this._deferred.length = 0;
      }
      this._notifyCollidersChanged();
    } catch(_) { /* ignore flush errors */ }
  }

  handleHit(hitObject, damage) {
    // Walk up to find a destructible
    let obj = hitObject;
    while (obj && !obj.userData?.destructible) obj = obj.parent;
    if (!obj) return { handled: false };
    const inst = obj.userData.destructible;
    const res = inst.damage(damage);
    if (res.destroyed) {
      this._onDestroyed(inst);
    }
    return { handled: true, destroyed: !!res.destroyed, type: inst.type };
  }

  _onDestroyed(inst) {
    // remove from scene + collisions
    const root = inst.root;
    if (this.scene) this.scene.remove(root);
    if (this.objects) {
      const idx = this.objects.indexOf(root);
      if (idx !== -1) this.objects.splice(idx, 1);
    }
    this.obstacles.delete(root);
    this.rootToDestructible.delete(root);

    // Notify consumers that colliders changed
    this._notifyCollidersChanged();

    // score
    if (this.onScore) this.onScore(10);

    // debris burst
    this._spawnDebris(inst.root.position, inst.type);

    // explosion for barrels
    if (inst.type === 'barrel') {
      const kills = this._barrelExplode(inst.root.position);
      if (kills >= 2 && this.onScore) this.onScore(25);
    }

    // drops rule: ≤1 per 6 destructions, block during boss waves
    this.destroyCount++;
    const allowDropGate = Math.floor(this.destroyCount / 6);
    const bossActive = !!(this.enemyManager && this.enemyManager.bossManager && this.enemyManager.bossManager.active);
    const isBossWave = !!(this.enemyManager && (this.enemyManager.wave % 5 === 0));
    if (!bossActive && !isBossWave && this.pickups && allowDropGate > this.lastDropGate) {
      this.lastDropGate = allowDropGate;
      this.pickups.maybeDrop(inst.root.position.clone());
    }
  }

  // Allow external systems to remove a barrel from the world without triggering destruction side-effects
  // Returns true if the provided root is a known barrel and was removed from scene/colliders
  pickupBarrel(root) {
    if (!root) return false;
    const inst = this.rootToDestructible.get(root);
    if (!inst || inst.type !== 'barrel') return false;
    // Detach from scene and bookkeeping, but do not explode or score yet
    if (this.scene && root.parent === this.scene) this.scene.remove(root);
    const idx = this.objects ? this.objects.indexOf(root) : -1;
    if (idx !== -1) this.objects.splice(idx, 1);
    this.obstacles.delete(root);
    this.rootToDestructible.delete(root);
    // Notify consumers that colliders changed
    this._notifyCollidersChanged();
    return true;
  }

  // Public helper to trigger a barrel-style explosion at a position (e.g., for thrown barrels)
  explodeBarrel(position) {
    if (!position) return 0;
    this._spawnDebris(position, 'barrel');
    return this._barrelExplode(position);
  }

  _spawnDebris(position, type) {
    const THREE = this.THREE;
    const count = type === 'barricade' ? 16 : 10;
    const baseColor = (type === 'crate') ? 0xC6A15B : (type === 'barricade' ? 0x8ecae6 : 0xCC3333);
    for (let i = 0; i < count; i++) {
      let item = this._debrisPool.pop();
      if (!item) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 1 }));
        item = { mesh, vx: 0, vy: 0, vz: 0, life: 0, lifeMax: 0 };
      } else {
        item.mesh.material.color.set(baseColor);
        item.mesh.material.opacity = 1;
      }
      item.mesh.position.copy(position);
      item.mesh.position.y += 0.4 + Math.random() * 0.4;
      item.vx = (Math.random() * 2 - 1) * 3;
      item.vy = Math.random() * 3 + 1.5;
      item.vz = (Math.random() * 2 - 1) * 3;
      item.life = item.lifeMax = 0.7 + Math.random() * 0.4;
      this.scene.add(item.mesh);
      this._debrisActive.push(item);
    }
    // Telegraph ring pulse
    this._spawnPulse(position, type === 'barrel' ? 3 : 1.5, baseColor);
  }

  _spawnPulse(position, radius, color) {
    const THREE = this.THREE;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(position.x, 0.05, position.z);
    ring.userData.life = 0.25;
    this.scene.add(ring);
    // inline fade via active list using debris system minimalism
    const entry = { mesh: ring, vx: 0, vy: 0, vz: 0, life: 0.25, lifeMax: 0.25 };
    this._debrisActive.push(entry);
  }

  _barrelExplode(center) {
    const THREE = this.THREE;
    const radius = 3.0;
    const damageEnemy = 80;
    const damagePlayer = 25;
    let kills = 0;
    // Damage enemies
    if (this.enemyManager) {
      for (const e of Array.from(this.enemyManager.enemies)) {
        const dx = e.position.x - center.x;
        const dz = e.position.z - center.z;
        const d2 = dx*dx + dz*dz;
        if (d2 <= radius * radius) {
          e.userData.hp -= damageEnemy;
          if (e.userData.hp <= 0) { this.enemyManager.remove(e); kills++; }
        }
      }
    }
    // Damage player if within radius
    if (this.onPlayerDamage && this.getPlayer) {
      const playerObj = this.getPlayer();
      const p = playerObj && playerObj.position ? playerObj.position : null;
      if (p) {
        const dx = p.x - center.x;
        const dz = p.z - center.z;
        const d2 = dx*dx + dz*dz;
        if (d2 <= radius * radius) {
          this.onPlayerDamage(damagePlayer);
        }
      }
    }
    return kills;
  }

  // Broadcast that the shared collidable objects changed. Main can wire this to refresh player/enemy AABBs.
  _notifyCollidersChanged() {
    try {
      if (typeof this.onCollidersChanged === 'function') {
        this.onCollidersChanged(this.objects || []);
      }
    } catch(_) {}
  }
}


