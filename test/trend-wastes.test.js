import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import { WeatherSystem } from '../src/weather.js';

test('Trend Wastes owns Waves 16-20 and meets the Shard arena requirement', () => {
  assert.deepEqual(Object.keys(TREND_WASTES.waves).map(Number), [16, 17, 18, 19, 20]);
  assert.equal(TREND_WASTES.bossWave, 20);
  assert.equal(TREND_WASTES.waves[20].boss, 'shard');
  assert.ok(TREND_WASTES.bossArenaBounds.maxX - TREND_WASTES.bossArenaBounds.minX >= 54);
  assert.ok(TREND_WASTES.bossArenaBounds.maxZ - TREND_WASTES.bossArenaBounds.minZ >= 54);
});

test('Trend Wastes keeps three wind lanes, sheltered crossings, and an open Shard core', () => {
  assert.equal(TREND_WASTES.routes.filter(route => route.id.includes('wind-lane') || route.id === 'storm-eye-road').length, 3);
  assert.equal(TREND_WASTES.routes.filter(route => route.sheltered).length, 2);
  const zone = TREND_WASTES.bossClearZone;
  for (const collider of TREND_WASTES.colliders.filter(item => !item.id.includes('boundary'))) {
    if (!collider.position) continue;
    const [x, , z] = collider.position;
    assert.ok(Math.hypot(x - zone.center[0], z - zone.center[1]) >= zone.radius, collider.id);
  }
});

test('Trend Wastes entrances have valid contracts and static clearance', () => {
  const results = validateLevelSpawnNetwork(TREND_WASTES);
  assert.equal(results.length, 6);
  assert.deepEqual(results.filter(result => !result.valid).map(result => ({ id: result.entrance.id, errors: result.errors })), []);
});

test('Trend Wastes keeps sand active and spaces horizon modules without overlap', () => {
  assert.ok(Object.values(TREND_WASTES.weatherByWave).every(mode => mode.includes('sand')));
  const backdrops = TREND_WASTES.assets.filter(asset => asset.asset === 'wastesbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(backdrops.length, 3);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    const requiredSeparation = 7 * previous.scale + 7 * current.scale;
    assert.ok(current.position[0] - previous.position[0] >= requiredSeparation);
  }
  assert.equal(TREND_WASTES.assets.filter(asset => asset.asset === 'wastesterrainkit').length, 1);
  assert.equal(TREND_WASTES.assets.filter(asset => asset.asset === 'windbreaks').length, 4);
  assert.equal(TREND_WASTES.walkableSurfaces.length, 3);
  assert.deepEqual([16, 17, 18, 19].map(wave => TREND_WASTES.waves[wave].packages.flat().length), [20, 23, 26, 29]);
  assert.deepEqual([16, 17, 18, 19].map(wave => TREND_WASTES.waves[wave].activeCap), [13, 13, 14, 14]);
});

test('Trend Wastes anchors practical lights to modeled emitters and grounds the storm arena', () => {
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
  runtime.load(TREND_WASTES);

  const stormKey = runtime.group.getObjectByName('wastes-storm-eye-key');
  const stormSignal = runtime.group.getObjectByName('wastes-storm-eye-signal');
  const mastBeam = runtime.group.getObjectByName('wastes-lightmast-beam');
  const captureKey = runtime.group.getObjectByName('wastes-capture-beacon-key');
  assert.deepEqual(stormKey.position.toArray(), [0, 5.18 * 1.25, -22]);
  assert.equal(stormSignal.position.y - stormSignal.geometry.parameters.height / 2, stormKey.position.y);
  assert.ok(mastBeam.material.isShaderMaterial);
  assert.deepEqual(captureKey.position.toArray(), [24, 3.55 * 1.02, 1]);
  assert.equal(runtime.group.getObjectByName('wastes-static-contact-shadows').count, 18);
  assert.equal(runtime.enemyContactShadowMesh.name, 'wastes-enemy-contact-shadows');

  const originalHsl = { h: 0, s: 0, l: 0 };
  const liftedHsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(0x080a0c).getHSL(originalHsl);
  runtime.group.getObjectByName('relay:checkpoint').material.color.getHSL(liftedHsl);
  assert.ok(liftedHsl.l > originalHsl.l);

  runtime.onWaveStart(19);
  assert.equal(stormKey.userData.baseIntensity, 5);
  assert.equal(runtime.group.getObjectByName('wastes-shard-court-pool').visible, false);
  runtime.onWaveStart(20);
  assert.equal(runtime.group.getObjectByName('wastes-shard-court-pool').visible, true);
  assert.equal(runtime.group.getObjectByName('wastes-shard-court-key').intensity, 3.6);
  assert.equal(stormKey.color.getHex(), 0xffbe70);
});

test('Trend Wastes enemy contact shadows follow readability instances', () => {
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
  runtime.load(TREND_WASTES);
  const enemy = new THREE.Group();
  enemy.position.set(-3, 0, 5);
  enemy.userData.type = 'tank';
  runtime.attach({ enemyManager: { enemies: [enemy], setEncounterHooks() {} } });
  runtime.update(.016, null);
  assert.equal(runtime.enemyReadabilityMesh.count, 1);
  assert.equal(runtime.enemyContactShadowMesh.count, 1);
});

test('Trend Wastes sand remains atmospheric without flattening the near camera', () => {
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
    weather.setMode('wastes-wind-sand');
    assert.equal(weather._mixTarget.sand, .74);
    assert.equal(weather._envTarget.fogFar, 104);
    weather.setMode('wastes-crosswind-sand');
    assert.equal(weather._mixTarget.sand, .82);
    weather.setMode('wastes-sandstorm-wind');
    assert.equal(weather._mixTarget.sand, .92);
    assert.equal(weather._envTarget.fogFar, 82);
    weather.setMode('wastes-boss-sand-wind');
    assert.equal(weather._mixTarget.sand, .84);
    assert.equal(weather._envTarget.fogFar, 84);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
