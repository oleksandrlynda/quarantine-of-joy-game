export class MeleeEnemy {
  constructor({ THREE, mats, cfg, spawnPos }) {
    this.THREE = THREE;
    this.cfg = cfg;

    const baseMat = mats.enemy.clone();
    baseMat.color = new THREE.Color(cfg.color);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,1.2), baseMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9), mats.head.clone());
    head.position.y = 1.4;
    body.add(head);

    body.position.copy(spawnPos);

    // Keep compatibility with existing shooting logic
    body.userData = {
      type: cfg.type,
      head,
      hp: cfg.hp
    };

    this.root = body;
    this.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    this._lastPos = body.position.clone();
    this._stuckTime = 0;
    this._nudgeCooldown = 0;
  }

  update(dt, ctx) {
    const e = this.root;
    const toPlayer = ctx.player.position.clone().sub(e.position);
    const dist = toPlayer.length();
    if (dist < 2.1 && ctx.onPlayerDamage) ctx.onPlayerDamage(15 * dt);
    if (dist > 60) return;

    toPlayer.y = 0;
    if (toPlayer.lengthSq() === 0) return;
    toPlayer.normalize();

    const avoid = ctx.avoidObstacles(e.position, toPlayer, 1.6);
    const sep = ctx.separation(e.position, 1.2, e);

    const steer = toPlayer.clone().multiplyScalar(1.0)
      .add(avoid.multiplyScalar(1.35))
      .add(sep.multiplyScalar(0.85));

    if (steer.lengthSq() > 0) {
      steer.y = 0; steer.normalize();
      const step = steer.multiplyScalar(this.speed * dt);
      ctx.moveWithCollisions(e, step);
    }

    const moved = e.position.clone().sub(this._lastPos).length();
    if (this._nudgeCooldown > 0) this._nudgeCooldown = Math.max(0, this._nudgeCooldown - dt);
    if (moved < 0.006) {
      this._stuckTime += dt;
      if (this._stuckTime > 0.8 && this._nudgeCooldown <= 0) {
        const lateral = new this.THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 0.35);
        e.position.add(lateral);
        this._stuckTime = 0;
        this._nudgeCooldown = 0.9;
      }
    } else {
      this._stuckTime = 0;
    }

    this._lastPos.copy(e.position);
  }
}
