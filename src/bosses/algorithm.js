// The Algorithm — Wave 40 campaign finale.
// Phase 1 Control: three logic nodes gate six-second damage windows.
// Phase 2 Paradox: three capped echoes; the off-beat echo breaks coherence.
// Phase 3 Collapse: no adds, faster eye sweeps, permanently exposed core.

import {
  createAlgorithmAsset,
  createAlgorithmEchoAsset,
  createAlgorithmNodeAsset
} from '../assets/boss_algorithm.js';

class AlgorithmNode {
  constructor({ THREE, mats, position, owner, index }) {
    const colors = [0x43e8df, 0xff4fd8, 0xd7ff3f];
    const built = createAlgorithmNodeAsset({ THREE, mats, color: colors[index % colors.length] });
    built.root.position.copy(position);
    built.root.userData = {
      type: 'boss_node_algorithm',
      head: built.head,
      hp: 520,
      maxHp: 520,
      algorithmNodeIndex: index,
      // Control nodes are arena fixtures. Letting weapon knockback move the
      // root causes impacts and decals to trail behind the visible pillar.
      knockbackImmune: true
    };
    this.root = built.root;
    this.refs = built.refs;
    this.owner = owner;
    this.index = index;
    this.t = index * 0.37;
    this._removed = false;
  }

  update(dt) {
    this.t += dt;
    const pulse = 0.94 + Math.sin(this.t * 3.4) * 0.1;
    this.refs.halo.scale.setScalar(pulse);
    this.refs.halo.rotation.z += dt * (this.index % 2 ? -0.8 : 0.8);
    this.refs.core.rotation.y += dt * 1.2;
  }

  onRemoved() {
    if (this._removed) return;
    this._removed = true;
    this.owner?._onNodeRemoved(this);
  }
}

class AlgorithmEcho {
  constructor({ THREE, mats, position, owner, index, correct }) {
    const built = createAlgorithmEchoAsset({ THREE, mats, color: correct ? 0xd7ff3f : 0xff4fd8 });
    built.root.position.copy(position);
    built.root.userData = {
      type: 'boss_algorithm_echo',
      head: built.head,
      hp: 680,
      maxHp: 680,
      algorithmEchoIndex: index,
      offBeat: correct
    };
    this.root = built.root;
    this.refs = built.refs;
    this.owner = owner;
    this.index = index;
    this.correct = correct;
    this.baseY = position.y;
    this.t = 0;
    this._removed = false;
  }

  update(dt) {
    this.t += dt;
    this.root.position.y = this.baseY + Math.sin(this.t * 1.7 + this.index) * 0.18;
    this.root.rotation.y += dt * (this.index % 2 ? -0.55 : 0.55);
    this.refs.ring.rotation.z += dt * (this.index % 2 ? 1.1 : -1.1);

    // Two echoes pulse together. The correct response lands deliberately late.
    const beat = this.t * Math.PI * 1.5 - (this.correct ? 0.8 : 0);
    const pulse = Math.max(0, Math.sin(beat));
    for (const mesh of this.refs.emissives) {
      if (mesh.material?.emissiveIntensity != null) mesh.material.emissiveIntensity = 0.45 + pulse * 1.35;
    }
  }

  onRemoved() {
    if (this._removed) return;
    this._removed = true;
    this.owner?._onEchoRemoved(this);
  }
}

