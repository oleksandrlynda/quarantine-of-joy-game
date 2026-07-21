function removeFromArray(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
}

const CRATE_SHELL_HEIGHT = 1.25;
const CRATE_HEIGHT_SCALE = 0.6;
const CRATE_GROUND_CLEARANCE = 0.025;

export class SupplyDropAbility {
  constructor() {
    this.deliverySeconds = 7;
    this.crateHealth = 20;
    // A delivered crate is stable world cover until it is opened or the
    // encounter is cleared. Only the loose pickups released from it expire.
    this.crateLifetimeSeconds = Infinity;
    this.pendingDrops = [];
    this.crates = [];
  }

  onFire(ctx) {
    if (!ctx?.THREE || !ctx?.obstacleManager?.scene) return false;
    if (this.pendingDrops.length || this.crates.some(crate => crate.kind === 'supplyDrop')) return false;
    const position = this._resolvePosition(ctx);
    if (!position) return false;
    const warning = this._createWarning(ctx.THREE, position);
    ctx.obstacleManager.scene.add(warning);
    this.pendingDrops.push({ position, warning, age: 0 });
    ctx.effects?.spawnGroundRing?.(position, 1.4, 0xf59e0b);
    return true;
  }

  update(dt, ctx) {
    const elapsed = Math.max(0, Number(dt) || 0);
    for (const crate of [...this.crates]) {
      crate.age += elapsed;
      const lifetime = crate.lifetimeSeconds ?? this.crateLifetimeSeconds;
      if (!Number.isFinite(lifetime) || crate.age < lifetime) continue;
      this._removeCrate(crate, ctx);
    }
    const delivered = [];
    for (const drop of this.pendingDrops) {
      drop.age += elapsed;
      const progress = Math.min(1, drop.age / this.deliverySeconds);
      const pulse = 1 + Math.sin(drop.age * 8) * 0.08;
      drop.warning.scale.set(pulse, 1, pulse);
      drop.warning.userData.beam.material.opacity = 0.15 + progress * 0.45;
      if (drop.age >= this.deliverySeconds) delivered.push(drop);
    }
    for (const drop of delivered) {
      removeFromArray(this.pendingDrops, drop);
      ctx?.obstacleManager?.scene?.remove?.(drop.warning);
      this._disposeRoot(drop.warning);
      this._deliverCrate(drop.position, ctx);
    }
  }

  clearWorld(ctx) {
    for (const drop of this.pendingDrops) {
      ctx?.obstacleManager?.scene?.remove?.(drop.warning);
      this._disposeRoot(drop.warning);
    }
    for (const crate of [...this.crates]) this._removeCrate(crate, ctx);
    this.pendingDrops.length = 0;
  }

  reset() {
    this.pendingDrops.length = 0;
    this.crates.length = 0;
  }

  hasEmergencyAmmoCrate() {
    return this.crates.some(crate => crate.kind === 'emergencyAmmo' && !crate.destroyed);
  }

  spawnEmergencyAmmoCrate(position, ctx) {
    if (!position || !ctx?.THREE || !ctx?.obstacleManager?.scene) return false;
    if (this.hasEmergencyAmmoCrate()) return false;
    return this._deliverCrate(position, ctx, {
      kind: 'emergencyAmmo',
      ammoCount: 3,
      includeMed: false,
      lifetimeSeconds: Infinity
    });
  }

  spawnBossAmmoCrate(position, ctx) {
    if (!position || !ctx?.THREE || !ctx?.obstacleManager?.scene) return false;
    return this._deliverCrate(position, ctx, {
      kind: 'bossAmmo',
      ammoCount: 3,
      includeMed: false,
      lifetimeSeconds: Infinity
    });
  }

  spawnBossHealthCrate(position, ctx) {
    if (!position || !ctx?.THREE || !ctx?.obstacleManager?.scene) return false;
    return this._deliverCrate(position, ctx, {
      kind: 'bossHealth',
      ammoCount: 0,
      includeMed: true,
      lifetimeSeconds: Infinity
    });
  }

  clearBossAmmoCrates(ctx) {
    let removed = 0;
    for (const crate of [...this.crates]) {
      if (crate.kind !== 'bossAmmo') continue;
      this._removeCrate(crate, ctx);
      removed += 1;
    }
    return removed;
  }

  clearBossHealthCrates(ctx) {
    let removed = 0;
    for (const crate of [...this.crates]) {
      if (crate.kind !== 'bossHealth') continue;
      this._removeCrate(crate, ctx);
      removed += 1;
    }
    return removed;
  }

  _resolvePosition(ctx) {
    const origin = ctx.camera?.getWorldPosition?.(new ctx.THREE.Vector3());
    const direction = ctx.camera?.getWorldDirection?.(new ctx.THREE.Vector3());
    if (!origin || !direction) return null;
    direction.y = 0;
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();
    return origin.addScaledVector(direction, 4).setY(0.02);
  }

