import { createEnhancedShooterBot } from '../assets/enemy-retrofits.js';
import { logError } from '../util/log.js';
import {
  cloneNodeMaterial,
  getCachedRenderResource,
  instantiateSharedTemplate
} from './render-template.js';

const _shooterTemplates = new WeakMap();
const _shooterProjectileGeometries = new WeakMap();

export function isShooterMobileCover(root) {
  const behaviorId = root?.userData?.behaviorId || root?.userData?.type;
  return behaviorId === 'grunt' || behaviorId === 'tank';
}

export class ShooterEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.rng = rng;
  
    // Use ShooterBot asset with right-hand gun; shots originate from muzzle, not head
    const built = instantiateSharedTemplate(
      _shooterTemplates,
      THREE,
      () => createEnhancedShooterBot({ THREE, mats, scale: 0.62 })
    );
    const body = built.root; const head = built.head; this._refs = built.refs || {};
    body.position.copy(spawnPos);
    // Ensure head has a unique material so emissive glow doesn't affect other shooters
    try {
      cloneNodeMaterial(head);
      cloneNodeMaterial(this._refs.muzzle);
    } catch (e) { logError(e); }
  
    body.userData = { type: cfg.type, head, hp: cfg.hp };
    this.root = body;
    this.speed = cfg.speedMin + this.rng() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 12, max: 18 };
    this.engageRange = { min: 8, max: 36 };
  
    // Firing cadence and telegraph
    this.cooldown = 0;                               // general cooldown timer
    this.baseCadence = 0.6 + this.rng() * 0.4;   // intra-burst spacing
    this.singleCadence = 1.2 + this.rng() * 0.4; // normal pressure between specials
    this.burstRechargeSeconds = 10;
    this.burstCooldown = 0;                       // first special is available immediately
    this.inBurst = false;                            // currently executing a burst sequence
    this.windupTime = 0;                             // time spent charging current shot (telegraph before burst)
    this.windupRequired = 0.75 + this.rng() * 0.2; // burst telegraph; singles override this
    this._attackMode = null;
    this.strafeDir = this.rng() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;                         // control strafe dir switching
  
    this.projectiles = [];
    this._raycaster = new THREE.Raycaster();
    this._aimLine = null;                            // telegraph line during windup
  
    // Peek/relocate behavior state
    this.shotsThisBurst = 0;
    this.maxBurst = 3 + ((this.rng() * 2) | 0);   // 3–4 shots per burst
    this.relocating = false;
    this.relocateTarget = null;
    this.relocateTimer = 0;
    this.relocateTimeout = 2.2 + this.rng() * 0.8; // seconds to give up and resume
    this.relocateDistance = 8 + this.rng() * 4;     // 8–12 units lateral move
    this._peekCommitTimer = 0;
    this._peekCommitDir = new this.THREE.Vector3();
    this._worldPeekActive = false;
    this._worldPeekHoldTimer = 0;
    this._hadStableWorldLOS = false;
    this._rangeMovementMode = 'hold';
    this._routeAnchor = null;
    this._routeAnchorSubject = null;
    this._routeAnchorRefresh = 0;
    this._allyBlockedTimer = 0;
    this.selectedCoverRoot = null;
    this._coverRefreshTimer = 0;
    this._coverPeekSign = this.strafeDir;
    this._coverMode = 'none';
    this._prevPlayerPos = null;
    this._playerVelocity = new this.THREE.Vector3();
  
    // On-hit micro-juke
    this._hitJukeTime = 0;
    this._hitJukeDir = new this.THREE.Vector3();
    this._lastFwd = new this.THREE.Vector3(0,0,1);
  
    // Facing and small gun recoil/flash state
    this._yaw = 0; this._flashTimer = 0; this._recoil = 0;
    this._gunRestPosition = this._refs.gun?.position.clone() || null;
    this._rightArmRestRotation = this._refs.rightArm?.rotation.clone() || null;
    this._leftArmRestRotation = this._refs.leftArm?.rotation.clone() || null;
    // Smoothed facing to avoid jitter
    this._faceDir = new this.THREE.Vector3(0, 0, 1);

    // Defensive point-blank gun-butt strike. It only starts after a failed
    // escape or sustained close pressure, keeping Shooter primarily ranged.
    this._meleePhase = 'idle';
    this._meleeTimer = 0;
    this._meleeCooldown = 0;
    this._meleeDidHit = false;
    this._closePressureTime = 0;
    this.meleeRange = 2.2;
  
    // --- NEW: spray/bloom settings ---
    const rad = (d)=> this.THREE.MathUtils.degToRad(d);
    this.spreadBase = rad(1.4);           // base cone angle
    this.spreadBloomPerShot = rad(0.6);   // each shot adds bloom
    this.spreadMax = rad(6.0);            // hard cap
    this.spreadDecay = rad(4.0);          // per second decay
    this.currentSpread = 0;               // dynamic part, decays over time
  
    // --- NEW: kiting/evasive behavior ---
    this.kiteRange = { min: 7, max: 12 }; // tries to keep player outside this if rushing in
    this.evasiveTimer = 0;                 // time left in panic dash
    this.evasiveCooldown = 0;              // prevent constant re-trigger
    this._stutterTimer = 0;                // micro stutter strafing during windup

    // Counter-aim survival behavior. A short dwell keeps a passing crosshair
    // from causing psychic dodges; once threatened, the Shooter commits to one
    // readable lateral break before returning to its fire-first loop.
    this._aimThreatTime = 0;
    this._aimThreatRequired = 0.22 + this.rng() * 0.12;
    this._counterAimActive = false;
    this._counterAimDir = new this.THREE.Vector3();
  }  

  update(dt, ctx) {
    const THREE = this.THREE;
  
    // 0) Update small per-shot visuals
    if (this._flashTimer > 0) {
      this._flashTimer = Math.max(0, this._flashTimer - dt);
      if (this._refs && this._refs.muzzle && this._refs.muzzle.material && this._refs.muzzle.material.emissiveIntensity != null) {
        this._refs.muzzle.material.emissiveIntensity = 0.6 + 1.4 * (this._flashTimer / 0.08);
      }
    }
    if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 6);
    try {
      if (this._refs?.gun && this._gunRestPosition) {
        this._refs.gun.position.copy(this._gunRestPosition);
        this._refs.gun.position.z -= 0.05 * this._recoil;
      }
    } catch (e) { logError(e); }
  
    // NEW: decay spread bloom
    this.currentSpread = Math.max(0, this.currentSpread - this.spreadDecay * dt);
  
    // 1) Update projectiles
    this._updateProjectiles(dt, ctx);
  
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const muzzle = this._muzzleWorld();
    const sense = ctx.sensePlayer?.(e, dt, muzzle) || {
      rawWorldLOS: this._hasLineOfSight(e, playerPos, ctx.objects),
      stableWorldLOS: this._hasLineOfSight(e, playerPos, ctx.objects),
      locomotionClear: true,
      tacticalFireClear: true,
      pursuitTarget: playerPos.clone()
    };
    const behaviorTarget = sense.stableWorldLOS ? playerPos : sense.pursuitTarget;
    if (!behaviorTarget) {
      this._releaseAllyCover(ctx, 'no_known_target');
      this.inBurst = false;
      this.windupTime = 0;
      this._attackMode = null;
      this._setHeadGlow(false);
      this._updateAimLine(null, ctx.scene);
      ctx.setAIState?.(e, sense.searchActive ? 'searching' : 'idle_unaware');
      return;
    }
    const toPlayer = behaviorTarget.clone().sub(e.position);
    const dist = toPlayer.length();
    const visibilityRange = Number(ctx.combatVisibilityRange);
    const actualPlayerDistance = e.position.distanceTo(playerPos);
    const visibilityOccluded = sense.stableWorldLOS
      && Number.isFinite(visibilityRange)
      && actualPlayerDistance > visibilityRange;
    const hasLOS = sense.stableWorldLOS && !visibilityOccluded;
    const tacticalFireClear = sense.tacticalFireClear;
    this._meleeCooldown = Math.max(0, this._meleeCooldown - dt);
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.burstCooldown > 0) this.burstCooldown = Math.max(0, this.burstCooldown - dt);
    if (this._meleePhase !== 'idle') {
      this._updateGunButt(dt, ctx, playerPos, sense);
      return;
    }
    this._worldPeekHoldTimer = Math.max(0, this._worldPeekHoldTimer - dt);
    this._routeAnchorRefresh = Math.max(0, this._routeAnchorRefresh - dt);
    if (hasLOS && !this._hadStableWorldLOS && this._worldPeekActive) {
      // Once a wall-edge peek succeeds, hold that firing anchor long enough to
      // finish the telegraph instead of immediately strafing back behind cover.
      this._worldPeekHoldTimer = Math.max(this._worldPeekHoldTimer, 1.25);
    }
    if (!hasLOS) this._worldPeekActive = true;
    this._hadStableWorldLOS = hasLOS;
    const rangeMovementMode = this._updateRangeMovementMode(dist);
    const playerSpeed = (ctx.blackboard && (ctx.blackboard.playerSpeed || 0)) || 0;
    const playerStationary = playerSpeed < 0.8;
    if (sense.stableWorldLOS && this._prevPlayerPos) {
      const measured = playerPos.clone().sub(this._prevPlayerPos).multiplyScalar(1 / Math.max(0.001, dt));
      this._playerVelocity.lerp(measured, Math.min(1, 0.35 + dt));
      this._playerVelocity.y = 0;
    }
    if (sense.stableWorldLOS) this._prevPlayerPos = playerPos.clone();
    this._allyBlockedTimer = tacticalFireClear ? 0 : this._allyBlockedTimer + dt;
    this._peekCommitTimer = Math.max(0, this._peekCommitTimer - dt);
  
    // --- NEW: trigger evasive kite if player is too close or rushing in ---
    if (this.evasiveCooldown > 0) this.evasiveCooldown = Math.max(0, this.evasiveCooldown - dt);
    if (this.evasiveTimer > 0) this.evasiveTimer = Math.max(0, this.evasiveTimer - dt);
    if (this._counterAimActive && this.evasiveTimer <= 0) {
      this._counterAimActive = false;
      this._counterAimDir.set(0, 0, 0);
      ctx.emitAIEvent?.(e, 'counter_aim_evade_completed');
    }
    // Counter-aim needs current visibility, not the perception system's brief
    // LOS-loss memory, so a Shooter never reacts to a cursor through a wall.
    const directlyVisibleToPlayer = sense.rawWorldLOS !== false && !visibilityOccluded;
    this._updateCounterAimThreat(dt, ctx, directlyVisibleToPlayer, playerPos);
    const tooClose = dist < this.kiteRange.min;
    const rushing = playerSpeed > 4.0 && dist < this.kiteRange.max && hasLOS;
    const prioritizeImmediateShot = this._shouldPrioritizeShot(dist, hasLOS, tacticalFireClear);
    if (prioritizeImmediateShot && this.relocating) {
      this.relocating = false;
      this.relocateTarget = null;
      this.relocateTimer = 0;
      ctx.emitAIEvent?.(e, 'relocation_cancelled_for_shot');
    }
    // Acquire new cover only after firing or when the current lane is blocked.
    // An already selected cover unit remains available for post-burst hiding.
    const canPlanCover = !!this.selectedCoverRoot || !prioritizeImmediateShot;
    const coverPlan = canPlanCover
      ? this._updateAllyCover(dt, playerPos, ctx, hasLOS && !tooClose && !rushing)
      : null;
    if ((tooClose || rushing) && this.evasiveTimer <= 0 && this.evasiveCooldown <= 0) {
      this.evasiveTimer = 0.7 + this.rng() * 0.4;     // 0.7–1.1s dash
      this.evasiveCooldown = 1.2 + this.rng() * 0.6;  // cool down before next dash
      // break telegraph/burst immediately
      this.inBurst = false;
      this.windupTime = 0;
      this._attackMode = null;
      this._setHeadGlow(false);
      this._updateAimLine(null, ctx.scene);
      // also consider relocation next
      if (!this.relocating) { this.relocating = true; this.relocateTarget = null; this.relocateTimer = 0; }
    }
  
    // 2) Movement: maintain standoff, peek when LOS blocked, relocate after bursts
    const desired = new THREE.Vector3();
    let allyCoverState = null;
    let movementState = null;
  
    // A ready, unobstructed shot owns the lane. Cover and relocation are
    // defensive actions for the cooldown between bursts, not prerequisites.
    if (prioritizeImmediateShot) {
      movementState = 'committing_to_firing_lane';
    } else if (this.evasiveTimer > 0) {
      if (this._counterAimActive && coverPlan) {
        const toCover = coverPlan.hideAnchor.clone().sub(e.position).setY(0);
        if (toCover.lengthSq() > 0.01) desired.add(toCover.normalize().multiplyScalar(2.2));
        allyCoverState = 'breaking_aim_to_ally_cover';
        this._setAllyCoverMode('hide', ctx);
      } else if (this._counterAimActive && this._counterAimDir.lengthSq() > 0) {
        desired.add(this._counterAimDir.clone().multiplyScalar(2.25));
      } else {
        const away = toPlayer.clone().setY(0);
        if (away.lengthSq() > 0) {
          away.normalize().multiplyScalar(-1);
          const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(this.strafeDir);
          desired.add(away.multiplyScalar(1.8)).add(side.multiplyScalar(0.9));
        }
      }
    } else if (coverPlan) {
      // Cooldown is spent tucked directly behind the frontline ally. When the
      // burst is ready, use a prevalidated lateral anchor to expose the muzzle
      // without asking the projectile system to ignore the cover unit.
      const peeking = this.inBurst || this.windupTime > 0 || this.cooldown <= 0;
      const anchor = peeking ? coverPlan.peekAnchor : coverPlan.hideAnchor;
      const toAnchor = anchor.clone().sub(e.position).setY(0);
      const anchorDistance = toAnchor.length();
      if (anchorDistance > 0.5) desired.add(toAnchor.multiplyScalar(1 / anchorDistance));
      allyCoverState = peeking
        ? 'peeking_from_ally_cover'
        : (anchorDistance > 0.65 ? 'moving_to_ally_cover' : 'holding_ally_cover');
      this._setAllyCoverMode(peeking ? 'peek' : 'hide', ctx);
    } else if (this.relocating) {
      // Relocation overrides normal behavior
      this.relocateTimer += dt;
      if (!this.relocateTarget) {
        this._beginRelocation(behaviorTarget, toPlayer);
      }
      if (this.relocateTarget) {
        const toAnchor = this.relocateTarget.clone().sub(e.position); toAnchor.y = 0;
        const d = toAnchor.length();
        if (d > 0.0001) desired.add(toAnchor.normalize());
        if (d < 0.75 || this.relocateTimer >= this.relocateTimeout) {
          this.relocating = false; this.relocateTarget = null; this.relocateTimer = 0;
          // small cooldown before next windup so it doesn't insta-fire on arrival
          this.cooldown = Math.max(this.cooldown, 0.4 + this.rng() * 0.3);
        }
      }
    } else if (hasLOS && !tacticalFireClear) {
      // An ally is temporary cover. Commit to one lateral side long enough to
      // clear the body instead of oscillating at the edge of the lane.
      if (this._peekCommitTimer <= 0 || this._peekCommitDir.lengthSq() === 0) {
        const forward = toPlayer.clone().setY(0).normalize();
        this._peekCommitDir.set(-forward.z, 0, forward.x).multiplyScalar(this.strafeDir);
        this._peekCommitTimer = 0.9;
      }
      desired.add(this._peekCommitDir);
      if (this._allyBlockedTimer >= 0.2) {
        this.inBurst = false;
        this.windupTime = 0;
        this._attackMode = null;
        movementState = 'repositioning_for_clear_shot';
      }
    } else if (visibilityOccluded) {
      // Close through the storm before beginning a telegraph. This keeps the
      // fog rule fair without leaving ranged enemies stranded on their ring.
      const close = playerPos.clone().sub(e.position).setY(0);
      if (close.lengthSq() > .0001) desired.add(close.normalize());
      this.inBurst = false;
      this.windupTime = 0;
      this._attackMode = null;
      movementState = 'closing_through_storm';
    } else if (!hasLOS && dist <= this.engageRange.max) {
      // Try to find a peek direction that reveals LOS around nearby cover
      let peekDir = this._peekCommitTimer > 0 ? this._peekCommitDir.clone() : null;
      if (!peekDir || peekDir.lengthSq() === 0) {
        peekDir = this._computePeekDesiredDir(e.position, behaviorTarget, ctx.objects, toPlayer.clone());
        if (peekDir?.lengthSq() > 0) {
          this._peekCommitDir.copy(peekDir);
          this._peekCommitTimer = 1.0;
        }
      }
      if (peekDir && peekDir.lengthSq() > 0) desired.add(peekDir);
      else {
        // fallback to circling to vary angle even if peek not found
        const fwd = toPlayer.clone().setY(0); if (fwd.lengthSq()>0) fwd.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        desired.add(side);
      }
      movementState = 'seeking_peek';
    } else if (this._worldPeekActive && this._worldPeekHoldTimer > 0 && rangeMovementMode === 'hold') {
      movementState = 'holding_peek_anchor';
    } else if (rangeMovementMode === 'retreat') {
      // backpedal
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (rangeMovementMode === 'close') {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize());
    } else {
      // strafe around player; if regrouping, widen standoff toward 22–28 and orbit until allies catch up
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) {
        const fwd = toPlayer.normalize();
        let side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
  
        // NEW: during windup, add subtle stutter-strafe so telegraphing isn't static
        if (this.windupTime > 0 && hasLOS) {
          this._stutterTimer += dt;
          if (this._stutterTimer > 0.22) { this._stutterTimer = 0; this.strafeDir *= -1; }
          side = side.multiplyScalar(1.2); // a bit more lateral pressure when aiming
        }
  
        desired.add(side);
        // occasionally switch strafe dir (less often if aiming)
        if (this.switchCooldown > 0) this.switchCooldown -= dt;
        else if (this.rng() < (this.windupTime > 0 ? 0.006 : 0.01)) { this.strafeDir *= -1; this.switchCooldown = 1.2; }
      }
    }
  
    const needsRoute = (!hasLOS && !visibilityOccluded) || (!sense.locomotionClear && rangeMovementMode !== 'hold');
    if (needsRoute && ctx.pathfind) {
      const subjectMoved = !this._routeAnchorSubject
        || this._routeAnchorSubject.distanceToSquared(behaviorTarget) > 4;
      if (!this._routeAnchor || this._routeAnchorRefresh <= 0 || subjectMoved) {
        const away = e.position.clone().sub(behaviorTarget).setY(0);
        if (away.lengthSq() === 0) away.set(1, 0, 0);
        away.normalize();
        this._routeAnchor = behaviorTarget.clone().add(away.multiplyScalar(15));
        this._routeAnchorSubject = behaviorTarget.clone();
        this._routeAnchorRefresh = 0.8;
      }
      ctx.pathfind.recomputeIfStale(this, this._routeAnchor, { cacheFor: 1.2 }).then(path => { this._path = path; });
      const waypoint = ctx.pathfind.nextWaypoint(this);
      if (waypoint) desired.set(waypoint.x - e.position.x, 0, waypoint.z - e.position.z).normalize();
      movementState = hasLOS ? 'routing_to_range' : 'seeking_peek';
    } else if (ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
      this._routeAnchor = null;
      this._routeAnchorSubject = null;
    }

    // Obstacle avoidance + separation
    const avoid = desired.lengthSq() > 0 ? ctx.avoidObstacles(e.position, desired, 1.6) : desired;
    const sep = ctx.separation(e.position, 1.2, e);
    // Cache forward used by movement to orient hit-jukes
    if (toPlayer.lengthSq() > 0) {
      const fwdCache = toPlayer.clone().setY(0);
      if (fwdCache.lengthSq()>0) this._lastFwd.copy(fwdCache.normalize());
    }
  
    // NEW: stronger steering while evasive
    const steer = desired.clone()
      .add(avoid.multiplyScalar(this.evasiveTimer > 0 ? 1.8 : 1.2))
      .add(sep.multiplyScalar(this.evasiveTimer > 0 ? 1.2 : 0.8));
  
    // Apply on-hit micro-juke impulse
    if (this._hitJukeTime > 0 && this._hitJukeDir.lengthSq() > 0) {
      this._hitJukeTime = Math.max(0, this._hitJukeTime - dt);
      steer.add(this._hitJukeDir.clone().multiplyScalar(1.1));
    }
  
    let movedVec = null;
    let movementResult = null;
    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      // NEW: speed boost while evasive
      const speedMul = this._counterAimActive ? 1.75 : (this.evasiveTimer > 0 ? 1.6 : 1.0);
      const step = steer.multiplyScalar(this.speed * speedMul * dt);
      const before = e.position.clone();
      movementResult = ctx.moveWithCollisions(e, step) || null;
      movedVec = e.position.clone().sub(before);
      movedVec.y = 0;
    }
  
    // Face the player smoothly (yaw only) so gun points generally toward target
    const inBandYaw = dist >= this.preferredRange.min && dist <= this.preferredRange.max;
    const aiming = this.inBurst || (hasLOS && inBandYaw && (this.windupTime > 0 || this.cooldown <= 0));
    const faceVec = aiming ? toPlayer.clone().setY(0) : (movedVec && movedVec.lengthSq() > 1e-6 ? movedVec.clone().setY(0) : toPlayer.clone().setY(0));
    if (faceVec.lengthSq() > 0) {
      faceVec.normalize();
      // Low-pass filter the facing vector to prevent vibration
      const lerpAmt = Math.min(1, 8 * dt); // ~8 Hz responsiveness
      this._faceDir.lerp(faceVec, lerpAmt);
      if (this._faceDir.lengthSq() > 0) this._faceDir.normalize();
    }
    const desiredYaw = Math.atan2(this._faceDir.x, this._faceDir.z); // +Z forward faces target
    const wrap = (a)=>{ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; };
    let dy = wrap(desiredYaw - this._yaw);
    const turnRate = 5.0; // slightly reduced to smooth out jitter
    this._yaw = wrap(this._yaw + Math.max(-turnRate*dt, Math.min(turnRate*dt, dy)));
    e.rotation.set(0, this._yaw, 0);

    const meleeDistance = Math.hypot(playerPos.x - e.position.x, playerPos.z - e.position.z);
    const clearMeleeContact = sense.rawWorldLOS !== false && sense.locomotionClear !== false;
    if (this._shouldStartGunButt(dt, meleeDistance, clearMeleeContact, movementResult)) {
      this._startGunButt(ctx);
      this._updateGunButt(0, ctx, playerPos, sense);
      return;
    }

    if (sense.searchActive) ctx.setAIState?.(e, 'searching');
    else if (this._counterAimActive) ctx.setAIState?.(e, allyCoverState || 'counter_aim_evading');
    else if (this.evasiveTimer > 0) ctx.setAIState?.(e, 'evading');
    else if (this.relocating) ctx.setAIState?.(e, 'relocating');
    else if (this.windupTime > 0) ctx.setAIState?.(e, this._attackMode === 'burst'
      ? (coverPlan ? 'burst_windup_from_ally_cover' : 'burst_windup')
      : (coverPlan ? 'single_windup_from_ally_cover' : 'single_windup'));
    else if (this.inBurst) ctx.setAIState?.(e, coverPlan ? 'firing_from_ally_cover' : 'firing_burst');
    else if (allyCoverState) ctx.setAIState?.(e, allyCoverState, { coverRoot: this.selectedCoverRoot });
    else if (movementState) ctx.setAIState?.(e, movementState, { blockerRoot: sense.blockingAlly || null });
    else if (rangeMovementMode === 'retreat') ctx.setAIState?.(e, 'retreating_to_range');
    else if (rangeMovementMode === 'close') ctx.setAIState?.(e, 'closing_to_range');
    else ctx.setAIState?.(e, 'holding_range');
  
    // 3) Shooting logic
    const inBand = dist >= this.preferredRange.min && dist <= this.preferredRange.max;
  
    // NEW: no firing while evasive
    if (this.evasiveTimer > 0) {
      if (this.windupTime > 0) {
        this.windupTime = 0;
        this._attackMode = null;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      }
      return; // skip shooting when dashing away
    }
  
    // Active special burst: fire without additional telegraph while LOS/inBand hold.
    if (this.inBurst) {
      // Ensure telegraph visuals are off during burst
      if (this._aimLine) this._updateAimLine(null, ctx.scene);
      this._setHeadGlow(false);
  
      // Cancel burst early if conditions break
      if (!(inBand && hasLOS && tacticalFireClear)) {
        this.inBurst = false;
        this.shotsThisBurst = 0;
        this.cooldown = Math.max(this.cooldown, 0.4 + this.rng() * 0.3);
      } else if (this.cooldown <= 0) {
        // Fire next shot in the burst
        const fired = this._fireProjectile(this._predictAimPoint(playerPos), ctx, 'burst');
        if (!fired) {
          this.inBurst = false;
          this.shotsThisBurst = 0;
          this.cooldown = Math.max(this.cooldown, 0.25);
          this._allyBlockedTimer = Math.max(this._allyBlockedTimer, 0.2);
        }
        // Mark suppression immediately after firing if target was stationary and exposed
        if (fired && ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;
  
        if (fired && this.shotsThisBurst >= this.maxBurst) {
          // End the special. Singles continue while the 10 second recharge runs.
          this.inBurst = false;
          this.shotsThisBurst = 0;
          this.cooldown = this.singleCadence;
          if (!this.selectedCoverRoot && !this.relocating) {
            this.relocating = true;
            this.relocateTarget = null;
            this.relocateTimer = 0;
          }
          // Reroll the next special for variety.
          this.maxBurst = 3 + ((this.rng() * 2) | 0); // 3–4
          this.baseCadence = 0.6 + this.rng() * 0.4; // intra-burst spacing
          this.windupRequired = 0.75 + this.rng() * 0.2;
        } else if (fired) {
          // Space next intra-burst shot
          this.cooldown = this.baseCadence;
        }
      }
    } else if (inBand && hasLOS && tacticalFireClear && this.cooldown <= 0) {
      if (!this._attackMode) {
        this._attackMode = this.burstCooldown <= 0 ? 'burst' : 'single';
        this.windupRequired = this._attackMode === 'burst'
          ? 0.75 + this.rng() * 0.2
          : 0.25 + this.rng() * 0.1;
        if (this._attackMode === 'burst') {
          ctx.emitAIEvent?.(this.root, 'shooter_burst_windup', {
            rechargeSeconds: this.burstRechargeSeconds
          });
        }
      }
      // Both attacks remain readable; the special uses the longer amber tell.
      this.windupTime += dt;
      this._setHeadGlow(true);
      this._updateAimLine(playerPos, ctx.scene, this._attackMode === 'burst' ? 0xffb020 : 0x10b981);
      // Mark suppression while telegraphing at a stationary, exposed player
      if (ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;
      if (!hasLOS) {
        // cancel windup if LOS broken
        this.windupTime = 0;
        this._attackMode = null;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      } else if (this.windupTime >= this.windupRequired) {
        const attackMode = this._attackMode || 'single';
        this._setHeadGlow(false);
        this.windupTime = 0;
        this._attackMode = null;
        this._updateAimLine(null, ctx.scene);
        if (attackMode === 'burst') {
          this.maxBurst = 3 + ((this.rng() * 2) | 0);
          this.baseCadence = 0.6 + this.rng() * 0.4;
        }
        const fired = this._fireProjectile(this._predictAimPoint(playerPos), ctx, attackMode);
        this.inBurst = attackMode === 'burst' && fired;
        if (fired && ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;
        if (!fired) {
          this.shotsThisBurst = 0;
          this.cooldown = Math.max(this.cooldown, 0.25);
          this._allyBlockedTimer = Math.max(this._allyBlockedTimer, 0.2);
        } else if (attackMode === 'single') {
          this.cooldown = this.singleCadence;
          ctx.emitAIEvent?.(this.root, 'shooter_single_fired', { nextShotSeconds: this.singleCadence });
        } else if (this.shotsThisBurst >= this.maxBurst) {
          // Degenerate rare case: maxBurst==1; end immediately
          this.inBurst = false;
          this.shotsThisBurst = 0;
          this.cooldown = this.singleCadence;
        } else {
          this.burstCooldown = this.burstRechargeSeconds;
          ctx.emitAIEvent?.(this.root, 'shooter_burst_started', {
            shots: this.maxBurst,
            rechargeSeconds: this.burstRechargeSeconds
          });
          this.cooldown = this.baseCadence;
        }
      }
    } else {
      if (this.windupTime > 0) {
        // cancel windup if leaving inBand/engage/LOS
        this.windupTime = 0;
        this._attackMode = null;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      }
    }
  }  

  _updateRangeMovementMode(distance) {
    const hysteresis = 0.45;
    if (this._rangeMovementMode === 'close' && distance <= this.preferredRange.max - hysteresis) {
      this._rangeMovementMode = 'hold';
    } else if (this._rangeMovementMode === 'retreat' && distance >= this.preferredRange.min + hysteresis) {
      this._rangeMovementMode = 'hold';
    }
    if (this._rangeMovementMode === 'hold') {
      if (distance > this.preferredRange.max) this._rangeMovementMode = 'close';
      else if (distance < this.preferredRange.min) this._rangeMovementMode = 'retreat';
    }
    return this._rangeMovementMode;
  }

  _updateCounterAimThreat(dt, ctx, hasLOS, playerPos) {
    if (this._counterAimActive) {
      this._aimThreatTime = 0;
      return true;
    }
    if (this.evasiveCooldown > 0 || ctx.enemyManager?._activeAITargetIsBait) {
      this._aimThreatTime = 0;
      return false;
    }

    if (!this._isUnderPlayerAim(ctx, hasLOS)) {
      // Tolerate a few jittery frames without preserving a nearly completed
      // threat forever when the player deliberately moves the crosshair away.
      this._aimThreatTime = Math.max(0, this._aimThreatTime - dt * 3);
      return false;
    }

    this._aimThreatTime += dt;
    if (this._aimThreatTime < this._aimThreatRequired) return false;
    this._startCounterAimEvasion(ctx, playerPos);
    return true;
  }

  _isUnderPlayerAim(ctx, hasLOS) {
    if (!hasLOS) return false;
    const origin = ctx.blackboard?.playerAimOrigin;
    const suppliedDirection = ctx.blackboard?.playerAimDirection;
    if (!origin || !suppliedDirection || suppliedDirection.lengthSq?.() <= 1e-8) return false;

    const direction = suppliedDirection.clone().normalize();
    const toBody = this.root.position.clone().sub(origin);
    const bodyDistance = toBody.length();
    if (bodyDistance > 36 || toBody.dot(direction) <= 0) return false;

    const rayEnd = origin.clone().add(direction.clone().multiplyScalar(bodyDistance + 1.5));
    const firstBody = ctx.enemyManager?._firstAllyOnSegment?.(origin, rayEnd, null, 0);
    if (firstBody) return firstBody.entry?.root === this.root;

    // Standalone/test fallback: intersect the camera ray with the Shooter's
    // collision body. The production manager path above also rejects a Shooter
    // hidden behind another enemy.
    const halfWidth = 0.56;
    const minY = this.root.position.y - 0.8;
    const maxY = minY + 1.7;
    let tMin = 0;
    let tMax = bodyDistance + 1.5;
    for (const [rayOrigin, rayDirection, min, max] of [
      [origin.x, direction.x, this.root.position.x - halfWidth, this.root.position.x + halfWidth],
      [origin.y, direction.y, minY, maxY],
      [origin.z, direction.z, this.root.position.z - halfWidth, this.root.position.z + halfWidth]
    ]) {
      if (Math.abs(rayDirection) < 1e-8) {
        if (rayOrigin < min || rayOrigin > max) return false;
        continue;
      }
      let near = (min - rayOrigin) / rayDirection;
      let far = (max - rayOrigin) / rayDirection;
      if (near > far) [near, far] = [far, near];
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      if (tMin > tMax) return false;
    }
    return tMax >= 0 && tMin <= bodyDistance + 1.5;
  }

  _startCounterAimEvasion(ctx, playerPos) {
    const THREE = this.THREE;
    const away = this.root.position.clone().sub(playerPos).setY(0);
    if (away.lengthSq() <= 1e-8) away.copy(this._lastFwd).multiplyScalar(-1);
    if (away.lengthSq() <= 1e-8) away.set(0, 0, 1);
    away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    const preferredSign = this.strafeDir >= 0 ? 1 : -1;
    let selected = null;
    for (const sign of [preferredSign, -preferredSign]) {
      const candidateDir = side.clone().multiplyScalar(sign).add(away.clone().multiplyScalar(0.22)).normalize();
      const probe = this.root.position.clone().add(candidateDir.clone().multiplyScalar(3.4));
      if (!ctx.positionClear || ctx.positionClear(this.root, probe)) {
        selected = candidateDir;
        this.strafeDir = sign;
        break;
      }
    }
    this._counterAimDir.copy(selected || away);
    this._counterAimActive = true;
    this._aimThreatTime = 0;
    this.evasiveTimer = Math.max(this.evasiveTimer, 0.65 + this.rng() * 0.25);
    this.evasiveCooldown = Math.max(this.evasiveCooldown, 1.6 + this.rng() * 0.5);

    this.inBurst = false;
    this.shotsThisBurst = 0;
    this.windupTime = 0;
    this._attackMode = null;
    this._setHeadGlow(false);
    this._updateAimLine(null, ctx.scene);

    if (!this.selectedCoverRoot) {
      this.relocating = true;
      this.relocateTimer = 0;
      this.relocateTarget = this.root.position.clone().add(
        this._counterAimDir.clone().multiplyScalar(this.relocateDistance * 0.65)
      );
    }
    ctx.emitAIEvent?.(this.root, 'counter_aim_evade_started', {
      reactionTime: this._aimThreatRequired,
      direction: this._counterAimDir.clone()
    });
  }

  _shouldPrioritizeShot(distance, hasLOS, tacticalFireClear) {
    const inBand = distance >= this.preferredRange.min && distance <= this.preferredRange.max;
    const attackReady = this.inBurst || this.windupTime > 0 || this.cooldown <= 0;
    return inBand && hasLOS && tacticalFireClear && attackReady && this.evasiveTimer <= 0;
  }

  _shouldStartGunButt(dt, distance, clearContact, movementResult) {
    if (!clearContact || distance > this.meleeRange) {
      this._closePressureTime = 0;
      return false;
    }

    this._closePressureTime += dt;
    const requested = movementResult?.requestedDistance || 0;
    const applied = movementResult?.appliedDistance || 0;
    const escapeBlocked = this.evasiveTimer > 0 && (
      movementResult?.blockedBy != null
      || (requested > 0.001 && applied < requested * 0.35)
    );
    return this._meleeCooldown <= 0 && (escapeBlocked || this._closePressureTime >= 0.35);
  }

  _startGunButt(ctx) {
    this._meleePhase = 'windup';
    this._meleeTimer = 0.38;
    this._meleeDidHit = false;
    this._closePressureTime = 0;
    this.evasiveTimer = 0;
    this._counterAimActive = false;
    this._counterAimDir.set(0, 0, 0);
    this.inBurst = false;
    this.shotsThisBurst = 0;
    this.windupTime = 0;
    this._attackMode = null;
    this._setHeadGlow(true);
    this._updateAimLine(null, ctx.scene);
    ctx.emitAIEvent?.(this.root, 'melee_started', {
      attack: 'shooter_gun_butt', windup: 0.38, reach: this.meleeRange
    });
  }

  _updateGunButt(dt, ctx, playerPos, sense = {}) {
    const e = this.root;
    const flat = playerPos.clone().sub(e.position).setY(0);
    const distance = flat.length();
    if (distance > 0.0001) {
      flat.multiplyScalar(1 / distance);
      this._yaw = Math.atan2(flat.x, flat.z);
      this._faceDir.copy(flat);
      e.rotation.set(0, this._yaw, 0);
    }

    this._meleeTimer = Math.max(0, this._meleeTimer - dt);
    ctx.setAIState?.(e, `gun_butt_${this._meleePhase}`);

    if (this._meleePhase === 'windup') {
      this._setGunButtPose(-0.95, -0.32, -0.18);
      if (this._meleeTimer > 0) return;
      this._meleePhase = 'active';
      this._meleeTimer = 0.12;
      this._meleeDidHit = false;
      ctx.setAIState?.(e, 'gun_butt_active');
    }

    if (this._meleePhase === 'active') {
      this._setGunButtPose(0.82, 0.28, -0.08);
      if (
        !this._meleeDidHit
        && distance <= this.meleeRange + 0.18
        && sense.rawWorldLOS !== false
        && sense.locomotionClear !== false
      ) {
        const damage = 16;
        const knockback = 1.35;
        this._meleeDidHit = true;
        ctx.damagePlayer?.(damage, {
          sourceKind: 'shooter_gun_butt', sourceRoot: e, ownerRoot: e
        });
        if (flat.lengthSq() > 0) {
          const push = flat.clone().multiplyScalar(knockback);
          ctx.applyPlayerKnockback?.(push);
          ctx.emitAIEvent?.(e, 'player_knockback', {
            ability: 'shooter_gun_butt', vector: push.clone(), magnitude: knockback
          });
        }
        ctx.emitAIEvent?.(e, 'melee_hit', {
          attack: 'shooter_gun_butt', damage, knockback
        });
      }
      if (this._meleeTimer > 0) return;
      this._meleePhase = 'recover';
      this._meleeTimer = 0.48;
      this._setHeadGlow(false);
      ctx.setAIState?.(e, 'gun_butt_recover');
    }

    if (this._meleePhase === 'recover') {
      this._blendGunButtPoseToRest(Math.min(1, dt * 10));
      if (this._meleeTimer > 0) return;
      this._resetGunButtPose();
      this._meleePhase = 'idle';
      this._meleeCooldown = 1.35;
      this.evasiveTimer = Math.max(this.evasiveTimer, 0.75);
      this.evasiveCooldown = Math.max(this.evasiveCooldown, 1.5);
      this.relocating = true;
      this.relocateTarget = null;
      this.relocateTimer = 0;
    }
  }

  _setGunButtPose(rightArmX, rightArmZ, leftArmX) {
    const rightArm = this._refs?.rightArm;
    if (rightArm && this._rightArmRestRotation) {
      rightArm.rotation.set(
        this._rightArmRestRotation.x + rightArmX,
        this._rightArmRestRotation.y,
        this._rightArmRestRotation.z + rightArmZ
      );
    }
    const leftArm = this._refs?.leftArm;
    if (leftArm && this._leftArmRestRotation) {
      leftArm.rotation.set(
        this._leftArmRestRotation.x + leftArmX,
        this._leftArmRestRotation.y,
        this._leftArmRestRotation.z
      );
    }
  }

  _blendGunButtPoseToRest(amount) {
    for (const [arm, rest] of [
      [this._refs?.rightArm, this._rightArmRestRotation],
      [this._refs?.leftArm, this._leftArmRestRotation]
    ]) {
      if (!arm || !rest) continue;
      arm.rotation.x += (rest.x - arm.rotation.x) * amount;
      arm.rotation.y += (rest.y - arm.rotation.y) * amount;
      arm.rotation.z += (rest.z - arm.rotation.z) * amount;
    }
  }

  _resetGunButtPose() {
    if (this._refs?.rightArm && this._rightArmRestRotation) {
      this._refs.rightArm.rotation.copy(this._rightArmRestRotation);
    }
    if (this._refs?.leftArm && this._leftArmRestRotation) {
      this._refs.leftArm.rotation.copy(this._leftArmRestRotation);
    }
  }

  _hasLineOfSight(_fromRoot, targetPos, objects) {
    const THREE = this.THREE;
    const origin = this._muzzleWorld();
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _predictAimPoint(playerPos) {
    const origin = this._muzzleWorld();
    const travelSeconds = Math.max(0.08, Math.min(1.25, origin.distanceTo(playerPos) / 25));
    return playerPos.clone().add(this._playerVelocity.clone().multiplyScalar(travelSeconds));
  }

  _fireProjectile(targetPos, ctx, attackMode = 'single') {
    const THREE = this.THREE;
    // Fire from gun muzzle if available; otherwise from chest height
    let origin;
    if (this._refs && this._refs.muzzle) {
      // Preserve the authored showcase pose. The body already turns toward its
      // target during windup; independently aiming this nested -Z weapon mount
      // with Object3D.lookAt twists the gun backward relative to the hands.
      origin = this._refs.muzzle.getWorldPosition(new THREE.Vector3());
      // Flash and recoil
      this._flashTimer = 0.08;
      this._recoil = 1.0;
    } else {
      origin = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.2, this.root.position.z);
    }

    const finalLine = ctx.tacticalLineClear?.(this.root, origin, targetPos, 0.18);
    const finalSense = finalLine ? null : ctx.sensePlayer?.(this.root, 0, origin);
    const worldClear = finalLine ? finalLine.worldClear : finalSense?.rawWorldLOS;
    const tacticalClear = finalLine ? finalLine.clear : finalSense?.tacticalFireClear;
    const blockerRoot = finalLine?.blockerRoot || finalSense?.blockingAlly || null;
    if (worldClear === false || tacticalClear === false) {
      ctx.emitAIEvent?.(this.root, 'shot_withheld', {
        reason: blockerRoot ? 'ally_blocked' : 'world_blocked',
        blockerRoot
      });
      return false;
    }
  
    // Base direction
    let dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) dir.set(0,0,1); else dir.normalize();
  
    // --- Spread model: base + current bloom, random within cone ---
    const base = this.spreadBase;
    const bloom = this.currentSpread;
    const cone = Math.min(this.spreadMax, base + bloom);
  
    if (cone > 0) {
      // Sample a random direction within a cone around dir
      // Method: choose random small rotation axis perpendicular to dir and rotate by angle
      const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const upOrtho = new THREE.Vector3().crossVectors(dir, right).normalize();
      // Use a squarer distribution (closer to center) rather than uniform edge
      const u = this.rng(), v = this.rng();
      const angle = cone * (Math.sqrt(u)); // central bias
      const yaw = 2 * Math.PI * v;
      // small offset vector in the tangent plane
      const offset = right.multiplyScalar(Math.cos(yaw) * Math.tan(angle))
        .add(upOrtho.multiplyScalar(Math.sin(yaw) * Math.tan(angle)));
      dir = dir.clone().add(offset).normalize();
    }
  
    // Update bloom for next shots and cap it
    this.currentSpread = Math.min(this.spreadMax, this.currentSpread + this.spreadBloomPerShot);
  
    const speed = 25; // units/s
  
    const velocity = dir.multiplyScalar(speed);
    const projectileDamage = 20;
    const pooled = ctx._spawnBullet?.('shooter', origin, velocity, 2.5, projectileDamage, this.root);
    if (!pooled) {
      const mesh = new THREE.Mesh(
        getCachedRenderResource(
          _shooterProjectileGeometries,
          THREE,
          () => new THREE.SphereGeometry(0.12, 10, 10)
        ),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      mesh.position.copy(origin);
      mesh.material.transparent = true;
      mesh.material.opacity = 1;
      ctx.scene.add(mesh);
      this.projectiles.push({ mesh, velocity, life: 0, maxLife: 2.5, damage: projectileDamage, ownerRoot: this.root });
    }
    if (attackMode === 'burst') this.shotsThisBurst += 1;
    ctx.emitAIEvent?.(this.root, 'projectile_fired', {
      kind: 'shooter', origin: origin.clone(), target: targetPos.clone(),
      attackMode, damage: projectileDamage, worldClear: true, tacticalClear: true
    });
    return true;
  }  

  onHit(damage, isHead) {
    // Short lateral juke on hit (0.12–0.2s)
    const base = 0.12 + this.rng() * 0.08;
    this._hitJukeTime = Math.max(this._hitJukeTime, base);
    // pick random lateral relative to facing toward player
    const fwd = this._lastFwd.lengthSq() > 0 ? this._lastFwd.clone() : new this.THREE.Vector3(0,0,1);
    const side = new this.THREE.Vector3(-fwd.z, 0, fwd.x);
    const sideSign = this.rng() < 0.5 ? 1 : -1;
    this._hitJukeDir.copy(side.multiplyScalar(sideSign));
  }

  _updateProjectiles(dt, ctx) {
    const THREE = this.THREE;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const prev = p.mesh.position.clone();
      const step = p.velocity.clone().multiplyScalar(dt);
      const next = prev.clone().add(step);

      const allyHit = ctx.enemyManager?._firstAllyOnSegment?.(prev, next, p.ownerRoot || this.root, 0.04);
      if (allyHit) {
        ctx.emitAIEvent?.(this.root, 'projectile_blocked_by_ally', { blockerRoot: allyHit.entry.root, kind: 'shooter' });
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Raycast against world objects along the step
      const dir = step.clone().normalize();
      const dist = step.length();
      this._raycaster.set(prev, dir);
      this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(ctx.objects, false);
      if (hits && hits.length > 0) {
        ctx.emitAIEvent?.(this.root, 'projectile_blocked_by_world', {
          kind: 'shooter_projectile', origin: prev.clone(), impact: hits[0].point?.clone?.()
        });
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check hit with player (capsule-like band at chest height)
      const playerPos = ctx.player.position;
      const y = next.y;
      if (y >= 1.2 && y <= 1.8) {
        const dx = next.x - playerPos.x;
        const dz = next.z - playerPos.z;
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < 0.6) {
          ctx.damagePlayer?.(p.damage, {
            sourceKind: 'shooter_projectile', sourceRoot: this.root, ownerRoot: this.root,
            sourceOrigin: next.clone(), projectilePreviousPosition: prev.clone(), impactPosition: next.clone(),
            worldPathClear: true
          });
          ctx.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Advance and fade slightly
      p.mesh.position.copy(next);
      p.life += dt;
      if (p.mesh.material && p.mesh.material.opacity !== undefined) {
        p.mesh.material.opacity = Math.max(0, 1 - p.life / p.maxLife);
      }
      if (p.life >= p.maxLife) {
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _setHeadGlow(active) {
    const head = this.root.userData.head;
    if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      // Only modify this head's emissive; no shared materials since we clone
      mat.emissive.setHex(active ? 0xffcc66 : this._savedEmissive.getHex());
    } else {
      // fallback: scale head a bit during windup
      head.scale.setScalar(active ? 1.08 : 1.0);
    }
  }

  _hasLineOfSightFrom(originPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(originPos.x, originPos.y + 1.4, originPos.z);
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _computePeekDesiredDir(fromPos, playerPos, objects, toPlayerVec) {
    // Sample lateral offsets to try to reveal LOS around cover
    const THREE = this.THREE;
    const fwd = toPlayerVec.setY(0); if (fwd.lengthSq() === 0) return null; fwd.normalize();
    const left = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const right = left.clone().multiplyScalar(-1);
    const step = 0.9; // meters per sample
    const maxSamples = 8; // try up to ~7.2m each side
    let bestDir = null;
    let bestScore = -Infinity;
    for (const dir of [left, right]) {
      for (let i = 1; i <= maxSamples; i++) {
        const cand = fromPos.clone().add(dir.clone().multiplyScalar(step * i));
        // Prefer candidates that gain LOS
        const los = this._hasLineOfSightFrom(cand, playerPos, objects);
        const score = (los ? 10 : 0) - i * 0.3; // bias closer peeks
        if (score > bestScore) {
          bestScore = score; bestDir = cand.clone().sub(fromPos).setY(0).normalize();
        }
        if (los) break; // stop further in this direction once LOS achieved
      }
    }
    return bestDir;
  }

  _updateAllyCover(dt, playerPos, ctx, permitted) {
    this._coverRefreshTimer = Math.max(0, this._coverRefreshTimer - dt);
    if (!permitted) {
      this._releaseAllyCover(ctx, 'cover_unsafe');
      return null;
    }

    const manager = ctx.enemyManager;
    const coverStillAlive = !this.selectedCoverRoot
      || !manager?.enemies
      || manager.enemies.has(this.selectedCoverRoot);
    if (!coverStillAlive || (this.selectedCoverRoot?.userData?.hp ?? 1) <= 0) {
      this._releaseAllyCover(ctx, 'cover_removed');
    }

    let plan = this.selectedCoverRoot
      ? this._buildAllyCoverPlan(this.selectedCoverRoot, playerPos, ctx)
      : null;
    if (plan) return plan;
    if (this._coverRefreshTimer > 0) return null;
    this._coverRefreshTimer = 0.45;

    const selfPosition = this.root.position;
    const playerToSelf = selfPosition.clone().sub(playerPos).setY(0);
    const selfDistance = playerToSelf.length();
    if (selfDistance <= 0.001) return null;
    playerToSelf.multiplyScalar(1 / selfDistance);

    let bestRoot = null;
    let bestPlan = null;
    let bestScore = -Infinity;
    const candidates = ctx.nearbyAllies?.(selfPosition, 18, this.root, {
      layer: 'ground', verticalRadius: 3
    }) || [];
    for (const entry of candidates) {
      const coverRoot = entry?.root;
      if (!isShooterMobileCover(coverRoot) || (coverRoot.userData?.hp ?? 1) <= 0) continue;
      const playerToCover = coverRoot.position.clone().sub(playerPos).setY(0);
      const coverDistance = playerToCover.length();
      const projection = playerToCover.dot(playerToSelf);
      const lateral = Math.abs(playerToCover.x * playerToSelf.z - playerToCover.z * playerToSelf.x);
      // The frontline body must remain between the player and Shooter. A small
      // lateral allowance lets the Shooter deliberately align behind it.
      if (projection <= 1.5 || projection >= selfDistance - 0.7 || lateral > 4.5) continue;
      const candidatePlan = this._buildAllyCoverPlan(coverRoot, playerPos, ctx);
      if (!candidatePlan) continue;
      const travel = Math.hypot(
        candidatePlan.hideAnchor.x - selfPosition.x,
        candidatePlan.hideAnchor.z - selfPosition.z
      );
      const typeBonus = (coverRoot.userData?.behaviorId || coverRoot.userData?.type) === 'tank' ? 3 : 0;
      const score = 12 + typeBonus - lateral * 1.4 - travel * 0.35 - Math.abs(coverDistance - 7) * 0.08;
      if (score > bestScore) {
        bestScore = score;
        bestRoot = coverRoot;
        bestPlan = candidatePlan;
      }
    }

    if (!bestRoot) {
      this._releaseAllyCover(ctx, 'no_viable_cover');
      return null;
    }
    if (bestRoot !== this.selectedCoverRoot) {
      this._releaseAllyCover(ctx, 'cover_reselected');
      this.selectedCoverRoot = bestRoot;
      this.relocating = false;
      this.relocateTarget = null;
      this.relocateTimer = 0;
      this._coverMode = 'none';
      ctx.emitAIEvent?.(this.root, 'ally_cover_selected', {
        coverRoot: bestRoot,
        coverType: bestRoot.userData?.behaviorId || bestRoot.userData?.type
      });
    }
    return bestPlan;
  }

  _buildAllyCoverPlan(coverRoot, playerPos, ctx) {
    if (!coverRoot?.position || !playerPos) return null;
    const THREE = this.THREE;
    const away = coverRoot.position.clone().sub(playerPos).setY(0);
    const coverPlayerDistance = away.length();
    if (coverPlayerDistance < 1.5) return null;
    away.multiplyScalar(1 / coverPlayerDistance);

    const selfProfile = ctx.enemyManager?._profileForRoot?.(this.root) || { collisionRadius: 0.55 };
    const coverProfile = ctx.enemyManager?._profileForRoot?.(coverRoot) || { collisionRadius: 0.58 };
    const selfPlayerDistance = Math.hypot(
      this.root.position.x - playerPos.x,
      this.root.position.z - playerPos.z
    );
    const bodyClearance = selfProfile.collisionRadius + coverProfile.collisionRadius + 0.35;
    const nearestSafePlayerDistance = coverPlayerDistance + bodyClearance;
    if (nearestSafePlayerDistance > this.preferredRange.max - 0.15) return null;
    const desiredPlayerDistance = Math.max(
      13,
      nearestSafePlayerDistance,
      Math.min(17.5, selfPlayerDistance)
    );
    const distanceBehindCover = desiredPlayerDistance - coverPlayerDistance;
    const hideAnchor = coverRoot.position.clone().add(away.clone().multiplyScalar(distanceBehindCover));
    hideAnchor.y = this.root.position.y;
    if (ctx.positionClear && !ctx.positionClear(this.root, hideAnchor, coverRoot)) return null;

    const side = new THREE.Vector3(-away.z, 0, away.x);
    const peekOffset = Math.max(1.25, Math.min(
      4.5,
      (coverProfile.collisionRadius + 0.16) * desiredPlayerDistance / Math.max(2.5, coverPlayerDistance)
        + selfProfile.collisionRadius * 0.35
    ));
    const target = playerPos.clone();
    target.y = playerPos.y || 1.6;
    let peekAnchor = null;
    for (const sign of [this._coverPeekSign, -this._coverPeekSign]) {
      const candidate = hideAnchor.clone().add(side.clone().multiplyScalar(peekOffset * sign));
      if (ctx.positionClear && !ctx.positionClear(this.root, candidate, coverRoot)) continue;
      if (!this._hasLineOfSightFrom(candidate, target, ctx.objects || [])) continue;
      const origin = candidate.clone();
      origin.y += 1.4;
      const line = ctx.tacticalLineClear?.(this.root, origin, target, 0.04);
      if (line && !line.clear) continue;
      peekAnchor = candidate;
      this._coverPeekSign = sign;
      break;
    }
    if (!peekAnchor) return null;
    return { coverRoot, hideAnchor, peekAnchor };
  }

  _setAllyCoverMode(mode, ctx) {
    if (!this.selectedCoverRoot || this._coverMode === mode) return;
    this._coverMode = mode;
    ctx.emitAIEvent?.(this.root, mode === 'peek' ? 'ally_cover_peek_started' : 'ally_cover_hidden', {
      coverRoot: this.selectedCoverRoot
    });
  }

  _releaseAllyCover(ctx, reason) {
    if (!this.selectedCoverRoot) return;
    const coverRoot = this.selectedCoverRoot;
    this.selectedCoverRoot = null;
    this._coverMode = 'none';
    ctx?.emitAIEvent?.(this.root, 'ally_cover_released', { coverRoot, reason });
  }

  _beginRelocation(playerPos, toPlayer) {
    const THREE = this.THREE;
    const fwd = toPlayer.clone().setY(0); if (fwd.lengthSq() > 0) fwd.normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.rng() < 0.5 ? 1 : -1);
    // move laterally relative to current position to change angle on the player
    const target = this.root.position.clone().add(side.multiplyScalar(this.relocateDistance));
    this.relocateTarget = target;
    this._worldPeekActive = false;
    this._worldPeekHoldTimer = 0;
  }

  _updateAimLine(targetPos, scene, color = 0x10b981) {
    const THREE = this.THREE;
    if (!targetPos) {
      if (this._aimLine) this._aimLine.visible = false;
      return;
    }
    const from = this._muzzleWorld();
    if (!this._aimLine) {
      const g = new THREE.BufferGeometry().setFromPoints([from, targetPos]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      this._aimLine = new THREE.Line(g, m);
      scene.add(this._aimLine);
    } else {
      this._aimLine.visible = true;
      const pos = this._aimLine.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
      pos.needsUpdate = true;
    }
  }

  _muzzleWorld() {
    const THREE = this.THREE;
    if (this._refs && this._refs.muzzle && this._refs.muzzle.parent) {
      try { return this._refs.muzzle.getWorldPosition(new THREE.Vector3()); } catch (e) { logError(e); }
    }
    return new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
  }

  onRemoved(scene) {
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles.length = 0;
    if (this._aimLine) {
      scene.remove(this._aimLine);
      this._aimLine.geometry?.dispose?.();
      this._aimLine.material?.dispose?.();
      this._aimLine = null;
    }
  }
}
