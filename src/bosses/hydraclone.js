// Echo Hydraclone (Fractal Replicator) — boss + clones logic
import { createEnhancedHydracloneAsset } from '../assets/boss-retrofits.js';
import { logError } from '../util/log.js';
import { disposeOwnedObject3D } from './resource-lifecycle.js';

export const HYDRACLONE_GENERATION_PROFILES = Object.freeze({
  // Keep the Wave 30 core as the durable skill check. Descendants trade health
  // for numbers and speed so clearing a successful split remains demanding
  // without repeating another boss-sized damage budget sixteen times.
  0: Object.freeze({ scale: 1.00, hp: 12000, speed: 2.8, dps: 24, splitCount: 4 }),
  1: Object.freeze({ scale: 0.55, hp:  1000, speed: 3.4, dps: 12, splitCount: 3 }),
  2: Object.freeze({ scale: 0.35, hp:   250, speed: 4.0, dps:  8, splitCount: 2 }),
  3: Object.freeze({ scale: 0.22, hp:   150, speed: 4.8, dps:  6, splitCount: 0 }) // no further splits
});
export const HYDRACLONE_MIRROR_DAMAGE = Object.freeze([12, 7, 4, 2]);
export const HYDRACLONE_MIRROR_INTERCEPT = Object.freeze({
  minimumSamples: 5,
  velocitySamples: 5,
  predictionSeconds: 1.5,
  maximumPredictionDistance: 28,
  pathSamples: 6,
  echoSpeed: 34
});
const GEN = HYDRACLONE_GENERATION_PROFILES;

const CORE_FRACTURE_THRESHOLDS = [0.7, 0.35];
const CORE_FRACTURE_COUNT = 2;

const MELEE = [
  { windup: 0.5, active: 0.12, recover: 0.72, damage: 30, reach: 2.45, knockback: 0.9 },
  { windup: 0.4, active: 0.1, recover: 0.58, damage: 12, reach: 1.9, knockback: 0.55 },
  { windup: 0.3, active: 0.09, recover: 0.46, damage: 8, reach: 1.55, knockback: 0.35 },
  { windup: 0.24, active: 0.08, recover: 0.38, damage: 5, reach: 1.3, knockback: 0.2 }
];

const CAST = {
  mirror: { releaseAt: 0.48, duration: 0.78 },
  fracture: { releaseAt: 0.72, duration: 1.08 }
};

// todo: should not spawn grunts, different ability

export const HYDRACLONE_ACTIVE_CAP = 24;

// Global spawn/cap & lineage bookkeeping (shared across all instances)
class HydraGlobal {
  static CAP = HYDRACLONE_ACTIVE_CAP;
  static active = 0;

  // spawn queue: items = {gen, bossId, pos, yJitter, src, THREE, mats, enemyManager}
  static queue = [];
  static queueAccum = 0;
  static queueStep = 0.25;

  // lineage data keyed by bossId
  // { alive, descendants, maxGeneration, started, nextSlot }
  static lineages = new Map();

  static ensureLineage(bossId) {
    if (!HydraGlobal.lineages.has(bossId)) {
      HydraGlobal.lineages.set(bossId, { alive: 0, descendants: 0, maxGeneration: 0, started: true, nextSlot: 0 });
    }
    return HydraGlobal.lineages.get(bossId);
  }

  static registerSpawn(bossId, generation = 0) {
    HydraGlobal.active++;
    const L = HydraGlobal.ensureLineage(bossId);
    const slot = L.nextSlot++;
    L.alive++;
    L.descendants = Math.max(0, L.alive - 1); // show "Descendants: xN" (exclude the original)
    L.maxGeneration = Math.max(L.maxGeneration || 0, Number(generation) || 0);
    return slot;
  }
  static registerDeath(bossId) {
    HydraGlobal.active = Math.max(0, HydraGlobal.active - 1);
    const L = HydraGlobal.ensureLineage(bossId);
    L.alive = Math.max(0, L.alive - 1);
    L.descendants = Math.max(0, L.alive - 1);
  }

  static enqueue(item) { HydraGlobal.queue.push(item); }

  static hasPending(bossId = null) {
    if (bossId == null) return HydraGlobal.active + HydraGlobal.queue.length > 0;
    const alive = HydraGlobal.lineages.get(bossId)?.alive || 0;
    return alive + HydraGlobal.queue.filter(item => item.bossId === bossId).length > 0;
  }

