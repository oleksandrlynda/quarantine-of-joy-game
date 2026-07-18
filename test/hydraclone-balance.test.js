import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BossManager } from '../src/bosses/manager.js';

function makeMaterials() {
  return { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) };
}

function makeManager() {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 0.8, 0) };
  const enemyManager = {
    scene,
    enemies: new Set(),
    alive: 0,
    waveStartingAlive: 0,
    getPlayer: () => player,
    _chooseSpawnPos: () => new THREE.Vector3(8, 0.8, 8),
    registerExternalEnemy(instance) {
      scene.add(instance.root);
      this.enemies.add(instance.root);
      this.alive++;
      return instance.root;
    },
    remove(root) {
      if (!this.enemies.delete(root)) return;
      scene.remove(root);
      this.alive--;
    }
  };
  const bossManager = new BossManager({
    THREE,
    scene,
    mats: makeMaterials(),
    enemyManager,
    rng: () => 0.5
  });
  enemyManager.bossManager = bossManager;
  return { bossManager, enemyManager, scene, player };
}

test('Wave 30 Hydraclone remains a boss encounter after its core splits', () => {
  const { bossManager, enemyManager, scene } = makeManager();
  let defeated = 0;
  bossManager.onDeath(() => { defeated++; });

  try {
    assert.equal(bossManager.startBoss(30), true);
    const core = bossManager.boss;
    assert.equal(core.root.userData.hp, 12000);
    assert.equal(core.root.userData.maxHp, 12000);

    core.root.userData.hp = 0;
    enemyManager.enemies.delete(core.root);
    scene.remove(core.root);
    enemyManager.alive--;
    core.onRemoved(scene);
    bossManager.handleEnemyRemoved(core.root);

    assert.equal(defeated, 0, 'the core split must not award boss completion');
    assert.equal(bossManager.active, true);
    assert.ok(enemyManager.alive > 0, 'at least one descendant should enter combat immediately');
    assert.ok(Array.from(enemyManager.enemies).some(root => root.userData.bossId === core.bossId));
  } finally {
    bossManager.reset();
  }
});

test('Hydraclone core adds an early fracture wave at 70 percent health', () => {
  const { bossManager, enemyManager, scene, player } = makeManager();

  try {
    assert.equal(bossManager.startBoss(30), true);
    const core = bossManager.boss;
    core.root.userData.hp = core.maxHp * 0.69;
    core._updateFracturePhases({ scene, player });

    assert.equal(core.root.userData.phaseLabel, 'Fracture 2');
    assert.equal(enemyManager.alive, 1, 'the fracture wave should wait for its cast release');
    core._updateCloneCast(0.3, { scene, player });
    assert.ok(core.refs.leftArm.rotation.x < 0, 'the core should visibly raise its arms during the cast');
    assert.equal(enemyManager.alive, 1);
    core._updateCloneCast(0.42, { scene, player });
    assert.equal(enemyManager.alive, 2, 'one queued echo should join the core immediately');
    assert.ok(Array.from(enemyManager.enemies).some(root => root.userData.generation === 2));
  } finally {
    bossManager.reset();
  }
});

test('Hydraclone mirror echoes are released by a visible cast and separate into two lanes', () => {
  const { bossManager, scene, player } = makeManager();
  const hits = [];

  try {
    assert.equal(bossManager.startBoss(30), true);
    const core = bossManager.boss;
    core._playerPath = [
      new THREE.Vector3(0, 0.8, -3),
      new THREE.Vector3(0, 0.8, 0)
    ];
    const ctx = {
      scene,
      player,
      damagePlayer: (damage, attribution) => hits.push({ damage, attribution })
    };
    core._queueCloneCast('mirror');
    core._updateCloneCast(0.2, ctx);
    assert.equal(core._mirrorClones.length, 0);
    assert.ok(core.refs.core.scale.x > 1, 'the replication core should pulse during windup');

    core._updateCloneCast(0.28, ctx);
    assert.equal(core._mirrorClones.length, 2);
    assert.notEqual(core._mirrorClones[0].path[0].x, core._mirrorClones[1].path[0].x);

    player.position.set(-0.65, 0.8, 0);
    core._updateMirrorClones(0.4, ctx);
    core._updateMirrorClones(0.2, ctx);
    assert.equal(hits.length, 1, 'one separated echo lane should hit the player');
    assert.equal(hits[0].damage, 12);
    assert.equal(hits[0].attribution.sourceKind, 'hydraclone_echo');
  } finally {
    bossManager.reset();
  }
});

test('Hydraclone melee uses a windup and deals one discrete haymaker hit', () => {
  const { bossManager, scene, player } = makeManager();
  const hits = [];

  try {
    assert.equal(bossManager.startBoss(30), true);
    const core = bossManager.boss;
    core.root.position.set(0, 0.8, 0);
    player.position.set(0, 0.8, 2);
    core._yaw = 0;
    core._meleeCooldown = 0;
    const ctx = {
      scene,
      player,
      objects: [],
      damagePlayer: (damage, attribution) => hits.push({ damage, attribution })
    };

    core._updateMelee(0.01, ctx);
    assert.equal(core._meleeState, 'windup');
    assert.ok(core.refs.leftArm.rotation.x < 0 || core.refs.rightArm.rotation.x < 0);
    assert.equal(hits.length, 0);

    core._updateMelee(0.5, ctx);
    core._updateMelee(0.01, ctx);
    core._updateMelee(0.04, ctx);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].damage, 30);
    assert.equal(hits[0].attribution.sourceKind, 'hydraclone_melee');
  } finally {
    bossManager.reset();
  }
});
