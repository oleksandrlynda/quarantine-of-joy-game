import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';

export class Shotgun extends Weapon {
  constructor() {
    super({
      name: 'Shotgun',
      mode: 'semi',
      fireDelayMs: 900, // 0.9s pump
      magSize: 6,
      reserve: 24
    });
    this.pellets = 9;
    this.spreadRad = 0.105; // ~6 degrees
    this.range = 28; // short range
    this.fullDamageRange = 6; // no falloff within 6 units
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    if (S && S.shot) S.shot('shotgun');
    effects?.spawnMuzzleFlash?.(1.0);

    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());

    let anyHit = false;
    const representative = [];

    for (let i = 0; i < this.pellets; i++) {
      // random cone offset
      const angleX = (Math.random() * 2 - 1) * this.spreadRad;
      const angleY = (Math.random() * 2 - 1) * this.spreadRad;
      const dir = forward.clone().add(right.clone().multiplyScalar(angleX)).add(up.clone().multiplyScalar(angleY)).normalize();

      const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: this.range });
      const end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(this.range));

      if (representative.length < 2) representative.push({ from: origin.clone(), to: end.clone() });

      if (res.type === 'enemy' && res.enemyRoot) {
        anyHit = true;
        const dist = res.distance || origin.distanceTo(end);
        const falloff = dist <= this.fullDamageRange ? 1.0 : Math.max(0, 1 - (dist - this.fullDamageRange) / Math.max(1, (this.range - this.fullDamageRange)));
        const body = 12 * falloff;
        const head = 24 * falloff;
        const dmg = res.isHead ? head : body;
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
        }
      } else if (res.type === 'world') {
        obstacleManager?.handleHit?.(res.hitObject, 8); // minor per-pellet impact on props
        effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
      }
    }

    // Minimal tracers for readability
    if (ctx.addTracer) {
      for (const t of representative) ctx.addTracer(t.from, t.to);
    }
    if (anyHit) addComboAction?.(0.25);
    ctx.updateHUD?.();
  }
}


