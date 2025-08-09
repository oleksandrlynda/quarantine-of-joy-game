import { MeleeEnemy } from './melee.js';
import { ShooterEnemy } from './shooter.js';
import { FlyerEnemy } from './flyer.js';
import { BossManager } from '../bosses/manager.js';

export class EnemyManager {
  constructor(THREE, scene, mats, objects = [], getPlayer = null) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.objects = objects;
    this.getPlayer = getPlayer || (() => ({ position: new THREE.Vector3(), forward: new THREE.Vector3(0,0,1) }));
    this.enemies = new Set();            // set of root meshes (raycast target) — back-compat
    this.instances = new Set();          // set of enemy instance objects
    this.instanceByRoot = new WeakMap(); // root -> instance
    this.wave = 1;
    this.alive = 0;
    this.onWave = null;
    this.onRemaining = null;

    this.objectBBs = this.objects.map(o => new this.THREE.Box3().setFromObject(o));
    this.raycaster = new this.THREE.Raycaster();
    this.up = new this.THREE.Vector3(0,1,0);
    this.enemyHalf = new this.THREE.Vector3(0.6, 0.8, 0.6);
    this.spawnRings = this._computeSpawnRings();
    this._advancingWave = false;

    // Stats/colors; note type names map to classes below
    this.typeConfig = {
      grunt:  { type: 'grunt',  hp: 100, speedMin: 2.4, speedMax: 3.2, color: 0xef4444, kind: 'melee' },
      rusher: { type: 'rusher', hp:  60, speedMin: 3.4, speedMax: 4.9, color: 0xf97316, kind: 'melee' },
      tank:   { type: 'tank',   hp: 220, speedMin: 1.6, speedMax: 2.0, color: 0x2563eb, kind: 'melee' },
      shooter:{ type: 'shooter',hp:  80, speedMin: 2.2, speedMax: 2.8, color: 0x10b981, kind: 'shooter' },
      flyer:  { type: 'flyer',  hp:  40, speedMin: 5.4, speedMax: 6.6, color: 0xa855f7, kind: 'flyer' },
      // Boss adds
      gruntling: { type: 'gruntling', hp: 20, speedMin: 3.2, speedMax: 4.0, color: 0xfb7185, kind: 'melee' }
    };

