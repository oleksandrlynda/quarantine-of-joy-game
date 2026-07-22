import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { FLOODGATE_CONTINUITY, FLOODGATE_WATER_BY_WAVE } from '../src/levels/floodgate-continuity.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import { WeatherSystem } from '../src/weather.js';

function enemyStub(wave = 52) {
  return {
    combatVisibilityRange: Infinity,
    enemies: new Set(),
    alive: 0,
    wave,
    setEncounterHooks(hooks) { this.hooks = hooks; },
    queueAuthoredEnemies() {},
    tryAdvanceWave() {},
    isSpawnPointClear() { return true; },
    getPlayer() { return { position: new THREE.Vector3(0, 0, 10) }; }
  };
}

function runtimeHarness(options = {}) {
  const enemyManager = enemyStub(options.wave);
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    ...options
  });
  runtime.attach({ enemyManager });
  runtime.load(FLOODGATE_CONTINUITY);
  return { runtime, enemyManager };
}

test('Floodgate Continuity authors all 21 waves and three seven-wave chapters', () => {
  assert.deepEqual(Object.keys(FLOODGATE_CONTINUITY.waves).map(Number), Array.from({ length: 21 }, (_, index) => 52 + index));
  assert.deepEqual(FLOODGATE_CONTINUITY.size, [76, 66]);
  assert.equal(FLOODGATE_CONTINUITY.finalWave, 72);
  assert.deepEqual(FLOODGATE_CONTINUITY.checkpointStarts, { 59: 'spillway', 66: 'galleries' });
  assert.equal(FLOODGATE_CONTINUITY.waves[52].packages.flat().length, 52);
  assert.equal(FLOODGATE_CONTINUITY.waves[72].packages.flat().length, 63);
  assert.ok(Object.values(FLOODGATE_CONTINUITY.waves).every(wave => wave.activeCap >= 24 && wave.activeCap <= 29));
  assert.equal(Object.keys(FLOODGATE_WATER_BY_WAVE).length, 21);
  const waterStates = new Set(Object.values(FLOODGATE_WATER_BY_WAVE));
  assert.ok(['dry', 'low', 'medium', 'high'].every(state => waterStates.has(state)));
});

test('Floodgate has safe ground and air reinforcement pads and reconnecting routes', () => {
  const validation = validateLevelSpawnNetwork(FLOODGATE_CONTINUITY);
  assert.equal(validation.length, 18);
  assert.equal(validation.every(result => result.valid), true, validation.flatMap(result => result.errors).join('; '));
  assert.equal(FLOODGATE_CONTINUITY.entrances.filter(entrance => entrance.air).length, 6);
  assert.equal(FLOODGATE_CONTINUITY.entrances.filter(entrance => !entrance.air).length, 12);
  assert.equal(FLOODGATE_CONTINUITY.routes.filter(route => route.reconnect).length, 3);
  assert.equal(FLOODGATE_CONTINUITY.routes.filter(route => route.alwaysDry).length, 1);
});

test('Floodgate backdrop strips have no authored overlap', () => {
  const backdrops = FLOODGATE_CONTINUITY.assets.filter(asset => asset.asset === 'floodgatebackdrop').sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(backdrops.length, 3);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    assert.ok(previous.position[0] + 28 * previous.scale / 2 <= current.position[0] - 28 * current.scale / 2 + .001);
  }
});

test('medium and high water alter navigation while the current is readable and harmful', () => {
  const hazards = [];
  const { runtime } = runtimeHarness({ onPlayerHazard: hazard => hazards.push(hazard) });
  runtime.onWaveStart(60);
  assert.equal(runtime.floodgateState.water, 'medium');
  assert.equal(runtime.colliderObjects.find(collider => collider.userData.colliderTags?.includes('floodMediumLock')).userData.colliderActive, true);
  assert.equal(runtime.colliderObjects.find(collider => collider.userData.colliderTags?.includes('floodHighLock')).userData.colliderActive, false);
  runtime.onWaveStart(61);
  assert.equal(runtime.floodgateState.water, 'high');
  assert.equal(runtime.colliderObjects.find(collider => collider.userData.colliderTags?.includes('floodHighLock')).userData.colliderActive, true);
  const player = { position: new THREE.Vector3(0, 0, 10) };
  runtime.update(1.1, player);
  assert.ok(Math.abs(player.position.z - 10) > .1);
  assert.deepEqual(hazards.at(-1), { type: 'floodwater', damage: 6, waterState: 'high' });
});

