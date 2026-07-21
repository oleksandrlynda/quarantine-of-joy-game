import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { entranceClearanceFor, validateSpawnEntrance } from '../src/levels/contracts.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import {
  APARTMENT_COLLIDER_PROFILE,
  assetColliderProfileIds,
  BARRIERS_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  CORNER_SHOP_COLLIDER_PROFILE,
  FACADE_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../src/assets/collision-profiles.js';

const countRoster = packages => packages.flat().reduce((counts, type) => {
  counts[type] = (counts[type] || 0) + 1;
  return counts;
}, {});

test('Relay authored spawn entrances have complete finite contracts and static clearance', () => {
  const validation = validateLevelSpawnNetwork(RELAY_DISTRICT);
  assert.equal(validation.length, 7);
  assert.deepEqual(validation.filter(result => !result.valid), []);
  for (const { entrance } of validation) {
    assert.deepEqual(validateSpawnEntrance(entrance), []);
    assert.ok(Math.hypot(...entrance.facing) > 0);
    for (const type of entrance.allow) assert.ok(entranceClearanceFor(entrance, type) > 0);
  }
});

test('Relay ground entrances cover five identities and Broodmaker adds are constrained to hatch and vent', () => {
  const ground = RELAY_DISTRICT.entrances.filter(entrance => !entrance.air);
  assert.deepEqual(ground.map(entrance => entrance.id), [
    'north-door', 'west-gate', 'east-alley', 'floor-hatch', 'rear-vent'
  ]);
  assert.deepEqual(
    ground.filter(entrance => entrance.allow.includes('gruntling')).map(entrance => entrance.id),
    ['floor-hatch', 'rear-vent']
  );
  assert.equal(RELAY_DISTRICT.entrances.filter(entrance => entrance.air).length, 2);
});

test('Relay exact wave rosters match the campaign encounter plan', () => {
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[1].packages), { grunt: 8 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[2].packages), { grunt: 9, shooter: 2 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[3].packages), { grunt: 10, shooter: 3, tank: 1 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[4].packages), { grunt: 11, shooter: 4, tank: 1 });
  assert.deepEqual([1, 2, 3, 4].map(wave => RELAY_DISTRICT.waves[wave].activeCap), [8, 9, 10, 11]);
  assert.equal(RELAY_DISTRICT.waves[5].boss, 'broodmaker-light');
});

test('regular authored reinforcements wait for clearance and block premature wave completion', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    grassMesh: null,
    weather: null,
    clonePrefab: () => new THREE.Group(),
    cullGrass: null,
    onObjective: null,
    onWarning: null,
    onRefreshColliders: null,
    onTransitionToLegacy: null
  });
  const queued = [];
  const enemyManager = {
    wave: 1,
    alive: RELAY_DISTRICT.waves[1].packages[0].length,
    enemies: new Set(),
    setEncounterHooks(hooks) { this.hooks = hooks; },
    queueAuthoredEnemies(pkg) { queued.push([...pkg]); this.alive += pkg.length; }
  };
  runtime.load(RELAY_DISTRICT);
  runtime.attach({ enemyManager });
  runtime.onWaveStart(1);

  enemyManager.alive = 3;
  runtime.update(.1, { position: new THREE.Vector3(0, 1.7, 22) });
  assert.deepEqual(queued, []);
  assert.equal(enemyManager.hooks.canCompleteWave(1), false);

  enemyManager.alive = 2;
  runtime.update(.1, { position: new THREE.Vector3(0, 1.7, 22) });
  assert.deepEqual(queued.map(pkg => pkg.length), [2]);
  assert.equal(enemyManager.hooks.canCompleteWave(1), true);
});