    // Boss system
    this.bossManager = new BossManager({ THREE: this.THREE, scene: this.scene, mats: this.mats, enemyManager: this });
  }

  // === Helpers ported from previous implementation ===
  // LEGACY random spawn (kept as fallback for safety)
  randomSpawnPos(attempts = 40) {
    const THREE = this.THREE;
    const { position: playerPos, forward } = this.getPlayer();
    for (let i = 0; i < attempts; i++) {
      const x = (Math.random() * 70 - 35) | 0;
      const z = (Math.random() * 70 - 35) | 0;
      const pos = new THREE.Vector3(x, 0.8, z);

      const to = pos.clone().sub(playerPos);
      const dist = to.length();
      if (dist < 12) continue;

      to.y = 0; if (to.lengthSq() === 0) continue;
      const cos = forward.dot(to.normalize());
      if (cos > 0.5) continue;

      if (!this._isSpawnAreaClear(pos, 0.5)) continue;

      return pos;
    }
    return null;
  }

  // Spawn using rings with LOS preference; fall back to legacy if needed
  _chooseSpawnPos() {
    const THREE = this.THREE;
    const player = this.getPlayer();
    const playerPos = player.position;
    const forward = player.forward;

    const minDist = 12;
    const candidates = [];

    const addCandidates = (list) => {
      for (const p of list) {
        const to = p.clone().sub(playerPos); const dist = to.length();
        if (dist < minDist) continue;
        if (!this._isSpawnAreaClear(p, 0.6)) continue;

        // LOS check: prefer behind or occluded
        to.y = 0; if (to.lengthSq() === 0) continue; to.normalize();
        const facingCos = forward.dot(to);
        const visible = this._isVisibleFromPlayer(p);
        const score = (visible ? 1 : 0) + (facingCos > 0.25 ? 1 : 0); // lower score = better
        candidates.push({ p, score });
      }
    };

    // Prefer edge ring, then mid ring
    addCandidates(this.spawnRings.edge);
    addCandidates(this.spawnRings.mid);

    if (candidates.length) {
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0].p.clone();
    }

    // Fallback to legacy random search
    return this.randomSpawnPos();
  }

  _isVisibleFromPlayer(target) {
    const THREE = this.THREE;
    const { position: playerPos } = this.getPlayer();
    const origin = new THREE.Vector3(playerPos.x, 1.7, playerPos.z);
    const dir = target.clone().sub(origin); const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this.raycaster.set(origin, dir);
    this.raycaster.far = dist - 0.1;
    const hits = this.raycaster.intersectObjects(this.objects, false);
    return !(hits && hits.length > 0);
  }

  _computeSpawnRings() {
    const THREE = this.THREE;
    const edge = [];
    const mid = [];
    // Arena approx bounds from world: walls at ±40; keep safe margin inside
    const min = -38, max = 38; // inner edge to avoid wall thickness
    const midMin = -24, midMax = 24; // mid rectangle ring
    const step = 3; // spacing between spawn points

    const tryAdd = (x, z, out) => {
      const pos = new THREE.Vector3(x, 0.8, z);
      if (!this._isSpawnAreaClear(pos, 0.6)) return;
      out.push(pos);
    };

    // Outer rectangle ring (clockwise)
    for (let x = min; x <= max; x += step) { tryAdd(x, min, edge); }
    for (let z = min; z <= max; z += step) { tryAdd(max, z, edge); }
    for (let x = max; x >= min; x -= step) { tryAdd(x, max, edge); }
    for (let z = max; z >= min; z -= step) { tryAdd(min, z, edge); }

    // Mid rectangle ring
    for (let x = midMin; x <= midMax; x += step) { tryAdd(x, midMin, mid); }
    for (let z = midMin; z <= midMax; z += step) { tryAdd(midMax, z, mid); }
    for (let x = midMax; x >= midMin; x -= step) { tryAdd(x, midMax, mid); }
    for (let z = midMax; z >= midMin; z -= step) { tryAdd(midMin, z, mid); }

    return { edge, mid };
  }

  _isSpawnAreaClear(pos, margin = 0.4) {
    // Ensure spawn AABB with extra margin does not intersect world objects
    const THREE = this.THREE;
    const half = new THREE.Vector3(
      this.enemyHalf.x + margin,
      this.enemyHalf.y,
      this.enemyHalf.z + margin
    );
    const bb = new THREE.Box3(pos.clone().sub(half), pos.clone().add(half));
    for (const obb of this.objectBBs) { if (bb.intersectsBox(obb)) return false; }
    // Avoid overlapping existing enemies
    for (const e of this.enemies) {
      const ebb = new THREE.Box3(e.position.clone().sub(half), e.position.clone().add(half));
      if (bb.intersectsBox(ebb)) return false;
    }
    return true;
  }

  _avoidObstacles(origin, desiredDir, maxDist) {
    const THREE = this.THREE;
    const dir = desiredDir.clone().normalize();
    const rayOrigin = new THREE.Vector3(origin.x, 0.9, origin.z);

    const forwardClearDist = this._rayHitDistance(rayOrigin, dir, maxDist);
    if (forwardClearDist === Infinity) {
      return dir; // clear path
    }

    // Sample rotated directions ±35–45° and pick the one with greatest clearance
    const angles = [0.61, -0.61, 0.79, -0.79];
    let bestDir = dir;
    let bestClear = forwardClearDist;
    for (const a of angles) {
      const rd = this._rotateY(dir, a);
      const d = this._rayHitDistance(rayOrigin, rd, maxDist);
      if (d === Infinity) { return rd; }
      if (d > bestClear) { bestClear = d; bestDir = rd; }
    }
    return bestDir;
  }

  _rayHitDistance(origin, dir, maxDist) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.objects, false);
    if (!hits || hits.length === 0) return Infinity;
    return hits[0].distance;
  }

  _rotateY(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new this.THREE.Vector3(v.x * c - v.z * s, 0, v.x * s + v.z * c).normalize();
  }

  _moveWithCollisions(enemy, step) {
    // Attempt axis-separated movement with AABB checks against static objects
    const THREE = this.THREE;
    const half = new THREE.Vector3(0.6, 0.8, 0.6);
    const pos = enemy.position.clone();

    const tryAxis = (dx, dz) => {
      const next = new THREE.Vector3(pos.x + dx, pos.y, pos.z + dz);
      const bb = new THREE.Box3(next.clone().sub(half), next.clone().add(half));
      for (const obb of this.objectBBs) { if (bb.intersectsBox(obb)) return false; }
      pos.x += dx; pos.z += dz; return true;
    };

    // X then Z for simple sliding
    tryAxis(step.x, 0);
    tryAxis(0, step.z);
    enemy.position.copy(pos);
  }

  // Simple separation utility reusable by types
  separation(position, radius, selfRoot) {
    const THREE = this.THREE;
    const sep = new THREE.Vector3();
    const r2 = radius * radius;
    for (const other of this.enemies) {
      if (other === selfRoot) continue;
      const dx = other.position.x - position.x;
      const dz = other.position.z - position.z;
      const d2 = dx*dx + dz*dz;
      if (d2 > r2) continue;
      const d = Math.max(0.0001, Math.sqrt(d2));
      sep.add(new THREE.Vector3(-dx, 0, -dz).multiplyScalar((radius - d) / radius / d));
    }
    return sep;
  }

  // Factories
  _createInstance(type, spawnPos) {
    const cfg = this.typeConfig[type] || this.typeConfig.grunt;
    const args = { THREE: this.THREE, mats: this.mats, cfg, spawnPos };
    switch (cfg.kind) {
      case 'shooter': return new ShooterEnemy(args);
      case 'flyer':   return new FlyerEnemy(args);
      default:        return new MeleeEnemy(args);
    }
  }

  spawn(type = 'grunt') {
    const p = this._chooseSpawnPos() || new this.THREE.Vector3((Math.random()*60 - 30)|0, 0.8, (Math.random()*60 - 30)|0);
    // Do not increment alive here; startWave already accounted for it
    this.spawnAt(type, p, { countsTowardAlive: false });
  }

  startWave() {
    // Gate boss waves
    if (this.wave % 5 === 0) {
      if (this.onWave) this.onWave(this.wave, 1);
      this.bossManager.startBoss(this.wave);
      return;
    }

    const count = 3 + this.wave;
    const types = this._getWaveTypes(this.wave, count);
    this.alive += count;
    if (this.onWave) this.onWave(this.wave, count);
    if (this.onRemaining) this.onRemaining(this.alive);

    for (let i = 0; i < types.length; i++) {
      const delay = 200 + Math.random() * 200;
      setTimeout(() => this.spawn(types[i]), i * delay);
    }
  }

  reset() {
    for (const e of this.enemies) this.scene.remove(e);
    this.enemies.clear();
    this.instances.clear();
    this.wave = 1; this.alive = 0;
    if (this.bossManager) this.bossManager.reset();
    this.startWave();
  }

  tickAI(playerObject, dt, onPlayerDamage) {
    const ctx = {
      player: playerObject,
      objects: this.objects,
      scene: this.scene,
      onPlayerDamage,
      separation: (...args) => this.separation(...args),
      avoidObstacles: (origin, desiredDir, maxDist) => this._avoidObstacles(origin, desiredDir, maxDist),
      moveWithCollisions: (enemy, step) => this._moveWithCollisions(enemy, step),
      // temporary helper so non-implemented types behave sanely
      fallbackMeleeUpdate: (inst, _dt) => {
        const fake = new MeleeEnemy({ THREE: this.THREE, mats: this.mats, cfg: { type: 'grunt', hp: 1, speedMin: inst.speed, speedMax: inst.speed, color: 0xffffff }, spawnPos: inst.root.position.clone() });
        fake.root = inst.root; // reuse same root; only use update logic
        fake.update(_dt, ctx);
      }
    };

    // Boss abilities and behavior
    if (this.bossManager) this.bossManager.update(dt, ctx);

    for (const inst of this.instances) inst.update(dt, ctx);
  }

  applyHit(hitObject, isHead, damage) {
    let obj = hitObject;
    while (obj && !this.enemies.has(obj)) obj = obj.parent;
    if (!obj) return { killed: false };
    // Back-compat: keep hp on userData so current main.js keeps working
    obj.userData.hp -= damage;
    return { enemy: obj, killed: obj.userData.hp <= 0 };
  }

  remove(enemyRoot) {
    if (!this.enemies.has(enemyRoot)) return;
    this.enemies.delete(enemyRoot);
    this.scene.remove(enemyRoot);
    const inst = this.instanceByRoot.get(enemyRoot);
    if (inst) {
      // allow instance-specific cleanup (e.g., projectiles)
      if (typeof inst.onRemoved === 'function') inst.onRemoved(this.scene);
      this.instances.delete(inst);
    }
    this.alive--;
    if (this.onRemaining) this.onRemaining(this.alive);
    // If we just removed the boss, notify boss manager to cleanup adds
    if (this.bossManager && this.bossManager.active && this.bossManager.boss && enemyRoot === this.bossManager.boss.root) {
      this.bossManager._onBossDeath();
    }
    // Only advance to the next wave when no enemies remain AND no boss fight is active
    const bossActive = !!(this.bossManager && this.bossManager.active && this.bossManager.boss);
    if (this.alive <= 0 && !bossActive && !this._advancingWave) {
      this._advancingWave = true;
      this.wave++;
      this.startWave();
      this._advancingWave = false;
    }
  }

  // --- Boss integration helpers ---

  registerExternalEnemy(instance, { countsTowardAlive = true } = {}) {
    this.scene.add(instance.root);
    this.enemies.add(instance.root);
    this.instances.add(instance);
    this.instanceByRoot.set(instance.root, instance);
    if (countsTowardAlive) {
      this.alive++;
      if (this.onRemaining) this.onRemaining(this.alive);
    }
    return instance.root;
  }

  spawnAt(type, position, { countsTowardAlive = true } = {}) {
    const inst = this._createInstance(type, position);
    // Adjust per-type randomization (e.g., gruntlings low HP)
    if (type === 'gruntling') {
      inst.root.userData.hp = 10 + Math.floor(Math.random() * 21); // 10–30
    }
    this.scene.add(inst.root);
    this.enemies.add(inst.root);
    this.instances.add(inst);
    this.instanceByRoot.set(inst.root, inst);
    if (countsTowardAlive) {
      this.alive++;
      if (this.onRemaining) this.onRemaining(this.alive);
    }
    return inst.root;
  }

  _getWaveTypes(wave, total) {
    const types = new Array(total).fill('grunt');

    // Desired proportions as wave scales
    const pctRusher  = wave >= 3 ? 0.15 : 0.0;
    const pctShooter = wave >= 4 ? 0.15 : 0.0;
    // Flyers now appear starting at wave 1 with a gentle ramp
    const pctFlyer   = Math.min(0.6, 0.10 + 0.05 * (wave - 1));
    const pctTank    = wave >= 6 ? 0.10 : 0.0;

    const minFlyer  = wave >= 5 ? 2 : 0;
    let needFlyer   = wave >= 5 ? Math.max(minFlyer, Math.floor(total * pctFlyer)) : 0;
    let needRusher  = Math.floor(total * pctRusher);
    let needShooter = Math.floor(total * pctShooter);
    let needTank    = Math.max(wave >= 6 ? 1 : 0, Math.floor(total * pctTank));

    // Cap total replacements to total count
    let requested = needFlyer + needRusher + needShooter + needTank;
    if (requested > total) {
      const scale = total / requested;
      needFlyer = Math.floor(needFlyer * scale);
      needRusher = Math.floor(needRusher * scale);
      needShooter = Math.floor(needShooter * scale);
      needTank = Math.floor(needTank * scale);
    }

    // Helper to randomly assign a type into a 'grunt' slot
    const assignRandom = (count, label) => {
      for (let k = 0; k < count; k++) {
        // find an index currently still grunt
        let tries = 0;
        while (tries < 10) {
          const idx = (Math.random() * total) | 0;
          if (types[idx] === 'grunt') { types[idx] = label; break; }
          tries++;
        }
        if (tries >= 10) {
          // fallback: linear scan
          for (let i = 0; i < total; i++) { if (types[i] === 'grunt') { types[i] = label; break; } }
        }
      }
    };

    // Apply assignments with some precedence
    assignRandom(needTank, 'tank');
    assignRandom(needShooter, 'shooter');
    assignRandom(needRusher, 'rusher');
    assignRandom(needFlyer, 'flyer');

    // mild shuffle
    for (let i = types.length - 1; i > 0; i--) {
      if (Math.random() < 0.15) {
        const j = (Math.random() * (i + 1)) | 0;
        [types[i], types[j]] = [types[j], types[i]];
      }
    }
    return types;
  }
}