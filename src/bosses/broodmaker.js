import { GooPuddle } from '../hazards/goo.js';
import { createBroodmakerAsset } from '../assets/boss_broodmaker.js';

export class Broodmaker {
  constructor({ THREE, mats, spawnPos, enemyManager = null, mode = 'light' }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.mode = mode === 'heavy' ? 'heavy' : 'light';
    this.enablePhase2 = this.mode === 'heavy';

    // Asset
    const built = createBroodmakerAsset({ THREE, mats, scale: 1.0 });
    const type = this.enablePhase2 ? 'boss_broodmaker_heavy' : 'boss_broodmaker';
    built.root.position.copy(spawnPos);
    built.root.userData = { type, head: built.head, hp: this.enablePhase2 ? 18000 : 2800, damageMul: 1.0 };
    this.root = built.root;
    this.refs = built.refs || {};

    // Core nav + timers
    this.speed = this.enablePhase2 ? 2.5 : 1.7;
    this._raycaster = new THREE.Raycaster();
    this._frameIndex = 0;
    this._t = 0;

    // Phases
    this.maxHp = this.root.userData.hp;
    this.phase = 1;                     // -> 2 at <=60% HP
    this._phaseTelegraph = 0;
    this._phaseTelegraphRequired = 0.8;
    this._phaseTelegraphRing = null;

    // Phase 1: Broodlings + Burrow relocate
    this._broodRoots = new Set();
    this._broodCooldown = 3.5 + Math.random() * 1.0;       // first drip fast
    this._broodCap = this.enablePhase2 ? 8 : 6;            // local cap (also clamped by global cap)
    // Burrow state
    this._burrowCooldown = (this.enablePhase2 ? 10 : 12) + Math.random() * 4;
    this._burrowPhase = null;   // 'sink' | 'move' | 'rise' | null
    this._burrowTimer = 0;

    // Phase 2: Flyers + Goo + weakpoint exposure
    this._flyerCooldown = 4 + Math.random() * 2;
    this._flyerRoots = new Set();
    this._flyerCap = 6;

    this._gooCooldown = 10 + Math.random() * 4;
    this._goo = [];
    this._gooCap = 4;
    this._lastPlayerPos = null;

    // Weakpoint exposure window (Phase 2 lay cycle)
    this._weakpointTimer = 0;
    this._setWeakpoint(false);
  }

  // ---------------- core update ----------------
  update(dt, ctx) {
    this._frameIndex++;
    this._t += dt;

    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist > 70) return;

    // If burrowing, run that mini-state machine and skip movement/abilities.
    if (this._burrowPhase) {
      this._updateBurrow(dt, ctx, playerPos);
      this._tickVisuals(dt);
      return;
    }

