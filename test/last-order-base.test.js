import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

import { LAST_ORDER_BASE } from '../src/levels/last-order-base.js';
import { LevelRuntime, validateLevelSpawnNetwork } from '../src/levels/runtime.js';
import { WeatherSystem } from '../src/weather.js';

test('Wave 41 is a single-purpose escape through the command-dead corridor', () => {
  assert.equal(LAST_ORDER_BASE.firstWave, 41);
  assert.equal(LAST_ORDER_BASE.finalWave, 41);
  assert.equal(LAST_ORDER_BASE.waves[41].objective, 'escape');
  assert.equal(LAST_ORDER_BASE.weatherByWave[41], 'last-order-base-fog');
  assert.equal(LAST_ORDER_BASE.hideWorldGrass, true);
  assert.deepEqual(new Set(LAST_ORDER_BASE.waves[41].packages.flat()), new Set(['bailiff', 'rusher_elite', 'shooter']));
  assert.equal(LAST_ORDER_BASE.waves[41].packages.flat().filter(type => type === 'rusher_elite').length, 3);
  assert.equal(LAST_ORDER_BASE.size[1], 104 * 1.8, 'the post-game tunnel should sustain a materially longer chase');
  assert.equal(validateLevelSpawnNetwork(LAST_ORDER_BASE).every(result => result.valid), true);
  const [width, depth] = LAST_ORDER_BASE.size;
  for (const entrance of LAST_ORDER_BASE.entrances) {
    assert.ok(Math.abs(entrance.position[0]) < width / 2 - 1);
    assert.ok(Math.abs(entrance.position[2]) < depth / 2 - 4);
  }
  const finish = LAST_ORDER_BASE.objectives.escape;
  assert.ok(Math.abs(finish.position[0]) < width / 2 - finish.radius);
  assert.ok(Math.abs(finish.position[1]) < depth / 2 - finish.radius - 4);
  const ceiling = LAST_ORDER_BASE.colliders.find(collider => collider.id === 'ceiling');
  assert.deepEqual(ceiling?.size, [18, .3, 104 * 1.8]);
  assert.equal(ceiling?.blocksGrounding, false);
});

test('the corridor keeps a continuous central escape lane', () => {
  const blockingCentralLane = LAST_ORDER_BASE.colliders.filter(collider => {
    if (collider.blocksGrounding === false) return false;
    const [, , z] = collider.position;
    const [width] = collider.size;
    return width >= 14 && Math.abs(z) < 44;
  });
  assert.deepEqual(blockingCentralLane.map(collider => collider.id), []);
});

test('castle guards occupy an alternating four-column chessboard grid', () => {
  const guards = LAST_ORDER_BASE.guardRows.positions;
  const west = guards.filter(guard => guard.side === 'west');
  const east = guards.filter(guard => guard.side === 'east');
  assert.equal(west.length, east.length);
  assert.ok(guards.length >= 24, 'the longer tunnel needs a sustained guard gauntlet');
  assert.ok(guards.length <= 28, 'the checkerboard must not recreate the expensive paired formation');
  assert.equal(guards.length, west.length + east.length);
  assert.deepEqual(new Set(guards.map(guard => guard.position[0])), new Set([-4.2, -1.4, 1.4, 4.2]));
  assert.equal(LAST_ORDER_BASE.guardRows.rowSpacing, 6);
  assert.equal(LAST_ORDER_BASE.guardRows.columnSpacing, 2.8);

  const rows = Map.groupBy(guards, guard => guard.position[2]);
  assert.equal(rows.size, guards.length / 2);
  let previousZ = null;
  let previousColumns = null;
  for (const [z, row] of rows) {
    const columns = row.map(guard => guard.position[0]);
    assert.equal(row.length, 2);
    assert.ok(
      columns.every(x => [-4.2, 1.4].includes(x))
        || columns.every(x => [-1.4, 4.2].includes(x))
    );
    assert.ok(Math.abs(columns[1] - columns[0]) >= 5.6, 'each rank must leave a wide traversable gap');
    if (previousZ !== null) {
      assert.ok([6, 12].some(spacing => Math.abs((previousZ - z) - spacing) < 1e-6));
      assert.ok(columns.every(x => !previousColumns.includes(x)));
    }
    previousZ = z;
    previousColumns = columns;
  }
  const signZs = LAST_ORDER_BASE.assets
    .filter(asset => asset.asset === 'emergencysign')
    .map(asset => asset.position[2]);
  assert.ok(guards.every(guard => signZs.every(z => Math.abs(guard.position[2] - z) >= 1.2)));
});

