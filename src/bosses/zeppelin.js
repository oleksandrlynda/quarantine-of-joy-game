// Ad Zeppelin Support (MVP)
// Flies a straight carpet path over the arena and drops pods. While any pods are alive, boss shield remains.

export class ZeppelinSupport {
  constructor({ THREE, mats, enemyManager, scene, onPodsCleared }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.scene = scene;
    this.onPodsCleared = onPodsCleared;

    // Simple airship visual
    const hullMat = mats.enemy.clone(); hullMat.color = new THREE.Color(0x64748b); // slate
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 1.0), hullMat);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), mats.head.clone());
    gondola.position.y = -0.9; hull.add(gondola);
    hull.position.set(-44, 7.0, -30 + Math.random()*60);
    hull.userData = { type: 'boss_zeppelin' };
    this.root = hull;
    this.scene.add(this.root);

    // Path
    this.speed = 10.0; // u/s across arena
    this.direction = new THREE.Vector3(1, 0, 0); // left -> right
    this.life = 0; this.maxLife = 20; // despawn failsafe

    // Drop pods config
    this.dropEvery = 1.1; // seconds
    this.dropTimer = 0;
    this.pods = []; // roots of pods registered as enemies

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
    podRoot.position.set(this.root.position.x, 0.8, this.root.position.z);
    podRoot.userData = { type: 'boss_pod', hp: 250 };

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

    // Register as enemy so hitscan can damage
    this.enemyManager.registerExternalEnemy({ root: podRoot, update(){} }, { countsTowardAlive: true });
    this.pods.push(podRoot);
  }

  _checkPodsCleared(){
    // Remove references to dead pods
    for (let i = this.pods.length - 1; i >= 0; i--){
      if (!this.enemyManager.enemies.has(this.pods[i])) this.pods.splice(i,1);
    }
    if (this.pods.length === 0 && this.onPodsCleared){
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

    // Drop pods periodically
    this.dropTimer -= dt;
    if (this.dropTimer <= 0){
      this._dropPod();
      this.dropTimer = this.dropEvery;
    }

    // If off arena or after timeout, cleanup self when pods cleared
    const off = Math.abs(this.root.position.x) > 46;
    this._checkPodsCleared();
    if ((off || this.life >= this.maxLife) && (!this.pods || this.pods.length === 0)){
      this.cleanup();
    }
  }

  cleanup(){
    if (this._pathLine){ this.scene.remove(this._pathLine); this._pathLine = null; }
    if (this.root){ this.scene.remove(this.root); }
    // Do not force-remove pods; EnemyManager lifecycle handles them. Just clear list.
    this.pods = [];
  }
}


