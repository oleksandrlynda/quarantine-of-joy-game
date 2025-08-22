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
    this._charging = false;
    this._chargeStart = 0;
    this._chargeSound = null;
  }

  _slash(ctx, damage, heavy=false) {
    const { THREE, camera, raycaster, enemyManager, effects, S, pickups, addScore, addComboAction, applyKnockback, objects } = ctx;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const range = heavy ? 5 : 3;
    const end = origin.clone().add(dir.clone().multiplyScalar(range));

    raycaster.set(origin, dir);
    raycaster.far = range;
    const candidates = enemyManager.getEnemyRaycastTargets ? enemyManager.getEnemyRaycastTargets() : Array.from(enemyManager.enemies);
    const hits = candidates.length ? raycaster.intersectObjects(candidates, true) : [];
    const handled = new Set();

    if (heavy) ctx.weaponView?.startSlash?.({ dur:0.3, angle:1.8 });
    else ctx.weaponView?.startSlash?.();
    if (S?.saberSwing) S.saberSwing();
    effects?.spawnSaberSlash?.(origin, end);

    for (const hit of hits) {
      if (hit.distance > range) continue;
      let obj = hit.object;
      while (obj && !enemyManager.enemies.has(obj)) obj = obj.parent;
      if (!obj || handled.has(obj)) continue;
      handled.add(obj);

      try { window._HUD && window._HUD.showHitmarker && window._HUD.showHitmarker(); } catch(_) {}
      obj.userData.hp -= damage;
      const kb = heavy ? 0.4 : 0.25;
      applyKnockback?.(obj, dir.clone().multiplyScalar(kb));
      if (S?.saberHit) S.saberHit();
      if (S && S.impactFlesh) S.impactFlesh();
      if (S && S.enemyPain) S.enemyPain(obj?.userData?.type || 'grunt');

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
        if (S?.saberHit) S.saberHit();
        // optional: minimal spark could be triggered here if available
      }
    }

    this.ammoInMag = 1;
    ctx.updateHUD?.();
  }

  onFire(ctx) {
    this._slash(ctx, 40, false);
  }

  altTriggerDown(ctx) {
    const now = performance.now();
    if (!this.canFire(now)) return;
    this._charging = true;
    this._chargeStart = now;
    this._nextFireAtMs = Infinity;
    ctx.weaponView?.startCharge?.();
    if (ctx.S?.saberCharge) this._chargeSound = ctx.S.saberCharge();
  }

  altTriggerUp(ctx) {
    if (!this._charging) return;
    this._charging = false;
    ctx.weaponView?.endCharge?.();
    if (this._chargeSound && typeof this._chargeSound.stop === 'function') {
      this._chargeSound.stop();
      this._chargeSound = null;
    }
    const now = performance.now();
    const held = now - this._chargeStart;
    const ratio = Math.min(1, held / 2500);
    const damage = 20 + 60 * ratio;
    this._nextFireAtMs = now + (this.cfg.fireDelayMs || 0);
    this._slash(ctx, damage, true);
  }

  altTriggerCancel(ctx) {
    if (!this._charging) return;
    this._charging = false;
    this._nextFireAtMs = 0;
    ctx.weaponView?.endCharge?.();
    if (this._chargeSound && typeof this._chargeSound.stop === 'function') {
      this._chargeSound.stop();
      this._chargeSound = null;
    }
  }
}

