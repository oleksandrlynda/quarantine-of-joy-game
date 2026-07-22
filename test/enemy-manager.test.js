import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function sequenceRng(values) {
  let i = 0;
  return () => values[i++] ?? values.at(-1) ?? 0;
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const len = this.length(); if (len) { this.x /= len; this.y /= len; this.z /= len; } return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
class Box3 {
  constructor(min = new Vector3(), max = new Vector3()) { this.min = min; this.max = max; }
  set(min, max) { this.min = min.clone ? min.clone() : min; this.max = max.clone ? max.clone() : max; return this; }
  setFromObject(obj) { return this.set(obj.min, obj.max); }
  intersectsBox(other) {
    return !(other.max.x < this.min.x || other.min.x > this.max.x ||
      other.max.y < this.min.y || other.min.y > this.max.y ||
      other.max.z < this.min.z || other.min.z > this.max.z);
  }
}
class Raycaster {
  set(origin, direction) {
    this.origin = origin.clone();
    this.direction = direction.clone();
  }
  intersectObjects() { return []; }
}
class InstancedMesh {
  constructor() {
    this.instanceMatrix = { setUsage() {}, needsUpdate: false };
    this.count = 0;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerSrcPath = path.resolve(__dirname, '../src/enemies/manager.js');
let managerCode = fs.readFileSync(managerSrcPath, 'utf8');
managerCode = managerCode.replace("import { ARENA_RADIUS } from '../world.js';", 'const ARENA_RADIUS = 40;');
const managerTmpPath = path.resolve(__dirname, '../src/enemies/_manager_temp_test.mjs');
fs.writeFileSync(managerTmpPath, managerCode);
const { EnemyManager } = await import(pathToFileURL(managerTmpPath));
fs.unlinkSync(managerTmpPath);

const THREE = {
  Vector3,
  Box3,
  Raycaster,
  SphereGeometry: class {},
  MeshBasicMaterial: class {},
  InstancedMesh,
  Matrix4: class { makeTranslation() {} },
  DynamicDrawUsage: 'DynamicDrawUsage'
};

function makeScene() {
  return {
    added: [],
    removed: [],
    add(obj) { this.added.push(obj); },
    remove(obj) { this.removed.push(obj); }
  };
}

function makeBox(min, max) {
  return { min: new Vector3(min.x, min.y, min.z), max: new Vector3(max.x, max.y, max.z) };
}

test('external mounted targets can register without losing their authored parent', () => {
  const { manager, scene } = makeManager();
  const authoredParent = { name: 'zeppelin_hull' };
  const root = { userData: { type: 'boss_pod_engine' }, parent: authoredParent };
  const instance = { root, update() {} };

  manager.registerExternalEnemy(instance, { countsTowardAlive: false, preserveParent: true });

  assert.equal(root.parent, authoredParent);
  assert.equal(scene.added.includes(root), false);
  assert.equal(manager.enemies.has(root), true);
});

test('registered boss roots resolve boss-sized bodies before regular behavior fallbacks', () => {
  const { manager } = makeManager();
  const root = { userData: { type: 'boss_broodmaker' }, position: new Vector3(0, 0.8, 0) };
  manager.registerExternalEnemy({ root, update() {} }, { countsTowardAlive: false });

  const profile = manager._profileForRoot(root);
  assert.equal(profile.id, 'boss_broodmaker');
  assert.ok(profile.collisionRadius > 2);
  assert.deepEqual(profile.preferredRange, [15, 22]);
});

test('registered Hydraclone descendants retain generation-scaled collision profiles', () => {
  const { manager } = makeManager();
  const root = {
    userData: { type: 'hydraclone', behaviorId: 'hydraclone_gen3' },
    position: new Vector3(0, 0.8, 0)
  };
  const instance = { root, behaviorId: 'hydraclone_gen3', update() {} };

  manager.registerExternalEnemy(instance, { countsTowardAlive: false });

  assert.equal(root.userData.behaviorId, 'hydraclone_gen3');
  assert.equal(manager._profileForRoot(root).collisionRadius, 0.32);
});

test('repeated collision telemetry is coalesced without losing the suppressed count', () => {
  const { manager } = makeManager();
  const mover = { userData: { type: 'flyer' } };
  const blocker = { userData: { type: 'flyer' } };
  const events = [];
  manager.onAIEvent = event => events.push(event);

  manager._emitMovementTelemetry(mover, 'movement_blocked', { blockedBy: 'ally', blockerRoot: blocker });
  manager._emitMovementTelemetry(mover, 'movement_blocked', { blockedBy: 'ally', blockerRoot: blocker });
  manager._aiClock = 0.6;
  manager._emitMovementTelemetry(mover, 'movement_blocked', { blockedBy: 'ally', blockerRoot: blocker });

  assert.equal(events.length, 2);
  assert.equal(events[0].suppressedRepeats, 0);
  assert.equal(events[1].suppressedRepeats, 1);
});

function makeManager({
  objects = [],
  rng = sequenceRng([0.8, 0.2]),
  scene = makeScene(),
  getPlayer = () => ({ position: new Vector3(0, 0, 0), forward: new Vector3(0, 0, 1) })
} = {}) {
  const manager = new EnemyManager(
    THREE,
    scene,
    {},
    objects,
    getPlayer,
    Infinity,
    null,
    rng
  );
  manager.spawnRings = { edge: [], mid: [] };
  return { manager, scene };
}

test('visibility probes originate at the actual elevated player height', () => {
  const { manager } = makeManager({
    getPlayer: () => ({ position: new Vector3(9, 3.636, 14), forward: new Vector3(0, 0, 1) })
  });

  assert.equal(manager._isVisibleFromPlayer(new Vector3(15, 1.1, 14)), true);
  assert.equal(manager.raycaster.origin.y, 3.636);
});

test('dynamic projectile pools remain visible outside stale instanced-mesh bounds', () => {
  const { manager } = makeManager();

  assert.equal(manager._bulletPools.shooter.mesh.frustumCulled, false);
  assert.equal(manager._bulletPools.sniper.mesh.frustumCulled, false);
});

test('AI blackboard receives the full player camera ray for precise counter-aim reactions', () => {
  const { manager } = makeManager();
  const player = { position: new Vector3(2, 1.7, 3) };
  const aimOrigin = new Vector3(2, 1.65, 3);
  const aimDirection = new Vector3(0.1, -0.2, 0.97).normalize();
  manager.getPlayer = () => ({
    position: player.position.clone(),
    forward: new Vector3(0, 0, 1),
    aimOrigin: aimOrigin.clone(),
    aimDirection: aimDirection.clone()
  });
  manager.bossManager.update = () => {};
  manager._updateBulletPools = () => {};

  manager.tickAI(player, 0.1, () => {});

  assert.deepEqual(manager._ctx.blackboard.playerAimOrigin, aimOrigin);
  assert.deepEqual(manager._ctx.blackboard.playerAimDirection, aimDirection);
});

test('procedural waves unlock one Propaganda Pelican five waves after Flyers', () => {
  const beforeUnlock = makeManager({ rng: () => 0 }).manager._getWaveTypes(9, 14);
  const unlockWave = makeManager({ rng: () => 0 }).manager._getWaveTypes(10, 14);

  assert.equal(beforeUnlock.includes('pelican'), false);
  assert.equal(unlockWave.filter(type => type === 'pelican').length, 1);
});

test('_isSpawnAreaClear rejects positions intersecting obstacle AABBs', () => {
  const obstacle = makeBox({ x: 4, y: 0, z: 4 }, { x: 6, y: 2, z: 6 });
  const { manager } = makeManager({ objects: [obstacle] });

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), false);
  assert.equal(manager._isSpawnAreaClear(new Vector3(12, 0.8, 12), 0.1), true);
});

test('_chooseSpawnPos rejects custom spawn points within 12 units of the player', () => {
  const { manager } = makeManager();
  manager.customSpawnPoints = [
    new Vector3(0, 0.8, 6),
    new Vector3(14, 0.8, -14)
  ];

  const pos = manager._chooseSpawnPos();

  assert.deepEqual({ x: pos.x, y: pos.y, z: pos.z }, { x: 14, y: 0.8, z: -14 });
});

test('_chooseSpawnPos prefers non-visible or not-forward-facing candidates', () => {
  const { manager } = makeManager();
  const forwardVisible = new Vector3(0, 0.8, 20);
  const occludedSide = new Vector3(-20, 0.8, 0);
  manager.customSpawnPoints = [forwardVisible, occludedSide];
  manager._isVisibleFromPlayer = pos => pos !== occludedSide;

  const pos = manager._chooseSpawnPos();

  assert.deepEqual({ x: pos.x, y: pos.y, z: pos.z }, { x: -20, y: 0.8, z: 0 });
});

test('refreshColliders rebuilds obstacle bounding boxes after object changes', () => {
  const first = makeBox({ x: 4, y: 0, z: 4 }, { x: 6, y: 2, z: 6 });
  const second = makeBox({ x: 10, y: 0, z: 10 }, { x: 12, y: 2, z: 12 });
  const { manager } = makeManager({ objects: [first] });

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), false);
  manager.refreshColliders([second]);

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), true);
  assert.equal(manager._isSpawnAreaClear(new Vector3(11, 0.8, 11), 0.1), false);
});

