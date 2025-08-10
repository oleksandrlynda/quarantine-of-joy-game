export class MeleeEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    const baseMat = mats.enemy.clone();
    baseMat.color = new THREE.Color(cfg.color);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,1.2), baseMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9), mats.head.clone());
    head.position.y = 1.4;
    body.add(head);

    body.position.copy(spawnPos);

    // Keep compatibility with existing shooting logic
    body.userData = {
      type: cfg.type,
      head,
      hp: cfg.hp
    };

    this.root = body;
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this._lastPos = body.position.clone();
    this._stuckTime = 0;
    this._nudgeCooldown = 0;
    // Intercept lead: track player velocity (simple EMA)
    this._prevPlayerPos = null;
    this._playerVel = new this.THREE.Vector3();
    // Juke behavior to counter kiting
    this._jukeCooldown = 0;
    this._jukeTime = 0;
    this._jukeDir = new this.THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    // Flanking behavior tuning (used when role==='flanker')
    this._flankBack = 4 + Math.random() * 4;   // desired meters behind player
    this._flankSide = 4 + Math.random() * 4;   // desired meters to side of player
    this._anchorSlack = 1.0 + Math.random() * 0.6; // distance threshold to switch from anchor to pursue
    // On-hit reaction + temporary DR/slow (for tanks)
    this._hitJukeTime = 0;
    this._hitJukeDir = new this.THREE.Vector3();
    this._slowTimer = 0;
    this._damageReductionTimer = 0;
    this._damageReductionValue = 0;
    // Cached forward for on-hit lateral juke orientation
    this._lastFwd = new this.THREE.Vector3(1,0,0);
  }

  update(dt, ctx) {
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist < 2.1 && ctx.onPlayerDamage) ctx.onPlayerDamage(15 * dt, 'melee');
    if (dist > 60) return;

    toPlayer.y = 0;
    if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    // Estimate player horizontal velocity (EMA over frames)
    if (this._prevPlayerPos) {
      const delta = playerPos.clone().sub(this._prevPlayerPos);
      const instVel = delta.multiplyScalar(dt > 0 ? 1 / dt : 0);
      // smooth with EMA factor (favor stability)
      this._playerVel.lerp(instVel, Math.min(1, 0.35 + dt * 0.5));
      this._playerVel.y = 0;
    }
    this._prevPlayerPos = playerPos.clone();

    // If designated flanker, bias movement toward an anchor point to the player's rear/side
    let desired = toPlayer.clone();
    if (this.role === 'flanker') {
      const pfwd = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone() : toPlayer.clone().multiplyScalar(-1);
      pfwd.y = 0; if (pfwd.lengthSq() > 0) pfwd.normalize();
      const side = new this.THREE.Vector3(-pfwd.z, 0, pfwd.x).multiplyScalar(this.flankSign || 1);
      const anchor = playerPos.clone()
        .add(pfwd.clone().multiplyScalar(-this._flankBack))
        .add(side.clone().multiplyScalar(this._flankSide));
      const toAnchor = anchor.sub(e.position); toAnchor.y = 0;
      const anchorDist = toAnchor.length();
      if (anchorDist > 0.0001) {
        toAnchor.normalize();
        // If far from anchor, prioritize reaching it; once close, pursue the player
        const wAnchor = anchorDist > this._anchorSlack ? 1.0 : 0.2;
        const wPursue = anchorDist > this._anchorSlack ? 0.2 : 1.0;
        desired = toAnchor.multiplyScalar(wAnchor).add(toPlayer.clone().multiplyScalar(wPursue));
      }
    } else if (this.role === 'cutter') {
      // Target an arc position ±30–45° around the player at a comfortable ring radius
      const toPlayerFlat = playerPos.clone().setY(0).sub(new this.THREE.Vector3(e.position.x, 0, e.position.z));
      const pfwd = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone() : toPlayerFlat.clone().normalize();
      pfwd.y = 0; if (pfwd.lengthSq()>0) pfwd.normalize();
      const right = new this.THREE.Vector3(-pfwd.z, 0, pfwd.x);
      // Compute arc target around player
      const rot = this.cutterSign || 1;
      const side = right.clone().multiplyScalar(rot);
      const dir = pfwd.clone().multiplyScalar(Math.cos(this.cutterAngle || (Math.PI/6)))
        .add(side.clone().multiplyScalar(Math.sin(this.cutterAngle || (Math.PI/6)))).normalize();
      const radius = this.cutterRadius || 7.5;
      const arcTarget = playerPos.clone().add(dir.multiplyScalar(radius));
      const toArc = arcTarget.sub(e.position); toArc.y = 0;
      if (toArc.lengthSq() > 0) desired = toArc.normalize();
    } else {
      // Pursuers use simple intercept: lead toward predicted future player position
      const toPlayerFlat = playerPos.clone().setY(0).sub(new this.THREE.Vector3(e.position.x, 0, e.position.z));
      const horizDist = toPlayerFlat.length();
      const speed = Math.max(0.1, this.speed);
      const leadTime = Math.max(0, Math.min(0.8, (horizDist / speed) * 0.35));
      const predicted = playerPos.clone().add(this._playerVel.clone().multiplyScalar(leadTime));
      const toPred = predicted.sub(e.position); toPred.y = 0;
      if (toPred.lengthSq() > 0) desired = toPred.normalize();
    }

    // Anti-kite zigzag/jukes when mid-range and LOS is clear
    if (this._jukeCooldown > 0) this._jukeCooldown = Math.max(0, this._jukeCooldown - dt);
    if (this._jukeTime > 0) this._jukeTime = Math.max(0, this._jukeTime - dt);
    const inMidRange = dist >= 6 && dist <= 12;
    const hasLOS = this._hasLineOfSight(e.position, playerPos, ctx.objects);
    if (inMidRange && hasLOS && this._jukeCooldown <= 0 && this._jukeTime <= 0) {
      if (Math.random() < 0.9 * dt) {
        const fwd = desired.lengthSq()>0 ? desired.clone() : toPlayer.clone();
        fwd.y = 0; if (fwd.lengthSq()>0) fwd.normalize();
        const side = new this.THREE.Vector3(-fwd.z, 0, fwd.x);
        this._jukeDir.copy(side.multiplyScalar(Math.random() < 0.5 ? 1 : -1));
        this._jukeTime = 0.4 + Math.random() * 0.4;
        this._jukeCooldown = 1.0 + Math.random() * 0.6;
      }
    }

    // Regroup behavior: if outnumbered and isolated, pause briefly to wait for a buddy
    this._regroupTimer = this._regroupTimer || 0;
    const regrouping = ctx.blackboard && ctx.blackboard.regroup;
    if (regrouping) {
      const allies = ctx.alliesNearbyCount(e.position, 8.0, e);
      if (allies <= 0) {
        // start or continue pause timer
        if (this._regroupTimer <= 0) this._regroupTimer = 1.0 + Math.random() * 1.0; // 1–2s
        else this._regroupTimer = Math.max(0, this._regroupTimer - dt);
      } else {
        this._regroupTimer = 0; // buddy nearby, engage normally
      }
    } else {
      this._regroupTimer = 0;
    }

    // Cache last forward used for movement to orient hit-jukes
    if (desired.lengthSq() > 0) {
      this._lastFwd.copy(desired).setY(0).normalize();
    } else if (toPlayer.lengthSq() > 0) {
      this._lastFwd.copy(toPlayer).setY(0).normalize();
    }

    // Under suppression, reduce avoidance to push harder
    const avoidWeight = (ctx.blackboard && ctx.blackboard.suppression) ? 0.9 : 1.35;
    const avoid = ctx.avoidObstacles(e.position, desired, 1.6);
    // Cutters maintain a wider separation radius to hold arcs
    const sepRadius = this.role === 'cutter' ? 1.8 : 1.2;
    const sep = ctx.separation(e.position, sepRadius, e);

    const steer = desired.clone().multiplyScalar(1.0)
      .add(avoid.multiplyScalar(avoidWeight))
      .add(sep.multiplyScalar(0.85));

    // Apply active juke impulse
    if (this._jukeTime > 0 && this._jukeDir.lengthSq() > 0) {
      steer.add(this._jukeDir.clone().multiplyScalar(1.35));
    }
    // Apply on-hit micro-juke impulse
    if (this._hitJukeTime > 0 && this._hitJukeDir.lengthSq() > 0) {
      this._hitJukeTime = Math.max(0, this._hitJukeTime - dt);
      steer.add(this._hitJukeDir.clone().multiplyScalar(1.2));
    }

    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      // slow when recently hit (for tanks), and decay DR timer
      if (this._damageReductionTimer > 0) this._damageReductionTimer = Math.max(0, this._damageReductionTimer - dt);
      // If regrouping pause is active, dampen movement almost fully
      const regroupMul = (this._regroupTimer && this._regroupTimer > 0) ? 0.15 : 1.0;
      const slowMul = this._slowTimer > 0 ? 0.7 : 1.0;
      if (this._slowTimer > 0) this._slowTimer = Math.max(0, this._slowTimer - dt);
      let step = steer.multiplyScalar(this.speed * slowMul * regroupMul * dt);

      // Prevent entering the player's personal space; slide tangentially instead
      const minRadius = 1.2; // meters from player center
      const radial = playerPos.clone().setY(0).sub(new this.THREE.Vector3(e.position.x, 0, e.position.z));
      const distNow = radial.length();
      if (distNow > 0.0001) {
        const toPlayerDir = radial.clone().multiplyScalar(1 / distNow); // from enemy to player
        const nextPos = e.position.clone().add(step);
        const nextDX = nextPos.x - playerPos.x;
        const nextDZ = nextPos.z - playerPos.z;
        const nextDist = Math.hypot(nextDX, nextDZ);
        // If next step would go inside the radius, remove inward component
        if (nextDist < minRadius) {
          const inward = Math.max(0, step.dot(toPlayerDir));
          if (inward > 0) step.add(toPlayerDir.clone().multiplyScalar(-inward));
          // If already inside, nudge outward slightly
          if (distNow < minRadius) {
            const push = (minRadius - distNow) + 0.02;
            step.add(toPlayerDir.clone().multiplyScalar(-push));
          }
        }
      }

      ctx.moveWithCollisions(e, step);
    }

    const moved = e.position.clone().sub(this._lastPos).length();
    if (this._nudgeCooldown > 0) this._nudgeCooldown = Math.max(0, this._nudgeCooldown - dt);
    if (moved < 0.006) {
      this._stuckTime += dt;
      if (this._stuckTime > 0.8 && this._nudgeCooldown <= 0) {
        const lateral = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 0.35);
        e.position.add(lateral);
        this._stuckTime = 0;
        this._nudgeCooldown = 0.9;
      }
    } else {
      this._stuckTime = 0;
    }

    this._lastPos.copy(e.position);
  }

  onHit(damage, isHead) {
    // Short lateral micro-juke 0.12–0.2s
    const base = 0.12 + Math.random() * 0.08;
    this._hitJukeTime = Math.max(this._hitJukeTime, base);
    // lateral relative to last forward toward player
    const fwd = this._lastFwd.lengthSq() > 0 ? this._lastFwd.clone() : new this.THREE.Vector3(0,0,1);
    const side = new this.THREE.Vector3(-fwd.z, 0, fwd.x);
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    this._hitJukeDir.copy(side.multiplyScalar(sideSign));
    // Tank reaction: brief slow and minor DR
    if (this.cfg && this.cfg.type === 'tank') {
      this._slowTimer = Math.max(this._slowTimer, 0.35);
      this._damageReductionTimer = Math.max(this._damageReductionTimer, 0.35);
      this._damageReductionValue = 0.25;
    }
  }

  getDamageReduction() {
    return this._damageReductionTimer > 0 ? (this._damageReductionValue || 0) : 0;
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 1.2, fromPos.z);
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
}
