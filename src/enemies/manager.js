import { MeleeEnemy } from './melee.js';
import { ShooterEnemy } from './shooter.js';
import { FlyerEnemy } from './flyer.js';
import { HealerEnemy } from './healer.js';
import { SniperEnemy } from './sniper.js';
import { logError } from '../util/log.js';
import { RusherEnemy } from './rusher.js';
import { BailiffEnemy } from './bailiff.js';
import { SwarmWarden } from './warden.js';
import { BossManager } from '../bosses/manager.js';
import { Hydraclone } from '../bosses/hydraclone.js';
import { nextWaypoint as pathNext, recomputeIfStale as pathRecompute, clear as pathClear } from '../path.js';
import { ARENA_RADIUS } from '../world.js';
import { ENEMY_BEHAVIOR_PROFILES, resolveBehaviorId, resolveBehaviorProfile } from './behavior-profiles.js';
import { EnemySpatialIndex, segmentIntersectsBody, verticalSpansOverlap } from './spatial-index.js';
import { EnemyPerceptionMemory } from './perception.js';
import { expandWaveRoster, getSpecialWaveDefinition } from './wave-definitions.js';
import { resolveBossBehaviorProfile } from '../bosses/behavior-profiles.js';

function containsExtrudeGeometry(obj){
  if (obj.geometry?.isExtrudeGeometry) return true;
  for (const child of obj.children || []){
    if (containsExtrudeGeometry(child)) return true;
  }
  return false;
}

