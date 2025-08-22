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
    this.pellets = 12; // more shards
    this.spreadRad = 0.14; // wider cone (~8 degrees)
    this.range = 28; // short range
    this.fullDamageRange = 6; // no falloff within 6 units
  }

  onFire(ctx) {
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager } = ctx;
    // Recoil: strong vertical kick with no FOV change
    const pitch = (10.0 + Math.random() * 4.0) * (Math.PI/180); // 10–14° up
    const yaw = ((Math.random()*2 - 1) * 0.6) * (Math.PI/180);
    ctx.applyRecoil?.({ pitchRad: pitch, yawRad: yaw, fovKick: 0, pitchReturn: 6.0, yawReturn: 8.0 });
    if (S && S.shot) S.shot('shotgun');
    effects?.spawnMuzzleFlash?.(1.0);

    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());

    let anyHit = false;
    const representative = [];

    for (let i = 0; i < this.pellets; i++) {
      // biased to widen left-right spread more than vertical
      const angleX = (Math.random() * 2 - 1) * this.spreadRad * 1.25;
      const angleY = (Math.random() * 2 - 1) * this.spreadRad * 0.75;
      const dir = forward.clone().add(right.clone().multiplyScalar(angleX)).add(up.clone().multiplyScalar(angleY)).normalize();

      const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: this.range });
      const end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(this.range));

      if (representative.length < 2) representative.push({ from: origin.clone(), to: end.clone() });

      if (res.type === 'enemy' && res.enemyRoot) {
        try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
        anyHit = true;
        const dist = res.distance || origin.distanceTo(end);
        const falloff = dist <= this.fullDamageRange ? 1.0 : Math.max(0, 1 - (dist - this.fullDamageRange) / Math.max(1, (this.range - this.fullDamageRange)));
        const torso = 12 * falloff;
        const head = 24 * falloff;
        const limb = 5 * falloff;
        const part = res.bodyPart;
        const dmg = (res.isHead || part === 'head') ? head : ((part === 'arm' || part === 'leg') ? limb : torso);
        res.enemyRoot.userData.hp -= dmg;
        effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
        if (S && S.impactFlesh) S.impactFlesh();
        if (S && S.enemyPain) S.enemyPain(res.enemyRoot?.userData?.type || 'grunt');
        effects?.spawnBulletDecal?.(end, res.hitFace?.normal, { size: 0.09, ttl: 8, color: 0x1a1a1a, softness: 0.65, object: res.hitObject, owner: res.enemyRoot, attachTo: res.enemyRoot });
        if (res.enemyRoot.userData.hp <= 0) {
          effects?.enemyDeath?.(res.enemyRoot.position.clone());
          const eType = res.enemyRoot?.userData?.type;
          if (eType === 'tank') { // tanks shower extra rewards
            pickups?.dropMultiple?.('random', res.enemyRoot.position.clone(), 3 + (Math.random() * 2 | 0));
          } else {
            pickups?.maybeDrop?.(res.enemyRoot.position.clone());
          }
          enemyManager.remove(res.enemyRoot);
          const base = (res.isHead || res.bodyPart==='head') ? 150 : 100;
          const finalScore = Math.round(base * (ctx.combo?.multiplier || 1));
          addScore?.(finalScore);
          addComboAction?.(1);
           if (S && S.enemyDeath) S.enemyDeath(res.enemyRoot?.userData?.type || 'grunt');
        }
      } else if (res.type === 'world') {
        obstacleManager?.handleHit?.(res.hitObject, 8); // minor per-pellet impact on props
        effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
        effects?.spawnBulletDecal?.(res.hitPoint, res.hitFace?.normal, { size: 0.10, ttl: 12, color: 0x151515, softness: 0.4, object: res.hitObject });
        if (S && S.impactWorld) S.impactWorld();
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


