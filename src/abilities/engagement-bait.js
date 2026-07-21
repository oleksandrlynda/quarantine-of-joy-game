export class EngagementBaitAbility {
  constructor() {
    this.durationSeconds = 7;
    this.attractionRadius = 10;
    this.health = 50;
    this.baits = [];
  }

  onFire(ctx) {
    if (!ctx?.THREE || !ctx?.obstacleManager?.scene || !ctx?.enemyManager?.setEngagementBait) return false;
    if (this.baits.length) return false;
    const position = this._resolvePosition(ctx);
    if (!position) return false;
    const root = this._createProp(ctx.THREE, position);
    const record = { root, age: 0, destroyed: false, ctx, attackId: ctx.attackId };
    this.baits.push(record);
    ctx.obstacleManager.scene.add(root);
    ctx.enemyManager.setEngagementBait({
      root,
      radius: this.attractionRadius,
      hp: this.health,
      onDestroyed: () => this._destroy(record, 'damage'),
      onAffected: count => ctx.achievements?.check?.({
        type: 'engagementBaitAffected',
        count,
        attackId: record.attackId
      })
    });
    ctx.effects?.spawnGroundRing?.(position, this.attractionRadius, 0xec4899);
    return true;
  }

  update(dt) {
    for (const bait of [...this.baits]) {
      bait.age += Math.max(0, Number(dt) || 0);
      bait.root.rotation.y += dt * 0.7;
      bait.root.position.y = 0.04 + Math.sin(bait.age * 4) * 0.04;
      if (bait.age >= this.durationSeconds) this._destroy(bait, 'expired');
    }
  }

  clearWorld(ctx) {
    for (const bait of [...this.baits]) this._remove(bait, ctx || bait.ctx);
    this.baits.length = 0;
  }

  reset() {
    this.baits.length = 0;
  }

  _destroy(record) {
    if (record.destroyed) return;
    record.destroyed = true;
    const { ctx, root } = record;
    const position = root.position.clone().setY(0);
    ctx.enemyManager?.clearEngagementBait?.(root);
    ctx.enemyManager?.applyRushImpact?.(position, new ctx.THREE.Vector3(0, 0, -1), {
      radius: 3.5,
      pushDistance: 0.01,
      stunSeconds: 1
    });
    ctx.effects?.spawnGroundRing?.(position, 3.5, 0xf472b6);
    ctx.effects?.spawnExplosion?.(position, 1.2, 0xec4899);
    this._remove(record, ctx);
  }

  _remove(record, ctx) {
    ctx?.enemyManager?.clearEngagementBait?.(record.root);
    ctx?.obstacleManager?.scene?.remove?.(record.root);
    this._disposeRoot(record.root);
    const index = this.baits.indexOf(record);
    if (index >= 0) this.baits.splice(index, 1);
  }

  _resolvePosition(ctx) {
    const origin = ctx.camera?.getWorldPosition?.(new ctx.THREE.Vector3());
    const direction = ctx.camera?.getWorldDirection?.(new ctx.THREE.Vector3());
    if (!origin || !direction) return null;
    direction.y = 0;
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();
    return origin.addScaledVector(direction, 3.5).setY(0.04);
  }

  _createProp(THREE, position) {
    const root = new THREE.Group();
    root.position.copy(position);
    const standMaterial = new THREE.MeshLambertMaterial({ color: 0x252938 });
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xec4899 });
    const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.18, 12), standMaterial);
    stand.position.y = 0.09;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.55, 0.18), standMaterial);
    post.position.y = 0.92;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.05, 0.18), screenMaterial);
    screen.position.y = 1.7;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), faceMaterial);
    face.position.set(0, 1.76, 0.1);
    root.add(stand, post, screen, face);
    root.userData.materials = [standMaterial, screenMaterial, faceMaterial];
    root.userData.geometries = [stand.geometry, post.geometry, screen.geometry, face.geometry];
    return root;
  }

  _disposeRoot(root) {
    for (const material of root?.userData?.materials || []) material.dispose?.();
    for (const geometry of root?.userData?.geometries || []) geometry.dispose?.();
    if (root?.userData) {
      root.userData.materials = [];
      root.userData.geometries = [];
    }
  }
}
