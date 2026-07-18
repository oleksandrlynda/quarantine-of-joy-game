// Ad Zeppelin Support using asset pack.
// It carries the shootable generators that protect the Captain, then retreats.

import { createZeppelinVisual } from './visual-cache.js';

export class ZeppelinSupport {
  constructor({ THREE, mats, enemyManager, scene, onPodsCleared, onPodsChanged, rng = Math.random }) {
    this.THREE = THREE;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;
    this.scene = scene;
    this.onPodsCleared = onPodsCleared;
    this.onPodsChanged = onPodsChanged;
    // Build zeppelin asset with engine pods, bomb rails, and gondola pivot
    const built = createZeppelinVisual({ THREE, mats });
    built.root.position.set(-44, 7.0, -30 + this.rng()*60);
    built.root.userData = { type: 'boss_zeppelin' };
    this.root = built.root;
    this.refs = built.refs; // { body, gondola, bombRails, pods }
    this.scene.add(this.root);

    // Register engine pods so they can be shot down to lift shield
    this.enginePods = [];
    this._fallingPods = [];
    for (const p of (this.refs?.pods || [])) {
      const podRoot = p.root;
      if (!podRoot) continue;
      podRoot.userData = {
        type: 'boss_pod_engine',
        hp: 220,
        maxHp: 220,
        ignoreKnockback: true
      };
      const podInstance = {
        root: podRoot,
        update() {},
        onRemoved: () => this._detachEnginePod(podRoot, p.hit)
      };
      this.enemyManager.registerExternalEnemy(podInstance, {
        countsTowardAlive: true,
        preserveParent: true
      });
      this.enginePods.push(podRoot);
    }

    // Path
    this.speed = 10.0; // u/s across arena
    this.direction = new THREE.Vector3(1, 0, 0); // left -> right
    this._turn = null;
    this.retreating = false;
    this._retreatTime = 0;
    this.life = 0; this.maxLife = 20; // despawn failsafe
    this._lastPodCount = this.enginePods.length;

    // Telegraph path line (brief)
    this._pathLine = null;
    this._spawnPathLine();
  }

  _spawnPathLine(){
    const THREE = this.THREE;
    const from = this.root.position.clone().setY(0.06);
    const to = from.clone().add(new THREE.Vector3(88, 0, 0));
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const m = new THREE.LineDashedMaterial({ color: 0x64748b, transparent: true, opacity: 0.7, dashSize: 0.8, gapSize: 0.5 });
    const line = new THREE.Line(g, m);
    line.computeLineDistances?.();
    this.scene.add(line);
    this._pathLine = line;
    // auto fade later; keep simple by lifetime check in update
  }

  _checkPodsCleared(){
    // Remove references to engine pods that were shot down
    for (let i = this.enginePods.length - 1; i >= 0; i--){
      if (!this.enemyManager.enemies.has(this.enginePods[i])) this.enginePods.splice(i,1);
    }
    if (this.enginePods.length !== this._lastPodCount) {
      this._lastPodCount = this.enginePods.length;
      this.onPodsChanged?.(this.enginePods.length);
    }
    if (this.enginePods.length === 0) {
      this._beginRetreat();
      if (this.onPodsCleared) {
        const cb = this.onPodsCleared; this.onPodsCleared = null; cb();
      }
    }
  }

  _detachEnginePod(podRoot, hitbox) {
    if (!podRoot?.parent) return;
    if (this.cleaned) {
      podRoot.parent.remove(podRoot);
      return;
    }

    // Preserve the exact mounted world transform, then let the destroyed
    // generator become short-lived physical debris instead of hovering.
    this.root.updateWorldMatrix(true, true);
    this.scene.attach(podRoot);
    if (hitbox) hitbox.visible = false;
    podRoot.userData = { type: 'boss_pod_debris', ignoreKnockback: true };
    this._fallingPods.push({
      root: podRoot,
      velocity: new this.THREE.Vector3(
        this.direction.x * 1.4,
        -1.8,
        (this.rng() - .5) * 2.2
      ),
      spinX: (this.rng() - .5) * 4.5,
      spinZ: (this.rng() - .5) * 4.5,
      life: 0
    });
  }

