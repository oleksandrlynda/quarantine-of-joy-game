import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CROWD_SUMMON_BALANCE,
  CrowdSummonController,
  resolveCrowdSummonRoster
} from '../src/enemies/crowd-summon.js';

function makeRoot(type, x, z, hp) {
  const root = new THREE.Group();
  root.position.set(x, 0.8, z);
  root.userData = { type, behaviorId: type, hp, maxHp: hp };
  return root;
}

function makeHarness({ existingPelicans = 0 } = {}) {
  const scene = new THREE.Scene();
  const roots = [
    makeRoot('grunt', -1, 10, 100),
    makeRoot('rusher', 0, 10, 60),
    makeRoot('shooter', 1, 10, 80),
    makeRoot('grunt', 7, 8, 100)
  ];
  for (let index = 0; index < existingPelicans; index += 1) {
    roots.push(makeRoot('pelican', 18 + index * 3, -18, 100));
  }
  const instances = new WeakMap();
  for (const root of roots) {
    instances.set(root, {
      root,
      speed: 5,
      update() {},
      _animRefs: {
        leftArm: new THREE.Group(),
        rightArm: new THREE.Group()
      }
    });
    scene.add(root);
  }
  const events = [];
  const player = new THREE.Object3D();
  player.position.set(0, 5, 0);
  const manager = {
    THREE,
    scene,
    enemies: new Set(roots),
    instanceByRoot: instances,
    _nonWaveEnemies: new WeakSet(),
    objectBBs: [],
    arenaRadius: 40,
    spawnRings: {
      edge: [
        new THREE.Vector3(-20, 0.8, 0),
        new THREE.Vector3(20, 0.8, 0),
        new THREE.Vector3(0, 0.8, 20),
        new THREE.Vector3(0, 0.8, -20)
      ],
      mid: []
    },
    alive: roots.length,
    wave: 12,
    specialWaveState: null,
    getPlayer: () => ({ position: player.position.clone(), forward: new THREE.Vector3(0, 0, 1) }),
    _locomotionCorridorClear: () => false,
    hasWorldLineOfSight: () => false,
    _groundHeightAt: () => 0,
    _isVisibleFromPlayer: () => true,
    _avoidObstacles: (_origin, direction) => direction.clone(),
    separation: () => new THREE.Vector3(),
    _moveWithCollisions(root, step) { root.position.add(step); },
    _setAIState(root, state) { root.userData.aiState = state; },
    _emitAIEvent(root, type, data = {}) { events.push({ root, type, ...data }); },
    _specialWaveRoleCount(type) {
      return [...this.enemies].filter(root => root.userData.type === type).length;
    },
    isSpawnPointClear: () => true,
    remove(root) {
      if (!this.enemies.delete(root)) return;
      this.instances?.delete?.(this.instanceByRoot.get(root));
      scene.remove(root);
      this.alive -= 1;
    },
    spawnAt(type, position) {
      const hp = type === 'warden' ? 420 : (type === 'pelican' ? 100 : 40);
      const root = makeRoot(type, position.x, position.z, hp);
      root.position.y = position.y;
      const instance = type === 'pelican'
        ? { root, state: 'recharge', stateTime: 0, rechargeTime: 1.1 }
        : (type === 'warden' ? { root, targetCount: 12 } : { root, cooldown: 0 });
      this.enemies.add(root);
      this.instanceByRoot.set(root, instance);
      scene.add(root);
      this.alive += 1;
      return root;
    }
  };
  const controller = new CrowdSummonController({
    THREE,
    manager,
    rng: () => 0,
    reachabilityProbe: () => false
  });
  return { controller, manager, player, roots, events };
}

function advanceToChannel(harness) {
  harness.controller.update(CROWD_SUMMON_BALANCE.unreachableSeconds - 0.01, { player: harness.player });
  assert.equal(harness.controller.active, null);
  harness.controller.update(0.02, { player: harness.player });
  assert.equal(harness.controller.active?.phase, 'gathering');
  for (const participant of harness.controller.active.participants) participant.root.position.copy(participant.slot);
  harness.controller.update(0.01, { player: harness.player });
  assert.equal(harness.controller.active?.phase, 'forming');
  harness.controller.update(CROWD_SUMMON_BALANCE.formationSeconds, { player: harness.player });
  assert.equal(harness.controller.active?.phase, 'channeling');
}

