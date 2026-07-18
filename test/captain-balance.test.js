import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { Captain } from '../src/bosses/captain.js';
import { ZeppelinSupport } from '../src/bosses/zeppelin.js';

function makeHarness() {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 0.8, 5) };
  const instances = new Map();
  const enemyManager = {
    scene,
    enemies: new Set(),
    registerExternalEnemy(instance, { preserveParent = false } = {}) {
      instances.set(instance.root, instance);
      if (!preserveParent || !instance.root.parent) scene.add(instance.root);
      this.enemies.add(instance.root);
      return instance.root;
    },
    remove(root) {
      if (!this.enemies.delete(root)) return;
      scene.remove(root);
      instances.get(root)?.onRemoved?.(scene);
      instances.delete(root);
    },
    _isSpawnAreaClear: () => true
  };
  const damage = [];
  const events = [];
  const ctx = {
    scene,
    player,
    objects: [],
    damagePlayer: (amount, attribution) => damage.push({ amount, attribution }),
    emitAIEvent: (_root, type, data) => events.push({ type, ...data }),
    moveWithCollisions(root, step) { root.position.add(step); },
    avoidObstacles(_position, desired) { return desired.clone().multiplyScalar(0); },
    separation() { return new THREE.Vector3(); }
  };
  return { scene, player, enemyManager, damage, events, ctx };
}

function makeCaptain(harness) {
  return new Captain({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: harness.enemyManager,
    rng: () => 0.5
  });
}

test('Wave 15 enters its visible Zeppelin shield phase at 60 percent health', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    captain.root.userData.hp = captain.maxHp * 0.6 + 1;
    captain._maybeSummonZeppelin(harness.ctx);
    assert.equal(captain._zeppelin, null);

    captain.root.userData.hp = captain.maxHp * 0.6;
    captain._maybeSummonZeppelin(harness.ctx);
    assert.equal(captain.phase, 2);
    assert.equal(captain.invuln, true);
    assert.equal(captain._assetRefs.shield.visible, true);
    assert.match(captain.root.userData.phaseLabel, /3 pods/);
    assert.equal(captain._zeppelin.enginePods.length, 3);
    assert.ok(captain._zeppelin.enginePods.every(pod => pod.parent === captain._zeppelin.refs.body));

    for (const pod of [...captain._zeppelin.enginePods]) harness.enemyManager.remove(pod);
    captain._zeppelin._checkPodsCleared();
    assert.equal(captain.invuln, false);
    assert.equal(captain._assetRefs.shield.visible, false);
    assert.equal(captain.root.userData.phaseLabel, 'Sponsor Down');
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Captain volley uses a visible traveling bolt with damage attribution', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    const muzzle = captain._assetRefs.muzzle.getWorldPosition(new THREE.Vector3());
    assert.ok(muzzle.z > captain.root.position.z, 'the production gun should face the Captain attack direction');

    captain._fireVolleyBolt(new THREE.Vector3(0, 0, 1), harness.ctx);
    assert.equal(captain._volleyProjectiles.length, 1);
    assert.equal(harness.damage.length, 0, 'firing the weapon should not apply an invisible instant hit');
    assert.equal(captain._volleyProjectiles[0].bolt.root.parent, harness.scene);

    for (let i = 0; i < 8 && harness.damage.length === 0; i++) {
      captain._updateVolleyProjectiles(0.05, harness.ctx);
    }
    assert.equal(harness.damage.length, 1);
    assert.equal(harness.damage[0].amount, 14);
    assert.equal(harness.damage[0].attribution.sourceKind, 'captain_volley');
    assert.equal(captain._volleyProjectiles.length, 0);
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Captain volley visibly impacts cover before it can damage the player', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 0.4),
      new THREE.MeshBasicMaterial()
    );
    wall.position.set(0, 1.5, 3);
    wall.updateMatrixWorld(true);
    harness.ctx.objects = [wall];

    captain._fireVolleyBolt(new THREE.Vector3(0, 0, 1), harness.ctx);
    captain._updateVolleyProjectiles(0.25, harness.ctx);
    assert.equal(harness.damage.length, 0);
    assert.equal(captain._volleyProjectiles.length, 0, 'the bolt should terminate on visible cover');
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Captain withholds a volley when world cover or an ally blocks the muzzle line', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    const blocker = new THREE.Group();
    blocker.userData.type = 'tank';
    harness.ctx.tacticalLineClear = () => ({ clear: false, worldClear: true, blockerRoot: blocker });
    const fired = captain._fireVolleyBolt(new THREE.Vector3(0, 0, 1), harness.ctx);
    assert.equal(fired, false);
    assert.equal(captain._volleyProjectiles.length, 0);
    assert.equal(harness.events.at(-1).type, 'shot_withheld');
    assert.equal(harness.events.at(-1).blockedBy, 'ally');

    harness.ctx.tacticalLineClear = () => ({ clear: false, worldClear: false, blockerRoot: null });
    captain._fireVolleyBolt(new THREE.Vector3(0, 0, 1), harness.ctx);
    assert.equal(harness.events.at(-1).blockedBy, 'world');
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Captain ad zone counts down before damaging inside its displayed radius', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    const marker = captain._zonePool.acquire();
    marker.root.position.copy(harness.player.position).setY(0.06);
    harness.scene.add(marker.root);
    captain.zones.push({
      marker,
      mesh: marker.root,
      timer: 0,
      center: marker.root.position.clone(),
      delay: 1.35,
      refs: marker.refs
    });

    captain._updateZones(1, harness.ctx);
    assert.equal(harness.damage.length, 0, 'the warning circle should leave time to move out');
    assert.ok(marker.refs.ring.scale.x < 1.35, 'the ring should visibly count down toward detonation');

    captain._updateZones(0.36, harness.ctx);
    assert.equal(harness.damage.length, 1);
    assert.equal(harness.damage[0].amount, 18);
    assert.equal(harness.damage[0].attribution.sourceKind, 'captain_ad_zone');
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Zeppelin adds no duplicate ground hazards during the generator objective', () => {
  const harness = makeHarness();
  const zeppelin = new ZeppelinSupport({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    enemyManager: harness.enemyManager,
    scene: harness.scene,
    rng: () => 0.5
  });

  try {
    for (let index = 0; index < 8; index++) zeppelin.update(0.5, harness.ctx);
    assert.equal(zeppelin._dropPod, undefined);
    assert.equal(zeppelin.bombs, undefined);
    assert.equal(harness.scene.children.some(child => child.userData?.type === 'boss_bomb'), false);
    assert.equal(harness.damage.length, 0, 'Zeppelin support should not duplicate the Captain ad-zone attack');
  } finally {
    for (const pod of [...zeppelin.enginePods]) harness.enemyManager.remove(pod);
    zeppelin.cleanup();
  }
});

