import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

export class SMG extends Weapon {
  constructor() {
    super({
      name: 'SMG',
      mode: 'auto',
      fireDelayMs: 80, // ~12.5 rps
      magSize: 36,
      reserve: 108
    });
    this._bloom = 0; // grows while firing, decays on update
    this._maxBloom = 0.08; // radians (~4.6 deg)
    this._baseSpread = 0.008; // radians (~0.46 deg)
    this._falloffStart = 10; // modest falloff beyond 10 units
    this._range = 60;
  }

  triggerUp() {
    super.triggerUp();
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    // decay bloom quickly
    this._bloom = Math.max(0, this._bloom - dt * 0.18);
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    if (S && S.shot) S.shot('smg');
    effects?.spawnMuzzleFlash?.(0.35);

    // Compute directional spread using camera basis
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const spread = this._baseSpread + this._bloom * this._maxBloom;
    const rx = (Math.random() * 2 - 1) * spread;
    const ry = (Math.random() * 2 - 1) * spread;
    const dir = forward.clone().add(right.multiplyScalar(rx)).add(up.multiplyScalar(ry)).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());

    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: this._range });
    const end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(this._range));

    if (res.type === 'enemy' && res.enemyRoot) {
      const isHead = !!res.isHead;
      const dist = res.distance || origin.distanceTo(end);
      const fall = dist <= this._falloffStart ? 1.0 : Math.max(0.7, 1 - (dist - this._falloffStart) / (this._range - this._falloffStart));
      const dmg = (isHead ? 45 : 18) * fall;
      res.enemyRoot.userData.hp -= dmg;
      // tiny pushback
      res.enemyRoot.position.add(dir.clone().multiplyScalar(0.12));
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (res.enemyRoot.userData.hp <= 0) {
        effects?.enemyDeath?.(res.enemyRoot.position.clone());
        pickups?.maybeDrop?.(res.enemyRoot.position.clone());
        enemyManager.remove(res.enemyRoot);
        const base = isHead ? 150 : 100;
        const finalScore = Math.round(base * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
        if (S && S.kill) S.kill();
      } else {
        addComboAction?.(0.25);
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 18);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
    }

    // tracer
    if (ctx.addTracer) ctx.addTracer(origin, end);
    this._bloom = Math.min(1, this._bloom + 0.08);
    ctx.updateHUD?.();
  }
}


