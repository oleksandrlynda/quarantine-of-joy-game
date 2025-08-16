import { createHealerBot } from '../assets/healer_bot.js';

export class HealerEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    // Use dedicated HealerBot asset
    const built = createHealerBot({ THREE, mats, scale: 0.5 });
    const body = built.root; const head = built.head;
    body.position.copy(spawnPos);
    body.userData = { type: cfg.type, head, hp: cfg.hp, maxHp: cfg.hp };
    this.root = body;

    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this.pulseCooldown = 0;
    this.pulseInterval = 3.5 + (Math.random()-0.5) * 0.6; // jitter
    this.pulseDuration = 2.0;
    this.pulseTimer = 0;
    this.radius = 6.0;
    this.healPerSecond = 12; // applied via proposeHeal; non-stacking strongest per target
    this._raycaster = new THREE.Raycaster();
    this.searchRadius = 14.0; // look for injured allies within this range
  }

  update(dt, ctx) {
    const THREE = this.THREE;
    const e = this.root;
    const playerPos = ctx.player.position.clone();
    const toPlayer = playerPos.clone().sub(e.position);

    // Positioning: seek injured allies, avoid player lightly, bias away from walls, and keep with clusters
    const desired = new THREE.Vector3();
    const healTarget = this._findHealTarget(ctx);
    if (healTarget) {
      const toT = healTarget.position.clone().sub(e.position); toT.y = 0;
      if (toT.lengthSq() > 0) desired.add(toT.normalize().multiplyScalar(1.2));
    }
    const avoidPlayer = toPlayer.setY(0); if (avoidPlayer.lengthSq()>0) desired.add(avoidPlayer.normalize().multiplyScalar(-0.5));
    // center bias to prevent corner camping
    desired.add(new THREE.Vector3(-e.position.x, 0, -e.position.z).multiplyScalar(0.02));
    // drift toward ally clusters
    desired.add(this._clusterDirection(ctx).multiplyScalar(0.6));
    // combine with separation and short obstacle avoidance
    const sep = ctx.separation(e.position, 1.4, e);
    const avoid = ctx.avoidObstacles ? ctx.avoidObstacles(e.position, desired, 1.2) : new THREE.Vector3();
    const steer = desired.add(sep.multiplyScalar(1.0)).add(avoid.multiplyScalar(0.8));
    if (steer.lengthSq()>0){ steer.y=0; steer.normalize(); ctx.moveWithCollisions(e, steer.multiplyScalar(this.speed*dt)); }

    // Healing pulse lifecycle
    if (this.pulseCooldown > 0) this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    if (this.pulseTimer > 0) this.pulseTimer = Math.max(0, this.pulseTimer - dt);

    if (this.pulseCooldown <= 0 && this.pulseTimer <= 0) {
      // begin a new pulse if any allies nearby
      const allies = this._collectAlliesInRadius(ctx, this.radius);
      if (allies.length > 0) {
        this.pulseTimer = this.pulseDuration;
        this.pulseCooldown = this.pulseInterval;
      }
    }
    if (this.pulseTimer > 0) {
      const allies = this._collectAlliesInRadius(ctx, this.radius);
      const amount = this.healPerSecond * dt;
      for (const ally of allies) {
        if (!ally.userData) continue;
        if (ally.userData.type === 'boss') continue;
        if (ctx.proposeHeal) ctx.proposeHeal(ally, amount);
      }
      // TODO: optional VFX ring could be spawned via Effects if available
    }
  }

  _collectAlliesInRadius(ctx, radius){
    const out = [];
    const r2 = radius*radius;
    for (const other of ctx.scene.children){
      if (!other.userData || !other.userData.type) continue;
      if (other === this.root) continue;
      const dx = other.position.x - this.root.position.x;
      const dz = other.position.z - this.root.position.z;
      if (dx*dx + dz*dz <= r2) out.push(other);
    }
    return out;
  }

  _clusterDirection(ctx){
    // crude centroid of nearby allies within 10m
    const THREE = this.THREE;
    const r2 = 100;
    const centroid = new THREE.Vector3(); let count=0;
    for (const other of ctx.scene.children){
      if (!other.userData || !other.userData.type || other===this.root) continue;
      const dx = other.position.x - this.root.position.x;
      const dz = other.position.z - this.root.position.z;
      if (dx*dx + dz*dz <= r2){ centroid.x += other.position.x; centroid.z += other.position.z; count++; }
    }
    if (count>0){ centroid.multiplyScalar(1/count); return new THREE.Vector3(centroid.x - this.root.position.x, 0, centroid.z - this.root.position.z).normalize(); }
    return new THREE.Vector3();
  }

  _findHealTarget(ctx){
    const THREE = this.THREE;
    let best = null; let bestScore = -Infinity;
    const r2 = this.searchRadius * this.searchRadius;
    for (const other of ctx.scene.children){
      const ud = other.userData; if (!ud || !ud.type || other===this.root) continue;
      if (ud.type === 'boss') continue;
      const dx = other.position.x - this.root.position.x;
      const dz = other.position.z - this.root.position.z;
      const d2 = dx*dx + dz*dz; if (d2 > r2) continue;
      const maxHp = ud.maxHp || ud.hp || 0; const curHp = ud.hp || 0;
      const need = Math.max(0, maxHp - curHp);
      if (need <= 0) continue;
      // score favors high need and closer targets
      const score = need - Math.sqrt(d2);
      if (score > bestScore){ bestScore = score; best = other; }
    }
    return best ? { root: best, position: best.position.clone() } : null;
  }
}


