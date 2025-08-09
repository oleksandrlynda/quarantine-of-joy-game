export class Destructible {
  constructor({ THREE, mats, type, position }) {
    this.THREE = THREE;
    this.type = type; // 'crate' | 'barricade' | 'barrel'
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
        // 6x2x1 low wall
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
      case 'barrel':
      default: {
        // 1.2h cylinder ~radius 0.6
        this.hp = 40;
        const g = new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14, 1);
        const m = new THREE.MeshLambertMaterial({ color: 0xCC3333 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.copy(position || new THREE.Vector3());
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.root = mesh;
        this.aabbHalf.set(0.7, 0.6, 0.7);
        break;
      }
    }
  }

  damage(amount) {
    if (!this.root) return { destroyed: false };
    this.hp -= amount;
    if (this.hp <= 0) {
      return { destroyed: true, type: this.type };
    }
    return { destroyed: false };
  }
}


