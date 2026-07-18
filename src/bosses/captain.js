// Influencer Militia Captain (MVP)
// Phase 1: mid-range standoff, strafes; volley cone and ad-zone pops
// Phase 2 (<=60% HP): calls in Ad Zeppelin; Captain becomes shielded (invuln) until pods destroyed

import { ZeppelinSupport } from './zeppelin.js';
import {
  createCaptainVisual,
  createCaptainVolleyBoltVisual,
  createCaptainZoneVisual
} from './visual-cache.js';
import { ReusablePool } from './reusable-pool.js';

export class Captain {
  constructor({ THREE, mats, spawnPos, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    // Visual: use asset pack model for the Captain
    const { root, head, refs } = createCaptainVisual({ THREE, mats });
    root.position.copy(spawnPos);
    this.maxHp = 3500;
    root.userData = {
      type: 'boss_captain',
      head,
      hp: this.maxHp,
      maxHp: this.maxHp,
      phaseLabel: 'Sponsored Volley'
    };
    this.root = root;
    this._assetRefs = refs; // muzzle, shieldAnchor, volleyHardpoints, etc.

    // Movement tuning (standoff 12–18u, engage 24–36u)
    this.speed = 2.3;
    this.preferredRange = { min: 14, max: 23 };
    this.strafeDir = this.rng() < 0.5 ? 1 : -1;
    this.switchCooldown = 0;
    this._yaw = 0;

    // Attacks
    this.volleyCooldown = 0.0;
    this.baseVolleyCadence = 2.8; // between volleys when idle
    this.telegraphTime = 0.0; // for volley windup
    this.telegraphRequired = 0.6; // 0.6s windup
    this._aimLine = null; // aim telegraph during windup
    this._raycaster = new THREE.Raycaster();

    // Active volley burst state
    this._burstActive = false;
    this._burstShotsLeft = 0;
    this._burstTimer = 0;
    this._burstSpacing = 0.12;
    this._burstBaseDir = new THREE.Vector3(1,0,0);
    this._muzzleFlashTimer = 0;
    this._volleyProjectiles = [];
    this._boltPool = new ReusablePool({
      preallocate: 10,
      create: () => createCaptainVolleyBoltVisual({ THREE }),
      reset: bolt => {
        bolt.root.visible = true;
        bolt.root.scale.set(1, 1, 1);
      },
      release: (bolt, scene) => {
        scene?.remove(bolt.root);
        bolt.root.visible = false;
      }
    });

    // Ad zones
    this.zones = []; // { mesh, timer, center, delay }
    this._zonePool = new ReusablePool({
      preallocate: 3,
      create: () => createCaptainZoneVisual({ THREE }),
      reset: marker => {
        marker.root.visible = true;
        marker.root.userData = { life: 0 };
        if (marker.refs?.ring?.material) marker.refs.ring.material.opacity = 0.9;
        if (marker.refs?.disk?.material) marker.refs.disk.material.opacity = 0.18;
        marker.refs?.ring?.scale?.set?.(1.35, 1.35, 1.35);
        marker.refs?.disk?.scale?.set?.(1, 1, 1);
        marker.refs?.pylon?.scale?.set?.(1, 1, 1);
      },
      release: (marker, scene) => { scene?.remove(marker.root); marker.root.visible = false; },
      destroy: marker => marker.refs?.ring?.material?.dispose?.()
    });
    this.zoneCooldown = 5.5 + this.rng() * 1.5; // cadence for marking

    // Phase/Shield
    this.invuln = false; // becomes true during zeppelin pods alive
    this.phase = 1;
    this._shieldHpFloor = null;
    this._zeppelin = null;
    this._notifyDeath = null; // set by BossManager
  }

  // --- Movement ---
  _updateMovement(dt, ctx){
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    const facing = toPlayer.clone().setY(0);
    if (facing.lengthSq() > 0) {
      const desiredYaw = Math.atan2(facing.x, facing.z);
      let yawDelta = desiredYaw - this._yaw;
      yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
      this._yaw += Math.max(-7 * dt, Math.min(7 * dt, yawDelta));
      e.rotation.y = this._yaw;
    }

    const desired = new THREE.Vector3();
    if (dist < this.preferredRange.min) {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize().multiplyScalar(-1));
    } else if (dist > this.preferredRange.max) {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) desired.add(toPlayer.normalize());
    } else {
      toPlayer.y = 0; if (toPlayer.lengthSq() > 0) {
        const fwd = toPlayer.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafeDir);
        desired.add(side);
        if (this.switchCooldown > 0) this.switchCooldown -= dt; else if (this.rng() < 0.01) { this.strafeDir *= -1; this.switchCooldown = 1.0; }
      }
    }

    const hasLOS = this._hasLineOfSight(e.position, playerPos, ctx.objects);
    if (!hasLOS && ctx.pathfind) {
      ctx.pathfind.recomputeIfStale(this, playerPos);
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) desired.copy(dir.normalize());
      }
    } else if (hasLOS && ctx.pathfind) {
      ctx.pathfind.clear(this);
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
    // simple aim line to player
    const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
    this._updateAimLine(targetPos, ctx.scene, 0xf59e0b);
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'captain_volley', telegraphSeconds: this.telegraphRequired
    });
  }

  _tickVolley(dt, ctx){
    if (this._burstActive){
      this._burstTimer -= dt;
      if (this._burstTimer <= 0 && this._burstShotsLeft > 0){
        const totalShots = this._burstTotalShots;
        const shotIndex = totalShots - this._burstShotsLeft;
        // fan ±10–16° across shots centered at base dir
        const halfFan = (Math.PI/180) * (10 + this.rng()*6);
        const t = (totalShots===1) ? 0 : (shotIndex/(totalShots-1))*2 - 1; // -1..1
        const angle = t * halfFan;
        const dir = this._rotateY(this._burstBaseDir, angle);
        this._fireVolleyBolt(dir, ctx);
        this._burstShotsLeft--;
        this._burstTimer = this._burstSpacing;
      }
      if (this._burstShotsLeft <= 0){
        this._burstActive = false;
        this.volleyCooldown = this.baseVolleyCadence + this.rng()*0.6;
      }
      return;
    }

    if (this.telegraphTime > 0){
      this.telegraphTime += dt;
      // keep aim line updated toward player
      const targetPos = ctx.player.position.clone(); targetPos.y = 1.6;
      this._updateAimLine(targetPos, ctx.scene, 0xf59e0b);
      if (this.telegraphTime >= this.telegraphRequired){
        // start burst
        const forward = ctx.player.position.clone().sub(this.root.position); forward.y = 0; if (forward.lengthSq()===0) forward.set(1,0,0); forward.normalize();
        this._burstBaseDir.copy(forward);
        this._burstTotalShots = 3 + (this.rng()*3 | 0); // 3–5
        this._burstShotsLeft = this._burstTotalShots;
        this._burstTimer = 0; // fire first immediately
        this._burstActive = true;
        this.telegraphTime = 0;
        this._setHeadGlow(false);
        this._updateAimLine(null, ctx.scene);
      }
      return;
    }

    if (this.volleyCooldown > 0) this.volleyCooldown -= dt;
    if (this.volleyCooldown <= 0){ this._beginVolleyWindup(ctx); }
  }

  _fireVolleyBolt(dir, ctx){
    const THREE = this.THREE;
    const origin = this._assetRefs?.muzzle?.getWorldPosition?.(new THREE.Vector3())
      || new THREE.Vector3(this.root.position.x, this.root.position.y + 1.5, this.root.position.z);
    const playerChest = ctx.player.position.clone();
    playerChest.y += 0.75;
    const tacticalLine = ctx.tacticalLineClear?.(this.root, origin, playerChest, 0.12);
    if (tacticalLine && !tacticalLine.clear) {
      ctx.emitAIEvent?.(this.root, 'shot_withheld', {
        ability: 'captain_volley', kind: 'captain_volley', origin: origin.clone(),
        worldClear: tacticalLine.worldClear, blockerRoot: tacticalLine.blockerRoot || null,
        blockedBy: tacticalLine.worldClear ? 'ally' : 'world'
      });
      return false;
    }
    const centerAim = ctx.player.position.clone().sub(this.root.position).setY(0);
    if (centerAim.lengthSq() === 0) centerAim.set(0, 0, 1);
    centerAim.normalize();
    const muzzleAim = playerChest.clone().sub(origin).setY(0);
    if (muzzleAim.lengthSq() === 0) muzzleAim.copy(centerAim);
    muzzleAim.normalize();
    const centerYaw = Math.atan2(centerAim.x, centerAim.z);
    const requestedYaw = Math.atan2(dir.x, dir.z);
    let fanOffset = requestedYaw - centerYaw;
    fanOffset = ((fanOffset + Math.PI) % (Math.PI * 2)) - Math.PI;
    const muzzleYaw = Math.atan2(muzzleAim.x, muzzleAim.z) + fanOffset;
    const horizontalDirection = new THREE.Vector3(Math.sin(muzzleYaw), 0, Math.cos(muzzleYaw));
    const horizontalDistance = Math.max(0.1, Math.hypot(
      playerChest.x - origin.x,
      playerChest.z - origin.z
    ));
    const velocityDirection = new THREE.Vector3(
      horizontalDirection.x,
      (playerChest.y - origin.y) / horizontalDistance,
      horizontalDirection.z
    ).normalize();
    const bolt = this._boltPool.acquire();
    bolt.root.position.copy(origin);
    bolt.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocityDirection);
    ctx.scene.add(bolt.root);
    this._volleyProjectiles.push({
      bolt,
      velocity: velocityDirection.multiplyScalar(26),
      life: 0,
      maxLife: 1.4,
      damage: 14
    });
    this._muzzleFlashTimer = 0.08;
    if (this._assetRefs?.muzzle) this._assetRefs.muzzle.scale.setScalar(1.9);
    ctx.emitAIEvent?.(this.root, 'projectile_fired', {
      ability: 'captain_volley', kind: 'captain_volley', origin: origin.clone(), target: playerChest.clone()
    });
    return true;
  }

  _updateVolleyProjectiles(dt, ctx) {
    const playerChest = ctx.player.position.clone();
    playerChest.y += 0.75;
    for (let i = this._volleyProjectiles.length - 1; i >= 0; i--) {
      const projectile = this._volleyProjectiles[i];
      const previous = projectile.bolt.root.position.clone();
      const step = projectile.velocity.clone().multiplyScalar(dt);
      const next = previous.clone().add(step);
      const segment = new this.THREE.Line3(previous, next);
      const closest = segment.closestPointToPoint(
        playerChest,
        true,
        new this.THREE.Vector3()
      );
      const distance = step.length();
      let worldHit = null;
      if (distance > 0) {
        this._raycaster.set(previous, step.clone().normalize());
        this._raycaster.far = distance;
        worldHit = this._raycaster.intersectObjects(ctx.objects || [], false)[0] || null;
      }
      const playerHitDistance = segment.closestPointToPointParameter(playerChest, true) * distance;
      const hitsPlayer = closest.distanceToSquared(playerChest) <= 0.62 * 0.62
        && (!worldHit || playerHitDistance < worldHit.distance);
      if (hitsPlayer) {
        if (ctx.damagePlayer) {
          ctx.damagePlayer(projectile.damage, {
            sourceKind: 'captain_volley',
            sourceRoot: this.root,
            ownerRoot: this.root,
            sourceOrigin: previous.clone()
          });
        } else {
          ctx.onPlayerDamage?.(projectile.damage, 'captain_volley', {
            sourceKind: 'captain_volley', sourceRoot: this.root, ownerRoot: this.root, sourceOrigin: previous.clone()
          });
        }
        try { globalThis.window?._EFFECTS?.spawnBulletImpact?.(closest, projectile.velocity.clone().normalize().negate()); } catch {}
        this._releaseVolleyProjectile(i, ctx.scene);
        continue;
      }
      if (worldHit) {
        ctx.emitAIEvent?.(this.root, 'projectile_blocked_by_world', {
          ability: 'captain_volley', kind: 'captain_volley', origin: previous.clone(), impact: worldHit.point?.clone?.()
        });
        try { globalThis.window?._EFFECTS?.spawnBulletImpact?.(worldHit.point.clone(), worldHit.face?.normal?.clone?.()); } catch {}
        this._releaseVolleyProjectile(i, ctx.scene);
        continue;
      }
      projectile.bolt.root.position.copy(next);
      projectile.life += dt;
      if (projectile.life >= projectile.maxLife) this._releaseVolleyProjectile(i, ctx.scene);
    }
  }

  _releaseVolleyProjectile(index, scene) {
    const [projectile] = this._volleyProjectiles.splice(index, 1);
    if (projectile) this._boltPool.release(projectile.bolt, scene);
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

  _updateAimLine(targetPos, scene, color = 0xf59e0b){
    const THREE = this.THREE;
    if (!targetPos){ if (this._aimLine){ scene.remove(this._aimLine); this._aimLine.visible = false; } return; }
    let from;
    const head = this.root.userData?.head;
    if (head && typeof head.getWorldPosition === 'function'){
      from = head.getWorldPosition(new THREE.Vector3());
    } else {
      from = new THREE.Vector3(this.root.position.x, this.root.position.y + 1.6, this.root.position.z);
    }
    if (!this._aimLine){
      const g = new THREE.BufferGeometry().setFromPoints([from, targetPos]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
      this._aimLine = new THREE.Line(g, m); scene.add(this._aimLine);
    } else {
      this._aimLine.visible = true;
      if (this._aimLine.parent !== scene) scene.add(this._aimLine);
      const pos = this._aimLine.geometry.getAttribute('position');
      pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, targetPos.x, targetPos.y, targetPos.z); pos.needsUpdate = true;
    }
  }

  // --- Ad Zones ---
  _maybeMarkZones(dt, ctx){
    if (this.zoneCooldown > 0){ this.zoneCooldown -= dt; return; }
    // pick 2–3 positions around player (6–10u)
    const THREE = this.THREE;
    const count = 2 + (this.rng() < 0.5 ? 0 : 1);
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++){
      const ang = this.rng() * Math.PI * 2;
      const r = 6 + this.rng()*4;
      const p = new THREE.Vector3(playerPos.x + Math.cos(ang)*r, 0.06, playerPos.z + Math.sin(ang)*r);
      // Adjust to safe spot if blocked
      const safe = (typeof this.enemyManager._isSpawnAreaClear === 'function' && this.enemyManager._isSpawnAreaClear(p.clone().setY(0.8), 0.5));
      const center = safe ? p : playerPos.clone(); center.y = 0.06;
      const marker = this._zonePool.acquire();
      marker.root.position.copy(center);
      marker.root.userData = { life: 0 };
      ctx.scene.add(marker.root);
      this.zones.push({ marker, mesh: marker.root, timer: 0, center: center.clone(), delay: 1.35, refs: marker.refs });
    }
    this.zoneCooldown = 6.5 + this.rng()*2.0;
  }

  _updateZones(dt, ctx){
    for (let i = this.zones.length - 1; i >= 0; i--){
      const z = this.zones[i]; z.timer += dt; z.mesh.userData.life = (z.mesh.userData.life||0) + dt;
      const progress = Math.min(1, z.timer / z.delay);
      // pulse elements: ring opacity and pylon scale
      const ring = z.refs?.ring, disk = z.refs?.disk, pylon = z.refs?.pylon;
      if (ring && ring.material && ring.material.opacity != null){
        ring.material.opacity = 0.68 + progress * 0.3;
        const countdown = 1.35 - progress * 0.35;
        ring.scale.set(countdown, countdown, countdown);
      }
      if (disk?.material) disk.material.opacity = 0.14 + progress * 0.34;
      if (pylon){
        const s = 1.0 + Math.sin((z.mesh.userData.life||0) * (12 + progress * 12)) * (0.12 + progress * 0.15);
        pylon.scale.set(1, s, 1);
      }
      if (z.timer >= z.delay){
        // pop: damage if player inside radius 2.2
        const dx = ctx.player.position.x - z.center.x;
        const dz = ctx.player.position.z - z.center.z;
        if (dx*dx + dz*dz <= 2.2*2.2){
          if (ctx.damagePlayer) {
            ctx.damagePlayer(18, {
              sourceKind: 'captain_ad_zone',
              sourceRoot: this.root,
              ownerRoot: this.root
            });
          } else {
            ctx.onPlayerDamage?.(18, 'captain_ad_zone');
          }
        }
        ctx.emitAIEvent?.(this.root, 'ad_zone_detonated', { center: z.center.clone(), radius: 2.2 });
        try { globalThis.window?._EFFECTS?.ring?.(z.center.clone(), 2.2, 0xfb7185); } catch {}
        this._zonePool.release(z.marker, ctx.scene);
        this.zones.splice(i,1);
      }
    }
  }

  // --- Zeppelin phase ---
  _maybeSummonZeppelin(ctx){
    const hp = this.root.userData.hp;
    if (this._zeppelin || hp <= 0) return;
    if (hp <= this.maxHp * 0.6){
      this.phase = 2;
      this.invuln = true;
      this._shieldHpFloor = hp;
      this.root.userData.phaseLabel = 'Zeppelin Shield · 3 pods';
      if (this._assetRefs?.shield) this._assetRefs.shield.visible = true;
      try { globalThis.window?._EFFECTS?.ring?.(this.root.position.clone(), 2.4, 0x22e3ef); } catch {}
      // Spawn zeppelin which drops pods; lift shield when pods cleared
      this._zeppelin = new ZeppelinSupport({
        THREE: this.THREE,
        mats: this.mats,
        enemyManager: this.enemyManager,
        scene: ctx.scene,
        onPodsChanged: remaining => {
          this.root.userData.phaseLabel = `Zeppelin Shield · ${remaining} pod${remaining === 1 ? '' : 's'}`;
        },
        onPodsCleared: () => {
          this.invuln = false;
          this._shieldHpFloor = null;
          this.root.userData.phaseLabel = 'Sponsor Down';
          if (this._assetRefs?.shield) this._assetRefs.shield.visible = false;
          try { globalThis.window?._EFFECTS?.ring?.(this.root.position.clone(), 2.8, 0xff2ea6); } catch {}
        },
        rng: this.rng
      });
    }
  }

  _updateShieldVisual(dt) {
    const shield = this._assetRefs?.shield;
    if (!shield || !shield.visible) return;
    shield.rotation.y += dt * 1.8;
    shield.rotation.z -= dt * 0.7;
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.035;
    shield.scale.setScalar(pulse);
  }

  // --- Lifecycle ---
  update(dt, ctx){
    // Shield behavior: restore HP back up if reduced while invuln (coarse armor)
    if (this.invuln && Number.isFinite(this._shieldHpFloor)) {
      this.root.userData.hp = Math.max(this.root.userData.hp, this._shieldHpFloor);
    }

    if (this._muzzleFlashTimer > 0) {
      this._muzzleFlashTimer = Math.max(0, this._muzzleFlashTimer - dt);
      if (this._muzzleFlashTimer === 0 && this._assetRefs?.muzzle) this._assetRefs.muzzle.scale.setScalar(1);
    }
    this._updateShieldVisual(dt);

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    this._tickVolley(dt, ctx);
    this._updateVolleyProjectiles(dt, ctx);
    this._maybeMarkZones(dt, ctx);
    this._updateZones(dt, ctx);

    // Phase transition
    this._maybeSummonZeppelin(ctx);
    if (this._zeppelin){ this._zeppelin.update(dt, ctx); }

    // Cleanup visuals on death
    if (this.root.userData.hp <= 0){
      if (this._aimLine){ ctx.scene.remove(this._aimLine); this._aimLine.visible = false; }
      while (this._volleyProjectiles.length) this._releaseVolleyProjectile(this._volleyProjectiles.length - 1, ctx.scene);
      for (const z of this.zones) this._zonePool.release(z.marker, ctx.scene);
      this.zones.length = 0;
      if (this._zeppelin){ this._zeppelin.cleanup(); this._zeppelin = null; }
    }
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

  onRemoved(scene){
    if (this._aimLine){
      scene.remove(this._aimLine);
      this._aimLine.geometry?.dispose?.();
      this._aimLine.material?.dispose?.();
      this._aimLine = null;
    }
    for (const z of this.zones) this._zonePool.release(z.marker, scene);
    this.zones.length = 0;
    this._zonePool.destroy(scene);
    while (this._volleyProjectiles.length) this._releaseVolleyProjectile(this._volleyProjectiles.length - 1, scene);
    this._boltPool.destroy(scene);
    if (this._zeppelin){ this._zeppelin.cleanup(); this._zeppelin = null; }
  }
}