test('ground height ignores solid overhead colliders excluded from AI grounding', () => {
  const ceiling = makeBox({ x: -9, y: 3.7, z: -9 }, { x: 9, y: 4, z: 9 });
  ceiling.userData = { blocksMovement: true, blocksGrounding: false };
  const { manager } = makeManager({ objects: [ceiling] });

  assert.equal(manager.movementObjects.includes(ceiling), true, 'ceiling must remain a body obstacle');
  assert.equal(manager.groundingObjects.includes(ceiling), false, 'ceiling must not be sampled as terrain');
  assert.equal(manager._groundHeightAt(0, 0), 0);

  manager.refreshColliders([ceiling]);
  assert.equal(manager._groundHeightAt(0, 0), 0, 'refresh must preserve the grounding channel');
});

test('movement-locked tutorial sentries stay in their authored firing lane', () => {
  const { manager } = makeManager();
  const sentry = {
    position: new Vector3(2, .8, -7.5),
    userData: { type: 'shooter', movementLocked: true }
  };

  const result = manager._moveWithCollisions(sentry, new Vector3(4, 0, 3));

  assert.deepEqual({ x: sentry.position.x, y: sentry.position.y, z: sentry.position.z }, { x: 2, y: .8, z: -7.5 });
  assert.equal(result.requestedDistance, 5);
  assert.equal(result.appliedDistance, 0);
});

