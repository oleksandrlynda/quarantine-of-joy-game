import { GooPuddle } from '../hazards/goo.js';
import { logError } from '../util/log.js';
import { createBroodmakerVisual, getBossSharedGeometry } from './visual-cache.js';

export class Broodmaker {
  constructor({ THREE, mats, spawnPos, enemyManager = null, mode = 'light', rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;
    this.mode = mode === 'heavy' ? 'heavy' : 'light';
    this.enablePhase2 = this.mode === 'heavy';

    // Asset
    const built = createBroodmakerVisual({ THREE, mats });
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
    this.preferredRange = Object.freeze([15, 22]);
    this._yaw = built.root.rotation.y || 0;
    this._strafeSign = this.rng() < 0.5 ? -1 : 1;
    this._routeAnchor = null;
    this._routeAnchorSubject = null;
    this._routeAnchorRefresh = 0;
    this._forcedRouteSeconds = 0;
    this._worldBlockedSeconds = 0;
    this._stuckEscapeArmed = false;
    this._routingToRange = false;

    // Phases
    this.maxHp = this.root.userData.hp;
    this.phase = 1;                     // -> 2 at <=60% HP
    this._phaseTelegraph = 0;
    this._phaseTelegraphRequired = 0.8;
    this._phaseTelegraphRing = null;

    // Phase 1: Broodlings + Burrow relocate
    this._broodRoots = new Set();
    this._broodCooldown = 3.5 + this.rng() * 1.0;       // first drip fast
    this._broodCap = this.enablePhase2 ? 8 : 6;            // local cap (also clamped by global cap)
    // Burrow state
    this._burrowCooldown = (this.enablePhase2 ? 10 : 12) + this.rng() * 4;
    this._burrowPhase = null;   // 'sink' | 'move' | 'rise' | null
    this._burrowTimer = 0;
    this._burrowReason = null;

    // Phase 2: Flyers + Goo + weakpoint exposure
    this._flyerCooldown = 4 + this.rng() * 2;
    this._flyerRoots = new Set();
    this._flyerCap = 6;

    this._gooCooldown = 10 + this.rng() * 4;
    this._goo = [];
    this._gooCap = 4;
    this._lastPlayerPos = null;

    // Light-mode direct pressure. Adds remain the encounter's main threat;
    // resin merely forces movement and gives the boss one attributable hit.
    this._resinCooldown = 4.8 + this.rng() * 1.2;
    this._resinSpit = null;
    this._resinPuddles = [];
    this._resinLastPlayerPos = null;

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
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let yawDelta = targetYaw - this._yaw;
    yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this._yaw += Math.max(-3.5 * dt, Math.min(3.5 * dt, yawDelta));
    e.rotation.y = this._yaw;

    const desired = new this.THREE.Vector3();
    const [minimumRange, maximumRange] = this.preferredRange;
    const idealRange = (minimumRange + maximumRange) * 0.5;
    const side = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this._strafeSign);
    if (dist < minimumRange) {
      desired.addScaledVector(toPlayer, -1.35).addScaledVector(side, 0.38);
      if (dist < minimumRange * 0.55) this._burrowCooldown = Math.min(this._burrowCooldown, 0.75);
    } else if (dist > maximumRange) {
      desired.add(toPlayer).addScaledVector(side, 0.18);
    } else {
      desired.add(side);
      desired.addScaledVector(toPlayer, (dist - idealRange) * 0.08);
    }
    const hasLOS = this._hasLineOfSight(e.position, playerPos, ctx.objects);
    const locomotionClear = ctx.locomotionClear?.(e, playerPos) ?? true;
    this._routeAnchorRefresh = Math.max(0, this._routeAnchorRefresh - dt);
    this._forcedRouteSeconds = Math.max(0, this._forcedRouteSeconds - dt);
    const needsRangeChange = dist < minimumRange || dist > maximumRange;
    const needsRoute = !hasLOS || (!locomotionClear && needsRangeChange) || this._forcedRouteSeconds > 0;
    if (needsRoute && ctx.pathfind) {
      const playerMoved = !this._routeAnchorSubject
        || this._routeAnchorSubject.distanceToSquared(playerPos) > 4;
      if (!this._routeAnchor || this._routeAnchorRefresh <= 0 || playerMoved) {
        const awayFromPlayer = e.position.clone().sub(playerPos).setY(0);
        if (awayFromPlayer.lengthSq() <= 0.0001) awayFromPlayer.set(0, 0, 1);
        awayFromPlayer.normalize();
        this._routeAnchor = playerPos.clone().addScaledVector(awayFromPlayer, idealRange);
        this._routeAnchor.y = e.position.y;
        this._routeAnchorSubject = playerPos.clone();
        this._routeAnchorRefresh = 0.8;
      }
      ctx.pathfind.recomputeIfStale(this, this._routeAnchor, { cacheFor: 1.2 });
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new this.THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) desired.copy(dir.normalize());
      }
      if (!this._routingToRange) {
        ctx.emitAIEvent?.(e, 'broodmaker_route_started', {
          reason: !hasLOS ? 'lost_los' : (!locomotionClear ? 'body_corridor_blocked' : 'movement_blocked')
        });
      }
      this._routingToRange = true;
      ctx.setAIState?.(e, 'routing_to_range');
    } else if (ctx.pathfind) {
      ctx.pathfind.clear(this);
      if (this._routingToRange) ctx.emitAIEvent?.(e, 'broodmaker_route_completed');
      this._routingToRange = false;
    }

    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      const movement = ctx.moveWithCollisions(e, step) || {};
      const worldConstrained = movement.blockedBy === 'world';
      if (worldConstrained) {
        this._worldBlockedSeconds += dt;
        if (this._worldBlockedSeconds >= 0.12) {
          this._forcedRouteSeconds = Math.max(this._forcedRouteSeconds, 1.5);
          this._routeAnchorRefresh = 0;
        }
        if (this._worldBlockedSeconds >= 1.5 && !this._stuckEscapeArmed) {
          this._stuckEscapeArmed = true;
          this._burrowReason = 'world_blocked';
          this._burrowCooldown = 0;
          if (this._resinSpit) {
            this._disposeResinMesh(ctx.scene, this._resinSpit.mesh);
            this._resinSpit = null;
            ctx.emitAIEvent?.(this.root, 'ability_cancelled', {
              ability: 'broodmaker_resin_spit', reason: 'stuck_escape'
            });
          }
          ctx.emitAIEvent?.(e, 'broodmaker_stuck_escape_armed', {
            blockedSeconds: this._worldBlockedSeconds
          });
        }
      } else {
        this._worldBlockedSeconds = Math.max(0, this._worldBlockedSeconds - dt * 2);
        if (this._worldBlockedSeconds <= 0.25) this._stuckEscapeArmed = false;
      }
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

    if (!this.enablePhase2 && !this._burrowPhase) this._updateResinSpit(dt, ctx);

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
    } catch (e) { logError(e); }
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
    if (this._phaseTelegraphRing) {
      scene.remove(this._phaseTelegraphRing);
      this._phaseTelegraphRing.material?.dispose?.();
      this._phaseTelegraphRing = null;
    }
    if (this._resinSpit?.mesh) this._disposeResinMesh(scene, this._resinSpit.mesh);
    this._resinSpit = null;
    for (const puddle of this._resinPuddles) this._disposeResinMesh(scene, puddle.mesh);
    this._resinPuddles.length = 0;
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

    // Build a readable screen of 3–4 bodies between player and boss. Combat
    // geometry owns the formation, never the direction of the player camera.
    const count = Math.min(canSpawn, 3 + (this.rng() < 0.35 ? 1 : 0));
    const near = this._computeSpawnWallBetweenBossAndPlayer(ctx, count);
    let spawned = 0;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'brood_wall', telegraphSeconds: 0, requestedCount: count
    });

    for (const p of near) {
      const root = this.enemyManager.spawnAt('gruntling', p, { countsTowardAlive: true });
      if (root) {
        // light, fragile adds
        root.userData.hp = Math.max(8, Math.floor(12 + this.rng() * 6));
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.speed *= 1.05;
          if (typeof inst.aggression === 'number') inst.aggression = Math.min(1.0, (inst.aggression || 0.8) + 0.1);
        }
        this._broodRoots.add(root);
        root.userData.summonerRoot = this.root;
        root.userData.bossOwnerRoot = this.root;
        root.userData.summonRole = 'brood_wall';
        ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
          ability: 'brood_wall',
          spawnedRoot: root,
          ownerRoot: this.root,
          betweenBossAndPlayer: true
        });
        spawned++;
      }
    }

    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: 'brood_wall', spawnedCount: spawned, requestedCount: count
    });

    // Next drip: faster if few spawned (keeps pressure), slower if many
    this._broodCooldown = (spawned >= 2 ? 3.4 : 2.2) + this.rng() * 0.9;
  }

  // ---------------- Burrow / Relocate (both phases) ----------------
  _maybeStartBurrow(dt, ctx, playerPos, rarityMul = 1.0) {
    if (this._resinSpit) return;
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
    try { globalThis.window?._EFFECTS?.ring?.(this.root.position.clone(), 1.6, 0xff88aa); } catch (e) { logError(e); }
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'broodmaker_burrow', telegraphSeconds: 0.6,
      reason: this._burrowReason || 'cadence'
    });
    this._burrowReason = null;
    this._worldBlockedSeconds = 0;
    this._stuckEscapeArmed = false;
    // Next time (rarityMul makes it rarer in P2 if desired)
    this._burrowCooldown = ((this.enablePhase2 ? 9 : 12) + this.rng() * 5) * rarityMul;
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
        const target = this._pickRelocatePos(playerPos, ctx);
        this.root.position.copy(target);
        // optional FX at emerge point
        try { globalThis.window?._EFFECTS?.ring?.(target.clone(), 1.6, 0xff88aa); } catch (e) { logError(e); }
        ctx.emitAIEvent?.(this.root, 'ability_released', {
          ability: 'broodmaker_burrow', destination: target.clone()
        });
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

  _pickRelocatePos(playerPos, ctx = null) {
    const THREE = this.THREE;
    const bodyRadius = this.enablePhase2 ? 2.45 : 2.15;
    const margin = bodyRadius + .35;
    const bounds = this._arenaBounds(margin);
    const baseAngle = this.rng() * Math.PI * 2;
    const radius = 17 + this.rng() * 5; // re-establish the ranged-controller band
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = baseAngle + attempt * 2.3999632297;
      const pos = new THREE.Vector3(
        Math.max(bounds.minX, Math.min(bounds.maxX, playerPos.x + Math.cos(angle) * radius)),
        this.root.position.y,
        Math.max(bounds.minZ, Math.min(bounds.maxZ, playerPos.z + Math.sin(angle) * radius))
      );
      if (!ctx?.positionClear || ctx.positionClear(this.root, pos)) return pos;
    }
    // A failed relocation must keep the boss at a known-valid position rather
    // than teleport it into a facade or beyond the authored collision walls.
    return this.root.position.clone();
  }

  // ---------------- Phase 2: Telegraph ----------------
  _beginPhaseTelegraph(ctx) {
    this._phaseTelegraph = 0.0001;
    const head = this.root.userData.head;
    if (head?.material?.emissive) head.material.emissive.setHex(0xff88aa);
    try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 1.2; }); } catch (e) { logError(e); }

    const THREE = this.THREE;
    const ring = new THREE.Mesh(
      getBossSharedGeometry(THREE, 'broodmaker-phase-ring', () => new THREE.RingGeometry(0.9, 1.8, 28)),
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
    if (this._phaseTelegraphRing) {
      ctx.scene.remove(this._phaseTelegraphRing);
      this._phaseTelegraphRing.material?.dispose?.();
      this._phaseTelegraphRing = null;
    }
    const head = this.root.userData.head;
    if (head?.material?.emissive) head.material.emissive.setHex(0xbb66ff);
    try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 0.85; }); } catch (e) { logError(e); }
    // Stagger ability windows
    this._flyerCooldown = 1.5 + this.rng() * 1.0;
    this._gooCooldown = 2.0 + this.rng() * 1.5;
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
    const want = Math.min(canSpawn, 2 + (this.rng() < 0.5 ? 1 : 0));
    for (let i = 0; i < want && ports.length; i++) {
      const port = ports[Math.floor(this.rng() * ports.length)];
      const p = port.getWorldPosition(new this.THREE.Vector3());
      const root = this.enemyManager.spawnAt('flyer', p, { countsTowardAlive: true });
      if (root) {
        root.userData.hp = Math.max(10, Math.floor(18 + this.rng() * 10));
        root.userData.summonerRoot = this.root;
        root.userData.bossOwnerRoot = this.root;
        root.userData.summonRole = 'flyer_brood';
        const inst = this.enemyManager.instanceByRoot.get(root);
        if (inst) {
          inst.summoner = this;
          inst.speed *= 1.12;
          inst.diveSpeed = (inst.diveSpeed || inst.speed * 1.4) * 1.08;
        }
        this._flyerRoots.add(root);
        ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
          ability: 'flyer_brood', spawnedRoot: root, ownerRoot: this.root
        });
        spawned++;
      }
    }
    this._flyerCooldown = 6 + this.rng() * 2;

    // Open weakpoint briefly during lay cycle
    if (spawned > 0) {
      this._setWeakpoint(true);
      this._weakpointTimer = 3.0; // exposed window
      // ping eggs brighter
      try { (this.refs?.eggs||[]).forEach(s=>{ if (s.material?.emissiveIntensity!=null) s.material.emissiveIntensity = 1.2; }); } catch (e) { logError(e); }
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
    const rollPorts = this.rng() < 0.5;
    const positions = [];
    if (rollPorts && (this.refs?.gooPorts?.length)) {
      for (let i = 0; i < toSpawn; i++) {
        const port = this.refs.gooPorts[Math.floor(this.rng() * this.refs.gooPorts.length)];
        const p = port.getWorldPosition(new this.THREE.Vector3());
        p.y = 0.05;
        positions.push(p);
      }
    } else {
      positions.push(...this._computeSpawnAroundPlayer(ctx, toSpawn, 3, 6));
    }

    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'broodmaker_toxic_goo', telegraphSeconds: 0.4,
      requestedCount: positions.length, radius: 3.2,
      damagePerSecond: 6, slowMultiplier: 0.58
    });

    for (const p of positions) {
      const g = new GooPuddle({
        THREE: this.THREE, mats: this.mats, position: p,
        enemyManager: this.enemyManager, radius: 3.2,
        playerSlowMultiplier: 0.58, damagePerSecond: 6,
        damageTickSeconds: 0.75, sourceRoot: this.root,
        sourceKind: 'broodmaker_toxic_goo', toxic: true
      });
      ctx.scene.add(g.root);
      this._goo.push(g);
      if (this._goo.length >= this._gooCap) break;
    }
    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: 'broodmaker_toxic_goo', puddleCount: positions.length,
      radius: 3.2, damagePerSecond: 6
    });
    this._gooCooldown = 10 + this.rng() * 4;
  }

  // ---------------- Light mode: Resin Spit ----------------
  _updateResinSpit(dt, ctx) {
    const playerPos = ctx.player.position;
    ctx.blackboard = ctx.blackboard || {};

    for (let i = this._resinPuddles.length - 1; i >= 0; i--) {
      const puddle = this._resinPuddles[i];
      puddle.life -= dt;
      puddle.mesh.material.opacity = Math.max(0, Math.min(0.52, puddle.life * 0.16));
      if (Math.hypot(playerPos.x - puddle.position.x, playerPos.z - puddle.position.z) <= puddle.radius) {
        ctx.blackboard.playerSlowMul = Math.min(ctx.blackboard.playerSlowMul || 1, 0.72);
      }
      if (puddle.life <= 0) {
        this._disposeResinMesh(ctx.scene, puddle.mesh);
        this._resinPuddles.splice(i, 1);
      }
    }

    if (this._resinSpit) {
      const spit = this._resinSpit;
      spit.timer += dt;
      const progress = Math.min(1, spit.timer / spit.windup);
      spit.mesh.material.opacity = 0.25 + progress * 0.55;
      spit.mesh.scale.setScalar(0.7 + progress * 0.3);
      if (progress < 1) return;

      const hitPlayer = Math.hypot(playerPos.x - spit.position.x, playerPos.z - spit.position.z) <= spit.radius;
      if (hitPlayer) {
        ctx.onPlayerDamage?.(12, 'resin', {
          sourceRoot: this.root, ownerRoot: this.root,
          sourceOrigin: spit.position.clone(), sourceKind: 'broodmaker_resin_spit'
        });
      }
      this._disposeResinMesh(ctx.scene, spit.mesh);
      const puddleMesh = new this.THREE.Mesh(
        new this.THREE.CircleGeometry(spit.radius, 28),
        new this.THREE.MeshBasicMaterial({ color: 0xb8f04a, transparent: true, opacity: 0.52, depthWrite: false, side: this.THREE.DoubleSide })
      );
      puddleMesh.rotation.x = -Math.PI / 2;
      puddleMesh.position.copy(spit.position);
      puddleMesh.position.y = 0.025;
      ctx.scene.add(puddleMesh);
      this._resinPuddles.push({ mesh: puddleMesh, position: spit.position.clone(), radius: spit.radius, life: 5 });
      ctx.emitAIEvent?.(this.root, 'ability_released', {
        ability: 'broodmaker_resin_spit', hitPlayer, radius: spit.radius
      });
      this._resinSpit = null;
      this._resinCooldown = 6.5 + this.rng() * 1.5;
      return;
    }

    this._resinCooldown -= dt;
    if (this._resinCooldown > 0) {
      this._resinLastPlayerPos = playerPos.clone();
      return;
    }
    const distance = Math.hypot(playerPos.x - this.root.position.x, playerPos.z - this.root.position.z);
    if (distance < 7 || distance > 30 || !this._hasLineOfSight(this.root.position, playerPos, ctx.objects || [])) {
      this._resinCooldown = 0.25;
      this._resinLastPlayerPos = playerPos.clone();
      return;
    }

    const predicted = playerPos.clone();
    if (this._resinLastPlayerPos && dt > 0) {
      const velocity = playerPos.clone().sub(this._resinLastPlayerPos).multiplyScalar(1 / dt);
      velocity.y = 0;
      if (velocity.length() > 8) velocity.setLength(8);
      predicted.addScaledVector(velocity, 0.55);
    }
    predicted.y = 0.04;
    const radius = 2.25;
    const mesh = new this.THREE.Mesh(
      new this.THREE.RingGeometry(radius * 0.72, radius, 32),
      new this.THREE.MeshBasicMaterial({ color: 0xd7ff3f, transparent: true, opacity: 0.28, depthWrite: false, side: this.THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(predicted);
    ctx.scene.add(mesh);
    this._resinSpit = { mesh, position: predicted, radius, timer: 0, windup: 0.75 };
    this._resinLastPlayerPos = playerPos.clone();
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'broodmaker_resin_spit', telegraphSeconds: 0.75,
      target: predicted.clone(), radius
    });
  }

  _disposeResinMesh(scene, mesh) {
    if (!mesh) return;
    scene?.remove?.(mesh);
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
  }

  // ---------------- utils ----------------
  _computeSpawnAroundPlayer(ctx, count, minR = 6, maxR = 10, filter = null) {
    const THREE = this.THREE;
    const out = [];
    const playerPos = ctx.player.position;
    const bounds = this._arenaBounds(.5);
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = minR + this.rng() * (maxR - minR);
      const pos = new THREE.Vector3(playerPos.x + Math.cos(a) * r, 1.2, playerPos.z + Math.sin(a) * r);
      pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
      pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
      if (typeof this.enemyManager?._isSpawnAreaClear === 'function') {
        if (!this.enemyManager._isSpawnAreaClear(pos, 0.4)) continue;
      }
      if (typeof filter === 'function' && !filter(pos)) continue;
      out.push(pos);
    }
    return out;
  }

  _computeSpawnWallBetweenBossAndPlayer(ctx, count) {
    const out = [];
    if (!ctx?.player?.position || count <= 0) return out;
    const bossPos = this.root.position.clone();
    const playerPos = ctx.player.position.clone();
    bossPos.y = 0;
    playerPos.y = 0;
    const axis = playerPos.clone().sub(bossPos);
    const distance = axis.length();
    if (distance < 5) return out;
    axis.normalize();
    const lateral = new this.THREE.Vector3(-axis.z, 0, axis.x);
    const anchorDistance = Math.min(8, Math.max(4.5, distance * 0.38));
    const anchor = bossPos.clone().addScaledVector(axis, anchorDistance);
    const spacing = 1.35;
    const bounds = this._arenaBounds(.45);

    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) * 0.5) * spacing;
      const direction = Math.sign(offset || 1);
      const candidates = [offset, offset + direction * spacing, offset - direction * spacing];
      let selected = null;
      for (const candidate of candidates) {
        const pos = anchor.clone().addScaledVector(lateral, candidate);
        pos.y = 1.2;
        pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
        pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
        if (this.enemyManager?._isSpawnAreaClear && !this.enemyManager._isSpawnAreaClear(pos, 0.38)) continue;
        const crowded = out.some(existing => {
          const dx = existing.x - pos.x;
          const dz = existing.z - pos.z;
          return dx * dx + dz * dz < 1.1 * 1.1;
        });
        if (crowded) continue;
        selected = pos;
        break;
      }
      if (selected) out.push(selected);
    }
    return out;
  }

  _arenaBounds(margin = 0) {
    const authored = this.enemyManager?.encounterHooks?.getBossArenaBounds?.(5) || null;
    const bounds = authored || { minX: -39, maxX: 39, minZ: -39, maxZ: 39 };
    return {
      minX: bounds.minX + margin,
      maxX: bounds.maxX - margin,
      minZ: bounds.minZ + margin,
      maxZ: bounds.maxZ - margin
    };
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
      const t = safeMinT + this.rng() * (tUpper - safeMinT);
      const base = bossPos.clone().add(dir.clone().multiplyScalar(L * t));
      const jitterMag = (0.8 + this.rng() * 1.2) * lateralJitterMul;
      const side = (this.rng() < 0.5 ? -1 : 1);
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

  _easeTo(current, target, rate) { return current + Math.max(-Math.abs(rate), Math.min(Math.abs(rate), target - current)); }
}
