import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { BOSS_BEHAVIOR_PROFILES, resolveBossBehaviorProfile } from '../src/bosses/behavior-profiles.js';
import { Broodmaker } from '../src/bosses/broodmaker.js';
import { BossManager } from '../src/bosses/manager.js';
import { ShardAvatar } from '../src/bosses/shard.js';

const mats = { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) };

test('campaign bosses use boss-sized production bodies instead of the Grunt fallback', () => {
  assert.ok(BOSS_BEHAVIOR_PROFILES.boss_broodmaker.collisionRadius > 2);
  assert.ok(BOSS_BEHAVIOR_PROFILES.boss_algorithm.collisionRadius > BOSS_BEHAVIOR_PROFILES.boss_captain.collisionRadius);
  assert.deepEqual(resolveBossBehaviorProfile('boss_broodmaker').preferredRange, [15, 22]);
  assert.equal(resolveBossBehaviorProfile('unknown_boss'), null);
});

test('Broodmaker retreats from close pressure and relocates into its ranged band', () => {
  const boss = new Broodmaker({
    THREE,
    mats,
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    enemyManager: null,
    rng: () => 0.5
  });
  boss._broodCooldown = 999;
  boss._burrowCooldown = 999;
  const player = { position: new THREE.Vector3(0, 1.7, 5) };
  const before = boss.root.position.distanceTo(player.position);
  boss.update(0.1, {
    player,
    objects: [],
    moveWithCollisions(root, step) { root.position.add(step); },
    scene: new THREE.Scene()
  });

  assert.ok(boss.root.position.distanceTo(player.position) > before);
  const relocate = boss._pickRelocatePos(new THREE.Vector3(0, 1.7, 0));
  const relocateDistance = Math.hypot(relocate.x, relocate.z);
  assert.ok(relocateDistance >= 17 && relocateDistance <= 22);
});

test('Broodmaker routes its body around visible world obstacles to a ranged anchor', () => {
  const boss = new Broodmaker({
    THREE,
    mats,
    spawnPos: new THREE.Vector3(0, 0.8, -11.5),
    enemyManager: null,
    rng: () => 0.5
  });
  boss._broodCooldown = 999;
  boss._burrowCooldown = 999;
  const player = { position: new THREE.Vector3(0, 1.7, 22) };
  const routeRequests = [];
  let pathClears = 0;

  boss.update(0.1, {
    player,
    objects: [],
    locomotionClear: () => false,
    pathfind: {
      recomputeIfStale(_subject, goal, options) {
        routeRequests.push({ goal: goal.clone(), options });
        return Promise.resolve([]);
      },
      nextWaypoint: () => ({ x: 4, z: -10.5 }),
      clear: () => { pathClears++; }
    },
    moveWithCollisions(root, step) {
      root.position.add(step);
      return { requestedDistance: step.length(), appliedDistance: step.length(), blockedBy: null };
    },
    scene: new THREE.Scene()
  });

  assert.equal(routeRequests.length, 1);
  assert.equal(routeRequests[0].options.cacheFor, 1.2);
  assert.ok(routeRequests[0].goal.distanceTo(player.position) >= 18);
  assert.ok(boss.root.position.x > 0, 'the waypoint should override direct movement into the visible obstacle');
  assert.equal(pathClears, 0);
  assert.equal(boss._routingToRange, true);
});

test('Broodmaker relocation respects authored level walls and rejects blocked candidates', () => {
  const bounds = { minX: -31.5, maxX: 31.5, minZ: -21.5, maxZ: 27.5 };
  const enemyManager = {
    encounterHooks: { getBossArenaBounds: () => bounds }
  };
  const boss = new Broodmaker({
    THREE,
    mats,
    spawnPos: new THREE.Vector3(0, .8, -11.5),
    enemyManager,
    rng: () => .5
  });
  let probes = 0;
  const relocate = boss._pickRelocatePos(new THREE.Vector3(28, 1.7, 24), {
    positionClear(_root, position) {
      probes += 1;
      return probes > 1 && position.x >= bounds.minX && position.x <= bounds.maxX;
    }
  });

  const margin = 2.15 + .35;
  assert.ok(probes >= 2);
  assert.ok(relocate.x >= bounds.minX + margin && relocate.x <= bounds.maxX - margin);
  assert.ok(relocate.z >= bounds.minZ + margin && relocate.z <= bounds.maxZ - margin);

  const before = boss.root.position.clone();
  const rejected = boss._pickRelocatePos(new THREE.Vector3(0, 1.7, 0), { positionClear: () => false });
  assert.deepEqual(rejected.toArray(), before.toArray());
});