test('authored-only spawn selection returns null instead of falling back to arena coordinates', () => {
  const { manager } = makeManager();
  manager.setEncounterHooks({ authoredOnly: true, getSpawnCandidates: () => [] });

  assert.equal(manager._chooseSpawnPosForType('tank'), null);
  assert.equal(manager.spawn('tank'), null);
});

test('blocked authored enemies stay reserved in the retry queue', () => {
  const { manager } = makeManager();
  manager.setEncounterHooks({ authoredOnly: true, getSpawnCandidates: () => [] });
  manager.queueAuthoredEnemies(['grunt', 'shooter'], { initial: true });

  manager._updateAuthoredSpawnQueue(1);

  assert.equal(manager.alive, 2);
  assert.equal(manager._authoredSpawnQueue.length, 2);
  assert.ok(manager._authoredSpawnCooldown > 0);
});

test('a blocked authored queue head does not hide spawnable tail enemies', () => {
  const { manager } = makeManager();
  manager.wave = 1;
  manager.qaImmediateSpawns = true;
  manager.setEncounterHooks({
    authoredOnly: true,
    getSpawnCandidates: ({ type }) => type === 'blocked' ? [] : [{ entranceId: `${type}-gate` }]
  });
  manager.queueAuthoredEnemies(['blocked', 'grunt', 'shooter'], { initial: true });
  const spawned = [];
  manager.spawn = type => {
    if (type === 'blocked') return null;
    spawned.push(type);
    return { userData: { type } };
  };

  manager._updateAuthoredSpawnQueue(1);

  assert.deepEqual(spawned, ['grunt', 'shooter']);
  assert.deepEqual(manager._authoredSpawnQueue.map(item => item.type), ['blocked']);
  assert.equal(manager.alive, 3, 'failed entries remain reserved for later retry');
});

test('level transition priming materializes one representative per queued enemy type', () => {
  const { manager } = makeManager();
  manager.wave = 42;
  manager.queueAuthoredEnemies(['grunt', 'grunt', 'shooter', 'flyer', 'flyer', 'rusher'], { initial: true });
  const spawned = [];
  manager.spawn = type => { spawned.push(type); return { userData: { type } }; };

  const result = manager.primeAuthoredSpawnTypes();

  assert.deepEqual(spawned, ['grunt', 'shooter', 'flyer', 'rusher']);
  assert.deepEqual(result.spawnedTypes, spawned);
  assert.deepEqual(manager._authoredSpawnQueue.map(item => item.type), ['grunt', 'flyer']);
  assert.equal(manager.alive, 6, 'priming consumes reserved entries without changing alive accounting');
});

test('failed level transition representatives remain queued for normal retry', () => {
  const { manager } = makeManager();
  manager.wave = 6;
  manager.queueAuthoredEnemies(['grunt', 'shooter'], { initial: true });
  manager.spawn = type => type === 'grunt' ? { userData: { type } } : null;

  const result = manager.primeAuthoredSpawnTypes();

  assert.deepEqual(result.spawnedTypes, ['grunt']);
  assert.deepEqual(manager._authoredSpawnQueue.map(item => item.type), ['shooter']);
  assert.equal(manager.alive, 2);
});

test('authored active caps keep committed reinforcements reserved until a slot opens', () => {
  const { manager } = makeManager();
  const existing = [{}, {}];
  existing.forEach(root => manager.enemies.add(root));
  manager.wave = 6;
  manager.setEncounterHooks({
    authoredOnly: true,
    getWaveDefinition: () => ({ activeCap: 2 }),
    getSpawnCandidates: () => [{ position: new Vector3(20, .8, 20) }]
  });
  manager.spawn = () => {
    const root = {};
    manager.enemies.add(root);
    return root;
  };
  manager.queueAuthoredEnemies(['grunt', 'grunt', 'shooter'], { initial: true });

  manager._updateAuthoredSpawnQueue(1);
  assert.equal(manager._authoredSpawnQueue.length, 3);

  manager.enemies.delete(existing[0]);
  manager._updateAuthoredSpawnQueue(.2);
  assert.equal(manager._authoredSpawnQueue.length, 2);
  assert.equal(manager.enemies.size, 2);
});

test('objective completion hook gates and explicitly retries wave advancement', () => {
  const { manager } = makeManager();
  let complete = false;
  let started = 0;
  manager.suspendWaves = false;
  manager.alive = 0;
  manager.wave = 3;
  manager.setEncounterHooks({ canCompleteWave: () => complete });
  manager.startWave = () => { started++; };

  assert.equal(manager.tryAdvanceWave(), false);
  complete = true;
  assert.equal(manager.tryAdvanceWave(), true);
  assert.equal(manager.wave, 4);
  assert.equal(started, 1);
});

