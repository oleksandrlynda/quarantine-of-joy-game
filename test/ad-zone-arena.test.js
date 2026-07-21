import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import {
  assetColliderProfileIds,
  BARRIERS_COLLIDER_PROFILE,
  BILLBOARD_WALL_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  COVER_HEIGHTS_COLLIDER_PROFILE,
  GUARD_BOOTH_COLLIDER_PROFILE,
  KIOSK_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  SPONSOR_PROJECTOR_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../src/assets/collision-profiles.js';

test('Ad-Zone Arena owns Waves 11-15 and meets the Captain floor requirement', () => {
  assert.deepEqual(Object.keys(AD_ZONE_ARENA.waves).map(Number), [11, 12, 13, 14, 15]);
  assert.equal(AD_ZONE_ARENA.bossWave, 15);
  assert.deepEqual(AD_ZONE_ARENA.bossAnchor, [0, .8, -4]);
  assert.ok(AD_ZONE_ARENA.bossArenaBounds.maxX - AD_ZONE_ARENA.bossArenaBounds.minX >= 52);
  assert.ok(AD_ZONE_ARENA.bossArenaBounds.maxZ - AD_ZONE_ARENA.bossArenaBounds.minZ >= 46);
});

test('Ad-Zone Arena preserves the full Zeppelin pass and overhead exit', () => {
  assert.ok(AD_ZONE_ARENA.airCorridor.maxX - AD_ZONE_ARENA.airCorridor.minX >= 92);
  assert.ok(AD_ZONE_ARENA.airCorridor.retreatY >= 26);
  assert.ok(AD_ZONE_ARENA.airCorridor.minY >= 7);
});

test('Ad-Zone Arena entrances have valid contracts and static clearance', () => {
  const results = validateLevelSpawnNetwork(AD_ZONE_ARENA);
  assert.equal(results.length, 8);
  assert.deepEqual(results.filter(result => !result.valid).map(result => ({ id: result.entrance.id, errors: result.errors })), []);
});

test('Ad-Zone Arena rotates visible billboard cover with matching colliders', () => {
  assert.equal(AD_ZONE_ARENA.assets.filter(asset => asset.tags.includes('movingCover')).length, 2);
  const movingColliders = AD_ZONE_ARENA.colliders.filter(collider => collider.motion?.kind === 'billboard');
  assert.equal(movingColliders.length, BILLBOARD_WALL_COLLIDER_PROFILE.length * 2);
  assert.ok(movingColliders.every(collider => Number.isFinite(collider.motion.baseYaw)));
  assert.deepEqual(movingColliders.filter(collider => collider.motion.index === 0).map(collider => collider.id).sort(),
    assetColliderProfileIds('west-billboard', BILLBOARD_WALL_COLLIDER_PROFILE).sort());
  assert.deepEqual(movingColliders.filter(collider => collider.motion.index === 1).map(collider => collider.id).sort(),
    assetColliderProfileIds('east-billboard', BILLBOARD_WALL_COLLIDER_PROFILE).sort());
});

test('Ad-Zone Arena authors full prop envelopes and phase-bound objective collision', () => {
  const collider = id => AD_ZONE_ARENA.colliders.find(item => item.id === id);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'guardbooth').length, GUARD_BOOTH_COLLIDER_PROFILE.length);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'kiosk').length, KIOSK_COLLIDER_PROFILE.length * 2);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'barriers').length, BARRIERS_COLLIDER_PROFILE.length);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'roadblock').length, ROADBLOCK_COLLIDER_PROFILE.length);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'coverheights').length, COVER_HEIGHTS_COLLIDER_PROFILE.length);
  assert.equal(AD_ZONE_ARENA.colliders.filter(item => item.assetId === 'breakablecover').length, BREAKABLE_COVER_COLLIDER_PROFILE.length);
  assert.deepEqual([
    'west-lightmast-base', 'west-lightmast-pole', 'west-lightmast-lamp-bar',
    'east-lightmast-base', 'east-lightmast-pole', 'east-lightmast-lamp-bar'
  ].map(id => !!collider(id)), [true, true, true, true, true, true]);
  const catwalkColliders = AD_ZONE_ARENA.colliders.filter(item => item.id.startsWith('east-catwalk-'));
  assert.equal(catwalkColliders.length, 7);
  assert.equal(collider('east-catwalk-deck').blocksMovement, false);
  assert.equal(collider('east-catwalk-deck').blocksShots, true);
  for (const id of assetColliderProfileIds('capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE).filter(id => id.includes('-move-'))) {
    assert.equal(collider(id).jumpExpectedPass, true, `${id} should remain vaultable`);
  }
  const objectiveIds = [
    ...assetColliderProfileIds('sponsor-projector', SPONSOR_PROJECTOR_COLLIDER_PROFILE),
    ...assetColliderProfileIds('capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetColliderProfileIds('adzone-terminal', TERMINAL_COLLIDER_PROFILE)
  ];
  for (const id of objectiveIds) {
    assert.ok(collider(id)?.tags.includes('phase-hidden-objective'), `${id} is not phase-bound`);
  }
});

