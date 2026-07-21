import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FREIGHT_ANNEX } from '../src/levels/freight-annex.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import { findPath } from '../src/path.js';
import { WeatherSystem } from '../src/weather.js';

test('Freight Annex owns Waves 21-25 and provides the expanded Broodmaker Prime arena', () => {
  assert.deepEqual(Object.keys(FREIGHT_ANNEX.waves).map(Number), [21, 22, 23, 24, 25]);
  assert.equal(FREIGHT_ANNEX.bossWave, 25);
  assert.equal(FREIGHT_ANNEX.waves[25].boss, 'broodmaker-heavy');
  assert.ok(FREIGHT_ANNEX.bossArenaBounds.maxX - FREIGHT_ANNEX.bossArenaBounds.minX >= 64);
  assert.ok(FREIGHT_ANNEX.bossArenaBounds.maxZ - FREIGHT_ANNEX.bossArenaBounds.minZ >= 60);
});

test('Freight Annex entrances remain valid and expose the two heavy-boss add routes', () => {
  const results = validateLevelSpawnNetwork(FREIGHT_ANNEX);
  assert.equal(results.length, 6);
  assert.equal(results.every(result => result.valid), true, results.flatMap(result => result.errors).join('; '));
  assert.ok(FREIGHT_ANNEX.entrances.some(entrance => entrance.id === 'floor-hatch'));
  assert.ok(FREIGHT_ANNEX.entrances.some(entrance => entrance.id === 'rear-vent'));
});

test('Freight Annex keeps solid cover outside the Broodmaker relocation core', () => {
  const zone = FREIGHT_ANNEX.bossClearZone;
  for (const collider of FREIGHT_ANNEX.colliders.filter(item => !item.id.includes('boundary'))) {
    const [x, , z] = collider.position;
    const [width, , depth] = collider.size;
    const nearestX = Math.max(x - width / 2, Math.min(zone.center[0], x + width / 2));
    const nearestZ = Math.max(z - depth / 2, Math.min(zone.center[1], z + depth / 2));
    assert.ok(Math.hypot(nearestX - zone.center[0], nearestZ - zone.center[1]) >= zone.radius, collider.id);
  }
});

test('Freight Annex cargo gate matches its visible shoulders and routes tanks both ways', () => {
  const west = FREIGHT_ANNEX.colliders.find(collider => collider.id === 'north-gate-west-container');
  const east = FREIGHT_ANNEX.colliders.find(collider => collider.id === 'north-gate-east-container');
  const westMin = west.position[0] - west.size[0] / 2;
  const westMax = west.position[0] + west.size[0] / 2;
  const eastMin = east.position[0] - east.size[0] / 2;
  const eastMax = east.position[0] + east.size[0] / 2;

  assert.ok(westMin <= -5.03 && eastMax >= 5.03, 'container colliders must cover the visible outer shoulders');
  assert.ok(eastMin - westMax >= 4.2, 'cargo portal must preserve its authored clear opening');

  const obstacles = FREIGHT_ANNEX.colliders
    .filter(collider => collider.blocksMovement !== false && !(collider.tags || []).includes('bossDressing'))
    .map(collider => ({
      min: {
        x: collider.position[0] - collider.size[0] / 2,
        z: collider.position[2] - collider.size[2] / 2
      },
      max: {
        x: collider.position[0] + collider.size[0] / 2,
        z: collider.position[2] + collider.size[2] / 2
      }
    }));
  const options = { gridSize: 0.75, radius: 56, agentRadius: 0.92 };

  assert.ok(findPath({ x: 0, z: -25 }, { x: 0, z: -30.25 }, obstacles, options).length > 0);
  assert.ok(findPath({ x: 0, z: -30 }, { x: 0, z: -25 }, obstacles, options).length > 0);
});

test('Freight Annex background modules meet without overlap and every wave retains industrial atmosphere', () => {
  assert.ok(Object.values(FREIGHT_ANNEX.weatherByWave).every(mode => mode.includes('freight-')));
  const backdrops = FREIGHT_ANNEX.assets.filter(asset => asset.asset === 'freightbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    const previousRight = previous.position[0] + 14.5 * previous.scale / 2;
    const currentLeft = current.position[0] - 14.5 * current.scale / 2;
    assert.ok(previousRight <= currentLeft + 0.001);
  }
});

