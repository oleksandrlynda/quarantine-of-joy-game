export class Pickups {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.active = new Set();

    // Config
    this.base = { ammo: 0.13, med: 0.09 }; // base drop chances
    this.cap = { ammo: 2, med: 1 };        // per-wave caps
    this.waveCount = { ammo: 0, med: 0 };
    this.pityMisses = 0;                    // soft pity accumulator
  }

  onWave(_wave) {
    this.waveCount.ammo = 0;
    this.waveCount.med = 0;
    this.pityMisses = 0;
  }

  maybeDrop(position) {
    // Compute current chances with caps and pity
    let pAmmo = (this.waveCount.ammo >= this.cap.ammo) ? 0 : this.base.ammo;
    let pMed  = (this.waveCount.med  >= this.cap.med ) ? 0 : this.base.med;

    // Soft pity: add small shared bonus distributed across types
    const bonus = Math.min(0.25, this.pityMisses * 0.02); // +2% per miss, capped
    pAmmo += bonus * 0.5;
    pMed  += bonus * 0.5;

    const r = Math.random();
    if (r < pAmmo) {
      this.spawn('ammo', position);
      this.waveCount.ammo++; this.pityMisses = 0;
      return true;
    }
    if (r < pAmmo + pMed) {
      this.spawn('med', position);
      this.waveCount.med++; this.pityMisses = 0;
      return true;
    }
    this.pityMisses++;
    return false;
  }

  // Spawn multiple pickups at once, ignoring caps and pity timers.
  // `type` can be 'ammo', 'med', or 'random' for a mix.
  dropMultiple(type, pos, count) {
    for (let i = 0; i < count; i++) {
      const t = (type === 'random' || !type)
        ? (Math.random() < 0.5 ? 'ammo' : 'med')
        : type;
      const p = pos.clone();
      p.x += (Math.random() - 0.5) * 0.6;
      p.z += (Math.random() - 0.5) * 0.6;
      this.spawn(t, p);
    }
  }

  spawn(type, pos) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.copy(pos);
    group.position.y = 0.6; // rest a bit above ground

    // Item mesh
    let color = (type === 'ammo') ? 0x60a5fa : 0x22c55e;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), new THREE.MeshLambertMaterial({ color }));
    box.position.y = 0.2;
    group.add(box);

    // Beacon ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 10, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    // Amount roll
    const amount = (type === 'ammo')
      ? (15 + (Math.random() * 15) | 0)
      : (20 + (Math.random() * 15) | 0);

    // Bookkeeping
    group.userData = { type, amount, t: 0 };

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
      ring.material.opacity = 0.65 + Math.sin(t * 5.0) * 0.2;

      // Magnet auto-pickup radius (2D distance)
      const dx = g.position.x - playerPos.x;
      const dz = g.position.z - playerPos.z;
      const dist2 = dx*dx + dz*dz;
      if (dist2 < 1.2 * 1.2) {
        if (onPickup) onPickup(g.userData.type, g.userData.amount, g.position.clone());
        this.scene.remove(g);
        this.active.delete(g);
      }
    }
  }

  resetAll() {
    for (const g of this.active) this.scene.remove(g);
    this.active.clear();
  }
}


