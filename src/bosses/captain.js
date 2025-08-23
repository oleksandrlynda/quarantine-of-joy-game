// Influencer Militia Captain (MVP)
// Phase 1: mid-range standoff, strafes; volley cone and ad-zone pops
// Phase 2 (<=60% HP): calls in Ad Zeppelin; Captain becomes shielded (invuln) until pods destroyed

import { ZeppelinSupport } from './zeppelin.js';
import { createInfluencerCaptainAsset, createBillboardWallAsset, createAdZoneMarkerAsset } from '../assets/boss_captain.js';

const zoneRadius = 2.2;

export class Captain {
  constructor({ THREE, mats, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;

    // Visual: use asset pack model for the Captain
    const { root, head, refs } = createInfluencerCaptainAsset({ THREE, mats, scale: 1.2 });
    root.position.copy(spawnPos);
    root.userData = { type: 'boss_captain', head, hp: 3500 };
    this.root = root;
    this._assetRefs = refs; // muzzle, shieldAnchor, volleyHardpoints, etc.

    // Movement tuning (standoff 12–18u, engage 24–36u)
    this.speed = 2.3;
    this.preferredRange = { min: 12, max: 18 };
    this.engageRange = { min: 24, max: 36 };
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;

    // Attacks
    this.volleyCooldown = 0.0;
    this.baseVolleyCadence = 2.8; // between volleys when idle
    this.telegraphTime = 0.0; // for volley windup
    this.telegraphRequired = 0.6; // 0.6s windup
    this._telegraph = null; // wedge telegraph during windup
    this._raycaster = new THREE.Raycaster();

    // Active volley burst state
    this._burstActive = false;
    this._burstShotsLeft = 0;
    this._burstTimer = 0;
    this._burstSpacing = 0.12;
    this._burstBaseDir = new THREE.Vector3(1,0,0);
    this._burstHalfFan = 0;

    // Ad zones
    this.zones = []; // { mesh, timer, center, delay }
    this.zoneCooldown = 5.5 + Math.random() * 1.5; // cadence for marking

    // Phase/Shield
    this.invuln = false; // becomes true during zeppelin pods alive
    this._zeppelin = null;
    this._notifyDeath = null; // set by BossManager

    // Billboard wall hazard
    this._billboard = null; // { root, start, end, t, duration }
    this._billboardCooldown = 4 + Math.random() * 3; // delay before first spawn
  }

  // --- Movement ---
  _updateMovement(dt, ctx){
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();

    const desired = new THREE.Vector3();
    if (dist < this.preferredRange.min - 1) {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (dist > this.preferredRange.max + 1) {
      if (dist > this.engageRange.max) { toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize()); }
    } else {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) {
        const fwd = toPlayer.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        desired.add(side);
        if (this.switchCooldown > 0) this.switchCooldown -= dt; else if (Math.random() < 0.01) { this.strafeDir *= -1; this.switchCooldown = 1.0; }
      }
    }

    const avoid = desired.lengthSq() > 0 ? ctx.avoidObstacles(e.position, desired, 1.8) : desired;
    const sep = ctx.separation(e.position, 1.2, e);
    const steer = desired.clone().add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.8));
    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      const step = steer.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }
  }

  // --- Volley cones ---
  _beginVolleyWindup(ctx){
    this.telegraphTime = 0.0001;
    this._setHeadGlow(true);
    // choose fan once for telegraph and burst
    this._burstHalfFan = (Math.PI/180) * (10 + Math.random()*6);
    const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
    this._updateVolleyTelegraph(targetPos, ctx.scene, 0xf59e0b);
  }

  _tickVolley(dt, ctx){
    if (this._burstActive){
      this._burstTimer -= dt;
      if (this._burstTimer <= 0 && this._burstShotsLeft > 0){
        const totalShots = this._burstTotalShots;
        const shotIndex = totalShots - this._burstShotsLeft;
        const halfFan = this._burstHalfFan;
        const t = (totalShots===1) ? 0 : (shotIndex/(totalShots-1))*2 - 1; // -1..1
        const angle = t * halfFan;
        const dir = this._rotateY(this._burstBaseDir, angle);
        this._applyVolleyDamage(dir, ctx);
        this._burstShotsLeft--;
        this._burstTimer = this._burstSpacing;
      }
      if (this._burstShotsLeft <= 0){
        this._burstActive = false;
        this.volleyCooldown = this.baseVolleyCadence + Math.random()*0.6;
      }
      return;
    }

    if (this.telegraphTime > 0){
      this.telegraphTime += dt;
      const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
      this._updateVolleyTelegraph(targetPos, ctx.scene, 0xf59e0b);
      if (this.telegraphTime >= this.telegraphRequired){
        // start burst
        const forward = ctx.player.position.clone().sub(this.root.position); forward.y = 0; if (forward.lengthSq()===0) forward.set(1,0,0); forward.normalize();
        this._burstBaseDir.copy(forward);
        this._burstTotalShots = 3 + (Math.random()*3 | 0); // 3–5
        this._burstShotsLeft = this._burstTotalShots;
        this._burstTimer = 0; // fire first immediately
        this._burstActive = true;
        this.telegraphTime = 0;
        this._setHeadGlow(false);
        this._updateVolleyTelegraph(null, ctx.scene);
      }
      return;
    }

    if (this.volleyCooldown > 0) this.volleyCooldown -= dt;
    if (this.volleyCooldown <= 0){ this._beginVolleyWindup(ctx); }
  }

  _applyVolleyDamage(dir, ctx){
    // Instantaneous cone check: player within narrow 8° half-angle, within 26u
    const origin = this.root.position;
    const playerPos = ctx.player.position.clone();
    const toPlayer3d = playerPos.clone().sub(origin);
    const dist = toPlayer3d.length();
    if (dist > 26) return;
    const toPlayer = toPlayer3d.clone();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();
    const cos = dir.dot(toPlayer);
    const cosHalf = Math.cos((Math.PI/180)*8);
    if (cos >= cosHalf){
      // Raycast toward player; skip damage if any object blocks line of sight
      this._raycaster.set(origin, toPlayer3d.normalize());
      this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(ctx.objects, false);
      if (!hits || hits.length === 0){
        ctx.onPlayerDamage?.(14);
      }
    }
  }

  _rotateY(v, angle){
    const c = Math.cos(angle), s = Math.sin(angle);
    return new this.THREE.Vector3(v.x * c - v.z * s, 0, v.x * s + v.z * c).normalize();
  }

  _setHeadGlow(active){
    const head = this.root.userData.head; if (!head || !head.material) return;
    const mat = head.material; if (mat.emissive){ if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone(); mat.emissive.setHex(active ? 0xffc266 : this._savedEmissive.getHex()); }
    else { head.scale.setScalar(active ? 1.08 : 1.0); }
  }

  _disposeObject(obj, scene){
    if (!obj) return;
    scene?.remove?.(obj);
    obj.traverse?.(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material){
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }

  _spawnBillboardWall(ctx){
    if (this._billboard) return;
    const { root, refs } = createBillboardWallAsset({ THREE: this.THREE });
    const anchor = refs.anchor;
    // Reparent so moving the anchor moves the billboard mesh
    root.remove(anchor);
    anchor.add(root);
    const start = this.root.position.clone().add(new this.THREE.Vector3(-5, 1.1, 0));
    const end = this.root.position.clone().add(new this.THREE.Vector3(5, 1.1, 0));
    anchor.position.copy(start);
    ctx.scene.add(anchor);
    this._billboard = { root: anchor, start, end, t: 0, duration: 4 };
  }

  _updateVolleyTelegraph(targetPos, scene, color = 0xf59e0b){
    const THREE = this.THREE;
    if (!targetPos){
      if (this._telegraph){
        this._disposeObject(this._telegraph, scene);
        this._telegraph = null;
      }
      return;
    }
    let from;
    const head = this.root.userData?.head;
    if (head && typeof head.getWorldPosition === 'function'){
      from = head.getWorldPosition(new THREE.Vector3());
    } else {
      from = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.6, this.root.position.z);
    }
    // base direction toward player
    const forward = targetPos.clone().sub(from); forward.y = 0; if (forward.lengthSq()===0) forward.set(1,0,0); forward.normalize();
    this._burstBaseDir.copy(forward);
    const range = 26; // match damage range
    const left = this._rotateY(forward, -this._burstHalfFan).multiplyScalar(range).add(from.clone());
    const right = this._rotateY(forward, this._burstHalfFan).multiplyScalar(range).add(from.clone());
    if (!this._telegraph){
      const positions = new Float32Array([
        from.x, from.y, from.z, left.x, left.y, left.z,
        from.x, from.y, from.z, right.x, right.y, right.z,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions,3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      this._telegraph = new THREE.LineSegments(g, m); scene.add(this._telegraph);
    } else {
      const pos = this._telegraph.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, left.x, left.y, left.z);
      pos.setXYZ(2, from.x, from.y, from.z); pos.setXYZ(3, right.x, right.y, right.z);
      pos.needsUpdate = true;
    }
  }

  // --- Ad Zones ---
  _maybeMarkZones(dt, ctx){
    if (this.zoneCooldown > 0){ this.zoneCooldown -= dt; return; }
    // pick 2–3 positions around player (6–10u)
    const THREE = this.THREE;
    const count = 2 + (Math.random() < 0.5 ? 0 : 1);
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++){
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random()*4;
      const p = new THREE.Vector3(playerPos.x + Math.cos(ang)*r, 0.06, playerPos.z + Math.sin(ang)*r);
      // Adjust to safe spot if blocked
      const safe = (typeof this.enemyManager._isSpawnAreaClear === 'function' && this.enemyManager._isSpawnAreaClear(p.clone().setY(0.8), 0.5));
      const center = safe ? p : playerPos.clone(); center.y = 0.06;
      const marker = createAdZoneMarkerAsset({ THREE, radius: zoneRadius });
      marker.root.position.copy(center);
      marker.root.userData = { life: 0 };
      ctx.scene.add(marker.root);
      this.zones.push({ mesh: marker.root, timer: 0, center: center.clone(), delay: 1.0, refs: marker.refs });
    }
    this.zoneCooldown = 6.5 + Math.random()*2.0;
  }

  _updateZones(dt, ctx){
    for (let i = this.zones.length - 1; i >= 0; i--){
      const z = this.zones[i]; z.timer += dt; z.mesh.userData.life = (z.mesh.userData.life||0) + dt;
      // pulse elements: ring opacity and pylon scale
      const ring = z.refs?.ring, pylon = z.refs?.pylon;
      if (ring && ring.material && ring.material.opacity != null){
        ring.material.opacity = Math.max(0.25, 0.9 - z.timer * 0.7);
      }
      if (pylon){
        const s = 1.0 + Math.sin((z.mesh.userData.life||0) * 12) * 0.12;
        pylon.scale.set(1, s, 1);
      }
      if (z.timer >= z.delay){
        // pop: damage if player inside radius zoneRadius
        const dx = ctx.player.position.x - z.center.x;
        const dz = ctx.player.position.z - z.center.z;
        if (dx*dx + dz*dz <= zoneRadius*zoneRadius){ ctx.onPlayerDamage?.(18); }
        const pos = z.center.clone(); pos.y = 0;
        ctx.effects?.spawnExplosion?.(pos, zoneRadius);
        this._disposeObject(z.mesh, ctx.scene);
        this.zones.splice(i,1);
      }
    }
  }

  // --- Zeppelin phase ---
  _maybeSummonZeppelin(ctx){
    const hp = this.root.userData.hp;
    if (this._zeppelin || hp <= 0) return;
    const maxHp = 1400;
    if (hp <= maxHp * 0.6){
      this.invuln = true;
      // Spawn zeppelin which drops pods; lift shield when pods cleared
      this._zeppelin = new ZeppelinSupport({ THREE: this.THREE, mats: this.mats, enemyManager: this.enemyManager, scene: ctx.scene, onPodsCleared: () => { this.invuln = false; } });
    }
  }

  // --- Lifecycle ---
  update(dt, ctx){
    // Shield behavior: restore HP back up if reduced while invuln (coarse armor)
    if (this.invuln){ this.root.userData.hp = Math.max(this.root.userData.hp, 1); }

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    this._tickVolley(dt, ctx);
    this._maybeMarkZones(dt, ctx);
    this._updateZones(dt, ctx);

    // Billboard hazard
    if (this._billboardCooldown > 0) this._billboardCooldown -= dt;
    if (!this._billboard && this._billboardCooldown <= 0){ this._spawnBillboardWall(ctx); }
    if (this._billboard){
      const b = this._billboard;
      b.t += dt;
      const alpha = Math.min(b.t / b.duration, 1);
      b.root.position.lerpVectors(b.start, b.end, alpha);
      if (alpha >= 1){
        this._disposeObject(b.root, ctx.scene);
        this._billboard = null;
        this._billboardCooldown = 12 + Math.random() * 4;
      }
    }

    // Phase transition
    this._maybeSummonZeppelin(ctx);
    if (this._zeppelin){ this._zeppelin.update(dt); }

    // Cleanup visuals on death
    if (this.root.userData.hp <= 0){
      if (this._telegraph){
        this._disposeObject(this._telegraph, ctx.scene);
        this._telegraph = null;
      }
      for (const z of this.zones){
        this._disposeObject(z.mesh, ctx.scene);
      }
      this.zones.length = 0;
      if (this._zeppelin){ this._zeppelin.cleanup(); this._zeppelin = null; }
      if (this._billboard){ this._disposeObject(this._billboard.root, ctx.scene); this._billboard = null; }
    }
  }

  onRemoved(scene){
    if (this._telegraph){
      this._disposeObject(this._telegraph, scene);
      this._telegraph = null;
    }
    for (const z of this.zones){
      this._disposeObject(z.mesh, scene);
    }
    this.zones.length = 0;
    if (this._zeppelin){ this._zeppelin.cleanup(); this._zeppelin = null; }
    if (this._billboard){ this._disposeObject(this._billboard.root, scene); this._billboard = null; }
  }
}


