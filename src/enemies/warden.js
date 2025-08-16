// Swarm Warden (Heavy Flyer) — logic
// Spawns/recalls a personal swarm of 10–15 FlyerEnemy minions and regenerates them over time.
// Expects EnemyManager.spawnAt('flyer', pos, { countsTowardAlive: true }) to yield a FlyerEnemy instance.
// Asset used: createSwarmWarden({ THREE, mats, scale, palette })
//
// Fairness:
// - No spawns inside player safe radius
// - Trickle respawn (>=0.28s) from belly bays; respects arena clamp
// - Cleans up remaining minions on death

import { createSwarmWarden } from '../assets/swarm_warden.js';

export class SwarmWarden {
  constructor({ THREE, mats, cfg, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;

    // Visual/asset
    const built = createSwarmWarden({ THREE, mats, scale: cfg?.scale || 1.0 });
    this.root = built.root;
    this.refs = built.refs || {};
    const head = built.head;

    this.root.position.copy(spawnPos);
    const hp = (cfg && typeof cfg.hp === 'number') ? cfg.hp : 420;
    this.root.userData = { type: 'swarm_warden', head, hp, maxHp: hp };

    // Motion (hover + strafe orbit)
    this.speed = 1.9;
    this.cruiseAltitude = 10.5 + Math.random() * 1.2; // higher than flyers
    this._t = 0;
    this._yaw = 0; this._pitch = 0; this._roll = 0; this._desiredRoll = 0;
    // Start near cruising height immediately so it doesn't skim the ground on spawn
    this.root.position.y = this.cruiseAltitude - 0.3;
    this._lastPos = this.root.position.clone();
    this._arenaClamp = 39;

    // Wing anim state
    this._wingPhase = Math.random() * Math.PI * 2;
    this._wingSpeed = 5.2;   // flaps/sec (carrier: slower than gnats)
    this._wingAmp   = 0.26;  // radians

    // Swarm management
    this.desiredMin = cfg?.swarmMin ?? 10;
    this.desiredMax = cfg?.swarmMax ?? 15;
    this.targetCount = Math.floor(this.desiredMin + Math.random() * (this.desiredMax - this.desiredMin + 1));
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
        } catch(_) {}
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
  // Movement: gentle orbit + altitude hold
  // ----------------------------------------------------------------------------
  _updateMovement(dt, ctx) {
    const e = this.root;
    const player = ctx.player.position.clone();

    // altitude hold
    const targetAlt = this.cruiseAltitude + Math.sin(this._t * 1.6) * 0.15;
    e.position.y += (targetAlt - e.position.y) * Math.min(1, dt * 4.5);

    // orbit/strafe
    const toP = player.clone().sub(e.position);
    const dist = toP.length();
    toP.y = 0; if (toP.lengthSq() > 0) toP.normalize();

    const desired = new this.THREE.Vector3();
    if (dist > 11) desired.add(toP);
    else {
      // orbit clockwise/counter; bias randomly every few seconds
      const side = new this.THREE.Vector3(-toP.z, 0, toP.x);
      const swirl = Math.sin(this._t * 0.3) > 0 ? 1 : -1;
      desired.add(side.multiplyScalar(0.8 * swirl));
    }

    // avoid arena walls a bit, but do NOT use ground collision (flyer stays at altitude)
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const steer = (typeof ctx.avoidObstacles === 'function') ? ctx.avoidObstacles(e.position, desired, 1.8) : desired;
      const step = steer.clone().multiplyScalar(this.speed * dt);
      e.position.x += step.x;
      e.position.z += step.z;
    }

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
    this._lastPos.copy(e.position);

    // wings: flap + bank with horizontal movement
    this._updateWings(dt, moved);
  }

