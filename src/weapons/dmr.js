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
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager, applyKnockback } = ctx;
    // Recoil: 2.0–3.0°, no FOV kick
    const pitch = (3.5 + Math.random() * 1.2) * (Math.PI/180);
    const yaw = ((Math.random()*2 - 1) * 0.8) * (Math.PI/180);
    ctx.applyRecoil?.({ pitchRad: pitch, yawRad: yaw, fovKick: 0, pitchReturn: 0.6, yawReturn: 0.75 });
    if (S && S.shot) S.shot('dmr');
    effects?.spawnMuzzleFlash?.(0.7);
    // First hit (no falloff, long range)
    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, range: 100 });
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const end = res.endPoint || camPos.clone().add(camDir.clone().multiplyScalar(100));

    if (res.type === 'enemy' && res.enemyRoot) {
      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
      const isHead = !!(res.isHead || res.bodyPart==='head');
      const part = res.bodyPart;
      const base = isHead ? 175 : ((part==='arm'||part==='leg') ? 35 : 85);
      const dmg = base;
      res.enemyRoot.userData.hp -= dmg;
      // stronger knockback and brief slow on hit (non-boss)
      const push = camDir.clone().multiplyScalar(0.35);
      applyKnockback?.(res.enemyRoot, push);
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(res.enemyRoot?.userData?.type || 'grunt');
      effects?.spawnBulletDecal?.(end, res.hitFace?.normal, { size: 0.11, ttl: 16, color: 0x101010, softness: 0.35, object: res.hitObject, owner: res.enemyRoot, attachTo: res.enemyRoot });
      if (res.enemyRoot.userData.hp <= 0) {
        effects?.enemyDeath?.(res.enemyRoot.position.clone());
        if (S && S.enemyDeath) S.enemyDeath(res.enemyRoot?.userData?.type || 'grunt');
        const eType = res.enemyRoot?.userData?.type;
        if (eType === 'tank') { // tanks shower extra rewards
          pickups?.dropMultiple?.('random', res.enemyRoot.position.clone(), 3 + (Math.random() * 2 | 0));
        } else {
          pickups?.maybeDrop?.(res.enemyRoot.position.clone());
        }
        enemyManager.remove(res.enemyRoot);
        const base = isHead ? 150 : 100;
        const finalScore = Math.round(base * (ctx.combo?.multiplier || 1));
         addScore?.(finalScore);
         addComboAction?.(1);
      } else {
        addComboAction?.(0.25);
      }

      // Limited penetration: continue one more target behind with 65% damage
      const THREE = ctx.THREE;
      const dir = camDir.clone();
      const origin2 = res.endPoint.clone().add(dir.clone().multiplyScalar(0.1));
      const res2 = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin: origin2, dir, range: 4 });
      if (res2.type === 'enemy' && res2.enemyRoot && res2.enemyRoot !== res.enemyRoot) {
        const isHead2 = !!(res2.isHead || res2.bodyPart==='head');
        const part2 = res2.bodyPart;
        const base2d = isHead2 ? 150 : ((part2==='arm'||part2==='leg') ? 32 : 75);
        const dmg2 = 0.65 * base2d;
        res2.enemyRoot.userData.hp -= dmg2;
        effects?.spawnBulletImpact?.(res2.endPoint, res2.hitFace?.normal);
        if (S && S.impactFlesh) S.impactFlesh();
        if (S && S.enemyPain) S.enemyPain(res2.enemyRoot?.userData?.type || 'grunt');
        if (res2.enemyRoot.userData.hp <= 0) {
          effects?.enemyDeath?.(res2.enemyRoot.position.clone());
          const eType2 = res2.enemyRoot?.userData?.type;
          if (eType2 === 'tank') { // tanks shower extra rewards
            pickups?.dropMultiple?.('random', res2.enemyRoot.position.clone(), 3 + (Math.random() * 2 | 0));
          } else {
            pickups?.maybeDrop?.(res2.enemyRoot.position.clone());
          }
          enemyManager.remove(res2.enemyRoot);
          const base2s = isHead2 ? 150 : 100;
          const finalScore2 = Math.round(base2s * (ctx.combo?.multiplier || 1));
          addScore?.(finalScore2);
          addComboAction?.(0.75);
           if (S && S.enemyDeath) S.enemyDeath(res2.enemyRoot?.userData?.type || 'grunt');
        }
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 60);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
      effects?.spawnBulletDecal?.(res.hitPoint, res.hitFace?.normal, { size: 0.12, ttl: 18, color: 0x0e0e0e, softness: 0.33, object: res.hitObject });
      if (S && S.impactWorld) S.impactWorld();
    }

    if (ctx.addTracer) ctx.addTracer(res.origin || camera.getWorldPosition(new ctx.THREE.Vector3()), end);
    ctx.updateHUD?.();
  }
}


