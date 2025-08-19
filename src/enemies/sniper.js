import { createSniperBot } from '../assets/sniper_bot.js';
const _sniperCache = { model: null };

export class SniperEnemy {
  constructor({ THREE, mats, cfg, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this._enemyManager = enemyManager || null;

    // Use dedicated SniperBot asset with long rifle
    if (!_sniperCache.model) _sniperCache.model = createSniperBot({ THREE, mats, scale: 0.70 });
    const src = _sniperCache.model;
    const clone = src.root.clone(true);
    // Remap refs for clone
    const remapRefs = (srcRoot, cloneRoot, refs) => {
      const out = {};
      const getPath = (node) => { const path = []; let cur = node; while (cur && cur !== srcRoot) { const parent = cur.parent; if (!parent) return null; const idx = parent.children.indexOf(cur); if (idx < 0) return null; path.push(idx); cur = parent; } return path.reverse(); };
      const follow = (root, path) => { let cur = root; for (const idx of (path||[])) { if (!cur || !cur.children || idx >= cur.children.length) return null; cur = cur.children[idx]; } return cur; };
      for (const k of Object.keys(refs||{})) { const p = getPath(refs[k]); out[k] = p ? follow(cloneRoot, p) : null; }
      return out;
    };
    const body = clone; const head = clone.userData?.head || src.head; this._refs = remapRefs(src.root, clone, src.refs || {});
    body.position.copy(spawnPos);
    // Make head material unique to avoid emissive bleed between enemies
    try { if (head && head.material) head.material = head.material.clone(); } catch(_) {}
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 5, max: 90 };
    this.engageRange = { min: 48, max: 150 };

    this.cooldown = 0;
    this.windup = 0;
    this.windupReq = 1.2 + Math.random()*0.6;
    this.postShotRelocate = 0;
    this._raycaster = new THREE.Raycaster();
    // Smoothed facing vector
    this._faceDir = new this.THREE.Vector3(0, 0, 1);

    // Small temp vectors to avoid GC in hot paths
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

    // --- Face player by yaw only (ensure -Z forward aims at player) ---
    const inBandYaw = dist >= this.engageRange.min && dist <= this.engageRange.max;
    const aiming = hasLOS && inBandYaw && (this.windup > 0 || this.cooldown <= 0);
    const faceVec = aiming ? toPlayer.clone().setY(0) : toPlayer.clone().multiplyScalar(0.8).setY(0); // slight off-player bias when not aiming
    if (faceVec.lengthSq() > 0) {
      faceVec.normalize();
      const lerpAmt = Math.min(1, 6 * dt); // slightly slower than shooter
      this._faceDir.lerp(faceVec, lerpAmt);
      if (this._faceDir.lengthSq() > 0) this._faceDir.normalize();
    }
    const lookTarget = this._tmpV1.copy(e.position).add(this._faceDir);
    lookTarget.y = e.position.y; // keep yaw only
    e.lookAt(lookTarget);
    // Our asset faces +Z visually; Three.js lookAt aims -Z toward target. Flip 180° so face looks at player.
    e.rotateY(Math.PI);

    // Movement: maintain long sightlines, break aim if LOS lost, minor strafe
    const desired = new THREE.Vector3();
    toPlayer.y=0; if (toPlayer.lengthSq()>0) toPlayer.normalize();
    if (dist < this.preferredRange.min) desired.add(toPlayer.clone().multiplyScalar(-1));
    else if (dist > this.preferredRange.max) desired.add(toPlayer);
    const side = new THREE.Vector3(-toPlayer.z,0,toPlayer.x);
    desired.add(side.multiplyScalar(0.6 * (Math.random()<0.5?1:-1)));
    if (desired.lengthSq()>0){ desired.normalize(); ctx.moveWithCollisions(e, desired.multiplyScalar(this.speed*dt)); }

    // Firing sequence + update projectiles
    if (this.cooldown>0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.postShotRelocate>0) this.postShotRelocate = Math.max(0, this.postShotRelocate - dt);
    if (this._projectiles && this._projectiles.length){ this._updateProjectiles(dt, ctx); }

    const canFireWindow = (ctx.blackboard && (ctx.blackboard.time - (ctx.blackboard.sniperLastFireAt||-Infinity)) >= 1.0);
    // Use engageRange bounds for valid firing window
    if (hasLOS && dist >= this.engageRange.min && dist <= this.engageRange.max && this.cooldown<=0 && this.postShotRelocate<=0 && canFireWindow){
      this.windup += dt;
      if (this.windup >= this.windupReq){
        // Fire
        this.windup = 0;
        this.cooldown = 3.5 + Math.random()*1.0;
        this._fireProjectile(playerPos, ctx);
        this.postShotRelocate = 0.8 + Math.random()*0.4;
      } else {
        window._EFFECTS?.spawnBulletTracer?.(
          this._muzzleWorld(),
          playerPos,
          {width:0.03, ttl:0.06, impact:false, color:0xff3344}
        );
      }
    } else {
      this.windup = 0;
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
    const dir = targetPos.clone().sub(origin).normalize();
    const speed = 60;
    // Use global instanced bullet pool via manager
    try {
      const vel = dir.clone().multiplyScalar(speed);
      const ok = this._enemyManager?._spawnBullet('sniper', origin, vel, 1.2, 60);
      if (!ok) {
        // fallback
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
        mesh.position.copy(origin);
        mesh.material.transparent = true; mesh.material.opacity = 1;
        ctx.scene.add(mesh);
        const proj = { mesh, velocity: vel, life: 0, maxLife: 1.2, damage: 60 };
        if (!this._projectiles) this._projectiles = [];
        this._projectiles.push(proj);
      }
    } catch(_) {}
    // mark last fire time for director staggering
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
}