test('Freight Annex stages infection from Wave 23 and reserves the breach for Wave 25', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const weatherCalls = [];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    weather: { setMode: (...args) => weatherCalls.push(args) },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    onTransitionToLegacy: null
  });
  runtime.load(FREIGHT_ANNEX);

  const infection = runtime.group.getObjectByName('freight-infection-veins');
  const bossRing = runtime.group.getObjectByName('freight-boss-ring');
  const infectedProps = runtime.visualGroups.get('infectionDressing')[0];
  const nest = runtime.visualGroups.get('bossDressing')[0];
  const nestCollider = runtime.colliderObjects.find(object => object.userData.colliderId === 'boss-industrial-nest');
  const infectedPool = runtime.group.getObjectByName('freight-infection-props-pool');
  const nestPool = runtime.group.getObjectByName('freight-nest-pool');
  const breachPool = runtime.group.getObjectByName('freight-breach-pool');
  assert.equal(infection.visible, false);
  assert.equal(infectedProps.visible, false);
  assert.equal(nest.visible, false);
  assert.equal(nestCollider.userData.colliderActive, false);
  assert.equal(bossRing.visible, false);
  assert.equal(infectedPool.visible, false);
  assert.equal(nestPool.visible, false);
  assert.equal(breachPool.visible, false);

  runtime.onWaveStart(23);
  assert.equal(infection.visible, true);
  assert.equal(infectedProps.visible, true);
  assert.equal(nest.visible, false);
  assert.equal(nestCollider.userData.colliderActive, false);
  assert.equal(infectedPool.visible, true);
  assert.ok(runtime.group.getObjectByName('freight-infection-key').intensity > 0);
  assert.equal(nestPool.visible, false);
  assert.equal(breachPool.visible, false);

  runtime.onWaveStart(25);
  assert.equal(bossRing.visible, true);
  assert.equal(nest.visible, true);
  assert.equal(nestCollider.userData.colliderActive, true);
  assert.equal(nestPool.visible, true);
  assert.equal(breachPool.visible, true);
  assert.ok(runtime.group.getObjectByName('freight-nest-key').intensity > 0);
  assert.ok(runtime.group.getObjectByName('freight-breach-key').intensity > runtime.group.getObjectByName('freight-loading-key').intensity);
  assert.deepEqual(weatherCalls.at(-1), ['freight-boss-fog-wind', { immediate: false }]);

  runtime.onBossDefeated(25);
  assert.equal(infection.visible, false);
  assert.equal(infectedProps.visible, false);
  assert.equal(nest.visible, false);
  assert.equal(nestCollider.userData.colliderActive, false);
  assert.equal(infectedPool.visible, false);
  assert.equal(nestPool.visible, false);
  assert.equal(breachPool.visible, false);
});

test('Freight Annex uses modeled practical owners, diffused pools, and contact grounding', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    grassMesh: null,
    weather: null,
    clonePrefab: () => new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: .9 })
    ),
    cullGrass: null,
    onObjective: null,
    onWarning: null,
    onRefreshColliders: null,
    onTransitionToLegacy: null
  });
  runtime.load(FREIGHT_ANNEX);

  const loadingFixture = runtime.group.getObjectByName('freight-loading-fixture');
  const loadingKey = runtime.group.getObjectByName('freight-loading-key');
  const loadingPool = runtime.group.getObjectByName('freight-loading-pool');
  const hatchKey = runtime.group.getObjectByName('freight-floor-hatch-key');
  const ventFixture = runtime.group.getObjectByName('freight-rear-vent-fixture');
  assert.deepEqual(loadingFixture.position.toArray(), [0, 3.48, -25.92]);
  assert.equal(loadingFixture.userData.lightOwner, true);
  assert.equal(loadingKey.isPointLight, true);
  assert.equal(loadingKey.castShadow, false);
  assert.equal(loadingPool.material.isShaderMaterial, true);
  assert.deepEqual(hatchKey.position.toArray(), [-12, .34, 17.55]);
  assert.deepEqual(ventFixture.position.toArray(), [29.15, 2.82, -12]);
  assert.equal(runtime.group.getObjectByName('freight-static-contact-shadows').count, 20);
  assert.equal(runtime.enemyContactShadowMesh.name, 'freight-enemy-contact-shadows');
  assert.equal(runtime.enemyContactShadowMesh.material.isShaderMaterial, true);

  const originalHsl = { h: 0, s: 0, l: 0 };
  const liftedHsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(0x080a0c).getHSL(originalHsl);
  runtime.group.getObjectByName('relay:warehouse').material.color.getHSL(liftedHsl);
  assert.ok(liftedHsl.l > originalHsl.l);
});

test('Freight Annex enemy contact shadows follow threat-ring instances', () => {
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
  runtime.load(FREIGHT_ANNEX);
  const enemy = new THREE.Group();
  enemy.position.set(-3, 0, 5);
  enemy.userData.type = 'tank';
  runtime.attach({ enemyManager: { enemies: [enemy], setEncounterHooks() {} } });
  runtime.update(.016, null);
  assert.equal(runtime.enemyReadabilityMesh.count, 1);
  assert.equal(runtime.enemyContactShadowMesh.count, 1);
});

test('Freight Annex fog preserves local-light contrast through the boss takeover', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe8ff, 20, 160);
  const weather = new WeatherSystem({
    THREE,
    scene,
    skyMat: {
      uniforms: {
        top: { value: new THREE.Color(0xaee9ff) },
        bottom: { value: new THREE.Color(0xf1e3ff) },
        flashIntensity: { value: 0 },
        flashDir: { value: new THREE.Vector3(0, 1, 0) }
      }
    },
    hemi: new THREE.HemisphereLight(0xffffff, 0x4488aa, .9),
    dir: new THREE.DirectionalLight(0xffffff, .8),
    mats: { weather: { wetness: { value: 0 }, snow: { value: 0 } } }
  });

  try {
    weather.setMode('freight-haze-fog');
    assert.equal(weather._envTarget.fogNear, 18);
    assert.equal(weather._envTarget.fogFar, 118);
    assert.equal(weather._envTarget.hemiIntensity, .68);
    weather.setMode('freight-boss-fog-wind');
    assert.equal(weather._envTarget.fogNear, 13);
    assert.equal(weather._envTarget.fogFar, 90);
    assert.equal(weather._envTarget.dirIntensity, .72);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
