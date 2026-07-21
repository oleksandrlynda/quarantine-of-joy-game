import { Weapon } from './base.js';

export function calculateGravityWellDamage(baseDamage, distance, radius) {
  const safeRadius = Math.max(0.001, Number(radius) || 0.001);
  const normalized = Math.max(0, Math.min(1, (Number(distance) || 0) / safeRadius));
  return Math.floor(Math.max(0, Number(baseDamage) || 0) * (0.3 + 0.7 * (1 - normalized)));
}

export class GravityWell extends Weapon {
  constructor() {
    super({
      name: 'GravityWell',
      mode: 'semi',
      fireDelayMs: 900,
      magSize: 2,
      reserve: 3
    });
    this.throwSpeed = 14;
    this.gravity = 10.5;
    this.pullRadius = 8;
    this.pullSpeed = 11;
    this.runnerPullMultiplier = 1.6;
    this.airPullMultiplier = 2.8;
    this.playerPullAcceleration = 52;
    this.playerSafeRadius = 1.1;
    this.activeSeconds = 2.5;
    this.implosionRadius = 5.5;
    this.baseDamage = 240;
    this.maxActiveWells = 1;
    this.wells = [];
    this._worldAssets = null;
  }

  canFire(nowMs) {
    return this.wells.length < this.maxActiveWells && super.canFire(nowMs);
  }

  onFire(ctx) {
    const { THREE, camera, obstacleManager, S } = ctx;
    if (!THREE || !camera || !obstacleManager?.scene || this.wells.length >= this.maxActiveWells) return false;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const override = ctx.abilityTargetPoint;
    const hasExplicitTarget = Number.isFinite(Number(override?.x)) && Number.isFinite(Number(override?.z));
    const direction = camera.getWorldDirection(new THREE.Vector3());
    direction.y += 0.14;
    direction.normalize();
    const root = this._createWellModel(THREE);
    if (hasExplicitTarget) root.position.set(Number(override.x), 0.24, Number(override.z));
    else root.position.copy(origin).addScaledVector(direction, 0.5);
    obstacleManager.scene.add(root);
    const well = {
      root,
      velocity: hasExplicitTarget
        ? new THREE.Vector3()
        : direction.multiplyScalar(this.throwSpeed),
      state: hasExplicitTarget ? 'active' : 'flying',
      activeAge: 0,
      attackId: ctx.attackId
    };
    this.wells.push(well);
    if (hasExplicitTarget) this._activate(well, ctx);
    S?.shot?.('grenade');
    ctx.updateHUD?.();
    return true;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.wells.length) return;
    const completed = [];
    for (const well of this.wells) {
      const rotor = well.root.userData.rotor;
      if (rotor) {
        rotor.rotation.x += dt * (well.state === 'active' ? 7.5 : 4.5);
        rotor.rotation.y += dt * (well.state === 'active' ? 9 : 5.5);
      }
      if (well.state === 'flying') {
        const previous = well.root.position.clone();
        well.velocity.y -= this.gravity * dt;
        well.root.position.addScaledVector(well.velocity, dt);
        const worldHit = this._findWorldHit(previous, well.root.position, well.root, ctx);
        if (worldHit || well.root.position.y <= 0.24) {
          if (worldHit) well.root.position.copy(worldHit);
          well.root.position.y = 0.24;
          well.velocity.set(0, 0, 0);
          this._activate(well, ctx);
        }
        continue;
      }
      if (well.state !== 'active') continue;

      well.activeAge += dt;
      const progress = Math.min(1, well.activeAge / this.activeSeconds);
      const core = well.root.userData.core;
      const field = well.root.userData.field;
      if (core) core.scale.setScalar(1 + Math.sin(well.activeAge * 18) * 0.12 + progress * 0.25);
      if (field) {
        const pulse = 0.96 + Math.sin(well.activeAge * 7) * 0.035;
        field.scale.set(pulse, pulse, pulse);
        field.material.opacity = 0.16 + progress * 0.16;
      }
      this._pullEnemies(well.root.position, dt, ctx);
      this._pullPlayer(well.root.position, dt, ctx);
      if (well.activeAge >= this.activeSeconds) completed.push(well);
    }