  static resetLineage(bossId) {
    if (!bossId) return;
    const lineage = HydraGlobal.lineages.get(bossId);
    HydraGlobal.active = Math.max(0, HydraGlobal.active - (lineage?.alive || 0));
    HydraGlobal.queue = HydraGlobal.queue.filter(item => item.bossId !== bossId);
    HydraGlobal.lineages.delete(bossId);
    if (!HydraGlobal.queue.length) HydraGlobal.queueAccum = 0;
  }

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
        rng: it.rng
      });
      Hydraclone.registerInstance(inst, ctx); // ensures scene + manager registration
    }
  }
}

export class Hydraclone {
  constructor({ THREE, mats, spawnPos, generation = 0, enemyManager = null, bossId = null, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;
    this.gen = Math.max(0, Math.min(3, generation));

    // Establish lineage id (the very first/gen0 becomes its own bossId)
    this.bossId = bossId || `hydra_${Date.now().toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`;
    this._slot = HydraGlobal.registerSpawn(this.bossId, this.gen);

    // Build asset
    const built = createEnhancedHydracloneAsset({
      THREE,
      mats,
      generation: this.gen,
      scale: GEN[this.gen].scale
    });
    this.root = built.root;
    this.head = built.head;
    this.refs = built.refs || {};

    // Place
    this.root.position.copy(spawnPos || new THREE.Vector3());
    this.behaviorId = this.gen === 0 ? 'boss_hydraclone' : `hydraclone_gen${this.gen}`;
    this.root.userData = {
      type: (this.gen === 0 ? 'boss_hydraclone' : 'hydraclone'),
      behaviorId: this.behaviorId,
      head: this.head,
      hp: GEN[this.gen].hp,
      maxHp: GEN[this.gen].hp,
      bossId: this.bossId,
      generation: this.gen,
      phaseLabel: this.gen === 0 ? 'Fracture 1' : undefined
    };
    this.maxHp = GEN[this.gen].hp;
    this._baseRootScale = this.root.scale.clone();
    this._spawnRevealTimer = this.gen > 0 ? 0.45 : 0;
    if (this._spawnRevealTimer > 0) this.root.scale.copy(this._baseRootScale).multiplyScalar(0.08);

    // Movement & behavior state
    this.speed = GEN[this.gen].speed;
    this.dps = GEN[this.gen].dps;
    this._raycaster = new THREE.Raycaster();
    this._yaw = 0;
    this._walkPhase = 0;
    this._t = 0;

    // Surround bias – each instance uses a persistent arc angle
    this._arcAngle = (this.rng() * Math.PI * 2);
    this._arcSign = (this.rng() < 0.5 ? -1 : 1);
    this._preferRadius = [5.5, 4.8, 4.2, 3.6][this.gen];
    this._lastPos = this.root.position.clone();

    // Gen3 anti-kite
    this._farTimer = 0;

    // Tank-style telegraphed melee, scaled down by clone generation.
    this._meleeState = 'idle';
    this._meleeTimer = 0;
    this._meleeCooldown = 0.8 + this.rng() * 1.8 + this._slot * 0.08;
    this._meleeHand = this.rng() < 0.5 ? -1 : 1;
    this._meleeDidHit = false;

    // All clone creation goes through a visible cast pose.
    this._castQueue = [];
    this._cloneCast = null;
    this._shardBasePositions = (this.refs.shards || []).map(shard => shard.position.clone());

    // Record player path for mirror clones
    this._playerPath = [];
    this._pathRecordAcc = 0;

    // Mirror path clone ability
    this._mirrorClones = [];
    this._mirrorCooldown = (this.gen === 0 ? 3 : 4) + this.rng() * 2;
    this._nextFractureThreshold = 0;
  }

  // --- Manager/scene registration helper (used by global queue spawns) ---
  static registerInstance(inst, ctx) {
    if (inst.enemyManager && typeof inst.enemyManager.registerExternalEnemy === 'function') {
      // Ensure waveStartingAlive is a number before tracking additional spawns
      if (typeof inst.enemyManager.waveStartingAlive !== 'number') {
        inst.enemyManager.waveStartingAlive = inst.enemyManager.alive || 0;
      }
      inst.enemyManager.registerExternalEnemy(inst, { countsTowardAlive: true });
      inst.enemyManager.waveStartingAlive++;
      try { globalThis.window?._EFFECTS?.ring?.(inst.root.position.clone(), 0.7, 0x22e3ef); } catch (e) { logError(e); }
      return inst;
    }
    // Fallback if no manager helper available
    ctx?.scene?.add?.(inst.root);
    return inst;
  }

  static hasPending(bossId = null) {
    return HydraGlobal.hasPending(bossId);
  }

  static resetLineage(bossId) {
    HydraGlobal.resetLineage(bossId);
  }

  // --- Temporary mirror clones that retrace recent player path ---
  _spawnMirrorClones(ctx) {
    if (this._playerPath.length < 2) return;
    const config = HYDRACLONE_MIRROR_INTERCEPT;
    const recentPath = this._playerPath.slice(-config.pathSamples);
    const basePath = recentPath.map(p => p.clone().setY(0.8));
    const last = basePath.at(-1);
    const movement = new this.THREE.Vector3();
    if (basePath.length >= config.minimumSamples) {
      const latestStep = last.clone().sub(basePath.at(-2)).setY(0);
      const priorStep = basePath.at(-2).clone().sub(basePath.at(-3)).setY(0);
      movement.copy(latestStep).multiplyScalar(10);
      if (latestStep.lengthSq() > 0.001) {
        const cross = priorStep.x * latestStep.z - priorStep.z * latestStep.x;
        const dot = priorStep.x * latestStep.x + priorStep.z * latestStep.z;
        const turnPerStep = priorStep.lengthSq() > 0.001
          ? Math.max(-0.25, Math.min(0.25, Math.atan2(cross, dot)))
          : 0;
        const forecast = last.clone();
        const forecastStep = latestStep.clone();
        const forecastSteps = Math.ceil(config.predictionSeconds / 0.1);
        let forecastDistance = 0;
        for (let index = 0; index < forecastSteps; index++) {
          // atan2 above measures turn in the X/Z plane; Three's positive Y
          // rotation uses the opposite sign for that projected heading.
          forecastStep.applyAxisAngle(new this.THREE.Vector3(0, 1, 0), -turnPerStep);
          const remainingDistance = config.maximumPredictionDistance - forecastDistance;
          if (remainingDistance <= 0) break;
          const stepDistance = Math.min(remainingDistance, forecastStep.length());
          if (stepDistance <= 0.001) break;
          forecast.addScaledVector(forecastStep, stepDistance / forecastStep.length());
          forecastDistance += stepDistance;
          basePath.push(forecast.clone());
        }
      }
    }
    const laneRight = movement.lengthSq() > 0.001
      ? new this.THREE.Vector3(-movement.z, 0, movement.x).normalize()
      : new this.THREE.Vector3(1, 0, 0);
    const count = 2;
    for (let i = 0; i < count; i++) {
      const built = createEnhancedHydracloneAsset({
        THREE: this.THREE,
        mats: this.mats,
        generation: Math.min(this.gen + 1, 3),
        scale: 0.4,
      });
      const root = built.root;
      const refs = built.refs || {};
      root.traverse(obj => {
        if (obj.material) {
          obj.material = obj.material.clone();
          obj.material.transparent = true;
          obj.material.opacity = 0.35;
        }
      });
      const side = i === 0 ? -1 : 1;
      const path = basePath.map((point, index) => {
        const progress = basePath.length > 1 ? index / (basePath.length - 1) : 1;
        const laneOffset = 0.65 - progress * 0.4;
        return point.clone().addScaledVector(laneRight, side * laneOffset);
      });
      root.position.copy(path[0]);
      const fullScale = root.scale.clone();
      root.scale.copy(fullScale).multiplyScalar(0.08);
      ctx.scene.add(root);
      try { globalThis.window?._EFFECTS?.ring?.(path[0].clone(), 0.7, 0x22e3ef); } catch (e) { logError(e); }
      this._mirrorClones.push({
        root,
        path,
        idx: 0,
        state: 'telegraph',
        t: 0,
        didDamage: false,
        refs,
        fullScale
      });
    }
  }

  _disposeMirrorClone(clone, scene) {
    const root = clone?.root;
    if (!root) return;
    scene?.remove?.(root);
    disposeOwnedObject3D(root);
  }

  _updateMirrorClones(dt, ctx) {
    for (let i = this._mirrorClones.length - 1; i >= 0; i--) {
      const clone = this._mirrorClones[i];
      if (clone.state === 'telegraph') {
        clone.t += dt;
        const reveal = Math.min(1, clone.t / 0.4);
        clone.root.scale.copy(clone.fullScale).multiplyScalar(0.08 + reveal * 0.92);
        const lift = Math.sin(reveal * Math.PI) * 0.45;
        if (clone.refs.leftArm) clone.refs.leftArm.rotation.x = -lift;
        if (clone.refs.rightArm) clone.refs.rightArm.rotation.x = -lift;
        if (clone.t >= 0.4) {
          clone.state = 'dash';
          clone.root.scale.copy(clone.fullScale);
        }
        continue;
      }

      const previous = clone.root.position.clone();
      const speed = HYDRACLONE_MIRROR_INTERCEPT.echoSpeed;
      let remaining = speed * dt;
      while (remaining > 0 && clone.idx < clone.path.length - 1) {
        const curr = clone.root.position;
        const next = clone.path[clone.idx + 1];
        const segment = next.clone().sub(curr);
        const segmentLength = segment.length();
        if (segmentLength <= remaining) {
          clone.root.position.copy(next);
          clone.idx++;
          remaining -= segmentLength;
        } else {
          clone.root.position.add(segment.normalize().multiplyScalar(remaining));
          remaining = 0;
        }
      }
      if (clone.refs.leftArm) clone.refs.leftArm.rotation.x = 0.9;
      if (clone.refs.rightArm) clone.refs.rightArm.rotation.x = 0.9;

      const player = ctx.player.position;
      const travelX = clone.root.position.x - previous.x;
      const travelZ = clone.root.position.z - previous.z;
      const travelLengthSq = travelX * travelX + travelZ * travelZ;
      const hitT = travelLengthSq > 0.0001
        ? Math.max(0, Math.min(1, (
          (player.x - previous.x) * travelX + (player.z - previous.z) * travelZ
        ) / travelLengthSq))
        : 0;
      const closestX = previous.x + travelX * hitT;
      const closestZ = previous.z + travelZ * hitT;
      if (!clone.didDamage && Math.hypot(closestX - player.x, closestZ - player.z) < 1.0) {
        const damage = HYDRACLONE_MIRROR_DAMAGE[this.gen];
        if (ctx.damagePlayer) {
          ctx.damagePlayer(damage, {
            sourceKind: 'hydraclone_echo',
            sourceRoot: this.root,
            ownerRoot: this.root
          });
        } else {
          ctx.onPlayerDamage?.(damage, 'hydraclone_echo');
        }
        clone.didDamage = true;
      }
      if (clone.idx >= clone.path.length - 1) {
        this._disposeMirrorClone(clone, ctx.scene);
        this._mirrorClones.splice(i, 1);
      }
    }
  }

  _queueCloneCast(kind) {
    if (!CAST[kind]) return;
    if (kind === 'mirror' && (
      this._cloneCast?.kind === 'mirror' ||
      this._castQueue.some(entry => entry.kind === 'mirror')
    )) return;
    this._castQueue.push({ kind });
  }

  _updateCloneCast(dt, ctx) {
    if (!this._cloneCast) {
      if (this._meleeState !== 'idle' || !this._castQueue.length) return false;
      const next = this._castQueue.shift();
      this._cloneCast = { ...next, ...CAST[next.kind], t: 0, released: false };
      ctx.emitAIEvent?.(this.root, 'ability_started', { ability: `${next.kind}_cast` });
    }

    const cast = this._cloneCast;
    cast.t += dt;
    const windup = Math.min(1, cast.t / cast.releaseAt);
    const release = cast.t <= cast.releaseAt
      ? 0
      : Math.min(1, (cast.t - cast.releaseAt) / Math.max(0.01, cast.duration - cast.releaseAt));
    this._poseCloneCast(windup, release, cast.kind);

    if (!cast.released && cast.t >= cast.releaseAt) {
      cast.released = true;
      if (cast.kind === 'fracture') this._spawnFractureWave(ctx);
      else this._spawnMirrorClones(ctx);
      ctx.emitAIEvent?.(this.root, 'ability_released', { ability: `${cast.kind}_cast` });
    }

    if (cast.t >= cast.duration) {
      this._resetCombatPose();
      this._cloneCast = null;
    }
    return true;
  }

  _poseCloneCast(windup, release, kind) {
    const strength = windup * (1 - release);
    const armLift = (kind === 'fracture' ? 1.15 : 0.82) * strength;
    if (this.refs.leftArm) {
      this.refs.leftArm.rotation.x = -armLift;
      this.refs.leftArm.rotation.z = 0.38 * strength;
    }
    if (this.refs.rightArm) {
      this.refs.rightArm.rotation.x = -armLift;
      this.refs.rightArm.rotation.z = -0.38 * strength;
    }
    if (this.refs.core) {
      const pulse = 1 + strength * 0.55 + Math.sin(this._t * 24) * strength * 0.08;
      this.refs.core.scale.setScalar(pulse);
    }
    (this.refs.shards || []).forEach((shard, index) => {
      const base = this._shardBasePositions[index];
      if (base) shard.position.copy(base).multiplyScalar(1 + strength * 0.55);
      shard.rotation.y += 0.035 + strength * 0.08;
    });
    this.root.rotation.x = -0.03 - strength * 0.09;
  }

  _resetCombatPose() {
    for (const arm of [this.refs.leftArm, this.refs.rightArm]) {
      if (!arm) continue;
      arm.rotation.x = 0;
      arm.rotation.z = 0;
    }
    if (this.refs.core) this.refs.core.scale.setScalar(1);
    (this.refs.shards || []).forEach((shard, index) => {
      const base = this._shardBasePositions[index];
      if (base) shard.position.copy(base);
    });
    this.root.rotation.x = -0.03;
  }

  _updateMelee(dt, ctx) {
    const attack = MELEE[this.gen];
    const toPlayer = ctx.player.position.clone().sub(this.root.position).setY(0);
    const distance = toPlayer.length();
    const direction = distance > 0 ? toPlayer.clone().multiplyScalar(1 / distance) : new this.THREE.Vector3();
    this._meleeCooldown = Math.max(0, this._meleeCooldown - dt);

    if (this._meleeState === 'idle') {
      if (this._meleeCooldown > 0 || distance > attack.reach + 0.18) return false;
      if (!this._hasLineOfSight(this.root.position, ctx.player.position, ctx.objects || [])) return false;
      this._meleeState = 'windup';
      this._meleeTimer = attack.windup;
      this._meleeDidHit = false;
      this._meleeHand *= -1;
      ctx.emitAIEvent?.(this.root, 'melee_started', { attack: 'echo_haymaker', generation: this.gen });
    }

    this._meleeTimer = Math.max(0, this._meleeTimer - dt);
    if (this._meleeState === 'windup') {
      this._faceMeleeTarget(direction, dt);
      const rear = this._meleeHand > 0 ? this.refs.rightArm : this.refs.leftArm;
      const guard = this._meleeHand > 0 ? this.refs.leftArm : this.refs.rightArm;
      if (rear) {
        rear.rotation.x = -0.92;
        rear.rotation.z = -0.18 * this._meleeHand;
      }
      if (guard) guard.rotation.x = -0.22;
      if (this.refs.core) this.refs.core.scale.setScalar(1.12);
      if (this._meleeTimer <= 0) {
        this._meleeState = 'active';
        this._meleeTimer = attack.active;
      }
      return true;
    }

    if (this._meleeState === 'active') {
      const striking = this._meleeHand > 0 ? this.refs.rightArm : this.refs.leftArm;
      if (striking) {
        striking.rotation.x = 1.12;
        striking.rotation.z = 0.08 * this._meleeHand;
      }
      const forward = new this.THREE.Vector3(Math.sin(this._yaw), 0, Math.cos(this._yaw));
      if (
        !this._meleeDidHit &&
        distance <= attack.reach + 0.12 &&
        forward.dot(direction) > 0.48 &&
        this._hasLineOfSight(this.root.position, ctx.player.position, ctx.objects || [])
      ) {
        this._meleeDidHit = true;
        if (ctx.damagePlayer) {
          ctx.damagePlayer(attack.damage, {
            sourceKind: 'hydraclone_melee',
            sourceRoot: this.root,
            ownerRoot: this.root
          });
        } else {
          ctx.onPlayerDamage?.(attack.damage, 'melee');
        }
        if (direction.lengthSq() > 0) {
          this._applyPlayerKnockback(ctx, direction.multiplyScalar(attack.knockback), 'echo_haymaker');
        }
        ctx.emitAIEvent?.(this.root, 'melee_hit', { attack: 'echo_haymaker', damage: attack.damage });
        try {
          globalThis.window?._EFFECTS?.ring?.(
            this.root.position.clone().add(forward.multiplyScalar(Math.min(attack.reach, 1.4))),
            0.65 + this.gen * 0.08,
            0x22e3ef
          );
        } catch (e) { logError(e); }
      }
      if (this._meleeTimer <= 0) {
        this._meleeState = 'recover';
        this._meleeTimer = attack.recover;
      }
      return true;
    }

    if (this._meleeState === 'recover') {
      const blend = Math.min(1, dt * 9);
      for (const arm of [this.refs.leftArm, this.refs.rightArm]) {
        if (!arm) continue;
        arm.rotation.x += (0 - arm.rotation.x) * blend;
        arm.rotation.z += (0 - arm.rotation.z) * blend;
      }
      if (this.refs.core) this.refs.core.scale.lerp(new this.THREE.Vector3(1, 1, 1), blend);
      if (this._meleeTimer <= 0) {
        this._resetCombatPose();
        this._meleeState = 'idle';
        this._meleeCooldown = 1 + this.rng() + this.gen * 0.15;
      }
      return true;
    }
    return false;
  }

  _faceMeleeTarget(direction, dt) {
    if (direction.lengthSq() <= 0) return;
    const desiredYaw = Math.atan2(direction.x, direction.z);
    let delta = desiredYaw - this._yaw;
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this._yaw += Math.max(-9 * dt, Math.min(9 * dt, delta));
    this.root.rotation.y = this._yaw;
  }

  _applyPlayerKnockback(ctx, vector, ability) {
    if (!vector || vector.lengthSq() <= 0) return;
    if (typeof ctx.applyPlayerKnockback === 'function') ctx.applyPlayerKnockback(vector);
    else ctx.player.position.add(vector);
    ctx.emitAIEvent?.(this.root, 'player_knockback', {
      ability, vector: vector.clone(), magnitude: vector.length()
    });
  }

  _animateGait(distanceMoved, dt) {
    if (this._meleeState !== 'idle' || this._cloneCast) return;
    this._walkPhase += Math.min(12, 5 + distanceMoved * 8) * dt;
    const swing = Math.sin(this._walkPhase) * Math.min(0.42, 0.12 + distanceMoved * 2.2);
    if (this.refs.leftArm && this.refs.rightArm) {
      this.refs.leftArm.rotation.x = swing;
      this.refs.rightArm.rotation.x = -swing;
    }
    if (this.refs.leftLeg && this.refs.rightLeg) {
      this.refs.leftLeg.rotation.x = -swing * 0.8;
      this.refs.rightLeg.rotation.x = swing * 0.8;
    }
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
      this._applyPlayerKnockback(ctx, pushDir.multiplyScalar(knock), 'echo_split');
    }
    try { globalThis.window?._EFFECTS?.ring?.(origin.clone(), 1.8 + this.gen * 0.6, 0x22e3ef); } catch (e) { logError(e); }

    // Spawn ring (avoid player safe radius ~2.0)
    const safeR = 2.0;
    const radius = Math.max(1.1, (this.root.userData?.bounds?.radius || 0.8) + 0.6);
    for (let i = 0; i < splitCount; i++) {
      const a = (i / splitCount) * Math.PI * 2 + this.rng() * 0.35;
      const r = radius + 0.25 + this.rng() * 0.35;
      const pos = new THREE.Vector3(origin.x + Math.cos(a) * r, origin.y, origin.z + Math.sin(a) * r);

      // steer away if too close to player
      const dx = pos.x - playerPos.x, dz = pos.z - playerPos.z;
      if (Math.hypot(dx, dz) < safeR) {
        const dir = new THREE.Vector3(dx, 0, dz).normalize();
        pos.add(dir.multiplyScalar(safeR - Math.hypot(dx, dz) + 0.1));
      }

      const yJitter = (this.rng() - 0.5) * 0.2;

      // Respect global cap: queue if necessary
      HydraGlobal.enqueue({
        gen: this.gen + 1,
        bossId: this.bossId,
        pos, yJitter,
        THREE: this.THREE, mats: this.mats,
        enemyManager: this.enemyManager,
        rng: this.rng
      });
    }

    // Ensure at least one child spawns immediately so the queue keeps ticking
    // (otherwise the dying parent may be removed before processing the queue)
    try { HydraGlobal.processQueue(1.0, ctx); } catch (e) { logError(e); }
  }