test('Floodgate checkpoints fire once and resume at chapter starts', () => {
  const checkpoints = [];
  const { runtime } = runtimeHarness({ onCheckpoint: checkpoint => checkpoints.push(checkpoint) });
  runtime.onWaveStart(59);
  runtime.onWaveStart(59);
  runtime.onWaveStart(66);
  assert.deepEqual(checkpoints, [
    { levelId: 'floodgate-continuity', checkpointId: 'spillway', wave: 59, completedWave: 58 },
    { levelId: 'floodgate-continuity', checkpointId: 'galleries', wave: 66, completedWave: 65 }
  ]);
});

test('chapter gates and the Greywater finale are authored objectives', () => {
  const transitions = [];
  const { runtime, enemyManager } = runtimeHarness({ wave: 72, onTransitionToLegacy: result => transitions.push(result) });
  runtime.onWaveStart(58);
  assert.equal(runtime.objectiveState.kind, 'multi-capture');
  assert.equal(runtime.objectiveState.targets.length, 2);
  runtime.onWaveStart(65);
  assert.equal(runtime.objectiveState.kind, 'multi-capture');
  assert.equal(runtime.objectiveState.targets.length, 3);
  runtime.onWaveStart(71);
  assert.equal(runtime.objectiveState.kind, 'multi-capture');
  assert.equal(runtime.objectiveState.targets.length, 3);
  runtime.onWaveStart(72);
  assert.equal(runtime.objectiveState.kind, 'hold');
  runtime.objectiveState.complete = true;
  assert.equal(enemyManager.hooks.canCompleteWave(72), false);
  assert.equal(runtime.objectiveState.kind, 'liberation');
  runtime.update(4.1, { position: new THREE.Vector3(0, 0, 0) });
  assert.deepEqual(transitions, [{ greywaterComplete: true }]);
});

test('Floodgate P0 lighting is source-owned, diffused, grounded, and bounded', () => {
  const { runtime } = runtimeHarness();
  const localLights = [];
  runtime.group.traverse(object => {
    if (object.isPointLight || object.isSpotLight) localLights.push(object);
  });
  assert.equal(localLights.length, 7, 'two mast keys, gate status, three seeds, and the Greywater core');
  assert.equal(localLights.filter(light => light.visible && light.intensity > 0).length, 3);
  assert.ok(localLights.every(light => light.castShadow === false));

  assert.deepEqual(runtime.group.getObjectByName('floodgate-mast-key-1').position.toArray(), [-33.762, 4.02, -17.957]);
  assert.deepEqual(runtime.group.getObjectByName('floodgate-mast-key-2').position.toArray(), [33.762, 4.02, -18.043]);
  assert.deepEqual(runtime.group.getObjectByName('floodgate-gate-status-key').position.toArray(), [0, 5.174, -26.115]);
  assert.deepEqual(runtime.group.getObjectByName('floodgate-greywater-core-key').position.toArray(), [0, 4.568, -18]);
  for (let index = 1; index <= 3; index += 1) {
    const x = [-14, 0, 14][index - 1];
    assert.deepEqual(runtime.group.getObjectByName(`floodgate-seed-key-${index}`).position.toArray(), [x, 2.61, 8]);
    const routeGlows = runtime.group.getObjectByName(`floodgate-route-glows-${index}`);
    assert.equal(routeGlows.count, 5);
    assert.equal(routeGlows.material.isShaderMaterial, true);
  }

  const diffusePools = [
    'floodgate-mast-pool-1', 'floodgate-mast-pool-2', 'floodgate-gate-pool',
    'floodgate-handshake-pool-1', 'floodgate-pump-pool-2', 'floodgate-seed-pool-3',
    'floodgate-core-pool'
  ].map(name => runtime.group.getObjectByName(name));
  assert.ok(diffusePools.every(pool => pool?.material?.isShaderMaterial));
  assert.ok(diffusePools.every(pool => pool.material.uniforms.uOpacity));
  const staticContacts = runtime.group.getObjectByName('floodgate-static-contact-shadows');
  assert.equal(staticContacts.count, 17);
  assert.equal(staticContacts.material.isShaderMaterial, true);
  assert.equal(runtime.group.getObjectByName('floodgate-enemy-contact-shadows').material.isShaderMaterial, true);
});

