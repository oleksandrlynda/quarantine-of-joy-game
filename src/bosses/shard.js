// Shard Avatar
// Phase 1: rotating radial barrages with safe lanes; mirage clones (2–3) flicker around boss using anchors
// Phase 2 (<=60% HP): alternate CW/CCW sweeps and occasional cross-bursts; time‑dilation rings that slow nearby projectiles when player stands inside

import { createShardAvatarAsset, createBeatTimeRingAsset, createGlitchBeamSegment } from '../assets/boss_shard_avatar.js';

export class ShardAvatar {
  constructor({ THREE, mats, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;

    // Visuals: use asset pack model for the Shard Avatar
    const { root, head, refs } = createShardAvatarAsset({ THREE, mats, scale: 1.2 });
    root.position.copy(spawnPos);
    root.userData = { type: 'boss_shard', head, hp: 15000 };
    this.root = root;
    this._assetRefs = refs; // halo, beamAnchors, mirageAnchors, timeRingAnchor, plateOrbiters, plates, orbitBeads, emissives

    // Movement tuning: steady pursuit with orbiting bias
    this.speed = 2.0;
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._switchT = 0;

    // Barrage state
    this.phase = 1;
    // Track the boss's maximum HP based on its initial health value
    this.maxHp = root.userData.hp;
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

    // Mirages (visual fakes anchored at refs.mirageAnchors)
    this.mirages = []; // { root, head, anchor, timer, life }
    this._mirageCooldown = 4.5 + Math.random() * 1.5; // first mirage burst shortly after spawn
    this._extraMirages = 0; // additional mirages granted by HP thresholds
    this._belowHalf = false;
    this._belowQuarter = false;

    // Time‑rings (phase 2)
    this.rings = []; // { mesh, center, radius, life, playerInside }
    this._ringCooldown = 3.5; // delay before possible first ring after p2

    // Telegraph visuals
    this._telegraphRing = null;

    // Beat ring visuals at timeRingAnchor
    this._beatTimer = 0;
    this._beatInterval = 1.0; // seconds per beat visual
    this._beatVisuals = []; // { root, life, refs }

    // Halo/plates/beads animation
    this._haloSpin = 0.8; // rad/s
    this._plateSpin = 0.25; // rad/s
    this._beadRing = (refs?.orbitBeads && refs.orbitBeads[0] && refs.orbitBeads[0].parent) || null;
    this._beadSpin = 0.6; // rad/s
    this._glitchBeams = []; // { mesh, aIndex, bIndex }
    this._initGlitchBeams();

    // Barrage escalation tracking
    this._barrageIndex = 0;
    this._lastWasStorm = false;

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
    const anchors = this._assetRefs?.beamAnchors || [];
    if (!anchors.length) return;
    // Create one or two safe lanes by skipping anchors whose angle falls near gapCenter
    const gapCenter = this._laneOffset; // radians
    const gapWidth = (Math.PI / anchors.length) * 2.6;
    const speed = 12.5;
    const worldCenter = this.root.position.clone();
    // Escalation: every 3rd barrage becomes a storm volley (more beams per anchor + faster)
    const isStorm = (this.phase === 2) || (this._barrageIndex % 2 === 1);
    const perAnchorBeams = isStorm ? 4 : 2;
    const angularSpread = isStorm ? (Math.PI / 16) : (Math.PI / 36); // storm ±11.25°, normal ±5°
    const speedMul = isStorm ? 1.35 : 1.1;
    for (let i = 0; i < anchors.length; i++) {
      const hp = anchors[i];
      const hpPos = hp.getWorldPosition(new THREE.Vector3());
      const v = hpPos.clone().sub(worldCenter); v.y = 0; if (v.lengthSq() === 0) continue; v.normalize();
      const angle = Math.atan2(v.z, v.x);
      const angNorm = ((angle - gapCenter + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(angNorm) < gapWidth * 0.5) continue; // safe lane skip
      for (let k = 0; k < perAnchorBeams; k++) {
        let dir = v.clone();
        if (perAnchorBeams > 1) {
          // offset around base dir evenly across spread, multiplied by sweepDir
          const t = perAnchorBeams === 1 ? 0 : (k / (perAnchorBeams - 1)) * 2 - 1; // -1..1
          const off = t * angularSpread;
          const c = Math.cos(off), s = Math.sin(off);
          dir = new THREE.Vector3(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c);
        }
        dir.multiplyScalar(this._sweepDir);
        const mesh = new THREE.Mesh(this._projGeo, this._projMat.clone());
        mesh.position.set(hpPos.x, 1.2, hpPos.z);
        mesh.userData = { type: 'boss_shard_proj' };
        ctx.scene.add(mesh);
        this.projectiles.push({ mesh, pos: mesh.position, vel: dir, speed: speed * speedMul, life: 0, radius: 0.35 });
      }
    }
    // Advance rotation for next volley
    const delta = (Math.PI / 12) * (this.phase === 1 ? 1 : 1.4);
    this._sweepBase += delta * this._sweepDir;
    this._laneOffset += (Math.PI / 9);
    this._barrageIndex++;
  }

  _maybeCrossBurst(ctx) {
    if (this.phase !== 2) return;
    if (Math.random() < 0.65) {
      const THREE = this.THREE;
      const baseAngles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
      const extra = [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
      const all = Math.random() < 0.6 ? baseAngles.concat(extra) : baseAngles;
      for (const a of all) {
        // Fan 3 pellets per direction with tiny angular offsets
        for (let k = -1; k <= 1; k++) {
          const off = a + k * (Math.PI/72); // ±2.5°
          const dir = new THREE.Vector3(Math.cos(off), 0, Math.sin(off));
          const mesh = new THREE.Mesh(this._projGeo, this._projMat.clone());
          mesh.position.set(this.root.position.x, 1.0, this.root.position.z);
          mesh.userData = { type: 'boss_shard_proj' };
          ctx.scene.add(mesh);
          this.projectiles.push({ mesh, pos: mesh.position, vel: dir, speed: 15.0, life: 0, radius: 0.35 });
        }
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
        // Briefly align plates to carve corridors matching safe lanes
        this._alignPlatesToSafeLane();
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

  // --- Mirages (visual fakes around the boss) ---
  _spawnMirages(ctx) {
    const THREE = this.THREE;
    const anchors = this._assetRefs?.mirageAnchors || [];
    if (!anchors.length) return;
    // Clear existing mirages first
    for (const m of this.mirages) ctx.scene.remove(m.root);
    this.mirages.length = 0;
    const count = Math.min(anchors.length, 2 + this._extraMirages + (Math.random() < 0.5 ? 0 : 1));
    const chosen = new Set();
    const positions = [];
    const makeOffsetPos = (anchor) => {
      const wp = anchor.getWorldPosition(new THREE.Vector3());
      const forward = new THREE.Vector3(); anchor.getWorldDirection(forward);
      forward.y = 0; if (forward.lengthSq() === 0) forward.set(1,0,0); forward.normalize();
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      const extra = 8.0 + Math.random() * 6.0; // 8–14u away
      const lateral = (Math.random() * 2 - 1) * 2.4;
      return wp.add(forward.multiplyScalar(extra)).add(side.multiplyScalar(lateral));
    };
    // Choose unique anchors and precompute world positions (decoupled from boss afterwards)
    const picked = [];
    while (picked.length < count && chosen.size < anchors.length) {
      const idx = (Math.random() * anchors.length) | 0;
      if (chosen.has(idx)) continue; chosen.add(idx);
      picked.push(anchors[idx]);
      positions.push(makeOffsetPos(anchors[idx]));
    }
    // Teleport real boss to one of the mirage positions
    if (positions.length > 0) {
      const realIdx = (Math.random() * positions.length) | 0;
      const p = positions[realIdx];
      this.root.position.copy(p);
    }
    // Spawn mirage enemies at the other positions; they are shootable and do not follow boss
    for (let i = 0; i < positions.length; i++) {
      const instAsset = createShardAvatarAsset({ THREE, mats: this.mats, scale: 0.85 });
      const fake = instAsset.root; const head = instAsset.head;
      fake.userData = { type: 'boss_shard_mirage', hp: 30 };
      if (head?.material?.emissiveIntensity != null) head.material.emissiveIntensity = 0.45;
      fake.position.copy(positions[i]);
      const inst = {
        root: fake,
        timer: 0,
        life: 8 + Math.random() * 3,
        target: positions[i].clone(),
        driftA: Math.random() * Math.PI * 2,
        driftR: 0.8 + Math.random() * 0.6,
        update: (dt2, _c2) => {
          inst.timer += dt2;
          inst.driftA += dt2 * 0.6;
          const offset = new THREE.Vector3(Math.cos(inst.driftA) * inst.driftR, 0, Math.sin(inst.driftA) * inst.driftR);
          const target = inst.target.clone().add(offset);
          const to = target.sub(fake.position); to.y = 0;
          const step = Math.min(4.0 * dt2, to.length());
          if (step > 0) fake.position.add(to.normalize().multiplyScalar(step));
          // Pop when time elapsed or killed
          if (inst.timer >= inst.life || !this.enemyManager.enemies.has(fake)) {
            if (this.enemyManager.enemies.has(fake)) this.enemyManager.remove(fake);
          }
        }
      };
      this.enemyManager.registerExternalEnemy(inst, { countsTowardAlive: false });
      this.mirages.push(inst);
    }
  }

  _tickMirages(dt, ctx) {
    if (this._mirageCooldown > 0) this._mirageCooldown -= dt;
    if (this._mirageCooldown <= 0) {
      this._spawnMirages(ctx);
      this._mirageCooldown = 10 + Math.random() * 4;
    }
    // Flicker heads and allow their registered update to handle motion; remove if cleaned up
    for (let i = this.mirages.length - 1; i >= 0; i--) {
      const m = this.mirages[i];
      const head = m.root?.children?.find?.(() => false) || m.head; // keep reference
      const blink = (Math.sin(performance.now() * 0.02) * 0.5 + 0.5) * 0.5 + 0.35;
      if (m.head?.material?.emissive) m.head.material.emissive.setHex(blink > 0.82 ? 0xffffff : 0x111827);
      if (!this.enemyManager.enemies.has(m.root)) { this.mirages.splice(i, 1); }
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

  // --- Beat visuals and asset animations ---
  _tickBeatAndAnim(dt, ctx) {
    // Halo spin
    if (this._assetRefs?.halo) this._assetRefs.halo.rotation.y += this._haloSpin * dt;
    // Plate spin
    if (this._assetRefs?.plateOrbiters) {
      for (const orb of this._assetRefs.plateOrbiters) { orb.rotation.y += this._plateSpin * dt; }
    }
    // Beads spin
    if (this._beadRing) this._beadRing.rotation.y += this._beadSpin * dt;
    // Glitch beam segments stretch between opposite beads
    this._updateGlitchBeams();
    // Beat ring visuals at timeRingAnchor
    this._beatTimer += dt;
    if (this._beatTimer >= this._beatInterval && this._assetRefs?.timeRingAnchor) {
      this._beatTimer = 0;
      const viz = createBeatTimeRingAsset({ THREE: this.THREE, radius: 1.6 });
      const wp = this._assetRefs.timeRingAnchor.getWorldPosition(new this.THREE.Vector3());
      viz.root.position.copy(wp);
      viz.root.userData = { life: 0 };
      ctx.scene.add(viz.root);
      this._beatVisuals.push({ root: viz.root, refs: viz.refs, life: 0 });
      // brighten real head briefly on beat
      this._setHeadGlow(true);
    }
    for (let i = this._beatVisuals.length - 1; i >= 0; i--) {
      const b = this._beatVisuals[i]; b.life += dt;
      const s = 1.0 + b.life * 1.2; b.root.scale.set(s, s, s);
      const disk = b.refs?.disk, ring = b.refs?.ring;
      if (disk?.material) disk.material.opacity = Math.max(0, 0.35 - b.life * 0.6);
      if (ring?.material) ring.material.opacity = Math.max(0, 0.85 - b.life * 0.8);
      if (b.life > 0.6) { ctx.scene.remove(b.root); this._beatVisuals.splice(i, 1); this._setHeadGlow(false); }
    }
  }

  _alignPlatesToSafeLane() {
    const orbs = this._assetRefs?.plateOrbiters || [];
    if (!orbs.length) return;
    const targetAngle = this._laneOffset;
    for (const orb of orbs) { orb.rotation.y = targetAngle; }
  }

  _initGlitchBeams() {
    const beads = this._assetRefs?.orbitBeads || [];
    if (beads.length < 2) return;
    // Pair each bead with the opposite one (assuming even count)
    const half = Math.floor(beads.length / 2);
    for (let i = 0; i < half; i++) {
      const seg = createGlitchBeamSegment({ THREE: this.THREE, length: 2.0 });
      this.root.add(seg.root);
      this._glitchBeams.push({ mesh: seg.root, aIndex: i, bIndex: i + half });
    }
  }

  _updateGlitchBeams() {
    const beads = this._assetRefs?.orbitBeads || [];
    if (!this._glitchBeams.length || beads.length === 0) return;
    const THREE = this.THREE;
    for (const gb of this._glitchBeams) {
      const a = beads[gb.aIndex]; const b = beads[gb.bIndex]; if (!a || !b) continue;
      const aw = a.getWorldPosition(new THREE.Vector3());
      const bw = b.getWorldPosition(new THREE.Vector3());
      const mid = aw.clone().add(bw).multiplyScalar(0.5);
      const delta = bw.clone().sub(aw); const len = delta.length();
      // position at midpoint
      gb.mesh.position.copy(mid);
      // orient so Y axis aligns with delta
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
      gb.mesh.setRotationFromQuaternion(quat);
      // scale length on Y
      gb.mesh.scale.set(1, len * 0.5, 1);
    }
  }

  // --- Helpers ---
  _setHeadGlow(active) {
    const head = this.root.userData.head; if (!head || !head.material) return;
    const mat = head.material;
    if (mat.emissive) {
      if (!this._savedEmissive) this._savedEmissive = mat.emissive.clone();
      mat.emissive.setHex(active ? 0x93c5fd : this._savedEmissive.getHex());
      if (mat.emissiveIntensity != null) mat.emissiveIntensity = active ? 1.4 : 0.9;
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

    // HP threshold mirage bonuses
    let triggered = false;
    if (!this._belowHalf && this.root.userData.hp <= this.maxHp * 0.5) {
      this._belowHalf = true;
      this._extraMirages++;
      triggered = true;
    }
    if (!this._belowQuarter && this.root.userData.hp <= this.maxHp * 0.25) {
      this._belowQuarter = true;
      this._extraMirages++;
      this.speed *= 1.1;
      triggered = true;
    }
    if (triggered) {
      this._spawnMirages(ctx);
      this._mirageCooldown = 10 + Math.random() * 4;
    }

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    this._tickBarrage(dt, ctx);
    this._updateProjectiles(dt, ctx);
    this._tickMirages(dt, ctx);
    this._updateRings(dt, ctx);
    this._tickBeatAndAnim(dt, ctx);

    // Cleanup on death
    if (this.root.userData.hp <= 0) {
      // Remove residual visuals
      if (this._telegraphRing) { ctx.scene.remove(this._telegraphRing); this._telegraphRing = null; }
      for (const p of this.projectiles) ctx.scene.remove(p.mesh);
      this.projectiles.length = 0;
      for (const r of this.rings) ctx.scene.remove(r.mesh);
      this.rings.length = 0;
      for (const m of this.mirages) ctx.scene.remove(m.root);
      this.mirages.length = 0;
      for (const b of this._beatVisuals) ctx.scene.remove(b.root);
      this._beatVisuals.length = 0;
    }
  }

  onRemoved(scene) {
    if (this._telegraphRing) { scene.remove(this._telegraphRing); this._telegraphRing = null; }
    for (const p of this.projectiles) scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const r of this.rings) scene.remove(r.mesh);
    this.rings.length = 0;
    for (const m of this.mirages) scene.remove(m.root);
    this.mirages.length = 0;
    for (const b of this._beatVisuals) scene.remove(b.root);
    this._beatVisuals.length = 0;
  }
}


