import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createBreakerObserverAsset } from '../src/assets/breaker-observer.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { disposeLevelGroupResources, LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';

test('level resource disposal frees owned resources but preserves shared prefab resources', () => {
  let ownedGeometryDisposals = 0;
  let sharedGeometryDisposals = 0;
  let ownedMaterialDisposals = 0;
  let sharedMaterialDisposals = 0;
  const ownedGeometry = { dispose: () => { ownedGeometryDisposals++; } };
  const sharedGeometry = { dispose: () => { sharedGeometryDisposals++; } };
  const ownedMaterial = { dispose: () => { ownedMaterialDisposals++; } };
  const sharedMaterial = { dispose: () => { sharedMaterialDisposals++; } };
  const nodes = [
    { geometry: ownedGeometry, material: ownedMaterial },
    { geometry: ownedGeometry, material: ownedMaterial },
    { geometry: sharedGeometry, material: [sharedMaterial, ownedMaterial] }
  ];
  const root = { traverse: visitor => nodes.forEach(visitor) };

  assert.deepEqual(disposeLevelGroupResources(root, {
    sharedGeometries: new Set([sharedGeometry]),
    sharedMaterials: new Set([sharedMaterial])
  }), { geometries: 1, materials: 1 });
  assert.equal(ownedGeometryDisposals, 1);
  assert.equal(ownedMaterialDisposals, 1);
  assert.equal(sharedGeometryDisposals, 0);
  assert.equal(sharedMaterialDisposals, 0);
});

test('Server Cathedral owns Waves 36-40 and reserves the Algorithm finale floor', () => {
  assert.deepEqual(Object.keys(SERVER_CATHEDRAL.waves).map(Number), [36, 37, 38, 39, 40]);
  assert.equal(SERVER_CATHEDRAL.bossWave, 40);
  assert.equal(SERVER_CATHEDRAL.waves[40].boss, 'algorithm');
  assert.ok(SERVER_CATHEDRAL.bossArenaBounds.maxX - SERVER_CATHEDRAL.bossArenaBounds.minX >= 42);
  assert.ok(SERVER_CATHEDRAL.bossArenaBounds.maxZ - SERVER_CATHEDRAL.bossArenaBounds.minZ >= 42);
  assert.ok(SERVER_CATHEDRAL.bossClearZone.radius >= 15);
});