test('Broodmaker keeps its brood screen inside authored arena bounds', () => {
  const bounds = { minX: -31.5, maxX: 31.5, minZ: -21.5, maxZ: 27.5 };
  const boss = Object.assign(Object.create(Broodmaker.prototype), {
    THREE,
    root: new THREE.Group(),
    enemyManager: {
      encounterHooks: { getBossArenaBounds: () => bounds },
      _isSpawnAreaClear: () => true
    }
  });
  boss.root.position.set(0, .8, 26.8);

  const positions = boss._computeSpawnWallBetweenBossAndPlayer({
    player: { position: new THREE.Vector3(10, 1.7, 27.2) }
  }, 4);

  assert.ok(positions.length > 0);
  assert.ok(positions.every(position => position.x >= bounds.minX + .45 && position.x <= bounds.maxX - .45));
  assert.ok(positions.every(position => position.z >= bounds.minZ + .45 && position.z <= bounds.maxZ - .45));
});

test('Broodmaker creates owned Gruntlings in a boss-player wall', () => {
  const bossRoot = new THREE.Group();
  bossRoot.position.set(0, 0.8, 20);
  const spawnedTypes = [];
  const instances = new Map();
  const events = [];
  const enemyManager = {
    enemies: new Set([bossRoot]),
    instanceByRoot: instances,
    _isSpawnAreaClear: () => true,
    spawnAt(type, position) {
      spawnedTypes.push(type);
      const root = new THREE.Group();
      root.position.copy(position);
      root.userData = { type, hp: 20 };
      instances.set(root, { speed: 3, aggression: 0.8 });
      this.enemies.add(root);
      return root;
    }
  };
  const boss = Object.assign(Object.create(Broodmaker.prototype), {
    THREE,
    root: bossRoot,
    enemyManager,
    rng: () => 0.5,
    _broodRoots: new Set(),
    _broodCooldown: 0,
    _broodCap: 6
  });
  const player = { position: new THREE.Vector3(0, 1.7, 0) };

  boss._updateBroodlings(0.1, {
    player,
    emitAIEvent(root, type, data) { events.push({ root, type, ...data }); }
  });

  assert.deepEqual(spawnedTypes, ['gruntling', 'gruntling', 'gruntling']);
  assert.equal(boss._broodRoots.size, 3);
  for (const root of boss._broodRoots) {
    assert.equal(root.userData.bossOwnerRoot, bossRoot);
    assert.equal(root.userData.summonRole, 'brood_wall');
    assert.ok(root.position.z > player.position.z && root.position.z < bossRoot.position.z);
  }
  assert.equal(events.filter(event => event.type === 'boss_add_spawned' && event.betweenBossAndPlayer).length, 3);
});

test('modern boss types bypass the legacy generic add spawner', () => {
  const root = new THREE.Group();
  root.userData.type = 'boss_broodmaker';
  let updates = 0;
  const enemyManager = { enemies: new Set([root]) };
  const manager = new BossManager({
    THREE, scene: new THREE.Scene(), mats, enemyManager, rng: () => 0.5
  });
  manager.active = true;
  manager.boss = { root, update() { updates++; } };
  manager.cooldown = 0;

  manager.update(1, { player: { position: new THREE.Vector3() } });

  assert.equal(updates, 1);
  assert.equal(manager.telegraphTime, 0);
  assert.equal(manager.addRoots.size, 0);
});

test('Shard barrage projectiles terminate on swept world collision before player damage', () => {
  const scene = new THREE.Scene();
  const shard = new ShardAvatar({
    THREE,
    mats,
    spawnPos: new THREE.Vector3(0, 0.8, -4),
    enemyManager: null,
    rng: () => 0.5
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.2, 1);
  wall.updateMatrixWorld(true);
  scene.add(wall);
  const projectileMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial());
  projectileMesh.position.set(0, 1.2, 0);
  scene.add(projectileMesh);
  shard.projectiles.push({
    mesh: projectileMesh,
    pos: projectileMesh.position,
    vel: new THREE.Vector3(0, 0, 1),
    speed: 10,
    life: 0,
    radius: 0.35,
    ownerRoot: shard.root,
    kind: 'shard_barrage'
  });
  const events = [];
  let damage = 0;

  shard._updateProjectiles(0.2, {
    player: { position: new THREE.Vector3(0, 1.7, 4) },
    objects: [wall],
    scene,
    damagePlayer(amount) { damage += amount; },
    emitAIEvent(root, type, data) { events.push({ root, type, ...data }); }
  });

  assert.equal(shard.projectiles.length, 0);
  assert.equal(damage, 0);
  assert.ok(events.some(event => event.type === 'projectile_blocked_by_world' && event.blockerRoot === wall));
});
