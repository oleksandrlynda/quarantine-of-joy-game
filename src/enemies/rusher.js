import { createRunnerBot } from '../assets/runnerbot.js';

// Variant definitions with unique palettes and stats
export const RUSHER_VARIANTS = {
  basic: {
    hp: 60,
    speedMin: 6.4,
    speedMax: 7.9,
    dashDuration: 0.5,
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
    color: 0xfacc15,
    palette: {
      accent: 0xfacc15,
      glow: 0xfacc15
    }
  }
};

const _rusherCache = { models: {} };

export class RusherEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;

    const variantName = cfg.variant || 'basic';
    const v = RUSHER_VARIANTS[variantName] || RUSHER_VARIANTS.basic;
    this.variant = variantName;
    this.cfg = { ...cfg, ...v };

    // Slim, agile runner model per variant
    if (!_rusherCache.models[variantName]) {
      _rusherCache.models[variantName] = createRunnerBot({ THREE, mats, scale: 0.6, palette: v.palette });
    }
    const src = _rusherCache.models[variantName];
    const clone = src.root.clone(true);
    // Remap anim refs from asset to this clone so gait/arm anims work
    const remapRefs = (srcRoot, cloneRoot, refs) => {
      const out = {};
      const getPath = (node) => { const path = []; let cur = node; while (cur && cur !== srcRoot) { const parent = cur.parent; if (!parent) return null; const idx = parent.children.indexOf(cur); if (idx < 0) return null; path.push(idx); cur = parent; } return path.reverse(); };
      const follow = (root, path) => { let cur = root; for (const idx of (path||[])) { if (!cur || !cur.children || idx >= cur.children.length) return null; cur = cur.children[idx]; } return cur; };
      for (const k of Object.keys(refs||{})) { const p = getPath(refs[k]); out[k] = p ? follow(cloneRoot, p) : null; }
      return out;
    };
    const body = clone; const head = clone.userData?.head || src.head; this._animRefs = remapRefs(src.root, clone, src.refs || {});
    body.position.copy(spawnPos);
    body.rotation.x = 0; // world yaw only

    // Add a simple blade to right arm for readability
    if (this._animRefs.rightArm) {
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdff3ff, emissive: 0xdff3ff, emissiveIntensity: 0.7 });
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), new THREE.MeshLambertMaterial({ color: 0x2a2d31 }));
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.10), bladeMat);
      const group = new THREE.Group();
      group.add(hilt); group.add(blade);
      hilt.position.set(0, -0.2, 0.28);
      blade.position.set(0, -0.8, 0.28);
      this._animRefs.rightArm.add(group);
      group.position.set(0.0, -1.6, 0.2);
      this._bladeRef = group;
    }

    // Keep compatibility with existing hit logic
    body.userData = { type: cfg.type, head, hp: v.hp, maxHp: v.hp };
    this.root = body;

    // Movement parameters
    this.speed = v.speedMin + Math.random() * (v.speedMax - v.speedMin);
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
    this._windUpSound = null;     // handle to charging audio
    this._stunTimer = 0;          // self-stun time after failed dash
    this._flinchTimer = 0;        // time after being interrupted by damage
    this._flinchThreshold = 25;   // damage needed during dash to interrupt
    this._flinchAccum = 0;        // accumulated damage while dashing
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    if (this._hitCooldown > 0) this._hitCooldown = Math.max(0, this._hitCooldown - dt);
    if (this._recoverTimer > 0) this._recoverTimer = Math.max(0, this._recoverTimer - dt);
    if (this._stunTimer > 0) this._stunTimer = Math.max(0, this._stunTimer - dt);
    if (this._flinchTimer > 0) this._flinchTimer = Math.max(0, this._flinchTimer - dt);
    if (this._windUpTimer > 0) {
      this._windUpTimer = Math.max(0, this._windUpTimer - dt);
      if (this._windUpTimer === 0) {
        // wind-up finished -> start dash
        this._dashTimer = (this.cfg.dashDuration ?? 0.5) + Math.random() * 0.2;
        this._dashTotal = this._dashTimer;
        this._overrunTimer = 0;
        this._dashCooldown = 1.2 + Math.random() * 0.8;
        this._charging = true;
        this._hitCooldown = 0;
        this._hasDealtHit = false;
        this._flinchAccum = 0;
        try {
          this._windUpSound?.stop?.();
          window?._SFX?.dashWhoosh?.();
          window?._EFFECTS?.spawnDashTrail?.(e.position.clone(), this._dashDir.clone(), this.cfg.color);
        } catch(_){}
        this._windUpSound = null;
      }
    }
    if (dist < 2.0 && this._charging && ctx.onPlayerDamage && this._hitCooldown <= 0 && !this._hasDealtHit) {
      ctx.onPlayerDamage(20, 'melee');
      this._hitCooldown = 0.8;
      this._hasDealtHit = true;
      try {
        window?._EFFECTS?.screenShake?.(0.25, 0.25);
        window?._EFFECTS?.spawnDashImpact?.(e.position.clone(), this.cfg.color);
      } catch(_){}
    }
    if (dist > 70) return;

    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();

    // Update player velocity estimate (EMA)
    if (this._prevPlayerPos) {
      const delta = playerPos.clone().sub(this._prevPlayerPos);
      const instVel = delta.multiplyScalar(dt > 0 ? 1 / dt : 0);
      this._playerVel.lerp(instVel, Math.min(1, 0.4 + dt * 0.6));
      this._playerVel.y = 0;
    }
    this._prevPlayerPos = playerPos.clone();

    // Desired direction with intercept prediction
    const toPlayerFlat = playerPos.clone().setY(0).sub(new THREE.Vector3(e.position.x, 0, e.position.z));
    const horizDist = toPlayerFlat.length();
    const leadTime = Math.max(0, Math.min(0.5, (horizDist / Math.max(0.1, this.speed)) * 0.25));
    const predicted = playerPos.clone().add(this._playerVel.clone().multiplyScalar(leadTime));
    const toPred = predicted.sub(e.position); toPred.y = 0;
    let desired = toPred.lengthSq() > 0 ? toPred.normalize() : toPlayer.clone();

    // Avoid obstacles and separation unless currently charging
    if (!this._charging) {
      const avoid = ctx.avoidObstacles(e.position, desired, 2.2);
      const sep = ctx.separation(e.position, 1.0, e);
      desired = desired.multiplyScalar(1.0).add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.6)).normalize();
    }

    // Dash logic: burst when mid-range and LOS is clear
    if (this._dashCooldown > 0) this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    if (this._charging) {
      if (this._dashTimer > 0) {
        this._dashTimer = Math.max(0, this._dashTimer - dt);
        if (this._dashTimer === 0 && !this._hasDealtHit) {
          const overrunFrac = 0.1 + Math.random() * 0.1;
          this._overrunTimer = this._dashTotal * overrunFrac;
        }
      } else if (this._overrunTimer > 0) {
        this._overrunTimer = Math.max(0, this._overrunTimer - dt);
      }
      if (this._dashTimer === 0 && this._overrunTimer === 0) {
        this._charging = false;
        this._dashTotal = 0;
        this._recoverTimer = 0.5 + Math.random() * 0.3;
        if (!this._hasDealtHit) this._stunTimer = 0.6 + Math.random() * 0.3;
        this._flinchAccum = 0;
      }
    }
    const canDash = (dist >= 5 && dist <= 12) && !this._charging && this._dashCooldown <= 0 && this._recoverTimer <= 0 && this._windUpTimer <= 0 && this._stunTimer <= 0 && this._flinchTimer <= 0 && this._hasLineOfSight(e.position, playerPos, ctx.objects);
    if (canDash && Math.random() < 1.2 * dt) {
      this._windUpTimer = 0.3;
      this._dashDir.copy(desired);
      try { this._windUpSound?.stop?.(); this._windUpSound = window?._SFX?.saberCharge?.(); } catch(_){}
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

    // Move and face motion
    const before = e.position.clone();
    ctx.moveWithCollisions(e, step);
    const movedVec = e.position.clone().sub(before); movedVec.y = 0;
    if (this._charging && movedVec.lengthSq() + 1e-6 < step.lengthSq()) {
      this._charging = false;
      this._dashTimer = 0;
      this._overrunTimer = 0;
      this._dashTotal = 0;
      this._recoverTimer = 0.5 + Math.random() * 0.3;
      this._stunTimer = 0.6 + Math.random() * 0.3;
      try {
        window?._EFFECTS?.screenShake?.(0.2, 0.2);
        window?._EFFECTS?.spawnDashImpact?.(e.position.clone(), this.cfg.color);
      } catch(_){}
      this._flinchAccum = 0;
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
      const blade = this._bladeRef?.children?.[1];
      if (blade && blade.material && blade.material.emissiveIntensity != null) {
        blade.material.emissiveIntensity = (this._windUpTimer > 0 || this._charging) ? 1.4 : 0.7;
      }
    } catch(_){}
    this._lastPos.copy(e.position);
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 1.2, fromPos.z);
    const target = new THREE.Vector3(targetPos.x, 1.5, targetPos.z);
    const dir = target.clone().sub(origin);
    const dist = dir.length(); if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir); this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
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
}