test('Wave 40 conceals one efficient, non-combat Breaker observer until the Algorithm arrives', () => {
  const config = SERVER_CATHEDRAL.storyObserver;
  assert.equal(config.model, 'breaker');
  assert.deepEqual(config.visibleWaves, [40]);
  assert.equal(config.nonCombat, true);
  assert.equal(config.hideWhenLiberated, true);
  assert.equal(config.pose, 'border-lean');
  assert.ok(config.scale >= 17 && config.scale <= 19, 'observer should read three times larger than the original six-times giant');
  assert.ok(Math.abs(config.position[0]) > SERVER_CATHEDRAL.bossArenaBounds.maxX, 'observer should remain beyond the east perimeter');
  assert.ok(config.position[1] < 0, 'observer lower body should be sunk below the arena sightline');
  assert.equal(config.position[2], 0, 'observer should be centered on the east perimeter');

  const built = createBreakerObserverAsset({ THREE });
  let meshes = 0;
  let triangles = 0;
  const materials = new Set();
  built.root.traverse(object => {
    if (!object.isMesh) return;
    meshes += 1;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
    materials.add(object.material);
    assert.equal(object.castShadow, false, `${object.name || 'observer mesh'} should not add a shadow draw`);
    assert.equal(object.userData.nonTargetVisual, true);
  });
  assert.ok(meshes >= 60, 'observer should preserve the articulated model silhouette');
  assert.ok(triangles <= 6000, `observer geometry budget exceeded: ${triangles}`);
  assert.ok(materials.size <= 6, `observer material budget exceeded: ${materials.size}`);
  assert.equal(built.root.userData.storyRole, 'concealed_generation_observer');

  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.load(SERVER_CATHEDRAL);
  const observer = runtime.group.getObjectByName('breaker_generation_observer');
  assert.ok(observer);
  const handClearanceDressing = runtime.visualGroups.get('observerHandClearance');
  const handClearanceColliders = runtime.colliderObjects.filter(object => object.userData.colliderTags?.includes('observerHandClearance'));
  assert.equal(handClearanceDressing.length, 2, 'only the east light mast and south-east stairs should clear the giant hands');
  assert.ok(handClearanceDressing.every(object => object.visible === true));
  assert.ok(handClearanceColliders.length >= 2);
  assert.ok(handClearanceColliders.every(object => object.userData.colliderActive === true));
  assert.equal(observer.getObjectByName('breaker_observer_perch'), undefined, 'observer must use the authored Cathedral border without a custom ledge');
  assert.equal(observer.visible, false, 'the future generation must remain hidden in Waves 36-39');
  assert.equal(observer.userData.nonCombat, true);
  const handBlockers = runtime.colliderObjects.filter(object => object.userData.storyObserverId === config.id);
  assert.equal(handBlockers.length, 2, 'observer should own one movement blocker per hand');
  assert.ok(handBlockers.every(blocker => blocker.userData.colliderActive === false), 'hand blockers must remain disabled before Wave 40');
  assert.ok(handBlockers.every(blocker => blocker.userData.blocksMovement === true));
  assert.ok(handBlockers.every(blocker => blocker.userData.blocksGrounding === false));
  assert.ok(handBlockers.every(blocker => blocker.userData.blocksShots === false && blocker.userData.blocksSight === false));

  runtime.onWaveStart(40);
  assert.equal(observer.visible, true);
  assert.ok(handClearanceDressing.every(object => object.visible === false), 'props intersecting the giant hands must hide during Wave 40');
  assert.ok(handClearanceColliders.every(object => object.userData.colliderActive === false), 'hidden hand props must not leave invisible collision');
  assert.ok(handBlockers.every(blocker => blocker.userData.colliderActive === true), 'both hand blockers must activate with Wave 40');
  assert.ok(handBlockers.every(blocker => runtime.objects.includes(blocker)));
  const head = observer.getObjectByName('breaker_observer_head');
  const leftArm = observer.getObjectByName('breaker_left_arm');
  const rightArm = observer.getObjectByName('breaker_right_arm');
  const leftFist = observer.getObjectByName('breaker_left_fist');
  assert.ok(leftArm.rotation.x < -1 && rightArm.rotation.x < -1, 'both hands should reach forward onto the perimeter');
  assert.ok(runtime.storyObserver.refs.lowerBody.every(part => part.visible === false), 'legs and hips should remain concealed');
  const restingFistRotation = leftFist.rotation.z;
  runtime.group.updateMatrixWorld(true);
  const leftHandContact = leftFist.getWorldPosition(new THREE.Vector3());
  const rightHandContact = observer.getObjectByName('breaker_right_fist').getWorldPosition(new THREE.Vector3());
  for (const contact of [leftHandContact, rightHandContact]) {
    assert.ok(Math.abs(contact.x - 31.5) < .55, `hand should meet the authored east border, received x=${contact.x}`);
    assert.ok(Math.abs(contact.y - 1.52) < .12, `hand should rest on the authored border top, received y=${contact.y}`);
  }
  for (const blocker of handBlockers) {
    const hand = observer.getObjectByName(`breaker_${blocker.userData.storyObserverHand}_fist`);
    const bounds = new THREE.Box3().setFromObject(hand);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(blocker.position.distanceTo(center) < .001, 'movement blocker should follow the visible hand center');
    assert.ok(blocker.scale.distanceTo(size) < .001, 'movement blocker should match the visible hand bounds');
  }
  runtime.update(.1, { position: new THREE.Vector3(18, 0, 18) });
  assert.ok(head.rotation.y > 0, 'observer should slowly track activity in the arena');
  assert.ok(head.rotation.y < .08, 'observer head should ease toward the player instead of snapping to them');
  const firstTrackedYaw = head.rotation.y;
  runtime.update(.1, { position: new THREE.Vector3(18, 0, -29) });
  assert.ok(head.rotation.y < firstTrackedYaw, 'observer should continuously follow the player when they change position');
  assert.notEqual(leftFist.rotation.z, restingFistRotation, 'observer should apply subtle alternating hand pressure while idle');

  runtime.onBossDefeated(40);
  assert.equal(observer.visible, false, 'observer must leave the ending choice to the Algorithm and player');
  assert.ok(handClearanceDressing.every(object => object.visible === false), 'hand-overlap props should stay hidden through the Wave 40 ending');
  assert.ok(handClearanceColliders.every(object => object.userData.colliderActive === false));
  assert.ok(handBlockers.every(blocker => blocker.userData.colliderActive === false), 'hand blockers must be removed after the boss');
  assert.ok(handBlockers.every(blocker => !runtime.objects.includes(blocker)));
});

