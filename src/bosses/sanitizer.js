// Commissioner Sanitizer (Enhanced)
// Phases:
//  P1 (armored): 3 Suppression Nodes reduce FOV & regen; beam sweep; knockback pulse; elite shooter calls
//  P2 (armor off): rapid beam bursts; limited turret pods; weakpoint window (head/core vents)
// Hazards: intermittent sizzling tiles with clear safe gaps

import { logError } from '../util/log.js';

import { SuppressionNodes } from './nodes.js';
import { createSanitizerVisual, getBossSharedGeometry } from './visual-cache.js';
import { ReusablePool } from './reusable-pool.js';


export class Sanitizer {
  constructor({ THREE, mats, spawnPos, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    const built = createSanitizerVisual({ THREE, mats });
    built.root.position.copy(spawnPos);
    built.root.userData = { type: 'boss_sanitizer', head: built.head, hp: 4200, damageMul: 1.0 };
    this.root = built.root;
    this.refs = built.refs;
    this.maxHp = built.root.userData.hp;
    this.invuln = true;               // armored until nodes destroyed (phase 1)
    this._lastHp = this.maxHp;
    this.phase = 1;                   // -> 2 when nodes==0
    this.speed = 1.8;
    this._yaw = 0;
    this._moveDelta = new THREE.Vector3();

    // Utility
    this._raycaster = new THREE.Raycaster();

    // Beam (P1 sweep / P2 bursts)
    this._beamCd = 3 + this.rng() * 2;
    this._beamState = 'idle';         // 'idle'|'windup'|'sweep'|'burst'
    this._beamTimer = 0;
    this._beamDir = new THREE.Vector3(1, 0, 0);
    this._beamAngularSpeed = 0;
    this._beamHalfAngle = Math.PI / 12;     // ~15°
    this._beamLen = 18;
    this._telegraph = null;
    this._beamMesh = null;

    // Burst mode (P2)
    this._burstLeft = 0;              // shots left in a burst pack
    this._burstGap = 0.16;            // time between rapid bursts
    this._burstGapTimer = 0;

    // Pulse (both phases)
    this._pulseCd = 3.8;

    // Jump wave attack
    this._jumpCd = 3 + this.rng() * 1.5; // seconds
    this._jumpState = 'idle';
    this._jumpTimer = 0;
    this._jumpDir = new THREE.Vector3(1, 0, 0);
    this._jumpVel = 0;

    // Panic rushers (low HP trigger)
    this._panicRushActive = false;
    this._panicRushTimer = 0;
    this._panicRushWaves = 0;
    this._panicRushDone = false;
    this._panicRoots = new Set();

    // Elite calls (P1)
    this._eliteCd = 9 + this.rng() * 3;
    this._eliteCap = 4;
    this._tankCap = 4;
    this._eliteRoots = new Set();
    this._tankRoots = new Set();

    // Turret pods (P2)
    this._turretCd = 6.5;
    this._turretCap = 3;
    this._turretRoots = new Set();

    // Tiles (both phases; more aggressive in P2)
    this._tileCd = 5.0;
    this._tiles = [];   // {pos,radius,hot,timer,life}
    this._tileCap = 7;
    const tileGeometry = getBossSharedGeometry(THREE, 'sanitizer-tile', () => new THREE.CircleGeometry(1.6, 24));
    this._tilePool = new ReusablePool({
      preallocate: this._tileCap,
      create: () => {
        const mesh = new THREE.Mesh(
          tileGeometry,
          new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.25, depthWrite: false })
        );
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      },
      reset: mesh => { mesh.visible = true; mesh.material.opacity = 0.25; },
      release: (mesh, scene) => { scene?.remove(mesh); mesh.visible = false; },
      destroy: mesh => mesh.material?.dispose?.()
    });

    // Weakpoint window (P2)
    this._weakpointTimer = 0;
    this._setWeakpoint(false);