test('Zeppelin engine pods stay mounted throughout a visible turnaround', () => {
  const harness = makeHarness();
  const zeppelin = new ZeppelinSupport({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    enemyManager: harness.enemyManager,
    scene: harness.scene,
    rng: () => 0.5
  });

  try {
    const localPositions = zeppelin.enginePods.map(pod => pod.position.clone());
    zeppelin.root.position.x = 46.1;
    zeppelin.update(0.016, harness.ctx);
    assert.ok(zeppelin._turn, 'crossing the arena edge should begin a turn');

    zeppelin.update(0.5, harness.ctx);
    assert.ok(zeppelin.root.rotation.y > 0 && zeppelin.root.rotation.y < Math.PI, 'turn should animate instead of snapping 180 degrees');
    zeppelin.enginePods.forEach((pod, index) => {
      assert.equal(pod.parent, zeppelin.refs.body);
      assert.ok(pod.position.distanceTo(localPositions[index]) < 1e-8, `pod ${index} mount transform should remain stable`);
      assert.ok(
        new THREE.Box3().setFromObject(pod).intersectsBox(new THREE.Box3().setFromObject(zeppelin.refs.podStruts[index])),
        `pod ${index} should remain connected to its hull mount`
      );
    });

    zeppelin.update(0.5, harness.ctx);
    assert.equal(zeppelin._turn, null);
    assert.equal(zeppelin.direction.x, -1);
  } finally {
    for (const pod of [...zeppelin.enginePods]) harness.enemyManager.remove(pod);
    zeppelin.cleanup();
  }
});

test('destroyed Zeppelin engine pod detaches, falls, and clears as debris', () => {
  const harness = makeHarness();
  const zeppelin = new ZeppelinSupport({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    enemyManager: harness.enemyManager,
    scene: harness.scene,
    rng: () => 0.5
  });

  try {
    const pod = zeppelin.enginePods[0];
    const mountedY = pod.getWorldPosition(new THREE.Vector3()).y;
    harness.enemyManager.remove(pod);

    assert.equal(pod.parent, harness.scene);
    assert.equal(pod.userData.type, 'boss_pod_debris');
    assert.equal(zeppelin._fallingPods.length, 1);
    zeppelin.update(0.25, harness.ctx);
    assert.ok(pod.position.y < mountedY, 'destroyed pod should immediately move downward');

    for (let index = 0; index < 20 && zeppelin._fallingPods.length; index++) zeppelin.update(0.15, harness.ctx);
    assert.equal(zeppelin._fallingPods.length, 0);
    assert.equal(pod.parent, null, 'landed debris should leave the scene');
  } finally {
    for (const livePod of [...zeppelin.enginePods]) harness.enemyManager.remove(livePod);
    zeppelin.cleanup();
  }
});

test('destroying the final generator immediately sends the Zeppelin into a climbing retreat', () => {
  const harness = makeHarness();
  let shieldDrops = 0;
  const zeppelin = new ZeppelinSupport({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    enemyManager: harness.enemyManager,
    scene: harness.scene,
    onPodsCleared: () => { shieldDrops++; },
    rng: () => 0.5
  });

  try {
    for (const pod of [...zeppelin.enginePods]) harness.enemyManager.remove(pod);
    zeppelin.update(0.016, harness.ctx);
    assert.equal(zeppelin.enginePods.length, 0);
    assert.equal(zeppelin.retreating, true);
    assert.equal(zeppelin._turn, null, 'retreat should override a normal patrol turnaround');
    assert.equal(shieldDrops, 1);

    const before = zeppelin.root.position.clone();
    zeppelin.update(0.5, harness.ctx);
    assert.ok(zeppelin.root.position.y > before.y, 'retreat should visibly climb');
    assert.ok(Math.abs(zeppelin.root.position.x) > Math.abs(before.x), 'retreat should take the nearest arena exit');

    for (let index = 0; index < 30 && !zeppelin.cleaned; index++) zeppelin.update(0.15, harness.ctx);
    assert.equal(zeppelin.cleaned, true);
    assert.equal(zeppelin.root.parent, null, 'retreating Zeppelin should leave the scene');
  } finally {
    zeppelin.cleanup();
  }
});