  // The core sheds smaller combat-capable echoes before its final split. This
  // gives the late-game encounter an escalating main phase instead of making
  // every clone a post-boss cleanup target.
  _spawnFractureWave(ctx) {
    const origin = this.root.position.clone();
    const generation = 2;
    for (let i = 0; i < CORE_FRACTURE_COUNT; i++) {
      const angle = (i / CORE_FRACTURE_COUNT) * Math.PI * 2 + this.rng() * 0.5;
      const radius = 2.2 + this.rng() * 0.8;
      HydraGlobal.enqueue({
        gen: generation,
        bossId: this.bossId,
        pos: new this.THREE.Vector3(
          origin.x + Math.cos(angle) * radius,
          origin.y,
          origin.z + Math.sin(angle) * radius
        ),
        yJitter: (this.rng() - 0.5) * 0.2,
        THREE: this.THREE,
        mats: this.mats,
        enemyManager: this.enemyManager,
        rng: this.rng
      });
    }
    try { globalThis.window?._EFFECTS?.ring?.(origin, 2.6, 0x22e3ef); } catch (e) { logError(e); }
    HydraGlobal.processQueue(1.0, ctx);
  }

  _updateFracturePhases(_ctx) {
    if (this.gen !== 0) return;
    const hpRatio = Math.max(0, this.root.userData.hp) / this.maxHp;
    while (
      this._nextFractureThreshold < CORE_FRACTURE_THRESHOLDS.length &&
      hpRatio <= CORE_FRACTURE_THRESHOLDS[this._nextFractureThreshold]
    ) {
      this._nextFractureThreshold++;
      this.root.userData.phaseLabel = `Fracture ${this._nextFractureThreshold + 1}`;
      this._queueCloneCast('fracture');
    }
  }

