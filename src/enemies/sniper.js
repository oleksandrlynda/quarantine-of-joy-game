import { createSniperBot } from '../assets/sniper_bot.js';
const _sniperCache = { model: null };

export class SniperEnemy {
  constructor({ THREE, mats, cfg, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this._enemyManager = enemyManager || null;
  
    if (!_sniperCache.model) _sniperCache.model = createSniperBot({ THREE, mats, scale: 0.70 });
    const src = _sniperCache.model;
    const clone = src.root.clone(true);
  
    const remapRefs = (srcRoot, cloneRoot, refs) => {
      const out = {};
      const getPath = (node) => { const path = []; let cur = node; while (cur && cur !== srcRoot) { const parent = cur.parent; if (!parent) return null; const idx = parent.children.indexOf(cur); if (idx < 0) return null; path.push(idx); cur = parent; } return path.reverse(); };
      const follow = (root, path) => { let cur = root; for (const idx of (path||[])) { if (!cur || !cur.children || idx >= cur.children.length) return null; cur = cur.children[idx]; } return cur; };
      for (const k of Object.keys(refs||{})) { const p = getPath(refs[k]); out[k] = p ? follow(cloneRoot, p) : null; }
      return out;
    };
    const body = clone; const head = clone.userData?.head || src.head; this._refs = remapRefs(src.root, clone, src.refs || {});
    body.position.copy(spawnPos);
    try { if (head && head.material) head.material = head.material.clone(); } catch(_) {}
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;
  
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 5, max: 90 };
    this.engageRange = { min: 48, max: 150 };
  
    this.cooldown = 0;
    this.windup = 0;
    this.windupReq = 1.2 + Math.random()*0.6;
  
    // Post-shot displacement
    this.postShotRelocate = 0;
    this.displaceTarget = null;
    this.displaceTimeout = 1.4;
  
    this._raycaster = new THREE.Raycaster();
    this._faceDir = new this.THREE.Vector3(0, 0, 1);
  
    // Cover/peek
    this.coverAnchor = null;
    this.peekOffset = null;
    this.peekTimer = 0;
    this.peekDuration = 1.6 + Math.random()*0.6;
    this.peekCooldown = 0;
  
    // Counter-aim / tuck
    this.tuckTimer = 0;
    this.tuckDuration = 0.9 + Math.random()*0.4;
    this.tuckCooldown = 0;
    this._lastPlayerForward = new THREE.Vector3(0,0,1);
  
    // Laser
    this._aimLine = null;
    this._aimHeat = 0;
  
    // --- NEW: persistent strafe & burst movement to avoid jitter ---
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;   // persists; flips with cooldown
    this._strafeSwapCD = 0;                            // seconds until allowed to flip
    this._moveBurstTimer = 0;                          // current “commit” window
    this._moveBurstDur = 0;                            // planned duration
    this._moveBurstDir = this._strafeDir;              // cached dir for the burst
  
    // --- NEW: idle relocation when in open space (no cover) ---
    this._idleRelocateCD = 0;                          // cooldown before picking a new vantage
  
    // temps
    this._tmpV1 = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
  }
  
