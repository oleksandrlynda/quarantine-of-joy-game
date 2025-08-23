import { MeleeEnemy } from './melee.js';
import { ShooterEnemy } from './shooter.js';
import { FlyerEnemy } from './flyer.js';
import { HealerEnemy } from './healer.js';
import { SniperEnemy } from './sniper.js';
import { RusherEnemy } from './rusher.js';
import { BailiffEnemy } from './bailiff.js';
import { SwarmWarden } from './warden.js';
import { BossManager } from '../bosses/manager.js';
import { Hydraclone } from '../bosses/hydraclone.js';
import { nextWaypoint as pathNext, recomputeIfStale as pathRecompute, clear as pathClear } from '../path.js';

function containsExtrudeGeometry(obj){
  if (obj.geometry?.isExtrudeGeometry) return true;
  for (const child of obj.children || []){
    if (containsExtrudeGeometry(child)) return true;
  }
  return false;
}

export class EnemyManager {
  constructor(THREE, scene, mats, objects = [], getPlayer = null, arenaRadius = Infinity, obstacleManager = null) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.objects = objects;
    this.getPlayer = getPlayer || (() => ({ position: new THREE.Vector3(), forward: new THREE.Vector3(0,0,1) }));
    this.arenaRadius = arenaRadius;
    this.obstacleManager = obstacleManager;
    this.enemies = new Set();            // set of root meshes (raycast target) — back-compat
    this.instances = new Set();          // set of enemy instance objects
    this.instanceByRoot = new WeakMap(); // root -> instance
    this._enemyRootsArr = [];            // cached array for raycasts (avoid spreads)
    this.wave = 1;
    this.alive = 0;
    this.onWave = null;
    this.onRemaining = null;

    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o))
      .map(o => new this.THREE.Box3().setFromObject(o));
    this.raycaster = new this.THREE.Raycaster();
    try { this.raycaster.firstHitOnly = true; } catch(_) {}
    this.up = new this.THREE.Vector3(0,1,0);
    this.enemyHalf = new this.THREE.Vector3(0.6, 0.8, 0.6);
    this.enemyFullHeight = this.enemyHalf.y * 2;
    this.spawnRings = this._computeSpawnRings();
    this.customSpawnPoints = null; // optional override from map
    this._advancingWave = false;
    this._aiClock = 0; // accumulated AI time for coordination
    this._sniperLastFireAt = -Infinity;
    this._lastAmbientVocalAt = 0;
    // In sandbox/test harness we may want to stop automatic wave spawning
    this.suspendWaves = false;
    // Heal VFX state
    this._healSprites = [];
    this._healTexture = null;
    this._lastHealVfxAt = new WeakMap();
    this._healVfxCooldown = 0.28; // seconds between bursts per target

    // Stats/colors; note type names map to classes below
    this.typeConfig = {
      grunt:  { type: 'grunt',  hp: 100, speedMin: 2.4, speedMax: 3.2, color: 0xef4444, kind: 'melee' },
      rusher: { type: 'rusher', variant: 'basic', hp:  60, speedMin: 6.4, speedMax: 7.9, color: 0xf97316, kind: 'melee' },
      rusher_elite: { type: 'rusher', variant: 'elite', hp: 90, speedMin: 7.4, speedMax: 8.8, color: 0x6366f1, kind: 'melee' },
      rusher_explosive: { type: 'rusher', variant: 'explosive', hp: 70, speedMin: 6.0, speedMax: 7.0, color: 0xfacc15, kind: 'melee' },
      bailiff:{ type: 'bailiff',hp:  80, speedMin: 3.8, speedMax: 4.4, color: 0x60a5fa, kind: 'melee' },
      tank:   { type: 'tank',   hp: 450, speedMin: 1.6, speedMax: 2.4, color: 0x2563eb, kind: 'melee' },
      shooter:{ type: 'shooter',hp:   80, speedMin: 2.6, speedMax: 3.8, color: 0x10b981, kind: 'shooter' },
      flyer:  { type: 'flyer',  hp:  40, speedMin: 12.4, speedMax: 16.7, color: 0xa855f7, kind: 'flyer' },
      healer: { type: 'healer', hp:   90, speedMin: 2.2, speedMax: 2.6, color: 0x84cc16, kind: 'healer' },
      sniper: { type: 'sniper', hp:   135, speedMin: 2.0, speedMax: 2.4, color: 0x444444, kind: 'sniper' },
      warden: { type: 'warden', hp: 420, speedMin: 1.9, speedMax: 2.2, color: 0x22d3ee, kind: 'warden' },
      // Boss adds
      gruntling: { type: 'gruntling', hp: 20, speedMin: 3.2, speedMax: 4.0, color: 0x3d355d, kind: 'melee' }
    };

    // Boss system
    this.bossManager = new BossManager({ THREE: this.THREE, scene: this.scene, mats: this.mats, enemyManager: this });

    // Bullet pools (instanced) for enemy projectiles
    this._initBulletPools();
  }

  // Rebuild collidable AABBs after the shared objects list changes (e.g., obstacles destroyed)
  refreshColliders(objects = this.objects) {
    this.objects = objects;
    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o))
      .map(o => new this.THREE.Box3().setFromObject(o));
  }

  _initBulletPools() {
    const THREE = this.THREE;
    const mkPool = (color, radius, max) => {
      const geo = new THREE.SphereGeometry(radius, 10, 10);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      this.scene.add(mesh);
      const ray = new THREE.Raycaster();
      try { ray.firstHitOnly = true; } catch(_) {}
      return {
        mesh,
        max,
        count: 0,
        items: new Array(max), // each: { px,py,pz, vx,vy,vz, life, maxLife, damage }
        tmpMat: new THREE.Matrix4(),
        ray,
        _orig: new THREE.Vector3(),
        _dir: new THREE.Vector3()
      };
    };
    this._bulletPools = {
      shooter: mkPool(0x10b981, 0.12, 600),
      sniper:  mkPool(0xff3344, 0.09, 300)
    };
  }
  // Expose a quick reset for sandbox to clear any lingering projectiles/VFX owned by manager
  clearProjectiles(){
    const pools = this._bulletPools || {};
    for (const key of Object.keys(pools)){
      const p = pools[key]; if (!p) continue;
      p.count = 0; if (p.mesh){ p.mesh.count = 0; p.mesh.instanceMatrix.needsUpdate = true; }
    }
  }
  

  _spawnBullet(kind, origin, velocity, maxLife, damage = 10) {
    const pool = (this._bulletPools && this._bulletPools[kind]) ? this._bulletPools[kind] : null;
    if (!pool) return false;
    if (pool.count >= pool.max) return false;
  
    const slot = pool.count++;
    pool.items[slot] = {
      px: origin.x, py: origin.y, pz: origin.z,
      vx: velocity.x, vy: velocity.y, vz: velocity.z,
      life: 0, maxLife, damage
    };
    pool.tmpMat.makeTranslation(origin.x, origin.y, origin.z);
    pool.mesh.setMatrixAt(slot, pool.tmpMat);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.count = pool.count;
    return true;
  }
  

  _updateBulletPools(dt, ctx) {
    if (!this._bulletPools) return;
  
    const updatePool = (pool) => {
      if (!pool || pool.count <= 0) return;
      const playerPos = ctx.player.position;
      let write = 0;
  
      for (let read = 0; read < pool.count; read++) {
        const b = pool.items[read];
  
        // integrate
        const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
        const nx = b.px + dx, ny = b.py + dy, nz = b.pz + dz;
  
        let hit = false;
  
        // player band check (no vectors)
        if (ny >= 1.2 && ny <= 1.8) {
          const pdx = nx - playerPos.x, pdz = nz - playerPos.z;
          if ((pdx*pdx + pdz*pdz) < 0.36) { // 0.6^2
            ctx.onPlayerDamage?.(b.damage);
            hit = true;
          }
        }
  
        // world broadphase vs AABBs (only then precise ray)
        if (!hit) {
          const minX = Math.min(b.px, nx) - 0.12;
          const maxX = Math.max(b.px, nx) + 0.12;
          const minY = Math.min(b.py, ny) - 0.12;
          const maxY = Math.max(b.py, ny) + 0.12;
          const minZ = Math.min(b.pz, nz) - 0.12;
          const maxZ = Math.max(b.pz, nz) + 0.12;
  
          let broadHit = false;
          const list = this.objectBBs;
          for (let k = 0, L = list.length; k < L; k++) {
            const obb = list[k];
            if (obb.max.x < minX || obb.min.x > maxX) continue;
            if (obb.max.y < minY || obb.min.y > maxY) continue;
            if (obb.max.z < minZ || obb.min.z > maxZ) continue;
            broadHit = true; break;
          }
  
          if (broadHit) {
            // precise segment test via short ray
            const len = Math.hypot(dx, dy, dz) || 1e-6;
            pool._orig.set(b.px, b.py, b.pz);
            pool._dir.set(dx / len, dy / len, dz / len);
            pool.ray.set(pool._orig, pool._dir);
            pool.ray.far = len;
            const hits = pool.ray.intersectObjects(this.objects, false);
            if (hits && hits.length > 0) hit = true;
          }
        }
  
        if (!hit) {
          b.px = nx; b.py = ny; b.pz = nz; b.life += dt;
          if (b.life <= b.maxLife && Math.abs(b.px) <= 90 && Math.abs(b.pz) <= 90) {
            pool.items[write] = b;
            pool.tmpMat.makeTranslation(b.px, b.py, b.pz);
            pool.mesh.setMatrixAt(write, pool.tmpMat);
            write++;
            continue;
          }
        }
        // else: drop bullet (not copied to new slot)
      }
  
      pool.count = write;
      pool.mesh.count = pool.count;
      pool.mesh.instanceMatrix.needsUpdate = true;
    };
  
    updatePool(this._bulletPools.shooter);
    updatePool(this._bulletPools.sniper);
  }  

  getEnemyRaycastTargets() {
    return this._enemyRootsArr;
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
    const step = 3; // spacing between spawn points

    const tryAdd = (x, z, out) => {
      const pos = new THREE.Vector3(x, 0.8, z);
      if (!this._isSpawnAreaClear(pos, 0.6)) return;
      out.push(pos);
    };

    if (this.arenaRadius !== Infinity) {
      const wallT = 1;
      const edgeR = this.arenaRadius - wallT / 2 - 1 - this.enemyHalf.x;
      const midR = edgeR * 0.63;
      const edgeSegs = Math.max(8, Math.round((2 * Math.PI * edgeR) / step));
      for (let i = 0; i < edgeSegs; i++) {
        const a = (i / edgeSegs) * Math.PI * 2;
        tryAdd(Math.cos(a) * edgeR, Math.sin(a) * edgeR, edge);
      }
      const midSegs = Math.max(8, Math.round((2 * Math.PI * midR) / step));
      for (let i = 0; i < midSegs; i++) {
        const a = (i / midSegs) * Math.PI * 2;
        tryAdd(Math.cos(a) * midR, Math.sin(a) * midR, mid);
      }
      return { edge, mid };
    }

    // Fallback rectangle rings for non-circular arenas
    const min = -38, max = 38; // inner edge to avoid wall thickness
    const midMin = -24, midMax = 24; // mid rectangle ring

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
    const THREE = this.THREE;
    if (!this._tmp) {
      this._tmp = {
        v1: new THREE.Vector3(),
        v2: new THREE.Vector3(),
        v3: new THREE.Vector3(),
        min: new THREE.Vector3(),
        max: new THREE.Vector3(),
        boxA: new THREE.Box3(),
        boxB: new THREE.Box3()
      };
    }
    const half = this.enemyHalf;
    const hx = half.x + margin, hz = half.z + margin, hy = half.y;
  
    const bb = this._tmp.boxA.set(
      this._tmp.min.set(pos.x - hx, pos.y - hy, pos.z - hz),
      this._tmp.max.set(pos.x + hx, pos.y + hy, pos.z + hz)
    );
  
    // against world
    for (const obb of this.objectBBs) { if (bb.intersectsBox(obb)) return false; }

    // enforce arena bounds (1m from inner wall for circular arenas)
    if (this.arenaRadius !== Infinity) {
      const wallT = 1; // world.js wall thickness
      const maxR = this.arenaRadius - wallT / 2 - 1;
      const r = Math.hypot(pos.x, pos.z);
      if (r + Math.max(half.x, half.z) > maxR) return false;
    }

    // against other enemies (use a second box!)
    for (const e of this.enemies) {
      const ex = e.position.x, ey = e.position.y, ez = e.position.z;
      const ebb = this._tmp.boxB.set(
        this._tmp.min.set(ex - hx, ey - hy, ez - hz),
        this._tmp.max.set(ex + hx, ey + hy, ez + hz)
      );
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

  applyKnockback(enemy, vector) {
    if (!enemy || !vector) return;
    const step = vector.clone ? vector.clone() : new this.THREE.Vector3(vector.x || 0, vector.y || 0, vector.z || 0);
    const type = enemy.userData?.type || '';
    if (type === 'swarm_warden' || type.startsWith('flyer')) {
      const horiz = step.clone();
      horiz.y = 0;
      const oldY = enemy.position.y;
      this._moveWithCollisions(enemy, horiz);
      const dip = Math.max(-0.3, Math.min(0.3, step.y || 0));
      enemy.position.y = oldY + dip;
    } else {
      this._moveWithCollisions(enemy, step);
    }
  }

  _moveWithCollisions(enemy, step) {
    const THREE = this.THREE;
    if (!this._tmp) {
      this._tmp = {
        v1: new THREE.Vector3(),
        v2: new THREE.Vector3(),
        v3: new THREE.Vector3(),
        min: new THREE.Vector3(),
        max: new THREE.Vector3(),
        boxA: new THREE.Box3(),
        boxB: new THREE.Box3()
      };
    }
    const half = this.enemyHalf;
    const t = this._tmp;
    // Allow climbing over obstacles up to roughly half an enemy's height.
    const stepUpMax = 0.40 * this.enemyFullHeight;
    const jumpAssistMax = 0.50 * this.enemyFullHeight;

    let px = enemy.position.x;
    let pz = enemy.position.z;
    let py = enemy.position.y;
    const startX = px;
    const startZ = pz;
  
    const tryAxis = (dx, dz) => {
      const nx = px + dx, nz = pz + dz;
      const feetY = py - half.y;
      t.min.set(nx - half.x, Math.max(0.0, feetY + 0.05), nz - half.z);
      t.max.set(nx + half.x, feetY + (half.y*2),            nz + half.z);
      t.boxA.set(t.min, t.max);
      for (const obb of this.objectBBs) {
        if ((obb.max.y - obb.min.y) <= jumpAssistMax) continue; // low enough to step over
        if (t.boxA.intersectsBox(obb)) return false;
      }
      // accept & update running position for next axis
      px = nx; pz = nz; return true;
    };
  
    const beforeGround = this._groundHeightAt(px, pz);

    // If we've returned to our baseline ground height, clear any climb attempt state
    if (enemy.userData?.baseGround != null && beforeGround <= enemy.userData.baseGround + 1e-3) {
      enemy.userData.baseGround = undefined;
    }

    tryAxis(step.x, 0);
    tryAxis(0, step.z);

    // --- Player collision check ---
    const player = this._ctx?.player;
    if (player && player.position) {
      const pr = 0.6; // player feet radius
      const sumR = pr + half.x;
      const playerX = player.position.x;
      const playerZ = player.position.z;
      const dx = px - startX;
      const dz = pz - startZ;
      const fx = startX - playerX;
      const fz = startZ - playerZ;
      const a = dx*dx + dz*dz;
      const b = 2*(fx*dx + fz*dz);
      const c = fx*fx + fz*fz - sumR*sumR;
      let collided = false;
      let tHit = null;
      if (c <= 0) { collided = true; tHit = 0; }
      else {
        const disc = b*b - 4*a*c;
        if (disc >= 0) {
          const sqrt = Math.sqrt(disc);
          const t0 = (-b - sqrt) / (2*a);
          const t1 = (-b + sqrt) / (2*a);
          if (t0 >= 0 && t0 <= 1) { collided = true; tHit = t0; }
          else if (t1 >= 0 && t1 <= 1) { collided = true; tHit = t1; }
        }
      }
      if (!collided) {
        const ex = px - playerX;
        const ez = pz - playerZ;
        if (ex*ex + ez*ez < sumR*sumR) collided = true;
      }
      if (collided) {
        if (tHit != null) {
          px = startX + dx * tHit;
          pz = startZ + dz * tHit;
        }
        let ex = px - playerX;
        let ez = pz - playerZ;
        const len = Math.hypot(ex, ez) || 1e-6;
        const nx = ex / len, nz = ez / len;
        px = playerX + nx * sumR;
        pz = playerZ + nz * sumR;

        // small knockback to enemy to avoid overlap
        px += nx * 0.05;
        pz += nz * 0.05;

        // push player back slightly to emphasize impact
        if (this._ctx?.applyPlayerKnockback) {
          t.v3.set(-nx * 0.18, 0, -nz * 0.18);
          this._ctx.applyPlayerKnockback(t.v3);
        }

        // Trigger rusher contact damage once and end dash
        const inst = this.instanceByRoot?.get(enemy);
        if (inst instanceof RusherEnemy) {
          if (inst._charging && !inst._hasDealtHit && inst._hitCooldown <= 0) {
            this._ctx?.onPlayerDamage?.(20, 'melee');
            inst._hitCooldown = 0.8;
            inst._hasDealtHit = true;
          }
          if (inst._charging) {
            inst._charging = false;
            inst._dashTimer = 0;
            inst._recoverTimer = 0.5 + Math.random() * 0.3;
          }
        }
      }
    }

    const afterGround = this._groundHeightAt(px, pz);
    const rise = Math.max(0, afterGround - beforeGround);
    const desiredY = afterGround + half.y;

    if (rise > 0) {
      // Mark the starting ground height for cumulative climb checks
      if (enemy.userData) {
        if (enemy.userData.baseGround == null) enemy.userData.baseGround = beforeGround;
      } else {
        enemy.userData = { baseGround: beforeGround };
      }

      const cumulative = afterGround - enemy.userData.baseGround;
      if (cumulative > jumpAssistMax + 1e-3) {
        // Abort climb and revert horizontal movement
        px = startX;
        pz = startZ;
        py = enemy.userData.baseGround + half.y;
        enemy.position.set(px, py, pz);
        return;
      }

      const maxLift = (rise <= stepUpMax + 1e-3) ? stepUpMax : (rise <= jumpAssistMax + 1e-3 ? jumpAssistMax : 0);
      if (maxLift > 0) {
        const lift = Math.min(desiredY - py, maxLift);
        py = py + Math.max(0, lift);
      }
    } else {
      py = desiredY;
      if (enemy.userData) enemy.userData.baseGround = undefined;
    }

    enemy.position.set(px, py, pz);
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
    if (!this._tmp) {
      this._tmp = {
        v1: new this.THREE.Vector3(),
        v2: new this.THREE.Vector3(),
        v3: new this.THREE.Vector3(),
        min: new this.THREE.Vector3(),
        max: new this.THREE.Vector3(),
        box: new this.THREE.Box3()
      };
    }
    const sep = this._tmp.v1.set(0,0,0);
    const r = radius; const r2 = r*r;
    for (const other of this.enemies) {
      if (other === selfRoot) continue;
      const dx = other.position.x - position.x;
      const dz = other.position.z - position.z;
      const d2 = dx*dx + dz*dz; if (d2 > r2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const k = (r - d) / (r * d);
      sep.x -= dx * k; sep.z -= dz * k;
    }
    return sep.clone(); // callers sometimes mutate; return a copy to be safe
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
        if (cfg.type === 'bailiff') return new BailiffEnemy(args);
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
    if (this.suspendWaves) return; // disabled in test harness
    if (this.obstacleManager && this.wave % 5 === 0) {
      const player = this.getPlayer();
      try { this.obstacleManager.respawnMissing(player.position.clone(), this.enemies); } catch(_) {}
    }
    // Gate boss waves
    if (this.wave % 5 === 0) {
      const started = this.bossManager.startBoss(this.wave);
      if (started) {
        if (this.onWave) this.onWave(this.wave, 1);
        return;
      }
    }

    const lateGameWave = this.wave >= 35;
    const lateGameMultiplier = Math.floor(lateGameWave / 10);
    const count = lateGameWave ? 10 + this.wave + 15 * lateGameMultiplier : 10 + this.wave;
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
    if (!this.suspendWaves) this.startWave();
  }

  tickAI(playerObject, dt, onPlayerDamage) {
    // lazy init (kept)
    if (!this._ctx) {
      this._healReg = new Map();
      this._ctx = {
        player: null, objects: this.objects, scene: this.scene, onPlayerDamage: null,
        enemyManager: this,
        _spawnBullet: (kind, origin, velocity, maxLife, damage) =>
          this._spawnBullet(kind, origin, velocity, maxLife, damage),
        separation: (position, radius, selfRoot) => this.separation(position, radius, selfRoot),
        avoidObstacles: (origin, desiredDir, maxDist) => this._avoidObstacles(origin, desiredDir, maxDist),
        moveWithCollisions: (enemy, step) => this._moveWithCollisions(enemy, step),
        alliesNearbyCount: (position, radius = 8.0, selfRoot = null) => {
          const r2 = radius * radius; let count = 0;
          for (const other of this.enemies) {
            if (selfRoot && other === selfRoot) continue;
            const dx = other.position.x - position.x;
            const dy = other.position.y - position.y;
            const dz = other.position.z - position.z;
            if (dx*dx + dy*dy + dz*dz <= r2) count++;
          }
          return count;
        },
        // heal aggregator
        proposeHeal: (targetRoot, amount) => {
          if (!targetRoot || !amount || amount <= 0) return;
          const prev = this._healReg.get(targetRoot) || 0;
          if (amount > prev) this._healReg.set(targetRoot, amount);
        },
        blackboard: {
          playerForward: null,
          playerSpeed: 0,
          suppression: false,
          regroup: false,
          alive: 0,
          waveStartingAlive: 0,
          time: 0,
          sniperLastFireAt: -Infinity
        }
      };
    }
    if (!this._tmp) {
      this._tmp = {
        v1: new this.THREE.Vector3(),
        v2: new this.THREE.Vector3(),
        v3: new this.THREE.Vector3(),
        min: new this.THREE.Vector3(),
        max: new this.THREE.Vector3(),
        boxA: new this.THREE.Box3(),
        boxB: new this.THREE.Box3()
      };
    }
  
    this._aiClock += dt;
  
    // heal sprite upkeep (unchanged)
    if (this._healSprites && this._healSprites.length) {
      for (let i = this._healSprites.length - 1; i >= 0; i--) {
        const s = this._healSprites[i];
        s.life += dt;
        if (s.life >= s.maxLife) {
          this.scene.remove(s.sprite);
          this._healSprites.splice(i, 1);
          continue;
        }
        s.sprite.position.addScaledVector(s.velocity, dt);
        if (s.sprite.material && s.sprite.material.opacity !== undefined) {
          s.sprite.material.opacity = Math.max(0, 1 - s.life / s.maxLife);
        }
      }
    }
    const ctx = this._ctx || (this._ctx = {});

    // 2) Per-frame basics
    ctx.player = playerObject;
    ctx.objects = this.objects;
    ctx.scene = this.scene;
    ctx.onPlayerDamage = onPlayerDamage;
    ctx.pickups = this.pickups;

    // 3) One-time helper wiring (from main). Create once.
    if (!ctx._spawnBullet) {
      ctx._spawnBullet = (kind, origin, velocity, maxLife, damage) =>
        this._spawnBullet(kind, origin, velocity, maxLife, damage);
    }
    if (!ctx.separation) {
      ctx.separation = (...args) => this.separation(...args);
    }
    if (!ctx.avoidObstacles) {
      ctx.avoidObstacles = (origin, desiredDir, maxDist) =>
        this._avoidObstacles(origin, desiredDir, maxDist);
    }
    if (!ctx.moveWithCollisions) {
      ctx.moveWithCollisions = (enemy, step) => this._moveWithCollisions(enemy, step);
    }
    if (!ctx.applyKnockback) {
      ctx.applyKnockback = (enemy, vec) => this.applyKnockback(enemy, vec);
    }
    if (!ctx.applyPlayerKnockback) {
      ctx.applyPlayerKnockback = (vec) => playerObject?.applyKnockback?.(vec);
    }
    if (!ctx.pathfind) {
      ctx.pathfind = {
        recomputeIfStale: (enemy, goal) => pathRecompute(enemy, goal, this.objectBBs, { cacheFor: 4.5 }),
        nextWaypoint: (enemy) => pathNext(enemy),
        clear: (enemy) => pathClear(enemy)
      };
    }
    if (!ctx.alliesNearbyCount) {
      // Count allies within a radius around a position, excluding an optional self root
      ctx.alliesNearbyCount = (position, radius = 8.0, selfRoot = null) => {
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
      };
    }
    if (!ctx.proposeHeal) {
      // Healer support: register max heal per target per tick (non-stacking)
      ctx.proposeHeal = (() => {
        const registry = new Map();
        const fn = (targetRoot, amount) => {
          if (!targetRoot || !amount || amount <= 0) return;
          const prev = registry.get(targetRoot) || 0;
          if (amount > prev) registry.set(targetRoot, amount);
        };
        fn._registry = registry;
        return fn;
      })();
    }
    if (!ctx.sniperFired) {
      // Sniper coordination: record last shot to stagger others
      ctx.sniperFired = () => { this._sniperLastFireAt = this._aiClock; };
    }
    if (!ctx.fallbackMeleeUpdate) {
      // temporary helper so non-implemented types behave sanely
      ctx.fallbackMeleeUpdate = (inst, _dt) => {
        const fake = new MeleeEnemy({
          THREE: this.THREE,
          mats: this.mats,
          cfg: { type: 'grunt', hp: 1, speedMin: inst.speed, speedMax: inst.speed, color: 0xffffff },
          spawnPos: inst.root.position.clone()
        });
        fake.root = inst.root; // reuse same root; only use update logic
        fake.update(_dt, ctx);
      };
    }

    // 4) Player speed EMA (from HEAD)
    if (!this._playerPrevPos && playerObject && playerObject.position) {
      this._playerPrevPos = playerObject.position.clone();
      this._playerSpeedEMA = 0;
    }
    if (playerObject && playerObject.position) {
      const d = this._tmp.v1.copy(playerObject.position).sub(this._playerPrevPos || playerObject.position);
      const instSpeed = d.length() / Math.max(1e-3, dt);
      const alpha = 0.25; // EMA smoothing
      this._playerSpeedEMA = (this._playerSpeedEMA == null)
        ? instSpeed
        : (alpha * instSpeed + (1 - alpha) * this._playerSpeedEMA);
      this._playerPrevPos.copy(playerObject.position);
    }

    // 5) Blackboard (merge of both)
    const info = this.getPlayer ? this.getPlayer() : null;
    const forward = info && info.forward ? info.forward.clone() : null;
    const bossActive = !!(this.bossManager && this.bossManager.active && this.bossManager.boss);

    // Create or reuse bb object so other code can stash things on it
    const bb = ctx.blackboard || (ctx.blackboard = {});
    bb.playerForward       = forward;
    bb.playerSpeed         = this._playerSpeedEMA || 0;
    bb.suppression         = bb.suppression || false; // keep if already set by combat logic
    bb.regroup             = !bossActive
                          && this.waveStartingAlive > 0
                          && this.alive <= Math.max(1, Math.floor(this.waveStartingAlive * 0.25));
    bb.alive               = this.alive;
    bb.waveStartingAlive   = this.waveStartingAlive;
    bb.time                = this._aiClock;
    bb.sniperLastFireAt    = this._sniperLastFireAt;
    if (this.bossManager) this.bossManager.update(dt, ctx);
  
    // time-sliced AI
    this._aiFrame = (this._aiFrame || 0) + 1;
    const playerPos = ctx.player && ctx.player.position ? ctx.player.position : null;
    let i = 0;
    for (const inst of this.instances) {
      i++;
      if (!playerPos || !inst || !inst.root || !inst.root.position) { inst.update(dt, ctx); continue; }
      const dx = inst.root.position.x - playerPos.x;
      const dz = inst.root.position.z - playerPos.z;
      const d2 = dx*dx + dz*dz;
      if (d2 > (25*25)) {
        if (((i + this._aiFrame) % 3) !== 0) continue;
        inst.update(dt * 3, ctx);
      } else {
        inst.update(dt, ctx);
      }
    }
  
    // bullets
    try { this._updateBulletPools(dt, ctx); } catch(_) {}
  
    // ambient vocals
    if (this.alive > 0) {
      this._lastAmbientVocalAt = (this._lastAmbientVocalAt || 0);
      if (this._aiClock - this._lastAmbientVocalAt > 2.2 + Math.random() * 2.0) {
        const pick = (() => { for (const e of this.instances) return e; return null; })();
        if (pick && window && window._SFX && typeof window._SFX.enemyVocal === 'function') {
          try { window._SFX.enemyVocal(pick.root?.userData?.type || 'grunt'); } catch(_) {}
        }
        this._lastAmbientVocalAt = this._aiClock;
      }
    }
  
    // apply heals with budget
    if (this._healReg.size) {
      let vfxBudget = 6;
      for (const [root, heal] of this._healReg.entries()) {
        if (!root || !root.userData) continue;
        const maxHp = root.userData.maxHp || root.userData.hp;
        if (maxHp == null) continue;
        root.userData.hp = Math.min(maxHp, (root.userData.hp || 0) + heal);
        if (vfxBudget > 0) {
          const lastAt = this._lastHealVfxAt.get(root) || -Infinity;
          if ((this._aiClock - lastAt) >= this._healVfxCooldown) {
            this._lastHealVfxAt.set(root, this._aiClock);
            const count = Math.max(1, Math.min(4, Math.round(heal * 0.15)));
            this._spawnHealBurst(root, count);
            vfxBudget--;
          }
        }
      }
      this._healReg.clear();
    }
  
    // optional delayed spawns
    if (this._spawnQueue && this._spawnQueue.length) {
      const now = performance.now();
      for (let s = this._spawnQueue.length - 1; s >= 0; s--) {
        const it = this._spawnQueue[s];
        if (it.at <= now) {
          this.spawn(it.type);
          this._spawnQueue.splice(s, 1);
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
  
    // O(1) swap-pop from _enemyRootsArr
    if (!this._rootIndex) this._rootIndex = new WeakMap();
    const idx = this._rootIndex.get(enemyRoot);
    if (idx != null) {
      const last = this._enemyRootsArr.length - 1;
      const lastRoot = this._enemyRootsArr[last];
      this._enemyRootsArr[idx] = lastRoot;
      this._rootIndex.set(lastRoot, idx);
      this._enemyRootsArr.pop();
      this._rootIndex.delete(enemyRoot);
    }
  
    const inst = this.instanceByRoot.get(enemyRoot);
    if (inst) {
      if (typeof inst.onRemoved === 'function') inst.onRemoved(this.scene);
      this.instances.delete(inst);
    }
  
    this.alive--;
    if (this.onRemaining) this.onRemaining(this.alive);
  
    if (this.bossManager && this.bossManager.active && this.bossManager.boss && enemyRoot === this.bossManager.boss.root) {
      this.bossManager._onBossDeath();
    }
  
    const bossActive = !!(this.bossManager && this.bossManager.active && this.bossManager.boss);
    if (!this.suspendWaves) {
      if (this.alive <= 0 && !bossActive && !Hydraclone.hasPending() && !this._advancingWave) {
        this._advancingWave = true;
        this.wave++;
        this.startWave();
        this._advancingWave = false;
      }
    }
  }

  // --- Boss integration helpers ---

  registerExternalEnemy(instance, { countsTowardAlive = true } = {}) {
    this.scene.add(instance.root);
    this.enemies.add(instance.root);
    this.instances.add(instance);
    this.instanceByRoot.set(instance.root, instance);
  
    if (!this._rootIndex) this._rootIndex = new WeakMap();
    this._rootIndex.set(instance.root, this._enemyRootsArr.length);
    this._enemyRootsArr.push(instance.root);
  
    if (countsTowardAlive) {
      this.alive++;
      if (this.onRemaining) this.onRemaining(this.alive);
    }
    return instance.root;
  }
  
  spawnAt(type, position, { countsTowardAlive = true } = {}) {
    const inst = this._createInstance(type, position);
    if (type === 'gruntling') {
      inst.root.userData.hp = 10 + Math.floor(Math.random() * 21); // 10–30
    }
    if (inst && inst.root && inst.root.userData) {
      if (inst.root.userData.maxHp == null && inst.root.userData.hp != null) inst.root.userData.maxHp = inst.root.userData.hp;
    }
    this.scene.add(inst.root);
    this.enemies.add(inst.root);
    this.instances.add(inst);
    this.instanceByRoot.set(inst.root, inst);
  
    if (!this._rootIndex) this._rootIndex = new WeakMap();
    this._rootIndex.set(inst.root, this._enemyRootsArr.length);
    this._enemyRootsArr.push(inst.root);
  
    if (countsTowardAlive) {
      this.alive++;
      if (this.onRemaining) this.onRemaining(this.alive);
    }
    return inst.root;
  }

  _getWaveTypes(wave, total) {
    const types = new Array(total).fill('grunt');

    // Desired proportions as wave scales
    const pctRusher  = wave >= 6 ? 0.12 : 0.0;
    // Shooters appear starting wave 2 at a lower proportion
    const pctShooter = wave >= 2 ? 0.08 : 0.0;
    // Flyers now appear starting at wave 1 with a gentle ramp
    const pctFlyer   = Math.min(0.6, 0.10 + 0.05 * (wave - 1));
    const pctTank    = wave >= 3 ? 0.10 : 0.0;
    const pctHealer  = wave >= 7 ? 0.08 : 0.0;
    const pctSniper  = wave >= 8 ? 0.05 : 0.0;
    const pctWarden  = wave >= 20 ? 0.04 : 0.0;

    const minFlyer  = wave >= 5 ? 2 : 0;
    let needFlyer   = wave >= 5 ? Math.max(minFlyer, Math.floor(total * pctFlyer)) : 0;
    // Base rusher pool, later split into variant tiers
    let totalRusher = Math.floor(total * pctRusher);
    let needRusher = totalRusher;           // commons
    let needRusherElite = 0;
    let needRusherExplosive = 0;

    if (wave >= 25 && totalRusher > 0) {
      // Groups of five: 1 bomber, 1 elite, 3 common
      const groups = Math.floor(totalRusher / 5);
      needRusherExplosive = Math.max(1, groups);
      needRusherElite = groups;
      needRusher -= groups * 2; // remaining are commons
    } else if (wave >= 15 && totalRusher > 0) {
      // 1 elite per 3 common (group of four)
      needRusherElite = Math.floor(totalRusher / 4);
      needRusher -= needRusherElite;
    }
    let needShooter = Math.floor(total * pctShooter);
    let needTank    = Math.max(wave >= 6 ? 1 : 0, Math.floor(total * pctTank));
    let needHealer  = Math.floor(total * pctHealer);
    let needSniper  = Math.floor(total * pctSniper);
    let needWarden  = Math.floor(total * pctWarden);

    // Cap total replacements to total count
    let requested = needFlyer + needRusher + needRusherElite + needRusherExplosive + needShooter + needTank + needHealer + needSniper + needWarden;
    if (requested > total) {
      const scale = total / requested;
      needFlyer = Math.floor(needFlyer * scale);
      needRusher = Math.floor(needRusher * scale);
      needRusherElite = Math.floor(needRusherElite * scale);
      needRusherExplosive = Math.floor(needRusherExplosive * scale);
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
    assignRandom(needRusherElite, 'rusher_elite');
    assignRandom(needRusherExplosive, 'rusher_explosive');
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