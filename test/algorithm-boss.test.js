import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createAlgorithmAsset } from '../src/assets/boss_algorithm.js';
import { AlgorithmBoss } from '../src/bosses/algorithm.js';
import { BossManager } from '../src/bosses/manager.js';
import { performHitscan } from '../src/weapons/hitscan.js';

function makeMaterials() {
  return {
    enemy: new THREE.MeshLambertMaterial({ color: 0xef4444 }),
    head: new THREE.MeshLambertMaterial({ color: 0x111827 })
  };
}

function makeEnemyManager() {
  const scene = new THREE.Scene();
  const enemies = new Set();
  const instances = new Set();
  const instanceByRoot = new Map();
  const manager = {
    scene,
    enemies,
    instances,
    instanceByRoot,
    alive: 0,
    registerExternalEnemy(instance, { countsTowardAlive = true } = {}) {
      scene.add(instance.root);
      enemies.add(instance.root);
      instances.add(instance);
      instanceByRoot.set(instance.root, instance);
      if (countsTowardAlive) this.alive++;
      return instance.root;
    },
    remove(root) {
      if (!enemies.has(root)) return;
      enemies.delete(root);
      scene.remove(root);
      const instance = instanceByRoot.get(root);
      instanceByRoot.delete(root);
      instances.delete(instance);
      this.alive = Math.max(0, this.alive - 1);
      instance?.onRemoved?.(scene);
    },
    getPlayer() { return { position: new THREE.Vector3(0, 1.6, 12) }; }
  };
  return manager;
}

function makeContext(manager, playerPosition = new THREE.Vector3(0, 1.6, 12)) {
  const damage = [];
  return {
    ctx: {
      player: { position: playerPosition },
      scene: manager.scene,
      objects: [],
      blackboard: { time: 1 },
      damagePlayer(amount, metadata) { damage.push({ amount, metadata }); }
    },
    damage
  };
}

test('Algorithm asset parents the triangular eye beam to the rotating head', () => {
  const built = createAlgorithmAsset({ THREE, mats: makeMaterials() });
  assert.equal(built.refs.beam.parent, built.refs.beamPivot);
  assert.equal(built.refs.beamCore.parent, built.refs.beamPivot);
  assert.equal(built.refs.beamPivot.parent, built.refs.headPivot);
  assert.equal(built.refs.headPivot.parent, built.refs.body);
  assert.equal(built.refs.beam.geometry.parameters.radialSegments, 3);
  assert.equal(built.refs.beam.visible, false);
  assert.equal(built.refs.beam.material.transparent, true);
  assert.equal(built.refs.beam.material.depthWrite, false);
  assert.equal(built.refs.beam.material.blending, THREE.AdditiveBlending);
  assert.ok(built.refs.beam.material.opacity <= 0.1);

  built.refs.beam.visible = true;
  built.refs.beamCore.visible = true;
  built.root.updateWorldMatrix(true, true);
  const beamRay = new THREE.Raycaster(
    new THREE.Vector3(0, 3.43, 10),
    new THREE.Vector3(0, 0, 1)
  );
  assert.deepEqual(beamRay.intersectObject(built.refs.beam), []);
  assert.deepEqual(beamRay.intersectObject(built.refs.beamCore), []);

  built.refs.headPivot.rotation.y = Math.PI / 2;
  built.root.updateWorldMatrix(true, true);
  const direction = built.refs.beamPivot.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.x > 0.99, 'eye forward should rotate with head yaw');
});

test('the glowing lower core resolves through the precision-damage path', () => {
  const manager = makeEnemyManager();
  const boss = new AlgorithmBoss({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: manager,
    rng: () => 0.25
  });
  manager.registerExternalEnemy(boss, { countsTowardAlive: true });
  boss._setWeakpoint(true);
  boss.root.updateWorldMatrix(true, true);

  const target = boss.refs.weakRoot.getWorldPosition(new THREE.Vector3());
  const origin = target.clone().add(new THREE.Vector3(0, 0, 12));
  const result = performHitscan({
    THREE,
    camera: null,
    raycaster: new THREE.Raycaster(),
    enemyManager: manager,
    objects: [],
    origin,
    dir: target.clone().sub(origin),
    range: 20
  });

  assert.equal(result.type, 'enemy');
  assert.equal(result.hitObject?.uuid, boss.refs.weakRoot.uuid);
  assert.equal(result.bodyPart, 'weakpoint');
  assert.equal(result.isWeakpoint, true);
  assert.equal(result.isHead, true, 'weak points should receive each weapon precision bonus');
  boss.onRemoved(manager.scene);
});

test('Control nodes gate damage and each destroyed node opens a punish window', () => {
  const manager = makeEnemyManager();
  const ammoDrops = [];
  manager.pickups = {
    dropMultiple(type, position, count) { ammoDrops.push({ type, position, count }); }
  };
  const boss = new AlgorithmBoss({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: manager,
    rng: () => 0.25
  });
  manager.registerExternalEnemy(boss, { countsTowardAlive: true });

  assert.equal(boss.nodes.size, 3);
  assert.ok(
    Array.from(boss.nodes).every(node => node.root.userData.knockbackImmune === true),
    'control-node pillars must remain fixed when shot'
  );
  boss.root.userData.hp -= 1000;
  assert.equal(boss.root.userData.hp, boss.maxHp, 'armor should reject direct boss damage before a node breaks');

  const firstNode = boss.nodes.values().next().value;
  manager.remove(firstNode.root);
  assert.equal(boss.nodes.size, 2);
  assert.equal(boss.refs.weakRoot.visible, true);
  assert.deepEqual(ammoDrops.map(drop => [drop.type, drop.count]), [['ammo', 2]]);
  boss.root.userData.hp -= 1000;
  assert.equal(boss.root.userData.hp, boss.maxHp - 3000, 'node punish should triple incoming eye damage');

  for (const node of Array.from(boss.nodes)) manager.remove(node.root);
  boss._closeWeakpoint();
  const armorBrokenHp = boss.root.userData.hp;
  boss.root.userData.hp -= 1000;
  assert.equal(boss.root.userData.hp, armorBrokenHp - 2000, 'destroying every node should retain double damage');
  assert.equal(boss.refs.weakRoot.visible, true, 'the eye should remain exposed after all nodes are gone');

  boss.onRemoved(manager.scene);
});

