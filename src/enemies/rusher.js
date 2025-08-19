import { createRunnerBot } from '../assets/runnerbot.js';
const _rusherCache = { model: null };

export class RusherEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    // Slim, agile runner model
    if (!_rusherCache.model) _rusherCache.model = createRunnerBot({ THREE, mats, scale: 0.6 });
    const src = _rusherCache.model;
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
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    // Movement parameters
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this._prevPlayerPos = null;
    this._playerVel = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0; this._walkPhase = 0;
    // Dash behavior
    this._dashTimer = 0;           // active dash time left
    this._dashCooldown = 0;        // until next dash available
    this._dashDir = new THREE.Vector3();
    this._lastPos = body.position.clone();
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist < 2.0 && ctx.onPlayerDamage) ctx.onPlayerDamage(16 * dt, 'melee');
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

    // Avoid obstacles and separation
    const avoid = ctx.avoidObstacles(e.position, desired, 2.2);
    const sep = ctx.separation(e.position, 1.0, e);
    desired = desired.multiplyScalar(1.0).add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.6)).normalize();

    // Dash logic: burst when mid-range and LOS is clear
    if (this._dashCooldown > 0) this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    if (this._dashTimer > 0) this._dashTimer = Math.max(0, this._dashTimer - dt);
    const canDash = (dist >= 5 && dist <= 12) && this._dashCooldown <= 0 && this._hasLineOfSight(e.position, playerPos, ctx.objects);
    if (canDash && Math.random() < 1.2 * dt) {
      this._dashTimer = 0.35 + Math.random() * 0.15;      // 0.35–0.5s burst
      this._dashCooldown = 1.2 + Math.random() * 0.8;     // 1.2–2.0s cooldown
      this._dashDir.copy(desired);
    }

    const dashMul = this._dashTimer > 0 ? 2.4 : 1.0;
    const step = desired.clone().multiplyScalar(this.speed * dashMul * dt);

    // Move and face motion
    const before = e.position.clone();
    ctx.moveWithCollisions(e, step);
    const movedVec = e.position.clone().sub(before); movedVec.y = 0;
    const speedNow = movedVec.length() / Math.max(dt, 0.00001);
    if (movedVec.lengthSq() > 1e-6) {
      const desiredYaw = Math.atan2(movedVec.x, movedVec.z);
      let deltaYaw = desiredYaw - this._yaw; deltaYaw = ((deltaYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      const turnRate = 10.0; // faster turns for rushers
      this._yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, deltaYaw));
      e.rotation.set(0, this._yaw, 0);
    }
    // Aggressive forward lean while dashing
    e.rotation.x = this._dashTimer > 0 ? -0.12 : -0.04;

    // Arm/leg swing
    this._walkPhase += Math.min(18.0, 7.0 + speedNow * 0.3) * dt;
    const swing = Math.sin(this._walkPhase) * Math.min(0.8, 0.18 + speedNow * 0.03);
    if (this._animRefs) {
      const la = this._animRefs.leftArm, ra = this._animRefs.rightArm;
      const ll = this._animRefs.leftLeg, rl = this._animRefs.rightLeg;
      if (la && ra) { la.rotation.x = swing * 1.1; ra.rotation.x = -swing * 1.1; }
      if (ll && rl) { ll.rotation.x = -swing; rl.rotation.x = swing; }
    }
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

  onHit(_damage, _isHead) {
    // Rushers shrug off tiny flinches; no special handling for now
  }
}


