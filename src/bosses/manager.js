// BossManager coordinates boss lifecycle and abilities
// API: startBoss(wave), update(dt, ctx), onDeath(cb), active

import { Broodmaker } from './broodmaker.js';
import { Sanitizer } from './sanitizer.js';
import { Captain } from './captain.js';
import { ShardAvatar } from './shard.js';
import { Hydraclone } from './hydraclone.js';
import { StrikeAdjudicator } from './adjudicator.js';

export class BossManager {
  constructor({ THREE, scene, mats, enemyManager }) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.enemyManager = enemyManager;

    this.active = false;
    this.boss = null;
    this.wave = 1;

    this.cooldown = 0; // time until next telegraphed spawn can start
    this.telegraphTime = 0;
    this.telegraphRequired = 0.8;
    this.telegraphs = [];

    this.addRoots = new Set(); // root meshes of spawned adds
    this._onDeathCb = null;
  }

  onDeath(cb) { this._onDeathCb = cb; }

  reset() {
    // Clean up any visuals and state
    this._clearTelegraphs();
    // Attempt to remove any remaining adds (if any)
    for (const root of Array.from(this.addRoots)) {
      if (this.enemyManager.enemies.has(root)) {
        this.enemyManager.remove(root);
      }
      this.addRoots.delete(root);
    }
    this.active = false; this.boss = null; this.wave = 0; this.cooldown = 0; this.telegraphTime = 0;
  }

  startBoss(wave) {
    const THREE = this.THREE;
    this.reset();
    this.active = true; this.wave = wave;

    // Spawn position: prefer manager's spawn selection, else fallback near far edge
    const spawnPos = (typeof this.enemyManager._chooseSpawnPos === 'function'
      ? this.enemyManager._chooseSpawnPos()
      : new THREE.Vector3((Math.random()*50-25)|0, 0.8, (Math.random()*50-25)|0));

    // Boss selection routing:
    // - Wave 5: Broodmaker (light version)
    // - Wave 10: Sanitizer
    // - Wave 15: Captain
    // - Wave 20: Shard Avatar
    // - Wave 25: Broodmaker (heavy version)
    // - Wave 35: Strike Adjudicator
    let boss;
    if (wave === 5) {
      boss = new Broodmaker({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, mode: 'light' });
    } else if (wave == 10) {
      boss = new Sanitizer({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager });
    } else if (wave == 15) {
      boss = new Captain({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager });
    } else if (wave == 20) {
      boss = new ShardAvatar({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager });
    } else if (wave == 25) {
      boss = new Broodmaker({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, mode: 'heavy' });
    } else if (wave == 30) {
      boss = new Hydraclone({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, generation: 0 });
    } else if (wave == 35) {
      boss = new StrikeAdjudicator({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager });
    }
    
    boss._notifyDeath = () => this._onBossDeath();
    this.enemyManager.registerExternalEnemy(boss, { countsTowardAlive: true });
    this.boss = boss;

    // First ability window 8–12s
    this.cooldown = 8 + Math.random() * 4;
    this.telegraphTime = 0;
  }

  update(dt, ctx) {
    if (!this.active || !this.boss) return;

    // If boss got removed externally, treat as death
    if (!this.enemyManager.enemies.has(this.boss.root)) {
      this._onBossDeath();
      return;
    }

    // Cull any adds that might have been killed
    for (const root of Array.from(this.addRoots)) {
      if (!this.enemyManager.enemies.has(root)) this.addRoots.delete(root);
    }

    // Skip generic add spawns for bosses that manage their own cadence
    const bossType = this.boss?.root?.userData?.type || '';
    const selfManaged = bossType.startsWith('boss_sanitizer') || bossType.startsWith('boss_captain') || bossType.startsWith('boss_shard') || bossType.startsWith('boss_broodmaker_heavy');
    if (selfManaged) {
      // Only update boss; no telegraphs or adds here
      this.boss.update(dt, ctx);
      return;
    }

    // Ability: telegraph for 0.8s, then spawn 3–5 gruntlings near player (Broodmaker default)
    if (this.telegraphTime > 0) {
      this.telegraphTime += dt;
      this._updateTelegraphs(dt, ctx);
      if (this.telegraphTime >= this.telegraphRequired) {
        this._spawnAddsNearPlayer(3 + (Math.random() * 3 | 0));
        this._clearTelegraphs();
        this.telegraphTime = 0;
        this.cooldown = 8 + Math.random() * 4;
      }
      return;
    }

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = 0;
        this._beginTelegraph(ctx);
      }
    }

    // Also tick boss movement/logic for default bosses
    if (this.boss && typeof this.boss.update === 'function') this.boss.update(dt, ctx);
  }

  _beginTelegraph(ctx) {
    // Create 3 small ground rings near the player as a visual cue
    const THREE = this.THREE;
    const positions = this._computeAddSpawnPositions(ctx, 3);
    for (const p of positions) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.75, 24),
        new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI/2;
      ring.position.set(p.x, 0.05, p.z);
      ring.userData = { life: 0 };
      this.scene.add(ring);
      this.telegraphs.push(ring);
    }
    this.telegraphTime = 0.0001; // start counting
  }

  _updateTelegraphs(dt, _ctx) {
    for (const r of this.telegraphs) {
      r.userData.life += dt;
      // slight pulse
      const scale = 1 + Math.sin(r.userData.life * 18) * 0.06;
      r.scale.set(scale, scale, scale);
      if (r.material && r.material.opacity !== undefined) {
        r.material.opacity = Math.max(0.25, 0.85 - r.userData.life * 0.6);
      }
    }
  }

  _clearTelegraphs() {
    for (const r of this.telegraphs) this.scene.remove(r);
    this.telegraphs.length = 0;
  }

  _computeAddSpawnPositions(ctx, count) {
    const THREE = this.THREE;
    const positions = [];
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++) {
      const pos = this._findSafeNearPlayer(playerPos, 6, 10, 16);
      positions.push(pos || playerPos.clone().add(new THREE.Vector3((Math.random()*6-3), 0.8, (Math.random()*6-3))));
    }
    return positions;
  }

  _findSafeNearPlayer(playerPos, minR, maxR, attempts = 18) {
    const THREE = this.THREE;
    for (let i = 0; i < attempts; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const pos = new THREE.Vector3(playerPos.x + Math.cos(ang)*r, 0.8, playerPos.z + Math.sin(ang)*r);
      if (typeof this.enemyManager._isSpawnAreaClear === 'function' && this.enemyManager._isSpawnAreaClear(pos, 0.5)) {
        return pos;
      }
    }
    return null;
  }

  _spawnAddsNearPlayer(count) {
    const ctx = {
      player: this.enemyManager.getPlayer(),
    };
    const positions = this._computeAddSpawnPositions(ctx, count);
    for (const p of positions) {
      const root = this.enemyManager.spawnAt('gruntling', p, { countsTowardAlive: true });
      if (root) this.addRoots.add(root);
    }
  }

  _onBossDeath() {
    if (!this.active) return;
    // Mark inactive first so enemyManager.remove auto-advance only after adds cleared
    this.active = false;
    // Remove telegraphs
    this._clearTelegraphs();
    // Clear remaining adds immediately
    for (const root of Array.from(this.addRoots)) {
      if (this.enemyManager.enemies.has(root)) {
        this.enemyManager.remove(root);
      }
      this.addRoots.delete(root);
    }
    // Also purge any lingering boss auxiliaries (e.g., pods/nodes) so waves don't stall
    for (const root of Array.from(this.enemyManager.enemies)) {
      const t = root?.userData?.type || '';
      if (t.startsWith('boss_pod') || t.startsWith('boss_node')) {
        this.enemyManager.remove(root);
      }
    }
    // Callback to external listeners
    if (typeof this._onDeathCb === 'function') this._onDeathCb(this.wave);
    // Boss reference cleared; next wave progression will happen via EnemyManager.remove when alive reaches 0
    this.boss = null;
  }
}


