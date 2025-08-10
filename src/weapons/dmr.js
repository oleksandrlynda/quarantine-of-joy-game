import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

export class DMR extends Weapon {
  constructor() {
    super({
      name: 'DMR',
      mode: 'semi',
      fireDelayMs: 340, // slightly slower for control
      magSize: 12,
      reserve: 36
    });
    this._baseSpread = 0.0008; // near-pinpoint
    this._minViewkick = 0.1;
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    if (S && S.shot) S.shot('dmr');
    effects?.spawnMuzzleFlash?.(0.7);
    // First hit (no falloff, long range)
    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, range: 100 });
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const end = res.endPoint || camPos.clone().add(camDir.clone().multiplyScalar(100));

    if (res.type === 'enemy' && res.enemyRoot) {
      const isHead = !!res.isHead;
      const dmg = isHead ? 175 : 85;
      res.enemyRoot.userData.hp -= dmg;
      // stronger knockback and brief slow on hit (non-boss)
      const push = camDir.clone().multiplyScalar(0.35);
      res.enemyRoot.position.add(push);
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

      // Limited penetration: continue one more target behind with 65% damage
      const THREE = ctx.THREE;
      const dir = camDir.clone();
      const origin2 = res.endPoint.clone().add(dir.clone().multiplyScalar(0.1));
      const res2 = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin: origin2, dir, range: 4 });
      if (res2.type === 'enemy' && res2.enemyRoot && res2.enemyRoot !== res.enemyRoot) {
        const dmg2 = 0.65 * (res2.isHead ? 150 : 75);
        res2.enemyRoot.userData.hp -= dmg2;
        effects?.spawnBulletImpact?.(res2.endPoint, res2.hitFace?.normal);
        if (res2.enemyRoot.userData.hp <= 0) {
          effects?.enemyDeath?.(res2.enemyRoot.position.clone());
          pickups?.maybeDrop?.(res2.enemyRoot.position.clone());
          enemyManager.remove(res2.enemyRoot);
          const base2 = res2.isHead ? 150 : 100;
          const finalScore2 = Math.round(base2 * (ctx.combo?.multiplier || 1));
          addScore?.(finalScore2);
          addComboAction?.(0.75);
          if (S && S.kill) S.kill();
        }
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 60);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
    }

    if (ctx.addTracer) ctx.addTracer(res.origin || camera.getWorldPosition(new ctx.THREE.Vector3()), end);
    ctx.updateHUD?.();
  }
}


