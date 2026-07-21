// Strike Adjudicator (Content Court) – Boss Logic
// Requires: createStrikeAdjudicatorAsset({ THREE, mats, scale, palette })
// Exposes Purge Nodes that remove Strikes when destroyed.
// Phase 1: Citations (apply Strikes, spawn Purge Nodes) + gentle movement.
// Phase 2: Verdict patterns (alternating sector slams & gavel smashes).

import { logError } from '../util/log.js';
import { ReusablePool } from './reusable-pool.js';
import { createAdjudicatorMineVisual } from './visual-cache.js';
// Player debuffs: -5% move / Strike (max -15%), -0.3s Hype grace / Strike.
// If 3 Strikes at a Verdict → heavy slam + auto extra nodes.
//
// ctx contracts used:
// - ctx.scene, ctx.objects
// - ctx.moveWithCollisions(root, vec3)
// - ctx.player.position, ctx.onPlayerDamage(dmg)
// - ctx.blackboard (we set strikeSlowFactor, hypeGracePenaltySec)
// - enemyManager? (optional) for minion spawns (“runner” / “rusher”)

import { createStrikeAdjudicatorAsset } from '../assets/boss_adjudicator.js';

export const ADJUDICATOR_DAMAGE = Object.freeze({
  citationMine: 30,
  citationMinePhase2: 44,
  sector: 42,
  heavySector: 72,
  gavel: 50,
  heavyGavel: 82
});