  _deliverCrate(position, ctx, {
    kind = 'supplyDrop',
    ammoCount = 2,
    includeMed = true,
    lifetimeSeconds = this.crateLifetimeSeconds
  } = {}) {
    const root = this._createCrate(ctx.THREE, position, kind);
    const record = { root, kind, age: 0, lifetimeSeconds, destroyed: false, instance: null };
    const instance = {
      type: 'supplyDrop',
      root,
      hp: this.crateHealth,
      suppressScore: true,
      suppressDefaultDrop: true,
      damage(amount) {
        this.hp -= Math.max(0, Number(amount) || 0);
        return { destroyed: this.hp <= 0, type: this.type };
      },
      onDestroyed: () => {
        if (record.destroyed) return true;
        record.destroyed = true;
        removeFromArray(this.crates, record);
        const dropPosition = root.position.clone().setY(0);
        const ammoOffsets = [
          new ctx.THREE.Vector3(-0.65, 0, 0),
          new ctx.THREE.Vector3(0.65, 0, 0),
          new ctx.THREE.Vector3(0, 0, 0.7)
        ];
        for (let index = 0; index < Math.max(0, ammoCount | 0); index += 1) {
          const offset = ammoOffsets[index % ammoOffsets.length];
          ctx.pickups?.spawn?.('ammo', dropPosition.clone().add(offset), { source: 'supply' });
        }
        if (includeMed) {
          ctx.pickups?.spawn?.('med', dropPosition.clone().add(new ctx.THREE.Vector3(0, 0, 0.7)), { source: 'supply' });
        }
        if (kind === 'supplyDrop') {
          ctx.achievements?.check?.({ type: 'supplyDropOpened', hp: Number(ctx.session?.hp) });
        }
        ctx.effects?.spawnGroundRing?.(dropPosition, 2.2, kind === 'bossHealth' ? 0x22c55e : 0xfbbf24);
        this._disposeRoot(root);
        return true;
      }
    };
    record.instance = instance;
    root.userData.destructible = instance;
    this.crates.push(record);
    if (!ctx.obstacleManager.registerAbilityDestructible?.(instance, ctx.objects)) {
      ctx.obstacleManager.scene.add(root);
      if (Array.isArray(ctx.objects) && !ctx.objects.includes(root)) ctx.objects.push(root);
    }
    ctx.effects?.spawnGroundRing?.(position, 2, kind === 'bossHealth' ? 0x22c55e : 0xf59e0b);
    ctx.effects?.shake?.(0.12, 0.18);
    return true;
  }

  _removeCrate(crate, ctx) {
    if (!crate || crate.destroyed) return false;
    crate.destroyed = true;
    removeFromArray(this.crates, crate);
    const removed = ctx?.obstacleManager?.removeAbilityDestructible?.(crate.root) === true;
    if (!removed) {
      ctx?.obstacleManager?.scene?.remove?.(crate.root);
      const objectIndex = ctx?.objects?.indexOf?.(crate.root) ?? -1;
      if (objectIndex >= 0) ctx.objects.splice(objectIndex, 1);
    }
    this._disposeRoot(crate.root);
    return true;
  }

  _createWarning(THREE, position) {
    const root = new THREE.Group();
    root.position.copy(position);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.15, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.35, 28), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 8, 8), beamMaterial);
    beam.position.y = 4;
    root.add(ring, beam);
    root.userData.materials = [ringMaterial, beamMaterial];
    root.userData.geometries = [ring.geometry, beam.geometry];
    root.userData.beam = beam;
    return root;
  }

  _createCrate(THREE, position, kind = 'supplyDrop') {
    const root = new THREE.Group();
    root.position.set(position.x, CRATE_GROUND_CLEARANCE + CRATE_SHELL_HEIGHT * CRATE_HEIGHT_SCALE * 0.5, position.z);
    root.scale.y = CRATE_HEIGHT_SCALE;
    root.name = kind === 'bossHealth' ? 'authored-health-crate' : 'supply-crate';
    const isHealth = kind === 'bossHealth';
    const shellMaterial = new THREE.MeshLambertMaterial({ color: isHealth ? 0x2f855a : 0xd6a747 });
    const bandMaterial = new THREE.MeshBasicMaterial({ color: isHealth ? 0x123c2d : 0x172033 });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: isHealth ? 0x86efac : 0x67e8f9 });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, CRATE_SHELL_HEIGHT, 1.5), shellMaterial);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.22, 1.58), bandMaterial);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 1.6), lightMaterial);
    root.add(shell, band, light);
    root.userData.materials = [shellMaterial, bandMaterial, lightMaterial];
    root.userData.geometries = [shell.geometry, band.geometry, light.geometry];
    root.userData.crateKind = kind;
    if (isHealth) {
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.07), lightMaterial);
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.07), lightMaterial);
      vertical.position.z = 0.79;
      horizontal.position.z = 0.79;
      root.add(vertical, horizontal);
      root.userData.geometries.push(vertical.geometry, horizontal.geometry);
    }
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
