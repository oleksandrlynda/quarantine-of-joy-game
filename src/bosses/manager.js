// BossManager coordinates boss lifecycle and abilities
// API: startBoss(wave), update(dt, ctx), onDeath(cb), active

import { Broodmaker } from './broodmaker.js';
import { Sanitizer } from './sanitizer.js?rev=beam-cover2';
import { Captain } from './captain.js?rev=readable-ballistic-rocket2';
import { ShardAvatar } from './shard.js?rev=campaign-aim-resource-recovery1';
import { Hydraclone } from './hydraclone.js?rev=mirror-intercept2';
import { StrikeAdjudicator } from './adjudicator.js';
import { AlgorithmBoss } from './algorithm.js?rev=wave40-cleanup1';
import { ReusablePool } from './reusable-pool.js';
import { getBossSharedGeometry } from './visual-cache.js';

export class BossManager {
  constructor({ THREE, scene, mats, enemyManager, rng = Math.random }) {
    this.THREE = THREE;
    this.scene = scene;
    this.mats = mats;
    this.enemyManager = enemyManager;
    this.rng = rng;

    this.active = false;
    this.boss = null;
    this.wave = 1;

    this.cooldown = 0; // time until next telegraphed spawn can start
    this.telegraphTime = 0;
    this.telegraphRequired = 0.8;
    this.telegraphs = [];
    this._telegraphPool = null;

    this.addRoots = new Set(); // root meshes of spawned adds
    this._onDeathCb = null;
  }

  onDeath(cb) { this._onDeathCb = cb; }

  reset() {
    // Clean up any visuals and state
    this._clearTelegraphs();
    const hydraId = this.boss?.root?.userData?.type === 'boss_hydraclone'
      ? this.boss.root.userData.bossId
      : null;
    if (hydraId) Hydraclone.resetLineage(hydraId);
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
    this.wave = wave;

    // Spawn position: prefer manager's spawn selection, else fallback near far edge
    const fixedSpawn = this.enemyManager.encounterHooks?.getBossSpawn?.(wave);
    const spawnPos = fixedSpawn || (typeof this.enemyManager._chooseSpawnPos === 'function'
      ? this.enemyManager._chooseSpawnPos()
      : new THREE.Vector3((this.rng()*50-25)|0, 0.8, (this.rng()*50-25)|0));

    // Boss selection routing:
    // - Wave 5: Broodmaker (light version)
    // - Wave 10: Sanitizer
    // - Wave 15: Captain
    // - Wave 20: Shard Avatar
    // - Wave 25: Broodmaker (heavy version)
    // - Wave 30: Hydraclone
    // - Wave 35: Strike Adjudicator
    // - Wave 40: The Algorithm (campaign finale, arena-centered)
    let boss;
    if (wave === 5) {
      boss = new Broodmaker({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, rng: this.rng });
    } else if (wave == 10) {
      boss = new Sanitizer({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, rng: this.rng });
    } else if (wave == 15) {
      boss = new Captain({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, rng: this.rng });
    } else if (wave == 20) {
      boss = new ShardAvatar({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, rng: this.rng });
    } else if (wave == 25) {
      boss = new Broodmaker({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, mode: 'heavy', rng: this.rng });
    } else if (wave == 30) {
      boss = new Hydraclone({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, generation: 0, rng: this.rng });
    } else if (wave == 35) {
      boss = new StrikeAdjudicator({ THREE, mats: this.mats, spawnPos, enemyManager: this.enemyManager, rng: this.rng });
    } else if (wave == 40) {
      boss = new AlgorithmBoss({
        THREE,
        mats: this.mats,
        spawnPos: new THREE.Vector3(0, 0.8, 0),
        enemyManager: this.enemyManager,
        rng: this.rng
      });
    }

    if (!boss) return false;

    this.active = true;
    // Bosses are encounter anchors. Weapon and radial knockback must never
    // displace them, regardless of the concrete boss implementation.
    boss.root.userData.knockbackImmune = true;
    boss._notifyDeath = () => this._onBossDeath();
    this.enemyManager.registerExternalEnemy(boss, { countsTowardAlive: true });
    this.boss = boss;

    // First ability window 8–12s
    this.cooldown = 8 + this.rng() * 4;
    this.telegraphTime = 0;
    return true;
  }