test('Server Cathedral spawn network covers four sides plus a gallery air route', () => {
  const results = validateLevelSpawnNetwork(SERVER_CATHEDRAL);
  assert.equal(results.length, 9);
  assert.equal(results.every(result => result.valid), true, results.flatMap(result => result.errors).join('; '));
  assert.ok(SERVER_CATHEDRAL.entrances.some(entrance => entrance.air && entrance.allow.includes('flyer')));
  for (const prefix of ['north', 'south', 'west', 'east']) {
    assert.ok(SERVER_CATHEDRAL.entrances.some(entrance => entrance.id.startsWith(prefix)), prefix);
  }
});

test('permanent Cathedral cover leaves a clear 42 x 42 metre square', () => {
  const permanent = SERVER_CATHEDRAL.colliders.filter(collider => (
    !collider.id.includes('boundary')
      && !collider.tags?.some(tag => (
        tag.startsWith('cathedral')
          || ['logicDressing', 'choirDressing', 'rootDressing', 'endChoice', 'observerHandClearance'].includes(tag)
      ))
  ));
  for (const collider of permanent) {
    const [x, , z] = collider.position;
    const [width, , depth] = collider.size;
    const overlapsClearSquare = x - width / 2 < 21 && x + width / 2 > -21
      && z - depth / 2 < 21 && z + depth / 2 > -21;
    assert.equal(overlapsClearSquare, false, collider.id);
  }
});

test('Cathedral routes remain wide, connected, and color-stable', () => {
  const naves = SERVER_CATHEDRAL.routes.filter(route => route.id.endsWith('nave'));
  assert.equal(naves.length, 3);
  assert.ok(naves.every(route => route.clearance >= 8));
  assert.equal(new Set(naves.map(route => route.color)).size, 3);
  assert.ok(SERVER_CATHEDRAL.routes.some(route => route.id === 'processional-loop' && route.clearance >= 7));
  assert.ok(Object.values(SERVER_CATHEDRAL.weatherByWave).every(mode => mode.startsWith('cathedral-')));
});

test('Cathedral backdrop modules remain separated at authored scale', () => {
  const backdrops = SERVER_CATHEDRAL.assets.filter(asset => asset.asset === 'cathedralbackdrop').sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(backdrops.length, 3);
  for (let index = 1; index < backdrops.length; index += 1) {
    const previous = backdrops[index - 1];
    const current = backdrops[index];
    const previousRight = previous.position[0] + 14 * previous.scale / 2;
    const currentLeft = current.position[0] - 14 * current.scale / 2;
    assert.ok(previousRight <= currentLeft + .001);
  }
});

