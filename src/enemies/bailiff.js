import { createRunnerBot } from '../assets/runnerbot.js';
const _bailiffCache = { model: null };

export class BailiffEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    // use runnerbot with court palette
    if (!_bailiffCache.model) _bailiffCache.model = createRunnerBot({
      THREE,
      mats,
      scale: 0.6,
      palette: {
        armor: 0x334155,
        accent: 0x475569,
        glow: 0x60a5fa
      }
    });
    const src = _bailiffCache.model;
    const clone = src.root.clone(true);

    const remapRefs = (srcRoot, cloneRoot, refs) => {
      const out = {};
      const getPath = (node) => {
        const path = [];
        let cur = node;
        while (cur && cur !== srcRoot) {
          const parent = cur.parent;
          if (!parent) return null;
          const idx = parent.children.indexOf(cur);
          if (idx < 0) return null;
          path.push(idx);
          cur = parent;
        }
        return path.reverse();
      };
      const follow = (root, path) => {
        let cur = root;
        for (const idx of path || []) {
          if (!cur || !cur.children || idx >= cur.children.length) return null;
          cur = cur.children[idx];
        }
        return cur;
      };
      for (const k of Object.keys(refs || {})) {
        const p = getPath(refs[k]);
        out[k] = p ? follow(cloneRoot, p) : null;
      }
      return out;
    };
    const body = clone;
    const head = clone.userData?.head || src.head;
    this._animRefs = remapRefs(src.root, clone, src.refs || {});
    body.position.copy(spawnPos);
    body.rotation.x = 0;

    // small gavel in right hand
    if (this._animRefs.rightArm) {
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
      const headMat = new THREE.MeshLambertMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 0.7 });
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), handleMat);
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.12), headMat);
      const group = new THREE.Group();
      group.add(handle);
      group.add(headMesh);
      handle.position.set(0, -0.2, 0.28);
      headMesh.position.set(0, -0.2, 0.48);
      this._animRefs.rightArm.add(group);
      group.position.set(0.0, -1.6, 0.2);
      this._gavelRef = group;
    }

    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this._prevPlayerPos = null;
    this._playerVel = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0;
    this._walkPhase = 0;

    this._dashTimer = 0;
    this._dashCooldown = 0;
    this._dashDir = new THREE.Vector3();
    this._lastPos = body.position.clone();
    this._stuckTime = 0;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist < 2.0 && ctx.onPlayerDamage) ctx.onPlayerDamage(16 * dt, 'melee');
    if (dist > 70) return;

    toPlayer.y = 0;
    if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    if (this._prevPlayerPos) {
      const delta = playerPos.clone().sub(this._prevPlayerPos);
      const instVel = delta.multiplyScalar(dt > 0 ? 1 / dt : 0);
      this._playerVel.lerp(instVel, Math.min(1, 0.4 + dt * 0.6));
      this._playerVel.y = 0;
    }
    this._prevPlayerPos = playerPos.clone();

    const toPlayerFlat = playerPos.clone().setY(0).sub(new THREE.Vector3(e.position.x, 0, e.position.z));
    const horizDist = toPlayerFlat.length();
    const leadTime = Math.max(0, Math.min(0.5, (horizDist / Math.max(0.1, this.speed)) * 0.25));
    const predicted = playerPos.clone().add(this._playerVel.clone().multiplyScalar(leadTime));
    const toPred = predicted.sub(e.position);
    toPred.y = 0;
    let desired = toPred.lengthSq() > 0 ? toPred.normalize() : toPlayer.clone();

    const hasLOS = this._hasLineOfSight(e.position, playerPos, ctx.objects);
    const isStuck = this._stuckTime > 0.4;
    if ((!hasLOS || isStuck) && ctx.pathfind) {
      ctx.pathfind.recomputeIfStale(this, playerPos).then(p => { this._path = p; });
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) desired = dir.normalize();
      }
    } else if (hasLOS && !isStuck && ctx.pathfind) {
      ctx.pathfind.clear(this);
      this._path = null;
    }

    const avoid = ctx.avoidObstacles(e.position, desired, 2.2);
    const sep = ctx.separation(e.position, 1.0, e);
    desired = desired.multiplyScalar(1.0).add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.6)).normalize();

    if (this._dashCooldown > 0) this._dashCooldown = Math.max(0, this._dashCooldown - dt);
    if (this._dashTimer > 0) this._dashTimer = Math.max(0, this._dashTimer - dt);
    const canDash = (dist >= 5 && dist <= 12) && this._dashCooldown <= 0 && hasLOS;
    if (canDash && Math.random() < 1.2 * dt) {
      this._dashTimer = 0.35 + Math.random() * 0.15;
      this._dashCooldown = 1.2 + Math.random() * 0.8;
      this._dashDir.copy(desired);
    }

    const dashMul = this._dashTimer > 0 ? 2.4 : 1.0;
    const step = desired.clone().multiplyScalar(this.speed * dashMul * dt);

    const before = e.position.clone();
    ctx.moveWithCollisions(e, step);
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
    e.rotation.x = this._dashTimer > 0 ? -0.12 : -0.04;

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

