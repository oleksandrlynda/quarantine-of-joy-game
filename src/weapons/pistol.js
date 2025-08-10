import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

export class Pistol extends Weapon {
  constructor() {
    super({
      name: 'Pistol',
      mode: 'semi',
      fireDelayMs: 260, // quick single shot
      magSize: 6,
      reserve: 24
    });
    this._baseSpread = 0.0035; // slightly less accurate than rifle
    this._bloom = 0;
    this._maxBloom = 0.02;
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    if (S && S.shot) S.shot('pistol');
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const spread = this._baseSpread + this._bloom * this._maxBloom;
    const rx = (Math.random() * 2 - 1) * spread;
    const ry = (Math.random() * 2 - 1) * spread;
    const dir = forward.clone().add(right.multiplyScalar(rx)).add(up.multiplyScalar(ry)).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: 70 });
    const end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(70));

    if (res.type === 'enemy' && res.enemyRoot) {
      const dmg = 75;
      res.enemyRoot.userData.hp -= dmg;
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (res.enemyRoot.userData.hp <= 0) {
        effects?.enemyDeath?.(res.enemyRoot.position.clone());
        pickups?.maybeDrop?.(res.enemyRoot.position.clone());
        enemyManager.remove(res.enemyRoot);
        const base = res.isHead ? 150 : 100;
        const finalScore = Math.round(base * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
        if (S && S.kill) S.kill();
      } else {
        addComboAction?.(0.25);
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 40);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
    }

    if (ctx.addTracer) ctx.addTracer(origin, end);
    ctx.updateHUD?.();
    this._bloom = Math.min(1, this._bloom + 0.04);
  }
}


