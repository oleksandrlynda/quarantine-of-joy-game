import { createInfluencerCaptainAsset } from '../assets/boss_captain.js';

export class CaptainV2 {
  constructor({ THREE, mats, spawnPos, enemyManager, speed = 3.0, fireRate = 1.5, projectileSpeed = 30 }) {
    this.THREE = THREE;
    this.mats = mats;
    // enemyManager included for API parity with other bosses
    this.enemyManager = enemyManager;

    const { root, head, refs } = createInfluencerCaptainAsset({ THREE, mats, scale: 1.2 });
    root.position.copy(spawnPos);
    root.userData = { type: 'boss_captain_v2', head, hp: 3500 };
    this.root = root;
    this._assetRefs = refs;

    this.maxHp = 3500;
    this.phase = 1;
    this.invuln = false;
    this.shieldTimer = 0;
    this._shield = null;

    this.speed = speed;
    this.baseSpeed = speed;
    // mid‑range standoff similar to Captain
    this.preferredRange = { min: 12, max: 18 };
    this.engageRange = { min: 24, max: 36 };
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;
    this._dir = new THREE.Vector3();

    // scratch objects reused each tick to reduce allocations
    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
    this._ray = new THREE.Raycaster();

    // attack state
    this.state = 'single'; // 'single', 'telegraph', 'volley'
    this.fireCooldown = 0;
    this.fireRate = fireRate; // seconds between single shots
    this.baseFireRate = fireRate;
    this.projectileSpeed = projectileSpeed;

    this.baseVolleyCadence = 4.0; // delay between volleys
    this.volleyCooldown = 2.5; // start relatively soon
    this.telegraphTime = 0;
    this.telegraphRequired = 0.6; // duration of warning before volley
    this.volleyShotsLeft = 0;
    this.totalVolleyShots = 0;
    this.volleySpacing = 0.12;
    this.volleyTimer = 0;
    this._baseDir = new THREE.Vector3(1, 0, 0);
    this._aimLine = null;
  }

  update(dt, ctx) {
    this._updatePhase(dt, ctx);
    this._updateMovement(dt, ctx);
    this._updateAttack(dt, ctx);
    if (this.root.userData.hp <= 0) {
      this.onRemoved(ctx.scene);
    }
  }

