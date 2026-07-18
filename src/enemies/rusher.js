import {
  createEnhancedEliteRusherBot,
  createEnhancedExplosiveRusherBot,
  createEnhancedRunnerBot
} from '../assets/enemy-retrofits.js';
import { logError } from '../util/log.js';
import { cloneNodeMaterial, instantiateSharedTemplate } from './render-template.js';

// Variant definitions with unique palettes and stats
export const RUSHER_VARIANTS = {
  basic: {
    hp: 60,
    speedMin: 6.4,
    speedMax: 7.9,
    dashDuration: 0.5,
    windUp: 0.25,
    color: 0xf97316,
    palette: {
      accent: 0xf97316,
      glow: 0xf97316
    }
  },
  elite: {
    hp: 90,
    speedMin: 7.4,
    speedMax: 8.8,
    dashDuration: 0.6,
    windUp: 0.45,
    color: 0x6366f1,
    palette: {
      accent: 0x6366f1,
      glow: 0x6366f1
    }
  },
  explosive: {
    hp: 70,
    speedMin: 6.0,
    speedMax: 7.0,
    dashDuration: 0.55,
    windUp: 0.35,
    color: 0xfacc15,
    explodesOnDeath: true,
    explosionRadius: 3.5,
    explosionDamage: 55,
    palette: {
      accent: 0xfacc15,
      glow: 0xfacc15
    }
  }
};

const _rusherTemplates = new WeakMap();

// Mild screen shake when a dash connects
const IMPACT_SHAKE = { strength: 0.1, duration: 0.15 };

