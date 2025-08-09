// Goo puddle hazard with telegraph, slow, and shoot-to-clear
// Usage: const g = new GooPuddle({ THREE, mats, position, enemyManager }); scene.add(g.root); then call g.update(dt, ctx, lastPlayerPos)

export class GooPuddle {
  constructor({ THREE, mats, position, enemyManager = null, radius = 2.2, telegraphTime = 0.4, lifeMin = 18, lifeMax = 24 }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.radius = radius;
    this.telegraphRequired = telegraphTime;
    this.lifeTotal = lifeMin + Math.random() * Math.max(0.0001, (lifeMax - lifeMin));
    this.lifeRemaining = this.lifeTotal;
    // 4–6 body shots to clear
    this.requiredShots = 4 + (Math.random() * 3 | 0);
    this.shotsTaken = 0;
    this.active = false; // becomes true after telegraph
    this._telegraphTime = 0;
    this._expired = false;
    this._lastSlowAppliedFrame = -1;

    // Root group
    this.root = new THREE.Group();
    // Force ground placement (floor top is y≈0)
    this.root.position.set(position.x, 0.0, position.z);
    this.root.userData = { type: 'hazard_goo' };

    // Telegraph ring (faint)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x77ffcc, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius * 0.82, this.radius * 1.05, 32), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
    ring.userData.kind = 'telegraph';
    this.root.add(ring);
    this.telegraph = ring;

    // Puddle disc (hidden until active)
    const discMat = new THREE.MeshBasicMaterial({ color: 0x44ccaa, transparent: true, opacity: 0.0 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(this.radius, 28), discMat);
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
    disc.userData.kind = 'puddle_disc';
    this.root.add(disc);
    this.disc = disc;

    // Emissive pulse helper
    this._pulse = 0;
  }

  // Static: capture click shots to process next update (decoupled from main loop)
  static _installGlobalShotListener() {
    if (GooPuddle._installed) return;
    GooPuddle._installed = true;
    GooPuddle._shotFlag = false;
    window.addEventListener('mousedown', () => {
      // Only when pointer is locked (game active)
      if (document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement) {
        GooPuddle._shotFlag = true;
      }
    });
  }

  get expired() { return this._expired; }

  // Update visual, handle activation, decay, slow and shot interactions
  update(dt, ctx, lastPlayerPos, frameIndex = 0) {
    const THREE = this.THREE;
    if (this._expired) return;

    GooPuddle._installGlobalShotListener();

    // Telegraph activate
    if (!this.active) {
      this._telegraphTime += dt;
      // pulse ring
      if (this.telegraph) {
        const t = this._telegraphTime;
        const s = 1 + Math.sin(t * 18) * 0.06;
        this.telegraph.scale.set(s, s, s);
        const m = this.telegraph.material;
        if (m && m.opacity !== undefined) m.opacity = Math.max(0.15, 0.6 - t * 0.5);
      }
      if (this._telegraphTime >= this.telegraphRequired) {
        this.active = true;
        if (this.telegraph && this.telegraph.parent) this.telegraph.parent.remove(this.telegraph);
        if (this.disc && this.disc.material) this.disc.material.opacity = 0.75;
      } else {
        return; // not active yet
      }
    }

    // Decay visual (slight shrink + fade near end)
    this.lifeRemaining = Math.max(0, this.lifeRemaining - dt);
    const lifePct = this.lifeRemaining / Math.max(0.0001, this.lifeTotal);
    if (this.disc && this.disc.material) {
      const fade = lifePct < 0.4 ? THREE.MathUtils.mapLinear(lifePct, 0.0, 0.4, 0.0, 0.75) : 0.75;
      this.disc.material.opacity = Math.max(0.08, Math.min(0.9, fade));
      const scale = lifePct < 0.3 ? THREE.MathUtils.mapLinear(lifePct, 0.0, 0.3, 0.8, 1.0) : 1.0;
      this.disc.scale.setScalar(scale);
    }

    // Apply slow to player (reduce displacement by ~30%) at most once per frame
    if (lastPlayerPos && this._lastSlowAppliedFrame !== frameIndex) {
      const p = ctx.player;
      const now = p.position;
      const dx = now.x - this.root.position.x;
      const dz = now.z - this.root.position.z;
      if (dx*dx + dz*dz <= this.radius * this.radius) {
        const mvx = now.x - lastPlayerPos.x;
        const mvz = now.z - lastPlayerPos.z;
        now.x = lastPlayerPos.x + mvx * 0.7;
        now.z = lastPlayerPos.z + mvz * 0.7;
        this._lastSlowAppliedFrame = frameIndex;
      }
    }

    // Optional: apply light slow to enemies (~15%) if enemyManager is available
    if (this.enemyManager && this.enemyManager.enemies && this.enemyManager.enemies.size) {
      for (const e of this.enemyManager.enemies) {
        if (!e || e === ctx.player || !e.position) continue;
        // Skip airborne/flying enemies to avoid pathing issues
        const t = (e.userData && e.userData.type) ? String(e.userData.type) : '';
        if (t.includes('flyer') || e.position.y > 1.2) continue;
        const dx = e.position.x - this.root.position.x;
        const dz = e.position.z - this.root.position.z;
        if (dx*dx + dz*dz <= this.radius * this.radius) {
          // Nudge backward a bit along radial from center to simulate viscosity
          const d = Math.max(0.0001, Math.sqrt(dx*dx + dz*dz));
          const k = (this.radius - d) / this.radius; // stronger at center
          const strength = 0.06; // gentler so AI doesn't get stuck
          e.position.x -= (dx / d) * strength * k;
          e.position.z -= (dz / d) * strength * k;
        }
      }
    }

    // Process pending shots: ray-plane intersection at y≈0, reduce lifetime if within radius
    if (GooPuddle._shotFlag) {
      // consume single shot per frame; prevents backlog during pause
      if (this._rayHitsThisPuddle(ctx)) this._onShot();
      GooPuddle._shotFlag = false;
    }

    if (this.lifeRemaining <= 0) {
      this._expire(ctx.scene);
    }
  }

  _rayHitsThisPuddle(ctx) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(ctx.player.position.x, 1.5, ctx.player.position.z);
    // derive forward from player object orientation (controls getObject)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.player.quaternion).normalize();
    if (Math.abs(fwd.y) < 1e-3) return false;
    const t = (0.0 - origin.y) / fwd.y; // ground plane at y=0
    if (t <= 0) return false;
    const hit = origin.clone().add(fwd.multiplyScalar(t));
    const dx = hit.x - this.root.position.x;
    const dz = hit.z - this.root.position.z;
    const r = this.radius * 1.02; // small tolerance
    return (dx*dx + dz*dz) <= r * r;
  }

  _onShot() {
    // reduce remaining life proportional to required shots
    if (!this.active || this._expired) return;
    this.shotsTaken++;
    const delta = this.lifeTotal / Math.max(1, this.requiredShots);
    this.lifeRemaining = Math.max(0, this.lifeRemaining - delta);
    // pulse visual
    this._pulse = 1.0;
    if (this.disc && this.disc.material) {
      const m = this.disc.material; m.opacity = Math.min(0.95, (m.opacity || 0.7) + 0.12);
    }
  }

  _expire(scene) {
    if (this._expired) return;
    this._expired = true;
    if (this.root && scene && this.root.parent === scene) scene.remove(this.root);
  }

  dispose(scene) {
    this._expire(scene);
  }
}