test('Relay routes and capture objectives retain authored gameplay clearances and timings', () => {
  assert.equal(RELAY_DISTRICT.size[0], 64);
  assert.equal(RELAY_DISTRICT.size[1], 56);
  assert.ok(RELAY_DISTRICT.routes.every(route => route.clearance >= 2.2));
  assert.equal(RELAY_DISTRICT.objectives.westFeed.seconds, 6);
  assert.equal(RELAY_DISTRICT.objectives.eastFeed.seconds, 6);
  assert.equal(RELAY_DISTRICT.objectives.mast.seconds, 24);
  assert.equal(RELAY_DISTRICT.objectives.mast.radius, 5.5);
  assert.equal(RELAY_DISTRICT.objectives.mast.decay, false);
  assert.ok(RELAY_DISTRICT.bossArenaBounds.maxX - RELAY_DISTRICT.bossArenaBounds.minX >= 54);
  assert.ok(RELAY_DISTRICT.bossArenaBounds.maxZ - RELAY_DISTRICT.bossArenaBounds.minZ >= 48);
});

test('Relay collision envelopes cover the confirmed Level 1 visual footprints', () => {
  const collider = id => RELAY_DISTRICT.colliders.find(item => item.id === id);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'apartment').length, APARTMENT_COLLIDER_PROFILE.length);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'cornershop').length, CORNER_SHOP_COLLIDER_PROFILE.length);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'facade').length, FACADE_COLLIDER_PROFILE.length * 2);
  assert.ok(collider('north-civic-frame').size[0] >= 19.4);
  assert.ok(collider('west-civic-wall-north').size[0] >= 1.5);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'breachvent').length, BREACH_VENT_COLLIDER_PROFILE.length);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'cornercover').length, CORNER_COVER_COLLIDER_PROFILE.length);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'gabion').length, GABION_COLLIDER_PROFILE.length * 2);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'barriers').length, BARRIERS_COLLIDER_PROFILE.length * 2);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'roadblock').length, ROADBLOCK_COLLIDER_PROFILE.length * 2);
  assert.equal(RELAY_DISTRICT.colliders.filter(item => item.assetId === 'checkpoint').length, CHECKPOINT_COLLIDER_PROFILE.length);
  assert.ok(Math.abs(collider('relay-mast-shot-base').size[0] - 3.614 * 1.55) < 1e-6);
  assert.equal(collider('relay-mast-shot-base').shape, 'cylinder');
  assert.equal(collider('relay-mast-shot-base').blocksMovement, false);
  assert.equal(collider('relay-mast-move-center').blocksShots, false);
  const eastRelay = RELAY_DISTRICT.colliders.filter(item => item.assetId === 'powerrelay');
  assert.equal(eastRelay.length, POWER_RELAY_COLLIDER_PROFILE.length);
  assert.ok(eastRelay.find(item => item.primitiveId === 'base').size[0] >= 2.6, 'rotated relay base covers its modeled world depth');
  assert.ok(eastRelay.every(item => typeof item.blocksSight === 'boolean'));
});

test('Relay mast preserves open sightlines outside its visible base and supports', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    grassMesh: null,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {}
  });
  runtime.load(RELAY_DISTRICT);
  const mast = runtime.colliderObjects.filter(object => object.userData.colliderAssetId === 'relaymast');
  const shotBlockers = mast.filter(object => object.userData.blocksShots);
  const movementBounds = mast
    .filter(object => object.userData.blocksMovement)
    .map(object => new THREE.Box3().setFromObject(object));
  const ray = new THREE.Raycaster();

  ray.set(new THREE.Vector3(2.6, 1.7, 0), new THREE.Vector3(0, 0, -1));
  ray.far = 14;
  assert.equal(ray.intersectObjects(shotBlockers, false).length, 0, 'empty corner of the former relay cube stays shoot-through');

  ray.set(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 0, -1));
  ray.far = 14;
  assert.ok(ray.intersectObjects(shotBlockers, false).length > 0, 'visible center pole still stops a shot');

  ray.set(new THREE.Vector3(2.6, .2, 0), new THREE.Vector3(0, 0, -1));
  ray.far = 14;
  assert.ok(ray.intersectObjects(shotBlockers, false).length > 0, 'visible round base still stops a low shot');

  assert.equal(
    movementBounds.some(bounds => bounds.containsPoint(new THREE.Vector3(2.5, .5, -4.5))),
    false,
    'movement proxy excludes the empty outer AABB corner'
  );
  assert.equal(
    movementBounds.some(bounds => bounds.containsPoint(new THREE.Vector3(2.3, .5, -5.5))),
    true,
    'movement slabs still cover the visible round footprint'
  );
});