export class EnemyManager {
  constructor(THREE, scene, mats, objects = [], getPlayer = null, arenaRadius = Infinity, obstacleManager = null, rng = Math.random) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.objects = objects;
    this.getPlayer = getPlayer || (() => ({ position: new THREE.Vector3(), forward: new THREE.Vector3(0,0,1) }));
    this.arenaRadius = arenaRadius;
    this.obstacleManager = obstacleManager;
    this.rng = rng;
    this.behaviorProfiles = ENEMY_BEHAVIOR_PROFILES;
    this.enemies = new Set();            // set of root meshes (raycast target) — back-compat
    this.instances = new Set();          // set of enemy instance objects
    this.instanceByRoot = new WeakMap(); // root -> instance
    this._enemyRootsArr = [];            // cached array for raycasts (avoid spreads)
    this._detailScanQueue = [];           // retrofit detail discovery, amortized after spawn
    this._nonWaveEnemies = new WeakSet(); // registered helpers that must not affect wave counts
    this.spatialIndex = new EnemySpatialIndex({ cellSize: 4, verticalCellSize: 3 });
    this.perception = new EnemyPerceptionMemory({
      acquireSeconds: 0.15,
      loseSeconds: 0.25,
      memorySeconds: 5,
      searchSeconds: 3
    });
    this._neighborScratch = [];
    this._movementScratch = [];
    this._segmentScratch = [];
    this._senseCache = new WeakMap();
    this._separationOrder = new WeakMap();
    this._nextSeparationOrder = 1;
    this._allyBypass = new WeakMap();
    this._airAttackReservations = new Map();
    this.onAIEvent = null;
    this.wave = 1;
    this.alive = 0;
    this.onWave = null;
    this.onRemaining = null;
    this.onSpecialWave = null;
    this.specialWaveState = null;
    this._waveSpawnEpoch = 0;
    this.encounterHooks = null;
    this._authoredSpawnQueue = [];
    this._authoredSpawnCooldown = 0;

    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o) && !o?.userData?.walkableSurface)
      .map(o => new this.THREE.Box3().setFromObject(o));
    this.raycaster = new this.THREE.Raycaster();
    try { this.raycaster.firstHitOnly = true; } catch (e) { logError(e); }
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
    this.bossManager = new BossManager({ THREE: this.THREE, scene: this.scene, mats: this.mats, enemyManager: this, rng: this.rng });

    // Bullet pools (instanced) for enemy projectiles
    this._initBulletPools();
  }

  setArenaRadius(radius){
    this.arenaRadius = radius;
    this.spawnRings = this._computeSpawnRings();
  }

  // Rebuild collidable AABBs after the shared objects list changes (e.g., obstacles destroyed)
  refreshColliders(objects = this.objects) {
    this.objects = objects;
    this.objectBBs = this.objects
      .filter(o => !containsExtrudeGeometry(o) && !o?.userData?.walkableSurface)
      .map(o => new this.THREE.Box3().setFromObject(o));
  }

  _initBulletPools() {
    const THREE = this.THREE;
    const mkPool = (kind, color, radius, max) => {
      const geo = new THREE.SphereGeometry(radius, 10, 10);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      this.scene.add(mesh);
      const ray = new THREE.Raycaster();
      try { ray.firstHitOnly = true; } catch (e) { logError(e); }
      return {
        kind,
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
      shooter: mkPool('shooter', 0x10b981, 0.12, 600),
      sniper:  mkPool('sniper', 0xff3344, 0.09, 300)
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
  

  _spawnBullet(kind, origin, velocity, maxLife, damage = 10, ownerRoot = null, ownerRootOverride = null) {
    const pool = (this._bulletPools && this._bulletPools[kind]) ? this._bulletPools[kind] : null;
    if (!pool) return false;
    if (pool.count >= pool.max) return false;
  
    const slot = pool.count++;
    pool.items[slot] = {
      px: origin.x, py: origin.y, pz: origin.z,
      vx: velocity.x, vy: velocity.y, vz: velocity.z,
      life: 0, maxLife, damage,
      ownerRoot,
      ownerRootOverride
    };
    this._emitAIEvent(ownerRoot, 'projectile_spawned', { kind, damage, ownerRootOverride });
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
  
        const segmentStart = { x: b.px, y: b.py, z: b.pz };
        const segmentEnd = { x: nx, y: ny, z: nz };

        // Allied bodies are real tactical cover. The owner is excluded, and
        // an owning Warden may be supplied separately for attribution only.
        const allyHit = this._firstAllyOnSegment(segmentStart, segmentEnd, b.ownerRoot, 0.04);
        if (allyHit) {
          this._emitAIEvent(b.ownerRoot, 'projectile_blocked_by_ally', {
            kind: pool.kind,
            blockerRoot: allyHit.entry.root,
            ownerRootOverride: b.ownerRootOverride
          });
          hit = true;
        }

        // player band check (no vectors)
        if (!hit && ny >= 1.2 && ny <= 1.8) {
          const pdx = nx - playerPos.x, pdz = nz - playerPos.z;
          if ((pdx*pdx + pdz*pdz) < 0.36) { // 0.6^2
            ctx.damagePlayer?.(b.damage, {
              sourceKind: pool.kind === 'sniper' ? 'sniper_projectile' : 'shooter_projectile',
              sourceRoot: b.ownerRoot,
              ownerRoot: b.ownerRootOverride || b.ownerRoot
            });
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

  setEncounterHooks(hooks = null) {
    this.encounterHooks = hooks;
    if (!hooks) {
      this._authoredSpawnQueue.length = 0;
      this._authoredSpawnCooldown = 0;
    }
  }

  _profileForRoot(root) {
    const inst = this.instanceByRoot?.get(root);
    const bossProfile = resolveBossBehaviorProfile(root?.userData?.type || inst?.root?.userData?.type);
    if (bossProfile) return bossProfile;
    const behaviorId = root?.userData?.behaviorId || inst?.behaviorId || root?.userData?.type;
    return resolveBehaviorProfile(behaviorId);
  }

  _rebuildSpatialIndex() {
    this.spatialIndex.rebuild(this.enemies, root => this._profileForRoot(root));
  }

  _ensureSpatialIndex() {
    if (this.spatialIndex.size !== this.enemies.size) this._rebuildSpatialIndex();
  }

  _emitAIEvent(root, type, data = {}) {
    if (!root || !type) return;
    const event = { at: this._aiClock || 0, root, enemyId: root.userData?.type || root.userData?.behaviorId, type, ...data };
    try { this.onAIEvent?.(event); } catch (e) { logError(e); }
  }

  _setAIState(root, state, data = null) {
    if (!root?.userData || !state) return;
    const previous = root.userData.aiState || 'idle';
    root.userData.aiState = state;
    if (previous !== state) this._emitAIEvent(root, 'state_changed', { previous, state, data });
  }

  _firstAllyOnSegment(start, end, ownerRoot, padding = 0) {
    this._ensureSpatialIndex();
    return this.spatialIndex.firstBodyOnSegment(start, end, {
      excludeRoot: ownerRoot,
      padding,
      out: this._segmentScratch
    });
  }

  _tacticalLineClear(root, origin, target, padding = 0.04) {
    if (!root || !origin || !target) return { clear: false, worldClear: false, blockerRoot: null };
    const worldClear = this._hasImmediateWorldLOS(origin, target);
    const allyHit = worldClear ? this._firstAllyOnSegment(origin, target, root, padding) : null;
    return {
      clear: worldClear && !allyHit,
      worldClear,
      blockerRoot: allyHit?.entry?.root || null
    };
  }

  _reserveAirAttack(root, ownerRoot = null, { maxConcurrent = 2, duration = 3 } = {}) {
    if (!root) return false;
    for (const [candidate, reservation] of this._airAttackReservations) {
      if (reservation.expires <= this._aiClock || !this.enemies.has(candidate)) {
        this._airAttackReservations.delete(candidate);
      }
    }
    const existing = this._airAttackReservations.get(root);
    if (existing) {
      existing.expires = this._aiClock + duration;
      return true;
    }
    let active = 0;
    for (const reservation of this._airAttackReservations.values()) {
      if (reservation.ownerRoot === ownerRoot) active++;
    }
    if (active >= maxConcurrent) return false;
    this._airAttackReservations.set(root, { ownerRoot, expires: this._aiClock + duration });
    return true;
  }

  _releaseAirAttack(root) {
    if (root) this._airAttackReservations.delete(root);
  }

  _hasImmediateWorldLOS(origin, target) {
    const dir = this._tmp?.v2 || new this.THREE.Vector3();
    dir.copy(target).sub(origin);
    const distance = dir.length();
    if (distance <= 1e-4) return true;
    dir.multiplyScalar(1 / distance);
    this.raycaster.set(origin, dir);
    this.raycaster.far = Math.max(0, distance - 0.05);
    const hits = this.raycaster.intersectObjects(this.objects, false);
    return !(hits && hits.length);
  }

  _locomotionCorridorClear(root, targetPosition) {
    if (!root?.position || !targetPosition) return false;
    const profile = this._profileForRoot(root);
    const bottom = profile.movementLayer === 'ground'
      ? root.position.y - profile.groundOffset
      : root.position.y - profile.collisionHeight * 0.5;
    const top = bottom + profile.collisionHeight;
    for (const box of this.objectBBs) {
      if (box.max.y <= bottom + 0.05 || box.min.y >= top - 0.05) continue;
      if (segmentIntersectsExpandedAabbXZ(root.position, targetPosition, box, profile.collisionRadius)) return false;
    }
    return true;
  }

  _positionClearForRoot(root, position, ignoreRoot = null) {
    if (!root?.position || !position) return false;
    const profile = this._profileForRoot(root);
    const bottom = profile.movementLayer === 'ground'
      ? position.y - profile.groundOffset
      : position.y - profile.collisionHeight * 0.5;
    this._tmp.min.set(position.x - profile.collisionRadius, bottom + 0.05, position.z - profile.collisionRadius);
    this._tmp.max.set(position.x + profile.collisionRadius, bottom + profile.collisionHeight, position.z + profile.collisionRadius);
    this._tmp.boxA.set(this._tmp.min, this._tmp.max);
    for (const obstacle of this.objectBBs) if (this._tmp.boxA.intersectsBox(obstacle)) return false;
    if (Number.isFinite(this.arenaRadius)) {
      const maxRadius = Math.max(0, this.arenaRadius - 1.5 - profile.collisionRadius);
      if (Math.hypot(position.x, position.z) > maxRadius) return false;
    }
    this._ensureSpatialIndex();
    const neighbors = this.spatialIndex.queryRadius(position, profile.collisionRadius + 2, {
      excludeRoot: root,
      verticalRadius: profile.collisionHeight + 2,
      out: this._neighborScratch
    });
    const probeRoot = { position };
    for (const entry of neighbors) {
      if (entry.root === ignoreRoot) continue;
      if (!verticalSpansOverlap(probeRoot, profile, entry.root, entry.profile)) continue;
      const clearance = profile.collisionRadius + entry.profile.collisionRadius;
      if (Math.hypot(position.x - entry.root.position.x, position.z - entry.root.position.z) < clearance) return false;
    }
    return true;
  }

  _sensePlayer(root, dt, originOverride = null) {
    if (!root?.position || !this._ctx?.player?.position) return null;
    const cached = this._senseCache.get(root);
    if (cached?.frame === this._aiFrame && !originOverride) return cached.snapshot;
    const profile = this._profileForRoot(root);
    const origin = originOverride?.clone
      ? originOverride.clone()
      : new this.THREE.Vector3(root.position.x, root.position.y + profile.collisionHeight * 0.25, root.position.z);
    const playerPosition = this._ctx.player.position;
    const target = new this.THREE.Vector3(playerPosition.x, playerPosition.y || 1.6, playerPosition.z);
    const rawWorldLOS = this._hasImmediateWorldLOS(origin, target);
    const memory = this.perception.observe(root, {
      dt: Math.max(0, dt || 0),
      time: this._aiClock,
      rawWorldLOS,
      targetPosition: playerPosition
    });
    const allyHit = rawWorldLOS ? this._firstAllyOnSegment(origin, target, root, 0.04) : null;
    const locomotionClear = this._locomotionCorridorClear(root, playerPosition);
    let pursuitTarget = null;
    if (memory.stableWorldLOS) pursuitTarget = playerPosition.clone();
    else if ((memory.memoryActive || memory.searchActive) && memory.lastKnownPosition) {
      pursuitTarget = new this.THREE.Vector3(
        memory.lastKnownPosition.x,
        memory.lastKnownPosition.y,
        memory.lastKnownPosition.z
      );
    }
    const snapshot = {
      ...memory,
      locomotionClear,
      tacticalFireClear: rawWorldLOS && !allyHit,
      blockingAlly: allyHit?.entry?.root || null,
      pursuitTarget
    };
    if (!originOverride) this._senseCache.set(root, { frame: this._aiFrame, snapshot });
    return snapshot;
  }

  _isChargeCorridorClear(root, targetPosition, padding = 0.15) {
    if (!root?.position || !targetPosition) return { clear: false, blockerRoot: null };
    const profile = this._profileForRoot(root);
    const origin = new this.THREE.Vector3(root.position.x, root.position.y, root.position.z);
    const targetY = profile.movementLayer === 'air'
      ? (Number.isFinite(targetPosition.y) ? targetPosition.y : root.position.y)
      : root.position.y;
    const target = new this.THREE.Vector3(targetPosition.x, targetY, targetPosition.z);
    const hit = this._firstAllyOnSegment(origin, target, root, (profile.chargeRadius || profile.collisionRadius) + padding);
    return { clear: !hit, blockerRoot: hit?.entry?.root || null };
  }

  nearbyAllies(position, radius, selfRoot = null, { layer = null, verticalRadius = Infinity } = {}) {
    this._ensureSpatialIndex();
    return this.spatialIndex.queryRadius(position, radius, {
      excludeRoot: selfRoot,
      layer,
      verticalRadius,
      out: []
    });
  }

  // === Helpers ported from previous implementation ===
  // LEGACY random spawn (kept as fallback for safety)
  randomSpawnPos(attempts = 40) {
    const THREE = this.THREE;
    const { position: playerPos, forward } = this.getPlayer();
    for (let i = 0; i < attempts; i++) {
      const x = (this.rng() * 70 - 35) | 0;
      const z = (this.rng() * 70 - 35) | 0;
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
    return this._chooseSpawnPosForType('grunt');
  }

  _chooseSpawnPosForType(type = 'grunt') {
    const THREE = this.THREE;
    const player = this.getPlayer();
    const playerPos = player.position;
    const forward = player.forward;

    const minDist = 12;
    const candidates = [];
    this._lastSpawnCandidate = null;

    const authored = this.encounterHooks?.getSpawnCandidates?.({ wave: this.wave, type });
    if (Array.isArray(authored)) {
      for (const candidate of authored) {
        const source = candidate?.position || candidate;
        const pos = source?.clone ? source.clone() : new THREE.Vector3(source?.x || 0, source?.y ?? 0.8, source?.z || 0);
        const to = pos.clone().sub(playerPos);
        if (to.length() < minDist) continue;
        if (!this.isSpawnPointClear(type, pos, candidate?.clearance)) continue;
        to.y = 0;
        if (to.lengthSq() === 0) continue;
        const facingCos = forward.dot(to.normalize());
        const visible = this._isVisibleFromPlayer(pos);
        const score = (visible ? 2 : 0) + (facingCos > 0.25 ? 1 : 0);
        candidates.push({ p: pos, score, authored: candidate });
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score);
        this._lastSpawnCandidate = candidates[0].authored || null;
        return candidates[0].p.clone();
      }
      if (this.encounterHooks?.authoredOnly) return null;
    }

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

  isSpawnPointClear(type, pos, clearance = null) {
    const profile = this.behaviorProfiles?.[resolveBehaviorId(type)] || resolveBehaviorProfile(type);
    const radius = Number.isFinite(clearance)
      ? clearance
      : Math.max(0.6, Number(profile?.collisionRadius) || this.enemyHalf.x);
    return this._isSpawnAreaClear(pos, Math.max(0, radius - this.enemyHalf.x));
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
    const scale = ARENA_RADIUS / 40;
    const min = -38 * scale, max = 38 * scale; // inner edge to avoid wall thickness
    const midMin = -24 * scale, midMax = 24 * scale; // mid rectangle ring

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
    if (enemy.userData?.knockbackImmune) return;
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

  applyRushImpact(origin, direction, {
    radius = 1.65,
    pushDistance = 2.6,
    stunSeconds = 1.5,
    hitSet = null
  } = {}) {
    if (!origin) return [];
    const affected = [];
    const radiusSq = Math.max(0, radius) ** 2;
    const bossRoot = this.bossManager?.active ? this.bossManager?.boss?.root : null;
    for (const root of this.enemies) {
      if (!root?.position || hitSet?.has(root)) continue;
      const dx = root.position.x - origin.x;
      const dz = root.position.z - origin.z;
      if (dx * dx + dz * dz > radiusSq) continue;

      const isBoss = root === bossRoot;
      const away = new this.THREE.Vector3(dx, 0, dz);
      if (away.lengthSq() <= 1e-6) away.set(direction?.x || 0, 0, direction?.z || -1);
      away.normalize().multiplyScalar(isBoss ? Math.min(0.8, pushDistance) : pushDistance);
      this.applyKnockback(root, away);
      if (!isBoss && root.userData) {
        const until = this._aiClock + Math.max(0, stunSeconds);
        root.userData.stunnedUntil = Math.max(root.userData.stunnedUntil || 0, until);
      }
      hitSet?.add(root);
      affected.push(root);
    }
    return affected;
  }

  applyRadialKnockback(origin, {
    radius = 3.5,
    pushDistance = 1.4,
    affectBosses = false
  } = {}) {
    if (!origin) return [];
    const affected = [];
    const radiusSq = Math.max(0, radius) ** 2;
    const bossRoot = this.bossManager?.active ? this.bossManager?.boss?.root : null;
    for (const root of this.enemies) {
      if (!root?.position || (!affectBosses && root === bossRoot)) continue;
      const dx = root.position.x - origin.x;
      const dz = root.position.z - origin.z;
      if (dx * dx + dz * dz > radiusSq) continue;
      const away = new this.THREE.Vector3(dx, 0, dz);
      if (away.lengthSq() <= 1e-6) away.set(0, 0, -1);
      away.normalize().multiplyScalar(pushDistance);
      this.applyKnockback(root, away);
      affected.push(root);
    }
    return affected;
  }

  _tryDisplaceAlly(moverRoot, otherEntry, awayX, awayZ, requestedDistance) {
    const moverProfile = this._profileForRoot(moverRoot);
    const other = otherEntry.root;
    const otherProfile = otherEntry.profile;
    if (!moverProfile.canDisplace || moverProfile.bodyPriority <= otherProfile.bodyPriority) return false;
    const length = Math.hypot(awayX, awayZ) || 1;
    const distance = Math.min(0.24, Math.max(0.03, requestedDistance));
    const nx = other.position.x + (awayX / length) * distance;
    const nz = other.position.z + (awayZ / length) * distance;
    const halfHeight = otherProfile.collisionHeight * 0.5;
    const otherBottom = otherProfile.movementLayer === 'ground'
      ? other.position.y - otherProfile.groundOffset
      : other.position.y - halfHeight;
    const box = this._tmp.boxB;
    this._tmp.min.set(nx - otherProfile.collisionRadius, otherBottom + 0.05, nz - otherProfile.collisionRadius);
    this._tmp.max.set(nx + otherProfile.collisionRadius, otherBottom + otherProfile.collisionHeight, nz + otherProfile.collisionRadius);
    box.set(this._tmp.min, this._tmp.max);
    for (const obstacle of this.objectBBs) if (box.intersectsBox(obstacle)) return false;

    this._ensureSpatialIndex();
    const neighbors = this.spatialIndex.queryRadius({ x: nx, y: other.position.y, z: nz }, otherProfile.collisionRadius + 2, {
      excludeRoot: other,
      verticalRadius: otherProfile.collisionHeight,
      out: []
    });
    for (const entry of neighbors) {
      if (entry.root === moverRoot) continue;
      if (!verticalSpansOverlap(other, otherProfile, entry.root, entry.profile)) continue;
      const minDistance = otherProfile.collisionRadius + entry.profile.collisionRadius;
      if (Math.hypot(nx - entry.root.position.x, nz - entry.root.position.z) < minDistance - 0.02) return false;
    }
    other.position.x = nx;
    other.position.z = nz;
    if (otherProfile.movementLayer === 'ground') other.position.y = this._groundHeightAt(nx, nz) + otherProfile.groundOffset;
    this._emitAIEvent(moverRoot, 'ally_displaced', { blockerRoot: other, distance });
    return true;
  }

  _moveWithCollisions(enemy, step) {
    const THREE = this.THREE;
    if (!this._tmp) {
      this._tmp = {
        v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(),
        min: new THREE.Vector3(), max: new THREE.Vector3(),
        boxA: new THREE.Box3(), boxB: new THREE.Box3()
      };
    }
    const profile = this._profileForRoot(enemy);
    const radius = profile.collisionRadius;
    const halfHeight = profile.collisionHeight * 0.5;
    const startX = enemy.position.x;
    const startZ = enemy.position.z;
    let px = startX;
    let pz = startZ;
    let py = enemy.position.y;
    const result = {
      requestedDistance: Math.hypot(step.x || 0, step.z || 0),
      appliedDistance: 0,
      blockedBy: null,
      blockerRoot: null
    };

    const tryAxis = (dx, dz) => {
      const nx = px + dx;
      const nz = pz + dz;
      const bodyBottom = profile.movementLayer === 'ground' ? py - profile.groundOffset : py - halfHeight;
      this._tmp.min.set(nx - radius, bodyBottom + 0.05, nz - radius);
      this._tmp.max.set(nx + radius, bodyBottom + profile.collisionHeight, nz + radius);
      this._tmp.boxA.set(this._tmp.min, this._tmp.max);
      for (const obstacle of this.objectBBs) {
        if (!this._tmp.boxA.intersectsBox(obstacle)) continue;
        result.blockedBy ||= 'world';
        return false;
      }
      px = nx;
      pz = nz;
      return true;
    };

    const beforeGround = profile.movementLayer === 'ground' ? this._groundHeightAt(px, pz) : 0;
    tryAxis(step.x || 0, 0);
    tryAxis(0, step.z || 0);

    // Resolve allied bodies with a swept circle, so high-speed dashes cannot tunnel.
    this._ensureSpatialIndex();
    const mid = { x: (startX + px) * 0.5, y: py, z: (startZ + pz) * 0.5 };
    const queryRadius = Math.hypot(px - startX, pz - startZ) * 0.5 + radius + 2.2;
    const nearby = this.spatialIndex.queryRadius(mid, queryRadius, {
      excludeRoot: enemy,
      verticalRadius: halfHeight + 3,
      out: this._movementScratch
    });
    let earliest = null;
    for (const entry of nearby) {
      if (!verticalSpansOverlap(enemy, profile, entry.root, entry.profile)) continue;
      const combined = radius + entry.profile.collisionRadius;
      const startDistance = Math.hypot(startX - entry.root.position.x, startZ - entry.root.position.z);
      const endDistance = Math.hypot(px - entry.root.position.x, pz - entry.root.position.z);
      // Bodies that entered the tick already touching/overlapping must be able
      // to take an outward separation step; treating t=0 as a new collision
      // traps both agents forever.
      if (startDistance <= combined + 0.02 && endDistance > startDistance + 1e-5) continue;
      let hitT = firstCircleSweepT(startX, startZ, px, pz, entry.root.position.x, entry.root.position.z, combined);
      if (hitT == null) continue;
      if (profile.canDisplace && profile.bodyPriority > entry.profile.bodyPriority) {
        const awayX = entry.root.position.x - px;
        const awayZ = entry.root.position.z - pz;
        const displaced = this._tryDisplaceAlly(enemy, entry, awayX, awayZ, combined - endDistance + 0.03);
        if (displaced) {
          hitT = firstCircleSweepT(startX, startZ, px, pz, entry.root.position.x, entry.root.position.z, combined);
          if (hitT == null) continue;
        }
      }
      if (!earliest || hitT < earliest.t) earliest = { t: hitT, entry, combined };
    }
    if (earliest) {
      const intendedX = px;
      const intendedZ = pz;
      const moveLength = Math.hypot(px - startX, pz - startZ) || 1;
      const safeT = Math.max(0, earliest.t - 0.025 / moveLength);
      px = startX + (px - startX) * safeT;
      pz = startZ + (pz - startZ) * safeT;
      const instance = this.instanceByRoot?.get(enemy);
      const canSlide = !(instance instanceof RusherEnemy && instance._charging);
      let slid = false;
      if (canSlide && result.requestedDistance > 1e-5) {
        const blocker = earliest.entry.root;
        let nx = px - blocker.position.x;
        let nz = pz - blocker.position.z;
        const normalLength = Math.hypot(nx, nz) || 1;
        nx /= normalLength;
        nz /= normalLength;
        const remainingX = intendedX - px;
        const remainingZ = intendedZ - pz;
        const inward = Math.min(0, remainingX * nx + remainingZ * nz);
        let slideX = remainingX - nx * inward;
        let slideZ = remainingZ - nz * inward;
        let slideLength = Math.hypot(slideX, slideZ);
        if (slideLength < 1e-4) {
          let bypass = this._allyBypass.get(enemy);
          if (!bypass || bypass.blocker !== blocker || bypass.until < this._aiClock) {
            bypass = {
              blocker,
              sign: (this._nextSeparationOrder++ & 1) ? 1 : -1,
              until: this._aiClock + 1.2
            };
            this._allyBypass.set(enemy, bypass);
          } else {
            bypass.until = this._aiClock + 1.2;
          }
          const amount = Math.min(0.24, Math.max(0.035, result.requestedDistance * (1 - safeT)));
          slideX = -nz * bypass.sign * amount;
          slideZ = nx * bypass.sign * amount;
          slideLength = amount;
        } else if (slideLength > 0.24) {
          const scale = 0.24 / slideLength;
          slideX *= scale;
          slideZ *= scale;
          slideLength = 0.24;
        }
        const candidate = this._tmp.v3.set(
          px + nx * 0.04 + slideX,
          py,
          pz + nz * 0.04 + slideZ
        );
        if (this._positionClearForRoot(enemy, candidate)) {
          px = candidate.x;
          pz = candidate.z;
          slid = true;
          result.slidAround = 'ally';
          result.blockerRoot = blocker;
          this._emitAIEvent(enemy, 'movement_slid_around_ally', { blockerRoot: blocker, distance: slideLength });
        }
      }
      if (!slid) {
        result.blockedBy = 'ally';
        result.blockerRoot = earliest.entry.root;
        this._emitAIEvent(enemy, 'movement_blocked', { blockedBy: 'ally', blockerRoot: earliest.entry.root });
      }
    }

    // Player collision remains solid, but only when vertical spans can meet.
    const player = this._ctx?.player;
    const playerVerticalOverlap = profile.movementLayer === 'ground'
      || Math.abs(py - (player?.position?.y || 1.7)) <= halfHeight + 0.9;
    if (player?.position && playerVerticalOverlap) {
      const sumRadius = radius + 0.6;
      const startDistance = Math.hypot(startX - player.position.x, startZ - player.position.z);
      const endDistance = Math.hypot(px - player.position.x, pz - player.position.z);
      const movingOutOfExistingContact = startDistance <= sumRadius + 0.02 && endDistance > startDistance + 1e-5;
      const hitT = movingOutOfExistingContact
        ? null
        : firstCircleSweepT(startX, startZ, px, pz, player.position.x, player.position.z, sumRadius);
      if (hitT != null) {
        const moveLength = Math.hypot(px - startX, pz - startZ) || 1;
        const safeT = Math.max(0, hitT - 0.02 / moveLength);
        px = startX + (px - startX) * safeT;
        pz = startZ + (pz - startZ) * safeT;
        result.blockedBy = 'player';
        const awayX = px - player.position.x;
        const awayZ = pz - player.position.z;
        const awayLength = Math.hypot(awayX, awayZ) || 1;
        const nx = awayX / awayLength;
        const nz = awayZ / awayLength;
        if (this._ctx?.applyPlayerKnockback) {
          this._tmp.v3.set(-nx * 0.18, 0, -nz * 0.18);
          this._ctx.applyPlayerKnockback(this._tmp.v3);
        }
        const inst = this.instanceByRoot?.get(enemy);
        if (inst instanceof RusherEnemy && inst._charging) {
          if (!inst._hasDealtHit && inst._hitCooldown <= 0) {
            this._ctx?.damagePlayer?.(20, { sourceKind: 'rusher_charge', sourceRoot: enemy, ownerRoot: enemy });
            inst._hitCooldown = 0.8;
            inst._hasDealtHit = true;
          }
          inst._charging = false;
          inst._dashTimer = 0;
          inst._recoverTimer = 0.5 + this.rng() * 0.3;
        }
      }
    }

    if (profile.movementLayer === 'ground') {
      const afterGround = this._groundHeightAt(px, pz);
      const rise = Math.max(0, afterGround - beforeGround);
      const stepUpMax = 0.12 * profile.collisionHeight;
      const jumpAssistMax = 0.30 * profile.collisionHeight;
      const desiredY = afterGround + profile.groundOffset;
      if (rise > 0) {
        const maxLift = rise <= stepUpMax + 1e-3 ? stepUpMax : (rise <= jumpAssistMax + 1e-3 ? jumpAssistMax : 0);
        if (maxLift > 0) py += Math.max(0, Math.min(desiredY - py, maxLift));
      } else {
        py = desiredY;
      }
    }

    enemy.position.set(px, py, pz);
    result.appliedDistance = Math.hypot(px - startX, pz - startZ);
    if (result.blockedBy === 'world') this._emitAIEvent(enemy, 'movement_blocked', { blockedBy: 'world' });
    return result;
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
    } catch (e) { logError(e); }
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
    const r = radius;
    const selfProfile = this._profileForRoot(selfRoot);
    const selfBody = selfRoot || { position };
    this._ensureSpatialIndex();
    const nearby = this.spatialIndex.queryRadius(position, r, {
      excludeRoot: selfRoot,
      verticalRadius: Math.max(2, selfProfile.collisionHeight),
      out: this._neighborScratch
    });
    for (const entry of nearby) {
      const other = entry.root;
      if (!verticalSpansOverlap(selfBody, selfProfile, other, entry.profile)) continue;
      const dx = other.position.x - position.x;
      const dz = other.position.z - position.z;
      const d2 = dx*dx + dz*dz;
      if (d2 <= 1e-8) {
        // Exact overlap used to return no steering, leaving aircraft permanently
        // interlocked. Stable per-root ordering gives the pair opposite escape
        // vectors without random jitter or an all-enemy scan.
        const selfKey = selfRoot || selfBody;
        let selfOrder = this._separationOrder.get(selfKey);
        if (!selfOrder) {
          selfOrder = this._nextSeparationOrder++;
          this._separationOrder.set(selfKey, selfOrder);
        }
        let otherOrder = this._separationOrder.get(other);
        if (!otherOrder) {
          otherOrder = this._nextSeparationOrder++;
          this._separationOrder.set(other, otherOrder);
        }
        const low = Math.min(selfOrder, otherOrder);
        const high = Math.max(selfOrder, otherOrder);
        const angle = ((low * 0.754877666 + high * 0.569840296) % 1) * Math.PI * 2;
        const sign = selfOrder < otherOrder ? -1 : 1;
        sep.x += Math.cos(angle) * sign;
        sep.z += Math.sin(angle) * sign;
        continue;
      }
      const d = Math.sqrt(d2);
      const k = (r - d) / (r * d);
      sep.x -= dx * k; sep.z -= dz * k;
    }
    return sep.clone(); // callers sometimes mutate; return a copy to be safe
  }  

  // Factories
  _createInstance(type, spawnPos) {
    const cfg = this.typeConfig[type] || this.typeConfig.grunt;
    const args = { THREE: this.THREE, mats: this.mats, cfg, spawnPos, enemyManager: this, arenaRadius: this.arenaRadius, rng: this.rng };
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
    const range = (this.arenaRadius !== Infinity) ? this.arenaRadius * 0.8 : ARENA_RADIUS * 0.75;
    const selected = this._chooseSpawnPosForType(type);
    if (!selected && this.encounterHooks?.authoredOnly) return null;
    const p = selected || new this.THREE.Vector3((this.rng()*range*2 - range)|0, 0.8, (this.rng()*range*2 - range)|0);
    // Do not increment alive here; startWave already accounted for it
    const root = this.spawnAt(type, p, { countsTowardAlive: false });
    // Unlike prewarm/tutorial helpers, delayed wave spawns consume a count
    // reserved by startWave and must decrement it when removed.
    if (root) {
      this._nonWaveEnemies.delete(root);
      const authored = this._lastSpawnCandidate;
      if (authored?.facing) {
        const [fx, , fz] = authored.facing;
        root.rotation.y = Math.atan2(fx, fz);
        root.userData.spawnEntrance = authored.entranceId || null;
      }
    }
    return root;
  }

  _specialWaveRole(type) {
    if (type === 'flyer' || type === 'flyer_swarm') return 'flyer';
    if (type === 'swarm_warden' || type === 'warden') return 'warden';
    return type;
  }

  _specialWaveRoleCount(type) {
    const role = this._specialWaveRole(type);
    let count = 0;
    for (const root of this.enemies) {
      if (this._specialWaveRole(root?.userData?.type) === role) count++;
    }
    return count;
  }

  _canSpawnSpecialWaveType(type) {
    const state = this.specialWaveState;
    if (!state?.active) return true;
    if (this.enemies.size >= state.definition.activeCap) return false;
    const role = this._specialWaveRole(type);
    const roleCap = state.definition.roleCaps[role];
    return !roleCap || this._specialWaveRoleCount(role) < roleCap;
  }

  _emitSpecialWave(type, data = {}) {
    try {
      this.onSpecialWave?.({
        type,
        wave: this.wave,
        encounter: this.specialWaveState?.definition?.id || null,
        ...data
      });
    } catch (e) { logError(e); }
  }

  _dropSpecialWaveSupplies(packageNumber) {
    if (!this.pickups?.dropMultiple) return;
    const ammoPosition = new this.THREE.Vector3(4.2, 0, 0.4);
    const medPosition = new this.THREE.Vector3(-4.2, 0, 0.4);
    this.pickups.dropMultiple('ammo', ammoPosition, packageNumber === 1 ? 2 : 3);
    if (packageNumber === 1 || packageNumber % 2 === 0) {
      this.pickups.dropMultiple('med', medPosition, 1);
    }
  }

  _commitSpecialWavePackage(packageIndex) {
    const state = this.specialWaveState;
    if (!state?.active || packageIndex >= state.definition.packageCount) return false;
    const roster = packageIndex === 0
      ? state.definition.initialRoster
      : state.definition.reinforcementRoster;
    const types = expandWaveRoster(roster);
    const packageState = {
      index: packageIndex,
      size: types.length,
      kills: 0,
      threshold: Math.ceil(types.length * state.definition.clearFractionPerSurge)
    };
    state.packages[packageIndex] = packageState;
    state.packagesCommitted = packageIndex + 1;
    state.lastCommitAt = this._aiClock;
    state.pendingSurgeAt = null;
    state.committedTotal += types.length;
    for (const type of types) state.reserve.push({ type, packageIndex });

    this.alive += types.length;
    if (packageIndex === 0) {
      this.waveStartingAlive = types.length;
      if (this.onWave) this.onWave(this.wave, types.length, types);
    } else {
      this.waveStartingAlive = Math.max(0, this.waveStartingAlive || 0) + types.length;
    }
    if (this.onRemaining) this.onRemaining(this.alive);
    this._dropSpecialWaveSupplies(packageIndex + 1);
    this._emitSpecialWave(packageIndex === 0 ? 'start' : 'surge', {
      surge: packageIndex + 1,
      totalSurges: state.definition.packageCount,
      packageSize: types.length,
      committedTotal: state.committedTotal
    });
    return true;
  }

  _startSpecialWave(definition) {
    this.specialWaveState = {
      active: true,
      definition,
      packages: [],
      packagesCommitted: 0,
      committedTotal: 0,
      reserve: [],
      spawnCooldown: 0,
      pendingSurgeAt: null,
      lastCommitAt: this._aiClock
    };
    this._commitSpecialWavePackage(0);
  }

  _recordSpecialWaveRemoval(root) {
    const state = this.specialWaveState;
    const packageIndex = root?.userData?.specialWavePackageIndex;
    if (!state?.active || !Number.isInteger(packageIndex)) return;
    const packageState = state.packages[packageIndex];
    if (packageState) packageState.kills++;
  }

  _updateSpecialWave(dt) {
    const state = this.specialWaveState;
    if (!state?.active) return;
    const definition = state.definition;
    state.spawnCooldown = Math.max(0, state.spawnCooldown - dt);

    let spawnBudget = 2;
    while (spawnBudget > 0 && state.spawnCooldown <= 0 && state.reserve.length) {
      if (this.enemies.size >= definition.activeCap) break;
      const reserveIndex = state.reserve.findIndex(item => this._canSpawnSpecialWaveType(item.type));
      if (reserveIndex < 0) break;
      const [item] = state.reserve.splice(reserveIndex, 1);
      const root = this.spawn(item.type);
      if (!root) {
        state.reserve.unshift(item);
        state.spawnCooldown = definition.spawnIntervalSeconds * 2;
        break;
      }
      root.userData.specialWavePackageIndex = item.packageIndex;
      state.spawnCooldown += definition.spawnIntervalSeconds;
      spawnBudget--;
    }

    if (state.packagesCommitted >= definition.packageCount) return;
    const latestPackage = state.packages[state.packagesCommitted - 1];
    if (!latestPackage || latestPackage.kills < latestPackage.threshold) return;

    const intervalReadyAt = state.lastCommitAt + definition.minimumSurgeIntervalSeconds;
    if (state.pendingSurgeAt == null && this._aiClock >= intervalReadyAt) {
      state.pendingSurgeAt = this._aiClock + definition.surgeWarningSeconds;
      this._emitSpecialWave('surge-warning', {
        surge: state.packagesCommitted + 1,
        totalSurges: definition.packageCount,
        warningSeconds: definition.surgeWarningSeconds
      });
    }
    if (state.pendingSurgeAt != null && this._aiClock >= state.pendingSurgeAt) {
      this._commitSpecialWavePackage(state.packagesCommitted);
    }
  }

  _specialWaveBlocksCompletion() {
    const state = this.specialWaveState;
    if (!state?.active) return false;
    return state.packagesCommitted < state.definition.packageCount || state.reserve.length > 0;
  }

  _finishSpecialWave() {
    const state = this.specialWaveState;
    if (!state?.active) return;
    const data = {
      encounter: state.definition.id,
      surge: state.packagesCommitted,
      totalSurges: state.definition.packageCount,
      committedTotal: state.committedTotal
    };
    state.active = false;
    this.specialWaveState = null;
    this._emitSpecialWave('complete', data);
  }

  queueAuthoredEnemies(types = [], { initial = false } = {}) {
    if (!Array.isArray(types) || !types.length) return 0;
    const wave = this.wave;
    for (const type of types) this._authoredSpawnQueue.push({ type, wave });
    this.alive += types.length;
    this.waveStartingAlive = initial
      ? types.length
      : Math.max(0, this.waveStartingAlive || 0) + types.length;
    if (this.onRemaining) this.onRemaining(this.alive);
    return types.length;
  }

  _updateAuthoredSpawnQueue(dt) {
    if (!this._authoredSpawnQueue.length) return;
    this._authoredSpawnCooldown = Math.max(0, this._authoredSpawnCooldown - dt);
    if (this._authoredSpawnCooldown > 0) return;
    let budget = 2;
    while (budget-- > 0 && this._authoredSpawnQueue.length) {
      const item = this._authoredSpawnQueue[0];
      if (item.wave !== this.wave) {
        this._authoredSpawnQueue.shift();
        this.alive = Math.max(0, this.alive - 1);
        continue;
      }
      const root = this.spawn(item.type);
      if (!root) {
        // Authored levels never escape to random coordinates. Keeping the
        // reserved alive count makes wave completion wait for this retry.
        this._authoredSpawnCooldown = 0.28;
        break;
      }
      this._authoredSpawnQueue.shift();
      this._authoredSpawnCooldown = 0.16;
    }
  }

  tryAdvanceWave() {
    if (this.suspendWaves || this._advancingWave) return false;
    const bossActive = !!(this.bossManager?.active && this.bossManager?.boss);
    if (this.alive > 0 || bossActive || Hydraclone.hasPending()) return false;
    if (this._authoredSpawnQueue.length || this._specialWaveBlocksCompletion()) return false;
    if (this.encounterHooks?.canCompleteWave?.(this.wave) === false) return false;
    if (this.specialWaveState?.active) this._finishSpecialWave();
    this._advancingWave = true;
    this.wave++;
    this.startWave();
    this._advancingWave = false;
    return true;
  }

  startWave() {
    if (this.suspendWaves) return; // disabled in test harness
    const spawnEpoch = ++this._waveSpawnEpoch;
    const scheduledWave = this.wave;
    const authoredWave = this.encounterHooks?.getWaveDefinition?.(this.wave);
    if (authoredWave) {
      if (authoredWave.boss) {
        const started = this.bossManager.startBoss(this.wave);
        if (started) {
          if (this.onWave) this.onWave(this.wave, 1, ['boss_broodmaker']);
          return;
        }
      }
      const initialTypes = [...(authoredWave.packages?.[0] || [])];
      this.queueAuthoredEnemies(initialTypes, { initial: true });
      if (this.onWave) this.onWave(this.wave, initialTypes.length, initialTypes);
      return;
    }
    const specialDefinition = getSpecialWaveDefinition(this.wave);
    if (specialDefinition) {
      this._startSpecialWave(specialDefinition);
      return;
    }
    if (this.obstacleManager && this.wave % 5 === 0) {
      const player = this.getPlayer();
      try { this.obstacleManager.respawnMissing(player.position.clone(), this.enemies); } catch (e) { logError(e); }
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
    if (this.onWave) this.onWave(this.wave, count, types);
    if (this.onRemaining) this.onRemaining(this.alive);

    for (let i = 0; i < types.length; i++) {
      const delay = 200 + this.rng() * 200;
      setTimeout(() => {
        if (spawnEpoch !== this._waveSpawnEpoch || this.wave !== scheduledWave) return;
        this.spawn(types[i]);
      }, i * delay);
    }
  }

  reset({ wave = 1 } = {}) {
    this._waveSpawnEpoch++;
    if (this.specialWaveState?.active) this._emitSpecialWave('cancel');
    this.specialWaveState = null;
    this._authoredSpawnQueue.length = 0;
    this._authoredSpawnCooldown = 0;
    for (const e of this.enemies) this.scene.remove(e);
    this.enemies.clear();
    this.instances.clear();
    this._detailScanQueue.length = 0;
    this._nonWaveEnemies = new WeakSet();
    this.spatialIndex.clear();
    this.perception.clear();
    this._senseCache = new WeakMap();
    this._allyBypass = new WeakMap();
    this._airAttackReservations.clear();
    const requestedWave = Math.floor(Number(wave));
    this.wave = Number.isFinite(requestedWave) ? Math.max(1, requestedWave) : 1;
    this.alive = 0;
    if (this.bossManager) this.bossManager.reset();
    this.clearProjectiles();
    for (const h of this._healSprites) { if (h?.sprite) this.scene.remove(h.sprite); }
    this._healSprites.length = 0;
    if (!this.suspendWaves) this.startWave();
  }

  tickAI(playerObject, dt, onPlayerDamage) {
    // lazy init (kept)
    if (!this._ctx) {
      this._healReg = new Map();
      this._ctx = {
        player: null, objects: this.objects, scene: this.scene, onPlayerDamage: null,
        enemyManager: this,
        rng: this.rng,
        _spawnBullet: (kind, origin, velocity, maxLife, damage, ownerRoot, ownerRootOverride) =>
          this._spawnBullet(kind, origin, velocity, maxLife, damage, ownerRoot, ownerRootOverride),
        separation: (position, radius, selfRoot) => this.separation(position, radius, selfRoot),
        avoidObstacles: (origin, desiredDir, maxDist) => this._avoidObstacles(origin, desiredDir, maxDist),
        moveWithCollisions: (enemy, step) => this._moveWithCollisions(enemy, step),
        alliesNearbyCount: (position, radius = 8.0, selfRoot = null) =>
          this.nearbyAllies(position, radius, selfRoot).length,
        nearbyAllies: (position, radius = 8.0, selfRoot = null, options = {}) =>
          this.nearbyAllies(position, radius, selfRoot, options),
        sensePlayer: (root, senseDt, origin = null) => this._sensePlayer(root, senseDt, origin),
        tacticalLineClear: (root, origin, target, padding = 0.04) =>
          this._tacticalLineClear(root, origin, target, padding),
        locomotionClear: (root, target) => this._locomotionCorridorClear(root, target),
        positionClear: (root, position, ignoreRoot = null) => this._positionClearForRoot(root, position, ignoreRoot),
        chargeCorridorClear: (root, target, padding = 0.15) => this._isChargeCorridorClear(root, target, padding),
        reserveAirAttack: (root, ownerRoot = null, options = {}) => this._reserveAirAttack(root, ownerRoot, options),
        releaseAirAttack: root => this._releaseAirAttack(root),
        setAIState: (root, state, data = null) => this._setAIState(root, state, data),
        emitAIEvent: (root, type, data = {}) => this._emitAIEvent(root, type, data),
        // heal aggregator
        proposeHeal: (targetRoot, amount, metadata = {}) => {
          if (!targetRoot || !amount || amount <= 0) return;
          const prev = this._healReg.get(targetRoot);
          if (!prev || amount > prev.amount) this._healReg.set(targetRoot, { amount, metadata });
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
    // Discover optional retrofit ornaments incrementally. Keeping this out of
    // spawnAt avoids a hierarchy walk during large wave spawn bursts.
    for (let scanBudget = 0; scanBudget < 2 && this._detailScanQueue.length; scanBudget++) {
      const root = this._detailScanQueue.shift();
      if (!this.enemies.has(root) || typeof root?.traverse !== 'function') continue;
      const details = [];
      root.traverse(node => { if (node?.userData?.performanceDetail) details.push(node); });
      root.userData.performanceDetails = details;
      root.userData.performanceDetailVisible = true;
    }
  
    this._aiClock += dt;
    this._updateAuthoredSpawnQueue(dt);
    this._updateSpecialWave(dt);
  
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
    ctx.damagePlayer = (amount, metadata = {}) => {
      const sourceKind = metadata.sourceKind || metadata.source || 'enemy';
      const sourceRoot = metadata.sourceRoot || null;
      const ownerRoot = metadata.ownerRoot
        || sourceRoot?.userData?.bossOwnerRoot
        || sourceRoot?.userData?.summonerRoot
        || sourceRoot;
      this._emitAIEvent(sourceRoot, 'player_damaged', { amount, sourceKind, ownerRoot });
      onPlayerDamage?.(amount, sourceKind, { ...metadata, sourceKind, sourceRoot, ownerRoot });
    };
    ctx.onPlayerDamage = (amount, source = 'enemy', metadata = {}) =>
      ctx.damagePlayer(amount, { ...metadata, sourceKind: source, sourceRoot: metadata.sourceRoot || null });
    ctx.pickups = this.pickups;

    // 3) One-time helper wiring (from main). Create once.
    if (!ctx._spawnBullet) {
      ctx._spawnBullet = (kind, origin, velocity, maxLife, damage, ownerRoot, ownerRootOverride) =>
        this._spawnBullet(kind, origin, velocity, maxLife, damage, ownerRoot, ownerRootOverride);
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
    if (!ctx.reserveAirAttack) {
      ctx.reserveAirAttack = (root, ownerRoot = null, options = {}) =>
        this._reserveAirAttack(root, ownerRoot, options);
    }
    if (!ctx.releaseAirAttack) {
      ctx.releaseAirAttack = root => this._releaseAirAttack(root);
    }
    if (!ctx.applyKnockback) {
      ctx.applyKnockback = (enemy, vec) => this.applyKnockback(enemy, vec);
    }
    if (!ctx.applyPlayerKnockback) {
      ctx.applyPlayerKnockback = (vec) => playerObject?.applyKnockback?.(vec);
    }
    if (!ctx.pathfind) {
      ctx.pathfind = {
        recomputeIfStale: (enemy, goal, options = {}) => pathRecompute(enemy, goal, this.objectBBs, {
          cacheFor: options.cacheFor ?? 4.5,
          radius: options.searchRadius ?? 20,
          agentRadius: this._profileForRoot(enemy?.root || enemy).collisionRadius
        }),
        nextWaypoint: (enemy) => pathNext(enemy),
        clear: (enemy) => pathClear(enemy)
      };
    }
    if (!ctx.alliesNearbyCount) {
      // Count allies within a radius around a position, excluding an optional self root
      ctx.alliesNearbyCount = (position, radius = 8.0, selfRoot = null) =>
        this.nearbyAllies(position, radius, selfRoot).length;
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
      ctx.sniperFired = () => {
        this._sniperLastFireAt = this._aiClock;
        if (ctx.blackboard) ctx.blackboard.sniperLastFireAt = this._aiClock;
      };
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
    this._rebuildSpatialIndex();
    const playerPos = ctx.player && ctx.player.position ? ctx.player.position : null;
    let i = 0;
    for (const inst of this.instances) {
      // BossManager owns the active boss update. Keeping the same instance in
      // the generic external-enemy loop is useful for hit detection and
      // lifecycle bookkeeping, but updating it here a second time accelerates
      // every boss state machine, telegraph, projectile, and cooldown.
      if (bossActive && inst === this.bossManager.boss) continue;
      i++;
      if ((inst?.root?.userData?.stunnedUntil || 0) > this._aiClock) continue;
      if (!playerPos || !inst || !inst.root || !inst.root.position) { inst.update(dt, ctx); continue; }
      const dx = inst.root.position.x - playerPos.x;
      const dz = inst.root.position.z - playerPos.z;
      const d2 = dx*dx + dz*dz;
      const detailNodes = inst.root.userData?.performanceDetails;
      if (detailNodes?.length && ((i + this._aiFrame) % 6) === 0) {
        const detailVisible = inst.root.userData.performanceDetailVisible !== false;
        const nextVisible = detailVisible ? d2 <= 18*18 : d2 < 15*15;
        if (nextVisible !== detailVisible) {
          inst.root.userData.performanceDetailVisible = nextVisible;
          for (const detail of detailNodes) detail.visible = nextVisible;
        }
      }
      if (d2 > (25*25)) {
        if (((i + this._aiFrame) % 3) !== 0) continue;
        inst.update(dt * 3, ctx);
      } else {
        inst.update(dt, ctx);
      }
    }
  
    // bullets
    try { this._updateBulletPools(dt, ctx); } catch (e) { logError(e); }
  
    // ambient vocals
    if (this.alive > 0) {
      this._lastAmbientVocalAt = (this._lastAmbientVocalAt || 0);
      if (this._aiClock - this._lastAmbientVocalAt > 2.2 + this.rng() * 2.0) {
        const pick = (() => { for (const e of this.instances) return e; return null; })();
        if (pick && window && window._SFX && typeof window._SFX.enemyVocal === 'function') {
          try { window._SFX.enemyVocal(pick.root?.userData?.type || 'grunt'); } catch (e) { logError(e); }
        }
        this._lastAmbientVocalAt = this._aiClock;
      }
    }
  
    // apply heals with budget
    if (this._healReg.size) {
      let vfxBudget = 6;
      for (const [root, proposal] of this._healReg.entries()) {
        if (!root || !root.userData) continue;
        const maxHp = root.userData.maxHp || root.userData.hp;
        if (maxHp == null) continue;
        const proposedAmount = typeof proposal === 'number' ? proposal : proposal.amount;
        const metadata = typeof proposal === 'number' ? {} : (proposal.metadata || {});
        const behaviorId = root.userData.behaviorId || resolveBehaviorId(root.userData.type);
        const heal = behaviorId === 'rusher_elite' ? proposedAmount * 0.5 : proposedAmount;
        const beforeHp = root.userData.hp || 0;
        root.userData.hp = Math.min(maxHp, beforeHp + heal);
        const effectiveAmount = Math.max(0, root.userData.hp - beforeHp);
        const sourceRoot = metadata.sourceRoot || null;
        this._emitAIEvent(sourceRoot, 'heal_applied', {
          targetRoot: root,
          attemptedAmount: proposedAmount,
          effectiveAmount
        });
        if (effectiveAmount > 0 && vfxBudget > 0) {
          const lastAt = this._lastHealVfxAt.get(root) || -Infinity;
          if ((this._aiClock - lastAt) >= this._healVfxCooldown) {
            this._lastHealVfxAt.set(root, this._aiClock);
            const count = Math.max(1, Math.min(4, Math.round(effectiveAmount * 0.15)));
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
      spr.position.set(pos.x + (this.rng()-0.5)*0.6, pos.y + 1.2 + this.rng()*0.3, pos.z + (this.rng()-0.5)*0.6);
      const s = 0.25 + this.rng()*0.1; spr.scale.set(s, s, 1);
      this.scene.add(spr);
      const vel = new THREE.Vector3((this.rng()-0.5)*0.2, 0.9 + this.rng()*0.35, (this.rng()-0.5)*0.2);
      this._healSprites.push({ sprite: spr, velocity: vel, life: 0, maxLife: 0.7 + this.rng()*0.3, rootRef: targetRoot });
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

  isLastWaveEnemy(enemyRoot) {
    if (!this.enemies.has(enemyRoot) || this._nonWaveEnemies.has(enemyRoot) || this.alive !== 1) return false;
    if (this.specialWaveState?.active && this._specialWaveBlocksCompletion()) return false;
    return true;
  }

  remove(enemyRoot) {
    if (!this.enemies.has(enemyRoot)) return;
    const countsTowardWave = !this._nonWaveEnemies.has(enemyRoot);
    this._nonWaveEnemies.delete(enemyRoot);
  
    this.enemies.delete(enemyRoot);
    this.perception.clear(enemyRoot);
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
  
    if (countsTowardWave) {
      this.alive = Math.max(0, this.alive - 1);
      this._recordSpecialWaveRemoval(enemyRoot);
      if (this.onRemaining) this.onRemaining(this.alive);
    }
  
    if (this.bossManager?.handleEnemyRemoved) this.bossManager.handleEnemyRemoved(enemyRoot);
    else if (this.bossManager && this.bossManager.active && this.bossManager.boss && enemyRoot === this.bossManager.boss.root) {
      this.bossManager._onBossDeath();
    }
  
    const bossActive = !!(this.bossManager && this.bossManager.active && this.bossManager.boss);
    if (countsTowardWave && !this.suspendWaves) {
      if (this.specialWaveState?.active) {
        if (this._specialWaveBlocksCompletion() || this.alive > 0) return;
        this._finishSpecialWave();
      }
      if (this.alive <= 0 && !bossActive) this.tryAdvanceWave();
    }
  }

  // --- Boss integration helpers ---

  registerExternalEnemy(instance, { countsTowardAlive = true, preserveParent = false } = {}) {
    const behaviorId = resolveBehaviorId(instance?.behaviorId || instance?.root?.userData?.behaviorId || instance?.root?.userData?.type);
    instance.behaviorId = behaviorId;
    if (instance.root?.userData) instance.root.userData.behaviorId = behaviorId;
    // Some targetable boss components are authored as mounted children. Keep
    // that hierarchy intact so registering them cannot change their transform.
    if (!preserveParent || !instance.root?.parent) this.scene.add(instance.root);
    this.enemies.add(instance.root);
    this.instances.add(instance);
    this.instanceByRoot.set(instance.root, instance);
    this._detailScanQueue.push(instance.root);
  
    if (!this._rootIndex) this._rootIndex = new WeakMap();
    this._rootIndex.set(instance.root, this._enemyRootsArr.length);
    this._enemyRootsArr.push(instance.root);

    if (countsTowardAlive) this._nonWaveEnemies.delete(instance.root);
    else this._nonWaveEnemies.add(instance.root);
  
    if (countsTowardAlive) {
      this.alive++;
      if (this.onRemaining) this.onRemaining(this.alive);
    }
    return instance.root;
  }
  
  spawnAt(type, position, { countsTowardAlive = true } = {}) {
    if (countsTowardAlive && !this._canSpawnSpecialWaveType(type)) return null;
    const inst = this._createInstance(type, position);
    const behaviorId = resolveBehaviorId(type);
    inst.behaviorId = behaviorId;
    if (type === 'gruntling') {
      inst.root.userData.hp = 10 + Math.floor(this.rng() * 21); // 10–30
    }
    if (inst && inst.root && inst.root.userData) {
      inst.root.userData.behaviorId = behaviorId;
      inst.root.userData.aiState = inst.root.userData.aiState || 'idle';
      if (inst.root.userData.maxHp == null && inst.root.userData.hp != null) inst.root.userData.maxHp = inst.root.userData.hp;
    }
    this.scene.add(inst.root);
    this.enemies.add(inst.root);
    this.instances.add(inst);
    this.instanceByRoot.set(inst.root, inst);
    const knownPlayer = this.getPlayer?.();
    if (knownPlayer?.position) this.perception.seed(inst.root, knownPlayer.position, this._aiClock);
    this._detailScanQueue.push(inst.root);
  
    if (!this._rootIndex) this._rootIndex = new WeakMap();
    this._rootIndex.set(inst.root, this._enemyRootsArr.length);
    this._enemyRootsArr.push(inst.root);

    if (countsTowardAlive) this._nonWaveEnemies.delete(inst.root);
    else this._nonWaveEnemies.add(inst.root);
  
    if (countsTowardAlive) {
      this.alive++;
      if (this.specialWaveState?.active) {
        this.waveStartingAlive = Math.max(0, this.waveStartingAlive || 0) + 1;
      }
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
          const idx = (this.rng() * total) | 0;
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
      if (this.rng() < 0.15) {
        const j = (this.rng() * (i + 1)) | 0;
        [types[i], types[j]] = [types[j], types[i]];
      }
    }
    return types;
  }
}

function segmentIntersectsExpandedAabbXZ(start, end, box, padding = 0) {
  let tMin = 0;
  let tMax = 1;
  const axes = [
    ['x', box.min.x - padding, box.max.x + padding],
    ['z', box.min.z - padding, box.max.z + padding]
  ];
  for (const [axis, min, max] of axes) {
    const origin = start[axis];
    const delta = end[axis] - origin;
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let near = (min - origin) / delta;
    let far = (max - origin) / delta;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }
  return tMax >= 0 && tMin <= 1;
}

function firstCircleSweepT(startX, startZ, endX, endZ, centerX, centerZ, radius) {
  const vx = endX - startX;
  const vz = endZ - startZ;
  const fx = startX - centerX;
  const fz = startZ - centerZ;
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0;
  const a = vx * vx + vz * vz;
  if (a <= 1e-10) return null;
  const b = 2 * (fx * vx + fz * vz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  const t1 = (-b + root) / (2 * a);
  return t1 >= 0 && t1 <= 1 ? t1 : null;
}
