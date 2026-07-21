// Shard Avatar
// Phase 1: rotating radial barrages with safe lanes; mirage clones (2–3) flicker around boss using anchors
// Phase 2 (<=60% HP): alternate CW/CCW sweeps and occasional cross-bursts; time‑dilation rings that slow nearby projectiles when player stands inside

import { createShardAvatarAsset, createBeatTimeRingAsset, createGlitchBeamSegment } from '../assets/boss_shard_avatar.js';
import { disposeOwnedObject3D } from './resource-lifecycle.js';

export class ShardAvatar {
  constructor({ THREE, mats, spawnPos, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    // Visuals: use asset pack model for the Shard Avatar
    const { root, head, refs } = createShardAvatarAsset({ THREE, mats, scale: 1.2 });
    root.position.copy(spawnPos);
    root.userData = { type: 'boss_shard', head, hp: 10000 };
    this.root = root;
    this._assetRefs = refs; // halo, beamAnchors, mirageAnchors, timeRingAnchor, plateOrbiters, plates, orbitBeads, emissives

    // Movement tuning: steady pursuit with orbiting bias
    this.speed = 2.0;
    this._strafeDir = this.rng() < 0.5 ? 1 : -1;
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
    this._sweepBase = this.rng() * Math.PI * 2; // base angle for radial pattern
    this._sweepDir = 1; // 1 or -1, alternates in phase 2
    this._laneOffset = this.rng() * Math.PI * 2; // to create safe lanes

    // Projectiles pool
    this.projectiles = []; // { mesh, pos, vel, speed, life, radius }
    this._projGeo = new THREE.SphereGeometry(0.15, 10, 10);
    this._projMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    this._projectileRaycaster = new THREE.Raycaster();
    this._projectileDirection = new THREE.Vector3();
    try { this._projectileRaycaster.firstHitOnly = true; } catch {}

    // Mirages (visual fakes anchored at refs.mirageAnchors)
    this.mirages = []; // { root, head, anchor, timer, life }
    this._mirageCooldown = 4.5 + this.rng() * 1.5; // first mirage burst shortly after spawn
    this._extraMirages = 0; // additional mirages granted by HP thresholds
    this._belowHalf = false;
    this._belowQuarter = false;

    // Mirage Flank converts prolonged lost sight into a readable lateral
    // reposition followed by one precision shard. The shot still obeys cover.
    this._flankState = 'idle';
    this._flankCooldown = 6.5;
    this._flankHiddenSeconds = 0;
    this._flankTimer = 0;
    this._flankDir = new THREE.Vector3();
    this._flankDestination = new THREE.Vector3();
    this._flankTarget = new THREE.Vector3();
    this._flankLine = null;
    this._flankRaycaster = new THREE.Raycaster();

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
    this._resourcesDisposed = false;
  }

  _disposeTransientRoot(scene, root) {
    if (!root) return;
    scene?.remove?.(root);
    disposeOwnedObject3D(root);
  }

  _disposeProjectile(scene, projectile) {
    if (!projectile?.mesh) return;
    scene?.remove?.(projectile.mesh);
    disposeOwnedObject3D(projectile.mesh, { disposeGeometries: false });
  }

  _removeMirage(mirage, scene) {
    if (!mirage?.root) return;
    if (this.enemyManager?.enemies?.has?.(mirage.root)) this.enemyManager.remove(mirage.root);
    else this._disposeTransientRoot(scene, mirage.root);
  }

  _clearTransientResources(scene) {
    if (this._telegraphRing) {
      this._disposeTransientRoot(scene, this._telegraphRing);
      this._telegraphRing = null;
    }
    for (const projectile of this.projectiles) this._disposeProjectile(scene, projectile);
    this.projectiles.length = 0;
    for (const ring of this.rings) this._disposeTransientRoot(scene, ring.mesh);
    this.rings.length = 0;
    for (const mirage of [...this.mirages]) this._removeMirage(mirage, scene);
    this.mirages.length = 0;
    for (const beat of this._beatVisuals) this._disposeTransientRoot(scene, beat.root);
    this._beatVisuals.length = 0;
    this._clearFlankLine(scene);
  }

  // --- Movement ---
  _updateMovement(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    const desired = new THREE.Vector3();
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this._strafeDir);
    if (dist < 13) desired.addScaledVector(toPlayer, -1.25).addScaledVector(side, 0.3);
    else if (dist > 22) desired.add(toPlayer);
    else {
      desired.add(side);
      if (this._switchT > 0) this._switchT -= dt; else if (this.rng() < 0.01) { this._strafeDir *= -1; this._switchT = 1.0; }
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
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'shard_barrage',
      ownerRoot: this.root
    });
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
    if (!anchors.length) return 0;
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
    let spawned = 0;
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
        this.projectiles.push({
          mesh, pos: mesh.position, vel: dir, speed: speed * speedMul,
          life: 0, radius: 0.35, ownerRoot: this.root, kind: 'shard_barrage'
        });
        spawned++;
      }
    }
    // Advance rotation for next volley
    const delta = (Math.PI / 12) * (this.phase === 1 ? 1 : 1.4);
    this._sweepBase += delta * this._sweepDir;
    this._laneOffset += (Math.PI / 9);
    this._barrageIndex++;
    return spawned;
  }

  _maybeCrossBurst(ctx) {
    if (this.phase !== 2) return 0;
    let spawned = 0;
    if (this.rng() < 0.65) {
      const THREE = this.THREE;
      const baseAngles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
      const extra = [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
      const all = this.rng() < 0.6 ? baseAngles.concat(extra) : baseAngles;
      for (const a of all) {
        // Fan 3 pellets per direction with tiny angular offsets
        for (let k = -1; k <= 1; k++) {
          const off = a + k * (Math.PI/72); // ±2.5°
          const dir = new THREE.Vector3(Math.cos(off), 0, Math.sin(off));
          const mesh = new THREE.Mesh(this._projGeo, this._projMat.clone());
          mesh.position.set(this.root.position.x, 1.0, this.root.position.z);
          mesh.userData = { type: 'boss_shard_proj' };
          ctx.scene.add(mesh);
          this.projectiles.push({
            mesh, pos: mesh.position, vel: dir, speed: 15.0,
            life: 0, radius: 0.35, ownerRoot: this.root, kind: 'shard_cross_burst'
          });
          spawned++;
        }
      }
    }
    return spawned;
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
        if (this._telegraphRing) {
          this._disposeTransientRoot(ctx.scene, this._telegraphRing);
          this._telegraphRing = null;
        }
        this._setHeadGlow(false);
        const projectileCount = this._spawnBarrage(ctx) + this._maybeCrossBurst(ctx);
        ctx.emitAIEvent?.(this.root, 'ability_released', {
          ability: 'shard_barrage',
          projectileCount,
          ownerRoot: this.root
        });
        this._telegraphTime = 0;
        // Next cadence
        this._barrageTimer = 2.4 + this.rng() * 0.6;
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
      this._barrageTimer = 1.2 + this.rng() * 0.6;
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
      const travelDistance = step.length();
      if (travelDistance > 0 && ctx.objects?.length) {
        this._projectileDirection.copy(step).multiplyScalar(1 / travelDistance);
        this._projectileRaycaster.set(p.pos, this._projectileDirection);
        this._projectileRaycaster.near = 0;
        this._projectileRaycaster.far = travelDistance + p.radius;
        const worldHits = this._projectileRaycaster.intersectObjects(ctx.objects, false);
        if (worldHits.length > 0) {
          ctx.emitAIEvent?.(this.root, 'projectile_blocked_by_world', {
            kind: p.kind || 'shard_barrage',
            ownerRoot: p.ownerRoot || this.root,
            blockerRoot: worldHits[0].object || null
          });
          if (p.kind === 'shard_mirage_flank') {
            ctx.emitAIEvent?.(this.root, 'ability_resolved', {
              ability: 'shard_mirage_flank', hitPlayer: false, reason: 'world_blocked'
            });
          }
          this._disposeProjectile(ctx.scene, p);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      p.pos.add(step);
      // Cull if too old or out of bounds
      if (p.life > 6.0 || Math.abs(p.pos.x) > 45 || Math.abs(p.pos.z) > 45) {
        if (p.kind === 'shard_mirage_flank') {
          ctx.emitAIEvent?.(this.root, 'ability_resolved', {
            ability: 'shard_mirage_flank', hitPlayer: false, reason: 'expired'
          });
        }
        this._disposeProjectile(ctx.scene, p);
        this.projectiles.splice(i, 1);
        continue;
      }
      // Collision vs player capsule approximated as circle at feet
      const dx = p.pos.x - player.x;
      const dz = p.pos.z - player.z;
      if (dx*dx + dz*dz <= (p.radius + 0.45) * (p.radius + 0.45)) {
        // Apply damage (12–14)
        const dmg = 12 + (this.rng() * 3 | 0);
        if (ctx.damagePlayer) {
          ctx.damagePlayer(dmg, {
            sourceKind: p.kind || 'shard_barrage',
            sourceRoot: this.root,
            ownerRoot: p.ownerRoot || this.root
          });
        } else {
          ctx.onPlayerDamage?.(dmg, p.kind || 'shard_barrage', {
            sourceRoot: this.root,
            ownerRoot: p.ownerRoot || this.root
          });
        }
        if (p.kind === 'shard_mirage_flank') {
          ctx.emitAIEvent?.(this.root, 'ability_resolved', {
            ability: 'shard_mirage_flank', hitPlayer: true
          });
        }
        this._disposeProjectile(ctx.scene, p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // --- Mirages (visual fakes around the boss) ---
  _spawnMirages(ctx) {
    const THREE = this.THREE;
    const anchors = this._assetRefs?.mirageAnchors || [];
    if (!anchors.length) return;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'shard_mirages', telegraphSeconds: 0
    });
    // Clear existing mirages first
    for (const m of [...this.mirages]) this._removeMirage(m, ctx.scene);
    this.mirages.length = 0;
    const count = Math.min(anchors.length, 2 + this._extraMirages + (this.rng() < 0.5 ? 0 : 1));
    const chosen = new Set();
    const positions = [];
    const makeOffsetPos = (anchor) => {
      const wp = anchor.getWorldPosition(new THREE.Vector3());
      const forward = new THREE.Vector3(); anchor.getWorldDirection(forward);
      forward.y = 0; if (forward.lengthSq() === 0) forward.set(1,0,0); forward.normalize();
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      const extra = 8.0 + this.rng() * 6.0; // 8–14u away
      const lateral = (this.rng() * 2 - 1) * 2.4;
      return wp.add(forward.multiplyScalar(extra)).add(side.multiplyScalar(lateral));
    };
    // Choose unique anchors and precompute world positions (decoupled from boss afterwards)
    const picked = [];
    while (picked.length < count && chosen.size < anchors.length) {
      const idx = (this.rng() * anchors.length) | 0;
      if (chosen.has(idx)) continue; chosen.add(idx);
      picked.push(anchors[idx]);
      positions.push(makeOffsetPos(anchors[idx]));
    }
    // Teleport real boss to one of the mirage positions
    if (positions.length > 0) {
      const realIdx = (this.rng() * positions.length) | 0;
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
        head,
        timer: 0,
        life: 8 + this.rng() * 3,
        target: positions[i].clone(),
        driftA: this.rng() * Math.PI * 2,
        driftR: 0.8 + this.rng() * 0.6,
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
        },
        onRemoved: scene => {
          scene?.remove?.(fake);
          disposeOwnedObject3D(fake);
        }
      };
      this.enemyManager.registerExternalEnemy(inst, { countsTowardAlive: false });
      this.mirages.push(inst);
    }
    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: 'shard_mirages', mirageCount: this.mirages.length,
      repositioned: positions.length > 0
    });
  }

  _beginMirageFlank(ctx) {
    const toPlayer = ctx.player.position.clone().sub(this.root.position).setY(0);
    if (toPlayer.lengthSq() <= 0.001) toPlayer.set(0, 0, 1);
    toPlayer.normalize();
    const side = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const targetChest = ctx.player.position.clone();
    targetChest.y += 0.65;
    const candidates = [];
    for (const distance of [10, 14, 18, 22]) {
      candidates.push(
        this.root.position.clone().addScaledVector(side, distance * this._strafeDir),
        this.root.position.clone().addScaledVector(side, -distance * this._strafeDir)
      );
    }
    const destination = candidates.find(candidate => {
      candidate.y = this.root.position.y;
      const positionClear = ctx.positionClear?.(this.root, candidate) ?? true;
      const origin = candidate.clone();
      origin.y = 1.1;
      return positionClear && this._hasWorldLine(origin, targetChest, ctx.objects || []);
    }) || this.root.position.clone().addScaledVector(side, 18 * this._strafeDir);
    this._flankDestination.copy(destination);
    this._flankDir.copy(destination).sub(this.root.position).setY(0);
    if (this._flankDir.lengthSq() > 0) this._flankDir.normalize();
    this._flankTarget.copy(ctx.player.position);
    this._flankState = 'reposition';
    this._flankTimer = 0;
    this._setHeadGlow(true);
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'shard_mirage_flank', telegraphSeconds: 1.35,
      reason: 'lost_los', destination: this._flankDestination.clone()
    });
  }

  _updateMirageFlank(dt, ctx) {
    if (this._flankState === 'idle') {
      this._flankCooldown = Math.max(0, this._flankCooldown - dt);
      const visible = this._hasWorldLine(this.root.position, ctx.player.position, ctx.objects || []);
      this._flankHiddenSeconds = visible ? 0 : this._flankHiddenSeconds + dt;
      if (this._flankCooldown <= 0 && this._flankHiddenSeconds >= 1.2) this._beginMirageFlank(ctx);
      return this._flankState !== 'idle';
    }

    this._flankTimer += dt;
    if (this._flankState === 'reposition') {
      const remaining = this._flankDestination.clone().sub(this.root.position).setY(0);
      const distance = remaining.length();
      if (distance > 0.05) {
        const step = remaining.normalize().multiplyScalar(Math.min(distance, 24 * dt));
        if (ctx.moveWithCollisions) ctx.moveWithCollisions(this.root, step);
        else this.root.position.add(step);
      }
      if (this._flankTimer >= 0.75 || distance <= 0.2) {
        this._flankState = 'windup';
        this._flankTimer = 0;
        this._flankTarget.copy(ctx.player.position);
        this._updateFlankLine(ctx.scene);
      }
      return true;
    }

    this._flankTarget.lerp(ctx.player.position, Math.min(1, dt * 2.2));
    this._updateFlankLine(ctx.scene);
    if (this._flankTimer < 0.6) return true;

    const origin = this.root.position.clone();
    origin.y = 1.1;
    const target = ctx.player.position.clone();
    target.y += 0.65;
    const clear = this._hasWorldLine(origin, target, ctx.objects || []);
    let projectileCount = 0;
    if (clear) {
      const dir = target.sub(origin).setY(0);
      if (dir.lengthSq() <= 0.001) dir.set(0, 0, 1);
      dir.normalize();
      const mesh = new this.THREE.Mesh(this._projGeo, this._projMat.clone());
      mesh.material.color?.setHex?.(0xff4fd8);
      mesh.position.copy(origin);
      mesh.userData = { type: 'boss_shard_proj', ability: 'shard_mirage_flank' };
      ctx.scene.add(mesh);
      this.projectiles.push({
        mesh, pos: mesh.position, vel: dir, speed: 18,
        life: 0, radius: 0.35, ownerRoot: this.root, kind: 'shard_mirage_flank'
      });
      projectileCount = 1;
      ctx.emitAIEvent?.(this.root, 'projectile_fired', {
        ability: 'shard_mirage_flank', kind: 'shard_mirage_flank', worldVisible: true
      });
    } else {
      ctx.emitAIEvent?.(this.root, 'shot_withheld', {
        ability: 'shard_mirage_flank', kind: 'shard_mirage_flank', blockedBy: 'world'
      });
    }
    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: 'shard_mirage_flank', projectileCount, worldBlocked: !clear
    });
    this._clearFlankLine(ctx.scene);
    this._flankState = 'idle';
    this._flankTimer = 0;
    this._flankHiddenSeconds = 0;
    this._flankCooldown = 7.5 + this.rng() * 2;
    this._strafeDir *= -1;
    this._setHeadGlow(false);
    return false;
  }

  _updateFlankLine(scene) {
    const origin = this.root.position;
    const delta = this._flankTarget.clone().sub(origin).setY(0);
    const length = Math.max(0.5, delta.length());
    if (!this._flankLine) {
      this._flankLine = new this.THREE.Mesh(
        new this.THREE.BoxGeometry(0.16, 0.04, 1),
        new this.THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.72, depthWrite: false })
      );
      scene?.add?.(this._flankLine);
    }
    this._flankLine.position.copy(origin).add(this._flankTarget).multiplyScalar(0.5);
    this._flankLine.position.y = 0.1;
    this._flankLine.rotation.y = Math.atan2(delta.x, delta.z);
    this._flankLine.scale.set(1, 1, length);
  }

  _clearFlankLine(scene) {
    if (!this._flankLine) return;
    scene?.remove?.(this._flankLine);
    this._flankLine.geometry?.dispose?.();
    this._flankLine.material?.dispose?.();
    this._flankLine = null;
  }

  _hasWorldLine(origin, target, objects) {
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (distance <= 0.001) return true;
    direction.normalize();
    this._flankRaycaster.set(origin, direction);
    this._flankRaycaster.far = Math.max(0, distance - 0.15);
    return this._flankRaycaster.intersectObjects(objects, false).length === 0;
  }

  _tickMirages(dt, ctx) {
    if (this._mirageCooldown > 0) this._mirageCooldown -= dt;
    if (this._mirageCooldown <= 0) {
      this._spawnMirages(ctx);
      this._mirageCooldown = 10 + this.rng() * 4;
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
    const count = 1 + (this.rng() < 0.5 ? 0 : 1);
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'shard_time_ring', telegraphSeconds: 0,
      requestedCount: count
    });
    for (let i = 0; i < count; i++) {
      const playerPos = ctx.player.position;
      const ang = this.rng() * Math.PI * 2;
      const r = 5 + this.rng() * 8;
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
    this._ringCooldown = 7 + this.rng() * 3.5;
    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: 'shard_time_ring', ringCount: count
    });
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
      if (r.life > 10) {
        this._disposeTransientRoot(ctx.scene, r.mesh);
        this.rings.splice(i, 1);
      }
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
      if (b.life > 0.6) {
        this._disposeTransientRoot(ctx.scene, b.root);
        this._beatVisuals.splice(i, 1);
        this._setHeadGlow(false);
      }
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
      this._mirageCooldown = 10 + this.rng() * 4;
    }

    const flankActive = this._updateMirageFlank(dt, ctx);

    // Movement and barrages pause during the committed flank sequence.
    if (!flankActive) {
      this._updateMovement(dt, ctx);
      this._tickBarrage(dt, ctx);
    }

    // Attacks
    this._updateProjectiles(dt, ctx);
    this._tickMirages(dt, ctx);
    this._updateRings(dt, ctx);
    this._tickBeatAndAnim(dt, ctx);

    // Cleanup on death
    if (this.root.userData.hp <= 0) {
      this._clearTransientResources(ctx.scene);
    }
  }

  onRemoved(scene) {
    this._clearTransientResources(scene);
    if (this._resourcesDisposed) return;
    this._resourcesDisposed = true;
    this._projGeo?.dispose?.();
    this._projMat?.dispose?.();
    disposeOwnedObject3D(this.root);
  }
}


