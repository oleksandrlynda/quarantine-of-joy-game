import { Weapon } from './base.js';

export class GrenadePistol extends Weapon {
  constructor() {
    super({
      name: 'Grenade',
      mode: 'semi',
      fireDelayMs: 800,
      magSize: 4,
      reserve: 8
    });
    this.projectiles = [];
    this.gravity = 12.0; // units/s^2
    this.speed = 18.0;   // initial muzzle velocity
    this.explodeRadius = 3.2;
    this.baseDamage = 220; // at center; falls off with distance
    this.ttl = 4.0; // seconds
  }

  onFire(ctx) {
    const { THREE, camera, effects, S } = ctx;
    if (S && S.shot) S.shot('grenade');
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    // small upward bias
    dir.y += 0.12; dir.normalize();
    const vel = dir.clone().multiplyScalar(this.speed);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xf59e0b })
    );
    mesh.position.copy(origin);
    mesh.userData = { life: 0 };
    ctx.objects?.push?.(mesh);
    ctx.obstacleManager?.scene?.add?.(mesh);
    this.projectiles.push({ mesh, vel });
    effects?.spawnMuzzleFlash?.(0.6);
  }

  update(dt, ctx){
    super.update(dt, ctx);
    const { THREE, enemyManager, effects, S } = ctx;
    const remain = [];
    for (const p of this.projectiles) {
      p.mesh.userData.life += dt;
      // integrate motion
      p.vel.y -= this.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // ground collide
      if (p.mesh.position.y <= 0.8 || p.mesh.userData.life >= this.ttl) {
        this._explode(p.mesh.position.clone(), ctx);
        ctx.obstacleManager?.scene?.remove?.(p.mesh);
        continue;
      }
      // simple enemy proximity check
      let shouldExplode = false;
      for (const root of Array.from(enemyManager?.enemies || [])){
        const d = root.position.distanceTo(p.mesh.position);
        if (d <= 0.6) { shouldExplode = true; break; }
      }
      if (shouldExplode) {
        this._explode(p.mesh.position.clone(), ctx);
        ctx.obstacleManager?.scene?.remove?.(p.mesh);
      } else {
        remain.push(p);
      }
    }
    this.projectiles = remain;
  }

  _explode(pos, ctx){
    const { THREE, enemyManager, effects, pickups, addScore, S } = ctx;
    // VFX (ground or enemy): full composite explosion
    effects?.spawnExplosion?.(pos, this.explodeRadius) || effects?.spawnBulletImpact?.(pos, new THREE.Vector3(0,1,0));
    if (S && S.explosion) S.explosion();
    // Damage enemies with falloff
    for (const root of Array.from(enemyManager?.enemies || [])){
      const d = root.position.distanceTo(pos);
      if (d <= this.explodeRadius) {
        const fall = Math.max(0, 1 - (d / this.explodeRadius));
        const dmg = Math.floor(this.baseDamage * (0.25 + 0.75 * fall));
        root.userData.hp -= dmg;
        if (root.userData.hp <= 0){
          effects?.enemyDeath?.(root.position.clone());
          const eType = root?.userData?.type;
          if (eType === 'tank') { // tanks shower extra rewards
            pickups?.dropMultiple?.('random', root.position.clone(), 3 + (Math.random() * 2 | 0));
          } else {
            pickups?.maybeDrop?.(root.position.clone());
          }
          enemyManager.remove(root);
          const finalScore = Math.round(120 * (ctx.combo?.multiplier || 1));
          addScore?.(finalScore);
          ctx.addComboAction?.(1);
          if (S && S.enemyDeath) S.enemyDeath(root?.userData?.type || 'grunt');
        } else {
          ctx.addComboAction?.(0.25);
          if (S && S.enemyPain) S.enemyPain(root?.userData?.type || 'grunt');
        }
      }
    }
  }
}