test('wave advancement can atomically replace encounter hooks before the next wave starts', () => {
  const { manager } = makeManager();
  const events = [];
  manager.suspendWaves = false;
  manager.alive = 0;
  manager.wave = 5;
  manager.setEncounterHooks({ canCompleteWave: wave => wave === 5 });
  manager.startWave = () => {
    events.push(`start:${manager.wave}`);
    assert.equal(manager.encounterHooks.campaignLevel, 'level-2');
  };

  assert.equal(manager.tryAdvanceWave({
    beforeStart: wave => {
      events.push(`handoff:${wave}`);
      manager.setEncounterHooks({ campaignLevel: 'level-2' });
    }
  }), true);
  assert.deepEqual(events, ['handoff:6', 'start:6']);
  assert.equal(manager.wave, 6);
  assert.equal(manager._advancingWave, false);
});

test('applyKnockback leaves explicitly immovable encounter fixtures in place', () => {
  const { manager } = makeManager();
  const fixture = {
    position: new Vector3(6, 0, -4),
    userData: { type: 'boss_node_algorithm', knockbackImmune: true }
  };
  let movementCalls = 0;
  manager._moveWithCollisions = () => { movementCalls += 1; };

  manager.applyKnockback(fixture, new Vector3(0.5, 0, 0));

  assert.equal(movementCalls, 0);
  assert.deepEqual(fixture.position, new Vector3(6, 0, -4));
});

test('startWave reports wave and remaining counts through hooks', () => {
  const { manager } = makeManager();
  const calls = [];
  manager.bossManager.startBoss = () => false;
  manager._getWaveTypes = (_wave, count) => Array.from({ length: count }, () => 'grunt');
  manager.spawn = () => {};
  manager.onWave = (wave, count) => calls.push(['wave', wave, count]);
  manager.onRemaining = alive => calls.push(['remaining', alive]);

  manager.startWave();

  assert.equal(manager.alive, 11);
  assert.deepEqual(calls, [['wave', 1, 11], ['remaining', 11]]);
});

test('Wave 73 starts the shooter-free Last Light package and reserves all 42 units', () => {
  const { manager } = makeManager();
  const waveCalls = [];
  const specialCalls = [];
  manager.wave = 73;
  manager.onWave = (wave, count, types) => waveCalls.push({ wave, count, types });
  manager.onSpecialWave = event => specialCalls.push(event);

  manager.startWave();

  const [waveCall] = waveCalls;
  assert.equal(waveCall.wave, 73);
  assert.equal(waveCall.count, 42);
  assert.equal(waveCall.types.length, 42);
  assert.equal(waveCall.types.filter(type => type === 'grunt').length, 10);
  assert.equal(waveCall.types.filter(type => type === 'gruntling').length, 10);
  assert.equal(waveCall.types.filter(type => type === 'rusher').length, 12);
  assert.equal(waveCall.types.filter(type => type === 'tank').length, 3);
  assert.equal(waveCall.types.filter(type => type === 'flyer').length, 5);
  assert.equal(waveCall.types.filter(type => type === 'healer').length, 1);
  assert.equal(waveCall.types.filter(type => type === 'warden').length, 1);
  assert.equal(waveCall.types.includes('shooter'), false);
  assert.equal(waveCall.types.includes('sniper'), false);
  assert.equal(manager.alive, 42);
  assert.equal(manager.specialWaveState.reserve.length, 42);
  assert.equal(manager.specialWaveState.packages[0].threshold, 17);
  assert.deepEqual(
    specialCalls.map(event => [event.type, event.surge, event.totalSurges]),
    [['start', 1, 4]]
  );
});

test('authored Last Light routing keeps the Wave 73 special surge controller', () => {
  const { manager } = makeManager();
  manager.wave = 73;
  manager.setEncounterHooks({
    authoredOnly: true,
    getWaveDefinition: () => ({ id: 'last-light', specialEncounter: 'last_light', packages: [] }),
    getSpawnCandidates: () => []
  });

  manager.startWave();

  assert.equal(manager.specialWaveState?.definition?.id, 'last_light');
  assert.equal(manager.specialWaveState?.packagesCommitted, 1);
  assert.equal(manager.alive, 42);
  assert.equal(manager._authoredSpawnQueue.length, 0);
});

test('Wave 73 emits Warden locator pulses and enables tracking on the final surge', () => {
  const { manager } = makeManager();
  const specialCalls = [];
  manager.wave = 73;
  manager.spawn = () => null;
  manager.onSpecialWave = event => specialCalls.push(event);
  manager.startWave();
  manager.enemies.add({ userData: { type: 'swarm_warden' }, position: new Vector3(4, 3, -6) });

  manager._aiClock = 9;
  manager._updateSpecialWave(0);
  manager.specialWaveState.packagesCommitted = 3;
  manager._commitSpecialWavePackage(3);

  const locator = specialCalls.find(event => event.type === 'locator-pulse');
  assert.deepEqual(locator.position, [4, 3, -6]);
  assert.equal(locator.totalSurges, 4);
  assert.equal(specialCalls.at(-1).type, 'final-searchlight');
});

