import { Weapon } from './base.js';
import { performHitscan } from './hitscan.js';
import { logError } from '../util/log.js';

export class Rifle extends Weapon {
  constructor() {
    super({
      name: 'Rifle',
      mode: 'auto',
      fireDelayMs: 120, // ~500 RPM
      magSize: 16,
      reserve: 64
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
    const { THREE, camera, raycaster, enemyManager, objects, effects, S, pickups, addScore, addComboAction, obstacleManager, applyKnockback } = ctx;
    // Recoil: modest per-shot, vertical only
    const pitch = (1.4 + Math.random() * 0.4) * (Math.PI/180);
    ctx.applyRecoil?.({ pitchRad: pitch });
    if (S && S.shot) S.shot('rifle');
    effects?.spawnMuzzleFlash?.(0.5);
    const effectiveRange = 40; // half of DMR (100)

    // compute mild spread direction using camera basis
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const spread = this._baseSpread + this._bloom * this._maxBloom;
    // Basic deterministic spray pattern plus mild jitter
    if (!this._sprayPattern) {
      this._sprayPattern = [
        [0.000, 0.000], [0.0009, 0.0014], [0.0018, 0.0020], [0.0026, 0.0024],
        [0.0030, 0.0026], [0.0026, 0.0022], [0.0016, 0.0016], [0.0003, 0.0012],
        [-0.0008, 0.0009], [-0.0018, 0.0006], [-0.0026, 0.0003], [-0.0030, 0.0001],
        [-0.0024, -0.0002], [-0.0016, -0.0006], [-0.0006, -0.0009], [0.0004, -0.0012]
      ];
      this._sprayIndex = 0;
    }
    const [px, py] = this._sprayPattern[this._sprayIndex % this._sprayPattern.length];
    this._sprayIndex++;
    const rx = px + (Math.random() * 2 - 1) * spread * 0.35;
    const ry = py + (Math.random() * 2 - 1) * spread * 0.35;
    const dir = forward.clone().add(right.multiplyScalar(rx)).add(up.multiplyScalar(ry)).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());

    const res = performHitscan({ THREE, camera, raycaster, enemyManager, objects, origin, dir, range: effectiveRange });
    let end = res.endPoint || origin.clone().add(dir.clone().multiplyScalar(effectiveRange));
    if (res.type === 'enemy' && res.enemyRoot) {
      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch (e) { logError(e); }
      const isHead = !!(res.isHead || res.bodyPart==='head');
      // stronger falloff beyond ~35 units
      const dist = res.distance || origin.distanceTo(end);
      const fallStart = 35;
      const fall = dist <= fallStart ? 1.0 : Math.max(0.7, 1 - (dist - fallStart) / (effectiveRange - fallStart));
      const part = res.bodyPart;
      const base = isHead ? 100 : ((part==='arm'||part==='leg') ? 16 : 40);
      const dmg = base * fall;
      res.enemyRoot.userData.hp -= dmg;
      // pushback
      const dir2 = new THREE.Vector3(); camera.getWorldDirection(dir2);
      applyKnockback?.(res.enemyRoot, dir2.clone().multiplyScalar(0.16));
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(res.enemyRoot?.userData?.type || 'grunt');
      effects?.spawnBulletDecal?.(end, res.hitFace?.normal, { size: 0.10, ttl: 10, color: 0x1a1a1a, softness: 0.6, object: res.hitObject, owner: res.enemyRoot, attachTo: res.enemyRoot });
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
        const baseScore = isHead ? 150 : 100;
        const finalScore = Math.round(baseScore * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
      } else {
        addComboAction?.(0.25);
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 40);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
      effects?.spawnBulletDecal?.(res.hitPoint, res.hitFace?.normal, { size: 0.11, ttl: 16, color: 0x121212, softness: 0.35, object: res.hitObject });
      if (S && S.impactWorld) S.impactWorld();
    }
    // tracer
    if (ctx.addTracer) ctx.addTracer(origin, end);
    ctx.updateHUD?.();

    // increase bloom a little per shot
    this._bloom = Math.min(1, this._bloom + 0.06);
  }

  triggerUp(){
    super.triggerUp();
    this._sprayIndex = 0;
  }
}


