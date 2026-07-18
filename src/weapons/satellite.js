import { Weapon } from './base.js';

export function calculateSatelliteDamage(baseDamage, distance, radius) {
  const safeRadius = Math.max(0.001, Number(radius) || 0.001);
  const normalized = Math.max(0, Math.min(1, (Number(distance) || 0) / safeRadius));
  return Math.floor(Math.max(0, Number(baseDamage) || 0) * (0.25 + 0.75 * (1 - normalized)));
}

export class SatelliteDesignator extends Weapon {
  constructor() {
    super({
      name: 'Satellite',
      mode: 'semi',
      fireDelayMs: 1600,
      magSize: 2,
      reserve: 3
    });
    this.strikeDelay = 1.35;
    this.strikeRadius = 6.5;
    this.baseDamage = 300;
    this.maxRange = 42;
    this.maxPendingStrikes = 1;
    this.beamLifetime = 0.24;
    this.pendingStrikes = [];
    this.activeBeams = [];
    this._worldAssets = null;
  }

  canFire(nowMs) {
    return this.pendingStrikes.length < this.maxPendingStrikes && super.canFire(nowMs);
  }

  onFire(ctx) {
    const { THREE, obstacleManager, effects, S } = ctx;
    if (!THREE || !obstacleManager?.scene) return;
    const position = this._resolveTargetPoint(ctx);
    if (!position) return;
    const warning = this._createWarning(THREE, position);
    obstacleManager.scene.add(warning);
    this.pendingStrikes.push({
      position,
      warning,
      age: 0,
      attackId: ctx.attackId
    });
    effects?.spawnGroundRing?.(position, this.strikeRadius, 0x63e6ff);
    S?.shot?.('pistol');
    ctx.updateHUD?.();
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const completed = [];
    for (const strike of this.pendingStrikes) {
      strike.age += dt;
      const progress = Math.min(1, strike.age / this.strikeDelay);
      const pulse = 1 + Math.sin(strike.age * 20) * 0.045 + progress * 0.12;
      strike.warning.scale.set(pulse, pulse, pulse);
      for (const material of strike.warning.userData.materials || []) {
        material.opacity = 0.28 + progress * 0.52;
      }
      if (strike.age >= this.strikeDelay) completed.push(strike);
    }

    if (completed.length) {
      const completedSet = new Set(completed);
      this.pendingStrikes = this.pendingStrikes.filter(strike => !completedSet.has(strike));
      for (const strike of completed) {
        ctx.obstacleManager?.scene?.remove?.(strike.warning);
        this._disposeInstanceMaterials(strike.warning);
        this._impact(strike.position, ctx, strike.attackId);
      }
      ctx.updateHUD?.();
    }

    const survivingBeams = [];
    for (const beam of this.activeBeams) {
      beam.age += dt;
      const remaining = Math.max(0, 1 - beam.age / this.beamLifetime);
      for (const material of beam.root.userData.materials || []) material.opacity = remaining;
      beam.root.scale.x = 1 + (1 - remaining) * 0.4;
      beam.root.scale.z = beam.root.scale.x;
      if (beam.age < this.beamLifetime) {
        survivingBeams.push(beam);
      } else {
        ctx.obstacleManager?.scene?.remove?.(beam.root);
        this._disposeInstanceMaterials(beam.root);
      }
    }
    this.activeBeams = survivingBeams;
  }

  clearWorld(ctx) {
    for (const strike of this.pendingStrikes) {
      ctx?.obstacleManager?.scene?.remove?.(strike.warning);
      this._disposeInstanceMaterials(strike.warning);
    }
    for (const beam of this.activeBeams) {
      ctx?.obstacleManager?.scene?.remove?.(beam.root);
      this._disposeInstanceMaterials(beam.root);
    }
    this.pendingStrikes.length = 0;
    this.activeBeams.length = 0;
  }