test('Floodgate light hierarchy previews water and follows objectives through Wave 72', () => {
  const { runtime } = runtimeHarness();
  const activeLights = () => {
    const lights = [];
    runtime.group.traverse(object => {
      if ((object.isPointLight || object.isSpotLight) && object.visible && object.intensity > 0) lights.push(object);
    });
    return lights;
  };
  const gateKey = runtime.group.getObjectByName('floodgate-gate-status-key');
  const coreKey = runtime.group.getObjectByName('floodgate-greywater-core-key');
  const seedKeys = [1, 2, 3].map(index => runtime.group.getObjectByName(`floodgate-seed-key-${index}`));

  runtime.onWaveStart(60);
  assert.equal(gateKey.color.getHex(), 0xff8268, 'Wave 60 previews Wave 61 high water');
  assert.equal(runtime.group.getObjectByName('floodgate-route-glows-1').material.uniforms.uOpacity.value, .07);
  assert.equal(runtime.group.getObjectByName('floodgate-route-glows-2').material.uniforms.uOpacity.value, .045);

  runtime.onWaveStart(65);
  assert.equal(gateKey.color.getHex(), 0x68ddd9, 'Wave 65 previews the low-water vault entry');
  assert.equal(runtime.group.getObjectByName('floodgate-pump-pool-2').material.uniforms.uOpacity.value, .15);

  runtime.onWaveStart(66);
  assert.ok(seedKeys.every(key => key.visible && key.intensity > 0));
  assert.equal(coreKey.visible, false);
  assert.equal(activeLights().length, 6);
  const stableBase = seedKeys[0].userData.baseIntensity;
  for (let index = 0; index < 240; index += 1) runtime.update(1 / 60, { position: new THREE.Vector3(-22, 0, 20) });
  assert.ok(Math.abs(seedKeys[0].intensity - stableBase) < stableBase * .03, 'seed pulse must not accumulate intensity drift');

  runtime.onWaveStart(71);
  runtime.objectiveState.activeTargetKey = runtime.objectiveState.targets[0].nameKey;
  runtime._updateFloodgateObjectiveVisuals();
  assert.equal(seedKeys[0].color.getHex(), 0xff8a72);
  assert.ok(seedKeys[0].intensity > seedKeys[1].intensity);

  runtime.onWaveStart(72);
  assert.ok(seedKeys.every(key => key.visible === false));
  assert.equal(coreKey.visible, true);
  assert.equal(coreKey.intensity, 4.45);
  assert.equal(activeLights().length, 4);
  assert.ok(
    runtime.group.getObjectByName('floodgate-route-glows-1').material.uniforms.uOpacity.value
      > runtime.group.getObjectByName('floodgate-route-glows-2').material.uniforms.uOpacity.value,
    'high water emphasizes the always-dry west route'
  );

  runtime._beginEnduranceCompletion();
  assert.equal(coreKey.color.getHex(), 0xc7ffd9);
  assert.equal(coreKey.visible, true);
  assert.equal(activeLights().length, 4);
});

test('Floodgate weather preserves visibility distance without bleaching the vault horizon', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x708082, 18, 110);
  const skyMat = { uniforms: { top: { value: new THREE.Color(0x3d5259) }, bottom: { value: new THREE.Color(0x87928a) } } };
  const hemi = new THREE.HemisphereLight(0xffffff, 0x263435, .72);
  const dir = new THREE.DirectionalLight(0xffffff, .86);
  const weather = new WeatherSystem({
    THREE,
    scene,
    skyMat,
    hemi,
    dir,
    mats: { weather: { wetness: { value: 0 }, snow: { value: 0 } } }
  });
  const modes = [
    ['floodgate-spillway-rain', 18, 110],
    ['floodgate-gallery-fog', 15, 94],
    ['floodgate-vault-fog', 12, 78],
    ['floodgate-deluge-rain+fog', 8, 58]
  ];
  const fogLightness = [];
  try {
    for (const [mode, near, far] of modes) {
      weather.setMode(mode, { immediate: true });
      assert.equal(scene.fog.near, near);
      assert.equal(scene.fog.far, far);
      const hsl = { h: 0, s: 0, l: 0 };
      scene.fog.color.getHSL(hsl);
      fogLightness.push(hsl.l);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  assert.ok(fogLightness[2] < fogLightness[0], 'vault fog should be darker than the exterior rain horizon');
  assert.ok(fogLightness[3] < fogLightness[2], 'the finale closes visibility without producing a white fog wall');
  assert.ok(hemi.intensity <= .5 && dir.intensity <= .62);
});

test('campaign routing, persistence, preview range, and post-campaign loadout integrate Level 10', async () => {
  const [main, weapons] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/weapons/system.js', import.meta.url), 'utf8')
  ]);
  assert.match(main, /if \(wave >= 52\) return FLOODGATE_CONTINUITY/);
  assert.match(main, /Math\.max\(1, Math\.min\(73, requestedRelayPreviewWave\)\)/);
  assert.match(main, /bs3d_floodgate_checkpoint/);
  assert.match(main, /bs3d_greywater_complete/);
  assert.match(weapons, /setPostCampaignLoadout\(\)/);
  const checkpointLoadout = weapons.slice(weapons.indexOf('setPostCampaignLoadout()'));
  assert.match(checkpointLoadout, /isWeaponOwned\?\.\('rifle'\)[\s\S]*new Rifle[\s\S]*new SMG[\s\S]*new Pistol/);
});