test('Wave 13 uses the sponsor court and Wave 15 exposes Captain dressing', () => {
  assert.equal(AD_ZONE_ARENA.waves[13].objective, 'sponsor');
  assert.equal(AD_ZONE_ARENA.waves[13].packages.length, 3);
  assert.ok(AD_ZONE_ARENA.objectives.sponsor.radius >= 5);
  assert.equal(AD_ZONE_ARENA.waves[15].boss, 'captain');
  assert.equal(AD_ZONE_ARENA.assets.filter(asset => asset.tags.includes('bossDressing')).length, 2);
  assert.deepEqual([11, 12, 13, 14].map(wave => AD_ZONE_ARENA.waves[wave].packages.flat().length), [19, 21, 24, 25]);
  assert.deepEqual([11, 12, 13, 14].map(wave => AD_ZONE_ARENA.waves[wave].packages.flat().filter(type => type === 'pelican').length), [1, 1, 1, 1]);
  assert.deepEqual([11, 12, 13, 14].map(wave => AD_ZONE_ARENA.waves[wave].activeCap), [12, 12, 13, 13]);
});

test('Ad-Zone pelicans use the authored air entrances', () => {
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
  runtime.load(AD_ZONE_ARENA);

  const pelicanCandidates = runtime._spawnCandidates(11, 'pelican');
  assert.deepEqual(
    pelicanCandidates.map(candidate => candidate.entranceId).sort(),
    ['propaganda-air-east', 'propaganda-air-west']
  );
  assert.ok(pelicanCandidates.every(candidate => candidate.position.y === 7));
  assert.ok(runtime._spawnCandidates(11, 'grunt').every(candidate => !candidate.entranceId.includes('air')));
});

test('Ad-Zone boss phase removes every hidden objective boundary and liberation restores it', () => {
  const objects = [];
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects,
    grassMesh: null,
    weather: null,
    clonePrefab: () => new THREE.Group(),
    cullGrass: null,
    onObjective: null,
    onWarning: null,
    onRefreshColliders: null,
    onTransitionToLegacy: null
  });
  runtime.load(AD_ZONE_ARENA);
  const objectiveIds = [
    ...assetColliderProfileIds('sponsor-projector', SPONSOR_PROJECTOR_COLLIDER_PROFILE),
    ...assetColliderProfileIds('capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetColliderProfileIds('adzone-terminal', TERMINAL_COLLIDER_PROFILE)
  ];
  const objectiveColliders = objectiveIds.map(id => runtime.colliderObjects.find(item => item.userData.colliderId === id));
  assert.ok(objectiveColliders.every(item => objects.includes(item)));

  const movingPole = runtime.colliderObjects.find(item => item.userData.colliderId === 'west-billboard-west-pole');
  const billboardOrigin = new THREE.Vector2(-11.5, -2.5);
  const beforePosition = new THREE.Vector2(movingPole.position.x, movingPole.position.z);
  const beforeRadius = beforePosition.distanceTo(billboardOrigin);
  runtime._updateAdZoneMotion(.5);
  const afterPosition = new THREE.Vector2(movingPole.position.x, movingPole.position.z);
  assert.ok(afterPosition.distanceTo(beforePosition) > .01, 'offset billboard primitives must orbit with the visual root');
  assert.ok(Math.abs(afterPosition.distanceTo(billboardOrigin) - beforeRadius) < 1e-6);

  runtime.onWaveStart(15);
  assert.ok(objectiveColliders.every(item => !objects.includes(item) && item.visible === false));

  runtime.onBossDefeated(15);
  assert.ok(objectiveColliders.every(item => objects.includes(item) && item.visible === true));
});

