// Echo Hydraclone (Fractal Replicator) — boss + clones logic
import { createHydracloneAsset } from '../assets/boss_hydraclone.js';

const GEN = {
  0: { scale: 1.00, hp: 9000, speed: 2.6, dps: 20,  splitCount: 4 },
  1: { scale: 0.55, hp:  1200, speed: 3.2, dps: 10,  splitCount: 3 },
  2: { scale: 0.35, hp:   500, speed: 3.8, dps:  7,  splitCount: 2 },
  3: { scale: 0.22, hp:   200, speed: 4.5, dps:  5,  splitCount: 0 }, // no further splits
};

// todo: should not spawn grunts, different ability

// Global spawn/cap & lineage bookkeeping (shared across all instances)
class HydraGlobal {
  static CAP = 36;
  static active = 0;

  // spawn queue: items = {gen, bossId, pos, yJitter, src, THREE, mats, enemyManager}
  static queue = [];
  static queueAccum = 0;
  static queueStep = 0.25;

  // lineage data keyed by bossId
  // { alive: number, descendants: number, started: true }
  static lineages = new Map();

  static ensureLineage(bossId) {
    if (!HydraGlobal.lineages.has(bossId)) {
      HydraGlobal.lineages.set(bossId, { alive: 0, descendants: 0, started: true });
    }
    return HydraGlobal.lineages.get(bossId);
  }

  static registerSpawn(bossId) {
    HydraGlobal.active++;
    const L = HydraGlobal.ensureLineage(bossId);
    L.alive++;
    L.descendants = Math.max(0, L.alive - 1); // show "Descendants: xN" (exclude the original)
  }
  static registerDeath(bossId) {
    HydraGlobal.active = Math.max(0, HydraGlobal.active - 1);
    const L = HydraGlobal.ensureLineage(bossId);
    L.alive = Math.max(0, L.alive - 1);
    L.descendants = Math.max(0, L.alive - 1);
  }

  static enqueue(item) { HydraGlobal.queue.push(item); }

  // Called from any instance once per frame to trickle spawns
  static processQueue(dt, ctx) {
    if (!HydraGlobal.queue.length) return;
    HydraGlobal.queueAccum += dt;
    if (HydraGlobal.queueAccum < HydraGlobal.queueStep) return;
    HydraGlobal.queueAccum = 0;

    // Try to pop one (or two if lots queued) while under CAP
    let tries = HydraGlobal.queue.length > 10 ? 2 : 1;
    while (tries-- > 0 && HydraGlobal.queue.length && HydraGlobal.active < HydraGlobal.CAP) {
      const it = HydraGlobal.queue.shift();
      const inst = new Hydraclone({
        THREE: it.THREE,
        mats: it.mats,
        spawnPos: it.pos.clone().setY(0.8 + (it.yJitter || 0)),
        enemyManager: it.enemyManager,
        generation: it.gen,
        bossId: it.bossId,
      });
      Hydraclone.registerInstance(inst, ctx); // ensures scene + manager registration
    }
  }
}

