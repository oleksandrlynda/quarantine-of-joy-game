export class Destructible {
  constructor({ THREE, mats, type, position }) {
    this.THREE = THREE;
    this.sharedMaterials = new Set(Object.values(mats || {}).filter(Boolean));
    this.type = type; // 'crate' | 'barricade' | 'barrel' | 'lowWall'
    this.hp = 1;
    this.root = null;
    this.aabbHalf = new THREE.Vector3(1,1,1);
    this._build({ mats, position });
    if (this.root) {
      this.root.userData.destructible = this;
    }
  }

  _build({ mats, position }) {
    const THREE = this.THREE;
    switch (this.type) {
      case 'crate': {
        // 2x2x2 crate
        this.hp = 60;
        const g = new THREE.BoxGeometry(2, 2, 2);
        const m = mats?.crate || new THREE.MeshLambertMaterial({ color: 0xC6A15B });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(position || new THREE.Vector3());
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.root = mesh;
        this.aabbHalf.set(1, 1, 1);
        break;
      }
      case 'barricade': {
        // 6x2x1 wall
        this.hp = 120;
        const g = new THREE.BoxGeometry(6, 2, 1);
        const m = mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(position || new THREE.Vector3());
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.root = mesh;
        this.aabbHalf.set(3, 1, 0.5);
        break;
      }
      case 'lowWall': {
        // 6x0.66x1 low wall that can be stepped over
        this.hp = 40;
        const g = new THREE.BoxGeometry(6, 0.66, 1);
        const m = mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(position || new THREE.Vector3());
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.root = mesh;
        this.aabbHalf.set(3, 0.33, 0.5);
        break;
      }
      case 'barrel':
      default: {
        // A readable waist-high volatile barrel. Keep the body as the root mesh
        // so non-recursive enemy projectile raycasts can still strike it; the
        // trim pieces are cosmetic children.
        this.hp = 50;
        const g = new THREE.CylinderGeometry(0.58, 0.58, 1.45, 16, 1);
        const m = new THREE.MeshStandardMaterial({
          color: 0xb91c1c,
          roughness: 0.48,
          metalness: 0.62
        });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(position || new THREE.Vector3());
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.name = 'explosive-barrel';

        const dark = new THREE.MeshStandardMaterial({ color: 0x251b1b, roughness: 0.58, metalness: 0.72 });
        const bandGeometry = new THREE.TorusGeometry(0.595, 0.045, 6, 16);
        for (const y of [-0.52, 0, 0.52]) {
          const band = new THREE.Mesh(bandGeometry, dark);
          band.rotation.x = Math.PI / 2;
          band.position.y = y;
          band.name = 'barrel-reinforcement-band';
          mesh.add(band);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.045, 16), dark);
        cap.position.y = 0.735;
        cap.name = 'barrel-cap';
        mesh.add(cap);

        const warningMaterial = new THREE.MeshStandardMaterial({
          color: 0xffc928,
          emissive: 0xff5b16,
          emissiveIntensity: 0.35,
          roughness: 0.5,
          metalness: 0.1
        });
        const warning = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.28, 0.025), warningMaterial);
        warning.position.set(0, 0.08, 0.579);
        warning.name = 'barrel-warning-label';
        mesh.add(warning);

        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 8), warningMaterial);
        fuse.position.set(0.2, 0.82, 0);
        fuse.name = 'barrel-pressure-cap';
        mesh.add(fuse);

        this.root = mesh;
        this.aabbHalf.set(0.65, 0.86, 0.65);
        break;
      }
    }
  }

  damage(amount) {
    if (!this.root) return { destroyed: false };
    this.hp -= Math.max(0, Number(amount) || 0);
    if (this.type === 'barrel' && this.hp > 0) {
      const warning = this.root.getObjectByName?.('barrel-warning-label');
      if (warning?.material) warning.material.emissiveIntensity = Math.min(1.8, 0.35 + (1 - this.hp / 50) * 1.45);
    }
    if (this.hp <= 0) {
      return { destroyed: true, type: this.type };
    }
    return { destroyed: false };
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.root?.traverse?.(object => {
      if (object.geometry) geometries.add(object.geometry);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of assigned) {
        if (material && !this.sharedMaterials.has(material)) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose?.();
    for (const material of materials) material.dispose?.();
  }
}