    // Movement: keep range; orbit when close
    toPlayer.y = 0;
    if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    const desired = new this.THREE.Vector3();
    if (dist > 9) desired.add(toPlayer);
    else desired.add(new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(0.6));
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
      ctx.moveWithCollisions(e, step);
    }

    // Phase gate
    if (this.enablePhase2) {
      if (this.phase === 1 && e.userData.hp <= this.maxHp * 0.6) {
        if (this._phaseTelegraph <= 0) this._beginPhaseTelegraph(ctx);
      }
      if (this._phaseTelegraph > 0) {
        this._phaseTelegraph += dt;
        this._updatePhaseTelegraph(dt, ctx);
        if (this._phaseTelegraph >= this._phaseTelegraphRequired) {
          this._endPhaseTelegraph(ctx);
          this.phase = 2;
        }
      }
      if (this.phase === 2) {
        this._updateFlyerBrood(dt, ctx);
        this._updateBroodlings(dt, ctx);
        this._updateGoo(dt, ctx);
        this._updateWeakpoint(dt); // auto-close when window ends
      }
    }

    // Phase 1 loop (still active in heavy until transition)
    if (this.phase === 1) {
      this._updateBroodlings(dt, ctx);
      this._maybeStartBurrow(dt, ctx, playerPos);
    } else {
      // Even in Phase 2, occasional burrow keeps the arena dynamic
      this._maybeStartBurrow(dt, ctx, playerPos, 0.65);
    }

    this._tickVisuals(dt);
  }

  // ---------------- visuals & pulses ----------------
  _tickVisuals(dt) {
    // Head tint by phase
    const head = this.root.userData?.head;
    if (head?.material) {
      const mat = head.material;
      if (mat.emissive) mat.emissive.setHex(this.enablePhase2 && this.phase === 2 ? 0xbb66ff : 0x8844ff);
    }
    // Egg sac pulse (stronger right before brood spawn)
    try {
      const sacs = this.refs?.eggs || [];
      let k = 0.8 + 0.2 * Math.sin(this._t * 3.6);
      if (this._broodCooldown < 1.0) k = 1.0 + (1.0 - this._broodCooldown) * 0.4; // ramp up
      for (const s of sacs) {
        if (s.material?.emissiveIntensity != null) s.material.emissiveIntensity = 0.6 * k;
      }
    } catch(_) {}
  }

  onRemoved(scene) {
    // Flyers
    if (this.enemyManager) {
      for (const r of Array.from(this._flyerRoots)) {
        if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
        this._flyerRoots.delete(r);
      }
      for (const r of Array.from(this._broodRoots)) {
        if (this.enemyManager.enemies.has(r)) this.enemyManager.remove(r);
        this._broodRoots.delete(r);
      }
    }
    // Goo
    for (const g of this._goo) g?.dispose?.(scene);
    this._goo.length = 0;
    if (this._phaseTelegraphRing) { scene.remove(this._phaseTelegraphRing); this._phaseTelegraphRing = null; }
  }

  // ---------------- Phase 1: Broodlings ----------------
  _updateBroodlings(dt, ctx) {
    if (!this.enemyManager) return;

    // Prune dead
    for (const r of Array.from(this._broodRoots)) {
      if (!this.enemyManager.enemies.has(r)) this._broodRoots.delete(r);
    }

    // Global cap (so arena doesn’t oversaturate)
    const totalMinions = Math.max(0, (this.enemyManager.enemies?.size || 1) - 1); // minus boss
    const totalCap = 10; // broader than flyers cap to allow ground pressure
    const availGlobal = Math.max(0, totalCap - totalMinions);

    // Cooldown
    if (this._broodCooldown > 0) this._broodCooldown -= dt;
    if (this._broodCooldown > 0) return;

    const localAvail = Math.max(0, this._broodCap - this._broodRoots.size);
    const canSpawn = Math.min(availGlobal, localAvail);
    if (canSpawn <= 0) { this._broodCooldown = 1.2; return; }

    // Spawn 1–3 between boss and player to create pushback space (avoid behind player)
    const count = Math.min(canSpawn, 1 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0));
    let near = this._computeSpawnBetweenBossAndPlayer(ctx, count, 3.5, 7.0);
    // Fallback: if few valid slots found (tight space), try again with a bit more lateral spread
    if (near.length < count) {
      const extra = this._computeSpawnBetweenBossAndPlayer(ctx, count - near.length, 2.8, 6.5, 1.8);
      near.push(...extra);
    }
    // Last resort: if still not enough, place on front hemisphere around player toward boss
    if (near.length < count) {
      const fill = this._computeSpawnAroundPlayer(ctx, count - near.length, 4.0, 8.0, (p) => {
        const playerPos = ctx.player.position;
        const fwd = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone().setY(0) : null;
        const to = p.clone().sub(playerPos).setY(0);
        if (to.lengthSq() === 0) return false;
        to.normalize();
        if (fwd && fwd.lengthSq() > 0) {
          const cosHalf = Math.cos(Math.PI / 6); // 60° cone
          if (fwd.normalize().dot(to) < cosHalf) return false;
          // Also bias toward boss direction within the cone
          const toBoss = this.root.position.clone().sub(playerPos).setY(0);
          if (toBoss.lengthSq() > 0 && toBoss.normalize().dot(to) < -0.1) return false;
          return true;
        } else {
          // If no forward available, at least ensure not behind relative to boss
          const toBoss = this.root.position.clone().sub(playerPos).setY(0);
          if (toBoss.lengthSq() > 0) { toBoss.normalize(); if (toBoss.dot(to) < 0) return false; }
          return true;
        }
      });
      near.push(...fill);
    }
    let spawned = 0;

    for (const p of near) {
      const root = this.enemyManager.spawnAt('broodling', p, { countsTowardAlive: true });
      if (root) {
        // light, fragile adds
        root.userData.hp = Math.max(8, Math.floor(12 + Math.random() * 6));
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.speed *= 1.05;
          if (typeof inst.aggression === 'number') inst.aggression = Math.min(1.0, (inst.aggression || 0.8) + 0.1);
        }
        this._broodRoots.add(root);
        spawned++;
      }
    }

    // Next drip: faster if few spawned (keeps pressure), slower if many
    this._broodCooldown = (spawned >= 2 ? 3.4 : 2.2) + Math.random() * 0.9;
  }

  // ---------------- Burrow / Relocate (both phases) ----------------
  _maybeStartBurrow(dt, ctx, playerPos, rarityMul = 1.0) {
    if (this._burrowCooldown > 0) this._burrowCooldown -= dt;
    if (this._burrowCooldown > 0) return;

    // Don’t relocate if player is extremely far (already disengaged)
    const d = playerPos.clone().sub(this.root.position).length();
    if (d > 55) { this._burrowCooldown = 3.0; return; }

    // Start burrow
    this._burrowPhase = 'sink';
    this._burrowTimer = 0.6; // sink time
    // Visual: hide outline while underground
    if (this.refs.outlineGroup) this.refs.outlineGroup.visible = false;
    // Juicy FX
    try { window?._EFFECTS?.ring?.(this.root.position.clone(), 1.6, 0xff88aa); } catch(_) {}
    // Next time (rarityMul makes it rarer in P2 if desired)
    this._burrowCooldown = ((this.enablePhase2 ? 9 : 12) + Math.random() * 5) * rarityMul;
  }

  _updateBurrow(dt, ctx, playerPos) {
    const anchor = this.refs?.burrowAnchor || this.root;
    if (this._burrowPhase === 'sink') {
      this._burrowTimer -= dt;
      anchor.position.y = this._easeTo(anchor.position.y, -1.15, dt * 6);
      if (this._burrowTimer <= 0) {
        this._burrowPhase = 'move';
        this._burrowTimer = 0.1;
        // Teleport root while "underground"
        const target = this._pickRelocatePos(playerPos);
        this.root.position.copy(target);
        // optional FX at emerge point
        try { window?._EFFECTS?.ring?.(target.clone(), 1.6, 0xff88aa); } catch(_) {}
      }
      return;
    }
    if (this._burrowPhase === 'move') {
      this._burrowTimer -= dt;
      if (this._burrowTimer <= 0) {
        this._burrowPhase = 'rise';
        this._burrowTimer = 0.7;
      }
      return;
    }
    if (this._burrowPhase === 'rise') {
      this._burrowTimer -= dt;
      anchor.position.y = this._easeTo(anchor.position.y, 0, dt * 5);
      if (this._burrowTimer <= 0) {
        anchor.position.y = 0;
        this._burrowPhase = null;
        if (this.refs.outlineGroup) this.refs.outlineGroup.visible = true;
        // On emerge: small brood pop to re-engage
        if (this.phase === 1) this._broodCooldown = Math.min(this._broodCooldown, 0.5);
      }
    }
  }

  _pickRelocatePos(playerPos) {
    const THREE = this.THREE;
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 6; // 10–16 m from player
    const pos = new THREE.Vector3(playerPos.x + Math.cos(a) * r, this.root.position.y, playerPos.z + Math.sin(a) * r);
    // clamp to arena
    pos.x = Math.max(-39, Math.min(39, pos.x));
    pos.z = Math.max(-39, Math.min(39, pos.z));
    // nudge off obstacles if helper exists
    if (typeof this.enemyManager?._nudgeClear === 'function') this.enemyManager._nudgeClear(pos, 0.8);
    return pos;
  }

  // ---------------- Phase 2: Telegraph ----------------
  _beginPhaseTelegraph(ctx) {
    this._phaseTelegraph = 0.0001;
    const head = this.root.userData.head;
    if (head?.material?.emissive) head.material.emissive.setHex(0xff88aa);
    try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 1.2; }); } catch(_) {}

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
    if (head?.material?.emissive) head.material.emissive.setHex(0xbb66ff);
    try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 0.85; }); } catch(_) {}
    // Stagger ability windows
    this._flyerCooldown = 1.5 + Math.random() * 1.0;
    this._gooCooldown = 2.0 + Math.random() * 1.5;
  }

  // ---------------- Phase 2: Weakpoint exposure cycle ----------------
  _setWeakpoint(open) {
    const w = this.refs?.weakpoint;
    const cover = this.refs?.dorsalCover;
    this.root.userData.damageMul = open ? 1.6 : 1.0; // let external damage logic read this
    if (w) w.visible = !!open;
    if (cover) cover.rotation.x = open ? -1.1 : -0.25; // hinge open/closed
  }
  _updateWeakpoint(dt) {
    if (this._weakpointTimer > 0) {
      this._weakpointTimer = Math.max(0, this._weakpointTimer - dt);
      if (this._weakpointTimer === 0) this._setWeakpoint(false);
    }
  }

  // ---------------- Phase 2: Flyers ----------------
  _updateFlyerBrood(dt, ctx) {
    if (!this.enemyManager) return;

    for (const r of Array.from(this._flyerRoots)) {
      if (!this.enemyManager.enemies.has(r)) this._flyerRoots.delete(r);
    }

    const totalMinions = Math.max(0, (this.enemyManager.enemies?.size || 1) - 1);
    const totalCap = 8;
    const availableSlots = Math.max(0, totalCap - totalMinions);

    if (this._flyerCooldown > 0) this._flyerCooldown -= dt;
    if (this._flyerCooldown > 0) return;

    const currentFlyers = this._flyerRoots.size;
    const flyerSlots = Math.max(0, this._flyerCap - currentFlyers);
    const canSpawn = Math.min(availableSlots, flyerSlots);
    if (canSpawn <= 0) { this._flyerCooldown = 1.2; return; }

    // Spawn from ports (feels like a lay/cough-out), then dive toward player
    const ports = this.refs?.flyerPorts || [];
    let spawned = 0;
    const want = Math.min(canSpawn, 2 + (Math.random() < 0.5 ? 1 : 0));
    for (let i = 0; i < want && ports.length; i++) {
      const port = ports[Math.floor(Math.random() * ports.length)];
      const p = port.getWorldPosition(new this.THREE.Vector3());
      const root = this.enemyManager.spawnAt('flyer', p, { countsTowardAlive: true });
      if (root) {
        root.userData.hp = Math.max(10, Math.floor(18 + Math.random() * 10));
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.speed *= 1.12;
          inst.diveSpeed = (inst.diveSpeed || inst.speed * 1.4) * 1.08;
        }
        this._flyerRoots.add(root);
        spawned++;
      }
    }
    this._flyerCooldown = 6 + Math.random() * 2;

    // Open weakpoint briefly during lay cycle
    if (spawned > 0) {
      this._setWeakpoint(true);
      this._weakpointTimer = 3.0; // exposed window
      // ping eggs brighter
      try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 1.2; }); } catch(_) {}
    }
  }

  // ---------------- Phase 2: Goo ----------------
  _updateGoo(dt, ctx) {
    if (!this._lastPlayerPos) this._lastPlayerPos = ctx.player.position.clone();

    // Update existing
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

    // 50%: drop from abdomen nozzles under boss; 50%: seed near player
    const rollPorts = Math.random() < 0.5;
    const positions = [];
    if (rollPorts && (this.refs?.gooPorts?.length)) {
      for (let i = 0; i < toSpawn; i++) {
        const port = this.refs.gooPorts[Math.floor(Math.random() * this.refs.gooPorts.length)];
        const p = port.getWorldPosition(new this.THREE.Vector3());
        p.y = 0.05;
        positions.push(p);
      }
    } else {
      positions.push(...this._computeSpawnAroundPlayer(ctx, toSpawn, 3, 6));
    }

    for (const p of positions) {
      const g = new GooPuddle({ THREE: this.THREE, mats: this.mats, position: p, enemyManager: this.enemyManager });
      ctx.scene.add(g.root);
      this._goo.push(g);
      if (this._goo.length >= this._gooCap) break;
    }
    this._gooCooldown = 10 + Math.random() * 4;
  }

  // ---------------- utils ----------------
  _computeSpawnAroundPlayer(ctx, count, minR = 6, maxR = 10, filter = null) {
    const THREE = this.THREE;
    const out = [];
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const pos = new THREE.Vector3(playerPos.x + Math.cos(a) * r, 1.2, playerPos.z + Math.sin(a) * r);
      pos.x = Math.max(-39, Math.min(39, pos.x));
      pos.z = Math.max(-39, Math.min(39, pos.z));
      if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
        if (!this.enemyManager._isSpawnAreaClear(pos, 0.4)) continue;
      }
      if (typeof filter === 'function' && !filter(pos)) continue;
      out.push(pos);
    }
    return out;
  }

  _computeSpawnBetweenBossAndPlayer(ctx, count, minDistFromPlayer = 3.5, maxDistFromBoss = 7.0, lateralJitterMul = 1.2) {
    const THREE = this.THREE;
    const out = [];
    const bossPos = this.root.position.clone();
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(bossPos);
    toPlayer.y = 0;
    const L = toPlayer.length();
    if (L <= 0.0001) return out;
    const dir = toPlayer.clone().normalize();
    const orth = new THREE.Vector3(-dir.z, 0, dir.x); // lateral left/right

    const safeMinT = 0.15; // avoid right on top of boss
    const tMaxByPlayer = 1 - Math.max(0, minDistFromPlayer) / Math.max(0.0001, L);
    const tMaxByBoss = Math.max(0, maxDistFromBoss) / Math.max(0.0001, L);
    const tUpper = Math.min(0.9, tMaxByPlayer, tMaxByBoss);

    if (tUpper <= safeMinT + 1e-3) return out; // no safe segment

    // Bounded-attempt sampler to avoid infinite retries under tight constraints
    const fwd = (ctx.blackboard && ctx.blackboard.playerForward) ? ctx.blackboard.playerForward.clone().setY(0) : null;
    const dirToBoss = bossPos.clone().sub(playerPos).setY(0);
    if (dirToBoss.lengthSq() > 0) dirToBoss.normalize();

    const maxAttempts = Math.max(8, count * 12);
    let attempts = 0;
    while (out.length < count && attempts < maxAttempts) {
      attempts++;
      const t = safeMinT + Math.random() * (tUpper - safeMinT);
      const base = bossPos.clone().add(dir.clone().multiplyScalar(L * t));
      const jitterMag = (0.8 + Math.random() * 1.2) * lateralJitterMul;
      const side = (Math.random() < 0.5 ? -1 : 1);
      const pos = base.add(orth.clone().multiplyScalar(side * jitterMag));
      pos.y = 1.2;
      pos.x = Math.max(-39, Math.min(39, pos.x));
      pos.z = Math.max(-39, Math.min(39, pos.z));

      // Enforce 60° vision cone relative to player's forward; fallback to 'in front of player toward boss' if forward missing
      const dirFromPlayer = pos.clone().sub(playerPos).setY(0);
      if (dirFromPlayer.lengthSq() === 0) continue;
      dirFromPlayer.normalize();
      if (fwd && fwd.lengthSq() > 0) {
        const f = fwd.normalize();
        const cosHalfAngle = Math.cos(Math.PI / 6); // 30° half-angle => 60° cone
        if (f.dot(dirFromPlayer) < cosHalfAngle) continue;
      } else if (dirToBoss.lengthSq() > 0) {
        const frontDot = dirToBoss.dot(dirFromPlayer);
        if (frontDot < 0) continue;
      }

      if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
        if (!this.enemyManager._isSpawnAreaClear(pos, 0.4)) continue;
      }

      out.push(pos);
    }
    return out;
  }

  _hasLineOfSight(fromPos, targetPos, objects) {
    const THREE = this.THREE;
    const origin = new THREE.Vector3(fromPos.x, fromPos.y + 1.2, fromPos.z);
    const target = new THREE.Vector3(targetPos.x, 1.5, targetPos.z);
    const dir = target.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.0001) return true;
    dir.normalize();
    this._raycaster.set(origin, dir);
    this._raycaster.far = dist - 0.1;
    const hits = this._raycaster.intersectObjects(objects, false);
    return !(hits && hits.length > 0);
  }

  _easeTo(current, target, rate) { return current + Math.max(-Math.abs(rate), Math.min(Math.abs(rate), target - current)); }
}