  _resolveTargetPoint(ctx) {
    const { THREE, camera, raycaster, objects } = ctx;
    if (!THREE || !camera) return null;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
    raycaster?.set?.(origin, direction);
    if (raycaster) {
      raycaster.near = 0;
      raycaster.far = this.maxRange;
    }
    const hit = Array.isArray(objects) && objects.length
      ? raycaster?.intersectObjects?.(objects, true)?.[0]
      : null;
    let point = hit?.point?.clone?.() || null;

    if (!point && direction.y < -0.01) {
      const distanceToGround = (0.06 - origin.y) / direction.y;
      if (distanceToGround > 0 && distanceToGround <= this.maxRange) {
        point = origin.clone().addScaledVector(direction, distanceToGround);
      }
    }
    if (!point) {
      const horizontal = new THREE.Vector3(direction.x, 0, direction.z);
      if (horizontal.lengthSq() < 0.0001) horizontal.set(0, 0, -1);
      point = origin.clone().addScaledVector(horizontal.normalize(), Math.min(24, this.maxRange));
    }

    const horizontalOffset = new THREE.Vector2(point.x - origin.x, point.z - origin.z);
    if (horizontalOffset.length() > this.maxRange) {
      horizontalOffset.setLength(this.maxRange);
      point.x = origin.x + horizontalOffset.x;
      point.z = origin.z + horizontalOffset.y;
    }
    point.y = 0.06;
    return point;
  }

  _impact(position, ctx, attackId) {
    const { THREE, enemyManager, effects, pickups, addScore, addComboAction, S } = ctx;
    const beam = this._createBeam(THREE, position);
    ctx.obstacleManager?.scene?.add?.(beam);
    this.activeBeams.push({ root: beam, age: 0 });
    effects?.spawnExplosion?.(position, this.strikeRadius * 0.72, 0x7de8ff);
    effects?.spawnGroundRing?.(position, this.strikeRadius, 0xe7fbff);
    effects?.shake?.(0.32, 0.38);
    S?.explosion?.();
    ctx.obstacleManager?.handleRadialHit?.(position, this.strikeRadius, this.baseDamage * 1.4);

    for (const root of Array.from(enemyManager?.enemies || [])) {
      const distance = root.position.distanceTo(position);
      if (distance > this.strikeRadius) continue;
      const damage = calculateSatelliteDamage(this.baseDamage, distance, this.strikeRadius);
      root.userData.hp -= damage;
      const killed = root.userData.hp <= 0;
      this.recordCombatHit(ctx, root, { damage, killed, distance, attackId });
      if (!killed) {
        addComboAction?.(0.25);
        S?.enemyPain?.(root?.userData?.type || 'grunt');
        continue;
      }
      effects?.enemyDeath?.(root.position.clone());
      const enemyType = root?.userData?.type;
      if (enemyType === 'tank') pickups?.dropMultiple?.('random', root.position.clone(), 3);
      else pickups?.maybeDrop?.(root.position.clone());
      enemyManager.remove(root);
      addScore?.(Math.round(120 * (ctx.combo?.multiplier || 1)));
      addComboAction?.(1);
      S?.enemyDeath?.(enemyType || 'grunt');
    }
  }

  _ensureWorldAssets(THREE) {
    if (this._worldAssets) return this._worldAssets;
    this._worldAssets = {
      warningRing: new THREE.RingGeometry(this.strikeRadius * 0.82, this.strikeRadius, 48),
      warningCore: new THREE.RingGeometry(0.18, 0.28, 20),
      beamOuter: new THREE.CylinderGeometry(0.72, 1.05, 30, 16, 1, true),
      beamCore: new THREE.CylinderGeometry(0.2, 0.34, 30, 12, 1, true)
    };
    return this._worldAssets;
  }

  _createWarning(THREE, position) {
    const assets = this._ensureWorldAssets(THREE);
    const root = new THREE.Group();
    root.position.copy(position);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0x63e6ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const outer = new THREE.Mesh(assets.warningRing, outerMaterial);
    const core = new THREE.Mesh(assets.warningCore, coreMaterial);
    outer.rotation.x = core.rotation.x = -Math.PI / 2;
    root.add(outer, core);
    root.userData.materials = [outerMaterial, coreMaterial];
    return root;
  }

  _createBeam(THREE, position) {
    const assets = this._ensureWorldAssets(THREE);
    const root = new THREE.Group();
    root.position.set(position.x, 15, position.z);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0x55dfff,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    root.add(
      new THREE.Mesh(assets.beamOuter, outerMaterial),
      new THREE.Mesh(assets.beamCore, coreMaterial)
    );
    root.userData.materials = [outerMaterial, coreMaterial];
    return root;
  }

  _disposeInstanceMaterials(root) {
    for (const material of root?.userData?.materials || []) material.dispose?.();
    if (root?.userData) root.userData.materials = [];
  }
}
