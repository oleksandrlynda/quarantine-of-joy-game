import { createEnhancedSniperBot } from '../assets/enemy-retrofits.js';
import { logError } from '../util/log.js';
import {
  cloneNodeMaterial,
  getCachedRenderResource,
  instantiateSharedTemplate
} from './render-template.js';

const _sniperTemplates = new WeakMap();
const _sniperProjectileGeometries = new WeakMap();

export class SniperEnemy {
  constructor({ THREE, mats, cfg, spawnPos, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this._enemyManager = enemyManager || null;
    this.rng = rng;
  
    const built = instantiateSharedTemplate(
      _sniperTemplates,
      THREE,
      () => createEnhancedSniperBot({ THREE, mats, scale: 0.70 })
    );
    const body = built.root; const head = built.head; this._refs = built.refs || {};
    body.position.copy(spawnPos);
    try { cloneNodeMaterial(head); } catch (e) { logError(e); }
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;
  
    this.speed = cfg.speedMin + this.rng() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 22, max: 30 };
    this.engageRange   = { min: 20, max: 34 };
  
    // --- NEW: keep distance; orbit a ring instead of approaching player ---
    this.standoff = { min: 22, max: 30, ideal: 26 };
  
    this.cooldown = 0;
    this.windup = 0;
    this.windupReq = 1.2 + this.rng()*0.6;
  
    // Post-shot displacement
    this.postShotRelocate = 0;
    this.displaceTarget = null;
    this.displaceTimeout = 1.2;
  
    this._raycaster = new THREE.Raycaster();
    this._faceDir = new this.THREE.Vector3(0, 0, 1);
  
    // Cover/peek
    this.coverAnchor = null;
    this.peekOffset = null;
    this.peekTimer = 0;
    this.peekDuration = 1.2 + this.rng()*0.6;
    this.peekCooldown = 0;
  
    // Counter-aim / tuck
    this.tuckTimer = 0;
    this.tuckDuration = 0.9 + this.rng()*0.4;
    this.tuckCooldown = 0;
    this._lastPlayerForward = new this.THREE.Vector3(0,0,1);
  
    // Laser
    this._aimLine = null; this._aimHeat = 0;
  
    // Persistent strafe & bursts
    this._strafeDir = this.rng() < 0.5 ? 1 : -1;
    this._prevPlayerPos = null;
    this._playerVelocity = new this.THREE.Vector3();
    this._strafeSwapCD = 0;
    this._moveBurstTimer = 0;
    this._moveBurstDur = 0;
    this._moveBurstDir = this._strafeDir;
  
    // Idle relocate in open space
    this._idleRelocateCD = 0;
    this._routeAnchor = null;
    this._routeAnchorSubject = null;
    this._routeAnchorRefresh = 0;
  
    // temps
    this._tmpV1 = new this.THREE.Vector3();
    this._tmpV2 = new this.THREE.Vector3();
  }
    
