import { createShooterBot } from '../assets/shooter_bot.js';
export class ShooterEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    // Use ShooterBot asset with right-hand gun; shots originate from muzzle, not head
    const built = createShooterBot({ THREE, mats, scale: 0.62 });
    const body = built.root; const head = built.head; this._refs = built.refs || {};
    body.position.copy(spawnPos);

    body.userData = { type: cfg.type, head, hp: cfg.hp };
    this.root = body;
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.preferredRange = { min: 5, max: 50 };
    this.engageRange = { min: 48, max: 90 };

    // Firing cadence and telegraph
    this.cooldown = 0;                               // general cooldown timer
    this.baseCadence = 0.6 + Math.random() * 0.4;   // intra-burst spacing
    this.interBurstBase = 1.6 + Math.random() * 0.6; // long delay between bursts
    this.inBurst = false;                            // currently executing a burst sequence
    this.windupTime = 0;                             // time spent charging current shot (telegraph before burst)
    this.windupRequired = 0.5 + Math.random() * 0.2; // 0.5–0.7s telegraph
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;                         // control strafe dir switching

    this.projectiles = [];
    this._raycaster = new THREE.Raycaster();
    this._aimLine = null;                            // telegraph line during windup

    // Peek/relocate behavior state
    this.shotsThisBurst = 0;
    this.maxBurst = 3 + ((Math.random() * 2) | 0);   // 3–4 shots per burst
    this.relocating = false;
    this.relocateTarget = null;
    this.relocateTimer = 0;
    this.relocateTimeout = 2.2 + Math.random() * 0.8; // seconds to give up and resume
    this.relocateDistance = 8 + Math.random() * 4;     // 8–12 units lateral move
    // On-hit micro-juke
    this._hitJukeTime = 0;
    this._hitJukeDir = new this.THREE.Vector3();
    this._lastFwd = new this.THREE.Vector3(0,0,1);
    // Facing and small gun recoil/flash state
    this._yaw = 0; this._flashTimer = 0; this._recoil = 0;
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    // 0) Update small per-shot visuals
    if (this._flashTimer > 0) {
      this._flashTimer = Math.max(0, this._flashTimer - dt);
      if (this._refs && this._refs.muzzle && this._refs.muzzle.material && this._refs.muzzle.material.emissiveIntensity != null) {
        this._refs.muzzle.material.emissiveIntensity = 0.6 + 1.4 * (this._flashTimer / 0.08);
      }
    }
    if (this._recoil > 0) {
      this._recoil = Math.max(0, this._recoil - dt * 6);
      try { if (this._refs && this._refs.gun) this._refs.gun.position.z = -0.05 * this._recoil; } catch(_) {}
    } else {
      try { if (this._refs && this._refs.gun) this._refs.gun.position.z *= Math.max(0, 1 - dt * 10); } catch(_) {}
    }

    // 1) Update projectiles
    this._updateProjectiles(dt, ctx);

    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    const hasLOS = this._hasLineOfSight(e, playerPos, ctx.objects);
    const playerStationary = (ctx.blackboard && (ctx.blackboard.playerSpeed || 0) < 0.8);

    // 2) Movement: maintain standoff, peek when LOS blocked, relocate after bursts
    const desired = new THREE.Vector3();
    if (this.relocating) {
      // Relocation overrides normal behavior
      this.relocateTimer += dt;
      if (!this.relocateTarget) {
        this._beginRelocation(playerPos, toPlayer);
      }
      if (this.relocateTarget) {
        const toAnchor = this.relocateTarget.clone().sub(e.position); toAnchor.y = 0;
        const d = toAnchor.length();
        if (d > 0.0001) desired.add(toAnchor.normalize());
        if (d < 0.75 || this.relocateTimer >= this.relocateTimeout) {
          this.relocating = false; this.relocateTarget = null; this.relocateTimer = 0;
          // small cooldown before next windup so it doesn't insta-fire on arrival
          this.cooldown = Math.max(this.cooldown, 0.4 + Math.random() * 0.3);
        }
      }
    } else if (!hasLOS && dist <= this.engageRange.max) {
      // Try to find a peek direction that reveals LOS around nearby cover
      const peekDir = this._computePeekDesiredDir(e.position, playerPos, ctx.objects, toPlayer.clone());
      if (peekDir && peekDir.lengthSq() > 0) desired.add(peekDir);
      else {
        // fallback to circling to vary angle even if peek not found
        const fwd = toPlayer.clone().setY(0); if (fwd.lengthSq()>0) fwd.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        desired.add(side);
      }
    } else if (dist < this.preferredRange.min - 1) {
      // backpedal
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (dist > this.preferredRange.max + 1) {
      // approach only if outside engage max; otherwise strafe
      if (dist > this.engageRange.max) {
        toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize());
      }
    } else {
      // strafe around player; if regrouping, widen standoff toward 22–28 and orbit until allies catch up
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) {
        const fwd = toPlayer.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        const regroup = ctx.blackboard && ctx.blackboard.regroup;
        if (regroup) {
          // push toward 22–28m ring
          const targetMin = 22, targetMax = 28;
          const target = (targetMin + targetMax) * 0.5;
          if (dist < targetMin) desired.add(fwd.clone().multiplyScalar(-1.2));
          else if (dist > targetMax) desired.add(fwd.clone().multiplyScalar(1.0));
          desired.add(side.multiplyScalar(1.2));
        } else {
          desired.add(side);
        }
        // occasionally switch strafe dir
        if (this.switchCooldown > 0) this.switchCooldown -= dt; else if (Math.random() < 0.01) { this.strafeDir *= -1; this.switchCooldown = 1.2; }
      }
    }

    // Obstacle avoidance + separation
    const avoid = desired.lengthSq() > 0 ? ctx.avoidObstacles(e.position, desired, 1.6) : desired;
    const sep = ctx.separation(e.position, 1.2, e);
    // Cache forward used by movement to orient hit-jukes
    if (toPlayer.lengthSq() > 0) {
      const fwdCache = toPlayer.clone().setY(0);
      if (fwdCache.lengthSq()>0) this._lastFwd.copy(fwdCache.normalize());
    }

    const steer = desired.clone().add(avoid.multiplyScalar(1.2)).add(sep.multiplyScalar(0.8));
    // Apply on-hit micro-juke impulse
    if (this._hitJukeTime > 0 && this._hitJukeDir.lengthSq() > 0) {
      this._hitJukeTime = Math.max(0, this._hitJukeTime - dt);
      steer.add(this._hitJukeDir.clone().multiplyScalar(1.1));
    }

    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      const step = steer.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }

    // Face the player smoothly (yaw only) so gun points generally toward target
    const desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
    const wrap = (a)=>{ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; };
    let dy = wrap(desiredYaw - this._yaw);
    const turnRate = 6.0; // rad/s
    this._yaw = wrap(this._yaw + Math.max(-turnRate*dt, Math.min(turnRate*dt, dy)));
    e.rotation.set(0, this._yaw, 0);

    // 3) Shooting logic
    if (this.cooldown > 0) this.cooldown -= dt;

    const inBand = dist >= this.preferredRange.min && dist <= this.preferredRange.max;

    // Active burst: fire without additional telegraph while LOS/inBand hold
    if (this.inBurst) {
      // Ensure telegraph visuals are off during burst
      if (this._aimLine) this._updateAimLine(null, ctx.scene);
      this._setHeadGlow(false);

      // Cancel burst early if conditions break
      if (!(inBand && hasLOS)) {
        this.inBurst = false;
        this.shotsThisBurst = 0;
        this.cooldown = Math.max(this.cooldown, 0.4 + Math.random() * 0.3);
      } else if (this.cooldown <= 0) {
        // Fire next shot in the burst
        this._fireProjectile(playerPos, ctx.scene);
        // Mark suppression immediately after firing if target was stationary and exposed
        if (ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;

        if (this.shotsThisBurst >= this.maxBurst) {
          // End burst: long inter-burst delay and relocation to vary angle
          this.inBurst = false;
          this.shotsThisBurst = 0;
          this.cooldown = this.interBurstBase;
          if (!this.relocating) {
            this.relocating = true;
            this.relocateTarget = null;
            this.relocateTimer = 0;
          }
          // Reroll next burst parameters for variety
          this.maxBurst = 3 + ((Math.random() * 2) | 0); // 3–4
          this.baseCadence = 0.12 + Math.random() * 0.12; // intra-burst spacing
          this.interBurstBase = 1.6 + Math.random() * 0.6;
          this.windupRequired = 0.5 + Math.random() * 0.2;
        } else {
          // Space next intra-burst shot
          this.cooldown = this.baseCadence;
        }
      }
    } else if (inBand && hasLOS && this.cooldown <= 0) {
      // Telegraph with head glow and aim line; keep checking LOS
      this.windupTime += dt;
      this._setHeadGlow(true);
      this._updateAimLine(playerPos, ctx.scene, 0x10b981);
      // Mark suppression while telegraphing at a stationary, exposed player
      if (ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;
      if (!hasLOS) {
        // cancel windup if LOS broken
        this.windupTime = 0;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      } else if (this.windupTime >= this.windupRequired) {
        // Begin burst and fire first shot immediately
        this._setHeadGlow(false);
        this.windupTime = 0;
        this._updateAimLine(null, ctx.scene);
        this.inBurst = true;
        // fresh parameters for this burst
        this.maxBurst = 3 + ((Math.random() * 2) | 0);   // 3–4 shots per burst
        this.baseCadence = 0.12 + Math.random() * 0.12;  // intra-burst spacing
        this.interBurstBase = 1.6 + Math.random() * 0.6; // inter-burst gap
        // First shot now, then set spacing for next
        this._fireProjectile(playerPos, ctx.scene);
        if (ctx.blackboard && playerStationary) ctx.blackboard.suppression = true;
        if (this.shotsThisBurst >= this.maxBurst) {
          // Degenerate rare case: maxBurst==1; end immediately
          this.inBurst = false;
          this.shotsThisBurst = 0;
          this.cooldown = this.interBurstBase;
        } else {
          this.cooldown = this.baseCadence;
        }
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
    // Fire from gun muzzle if available; otherwise from chest height
    let origin;
    if (this._refs && this._refs.muzzle) {
      origin = this._refs.muzzle.getWorldPosition(new THREE.Vector3());
      // Aim the gun group at the target on each shot
      try {
        const gunGroup = this._refs.gun;
        if (gunGroup && gunGroup.lookAt) {
          const aim = targetPos.clone(); aim.y = Math.max(0.4, aim.y);
          gunGroup.parent.updateWorldMatrix?.(true, false);
          gunGroup.lookAt(aim);
        }
      } catch(_){}
      // Flash and recoil
      this._flashTimer = 0.08;
      this._recoil = 1.0;
    } else {
      origin = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.2, this.root.position.z);
    }
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
    this.shotsThisBurst += 1;
  }

  onHit(damage, isHead) {
    // Short lateral juke on hit (0.12–0.2s)
    const base = 0.12 + Math.random() * 0.08;
    this._hitJukeTime = Math.max(this._hitJukeTime, base);
    // pick random lateral relative to facing toward player
    const fwd = this._lastFwd.lengthSq() > 0 ? this._lastFwd.clone() : new this.THREE.Vector3(0,0,1);
    const side = new this.THREE.Vector3(-fwd.z, 0, fwd.x);
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    this._hitJukeDir.copy(side.multiplyScalar(sideSign));
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

  _hasLineOfSightFrom(originPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(originPos.x, originPos.y + 1.4, originPos.z);
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _computePeekDesiredDir(fromPos, playerPos, objects, toPlayerVec) {
    // Sample lateral offsets to try to reveal LOS around cover
    const THREE = this.THREE;
    const fwd = toPlayerVec.setY(0); if (fwd.lengthSq() === 0) return null; fwd.normalize();
    const left = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const right = left.clone().multiplyScalar(-1);
    const step = 0.9; // meters per sample
    const maxSamples = 8; // try up to ~7.2m each side
    let bestDir = null;
    let bestScore = -Infinity;
    for (const dir of [left, right]) {
      for (let i = 1; i <= maxSamples; i++) {
        const cand = fromPos.clone().add(dir.clone().multiplyScalar(step * i));
        // Prefer candidates that gain LOS
        const los = this._hasLineOfSightFrom(cand, playerPos, objects);
        const score = (los ? 10 : 0) - i * 0.3; // bias closer peeks
        if (score > bestScore) {
          bestScore = score; bestDir = cand.clone().sub(fromPos).setY(0).normalize();
        }
        if (los) break; // stop further in this direction once LOS achieved
      }
    }
    return bestDir;
  }

  _beginRelocation(playerPos, toPlayer) {
    const THREE = this.THREE;
    const fwd = toPlayer.clone().setY(0); if (fwd.lengthSq() > 0) fwd.normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    // move laterally relative to current position to change angle on the player
    const target = this.root.position.clone().add(side.multiplyScalar(this.relocateDistance));
    this.relocateTarget = target;
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