test('Ad-Zone lighting grounds actors and gives each combat phase a distinct light owner', () => {
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
  runtime.load(AD_ZONE_ARENA);

  assert.equal(runtime.group.getObjectByName('adzone-lightmast-beams').count, 2);
  assert.equal(runtime.group.getObjectByName('adzone-lightmast-pools').count, 2);
  assert.equal(runtime.group.getObjectByName('adzone-static-contact-shadows').count, 17);
  assert.equal(runtime.enemyContactShadowMesh.name, 'adzone-enemy-contact-shadows');
  assert.equal(runtime.enemyContactShadowMesh.material.isShaderMaterial, true);
  assert.ok(runtime.group.getObjectByName('adzone-lightmast-key-1').intensity > 0);
  assert.ok(runtime.group.getObjectByName('adzone-lightmast-key-2').intensity > 0);

  const darkAsset = runtime.group.getObjectByName('relay:cornershop');
  const originalHsl = { h: 0, s: 0, l: 0 };
  const liftedHsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(0x080a0c).getHSL(originalHsl);
  darkAsset.material.color.getHSL(liftedHsl);
  assert.ok(liftedHsl.l > originalHsl.l);

  const cyanLaneColor = runtime.adZoneMaterials.cyan.color.getHex();
  const orangeLaneColor = runtime.adZoneMaterials.orange.color.getHex();
  runtime.onWaveStart(13);
  const sponsorPool = runtime.group.getObjectByName('adzone-sponsor-light-pool');
  const sponsorVolume = runtime.group.getObjectByName('adzone-sponsor-light-volume');
  const sponsorKey = runtime.group.getObjectByName('adzone-sponsor-key');
  const courtKey = runtime.group.getObjectByName('adzone-court-key');
  assert.equal(sponsorPool.visible, true);
  assert.equal(sponsorVolume.visible, true);
  assert.ok(sponsorKey.intensity > 0);
  assert.deepEqual(sponsorKey.position.toArray(), [0, 2.58, 5.5]);
  assert.deepEqual(courtKey.position.toArray(), sponsorKey.position.toArray());
  assert.ok(sponsorVolume.position.y + sponsorVolume.geometry.parameters.height / 2 <= 2.4);

  runtime.objectiveState.progress = .65;
  runtime.objectiveState.contested = true;
  runtime._updateAdZoneObjectiveLighting();
  assert.equal(sponsorPool.material.uniforms.uColor.value.getHex(), 0xff554b);
  assert.ok(sponsorKey.intensity > 1.45);

  runtime.onWaveStart(15);
  assert.equal(sponsorPool.visible, false);
  assert.equal(sponsorVolume.visible, false);
  assert.equal(runtime.group.getObjectByName('adzone-boss-air-column').visible, true);
  assert.equal(runtime.group.getObjectByName('adzone-court-key').userData.baseIntensity, 3.2);
  assert.equal(runtime.adZoneMaterials.cyan.color.getHex(), cyanLaneColor);
  assert.equal(runtime.adZoneMaterials.orange.color.getHex(), orangeLaneColor);
});

test('Ad-Zone enemy contact shadows follow the readability instances', () => {
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
  runtime.load(AD_ZONE_ARENA);
  const enemy = new THREE.Group();
  enemy.position.set(3, 0, -2);
  enemy.userData.type = 'grunt';
  runtime.attach({ enemyManager: { enemies: [enemy], setEncounterHooks() {} } });
  runtime.update(.016, null);
  assert.equal(runtime.enemyReadabilityMesh.count, 1);
  assert.equal(runtime.enemyContactShadowMesh.count, 1);
});