test('castle guards have body-radius clearance from every grounding collider', () => {
  const gruntRadius = .58;
  const colliders = LAST_ORDER_BASE.colliders.filter(collider => (
    collider.blocksMovement !== false && collider.blocksGrounding !== false
  ));
  for (const guard of LAST_ORDER_BASE.guardRows.positions) {
    for (const collider of colliders) {
      const [cx, , cz] = collider.position;
      const [width, , depth] = collider.size;
      const yaw = collider.rotation?.[1] || 0;
      const dx = guard.position[0] - cx;
      const dz = guard.position[2] - cz;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      const nearestX = Math.max(-width / 2, Math.min(localX, width / 2));
      const nearestZ = Math.max(-depth / 2, Math.min(localZ, depth / 2));
      const clearance = Math.hypot(localX - nearestX, localZ - nearestZ);
      assert.ok(
        clearance >= gruntRadius,
        `${guard.side} guard at z=${guard.position[2]} overlaps ${collider.id}`
      );
    }
  }
});

test('grid guards stream around the player without entering the wave counter', () => {
  const spawnCalls = [];
  const removed = [];
  const scene = new THREE.Scene();
  const enemyManager = {
    wave: 41,
    enemies: new Set(),
    instanceByRoot: new WeakMap(),
    combatVisibilityRange: Infinity,
    _groundHeightAt() { return .12; },
    setEncounterHooks(hooks) { this.hooks = hooks; },
    queueAuthoredEnemies() {},
    tryAdvanceWave() {},
    isSpawnPointClear() { return true; },
    spawnAt(type, position, options) {
      const root = new THREE.Group();
      root.position.copy(position);
      root.userData = { type, hp: 100, maxHp: 100 };
      scene.add(root);
      const instance = { speed: 2.5, role: 'flanker' };
      this.enemies.add(root);
      this.instanceByRoot.set(root, instance);
      this.hooks.configureSpawnedEnemy({ root, instance, type, wave: 41 });
      spawnCalls.push({ type, position: position.clone(), options, root, instance });
      return root;
    },
    remove(root) {
      removed.push(root);
      this.enemies.delete(root);
    }
  };
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.attach({ enemyManager });
  runtime.load(LAST_ORDER_BASE);
  runtime.onWaveStart(41);

  const firstGuardZ = LAST_ORDER_BASE.guardRows.positions[0].position[2];
  runtime._updateLastOrder(0, new THREE.Vector3(0, 1.7, firstGuardZ + 22.5));
  assert.equal(spawnCalls.length, 2);
  assert.ok(spawnCalls.every(call => call.type === 'grunt' && call.options.countsTowardAlive === false));
  assert.ok(spawnCalls.every(call => call.root.userData.movementLocked));
  assert.ok(spawnCalls.every(call => Math.abs(call.position.y - .92) < 1e-6));
  assert.ok(spawnCalls.every(call => Math.abs(call.root.userData.lastOrderGuardSpawnY - .92) < 1e-6));
  assert.ok(spawnCalls.every(call => call.root.userData.hp === Infinity));
  assert.ok(spawnCalls.every(call => call.instance.speed === 3.45 && call.instance.role === 'pursuer'));

  const firstSpawn = spawnCalls[0];
  runtime._updateLastOrder(0, new THREE.Vector3(0, 1.7, firstGuardZ + 7.5));
  assert.equal(firstSpawn.root.userData.movementLocked, false);
  runtime._updateLastOrder(0, new THREE.Vector3(0, 1.7, firstGuardZ - 4.6));
  assert.equal(removed.length, 0, 'passed guards must remain for the shutdown tableau');
  assert.ok(enemyManager.enemies.has(firstSpawn.root));
  assert.equal(firstSpawn.root.userData.movementLocked, true);

  const terminalZ = LAST_ORDER_BASE.objectives.escape.position[1];
  const terminalPlayer = { position: new THREE.Vector3(0, 1.7, terminalZ) };
  runtime.update(0, terminalPlayer);
  assert.equal(runtime.objectiveState.phase, 'powerdown');
  assert.ok(runtime.lastOrderCollapse.some(entry => entry.root === firstSpawn.root));
  runtime.update(1, terminalPlayer);
  assert.ok(Math.abs(firstSpawn.root.rotation.z) > .1);
});