test('Wave 73 rotates a blocked reserve entry so later special roles can spawn', () => {
  const { manager } = makeManager();
  manager.wave = 73;
  manager.startWave();
  manager.specialWaveState.reserve = [
    { type: 'tank', packageIndex: 0 },
    { type: 'flyer', packageIndex: 0 }
  ];
  const spawned = [];
  manager.spawn = type => {
    if (type === 'tank') return null;
    spawned.push(type);
    const root = { userData: { type }, position: new Vector3() };
    manager.enemies.add(root);
    return root;
  };

  manager._updateSpecialWave(1);

  assert.deepEqual(spawned, ['flyer']);
  assert.deepEqual(manager.specialWaveState.reserve.map(item => item.type), ['tank']);
  assert.equal(manager.specialWaveState.reserve[0].spawnAttempts, 1);
});

test('Wave 73 warns after the clear threshold and commits its next package after the alarm', () => {
  const { manager } = makeManager();
  const specialCalls = [];
  manager.wave = 73;
  manager.spawn = () => null;
  manager.onSpecialWave = event => specialCalls.push(event);
  manager.startWave();
  manager.specialWaveState.packages[0].kills = 17;

  manager._aiClock = 18;
  manager._updateSpecialWave(18);
  assert.equal(manager.specialWaveState.packagesCommitted, 1);
  assert.equal(manager.specialWaveState.pendingSurgeAt, 21);

  manager._aiClock = 21;
  manager._updateSpecialWave(3);

  assert.equal(manager.specialWaveState.packagesCommitted, 2);
  assert.equal(manager.specialWaveState.packages[1].size, 41);
  assert.equal(manager.specialWaveState.packages[1].threshold, 17);
  assert.equal(manager.specialWaveState.committedTotal, 83);
  assert.equal(manager.alive, 83);
  assert.deepEqual(
    specialCalls.map(event => event.type),
    ['start', 'surge-warning', 'surge']
  );
});

test('Wave 73 completion advances only after all four packages and their reserve are cleared', () => {
  const { manager } = makeManager();
  const specialCalls = [];
  let startWaveCalls = 0;
  manager.wave = 73;
  manager.onSpecialWave = event => specialCalls.push(event);
  manager.startWave();
  manager.specialWaveState.packagesCommitted = 4;
  manager.specialWaveState.reserve.length = 0;
  manager.specialWaveState.committedTotal = 165;
  manager.alive = 1;
  const root = {
    userData: { type: 'grunt', hp: 0, specialWavePackageIndex: 3 },
    position: new Vector3(4, 0.8, 6)
  };
  manager.enemies.add(root);
  manager.startWave = () => { startWaveCalls += 1; };

  manager.remove(root);

  assert.equal(manager.alive, 0);
  assert.equal(manager.specialWaveState, null);
  assert.equal(manager.wave, 74);
  assert.equal(startWaveCalls, 1);
  assert.equal(specialCalls.at(-1).type, 'complete');
  assert.equal(specialCalls.at(-1).committedTotal, 165);
});

test('only the final wave-counted enemy can enter last-survivor behavior', () => {
  const { manager } = makeManager();
  const healer = { userData: { type: 'healer' }, position: new Vector3() };
  manager.enemies.add(healer);
  manager.alive = 1;

  assert.equal(manager.isLastWaveEnemy(healer), true);

  manager.alive = 2;
  assert.equal(manager.isLastWaveEnemy(healer), false);

  manager.alive = 1;
  manager._nonWaveEnemies.add(healer);
  assert.equal(manager.isLastWaveEnemy(healer), false);
});

test('one healer becomes the support-only leader when no combat allies or reserves remain', () => {
  const { manager } = makeManager();
  const first = { userData: { type: 'healer', hp: 90 }, position: new Vector3() };
  const second = { userData: { type: 'healer', hp: 90 }, position: new Vector3() };
  manager.enemies.add(first);
  manager.enemies.add(second);
  manager._enemyRootsArr.push(first, second);
  manager.alive = 2;

  assert.equal(manager.isSupportOnlyWaveLeader(first), true);
  assert.equal(manager.isSupportOnlyWaveLeader(second), false);

  const grunt = { userData: { type: 'grunt', hp: 100 }, position: new Vector3() };
  manager.enemies.add(grunt);
  manager._enemyRootsArr.push(grunt);
  manager.alive = 3;
  assert.equal(manager.isSupportOnlyWaveLeader(first), false);

  manager.enemies.delete(grunt);
  manager._enemyRootsArr.pop();
  manager._authoredSpawnQueue.push({ type: 'grunt' });
  assert.equal(manager.isSupportOnlyWaveLeader(first), false);
});

test('reset clears enemies, projectiles, heal sprites, and restarts waves when not suspended', () => {
  const { manager, scene } = makeManager();
  const enemy = { position: new Vector3(1, 0.8, 1) };
  const healSprite = { sprite: { type: 'heal' } };
  let startWaveCalls = 0;
  manager.enemies.add(enemy);
  manager.instances.add({ root: enemy });
  manager._bulletPools.shooter.count = 2;
  manager._bulletPools.shooter.mesh.count = 2;
  manager._healSprites.push(healSprite);
  manager.bossManager.reset = () => {};
  manager.startWave = () => { startWaveCalls += 1; };

  manager.reset();

  assert.deepEqual(scene.removed, [enemy, healSprite.sprite]);
  assert.equal(manager.enemies.size, 0);
  assert.equal(manager.instances.size, 0);
  assert.equal(manager.alive, 0);
  assert.equal(manager.wave, 1);
  assert.equal(manager._bulletPools.shooter.count, 0);
  assert.equal(manager._bulletPools.shooter.mesh.count, 0);
  assert.equal(manager._healSprites.length, 0);
  assert.equal(startWaveCalls, 1);
});

