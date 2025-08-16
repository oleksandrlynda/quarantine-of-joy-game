// Ad Zeppelin Support using asset pack
// Flies a straight carpet path over the arena and drops bombs. While any ENGINE pods (on the zeppelin body) are alive, boss shield remains.

import { createAdZeppelinAsset } from '../assets/boss_captain.js';

export class ZeppelinSupport {
  constructor({ THREE, mats, enemyManager, scene, onPodsCleared }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.scene = scene;
    this.onPodsCleared = onPodsCleared;
    // Build zeppelin asset with engine pods, bomb rails, and gondola pivot
    const built = createAdZeppelinAsset({ THREE, mats, scale: 2.0, podCount: 3 });
    built.root.position.set(-44, 7.0, -30 + Math.random()*60);
    built.root.userData = { type: 'boss_zeppelin' };
    this.root = built.root;
    this.refs = built.refs; // { body, gondola, bombRails, pods }
    this.scene.add(this.root);

    // Register engine pods so they can be shot down to lift shield
    this.enginePods = [];
    for (const p of (this.refs?.pods || [])) {
      const podRoot = p.root;
      if (!podRoot) continue;
      podRoot.userData = { type: 'boss_pod_engine', hp: 220 };
      this.enemyManager.registerExternalEnemy({ root: podRoot, update(){} }, { countsTowardAlive: true });
      this.enginePods.push(podRoot);
    }

    // Path
    this.speed = 10.0; // u/s across arena
    this.direction = new THREE.Vector3(1, 0, 0); // left -> right
    this.life = 0; this.maxLife = 20; // despawn failsafe

    // Bomb drop config (visual/hazard; not tied to shield)
    this.dropEvery = 1.1; // seconds
    this.dropTimer = 0;
    this.bombs = []; // visual ground pods (hazards) we drop while flying

    // Telegraph path line (brief)
    this._pathLine = null;
    this._spawnPathLine();
  }

  _spawnPathLine(){
    const THREE = this.THREE;
    const from = this.root.position.clone();
    const to = from.clone().add(new THREE.Vector3(88, 0, 0));
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const m = new THREE.LineDashedMaterial({ color: 0x64748b, transparent: true, opacity: 0.7, dashSize: 0.8, gapSize: 0.5 });
    const line = new THREE.Line(g, m);
    line.computeLineDistances?.();
    this.scene.add(line);
    this._pathLine = line;
    // auto fade later; keep simple by lifetime check in update
  }

  _dropPod(){
    const THREE = this.THREE;
    const podRoot = new THREE.Group();
    // choose a bomb rail and convert to world position
    const rail = (this.refs?.bombRails || [])[Math.floor(Math.random() * (this.refs?.bombRails?.length || 1))];
    const dropPos = rail?.getWorldPosition ? rail.getWorldPosition(new THREE.Vector3()) : this.root.position.clone();
    podRoot.position.set(dropPos.x, 0.8, dropPos.z);
    podRoot.userData = { type: 'boss_bomb', hp: 1 };

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0xf87171 }));
    body.position.y = 0.8; podRoot.add(body);
    // Distinct outline color for pods (green)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI/2; halo.position.y = 0.05; podRoot.add(halo);

    // Add body edge outline for visibility
    const edges = new THREE.EdgesGeometry(body.geometry);
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.9 }));
    outline.position.copy(body.position);
    podRoot.add(outline);

    // Add to scene (not tracked as enemy for shield logic)
    this.scene.add(podRoot);
    this.bombs.push({ root: podRoot, life: 8.0 });
  }

  _checkPodsCleared(){
    // Remove references to engine pods that were shot down
    for (let i = this.enginePods.length - 1; i >= 0; i--){
      if (!this.enemyManager.enemies.has(this.enginePods[i])) this.enginePods.splice(i,1);
    }
    if (this.enginePods.length === 0 && this.onPodsCleared){
      const cb = this.onPodsCleared; this.onPodsCleared = null; cb();
    }
  }

  update(dt){
    this.life += dt;
    if (this._pathLine){
      this._pathLine.material.opacity = Math.max(0, this._pathLine.material.opacity - dt * 0.5);
      if (this._pathLine.material.opacity <= 0.01){ this.scene.remove(this._pathLine); this._pathLine = null; }
    }

    // Move across arena
    const step = this.direction.clone().multiplyScalar(this.speed * dt);
    this.root.position.add(step);

    // Drop bombs periodically
    this.dropTimer -= dt;
    if (this.dropTimer <= 0){
      this._dropPod();
      this.dropTimer = this.dropEvery;
    }

    // Tick bombs lifetime and clean up
    for (let i = this.bombs.length - 1; i >= 0; i--){
      const b = this.bombs[i]; b.life -= dt;
      if (b.life <= 0){ this.scene.remove(b.root); this.bombs.splice(i,1); }
    }

    // If off arena or after timeout, cleanup self when engine pods cleared
    const off = Math.abs(this.root.position.x) > 46;
    this._checkPodsCleared();
    if ((off || this.life >= this.maxLife) && (!this.enginePods || this.enginePods.length === 0)){
      this.cleanup();
    }
  }

  cleanup(){
    if (this._pathLine){ this.scene.remove(this._pathLine); this._pathLine = null; }
    if (this.root){ this.scene.remove(this.root); }
    // Do not force-remove engine pods; EnemyManager lifecycle handles them. Just clear lists.
    this.enginePods = [];
    for (const b of this.bombs){ this.scene.remove(b.root); }
    this.bombs = [];
  }
}