  _updateMovement(dt, ctx) {
    const e = this.root;
    const toPlayer = this._tmpVec1.copy(ctx.player.position).sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; // operate purely on XZ plane for steering

    const desired = this._tmpVec2.set(0, 0, 0);
    if (dist < this.preferredRange.min - 1) {
      if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (dist > this.preferredRange.max + 1) {
      if (dist > this.engageRange.max && toPlayer.lengthSq() > 0) {
        desired.add(toPlayer.normalize());
      }
    } else if (toPlayer.lengthSq() > 0) {
      const fwd = toPlayer.normalize();
      const side = this._dir.set(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
      desired.add(side);
      if (this.switchCooldown > 0) this.switchCooldown -= dt;
      else if (Math.random() < 0.01) {
        this.strafeDir *= -1; this.switchCooldown = 1.0;
      }
    }

    const avoid = desired.lengthSq() > 0 ? ctx.avoidObstacles(e.position, desired, 1.8) : desired;
    const sep = ctx.separation(e.position, 1.2, e);
    const steer = this._tmpVec1.copy(desired).add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.8));
    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      const step = steer.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }
  }

  _updateAttack(dt, ctx) {
    if (this.state === 'single') {
      if (this.fireCooldown > 0) this.fireCooldown -= dt; else this._fireSingle(ctx);
      if (this.volleyCooldown > 0) this.volleyCooldown -= dt; else this._beginTelegraph(ctx);
      return;
    }

    if (this.state === 'telegraph') {
      this.telegraphTime += dt;
      const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
      this._updateAimLine(targetPos, ctx.scene, 0xf59e0b);
      if (this.telegraphTime >= this.telegraphRequired) {
        this._beginVolley(ctx);
      }
      return;
    }

    if (this.state === 'volley') {
      this.volleyTimer -= dt;
      if (this.volleyTimer <= 0 && this.volleyShotsLeft > 0) {
        this._fireVolleyShot(ctx);
        this.volleyShotsLeft--;
        this.volleyTimer = this.volleySpacing;
      }
      if (this.volleyShotsLeft <= 0) {
        this.state = 'single';
        this.volleyCooldown = this.baseVolleyCadence + Math.random() * 0.5;
      }
    }
  }

  _updatePhase(dt, ctx) {
    if (this.phase === 1 && this.root.userData.hp <= this.maxHp * 0.6) {
      this.phase = 2;
      this.invuln = true;
      this.shieldTimer = 5.0;
      this._setShield(true);
      this.fireRate = this.baseFireRate * 0.8;
      this.baseVolleyCadence = 2.5;
      this.speed = this.baseSpeed * 1.13;
      this.state = 'single';
      this.fireCooldown = 0;
      this.volleyCooldown = 1.0;
    }
    if (this.invuln) {
      this.shieldTimer -= dt;
      this.root.userData.hp = Math.max(this.root.userData.hp, 1);
      if (this.shieldTimer <= 0) {
        this.invuln = false;
        this._setShield(false);
      }
    }
  }

  _fireSingle(ctx) {
    const muzzle = this._assetRefs?.muzzle;
    if (!muzzle) return;
    const origin = muzzle.getWorldPosition(this._tmpVec1);
    const target = this._tmpVec2.copy(ctx.player.position);
    const dir = target.sub(origin);
    const dist = dir.length();
    if (dist < 1e-3) return;
    dir.normalize();
    this._ray.set(origin, dir); this._ray.far = dist;
    const hits = this._ray.intersectObjects(ctx.objects, false);
    if (hits && hits.length) return;
    const speed = this.projectileSpeed;
    const velocity = dir.clone().multiplyScalar(speed);
    ctx._spawnBullet?.('sniper', origin.clone(), velocity, 2.5, 20);
    this.fireCooldown = this.fireRate;
  }

  _beginTelegraph(ctx) {
    this.state = 'telegraph';
    this.telegraphTime = 0.0001;
    this._setHeadGlow(true);
    const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
    this._updateAimLine(targetPos, ctx.scene, 0xf59e0b);
  }

  _beginVolley(ctx) {
    this.state = 'volley';
    this._setHeadGlow(false);
    this._updateAimLine(null, ctx.scene);
    const muzzle = this._assetRefs?.muzzle;
    if (!muzzle) { this.volleyShotsLeft = 0; return; }
    const origin = muzzle.getWorldPosition(this._tmpVec1);
    const target = this._tmpVec2.copy(ctx.player.position);
    this._baseDir.copy(target.sub(origin));
    this._baseDir.y = 0;
    if (this._baseDir.lengthSq() === 0) this._baseDir.set(1, 0, 0);
    this._baseDir.normalize();
    this.totalVolleyShots = 4 + (Math.random() < 0.5 ? 0 : 1); // 4-5 shots
    this.volleyShotsLeft = this.totalVolleyShots;
    this.volleyTimer = 0;
  }

  _fireVolleyShot(ctx) {
    const muzzle = this._assetRefs?.muzzle;
    if (!muzzle) return;
    const origin = muzzle.getWorldPosition(this._tmpVec1);
    const shotIndex = this.totalVolleyShots - this.volleyShotsLeft;
    const halfFan = (Math.PI / 180) * 10;
    const t = this.totalVolleyShots === 1 ? 0 : (shotIndex / (this.totalVolleyShots - 1)) * 2 - 1;
    const angle = t * halfFan;
    const dir = this._rotateY(this._baseDir, angle);
    const speed = this.projectileSpeed;
    const velocity = dir.clone().multiplyScalar(speed);
    ctx._spawnBullet?.('sniper', origin.clone(), velocity, 2.5, 20);
  }

  _setShield(active) {
    const anchor = this._assetRefs?.shieldAnchor;
    if (!anchor) return;
    if (active) {
      if (!this._shield) {
        const g = new this.THREE.SphereGeometry(1.6, 16, 16);
        const m = new this.THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3 });
        this._shield = new this.THREE.Mesh(g, m);
        anchor.add(this._shield);
      }
    } else if (this._shield) {
      this._shield.parent?.remove(this._shield);
      this._shield = null;
    }
  }

  _setHeadGlow(active) {
    const head = this.root.userData.head;
    if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      mat.emissive.setHex(active ? 0xffc266 : this._savedEmissive.getHex());
    } else {
      head.scale.setScalar(active ? 1.08 : 1.0);
    }
  }

  _updateAimLine(targetPos, scene, color = 0xf59e0b) {
    const THREE = this.THREE;
    if (!targetPos) {
      if (this._aimLine) {
        scene.remove(this._aimLine);
        this._aimLine = null;
      }
      return;
    }
    let from;
    const head = this.root.userData?.head;
    if (head && typeof head.getWorldPosition === 'function') {
      from = head.getWorldPosition(new THREE.Vector3());
    } else {
      from = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.6, this.root.position.z);
    }
    if (!this._aimLine) {
      const g = new THREE.BufferGeometry().setFromPoints([from, targetPos]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      this._aimLine = new THREE.Line(g, m); scene.add(this._aimLine);
    } else {
      const pos = this._aimLine.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, targetPos.x, targetPos.y, targetPos.z); pos.needsUpdate = true;
    }
  }

  _rotateY(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new this.THREE.Vector3(v.x * c - v.z * s, 0, v.x * s + v.z * c).normalize();
  }

  onRemoved(scene) {
    if (this.root && scene && this.root.parent === scene) {
      scene.remove(this.root);
    }
  }
}