  _updateFallingPods(dt) {
    for (let index = this._fallingPods.length - 1; index >= 0; index--) {
      const debris = this._fallingPods[index];
      debris.life += dt;
      debris.velocity.y -= 14 * dt;
      debris.root.position.addScaledVector(debris.velocity, dt);
      debris.root.rotation.x += debris.spinX * dt;
      debris.root.rotation.z += debris.spinZ * dt;
      if (debris.root.position.y > .3 && debris.life < 3) continue;

      try { globalThis.window?._EFFECTS?.spawnExplosion?.(debris.root.position.clone().setY(.3), .7, 0x22e3ef); } catch {}
      this.scene.remove(debris.root);
      this._fallingPods.splice(index, 1);
    }
  }

  _beginTurn() {
    if (this._turn) return;
    this._turn = {
      elapsed: 0,
      duration: 1,
      startYaw: this.root.rotation.y,
      targetYaw: this.root.rotation.y + Math.PI,
      targetDirection: -this.direction.x
    };
  }

  _beginRetreat() {
    if (this.retreating) return;
    this.retreating = true;
    this._retreatTime = 0;
    this._turn = null;
    // Leave through the closest edge. Near the center, retain the current
    // heading so the craft never reverses just as the objective completes.
    if (Math.abs(this.root.position.x) > 4) this.direction.x = Math.sign(this.root.position.x);
    if (!this.direction.x) this.direction.x = 1;
  }

  _updateFlight(dt) {
    if (this.retreating) {
      this._retreatTime += dt;
      const desiredYaw = this.direction.x < 0 ? Math.PI : 0;
      let yawDelta = desiredYaw - this.root.rotation.y;
      yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.root.rotation.y += Math.max(-3.5 * dt, Math.min(3.5 * dt, yawDelta));
      this.root.position.x += this.direction.x * 18 * dt;
      this.root.position.y += (6 + Math.min(4, this._retreatTime * 2)) * dt;
      return;
    }

    if (!this._turn) {
      this.root.position.addScaledVector(this.direction, this.speed * dt);
      return;
    }

    this._turn.elapsed = Math.min(this._turn.duration, this._turn.elapsed + dt);
    const progress = this._turn.elapsed / this._turn.duration;
    const eased = progress * progress * (3 - 2 * progress);
    this.root.rotation.y = this._turn.startYaw + Math.PI * eased;
    if (progress < 1) return;

    this.direction.x = this._turn.targetDirection;
    this.root.rotation.y = this._turn.targetYaw;
    this._turn = null;
  }

  update(dt){
    if (this.cleaned) return;
    this.life += dt;
    if (this._pathLine){
      this._pathLine.material.opacity = Math.max(0, this._pathLine.material.opacity - dt * 0.5);
      if (this._pathLine.material.opacity <= 0.01){
        this.scene.remove(this._pathLine);
        this._pathLine.geometry?.dispose?.();
        this._pathLine.material?.dispose?.();
        this._pathLine = null;
      }
    }

    // Move across the arena, pausing for a visible bank-free turnaround at
    // either edge. Mounted pods follow continuously instead of teleporting.
    this._updateFlight(dt);
    this._updateFallingPods(dt);

    // Keep the shield objective reachable: while pods remain, the Zeppelin
    // turns around for another pass instead of flying permanently off-map.
    const off = Math.abs(this.root.position.x) > 46;
    this._checkPodsCleared();
    if (this.retreating) {
      const escaped = Math.abs(this.root.position.x) > 58 || this.root.position.y > 26 || this._retreatTime >= 3;
      if (escaped && this._fallingPods.length === 0) this.cleanup();
      return;
    }
    if (off && this.enginePods.length > 0 && !this._turn) {
      this.root.position.x = Math.sign(this.root.position.x) * 46;
      this._beginTurn();
    }
  }

  cleanup(){
    if (this.cleaned) return;
    this.cleaned = true;
    if (this._pathLine){
      this.scene.remove(this._pathLine);
      this._pathLine.geometry?.dispose?.();
      this._pathLine.material?.dispose?.();
      this._pathLine = null;
    }
    if (this.root){ this.scene.remove(this.root); }
    // Do not force-remove engine pods; EnemyManager lifecycle handles them. Just clear lists.
    this.enginePods = [];
    for (const debris of this._fallingPods) this.scene.remove(debris.root);
    this._fallingPods = [];
  }
}