  update(dt, ctx){
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    const hasLOS = this._hasLOS(e.position, playerPos, ctx.objects);
  
    // timers
    if (this.cooldown>0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.postShotRelocate>0) this.postShotRelocate = Math.max(0, this.postShotRelocate - dt);
    if (this.peekCooldown>0) this.peekCooldown = Math.max(0, this.peekCooldown - dt);
    if (this.tuckCooldown>0) this.tuckCooldown = Math.max(0, this.tuckCooldown - dt);
    if (this.tuckTimer>0) this.tuckTimer = Math.max(0, this.tuckTimer - dt);
    if (this._strafeSwapCD>0) this._strafeSwapCD = Math.max(0, this._strafeSwapCD - dt);
    if (this._moveBurstTimer>0) this._moveBurstTimer = Math.max(0, this._moveBurstTimer - dt);
    if (this._idleRelocateCD>0) this._idleRelocateCD = Math.max(0, this._idleRelocateCD - dt);
  
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
    e.lookAt(lookTarget); e.rotateY(Math.PI);
  
    // cover anchoring when LOS blocked or tucked
    if (!hasLOS || this.tuckTimer>0) {
      const anchor = this._raycastToPlayer(e.position, playerPos, ctx.objects);
      if (anchor) this.coverAnchor = anchor;
    }
  
    // movement
    const desired = new THREE.Vector3();
    const flatToPlayer = toPlayer.clone().setY(0); if (flatToPlayer.lengthSq()>0) flatToPlayer.normalize();
    const side = new THREE.Vector3(-flatToPlayer.z, 0, flatToPlayer.x);
  
    // post-shot relocation: strong lateral commit
    if (this.postShotRelocate>0) {
      if (!this.displaceTarget) {
        const span = 7 + Math.random()*5;
        const dir = (Math.random()<0.5?1:-1);
        this.displaceTarget = e.position.clone().add(side.clone().multiplyScalar(dir*span));
      }
      const toTgt = this.displaceTarget.clone().sub(e.position).setY(0);
      if (toTgt.lengthSq()>0.0004) desired.add(toTgt.normalize());
      if (toTgt.length()<0.8 || this.postShotRelocate<=0) this.displaceTarget = null;
  
      // break aim/laser while moving
      this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
    }
    else if (this.tuckTimer>0) {
      // stay behind cover gently (no jitter; tiny side bias)
      desired.add(side.clone().multiplyScalar(0.25 * this._strafeDir));
      this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
    }
    else if (!hasLOS) {
      // move to cover anchor; if none (open arena), plan an idle relocation (wide lateral)
      if (!this.coverAnchor) this.coverAnchor = this._raycastToPlayer(e.position, playerPos, ctx.objects);
      if (this.coverAnchor) {
        const toAnchor = this.coverAnchor.clone().sub(e.position).setY(0);
        if (toAnchor.lengthSq()>0.0004) desired.add(toAnchor.normalize());
        if (toAnchor.length()<1.4 && (!this.peekOffset || this.peekCooldown<=0)) {
          this.peekOffset = this._computePeekDesiredFromCover(this.coverAnchor, playerPos, ctx.objects);
          this.peekTimer = 0;
        }
      } else if (this._idleRelocateCD<=0) {
        // open space: commit to a lateral run 10–16m to vary angle
        const span = 10 + Math.random()*6;
        this.displaceTarget = e.position.clone().add(side.clone().multiplyScalar(span * this._strafeDir));
        this.postShotRelocate = 1.1 + Math.random()*0.4; // reuse relocation mechanic
        this._idleRelocateCD = 2.4 + Math.random()*1.2;
      }
    }
    else {
      // LOS present
      if (this.peekOffset) {
        // hold edge with small commitment
        const edgePos = this.coverAnchor ? this.coverAnchor.clone().add(this.peekOffset) : e.position.clone();
        const toEdge = edgePos.sub(e.position).setY(0);
        if (toEdge.length()>0.2) desired.add(toEdge.normalize());
        this.peekTimer += dt;
        if (this.peekTimer >= this.peekDuration) {
          this.peekOffset = null; this.peekCooldown = 0.8 + Math.random()*0.6;
          this.tuckTimer = 0.5 + Math.random()*0.3;
        }
      } else {
        // --- sustained orbit burst instead of per-frame random ---
        if (this._moveBurstTimer<=0) {
          this._moveBurstDir = this._strafeDir;
          this._moveBurstDur = 0.9 + Math.random()*0.7;
          this._moveBurstTimer = this._moveBurstDur;
          if (this._strafeSwapCD<=0 && Math.random()<0.25) { this._strafeDir *= -1; this._strafeSwapCD = 1.2; }
        }
        desired.add(side.clone().multiplyScalar(0.65 * this._moveBurstDir));
        // keep preferred range
        if (dist < this.preferredRange.min) desired.add(flatToPlayer.clone().multiplyScalar(-0.8));
        else if (dist > this.preferredRange.max) desired.add(flatToPlayer.clone().multiplyScalar(0.8));
      }
    }
  
    // avoidance & move (ensure non-tiny step to avoid “tremble”)
    const baseStep = desired.lengthSq()>0 ? desired.clone().normalize() : desired;
    const avoid = baseStep.lengthSq()>0 ? (ctx.avoidObstacles ? ctx.avoidObstacles(e.position, baseStep, 1.8) : baseStep) : baseStep;
    const step = baseStep.clone().add(avoid.multiplyScalar(1.0));
    if (step.lengthSq()>1e-6) {
      step.normalize().multiplyScalar(this.speed * dt * 1.05);
      ctx.moveWithCollisions ? ctx.moveWithCollisions(e, step) : e.position.add(step);
    }
  
    // counter-aim (tuck if player stares at us)
    const pf = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone() : this._lastPlayerForward.clone();
    if (pf.lengthSq()>0) pf.normalize();
    this._lastPlayerForward.copy(pf);
    const pts = e.position.clone().sub(playerPos).setY(0); const d2 = pts.lengthSq();
    if (d2>1e-3) {
      pts.normalize();
      const dot = pf.dot(pts);
      if (dot > 0.92 && this.tuckCooldown<=0 && hasLOS) {
        this.tuckTimer = this.tuckDuration;
        this.tuckCooldown = 1.2 + Math.random()*0.6;
        this.windup = 0; this._setAimLine(null, ctx.scene); this._aimHeat = 0;
      }
    }
  
    // fire control
    if (this._projectiles && this._projectiles.length){ this._updateProjectiles(dt, ctx); }
    const canFireWindow = (ctx.blackboard && (ctx.blackboard.time - (ctx.blackboard.sniperLastFireAt||-Infinity)) >= 1.0);
    const inBandRange = dist >= this.engageRange.min && dist <= this.engageRange.max;
    const playerSpeed = (ctx.blackboard && (ctx.blackboard.playerSpeed || 0)) || 0;
    const steadyShot = playerSpeed < 3.0 || this.peekOffset;
  
    if (hasLOS && inBandRange && this.cooldown<=0 && this.postShotRelocate<=0 && this.tuckTimer<=0 && canFireWindow && steadyShot){
      this.windup += dt;
      this._aimHeat = Math.min(1, this.windup / Math.max(0.001, this.windupReq));
      const from = this._muzzleWorld();
      const to = playerPos.clone();
      to.x += (Math.random()-0.5) * (0.06 * (1 - this._aimHeat));
      to.z += (Math.random()-0.5) * (0.06 * (1 - this._aimHeat));
      this._setAimLine({from, to, color:0xff3344, alpha: 0.25 + 0.55*this._aimHeat}, ctx.scene);
  
      if (this.windup >= this.windupReq){
        this.windup = 0; this._aimHeat = 0;
        this._setAimLine(null, ctx.scene);
        this.cooldown = 3.3 + Math.random()*0.9;
        this._fireProjectile(playerPos, ctx);
        // immediate lateral shuffle
        this.postShotRelocate = 0.9 + Math.random()*0.5;
        this.displaceTarget = null;
        this.peekOffset = null; this.peekTimer = 0; this.peekCooldown = 0.6 + Math.random()*0.5;
      }
    } else {
      if (this.windup > 0) { this.windup = 0; this._aimHeat = 0; }
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
          const score = i + Math.random()*0.15;
          if (score < bestScore) { bestScore = score; best = off; }
          break; // first LOS on this side is optimal for minimal exposure
        }
      }
    };
    // try both sides
    if (Math.random()<0.5){ testSide(left); testSide(right); } else { testSide(right); testSide(left); }
    return best ? best : null;
  }
  
  _setAimLine(data, scene){
    const THREE = this.THREE;
    if (!data){
      if (this._aimLine){ scene.remove(this._aimLine); this._aimLine = null; }
      return;
    }
    const { from, to, color=0xff3344, alpha=0.4 } = data;
    if (!this._aimLine){
      const g = new THREE.BufferGeometry().setFromPoints([from, to]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: alpha });
      this._aimLine = new THREE.Line(g, m);
      scene.add(this._aimLine);
    } else {
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
      try { return this._refs.muzzle.getWorldPosition(new THREE.Vector3()); } catch(_) {}
    }
    return new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
  }

  _fireProjectile(targetPos, ctx){
    const THREE = this.THREE;
    const origin = this._muzzleWorld();
    let dir = targetPos.clone().sub(origin); const d = dir.length(); if (d<=0.0001) dir.set(0,0,1); else dir.normalize();
  
    // Slight inaccuracy if we were not on a controlled peek (elite is most deadly on peeks)
    if (!this.peekOffset) {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), dir).normalize();
      const upOrtho = new THREE.Vector3().crossVectors(dir, right).normalize();
      const ang = this.THREE.MathUtils.degToRad(0.5 + Math.random()*0.6);
      const yaw = 2*Math.PI*Math.random();
      const offset = right.multiplyScalar(Math.cos(yaw)*Math.tan(ang)).add(upOrtho.multiplyScalar(Math.sin(yaw)*Math.tan(ang)));
      dir = dir.add(offset).normalize();
    }
  
    const speed = 60;
    try {
      const vel = dir.clone().multiplyScalar(speed);
      const ok = this._enemyManager?._spawnBullet('sniper', origin, vel, 1.2, 60);
      if (!ok) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
        mesh.position.copy(origin);
        mesh.material.transparent = true; mesh.material.opacity = 1;
        ctx.scene.add(mesh);
        const proj = { mesh, velocity: vel, life: 0, maxLife: 1.2, damage: 60 };
        if (!this._projectiles) this._projectiles = [];
        this._projectiles.push(proj);
      }
    } catch(_){}
    if (ctx.sniperFired) ctx.sniperFired();
  }  

  _updateProjectiles(dt, ctx){
    for (let i=this._projectiles.length-1; i>=0; i--){
      const p = this._projectiles[i];
      const prev = p.mesh.position.clone();
      const step = p.velocity.clone().multiplyScalar(dt);
      const next = prev.clone().add(step);
      // player hit
      const playerPos = ctx.player.position;
      const y = next.y; if (y>=1.2 && y<=1.8){
        const dx = next.x - playerPos.x; const dz = next.z - playerPos.z; if (Math.hypot(dx,dz) < 0.5){
          if (ctx.onPlayerDamage) ctx.onPlayerDamage(p.damage);
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
    if (this._aimLine){ scene.remove(this._aimLine); this._aimLine = null; }
    if (this._projectiles){
      for (const p of this._projectiles) scene.remove(p.mesh);
      this._projectiles.length = 0;
    }
  }  
}


