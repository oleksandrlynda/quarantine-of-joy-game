import { createPropagandaPelican } from '../assets/propaganda-pelican.js';
import { cloneNodeMaterial, getCachedRenderResource, instantiateSharedTemplate } from './render-template.js';

const PELICAN_BALANCE = Object.freeze({
  releaseMin: 5,
  releaseMax: 7,
  cruiseAltitudeMin: 6,
  cruiseAltitudeMax: 7.5,
  approachSpeed: 7,
  retreatSpeed: 8.5,
  retreatDistance: 16,
  separationRadius: 3.2,
  separationWeight: 1.8,
  rechargeMin: 3.5,
  rechargeMax: 4.5,
  grenadeGravity: 14,
  grenadeDamage: 22,
  grenadeEdgeDamage: 6,
  blastRadius: 2.6
});

const _templates = new WeakMap();
const _renderResources = new Map();

function resourcesFor(THREE) {
  return {
    grenadeGeometry: getCachedRenderResource(_renderResources, `${THREE.REVISION || 'three'}:pelican-grenade`, () => new THREE.SphereGeometry(0.18, 10, 8)),
    warningGeometry: getCachedRenderResource(_renderResources, `${THREE.REVISION || 'three'}:pelican-warning`, () => new THREE.RingGeometry(2.25, PELICAN_BALANCE.blastRadius, 32)),
    explosionGeometry: getCachedRenderResource(_renderResources, `${THREE.REVISION || 'three'}:pelican-explosion`, () => new THREE.SphereGeometry(1, 12, 8))
  };
}

export class PropagandaPelicanEnemy {
  constructor({ THREE, mats, cfg, spawnPos, rng = Math.random }) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.rng = rng;
    const built = instantiateSharedTemplate(
      _templates,
      THREE,
      () => createPropagandaPelican({ THREE, mats })
    );
    cloneNodeMaterial(built.head);
    cloneNodeMaterial(built.refs?.beakGlow);
    cloneNodeMaterial(built.refs?.warningPanel);
    built.root.position.copy(spawnPos);
    built.root.userData = { type: cfg.type, head: built.head, hp: cfg.hp, isFlyer: true };

