import { createBlockBot } from '../assets/blockbot.js';
import { createGruntBot } from '../assets/gruntbot.js';

// --- Melee attack definitions ---
const GRUNT_ATTACKS = [
  { name: 'jab',  hand: 'lead', windup: 0.22, active: 0.09, recover: 0.45, damage: 10, reach: 2.2, knockback: 0.25 },
  { name: 'hook', hand: 'rear', windup: 0.32, active: 0.10, recover: 0.60, damage: 16, reach: 2.3, knockback: 0.35 }
];

const TANK_ATTACKS = [
  { name: 'haymaker', hand: 'rear', windup: 0.45, active: 0.10, recover: 0.9, damage: 34, reach: 2.4, knockback: 0.9 },
  { name: 'shove', hand: 'both', windup: 0.30, active: 0.08, recover: 0.60, damage: 14, reach: 2.0, knockback: 1.2 },
  // Heavy jump slam with radial damage on landing
  { name: 'slam', hand: 'both', windup: 0.6, active: 0.1, recover: 1.0, damage: 0, reach: 0, radius: 5.0, radialDamage: 28, radialKnock: 0.9 }
];

export class MeleeEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    // Model: use chunky BlockBot for tanks; default to simple boxy grunt
    let body, head;
    if (cfg && cfg.type === 'tank') {
      const built = createBlockBot({ THREE, mats, scale: 1.1 });
      body = built.root; head = built.head; this._animRefs = built.refs || {};
    } else {
      // Default grunt model (slightly smaller)
      const built = createGruntBot({ THREE, mats, scale: 0.88 });
      body = built.root; head = built.head; this._animRefs = built.refs || {};
    }

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
    this._yaw = 0; // facing yaw
    this._walkPhase = 0; // gait animation phase
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
    // Stagger and burst mechanics
    this._staggerTimer = 0;             // active stagger slow
    this._staggerImmunityTimer = 0;     // prevents stun-lock
    this._burstTimer = 0;               // post-regroup gap-close burst
    this._regroupWasPaused = false;     // detect end of regroup pause

    // Melee combat state
    this._attack = null;          // current attack descriptor
    this._attackTimer = 0;        // counts down windup/active/recover
    this._attackPhase = 'idle';   // 'idle'|'windup'|'active'|'recover'
    this._attackCooldown = 0;     // general cooldown between attacks
  }

  update(dt, ctx) {
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    // Attack selection and execution
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    this._updateMelee(dt, ctx, dist, toPlayer, playerPos);
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
    const regroupPausedBefore = (this._regroupTimer && this._regroupTimer > 0);
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
    const regroupPausedAfter = (this._regroupTimer && this._regroupTimer > 0);
    // Detect end of regroup pause to trigger a small gap-close burst
    if (regroupPausedBefore && !regroupPausedAfter) {
      this._burstTimer = 0.45 + Math.random() * 0.15; // 0.45–0.6s
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
      // Apply stagger slow and burst speed
      if (this._staggerTimer > 0) this._staggerTimer = Math.max(0, this._staggerTimer - dt);
      if (this._staggerImmunityTimer > 0) this._staggerImmunityTimer = Math.max(0, this._staggerImmunityTimer - dt);
      if (this._burstTimer > 0) this._burstTimer = Math.max(0, this._burstTimer - dt);
      const staggerMul = this._staggerTimer > 0 ? 0.15 : 1.0;
      const burstMul = this._burstTimer > 0 ? 1.5 : 1.0;
      if (this._slowTimer > 0) this._slowTimer = Math.max(0, this._slowTimer - dt);
      let step = steer.multiplyScalar(this.speed * slowMul * regroupMul * staggerMul * burstMul * dt);

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

      // Move
      const before = e.position.clone();
      ctx.moveWithCollisions(e, step);
      // Aim body toward horizontal movement direction
      const movedVec = e.position.clone().sub(before); movedVec.y = 0;
      const speedNow = movedVec.length() / Math.max(dt, 0.00001);
      if (movedVec.lengthSq() > 1e-6) {
        const desiredYaw = Math.atan2(movedVec.x, movedVec.z);
        // smooth damp yaw
        let deltaYaw = desiredYaw - this._yaw;
        // wrap to [-pi, pi]
        deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = 6.0; // rad/s
        this._yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, deltaYaw));
        e.rotation.set(0, this._yaw, 0);
      }
      // Simple gait swing based on speed (disabled during attack windup/active)
      const isAttackingNow = !!(this._attack && (this._attackPhase === 'windup' || this._attackPhase === 'active'));
      if (!isAttackingNow) {
        this._walkPhase += Math.min(12.0, 4.0 + speedNow * 0.25) * dt;
        const swing = Math.sin(this._walkPhase) * Math.min(0.5, 0.1 + speedNow * 0.02);
        if (this._animRefs) {
          const la = this._animRefs.leftArm, ra = this._animRefs.rightArm;
          const ll = this._animRefs.leftLeg, rl = this._animRefs.rightLeg;
          if (la && ra) { la.rotation.x = swing; ra.rotation.x = -swing; }
          if (ll && rl) { ll.rotation.x = -swing * 0.8; rl.rotation.x = swing * 0.8; }
        }
      }
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

  _updateMelee(dt, ctx, dist, toPlayer, playerPos) {
    const isTank = (this.cfg && this.cfg.type === 'tank');
    const attacks = isTank ? TANK_ATTACKS : GRUNT_ATTACKS;
    const reach = (this._attack ? this._attack.reach : (isTank ? 2.0 : 1.8));
    // Predictive timing: estimate when we can be in range based on current relative velocity
    // Simple heuristic: if projected distance within reach in tPredict, start windup now
    const tPredict = isTank ? 0.45 : 0.28; // average windup
    // Estimate our next movement step magnitude per second
    const speed = Math.max(0.1, this.speed);
    const predictedClosing = dist - speed * tPredict; // ignore player velocity (kept simple)

    // If currently in an attack, progress its phases
    if (this._attack) {
      this._attackTimer = Math.max(0, this._attackTimer - dt);
      if (this._attackPhase === 'windup') {
        // Face target more aggressively during windup
        const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
        let deltaYaw = desiredYaw - (this._yaw || 0); deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = 9.0; this._yaw = (this._yaw || 0) + Math.max(-turnRate*dt, Math.min(turnRate*dt, deltaYaw));
        this.root.rotation.y = this._yaw;
        // For slam, crouch/compress and begin vertical lift preparation
        if (this._attack.name === 'slam') {
          // compress stance
          this.root.position.y = Math.max(0.8, this.root.position.y - 0.4 * dt);
        } else {
          this._animateArmsWindup(this._attack);
        }
        if (this._attackTimer <= 0) { this._attackPhase = 'active'; this._attackTimer = this._attack.active; this._didHitThisSwing = false; }
        return; // windup overrides regular movement intent subtly
      }
      if (this._attackPhase === 'active') {
        if (this._attack.name === 'slam') {
          // Leap upward and forward a bit; on timer end we land
          const up = 4.2; const fwdAmt = 2.4; // tuned simple arc
          const fwd = new this.THREE.Vector3(Math.sin(this._yaw||0), 0, Math.cos(this._yaw||0));
          this.root.position.add(new this.THREE.Vector3(fwd.x * fwdAmt * dt, up * dt, fwd.z * fwdAmt * dt));
        } else {
          this._animateArmsStrike(this._attack);
        }
        // Apply hit once if in range and LOS
        // Require that player is within a narrow forward arc to prevent side/back hits
        const forward = new this.THREE.Vector3( Math.sin(this._yaw||0), 0, Math.cos(this._yaw||0) );
        // aim slightly upward to account for chest height
        const toP3 = new this.THREE.Vector3(playerPos.x - this.root.position.x, (1.6) - (this.root.position.y||0), playerPos.z - this.root.position.z);
        const toP = toP3.clone().setY(0).normalize();
        const facingCos = forward.dot(toP);
        if (!this._didHitThisSwing && this._attack.name !== 'slam' && dist <= reach && facingCos > 0.5 && ctx.onPlayerDamage) {
          this._didHitThisSwing = true;
          ctx.onPlayerDamage(this._attack.damage, 'melee');
          // Tank shove: add small knockback
          const kb = this._attack.knockback || 0;
          if (kb > 0 && ctx.player && ctx.player.position) {
            const knock = toP.clone().multiplyScalar(-kb);
            // push player object slightly if available
            ctx.player.position.add(knock);
          }
        }
        if (this._attackTimer <= 0) {
          // For slam, apply radial landing damage and small camera shake/SFX
          if (this._attack.name === 'slam') {
            // Land back to ground level
            this.root.position.y = 0.8;
            const radius = this._attack.radius || 5.0;
            const toPlayerNow = new this.THREE.Vector3(playerPos.x - this.root.position.x, 0, playerPos.z - this.root.position.z);
            const dNow = toPlayerNow.length();
            if (dNow <= radius && ctx.onPlayerDamage) {
              ctx.onPlayerDamage(this._attack.radialDamage, 'melee');
              // Radial knockback outward
              const dirOut = toPlayerNow.length()>0? toPlayerNow.clone().multiplyScalar(1/Math.max(0.0001,dNow)) : new this.THREE.Vector3();
              const k = this._attack.radialKnock || 0.8;
              if (ctx.player && ctx.player.position) ctx.player.position.add(dirOut.multiplyScalar(-k));
            }
            // Small shock ring VFX via effects if present
            try { window?._EFFECTS?.ring?.(this.root.position.clone(), radius); } catch(_) {}
          }
          this._attackPhase = 'recover'; this._attackTimer = this._attack.recover;
        }
        return;
      }
      if (this._attackPhase === 'recover') {
        this._animateArmsRecover(this._attack, dt);
        if (this._attackTimer <= 0) { this._attack = null; this._attackPhase = 'idle'; this._attackCooldown = 0.25 + Math.random() * 0.2; }
        return;
      }
    }

    // Not attacking; consider starting one earlier if we are about to be in range
    const canStartByPredict = (this._attackCooldown <= 0) && (predictedClosing <= (reach + 0.15));
    const canStartNow = (this._attackCooldown <= 0) && dist <= (isTank ? 2.0 : 1.9);
    if (canStartByPredict || canStartNow) {
      // Pick attack: prefer quick jab for grunts, haymaker for tanks; 30% chance alternate
      const prefer = (isTank && Math.random() < 0.25) ? (TANK_ATTACKS[2]) : attacks[0]; // sometimes pick slam
      const alt = attacks[1] || attacks[0];
      const choice = (Math.random() < 0.3 ? alt : prefer);
      this._beginAttack(choice);
      // Nudge forward a bit on windup start to feel like stepping in
      // When beginning a punch, raise the striking hand and extend slightly to reduce need to be face-to-face
      const stepIn = toPlayer.clone().multiplyScalar(this._attack?.name === 'slam' ? 0.05 : (isTank ? 0.18 : 0.26));
      const before = this.root.position.clone();
      ctx.moveWithCollisions(this.root, stepIn);
      // Rotate toward target immediately
      const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
      this._yaw = desiredYaw; this.root.rotation.y = this._yaw;
    }
  }

  _beginAttack(desc) {
    this._attack = { ...desc };
    this._attackPhase = 'windup';
    // Add small randomization to timings
    const jitter = (v) => v * (0.9 + Math.random()*0.2);
    this._attackTimer = jitter(desc.windup);
    this._didHitThisSwing = false;
  }

  _animateArmsWindup(attack) {
    const a = this._animRefs || {}; const lead = a.leftArm; const rear = a.rightArm;
    const amt = 0.6; // radians range
    if (attack.hand === 'lead' && lead) { lead.rotation.x = -amt; lead.rotation.z = 0.1; }
    if (attack.hand === 'rear' && rear) { rear.rotation.x = -amt*0.9; rear.rotation.z = -0.1; }
    if (attack.hand === 'both') {
      if (lead) { lead.rotation.x = -amt*0.7; lead.rotation.z = 0.1; }
      if (rear) { rear.rotation.x = -amt*0.7; rear.rotation.z = -0.1; }
    }
    // small torso lean forward
    this.root.rotation.x = -0.05;
    // glow telegraph via emissive intensity if available (set on arm stripe if present)
    try {
      const stripeL = lead?.children?.find?.(c => c.material && c.material.emissiveIntensity != null);
      const stripeR = rear?.children?.find?.(c => c.material && c.material.emissiveIntensity != null);
      if (stripeL) stripeL.material.emissiveIntensity = 1.2;
      if (stripeR) stripeR.material.emissiveIntensity = 1.2;
    } catch(_){}
    // SFX whoosh: use global SFX if available
    try { window?._SFX?.enemyVocal?.(this.cfg?.type || 'grunt'); } catch(_) {}
  }

  _animateArmsStrike(attack) {
    const a = this._animRefs || {}; const lead = a.leftArm; const rear = a.rightArm;
    const thrust = 1.0; // radians forward
    if (attack.hand === 'lead' && lead) { lead.rotation.x = thrust; lead.rotation.z = -0.05; }
    if (attack.hand === 'rear' && rear) { rear.rotation.x = thrust; rear.rotation.z = 0.05; }
    if (attack.hand === 'both') {
      if (lead) { lead.rotation.x = thrust*0.9; lead.rotation.z = -0.05; }
      if (rear) { rear.rotation.x = thrust*0.9; rear.rotation.z = 0.05; }
    }
    // brief forward lunge
    if (!this._strikeLungeApplied) {
      const fwd = new this.THREE.Vector3(Math.sin(this._yaw||0), 0, Math.cos(this._yaw||0)).normalize();
      const lunge = fwd.multiplyScalar(0.12);
      this.root.position.add(lunge);
      this._strikeLungeApplied = true;
    }
  }

  _animateArmsRecover(_attack, dt) {
    const a = this._animRefs || {}; const arms = [a.leftArm, a.rightArm];
    for (const arm of arms) {
      if (!arm) continue;
      // Smoothly blend back rotations to idle (0) without altering absolute position offsets
      arm.rotation.x += (0 - arm.rotation.x) * Math.min(1, dt * 10);
      arm.rotation.z += (0 - arm.rotation.z) * Math.min(1, dt * 10);
    }
    // ease torso lean back to 0
    this.root.rotation.x *= Math.max(0, 1 - dt*6);
    this._strikeLungeApplied = false;
    // reset glow intensity if we boosted it
    try {
      for (const arm of arms) {
        if (!arm) continue;
        const stripe = arm.children?.find?.(c => c.material && c.material.emissiveIntensity != null);
        if (stripe) stripe.material.emissiveIntensity = 0.8;
      }
    } catch(_){}
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
    // Light stagger on headshot or heavy damage, with immunity to prevent stun-lock
    const heavy = damage >= 30;
    if ((isHead || heavy) && this._staggerImmunityTimer <= 0) {
      this._staggerTimer = 0.18 + Math.random() * 0.06;      // 0.18–0.24s
      this._staggerImmunityTimer = 0.6 + Math.random() * 0.2; // 0.6–0.8s
      // cancel current juke during stagger
      this._jukeTime = 0;
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