test('reset accepts an explicit starting wave for debug playthroughs', () => {
  const { manager } = makeManager();
  let startedAt = 0;
  manager.startWave = () => { startedAt = manager.wave; };

  manager.reset({ wave: 71 });

  assert.equal(manager.wave, 71);
  assert.equal(startedAt, 71);
});

test('reset invalidates delayed enemy spawns scheduled by the previous run', () => {
  const { manager } = makeManager();
  const scheduled = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = callback => {
    scheduled.push(callback);
    return scheduled.length;
  };

  try {
    manager.bossManager.startBoss = () => false;
    manager._getWaveTypes = (_wave, count) => Array.from({ length: count }, () => 'grunt');
    let spawnCalls = 0;
    manager.spawn = () => { spawnCalls += 1; };

    manager.startWave();
    const staleSpawn = scheduled[0];
    manager.reset();
    staleSpawn();

    assert.equal(spawnCalls, 0, 'a delayed spawn from the old run must not enter the reset run');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('spawnAt registers the existing enemy root without per-spawn model traversal', () => {
  const { manager, scene } = makeManager();
  const initialSceneNodes = scene.added.length;
  const root = {
    userData: { type: 'grunt', hp: 100 },
    position: new Vector3(4, 0.8, 6),
    traverse() { throw new Error('spawnAt must not walk the render tree'); }
  };
  const instance = { root };
  manager._createInstance = () => instance;

  const result = manager.spawnAt('grunt', root.position, { countsTowardAlive: false });

  assert.equal(result, root);
  assert.equal(scene.added.length, initialSceneNodes + 1);
  assert.equal(scene.added.at(-1), root);
  assert.equal(manager.instances.has(instance), true);
  assert.equal(manager.enemies.has(root), true);
  assert.equal(root.userData.readabilityMarker, undefined);
});

test('removing a non-wave enemy does not decrement alive or advance the wave', () => {
  const { manager } = makeManager();
  const root = {
    userData: { type: 'grunt', hp: 100 },
    position: new Vector3(4, 0.8, 6)
  };
  manager._createInstance = () => ({ root });
  let startWaveCalls = 0;
  manager.startWave = () => { startWaveCalls += 1; };

  manager.spawnAt('grunt', root.position, { countsTowardAlive: false });
  manager.remove(root);

  assert.equal(manager.alive, 0);
  assert.equal(manager.wave, 1);
  assert.equal(startWaveCalls, 0);
});

test('enemy cleanup failures are contained instead of freezing the game loop', () => {
  const { manager } = makeManager();
  const root = {
    userData: { type: 'shooter', hp: 100 },
    position: new Vector3(4, 0.8, 6)
  };
  const instance = { root, onRemoved() { throw new Error('cleanup failed'); } };
  manager._createInstance = () => instance;
  manager.spawnAt('shooter', root.position, { countsTowardAlive: false });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => manager.remove(root));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(manager.enemies.has(root), false);
  assert.equal(manager.instances.has(instance), false);
});

test('removing a reserved wave spawn decrements alive and advances the wave', () => {
  const { manager } = makeManager();
  const root = {
    userData: { type: 'grunt', hp: 100 },
    position: new Vector3(4, 0.8, 6)
  };
  manager._createInstance = () => ({ root });
  manager._chooseSpawnPos = () => root.position;
  manager.alive = 1;
  let startWaveCalls = 0;
  manager.startWave = () => { startWaveCalls += 1; };

  manager.spawn('grunt');
  manager.remove(root);

  assert.equal(manager.alive, 0);
  assert.equal(manager.wave, 2);
  assert.equal(startWaveCalls, 1);
});

test('Punchline Rush pushes and stuns each nearby non-boss enemy once', () => {
  const { manager } = makeManager();
  manager._aiClock = 4;
  const near = { userData: { type: 'grunt' }, position: new Vector3(0.5, 0.8, 0) };
  const far = { userData: { type: 'grunt' }, position: new Vector3(5, 0.8, 0) };
  manager.enemies.add(near);
  manager.enemies.add(far);
  const pushes = [];
  manager.applyKnockback = (root, vector) => pushes.push({ root, vector });
  const hitSet = new Set();

  const first = manager.applyRushImpact(new Vector3(0, 0, 0), new Vector3(0, 0, -1), { hitSet });
  const second = manager.applyRushImpact(new Vector3(0, 0, 0), new Vector3(0, 0, -1), { hitSet });

  assert.deepEqual(first, [near]);
  assert.deepEqual(second, []);
  assert.equal(pushes.length, 1);
  assert.equal(near.userData.stunnedUntil, 5.5);
  assert.equal(far.userData.stunnedUntil, undefined);
});

test('Callback shockwave pushes nearby enemies away from the player without affecting bosses', () => {
  const { manager } = makeManager();
  const near = { userData: { type: 'grunt' }, position: new Vector3(2, 0.8, 0) };
  const far = { userData: { type: 'grunt' }, position: new Vector3(8, 0.8, 0) };
  const boss = { userData: { type: 'boss' }, position: new Vector3(1, 0.8, 0) };
  manager.enemies.add(near);
  manager.enemies.add(far);
  manager.enemies.add(boss);
  manager.bossManager.active = true;
  manager.bossManager.boss = { root: boss };
  const pushes = [];
  manager.applyKnockback = (root, vector) => pushes.push({ root, vector });

  const affected = manager.applyRadialKnockback(new Vector3(0, 0, 0), { radius: 3.5, pushDistance: 1.4 });

  assert.deepEqual(affected, [near]);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].root, near);
  assert.ok(Math.abs(pushes[0].vector.length() - 1.4) < 1e-9);
  assert.ok(pushes[0].vector.x > 0);
});