    if (!completed.length) return;
    const completedSet = new Set(completed);
    this.wells = this.wells.filter(well => !completedSet.has(well));
    for (const well of completed) {
      this._implode(well.root.position.clone(), ctx, well.attackId);
      ctx.obstacleManager?.scene?.remove?.(well.root);
    }
    ctx.updateHUD?.();
  }

  clearWorld(ctx) {
    for (const well of this.wells) ctx?.obstacleManager?.scene?.remove?.(well.root);
    this.wells.length = 0;
  }

  _activate(well, ctx) {
    well.state = 'active';
    well.activeAge = 0;
    well.root.userData.field.visible = true;
    well.root.userData.light.intensity = 1.8;
    ctx.effects?.spawnGroundRing?.(well.root.position, this.pullRadius, 0xb56cff);
    ctx.effects?.shake?.(0.08, 0.12);
  }

  _pullEnemies(position, dt, ctx) {
    for (const root of Array.from(ctx.enemyManager?.enemies || [])) {
      if (!root?.position || root.userData?.hp <= 0) continue;
      const toward = position.clone().sub(root.position);
      const horizontalDistance = Math.hypot(toward.x, toward.z);
      if (horizontalDistance <= 0.35 || horizontalDistance > this.pullRadius) continue;
      const type = String(root.userData?.type || root.userData?.behaviorId || '');
      const isAirborne = type.startsWith('flyer') || type === 'pelican' || type === 'swarm_warden';
      if (!isAirborne) toward.y = 0;
      const strength = 0.65 + 0.35 * (1 - horizontalDistance / this.pullRadius);
      const multiplier = isAirborne
        ? this.airPullMultiplier
        : (type === 'rusher' || type.startsWith('rusher_') ? this.runnerPullMultiplier : 1);
      toward.normalize().multiplyScalar(this.pullSpeed * multiplier * strength * dt);
      ctx.enemyManager?.applyKnockback?.(root, toward);
    }
  }

  _pullPlayer(position, dt, ctx) {
    if (ctx.suppressGravityPlayerPull === true) return;
    const playerPosition = ctx.getPlayerPosition?.(new ctx.THREE.Vector3());
    if (!playerPosition || typeof ctx.applyPlayerKnockback !== 'function') return;
    const toward = position.clone().sub(playerPosition);
    toward.y = 0;
    const distance = toward.length();
    if (distance <= this.playerSafeRadius || distance > this.pullRadius) return;
    const strength = 0.65 + 0.35 * (1 - distance / this.pullRadius);
    toward.normalize().multiplyScalar(this.playerPullAcceleration * strength * dt);
    ctx.applyPlayerKnockback(toward);
  }

  _implode(position, ctx, attackId) {
    const { THREE, enemyManager, effects, pickups, addScore, addComboAction, S } = ctx;
    effects?.spawnExplosion?.(position, this.implosionRadius, 0x9b5cff);
    effects?.spawnGroundRing?.(position, this.implosionRadius * 1.2, 0xe2c8ff);
    effects?.shake?.(0.38, 0.42);
    S?.explosion?.();
    ctx.obstacleManager?.handleRadialHit?.(position, this.implosionRadius, this.baseDamage * 1.5);

    for (const root of Array.from(enemyManager?.enemies || [])) {
      const distance = root.position.distanceTo(position);
      if (distance > this.implosionRadius) continue;
      const damage = calculateGravityWellDamage(this.baseDamage, distance, this.implosionRadius);
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
      addScore?.(Math.round(130 * (ctx.combo?.multiplier || 1)));
      addComboAction?.(1);
      S?.enemyDeath?.(enemyType || 'grunt');
    }
  }

  _findWorldHit(previous, current, ownRoot, ctx) {
    const raycaster = ctx.raycaster;
    const objects = ctx.objects;
    if (!raycaster?.set || !raycaster?.intersectObjects || !Array.isArray(objects) || !objects.length) return null;
    const delta = current.clone().sub(previous);
    const distance = delta.length();
    if (distance <= 0.0001) return null;
    raycaster.set(previous, delta.multiplyScalar(1 / distance));
    raycaster.near = 0;
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(objects, true).find(result => result?.object !== ownRoot);
    return hit?.point?.clone?.() || null;
  }

  _createWellModel(THREE) {
    if (!this._worldAssets) {
      this._worldAssets = {
        coreGeometry: new THREE.SphereGeometry(0.3, 12, 10),
        ringGeometry: new THREE.TorusGeometry(0.52, 0.045, 6, 24),
        fieldGeometry: new THREE.RingGeometry(this.pullRadius * 0.88, this.pullRadius, 64),
        coreMaterial: new THREE.MeshBasicMaterial({ color: 0xe8d5ff }),
        ringMaterial: new THREE.MeshBasicMaterial({ color: 0xa855f7 }),
        fieldMaterial: new THREE.MeshBasicMaterial({
          color: 0xb56cff,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      };
    }
    const assets = this._worldAssets;
    const root = new THREE.Group();
    const core = new THREE.Mesh(assets.coreGeometry, assets.coreMaterial);
    const rotor = new THREE.Group();
    const ringA = new THREE.Mesh(assets.ringGeometry, assets.ringMaterial);
    const ringB = new THREE.Mesh(assets.ringGeometry, assets.ringMaterial);
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.y = Math.PI / 2;
    rotor.add(ringA, ringB);
    const field = new THREE.Mesh(assets.fieldGeometry, assets.fieldMaterial);
    field.rotation.x = -Math.PI / 2;
    field.position.y = -0.18;
    field.visible = false;
    const light = new THREE.PointLight(0xb56cff, 0.45, 8, 2);
    root.add(core, rotor, field, light);
    root.userData.core = core;
    root.userData.rotor = rotor;
    root.userData.field = field;
    root.userData.light = light;
    return root;
  }
}
