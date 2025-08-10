import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

export class Rifle extends Weapon {
  constructor() {
    super({
      name: 'Rifle',
      mode: 'semi',
      fireDelayMs: 120, // ~500 RPM
      magSize: 30,
      reserve: 60
    });
    this._bloom = 0;            // mild recoil bloom
    this._maxBloom = 0.02;      // radians max extra spread
    this._baseSpread = 0.002;   // radians baseline
  }

  update(dt, ctx){
    super.update(dt, ctx);
    // mild decay
    this._bloom = Math.max(0, this._bloom - dt * 0.22);
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    if (S && S.shot) S.shot('rifle');
    effects?.spawnMuzzleFlash?.(0.5);
    const effectiveRange = 40; // half of DMR (100)

    // compute mild spread direction using camera basis
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const spread = this._baseSpread + this._bloom * this._maxBloom;
    const rx = (Math.random() * 2 - 1) * spread;
    const ry = (Math.random() * 2 - 1) * spread;
    const dir = forward.clone().add(right.multiplyScalar(rx)).add(up.multiplyScalar(ry)).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());

    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: effectiveRange });
    let end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(effectiveRange));
    if (res.type === 'enemy' && res.enemyRoot) {
      const isHead = !!res.isHead;
      // stronger falloff beyond ~35 units
      const dist = res.distance || origin.distanceTo(end);
      const fallStart = 35;
      const fall = dist <= fallStart ? 1.0 : Math.max(0.7, 1 - (dist - fallStart) / (effectiveRange - fallStart));
      const dmg = (isHead ? 100 : 40) * fall;
      res.enemyRoot.userData.hp -= dmg;
      // pushback
      const dir2 = new THREE.Vector3(); camera.getWorldDirection(dir2);
      res.enemyRoot.position.add(dir2.clone().multiplyScalar(0.16));
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
      obstacleManager?.handleHit?.(res.hitObject, 40);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
    }
    // tracer
    if (ctx.addTracer) ctx.addTracer(origin, end);
    ctx.updateHUD?.();

    // increase bloom a little per shot
    this._bloom = Math.min(1, this._bloom + 0.06);
  }
}


