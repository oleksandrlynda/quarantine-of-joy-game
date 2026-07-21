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

test('Captain volley mixes intact bolts with delayed three-way splits', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    captain._burstActive = true;
    captain._burstTotalShots = 4;
    captain._burstShotsLeft = 4;
    captain._burstTimer = 0;
    captain._burstFiredCount = 0;
    captain._burstWithheldCount = 0;
    captain._burstBaseDir.set(0, 0, 1);
    for (let shot = 0; shot < 4; shot++) captain._tickVolley(0.13, harness.ctx);
    assert.deepEqual(captain._volleyProjectiles.map(projectile => projectile.splitEligible), [true, false, true, false]);

    while (captain._volleyProjectiles.length) captain._releaseVolleyProjectile(captain._volleyProjectiles.length - 1, harness.scene);
    captain._fireVolleyBolt(new THREE.Vector3(0, 0, 1), harness.ctx, {
      splitEligible: true, splitAfter: 0.1
    });
    captain._updateVolleyProjectiles(0.11, harness.ctx);
    assert.equal(captain._volleyProjectiles.length, 3);
    assert.ok(captain._volleyProjectiles.every(projectile => projectile.kind === 'captain_volley_fragment'));
    assert.ok(captain._volleyProjectiles.every(projectile => projectile.damage === 6 && projectile.bolt.root.scale.x === 0.55));
    assert.ok(harness.events.some(event => event.type === 'projectile_split' && event.spawnedCount === 3));
    assert.equal(harness.events.filter(event => event.type === 'projectile_fired'
      && event.ability === 'captain_volley_fragment').length, 3);
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

test('Captain earns one eight-cluster rocket after 10-20 volleys and suppresses it during Zeppelin support', () => {
  const harness = makeHarness();
  const captain = makeCaptain(harness);

  try {
    assert.ok(captain._rocketCycleTarget >= 10 && captain._rocketCycleTarget <= 20);
    captain._rocketVolleyCycles = captain._rocketCycleTarget;
    captain._zeppelin = { cleaned: false };
    assert.equal(captain._rocketReady(), false, 'active Zeppelin must suppress the rocket');

    captain._zeppelin = null;
    assert.equal(captain._beginClusterRocket(harness.ctx), true);
    captain._updateClusterRocket(0.9, harness.ctx);
    assert.ok(captain._clusterRocket, 'windup should launch one visible rocket');
    assert.ok(captain._clusterRocket.ascentSeconds >= 2.2, 'the climb must remain readable');
    assert.ok(captain._clusterRocket.duration >= 3, 'the full flight must leave time to react');
    assert.ok(captain._clusterLandingMarker, 'the full impact area should be marked during flight');
    captain._updateClusterRocket(0.5, harness.ctx);
    assert.ok(captain._clusterRocket, 'the rocket should still be climbing after half a second');

    const flight = captain._clusterRocket;
    const apex = captain._clusterRocketPosition(flight, flight.ascentSeconds);
    const earlyDescent = captain._clusterRocketPosition(flight,
      flight.ascentSeconds + flight.descentSeconds * 0.25);
    const lateDescent = captain._clusterRocketPosition(flight,
      flight.ascentSeconds + flight.descentSeconds * 0.75);
    assert.ok(earlyDescent.y > lateDescent.y);
    assert.ok((earlyDescent.y - lateDescent.y) > (apex.y - earlyDescent.y) * 2,
      'the fall should accelerate after its slow apex departure');
    for (let step = 0; step < 100 && captain._clusterRocket; step++) {
      captain._updateClusterRocket(0.05, harness.ctx);
    }

    assert.equal(captain._clusterRocket, null);
    assert.equal(captain._clusterLandingMarker, null);
    assert.equal(captain._clusterZones.length, 8);
    assert.ok(captain._clusterZones.some(cluster => Math.hypot(
      cluster.position.x - harness.player.position.x,
      cluster.position.z - harness.player.position.z
    ) < 0.1));
    captain._updateClusterZones(1.5, harness.ctx);
    assert.equal(captain._clusterZones.length, 0);
    assert.equal(harness.damage.filter(hit => hit.attribution.sourceKind === 'captain_cluster_rocket').length, 1);
    assert.ok(harness.events.some(event => event.type === 'ability_released'
      && event.ability === 'captain_cluster_rocket' && event.clusterCount === 8));
    assert.ok(harness.events.some(event => event.type === 'projectile_fired'
      && event.ability === 'captain_cluster_rocket'
      && event.indirectFire === true && event.trajectory === 'ballistic'));
  } finally {
    captain.onRemoved(harness.scene);
  }
});

test('Captain heavy rocket follows a ballistic path over normal-height cover', () => {
  const harness = makeHarness();
  harness.player.position.set(0, 0.8, 18);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.6), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2, 8);
  harness.scene.add(wall);
  wall.updateMatrixWorld(true);
  harness.ctx.objects.push(wall);
  const captain = makeCaptain(harness);

  try {
    captain._rocketVolleyCycles = captain._rocketCycleTarget;
    assert.equal(captain._beginClusterRocket(harness.ctx), true);
    captain._updateClusterRocket(0.9, harness.ctx);
    let maximumHeight = captain._clusterRocket.mesh.position.y;
    for (let step = 0; step < 120 && captain._clusterRocket; step++) {
      captain._updateClusterRocket(0.04, harness.ctx);
      if (captain._clusterRocket) maximumHeight = Math.max(maximumHeight, captain._clusterRocket.mesh.position.y);
    }
    assert.ok(maximumHeight > wall.geometry.parameters.height, 'rocket should visibly clear ordinary cover');
    assert.equal(captain._clusterRocket, null);
    assert.ok(captain._clusterZones.some(cluster => cluster.position.z > wall.position.z + 5),
      'rocket should burst at the target beyond the wall');
  } finally {
    captain.onRemoved(harness.scene);
    wall.geometry.dispose();
    wall.material.dispose();
  }
});

test('Zeppelin follows the player lane and resolves a telegraphed overhead bomb', () => {
  const harness = makeHarness();
  const zeppelin = new ZeppelinSupport({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) },
    enemyManager: harness.enemyManager,
    scene: harness.scene,
    rng: () => 0.5
  });

  try {
    zeppelin.root.position.set(-20, 7, -10);
    zeppelin.update(0.25, harness.ctx);
    assert.ok(zeppelin.root.position.z > -10, 'the flyover lane should track the player on Z');

    zeppelin.root.position.set(-1, 7, harness.player.position.z);
    zeppelin._bombCooldown = 0;
    zeppelin.update(0.01, harness.ctx);
    assert.equal(zeppelin._bombStrikes.length, 1);
    assert.ok(harness.events.some(event => event.type === 'zeppelin_bomb_dropped'));
    assert.equal(harness.damage.length, 0, 'the ground marker must provide time to evade');

    zeppelin.update(1.2, harness.ctx);
    assert.equal(zeppelin._bombStrikes.length, 0);
    assert.equal(harness.damage.length, 1);
    assert.equal(harness.damage[0].amount, 22);
    assert.equal(harness.damage[0].attribution.sourceKind, 'zeppelin_overhead_bomb');
    assert.ok(harness.events.some(event => event.type === 'ability_resolved'
      && event.ability === 'zeppelin_overhead_bomb' && event.hitPlayer === true));
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