export class Hydraclone {
  constructor({ THREE, mats, spawnPos, generation = 0, enemyManager = null, bossId = null }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.gen = Math.max(0, Math.min(3, generation));

    // Establish lineage id (the very first/gen0 becomes its own bossId)
    this.bossId = bossId || `hydra_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    HydraGlobal.registerSpawn(this.bossId);

    // Build asset
    const built = createHydracloneAsset({
      THREE,
      mats,
      generation: this.gen,
      scale: GEN[this.gen].scale
    });
    this.root = built.root;
    this.head = built.head;

    // Place
    this.root.position.copy(spawnPos || new THREE.Vector3());
    this.root.userData = {
      type: (this.gen === 0 ? 'boss_hydraclone' : 'hydraclone'),
      head: this.head,
      hp: GEN[this.gen].hp,
      bossId: this.bossId,
      generation: this.gen
    };

    // Movement & behavior state
    this.speed = GEN[this.gen].speed;
    this.dps = GEN[this.gen].dps;
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0;
    this._walkPhase = 0;

    // Surround bias – each instance uses a persistent arc angle
    this._arcAngle = (Math.random() * Math.PI * 2);
    this._arcSign = (Math.random() < 0.5 ? -1 : 1);
    this._preferRadius = [5.5, 4.8, 4.2, 3.6][this.gen];
    this._lastPos = this.root.position.clone();

    // Gen3 anti-kite
    this._farTimer = 0;

    // For small contact cooldown so DPS doesn’t explode at low FPS
    this._contactAcc = 0;
  }

  // --- Manager/scene registration helper (used by global queue spawns) ---
  static registerInstance(inst, ctx) {
    if (inst.enemyManager && typeof inst.enemyManager.registerExternalEnemy === 'function') {
      inst.enemyManager.registerExternalEnemy(inst, { countsTowardAlive: true });
      return inst;
    }
    // Fallback if no manager helper available
    ctx?.scene?.add?.(inst.root);
    return inst;
  }

  // --- Runtime split after death ---
  _splitIntoChildren(ctx) {
    const splitCount = GEN[this.gen].splitCount;
    if (!splitCount) return;

    const THREE = this.THREE;
    const origin = this.root.position.clone();
    const playerPos = ctx.player.position.clone();

    // Short knockback pulse to clear space
    const pushDir = playerPos.clone().sub(origin).setY(0);
    if (pushDir.lengthSq() > 0) {
      pushDir.normalize();
      const knock = 1.4 + (this.gen * 0.2);
      ctx.player.position.add(pushDir.multiplyScalar(knock));
    }
    try { window?._EFFECTS?.ring?.(origin.clone(), 1.8 + this.gen * 0.6, 0x22e3ef); } catch(_) {}

    // Spawn ring (avoid player safe radius ~2.0)
    const safeR = 2.0;
    const radius = Math.max(1.1, (this.root.userData?.bounds?.radius || 0.8) + 0.6);
    for (let i = 0; i < splitCount; i++) {
      const a = (i / splitCount) * Math.PI * 2 + Math.random() * 0.35;
      const r = radius + 0.25 + Math.random() * 0.35;
      const pos = new THREE.Vector3(origin.x + Math.cos(a) * r, origin.y, origin.z + Math.sin(a) * r);

      // steer away if too close to player
      const dx = pos.x - playerPos.x, dz = pos.z - playerPos.z;
      if (Math.hypot(dx, dz) < safeR) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        pos.add(dir.multiplyScalar(safeR - Math.hypot(dx, dz) + 0.1));
      }

      const yJitter = (Math.random() - 0.5) * 0.2;

      // Respect global cap: queue if necessary
      HydraGlobal.enqueue({
        gen: this.gen + 1,
        bossId: this.bossId,
        pos, yJitter,
        THREE: this.THREE, mats: this.mats,
        enemyManager: this.enemyManager
      });
    }

    // Ensure at least one child spawns immediately so the queue keeps ticking
    // (otherwise the dying parent may be removed before processing the queue)
    try { HydraGlobal.processQueue(1.0, ctx); } catch(_) {}
  }

  // --- Movement helper (surround/orbit bias) ---
  _desiredVelocity(ctx, dt) {
    const e = this.root;
    const player = ctx.player.position.clone();
    const toPlayer = player.clone().sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return new this.THREE.Vector3();

    // Compute an anchor point on a ring around player
    const pfwd = (ctx.blackboard?.playerForward || toPlayer.clone().multiplyScalar(-1)).setY(0).normalize();
    const right = new this.THREE.Vector3(-pfwd.z, 0, pfwd.x);

    this._arcAngle += (0.9 + this.gen * 0.12) * this._arcSign * dt; // slow drift
    const dir = pfwd.clone().multiplyScalar(Math.cos(this._arcAngle))
      .add(right.clone().multiplyScalar(Math.sin(this._arcAngle))).normalize();
    const anchor = player.clone().add(dir.multiplyScalar(this._preferRadius));

    // vector toward anchor with a pinch of direct pursuit if far
    const toAnchor = anchor.sub(e.position); toAnchor.y = 0;
    if (toAnchor.lengthSq() === 0) return new this.THREE.Vector3();
    const pursuit = toPlayer.clone().normalize().multiplyScalar(dist > this._preferRadius ? 0.4 : 0.15);
    const result = toAnchor.normalize().multiplyScalar(1.0).add(pursuit);

    // light avoidance
    const avoid = ctx.avoidObstacles(e.position, result, 1.2).multiplyScalar(1.0);
    const sep = ctx.separation(e.position, 1.0, e).multiplyScalar(0.8);
    return result.add(avoid).add(sep);
  }

  update(dt, ctx) {
    // Anyone can drive the global queue
    HydraGlobal.processQueue(dt, ctx);

    // Update lineage display hook (boss bar / counter)
    const L = HydraGlobal.ensureLineage(this.bossId);
    if (ctx.blackboard) {
      ctx.blackboard.hydraLineages = ctx.blackboard.hydraLineages || {};
      ctx.blackboard.hydraLineages[this.bossId] = { alive: L.alive, descendants: L.descendants };
    }

    // Death/split check (engine usually decrements hp externally)
    if (this.root.userData.hp <= 0) {
      if (!this._didSplit) {
        this._splitIntoChildren(ctx);
        this._didSplit = true;
      }
      HydraGlobal.registerDeath(this.bossId);
      this._didRegisterDeath = true;
      // removal is handled by EnemyManager; nothing else to do here
      return;
    }

    // Movement
    const desired = this._desiredVelocity(ctx, dt);
    if (desired.lengthSq() > 0) {
      desired.normalize();
      const step = desired.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(this.root, step);

      const before = this._lastPos;
      const moved = this.root.position.clone().sub(before); moved.y = 0;
      if (moved.lengthSq() > 1e-6) {
        const yaw = Math.atan2(moved.x, moved.z);
        // smooth yaw
        let dy = yaw - this._yaw; dy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
        const rate = 7.5; this._yaw += Math.max(-rate*dt, Math.min(rate*dt, dy));
        this.root.rotation.set(0, this._yaw, 0);
      }
      this._lastPos.copy(this.root.position);

      // tiny gait swing (if you hooked arm/leg refs you can animate them here)
      this._walkPhase += Math.min(12.0, 5.0 + moved.length() * 8) * dt;
    }

    // Contact damage (small capsule near chest)
    this._contactAcc += dt;
    if (this._contactAcc >= 0.08) { // ~12.5 ticks/sec
      this._contactAcc = 0;
      const p = ctx.player.position;
      const y = 1.4; // chest height
      const dy = (y - 1.5); // approx player chest
      const dx = this.root.position.x - p.x;
      const dz = this.root.position.z - p.z;
      if (Math.abs(dy) <= 0.6 && Math.hypot(dx, dz) < 1.05) {
        ctx.onPlayerDamage(this.dps * 0.08, 'melee'); // dps scaled to tick
        // tiny shove so they don't “sit” perfectly on the player
        const dir = new this.THREE.Vector3(dx, 0, dz).normalize();
        ctx.player.position.add(dir.multiplyScalar(-0.08));
      }
    }

    // Anti-kite on Gen3
    if (this.gen === 3) {
      const dist = this.root.position.clone().sub(ctx.player.position).length();
      if (dist > 35) this._farTimer += dt; else this._farTimer = 0;
      if (this._farTimer > 20) this.root.userData.hp = 0; // self-despawn
    }
  }

  // Called by EnemyManager on remove
  onRemoved(scene) {
    // If death removal happened before update could split, do it here with a minimal ctx
    if (!this._didSplit && (this.root?.userData?.hp || 0) <= 0) {
      const ctx = {
        player: this.enemyManager?.getPlayer ? this.enemyManager.getPlayer() : { position: new this.THREE.Vector3() },
        scene: this.enemyManager?.scene
      };
      try { this._splitIntoChildren(ctx); } catch(_) {}
      this._didSplit = true;
    }
    if (!this._didRegisterDeath) {
      HydraGlobal.registerDeath(this.bossId);
      this._didRegisterDeath = true;
    }
  }

  // Utility for external systems to spawn initial boss
  static spawnBoss({ THREE, mats, spawnPos, enemyManager }) {
    const inst = new Hydraclone({ THREE, mats, spawnPos, generation: 0, enemyManager });
    return Hydraclone.registerInstance(inst, { scene: enemyManager?.scene });
  }
}
