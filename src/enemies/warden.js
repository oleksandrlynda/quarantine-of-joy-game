// Swarm Warden (Heavy Flyer) — logic
// Spawns/recalls a personal swarm of 10–15 FlyerEnemy minions and regenerates them over time.
// Expects EnemyManager.spawnAt('flyer', pos, { countsTowardAlive: true }) to yield a FlyerEnemy instance.
// Asset used: createSwarmWarden({ THREE, mats, scale, palette })
//
import { logError } from '../util/log.js';
// Fairness:
// - No spawns inside player safe radius
// - Trickle respawn (>=0.28s) from belly bays; respects arena clamp
// - Cleans up remaining minions on death

import { createEnhancedSwarmWarden } from '../assets/enemy-retrofits.js';
import { cloneNodeMaterial, instantiateSharedTemplate } from './render-template.js';

const _wardenTemplates = new WeakMap();

export class SwarmWarden {
  constructor({ THREE, mats, cfg, spawnPos, enemyManager, arenaRadius, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    // Visual/asset
    const scale = cfg?.scale || 1.0;
    let templatesForThree = _wardenTemplates.get(THREE);
    if (!templatesForThree) {
      templatesForThree = new Map();
      _wardenTemplates.set(THREE, templatesForThree);
    }
    const built = instantiateSharedTemplate(
      templatesForThree,
      scale,
      () => createEnhancedSwarmWarden({ THREE, mats, scale })
    );
    this.root = built.root;
    this.refs = built.refs || {};
    const head = built.head;

    // These materials are animated per Warden; geometry and all static materials
    // remain shared with the cached template.
    cloneNodeMaterial(head);
    cloneNodeMaterial(this.refs.core);
    cloneNodeMaterial(this.refs.recallRing);
    for (const glow of (this.refs.thrusterGlows || [])) cloneNodeMaterial(glow);

    this.root.position.copy(spawnPos);
    const hp = (cfg && typeof cfg.hp === 'number') ? cfg.hp : 420;
    this.root.userData = { type: 'swarm_warden', head, hp, maxHp: hp };

    // Motion (hover + strafe orbit)
    this.speed = 1.9;
    this.cruiseAltitude = 25.5 + this.rng() * 1.2; // higher than flyers
    this._t = 0;
    this._yaw = 0; this._pitch = 0; this._roll = 0; this._desiredRoll = 0;
    // Start near cruising height immediately so it doesn't skim the ground on spawn
    this.root.position.y = this.cruiseAltitude - 0.3;
    this._lastPos = this.root.position.clone();
    this._lastMoveDistance = 0;
    const authoredArenaRadius = enemyManager?.encounterHooks?.getArenaRadius?.();
    const effectiveArenaRadius = Number.isFinite(authoredArenaRadius)
      ? Math.min(authoredArenaRadius, Number.isFinite(arenaRadius) ? arenaRadius : authoredArenaRadius)
      : arenaRadius;
    this._arenaClamp = Number.isFinite(effectiveArenaRadius) ? Math.max(8, effectiveArenaRadius - 1) : 39;
    this._outerAnchor = null;
    this._anchorGrace = 0;

    // Wing anim state
    this._wingPhase = this.rng() * Math.PI * 2;
    this._wingSpeed = 5.2;   // flaps/sec (carrier: slower than gnats)
    this._wingAmp   = 0.26;  // radians

    // Swarm management
    this.desiredMin = cfg?.swarmMin ?? 10;
    this.desiredMax = cfg?.swarmMax ?? 15;
    this.targetCount = Math.floor(this.desiredMin + this.rng() * (this.desiredMax - this.desiredMin + 1));
    this.safeRadius = 2.25;                 // no spawns inside this radius around player
    this.trickleBase = 0.28;                // min interval between spawns
    this._regenCd = 0;                      // time until next trickle spawn
    this._regenQueue = 0;                   // how many to spawn
    this._bayIndex = 0;                     // cycle through bay muzzles
    this._children = new Set();             // Set<THREE.Object3D root>
    this._anchorByChild = new Map();        // root -> Object3D anchor
    this._flyScale = cfg?.flyScale ?? 0.85; // visual shrink for minions

    // Recall burst (purely visual + gentle tug)
    this._recallTime = 0;                   // active recall visual timer
    this._recallCd = 0;                     // min delay between recall events
    this._recallDur = 0.9;

    // Misc helpers
    this._raycaster = new THREE.Raycaster();
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------
  onRemoved(scene) {
    // Clean up remaining minions when carrier dies
    if (this.enemyManager && this.enemyManager.enemies) {
      for (const r of Array.from(this._children)) {
        try {
          if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
        } catch (e) { logError(e); }
      }
    }
    this._children.clear();
    this._anchorByChild.clear();
  }

  // ----------------------------------------------------------------------------
  // Update
  // ----------------------------------------------------------------------------
  update(dt, ctx) {
    // keep altitude + hover
    this._t += dt;
    this._updateMovement(dt, ctx);
    this._updateThrusters(dt);
    this._updateRecallVisuals(dt);

    // swarm lifecycle
    this._maintainRoster(dt, ctx);
  }

  // ----------------------------------------------------------------------------
  // Movement: persistent navigable anchor on the arena's outer ring.
  // ----------------------------------------------------------------------------
  _updateMovement(dt, ctx) {
    const e = this.root;
    const player = ctx.player.position.clone();

    // altitude hold
    const targetAlt = this.cruiseAltitude + Math.sin(this._t * 1.6) * 0.15;
    e.position.y += (targetAlt - e.position.y) * Math.min(1, dt * 4.5);

    const playerDistance = Math.hypot(player.x - e.position.x, player.z - e.position.z);
    this._anchorGrace += dt;
    const anchorCompromised = this._outerAnchor
      && Math.hypot(player.x - this._outerAnchor.x, player.z - this._outerAnchor.z) < 20;
    if (!this._outerAnchor || (this._anchorGrace > 1.5 && (playerDistance < 18 || anchorCompromised))) {
      this._outerAnchor = this._chooseOuterAnchor(player, ctx);
      this._anchorGrace = 0;
      ctx.emitAIEvent?.(e, 'warden_anchor_selected', { anchor: this._outerAnchor?.clone?.() || this._outerAnchor });
    }

    const desired = this._outerAnchor
      ? this._outerAnchor.clone().sub(e.position).setY(0)
      : new this.THREE.Vector3(e.position.x - player.x, 0, e.position.z - player.z);
    const retreating = playerDistance < 18;
    if (retreating) {
      const away = new this.THREE.Vector3(e.position.x - player.x, 0, e.position.z - player.z);
      if (away.lengthSq() > 0) desired.add(away.normalize().multiplyScalar(1.8));
    }
    if (desired.lengthSq() > 0.01) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * (retreating ? 1.35 : 1) * dt);
      const move = ctx.moveWithCollisions?.(e, step);
      if (move?.blockedBy) ctx.emitAIEvent?.(e, 'warden_route_blocked', move);
    }
    ctx.setAIState?.(e, retreating ? 'outer_ring_retreat' : 'outer_ring_anchor', {
      playerDistance,
      selectedAnchor: this._outerAnchor
    });

    // clamp inside
    e.position.x = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.x));
    e.position.z = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.z));

    // body orientation smoothing
    const moved = e.position.clone().sub(this._lastPos);
    if (moved.lengthSq() > 0.00004) {
      const yaw = Math.atan2(moved.x, moved.z);
      const horiz = new this.THREE.Vector3(moved.x, 0, moved.z);
      const pitch = -Math.atan2(moved.y, Math.max(0.0001, horiz.length())) * 0.6;
      const wrap = (a)=>{ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; };
      let dy = wrap(yaw - this._yaw);
      this._yaw = wrap(this._yaw + Math.max(-0.25, Math.min(0.25, dy)));
      this._pitch += (pitch - this._pitch) * Math.min(1, dt * 6);
    }
    // roll lightly with horizontal velocity
    this._desiredRoll = Math.max(-0.4, Math.min(0.4, moved.x * 1.1));
    this._roll += (this._desiredRoll - this._roll) * Math.min(1, dt * 5);
    e.rotation.set(this._pitch, this._yaw, this._roll);
    this._lastMoveDistance = moved.length();
    this._lastPos.copy(e.position);

    // wings: flap + bank with horizontal movement
    this._updateWings(dt, moved);
  }

  _chooseOuterAnchor(player, ctx) {
    const radius = Math.max(5, this._arenaClamp - 2);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const candidate = new this.THREE.Vector3(
        Math.cos(angle) * radius,
        this.cruiseAltitude,
        Math.sin(angle) * radius
      );
      if (ctx.positionClear && !ctx.positionClear(this.root, candidate)) continue;
      const playerDistance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
      const travelDistance = Math.hypot(candidate.x - this.root.position.x, candidate.z - this.root.position.z);
      const score = playerDistance - travelDistance * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) return best;
    const away = new this.THREE.Vector3(this.root.position.x - player.x, 0, this.root.position.z - player.z);
    if (away.lengthSq() < 0.001) away.set(1, 0, 0);
    away.normalize().multiplyScalar(radius);
    away.y = this.cruiseAltitude;
    return away;
  }

  _updateThrusters(dt) {
    const speedNow = this._lastMoveDistance / Math.max(0.0001, dt);
    const pulse = Math.max(0.25, Math.min(1.0, speedNow * 0.08));
    for (const node of (this.refs.thrusterGlows || [])) {
      const glow = node?.material;
      if (glow && glow.opacity !== undefined) {
        glow.transparent = true;
        glow.opacity = 0.35 + 0.45 * (0.4 + 0.6 * Math.sin(this._t * 8 + node.position.x * 3)) * pulse;
      }
    }
  }

  _updateWings(dt, steerVec) {
    this._wingPhase += this._wingSpeed * dt;
    const flap  = Math.sin(this._wingPhase) * this._wingAmp;
    const sweep = Math.sin(this._wingPhase * 0.55) * 0.12;

    // bank with horizontal steering/velocity (use X as a simple proxy)
    const bank = Math.max(-0.6, Math.min(0.6, (steerVec?.x || 0) * 1.8));

    const lw = this.refs?.leftWing, rw = this.refs?.rightWing;
    if (!lw || !rw) return;
    lw.rotation.z = -0.18 + flap + bank;
    rw.rotation.z =  0.18 - flap + bank;
    lw.rotation.y =  sweep;
    rw.rotation.y = -sweep;
  }

  _updateRecallVisuals(dt) {
    if (this._recallCd > 0) this._recallCd = Math.max(0, this._recallCd - dt);
    if (this._recallTime > 0) {
      this._recallTime = Math.max(0, this._recallTime - dt);
      const k = 1 - (this._recallTime / this._recallDur);
      const ring = this.refs.recallRing;
      if (ring && ring.material) {
        const s = 1.0 + k * 0.4;
        ring.scale.set(s, s, s);
        if (ring.material.opacity !== undefined) {
          ring.material.opacity = 0.9 - k * 0.6;
          ring.material.transparent = true;
        }
      }
      // pulse the core
      const core = this.refs.core;
      if (core && core.material && core.material.emissiveIntensity !== undefined) {
        core.material.emissiveIntensity = 0.8 + 0.6 * Math.sin(this._t * 14);
      }
    }
  }

  // ----------------------------------------------------------------------------
  // Swarm: maintain target count, trickle respawn, anchor assignment
  // ----------------------------------------------------------------------------
  _maintainRoster(dt, ctx) {
    // prune dead children (removed from manager)
    const toDelete = [];
    for (const r of this._children) {
      if (!this.enemyManager?.enemies?.has(r)) {
        toDelete.push(r);
      }
    }
    if (toDelete.length) {
      for (const r of toDelete) {
        this._children.delete(r);
        this._anchorByChild.delete(r);
        this._regenQueue++;
      }
      // small recall pulse when we lost a chunk of the swarm
      if (toDelete.length >= 2) this._tryRecallPulse();
    }

    // compute deficit vs desired
    const alive = this._children.size;
    const want = this.targetCount;
    const deficit = Math.max(0, want - alive);
    this._regenQueue = Math.max(this._regenQueue, deficit);

    // trickle spawn
    if (this._regenCd > 0) this._regenCd = Math.max(0, this._regenCd - dt);
    if (this._regenQueue > 0 && this._regenCd <= 0) {
      const pos = this._pickSpawnFromBay(ctx);
      if (pos) {
        const root = this.enemyManager?.spawnAt?.('flyer', pos, { countsTowardAlive: true });
        if (root) {
          // tune minion instance
          const inst = this.enemyManager.instanceByRoot?.get(root);
          try {
            // visuals + hp
            root.userData.type = 'flyer_swarm';
            root.userData.hp = Math.max(10, Math.floor(12 + this.rng() * 8));
            root.userData.maxHp = root.userData.hp;
            root.scale.setScalar(this._flyScale);
            // behavior
            if (inst) {
              inst.speed *= 1.05;
              inst.diveSpeed *= 1.02;
              // make sure minions cruise well under the carrier
              const anchor = this._assignAnchor(root);
              const anchorIndex = Math.max(0, (this.refs.swarmAnchors || []).indexOf(anchor));
              inst.cruiseAltitude = 4.2 + (anchorIndex % 3) * 1.05;
              inst.separationRadius = 2.2;
              inst.cooldownBase = Math.max(0.95, (inst.cooldownBase||1.2) * 0.9);
              inst.cooldown = 0.35 + this._children.size * 0.18;
              // slight damage nerf (more swarm, less spike)
              inst.impactDamageMin = 7;
              inst.impactDamageMax = 11;
              // store anchor for potential future steering integrations
              inst._homeAnchor = anchor;
              inst._formationOwnerRoot = this.root;
            }
          } catch (e) { logError(e); }
          this._children.add(root);
          this._regenQueue = Math.max(0, this._regenQueue - 1);
          this._regenCd = this.trickleBase + this.rng() * 0.18;
          ctx.emitAIEvent?.(this.root, 'warden_child_spawned', { childRoot: root, childCount: this._children.size });
        } else {
          // couldn't spawn now (e.g., cap reached externally) — retry soon
          this._regenCd = 0.25;
        }
      } else {
        // no safe bay; try again a bit later
        this._regenCd = 0.2;
      }
    }

    // Publish desired formation anchors. Flyer movement consumes these through the
    // normal collision solver; the Warden never edits a child's position directly.
    for (const r of this._children) {
      const inst = this.enemyManager.instanceByRoot?.get(r);
      const anchor = inst?._homeAnchor || this._anchorByChild.get(r);
      if (anchor) {
        const a = anchor.getWorldPosition(new this.THREE.Vector3());
        inst._formationTarget = a;
        inst._formationOwnerRoot = this.root;
      }
    }
  }

  _tryRecallPulse() {
    if (this._recallCd > 0) return;
    this._recallTime = this._recallDur;
    this._recallCd = 2.0 + this.rng() * 1.0;
  }

  _assignAnchor(childRoot) {
    const anchors = this.refs.swarmAnchors || [];
    if (!anchors.length) return null;
    // Fill the least-used socket first. Random-offset round robin could assign
    // several children to one socket and permanently interlock the pair.
    const occupancy = new Map(anchors.map(anchor => [anchor, 0]));
    for (const assigned of this._anchorByChild.values()) {
      if (occupancy.has(assigned)) occupancy.set(assigned, occupancy.get(assigned) + 1);
    }
    const start = Math.floor(this.rng() * anchors.length);
    let a = anchors[start];
    for (let offset = 1; offset < anchors.length; offset++) {
      const candidate = anchors[(start + offset) % anchors.length];
      if (occupancy.get(candidate) < occupancy.get(a)) a = candidate;
    }
    this._anchorByChild.set(childRoot, a);
    return a;
  }

  _clampSpawnPosition(position) {
    const limit = Math.max(0, this._arenaClamp - 0.6);
    position.x = Math.max(-limit, Math.min(limit, position.x));
    position.z = Math.max(-limit, Math.min(limit, position.z));
    return position;
  }

  _spawnPositionClear(position, ctx) {
    const player = ctx.player.position;
    if (Math.hypot(position.x - player.x, position.z - player.z) < this.safeRadius) return false;
    if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
      return this.enemyManager._isSpawnAreaClear(position, 0.35);
    }
    return true;
  }

  _pickSpawnFromBay(ctx) {
    const muzzles = this.refs.bayMuzzles || [];
    if (!muzzles.length) return null;

    // cycle bays so spawns are distributed
    for (let i = 0; i < muzzles.length; i++) {
      const idx = (this._bayIndex + i) % muzzles.length;
      const m = muzzles[idx];
      if (!m) continue;
      const worldPos = m.getWorldPosition(new this.THREE.Vector3());
      const q = m.getWorldQuaternion(new this.THREE.Quaternion());
      const forward = new this.THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();

      // initial spawn just outside bay, push forward a bit
      const p = worldPos.clone().add(forward.clone().multiplyScalar(0.7));
      p.y = Math.max(1.2, p.y);
      this._clampSpawnPosition(p);
      if (!this._spawnPositionClear(p, ctx)) continue;

      this._bayIndex = idx + 1;
      return p;
    }

    // fallback: ring around the carrier away from player
    const a = this.rng() * Math.PI * 2;
    const r = 1.6 + this.rng() * 0.6;
    const center = this.root.position;
    const p = new this.THREE.Vector3(center.x + Math.cos(a) * r, Math.max(1.2, center.y - 0.2), center.z + Math.sin(a) * r);
    this._clampSpawnPosition(p);
    return this._spawnPositionClear(p, ctx) ? p : null;
  }
}