  // --- Movement helper (surround/orbit bias) ---
  _desiredVelocity(ctx, dt) {
    const e = this.root;
    const player = ctx.player.position.clone();
    const toPlayer = player.clone().sub(e.position);
    const dist = toPlayer.length();
    toPlayer.y = 0; if (toPlayer.lengthSq() === 0) return new this.THREE.Vector3();

    const hasLOS = this._hasLineOfSight(e.position, player, ctx.objects);
    if (!hasLOS && ctx.pathfind) {
      ctx.pathfind.recomputeIfStale(this, player);
      const wp = ctx.pathfind.nextWaypoint(this);
      if (wp) {
        const dir = new this.THREE.Vector3(wp.x - e.position.x, 0, wp.z - e.position.z);
        if (dir.lengthSq() > 0) return dir;
      }
    } else if (hasLOS && ctx.pathfind) {
      ctx.pathfind.clear(this);
    }

    // Leave the surround ring for a committed melee pass, then fall back to
    // the orbit while the attack recovers. This keeps the swarm readable and
    // prevents every generation from permanently crowding the player.
    if (
      hasLOS &&
      !this._cloneCast &&
      this._meleeState === 'idle' &&
      this._meleeCooldown <= 0 &&
      dist <= 10
    ) {
      const attackLine = toPlayer.clone().normalize();
      const avoid = ctx.avoidObstacles(e.position, attackLine, 1.2).multiplyScalar(0.8);
      const separation = ctx.separation(e.position, 0.9, e).multiplyScalar(0.45);
      return attackLine.multiplyScalar(1.25).add(avoid).add(separation);
    }

    // Compute an anchor point on a ring around player
    const pfwd = (ctx.blackboard?.playerForward || toPlayer.clone().multiplyScalar(-1)).setY(0).normalize();
    const right = new this.THREE.Vector3(-pfwd.z, 0, pfwd.x);

    const L = HydraGlobal.ensureLineage(this.bossId);
    let anchor;
    if (L.alive > 3) {
      // Stable multi-ring slots prevent the full lineage trying to occupy one
      // shrinking circle whenever a clone dies or splits.
      const slotsPerRing = 8;
      const ringIndex = Math.floor(this._slot / slotsPerRing);
      const slotOnRing = this._slot % slotsPerRing;
      const angle = (Math.PI * 2 / slotsPerRing) * slotOnRing + ringIndex * (Math.PI / slotsPerRing);
      const dir = pfwd.clone().multiplyScalar(Math.cos(angle))
        .add(right.clone().multiplyScalar(Math.sin(angle))).normalize();
      const ringRadius = Math.max(5, this._preferRadius) + ringIndex * 1.65;
      anchor = player.clone().add(dir.multiplyScalar(ringRadius));
    } else {
      this._arcAngle += (0.9 + this.gen * 0.12) * this._arcSign * dt; // slow drift
      const dir = pfwd.clone().multiplyScalar(Math.cos(this._arcAngle))
        .add(right.clone().multiplyScalar(Math.sin(this._arcAngle))).normalize();
      anchor = player.clone().add(dir.multiplyScalar(this._preferRadius));
    }

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
    this._t += dt;

    // Anyone can drive the global queue
    HydraGlobal.processQueue(dt, ctx);

    // Update lineage display hook (boss bar / counter)
    const L = HydraGlobal.ensureLineage(this.bossId);
    if (ctx.blackboard) {
      ctx.blackboard.hydraLineages = ctx.blackboard.hydraLineages || {};
      ctx.blackboard.hydraLineages[this.bossId] = {
        alive: L.alive,
        descendants: L.descendants,
        maxGeneration: L.maxGeneration || 0
      };
    }

    // Record player path
    this._pathRecordAcc += dt;
    if (this._pathRecordAcc >= 0.1) {
      this._pathRecordAcc = 0;
      this._playerPath.push(ctx.player.position.clone());
      if (this._playerPath.length > 60) this._playerPath.shift();
    }

    // Death/split check (engine usually decrements hp externally)
    if (this.root.userData.hp <= 0) {
      if (!this._didSplit) {
        this._splitIntoChildren(ctx);
        this._didSplit = true;
      }
      HydraGlobal.registerDeath(this.bossId);
      this._didRegisterDeath = true;
      for (const clone of this._mirrorClones) this._disposeMirrorClone(clone, ctx.scene);
      this._mirrorClones.length = 0;
      const pos = this.root.position.clone();
      if (ctx.pickups) {
        if (this.gen === 0) {
          ctx.pickups.dropMultiple('med', pos, 1, { source: 'boss' });
          ctx.pickups.dropMultiple('ammo', pos, 4, { source: 'boss' });
        } else {
          ctx.pickups.dropMultiple('random', pos, 1, { source: 'boss' });
        }
      }
      // removal is handled by EnemyManager; nothing else to do here
      return;
    }

    if (this._spawnRevealTimer > 0) {
      this._spawnRevealTimer = Math.max(0, this._spawnRevealTimer - dt);
      const reveal = 1 - this._spawnRevealTimer / 0.45;
      const eased = 1 - Math.pow(1 - reveal, 3);
      this.root.scale.copy(this._baseRootScale).multiplyScalar(0.08 + eased * 0.92);
      if (this.refs.core) this.refs.core.rotation.y += dt * 12;
      if (this._spawnRevealTimer <= 0) this.root.scale.copy(this._baseRootScale);
      return;
    }

    this._updateFracturePhases(ctx);

    // Existing echoes keep moving while the physical Hydraclone performs its
    // next cast or melee windup.
    this._updateMirrorClones(dt, ctx);

    // Mirror ability: queue a visible cast instead of popping clones directly.
    if (this._mirrorCooldown > 0) {
      this._mirrorCooldown -= dt;
      if (L.alive > 3) this._mirrorCooldown -= dt; // faster when many are alive
    }
    if (this._mirrorCooldown <= 0) {
      this._mirrorCooldown = (this.gen === 0 ? 5 : 6) + this.rng() * 2;
      this._queueCloneCast('mirror');
    }
    if (this._updateCloneCast(dt, ctx)) return;
    if (this._updateMelee(dt, ctx)) return;

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
        this.root.rotation.set(-0.03, this._yaw, 0);
      }
      this._lastPos.copy(this.root.position);
      this._animateGait(moved.length(), dt);
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
    for (const clone of this._mirrorClones) this._disposeMirrorClone(clone, scene);
    this._mirrorClones.length = 0;
    this._castQueue.length = 0;
    this._cloneCast = null;
    this._resetCombatPose();
    // If death removal happened before update could split, do it here with a minimal ctx
    if (!this._didSplit && (this.root?.userData?.hp || 0) <= 0) {
      const ctx = {
        player: this.enemyManager?.getPlayer ? this.enemyManager.getPlayer() : { position: new this.THREE.Vector3() },
        scene: this.enemyManager?.scene
      };
      try { this._splitIntoChildren(ctx); } catch (e) { logError(e); }
      this._didSplit = true;
    }
    if (!this._didRegisterDeath) {
      HydraGlobal.registerDeath(this.bossId);
      this._didRegisterDeath = true;
    }
    disposeOwnedObject3D(this.root);
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

  // Utility for external systems to spawn initial boss
  static spawnBoss({ THREE, mats, spawnPos, enemyManager, rng = Math.random }) {
    const inst = new Hydraclone({ THREE, mats, spawnPos, generation: 0, enemyManager, rng });
    return Hydraclone.registerInstance(inst, { scene: enemyManager?.scene });
  }
}