test('escape enemies are command-locked until the dead zone powers them down', () => {
  const transitions = [];
  let powerdownCalls = 0;
  const weatherModes = [];
  const enemyManager = {
    wave: 41,
    enemies: new Set(),
    combatVisibilityRange: Infinity,
    setEncounterHooks(hooks) { this.hooks = hooks; },
    queueAuthoredEnemies() {},
    tryAdvanceWave() {},
    isSpawnPointClear() { return true; },
    clearProjectiles() { this.projectilesCleared = true; }
  };
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode(mode, options) { weatherModes.push({ mode, options }); } },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {},
    onTransitionToLegacy: result => transitions.push(result),
    onLastOrderPowerdown: () => { powerdownCalls += 1; }
  });
  runtime.attach({ enemyManager });
  runtime.load(LAST_ORDER_BASE);
  runtime.onWaveStart(41);

  const pursuer = new THREE.Group();
  pursuer.userData = { hp: 80, maxHp: 80 };
  pursuer.position.set(-2, .8, -36);
  runtime.scene.add(pursuer);
  enemyManager.enemies.add(pursuer);
  const interceptor = { speed: 8.2, _spawnDelay: 4.5, _dashCooldown: 2 };
  enemyManager.hooks.configureSpawnedEnemy({ root: pursuer, instance: interceptor, type: 'rusher_elite', wave: 41 });
  assert.equal(pursuer.userData.hp, Infinity);
  assert.equal(pursuer.userData.commandLocked, true);
  assert.equal(interceptor.speed, 9.15);
  assert.equal(interceptor._spawnDelay, 0);
  assert.equal(interceptor._dashCooldown, 0);

  const terminalZ = LAST_ORDER_BASE.objectives.escape.position[1];
  const stormEntryPlayer = { position: new THREE.Vector3(0, 1.7, terminalZ + 14.4) };
  runtime.update(0, stormEntryPlayer);
  assert.equal(runtime.objectiveState.phase, 'chase');
  assert.equal(runtime.objectiveState.stormEntered, true);
  assert.deepEqual(weatherModes.at(-1), { mode: 'last-order-heavy-sand-fog-wind', options: { immediate: true } });

  const player = { position: new THREE.Vector3(0, 1.7, terminalZ) };
  runtime.update(0, player);
  assert.equal(runtime.objectiveState.phase, 'powerdown');
  assert.equal(powerdownCalls, 1);
  assert.equal(enemyManager.projectilesCleared, true);
  assert.equal(pursuer.userData.stunnedUntil, Infinity);
  assert.deepEqual(weatherModes.at(-1), { mode: 'last-order-heavy-sand-fog-wind', options: { immediate: true } });

  runtime.update(1, player);
  assert.ok(Math.abs(pursuer.rotation.z) > .1, 'the powered-down pursuer should visibly fall');
  runtime.update(6, player);
  assert.deepEqual(transitions, [{ lastOrderComplete: true }]);
});