test('Relay removes hidden Wave 5 objective colliders and restores them after the boss', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {}
  });
  runtime.load(RELAY_DISTRICT);
  const ids = [
    ...assetColliderProfileIds('west-terminal', TERMINAL_COLLIDER_PROFILE),
    ...assetColliderProfileIds('east-relay', POWER_RELAY_COLLIDER_PROFILE)
  ];
  const objectiveColliders = ids.map(id => runtime.colliderObjects.find(item => item.userData.colliderId === id));
  assert.ok(objectiveColliders.every(item => item && objects.includes(item)));

  runtime.onWaveStart(5);
  assert.ok(objectiveColliders.every(item => !objects.includes(item) && item.visible === false));

  runtime.onBossDefeated(5);
  assert.ok(objectiveColliders.every(item => objects.includes(item) && item.visible === true));
});

test('Relay visual profile preserves one authored backdrop and escalates through readable wave states', () => {
  assert.equal(RELAY_DISTRICT.assets.filter(placement => placement.asset === 'relaybackdrop').length, 1);
  assert.equal(RELAY_DISTRICT.grassPatches.length, 4);
  for (const patch of RELAY_DISTRICT.grassPatches) {
    assert.ok(Math.abs(patch.center[0]) + patch.radius[0] < RELAY_DISTRICT.size[0] / 2);
    assert.ok(Math.abs(patch.center[1]) + patch.radius[1] < RELAY_DISTRICT.size[1] / 2);
    assert.ok(patch.heightScale > 0 && patch.heightScale < 1);
  }
  assert.deepEqual(RELAY_DISTRICT.weatherByWave, {
    1: 'relay-cordon',
    2: 'relay-alarm',
    3: 'relay-rain',
    4: 'relay-signalstorm',
    5: 'relay-infestationstorm'
  });
});

