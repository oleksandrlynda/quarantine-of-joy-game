import { createEnhancedWingedDrone } from '../assets/enemy-retrofits.js';
import { logError } from '../util/log.js';
import { cloneNodeMaterial, instantiateSharedTemplate } from './render-template.js';

const _flyerTemplates = new WeakMap();

export class FlyerEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.rng = rng;

    // Model: winged drone asset
    const built = instantiateSharedTemplate(
      _flyerTemplates,
      THREE,
      () => createEnhancedWingedDrone({ THREE, mats, scale: 1.0 })
    );
    const body = built.root; const head = built.head; this._animRefs = built.refs || {};
    try { cloneNodeMaterial(head); } catch (e) { logError(e); }
    body.position.copy(spawnPos);
    body.userData = { type: cfg.type, head, hp: cfg.hp };

    this.root = body;

    // Movement tuning
    this.speed = 3.2 + this.rng() * 0.6;              // cruise speed 3.2–3.8
    this.diveSpeed = 10.0 + this.rng() * 3.0;         // dive speed 10.0–13.0
    this.separationRadius = 2.1;                      // readable air-to-air spacing
    this.avoidProbe = 1.2;                            // short forward probe distance

    // Altitude + oscillation (raised range)
    this.cruiseAltitude = 4 + this.rng() * 3;
    this.oscPhase = this.rng() * Math.PI * 2;
    this.oscSpeed = 1.6 + this.rng() * 0.8;
    this.oscAmp = 0.2 + this.rng() * 0.1;

    // Attack behavior
    this.triggerDist = 10 + this.rng() * 4;           // 10–14m trigger
    this.telegraphRequired = 0.4;                     // 0.4s windup
    this.cooldownBase = 1.2 + this.rng() * 0.6;       // 1.2–1.8s
    this.cooldown = 0;                                // time until next windup allowed
    this.damageDps = 20;                              // only during dive window
    this.damageWindow = 0.6;                          // active damage window length
    this.maxDiveTime = 0.85;                          // adaptive per dive
    this._damageWindowStart = 0.0;                    // computed per dive
    // Impact burst applied once on dive contact (fix low chip damage)
    this.impactDamageMin = 10;                        // 10–16 per successful hit
    this.impactDamageMax = 16;

    // State machine
    this.state = 'cruise'; // 'cruise' | 'windup' | 'dive' | 'recover'
    this.timeInState = 0;
    this.telegraphTime = 0;
    this.diveTime = 0;
    this.recoverTime = 0;
    this._diveDir = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._arenaClamp = 39.0; // keep inside walls at ±40

    this._savedEmissive = null; // head glow cache
    this._windupStrafeSign = this.rng() < 0.5 ? 1 : -1;
    this._attackAnchor = null; // XZ point to move to before diving

    // Evasive buzzing parameters
    this._t = 0;                                       // local time accumulator
    this.orbitSign = this.rng() < 0.5 ? 1 : -1;        // clockwise vs counter-clockwise
    this.standoffRadius = 8 + this.rng() * 4;          // prefer buzzing around this radius
    this.buzzFreqA = 2.0 + this.rng() * 1.5;
    this.buzzFreqB = 1.5 + this.rng() * 1.2;
    this.buzzAmp = 0.9 + this.rng() * 0.6;
    this.jukeCooldown = 0;                             // time until next juke allowed
    this.jukeTime = 0;                                  // remaining juke duration
    this.jukeDir = new this.THREE.Vector3();            // world-XZ juke direction

    // Orientation smoothing
    this._lastPos = spawnPos.clone();
    this._yaw = 0; this._pitch = 0; this._roll = 0; this._desiredRoll = 0;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const sensed = ctx.sensePlayer?.(e, dt) || {
      rawWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      stableWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      tacticalFireClear: true
    };

    // Tick timers
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.timeInState += dt;
    this._t += dt;
    if (this.jukeCooldown > 0) this.jukeCooldown = Math.max(0, this.jukeCooldown - dt);
    if (this.jukeTime > 0) this.jukeTime = Math.max(0, this.jukeTime - dt);

    // Gentle altitude keep + oscillation during non-dive
    if (this.state !== 'dive') {
      this.oscPhase += this.oscSpeed * dt;
      const targetAlt = this.cruiseAltitude + Math.sin(this.oscPhase) * this.oscAmp;
      e.position.y += (targetAlt - e.position.y) * Math.min(1, dt * 4);
      // Wing idle flutter based on oscillation
      try {
        const lw = this._animRefs?.leftWing, rw = this._animRefs?.rightWing;
        if (lw && rw) {
          const flap = Math.sin(this._t * 6.0) * 0.22; // faster gentle flap
          lw.rotation.z = -0.15 + flap; rw.rotation.z = 0.15 - flap;
          // subtle forward/back sweep for life
          const sweep = Math.sin(this._t * 3.2) * 0.06;
          lw.rotation.y = sweep; rw.rotation.y = -sweep;
        }
      } catch (e) { logError(e); }
    }

    // Compute pursuit vector (horizontal) toward player
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    const desiredDir = toPlayer.setY(0);
    if (desiredDir.lengthSq() > 0) desiredDir.normalize();

    // Air bodies use the shared swept solver, which naturally ignores props below
    // their vertical span while still colliding with walls and other aircraft.
    const avoid = new THREE.Vector3();
    const sep = ctx.separation(e.position, this.separationRadius, e);

    const moveHorizontal = (direction, speedScale = 1) => {
      if (!direction || direction.lengthSq() <= 0.0001) return null;
      const step = direction.clone();
      step.y = 0;
      step.normalize().multiplyScalar(this.speed * speedScale * dt);
      return ctx.moveWithCollisions?.(e, step) || null;
    };

    // State transitions and movement
    switch (this.state) {
      case 'cruise': {
        // Evasive buzzing movement: orbit + weave + occasional juke
        const steer = new THREE.Vector3();
        if (desiredDir.lengthSq() > 0) {
          const fwd = desiredDir.clone();
          const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.orbitSign);
          const distXZ = playerPos.clone().setY(0).sub(new THREE.Vector3(e.position.x, 0, e.position.z)).length();

          if (distXZ > this.standoffRadius + 1.5) steer.add(fwd.multiplyScalar(0.8));
          else if (distXZ < this.standoffRadius - 1.2) steer.add(fwd.multiplyScalar(-0.9));
          steer.add(side.multiplyScalar(1.0));

          const buzzS = Math.sin(this._t * this.buzzFreqA);
          const buzzC = Math.cos(this._t * this.buzzFreqB);
          steer.add(fwd.clone().multiplyScalar(buzzS * 0.35 * this.buzzAmp));
          steer.add(side.clone().multiplyScalar(buzzC * 0.55 * this.buzzAmp));

          if (this.jukeCooldown <= 0 && this.jukeTime <= 0 && this.rng() < 0.9 * dt) {
            const dir = side.clone().multiplyScalar(this.rng() < 0.5 ? 1 : -1).add(fwd.clone().multiplyScalar((this.rng()-0.5)*0.4)).normalize();
            this.jukeDir.copy(dir);
            this.jukeTime = 0.18 + this.rng() * 0.18;
            this.jukeCooldown = 0.8 + this.rng() * 0.6;
          }
          if (this.jukeTime > 0) steer.add(this.jukeDir.clone().multiplyScalar(1.6));
        }
        if (this._formationTarget) {
          const toFormation = this._formationTarget.clone().sub(e.position).setY(0);
          if (toFormation.lengthSq() > 9) steer.add(toFormation.normalize().multiplyScalar(0.75));
        }
        steer.add(avoid.multiplyScalar(1.2));
        steer.add(sep.multiplyScalar(1.8));
        const cruiseMove = moveHorizontal(steer);
        if (cruiseMove?.blockedBy === 'ally') {
          ctx.emitAIEvent?.(e, 'aerial_congestion', { blockerRoot: cruiseMove.blockerRoot });
        }
        // Bank wings during turns
        try {
          const lw = this._animRefs?.leftWing, rw = this._animRefs?.rightWing;
          if (lw && rw) {
            const bank = Math.max(-0.6, Math.min(0.6, (steer.x * 2.2)));
            const flap = Math.sin(this._t * 6.0) * 0.22;
            lw.rotation.z = -0.15 + flap + bank; rw.rotation.z = 0.15 - flap + bank;
            // keep slight sweep during cruise
            const sweep = Math.sin(this._t * 3.2) * 0.06;
            lw.rotation.y = sweep; rw.rotation.y = -sweep;
            this._desiredRoll = bank * 0.5;
          }
        } catch (e) { logError(e); }

        // Try initiating dive
        if (this.cooldown <= 0 && dist <= this.triggerDist && sensed.stableWorldLOS) {
          const reserved = ctx.reserveAirAttack?.(
            e,
            this._formationOwnerRoot || null,
            { maxConcurrent: 2, duration: 3.2 }
          ) ?? true;
          if (reserved) {
            this.state = 'windup';
            this.timeInState = 0;
            this.telegraphTime = 0;
            this._attackAnchor = null; // recompute per attempt
            this._setHeadGlow(true);
            ctx.emitAIEvent?.(e, 'flyer_dive_windup', {});
          } else {
            this.cooldown = 0.2 + this.rng() * 0.2;
            ctx.emitAIEvent?.(e, 'flyer_dive_slot_delayed', { ownerRoot: this._formationOwnerRoot || null });
          }
        }
        ctx.setAIState?.(e, 'orbiting', { selectedAnchor: this._formationTarget || null });
        break;
      }

      case 'windup': {
        // Telegraph while repositioning to avoid vertical dives
        this.telegraphTime += dt;
        ctx.reserveAirAttack?.(e, this._formationOwnerRoot || null, { maxConcurrent: 2, duration: 3.2 });

        // Horizontal distance and minimum needed to satisfy 30° from vertical
        const thetaMin = Math.PI / 6; // 30°
        const toH = playerPos.clone().sub(e.position); toH.y = 0;
        const hDist = toH.length();
        const verticalDrop = Math.max(0, e.position.y - 1.5);
        const neededHoriz = Math.max(0.6, verticalDrop * Math.tan(thetaMin) + 0.1);

        // Create anchor on a ring around player and move to it
        if (!this._attackAnchor) {
          const ring = neededHoriz * 1.35; // go further before starting dive
          const right = toH.lengthSq() > 0 ? new THREE.Vector3(-toH.z, 0, toH.x).normalize() : new THREE.Vector3(1,0,0);
          const sign = this._windupStrafeSign;
          let ax = playerPos.x + right.x * ring * sign;
          let az = playerPos.z + right.z * ring * sign;
          // Keep anchor away from walls so avoidance doesn't fight it
          const margin = 0.8;
          ax = Math.max(-this._arenaClamp + margin, Math.min(this._arenaClamp - margin, ax));
          az = Math.max(-this._arenaClamp + margin, Math.min(this._arenaClamp - margin, az));
          this._attackAnchor = new THREE.Vector3(ax, e.position.y, az);
        }
        // steer toward anchor with avoidance and separation, plus subtle buzz to feel less linear
        const toAnchor = new THREE.Vector3(this._attackAnchor.x - e.position.x, 0, this._attackAnchor.z - e.position.z);
        let steer = new THREE.Vector3();
        if (toAnchor.lengthSq() > 0) steer.add(toAnchor.normalize());
        if (desiredDir.lengthSq() > 0) {
          const fwd = desiredDir.clone();
          const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this._windupStrafeSign);
          const buzz = Math.sin(this._t * this.buzzFreqA) * 0.4;
          steer.add(side.multiplyScalar(0.6 + buzz));
        }
        steer.add(sep.multiplyScalar(1.6));
        const windupMove = moveHorizontal(steer, 0.95);
        if (windupMove?.blockedBy === 'ally') {
          this._windupStrafeSign *= -1;
          this._attackAnchor = null;
          ctx.emitAIEvent?.(e, 'dive_angle_changed', { blockerRoot: windupMove.blockerRoot });
        }
        // Strafe telegraph wing tilt
        try {
          const lw = this._animRefs?.leftWing, rw = this._animRefs?.rightWing;
          if (lw && rw) { const sign = this._windupStrafeSign; lw.rotation.z = -0.25 * sign; rw.rotation.z = 0.25 * sign; lw.rotation.y = 0; rw.rotation.y = 0; }
        } catch (e) { logError(e); }

        const closeToAnchor = toAnchor.length() <= 0.85; // allow more slack so avoidance doesn't repel
        // Repath anchor if taking too long (flip side)
        if (!closeToAnchor && this.telegraphTime > 1.25) { this._windupStrafeSign *= -1; this._attackAnchor = null; }

        // Only start dive once positioned at anchor, LOS valid, and telegraph done
        const readyByAnchor = this.telegraphTime >= this.telegraphRequired && closeToAnchor && sensed.stableWorldLOS;
        // Fallback: if stuck too long, dive anyway using angle-enforced vector
        const forceDive = this.telegraphTime >= 1.2 && sensed.stableWorldLOS;
        if (readyByAnchor || forceDive) {
          // Aim directly at player's chest from current position (should satisfy 30° now)
          const aimPoint = playerPos.clone(); aimPoint.y = 1.5;
          const toAim = aimPoint.clone().sub(e.position);
          // Enforce minimum 30° from vertical if needed
          const thetaMin = Math.PI / 6; // 30°
          const horiz = new this.THREE.Vector3(toAim.x, 0, toAim.z);
          const horizMag = horiz.length();
          const vertMag = Math.abs(toAim.y);
          const minHorizOverVert = Math.tan(thetaMin);
          if (vertMag > 0 && horizMag < vertMag * minHorizOverVert) {
            if (horizMag < 0.0001) {
              const lateral = new this.THREE.Vector3(1, 0, 0);
              horiz.copy(lateral).multiplyScalar(vertMag * minHorizOverVert);
            } else {
              const scale = (vertMag * minHorizOverVert) / Math.max(0.0001, horizMag);
              horiz.multiplyScalar(scale);
            }
            toAim.x = horiz.x; toAim.z = horiz.z;
          }
          const corridorTarget = e.position.clone().add(toAim);
          const corridor = ctx.chargeCorridorClear?.(e, corridorTarget, 0.2) || { clear: true };
          if (!corridor.clear) {
            this._windupStrafeSign *= -1;
            this._attackAnchor = null;
            this.telegraphTime = Math.min(this.telegraphTime, 0.35);
            ctx.emitAIEvent?.(e, 'dive_corridor_blocked', { blockerRoot: corridor.blockerRoot });
            ctx.setAIState?.(e, 'dive_delayed', { blockerRoot: corridor.blockerRoot });
            break;
          }
          const distanceToAim = toAim.length();
          this._diveDir.copy(toAim.lengthSq() > 0 ? toAim.normalize() : new this.THREE.Vector3(0, -1, 0));

          // Adaptive dive time and damage window towards end of dive
          const expected = distanceToAim / this.diveSpeed;
          this.maxDiveTime = Math.max(0.7, Math.min(1.4, expected + 0.25));
          this._damageWindowStart = Math.max(0.1, this.maxDiveTime - this.damageWindow);

          this.state = 'dive';
          this.timeInState = 0; this.diveTime = 0;
          this._dealtDamageThisDive = false;
          this._setHeadGlow(false);
          ctx.emitAIEvent?.(e, 'flyer_dive_started', { ownerRoot: this._formationOwnerRoot || e });
          // Wings tuck slightly on dive
          try {
            const lw = this._animRefs?.leftWing, rw = this._animRefs?.rightWing;
            if (lw && rw) { lw.rotation.z = -0.02; rw.rotation.z = 0.02; lw.rotation.y = -0.95; rw.rotation.y = 0.95; }
          } catch (e) { logError(e); }
        }
        if (!sensed.stableWorldLOS && this.telegraphTime > 0.5) {
          this.state = 'cruise';
          this.timeInState = 0;
          this._attackAnchor = null;
          this._setHeadGlow(false);
          ctx.releaseAirAttack?.(e);
          ctx.emitAIEvent?.(e, 'flyer_dive_cancelled', { reason: 'lost_los' });
        } else if (this.state === 'windup') {
          ctx.setAIState?.(e, 'dive_windup', { tacticalFireClear: sensed.tacticalFireClear });
        }
        break;
      }

      case 'dive': {
        // Commit to dive direction; keep shallow downward bias
        this.diveTime += dt;
        const diveStep = this._diveDir.clone().multiplyScalar(this.diveSpeed * dt);
        e.position.y += diveStep.y;
        const diveMove = ctx.moveWithCollisions?.(e, new THREE.Vector3(diveStep.x, 0, diveStep.z));
        if (diveMove?.blockedBy === 'ally' || diveMove?.blockedBy === 'world') {
          this.state = 'recover';
          this.timeInState = 0;
          this.recoverTime = 0;
          ctx.releaseAirAttack?.(e);
          ctx.emitAIEvent?.(e, 'flyer_dive_cancelled', {
            reason: diveMove.blockedBy,
            blockerRoot: diveMove.blockerRoot
          });
          ctx.setAIState?.(e, 'recovering', { reason: diveMove.blockedBy });
          break;
        }
        ctx.setAIState?.(e, 'diving', { ownerRoot: this._formationOwnerRoot || e });

        // Damage window: last ~0.6s of the dive by default
        if (this.diveTime >= this._damageWindowStart && this.diveTime <= this.maxDiveTime) {
          // proximity check in 3D
          const dx = e.position.x - playerPos.x;
          const dy = (e.position.y + 0.4) - playerPos.y; // body center to chest height
          const dz = e.position.z - playerPos.z;
          const d2 = dx*dx + dy*dy + dz*dz;
          if (d2 < 1.35 * 1.35 && !this._dealtDamageThisDive) {
            const impact = this.impactDamageMin + this.rng() * (this.impactDamageMax - this.impactDamageMin);
            if (ctx.damagePlayer) {
              ctx.damagePlayer(impact, {
                sourceKind: 'flyer_dive',
                sourceRoot: e,
                ownerRoot: this._formationOwnerRoot || e
              });
            } else {
              ctx.onPlayerDamage?.(impact);
            }
            this._dealtDamageThisDive = true;
            ctx.emitAIEvent?.(e, 'flyer_dive_hit', { amount: impact, ownerRoot: this._formationOwnerRoot || e });
            // on contact, immediately recover
            this.state = 'recover';
            this.timeInState = 0; this.recoverTime = 0;
            ctx.releaseAirAttack?.(e);
          }
        }

        // If dive runs its course or we reach arena bounds, recover
        if (this.diveTime >= this.maxDiveTime || this._isNearWall(e.position)) {
          this.state = 'recover';
          this.timeInState = 0; this.recoverTime = 0;
          ctx.releaseAirAttack?.(e);
        }
        break;
      }

      case 'recover': {
        // Climb back and drift laterally
        const steer = new THREE.Vector3();
        if (desiredDir.lengthSq() > 0) steer.add(desiredDir.multiplyScalar(0.8));
        steer.add(avoid.multiplyScalar(1.2));
        steer.add(sep.multiplyScalar(1.6));
        if (steer.lengthSq() > 0) {
          moveHorizontal(steer);
        }
        // Vertical recover toward cruise altitude faster
        const targetAlt = this.cruiseAltitude;
        e.position.y += (targetAlt - e.position.y) * Math.min(1, dt * 6);

        this.recoverTime += dt;
        if (this.recoverTime >= 0.6) {
          this.state = 'cruise';
          this.timeInState = 0;
          this.cooldown = this.cooldownBase; // re-arm dive
          try {
            const lw = this._animRefs?.leftWing, rw = this._animRefs?.rightWing;
            if (lw && rw) { lw.rotation.z = -0.15; rw.rotation.z = 0.15; lw.rotation.y = 0; rw.rotation.y = 0; }
          } catch (e) { logError(e); }
        }
        ctx.setAIState?.(e, 'recovering', {});
        break;
      }
    }

    // Smoothly orient body to current velocity vector (yaw/pitch) and desired roll
    const moved = e.position.clone().sub(this._lastPos);
    if (moved.lengthSq() > 0.00004) {
      const yaw = Math.atan2(moved.x, moved.z);
      const horiz = new this.THREE.Vector3(moved.x, 0, moved.z);
      const pitch = -Math.atan2(moved.y, Math.max(0.0001, horiz.length())) * 0.6;
      // Lerp angles for smoothness (wrap yaw)
      const wrap = (a)=>{ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; };
      let dy = wrap(yaw - this._yaw);
      this._yaw = wrap(this._yaw + Math.max(-0.2, Math.min(0.2, dy)));
      this._pitch += (pitch - this._pitch) * Math.min(1, dt * 6);
    }
    // Roll follows desired bank with damping
    this._roll += (this._desiredRoll - this._roll) * Math.min(1, dt * 5);
    e.rotation.set(this._pitch, this._yaw, this._roll);
    this._lastPos.copy(e.position);

    // Keep inside arena bounds to prevent clipping walls
    e.position.x = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.x));
    e.position.z = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.z));
  }

  _isNearWall(pos) {
    return (
      pos.x <= -this._arenaClamp + 0.3 || pos.x >= this._arenaClamp - 0.3 ||
      pos.z <= -this._arenaClamp + 0.3 || pos.z >= this._arenaClamp - 0.3
    );
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 0.6, fromPos.z);
    const target = new THREE.Vector3(targetPos.x, 1.5, targetPos.z);
    const dir = target.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _setHeadGlow(active) {
    const head = this.root.userData.head;
    if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      mat.emissive.setHex(active ? 0xff88aa : this._savedEmissive.getHex());
    } else {
      head.scale.setScalar(active ? 1.08 : 1.0);
    }
  }
}
