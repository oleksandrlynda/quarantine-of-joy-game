import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';

test('Content Court owns Waves 31-35 and reserves the full Adjudicator arena', () => {
  assert.deepEqual(Object.keys(CONTENT_COURT.waves).map(Number), [31, 32, 33, 34, 35]);
  assert.equal(CONTENT_COURT.bossWave, 35);
  assert.equal(CONTENT_COURT.waves[35].boss, 'adjudicator');
  assert.ok(CONTENT_COURT.bossArenaBounds.maxX - CONTENT_COURT.bossArenaBounds.minX >= 46);
  assert.ok(CONTENT_COURT.bossArenaBounds.maxZ - CONTENT_COURT.bossArenaBounds.minZ >= 42);
  assert.ok(CONTENT_COURT.bossClearZone.radius >= 14);
});

test('Content Court spawn network covers every side and the gallery air route', () => {
  const results = validateLevelSpawnNetwork(CONTENT_COURT);
  assert.equal(results.length, 9);
  assert.equal(results.every(result => result.valid), true, results.flatMap(result => result.errors).join('; '));
  assert.ok(CONTENT_COURT.entrances.some(entrance => entrance.air && entrance.allow.includes('flyer')));
  for (const prefix of ['north', 'south', 'west', 'east']) {
    assert.ok(CONTENT_COURT.entrances.some(entrance => entrance.id.startsWith(prefix)), prefix);
  }
});

test('Content Court keeps every permanent obstacle outside the Citation mine court', () => {
  const zone = CONTENT_COURT.bossClearZone;
  for (const collider of CONTENT_COURT.colliders.filter(item => !item.id.includes('boundary'))) {
    const [x, , z] = collider.position;
    const [width, , depth] = collider.size;
    const nearestX = Math.max(x - width / 2, Math.min(zone.center[0], x + width / 2));
    const nearestZ = Math.max(z - depth / 2, Math.min(zone.center[1], z + depth / 2));
    assert.ok(Math.hypot(nearestX - zone.center[0], nearestZ - zone.center[1]) >= zone.radius, collider.id);
  }
});

test('Content Court exposes three eight-metre radial routes and a complete appeal loop', () => {
  const radial = CONTENT_COURT.routes.filter(route => route.id.endsWith('aisle'));
  assert.equal(radial.length, 3);
  assert.ok(radial.every(route => route.clearance >= 8));
  assert.ok(CONTENT_COURT.routes.some(route => route.id === 'appeal-loop' && route.clearance >= 7));
  assert.ok(Object.values(CONTENT_COURT.weatherByWave).every(mode => mode.startsWith('court-')));
});

test('Content Court backdrop modules remain separated at authored scale', () => {
  const backdrops = CONTENT_COURT.assets.filter(asset => asset.asset === 'courtbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(backdrops.length, 3);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    const previousRight = previous.position[0] + 13.5 * previous.scale / 2;
    const currentLeft = current.position[0] - 13.5 * current.scale / 2;
    assert.ok(previousRight <= currentLeft + 0.001);
  }
});

test('Content Court progressively arms its strike grid and boss ring', () => {
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
  runtime.load(CONTENT_COURT);

  const strikeGrid = runtime.group.getObjectByName('court-strike-grid');
  const bossRing = runtime.group.getObjectByName('court-boss-ring');
  const chamber = runtime.group.getObjectByName('court-chamber-floor');
  const boundaries = runtime.group.getObjectByName('court-visible-boundaries');
  const authoredNodes = CONTENT_COURT.assets.filter(asset => asset.asset === 'purgenode');
  const purgeMarkers = [1, 2, 3].map(index => runtime.group.getObjectByName(`court-purge-node-ring-${index}`));
  assert.equal(strikeGrid.visible, false);
  assert.equal(bossRing.visible, false);
  assert.ok(chamber);
  assert.equal(boundaries.count, 4);
  purgeMarkers.forEach((marker, index) => {
    assert.ok(Math.abs(marker.position.x - authoredNodes[index].position[0]) < .01);
    assert.ok(Math.abs(marker.position.z - authoredNodes[index].position[2]) < .01);
  });

  runtime.onWaveStart(33);
  assert.equal(strikeGrid.visible, true);
  assert.equal(bossRing.visible, false);

  runtime.onWaveStart(35);
  assert.equal(bossRing.visible, true);
  assert.deepEqual(weatherCalls.at(-1), ['court-boss-fog-wind', { immediate: false }]);

  runtime.onBossDefeated(35);
  assert.equal(strikeGrid.visible, false);
  assert.equal(bossRing.visible, true);
  assert.deepEqual(weatherCalls.at(-1), ['court-liberated-fog']);
});