test('Relay visibility layer uses fixed instanced architecture and grounded threat rings', () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 10, 100);
  const objects = [];
  const weatherCalls = [];
  let encounterHooks = null;
  const enemy = new THREE.Group();
  enemy.position.set(4, .8, 2);
  enemy.userData.type = 'grunt';
  const enemyManager = {
    enemies: new Set([enemy]),
    setEncounterHooks(hooks) { encounterHooks = hooks; },
    queueAuthoredEnemies() {}
  };
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: { setMode: (...args) => weatherCalls.push(args) },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {}
  });
  runtime.attach({ enemyManager });
  runtime.load(RELAY_DISTRICT);
  runtime.onWaveStart(1);
  runtime.update(.016, { position: new THREE.Vector3(0, 1.7, 22) });

  assert.equal(runtime.group.getObjectByName('relay-rim-massing').count, 12);
  assert.equal(runtime.group.getObjectByName('relay-visible-boundaries').count, 4);
  const forestTrunks = runtime.group.getObjectByName('relay-forest-trunks');
  const forestBranches = runtime.group.getObjectByName('relay-forest-branches');
  const forestFoliage = [1, 2, 3].map(index => runtime.group.getObjectByName(`relay-forest-foliage-${index}`));
  const backgroundTrunks = runtime.group.getObjectByName('relay-forest-background-trunks');
  const backgroundFoliage = runtime.group.getObjectByName('relay-forest-background-foliage');
  assert.ok(forestTrunks.count >= 190);
  assert.equal(forestBranches.count, forestTrunks.count * 2);
  assert.ok(forestFoliage.every(mesh => mesh.count === forestTrunks.count));
  assert.ok(backgroundTrunks.count >= 300);
  assert.equal(backgroundFoliage.count, backgroundTrunks.count * 2);
  assert.equal(runtime.group.getObjectByName('relay-forest-backdrop'), undefined);
  assert.equal(runtime.group.getObjectByName('relay-forest-fog').count, 4);
  assert.ok(forestFoliage.every(mesh => mesh.material.isMeshStandardMaterial));
  assert.equal(backgroundFoliage.material.isMeshBasicMaterial, true);
  const forestMatrix = new THREE.Matrix4();
  const forestPosition = new THREE.Vector3();
  let hasCloseTree = false;
  let hasCornerTree = false;
  for (let index = 0; index < forestTrunks.count; index++) {
    forestTrunks.getMatrixAt(index, forestMatrix);
    forestPosition.setFromMatrixPosition(forestMatrix);
    hasCloseTree ||= Math.abs(forestPosition.z) > 29 && Math.abs(forestPosition.z) < 34;
    hasCornerTree ||= Math.abs(forestPosition.x) > 33 && Math.abs(forestPosition.z) > 29;
  }
  assert.equal(hasCloseTree, true);
  assert.equal(hasCornerTree, true);
  assert.ok(runtime.group.getObjectByName('relay-rim-windows').count > 20);
  assert.equal(runtime.group.getObjectByName('relay-rim-roofs').count, 12);
  assert.equal(runtime.group.getObjectByName('relay-roof-services').count, 6);
  assert.equal(runtime.group.getObjectByName('relay-story-crates').count, 8);
  assert.equal(runtime.group.getObjectByName('relay-cordon-markers').count, 6);
  const directionalPools = runtime.group.getObjectByName('relay-light-pools');
  const directionalBeams = runtime.group.getObjectByName('relay-lightmast-beams');
  assert.equal(directionalPools.count, 6);
  assert.equal(directionalBeams.count, 4);
  assert.equal(directionalPools.material.isShaderMaterial, true);
  assert.equal(directionalBeams.material.isShaderMaterial, true);
  assert.equal(directionalBeams.geometry.type, 'CylinderGeometry');
  assert.ok(directionalBeams.geometry.parameters.radiusTop > 0);
  const poolMatrix = new THREE.Matrix4();
  const poolPosition = new THREE.Vector3();
  directionalPools.getMatrixAt(0, poolMatrix);
  poolPosition.setFromMatrixPosition(poolMatrix);
  assert.ok(poolPosition.x < -13.5);
  assert.ok(poolPosition.z > -18);
  assert.equal(runtime.group.getObjectByName('relay-static-contact-shadows').count, 11);
  assert.equal(runtime.group.getObjectByName('relay-static-contact-shadows').material.isShaderMaterial, true);
  assert.equal(runtime.enemyReadabilityMesh.count, 1);
  assert.equal(runtime.enemyReadabilityMesh.material.depthTest, true);
  assert.equal(runtime.enemyContactShadowMesh.count, 1);
  assert.equal(runtime.enemyContactShadowMesh.material.isShaderMaterial, true);
  assert.equal(runtime.group.getObjectByName('relay-enemy-threat-markers'), undefined);
  const mastKey = runtime.group.getObjectByName('relay-mast-key');
  assert.equal(mastKey.isPointLight, true);
  assert.equal(mastKey.castShadow, false);
  assert.equal(mastKey.userData.baseIntensity, 4.8);
  assert.equal(runtime.group.getObjectByName('relay-mast-hero-pool').material.isShaderMaterial, true);
  assert.ok(runtime.group.getObjectByName('relay-mast-signal-beam').material.opacity > 0);
  assert.deepEqual(encounterHooks.getBossArenaBounds(5), RELAY_DISTRICT.bossArenaBounds);
  assert.deepEqual(weatherCalls.at(-1), ['relay-cordon', { immediate: true }]);

  assert.equal(runtime.group.getObjectByName('relay-alarm-beacons').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-rain-sheen').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-signal-surge').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-infestation-veins').visible, false);

  runtime.onWaveStart(2);
  assert.equal(runtime.group.getObjectByName('relay-alarm-beacons').visible, true);
  runtime.onWaveStart(3);
  assert.equal(runtime.group.getObjectByName('relay-rain-sheen').visible, true);
  assert.equal(runtime.relayMaterials.asphalt.roughness, .4);
  runtime.onWaveStart(4);
  assert.equal(runtime.group.getObjectByName('relay-signal-surge').visible, true);
  runtime.onWaveStart(5);
  assert.equal(runtime.group.getObjectByName('relay-infestation-veins').visible, true);
  assert.equal(runtime.group.getObjectByName('relay-rain-sheen').visible, true);
  assert.equal(mastKey.userData.baseIntensity, 6.4);
  assert.equal(runtime.forestFogMaterial.color.getHex(), 0x4d5e63);
  assert.equal(runtime.forestFogMaterial.opacity, .54);

  runtime.onBossDefeated(5);
  assert.equal(runtime.group.getObjectByName('relay-alarm-beacons').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-rain-sheen').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-signal-surge').visible, false);
  assert.equal(runtime.group.getObjectByName('relay-infestation-veins').visible, false);
  assert.equal(mastKey.userData.baseIntensity, 7.2);
  assert.equal(runtime.relayMaterials.asphalt.roughness, .84);
  assert.equal(runtime.forestFogMaterial.color.getHex(), 0x789184);
});