    // Nodes: register + visuals
    const arenaCenter = new THREE.Vector3(0, 0.8, 0);
    this.nodes = new SuppressionNodes({ THREE, mats, center: arenaCenter, enemyManager, rng: this.rng });
    this.nodes.addToSceneAndRegister(enemyManager.scene);
  }

  // ------------- lifecycle -------------
  onRemoved(scene) {
    if (this.nodes) this.nodes.cleanup(scene);
    if (this._beamMesh) {
      scene?.remove(this._beamMesh);
      this._beamMesh.material?.dispose?.();
      this._beamMesh = null;
    }
    if (this._telegraph) {
      scene?.remove(this._telegraph);
      this._telegraph.material?.dispose?.();
      this._telegraph = null;
    }
    // cleanup spawns/hazards
    if (this.enemyManager) {
      for (const r of Array.from(this._eliteRoots)) if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
      for (const r of Array.from(this._turretRoots)) if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
      for (const r of Array.from(this._panicRoots)) if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
    }
    this._eliteRoots.clear(); this._tankRoots.clear(); this._turretRoots.clear(); this._panicRoots.clear();
    for (const t of this._tiles) this._tilePool.release(t.mesh, scene);
    this._tiles.length = 0;
    this._tilePool.destroy(scene);
  }

  // ------------- frame update -------------
  update(dt, ctx) {
    // Update node visuals
    if (this.nodes) this.nodes.update(dt, performance.now() * 0.001);

    // Suppression effects from surviving nodes (FOV & regen)
    const aliveNodes = this.nodes ? this.nodes.remainingCount() : 0;
    this._applySuppression(ctx, aliveNodes);

    // Phase transition
    if (this.phase === 1 && aliveNodes === 0) {
      this.invuln = false;
      this.phase = 2;
      // quick fanfare: shorter first beam, open weakpoint briefly
      this._beamCd = 0.8;
      this._weakpointTimer = 2.5;
      this._setWeakpoint(true);
      // lessen tiles cadence a bit tighter in P2
      this._tileCd = 3.5;
    }

    // Armor gate: if still invuln, prevent HP from dropping too much (coarse clamp)
    const hp = this.root.userData.hp;
    if (this.invuln && hp < this._lastHp) this.root.userData.hp = Math.max(hp, this._lastHp); // lock until nodes gone
    this._lastHp = this.root.userData.hp;

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    this._updateBeam(dt, ctx);
    this._maybePulse(dt, ctx);
    this._maybeJumpWave(dt, ctx);
    this._maybePanicRushers(dt, ctx);

    // P1: elite shooter calls
    if (this.phase === 1) this._updateEliteCalls(dt, ctx);
    // P2: turret pods + weakpoint timer
    if (this.phase === 2) {
      this._updateTurretPods(dt, ctx);
      this._updateWeakpoint(dt);
    }

    // Tiles (hazards)
    this._updateTiles(dt, ctx);

    // Death cleanup
    if (this.root.userData.hp <= 0) {
      if (this.nodes) this.nodes.cleanup(ctx.scene);
      this.onRemoved(ctx.scene);
    }
  }

  // ------------- suppression knobs -------------
  _applySuppression(ctx, alive) {
    // Each node reduces FOV and regen. With 3 nodes: FOV ~70%, regen 40% of normal.
    const fovScale = [1.0, 0.9, 0.8, 0.7][Math.min(3, alive)];
    const regenMul = [1.0, 0.75, 0.6, 0.4][Math.min(3, alive)];
    // Prefer engine hooks if present; otherwise blackboard fallbacks
    try { ctx.setPlayerFovScale?.(fovScale); } catch (e) { logError(e); }
    ctx.blackboard = ctx.blackboard || {};
    ctx.blackboard.playerFovScale = fovScale;
    ctx.blackboard.playerRegenMul = regenMul;
  }

  // ------------- locomotion -------------
  _updateMovement(dt, ctx) {
    if (this._jumpState && this._jumpState !== 'idle') return;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();
    const desired = new this.THREE.Vector3();
    const side = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    if (dist < 13) desired.addScaledVector(toPlayer, -1.2).addScaledVector(side, 0.25);
    else if (dist > 22) desired.add(toPlayer);
    else desired.addScaledVector(side, 0.7);
    const hasLOS = this._hasLineOfSight(e.position, playerPos, ctx.objects);
    if (!hasLOS && ctx.pathfind) {
      ctx.pathfind.recomputeIfStale(this, playerPos);
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new this.THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) desired.copy(dir.normalize());
      }
    } else if (hasLOS && ctx.pathfind) {
      ctx.pathfind.clear(this);
    }
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      this._moveDelta.copy(e.position);
      ctx.moveWithCollisions(e, step);
      this._moveDelta.subVectors(e.position, this._moveDelta);
      this._moveDelta.y = 0;
    }
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let yawDelta = targetYaw - this._yaw;
    yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this._yaw += Math.max(-4.5 * dt, Math.min(4.5 * dt, yawDelta));
    e.rotation.set(0, this._yaw, 0);
  }

  // ------------- beam logic -------------
  _updateBeam(dt, ctx) {
    // Entry
    if (this._beamState === 'idle') {
      if (this._beamCd > 0) this._beamCd -= dt;
      if (this._beamCd <= 0) {
        // P1: long telegraph, sweep. P2: micro-telegraph, rapid bursts.
        if (this.phase === 1) this._beginBeamTelegraph(ctx, 0.8);
        else this._beginBeamTelegraph(ctx, 0.35, true);
      }
      return;
    }

    // Progress
    this._beamTimer += dt;

    if (this._beamState === 'windup') {
      // Telegraph growth/decay
      if (this._telegraph) {
        this._telegraph.userData.life += dt;
        const life = this._telegraph.userData.life;
        const scale = 0.5 + life * 1.2;
        this._telegraph.scale.set(scale, 1, scale);
        if (this._telegraph.material && this._telegraph.material.opacity !== undefined) {
          this._telegraph.material.opacity = Math.max(0.15, 0.9 - life * 0.8);
        }
      }
      if (this._beamTimer >= this._windupTime) {
        if (this.phase === 1) {
          // begin sweep: ±30° around player's bearing over ~1.8s
          this._beamState = 'sweep';
          this._beamTimer = 0;
          const fwd = ctx.player.position.clone().sub(this.root.position); fwd.y = 0; fwd.normalize();
          const start = this._rotateY(fwd, -Math.PI / 6);
          this._beamDir.copy(start);
          this._beamAngularSpeed = (Math.PI / 3) / 1.8;
          if (this._telegraph) { ctx.scene.remove(this._telegraph); this._telegraph.visible = false; }
          this._ensureBeamMesh(ctx);
          this._updateBeamMeshTransform();
          ctx.emitAIEvent?.(this.root, 'ability_released', { ability: 'sanitizer_beam', kind: 'sweep' });
        } else {
          // P2: set up rapid burst pack
          this._beamState = 'burst';
          this._beamTimer = 0;
          this._burstLeft = 4 + (this.rng() < 0.35 ? 1 : 0); // 4-5 quick shots
          this._burstGapTimer = 0;
          if (this._telegraph) { ctx.scene.remove(this._telegraph); this._telegraph.visible = false; }
          this._ensureBeamMesh(ctx);
          // open weakpoint during bursts
          this._setWeakpoint(true);
          this._weakpointTimer = 2.3;
          ctx.emitAIEvent?.(this.root, 'ability_released', { ability: 'sanitizer_beam', kind: 'burst' });
        }
      }
      return;
    }

    if (this._beamState === 'sweep') {
      const ang = this._beamAngularSpeed * dt;
      this._beamDir.copy(this._rotateY(this._beamDir, ang));
      this._updateBeamMeshTransform();
      this._applyBeamDamage(dt, ctx, 15);
      if (this._beamTimer >= 1.8) {
        this._endBeam(ctx);
        this._beamCd = 5 + this.rng() * 2;
      }
      return;
    }

    if (this._beamState === 'burst') {
      // Fire short, narrow “cleanses” that track player a bit
      this._burstGapTimer -= dt;
      if (this._burstGapTimer <= 0 && this._burstLeft > 0) {
        // re-aim a bit toward player, then fire a 0.2s beam
        const toP = ctx.player.position.clone().sub(this.root.position); toP.y = 0;
        if (toP.lengthSq() > 0) toP.normalize();
        // add slight jitter to be dodgeable
        this._beamDir.copy(this._rotateY(toP, (this.rng()-0.5)*0.08));
        this._beamHalfAngle = Math.PI / 18; // tighter (10°)
        this._updateBeamMeshTransform();
        // apply burst damage for 0.2s
        this._applyBeamDamage(0.2, ctx, 22);
        this._burstLeft--;
        this._burstGapTimer = this._burstGap;
      }
      if (this._burstLeft <= 0) {
        this._endBeam(ctx);
        this._beamCd = 2.6 + this.rng() * 0.8; // frequent in P2
        // close weakpoint a bit after
        this._weakpointTimer = Math.max(this._weakpointTimer, 0.6);
      }
      return;
    }
  }

  _beginBeamTelegraph(ctx, windupSeconds, p2Burst = false) {
    this._beamState = 'windup';
    this._beamTimer = 0;
    this._windupTime = windupSeconds;
    // Telegraph ring
    const THREE = this.THREE;
    const ring = this._telegraph || new THREE.Mesh(
      getBossSharedGeometry(THREE, 'sanitizer-telegraph', () => new THREE.RingGeometry(0.8, 1.5, 24)),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.material.color.setHex(p2Burst ? 0x93c5fd : 0x60a5fa);
    ring.material.opacity = 0.8;
    ring.visible = true;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.root.position.x, 0.06, this.root.position.z);
    ring.userData = { life: 0 };
    if (ring.parent !== ctx.scene) ctx.scene.add(ring);
    this._telegraph = ring;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'sanitizer_beam', kind: p2Burst ? 'burst' : 'sweep', telegraphSeconds: windupSeconds
    });
  }

  _applyBeamDamage(dt, ctx, dps) {
    const origin = this.refs?.tip?.getWorldPosition(new this.THREE.Vector3()) || this.root.position.clone();
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.sub(origin);
    const dist = toPlayer.length();
    if (dist > this._beamLen) return;

    // Horizontal angle check
    const flat = toPlayer.clone();
    flat.y = 0;
    if (flat.lengthSq() === 0) return;
    flat.normalize();
    const cos = this._beamDir.dot(flat);
    const cosHalf = Math.cos(this._beamHalfAngle);
    if (cos < cosHalf) return;

    // Raycast to ensure unobstructed line to player
    const dir = toPlayer.clone().normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = ctx.objects ? this._raycaster.intersectObjects(ctx.objects, false) : [];
    if (hits && hits.length > 0) {
      ctx.emitAIEvent?.(this.root, 'beam_blocked_by_world', {
        ability: 'sanitizer_beam', kind: 'beam', origin: origin.clone(), impact: hits[0].point?.clone?.()
      });
      return;
    }

    ctx.onPlayerDamage(dps * dt, 'beam', {
      sourceRoot: this.root, ownerRoot: this.root, sourceOrigin: origin.clone(), sourceKind: 'sanitizer_beam'
    });
  }

  _endBeam(ctx) {
    this._beamState = 'idle';
    this._beamTimer = 0;
    this._removeBeamMesh(ctx);
    this._beamHalfAngle = Math.PI / 12; // reset
  }

  _ensureBeamMesh(ctx) {
    if (this._beamMesh) {
      this._beamMesh.visible = true;
      if (this._beamMesh.parent !== ctx.scene) ctx.scene.add(this._beamMesh);
      return;
    }
    const THREE = this.THREE;
    const geo = getBossSharedGeometry(THREE, 'sanitizer-beam', () => new THREE.CylinderGeometry(0.12, 0.12, this._beamLen, 10, 1, true));
    const mat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: 'boss_sanitizer_beam' };
    ctx.scene.add(mesh);
    this._beamMesh = mesh;
  }

  _updateBeamMeshTransform() {
    if (!this._beamMesh) return;
    const origin = this.refs?.tip?.getWorldPosition(new this.THREE.Vector3()) || this.root.position;
    const dir = this._beamDir.clone().normalize();
    const mid = origin.clone().add(dir.clone().multiplyScalar(this._beamLen * 0.5));
    this._beamMesh.position.set(mid.x, origin.y, mid.z);
    const up = new this.THREE.Vector3(0, 1, 0);
    const q = new this.THREE.Quaternion().setFromUnitVectors(up, new this.THREE.Vector3(dir.x, 0, dir.z).normalize());
    this._beamMesh.setRotationFromQuaternion(q);
  }

  _removeBeamMesh(ctx) {
    if (!this._beamMesh) return;
    ctx.scene?.remove(this._beamMesh);
    this._beamMesh.visible = false;
  }

  // ------------- pulse knockback -------------
  _maybePulse(dt, ctx) {
    if (this._pulseCd > 0) { this._pulseCd -= dt; return; }
    const e = this.root;
    const toPlayer = ctx.player.position.clone().sub(e.position);
    toPlayer.y = 0; const d2 = toPlayer.lengthSq();
    const radius = 4.0;
    if (d2 <= radius * radius) {
      ctx.onPlayerDamage(10, 'pulse', { sourceRoot: this.root, ownerRoot: this.root });
      const dir = toPlayer.normalize();
      ctx.player.position.add(dir.multiplyScalar(radius * 0.35));
      try { window?._EFFECTS?.ring?.(e.position.clone(), radius, 0x93c5fd); } catch (e) { logError(e); }
      this._pulseCd = 3.5 + this.rng() * 1.0;
    } else {
      this._pulseCd = 0.1;
    }
  }

  // ------------- jump shockwave -------------
  _maybeJumpWave(dt, ctx) {
    const e = this.root;
    switch (this._jumpState) {
      case 'idle':
        if (this._jumpCd > 0) { this._jumpCd -= dt; return; }
        this._jumpDir = ctx.player.position.clone().sub(e.position).setY(0);
        if (this._jumpDir.lengthSq() === 0) this._jumpDir.set(1, 0, 0);
        this._jumpDir.normalize();
        this._jumpState = 'windup';
        this._jumpTimer = 0;
        return;
      case 'windup':
        this._jumpTimer += dt;
        if (this._jumpTimer >= 0.35) {
          this._jumpState = 'air';
          this._jumpTimer = 0;
          this._jumpVel = 7.5; // launch velocity
        }
        return;
      case 'air':
        this._jumpVel -= 20 * dt; // gravity
        e.position.y += this._jumpVel * dt;
        if (e.position.y <= 0.8) {
          e.position.y = 0.8;
          this._jumpState = 'land';
          this._jumpTimer = 0;
          const radius = 7.0;
          const angle = Math.PI / 4; // 45° arc
          try { window?._EFFECTS?.spawnShockwaveArc?.(e.position.clone(), this._jumpDir.clone(), angle, radius, 0xffdd55); } catch (e) { logError(e); }
          const toP = ctx.player.position.clone().sub(e.position); toP.y = 0;
          const dist = toP.length();
          if (dist <= radius) {
            toP.normalize();
            const ang = Math.acos(Math.max(-1, Math.min(1, this._jumpDir.dot(toP))));
            if (ang <= angle * 0.5) ctx.onPlayerDamage(18, 'shockwave', { sourceRoot: this.root, ownerRoot: this.root });
          }
        }
        return;
      case 'land':
        this._jumpTimer += dt;
        if (this._jumpTimer >= 0.5) {
          this._jumpState = 'idle';
          this._jumpCd = 3 + this.rng() * 1.5;
        }
        return;
      default:
        this._jumpState = 'idle';
    }
  }

  // ------------- panic rusher waves -------------
  _maybePanicRushers(dt, ctx) {
    if (!this.enemyManager) return;

    for (const root of Array.from(this._panicRoots)) {
      if (!this.enemyManager.enemies.has(root)) this._panicRoots.delete(root);
    }

    const hpRatio = this.root.userData.hp / this.maxHp;
    if (!this._panicRushActive && !this._panicRushDone && hpRatio < 0.2) {
      this._panicRushActive = true;
      this._panicRushWaves = 3;
      this._panicRushTimer = 0;
    }

    if (!this._panicRushActive) return;

    if (this._panicRushTimer > 0) {
      this._panicRushTimer -= dt;
      return;
    }

    const e = this.root;
    const dir = ctx.player.position.clone().sub(e.position); dir.y = 0;
    const dist = dir.length();
    if (dist === 0) dir.set(1, 0, 0); else dir.normalize();

    const spawns = [];
    if (dist > 3) {
      const base = e.position.clone().add(dir.clone().multiplyScalar(2));
      const perp = new this.THREE.Vector3(-dir.z, 0, dir.x).setLength(0.8);
      spawns.push(base.clone().add(perp.clone().multiplyScalar(-1)).setY(0.8));
      spawns.push(base.clone().setY(0.8));
      spawns.push(base.clone().add(perp).setY(0.8));
    } else {
      const left = this.refs.leftArm?.getWorldPosition(new this.THREE.Vector3()) || e.position.clone();
      const right = this.refs.rightArm?.getWorldPosition(new this.THREE.Vector3()) || e.position.clone();
      const forward = dir.lengthSq() === 0 ? new this.THREE.Vector3(0,0,1) : dir.clone();
      const front = e.position.clone().add(forward.normalize().multiplyScalar(1.5));
      left.y = right.y = front.y = 0.8;
      spawns.push(left, right, front);
    }

    for (const p of spawns) {
      const root = this.enemyManager.spawnAt('rusher', p, { countsTowardAlive: true });
      if (root) {
        root.userData.summonerRoot = this.root;
        root.userData.bossOwnerRoot = this.root;
        root.userData.summonRole = 'panic_rusher';
        this._panicRoots.add(root);
        ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
          ability: 'panic_rush', spawnedRoot: root, ownerRoot: this.root
        });
      }
    }

    this._panicRushWaves--;
    if (this._panicRushWaves > 0) {
      this._panicRushTimer = 2.0;
    } else {
      this._panicRushActive = false;
      this._panicRushDone = true;
    }
  }

  // ------------- elite calls (Phase 1) -------------
  _updateEliteCalls(dt, ctx) {
    // prune
    if (this.enemyManager) {
      for (const r of Array.from(this._eliteRoots)) {
        if (!this.enemyManager.enemies.has(r)) this._eliteRoots.delete(r);
      }
      for (const r of Array.from(this._tankRoots)) {
        if (!this.enemyManager.enemies.has(r)) this._tankRoots.delete(r);
      }
    }
    if (this._eliteCd > 0) { this._eliteCd -= dt; return; }
    if (!this.enemyManager) { this._eliteCd = 2.0; return; }
    if (this._eliteRoots.size >= this._eliteCap) { this._eliteCd = 2.0; return; }

    const count = 1 + (this.rng() < 0.5 ? 1 : 0);
    const spawns = this._spawnOnPerimeter(ctx, count, 16, 19);
    for (const p of spawns) {
      const kind = (this.rng() < 0.5 && this._tankRoots.size < this._tankCap) ? 'tank' : 'shooter';
      const root = this.enemyManager.spawnAt(kind, p, { countsTowardAlive: true });
      if (root) {
        root.userData.summonerRoot = this.root;
        root.userData.bossOwnerRoot = this.root;
        root.userData.summonRole = kind === 'tank' ? 'elite_tank' : 'elite_shooter';
        // small buff so they feel “elite”
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) { inst.summoner = this; inst.speed *= 1.05; inst.cooldownBase = Math.max(0.7, (inst.cooldownBase||1.0)*0.9); }
        this._eliteRoots.add(root);
        if (kind === 'tank') this._tankRoots.add(root);
        ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
          ability: 'elite_call', spawnedRoot: root, ownerRoot: this.root, kind
        });
      }
      if (this._eliteRoots.size >= this._eliteCap) break;
    }
    this._eliteCd = 8 + this.rng() * 3;
  }

  _spawnOnPerimeter(ctx, count, minR = 16, maxR = 20) {
    const THREE = this.THREE;
    const out = [];
    const center = new THREE.Vector3(0, 0.8, 0);
    for (let i=0;i<count;i++){
      const a = this.rng()*Math.PI*2;
      const r = minR + this.rng()*(maxR-minR);
      const p = new THREE.Vector3(center.x + Math.cos(a)*r, 0.8, center.z + Math.sin(a)*r);
      p.x = Math.max(-39, Math.min(39, p.x));
      p.z = Math.max(-39, Math.min(39, p.z));
      out.push(p);
    }
    return out;
  }

  // ------------- turret pods (Phase 2) -------------
  _updateTurretPods(dt, ctx) {
    // prune
    if (this.enemyManager) {
      for (const r of Array.from(this._turretRoots)) {
        if (!this.enemyManager.enemies.has(r)) this.enemyManager.remove(r); // let manager clear; if already gone do nothing
        if (!this.enemyManager.enemies.has(r)) this._turretRoots.delete(r);
      }
    }
    if (this._turretCd > 0) { this._turretCd -= dt; return; }
    if (!this.enemyManager) { this._turretCd = 2.0; return; }
    if (this._turretRoots.size >= this._turretCap) { this._turretCd = 2.0; return; }

    const count = Math.min(1 + (this.rng()<0.4?1:0), this._turretCap - this._turretRoots.size);
    const around = this._spawnOnPerimeter(ctx, count, 10, 14);
    for (const p of around) {
      const root = this.enemyManager.spawnAt('shooter', p, { countsTowardAlive: true });
      if (root) {
        // Preserve the legacy pod's 100 HP budget while giving it the intended
        // ranged behavior instead of the unknown-type Grunt fallback.
        root.userData.hp = 100;
        root.userData.maxHp = 100;
        root.userData.summonerRoot = this.root;
        root.userData.bossOwnerRoot = this.root;
        root.userData.summonRole = 'turret_pod';
        // give lifetime so arena doesn't clog
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.summoner = this;
          inst.speed = Math.min(inst.speed, 0.8);
          inst.maxLife = (inst.maxLife||30) * 1.0; // seconds
        }
        this._turretRoots.add(root);
        ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
          ability: 'turret_pod', spawnedRoot: root, ownerRoot: this.root, kind: 'shooter'
        });
      }
    }
    this._turretCd = 7 + this.rng() * 2.5;
  }

  // ------------- tiles hazard -------------
  _updateTiles(dt, ctx) {
    // update existing
    for (let i=this._tiles.length-1;i>=0;i--){
      const t = this._tiles[i];
      t.timer += dt;
      // toggle hot/cool
      if (t.timer >= t.period) {
        t.timer = 0;
        t.hot = !t.hot;
        if (t.mesh?.material && t.mesh.material.opacity !== undefined) {
          t.mesh.material.opacity = t.hot ? 0.9 : 0.25;
        }
      }
      // damage/slow if standing in hot tile (but leave safe gaps)
      if (t.hot) {
        const dx = ctx.player.position.x - t.pos.x;
        const dz = ctx.player.position.z - t.pos.z;
        if ((dx*dx + dz*dz) <= (t.radius*t.radius)) {
          ctx.onPlayerDamage(6 * dt, 'tile', { sourceRoot: this.root, ownerRoot: this.root });
          ctx.blackboard = ctx.blackboard || {};
          ctx.blackboard.playerSlowMul = Math.min( ctx.blackboard.playerSlowMul||1.0, 0.65 );
        }
      }
      t.life -= dt;
      if (t.life <= 0) {
        this._tilePool.release(t.mesh, ctx.scene);
        this._tiles.splice(i,1);
      }
    }

    // spawn cadence
    if (this._tileCd > 0) { this._tileCd -= dt; return; }
    // stagger pattern: spawn 2-3 rings with visible gaps (skip near player center)
    const toMake = Math.min(3, this._tileCap - this._tiles.length);
    for (let i=0;i<toMake;i++) {
      this._spawnTile(ctx, i);
    }
    this._tileCd = (this.phase===2 ? 3.5 : 5.0) + this.rng()*1.0;
  }

  _spawnTile(ctx, idx) {
    const THREE = this.THREE;
    // choose radius band + angle gap so it's readable
    const bandR = 6 + idx*3 + this.rng()*2;   // move bands outward
    const gapA = this.rng()*Math.PI*2;
    for (let j=0;j<6;j++){ // 6 slices ring; leave one gap
      if (j === 2) continue; // visible safe gap
      const a = gapA + j*(Math.PI/3);
      const pos = new THREE.Vector3(Math.cos(a)*bandR, 0.05, Math.sin(a)*bandR);
      // visual disk
      const r = 1.6;
      const disk = this._tilePool.acquire();
      disk.position.set(pos.x, 0.05, pos.z);
      ctx.scene.add(disk);
      this._tiles.push({
        pos, radius: r, hot: (j%2===0), timer: 0, period: 0.9, life: 10 + this.rng()*4, mesh: disk
      });
      if (this._tiles.length >= this._tileCap) break;
    }
  }

  // ------------- weakpoint (P2) -------------
  _setWeakpoint(open) {
    const head = this.root.userData.head;
    this.root.userData.damageMul = open ? 1.6 : 1.0;
    if (head?.material?.emissive) head.material.emissive.setHex(open ? 0xffffff : 0x60a5fa);
    // Brighten vents during weakpoint windows (Phase 2)
    const vents = this.refs?.vents || [];
    for (const v of vents) {
      if (v?.material && v.material.emissiveIntensity != null) {
        v.material.emissiveIntensity = open ? 1.3 : 0.6;
      }
    }
  }
  _updateWeakpoint(dt) {
    if (this._weakpointTimer > 0) {
      this._weakpointTimer = Math.max(0, this._weakpointTimer - dt);
      if (this._weakpointTimer === 0) this._setWeakpoint(false);
    }
  }

  // ------------- helpers -------------
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

  _rotateY(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new this.THREE.Vector3(v.x * c - v.z * s, 0, v.x * s + v.z * c).normalize();
  }
}
