// Shard Avatar (MVP)
// Phase 1: rotating radial barrages with safe lanes; clone mirages (2–3) that flicker and pop on hit
// Phase 2 (<=60% HP): alternate CW/CCW sweeps and occasional cross-bursts; time‑dilation rings that slow nearby projectiles when player stands inside

export class ShardAvatar {
  constructor({ THREE, mats, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;

    // Visuals: crystalline body with distinct head for emissive telegraph
    const base = mats.enemy.clone(); base.color = new THREE.Color(0x7dd3fc); // light cyan
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 2.0), base);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mats.head.clone());
    head.position.y = 2.0; body.add(head);
    body.position.copy(spawnPos);
    body.userData = { type: 'boss_shard', head, hp: 1500 };
    this.root = body;

    // Movement tuning: steady pursuit with orbiting bias
    this.speed = 2.0;
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._switchT = 0;

    // Barrage state
    this.phase = 1;
    this.maxHp = 1500;
    this.invuln = false;
    this._barrageState = 'idle';
    this._barrageTimer = 0;
    this._telegraphTime = 0.0;
    this._telegraphRequired = 0.6;
    this._sweepBase = Math.random() * Math.PI * 2; // base angle for radial pattern
    this._sweepDir = 1; // 1 or -1, alternates in phase 2
    this._laneOffset = Math.random() * Math.PI * 2; // to create safe lanes

    // Projectiles pool
    this.projectiles = []; // { mesh, pos, vel, speed, life, radius }
    this._projGeo = new THREE.SphereGeometry(0.15, 10, 10);
    this._projMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });

    // Clones
    this.clones = []; // { root, timer, life }
    this._cloneCooldown = 4.5 + Math.random() * 1.5; // first clone burst shortly after spawn

    // Time‑rings (phase 2)
    this.rings = []; // { mesh, center, radius, life, playerInside }
    this._ringCooldown = 3.5; // delay before possible first ring after p2

    // Telegraph visuals
    this._telegraphRing = null;

    // BossManager hook
    this._notifyDeath = null;
  }

  // --- Movement ---
  _updateMovement(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();

    const desired = new THREE.Vector3();
    if (dist > 11) desired.add(toPlayer);
    else {
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this._strafeDir);
      desired.add(side);
      if (this._switchT > 0) this._switchT -= dt; else if (Math.random() < 0.01) { this._strafeDir *= -1; this._switchT = 1.0; }
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

  // --- Barrages ---
  _beginTelegraph(ctx) {
    this._telegraphTime = 0.0001;
    // Head emissive pulse
    this._setHeadGlow(true);
    // Ground telegraph ring under boss
    const THREE = this.THREE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.5, 28),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.root.position.x, 0.05, this.root.position.z);
    ring.userData = { life: 0 };
    ctx.scene.add(ring);
    this._telegraphRing = ring;
  }

  _spawnBarrage(ctx) {
    const THREE = this.THREE;
    // Choose projectile count (10–14) and create one or two safe lanes by skipping nearby angles
    const count = 10 + (Math.random() * 5 | 0);
    const gapCenter = this._laneOffset; // radians
    const gapWidth = (Math.PI / count) * 2.6; // a couple of lanes width
    const speed = 12.5;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2 + this._sweepBase;
      // Skip if within safe lane
      const angNorm = ((t - gapCenter + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // -PI..PI
      if (Math.abs(angNorm) < gapWidth * 0.5) continue;
      const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t)).multiplyScalar(this._sweepDir);
      const mesh = new THREE.Mesh(this._projGeo, this._projMat.clone());
      mesh.position.set(this.root.position.x, 1.0, this.root.position.z);
      mesh.userData = { type: 'boss_shard_proj' };
      ctx.scene.add(mesh);
      this.projectiles.push({
        mesh,
        pos: mesh.position,
        vel: dir.clone(),
        speed,
        life: 0,
        radius: 0.35
      });
    }
    // Advance base angle for next volley to feel like a rotating sweep
    const delta = (Math.PI / 12) * (this.phase === 1 ? 1 : 1.4);
    this._sweepBase += delta * this._sweepDir;
    this._laneOffset += (Math.PI / 9);
  }

  _maybeCrossBurst(ctx) {
    if (this.phase !== 2) return;
    if (Math.random() < 0.35) {
      const THREE = this.THREE;
      const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2, Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
      for (const a of angles) {
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const mesh = new THREE.Mesh(this._projGeo, this._projMat.clone());
        mesh.position.set(this.root.position.x, 1.0, this.root.position.z);
        mesh.userData = { type: 'boss_shard_proj' };
        ctx.scene.add(mesh);
        this.projectiles.push({ mesh, pos: mesh.position, vel: dir, speed: 14.0, life: 0, radius: 0.35 });
      }
    }
  }

  _tickBarrage(dt, ctx) {
    // Handle telegraph → fire cadence
    if (this._telegraphTime > 0) {
      this._telegraphTime += dt;
      if (this._telegraphRing) {
        this._telegraphRing.userData.life += dt;
        const s = 1.0 + Math.sin(this._telegraphRing.userData.life * 18) * 0.08;
        this._telegraphRing.scale.set(s, s, s);
        if (this._telegraphRing.material && this._telegraphRing.material.opacity !== undefined) {
          this._telegraphRing.material.opacity = Math.max(0.15, 0.9 - this._telegraphTime * 0.9);
        }
      }
      if (this._telegraphTime >= this._telegraphRequired) {
        // Fire volley now
        if (this._telegraphRing) { ctx.scene.remove(this._telegraphRing); this._telegraphRing = null; }
        this._setHeadGlow(false);
        this._spawnBarrage(ctx);
        this._maybeCrossBurst(ctx);
        this._telegraphTime = 0;
        // Next cadence
        this._barrageTimer = 2.4 + Math.random() * 0.6;
      }
      return;
    }

    if (this._barrageTimer > 0) {
      this._barrageTimer -= dt;
      if (this._barrageTimer <= 0) {
        // In phase 2 alternate sweep direction
        if (this.phase === 2) this._sweepDir *= -1;
        this._beginTelegraph(ctx);
      }
    } else {
      // Initialize cadence shortly after spawn
      this._barrageTimer = 1.2 + Math.random() * 0.6;
    }
  }

  // --- Projectiles update and collision ---
  _updateProjectiles(dt, ctx) {
    const THREE = this.THREE;
    const player = ctx.player.position;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // Time ring slowdown if player stands inside any ring and projectile near ring area
      let speedScale = 1.0;
      for (const r of this.rings) {
        if (!r.playerInside) continue;
        const dx = p.pos.x - r.center.x;
        const dz = p.pos.z - r.center.z;
        if (dx*dx + dz*dz <= (r.radius + 0.8) * (r.radius + 0.8)) { speedScale = Math.min(speedScale, 0.65); }
      }
      p.life += dt;
      const step = p.vel.clone().multiplyScalar(p.speed * dt * speedScale);
      p.pos.add(step);
      // Cull if too old or out of bounds
      if (p.life > 6.0 || Math.abs(p.pos.x) > 45 || Math.abs(p.pos.z) > 45) {
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      // Collision vs player capsule approximated as circle at feet
      const dx = p.pos.x - player.x;
      const dz = p.pos.z - player.z;
      if (dx*dx + dz*dz <= (p.radius + 0.45) * (p.radius + 0.45)) {
        // Apply damage (12–14)
        const dmg = 12 + (Math.random() * 3 | 0);
        ctx.onPlayerDamage?.(dmg);
        ctx.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // --- Clones ---
  _spawnClones(ctx) {
    const THREE = this.THREE;
    const count = 2 + (Math.random() < 0.5 ? 0 : 1);
    const center = new THREE.Vector3(0, 0.8, 0);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 12;
      const pos = new THREE.Vector3(center.x + Math.cos(ang)*r, 0.8, center.z + Math.sin(ang)*r);
      const mat = this.mats.enemy.clone(); mat.color = new THREE.Color(0x93c5fd); // softer blue
      const cloneBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.6), mat);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.mats.head.clone()); head.position.y = 1.6; cloneBody.add(head);
      const root = new THREE.Group(); root.position.copy(pos); root.add(cloneBody);
      root.userData = { type: 'boss_shard_clone', head, hp: 40 };
      // Flicker shader via opacity ping-pong using material; simple emissive blink on head
      const inst = {
        root,
        timer: 0,
        life: 6 + Math.random() * 2,
        update: (dt2, c2) => {
          inst.timer += dt2;
          const blink = (Math.sin(performance.now() * 0.02) * 0.5 + 0.5) * 0.5 + 0.4;
          if (head.material && head.material.emissive) head.material.emissive.setHex(blink > 0.8 ? 0xffffff : 0x111827);
          // share subtle orbit: rotate around arena center slowly
          const dir = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
          root.position.add(dir.multiplyScalar(0.6 * dt2));
          if (inst.timer >= inst.life || !this.enemyManager.enemies.has(root)) {
            // despawn if timed out or killed
            if (this.enemyManager.enemies.has(root)) this.enemyManager.remove(root);
          }
        }
      };
      // Register clone but do not count toward alive to avoid blocking wave progression
      this.enemyManager.registerExternalEnemy(inst, { countsTowardAlive: false });
      this.clones.push(inst);
    }
  }

  _tickClones(dt, ctx) {
    if (this._cloneCooldown > 0) this._cloneCooldown -= dt;
    if (this._cloneCooldown <= 0) {
      this._spawnClones(ctx);
      this._cloneCooldown = 10 + Math.random() * 4;
    }
  }

  // --- Time‑dilation rings (phase 2) ---
  _maybeSpawnRing(ctx) {
    if (this.phase !== 2) return;
    if (this._ringCooldown > 0) { this._ringCooldown -= ctx.dtForRing || 0; return; }
    const THREE = this.THREE;
    const count = 1 + (Math.random() < 0.5 ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const playerPos = ctx.player.position;
      const ang = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 8;
      const center = new THREE.Vector3(playerPos.x + Math.cos(ang)*r, 0.06, playerPos.z + Math.sin(ang)*r);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.6, 28),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.copy(center);
      ring.userData = { life: 0 };
      ctx.scene.add(ring);
      this.rings.push({ mesh: ring, center: center.clone(), radius: 2.6, life: 0, playerInside: false });
    }
    this._ringCooldown = 7 + Math.random() * 3.5;
  }

  _updateRings(dt, ctx) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      r.mesh.userData.life = (r.mesh.userData.life || 0) + dt;
      const s = 1.0 + Math.sin(r.mesh.userData.life * 10) * 0.06;
      r.mesh.scale.set(s, s, s);
      if (r.mesh.material && r.mesh.material.opacity !== undefined) {
        r.mesh.material.opacity = Math.max(0.2, 0.9 - r.life * 0.25);
      }
      // Player inside check
      const dx = ctx.player.position.x - r.center.x;
      const dz = ctx.player.position.z - r.center.z;
      r.playerInside = (dx*dx + dz*dz) <= r.radius * r.radius;
      // Lifetime
      if (r.life > 10) { ctx.scene.remove(r.mesh); this.rings.splice(i, 1); }
    }
    // Allow spawning new ones
    this._maybeSpawnRing({ ...ctx, dtForRing: dt });
  }

  // --- Helpers ---
  _setHeadGlow(active) {
    const head = this.root.userData.head; if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      mat.emissive.setHex(active ? 0x93c5fd : this._savedEmissive.getHex());
    } else {
      head.scale.setScalar(active ? 1.08 : 1.0);
    }
  }

  // --- Lifecycle ---
  update(dt, ctx) {
    // Phase transition
    if (this.phase === 1 && this.root.userData.hp <= this.maxHp * 0.6) {
      this.phase = 2;
      // Slightly faster cadence and alternate sweeps
      this._barrageTimer = Math.min(this._barrageTimer, 1.6);
      this._ringCooldown = 2.5; // soon after entering phase 2
    }

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    this._tickBarrage(dt, ctx);
    this._updateProjectiles(dt, ctx);
    this._tickClones(dt, ctx);
    this._updateRings(dt, ctx);

    // Cleanup on death
    if (this.root.userData.hp <= 0) {
      // Remove residual visuals
      if (this._telegraphRing) { ctx.scene.remove(this._telegraphRing); this._telegraphRing = null; }
      for (const p of this.projectiles) ctx.scene.remove(p.mesh);
      this.projectiles.length = 0;
      for (const r of this.rings) ctx.scene.remove(r.mesh);
      this.rings.length = 0;
    }
  }

  onRemoved(scene) {
    if (this._telegraphRing) { scene.remove(this._telegraphRing); this._telegraphRing = null; }
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const r of this.rings) scene.remove(r.mesh);
    this.rings.length = 0;
    // Clones will self-destruct via enemyManager.remove when ticked next or timed out
  }
}


