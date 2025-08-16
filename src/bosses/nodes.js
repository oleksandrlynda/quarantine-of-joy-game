// Suppression Nodes helper for Commissioner Sanitizer
// Creates 3 static pillars around a center, tracks their HP and simple pulse
import { createSanitizerNodeAsset } from '../assets/boss_sanitizer.js';
export class SuppressionNodes {
  constructor({ THREE, mats, center, enemyManager }) {
    this.THREE = THREE;
    this.mats = mats;
    this.center = center.clone();
    this.enemyManager = enemyManager;

    this.roots = [];
    this._rings = [];
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

      // Root group holds visual children and HP, using consistent asset style
      const asset = createSanitizerNodeAsset({ THREE });
      const root = asset.root;
      root.position.copy(pos);
      root.userData = { type: 'boss_node', hp: 140 };

      this.roots.push(root);
      this._rings.push(asset.ring);
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
    // pulse glowing ring scale and emissive intensity
    for (let i = 0; i < this.roots.length; i++) {
      const ring = this._rings[i];
      if (!ring) continue;
      const t = time + i * 0.37;
      const s = 0.95 + Math.sin(t * 3.2) * 0.08;
      ring.scale.setScalar(s);
      if (ring.material) {
        if (ring.material.emissiveIntensity != null) {
          ring.material.emissiveIntensity = 0.7 + 0.3 * (0.5 + Math.sin(t * 2.4) * 0.5);
        }
        if (ring.material.opacity != null) {
          ring.material.transparent = true;
          ring.material.opacity = 0.7;
        }
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
    this._rings.length = 0;
  }
}


