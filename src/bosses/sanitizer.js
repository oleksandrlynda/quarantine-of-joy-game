// Commissioner Sanitizer (MVP)
// Armored boss until 3 suppression nodes are destroyed

import { SuppressionNodes } from './nodes.js';

export class Sanitizer {
  constructor({ THREE, mats, spawnPos, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;

    // Visual: armored chassis with head
    const base = mats.enemy.clone(); base.color = new THREE.Color(0x0ea5e9); // cyan-ish boss
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), base);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mats.head.clone());
    head.position.y = 2.0; body.add(head);
    body.position.copy(spawnPos);

    body.userData = { type: 'boss_sanitizer', head, hp: 1600 };
    this.root = body;

    // Core state
    this.invuln = true; // armored until nodes destroyed
    this.speed = 1.8;
    this._raycaster = new THREE.Raycaster();
    this._notifyDeath = null; // set by BossManager

    // Attacks timing
    this._beamCd = 3 + Math.random() * 2; // first beam soon after spawn
    this._beamState = 'idle';
    this._beamTimer = 0;
    this._beamDir = new THREE.Vector3(1, 0, 0);
    this._beamAngularSpeed = 0; // rad/s during sweep
    this._beamHalfAngle = Math.PI / 12; // beam thickness cone half-angle (~15deg)
    this._telegraph = null;
    this._beamLen = 18; // visible and damaging length
    this._beamMesh = null;

    this._pulseCd = 2.8; // close-range defensive pulse

    // Nodes around arena center (more discoverable)
    const arenaCenter = new THREE.Vector3(0, 0.8, 0);
    this.nodes = new SuppressionNodes({ THREE, mats, center: arenaCenter, enemyManager });
    this.nodes.addToSceneAndRegister(enemyManager.scene); // registers via manager and adds visuals to scene

    this.enemyManager = enemyManager;
  }

  onRemoved(scene) {
    if (this.nodes) this.nodes.cleanup(scene);
    if (this._beamMesh && scene) { scene.remove(this._beamMesh); this._beamMesh = null; }
  }

  // Helper: simple boss locomotion towards player with gentle orbit
  _updateMovement(dt, ctx) {
    const e = this.root;
    const toPlayer = ctx.player.position.clone().sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    const desired = new this.THREE.Vector3();
    if (dist > 10) desired.add(toPlayer);
    else {
      const side = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      desired.add(side.multiplyScalar(0.7));
    }
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }
  }

  // Telegraph (0.8s) then sweep (1.8s)
  _updateBeam(dt, ctx) {
    if (this._beamState === 'idle') return;
    this._beamTimer += dt;

    if (this._beamState === 'windup') {
      // Update telegraph visual
      if (this._telegraph) {
        this._telegraph.userData.life += dt;
        const life = this._telegraph.userData.life;
        const scale = 0.5 + life * 1.2;
        this._telegraph.scale.set(scale, 1, scale);
        if (this._telegraph.material && this._telegraph.material.opacity !== undefined) {
          this._telegraph.material.opacity = Math.max(0.15, 0.9 - life * 0.8);
        }
      }
      if (this._beamTimer >= 0.8) {
        // begin sweep from left to right across player's current bearing
        this._beamState = 'sweep';
        this._beamTimer = 0;
        const forward = ctx.player.position.clone().sub(this.root.position); forward.y = 0; forward.normalize();
        // start dir rotated -30deg, sweep to +30deg over 1.8s
        const base = forward;
        const start = this._rotateY(base, -Math.PI / 6);
        this._beamDir.copy(start);
        this._beamAngularSpeed = (Math.PI / 3) / 1.8; // total 60deg over 1.8s
        // remove telegraph
        if (this._telegraph) { ctx.scene.remove(this._telegraph); this._telegraph = null; }
        // spawn beam visual
        this._ensureBeamMesh(ctx);
        this._updateBeamMeshTransform();
      }
      return;
    }

    if (this._beamState === 'sweep') {
      const ang = this._beamAngularSpeed * dt;
      this._beamDir.copy(this._rotateY(this._beamDir, ang));
      this._updateBeamMeshTransform();
      // Damage check against player capsule
      this._applyBeamDamage(dt, ctx);
      if (this._beamTimer >= 1.8) {
        this._beamState = 'idle';
        this._beamTimer = 0;
        this._beamCd = 5 + Math.random() * 2; // next cadence 5–7s
        // remove beam visual
        this._removeBeamMesh(ctx);
      }
      return;
    }
  }

  _beginBeamTelegraph(ctx) {
    this._beamState = 'windup';
    this._beamTimer = 0;
    // Create a small ground ring in front of the boss as telegraph
    const THREE = this.THREE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.root.position.x, 0.06, this.root.position.z);
    ring.userData = { life: 0 };
    ctx.scene.add(ring);
    this._telegraph = ring;
  }

  _applyBeamDamage(dt, ctx) {
    // Treat beam as an angular sector from boss position; player gets hit if within small angle of current beam dir and within range
    const origin = this.root.position;
    const toPlayer = ctx.player.position.clone().sub(origin);
    const dist = toPlayer.length(); if (dist > this._beamLen) return;
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();
    const cos = this._beamDir.dot(toPlayer);
    const half = this._beamHalfAngle;
    const cosHalf = Math.cos(half);
    if (cos >= cosHalf) {
      // player within beam arc
      const dps = 15; // ~15 per second
      ctx.onPlayerDamage(dps * dt);
    }
  }

  _maybePulse(dt, ctx) {
    if (this._pulseCd > 0) { this._pulseCd -= dt; return; }
    const e = this.root;
    const toPlayer = ctx.player.position.clone().sub(e.position);
    toPlayer.y = 0; const d2 = toPlayer.lengthSq();
    const radius = 4.0;
    if (d2 <= radius * radius) {
      // Apply small damage + knockback
      ctx.onPlayerDamage(10);
      const dir = toPlayer.normalize();
      // Nudge player object directly a bit (simple knockback)
      const o = ctx.player;
      o.position.add(dir.multiplyScalar(radius * 0.35));
      this._pulseCd = 3.5 + Math.random() * 1.0;
    } else {
      // keep checking frequently if close
      this._pulseCd = 0.1;
    }
  }

  _rotateY(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new this.THREE.Vector3(v.x * c - v.z * s, 0, v.x * s + v.z * c).normalize();
  }

  _ensureBeamMesh(ctx) {
    if (this._beamMesh) return;
    const THREE = this.THREE;
    const geo = new THREE.CylinderGeometry(0.12, 0.12, this._beamLen, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: 'boss_sanitizer_beam' };
    ctx.scene.add(mesh);
    this._beamMesh = mesh;
  }

  _updateBeamMeshTransform() {
    if (!this._beamMesh) return;
    const origin = this.root.position;
    const dir = this._beamDir.clone().normalize();
    const mid = origin.clone().add(dir.clone().multiplyScalar(this._beamLen * 0.5));
    this._beamMesh.position.set(mid.x, 1.2, mid.z);
    // rotate cylinder axis (Y) to align with dir
    const up = new this.THREE.Vector3(0, 1, 0);
    const q = new this.THREE.Quaternion().setFromUnitVectors(up, new this.THREE.Vector3(dir.x, 0, dir.z).normalize());
    this._beamMesh.setRotationFromQuaternion(q);
  }

  _removeBeamMesh(ctx) {
    if (this._beamMesh) {
      if (ctx && ctx.scene) ctx.scene.remove(this._beamMesh);
      this._beamMesh.geometry.dispose?.();
      this._beamMesh.material.dispose?.();
      this._beamMesh = null;
    }
  }

  update(dt, ctx) {
    // Update node pulse visuals
    if (this.nodes) this.nodes.update(dt, performance.now() * 0.001);

    // Unlock boss armor once all nodes are down
    if (this.invuln && this.nodes && this.nodes.remainingCount() === 0) {
      this.invuln = false;
    }

    // Reduce incoming player gun damage while armored by re-routing via main.js hp updates:
    // We cannot intercept directly there, but we can clamp boss hp back if needed in a coarse way.
    if (this.invuln) {
      // reset hp to max if accidentally reduced by hitscan while armored
      this.root.userData.hp = Math.max(this.root.userData.hp, 1600);
    }

    // Movement
    this._updateMovement(dt, ctx);

    // Attacks
    if (this._beamState === 'idle') {
      if (this._beamCd > 0) this._beamCd -= dt;
      if (this._beamCd <= 0) this._beginBeamTelegraph(ctx);
    }
    this._updateBeam(dt, ctx);
    this._maybePulse(dt, ctx);

    // Death check and cleanup
    if (this.root.userData.hp <= 0) {
      // EnemyManager.remove will be triggered externally by main.js on hp<=0; ensure nodes are cleaned
      if (this.nodes) this.nodes.cleanup(ctx.scene);
      // Clear telegraph if any
      if (this._telegraph) { ctx.scene.remove(this._telegraph); this._telegraph = null; }
      this._removeBeamMesh(ctx);
    }
  }
}


