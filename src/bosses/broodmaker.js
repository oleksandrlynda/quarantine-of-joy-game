import { GooPuddle } from '../hazards/goo.js';

export class Broodmaker {
  constructor({ THREE, mats, spawnPos, enemyManager = null, mode = 'light' }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager; // optional; if provided, enables add spawns
    this.mode = mode === 'heavy' ? 'heavy' : 'light';
    this.enablePhase2 = this.mode === 'heavy';

    const base = mats.enemy.clone(); base.color = new THREE.Color(0x7c3aed); // purple-ish boss
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 2.2), base);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mats.head.clone());
    head.position.y = 2.2; body.add(head);
    body.position.copy(spawnPos);

    const type = this.enablePhase2 ? 'boss_broodmaker_heavy' : 'boss_broodmaker';
    body.userData = { type, head, hp: 1800 };
    this.root = body;

    this.speed = 1.65; // slow move
    this._lastPos = body.position.clone();
    this._stuckTime = 0; this._nudgeCooldown = 0;
    this._raycaster = new THREE.Raycaster();

    this._notifyDeath = null; // set by BossManager

    // Phase/state (only relevant when heavy)
    this.maxHp = body.userData.hp;
    this.phase = 1; // becomes 2 at <=60%
    this._phaseTelegraph = 0; // 0 means idle, >0 counting
    this._phaseTelegraphRequired = 0.8;
    this._phaseTelegraphRing = null;

    // Flyer Brood cadence (heavy only)
    this._flyerCooldown = 6 + Math.random() * 2; // 6–8s
    this._flyerRoots = new Set(); // track for cleanup
    this._flyerCap = 6;

    // Goo puddles (heavy only)
    this._gooCooldown = 10 + Math.random() * 4; // 10–14s
    this._goo = []; // active GooPuddle instances
    this._gooCap = 4;
    this._frameIndex = 0;
    this._lastPlayerPos = null;
  }

  update(dt, ctx) {
    this._frameIndex++;
    const e = this.root;
    const toPlayer = ctx.player.position.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist > 70) return;

    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return; toPlayer.normalize();

    // Maintain some distance: pursue if > 8m, otherwise slow orbit
    const desired = new this.THREE.Vector3();
    if (dist > 9) desired.add(toPlayer);
    else {
      const side = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      desired.add(side.multiplyScalar(0.6));
    }

    // No obstacle avoidance for boss; use world-aware slide from ctx
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }

    if (this.enablePhase2) {
      // Phase transition check
      if (this.phase === 1 && e.userData.hp <= this.maxHp * 0.6) {
        if (this._phaseTelegraph <= 0) this._beginPhaseTelegraph(ctx);
      }

      // Phase telegraph progression
      if (this._phaseTelegraph > 0) {
        this._phaseTelegraph += dt;
        this._updatePhaseTelegraph(dt, ctx);
        if (this._phaseTelegraph >= this._phaseTelegraphRequired) {
          this._endPhaseTelegraph(ctx);
          this.phase = 2;
        }
      }

      // Phase 2 abilities
      if (this.phase === 2) {
        this._updateFlyerBrood(dt, ctx);
        this._updateGoo(dt, ctx);
      }
    }

    // Subtle head pulse to signal threat (different tint in P2 if heavy)
    if (e.userData && e.userData.head && e.userData.head.material) {
      const mat = e.userData.head.material;
      if (mat.emissive) mat.emissive.setHex(this.enablePhase2 && this.phase === 2 ? 0xbb66ff : 0x8844ff);
    }
  }

  onRemoved(scene) {
    if (this.enablePhase2) {
      // Cleanup flyers
      if (this.enemyManager) {
        for (const r of Array.from(this._flyerRoots)) {
          if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
          this._flyerRoots.delete(r);
        }
      }
      // Cleanup goo
      for (const g of this._goo) g.dispose(scene);
      this._goo.length = 0;
      if (this._phaseTelegraphRing) { scene.remove(this._phaseTelegraphRing); this._phaseTelegraphRing = null; }
    }
  }

  // --- Phase 2: Telegraph ---
  _beginPhaseTelegraph(ctx) {
    this._phaseTelegraph = 0.0001;
    // Head emissive pulse
    const head = this.root.userData.head;
    if (head && head.material && head.material.emissive) head.material.emissive.setHex(0xff88aa);
    // Ground ring under boss
    const THREE = this.THREE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.8, 28),
      new THREE.MeshBasicMaterial({ color: 0xff88aa, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.root.position.x, 0.05, this.root.position.z);
    ring.userData.life = 0;
    ctx.scene.add(ring);
    this._phaseTelegraphRing = ring;
  }

  _updatePhaseTelegraph(dt, _ctx) {
    if (!this._phaseTelegraphRing) return;
    const r = this._phaseTelegraphRing;
    r.userData.life += dt;
    const s = 1 + Math.sin(r.userData.life * 18) * 0.08;
    r.scale.set(s, s, s);
    if (r.material && r.material.opacity !== undefined) {
      r.material.opacity = Math.max(0.2, 0.9 - this._phaseTelegraph * 0.9);
    }
  }

  _endPhaseTelegraph(ctx) {
    this._phaseTelegraph = 0;
    if (this._phaseTelegraphRing) { ctx.scene.remove(this._phaseTelegraphRing); this._phaseTelegraphRing = null; }
    const head = this.root.userData.head;
    if (head && head.material && head.material.emissive) head.material.emissive.setHex(0xbb66ff);
    // Initialize ability windows so they don't fire instantly together
    this._flyerCooldown = 1.5 + Math.random() * 1.0;
    this._gooCooldown = 2.0 + Math.random() * 1.5;
  }

  // --- Phase 2: Flyer Brood ---
  _updateFlyerBrood(dt, ctx) {
    if (!this.enemyManager) return; // requires manager

    // Track and prune dead flyers
    for (const r of Array.from(this._flyerRoots)) {
      if (!this.enemyManager.enemies.has(r)) this._flyerRoots.delete(r);
    }

    // Total minion cap across all enemies during boss fight: ≤8
    const totalMinions = Math.max(0, (this.enemyManager.enemies?.size || 1) - 1); // subtract boss
    const totalCap = 8;
    const availableSlots = Math.max(0, totalCap - totalMinions);

    if (this._flyerCooldown > 0) this._flyerCooldown -= dt;
    if (this._flyerCooldown > 0) return;

    const currentFlyers = this._flyerRoots.size;
    const flyerSlots = Math.max(0, this._flyerCap - currentFlyers);
    const canSpawn = Math.min(availableSlots, flyerSlots);
    if (canSpawn <= 0) { this._flyerCooldown = 1.2; return; }

    const count = Math.max(1, Math.min(3, 2 + (Math.random() < 0.5 ? 0 : 1), canSpawn));
    const positions = this._computeSpawnAroundPlayer(ctx, count, 6, 10);
    for (const p of positions) {
      const root = this.enemyManager.spawnAt('flyer', p, { countsTowardAlive: true });
      if (root) {
        // Tuning: low HP flyers with slight speed buff
        root.userData.hp = Math.max(10, Math.floor(18 + Math.random() * 10));
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.speed *= 1.12; // cruise
          inst.diveSpeed *= 1.08;
          // slightly shorter cooldown to feel harassy
          if (typeof inst.cooldownBase === 'number') inst.cooldownBase = Math.max(0.9, inst.cooldownBase * 0.9);
        }
        this._flyerRoots.add(root);
      }
      if (this._flyerRoots.size >= this._flyerCap) break;
    }
    this._flyerCooldown = 6 + Math.random() * 2; // next window
  }

  _computeSpawnAroundPlayer(ctx, count, minR = 6, maxR = 10) {
    const THREE = this.THREE;
    const out = [];
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const pos = new THREE.Vector3(playerPos.x + Math.cos(a) * r, 1.2, playerPos.z + Math.sin(a) * r);
      // try keep within arena
      pos.x = Math.max(-39, Math.min(39, pos.x));
      pos.z = Math.max(-39, Math.min(39, pos.z));
      // prefer clear areas if helper exists
      if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
        if (!this.enemyManager._isSpawnAreaClear(pos, 0.4)) continue;
      }
      out.push(pos);
    }
    return out;
  }

  // --- Phase 2: Goo Puddles ---
  _updateGoo(dt, ctx) {
    // Update existing
    if (!this._lastPlayerPos) this._lastPlayerPos = ctx.player.position.clone();
    for (let i = this._goo.length - 1; i >= 0; i--) {
      const g = this._goo[i];
      g.update(dt, ctx, this._lastPlayerPos, this._frameIndex);
      if (g.expired) this._goo.splice(i, 1);
    }
    this._lastPlayerPos.copy(ctx.player.position);

    if (this._gooCooldown > 0) this._gooCooldown -= dt;
    if (this._gooCooldown > 0) return;
    if (this._goo.length >= this._gooCap) { this._gooCooldown = 1.0; return; }

    const remainingSlots = this._gooCap - this._goo.length;
    const toSpawn = Math.max(1, Math.min(2, remainingSlots));
    const positions = this._computeSpawnAroundPlayer(ctx, toSpawn, 3, 6);
    for (const p of positions) {
      const g = new GooPuddle({ THREE: this.THREE, mats: this.mats, position: p, enemyManager: this.enemyManager });
      ctx.scene.add(g.root);
      this._goo.push(g);
      if (this._goo.length >= this._gooCap) break;
    }
    this._gooCooldown = 10 + Math.random() * 4;
  }
}


