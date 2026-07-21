import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { BossManager } from '../src/bosses/manager.js';
import {
  HYDRACLONE_GENERATION_PROFILES,
  HYDRACLONE_MIRROR_INTERCEPT,
  HYDRACLONE_MIRROR_DAMAGE,
  Hydraclone
} from '../src/bosses/hydraclone.js';

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

test('Hydraclone descendants shed health while the Wave 30 core stays durable', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map(generation => HYDRACLONE_GENERATION_PROFILES[generation].hp),
    [12000, 1000, 250, 150]
  );
  assert.ok(HYDRACLONE_GENERATION_PROFILES[1].hp > HYDRACLONE_GENERATION_PROFILES[2].hp);
  assert.ok(HYDRACLONE_GENERATION_PROFILES[2].hp > HYDRACLONE_GENERATION_PROFILES[3].hp);
  assert.deepEqual(HYDRACLONE_MIRROR_DAMAGE, [12, 7, 4, 2]);

  const { enemyManager } = makeManager();
  const echo = new Hydraclone({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(),
    generation: 2,
    enemyManager,
    bossId: 'balance-check',
    rng: () => .5
  });
  assert.equal(echo.root.userData.hp, 250);
  assert.equal(echo.root.userData.maxHp, 250);
  Hydraclone.resetLineage('balance-check');
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
    const echoGeometry = core._mirrorClones[0].root.getObjectByProperty('isMesh', true).geometry;
    const echoMaterial = core._mirrorClones[0].root.getObjectByProperty('isMesh', true).material;
    let geometryDisposed = 0;
    let materialDisposed = 0;
    echoGeometry.addEventListener('dispose', () => { geometryDisposed++; });
    echoMaterial.addEventListener('dispose', () => { materialDisposed++; });

    player.position.set(-1.2, 0.8, 0);
    core._updateMirrorClones(0.4, ctx);
    core._updateMirrorClones(0.2, ctx);
    assert.equal(hits.length, 1, 'one separated echo lane should hit the player');
    assert.equal(hits[0].damage, 12);
    assert.equal(hits[0].attribution.sourceKind, 'hydraclone_echo');
    assert.equal(geometryDisposed, 1, 'completed mirror geometry must release its GPU resource');
    assert.equal(materialDisposed, 1, 'completed mirror material must release its GPU resource');
  } finally {
    bossManager.reset();
  }
});

test('Hydraclone mirror echoes predict sustained movement and converge ahead of the player', () => {
  const { bossManager, scene, player } = makeManager();

  try {
    assert.equal(bossManager.startBoss(30), true);
    const core = bossManager.boss;
    core._playerPath = Array.from({ length: 8 }, (_, index) => (
      new THREE.Vector3(0, 0.8, index)
    ));
    core._spawnMirrorClones({ scene, player });

    assert.equal(core._mirrorClones.length, 2);
    const leftPath = core._mirrorClones[0].path;
    const rightPath = core._mirrorClones[1].path;
    const leftEnd = leftPath.at(-1);
    const rightEnd = rightPath.at(-1);
    assert.ok(leftEnd.z > 7 + HYDRACLONE_MIRROR_INTERCEPT.predictionSeconds * 5);
    assert.ok(rightEnd.z > 7 + HYDRACLONE_MIRROR_INTERCEPT.predictionSeconds * 5);
    assert.ok(
      Math.abs(leftEnd.x - rightEnd.x) < Math.abs(leftPath[0].x - rightPath[0].x),
      'the two lanes should pinch toward the predicted interception point'
    );
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