export class AlgorithmBoss {
  constructor({ THREE, mats, spawnPos, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    const built = createAlgorithmAsset({ THREE, mats, scale: 1 });
    built.root.position.copy(spawnPos);
    this.root = built.root;
    this.refs = built.refs;
    // Tuned so a normal three-weapon Wave 40 loadout can finish the encounter
    // when the player solves its mechanics and uses the exposed weak points.
    this.maxHp = 38000;
    this.phase = 1;
    this.invuln = true;
    this._hp = this.maxHp;
    this.root.userData = {
      type: 'boss_algorithm',
      bossId: 'the_algorithm',
      displayName: 'The Algorithm',
      phaseLabel: 'Control',
      head: built.head,
      maxHp: this.maxHp,
      damageMul: 1
    };
    Object.defineProperty(this.root.userData, 'hp', {
      enumerable: true,
      configurable: true,
      get: () => this._hp,
      set: value => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        if (next < this._hp) {
          if (this._damageLocked()) return;
          const incomingDamage = this._hp - next;
          const exposedMultiplier = Math.max(1, Number(this.root.userData.damageMul) || 1);
          this._hp = Math.max(0, this._hp - incomingDamage * exposedMultiplier);
          return;
        }
        this._hp = Math.max(0, next);
      }
    });

    this.nodes = new Set();
    this.echoes = new Set();
    this._clearingEchoes = false;
    this._removed = false;
    this._weakpointTimer = 0;
    this._echoRespawnTimer = 0;

    this._attackState = 'idle';
    this._attackTimer = 0;
    this._attackCooldown = 3.2;
    this._attackIndex = 0;
    this._sweepStartYaw = 0;
    this._sweepEndYaw = 0;
    this._sweepPitch = 0;
    this._beamHitCooldown = 0;
    this._sweepHitPlayer = false;
    this._logicPulse = null;
    this._logicPulseCooldown = 5.2;
    this._logicPulseIndex = 0;
    this._lastUpdateTime = null;
    this._raycaster = new THREE.Raycaster();
    this._tmpOrigin = new THREE.Vector3();
    this._tmpTarget = new THREE.Vector3();
    this._tmpDirection = new THREE.Vector3();
    this._tmpToPlayer = new THREE.Vector3();
    this._tmpClosest = new THREE.Vector3();

    this._spawnControlNodes();
    this._setWeakpoint(false);
    this._notifyDeath = null;
  }

  _damageLocked() {
    if (this._removed || this.phase === 3) return false;
    if (this.phase === 1) return this.nodes.size > 0 && this._weakpointTimer <= 0;
    if (this.phase === 2) return this._weakpointTimer <= 0;
    return false;
  }