test('Engagement Bait redirects nearby non-boss AI damage into the prop', () => {
  const { manager } = makeManager();
  manager.bossManager.update = () => {};
  manager._updateBulletPools = () => {};
  const player = { position: new Vector3(0, 1.7, 0) };
  const bait = { position: new Vector3(3, 0, 0) };
  const root = { userData: { type: 'grunt' }, position: new Vector3(4, 0.8, 0) };
  let observedTarget = null;
  let playerDamage = 0;
  const affectedCounts = [];
  manager.instances.add({
    root,
    update(_dt, ctx) {
      observedTarget = ctx.player;
      ctx.damagePlayer(12, { sourceRoot: root });
    }
  });
  manager.enemies.add(root);
  manager.setEngagementBait({ root: bait, radius: 10, hp: 50, onAffected: count => affectedCounts.push(count) });

  manager.tickAI(player, 0.1, amount => { playerDamage += amount; });

  assert.equal(observedTarget, bait);
  assert.equal(manager.engagementBait.hp, 38);
  assert.equal(playerDamage, 0);
  assert.deepEqual(affectedCounts, [1]);

  manager.tickAI(player, 0.1, () => {});
  assert.deepEqual(affectedCounts, [1], 'the same enemy only counts once per bait');
});

test('stunned enemies skip AI updates until their stun expires', () => {
  const { manager } = makeManager();
  manager.bossManager.update = () => {};
  manager._updateBulletPools = () => {};
  const root = { userData: { stunnedUntil: 1.5 }, position: new Vector3(1, 0.8, 1) };
  let updates = 0;
  manager.instances.add({ root, update() { updates += 1; } });

  manager.tickAI({ position: new Vector3(0, 1.7, 0) }, 0.1, () => {});
  assert.equal(updates, 0);
  root.userData.stunnedUntil = 0;
  manager.tickAI({ position: new Vector3(0, 1.7, 0) }, 0.1, () => {});
  assert.equal(updates, 1);
});

test('the active boss is updated only by BossManager, not the generic instance loop', () => {
  const { manager } = makeManager();
  manager._updateBulletPools = () => {};
  const root = { userData: { type: 'boss_test' }, position: new Vector3(8, 0.8, 8) };
  let updates = 0;
  const boss = { root, update() { updates += 1; } };
  manager.instances.add(boss);
  manager.enemies.add(root);
  manager.bossManager.active = true;
  manager.bossManager.boss = boss;
  manager.bossManager.update = (_dt, ctx) => boss.update(_dt, ctx);

  manager.tickAI({ position: new Vector3(0, 1.7, 0) }, 0.1, () => {});

  assert.equal(updates, 1);
});

test('retrofit ornaments are discovered incrementally and hidden only at distance', () => {
  const { manager } = makeManager();
  manager.bossManager.update = () => {};
  manager._updateBulletPools = () => {};
  const detail = { userData: { performanceDetail: true }, visible: true };
  const root = {
    userData: {},
    position: new Vector3(20, 0.8, 0),
    traverse(callback) { callback(this); callback(detail); }
  };
  const instance = { root, update() {} };
  manager.enemies.add(root);
  manager.instances.add(instance);
  manager._detailScanQueue.push(root);

  for (let i = 0; i < 6; i++) manager.tickAI({ position: new Vector3(0, 1.7, 0) }, 0.1, () => {});
  assert.equal(detail.visible, false);

  root.position.x = 10;
  for (let i = 0; i < 6; i++) manager.tickAI({ position: new Vector3(0, 1.7, 0) }, 0.1, () => {});
  assert.equal(detail.visible, true);
});