  update(dt, ctx){
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const muzzle = this._muzzleWorld();
    const sense = ctx.sensePlayer?.(e, dt, muzzle) || {
      rawWorldLOS: this._hasLOS(e.position, playerPos, ctx.objects),
      stableWorldLOS: this._hasLOS(e.position, playerPos, ctx.objects),
      locomotionClear: true,
      tacticalFireClear: true,
      pursuitTarget: playerPos.clone()
    };
    const behaviorTarget = sense.stableWorldLOS ? playerPos : sense.pursuitTarget;
    if (!behaviorTarget) {
      this.windup = 0;
      this._setAimLine(null, ctx.scene);
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
    if (sense.stableWorldLOS && this._prevPlayerPos) {
      const velocity = playerPos.clone().sub(this._prevPlayerPos).multiplyScalar(1 / Math.max(0.001, dt));
      this._playerVelocity.lerp(velocity, Math.min(1, 0.3 + dt));
      this._playerVelocity.y = 0;
    }
    if (sense.stableWorldLOS) this._prevPlayerPos = playerPos.clone();
  
    // timers
    if (this.cooldown>0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.postShotRelocate>0) this.postShotRelocate = Math.max(0, this.postShotRelocate - dt);
    if (this.peekCooldown>0) this.peekCooldown = Math.max(0, this.peekCooldown - dt);
    if (this.tuckCooldown>0) this.tuckCooldown = Math.max(0, this.tuckCooldown - dt);
    if (this.tuckTimer>0) this.tuckTimer = Math.max(0, this.tuckTimer - dt);
    if (this._strafeSwapCD>0) this._strafeSwapCD = Math.max(0, this._strafeSwapCD - dt);
    if (this._moveBurstTimer>0) this._moveBurstTimer = Math.max(0, this._moveBurstTimer - dt);
    if (this._idleRelocateCD>0) this._idleRelocateCD = Math.max(0, this._idleRelocateCD - dt);
    this._routeAnchorRefresh = Math.max(0, this._routeAnchorRefresh - dt);
  
    // face player (calm)
    const inBandYaw = dist >= this.engageRange.min && dist <= this.engageRange.max;
    const aiming = hasLOS && inBandYaw && (this.windup > 0 || this.cooldown <= 0) && this.tuckTimer<=0;
    const faceVec = aiming ? toPlayer.clone().setY(0) : toPlayer.clone().multiplyScalar(0.6).setY(0);
    if (faceVec.lengthSq() > 0) {
      faceVec.normalize();
      const lerpAmt = Math.min(1, 5 * dt);
      this._faceDir.lerp(faceVec, lerpAmt);
      if (this._faceDir.lengthSq() > 0) this._faceDir.normalize();
    }
    const lookTarget = this._tmpV1.copy(e.position).add(this._faceDir); lookTarget.y = e.position.y;
    e.lookAt(lookTarget);
  
    // anchor cover when LOS blocked or tucked
    if (!hasLOS || this.tuckTimer>0) {
      const anchor = this._raycastToPlayer(e.position, behaviorTarget, ctx.objects);
      if (anchor) this.coverAnchor = anchor;
    }
  
    // movement
    const desired = new THREE.Vector3();
    let movementState = null;
    const flatToPlayer = toPlayer.clone().setY(0); if (flatToPlayer.lengthSq()>0) flatToPlayer.normalize();
    const side = new THREE.Vector3(-flatToPlayer.z, 0, flatToPlayer.x);
  
    // radial control on a standoff ring
    const ring = this.standoff;
    const tooClose = dist < ring.min;
    const tooFar  = dist > ring.max;
  
    // post-shot relocation: strong lateral commit
    if (this.postShotRelocate>0) {
      if (!this.displaceTarget) {
        // pick lateral target on same radius (ring)
        const dir = (this.rng()<0.5?1:-1);
        const arc = (7 + this.rng()*5) * dir;
        const angle = Math.atan2(e.position.z - behaviorTarget.z, e.position.x - behaviorTarget.x) + (arc / Math.max(1, dist));
        const target = new THREE.Vector3(
          behaviorTarget.x + Math.cos(angle) * Math.max(ring.min, Math.min(ring.max, dist)),
          e.position.y,
          behaviorTarget.z + Math.sin(angle) * Math.max(ring.min, Math.min(ring.max, dist))
        );
        this.displaceTarget = target;
      }
      const toTgt = this.displaceTarget.clone().sub(e.position).setY(0);
      if (toTgt.lengthSq()>0.0004) desired.add(toTgt.normalize());
      if (toTgt.length()<0.8 || this.postShotRelocate<=0) this.displaceTarget = null;
  
      this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
    }
    else if (this.tuckTimer>0) {
      desired.add(side.clone().multiplyScalar(0.25 * this._strafeDir));
      // ensure we don't drift inside the ring while tucked
      if (tooClose) desired.add(flatToPlayer.clone().multiplyScalar(-1.2));
      this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
    }
    else if (visibilityOccluded) {
      desired.add(flatToPlayer);
      this.windup = 0;
      this._setAimLine(null, ctx.scene);
      this._aimHeat = 0;
      movementState = 'closing_through_storm';
    }
    else if (!hasLOS) {
      // move to cover anchor keeping ring radius; else lateral ring relocate in open field
      if (!this.coverAnchor) this.coverAnchor = this._raycastToPlayer(e.position, behaviorTarget, ctx.objects);
      if (this.coverAnchor) {
        const toAnchor = this.coverAnchor.clone().sub(e.position).setY(0);
        if (toAnchor.lengthSq()>0.0004) desired.add(toAnchor.normalize());
        if (toAnchor.length()<1.4 && (!this.peekOffset || this.peekCooldown<=0)) {
          this.peekOffset = this._computePeekDesiredFromCover(this.coverAnchor, behaviorTarget, ctx.objects);
          this.peekTimer = 0;
        }
        // radial correction toward ring while moving to anchor (small)
        if (tooClose) desired.add(flatToPlayer.clone().multiplyScalar(-0.8));
        else if (tooFar) desired.add(flatToPlayer.clone().multiplyScalar(0.6)); // outward is -flatToPlayer, but we already move to anchor; keep gentle
      } else if (this._idleRelocateCD<=0) {
        // open arena: choose a new point on the ring and go there (lateral)
        const curAngle = Math.atan2(e.position.z - behaviorTarget.z, e.position.x - behaviorTarget.x);
        const delta = (this.rng() < 0.5 ? -1 : 1) * (Math.PI/6 + this.rng()*Math.PI/6); // 30–60°
        const r = ring.ideal;
        this.displaceTarget = new THREE.Vector3(
          behaviorTarget.x + Math.cos(curAngle + delta) * r,
          e.position.y,
          behaviorTarget.z + Math.sin(curAngle + delta) * r
        );
        this.postShotRelocate = 1.1 + this.rng()*0.4; // reuse relocation pathing
        this._idleRelocateCD = 2.4 + this.rng()*1.2;
      }
    }
    else if (!tacticalFireClear) {
      desired.add(side.clone().multiplyScalar(this._strafeDir));
      if (tooClose) desired.add(flatToPlayer.clone().multiplyScalar(-1.2));
      else if (tooFar) desired.add(flatToPlayer.clone().multiplyScalar(0.8));
      this.windup = 0;
      this._setAimLine(null, ctx.scene);
      this._aimHeat = 0;
      movementState = 'repositioning_for_clear_shot';
    }
    else {
      // LOS present
      // radial correction: NEVER move toward the player; only back out or hold
      if (tooClose) desired.add(flatToPlayer.clone().multiplyScalar(-1.2));
      else if (tooFar) desired.add(flatToPlayer.clone().multiplyScalar(0.5)); // outward = away from player
  
      if (this.peekOffset) {
        const edgePos = this.coverAnchor ? this.coverAnchor.clone().add(this.peekOffset) : e.position.clone();
        const toEdge = edgePos.sub(e.position).setY(0);
        if (toEdge.length()>0.2) desired.add(toEdge.normalize());
        this.peekTimer += dt;
        if (this.peekTimer >= this.peekDuration) {
          this.peekOffset = null; this.peekCooldown = 0.4 + this.rng()*0.6;
          this.tuckTimer = 0.5 + this.rng()*0.3;
        }
      } else {
        // sustained orbit burst (lateral only)
        if (this._moveBurstTimer<=0) {
          this._moveBurstDir = this._strafeDir;
          this._moveBurstDur = 0.9 + this.rng()*0.7;
          this._moveBurstTimer = this._moveBurstDur;
          if (this._strafeSwapCD<=0 && this.rng()<0.25) { this._strafeDir *= -1; this._strafeSwapCD = 1.2; }
        }
        desired.add(side.clone().multiplyScalar(0.65 * this._moveBurstDir));
      }
    }
  
    const needsRoute = (!hasLOS && !visibilityOccluded) || (!sense.locomotionClear && (tooClose || tooFar));
    if (needsRoute && ctx.pathfind) {
      const subjectMoved = !this._routeAnchorSubject
        || this._routeAnchorSubject.distanceToSquared(behaviorTarget) > 4;
      if (!this._routeAnchor || this._routeAnchorRefresh <= 0 || subjectMoved) {
        const away = e.position.clone().sub(behaviorTarget).setY(0);
        if (away.lengthSq() === 0) away.set(1, 0, 0);
        away.normalize();
        this._routeAnchor = behaviorTarget.clone().add(away.multiplyScalar(ring.ideal));
        this._routeAnchorSubject = behaviorTarget.clone();
        this._routeAnchorRefresh = 1.0;
      }
      ctx.pathfind.recomputeIfStale(this, this._routeAnchor, { cacheFor: 1.5 }).then(path => { this._path = path; });
      const waypoint = ctx.pathfind.nextWaypoint(this);
      if (waypoint) desired.set(waypoint.x - e.position.x, 0, waypoint.z - e.position.z).normalize();
      movementState = hasLOS ? 'routing_to_precision_anchor' : 'seeking_sightline';
    } else if (ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
      this._routeAnchor = null;
      this._routeAnchorSubject = null;
    }

    // avoidance & move
    const baseStep = desired.lengthSq()>0 ? desired.clone().normalize() : desired;
    const avoid = baseStep.lengthSq()>0 ? (ctx.avoidObstacles ? ctx.avoidObstacles(e.position, baseStep, 1.8) : baseStep) : baseStep;
    const step = baseStep.clone().add(avoid.multiplyScalar(1.0));
    if (step.lengthSq()>1e-6) {
      step.normalize().multiplyScalar(this.speed * dt * 1.05);
      ctx.moveWithCollisions?.(e, step);
    }
    if (sense.searchActive) ctx.setAIState?.(e, 'searching');
    else if (this.tuckTimer > 0) ctx.setAIState?.(e, 'tucked');
    else if (this.postShotRelocate > 0) ctx.setAIState?.(e, 'relocating');
    else if (this.windup > 0) ctx.setAIState?.(e, 'aim_windup');
    else if (movementState) ctx.setAIState?.(e, movementState, { blockerRoot: sense.blockingAlly || null });
    else if (tooClose) ctx.setAIState?.(e, 'retreating_to_range');
    else if (tooFar) ctx.setAIState?.(e, 'closing_to_range');
    else ctx.setAIState?.(e, 'precision_anchor');
  
    // counter-aim tuck
    const pf = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone() : this._lastPlayerForward.clone();
    if (pf.lengthSq()>0) pf.normalize();
    this._lastPlayerForward.copy(pf);
    const pts = e.position.clone().sub(playerPos).setY(0); const d2 = pts.lengthSq();
    if (d2>1e-3) {
      pts.normalize();
      const dot = pf.dot(pts);
      if (dot > 0.92 && this.tuckCooldown<=0 && hasLOS) {
        this.tuckTimer = this.tuckDuration;
        this.tuckCooldown = 1.2 + this.rng()*0.6;
        this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
      }
    }
  
    // fire control
    if (this._projectiles && this._projectiles.length){ this._updateProjectiles(dt, ctx); }
  
    // --- IMPORTANT: remove global fire gate; use only own cooldown/windup ---
    const inBandRange = dist >= this.engageRange.min && dist <= this.engageRange.max;
    const playerSpeed = (ctx.blackboard && (ctx.blackboard.playerSpeed || 0)) || 0;
    const steadyShot = playerSpeed < 8.0 || this.peekOffset;
    const staggerReady = !ctx.blackboard || (ctx.blackboard.time - (ctx.blackboard.sniperLastFireAt ?? -Infinity)) >= 1;
  
    if (hasLOS && tacticalFireClear && inBandRange && this.cooldown<=0 && this.postShotRelocate<=0 && this.tuckTimer<=0 && steadyShot && staggerReady){
      this.windup += dt;
      this._aimHeat = Math.min(1, this.windup / Math.max(0.001, this.windupReq));
      const from = this._muzzleWorld();
      const to = playerPos.clone();
      to.x += (this.rng()-0.5) * (0.06 * (1 - this._aimHeat));
      to.z += (this.rng()-0.5) * (0.06 * (1 - this._aimHeat));
      this._setAimLine({from, to, color:0xff3344, alpha: 0.25 + 0.55*this._aimHeat}, ctx.scene);
  
      if (this.windup >= this.windupReq){
        this.windup = 0; this._aimHeat = 0;
        this._setAimLine(null, ctx.scene);
        const travelSeconds = Math.max(0.05, Math.min(0.8, this._muzzleWorld().distanceTo(playerPos) / 60));
        const aimTarget = playerPos.clone().add(this._playerVelocity.clone().multiplyScalar(travelSeconds));
        if (this._fireProjectile(aimTarget, ctx)) {
          this.cooldown = 3.5 + this.rng()*1.0;
          this.postShotRelocate = 0.9 + this.rng()*0.5;
          this.displaceTarget = null;
          this.peekOffset = null; this.peekTimer = 0; this.peekCooldown = 0.6 + this.rng()*0.5;
        }
      }
    } else {
      if (this.windup > 0) {
        ctx.emitAIEvent?.(e, 'sniper_windup_cancelled', {
          reason: !sense.rawWorldLOS ? 'lost_world_los' : (!tacticalFireClear ? 'ally_blocked' : 'position_invalid'),
          blockerRoot: sense.blockingAlly || null
        });
        this.windup = 0; this._aimHeat = 0;
      }
      this._setAimLine(null, ctx.scene);
    }
  }
  
  _raycastToPlayer(fromPos, playerPos, objects){
    const origin = this._muzzleWorld();
    const target = new this.THREE.Vector3(playerPos.x, 1.6, playerPos.z);
    const dir = target.clone().sub(origin); const dist = dir.length(); if (dist<=0.0001) return null;
    dir.normalize(); this._raycaster.set(origin, dir); this._raycaster.far = dist - 0.05;
    const hits = this._raycaster.intersectObjects(objects, false);
    if (hits && hits.length>0) {
      // anchor slightly toward us so we don't clip into geometry
      const hit = hits[0];
      const back = dir.clone().multiplyScalar(0.25);
      return hit.point.clone().sub(back);
    }
    return null;
  }
  
  _computePeekDesiredFromCover(coverAnchor, playerPos, objects){
    // sample lateral offsets around cover normal to find first-LOS with minimal offset
    const toPlayer = playerPos.clone().sub(coverAnchor).setY(0); if (toPlayer.lengthSq()===0) return null;
    toPlayer.normalize();
    const left = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const right = left.clone().multiplyScalar(-1);
    const step = 0.6; const maxSamples = 10; // up to 6m each side
    let best = null, bestScore = Infinity;
  
    const testSide = (axis) => {
      for (let i=1;i<=maxSamples;i++){
        const off = axis.clone().multiplyScalar(step*i);
        const probe = coverAnchor.clone().add(off);
        // require LOS from probe
        if (this._hasLOS(probe, playerPos, objects)) {
          // score: smaller offset is better; slight bias toward right-left alternation
          const score = i + this.rng()*0.15;
          if (score < bestScore) { bestScore = score; best = off; }
          break; // first LOS on this side is optimal for minimal exposure
        }
      }
    };
    // try both sides
    if (this.rng()<0.5){ testSide(left); testSide(right); } else { testSide(right); testSide(left); }
    return best ? best : null;
  }
  
  _setAimLine(data, scene){
    const THREE = this.THREE;
    if (!data){
      if (this._aimLine) this._aimLine.visible = false;
      return;
    }
    const { from, to, color=0xff3344, alpha=0.4 } = data;
    if (!this._aimLine){
      const g = new THREE.BufferGeometry().setFromPoints([from, to]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: alpha });
      this._aimLine = new THREE.Line(g, m);
      scene.add(this._aimLine);
    } else {
      this._aimLine.visible = true;
      const pos = this._aimLine.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      if (this._aimLine.material) {
        this._aimLine.material.opacity = alpha;
        this._aimLine.material.color?.setHex(color);
      }
    }
  }  