    this.root = built.root;
    this.refs = built.refs || {};
    this.balance = PELICAN_BALANCE;
    this.state = 'recharge';
    this.stateTime = 0;
    this.rechargeTime = 1.1 + rng() * 0.8;
    this.releaseDistance = this._nextReleaseDistance();
    this.cruiseAltitude = PELICAN_BALANCE.cruiseAltitudeMin
      + rng() * (PELICAN_BALANCE.cruiseAltitudeMax - PELICAN_BALANCE.cruiseAltitudeMin);
    this.retreatTarget = null;
    this.grenades = [];
    this._t = 0;
    this._yaw = built.root.rotation.y || 0;
    this._resources = resourcesFor(THREE);
    this._setArmed(false);
  }

  _nextReleaseDistance() {
    return PELICAN_BALANCE.releaseMin
      + this.rng() * (PELICAN_BALANCE.releaseMax - PELICAN_BALANCE.releaseMin);
  }

  _setArmed(armed) {
    for (const node of [this.refs.beakGlow, this.refs.warningPanel]) {
      if (!node?.material) continue;
      node.material.emissiveIntensity = armed ? 1.6 : 0.35;
    }
  }

  _horizontalDirection(from, to) {
    const direction = new this.THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    if (direction.lengthSq() > 0.0001) direction.normalize();
    return direction;
  }

  _move(ctx, direction, speed, dt, maxDistance = Infinity) {
    if (!direction || direction.lengthSq() <= 0.0001) return;
    const steer = direction.clone().setY(0);
    const separation = ctx.separation?.(this.root.position, PELICAN_BALANCE.separationRadius, this.root);
    if (separation?.lengthSq() > 0.0001) {
      steer.addScaledVector(separation.normalize(), PELICAN_BALANCE.separationWeight);
    }
    if (steer.lengthSq() <= 0.0001) return;
    const step = steer.normalize().multiplyScalar(Math.min(speed * dt, maxDistance));
    ctx.moveWithCollisions?.(this.root, step);
  }

  _dropGrenade(ctx, playerPos, approachDirection) {
    const THREE = this.THREE;
    const groundY = Math.max(0.12, playerPos.y - 1.6);
    const origin = this.root.position.clone();
    origin.y -= 0.55;
    const fallDistance = Math.max(0.5, origin.y - groundY);
    const flightTime = Math.sqrt((2 * fallDistance) / PELICAN_BALANCE.grenadeGravity);
    const target = new THREE.Vector3(playerPos.x, groundY, playerPos.z);
    const velocity = target.clone().sub(origin).multiplyScalar(1 / Math.max(0.35, flightTime));
    velocity.y = 0;
    // Preserve the attack-run feeling while keeping the sampled landing point fair.
    if (approachDirection?.lengthSq() > 0) velocity.addScaledVector(approachDirection, 0.35);
    velocity.y = 0;

    const material = new THREE.MeshLambertMaterial({
      color: 0xaecb42,
      emissive: 0xff8a2a,
      emissiveIntensity: 0.7
    });
    const mesh = new THREE.Mesh(this._resources.grenadeGeometry, material);
    mesh.position.copy(origin);
    ctx.scene?.add(mesh);

    const warningMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5a36,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const warning = new THREE.Mesh(this._resources.warningGeometry, warningMaterial);
    warning.rotation.x = -Math.PI / 2;
    warning.position.set(target.x, groundY + 0.035, target.z);
    ctx.scene?.add(warning);

    this.grenades.push({ mesh, warning, velocity, targetY: groundY, age: 0, phase: 'falling', explosionAge: 0 });
    ctx.emitAIEvent?.(this.root, 'pelican_grenade_dropped', {
      releaseDistance: Math.hypot(playerPos.x - this.root.position.x, playerPos.z - this.root.position.z),
      configuredReleaseDistance: this.releaseDistance
    });
  }

  _explode(grenade, ctx) {
    const playerPos = ctx.player?.position;
    const blastX = grenade.mesh.position.x;
    const blastZ = grenade.mesh.position.z;
    grenade.mesh.position.y = grenade.targetY + 0.25;
    grenade.mesh.geometry = this._resources.explosionGeometry;
    grenade.mesh.material?.dispose?.();
    grenade.mesh.material = new this.THREE.MeshBasicMaterial({
      color: 0xff6a2b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    grenade.mesh.scale.setScalar(0.2);
    grenade.phase = 'exploding';
    grenade.explosionAge = 0;
    if (grenade.warning) {
      ctx.scene?.remove(grenade.warning);
      grenade.warning.material?.dispose?.();
      grenade.warning = null;
    }

    if (playerPos) {
      const distance = Math.hypot(playerPos.x - blastX, playerPos.z - blastZ);
      const playerGroundY = playerPos.y - 1.6;
      if (distance <= PELICAN_BALANCE.blastRadius && Math.abs(playerGroundY - grenade.targetY) <= 2.5) {
        const t = Math.min(1, distance / PELICAN_BALANCE.blastRadius);
        const damage = Math.round(
          PELICAN_BALANCE.grenadeDamage
          + (PELICAN_BALANCE.grenadeEdgeDamage - PELICAN_BALANCE.grenadeDamage) * t
        );
        ctx.damagePlayer?.(damage, {
          sourceKind: 'pelican_grenade',
          sourceRoot: this.root,
          ownerRoot: this.root
        });
      }
    }
    ctx.emitAIEvent?.(this.root, 'pelican_grenade_exploded', { blastRadius: PELICAN_BALANCE.blastRadius });
  }

  _updateGrenades(dt, ctx) {
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      const grenade = this.grenades[index];
      if (grenade.phase === 'falling') {
        grenade.age += dt;
        grenade.velocity.y -= PELICAN_BALANCE.grenadeGravity * dt;
        grenade.mesh.position.addScaledVector(grenade.velocity, dt);
        grenade.mesh.rotation.x += dt * 9;
        grenade.mesh.rotation.z += dt * 6;
        if (grenade.warning?.material) {
          grenade.warning.material.opacity = 0.45 + Math.sin(grenade.age * 14) * 0.2;
        }
        if (grenade.mesh.position.y <= grenade.targetY + 0.18 || grenade.age >= 1.5) {
          this._explode(grenade, ctx);
        }
        continue;
      }

      grenade.explosionAge += dt;
      const progress = Math.min(1, grenade.explosionAge / 0.28);
      grenade.mesh.scale.setScalar(0.2 + PELICAN_BALANCE.blastRadius * progress);
      grenade.mesh.material.opacity = 0.8 * (1 - progress);
      if (progress >= 1) {
        ctx.scene?.remove(grenade.mesh);
        grenade.mesh.material?.dispose?.();
        this.grenades.splice(index, 1);
      }
    }
  }

  _animate(dt) {
    this._t += dt;
    const flap = Math.sin(this._t * (this.state === 'approach' ? 7 : 4.5)) * 0.18;
    if (this.refs.leftWing) this.refs.leftWing.rotation.z = -0.08 + flap;
    if (this.refs.rightWing) this.refs.rightWing.rotation.z = 0.08 - flap;
  }

  _face(direction, dt) {
    if (!direction || direction.lengthSq() <= 0.0001) return;
    const targetYaw = Math.atan2(direction.x, direction.z);
    let delta = ((targetYaw - this._yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    this._yaw += Math.max(-2.8 * dt, Math.min(2.8 * dt, delta));
    this.root.rotation.y = this._yaw;
    this.root.rotation.z += ((-delta * 0.3) - this.root.rotation.z) * Math.min(1, dt * 5);
  }

  update(dt, ctx) {
    this.stateTime += dt;
    this._updateGrenades(dt, ctx);
    this._animate(dt);

    const e = this.root;
    const playerPos = ctx.player.position;
    e.position.y += (this.cruiseAltitude - e.position.y) * Math.min(1, dt * 3.2);
    const toPlayer = this._horizontalDirection(e.position, playerPos);
    const distance = Math.hypot(playerPos.x - e.position.x, playerPos.z - e.position.z);

    if (this.state === 'recharge') {
      // Recharge at standoff instead of hovering directly over the player.
      const steer = distance < 14 ? toPlayer.clone().multiplyScalar(-1) : new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      this._move(ctx, steer, 4.2, dt);
      this._face(steer, dt);
      ctx.setAIState?.(e, 'recharging');
      if (this.stateTime >= this.rechargeTime) {
        this.state = 'approach';
        this.stateTime = 0;
        this._setArmed(true);
        ctx.emitAIEvent?.(e, 'pelican_attack_run_started', {});
      }
      return;
    }

    if (this.state === 'approach') {
      this._move(
        ctx,
        toPlayer,
        PELICAN_BALANCE.approachSpeed,
        dt,
        Math.max(0, distance - this.releaseDistance)
      );
      this._face(toPlayer, dt);
      ctx.setAIState?.(e, 'bombing_run');
      const releaseDistance = Math.hypot(playerPos.x - e.position.x, playerPos.z - e.position.z);
      if (releaseDistance <= this.releaseDistance + 0.01) {
        this._dropGrenade(ctx, playerPos.clone(), toPlayer);
        const retreatDirection = toPlayer.clone().multiplyScalar(-1);
        this.retreatTarget = e.position.clone().addScaledVector(retreatDirection, PELICAN_BALANCE.retreatDistance);
        this.retreatTarget.y = this.cruiseAltitude;
        this.state = 'retreat';
        this.stateTime = 0;
        this._setArmed(false);
      }
      return;
    }

    const retreatDirection = this._horizontalDirection(e.position, this.retreatTarget || e.position);
    this._move(ctx, retreatDirection, PELICAN_BALANCE.retreatSpeed, dt);
    this._face(retreatDirection, dt);
    ctx.setAIState?.(e, 'retreating');
    if (!this.retreatTarget || e.position.distanceToSquared(this.retreatTarget) <= 2.25 || this.stateTime >= 2.8) {
      this.state = 'recharge';
      this.stateTime = 0;
      this.rechargeTime = PELICAN_BALANCE.rechargeMin
        + this.rng() * (PELICAN_BALANCE.rechargeMax - PELICAN_BALANCE.rechargeMin);
      this.releaseDistance = this._nextReleaseDistance();
      this.retreatTarget = null;
      ctx.emitAIEvent?.(e, 'pelican_recharge_started', { rechargeTime: this.rechargeTime });
    }
  }

  onRemoved(scene) {
    for (const grenade of this.grenades) {
      scene?.remove(grenade.mesh);
      scene?.remove(grenade.warning);
      grenade.mesh?.material?.dispose?.();
      grenade.warning?.material?.dispose?.();
    }
    this.grenades.length = 0;
  }
}

export { PELICAN_BALANCE };