test('Paradox caps echoes at three and the off-beat echo opens coherence', () => {
  const manager = makeEnemyManager();
  const ammoDrops = [];
  manager.pickups = {
    dropMultiple(type, position, count) { ammoDrops.push({ type, position, count }); }
  };
  const boss = new AlgorithmBoss({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: manager,
    rng: () => 0.45
  });
  manager.registerExternalEnemy(boss, { countsTowardAlive: true });

  for (const node of Array.from(boss.nodes)) manager.remove(node.root);
  boss._hp = boss.maxHp * 0.64;
  const { ctx } = makeContext(manager);
  boss.update(0.016, ctx);

  assert.equal(boss.phase, 2);
  assert.equal(boss.echoes.size, 3);
  const correct = Array.from(boss.echoes).find(echo => echo.correct);
  assert.ok(correct);
  manager.remove(correct.root);
  assert.equal(boss.echoes.size, 0);
  assert.equal(boss.refs.weakRoot.visible, true);
  assert.match(boss.root.userData.phaseLabel, /coherence broken/);
  assert.deepEqual(ammoDrops.at(-1)?.type, 'ammo');
  assert.equal(ammoDrops.at(-1)?.count, 3, 'solving Paradox should guarantee a larger ammo recovery');

  const paradoxHp = boss.root.userData.hp;
  boss.root.userData.hp -= 1000;
  assert.equal(boss.root.userData.hp, paradoxHp - 2500, 'solving Paradox should grant 2.5x damage');

  boss._hp = boss.maxHp * 0.24;
  ctx.blackboard.time += 0.016;
  boss.update(0.016, ctx);
  assert.equal(boss.phase, 3);
  assert.equal(boss.invuln, false);
  assert.equal(boss.echoes.size, 0);
  assert.equal(boss.root.userData.phaseLabel, 'Coherence Collapse');

  boss.onRemoved(manager.scene);
});

test('Algorithm ignores the duplicate active-boss update in one manager frame', () => {
  const manager = makeEnemyManager();
  const boss = new AlgorithmBoss({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: manager,
    rng: () => 0.5
  });
  manager.registerExternalEnemy(boss, { countsTowardAlive: true });
  boss._enterCollapse();
  const { ctx } = makeContext(manager);
  boss._attackCooldown = 1;

  boss.update(0.25, ctx);
  const afterFirstUpdate = boss._attackCooldown;
  boss.update(0.25, ctx);

  assert.equal(boss._attackCooldown, afterFirstUpdate);
  boss.onRemoved(manager.scene);
});

test('eye sweep applies damage from the same rotating beam pivot', () => {
  const manager = makeEnemyManager();
  const boss = new AlgorithmBoss({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: manager,
    rng: () => 0.5
  });
  manager.registerExternalEnemy(boss, { countsTowardAlive: true });
  boss._enterCollapse();
  const { ctx, damage } = makeContext(manager, new THREE.Vector3(0, 1.6, 12));
  boss.root.updateWorldMatrix(true, true);
  boss._beginEyeSweep(ctx);

  for (let i = 0; i < 28; i++) {
    boss.root.updateWorldMatrix(true, true);
    boss._updateEyeSweep(0.1, ctx);
  }

  assert.ok(damage.length >= 1, 'player standing in the tracked sweep should take damage');
  assert.ok(damage.every(hit => hit.metadata.sourceKind === 'algorithm_eye_beam'));
  assert.notEqual(boss.refs.headPivot.rotation.y, 0, 'head yaw should drive the beam sweep');

  boss.onRemoved(manager.scene);
});

test('BossManager routes Wave 40 to an arena-centered Algorithm fight', () => {
  const enemyManager = makeEnemyManager();
  enemyManager._chooseSpawnPos = () => new THREE.Vector3(20, 0.8, 20);
  const bossManager = new BossManager({
    THREE,
    scene: enemyManager.scene,
    mats: makeMaterials(),
    enemyManager,
    rng: () => 0.5
  });
  enemyManager.bossManager = bossManager;

  assert.equal(bossManager.startBoss(40), true);
  assert.equal(bossManager.boss.root.userData.type, 'boss_algorithm');
  assert.equal(bossManager.boss.root.position.x, 0);
  assert.equal(bossManager.boss.root.position.z, 0);
  assert.equal(bossManager.boss.nodes.size, 3);

  enemyManager.remove(bossManager.boss.root);
});

test('BossManager makes every routed boss immune to knockback', () => {
  for (const wave of [5, 10, 15, 20, 25, 30, 35, 40]) {
    const enemyManager = makeEnemyManager();
    enemyManager._chooseSpawnPos = () => new THREE.Vector3(8, 0.8, 8);
    const bossManager = new BossManager({
      THREE,
      scene: enemyManager.scene,
      mats: makeMaterials(),
      enemyManager,
      rng: () => 0.5
    });
    enemyManager.bossManager = bossManager;

    assert.equal(bossManager.startBoss(wave), true, `Wave ${wave} should route to a boss`);
    assert.equal(
      bossManager.boss.root.userData.knockbackImmune,
      true,
      `Wave ${wave} boss should be knockback immune`
    );
  }
});