  _muzzleWorld() {
    const THREE = this.THREE;
    if (this._refs && this._refs.muzzle && this._refs.muzzle.parent) {
      try { return this._refs.muzzle.getWorldPosition(new THREE.Vector3()); } catch (e) { logError(e); }
    }
    return new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
  }

  _fireProjectile(targetPos, ctx){
    const THREE = this.THREE;
    const origin = this._muzzleWorld();
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
    let dir = targetPos.clone().sub(origin); const d = dir.length(); if (d<=0.0001) dir.set(0,0,1); else dir.normalize();
  
    // Slight inaccuracy if we were not on a controlled peek (elite is most deadly on peeks)
    if (!this.peekOffset) {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), dir).normalize();
      const upOrtho = new THREE.Vector3().crossVectors(dir, right).normalize();
      const ang = this.THREE.MathUtils.degToRad(0.5 + this.rng()*0.6);
      const yaw = 2*Math.PI*this.rng();
      const offset = right.multiplyScalar(Math.cos(yaw)*Math.tan(ang)).add(upOrtho.multiplyScalar(Math.sin(yaw)*Math.tan(ang)));
      dir = dir.add(offset).normalize();
    }
  
    const speed = 60;
    try {
      const vel = dir.clone().multiplyScalar(speed);
      const ok = ctx._spawnBullet?.('sniper', origin, vel, 1.2, 60, this.root);
      if (!ok) {
        const mesh = new THREE.Mesh(
          getCachedRenderResource(
            _sniperProjectileGeometries,
            THREE,
            () => new THREE.SphereGeometry(0.09, 10, 10)
          ),
          new THREE.MeshBasicMaterial({ color: 0xff3344 })
        );
        mesh.position.copy(origin);
        mesh.material.transparent = true; mesh.material.opacity = 1;
        ctx.scene.add(mesh);
        const proj = { mesh, velocity: vel, life: 0, maxLife: 1.2, damage: 60, ownerRoot: this.root };
        if (!this._projectiles) this._projectiles = [];
        this._projectiles.push(proj);
      }
    } catch (e) { logError(e); }
    if (ctx.sniperFired) ctx.sniperFired();
    ctx.emitAIEvent?.(this.root, 'projectile_fired', {
      kind: 'sniper', origin: origin.clone(), target: targetPos.clone(),
      worldClear: true, tacticalClear: true
    });
    return true;
  }  

  _updateProjectiles(dt, ctx){
    for (let i=this._projectiles.length-1; i>=0; i--){
      const p = this._projectiles[i];
      const prev = p.mesh.position.clone();
      const step = p.velocity.clone().multiplyScalar(dt);
      const next = prev.clone().add(step);
      const allyHit = ctx.enemyManager?._firstAllyOnSegment?.(prev, next, p.ownerRoot || this.root, 0.03);
      if (allyHit) {
        ctx.emitAIEvent?.(this.root, 'projectile_blocked_by_ally', { blockerRoot: allyHit.entry.root, kind: 'sniper' });
        ctx.scene.remove(p.mesh); this._projectiles.splice(i,1); continue;
      }
      // player hit
      const playerPos = ctx.player.position;
      const y = next.y; if (y>=1.2 && y<=1.8){
        const dx = next.x - playerPos.x; const dz = next.z - playerPos.z; if (Math.hypot(dx,dz) < 0.5){
          ctx.damagePlayer?.(p.damage, { sourceKind: 'sniper_projectile', sourceRoot: this.root, ownerRoot: this.root });
          ctx.scene.remove(p.mesh); this._projectiles.splice(i,1); continue;
        }
      }
      // world hit
      const dir = step.clone().normalize(); const dist = step.length();
      this._raycaster.set(prev, dir); this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(ctx.objects, false);
      if (hits && hits.length>0){ ctx.scene.remove(p.mesh); this._projectiles.splice(i,1); continue; }
      p.mesh.position.copy(next); p.life += dt;
      if (p.mesh.material && p.mesh.material.opacity !== undefined){ p.mesh.material.opacity = Math.max(0, 1 - p.life/p.maxLife); }
      if (p.life >= p.maxLife){ ctx.scene.remove(p.mesh); this._projectiles.splice(i,1); }
    }
  }

  // No persistent aim line; uses transient tracer VFX during windup

  _hasLOS(_fromPos, toPos, objects){
    const THREE = this.THREE;
    const origin = this._muzzleWorld();
    const target = new THREE.Vector3(toPos.x, 1.6, toPos.z);
    const dir = target.clone().sub(origin); const dist = dir.length(); if (dist<=0.0001) return true; dir.normalize();
    this._raycaster.set(origin, dir); this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false); return !(hits && hits.length>0);
  }

  onRemoved(scene){
    if (this._aimLine){
      scene.remove(this._aimLine);
      this._aimLine.geometry?.dispose?.();
      this._aimLine.material?.dispose?.();
      this._aimLine = null;
    }
    if (this._projectiles){
      for (const p of this._projectiles) scene.remove(p.mesh);
      this._projectiles.length = 0;
    }
  }  
}


