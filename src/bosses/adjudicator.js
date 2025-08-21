// Strike Adjudicator (Content Court) – Boss Logic
// Requires: createStrikeAdjudicatorAsset({ THREE, mats, scale, palette })
// Exposes Purge Nodes that remove Strikes when destroyed.
// Phase 1: Citations (apply Strikes, spawn Purge Nodes) + gentle movement.
// Phase 2: Verdict patterns (alternating sector slams & gavel smashes).
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

export class StrikeAdjudicator {
  constructor({ THREE, mats, spawnPos, enemyManager = null }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;

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
    this._strikeInterval = 11.5 + Math.random() * 2.0;

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

    // Purge Nodes / Bailiffs
    this._nodes = [];                 // { root, bailiff, dead }
    this._nodeHp = 60;
    this._nodePerCitation = 2;

    // Safety
    this._arenaClamp = 39.0;
    this._t = 0;

    this._updateStrikeUI();
  }

  // ---------- Lifecycle ----------
  onRemoved(scene) {
    this._clearTele(scene);
    for (const n of this._nodes) {
      if (!n.root) continue;
      if (n.bailiff && this.enemyManager) this.enemyManager.remove(n.root);
      else if (scene) scene.remove(n.root);
    }
    this._nodes.length = 0;
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
      this._verdictTimer = this._verdictInterval;
      this._beginVerdictTelegraph(ctx);
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
    if (this.enemyManager && (this._addCooldown || 0) <= 0) {
      const mine = Array.from(this.enemyManager.instances || []).filter(inst => inst?.summoner === this).length;
      if (mine < 3 && Math.random() < 0.18 * dt) {
        const p = ctx.player.position;
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 6;
        const pos = new this.THREE.Vector3(p.x + Math.cos(a)*r, 0.8, p.z + Math.sin(a)*r);
        const root = this.enemyManager.spawnAt('bailiff', pos, { countsTowardAlive: true });
        if (root) {
          const inst = this.enemyManager.instanceByRoot?.get(root);
          if (inst) inst.summoner = this;
        }
        this._addCooldown = 6.5 + Math.random() * 2.0;
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
    const toP = ctx.player.position.clone().sub(e.position);
    const dist = toP.length();
    toP.y = 0; if (toP.lengthSq() === 0) return; toP.normalize();

    const desired = new this.THREE.Vector3();
    if (dist > 11) desired.add(toP);
    else {
      // orbit a bit
      const side = new this.THREE.Vector3(-toP.z, 0, toP.x);
      desired.add(side.multiplyScalar(0.7));
    }
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
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
    this.strikes = Math.min(3, this.strikes + 1);
    this._updateStrikeUI();
    this._applyPlayerDebuffs(this.strikes, ctx);

    // Spawn Purge Nodes near suggested anchors (asset refs) or around boss
    const count = this._nodePerCitation;
    const anchorWorlds = (this.refs?.nodeAnchors || []).map(a => a.getWorldPosition(new this.THREE.Vector3()));
    for (let i = 0; i < count; i++) {
      const pos = anchorWorlds[i] ? anchorWorlds[i].clone() :
        this.root.position.clone().add(new this.THREE.Vector3((i===0? -2.2:2.2), 0.2, 1.6));
      this._spawnNode(ctx, pos);
    }
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

  // ---------- Purge Nodes / Bailiffs ----------
  _spawnNode(ctx, pos) {
    const THREE = this.THREE;
    const mat = this.mats.enemy.clone();
    mat.color = new THREE.Color(0xf43f5e);
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 8), mat);
    root.position.copy(pos);
    root.userData = { type: 'purge_node', hp: this._nodeHp };

    // Subtle ground ring to telegraph that nodes are destructible
    try {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 20),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.31;
      root.add(ring);
    } catch (_) {}

    // Register with EnemyManager so generic damage applies
    if (this.enemyManager && typeof this.enemyManager.registerExternalEnemy === 'function') {
      this.enemyManager.registerExternalEnemy({ root, update() {} }, { countsTowardAlive: true });
    } else {
      ctx.scene.add(root);
    }

    const node = { root, bailiff: false, dead: false };
    this._nodes.push(node);
    return node;
  }

