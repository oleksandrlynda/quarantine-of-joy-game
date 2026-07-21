import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';

test('Sandstorm Expanse owns Waves 42-51 as a larger endurance arena', () => {
  assert.deepEqual(Object.keys(SANDSTORM_EXPANSE.waves).map(Number), [42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
  assert.deepEqual(SANDSTORM_EXPANSE.size, [72, 60]);
  assert.equal(SANDSTORM_EXPANSE.finalWave, 51);
  assert.equal(SANDSTORM_EXPANSE.waves[42].packages.flat().length, 55);
  assert.equal(SANDSTORM_EXPANSE.waves[51].packages.flat().length, 80);
  assert.ok(Object.values(SANDSTORM_EXPANSE.waves).every(wave => wave.activeCap <= 26));
  assert.ok(Object.values(SANDSTORM_EXPANSE.stormByWave).every(storm => storm.normal >= 18 && storm.normal <= 24));
  assert.ok(Object.values(SANDSTORM_EXPANSE.stormByWave).every(storm => storm.heavy >= 12 && storm.heavy <= 16));
});

test('Expanse has three routes, sheltered loops, and dedicated ground and air reinforcement pads', () => {
  const validation = validateLevelSpawnNetwork(SANDSTORM_EXPANSE);
  assert.equal(validation.length, 15);
  assert.equal(validation.every(result => result.valid), true, validation.flatMap(result => result.errors).join('; '));
  assert.equal(SANDSTORM_EXPANSE.routes.filter(route => route.id.includes('beacon-route') || route.id === 'siren-route').length, 3);
  assert.ok(SANDSTORM_EXPANSE.routes.filter(route => route.shelter).length >= 2);
  assert.ok(SANDSTORM_EXPANSE.entrances.filter(entrance => entrance.air).length >= 5);
  assert.ok(SANDSTORM_EXPANSE.entrances.filter(entrance => !entrance.air).length >= 10);
  assert.ok(SANDSTORM_EXPANSE.entrances.some(entrance => entrance.air && entrance.allow.includes('warden')));
});

test('Expanse background strips do not overlap at authored scale', () => {
  const backdrops = SANDSTORM_EXPANSE.assets.filter(asset => asset.asset === 'sandstormbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(backdrops.length, 3);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    assert.ok(previous.position[0] + 28 * previous.scale / 2 <= current.position[0] - 28 * current.scale / 2 + .001);
  }
});

test('Expanse runtime cycles heavy gust visibility and uses air pads for flyers', () => {
  const weatherCalls = [];
  const enemyManager = {
    combatVisibilityRange: Infinity,
    enemies: new Set(),
    setEncounterHooks(hooks) { this.hooks = hooks; },
    queueAuthoredEnemies() {},
    tryAdvanceWave() {},
    isSpawnPointClear() { return true; },
    getPlayer() { return { position: new THREE.Vector3(0, 0, 0) }; }
  };
  const runtime = new LevelRuntime({
    THREE, scene: new THREE.Scene(), objects: [],
    weather: { setMode: (...args) => weatherCalls.push(args) },
    clonePrefab: () => new THREE.Group(), cullGrass: () => {}, onRefreshColliders: () => {}
  });
  runtime.attach({ enemyManager });
  runtime.load(SANDSTORM_EXPANSE);
  runtime.onWaveStart(50);
  assert.equal(enemyManager.combatVisibilityRange, 12);
  assert.equal(weatherCalls.at(-1)[0], 'expanse-heavy-sand-wind');
  const flyerCandidates = runtime._spawnCandidates(50, 'flyer');
  const shooterCandidates = runtime._spawnCandidates(50, 'shooter');
  assert.ok(flyerCandidates.length >= 5);
  assert.ok(flyerCandidates.every(candidate => candidate.position.y === 8));
  assert.ok(shooterCandidates.length >= 10);
  assert.ok(shooterCandidates.every(candidate => candidate.position.y < 2));
  runtime.update(10.1, { position: new THREE.Vector3(0, 0, 0) });
  assert.equal(enemyManager.combatVisibilityRange, 19);
  assert.equal(weatherCalls.at(-1)[0], 'expanse-sand-wind');
});

test('Supply Break, Beacon Failure, and Last Horizon completion are authored objectives', () => {
  const transitions = [];
  const enemyManager = {
    combatVisibilityRange: Infinity, enemies: new Set(), alive: 0, wave: 51,
    setEncounterHooks(hooks) { this.hooks = hooks; }, queueAuthoredEnemies() {}, tryAdvanceWave() {}, isSpawnPointClear() { return true; }
  };
  const runtime = new LevelRuntime({
    THREE, scene: new THREE.Scene(), objects: [], weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(), cullGrass: () => {}, onRefreshColliders: () => {},
    onTransitionToLegacy: result => transitions.push(result)
  });
  runtime.attach({ enemyManager });
  runtime.load(SANDSTORM_EXPANSE);
  runtime.onWaveStart(46);
  assert.equal(runtime.objectiveState.kind, 'hold');
  runtime.onWaveStart(49);
  assert.equal(runtime.objectiveState.kind, 'multi-capture');
  assert.equal(runtime.objectiveState.targets.length, 2);
  runtime.onWaveStart(51);
  runtime.reinforcementState.nextPackage = SANDSTORM_EXPANSE.waves[51].packages.length;
  assert.equal(enemyManager.hooks.canCompleteWave(51), false);
  assert.equal(runtime.objectiveState.kind, 'liberation');
  runtime.update(4.1, { position: new THREE.Vector3(0, 0, 0) });
  assert.deepEqual(transitions, [{ enduranceComplete: true }]);
});

test('Expanse P0 lighting is source-owned, diffused, grounded, and bounded', () => {
  const runtime = new LevelRuntime({
    THREE, scene: new THREE.Scene(), objects: [], weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(), cullGrass: () => {}, onRefreshColliders: () => {}
  });
  runtime.load(SANDSTORM_EXPANSE);

  const localLights = [];
  runtime.group.traverse(object => {
    if (object.isPointLight || object.isSpotLight) localLights.push(object);
  });
  assert.equal(localLights.length, 7, 'three beacons, siren, two masts, and completion monument');
  assert.equal(localLights.filter(light => light.visible && light.intensity > 0).length, 6);
  assert.ok(localLights.every(light => light.castShadow === false));

  const authoredBeacons = SANDSTORM_EXPANSE.assets.filter(asset => asset.asset === 'stormbeacon');
  for (let index = 1; index <= 3; index += 1) {
    const key = runtime.group.getObjectByName(`expanse-beacon-key-${index}`);
    assert.equal(key.position.y, 4.77);
    assert.ok(Math.abs(key.position.x - authoredBeacons[index - 1].position[0]) < .001);
    assert.ok(Math.abs(key.position.z - authoredBeacons[index - 1].position[2]) < .001);
    const glows = runtime.group.getObjectByName(`expanse-route-pylon-glows-${index}`);
    assert.equal(glows.count, 5);
    assert.equal(glows.material.isShaderMaterial, true);
  }
  assert.deepEqual(runtime.group.getObjectByName('expanse-storm-siren-key').position.toArray(), [0, 8.4, -20.5]);
  assert.deepEqual(runtime.group.getObjectByName('expanse-endurance-monument-key').position.toArray(), [0, 4.61, 20.5]);

  const authoredMasts = SANDSTORM_EXPANSE.assets.filter(asset => asset.asset === 'lightmast');
  const expectedMastSources = [[-33.77, 3.88, 14.04], [33.77, 3.88, 13.96]];
  for (let index = 1; index <= 2; index += 1) {
    const key = runtime.group.getObjectByName(`expanse-mast-key-${index}`);
    assert.deepEqual(key.position.toArray(), expectedMastSources[index - 1]);
    assert.ok(Math.abs(key.position.x - authoredMasts[index - 1].position[0]) < .25);
    assert.ok(key.target.parent === runtime.group);
  }

  const diffusePools = [
    'expanse-beacon-pool-1', 'expanse-beacon-pool-2', 'expanse-beacon-pool-3',
    'expanse-siren-pool', 'expanse-mast-pool-1', 'expanse-mast-pool-2',
    'expanse-supply-hold-pool', 'expanse-failure-pool-1', 'expanse-failure-pool-2',
    'expanse-monument-pool'
  ].map(name => runtime.group.getObjectByName(name));
  assert.ok(diffusePools.every(pool => pool?.material?.isShaderMaterial));
  assert.ok(diffusePools.every(pool => pool.material.uniforms.uOpacity));

  const staticContacts = runtime.group.getObjectByName('expanse-static-contact-shadows');
  const enemyContacts = runtime.group.getObjectByName('expanse-enemy-contact-shadows');
  assert.equal(staticContacts.count, 22);
  assert.equal(staticContacts.material.isShaderMaterial, true);
  assert.equal(enemyContacts.material.isShaderMaterial, true);
});

test('Expanse lighting follows heavy gust selection, objectives, and completion', () => {
  const enemyManager = {
    combatVisibilityRange: Infinity,
    enemies: new Set(),
    setEncounterHooks() {},
    queueAuthoredEnemies() {},
    tryAdvanceWave() {},
    isSpawnPointClear() { return true; }
  };
  const weatherCalls = [];
  const runtime = new LevelRuntime({
    THREE, scene: new THREE.Scene(), objects: [],
    weather: { setMode: (...args) => weatherCalls.push(args) },
    clonePrefab: () => new THREE.Group(), cullGrass: () => {}, onRefreshColliders: () => {}
  });
  runtime.attach({ enemyManager });
  runtime.load(SANDSTORM_EXPANSE);

  const beaconKeys = [1, 2, 3].map(index => runtime.group.getObjectByName(`expanse-beacon-key-${index}`));
  const routeColors = beaconKeys.map(key => key.color.getHex());
  const sirenKey = runtime.group.getObjectByName('expanse-storm-siren-key');
  runtime.onWaveStart(50);
  assert.equal(runtime.expanseStormState.heavy, true);
  assert.equal(runtime.expanseStormState.route, 1);
  assert.ok(beaconKeys[1].intensity > beaconKeys[0].intensity);
  assert.ok(beaconKeys[1].intensity > beaconKeys[2].intensity);
  const heavySirenIntensity = sirenKey.userData.baseIntensity;

  runtime.update(10.1, { position: new THREE.Vector3() });
  assert.equal(runtime.expanseStormState.heavy, false);
  assert.ok(sirenKey.userData.baseIntensity < heavySirenIntensity);
  for (let index = 0; index < 40; index += 1) runtime.update(.05, { position: new THREE.Vector3() });
  assert.ok(sirenKey.intensity <= sirenKey.userData.baseIntensity * 1.06);
  assert.deepEqual(beaconKeys.map(key => key.color.getHex()), routeColors);

  runtime.onWaveStart(46);
  assert.equal(runtime.group.getObjectByName('expanse-supply-hold-pool').visible, true);
  assert.equal(runtime.group.getObjectByName('expanse-failure-pool-1').visible, false);
  runtime.onWaveStart(49);
  assert.equal(runtime.group.getObjectByName('expanse-supply-hold-pool').visible, false);
  assert.equal(runtime.group.getObjectByName('expanse-failure-pool-1').visible, true);
  assert.equal(runtime.group.getObjectByName('expanse-failure-pool-2').visible, true);

  runtime._beginEnduranceCompletion();
  const monumentKey = runtime.group.getObjectByName('expanse-endurance-monument-key');
  assert.equal(monumentKey.visible, true);
  assert.equal(sirenKey.visible, false);
  assert.equal(runtime.group.getObjectByName('expanse-monument-pool').visible, true);
  const activeCompletionLights = [];
  runtime.group.traverse(object => {
    if ((object.isPointLight || object.isSpotLight) && object.visible && object.intensity > 0) activeCompletionLights.push(object);
  });
  assert.equal(activeCompletionLights.length, 6);
  assert.equal(weatherCalls.at(-1)[0], 'expanse-cleared-sand-wind');
});

test('campaign routing and ranged fairness integrate the Expanse', async () => {
  const [main, manager, shooter, sniper] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/enemies/manager.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/enemies/shooter.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/enemies/sniper.js', import.meta.url), 'utf8')
  ]);
  assert.match(main, /if \(wave >= 42\) return SANDSTORM_EXPANSE/);
  assert.match(main, /'server-cathedral': LAST_ORDER_BASE/);
  assert.match(main, /(?:relayLevel\.load|loadLiveCampaignLevel)\(SANDSTORM_EXPANSE\)/);
  assert.match(main, /bs3d_sandstorm_complete/);
  assert.match(manager, /ctx\.combatVisibilityRange = this\.combatVisibilityRange/);
  assert.match(shooter, /closing_through_storm/);
  assert.match(sniper, /closing_through_storm/);
});