  _updateThrusters(dt) {
    const speedNow = this.root.position.clone().sub(this._lastPos).length() / Math.max(0.0001, dt);
    const pulse = Math.max(0.25, Math.min(1.0, speedNow * 0.08));
    for (const t of (this.refs.thrusters || [])) {
      const glow = t.children?.[1]?.material;
      if (glow && glow.opacity !== undefined) {
        glow.transparent = true;
        glow.opacity = 0.35 + 0.45 * (0.4 + 0.6 * Math.sin(this._t * 8 + t.position.x * 3)) * pulse;
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
      const ring = this.refs.recallEmitter?.children?.[0];
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
            root.userData.hp = Math.max(10, Math.floor(12 + Math.random() * 8));
            root.scale.setScalar(this._flyScale);
            // behavior
            if (inst) {
              inst.speed *= 1.05;
              inst.diveSpeed *= 1.02;
              // make sure minions cruise well under the carrier
              const desiredMinionAlt = (inst.cruiseAltitude || 3.2);
              inst.cruiseAltitude = Math.min(desiredMinionAlt, this.cruiseAltitude - 5.0);
              inst.separationRadius = 0.75;
              inst.cooldownBase = Math.max(0.95, (inst.cooldownBase||1.2) * 0.9);
              // slight damage nerf (more swarm, less spike)
              inst.impactDamageMin = 7;
              inst.impactDamageMax = 11;
              // store anchor for potential future steering integrations
              inst._homeAnchor = this._assignAnchor(root);
            }
          } catch(_) {}
          this._children.add(root);
          this._regenQueue = Math.max(0, this._regenQueue - 1);
          this._regenCd = this.trickleBase + Math.random() * 0.18;
        } else {
          // couldn't spawn now (e.g., cap reached externally) — retry soon
          this._regenCd = 0.25;
        }
      } else {
        // no safe bay; try again a bit later
        this._regenCd = 0.2;
      }
    }

    // optionally nudge alive minions toward their anchors if they wander too far (gentle tug)
    // (safe: just telegraph intent via a weak force; FlyerEnemy handles its own autonomy)
    for (const r of this._children) {
      const inst = this.enemyManager.instanceByRoot?.get(r);
      const anchor = inst?._homeAnchor || this._anchorByChild.get(r);
      if (anchor) {
        const a = anchor.getWorldPosition(new this.THREE.Vector3());
        const p = r.position;
        const dx = a.x - p.x, dz = a.z - p.z;
        const d2 = dx*dx + dz*dz;
        if (d2 > 9) {
          const d = Math.sqrt(d2);
          const n = new this.THREE.Vector3(dx/d, 0, dz/d);
          // tiny positional tug so they tend to ring the carrier during downtime
          r.position.add(n.multiplyScalar(0.6 * dt));
        }
      }
    }
  }

  _tryRecallPulse() {
    if (this._recallCd > 0) return;
    this._recallTime = this._recallDur;
    this._recallCd = 2.0 + Math.random() * 1.0;
  }

  _assignAnchor(childRoot) {
    const anchors = this.refs.swarmAnchors || [];
    if (!anchors.length) return null;
    // choose the least-used anchor by simple round-robin
    const idx = (this._children.size + Math.floor(Math.random()*3)) % anchors.length;
    const a = anchors[idx];
    this._anchorByChild.set(childRoot, a);
    return a;
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

      // respect arena clamp
      p.x = Math.max(-this._arenaClamp+0.6, Math.min(this._arenaClamp-0.6, p.x));
      p.z = Math.max(-this._arenaClamp+0.6, Math.min(this._arenaClamp-0.6, p.z));

      // keep away from player safe radius
      const player = ctx.player.position;
      if (Math.hypot(p.x - player.x, p.z - player.z) < this.safeRadius) continue;

      // prefer clear area if helper exists
      if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
        if (!this.enemyManager._isSpawnAreaClear(p, 0.35)) continue;
      }

      this._bayIndex = idx + 1;
      return p;
    }

    // fallback: ring around the carrier away from player
    const a = Math.random() * Math.PI * 2;
    const r = 1.6 + Math.random() * 0.6;
    const center = this.root.position;
    const p = new this.THREE.Vector3(center.x + Math.cos(a) * r, Math.max(1.2, center.y - 0.2), center.z + Math.sin(a) * r);
    const player = ctx.player.position;
    if (Math.hypot(p.x - player.x, p.z - player.z) < this.safeRadius) return null;
    return p;
  }
}