export class StrikeAdjudicator {
  constructor({ THREE, mats, spawnPos, enemyManager = null, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    const built = createStrikeAdjudicatorAsset({ THREE, mats, scale: 1.0 });
    built.root.position.copy(spawnPos);
    built.root.userData = { type: 'boss_strike_adjudicator', head: built.head, hp: 35000 };
    this.root = built.root;
    this.refs = built.refs || {};

    // -------- Core state ----------
    this.maxHp = 35000;
    this.phase = 1;
    this.invuln = false;

    // Movement
    this.speed = 1.7;
    this._yaw = 0;
    this._ray = new THREE.Raycaster();

    // Strikes / Citations
    this.strikes = 0;                 // 0..3
    this._strikeTimer = 2.0;          // first citation soon after spawn
    this._strikeInterval = 11.5 + this.rng() * 2.0;

    // Verdict cadence (offset ~half cycle so it interleaves with citations)
    this._verdictTimer = this._strikeInterval * 0.5;
    this._verdictInterval = this._strikeInterval;
    this._verdictIndex = 0;           // even: sector, odd: gavel
    this._telegraph = null;
    this._teleTime = 0;
    this._teleReq = 0.85;
    this._teleData = null;

    // Weakpoint window after each Verdict
    this._weakpointTimer = 0;

    // Bailiffs use a real ability cadence. The previous scheduler sampled a
    // frame-sized probability only once per 1.2-second retry, which made the
    // expected first summon take several minutes at 60 FPS.
    this._addCooldown = 3.5 + this.rng() * 1.5;

    // Citation Mines: shoot the cyan purge core to remove a Strike, or leave
    // the red perimeter armed and risk a short-fuse proximity detonation.
    this._nodes = [];
    this._nodeHp = 90;
    this._nodePerCitation = 2;
    this._nodeCap = 6;
    this._nodePool = new ReusablePool({
      preallocate: 4,
      create: () => createAdjudicatorMineVisual({ THREE }),
      reset: visual => {
        visual.root.visible = true;
        visual.root.scale.setScalar(1);
        visual.refs.core.scale.setScalar(1);
        visual.refs.core.material.color.setHex(0x67e8f9);
        visual.refs.core.material.emissive?.setHex?.(0x0891b2);
        visual.refs.core.material.emissiveIntensity = 1.15;
        visual.refs.floorRing.material.color.setHex(0xf43f5e);
        visual.refs.floorRing.material.opacity = 0.2;
        visual.refs.purgeRing.material.opacity = 0.72;
        for (const ring of visual.refs.cage) {
          ring.material.color.setHex(0xf43f5e);
          ring.material.emissive?.setHex?.(0x7f1d1d);
          ring.material.emissiveIntensity = 0.85;
        }
      },
      release: (visual, scene) => {
        scene?.remove(visual.root);
        visual.root.visible = false;
      },
      destroy: visual => {
        visual.refs.core.material?.dispose?.();
        visual.refs.floorRing.material?.dispose?.();
        visual.refs.purgeRing.material?.dispose?.();
        visual.refs.cage[0]?.material?.dispose?.();
      }
    });

    // Safety
    this._arenaClamp = 39.0;
    this._t = 0;

    this._updateStrikeUI();
  }

  // ---------- Lifecycle ----------
  onRemoved(scene) {
    this._clearTele(scene);
    for (const node of this._nodes) this._releaseNode(node, { scene });
    this._nodes.length = 0;
    this._nodePool.destroy(scene);
    // Clear player debuffs
    this._applyPlayerDebuffs(0, null);
  }

  // ---------- Update ----------
  update(dt, ctx) {
    this._t += dt;

    // Phase swap at 60% HP
    if (this.phase === 1 && this.root.userData.hp <= this.maxHp * 0.6) {
      this.phase = 2;
      this._enterPhase2(ctx);
    }

    this._updateMovement(dt, ctx);
    this._tickNodes(dt, ctx);

    // Citations (Strikes + Purge Nodes)
    this._strikeTimer -= dt;
    if (this._strikeTimer <= 0) {
      this._strikeTimer = this._strikeInterval;
      this._applyCitation(ctx);
    }

    // Verdict patterns
    this._verdictTimer -= dt;
    if (this._verdictTimer <= 0) {
      const verdictRange = this._nextVerdictRange();
      const playerDistance = this.root.position.distanceTo(ctx.player.position);
      if (playerDistance <= verdictRange) {
        this._verdictTimer = this._verdictInterval;
        this._beginVerdictTelegraph(ctx);
      } else {
        // Keep the verdict ready while locomotion closes into an honest attack
        // opportunity; do not spend a telegraph on a guaranteed range miss.
        this._verdictTimer = 0;
      }
    }
    this._updateTelegraph(dt, ctx);

    // Weakpoint window (extra damage / emissive cue)
    if (this._weakpointTimer > 0) {
      this._weakpointTimer = Math.max(0, this._weakpointTimer - dt);
      if (this._weakpointTimer === 0) {
        // end window
        this.invuln = false;
        if (this.refs?.halo?.material?.emissiveIntensity != null) this.refs.halo.material.emissiveIntensity = 0.9;
        if (this.root.userData?.head?.material?.emissive) this.root.userData.head.material.emissive.setHex(0x111827);
        this.root.userData.damageMul = 1.0;
      }
    }

    // Light add spawns (bailiffs) while in combat (never more than 3 alive from this boss)
    if (this.enemyManager && this._addCooldown <= 0) {
      const mine = Array.from(this.enemyManager.instances || []).filter(inst => inst?.summoner === this).length;
      if (mine < 3) {
        ctx.emitAIEvent?.(this.root, 'ability_started', {
          ability: 'citation_bailiff', telegraphSeconds: 0
        });
        const p = ctx.player.position;
        const a = this.rng() * Math.PI * 2, r = 10 + this.rng() * 6;
        const pos = new this.THREE.Vector3(p.x + Math.cos(a)*r, 0.8, p.z + Math.sin(a)*r);
        const root = this.enemyManager.spawnAt('bailiff', pos, { countsTowardAlive: true });
        if (root) {
          root.userData.summonerRoot = this.root;
          root.userData.bossOwnerRoot = this.root;
          root.userData.summonRole = 'citation_bailiff';
          const inst = this.enemyManager.instanceByRoot?.get(root);
          if (inst) inst.summoner = this;
          ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
            ability: 'citation_bailiff', spawnedRoot: root, ownerRoot: this.root
          });
        }
        ctx.emitAIEvent?.(this.root, 'ability_released', {
          ability: 'citation_bailiff', spawnedCount: root ? 1 : 0
        });
        this._addCooldown = 6.5 + this.rng() * 2.0;
      } else {
        this._addCooldown = 1.2;
      }
    } else if (this._addCooldown > 0) {
      this._addCooldown -= dt;
    }

