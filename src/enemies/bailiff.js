import { createEnhancedBailiffBot } from '../assets/enemy-retrofits.js';
import { instantiateSharedTemplate } from './render-template.js';

const _bailiffTemplates = new WeakMap();

export class BailiffEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.rng = rng;

    // The production Bailiff asset keeps one readable gavel on its animated arm.
    const built = instantiateSharedTemplate(_bailiffTemplates, THREE, () => {
      return createEnhancedBailiffBot({
        THREE,
        mats,
        scale: 0.6,
        palette: {
          armor: 0x334155,
          accent: 0x475569,
          glow: 0x60a5fa
        }
      });
    });
    const body = built.root;
    const head = built.head;
    this._animRefs = built.refs || {};
    body.position.copy(spawnPos);
    body.rotation.x = 0;

    this._gavelRef = this._animRefs.gavel || null;

    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    this.speed = cfg.speedMin + this.rng() * (cfg.speedMax - cfg.speedMin);
    this._prevPlayerPos = null;
    this._playerVel = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0;
    this._walkPhase = 0;

    this._dashTimer = 0;
    this._dashWindup = 0;
    this._dashCooldown = 0;
    this._dashDir = new THREE.Vector3();
    this._recoverTimer = 0;
    this._attackPhase = 'idle';
    this._attackTimer = 0;
    this._didHit = false;
    this._lastPos = body.position.clone();
    this._stuckTime = 0;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayerActual = playerPos.clone().sub(e.position);
    const dist = toPlayerActual.length();
    const sense = ctx.sensePlayer?.(e, dt) || {
      rawWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      stableWorldLOS: this._hasLineOfSight(e.position, playerPos, ctx.objects),
      locomotionClear: true,
      pursuitTarget: playerPos.clone()
    };
    this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    this._recoverTimer = Math.max(0, this._recoverTimer - dt);

    if (this._attackPhase !== 'idle') {
      this._attackTimer = Math.max(0, this._attackTimer - dt);
      ctx.setAIState?.(e, `gavel_${this._attackPhase}`);
      const flat = toPlayerActual.clone().setY(0);
      if (flat.lengthSq() > 0) {
        flat.normalize();
        this._yaw = Math.atan2(flat.x, flat.z);
        e.rotation.set(0, this._yaw, 0);
      }
      if (this._attackPhase === 'windup') {
        if (this._animRefs?.rightArm) this._animRefs.rightArm.rotation.x = -1.15;
        if (this._attackTimer <= 0) {
          this._attackPhase = 'active';
          this._attackTimer = 0.1;
          this._didHit = false;
        }
        return;
      }
      if (this._attackPhase === 'active') {
        if (this._animRefs?.rightArm) this._animRefs.rightArm.rotation.x = 0.85;
        if (!this._didHit && dist <= 2.35 && sense.rawWorldLOS && sense.locomotionClear) {
          this._didHit = true;
          ctx.damagePlayer?.(16, { sourceKind: 'bailiff_gavel', sourceRoot: e, ownerRoot: e });
          ctx.emitAIEvent?.(e, 'gavel_hit', { damage: 16 });
        }
        if (this._attackTimer <= 0) {
          this._attackPhase = 'recover';
          this._attackTimer = 0.65;
        }
        return;
      }
      if (this._attackTimer <= 0) {
        this._attackPhase = 'idle';
        this._recoverTimer = 0.2;
      } else {
        if (this._animRefs?.rightArm) this._animRefs.rightArm.rotation.x *= Math.max(0, 1 - dt * 8);
        return;
      }
    }

    if (dist <= 2.2 && sense.rawWorldLOS && sense.locomotionClear && this._recoverTimer <= 0) {
      this._attackPhase = 'windup';
      this._attackTimer = 0.35;
      this._didHit = false;
      ctx.setAIState?.(e, 'gavel_windup');
      ctx.emitAIEvent?.(e, 'gavel_started');
      return;
    }

    const navigationTarget = sense.pursuitTarget;
    if (dist > 70 || !navigationTarget) {
      ctx.setAIState?.(e, sense.searchActive ? 'searching' : 'idle_unaware');
      return;
    }
    const toNavigation = navigationTarget.clone().sub(e.position).setY(0);
    if (toNavigation.lengthSq() === 0) return;
    toNavigation.normalize();

    if (sense.stableWorldLOS && this._prevPlayerPos) {
      const delta = playerPos.clone().sub(this._prevPlayerPos);
      const instVel = delta.multiplyScalar(dt > 0 ? 1 / dt : 0);
      this._playerVel.lerp(instVel, Math.min(1, 0.4 + dt * 0.6));
      this._playerVel.y = 0;
    }
    if (sense.stableWorldLOS) this._prevPlayerPos = playerPos.clone();

    const steeringTarget = sense.stableWorldLOS ? playerPos : navigationTarget;
    const horizDist = Math.hypot(steeringTarget.x - e.position.x, steeringTarget.z - e.position.z);
    const leadTime = Math.max(0, Math.min(0.5, (horizDist / Math.max(0.1, this.speed)) * 0.25));
    const predicted = steeringTarget.clone().add(sense.stableWorldLOS ? this._playerVel.clone().multiplyScalar(leadTime) : new THREE.Vector3());
    const toPred = predicted.sub(e.position).setY(0);
    let desired = toPred.lengthSq() > 0 ? toPred.normalize() : toNavigation.clone();

    const isStuck = this._stuckTime > 0.4;
    if ((!sense.stableWorldLOS || !sense.locomotionClear || isStuck) && ctx.pathfind) {
      ctx.setAIState?.(e, sense.searchActive ? 'searching' : 'routing');
      ctx.pathfind.recomputeIfStale(this, navigationTarget).then(path => { this._path = path; });
      const waypoint = ctx.pathfind.nextWaypoint(this);
      if (waypoint) {
        const direction = new THREE.Vector3(waypoint.x - e.position.x, 0, waypoint.z - e.position.z);
        if (direction.lengthSq() > 0) desired = direction.normalize();
      }
    } else if (ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
    }

    const avoid = ctx.avoidObstacles(e.position, desired, 2.2);
    const separation = ctx.separation(e.position, 1.2, e);
    desired = desired.multiplyScalar(1.0).add(avoid.multiplyScalar(1.2)).add(separation.multiplyScalar(0.7)).normalize();

    const corridor = ctx.chargeCorridorClear?.(e, predicted, 0.08) || { clear: true };
    if (this._dashWindup > 0) {
      this._dashWindup = Math.max(0, this._dashWindup - dt);
      ctx.setAIState?.(e, 'gap_close_windup');
      if (this._dashWindup <= 0) {
        const finalCorridor = ctx.chargeCorridorClear?.(e, playerPos, 0.08) || { clear: true };
        if (sense.rawWorldLOS && finalCorridor.clear) {
          this._dashTimer = 0.35 + this.rng() * 0.15;
          this._dashDir.copy(desired);
          ctx.emitAIEvent?.(e, 'gap_close_started');
        } else {
          this._dashCooldown = Math.max(this._dashCooldown, 0.4);
        }
      }
      return;
    }
    if (this._dashTimer > 0) this._dashTimer = Math.max(0, this._dashTimer - dt);
    const canDash = dist >= 5 && dist <= 12 && this._dashCooldown <= 0 && this._recoverTimer <= 0
      && sense.stableWorldLOS && sense.locomotionClear && corridor.clear;
    if (canDash && this.rng() < 1.2 * dt) {
      this._dashWindup = 0.22;
      this._dashCooldown = 1.2 + this.rng() * 0.8;
      this._dashDir.copy(desired);
      return;
    }

    const dashActive = this._dashTimer > 0;
    const stepDirection = dashActive ? this._dashDir : desired;
    const step = stepDirection.clone().multiplyScalar(this.speed * (dashActive ? 2.4 : 1) * dt);

    const before = e.position.clone();
    const moveResult = ctx.moveWithCollisions(e, step) || {};
    if (dashActive && moveResult.blockedBy) {
      this._dashTimer = 0;
      this._recoverTimer = 0.3;
      ctx.emitAIEvent?.(e, 'gap_close_ended', { reason: moveResult.blockedBy, blockerRoot: moveResult.blockerRoot || null });
    }
    const movedVec = e.position.clone().sub(before);
    movedVec.y = 0;
    const speedNow = movedVec.length() / Math.max(dt, 0.00001);
    if (movedVec.lengthSq() > 1e-6) {
      const desiredYaw = Math.atan2(movedVec.x, movedVec.z);
      let deltaYaw = desiredYaw - this._yaw;
      deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turnRate = 10.0;
      this._yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, deltaYaw));
      e.rotation.set(0, this._yaw, 0);
    }
    e.rotation.x = dashActive ? -0.12 : -0.04;
    ctx.setAIState?.(e, dashActive ? 'gap_closing' : (sense.searchActive ? 'searching' : 'pursuing'));

    this._walkPhase += Math.min(18.0, 7.0 + speedNow * 0.3) * dt;
    const swing = Math.sin(this._walkPhase) * Math.min(0.8, 0.18 + speedNow * 0.03);
    if (this._animRefs) {
      const la = this._animRefs.leftArm, ra = this._animRefs.rightArm;
      const ll = this._animRefs.leftLeg, rl = this._animRefs.rightLeg;
      if (la && ra) { la.rotation.x = swing * 1.1; ra.rotation.x = -swing * 1.1; }
      if (ll && rl) { ll.rotation.x = -swing; rl.rotation.x = swing; }
    }
    const movedLen = movedVec.length();
    if (step.lengthSq() > 1e-4 && movedLen < 0.01) {
      this._stuckTime += dt;
    } else {
      this._stuckTime = 0;
    }
    this._lastPos.copy(e.position);
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const heightPairs = [
      [0.2, 0.2],
      [0.9, 1.0],
      [1.2, 1.5]
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

  onHit(_dmg, _isHead) {}
}