  _spawnControlNodes() {
    const center = this.root.position;
    const radius = 11;
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3 + Math.PI / 6;
      const position = new this.THREE.Vector3(
        center.x + Math.sin(angle) * radius,
        0,
        center.z + Math.cos(angle) * radius
      );
      const node = new AlgorithmNode({ THREE: this.THREE, mats: this.mats, position, owner: this, index });
      this.nodes.add(node);
      this.enemyManager.registerExternalEnemy(node, { countsTowardAlive: true });
    }
  }

  _onNodeRemoved(node) {
    if (this._removed || !this.nodes.delete(node) || this.phase !== 1) return;
    // Breaking a Control node is the phase's main reward: the exposed eye
    // converts every weapon's raw HP subtraction into a meaningful burst.
    this._openWeakpoint(6, 3);
    this._dropAmmo(node.root.position, 2);
    this.root.userData.phaseLabel = this.nodes.size > 0 ? `Control · ${this.nodes.size} nodes` : 'Control · armor broken';
    if (this.nodes.size === 0) this.invuln = false;
  }

  _enterParadox() {
    this.phase = 2;
    this.invuln = true;
    this.root.userData.phaseLabel = 'Paradox';
    this._weakpointTimer = 0;
    this.root.userData.damageMul = 1;
    this._setWeakpoint(false);
    this._clearNodes();
    this._spawnEchoPack();
    this._attackCooldown = 1.2;
  }

  _spawnEchoPack() {
    if (this._removed || this.phase !== 2 || this.echoes.size > 0) return;
    const correctIndex = Math.floor(this.rng() * 3) % 3;
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3 + Math.PI / 3;
      const position = new this.THREE.Vector3(
        this.root.position.x + Math.sin(angle) * 8.5,
        0.4,
        this.root.position.z + Math.cos(angle) * 8.5
      );
      const echo = new AlgorithmEcho({
        THREE: this.THREE,
        mats: this.mats,
        position,
        owner: this,
        index,
        correct: index === correctIndex
      });
      this.echoes.add(echo);
      this.enemyManager.registerExternalEnemy(echo, { countsTowardAlive: true });
    }
  }

  _onEchoRemoved(echo) {
    if (this._removed || this._clearingEchoes || !this.echoes.delete(echo) || this.phase !== 2) return;
    if (echo.correct) {
      this._clearEchoes();
      this._openWeakpoint(6, 2.5);
      this._dropAmmo(echo.root.position, 3);
      this._echoRespawnTimer = 8;
      this.root.userData.phaseLabel = 'Paradox · coherence broken';
    }
  }

  _enterCollapse() {
    this.phase = 3;
    this.invuln = false;
    this.root.userData.phaseLabel = 'Coherence Collapse';
    this._clearEchoes();
    this._openWeakpoint(Infinity, 1.75);
    this._attackCooldown = 0.8;
  }

  _openWeakpoint(seconds, damageMultiplier = 1) {
    this._weakpointTimer = seconds;
    this.invuln = false;
    this.root.userData.damageMul = Math.max(1, damageMultiplier);
    this._setWeakpoint(true);
  }

  _dropAmmo(position, count) {
    const pickups = this.enemyManager?.pickups;
    if (!pickups?.dropMultiple || !position) return;
    pickups.dropMultiple('ammo', position.clone(), count, { source: 'boss' });
  }

  _setWeakpoint(open) {
    this.refs.weakRoot.visible = open;
    this.refs.weakHalo.visible = open;
    if (this.refs.faceLens.material?.emissiveIntensity != null) this.refs.faceLens.material.emissiveIntensity = open ? 2.2 : 1.45;
  }

  _closeWeakpoint() {
    this._weakpointTimer = 0;
    const armorBroken = this.phase === 1 && this.nodes.size === 0;
    // Once every Control node is gone, keep the eye readable and retain a
    // smaller permanent reward instead of returning to ordinary body damage.
    this.root.userData.damageMul = armorBroken ? 2 : 1;
    this._setWeakpoint(armorBroken);
    this.invuln = this._damageLocked();
    if (this.phase === 2) this.root.userData.phaseLabel = 'Paradox';
  }

  _beginEyeSweep(ctx) {
    const toPlayer = this._tmpToPlayer.copy(ctx.player.position).sub(this.root.position);
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    const reverse = this.phase === 2 || (this.phase === 3 && this._attackIndex % 2 === 1);
    const halfSweep = this.phase === 3 ? 1.4 : 1.05;
    this._sweepStartYaw = targetYaw + (reverse ? halfSweep : -halfSweep);
    this._sweepEndYaw = targetYaw + (reverse ? -halfSweep : halfSweep);

    this.refs.beamPivot.getWorldPosition(this._tmpOrigin);
    const horizontal = Math.max(0.1, Math.hypot(toPlayer.x, toPlayer.z));
    this._sweepPitch = Math.max(-0.35, Math.min(0.5, Math.atan2(this._tmpOrigin.y - ctx.player.position.y, horizontal)));
    this.refs.beamPivot.rotation.x = this._sweepPitch;
    this.refs.beam.visible = true;
    this.refs.beamCore.visible = true;
    this._attackState = 'windup';
    this._attackTimer = 0;
    this._beamHitCooldown = 0;
    this._sweepHitPlayer = false;
    this._attackIndex++;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'algorithm_eye_sweep', phase: this.phase,
      telegraphSeconds: this.phase === 3 ? 0.3 : 0.45
    });
  }

  _updateEyeSweep(dt, ctx) {
    if (this._attackState === 'idle') {
      this._attackCooldown -= dt;
      const toPlayer = this._tmpToPlayer.copy(ctx.player.position).sub(this.root.position);
      const idleYaw = Math.atan2(toPlayer.x, toPlayer.z);
      this.refs.headPivot.rotation.y = this._approachAngle(this.refs.headPivot.rotation.y, idleYaw, dt * 1.8);
      if (this._attackCooldown <= 0) this._beginEyeSweep(ctx);
      return;
    }

    this._attackTimer += dt;
    this._beamHitCooldown = Math.max(0, this._beamHitCooldown - dt);
    const windup = this.phase === 3 ? 0.3 : 0.45;
    const sweepDuration = this.phase === 3 ? 1.55 : 2.5;

    if (this._attackState === 'windup') {
      const t = Math.min(1, this._attackTimer / windup);
      const snap = 1 - Math.pow(1 - t, 3);
      this.refs.headPivot.rotation.y = this._lerpAngle(this.refs.headPivot.rotation.y, this._sweepStartYaw, snap);
      this.refs.beamMaterial.opacity = 0.025 + snap * 0.055;
      this.refs.beamCoreMaterial.opacity = 0.08 + snap * 0.16;
      this.refs.eyeLight.intensity = 4 + snap * 10;
      if (t >= 1) {
        this._attackState = 'sweep';
        this._attackTimer = 0;
        ctx.emitAIEvent?.(this.root, 'ability_released', {
          ability: 'algorithm_eye_sweep', phase: this.phase
        });
      }
      return;
    }

    if (this._attackState === 'sweep') {
      const raw = Math.min(1, this._attackTimer / sweepDuration);
      const eased = 0.5 - Math.cos(raw * Math.PI) * 0.5;
      this.refs.headPivot.rotation.y = this._lerpAngle(this._sweepStartYaw, this._sweepEndYaw, eased);
      this.refs.beamMaterial.opacity = 0.08 + Math.sin(this._attackTimer * 14) * 0.02;
      this.refs.beamCoreMaterial.opacity = 0.26 + Math.sin(this._attackTimer * 18) * 0.05;
      this.refs.eyeLight.intensity = 18 + Math.sin(this._attackTimer * 16) * 4;
      const pulse = 1 + Math.sin(this._attackTimer * 20) * 0.14;
      this.refs.faceLens.scale.set(pulse, 0.68 * pulse, 0.35 * pulse);
      this._damagePlayerInBeam(ctx);
      if (raw >= 1) {
        this._attackState = 'recovery';
        this._attackTimer = 0;
        this.refs.beam.visible = false;
        this.refs.beamCore.visible = false;
        this.refs.eyeLight.intensity = 0;
        this.refs.faceLens.scale.set(1, 0.68, 0.35);
        ctx.emitAIEvent?.(this.root, 'ability_resolved', {
          ability: 'algorithm_eye_sweep', phase: this.phase, hitPlayer: this._sweepHitPlayer
        });
      }
      return;
    }

    if (this._attackState === 'recovery' && this._attackTimer >= (this.phase === 3 ? 0.55 : 0.8)) {
      this._attackState = 'idle';
      this._attackTimer = 0;
      this._attackCooldown = this.phase === 3 ? 2.4 + this.rng() * 0.6 : 4.1 + this.rng() * 1.1;
      if (!this._damageLocked() && this.phase !== 3 && this._weakpointTimer <= 0) this._setWeakpoint(true);
    }
  }

  _damagePlayerInBeam(ctx) {
    if (this._beamHitCooldown > 0) return;
    this.refs.beamPivot.getWorldPosition(this._tmpOrigin);
    this.refs.beamPivot.getWorldDirection(this._tmpDirection).normalize();
    this._tmpTarget.copy(ctx.player.position);
    this._tmpTarget.y += 0.35;
    this._tmpToPlayer.subVectors(this._tmpTarget, this._tmpOrigin);
    const along = this._tmpToPlayer.dot(this._tmpDirection);
    if (along <= 0 || along > this.refs.beamLength) return;
    this._tmpClosest.copy(this._tmpOrigin).addScaledVector(this._tmpDirection, along);
    const beamRadius = 0.55 + along * 0.16;
    if (this._tmpClosest.distanceToSquared(this._tmpTarget) > beamRadius * beamRadius) return;
    if (!this._hasLineOfSight(this._tmpOrigin, this._tmpTarget, ctx.objects || [])) return;

    const damage = this.phase === 3 ? 28 : this.phase === 2 ? 22 : 24;
    ctx.damagePlayer?.(damage, {
      sourceKind: 'algorithm_eye_beam',
      sourceRoot: this.root,
      ownerRoot: this.root
    });
    this._sweepHitPlayer = true;
    this._beamHitCooldown = 0.7;
  }

  _beginLogicPulse(ctx) {
    const THREE = this.THREE;
    const visuals = [];
    const playerSnapshot = ctx.player.position.clone().setY(0.08);
    let variant = 'control_lanes';
    let origins = [];
    let radius = 0;
    let inward = false;

    if (this.phase === 1) {
      origins = Array.from(this.nodes).map(node => node.root.position.clone());
      if (origins.length === 0) origins = [this.root.position.clone()];
    } else if (this.phase === 2) {
      variant = 'offbeat_echo';
      const offBeat = Array.from(this.echoes).find(echo => echo.correct) || Array.from(this.echoes)[0];
      origins = [(offBeat?.root?.position || this.root.position).clone()];
    } else {
      variant = 'collapse_ring';
      inward = this._logicPulseIndex % 2 === 1;
      // The central cathedral floor is open, but the processional edge has
      // real cover and combat pickups around 21-25 m. Reach that outer ring so
      // Phase 3 evicts a stationary hiding player without ignoring cover.
      radius = Math.max(5, Math.min(30, Math.hypot(
        playerSnapshot.x - this.root.position.x,
        playerSnapshot.z - this.root.position.z
      )));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.2, radius - 1.15), radius + 1.15, 48),
        new THREE.MeshBasicMaterial({ color: inward ? 0xff4fd8 : 0xd7ff3f, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.root.position.x, 0.08, this.root.position.z);
      ctx.scene.add(ring);
      visuals.push(ring);
    }

    if (variant !== 'collapse_ring') {
      const color = variant === 'offbeat_echo' ? 0xff4fd8 : 0x43e8df;
      for (const origin of origins) {
        const delta = playerSnapshot.clone().sub(origin).setY(0);
        const length = Math.max(1, Math.min(26, delta.length() + 3));
        if (delta.lengthSq() <= 0.001) delta.set(0, 0, 1);
        delta.normalize();
        const end = origin.clone().addScaledVector(delta, length);
        const lane = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.05, length),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false })
        );
        lane.position.copy(origin).add(end).multiplyScalar(0.5);
        lane.position.y = 0.08;
        lane.rotation.y = Math.atan2(delta.x, delta.z);
        ctx.scene.add(lane);
        visuals.push(lane);
      }
    }

    this._logicPulse = {
      variant, origins, target: playerSnapshot, radius, inward,
      visuals, timer: 0, windup: this.phase === 3 ? 0.72 : 0.9
    };
    this._logicPulseIndex++;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: variant === 'collapse_ring' ? 'algorithm_collapse_ring' : 'algorithm_logic_pulse',
      variant, phase: this.phase,
      telegraphSeconds: this._logicPulse.windup
    });
  }

  _updateLogicPulse(dt, ctx) {
    if (!this._logicPulse) {
      this._logicPulseCooldown -= dt;
      if (this._logicPulseCooldown <= 0 && this._attackState === 'idle') this._beginLogicPulse(ctx);
      return;
    }

    const pulse = this._logicPulse;
    pulse.timer += dt;
    const progress = Math.min(1, pulse.timer / pulse.windup);
    for (const visual of pulse.visuals) {
      if (visual.material) visual.material.opacity = 0.25 + progress * 0.45;
      if (pulse.variant === 'collapse_ring') {
        const scale = pulse.inward ? 1.35 - progress * 0.35 : 0.65 + progress * 0.35;
        visual.scale.setScalar(scale);
      }
    }
    if (progress < 1) return;

    const playerPos = ctx.player.position;
    let hitPlayer = false;
    if (pulse.variant === 'collapse_ring') {
      const distance = Math.hypot(playerPos.x - this.root.position.x, playerPos.z - this.root.position.z);
      hitPlayer = Math.abs(distance - pulse.radius) <= 1.4;
    } else {
      hitPlayer = pulse.origins.some(origin => {
        if (!this._hasLineOfSight(origin, playerPos, ctx.objects || [])) return false;
        const end = pulse.target;
        const vx = end.x - origin.x;
        const vz = end.z - origin.z;
        const lengthSq = vx * vx + vz * vz;
        const t = lengthSq > 0
          ? Math.max(0, Math.min(1.25, ((playerPos.x - origin.x) * vx + (playerPos.z - origin.z) * vz) / lengthSq))
          : 0;
        const closestX = origin.x + vx * t;
        const closestZ = origin.z + vz * t;
        return Math.hypot(playerPos.x - closestX, playerPos.z - closestZ) <= 1.25;
      });
    }
    if (hitPlayer) {
      ctx.damagePlayer?.(this.phase === 3 ? 20 : this.phase === 2 ? 18 : 16, {
        sourceKind: `algorithm_logic_pulse_${pulse.variant}`,
        sourceRoot: this.root, ownerRoot: this.root
      });
    }
    ctx.emitAIEvent?.(this.root, 'ability_released', {
      ability: pulse.variant === 'collapse_ring' ? 'algorithm_collapse_ring' : 'algorithm_logic_pulse',
      variant: pulse.variant,
      phase: this.phase, hitPlayer
    });
    this._clearLogicPulse(ctx.scene);
    this._logicPulseCooldown = this.phase === 3 ? 4.2 + this.rng() : 6.2 + this.rng() * 1.4;
    this._attackCooldown = Math.max(this._attackCooldown, 0.8);
  }

  _clearLogicPulse(scene) {
    if (!this._logicPulse) return;
    for (const visual of this._logicPulse.visuals) {
      scene?.remove?.(visual);
      visual.geometry?.dispose?.();
      visual.material?.dispose?.();
    }
    this._logicPulse = null;
  }

  _hasLineOfSight(origin, target, objects) {
    const direction = this._tmpDirection.copy(target).sub(origin);
    const distance = direction.length();
    if (distance <= 0.001) return true;
    direction.normalize();
    this._raycaster.set(origin, direction);
    this._raycaster.far = Math.max(0, distance - 0.2);
    return this._raycaster.intersectObjects(objects, false).length === 0;
  }

  _animateAsset(dt, time) {
    const speed = this.phase === 3 ? 2.2 : this.phase === 2 ? 1.4 : 1;
    this.refs.rings.forEach((ring, index) => {
      ring.rotation.x += dt * (0.14 + index * 0.07) * (index % 2 ? 1 : -1) * speed;
      ring.rotation.y += dt * (0.18 + index * 0.06) * (index % 2 ? -1 : 1) * speed;
    });
    this.refs.crown.rotation.z += dt * (this.phase === 3 ? 0.34 : 0.12);
    this.refs.core.rotation.y += dt * (this.phase === 3 ? 1.6 : 0.7);
    this.refs.weakRoot.rotation.y -= dt * 1.6;
    this.refs.weakHalo.rotation.z += dt * 0.65;
    this.refs.wings[0].rotation.z = Math.sin(time * 0.7) * 0.07;
    this.refs.wings[1].rotation.z = -Math.sin(time * 0.7) * 0.07;
    this.root.position.y = 0.8 + Math.sin(time * 1.15) * 0.08;
  }

  update(dt, ctx) {
    if (this._removed) return;
    const frameTime = ctx.blackboard?.time;
    if (Number.isFinite(frameTime) && frameTime === this._lastUpdateTime) return;
    if (Number.isFinite(frameTime)) this._lastUpdateTime = frameTime;
    const hpRatio = this._hp / this.maxHp;
    if (this.phase === 1 && hpRatio <= 0.65) this._enterParadox();
    if (this.phase === 2 && hpRatio <= 0.25) this._enterCollapse();

    if (Number.isFinite(this._weakpointTimer) && this._weakpointTimer > 0) {
      this._weakpointTimer = Math.max(0, this._weakpointTimer - dt);
      if (this._weakpointTimer === 0) this._closeWeakpoint();
    }
    if (this.phase === 2 && this.echoes.size === 0 && this._weakpointTimer <= 0) {
      this._echoRespawnTimer -= dt;
      if (this._echoRespawnTimer <= 0) this._spawnEchoPack();
    }

    this._updateLogicPulse(dt, ctx);
    if (!this._logicPulse) this._updateEyeSweep(dt, ctx);
    this._animateAsset(dt, ctx.blackboard?.time || performance.now() * 0.001);
    this.invuln = this._damageLocked();
    if (this._hp <= 0) this.onRemoved(ctx.scene);
  }

  _clearNodes() {
    for (const node of Array.from(this.nodes)) {
      if (this.enemyManager.enemies.has(node.root)) this.enemyManager.remove(node.root);
    }
    this.nodes.clear();
  }

  _clearEchoes() {
    this._clearingEchoes = true;
    for (const echo of Array.from(this.echoes)) {
      if (this.enemyManager.enemies.has(echo.root)) this.enemyManager.remove(echo.root);
    }
    this.echoes.clear();
    this._clearingEchoes = false;
  }

  onRemoved(scene) {
    if (this._removed) return;
    this._removed = true;
    this.refs.beam.visible = false;
    this.refs.beamCore.visible = false;
    this.refs.eyeLight.intensity = 0;
    this._clearLogicPulse(scene);
    this._clearNodes();
    this._clearEchoes();
    scene?.remove?.(this.root);
  }

  _approachAngle(current, target, maxStep) {
    let delta = this._wrapAngle(target - current);
    delta = Math.max(-maxStep, Math.min(maxStep, delta));
    return this._wrapAngle(current + delta);
  }

  _lerpAngle(start, end, t) {
    return this._wrapAngle(start + this._wrapAngle(end - start) * t);
  }

  _wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
