export class BossBase {
    constructor({ THREE, mats, cfg, spawnPos }) {
      this.THREE = THREE;
      this.cfg = cfg;
  
      this.root = new THREE.Group();
      this.root.position.copy(spawnPos);
  
      this.hp = cfg.hp ?? 1000;
      this.phase = 1;
      this.invuln = false;
  
      this.root.userData = { type: cfg.type ?? 'boss', hp: this.hp };
    }
  
    update(dt, ctx) {
      // Implement in subclasses: movement, attacks, telegraphs
    }
  
    onPhaseChange(nextPhase) {
      this.phase = nextPhase;
    }
  }