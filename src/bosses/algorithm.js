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
    pickups.dropMultiple('ammo', position.clone(), count);
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
    this._attackIndex++;
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
    this._beamHitCooldown = 0.7;
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

    this._updateEyeSweep(dt, ctx);
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
