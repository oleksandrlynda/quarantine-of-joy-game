// Suppression Nodes helper for Commissioner Sanitizer
// Creates 3 static pillars around a center, tracks their HP and simple pulse

export class SuppressionNodes {
  constructor({ THREE, mats, center, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.center = center.clone();
    this.enemyManager = enemyManager;

    this.roots = [];
    this._materials = [];
    this._alive = 0;

    // Layout: 3 pillars in an equilateral triangle around the center
    const radius = 12.0;
    for (let i = 0; i < 3; i++) {
      const ang = i * (Math.PI * 2 / 3) + 0.35; // small offset for variety
      const pos = new THREE.Vector3(
        this.center.x + Math.cos(ang) * radius,
        0.0,
        this.center.z + Math.sin(ang) * radius
      );

      // Root group holds visual children and HP
      const root = new THREE.Group();
      root.position.copy(pos);
      root.userData = { type: 'boss_node', hp: 140 };

      // Node visual: bright pillar + halo
      const baseMat = new this.THREE.MeshBasicMaterial({ color: 0x60a5fa });
      const pillar = new this.THREE.Mesh(new this.THREE.CylinderGeometry(0.7, 0.7, 3.4, 12), baseMat);
      pillar.position.y = 1.7; // stand on floor
      root.add(pillar);

      const haloMat = new this.THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.6, depthWrite: false, side: this.THREE.DoubleSide });
      const halo = new this.THREE.Mesh(new this.THREE.RingGeometry(0.8, 1.6, 28), haloMat);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.06;
      root.add(halo);

      this.roots.push(root);
      this._materials.push(baseMat);
    }

    this._alive = this.roots.length;
  }

  addToSceneAndRegister(_scene) {
    // Register as enemies so hitscan can damage them; manager will add to scene and track alive
    for (const r of this.roots) {
      this.enemyManager.registerExternalEnemy({ root: r, update(){} }, { countsTowardAlive: true });
    }
  }

  update(dt, time = 0) {
    // subtle color pulse + halo scale
    for (let i = 0; i < this.roots.length; i++) {
      const root = this.roots[i];
      const mat = this._materials[i];
      const t = time + i * 0.37;
      const k = 0.5 + Math.sin(t * 2.4) * 0.5; // 0..1
      if (mat && mat.color) {
        // lerp between two shades
        const c1 = new this.THREE.Color(0x60a5fa);
        const c2 = new this.THREE.Color(0x3b82f6);
        mat.color.copy(c1.lerp(c2, k));
      }
      // halo assumed to be child[1]
      const halo = root.children[1];
      if (halo && halo.material) {
        const s = 0.8 + Math.sin(t * 3.2) * 0.15;
        halo.scale.setScalar(1 + s * 0.25);
        halo.material.opacity = 0.35 + 0.25 * (0.5 + Math.sin(t * 3.2) * 0.5);
      }
    }
  }

  remainingCount() {
    // Count how many are still registered in enemies
    let alive = 0;
    for (const r of this.roots) {
      if (this.enemyManager.enemies.has(r)) alive++;
    }
    this._alive = alive;
    return alive;
  }

  cleanup(scene) {
    for (const r of this.roots) {
      if (this.enemyManager.enemies.has(r)) {
        this.enemyManager.remove(r);
      } else if (scene.children.includes(r)) {
        scene.remove(r);
      }
    }
    this.roots.length = 0;
    this._materials.length = 0;
  }
}


