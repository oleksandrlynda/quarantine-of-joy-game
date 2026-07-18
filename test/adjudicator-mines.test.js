import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { StrikeAdjudicator } from '../src/bosses/adjudicator.js';
import { performHitscan } from '../src/weapons/hitscan.js';

function makeHarness() {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 0.8, 0) };
  const instances = new WeakMap();
  const enemyManager = {
    enemies: new Set(),
    registerExternalEnemy(instance, options) {
      instances.set(instance.root, instance);
      this.enemies.add(instance.root);
      scene.add(instance.root);
      this.lastRegistration = options;
    },
    remove(root) {
      if (!this.enemies.delete(root)) return;
      scene.remove(root);
      instances.get(root)?.onRemoved?.(scene);
    },
    getEnemyRaycastTargets() { return Array.from(this.enemies); }
  };
  const boss = new StrikeAdjudicator({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    spawnPos: new THREE.Vector3(8, 0.8, 8),
    enemyManager,
    rng: () => 0.5
  });
  const damage = [];
  const events = [];
  const ctx = {
    scene,
    player,
    blackboard: {},
    onPlayerDamage: (amount, source) => damage.push({ amount, source }),
    emitAIEvent: (_root, type, data) => events.push({ type, ...data }),
    moveWithCollisions(root, step) { root.position.add(step); return { appliedDistance: step.length(), blockedBy: null }; },
    objects: []
  };
  return { boss, ctx, damage, events, enemyManager, scene };
}

test('Citation Mine is a non-wave enemy target with a readable purge weakpoint', () => {
  const { boss, ctx, enemyManager } = makeHarness();
  try {
    const node = boss._spawnNode(ctx, new THREE.Vector3(0, 0, 0));
    assert.equal(enemyManager.lastRegistration.countsTowardAlive, false);
    assert.equal(enemyManager.enemies.has(node.root), true);
    assert.equal(node.root.userData.head.userData.bodyPart, 'weakpoint');

    const hit = performHitscan({
      THREE,
      enemyManager,
      objects: [],
      raycaster: new THREE.Raycaster(),
      origin: new THREE.Vector3(0, 0.9, 5),
      dir: new THREE.Vector3(0, 0, -1),
      range: 10
    });
    assert.equal(hit.type, 'enemy');
    assert.equal(hit.enemyRoot, node.root);
  } finally {
    boss.onRemoved(ctx.scene);
  }
});

test('shooting a Citation Mine purge core removes one Strike', () => {
  const { boss, ctx, enemyManager } = makeHarness();
  try {
    boss.strikes = 2;
    const node = boss._spawnNode(ctx, new THREE.Vector3(4, 0, 0));
    node.root.userData.hp = 0;
    boss._tickNodes(0.016, ctx);

    assert.equal(boss.strikes, 1);
    assert.equal(enemyManager.enemies.has(node.root), false);
    assert.equal(boss._nodes.length, 0);
  } finally {
    boss.onRemoved(ctx.scene);
  }
});

test('an armed Citation Mine telegraphs then damages without clearing a Strike', () => {
  const { boss, ctx, damage, enemyManager } = makeHarness();
  try {
    boss.strikes = 1;
    const node = boss._spawnNode(ctx, new THREE.Vector3(0, 0, 0));
    boss._tickNodes(0.9, ctx);
    assert.equal(node.armed, true);
    assert.equal(node.triggered, true);
    assert.equal(damage.length, 0, 'the fuse should leave a dodge window');

    boss._tickNodes(0.61, ctx);
    assert.deepEqual(damage, [{ amount: 24, source: 'mine' }]);
    assert.equal(boss.strikes, 1, 'detonation is not a successful purge');
    assert.equal(enemyManager.enemies.has(node.root), false);
  } finally {
    boss.onRemoved(ctx.scene);
  }
});

test('a Citation forms a clear two-mine screen outside the boss body', () => {
  const { boss, ctx, events } = makeHarness();
  try {
    boss._applyCitation(ctx);
    assert.equal(boss._nodes.length, 2);
    const positions = boss._nodes.map(node => node.root.position.clone());
    assert.ok(positions.every(position => position.distanceTo(boss.root.position) >= 4));
    assert.ok(positions[0].distanceTo(positions[1]) >= 6.3, 'the center lane should remain wider than the boss body');
    assert.equal(events.filter(event => event.type === 'citation_mine_spawned').length, 2);
    assert.equal(events.find(event => event.type === 'citation_applied')?.strikesAfter, 1);
    assert.equal(events.find(event => event.type === 'citation_formation_completed')?.spawnedMines, 2);
  } finally {
    boss.onRemoved(ctx.scene);
  }
});

test('phase-one Adjudicator advances into gavel range instead of orbiting at eleven metres', () => {
  const { boss, ctx } = makeHarness();
  try {
    const before = boss.root.position.distanceTo(ctx.player.position);
    boss._updateMovement(0.5, ctx);
    assert.ok(boss.root.position.distanceTo(ctx.player.position) < before);
  } finally {
    boss.onRemoved(ctx.scene);
  }
});
