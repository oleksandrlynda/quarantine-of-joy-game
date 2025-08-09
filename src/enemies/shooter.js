export class ShooterEnemy {
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

    body.userData = { type: cfg.type, head, hp: cfg.hp };
    this.root = body;
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 12, max: 18 };
    this.engageRange = { min: 24, max: 36 };

    // Firing cadence and telegraph
    this.cooldown = 0;                               // time until next windup can start
    this.baseCadence = 1.6 + Math.random() * 0.6;    // 1.6–2.2s between shots
    this.windupTime = 0;                             // time spent charging current shot
    this.windupRequired = 0.5 + Math.random() * 0.2; // 0.5–0.7s telegraph
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;                         // control strafe dir switching

    this.projectiles = [];
    this._raycaster = new THREE.Raycaster();
    this._aimLine = null;                            // telegraph line during windup
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    // 1) Update projectiles
    this._updateProjectiles(dt, ctx);

    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();

    // 2) Movement: approach/retreat only when inside engage range; maintain standoff, strafe when in band
    const desired = new THREE.Vector3();
    if (dist < this.preferredRange.min - 1) {
      // backpedal
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (dist > this.preferredRange.max + 1) {
      // approach only if outside engage max; otherwise strafe
      if (dist > this.engageRange.max) {
        toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize());
      }
    } else {
      // strafe around player within preferred band
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) {
        const fwd = toPlayer.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        desired.add(side);
        // occasionally switch strafe dir
        if (this.switchCooldown > 0) this.switchCooldown -= dt; else if (Math.random() < 0.01) { this.strafeDir *= -1; this.switchCooldown = 1.2; }
      }
    }

    // Obstacle avoidance + separation
    const avoid = desired.lengthSq() > 0 ? ctx.avoidObstacles(e.position, desired, 1.6) : desired;
    const sep = ctx.separation(e.position, 1.2, e);
    const steer = desired.clone().add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.8));

    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      const step = steer.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }

    // 3) Shooting logic
    if (this.cooldown > 0) this.cooldown -= dt;

    const inBand = dist >= this.preferredRange.min && dist <= this.preferredRange.max;
    const hasLOS = this._hasLineOfSight(e, playerPos, ctx.objects);
    if (inBand && hasLOS && this.cooldown <= 0) {
      // Telegraph with head glow and aim line; keep checking LOS
      this.windupTime += dt;
      this._setHeadGlow(true);
      this._updateAimLine(playerPos, ctx.scene, 0x10b981);
      if (!hasLOS) {
        // cancel windup if LOS broken
        this.windupTime = 0;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      } else if (this.windupTime >= this.windupRequired) {
        this._setHeadGlow(false);
        this.windupTime = 0;
        this.cooldown = this.baseCadence; // next shot delay
        this._updateAimLine(null, ctx.scene);
        this._fireProjectile(playerPos, ctx.scene);
        // re-roll cadence and windup for variance
        this.baseCadence = 1.6 + Math.random() * 0.6;
        this.windupRequired = 0.5 + Math.random() * 0.2;
      }
    } else {
      if (this.windupTime > 0) {
        // cancel windup if leaving inBand/engage/LOS
        this.windupTime = 0;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      }
    }
  }

  _hasLineOfSight(fromRoot, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(fromRoot.position.x, fromRoot.position.y + 1.4, fromRoot.position.z);
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _fireProjectile(targetPos, scene) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
    const dir = targetPos.clone().sub(origin).normalize();
    const speed = 25; // units/s

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    mesh.position.copy(origin);
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    scene.add(mesh);

    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(speed),
      life: 0,
      maxLife: 2.5,
      damage: 22
    });
  }

  _updateProjectiles(dt, ctx) {
    const THREE = this.THREE;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const prev = p.mesh.position.clone();
      const step = p.velocity.clone().multiplyScalar(dt);
      const next = prev.clone().add(step);

      // Check hit with player (capsule-like band at chest height)
      const playerPos = ctx.player.position;
      const y = next.y;
      if (y >= 1.2 && y <= 1.8) {
        const dx = next.x - playerPos.x;
        const dz = next.z - playerPos.z;
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < 0.6) {
          if (ctx.onPlayerDamage) ctx.onPlayerDamage(p.damage);
          ctx.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Raycast against world objects along the step
      const dir = step.clone().normalize();
      const dist = step.length();
      this._raycaster.set(prev, dir);
      this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(ctx.objects, false);
      if (hits && hits.length > 0) {
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Advance and fade slightly
      p.mesh.position.copy(next);
      p.life += dt;
      if (p.mesh.material && p.mesh.material.opacity !== undefined) {
        p.mesh.material.opacity = Math.max(0, 1 - p.life / p.maxLife);
      }
      if (p.life >= p.maxLife) {
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _setHeadGlow(active) {
    const head = this.root.userData.head;
    if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      // Only modify this head's emissive; no shared materials since we clone
      mat.emissive.setHex(active ? 0xffcc66 : this._savedEmissive.getHex());
    } else {
      // fallback: scale head a bit during windup
      head.scale.setScalar(active ? 1.08 : 1.0);
    }
  }

  _updateAimLine(targetPos, scene, color = 0x10b981) {
    const THREE = this.THREE;
    if (!targetPos) {
      if (this._aimLine) { scene.remove(this._aimLine); this._aimLine = null; }
      return;
    }
    const from = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.4, this.root.position.z);
    if (!this._aimLine) {
      const g = new THREE.BufferGeometry().setFromPoints([from, targetPos]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      this._aimLine = new THREE.Line(g, m);
      scene.add(this._aimLine);
    } else {
      const pos = this._aimLine.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
      pos.needsUpdate = true;
    }
  }

  onRemoved(scene) {
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles.length = 0;
    if (this._aimLine) { scene.remove(this._aimLine); this._aimLine = null; }
  }
}