test('Cathedral gate swaps, objective bearings, and boss clearance stay synchronized', () => {
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
    onRefreshColliders: () => {}
  });
  runtime.load(SERVER_CATHEDRAL);

  const left = runtime.colliderObjects.find(collider => collider.userData.colliderId === 'west-logic-lock-shutter');
  const right = runtime.colliderObjects.find(collider => collider.userData.colliderId === 'east-logic-lock-shutter');
  const logicNodeColliders = runtime.colliderObjects.filter(collider => collider.userData.colliderTags.includes('logicDressing'));
  const choirColliders = runtime.colliderObjects.filter(collider => collider.userData.colliderTags.includes('choirDressing'));
  const rootColliders = runtime.colliderObjects.filter(collider => collider.userData.colliderTags.includes('rootDressing'));
  const endingColliders = runtime.colliderObjects.filter(collider => collider.userData.colliderTags.includes('endChoice'));
  assert.ok(logicNodeColliders.length > 0);
  assert.ok(choirColliders.length > 0 && rootColliders.length > 0 && endingColliders.length > 0);
  assert.equal(left.userData.colliderActive, false);
  assert.equal(right.userData.colliderActive, false);
  assert.ok(logicNodeColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(choirColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(rootColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(endingColliders.every(collider => collider.userData.colliderActive === false));

  runtime.onWaveStart(37);
  assert.equal(left.userData.colliderActive, true);
  assert.equal(right.userData.colliderActive, false);
  assert.ok(logicNodeColliders.every(collider => collider.userData.colliderActive === false));

  runtime.onWaveStart(38);
  assert.equal(left.userData.colliderActive, false);
  assert.equal(right.userData.colliderActive, true);
  assert.equal(runtime.group.getObjectByName('cathedral-false-targets').visible, true);
  assert.ok(logicNodeColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(choirColliders.every(collider => collider.userData.colliderActive === true));
  assert.ok(rootColliders.every(collider => collider.userData.colliderActive === false));

  runtime.onWaveStart(39);
  assert.equal(left.userData.colliderActive, false);
  assert.equal(right.userData.colliderActive, false);
  assert.ok(logicNodeColliders.every(collider => collider.userData.colliderActive === true));
  assert.ok(choirColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(rootColliders.every(collider => collider.userData.colliderActive === true));
  assert.ok(endingColliders.every(collider => collider.userData.colliderActive === false));
  SERVER_CATHEDRAL.objectives.logicNodes.forEach((target, index) => {
    const marker = runtime.group.getObjectByName(`cathedral-logic-node-ring-${index + 1}`);
    assert.ok(Math.abs(marker.position.x - target.position[0]) < .01);
    assert.ok(Math.abs(marker.position.z - target.position[1]) < .01);
    assert.equal(marker.visible, true);
  });

  runtime.onWaveStart(40);
  assert.ok(logicNodeColliders.every(collider => collider.userData.colliderActive === false));
  assert.ok(rootColliders.every(collider => collider.userData.colliderActive === true));
  assert.ok(endingColliders.every(collider => collider.userData.colliderActive === false));
  assert.equal(runtime.group.getObjectByName('cathedral-boss-ring').visible, true);
  assert.deepEqual(weatherCalls.at(-1), ['cathedral-boss-fog-wind', { immediate: false }]);
});

test('defeating the Algorithm reveals and commits the Free or Reset ending', () => {
  assert.ok(SERVER_CATHEDRAL.objectives.endingChoices.free.radius > 1);
  assert.ok(SERVER_CATHEDRAL.objectives.endingChoices.reset.radius > 1);
  const transitions = [];
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    onTransitionToLegacy: result => transitions.push(result)
  });
  runtime.load(SERVER_CATHEDRAL);
  runtime.onWaveStart(40);
  runtime.onBossDefeated(40);
  const endingColliders = runtime.colliderObjects.filter(collider => collider.userData.colliderTags.includes('endChoice'));
  assert.ok(endingColliders.length > 0);
  assert.ok(endingColliders.every(collider => collider.userData.colliderActive === true));
  runtime.update(4.1, { position: new THREE.Vector3(0, 0, 0) });
  assert.equal(runtime.objectiveState.kind, 'ending-choice');
  assert.equal(runtime.group.getObjectByName('cathedral-free-choice-ring').visible, true);
  assert.equal(transitions.length, 0);

  runtime.update(2.1, { position: new THREE.Vector3(-1.15, 0, 24) });
  assert.deepEqual(transitions, [{ endingChoice: 'free' }]);
  assert.equal(runtime.objectiveState.selected, 'free');
});

test('Server Cathedral P0 lighting is source-owned, diffused, grounded, and budgeted', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.load(SERVER_CATHEDRAL);

  const localLights = [];
  runtime.group.traverse(object => {
    if (object.isPointLight || object.isSpotLight) localLights.push(object);
  });
  assert.equal(localLights.length, 4, 'two mast keys, one Root Altar key, and one choice beacon key');
  assert.ok(localLights.every(light => light.castShadow === false));

  const authoredMasts = SERVER_CATHEDRAL.assets.filter(asset => asset.asset === 'lightmast');
  const mastKeys = [1, 2].map(index => runtime.group.getObjectByName(`cathedral-mast-key-${index}`));
  mastKeys.forEach((key, index) => {
    assert.ok(Math.abs(key.position.x - (authoredMasts[index].position[0] - .046)) < .001);
    assert.equal(key.position.y, 4.26);
    assert.ok(Math.abs(key.position.z - (authoredMasts[index].position[2] + .252)) < .001);
    assert.ok(key.target.parent === runtime.group);
  });
  assert.deepEqual(runtime.group.getObjectByName('cathedral-root-core-key').position.toArray(), [0, 1.89, 0]);
  assert.deepEqual(runtime.group.getObjectByName('cathedral-choice-beacon-key').position.toArray(), [0, 3, 22.92]);

  const diffusePools = [
    'cathedral-window-pool-1', 'cathedral-window-pool-2', 'cathedral-window-pool-3',
    'cathedral-mast-pool-1', 'cathedral-mast-pool-2',
    'cathedral-root-altar-pool', 'cathedral-algorithm-rim-pool',
    'cathedral-free-choice-pool', 'cathedral-reset-choice-pool'
  ].map(name => runtime.group.getObjectByName(name));
  assert.ok(diffusePools.every(pool => pool?.material?.isShaderMaterial));
  assert.ok(diffusePools.every(pool => pool.material.uniforms.uOpacity));

  const staticContacts = runtime.group.getObjectByName('cathedral-static-contact-shadows');
  const enemyContacts = runtime.group.getObjectByName('cathedral-enemy-contact-shadows');
  assert.equal(staticContacts.count, 13);
  assert.equal(staticContacts.material.isShaderMaterial, true);
  assert.equal(enemyContacts.material.isShaderMaterial, true);
});

