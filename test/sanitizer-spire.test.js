import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import {
  CLINIC_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../src/assets/collision-profiles.js';

test('Sanitizer Spire owns Waves 6-10 and keeps the Wave 10 boss centered', () => {
  assert.deepEqual(Object.keys(SANITIZER_SPIRE.waves).map(Number), [6, 7, 8, 9, 10]);
  assert.equal(SANITIZER_SPIRE.bossWave, 10);
  assert.deepEqual(SANITIZER_SPIRE.bossAnchor, [0, .8, -4]);
  assert.ok(SANITIZER_SPIRE.size[0] >= 54 && SANITIZER_SPIRE.size[1] >= 54);
  assert.ok(SANITIZER_SPIRE.bossArenaBounds.maxX - SANITIZER_SPIRE.bossArenaBounds.minX >= 51);
});

test('Sanitizer Spire entrances have valid contracts and static clearance', () => {
  const results = validateLevelSpawnNetwork(SANITIZER_SPIRE);
  assert.equal(results.length, 6);
  assert.deepEqual(results.filter(result => !result.valid).map(result => ({ id: result.entrance.id, errors: result.errors })), []);
});

test('Level 1 to 2 transition handles grouped objective clear zones when Wave 6 spawns', () => {
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
  runtime.load(RELAY_DISTRICT);
  runtime.load(SANITIZER_SPIRE);

  assert.equal(runtime._spawnCandidates(6, 'grunt').length, 4);
  assert.equal(runtime._entranceRuntimeSafe({
    position: [-15.5, .8, 7.5],
    clearance: { grunt: 1 }
  }, 'grunt'), false, 'an entrance inside a grouped suppression-node zone must remain blocked');
});

test('new authored scenes reset prior liberation state before capture objectives activate', () => {
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
  const enemyManager = {
    wave: 5,
    alive: 0,
    enemies: new Set(),
    setEncounterHooks() {},
    queueAuthoredEnemies() {},
    tryAdvanceWave() {}
  };
  runtime.attach({ enemyManager });
  runtime.load(RELAY_DISTRICT);
  runtime.onWaveStart(5);
  runtime.onBossDefeated(5);
  assert.ok(runtime.liberationTime > 0);

  runtime.load(SANITIZER_SPIRE);
  enemyManager.wave = 8;
  runtime.onWaveStart(8);
  const west = SANITIZER_SPIRE.objectives.suppressionNodes[0];
  runtime.update(.5, { position: new THREE.Vector3(west.position[0], 1.7, west.position[1]) });
  assert.equal(runtime.objectiveState.activeTargetKey, west.nameKey);
  assert.equal(runtime.objectiveState.targets[0].progress, .5);

  enemyManager.wave = 10;
  runtime.onWaveStart(10);
  runtime.onBossDefeated(10);
  assert.ok(runtime.liberationTime > 0);
  runtime.load(AD_ZONE_ARENA);
  enemyManager.wave = 13;
  runtime.onWaveStart(13);
  const sponsor = AD_ZONE_ARENA.objectives.sponsor;
  runtime.update(.5, { position: new THREE.Vector3(sponsor.position[0], 1.7, sponsor.position[1]) });
  assert.equal(runtime.objectiveState.elapsed, .5);
  assert.equal(runtime.objectiveState.progress, .5 / sponsor.seconds);
});

test('Sanitizer Spire preserves two broad beam routes and restrained hard cover', () => {
  assert.equal(SANITIZER_SPIRE.routes.length, 3);
  assert.ok(SANITIZER_SPIRE.routes.some(route => route.clearance >= 7));
  assert.ok(SANITIZER_SPIRE.colliders.some(collider => collider.id === 'west-beam-cover'));
  assert.ok(SANITIZER_SPIRE.colliders.some(collider => collider.id === 'east-beam-cover'));
  assert.equal(SANITIZER_SPIRE.assets.filter(asset => asset.asset === 'stairs').length, 2);
  assert.equal(SANITIZER_SPIRE.assets.filter(asset => asset.asset === 'catwalk').length, 1);
  assert.deepEqual(SANITIZER_SPIRE.walkableSurfaces.map(surface => surface.id), [
    'west-flank-stair-south-ramp', 'west-flank-catwalk-deck', 'west-flank-stair-north-ramp'
  ]);
});

test('Sanitizer regular waves escalate and Wave 8 gates reinforcements behind three suppression feeds', () => {
  assert.deepEqual([6, 7, 8, 9].map(wave => SANITIZER_SPIRE.waves[wave].packages.flat().length), [14, 16, 18, 20]);
  assert.deepEqual([6, 7, 8, 9].map(wave => SANITIZER_SPIRE.waves[wave].activeCap), [10, 11, 12, 12]);
  assert.equal(SANITIZER_SPIRE.waves[8].objective, 'multi-capture');
  assert.equal(SANITIZER_SPIRE.objectives.suppressionNodes.length, 3);
});

test('Sanitizer lighting owns a grounded hero hierarchy and explicit wave states', () => {
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
  runtime.load(SANITIZER_SPIRE);

  const heroKey = runtime.group.getObjectByName('spire-hero-key');
  const facadeWash = runtime.group.getObjectByName('spire-facade-wash');
  const courtPool = runtime.group.getObjectByName('spire-court-light-pool');
  const staticContacts = runtime.group.getObjectByName('spire-static-contact-shadows');
  assert.equal(heroKey.isPointLight, true);
  assert.equal(heroKey.castShadow, false);
  assert.equal(facadeWash.material.isShaderMaterial, true);
  assert.equal(courtPool.material.isShaderMaterial, true);
  assert.equal(staticContacts.count, 13);
  assert.equal(runtime.enemyContactShadowMesh.name, 'spire-enemy-contact-shadows');
  assert.equal(runtime.enemyContactShadowMesh.material.isShaderMaterial, true);

  const westRing = runtime.group.getObjectByName('spire-suppression-ring:west-censor');
  const westPool = runtime.group.getObjectByName('spire-suppression-pool:west-censor');
  runtime.onWaveStart(7);
  assert.equal(westRing.visible, false, 'suppression lighting must not leak into Wave 7');
  assert.equal(westPool.visible, false);
  const lockdownIntensity = heroKey.userData.baseIntensity;

  runtime.onWaveStart(8);
  assert.equal(westRing.visible, true);
  assert.equal(westPool.visible, true);
  assert.ok(heroKey.userData.baseIntensity > lockdownIntensity);
  assert.ok(courtPool.material.uniforms.uOpacity.value > .12);

  runtime.onWaveStart(10);
  assert.equal(westRing.visible, false);
  assert.equal(westPool.visible, false);
  assert.equal(heroKey.color.getHex(), 0xffaa9a);
});

test('Sanitizer Spire collision honors gates, windows, and solid corridor walls', () => {
  const colliders = SANITIZER_SPIRE.colliders;
  const contains = (collider, [x, y, z]) => {
    const [cx, cy, cz] = collider.position;
    const [width, height, depth] = collider.size;
    return Math.abs(x - cx) <= width / 2
      && Math.abs(y - cy) <= height / 2
      && Math.abs(z - cz) <= depth / 2;
  };
  const movementBlocked = point => colliders.some(collider => collider.blocksMovement !== false && contains(collider, point));
  const shotBlocked = point => colliders.some(collider => collider.blocksShots !== false && contains(collider, point));

  assert.equal(colliders.some(collider => collider.id === 'west-decon'), false);
  assert.equal(colliders.some(collider => collider.id === 'east-decon'), false);
  assert.equal(movementBlocked([-20, 1.7, 19]), false, 'west decon centre must be traversable');
  assert.equal(movementBlocked([20, 1.7, 19]), false, 'east decon centre must be traversable');
  assert.equal(movementBlocked([-22.33, 1.7, 19]), true, 'visible decon posts must remain solid');
  assert.equal(movementBlocked([-25, 1.7, -7.48]), true, 'corridor sidewalls must be solid');
  assert.equal(movementBlocked([-25, 1.7, -5]), true, 'service-pod interior must not admit the player');
  assert.equal(shotBlocked([-25, 1.7, -5]), false, 'service-pod observation opening must pass shots');
  assert.equal(movementBlocked([-27, 1.7, -5]), true, 'outer boundary must still contain the player behind the window');
  assert.equal(shotBlocked([-27, 1.7, -5]), false, 'outer boundary must not invisibly plug the window');
  assert.equal(movementBlocked([-19.5, 1.7, -27]), true, 'north boundary must contain the player behind the clinic');
  assert.equal(shotBlocked([-19.5, 1.7, -27]), false, 'north boundary must not plug the west clinic window');
  assert.equal(shotBlocked([19.5, 1.7, -27]), false, 'north boundary must not plug the east clinic window');
  assert.equal(movementBlocked([-26, 1.8, 10]), true, 'window wall must keep the player outside');
  assert.equal(shotBlocked([-26, 1.8, 10]), false, 'observation window must pass shots at eye height');
  assert.equal(shotBlocked([-26, .7, 10]), true, 'observation-window sill must stop shots');
  assert.equal(movementBlocked([-12.5, 1.6, -8]), true, 'peek barrier must keep the player out of its firing slot');
  assert.equal(shotBlocked([-12.5, 1.6, -8]), false, 'peek-barrier firing slot must pass shots');
  assert.equal(shotBlocked([-12.5, .7, -8]), true, 'peek-barrier sill must stop shots');
  assert.equal(shotBlocked([-12.5, 1.6, -6.13]), true, 'peek-barrier side mass must stop shots');
  assert.equal(movementBlocked([12.5, 1.6, -8]), true, 'mirrored peek barrier must also remain solid to movement');
  assert.equal(shotBlocked([12.5, 1.6, -8]), false, 'mirrored peek-barrier firing slot must pass shots');
  assert.equal(movementBlocked([0, 1.7, 21.42]), false, 'emergency-sign portal must preserve the player spawn opening');
  assert.equal(movementBlocked([-2.67, 1.7, 21.42]), true, 'emergency-sign west post must be solid');
  assert.equal(movementBlocked([2.67, 1.7, 21.42]), true, 'emergency-sign east post must be solid');

  const collider = id => colliders.find(item => item.id === id);
  assert.ok(collider('spire-shell').size[2] >= 7.8, 'facade shell must reach its visible south face');
  const clinics = colliders.filter(item => item.assetId === 'clinic');
  assert.equal(clinics.length, CLINIC_COLLIDER_PROFILE.length * 2);
  assert.equal(collider('west-clinic-movement-shell').blocksShots, false);
  const terminal = colliders.filter(item => item.assetId === 'terminal');
  const relay = colliders.filter(item => item.assetId === 'powerrelay');
  assert.equal(terminal.length, TERMINAL_COLLIDER_PROFILE.length);
  assert.equal(relay.length, POWER_RELAY_COLLIDER_PROFILE.length);
  assert.ok(relay.find(item => item.primitiveId === 'base').size[0] >= 2.5, 'rotated relay base must cover its visible depth');
  const cornerCovers = colliders.filter(item => item.assetId === 'cornercover');
  assert.equal(cornerCovers.length, CORNER_COVER_COLLIDER_PROFILE.length * 2);
  assert.ok(cornerCovers.every(item => item.size[0] <= 4.6 && item.size[2] <= 3.7), 'corner-cover primitives must not regress to a broad invisible box');
  assert.ok(collider('west-reinforcement-door') && collider('east-reinforcement-door'));
});

test('Sanitizer dressing is removed when the Spire is liberated', () => {
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
  runtime.load(SANITIZER_SPIRE);
  runtime.onWaveStart(10);
  assert.equal(runtime.visualGroups.get('bossDressing')[0].visible, true);
  assert.equal(runtime.visualGroups.get('suppressionDressing')[0].visible, true);
  runtime.onBossDefeated(10);
  assert.equal(runtime.visualGroups.get('bossDressing')[0].visible, false);
  assert.equal(runtime.visualGroups.get('suppressionDressing')[0].visible, false);
});

test('Sanitizer suppression feeds release two authored packages and gate completion', () => {
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
  let completionRetries = 0;
  const enemyManager = {
    wave: 8,
    alive: SANITIZER_SPIRE.waves[8].packages[0].length,
    enemies: new Set(),
    setEncounterHooks() {},
    queueAuthoredEnemies(pkg) { queued.push([...pkg]); this.alive += pkg.length; },
    tryAdvanceWave() { completionRetries++; }
  };
  runtime.load(SANITIZER_SPIRE);
  runtime.attach({ enemyManager });
  runtime.onWaveStart(8);

  for (const target of SANITIZER_SPIRE.objectives.suppressionNodes) {
    // Exercise an accessible point just inside the visible ring, using normal
    // gameplay-sized frames instead of teleporting into the solid console.
    const player = { position: new THREE.Vector3(target.position[0], 1.7, target.position[1] + target.radius - .5) };
    for (let elapsed = 0; elapsed < target.seconds + .1; elapsed += 1 / 60) runtime.update(1 / 60, player);
  }

  assert.deepEqual(queued.map(pkg => pkg.length), [5, 5]);
  assert.equal(runtime.objectiveState.complete, true);
  assert.equal(completionRetries, 1);
  const completedPool = runtime.group.getObjectByName('spire-suppression-pool:west-censor');
  assert.equal(completedPool.material.uniforms.uColor.value.getHex(), 0x8df58d);
  assert.ok(completedPool.material.uniforms.uOpacity.value < .1);
});