test('shared swept bodies steer ground enemies around allies while separated air spans pass', () => {
  const { manager } = makeManager();
  const mover = { position: new Vector3(0, 0.8, 0), userData: { type: 'grunt', behaviorId: 'grunt' } };
  const blocker = { position: new Vector3(0, 0.8, 2), userData: { type: 'grunt', behaviorId: 'grunt' } };
  manager.enemies.add(mover);
  manager.enemies.add(blocker);
  manager._ctx = { player: { position: new Vector3(100, 1.7, 100) } };

  const result = manager._moveWithCollisions(mover, new Vector3(0, 0, 4));

  assert.equal(result.blockedBy, null);
  assert.equal(result.slidAround, 'ally');
  assert.equal(result.blockerRoot, blocker);
  assert.ok(result.appliedDistance < result.requestedDistance);
  assert.ok(Math.hypot(mover.position.x - blocker.position.x, mover.position.z - blocker.position.z) >= 1.14);

  const flyer = { position: new Vector3(0, 8, 0), userData: { type: 'flyer', behaviorId: 'flyer' } };
  manager.enemies.add(flyer);
  manager.spatialIndex.clear();
  const airResult = manager._moveWithCollisions(flyer, new Vector3(0, 0, 4));
  assert.notEqual(airResult.blockedBy, 'ally');
});

test('a boss can move through its own stationary encounter objective', () => {
  const { manager } = makeManager();
  const boss = {
    position: new Vector3(0, .8, 0),
    userData: { type: 'boss_strike_adjudicator' }
  };
  const mine = {
    position: new Vector3(0, 0, 2),
    userData: { type: 'purge_node', behaviorId: 'purge_node', bossOwnerRoot: boss }
  };
  manager.enemies.add(boss);
  manager.enemies.add(mine);
  manager._ctx = { player: { position: new Vector3(100, 1.7, 100) } };

  const result = manager._moveWithCollisions(boss, new Vector3(0, 0, 4));

  assert.notEqual(result.blockedBy, 'ally');
  assert.equal(result.blockerRoot, null);
  assert.ok(boss.position.z > mine.position.z);
  assert.equal(mine.position.z, 2);
});

test('high-speed enemy movement cannot tunnel through thin world colliders', () => {
  const wall = makeBox({ x: -3, y: 0, z: -.6 }, { x: 3, y: 3, z: .6 });
  const { manager } = makeManager({ objects: [wall] });
  const rusher = { position: new Vector3(0, .8, -5), userData: { type: 'rusher', behaviorId: 'rusher' } };
  manager.enemies.add(rusher);
  manager._ctx = { player: { position: new Vector3(100, 1.7, 100) } };

  const result = manager._moveWithCollisions(rusher, new Vector3(0, 0, 10));

  assert.equal(result.blockedBy, 'world');
  assert.ok(result.appliedDistance < result.requestedDistance);
  assert.ok(rusher.position.z < -1.1, `expected rusher before wall, got z=${rusher.position.z}`);
});

test('air attack reservations cap concurrent dives per formation owner', () => {
  const { manager } = makeManager();
  const owner = { position: new Vector3(0, 10, 0), userData: { behaviorId: 'warden' } };
  const first = { position: new Vector3(0, 5, 0), userData: { behaviorId: 'flyer' } };
  const second = { position: new Vector3(2, 5, 0), userData: { behaviorId: 'flyer' } };
  const third = { position: new Vector3(-2, 5, 0), userData: { behaviorId: 'flyer' } };
  manager.enemies.add(first);
  manager.enemies.add(second);
  manager.enemies.add(third);

  assert.equal(manager._reserveAirAttack(first, owner, { maxConcurrent: 2 }), true);
  assert.equal(manager._reserveAirAttack(second, owner, { maxConcurrent: 2 }), true);
  assert.equal(manager._reserveAirAttack(third, owner, { maxConcurrent: 2 }), false);
  manager._releaseAirAttack(first);
  assert.equal(manager._reserveAirAttack(third, owner, { maxConcurrent: 2 }), true);
});

test('overlapping air bodies receive opposite separation and may move outward', () => {
  const { manager } = makeManager();
  const first = { position: new Vector3(0, 5, 0), userData: { type: 'flyer', behaviorId: 'flyer' } };
  const second = { position: new Vector3(0, 5, 0), userData: { type: 'flyer', behaviorId: 'flyer' } };
  manager.enemies.add(first);
  manager.enemies.add(second);
  manager._ctx = { player: { position: new Vector3(100, 1.7, 100) } };
  manager._rebuildSpatialIndex();

  const firstSeparation = manager.separation(first.position, 1.8, first);
  const secondSeparation = manager.separation(second.position, 1.8, second);
  assert.ok(firstSeparation.lengthSq() > 0);
  assert.ok(secondSeparation.lengthSq() > 0);
  assert.ok(firstSeparation.dot(secondSeparation) < 0);

  const result = manager._moveWithCollisions(first, firstSeparation.normalize().multiplyScalar(0.2));
  assert.notEqual(result.blockedBy, 'ally');
  assert.ok(Math.hypot(first.position.x, first.position.z) > 0);
});

test('tactical segment queries identify an allied body before the player', () => {
  const { manager } = makeManager();
  const shooter = { position: new Vector3(0, 0.8, 0), userData: { type: 'shooter', behaviorId: 'shooter' } };
  const blocker = { position: new Vector3(0, 0.8, 4), userData: { type: 'tank', behaviorId: 'tank' } };
  manager.enemies.add(shooter);
  manager.enemies.add(blocker);
  manager._rebuildSpatialIndex();

  const hit = manager._firstAllyOnSegment(
    new Vector3(0, 1.2, 0),
    new Vector3(0, 1.2, 10),
    shooter,
    0.04
  );

  assert.equal(hit.entry.root, blocker);
});