test('the corridor has solid airlocks and a sandstorm handoff with a grounded mug', () => {
  const colliderIds = new Set(LAST_ORDER_BASE.colliders.map(collider => collider.id));
  assert.ok(colliderIds.has('north-wall'));
  assert.ok(colliderIds.has('south-wall'));
  assert.ok(colliderIds.has('rear-airlock-gate'));
  assert.ok(colliderIds.has('finish-airlock-gate'));

  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.load(LAST_ORDER_BASE);
  assert.ok(runtime.group.getObjectByName('last-order-start-wall'));
  assert.ok(runtime.group.getObjectByName('last-order-end-wall'));
  assert.ok(runtime.group.getObjectByName('last-order-rear-gate'));
  assert.ok(runtime.group.getObjectByName('last-order-finish-gate'));
  const sandMass = runtime.group.getObjectByName('last-order-end-wall');
  assert.equal(sandMass.userData.transitionSurface, 'sand-3d-heightfield');
  assert.ok(sandMass.geometry.attributes.position.count > 800);
  assert.ok(sandMass.geometry.attributes.normal, 'the dune must react to tunnel lighting as a 3D surface');
  assert.ok(runtime.group.getObjectByName('last-order-sandstorm-veil'));
  const haze = runtime.group.getObjectByName('last-order-heavy-sand-haze');
  assert.equal(haze.children.length, 17);
  assert.ok(haze.children.every(layer => layer.material.isShaderMaterial && layer.material.uniforms.uDensity.value >= .12));
  const mug = runtime.group.getObjectByName('last-order-mug');
  assert.ok(mug);
  assert.ok(Math.abs(mug.position.x) < .7, 'the mug should sit within the terminal top');
  const authoredTerminalZ = LAST_ORDER_BASE.objectives.escape.position[1];
  assert.ok(mug.position.z < authoredTerminalZ - .2 && mug.position.z > authoredTerminalZ - .7, 'the mug should rest on the terminal shelf');
  assert.equal(mug.getObjectByName('last-order-mug-handle').rotation.y, 0);
  const dust = runtime.group.getObjectByName('last-order-airlock-dust');
  assert.equal(dust.geometry.attributes.position.count, 900);
  assert.ok(dust.material.isShaderMaterial, 'sand motes need soft radial alpha instead of square point sprites');
  assert.equal(dust.userData.nearZ, authoredTerminalZ + 12, 'the storm should occupy a broad final tunnel section');
  const dustZ = dust.geometry.attributes.position;
  for (let index = 0; index < dustZ.count; index += 1) {
    assert.ok(dustZ.getZ(index) <= dust.userData.nearZ + 1e-4 && dustZ.getZ(index) >= dust.userData.farZ - 1e-4);
  }
  assert.equal(runtime.group.getObjectByName('last-order-sand-drifts').count, 14);
});

test('authored levels disable the legacy world boundary collision and restore it on unload', () => {
  const boundary = new THREE.Mesh(new THREE.BoxGeometry(80, 6, 1), new THREE.MeshBasicMaterial());
  boundary.userData = { arenaBoundary: true };
  const objects = [boundary];
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => {},
    onRefreshColliders: () => {}
  });
  runtime.load(LAST_ORDER_BASE);
  assert.equal(boundary.visible, false);
  assert.equal(boundary.userData.blocksMovement, false);
  runtime.unload();
  assert.equal(boundary.visible, true);
  assert.equal(boundary.userData.blocksMovement, undefined);
});

test('the enclosed tunnel skips the 20k world-grass cull and restores visibility on exit', () => {
  const grassMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  grassMesh.visible = true;
  let cullCalls = 0;
  const runtime = new LevelRuntime({
    THREE,
    scene: new THREE.Scene(),
    objects: [],
    grassMesh,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass: () => { cullCalls += 1; },
    onRefreshColliders: () => {}
  });

  runtime.load(LAST_ORDER_BASE);
  assert.equal(grassMesh.visible, false);
  assert.equal(cullCalls, 0, 'hidden grass should not scan all instance offsets');
  runtime.unload({ restoreGrass: false });
  assert.equal(grassMesh.visible, true);
  assert.equal(cullCalls, 0);
});

test('Wave 41 starts in cold fog and the terminal storm reduces sight to a silhouette', () => {
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
    weather.setMode('last-order-base-fog', { immediate: true });
    assert.equal(weather._mixTarget.fog, .46);
    assert.equal(weather._mixTarget.sand, 0);
    assert.equal(weather._envTarget.fogNear, 8);
    assert.equal(weather._envTarget.fogFar, 62);

    weather.setMode('last-order-heavy-sand-fog-wind', { immediate: true });
    assert.equal(weather._mixTarget.fog, 1);
    assert.equal(weather._mixTarget.sand, 1);
    assert.equal(weather._mixTarget.wind, 1);
    assert.equal(weather._envTarget.fogNear, .05);
    assert.equal(weather._envTarget.fogFar, 2.1);
    assert.ok(Math.abs(scene.fog.far - 2.1) < 1e-6);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('campaign routing inserts Wave 41 and starts the shifted Expanse at Wave 42', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(wave >= 42\) return SANDSTORM_EXPANSE/);
  assert.match(main, /if \(wave >= 41\) return LAST_ORDER_BASE/);
  assert.match(main, /'server-cathedral': LAST_ORDER_BASE/);
  assert.match(main, /enemyManager\.reset\(\{ wave: 42 \}\)/);
  assert.match(main, /lastOrderComplete/);
});