  _tickNodes(dt, ctx) {
    const em = this.enemyManager;
    if (!em) return;

    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      if (!n || !n.root) { this._nodes.splice(i, 1); continue; }

      const alive = em.enemies.has(n.root);

      // If HP depleted but still registered, remove via manager
      if (alive && n.root.userData?.hp <= 0) {
        em.remove(n.root);
      }

      // Node destroyed -> remove strike and cleanup
      if (!em.enemies.has(n.root) && !n.dead) {
        n.dead = true;
        if (this.strikes > 0) {
          this.strikes -= 1;
          this._updateStrikeUI();
          this._applyPlayerDebuffs(this.strikes, ctx);
        }
        try { window?._EFFECTS?.ring?.(n.root.position.clone(), 0.9, 0x60a5fa); } catch (_) {}
        this._nodes.splice(i, 1);
      }
    }
  }

  _enterPhase2(ctx) {
    // Convert existing nodes into Bailiff enemies
    for (const n of this._nodes) {
      const pos = n.root?.position?.clone();
      if (this.enemyManager && pos) {
        this.enemyManager.remove(n.root);
        const bRoot = this.enemyManager.spawnAt('bailiff', pos, { countsTowardAlive: true });
        if (bRoot) {
          const inst = this.enemyManager.instanceByRoot?.get(bRoot);
          if (inst) inst.summoner = this;
          n.root = bRoot;
          n.bailiff = true;
          n.dead = false;
        }
      } else if (n.root && ctx.scene) {
        // Fallback: just recolor
        if (n.root.material?.emissive) n.root.material.emissive.setHex(0x60a5fa);
      }
    }
  }

  // ---------- Verdict (telegraph -> resolve) ----------
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
        for (let i = 0; i < 2; i++) {
          const a = Math.random()*Math.PI*2, r = 2.2 + Math.random()*1.0;
          const pos = this.root.position.clone().add(new this.THREE.Vector3(Math.cos(a)*r, 0.2, Math.sin(a)*r));
          this._spawnNode(ctx, pos);
        }
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
    const dmg = heavy ? 60 : 32;
    const knock = heavy ? 1.2 : 0.7;
    // Angle test
    const from = this.root.position.clone();
    const toP = ctx.player.position.clone().sub(from); const dist = toP.length(); if (dist > 6.5) return;
    toP.y = 0; if (toP.lengthSq() === 0) return; toP.normalize();
    // recompute sector params from telegraph
    const m = this._telegraph.userData;
    const cosStart = Math.cos(m.start), sinStart = Math.sin(m.start);
    const cosEnd   = Math.cos(m.end),   sinEnd   = Math.sin(m.end);
    const ang = Math.atan2(toP.x, toP.z);
    const within = this._angleWithin(ang, m.start, m.end);
    if (within) {
      ctx.onPlayerDamage(dmg);
      const dir = toP.clone().normalize();
      ctx.player.position.add(dir.multiplyScalar(knock));
    }
    // pulse ring
    try { window?._EFFECTS?.ring?.(from.clone(), 6.5, 0x60a5fa); } catch(_){}
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
    } catch(_){}
  }

  _resolveGavel(ctx, heavy) {
    // Damage in a short cone ahead of boss
    const origin = this.root.position.clone();
    const forward = new this.THREE.Vector3(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    const toP = ctx.player.position.clone().sub(origin); toP.y = 0;
    const dist = toP.length(); if (dist > 4.0) return;
    if (toP.lengthSq() > 0) toP.normalize();
    const cos = forward.dot(toP);
    if (cos >= Math.cos(Math.PI/6)) { // ~30° cone
      const dmg = heavy ? 70 : 38;
      const knock = heavy ? 1.5 : 0.9;
      ctx.onPlayerDamage(dmg);
      ctx.player.position.add(toP.multiplyScalar(knock));
    }
    // VFX + reset pose
    try { window?._EFFECTS?.ring?.(origin.clone().add(forward.multiplyScalar(2.0)), 1.6, 0x60a5fa); } catch(_){}
    try {
      const arm = this.refs?.rightArm; if (arm) arm.rotation.x = 0;
      const head = this.refs?.gavelHead; if (head) head.scale.set(1,1,1);
    } catch(_){}
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

  _angleWithin(a, start, end) {
    // normalize to [-PI,PI], support wrap
    const norm = (x)=>{while(x>Math.PI)x-=2*Math.PI;while(x<-Math.PI)x+=2*Math.PI;return x;};
    a = norm(a); start = norm(start); end = norm(end);
    if (start <= end) return a >= start && a <= end;
    return (a >= start && a <= Math.PI) || (a >= -Math.PI && a <= end);
  }
}