export class RusherEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.rng = rng;

    const variantName = cfg.variant || 'basic';
    const v = RUSHER_VARIANTS[variantName] || RUSHER_VARIANTS.basic;
    this.variant = variantName;
    this.cfg = { ...cfg, ...v };

    // Slim, agile runner model per variant
    let templatesForThree = _rusherTemplates.get(THREE);
    if (!templatesForThree) {
      templatesForThree = new Map();
      _rusherTemplates.set(THREE, templatesForThree);
    }
    const built = instantiateSharedTemplate(templatesForThree, variantName, () => {
      const create = variantName === 'elite'
        ? createEnhancedEliteRusherBot
        : (variantName === 'explosive' ? createEnhancedExplosiveRusherBot : createEnhancedRunnerBot);
      return create({ THREE, mats, scale: 0.6, palette: v.palette });
    });
    const body = built.root; const head = built.head; this._animRefs = built.refs || {};
    body.position.copy(spawnPos);
    body.rotation.x = 0; // world yaw only

    this._bladeRef = this._animRefs.blade || null;
    cloneNodeMaterial(this._bladeRef);

    // Keep compatibility with existing hit logic
    body.userData = { type: cfg.type, head, hp: v.hp, maxHp: v.hp };
    this.root = body;

    // Movement parameters
    this.speed = v.speedMin + this.rng() * (v.speedMax - v.speedMin);
    this._prevPlayerPos = null;
    this._playerVel = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0; this._walkPhase = 0;
    // Dash behavior
    this._dashTimer = 0;           // active dash time left
    this._dashCooldown = 0;        // until next dash available
    this._dashDir = new THREE.Vector3();
    this._charging = false;       // currently charging forward
    this._dashTotal = 0;          // total dash duration at launch
    this._overrunTimer = 0;       // extra run time after dash if missed
    this._hitCooldown = 0;        // time until next hit allowed
    this._hasDealtHit = false;    // whether we hit during current dash
    this._lastPos = body.position.clone();
    this._recoverTimer = 0;       // post-dash recovery time
    this._windUpTimer = 0;        // pre-dash wind-up time
    this._windUpTotal = 0;
    this._windUpCorrected = false;
    this._windUpSound = null;     // handle to charging audio
    this._stunTimer = 0;          // self-stun time after failed dash
    this._flinchTimer = 0;        // time after being interrupted by damage
    this._flinchThreshold = 25;   // damage needed during dash to interrupt
    this._flinchAccum = 0;        // accumulated damage while dashing
    this._exploded = false;       // whether explosion has been triggered
    this._lastCtx = null;         // last update context for onRemoved
    this._stuckTime = 0;          // time spent moving negligibly

    // Spawn delay: wander briefly before engaging the player
    this._spawnDelay = 3 + this.rng() * 2; // 3-5s
    this._wanderDir = new THREE.Vector3(this.rng() * 2 - 1, 0, this.rng() * 2 - 1).normalize();
    this._wanderTimer = 0.5 + this.rng() * 0.5;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    this._lastCtx = ctx;
    const e = this.root;
    if (this.cfg.explodesOnDeath && e.userData.hp <= 0 && !this._exploded) {
      this._explode(ctx);
      ctx.enemyManager?.remove?.(e);
      return;
    }
    if (this._spawnDelay > 0) {
      ctx.setAIState?.(e, 'spawn_wander');
      this._spawnDelay = Math.max(0, this._spawnDelay - dt);
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._wanderDir.set(this.rng() * 2 - 1, 0, this.rng() * 2 - 1).normalize();
        this._wanderTimer = 0.6 + this.rng() * 0.8;
      }
      const step = this._wanderDir.clone().multiplyScalar(this.speed * 0.4 * dt);
      const before = e.position.clone();
      ctx.moveWithCollisions(e, step);
      const movedVec = e.position.clone().sub(before); movedVec.y = 0;
      const speedNow = movedVec.length() / Math.max(dt, 0.00001);
      if (movedVec.lengthSq() > 1e-6) {
        const desiredYaw = Math.atan2(movedVec.x, movedVec.z);
        let deltaYaw = desiredYaw - this._yaw; deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = 10.0;
        this._yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, deltaYaw));
        e.rotation.set(0, this._yaw, 0);
      }
      e.rotation.x = -0.04;
      this._walkPhase += Math.min(18.0, 7.0 + speedNow * 0.3) * dt;
      const swing = Math.sin(this._walkPhase) * Math.min(0.8, 0.18 + speedNow * 0.03);
      if (this._animRefs) {
        const la = this._animRefs.leftArm, ra = this._animRefs.rightArm;
        const ll = this._animRefs.leftLeg, rl = this._animRefs.rightLeg;
        if (la && ra) { la.rotation.x = swing * 1.1; ra.rotation.x = -swing * 1.1; }
        if (ll && rl) { ll.rotation.x = -swing; rl.rotation.x = swing; }
      }
      try {
        const blade = this._bladeRef;
        if (blade && blade.material && blade.material.emissiveIntensity != null) {
          blade.material.emissiveIntensity = 0.7;
        }
      } catch (e) { logError(e); }
      this._lastPos.copy(e.position);
      return;
    }

    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    const sense = ctx.sensePlayer?.(e, dt) || {
      rawWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      stableWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      locomotionClear: true,
      pursuitTarget: playerPos.clone()
    };
    const navigationTarget = sense.pursuitTarget;
    if (this._hitCooldown > 0) this._hitCooldown = Math.max(0, this._hitCooldown - dt);
    if (this._recoverTimer > 0) this._recoverTimer = Math.max(0, this._recoverTimer - dt);
    if (this._stunTimer > 0) this._stunTimer = Math.max(0, this._stunTimer - dt);
    if (this._flinchTimer > 0) this._flinchTimer = Math.max(0, this._flinchTimer - dt);
    if (this._windUpTimer > 0) {
      this._windUpTimer = Math.max(0, this._windUpTimer - dt);
      if (this._windUpTimer === 0) {
        const corridor = navigationTarget ? ctx.chargeCorridorClear?.(e, navigationTarget, 0.1) : { clear: false };
        if (!sense.rawWorldLOS || !sense.locomotionClear || corridor?.clear === false) {
          this._dashCooldown = Math.max(this._dashCooldown, 0.35);
          ctx.emitAIEvent?.(e, 'charge_cancelled', { reason: corridor?.clear === false ? 'ally_blocked' : 'lost_sight', blockerRoot: corridor?.blockerRoot || null });
        } else {
          // The elite gets exactly one final predictive correction before lock.
          if (this.variant === 'elite' && !this._windUpCorrected) {
            const corrected = playerPos.clone().add(this._playerVel.clone().multiplyScalar(0.18)).sub(e.position).setY(0);
            if (corrected.lengthSq() > 0) this._dashDir.copy(corrected.normalize());
            this._windUpCorrected = true;
          }
          this._dashTimer = (this.cfg.dashDuration ?? 0.5) + this.rng() * 0.2;
          this._dashTotal = this._dashTimer;
          this._overrunTimer = 0;
          this._charging = true;
          this._hitCooldown = 0;
          this._hasDealtHit = false;
          this._flinchAccum = 0;
          ctx.emitAIEvent?.(e, 'charge_started', { variant: this.variant });
          try {
            this._windUpSound?.stop?.();
            window?._SFX?.dashWhoosh?.();
            window?._EFFECTS?.spawnDashTrail?.(e.position.clone(), this._dashDir.clone(), this.cfg.color);
          } catch (e) { logError(e); }
        }
        this._windUpSound = null;
      }
    }
    if (dist < 2.0 && sense.rawWorldLOS && sense.locomotionClear && this._charging && ctx.damagePlayer && this._hitCooldown <= 0 && !this._hasDealtHit) {
      ctx.damagePlayer(20, { sourceKind: 'rusher_charge', sourceRoot: e, ownerRoot: e });
      this._hitCooldown = 0.8;
      this._hasDealtHit = true;
      ctx.emitAIEvent?.(e, 'charge_hit', { damage: 20 });
      try {
        window?._EFFECTS?.screenShake?.(IMPACT_SHAKE.strength, IMPACT_SHAKE.duration);
        window?._EFFECTS?.spawnDashImpact?.(e.position.clone(), this.cfg.color);
      } catch (e) { logError(e); }
    }
    if (dist > 70 || (!navigationTarget && !this._charging)) {
      ctx.setAIState?.(e, sense.searchActive ? 'searching' : 'idle_unaware');
      return;
    }

    const toNavigation = (navigationTarget || playerPos).clone().sub(e.position).setY(0);
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();
    if (toNavigation.lengthSq() > 0) toNavigation.normalize();

    // Update player velocity estimate (EMA)
    if (sense.stableWorldLOS && this._prevPlayerPos) {
      const delta = playerPos.clone().sub(this._prevPlayerPos);
      const instVel = delta.multiplyScalar(dt > 0 ? 1 / dt : 0);
      this._playerVel.lerp(instVel, Math.min(1, 0.4 + dt * 0.6));
      this._playerVel.y = 0;
    }
    if (sense.stableWorldLOS) this._prevPlayerPos = playerPos.clone();

    // Desired direction with intercept prediction
    const steeringTarget = sense.stableWorldLOS ? playerPos : navigationTarget;
    const toPlayerFlat = steeringTarget.clone().setY(0).sub(new THREE.Vector3(e.position.x, 0, e.position.z));
    const horizDist = toPlayerFlat.length();
    const leadTime = Math.max(0, Math.min(0.5, (horizDist / Math.max(0.1, this.speed)) * 0.25));
    const predicted = steeringTarget.clone().add(sense.stableWorldLOS ? this._playerVel.clone().multiplyScalar(leadTime) : new THREE.Vector3());
    const toPred = predicted.sub(e.position); toPred.y = 0;
    let desired = toPred.lengthSq() > 0 ? toPred.normalize() : toNavigation.clone();

    const hasLOS = sense.stableWorldLOS;
    const isStuck = this._stuckTime > 0.4;
    if ((!hasLOS || !sense.locomotionClear || isStuck) && ctx.pathfind && !this._charging) {
      ctx.setAIState?.(e, sense.searchActive ? 'searching' : 'routing');
      ctx.pathfind.recomputeIfStale(this, navigationTarget).then(p => { this._path = p; });
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) desired = dir.normalize();
      }
    } else if (hasLOS && !isStuck && ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
    }

    const chargeCorridor = ctx.chargeCorridorClear?.(e, predicted, this.variant === 'explosive' ? 0.25 : 0.1) || { clear: true };
    if (!this._charging && chargeCorridor.clear === false && chargeCorridor.blockerRoot) {
      const blockerDir = chargeCorridor.blockerRoot.position.clone().sub(e.position).setY(0);
      if (blockerDir.lengthSq() > 0) {
        blockerDir.normalize();
        const side = new THREE.Vector3(-blockerDir.z, 0, blockerDir.x);
        desired.add(side.multiplyScalar(this.variant === 'explosive' ? 1.4 : 1.0)).normalize();
      }
      ctx.setAIState?.(e, 'clearing_charge_lane', { blockerRoot: chargeCorridor.blockerRoot });
    }

    // Avoid obstacles and separation unless currently charging
    if (!this._charging) {
      const avoid = ctx.avoidObstacles(e.position, desired, 2.2);
      const sep = ctx.separation(e.position, 1.0, e);
      desired = desired.multiplyScalar(1.0).add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.6)).normalize();
    }

    if (!this._charging && dist < 5 && this._windUpTimer <= 0 && this._recoverTimer <= 0 && this._stunTimer <= 0 && this._flinchTimer <= 0) {
      desired.negate();
    }

    if (!this._charging && dist < 2) {
      const repel = toPlayer.clone().negate().normalize();
      desired = desired.add(repel.multiplyScalar(0.5)).normalize();
    }

    // Dash logic: burst when mid-range and LOS is clear
    if (this._dashCooldown > 0) this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    if (this._charging) {
      if (this._dashTimer > 0) {
        this._dashTimer = Math.max(0, this._dashTimer - dt);
        if (this._dashTimer === 0 && !this._hasDealtHit) {
          const overrunFrac = 0.2 + this.rng() * 0.2;
          this._overrunTimer = this._dashTotal * overrunFrac;
        }
      } else if (this._overrunTimer > 0) {
        this._overrunTimer = Math.max(0, this._overrunTimer - dt);
      }
      if (this._dashTimer === 0 && this._overrunTimer === 0) {
        this._charging = false;
        this._dashTotal = 0;
        this._recoverTimer = 0.7 + this.rng() * 0.4;
        if (!this._hasDealtHit) this._stunTimer = 1.0 + this.rng() * 0.4;
        this._flinchAccum = 0;
        this._dashCooldown = 1.2 + this.rng() * 0.8;
      }
    }
    const canDash = (dist >= 5 && dist <= 20) && !this._charging && this._dashCooldown <= 0 && this._recoverTimer <= 0 && this._windUpTimer <= 0 && this._stunTimer <= 0 && this._flinchTimer <= 0 && hasLOS && sense.locomotionClear && chargeCorridor.clear;
    if (canDash && this.rng() < 1.2 * dt) {
      this._windUpTimer = this.cfg.windUp || 0.3;
      this._windUpTotal = this._windUpTimer;
      this._windUpCorrected = false;
      this._dashDir.copy(desired);
      ctx.setAIState?.(e, 'dash_windup');
      ctx.emitAIEvent?.(e, 'charge_windup_started', { variant: this.variant });
      try { this._windUpSound?.stop?.(); this._windUpSound = window?._SFX?.dashWindup?.(); } catch (e) { logError(e); }
      // face dash direction immediately
      const desiredYaw = Math.atan2(this._dashDir.x, this._dashDir.z);
      this._yaw = desiredYaw; e.rotation.set(0, this._yaw, 0);
    }

    const dashMul = this._charging ? 2.4 : 1.0;
    const recoverMul = this._recoverTimer > 0 ? 0.35 : 1.0;
    const windMul = this._windUpTimer > 0 ? 0.0 : 1.0;
    const stunMul = this._stunTimer > 0 ? 0.0 : 1.0;
    const flinchMul = this._flinchTimer > 0 ? 0.0 : 1.0;
    const moveDir = this._charging ? this._dashDir : desired;
    const step = moveDir.clone().multiplyScalar(this.speed * dashMul * recoverMul * windMul * stunMul * flinchMul * dt);

    if (this._charging) ctx.setAIState?.(e, 'dash');
    else if (this._windUpTimer > 0) ctx.setAIState?.(e, 'dash_windup');
    else if (this._recoverTimer > 0) ctx.setAIState?.(e, 'dash_recover');
    else if (this._stunTimer > 0) ctx.setAIState?.(e, 'stunned');
    else if (sense.searchActive) ctx.setAIState?.(e, 'searching');
    else if (sense.locomotionClear) ctx.setAIState?.(e, 'pursuing');

    // Move and face motion
    const before = e.position.clone();
    const wasCharging = this._charging;
    const moveResult = ctx.moveWithCollisions(e, step) || {};
    const movedVec = e.position.clone().sub(before); movedVec.y = 0;
    if (wasCharging && movedVec.lengthSq() + 1e-6 < step.lengthSq()) {
      if (this.cfg.explodesOnDeath && moveResult.blockedBy === 'world') {
        this._explode(ctx);
        ctx.enemyManager?.remove?.(e);
        return;
      }
      this._charging = false;
      this._dashTimer = 0;
      this._overrunTimer = 0;
      this._dashTotal = 0;
      this._recoverTimer = 0.7 + this.rng() * 0.4;
      this._stunTimer = 1.0 + this.rng() * 0.4;
      try {
        window?._EFFECTS?.spawnDashImpact?.(e.position.clone(), this.cfg.color);
      } catch (e) { logError(e); }
      this._flinchAccum = 0;
      this._dashCooldown = 1.2 + this.rng() * 0.8;
      ctx.emitAIEvent?.(e, 'charge_ended', {
        reason: moveResult.blockedBy === 'ally' ? 'ally_blocked' : (moveResult.blockedBy || 'miss'),
        blockerRoot: moveResult.blockerRoot || null
      });
    }
    const speedNow = movedVec.length() / Math.max(dt, 0.00001);
    if (movedVec.lengthSq() > 1e-6) {
      const desiredYaw = Math.atan2(movedVec.x, movedVec.z);
      let deltaYaw = desiredYaw - this._yaw; deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turnRate = 10.0; // faster turns for rushers
      this._yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, deltaYaw));
      e.rotation.set(0, this._yaw, 0);
    }
    // Aggressive forward lean while dashing; slight raise during wind-up or flinch pose
    e.rotation.x = this._flinchTimer > 0 ? 0.2 : (this._windUpTimer > 0 ? 0.04 : (this._charging ? -0.12 : -0.04));

    // Arm/leg swing or wind-up pose
    this._walkPhase += Math.min(18.0, 7.0 + speedNow * 0.3) * dt;
    const swing = Math.sin(this._walkPhase) * Math.min(0.8, 0.18 + speedNow * 0.03);
    if (this._animRefs) {
      const la = this._animRefs.leftArm, ra = this._animRefs.rightArm;
      const ll = this._animRefs.leftLeg, rl = this._animRefs.rightLeg;
      if (this._flinchTimer > 0) {
        if (ra) ra.rotation.x = 0.6;
        if (la) la.rotation.x = -0.6;
        if (ll) ll.rotation.x = 0;
        if (rl) rl.rotation.x = 0;
      } else if (this._windUpTimer > 0) {
        if (ra) ra.rotation.x = -0.8;
        if (la) la.rotation.x = 0.4;
        if (ll) ll.rotation.x = 0;
        if (rl) rl.rotation.x = 0;
      } else {
        if (la && ra) { la.rotation.x = swing * 1.1; ra.rotation.x = -swing * 1.1; }
        if (ll && rl) { ll.rotation.x = -swing; rl.rotation.x = swing; }
      }
    }
    // Blade glow during wind-up / dash
    try {
      const blade = this._bladeRef;
      if (blade && blade.material && blade.material.emissiveIntensity != null) {
        blade.material.emissiveIntensity = (this._windUpTimer > 0 || this._charging) ? 1.4 : 0.7;
      }
    } catch (e) { logError(e); }
    const movedLen = movedVec.length();
    if (step.lengthSq() > 1e-4 && movedLen < 0.01) {
      this._stuckTime += dt;
    } else {
      this._stuckTime = 0;
    }
    this._lastPos.copy(e.position);
  }

  _explode(ctx) {
    if (this._exploded) return;
    this._exploded = true;
    const pos = this.root.position.clone();
    const radius = this.cfg.explosionRadius || 3;
    const dmg = this.cfg.explosionDamage || 55;
    if (window?._EFFECTS?.spawnExplosion) {
      try {
        window._EFFECTS.spawnExplosion(pos.clone(), radius, this.cfg.color);
      } catch (err) {
        console.warn('spawnExplosion failed', err);
      }
    }
    // damage player
    try {
      const pPos = ctx?.player?.position;
      if (pPos && pos.distanceTo(pPos) <= radius) {
        ctx?.damagePlayer?.(dmg, { sourceKind: 'explosive_rusher', sourceRoot: this.root, ownerRoot: this.root });
      }
    } catch (_err) {
      console.warn('player damage during explosion failed', _err);
    }
    // damage nearby enemies (exclude self and other explosive variants)
    const em = ctx?.enemyManager;
    if (em) {
      for (const other of Array.from(em.enemies || [])) {
        if (other === this.root) continue;
        if (other.position.distanceTo(pos) <= radius) {
          const inst = em.instanceByRoot?.get?.(other);
          if (inst?.cfg?.explodesOnDeath) continue; // avoid chain reactions
          other.userData.hp = (other.userData.hp || 0) - dmg;
          if (inst && typeof inst.onHit === 'function') inst.onHit(dmg, false);
          if (other.userData.hp <= 0) {
            try { window?._EFFECTS?.enemyDeath?.(other.position.clone()); } catch (e) { logError(e); }
            em.remove(other);
          }
        }
      }
    }
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const heightPairs = [
      [0.2, 0.2],   // ground-level check for low walls
      [0.9, 1.0],   // mid-body check
      [1.2, 1.5]    // original head-height ray
    ];
    for (const [hFrom, hTo] of heightPairs) {
      const origin = new THREE.Vector3(fromPos.x, fromPos.y + hFrom, fromPos.z);
      const target = new THREE.Vector3(targetPos.x, (targetPos.y || 0) + hTo, targetPos.z);
      const dir = target.clone().sub(origin);
      const dist = dir.length();
      if (dist <= 0.0001) continue;
      dir.normalize();
      this._raycaster.set(origin, dir);
      this._raycaster.far = dist - 0.1;
      const hits = this._raycaster.intersectObjects(objects, false);
      if (hits && hits.length > 0) return false;
    }
    return true;
  }

  onHit(damage, _isHead) {
    if (this._charging) {
      this._flinchAccum += damage;
      if (this._flinchAccum >= this._flinchThreshold) {
        this._charging = false;
        this._dashTimer = 0;
        this._overrunTimer = 0;
        this._dashTotal = 0;
        this._flinchTimer = 0.45;
        this._flinchAccum = 0;
      }
    }
  }

  onRemoved(_scene) {
    if (this.cfg.explodesOnDeath && !this._exploded) {
      this._explode(this._lastCtx || {});
    }
  }
}


