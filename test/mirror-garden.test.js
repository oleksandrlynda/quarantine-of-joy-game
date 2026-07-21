import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';

test('Mirror Garden owns Waves 26-30 and reserves a full Hydraclone arena', () => {
  assert.deepEqual(Object.keys(MIRROR_GARDEN.waves).map(Number), [26, 27, 28, 29, 30]);
  assert.equal(MIRROR_GARDEN.bossWave, 30);
  assert.equal(MIRROR_GARDEN.waves[30].boss, 'hydraclone');
  assert.ok(MIRROR_GARDEN.bossArenaBounds.maxX - MIRROR_GARDEN.bossArenaBounds.minX >= 64);
  assert.ok(MIRROR_GARDEN.bossArenaBounds.maxZ - MIRROR_GARDEN.bossArenaBounds.minZ >= 64);
  assert.ok(MIRROR_GARDEN.bossClearZone.radius >= 16);
});

test('Mirror Garden spawn network exposes every side plus an aerial echo route', () => {
  const results = validateLevelSpawnNetwork(MIRROR_GARDEN);
  assert.equal(results.length, 8);
  assert.equal(results.every(result => result.valid), true, results.flatMap(result => result.errors).join('; '));
  assert.ok(MIRROR_GARDEN.entrances.some(entrance => entrance.air && entrance.allow.includes('flyer')));
  assert.ok(MIRROR_GARDEN.entrances.some(entrance => entrance.id === 'north-pavilion'));
  assert.ok(MIRROR_GARDEN.entrances.some(entrance => entrance.id === 'west-garden-gate'));
  assert.ok(MIRROR_GARDEN.entrances.some(entrance => entrance.id === 'east-garden-gate'));
  const westGate = MIRROR_GARDEN.entrances.find(entrance => entrance.id === 'west-garden-gate');
  const westTree = MIRROR_GARDEN.assets.find(asset => asset.asset === 'streettree' && asset.position[0] < -20);
  assert.ok(Math.hypot(westGate.position[0] - westTree.position[0], westGate.position[2] - westTree.position[2]) > 8,
    'west gate must not spawn enemies inside the street tree');
});

test('Mirror Garden keeps permanent solid cover outside the clone split court', () => {
  const zone = MIRROR_GARDEN.bossClearZone;
  for (const collider of MIRROR_GARDEN.colliders.filter(item => !item.id.includes('boundary'))) {
    const [x, , z] = collider.position;
    const [width, , depth] = collider.size;
    const nearestX = Math.max(x - width / 2, Math.min(zone.center[0], x + width / 2));
    const nearestZ = Math.max(z - depth / 2, Math.min(zone.center[1], z + depth / 2));
    assert.ok(Math.hypot(nearestX - zone.center[0], nearestZ - zone.center[1]) >= zone.radius, collider.id);
  }
});

test('Mirror Garden opens all four mirror shortcuts for the Wave 30 lineage', () => {
  const shortcuts = MIRROR_GARDEN.colliders.filter(collider => collider.id.includes('mirror-threshold'));
  assert.equal(shortcuts.length, 4);
  assert.ok(shortcuts.every(collider => collider.tags?.includes('phase-hidden-objective')));
  assert.ok(Object.values(MIRROR_GARDEN.weatherByWave).every(mode => mode.startsWith('mirror-')));
});

test('Mirror Garden points every modeled light mast toward the clone court', () => {
  const masts = MIRROR_GARDEN.assets.filter(asset => asset.asset === 'lightmast');
  assert.equal(masts.length, 4);
  for (const mast of masts) {
    const forward = new THREE.Vector2(Math.sin(mast.yaw), Math.cos(mast.yaw)).normalize();
    const toCourt = new THREE.Vector2(-mast.position[0], -mast.position[2]).normalize();
    assert.ok(forward.dot(toCourt) > .999, `${mast.position[0]},${mast.position[2]} must face the court`);
  }
  const mastBases = MIRROR_GARDEN.colliders.filter(collider => collider.id.endsWith('lightmast-base'));
  assert.equal(mastBases.length, 4);
  assert.ok(mastBases.every(collider => collider.assetId === 'lightmast'));
  assert.ok(mastBases.every(collider => collider.blocksMovement && collider.blocksShots && collider.blocksSight));
});

test('Mirror Garden backdrop modules remain separated at their authored scale', () => {
  const backdrops = MIRROR_GARDEN.assets.filter(asset => asset.asset === 'mirrorbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    const previousRight = previous.position[0] + 13.5 * previous.scale / 2;
    const currentLeft = current.position[0] - 13.5 * current.scale / 2;
    assert.ok(previousRight <= currentLeft + 0.001);
  }
});