test('Content Court P0 lighting is source-owned, diffused, grounded, and budgeted', () => {
  const scene = new THREE.Scene();
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects: [],
    weather: { setMode: () => {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    onTransitionToLegacy: null
  });
  runtime.load(CONTENT_COURT);

  const localLights = [];
  runtime.group.traverse(object => {
    if (object.isPointLight || object.isSpotLight) localLights.push(object);
  });
  assert.equal(localLights.length, 4, 'one dais key plus three Purge Node keys');
  assert.ok(localLights.every(light => light.castShadow === false));

  const daisKey = runtime.group.getObjectByName('court-verdict-lectern-key');
  assert.deepEqual(daisKey.position.toArray(), [0, 2.05, .2]);
  const nodeKeys = [1, 2, 3].map(index => runtime.group.getObjectByName(`court-purge-node-key-${index}`));
  const authoredNodes = CONTENT_COURT.assets.filter(asset => asset.asset === 'purgenode');
  nodeKeys.forEach((key, index) => {
    assert.equal(key.position.y, 1.48);
    assert.ok(Math.abs(key.position.x - authoredNodes[index].position[0]) < .001);
    assert.ok(Math.abs(key.position.z - authoredNodes[index].position[2]) < .001);
  });

  const diffusePools = [
    'court-dais-pool',
    'court-purge-node-pool-1', 'court-purge-node-pool-2', 'court-purge-node-pool-3',
    'court-entry-pool-west', 'court-entry-pool-east', 'court-strike-rim-pool'
  ].map(name => runtime.group.getObjectByName(name));
  assert.ok(diffusePools.every(pool => pool?.material?.isShaderMaterial));
  assert.ok(diffusePools.every(pool => pool.material.uniforms.uOpacity));

  const staticContacts = runtime.group.getObjectByName('court-static-contact-shadows');
  const enemyContacts = runtime.group.getObjectByName('court-enemy-contact-shadows');
  assert.equal(staticContacts.count, 18);
  assert.equal(staticContacts.material.isShaderMaterial, true);
  assert.equal(enemyContacts.material.isShaderMaterial, true);
});

test('Content Court keeps sector colors stable while boss pressure increases the dais and floor rim', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode: () => {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    onTransitionToLegacy: null
  });
  runtime.load(CONTENT_COURT);

  const daisKey = runtime.group.getObjectByName('court-verdict-lectern-key');
  const strikePool = runtime.group.getObjectByName('court-strike-rim-pool');
  const nodeKeys = [1, 2, 3].map(index => runtime.group.getObjectByName(`court-purge-node-key-${index}`));
  const sectorColors = nodeKeys.map(key => key.color.getHex());
  const wave31Intensity = daisKey.intensity;
  assert.equal(strikePool.visible, false);

  runtime.onWaveStart(35);
  assert.ok(daisKey.intensity > wave31Intensity);
  assert.equal(strikePool.visible, true);
  assert.ok(strikePool.material.uniforms.uOpacity.value >= .1);
  assert.deepEqual(nodeKeys.map(key => key.color.getHex()), sectorColors);

  runtime.onBossDefeated(35);
  assert.equal(strikePool.visible, false);
  assert.ok(daisKey.intensity < wave31Intensity);
  assert.deepEqual(nodeKeys.map(key => key.color.getHex()), sectorColors);
});

test('campaign routing includes the Mirror Garden to Content Court handoff', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(wave >= 31\) return CONTENT_COURT/);
  assert.match(main, /'mirror-garden': CONTENT_COURT/);
  assert.match(main, /Math\.min\(73, requestedRelayPreviewWave\)/);
});