test('Server Cathedral light hierarchy tracks every finale phase without losing route colors', () => {
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.load(SERVER_CATHEDRAL);

  const rootKey = runtime.group.getObjectByName('cathedral-root-core-key');
  const choiceKey = runtime.group.getObjectByName('cathedral-choice-beacon-key');
  const bossPool = runtime.group.getObjectByName('cathedral-algorithm-rim-pool');
  const windowPools = [1, 2, 3].map(index => runtime.group.getObjectByName(`cathedral-window-pool-${index}`));
  const routeColors = windowPools.map(pool => pool.material.uniforms.uColor.value.getHex());
  assert.equal(rootKey.visible, false);
  assert.equal(choiceKey.visible, false);
  assert.equal(bossPool.visible, false);

  runtime.onWaveStart(37);
  assert.equal(runtime.group.getObjectByName('cathedral-left-lock-pool').visible, true);
  assert.equal(runtime.group.getObjectByName('cathedral-right-lock-pool').visible, false);

  runtime.onWaveStart(38);
  assert.equal(runtime.group.getObjectByName('cathedral-left-lock-pool').visible, false);
  assert.equal(runtime.group.getObjectByName('cathedral-right-lock-pool').visible, true);
  assert.equal(runtime.group.getObjectByName('cathedral-choir-pool-west').visible, true);
  assert.equal(runtime.group.getObjectByName('cathedral-choir-pool-east').visible, true);

  runtime.onWaveStart(39);
  const wave39RootIntensity = rootKey.intensity;
  assert.equal(rootKey.visible, true);
  for (let index = 1; index <= 3; index += 1) {
    assert.equal(runtime.group.getObjectByName(`cathedral-logic-node-pool-${index}`).visible, true);
  }

  runtime.onWaveStart(40);
  assert.ok(rootKey.intensity > wave39RootIntensity);
  assert.equal(bossPool.visible, true);
  assert.deepEqual(windowPools.map(pool => pool.material.uniforms.uColor.value.getHex()), routeColors);
  const activeBossLights = [
    runtime.group.getObjectByName('cathedral-mast-key-1'),
    runtime.group.getObjectByName('cathedral-mast-key-2'),
    rootKey,
    choiceKey
  ].filter(light => light.visible && light.intensity > 0);
  assert.equal(activeBossLights.length, 3);

  runtime.onBossDefeated(40);
  assert.equal(bossPool.visible, false);
  assert.equal(choiceKey.visible, true);
  assert.equal(runtime.group.getObjectByName('cathedral-free-choice-pool').visible, true);
  assert.equal(runtime.group.getObjectByName('cathedral-reset-choice-pool').visible, true);
  assert.deepEqual(windowPools.map(pool => pool.material.uniforms.uColor.value.getHex()), routeColors);
});

test('campaign routing continues from Server Cathedral into the Wave 41 escape', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(wave >= 36\) return SERVER_CATHEDRAL/);
  assert.match(main, /'content-court': SERVER_CATHEDRAL/);
  assert.match(main, /if \(wave >= 41\) return LAST_ORDER_BASE/);
  assert.match(main, /'server-cathedral': LAST_ORDER_BASE/);
  assert.match(main, /Math\.min\(73, requestedRelayPreviewWave\)/);
  assert.match(main, /bs3d_ending_state/);
});
