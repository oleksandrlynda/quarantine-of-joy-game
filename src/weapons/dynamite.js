import { Weapon } from './base.js';

export function calculateDynamiteDamage(baseDamage, distance, radius) {
  const safeRadius = Math.max(0.001, Number(radius) || 0.001);
  const normalized = Math.max(0, Math.min(1, (Number(distance) || 0) / safeRadius));
  return Math.floor(Math.max(0, Number(baseDamage) || 0) * (0.3 + 0.7 * (1 - normalized)));
}

export class Dynamite extends Weapon {
  constructor() {
    super({
      name: 'Dynamite',
      mode: 'semi',
      fireDelayMs: 450,
      magSize: 3,
      reserve: 3
    });
    this.gravity = 13;
    this.throwSpeed = 15.5;
    this.blastRadius = 5.2;
    this.baseDamage = 180;
    this.fuseSeconds = 2.6;
    this.maxActiveCharges = 3;
    this.charges = [];
    this._worldAssets = null;
  }

  canFire(nowMs) {
    return this.charges.length < this.maxActiveCharges && super.canFire(nowMs);
  }

  onFire(ctx) {
    const { THREE, camera, obstacleManager } = ctx;
    if (!THREE || !camera || !obstacleManager?.scene) return;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3());
    direction.y += 0.16;
    direction.normalize();
    const root = this._createChargeModel(THREE);
    root.position.copy(origin).addScaledVector(direction, 0.45);
    root.rotation.z = Math.PI / 2;
    obstacleManager.scene.add(root);
    this.charges.push({
      root,
      velocity: direction.multiplyScalar(this.throwSpeed),
      state: 'flying',
      attachedRoot: null,
      attachedOffset: new THREE.Vector3(),
      age: 0,
      attackId: ctx.attackId
    });
    ctx.updateHUD?.();
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.charges.length) return;
    const enemies = ctx.enemyManager?.enemies;
    const expired = new Set();
    for (const charge of this.charges) {
      charge.age = Math.max(0, Number(charge.age) || 0) + dt;
      const fuse = charge.root.userData?.fuse;
      if (fuse) {
        const pulse = 0.8 + Math.sin(charge.age * 24) * 0.2;
        fuse.scale.setScalar(pulse);
      }
      if (charge.age >= this.fuseSeconds) {
        expired.add(charge);
        continue;
      }
      if (charge.state === 'attached') {
        if (charge.attachedRoot && enemies?.has?.(charge.attachedRoot)) {
          charge.root.position.copy(charge.attachedRoot.position).add(charge.attachedOffset);
        } else {
          charge.attachedRoot = null;
          charge.state = 'stuck';
        }
        continue;
      }
      if (charge.state !== 'flying') continue;

      const previous = charge.root.position.clone();
      charge.velocity.y -= this.gravity * dt;
      charge.root.position.addScaledVector(charge.velocity, dt);
      charge.root.rotation.x += dt * 7;
      charge.root.rotation.z += dt * 10;

      const attachedEnemy = this._findEnemyContact(charge.root.position, enemies);
      if (attachedEnemy) {
        charge.state = 'attached';
        charge.attachedRoot = attachedEnemy;
        charge.attachedOffset.copy(charge.root.position).sub(attachedEnemy.position);
        charge.velocity.set(0, 0, 0);
        continue;
      }

      const worldHit = this._findWorldHit(previous, charge.root.position, charge.root, ctx);
      if (worldHit) {
        charge.root.position.copy(worldHit);
        charge.velocity.set(0, 0, 0);
        charge.state = 'stuck';
      } else if (charge.root.position.y <= 0.16) {
        charge.root.position.y = 0.16;
        charge.velocity.set(0, 0, 0);
        charge.state = 'stuck';
      }
    }
    if (!expired.size) return;
    this.charges = this.charges.filter(charge => !expired.has(charge));
    for (const charge of expired) {
      this._explode(charge.root.position.clone(), ctx, charge.attackId);
      ctx.obstacleManager?.scene?.remove?.(charge.root);
    }
    ctx.updateHUD?.();
  }

  clearWorld(ctx) {
    for (const charge of this.charges) ctx?.obstacleManager?.scene?.remove?.(charge.root);
    this.charges.length = 0;
  }

  _findEnemyContact(position, enemies) {
    for (const root of Array.from(enemies || [])) {
      if (!root?.position || root.userData?.hp <= 0) continue;
      if (root.position.distanceToSquared(position) <= 0.72 * 0.72) return root;
    }
    return null;
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

  _explode(position, ctx, attackId) {
    const { THREE, enemyManager, effects, pickups, addScore, addComboAction, S } = ctx;
    effects?.spawnExplosion?.(position, this.blastRadius, 0xff4f32)
      || effects?.spawnBulletImpact?.(position, new THREE.Vector3(0, 1, 0));
    effects?.shake?.(0.24, 0.3);
    S?.explosion?.();

    ctx.obstacleManager?.handleRadialHit?.(position, this.blastRadius, this.baseDamage * 1.5);
    for (const root of Array.from(enemyManager?.enemies || [])) {
      const distance = root.position.distanceTo(position);
      if (distance > this.blastRadius) continue;
      const damage = calculateDynamiteDamage(this.baseDamage, distance, this.blastRadius);
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

  _createChargeModel(THREE) {
    if (!this._worldAssets) {
      this._worldAssets = {
        stick: new THREE.CylinderGeometry(0.075, 0.075, 0.42, 8),
        cap: new THREE.CylinderGeometry(0.081, 0.081, 0.035, 8),
        fuse: new THREE.CylinderGeometry(0.018, 0.018, 0.15, 6),
        red: new THREE.MeshLambertMaterial({ color: 0xb91c1c }),
        dark: new THREE.MeshLambertMaterial({ color: 0x231b18 }),
        ember: new THREE.MeshBasicMaterial({ color: 0xffc247 })
      };
    }
    const assets = this._worldAssets;
    const root = new THREE.Group();
    const stick = new THREE.Mesh(assets.stick, assets.red);
    const lowerCap = new THREE.Mesh(assets.cap, assets.dark);
    const upperCap = new THREE.Mesh(assets.cap, assets.dark);
    lowerCap.position.y = -0.21;
    upperCap.position.y = 0.21;
    const fuse = new THREE.Mesh(assets.fuse, assets.ember);
    fuse.position.y = 0.3;
    fuse.rotation.z = -0.22;
    root.add(stick, lowerCap, upperCap, fuse);
    root.userData.fuse = fuse;
    return root;
  }
}
