import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

// High fire-rate bullet hose with low per-shot damage
export class Minigun extends Weapon {
  constructor() {
    super({
      name: 'Minigun',
      mode: 'auto',
      fireDelayMs: 15, // ~66 rps
      magSize: 100,
      reserve: 100
    });
    this._bloom = 0; // grows while firing
    this._maxBloom = 0.12; // radians (~6.8 deg)
    this._baseSpread = 0.012; // radians (~0.69 deg)
    this._falloffStart = 8; // falloff begins fairly quickly
    this._range = 50;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    // decay bloom moderately
    this._bloom = Math.max(0, this._bloom - dt * 0.2);
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager, applyKnockback } = ctx;
    // very light recoil per shot
    const pitch = (0.6 + Math.random() * 0.2) * (Math.PI/180);
    const yaw = ((Math.random()*2 - 1) * 0.5) * (Math.PI/180);
    ctx.applyRecoil?.({ pitchRad: pitch, yawRad: yaw, fovKick: 0, pitchReturn: 0.4, yawReturn: 0.5 });
    if (S && S.shot) S.shot('smg'); // reuse smg shot sound
    effects?.spawnMuzzleFlash?.(0.3);

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
      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
      const isHead = !!(res.isHead || res.bodyPart==='head');
      const part = res.bodyPart;
      const base = isHead ? 12 : ((part==='arm'||part==='leg') ? 2 : 4);
      res.enemyRoot.userData.hp -= base;
      applyKnockback?.(res.enemyRoot, dir.clone().multiplyScalar(0.05));
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(res.enemyRoot?.userData?.type || 'grunt');
      effects?.spawnBulletDecal?.(end, res.hitFace?.normal, { size: 0.07, ttl: 7, color: 0x1a1a1a, softness: 0.6, object: res.hitObject, owner: res.enemyRoot, attachTo: res.enemyRoot });
      if (res.enemyRoot.userData.hp <= 0) {
        effects?.enemyDeath?.(res.enemyRoot.position.clone());
        if (S && S.enemyDeath) S.enemyDeath(res.enemyRoot?.userData?.type || 'grunt');
        const eType = res.enemyRoot?.userData?.type;
        if (eType === 'tank') {
          pickups?.dropMultiple?.('random', res.enemyRoot.position.clone(), 3 + (Math.random() * 2 | 0));
        } else {
          pickups?.maybeDrop?.(res.enemyRoot.position.clone());
        }
        enemyManager.remove(res.enemyRoot);
        const baseScore = isHead ? 150 : 100;
        const finalScore = Math.round(baseScore * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
      } else {
        addComboAction?.(0.15);
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 8);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
      effects?.spawnBulletDecal?.(res.hitPoint, res.hitFace?.normal, { size: 0.07, ttl: 9, color: 0x131313, softness: 0.4, object: res.hitObject });
      if (S && S.impactWorld) S.impactWorld();
    }

    if (ctx.addTracer) ctx.addTracer(origin, end);
    this._bloom = Math.min(1, this._bloom + 0.02);
    ctx.updateHUD?.();
  }
}
