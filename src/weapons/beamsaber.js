import { Weapon } from './base.js';

export class BeamSaber extends Weapon {
  constructor() {
    super({
      name: 'BeamSaber',
      mode: 'semi',
      fireDelayMs: 500,
      magSize: 1,
      reserve: 0
    });
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, effects, S, pickups, addScore, addComboAction, applyKnockback, objects } = ctx;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const range = 5;
    const end = origin.clone().add(dir.clone().multiplyScalar(range));

    raycaster.set(origin, dir);
    raycaster.far = range;
    const candidates = enemyManager.getEnemyRaycastTargets ? enemyManager.getEnemyRaycastTargets() : Array.from(enemyManager.enemies);
    const hits = candidates.length ? raycaster.intersectObjects(candidates, true) : [];
    const handled = new Set();

    if (S && S.shot) S.shot('dmr');
    effects?.spawnMuzzleFlash?.(0.3);

    for (const hit of hits) {
      if (hit.distance > range) continue;
      let obj = hit.object;
      while (obj && !enemyManager.enemies.has(obj)) obj = obj.parent;
      if (!obj || handled.has(obj)) continue;
      handled.add(obj);

      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
      obj.userData.hp -= 40;
      applyKnockback?.(obj, dir.clone().multiplyScalar(0.25));
      effects?.spawnBulletImpact?.(hit.point, hit.face?.normal);
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(obj?.userData?.type || 'grunt');
      effects?.spawnBulletDecal?.(hit.point, hit.face?.normal, { size: 0.12, ttl: 10, color: 0x101010, softness: 0.5, object: hit.object, owner: obj, attachTo: obj });

      if (obj.userData.hp <= 0) {
        effects?.enemyDeath?.(obj.position.clone());
        if (S && S.enemyDeath) S.enemyDeath(obj?.userData?.type || 'grunt');
        const eType = obj?.userData?.type;
        if (eType === 'tank') {
          pickups?.dropMultiple?.('random', obj.position.clone(), 3 + (Math.random() * 2 | 0));
        } else {
          pickups?.maybeDrop?.(obj.position.clone());
        }
        enemyManager.remove(obj);
        const finalScore = Math.round(100 * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
      } else {
        addComboAction?.(0.25);
      }
    }

    if (hits.length === 0 && objects && objects.length) {
      const worldHits = raycaster.intersectObjects(objects, true);
      if (worldHits.length) {
        const h = worldHits[0];
        effects?.spawnBulletImpact?.(h.point, h.face?.normal);
      }
    }

    if (ctx.addTracer) ctx.addTracer(origin, end);
    this.ammoInMag = 1;
    ctx.updateHUD?.();
  }
}