test('Relay hides legacy blue arena walls without removing collision and restores them on unload', () => {
  const scene = new THREE.Scene();
  const boundary = new THREE.Mesh(new THREE.BoxGeometry(80, 6, 1), new THREE.MeshBasicMaterial({ color: 0x8ecae6 }));
  boundary.userData.arenaBoundary = true;
  boundary.visible = true;
  scene.add(boundary);
  const objects = [boundary];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {}
  });

  runtime.load(RELAY_DISTRICT);
  assert.equal(boundary.visible, false);
  assert.ok(objects.includes(boundary), 'legacy wall remains in the collider collection');

  runtime.unload();
  assert.equal(boundary.visible, true);
  assert.ok(objects.includes(boundary), 'unload does not remove the legacy collider');
});

test('Relay restores authored playable grass pockets but keeps grass out of props and roads', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array([
    -25.5, .01, 23,
    -28, .01, 23,
    0, .01, 0
  ]), 3));
  geometry.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 1));
  const grassMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass(mesh) {
      const scales = mesh.geometry.getAttribute('scale');
      mesh.userData.baseGrassScales = Float32Array.from(scales.array);
      for (let i = 0; i < scales.count; i++) scales.setX(i, 0);
    },
    onObjective() {},
    onRefreshColliders() {}
  });

  runtime.load(RELAY_DISTRICT);

  const scales = grassMesh.geometry.getAttribute('scale');
  assert.ok(Math.abs(scales.getX(0) - .72) < 1e-5, 'landscaped verge restores low grass');
  assert.equal(scales.getX(1), 0, 'tree collider remains grass-free');
  assert.equal(scales.getX(2), 0, 'combat road remains grass-free');
});

test('Relay decorative solids have explicit collision without blocking traversal surfaces', () => {
  const colliderIds = new Set(RELAY_DISTRICT.colliders.map(collider => collider.id));
  const requiredColliders = [
    'west-civic-wall-north', 'west-civic-wall-south',
    'east-civic-wall-north', 'east-civic-wall-south',
    'fireescape-backing',
    'fireescape-support-west', 'fireescape-support-east',
    'fireescape-bridge-support-west', 'fireescape-bridge-support-east',
    'lightmast-north-west-base', 'lightmast-north-west-pole', 'lightmast-north-west-lamp-bar',
    'lightmast-north-east-base', 'lightmast-north-east-pole', 'lightmast-north-east-lamp-bar',
    'lightmast-south-west-base', 'lightmast-south-west-pole', 'lightmast-south-west-lamp-bar',
    'lightmast-south-east-base', 'lightmast-south-east-pole', 'lightmast-south-east-lamp-bar',
    'streettree-south-west-planter', 'streettree-south-west-trunk',
    'streettree-south-east-planter', 'streettree-south-east-trunk',
    'streettree-north-west-planter', 'streettree-north-west-trunk',
    'streettree-north-east-planter', 'streettree-north-east-trunk',
    ...assetColliderProfileIds('rear-breach-vent', BREACH_VENT_COLLIDER_PROFILE)
  ];

  for (const id of requiredColliders) assert.ok(colliderIds.has(id), `Missing collider: ${id}`);
  assert.deepEqual(
    RELAY_DISTRICT.walkableSurfaces.map(surface => surface.id),
    ['fireescape-landing', 'fireescape-ramp']
  );
});
