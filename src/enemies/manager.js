import { MeleeEnemy } from './melee.js';
import { ShooterEnemy } from './shooter.js';
import { FlyerEnemy } from './flyer.js';
import { HealerEnemy } from './healer.js';
import { SniperEnemy } from './sniper.js';
import { RusherEnemy } from './rusher.js';
import { SwarmWarden } from './warden.js';
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
    this.enemyFullHeight = this.enemyHalf.y * 2;
    this.spawnRings = this._computeSpawnRings();
    this.customSpawnPoints = null; // optional override from map
    this._advancingWave = false;
    this._aiClock = 0; // accumulated AI time for coordination
    this._sniperLastFireAt = -Infinity;
    this._lastAmbientVocalAt = 0;
    // Heal VFX state
    this._healSprites = [];
    this._healTexture = null;
    this._lastHealVfxAt = new WeakMap();
    this._healVfxCooldown = 0.28; // seconds between bursts per target

    // Stats/colors; note type names map to classes below
    this.typeConfig = {
      grunt:  { type: 'grunt',  hp: 100, speedMin: 2.4, speedMax: 3.2, color: 0xef4444, kind: 'melee' },
      rusher: { type: 'rusher', hp:  60, speedMin: 6.4, speedMax: 7.9, color: 0xf97316, kind: 'melee' },
      tank:   { type: 'tank',   hp: 450, speedMin: 1.6, speedMax: 2.4, color: 0x2563eb, kind: 'melee' },
      shooter:{ type: 'shooter',hp:  150, speedMin: 2.2, speedMax: 2.8, color: 0x10b981, kind: 'shooter' },
      flyer:  { type: 'flyer',  hp:  40, speedMin: 12.4, speedMax: 16.7, color: 0xa855f7, kind: 'flyer' },
      healer: { type: 'healer', hp:   90, speedMin: 2.2, speedMax: 2.6, color: 0x84cc16, kind: 'healer' },
      sniper: { type: 'sniper', hp:   90, speedMin: 2.0, speedMax: 2.4, color: 0x444444, kind: 'sniper' },
      warden: { type: 'warden', hp: 420, speedMin: 1.9, speedMax: 2.3, color: 0x22d3ee, kind: 'warden' },
      // Boss adds
      gruntling: { type: 'gruntling', hp: 20, speedMin: 3.2, speedMax: 4.0, color: 0xfb7185, kind: 'melee' }
    };

    // Boss system
    this.bossManager = new BossManager({ THREE: this.THREE, scene: this.scene, mats: this.mats, enemyManager: this });
  }

  // Rebuild collidable AABBs after the shared objects list changes (e.g., obstacles destroyed)
  refreshColliders(objects = this.objects) {
    this.objects = objects;
    this.objectBBs = this.objects.map(o => new this.THREE.Box3().setFromObject(o));
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

    // If map provided explicit spawn points, prefer those
    if (this.customSpawnPoints && Array.isArray(this.customSpawnPoints) && this.customSpawnPoints.length) {
      for (const p of this.customSpawnPoints) {
        const pos = p.clone ? p.clone() : new this.THREE.Vector3(p.x||0, p.y||0.8, p.z||0);
        const to = pos.clone().sub(playerPos); const dist = to.length();
        if (dist < minDist) continue;
        if (!this._isSpawnAreaClear(pos, 0.6)) continue;
        to.y = 0; if (to.lengthSq() === 0) continue; to.normalize();
        const facingCos = forward.dot(to);
        const visible = this._isVisibleFromPlayer(pos);
        const score = (visible ? 1 : 0) + (facingCos > 0.25 ? 1 : 0);
        candidates.push({ p: pos, score });
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score);
        return candidates[0].p.clone();
      }
      // If custom list exists but no candidate passed, fall through to rings/legacy
    }

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
    const half = this.enemyHalf;
    const pos = enemy.position.clone();

    const tryAxis = (dx, dz) => {
      const nx = pos.x + dx, nz = pos.z + dz;
      // Use feet Y to build probe box to allow stepping over small rises
      const feetY = pos.y - half.y;
      const bb = new THREE.Box3(
        new THREE.Vector3(nx - half.x, Math.max(0.0, feetY + 0.05), nz - half.z),
        new THREE.Vector3(nx + half.x, feetY + (half.y*2), nz + half.z)
      );
      for (const obb of this.objectBBs) { if (bb.intersectsBox(obb)) return false; }
      pos.x = nx; pos.z = nz; return true;
    };

    // X then Z for simple sliding with step/jump assist similar to player
    const beforeGround = this._groundHeightAt(enemy.position.x, enemy.position.z);
    tryAxis(step.x, 0);
    tryAxis(0, step.z);
    const afterGround = this._groundHeightAt(pos.x, pos.z);
    const rise = Math.max(0, afterGround - beforeGround);
    const stepUpMax = 0.12 * this.enemyFullHeight;
    const jumpAssistMax = 0.30 * this.enemyFullHeight;
    const desiredY = afterGround + half.y;
    const currentY = enemy.position.y;
    if (rise > 0) {
      // Clamp vertical lift per frame to avoid teleporting up long ramps
      const maxLift = (rise <= stepUpMax + 1e-3) ? stepUpMax : (rise <= jumpAssistMax + 1e-3 ? jumpAssistMax : 0);
      if (maxLift > 0) {
        const lift = Math.min(desiredY - currentY, maxLift);
        enemy.position.set(pos.x, currentY + Math.max(0, lift), pos.z);
      } else {
        // too high; keep horizontal change only
        enemy.position.set(pos.x, currentY, pos.z);
      }
    } else {
      // Follow ground on descent instantly for stability
      enemy.position.set(pos.x, desiredY, pos.z);
    }
  }

  // Compute highest ground at XZ from colliders using raycast fallback to AABB top
  _groundHeightAt(x, z) {
    const THREE = this.THREE;
    // Raycast downward for precise height
    const origin = new THREE.Vector3(x, 10.0, z);
    const dir = new THREE.Vector3(0,-1,0);
    try {
      this.raycaster.set(origin, dir);
      this.raycaster.far = 20;
      const hits = this.raycaster.intersectObjects(this.objects, false);
      if (hits && hits.length) {
        let top = 0;
        for (const h of hits) { if (h.point && h.point.y > top) top = h.point.y; }
        return top;
      }
    } catch(_) {}
    // Fallback: check AABB tops overlapping footprint center
    let maxTop = 0;
    for (const obb of this.objectBBs) {
      if (x < obb.min.x || x > obb.max.x) continue;
      if (z < obb.min.z || z > obb.max.z) continue;
      if (obb.max.y > maxTop) maxTop = obb.max.y;
    }
    return maxTop;
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
    const args = { THREE: this.THREE, mats: this.mats, cfg, spawnPos, enemyManager: this };
    switch (cfg.kind) {
      case 'shooter': return new ShooterEnemy(args);
      case 'flyer':   return new FlyerEnemy(args);
      case 'healer':  return new HealerEnemy(args);
      case 'sniper':  return new SniperEnemy(args);
      case 'warden':  return new SwarmWarden(args);
      case 'melee':
        if (cfg.type === 'rusher') return new RusherEnemy(args);
        return new MeleeEnemy(args);
      default:
        return new MeleeEnemy(args);
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

    const count = 10 + this.wave;
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
    this._aiClock += dt;
    // Update heal sprites
    if (this._healSprites && this._healSprites.length) {
      for (let i = this._healSprites.length - 1; i >= 0; i--) {
        const s = this._healSprites[i];
        s.life += dt; if (s.life >= s.maxLife) { this.scene.remove(s.sprite); this._healSprites.splice(i,1); continue; }
        s.sprite.position.addScaledVector(s.velocity, dt);
        if (s.sprite.material && s.sprite.material.opacity !== undefined) {
          s.sprite.material.opacity = Math.max(0, 1 - s.life / s.maxLife);
        }
      }
    }
    const ctx = {
      player: playerObject,
      objects: this.objects,
      scene: this.scene,
      onPlayerDamage,
      separation: (...args) => this.separation(...args),
      avoidObstacles: (origin, desiredDir, maxDist) => this._avoidObstacles(origin, desiredDir, maxDist),
      moveWithCollisions: (enemy, step) => this._moveWithCollisions(enemy, step),
      // Count allies within a radius around a position, excluding an optional self root
      alliesNearbyCount: (position, radius = 8.0, selfRoot = null) => {
        const r2 = Math.max(0, radius) * Math.max(0, radius);
        let count = 0;
        for (const other of this.enemies) {
          if (selfRoot && other === selfRoot) continue;
          const dx = other.position.x - position.x;
          const dy = other.position.y - position.y;
          const dz = other.position.z - position.z;
          const d2 = dx*dx + dy*dy + dz*dz;
          if (d2 <= r2) count++;
        }
        return count;
      },
      // Healer support: register max heal per target per tick (non-stacking)
      proposeHeal: (() => {
        const registry = new Map();
        // attach to ctx so post-loop can access
        const fn = (targetRoot, amount) => {
          if (!targetRoot || !amount || amount <= 0) return;
          const prev = registry.get(targetRoot) || 0;
          if (amount > prev) registry.set(targetRoot, amount);
        };
        fn._registry = registry;
        return fn;
      })(),
      // Sniper coordination: record last shot to stagger others
      sniperFired: () => { this._sniperLastFireAt = this._aiClock; },
      // temporary helper so non-implemented types behave sanely
      fallbackMeleeUpdate: (inst, _dt) => {
        const fake = new MeleeEnemy({ THREE: this.THREE, mats: this.mats, cfg: { type: 'grunt', hp: 1, speedMin: inst.speed, speedMax: inst.speed, color: 0xffffff }, spawnPos: inst.root.position.clone() });
        fake.root = inst.root; // reuse same root; only use update logic
        fake.update(_dt, ctx);
      },
      // Blackboard
      blackboard: (() => {
        const info = this.getPlayer ? this.getPlayer() : null;
        const forward = info && info.forward ? info.forward.clone() : null;
        const bossActive = !!(this.bossManager && this.bossManager.active && this.bossManager.boss);
        const regroup = !bossActive && this.waveStartingAlive > 0 && this.alive <= Math.max(1, Math.floor(this.waveStartingAlive * 0.25));
        return {
          playerForward: forward,
          playerSpeed: this._playerSpeedEMA || 0,
          suppression: false,
          regroup,
          alive: this.alive,
          waveStartingAlive: this.waveStartingAlive,
          time: this._aiClock,
          sniperLastFireAt: this._sniperLastFireAt
        };
      })()
    };

    // Boss abilities and behavior
    if (this.bossManager) this.bossManager.update(dt, ctx);

    for (const inst of this.instances) inst.update(dt, ctx);

    // Low-rate ambient enemy vocals when aggroed (simple heuristic: while enemies exist)
    if (this.alive > 0) {
      this._lastAmbientVocalAt = (this._lastAmbientVocalAt || 0);
      if (this._aiClock - this._lastAmbientVocalAt > 2.2 + Math.random() * 2.0) {
        // pick a random instance and attempt a vocal via global S if present
        const pick = (() => { for (const e of this.instances) return e; return null; })();
        if (pick && window && window._SFX && typeof window._SFX.enemyVocal === 'function') {
          try { window._SFX.enemyVocal(pick.root?.userData?.type || 'grunt'); } catch(_) {}
        }
        this._lastAmbientVocalAt = this._aiClock;
      }
    }
    // Apply healing after updates
    const reg = ctx.proposeHeal && ctx.proposeHeal._registry;
    if (reg && reg.size) {
      for (const [root, heal] of reg.entries()) {
        if (!root || !root.userData) continue;
        const maxHp = root.userData.maxHp || root.userData.hp;
        if (maxHp == null) continue;
        root.userData.hp = Math.min(maxHp, (root.userData.hp || 0) + heal);
        // spawn heal VFX with per-target cooldown
        const lastAt = this._lastHealVfxAt.get(root) || -Infinity;
        if ((this._aiClock - lastAt) >= this._healVfxCooldown) {
          this._lastHealVfxAt.set(root, this._aiClock);
          const count = Math.max(1, Math.min(4, Math.round(heal * 0.15)));
          this._spawnHealBurst(root, count);
        }
      }
    }
  }

  _ensureHealTexture() {
    if (this._healTexture) return this._healTexture;
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx2d = canvas.getContext('2d');
    ctx2d.clearRect(0,0,size,size);
    ctx2d.strokeStyle = '#22c55e'; // green
    ctx2d.lineWidth = Math.max(2, Math.floor(size*0.18));
    ctx2d.lineCap = 'round';
    // draw plus
    const m = size/2; const r = size*0.28;
    ctx2d.beginPath(); ctx2d.moveTo(m - r, m); ctx2d.lineTo(m + r, m); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(m, m - r); ctx2d.lineTo(m, m + r); ctx2d.stroke();
    const tex = new this.THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this._healTexture = tex;
    return tex;
  }

  _spawnHealBurst(targetRoot, count = 4) {
    if (!this.scene || !targetRoot || !targetRoot.position) return;
    const THREE = this.THREE;
    const tex = this._ensureHealTexture();
    const pos = targetRoot.position;
    // per-target concurrency clamp
    const maxPerRoot = 4;
    const activeForRoot = this._healSprites.reduce((acc, s) => acc + (s.rootRef === targetRoot ? 1 : 0), 0);
    const room = Math.max(0, maxPerRoot - activeForRoot);
    if (room <= 0) return;
    const spawnCount = Math.min(count, room);
    for (let i = 0; i < spawnCount; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.position.set(pos.x + (Math.random()-0.5)*0.6, pos.y + 1.2 + Math.random()*0.3, pos.z + (Math.random()-0.5)*0.6);
      const s = 0.25 + Math.random()*0.1; spr.scale.set(s, s, 1);
      this.scene.add(spr);
      const vel = new THREE.Vector3((Math.random()-0.5)*0.2, 0.9 + Math.random()*0.35, (Math.random()-0.5)*0.2);
      this._healSprites.push({ sprite: spr, velocity: vel, life: 0, maxLife: 0.7 + Math.random()*0.3, rootRef: targetRoot });
    }
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
    // Ensure maxHp for healing clamp
    if (inst && inst.root && inst.root.userData) {
      if (inst.root.userData.maxHp == null && inst.root.userData.hp != null) inst.root.userData.maxHp = inst.root.userData.hp;
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
    const pctHealer  = wave >= 7 ? 0.08 : 0.0;
    const pctSniper  = wave >= 8 ? 0.05 : 0.0;
    const pctWarden  = wave >= 20 ? 0.04 : 0.0;

    const minFlyer  = wave >= 5 ? 2 : 0;
    let needFlyer   = wave >= 5 ? Math.max(minFlyer, Math.floor(total * pctFlyer)) : 0;
    let needRusher  = Math.floor(total * pctRusher);
    let needShooter = Math.floor(total * pctShooter);
    let needTank    = Math.max(wave >= 6 ? 1 : 0, Math.floor(total * pctTank));
    let needHealer  = Math.floor(total * pctHealer);
    let needSniper  = Math.floor(total * pctSniper);
    let needWarden  = Math.floor(total * pctWarden);

    // Cap total replacements to total count
    let requested = needFlyer + needRusher + needShooter + needTank + needHealer + needSniper + needWarden;
    if (requested > total) {
      const scale = total / requested;
      needFlyer = Math.floor(needFlyer * scale);
      needRusher = Math.floor(needRusher * scale);
      needShooter = Math.floor(needShooter * scale);
      needTank = Math.floor(needTank * scale);
      needHealer = Math.floor(needHealer * scale);
      needSniper = Math.floor(needSniper * scale);
      needWarden = Math.floor(needWarden * scale);
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
    assignRandom(needWarden, 'warden');
    assignRandom(needSniper, 'sniper');
    assignRandom(needHealer, 'healer');
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