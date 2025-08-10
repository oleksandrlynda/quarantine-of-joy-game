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
    // Recoil: visible per‑shot 0.8–1.2° pitch, ±0.5° yaw; fast recovery; no FOV kick
    const pitch = (1.4 + Math.random() * 0.6) * (Math.PI/180);
    const yaw = ((Math.random()*2 - 1) * 0.8) * (Math.PI/180);
    ctx.applyRecoil?.({ pitchRad: pitch, yawRad: yaw, fovKick: 0, pitchReturn: 0.5, yawReturn: 0.6 });
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
      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
      const isHead = !!(res.isHead || res.bodyPart==='head');
      const dist = res.distance || origin.distanceTo(end);
      const fall = dist <= this._falloffStart ? 1.0 : Math.max(0.7, 1 - (dist - this._falloffStart) / (this._range - this._falloffStart));
      const part = res.bodyPart;
      const base = isHead ? 45 : ((part==='arm'||part==='leg') ? 10 : 18);
      const dmg = base * fall;
      res.enemyRoot.userData.hp -= dmg;
      // tiny pushback
      res.enemyRoot.position.add(dir.clone().multiplyScalar(0.12));
      effects?.spawnBulletImpact?.(end, res.hitFace?.normal);
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(res.enemyRoot?.userData?.type || 'grunt');
      effects?.spawnBulletDecal?.(end, res.hitFace?.normal, { size: 0.085, ttl: 9, color: 0x1a1a1a, softness: 0.6, object: res.hitObject, owner: res.enemyRoot, attachTo: res.enemyRoot });
      if (res.enemyRoot.userData.hp <= 0) {
        effects?.enemyDeath?.(res.enemyRoot.position.clone());
        if (S && S.enemyDeath) S.enemyDeath(res.enemyRoot?.userData?.type || 'grunt');
        pickups?.maybeDrop?.(res.enemyRoot.position.clone());
        enemyManager.remove(res.enemyRoot);
        const baseScore = isHead ? 150 : 100;
        const finalScore = Math.round(baseScore * (ctx.combo?.multiplier || 1));
        addScore?.(finalScore);
        addComboAction?.(1);
      } else {
        addComboAction?.(0.25);
      }
    } else if (res.type === 'world') {
      obstacleManager?.handleHit?.(res.hitObject, 18);
      effects?.spawnBulletImpact?.(res.hitPoint, res.hitFace?.normal);
      effects?.spawnBulletDecal?.(res.hitPoint, res.hitFace?.normal, { size: 0.09, ttl: 12, color: 0x131313, softness: 0.4, object: res.hitObject });
      if (S && S.impactWorld) S.impactWorld();
    }

    // tracer
    if (ctx.addTracer) ctx.addTracer(origin, end);
    this._bloom = Math.min(1, this._bloom + 0.08);
    ctx.updateHUD?.();
  }
}