  update(dt, ctx) {
    if (!this.active || !this.boss) return;

    // If boss got removed externally, treat as death
    if (!this.enemyManager.enemies.has(this.boss.root)) {
      const data = this.boss.root?.userData;
      if (data?.type === 'boss_hydraclone' && Hydraclone.hasPending(data.bossId)) return;
      this._onBossDeath();
      return;
    }

    // Cull any adds that might have been killed
    for (const root of Array.from(this.addRoots)) {
      if (!this.enemyManager.enemies.has(root)) this.addRoots.delete(root);
    }

    // Skip generic add spawns for bosses that manage their own cadence
    const bossType = this.boss?.root?.userData?.type || '';
    // Every modern campaign boss owns its encounter composition. The generic
    // legacy spawner otherwise doubles light Broodmaker and Adjudicator adds
    // and bypasses their local caps/formation rules.
    const selfManaged = bossType.startsWith('boss_');
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
        this._spawnAddsNearPlayer(3 + (this.rng() * 3 | 0));
        this._clearTelegraphs();
        this.telegraphTime = 0;
        this.cooldown = 8 + this.rng() * 4;
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
    const pool = this._ensureTelegraphPool();
    const positions = this._computeAddSpawnPositions(ctx, 3);
    for (const p of positions) {
      const ring = pool.acquire();
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
    for (const r of this.telegraphs) this._telegraphPool?.release(r);
    this.telegraphs.length = 0;
  }

  _ensureTelegraphPool() {
    if (this._telegraphPool) return this._telegraphPool;
    const THREE = this.THREE;
    const geometry = getBossSharedGeometry(THREE, 'generic-boss-telegraph', () => new THREE.RingGeometry(0.4, 0.75, 24));
    this._telegraphPool = new ReusablePool({
      preallocate: 3,
      create: () => {
        const ring = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        return ring;
      },
      reset: ring => { ring.visible = true; ring.material.opacity = 0.7; ring.scale.set(1, 1, 1); },
      release: ring => { this.scene.remove(ring); ring.visible = false; }
    });
    return this._telegraphPool;
  }

  _computeAddSpawnPositions(ctx, count) {
    const THREE = this.THREE;
    const authored = this.enemyManager.encounterHooks?.getBossAddPositions?.({
      count,
      type: 'gruntling',
      player: ctx.player
    });
    if (Array.isArray(authored)) return authored;
    const positions = [];
    const playerPos = ctx.player.position;
    for (let i = 0; i < count; i++) {
      const pos = this._findSafeNearPlayer(playerPos, 6, 10, 16);
      positions.push(pos || playerPos.clone().add(new THREE.Vector3((this.rng()*6-3), 0.8, (this.rng()*6-3))));
    }
    return positions;
  }

  _findSafeNearPlayer(playerPos, minR, maxR, attempts = 18) {
    const THREE = this.THREE;
    for (let i = 0; i < attempts; i++) {
      const ang = this.rng() * Math.PI * 2;
      const r = minR + this.rng() * (maxR - minR);
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

  handleEnemyRemoved(enemyRoot) {
    if (!this.active || !this.boss) return false;
    const bossRoot = this.boss.root;
    const bossData = bossRoot?.userData || {};
    const removedData = enemyRoot?.userData || {};

    if (bossData.type === 'boss_hydraclone') {
      const sameLineage = removedData.bossId === bossData.bossId;
      if (!sameLineage || Hydraclone.hasPending(bossData.bossId)) return false;
      // Boss rewards should land where the final echo fell, not where the core
      // split earlier in the encounter.
      if (enemyRoot !== bossRoot && enemyRoot?.position) bossRoot.position.copy(enemyRoot.position);
      this._onBossDeath();
      return true;
    }

    if (enemyRoot !== bossRoot) return false;
    this._onBossDeath();
    return true;
  }

  _onBossDeath() {
    if (!this.active) return;
    const hydraId = this.boss?.root?.userData?.type === 'boss_hydraclone'
      ? this.boss.root.userData.bossId
      : null;
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
      if (t.startsWith('boss_pod') || t.startsWith('boss_node') || t.startsWith('boss_algorithm_echo')) {
        this.enemyManager.remove(root);
      }
    }
    // Callback to external listeners
    if (typeof this._onDeathCb === 'function') this._onDeathCb(this.wave);
    if (hydraId) {
      Hydraclone.resetLineage(hydraId);
      const lineages = this.enemyManager?._ctx?.blackboard?.hydraLineages;
      if (lineages) delete lineages[hydraId];
    }
    // Boss reference cleared; next wave progression will happen via EnemyManager.remove when alive reaches 0
    this.boss = null;
  }
}


