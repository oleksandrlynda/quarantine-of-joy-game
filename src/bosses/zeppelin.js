// Ad Zeppelin Support using asset pack.
// It carries the shootable generators that protect the Captain, then retreats.

import {
  createZeppelinBombMarkerVisual,
  createZeppelinBombVisual,
  createZeppelinVisual
} from './visual-cache.js?rev=zeppelin-overhead-bomb1';
import { ReusablePool } from './reusable-pool.js';

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

    // Overhead bombing pass. The craft follows the player's lane on Z while
    // preserving its readable left/right flyover on X, then releases one
    // telegraphed bomb whenever it crosses above the player.
    this._bombStrikes = [];
    this._bombCooldown = 1.2;
    this._bombInterval = 4.5;
    this._bombTelegraphSeconds = 1.15;
    this._bombRadius = 3.2;
    this._bombDamage = 22;
    this._nextBombRail = 0;
    this._lastPlayerPosition = null;
    this._playerVelocity = new THREE.Vector3();
    this._strikePool = new ReusablePool({
      preallocate: 2,
      create: () => ({
        bomb: createZeppelinBombVisual({ THREE }),
        marker: createZeppelinBombMarkerVisual({ THREE })
      }),
      reset: strike => {
        strike.bomb.root.visible = true;
        strike.bomb.root.rotation.set(0, 0, 0);
        strike.marker.root.visible = true;
        strike.marker.root.userData = { life: 0 };
        strike.marker.refs?.ring?.scale?.set?.(1.35, 1.35, 1.35);
        if (strike.marker.refs?.ring?.material) strike.marker.refs.ring.material.opacity = 0.9;
        if (strike.marker.refs?.disk?.material) strike.marker.refs.disk.material.opacity = 0.2;
      },
      release: (strike, activeScene) => {
        activeScene?.remove?.(strike.bomb.root);
        activeScene?.remove?.(strike.marker.root);
        strike.bomb.root.visible = false;
        strike.marker.root.visible = false;
      },
      destroy: strike => {
        strike.bomb.refs?.body?.material?.dispose?.();
        strike.marker.refs?.ring?.material?.dispose?.();
        strike.marker.refs?.disk?.material?.dispose?.();
      }
    });

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
      targetDirection: new this.THREE.Vector3(-Math.sign(this.root.position.x || this.direction.x || 1), 0, 0)
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

  _updateFlight(dt, ctx) {
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
      let flightTarget = null;
      if (ctx?.player?.position) {
        const currentPlayerPosition = ctx.player.position.clone();
        if (this._lastPlayerPosition && dt > 0) {
          const measuredVelocity = currentPlayerPosition.clone()
            .sub(this._lastPlayerPosition)
            .multiplyScalar(1 / dt)
            .setY(0);
          if (measuredVelocity.length() > 20) measuredVelocity.setLength(20);
          this._playerVelocity.lerp(measuredVelocity, Math.min(1, dt * 6));
        }
        this._lastPlayerPosition = currentPlayerPosition;
        flightTarget = ctx.player.position.clone().addScaledVector(this._playerVelocity, 0.8);
      }
      const toPlayer = flightTarget
        ? flightTarget.sub(this.root.position).setY(0)
        : null;
      const playerDistance = toPlayer?.length?.() || 0;
      if (toPlayer && playerDistance > 0.1) {
        const desiredDirection = toPlayer.multiplyScalar(1 / playerDistance);
        this.direction.lerp(desiredDirection, Math.min(1, dt * 2.4)).normalize();
      }
      const flightSpeed = playerDistance > 8 ? 22 : this.speed;
      this.root.position.addScaledVector(this.direction, flightSpeed * dt);
      const desiredYaw = Math.atan2(-this.direction.z, this.direction.x);
      let yawDelta = desiredYaw - this.root.rotation.y;
      yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
      this.root.rotation.y += Math.max(-2.8 * dt, Math.min(2.8 * dt, yawDelta));
      return;
    }

    this._turn.elapsed = Math.min(this._turn.duration, this._turn.elapsed + dt);
    const progress = this._turn.elapsed / this._turn.duration;
    const eased = progress * progress * (3 - 2 * progress);
    this.root.rotation.y = this._turn.startYaw + Math.PI * eased;
    if (progress < 1) return;

    this.direction.copy(this._turn.targetDirection);
    this.root.rotation.y = this._turn.targetYaw;
    this._turn = null;
  }

  _dropOverheadBomb(ctx) {
    if (!ctx?.player?.position || !ctx?.scene) return false;
    const target = ctx.player.position.clone().setY(0.06);
    const rails = this.refs?.bombRails || [];
    const rail = rails.length ? rails[this._nextBombRail++ % rails.length] : this.root;
    this.root.updateWorldMatrix(true, true);
    const origin = rail.getWorldPosition
      ? rail.getWorldPosition(new this.THREE.Vector3())
      : this.root.position.clone();
    const visual = this._strikePool.acquire();
    visual.bomb.root.position.copy(origin);
    visual.marker.root.position.copy(target);
    ctx.scene.add(visual.bomb.root, visual.marker.root);
    this._bombStrikes.push({ visual, origin, target, timer: 0 });
    this._bombCooldown = this._bombInterval;
    ctx.emitAIEvent?.(this.root, 'ability_started', {
      ability: 'zeppelin_overhead_bomb', telegraphSeconds: this._bombTelegraphSeconds,
      radius: this._bombRadius, target: target.clone()
    });
    ctx.emitAIEvent?.(this.root, 'zeppelin_bomb_dropped', {
      ability: 'zeppelin_overhead_bomb', origin: origin.clone(), target: target.clone()
    });
    return true;
  }

  _updateBombing(dt, ctx) {
    for (let index = this._bombStrikes.length - 1; index >= 0; index--) {
      const strike = this._bombStrikes[index];
      strike.timer += dt;
      const progress = Math.min(1, strike.timer / this._bombTelegraphSeconds);
      strike.visual.bomb.root.position.lerpVectors(strike.origin, strike.target, progress);
      strike.visual.bomb.root.position.y += Math.sin(progress * Math.PI) * 0.35;
      strike.visual.bomb.root.rotation.x += dt * 5;
      strike.visual.marker.root.userData.life = strike.timer;
      const countdown = 1.35 - progress * 0.35;
      strike.visual.marker.refs?.ring?.scale?.set?.(countdown, countdown, countdown);
      if (strike.visual.marker.refs?.disk?.material) {
        strike.visual.marker.refs.disk.material.opacity = 0.18 + progress * 0.3;
      }
      if (progress < 1) continue;

      const dx = (ctx?.player?.position?.x ?? 999) - strike.target.x;
      const dz = (ctx?.player?.position?.z ?? 999) - strike.target.z;
      const hitPlayer = dx * dx + dz * dz <= this._bombRadius * this._bombRadius;
      if (hitPlayer) {
        if (ctx.damagePlayer) {
          ctx.damagePlayer(this._bombDamage, {
            sourceKind: 'zeppelin_overhead_bomb',
            sourceRoot: this.root,
            ownerRoot: this.root
          });
        } else {
          ctx.onPlayerDamage?.(this._bombDamage, 'zeppelin_overhead_bomb');
        }
      }
      ctx?.emitAIEvent?.(this.root, 'ability_released', {
        ability: 'zeppelin_overhead_bomb', hitPlayer, radius: this._bombRadius
      });
      ctx?.emitAIEvent?.(this.root, 'ability_resolved', {
        ability: 'zeppelin_overhead_bomb', hitPlayer
      });
      try { globalThis.window?._EFFECTS?.spawnExplosion?.(strike.target.clone(), 1.1, 0xff9f1c); } catch {}
      this._strikePool.release(strike.visual, ctx?.scene || this.scene);
      this._bombStrikes.splice(index, 1);
    }

    if (this.retreating || this._turn || this.enginePods.length === 0 || !ctx?.player?.position) return;
    this._bombCooldown = Math.max(0, this._bombCooldown - dt);
    const dx = this.root.position.x - ctx.player.position.x;
    const dz = this.root.position.z - ctx.player.position.z;
    if (this._bombCooldown <= 0 && dx * dx + dz * dz <= 4.5 * 4.5) this._dropOverheadBomb(ctx);
  }

  update(dt, ctx){
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
    const wasOffArena = Math.abs(this.root.position.x) > 46 || Math.abs(this.root.position.z) > 46;
    this._updateFlight(dt, ctx);
    this._updateFallingPods(dt);
    this._updateBombing(dt, ctx);

    // Keep the shield objective reachable: while pods remain, the Zeppelin
    // turns around for another pass instead of flying permanently off-map.
    const off = wasOffArena || Math.abs(this.root.position.x) > 46 || Math.abs(this.root.position.z) > 46;
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
    for (const strike of this._bombStrikes) this._strikePool.release(strike.visual, this.scene);
    this._bombStrikes = [];
    this._strikePool.destroy(this.scene);
    // Do not force-remove engine pods; EnemyManager lifecycle handles them. Just clear lists.
    this.enginePods = [];
    for (const debris of this._fallingPods) this.scene.remove(debris.root);
    this._fallingPods = [];
  }
}