test('Mirror Garden progressively reveals generation cues and opens its boss routes', () => {
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
  runtime.load(MIRROR_GARDEN);

  const secondRing = runtime.group.getObjectByName('mirror-generation-ring-2');
  const thirdRing = runtime.group.getObjectByName('mirror-generation-ring-3');
  const bossRing = runtime.group.getObjectByName('mirror-boss-ring');
  const shards = runtime.group.getObjectByName('mirror-fracture-shards');
  const mirrorPanel = runtime.visualGroups.get('mirrorBarrier')[0];
  const secondPool = runtime.group.getObjectByName('mirror-generation-pool-2');
  const thirdPool = runtime.group.getObjectByName('mirror-generation-pool-3');
  const thresholdPool = runtime.group.getObjectByName('mirror-threshold-pool-north');
  const bossCorePool = runtime.group.getObjectByName('mirror-boss-core-pool');
  const bossRimPool = runtime.group.getObjectByName('mirror-boss-rim-pool');
  const splitKey = runtime.group.getObjectByName('mirror-split-ring-key');
  assert.equal(secondRing.visible, false);
  assert.equal(thirdRing.visible, false);
  assert.equal(bossRing.visible, false);
  assert.equal(shards.visible, false);
  assert.equal(secondPool.visible, false);
  assert.equal(thirdPool.visible, false);
  assert.equal(thresholdPool.visible, true);
  assert.equal(bossCorePool.visible, false);
  assert.equal(bossRimPool.visible, false);
  assert.equal(splitKey.visible, false);

  runtime.onWaveStart(28);
  assert.equal(secondRing.visible, true);
  assert.equal(thirdRing.visible, false);
  assert.equal(shards.visible, true);
  assert.equal(mirrorPanel.visible, true);
  assert.equal(secondPool.visible, true);
  assert.equal(thirdPool.visible, false);
  assert.equal(thresholdPool.visible, true);

  runtime.onWaveStart(30);
  assert.equal(thirdRing.visible, true);
  assert.equal(bossRing.visible, true);
  assert.equal(mirrorPanel.visible, false);
  assert.equal(secondPool.visible, true);
  assert.equal(thirdPool.visible, true);
  assert.equal(thresholdPool.visible, false);
  assert.equal(bossCorePool.visible, true);
  assert.equal(bossRimPool.visible, true);
  assert.equal(splitKey.visible, true);
  assert.ok(splitKey.intensity > 0);
  assert.ok(runtime.colliderObjects.filter(object => object.userData.colliderTags.includes('phase-hidden-objective')).every(object => object.userData.colliderActive === false));
  assert.deepEqual(weatherCalls.at(-1), ['mirror-boss-fog-wind', { immediate: false }]);

  runtime.onBossDefeated(30);
  assert.equal(shards.visible, false);
  assert.equal(mirrorPanel.visible, false);
  assert.equal(secondPool.visible, false);
  assert.equal(thirdPool.visible, false);
  assert.equal(bossCorePool.visible, false);
  assert.equal(bossRimPool.visible, false);
  assert.equal(splitKey.visible, false);
  assert.ok(runtime.colliderObjects.filter(object => object.userData.colliderTags.includes('phase-hidden-objective'))
    .every(object => object.userData.colliderActive === false));
  assert.deepEqual(weatherCalls.at(-1), ['mirror-liberated-fog']);
});

test('Mirror Garden anchors diffused mast keys to lamp bars and softly grounds the garden', () => {
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
  runtime.load(MIRROR_GARDEN);

  const mastKeys = [];
  runtime.group.traverse(object => {
    if (object.isSpotLight && object.name.startsWith('mirror-mast-key-')) mastKeys.push(object);
  });
  assert.equal(mastKeys.length, 4);
  const authoredLights = [];
  runtime.group.traverse(object => { if (object.isLight) authoredLights.push(object); });
  assert.equal(authoredLights.length, 5, 'four mast keys plus one staged Split Ring key keep the local-light budget bounded');
  for (const key of mastKeys) {
    assert.equal(key.castShadow, false);
    assert.ok(key.penumbra >= .85);
    const horizontalDirection = new THREE.Vector2(
      key.target.position.x - key.position.x,
      key.target.position.z - key.position.z
    ).normalize();
    const toCourt = new THREE.Vector2(-key.position.x, -key.position.z).normalize();
    assert.ok(horizontalDirection.dot(toCourt) > .999);
  }
  const northWestKey = runtime.group.getObjectByName('mirror-mast-key-north-west');
  assert.ok(Math.abs(northWestKey.position.y - 4.73 * .94) < 1e-9);
  assert.equal(runtime.group.getObjectByName('mirror-mast-pool-north-west').material.isShaderMaterial, true);
  assert.equal(runtime.group.getObjectByName('mirror-generation-pool-1').material.isShaderMaterial, true);
  assert.deepEqual(runtime.group.getObjectByName('mirror-split-ring-key').position.toArray(), [0, 1.25 * 1.22, 0]);
  assert.equal(runtime.group.getObjectByName('mirror-static-contact-shadows').count, 26);
  assert.equal(runtime.enemyContactShadowMesh.name, 'mirror-enemy-contact-shadows');
  assert.equal(runtime.enemyContactShadowMesh.material.isShaderMaterial, true);

  const originalHsl = { h: 0, s: 0, l: 0 };
  const liftedHsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(0x080a0c).getHSL(originalHsl);
  runtime.group.getObjectByName('relay:civicwall').material.color.getHSL(liftedHsl);
  assert.ok(liftedHsl.l > originalHsl.l);
});

test('Mirror Garden enemy contact shadows follow clone threat-ring instances', () => {
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
  runtime.load(MIRROR_GARDEN);
  const enemy = new THREE.Group();
  enemy.position.set(4, 0, -3);
  enemy.userData.type = 'tank';
  runtime.attach({ enemyManager: { enemies: [enemy], setEncounterHooks() {} } });
  runtime.update(.016, null);
  assert.equal(runtime.enemyReadabilityMesh.count, 1);
  assert.equal(runtime.enemyContactShadowMesh.count, 1);
});
