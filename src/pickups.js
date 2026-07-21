export class Pickups {
  constructor(THREE, scene, rng = Math.random) {
    this.THREE = THREE;
    this.scene = scene;
    this.rng = rng;
    this.active = new Set();
    this.geometry = {
      item: new THREE.BoxGeometry(0.7, 0.4, 0.7),
      ring: new THREE.TorusGeometry(0.55, 0.05, 10, 32)
    };

    // Config
    this.base = { ammo: 0.13, med: 0.09 }; // base drop chances
    this.cap = { ammo: 2, med: 1 };        // per-wave caps
    this.waveCount = { ammo: 0, med: 0 };
    this.pityMisses = 0;                    // soft pity accumulator
    this.maxActive = 48;
    this.maxLifetimeSeconds = 75;
    this.enemyAmmoLifetimeSeconds = 30;
    this.expirationWarningSeconds = 8;
    this.retention = { expired: 0, evicted: 0 };
  }

  onWave(_wave) {
    this.waveCount.ammo = 0;
    this.waveCount.med = 0;
    this.pityMisses = 0;
  }

  maybeDrop(position, { source = 'enemy' } = {}) {
    // Compute current chances with caps and pity
    let pAmmo = (this.waveCount.ammo >= this.cap.ammo) ? 0 : this.base.ammo;
    let pMed  = (this.waveCount.med  >= this.cap.med ) ? 0 : this.base.med;

    // Soft pity: add small shared bonus distributed across types
    const bonus = Math.min(0.25, this.pityMisses * 0.02); // +2% per miss, capped
    pAmmo += bonus * 0.5;
    pMed  += bonus * 0.5;

    const r = this.rng();
    if (r < pAmmo) {
      this.spawn('ammo', position, { source });
      this.waveCount.ammo++; this.pityMisses = 0;
      return true;
    }
    if (r < pAmmo + pMed) {
      this.spawn('med', position, { source });
      this.waveCount.med++; this.pityMisses = 0;
      return true;
    }
    this.pityMisses++;
    return false;
  }

  // Spawn multiple pickups at once, ignoring caps and pity timers.
  // `type` can be 'ammo', 'med', or 'random' for a mix.
  dropMultiple(type, pos, count, { source = 'enemy' } = {}) {
    for (let i = 0; i < count; i++) {
      const t = (type === 'random' || !type)
        ? (this.rng() < 0.5 ? 'ammo' : 'med')
        : type;
      const p = pos.clone();
      p.x += (this.rng() - 0.5) * 0.6;
      p.z += (this.rng() - 0.5) * 0.6;
      this.spawn(t, p, { source });
    }
  }

  spawn(type, pos, { source = 'world', lifetimeSeconds = null } = {}) {
    const THREE = this.THREE;
    while (this.active.size >= this.maxActive) {
      const oldest = this.active.values().next().value;
      if (!oldest) break;
      this._remove(oldest, 'evicted');
    }
    const group = new THREE.Group();
    group.position.copy(pos);
    group.position.y = 0.6; // rest a bit above ground

    // Item mesh
    let color = (type === 'ammo') ? 0x60a5fa : 0x22c55e;
    const box = new THREE.Mesh(this.geometry.item, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 }));
    box.position.y = 0.2;
    group.add(box);

    // Beacon ring
    const ring = new THREE.Mesh(
      this.geometry.ring,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    // Amount roll
    const amount = (type === 'ammo')
      ? (15 + (this.rng() * 15) | 0)
      : (20 + (this.rng() * 15) | 0);

    const requestedLifetime = Number(lifetimeSeconds);
    const resolvedLifetime = Number.isFinite(requestedLifetime) && requestedLifetime > 0
      ? requestedLifetime
      : type === 'ammo' && source === 'enemy'
        ? this.enemyAmmoLifetimeSeconds
        : this.maxLifetimeSeconds;

    // Bookkeeping. Enemy ammo expires quickly so the arena cannot become a
    // second reserve; authored, boss, and support drops retain the safe window.
    group.userData = { type, amount, source, lifetimeSeconds: resolvedLifetime, t: 0 };

    this.scene.add(group);
    this.active.add(group);
  }

  update(dt, playerPos, onPickup) {
    for (const g of Array.from(this.active)) {
      // Animate bob and pulse
      g.userData.t += dt;
      const t = g.userData.t;
      const item = g.children[0];
      const ring = g.children[1];
      item.rotation.y += dt * 1.8;
      item.position.y = 0.2 + Math.sin(t * 3.2) * 0.06;
      ring.scale.setScalar(1.0 + Math.sin(t * 4.0) * 0.08);
      const lifetime = Math.max(0.001, Number(g.userData.lifetimeSeconds) || this.maxLifetimeSeconds);
      const remaining = Math.max(0, lifetime - t);
      const warningWindow = Math.min(this.expirationWarningSeconds, lifetime);
      const warningVisibility = remaining <= warningWindow
        ? Math.max(0, Math.min(1, remaining / warningWindow)) * (0.72 + Math.sin(t * 14.0) * 0.28)
        : 1;
      item.material.opacity = warningVisibility;
      ring.material.opacity = (0.65 + Math.sin(t * 5.0) * 0.2) * warningVisibility;

      if (t >= lifetime) {
        this._remove(g, 'expired');
        continue;
      }

      // Magnet auto-pickup radius (2D distance)
      const dx = g.position.x - playerPos.x;
      const dz = g.position.z - playerPos.z;
      const dist2 = dx*dx + dz*dz;
      if (dist2 < 1.2 * 1.2) {
        if (onPickup) onPickup(g.userData.type, g.userData.amount, g.position.clone());
        this._remove(g, 'collected');
      }
    }
  }

  resetAll() {
    for (const g of Array.from(this.active)) this._remove(g, 'reset');
  }

  resetRetentionStats() {
    this.retention.expired = 0;
    this.retention.evicted = 0;
  }

  _remove(group, reason) {
    if (!group || !this.active.has(group)) return false;
    this.scene.remove(group);
    this.active.delete(group);
    this._disposePickupMaterials(group);
    if (reason === 'expired') this.retention.expired++;
    if (reason === 'evicted') this.retention.evicted++;
    return true;
  }

  _disposePickupMaterials(root) {
    root?.traverse?.(object => {
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of assigned) material?.dispose?.();
    });
  }
}