    // Death cleanup
    if (this.root.userData.hp <= 0) this.onRemoved(ctx.scene);
  }

  // ---------- Movement ----------
  _updateMovement(dt, ctx) {
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toP = playerPos.clone().sub(e.position);
    const dist = toP.length();
    toP.y = 0; if (toP.lengthSq() === 0) return; toP.normalize();

    // A gavel telegraph is a committed melee phase: stop strafing and turn the
    // attack front toward the target so the visible warning and damage cone
    // agree. Continuing the orbit here made every otherwise valid gavel miss.
    if (this._teleData) {
      const targetYaw = Math.atan2(toP.x, toP.z);
      const wrap = (a)=>{ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; };
      const yawDelta = wrap(targetYaw - this._yaw);
      this._yaw = wrap(this._yaw + Math.max(-8 * dt, Math.min(8 * dt, yawDelta)));
      e.rotation.set(0, this._yaw, 0);
      return;
    }

    // The Adjudicator's phase-one gavel only reaches four metres. Its old
    // eleven-metre orbit anchor made a healthy, unobstructed boss incapable of
    // ever completing that attack. Keep a phase-aware combat band instead.
    const desired = new this.THREE.Vector3();
    const minimumRange = this.phase === 1 ? 2.8 : 4.4;
    const defaultMaximumRange = this.phase === 1 ? 3.6 : 5.8;
    const maximumRange = this._verdictTimer <= 0
      ? Math.min(defaultMaximumRange, this._nextVerdictRange() - 0.35)
      : defaultMaximumRange;
    if (dist > maximumRange) desired.add(toP);
    else if (dist < minimumRange) desired.add(toP.clone().multiplyScalar(-1));
    else {
      const side = new this.THREE.Vector3(-toP.z, 0, toP.x);
      desired.add(side.multiplyScalar(0.7));
    }
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
      this._lastMovementResult = ctx.moveWithCollisions(e, step) || null;
      // face movement
      const yaw = Math.atan2(step.x, step.z);
      const wrap = (a)=>{ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; };
      let dy = wrap(yaw - this._yaw);
      this._yaw = wrap(this._yaw + Math.max(-4*dt, Math.min(4*dt, dy)));
      e.rotation.set(0, this._yaw, 0);
    }
    // clamp arena
    e.position.x = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.x));
    e.position.z = Math.max(-this._arenaClamp, Math.min(this._arenaClamp, e.position.z));
  }

  // ---------- Citations / Strikes ----------
  _applyCitation(ctx) {
    // Add a strike (cap 3) and spawn nodes
    const strikesBefore = this.strikes;
    this.strikes = Math.min(3, this.strikes + 1);
    this._updateStrikeUI();
    this._applyPlayerDebuffs(this.strikes, ctx);

    // Form a readable mine screen toward the player. Asset-local anchors were
    // only ~2m from the boss and produced an overlapping cage of solid purge
    // nodes, so they are intentionally not used for collision placement.
    const count = Math.min(this._nodePerCitation, Math.max(0, this._nodeCap - this._nodes.length));
    const minesBefore = this._nodes.length;
    ctx.emitAIEvent?.(this.root, 'citation_applied', {
      ability: 'citation', strikesBefore, strikesAfter: this.strikes, requestedMines: count
    });
    const positions = this._citationMinePositions(ctx, count, { forwardDistance: 5.8, lateralSpacing: 3.2 });
    for (let i = 0; i < positions.length; i++) this._spawnNode(ctx, positions[i], { slot: i, source: 'citation' });
    ctx.emitAIEvent?.(this.root, 'citation_formation_completed', {
      ability: 'citation', requestedMines: count, spawnedMines: this._nodes.length - minesBefore
    });
  }

  _citationMinePositions(ctx, count, { forwardDistance = 5.8, lateralSpacing = 3.2, rotation = 0 } = {}) {
    if (count <= 0) return [];
    const THREE = this.THREE;
    const toPlayer = ctx.player.position.clone().sub(this.root.position).setY(0);
    if (toPlayer.lengthSq() <= 0.0001) toPlayer.set(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    toPlayer.normalize();
    if (rotation) {
      const x = toPlayer.x * Math.cos(rotation) - toPlayer.z * Math.sin(rotation);
      const z = toPlayer.x * Math.sin(rotation) + toPlayer.z * Math.cos(rotation);
      toPlayer.set(x, 0, z);
    }
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const offsets = count === 1
      ? [0]
      : Array.from({ length: count }, (_, i) => (i - (count - 1) * 0.5) * lateralSpacing * 2);
    const results = [];
    const forwardCandidates = [forwardDistance, forwardDistance + 1.4, forwardDistance - 1.0];
    for (let i = 0; i < offsets.length; i++) {
      let selected = null;
      for (const forward of forwardCandidates) {
        const candidate = this.root.position.clone()
          .addScaledVector(toPlayer, forward)
          .addScaledVector(side, offsets[i]);
        candidate.y = 0;
        const bossClearance = candidate.distanceTo(this.root.position);
        const outsideBossBody = bossClearance >= 4.0;
        const spawnClear = typeof this.enemyManager?._isSpawnAreaClear !== 'function'
          || this.enemyManager._isSpawnAreaClear(candidate.clone().setY(0.8), 0.45);
        if (outsideBossBody && spawnClear) { selected = candidate; break; }
      }
      if (selected) results.push(selected);
    }
    return results;
  }

  _updateStrikeUI() {
    // Light up strike pips
    const pips = this.refs?.strikePips || [];
    for (let i = 0; i < pips.length; i++) {
      const on = i < this.strikes;
      const m = pips[i].material;
      if (m?.emissiveIntensity != null) m.emissiveIntensity = on ? 1.2 : 0.2;
      pips[i].scale.setScalar(on ? 1.0 : 0.9);
    }
  }

  _applyPlayerDebuffs(n, ctx) {
    // Write into blackboard so your player system can read it
    const bb = (ctx && ctx.blackboard) ? ctx.blackboard : (this._bb ||= {});
    bb.strikeSlowFactor = Math.max(0.85, 1 - 0.05 * n);        // 1.0, 0.95, 0.90, 0.85
    bb.hypeGracePenaltySec = 0.3 * n;                           // 0, 0.3, 0.6, 0.9
  }

  // ---------- Citation Mines / Purge Cores ----------
  _spawnNode(ctx, pos, { slot = null, source = 'citation' } = {}) {
    const visual = this._nodePool.acquire();
    const root = visual.root;
    root.position.copy(pos);
    root.position.y = 0;
    root.userData = {
      type: 'purge_node',
      displayName: 'Citation Mine',
      hp: this._nodeHp,
      maxHp: this._nodeHp,
      head: visual.refs.core,
      knockbackImmune: true,
      summonerRoot: this.root,
      bossOwnerRoot: this.root,
      summonRole: 'citation_mine'
    };
    const node = {
      root,
      visual,
      hp: this._nodeHp,
      dead: false,
      armed: false,
      triggered: false,
      t: 0,
      fuse: 0,
      armDuration: this.phase === 2 ? 0.55 : 0.9,
      triggerRadius: this.phase === 2 ? 2.7 : 2.25,
      damage: this.phase === 2 ? ADJUDICATOR_DAMAGE.citationMinePhase2 : ADJUDICATOR_DAMAGE.citationMine
    };
    const instance = {
      root,
      behaviorId: 'purge_node',
      update() {},
      onRemoved: () => { node.registered = false; }
    };
    if (this.enemyManager?.registerExternalEnemy) {
      this.enemyManager.registerExternalEnemy(instance, { countsTowardAlive: false });
      node.registered = true;
    } else {
      ctx.scene.add(root);
    }
    this._nodes.push(node);
    ctx.emitAIEvent?.(this.root, 'boss_add_spawned', {
      ability: 'citation_mine', spawnedRoot: root, ownerRoot: this.root
    });
    ctx.emitAIEvent?.(this.root, 'citation_mine_spawned', {
      ability: 'citation_mine', spawnedRoot: root, ownerRoot: this.root,
      slot, source, position: root.position.clone(), distanceToBoss: root.position.distanceTo(this.root.position)
    });
    return node;
  }

  _tickNodes(dt, ctx) {
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      if (!n || !n.root) { this._nodes.splice(i,1); continue; }
      const hp = n.root.userData?.hp ?? n.hp;
      if (hp <= 0 && !n.dead) {
        this._purgeNode(n, ctx);
        this._nodes.splice(i, 1);
        continue;
      }

      n.t += dt;
      this._animateNode(n);
      if (!n.armed && n.t >= n.armDuration) {
        n.armed = true;
        n.visual.refs.floorRing.material.opacity = 0.58;
        ctx.emitAIEvent?.(this.root, 'citation_mine_armed', {
          ability: 'citation_mine', spawnedRoot: n.root, ownerRoot: this.root,
          position: n.root.position.clone(), triggerRadius: n.triggerRadius
        });
      }

      const dx = ctx.player.position.x - n.root.position.x;
      const dz = ctx.player.position.z - n.root.position.z;
      const distance = Math.hypot(dx, dz);
      let triggeredThisFrame = false;
      if (n.armed && !n.triggered && distance <= n.triggerRadius) {
        n.triggered = true;
        n.fuse = 0.6;
        triggeredThisFrame = true;
        ctx.emitAIEvent?.(this.root, 'citation_mine_triggered', {
          ability: 'citation_mine', spawnedRoot: n.root, ownerRoot: this.root,
          distanceToPlayer: distance, fuseSeconds: n.fuse
        });
      }
      if (n.triggered && !triggeredThisFrame) {
        n.fuse -= dt;
        const flash = Math.sin(n.fuse * 42) > 0;
        n.visual.refs.core.material.color.setHex(flash ? 0xffffff : 0xf43f5e);
        n.visual.refs.floorRing.material.opacity = flash ? 0.9 : 0.42;
        if (n.fuse <= 0) {
          this._detonateNode(n, ctx);
          this._nodes.splice(i, 1);
        }
      }
    }
  }

  _enterPhase2(ctx) {
    // Existing mines overcharge: larger trigger radius, faster arming, and a
    // brighter perimeter instead of turning the devices into sliding blocks.
    for (const n of this._nodes) {
      n.armDuration = Math.min(n.armDuration, 0.55);
      n.triggerRadius = 2.7;
      n.damage = ADJUDICATOR_DAMAGE.citationMinePhase2;
      n.visual.refs.floorRing.scale.setScalar(1.2);
    }
  }

  _animateNode(node) {
    const refs = node.visual.refs;
    refs.core.rotation.y += 0.045;
    refs.core.position.y = 0.9 + Math.sin(node.t * 4.5) * 0.06;
    refs.cage[0].rotation.y += 0.018;
    refs.cage[1].rotation.z -= 0.022;
    refs.cage[2].rotation.x += 0.02;
    const pulse = 0.9 + Math.sin(node.t * (node.triggered ? 22 : 7)) * 0.1;
    refs.floorRing.scale.setScalar((this.phase === 2 ? 1.2 : 1) * pulse);
    refs.purgeRing.rotation.z += 0.025;
  }

  _purgeNode(node, ctx) {
    node.dead = true;
    if (this.strikes > 0) {
      this.strikes -= 1;
      this._updateStrikeUI();
      this._applyPlayerDebuffs(this.strikes, ctx);
    }
    try { globalThis.window?._EFFECTS?.ring?.(node.root.position.clone(), 1.35, 0x67e8f9); } catch (e) { logError(e); }
    ctx.emitAIEvent?.(this.root, 'citation_mine_purged', {
      ability: 'citation_mine', spawnedRoot: node.root, ownerRoot: this.root, strikesAfter: this.strikes
    });
    this._releaseNode(node, ctx);
  }

  _detonateNode(node, ctx) {
    node.dead = true;
    const away = ctx.player.position.clone().sub(node.root.position).setY(0);
    const distance = away.length();
    const hitPlayer = distance <= node.triggerRadius + 0.55;
    if (hitPlayer) {
      ctx.onPlayerDamage?.(node.damage, 'mine', {
        sourceRoot: this.root, ownerRoot: this.root, sourceOrigin: node.root.position.clone(), sourceKind: 'citation_mine'
      });
      if (away.lengthSq() > 0) this._applyPlayerKnockback(ctx, away.normalize().multiplyScalar(1.15), 'citation_mine');
    }
    ctx.emitAIEvent?.(this.root, 'citation_mine_detonated', {
      ability: 'citation_mine', spawnedRoot: node.root, ownerRoot: this.root,
      hitPlayer, damage: hitPlayer ? node.damage : 0, distanceToPlayer: distance
    });
    try { globalThis.window?._EFFECTS?.ring?.(node.root.position.clone(), node.triggerRadius, 0xf43f5e); } catch (e) { logError(e); }
    this._releaseNode(node, ctx);
  }

  _releaseNode(node, ctx) {
    if (!node?.visual) return;
    if (this.enemyManager?.enemies?.has(node.root)) this.enemyManager.remove(node.root);
    else ctx?.scene?.remove?.(node.root);
    this._nodePool.release(node.visual, ctx?.scene);
    node.visual = null;
  }

  // ---------- Verdict (telegraph -> resolve) ----------
  _nextVerdictRange() {
    if (this.phase === 1) return 3.9;
    return (this._verdictIndex % 2) === 0 ? 6.25 : 3.9;
  }

  _beginVerdictTelegraph(ctx) {
    this._clearTele(ctx.scene);
    this._teleTime = 0;
    const even = (this._verdictIndex++ % 2) === 0;
    if (this.phase === 1) {
      // Phase 1: only gavel front smash
      this._teleData = { kind: 'gavel', heavy: (this.strikes >= 3) };
      this._spawnGavelTele(ctx);
    } else {
      // Phase 2: alternate sector <-> gavel
      if (even) {
        this._teleData = { kind: 'sector', width: Math.PI/3, heavy: (this.strikes >= 3) }; // 60°
        this._spawnSectorTele(ctx);
      } else {
        this._teleData = { kind: 'gavel', heavy: (this.strikes >= 3) };
        this._spawnGavelTele(ctx);
      }
    }
    ctx.emitAIEvent?.(this.root, 'verdict_started', {
      ability: 'verdict', kind: this._teleData.kind, heavy: !!this._teleData.heavy,
      distanceToPlayer: this.root.position.distanceTo(ctx.player.position), telegraphSeconds: this._teleReq
    });
  }

  _updateTelegraph(dt, ctx) {
    if (!this._teleData) return;
    this._teleTime += dt;

    // Dial pulse for feedback
    if (this.refs?.sectorDial) {
      const m = this.refs.sectorDial.material;
      if (m?.opacity != null) m.opacity = 0.45 + 0.25 * Math.sin(this._t * 6.0);
      this.refs.sectorDial.rotation.z += dt * 0.4;
    }

    if (this._teleTime >= this._teleReq) {
      // resolve
      const kind = this._teleData.kind;
      const heavy = !!this._teleData.heavy;
      if (kind === 'sector') this._resolveSector(ctx, heavy);
      else this._resolveGavel(ctx, heavy);
      // weakpoint window after every verdict
      this._beginWeakpointWindow(ctx, heavy ? 2.3 : 1.7);
      this._clearTele(ctx.scene);
      this._teleData = null;

      // If heavy (3 strikes), auto-spawn extra nodes for recovery
      if (heavy) {
        const remaining = Math.max(0, this._nodeCap - this._nodes.length);
        const positions = this._citationMinePositions(ctx, Math.min(2, remaining), {
          forwardDistance: 6.8, lateralSpacing: 3.5, rotation: Math.PI * 0.5
        });
        for (let i = 0; i < positions.length; i++) this._spawnNode(ctx, positions[i], { slot: i, source: 'heavy_verdict' });
      }
    }
  }

  _spawnSectorTele(ctx) {
    // Wedge toward the player
    const toP = ctx.player.position.clone().sub(this.root.position); toP.y = 0; toP.normalize();
    const facing = Math.atan2(toP.x, toP.z);
    const width = this._teleData.width;
    const start = facing - width * 0.5;
    const end   = facing + width * 0.5;
    this._telegraph = this._makeSectorMesh(start, end, 0.8, 6.5, 0x60a5fa, 0.75);
    this._telegraph.position.set(this.root.position.x, 0.03, this.root.position.z);
    ctx.scene.add(this._telegraph);
  }

  _resolveSector(ctx, heavy) {
    const dmg = heavy ? ADJUDICATOR_DAMAGE.heavySector : ADJUDICATOR_DAMAGE.sector;
    const knock = heavy ? 1.2 : 0.7;
    // Angle test
    const from = this.root.position.clone();
    const toP = ctx.player.position.clone().sub(from); const dist = toP.length();
    let hitPlayer = false;
    let worldBlocked = false;
    if (dist > 6.5 || toP.setY(0).lengthSq() === 0) {
      ctx.emitAIEvent?.(this.root, 'verdict_released', {
        ability: 'verdict', kind: 'sector', heavy, hitPlayer, worldBlocked, distanceToPlayer: dist
      });
      return;
    }
    toP.normalize();
    // recompute sector params from telegraph
    const m = this._telegraph.userData;
    const cosStart = Math.cos(m.start), sinStart = Math.sin(m.start);
    const cosEnd   = Math.cos(m.end),   sinEnd   = Math.sin(m.end);
    const ang = Math.atan2(toP.x, toP.z);
    const within = this._angleWithin(ang, m.start, m.end);
    if (within) {
      const THREE = this.THREE;
      const origin = new THREE.Vector3(from.x, from.y + 1.2, from.z);
      const target = new THREE.Vector3(ctx.player.position.x, 1.5, ctx.player.position.z);
      const dir = target.clone().sub(origin);
      const distToPlayer = dir.length();
      if (distToPlayer > 0) {
        dir.normalize();
        this._ray.set(origin, dir);
        this._ray.far = distToPlayer - 0.1;
        const hits = this._ray.intersectObjects(ctx.objects || [], false);
        worldBlocked = !!(hits && hits.length > 0);
        if (!worldBlocked) {
          ctx.onPlayerDamage(dmg, 'verdict_sweep', {
            sourceRoot: this.root, ownerRoot: this.root, sourceOrigin: origin.clone(), sourceKind: 'verdict_sweep'
          });
          hitPlayer = true;
          const knockDir = toP.clone().normalize().multiplyScalar(knock);
          this._applyPlayerKnockback(ctx, knockDir, 'verdict_sweep');
        }
      }
    }
    ctx.emitAIEvent?.(this.root, 'verdict_released', {
      ability: 'verdict', kind: 'sector', heavy, hitPlayer, worldBlocked, distanceToPlayer: dist
    });
    // pulse ring
    try { window?._EFFECTS?.ring?.(from.clone(), 6.5, 0x60a5fa); } catch (e) { logError(e); }
  }

  _spawnGavelTele(ctx) {
    // Simple ring in front of the gavel head
    const impact = this.refs?.gavelImpact?.getWorldPosition?.(new this.THREE.Vector3()) || this.root.position.clone().add(new this.THREE.Vector3(0,0,-1));
    const ring = new this.THREE.Mesh(
      new this.THREE.RingGeometry(0.6, 1.2, 28),
      new this.THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.85, side: this.THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI/2;
    ring.position.set(impact.x, 0.04, impact.z);
    ring.userData.life = 0;
    ctx.scene.add(ring);
    this._telegraph = ring;

    // arm pose
    try {
      const arm = this.refs?.rightArm; if (arm) arm.rotation.x = -0.45;
      const head = this.refs?.gavelHead; if (head) head.scale.set(1.05,1.05,1.05);
    } catch (e) { logError(e); }
  }

  _resolveGavel(ctx, heavy) {
    // Damage in a short cone ahead of boss
    const origin = this.root.position.clone();
    const forward = new this.THREE.Vector3(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    const toP = ctx.player.position.clone().sub(origin); toP.y = 0;
    const dist = toP.length();
    let hitPlayer = false;
    if (dist <= 4.0 && toP.lengthSq() > 0) toP.normalize();
    const cos = dist <= 4.0 ? forward.dot(toP) : -1;
    if (cos >= Math.cos(Math.PI/6)) { // ~30° cone
      const dmg = heavy ? ADJUDICATOR_DAMAGE.heavyGavel : ADJUDICATOR_DAMAGE.gavel;
      const knock = heavy ? 1.5 : 0.9;
      ctx.onPlayerDamage(dmg, 'gavel', {
        sourceRoot: this.root, ownerRoot: this.root, sourceOrigin: origin.clone(), sourceKind: 'gavel'
      });
      hitPlayer = true;
      this._applyPlayerKnockback(ctx, toP.multiplyScalar(knock), 'gavel');
    }
    ctx.emitAIEvent?.(this.root, 'verdict_released', {
      ability: 'verdict', kind: 'gavel', heavy, hitPlayer, worldBlocked: false, distanceToPlayer: dist
    });
    // VFX + reset pose
    try { window?._EFFECTS?.ring?.(origin.clone().add(forward.multiplyScalar(2.0)), 1.6, 0x60a5fa); } catch (e) { logError(e); }
    try {
      const arm = this.refs?.rightArm; if (arm) arm.rotation.x = 0;
      const head = this.refs?.gavelHead; if (head) head.scale.set(1,1,1);
    } catch (e) { logError(e); }
  }

  _beginWeakpointWindow(ctx, seconds) {
    this._weakpointTimer = seconds;
    this.invuln = false;                 // ensure vulnerable
    this.root.userData.damageMul = 1.35; // let your damage system read this multiplier if you support it
    // visual cue
    if (this.refs?.halo?.material?.emissiveIntensity != null) this.refs.halo.material.emissiveIntensity = 1.5;
    if (this.root.userData?.head?.material?.emissive) this.root.userData.head.material.emissive.setHex(0x60a5fa);
  }

  // ---------- Helpers ----------
  _applyPlayerKnockback(ctx, vector, ability) {
    if (!vector || vector.lengthSq() <= 0) return;
    if (typeof ctx.applyPlayerKnockback === 'function') ctx.applyPlayerKnockback(vector);
    else ctx.player.position.add(vector);
    ctx.emitAIEvent?.(this.root, 'player_knockback', {
      ability, vector: vector.clone(), magnitude: vector.length()
    });
  }

  _clearTele(scene) {
    if (this._telegraph && scene) {
      scene.remove(this._telegraph);
      this._telegraph.geometry?.dispose?.();
      this._telegraph.material?.dispose?.();
      this._telegraph = null;
    }
  }

  _makeSectorMesh(startAng, endAng, innerR, outerR, color, opacity) {
    // triangle fan ring sector
    const steps = 36;
    const g = new this.THREE.BufferGeometry();
    const verts = [];
    const c = Math.max(3, Math.floor(steps * Math.abs(endAng - startAng) / (Math.PI * 2)));
    for (let i = 0; i < c; i++) {
      const a0 = startAng + (endAng - startAng) * (i / c);
      const a1 = startAng + (endAng - startAng) * ((i+1) / c);
      const p0i = [Math.sin(a0)*innerR, 0, Math.cos(a0)*innerR];
      const p0o = [Math.sin(a0)*outerR, 0, Math.cos(a0)*outerR];
      const p1o = [Math.sin(a1)*outerR, 0, Math.cos(a1)*outerR];
      const p1i = [Math.sin(a1)*innerR, 0, Math.cos(a1)*innerR];
      // two tris per quad: p0i-p0o-p1o, p0i-p1o-p1i
      verts.push(...p0i, ...p0o, ...p1o, ...p0i, ...p1o, ...p1i);
    }
    g.setAttribute('position', new this.THREE.Float32BufferAttribute(new Float32Array(verts), 3));
    g.computeVertexNormals();
    const m = new this.THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: this.THREE.DoubleSide });
    const mesh = new this.THREE.Mesh(g, m);
    mesh.userData = { start: startAng, end: endAng };
    return mesh;
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
      this._ray.set(origin, dir);
      this._ray.far = dist - 0.1;
      const hits = this._ray.intersectObjects(objects, false);
      if (hits && hits.length > 0) return false;
    }
    return true;
  }

  _angleWithin(a, start, end) {
    // normalize to [-PI,PI], support wrap
    const norm = (x)=>{while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;return x;};
    a = norm(a); start = norm(start); end = norm(end);
    if (start <= end) return a >= start && a <= end;
    return (a >= start && a <= Math.PI) || (a >= -Math.PI && a <= end);
  }
}