test('Pelican slots downgrade to Flyers while every roster retains its Swarm Warden', () => {
  assert.deepEqual(resolveCrowdSummonRoster(0), ['pelican', 'pelican', 'warden']);
  assert.deepEqual(resolveCrowdSummonRoster(1), ['pelican', 'flyer', 'warden']);
  assert.deepEqual(resolveCrowdSummonRoster(2), ['flyer', 'flyer', 'warden']);
  assert.deepEqual(resolveCrowdSummonRoster(5), ['flyer', 'flyer', 'warden']);
});

test('crowd ritual starts only after fifteen continuous unreachable seconds', () => {
  const harness = makeHarness();
  harness.controller.update(14.99, { player: harness.player });
  assert.equal(harness.controller.active, null);
  harness.controller.update(0.02, { player: harness.player });
  assert.equal(harness.controller.active?.phase, 'gathering');
  assert.equal(harness.controller.active.participants.length, 3);
  assert.equal(harness.controller.lastStartBlocker, null);
});

test('crowd ritual exposes why a valid trigger could not begin', () => {
  const harness = makeHarness();
  harness.manager._isVisibleFromPlayer = () => false;

  harness.controller.update(CROWD_SUMMON_BALANCE.unreachableSeconds + 0.01, { player: harness.player });

  assert.equal(harness.controller.active, null);
  assert.equal(harness.controller.lastStartBlocker, 'no_safe_visible_rally');
});

test('channel interruption requires fifty cumulative damage on one summoner', () => {
  const harness = makeHarness();
  advanceToChannel(harness);
  const participant = harness.controller.active.participants[0];

  participant.root.userData.hp -= 49;
  harness.controller.update(0.1, { player: harness.player });
  assert.equal(harness.controller.active?.phase, 'channeling');

  participant.root.userData.hp -= 1;
  harness.controller.update(0.1, { player: harness.player });
  assert.equal(harness.controller.active, null);
  assert.equal(participant.root.userData.movementLocked, false);
  assert.ok(harness.events.some(event => event.type === 'crowd_summon_interrupted'));
});

test('successful ritual converts three ground enemies into a safe 2 Pelican + 1 Swarm Warden roster', () => {
  const harness = makeHarness();
  const originalAlive = harness.manager.alive;
  const playerAtCompletion = harness.player.position.clone();
  advanceToChannel(harness);
  const consumed = harness.controller.active.participants.map(participant => participant.root);

  harness.controller.update(CROWD_SUMMON_BALANCE.channelSeconds, { player: harness.player });

  assert.equal(harness.controller.active, null);
  assert.equal(harness.manager.alive, originalAlive);
  assert.ok(consumed.every(root => !harness.manager.enemies.has(root)));
  const summoned = [...harness.manager.enemies].filter(root => root.userData.crowdSummoned);
  assert.deepEqual(summoned.map(root => root.userData.type).sort(), ['pelican', 'pelican', 'warden']);
  assert.ok(summoned.every(root => Math.hypot(root.position.x - playerAtCompletion.x, root.position.z - playerAtCompletion.z) >= 14));
  assert.ok(summoned.every(root => root.position.y >= 5.5));
});

test('an existing Pelican downgrades one ritual slot to a Flyer', () => {
  const harness = makeHarness({ existingPelicans: 1 });
  advanceToChannel(harness);
  harness.controller.update(CROWD_SUMMON_BALANCE.channelSeconds, { player: harness.player });

  const summoned = [...harness.manager.enemies].filter(root => root.userData.crowdSummoned);
  assert.deepEqual(summoned.map(root => root.userData.type).sort(), ['flyer', 'pelican', 'warden']);
});
