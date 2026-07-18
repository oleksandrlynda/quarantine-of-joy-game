import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { EnemyManager } from '../enemies.js';
import { APP_VERSION } from '../version.js';
import {
  ENEMY_REACTION_ARCHETYPES,
  ENEMY_REACTION_SCENARIOS,
  EnemyReactionMetrics,
  buildEnemyReactionMatrix,
  buildEnemyReactionReport,
  evaluateEnemyReaction
} from './enemy-reaction-diagnostic.js';
import { isScenarioApplicable } from '../enemies/behavior-profiles.js';

const elements = {
  enemy: document.getElementById('enemyFilter'), scenario: document.getElementById('scenarioFilter'),
  run: document.getElementById('run'), stop: document.getElementById('stop'), copy: document.getElementById('copyReport'),
  download: document.getElementById('downloadReport'), status: document.getElementById('status'),
  elapsed: document.getElementById('elapsed'), progress: document.getElementById('progress'),
  rows: document.getElementById('rows'), output: document.getElementById('output'),
  pass: document.getElementById('passCount'), warn: document.getElementById('warnCount'), fail: document.getElementById('failCount'),
  inconclusive: document.getElementById('inconclusiveCount'), notApplicable: document.getElementById('notApplicableCount')
};

for (const item of ENEMY_REACTION_ARCHETYPES) elements.enemy.add(new Option(item.label, item.id));
for (const item of ENEMY_REACTION_SCENARIOS) elements.scenario.add(new Option(item.label, item.id));

const params = new URL(location.href).searchParams;
if (params.has('enemy')) elements.enemy.value = params.get('enemy');
if (params.has('scenario')) elements.scenario.value = params.get('scenario');
const speed = THREE.MathUtils.clamp(Number(params.get('speed')) || 8, 0.25, 12);
const autoRun = params.get('autorun') === '1';
const deterministicFrameDriver = params.get('frameDriver') === 'deterministic';
const storedReportView = params.get('storedReport');
const errors = [];
const interruptions = [];
let report = null;
let running = false;
let stopRequested = false;
let runStartedAt = 0;
let hiddenAt = null;

const seededRandom = (seed = 0x0ea7c0de) => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
};
const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

function recordError(error, source = 'runtime') {
  const value = error instanceof Error ? error : new Error(String(error));
  errors.push({ atMs: round(performance.now() - runStartedAt, 1), source, name: value.name, message: value.message, stack: String(value.stack || '').slice(0, 1600) });
}
window.addEventListener('error', event => recordError(event.error || event.message, 'window.error'));
window.addEventListener('unhandledrejection', event => recordError(event.reason, 'unhandledrejection'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt != null) {
    interruptions.push({ type: 'tab_hidden', durationMs: round(performance.now() - hiddenAt, 1) });
    hiddenAt = null;
  }
});

const renderer = new THREE.WebGLRenderer({ antialias: params.get('aa') !== '0', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1727);
scene.fog = new THREE.Fog(0x0a1727, 70, 180);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 220);
camera.position.set(16, 18, 22);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x17243a, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(8, 18, 12);
scene.add(keyLight);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x18334a, roughness: 0.9, metalness: 0.05 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(180, 90, 0x4f91b8, 0x244b64);
grid.position.y = 0.01;
scene.add(grid);
const player = new THREE.Group();
player.position.set(0, 1.7, -8);
const playerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 5, 10), new THREE.MeshStandardMaterial({ color: 0x56d9ff, emissive: 0x08364c }));
playerMesh.position.y = 0;
player.add(playerMesh);
scene.add(player);

const mats = {
  floor: floor.material,
  wall: new THREE.MeshLambertMaterial({ color: 0xe1a95f }),
  crate: new THREE.MeshLambertMaterial({ color: 0xb57437 }),
  enemy: new THREE.MeshLambertMaterial({ color: 0xef4444 }),
  head: new THREE.MeshLambertMaterial({ color: 0x111827 }),
  tracer: new THREE.LineBasicMaterial({ color: 0xffffff }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffaa00 })
};
const objects = [];
let activeObstacle = null;
let activeObstacleParts = [];
let targetRoot = null;
let blockerRoot = null;
let metrics = null;
let scenarioElapsed = 0;
let lastLos = null;
let lastState = '';
let attemptedMoveSinceSample = false;
let movedDistanceSinceTick = 0;
let scenarioGroupRoots = new Set();
let groupActorSerial = 0;
let currentDefinition = null;
let resultRows = new Map();

const playerForward = new THREE.Vector3(1, 0, 0);
const getPlayer = () => ({ position: player.position.clone(), forward: playerForward.clone() });
const manager = new EnemyManager(THREE, scene, mats, objects, getPlayer, 40, null, seededRandom());
manager.suspendWaves = true;
const runtimeIsLastWaveEnemy = manager.isLastWaveEnemy.bind(manager);

const originalMove = manager._moveWithCollisions.bind(manager);
manager._moveWithCollisions = (enemy, step) => {
  const before = enemy.position.clone();
  if (enemy === targetRoot) {
    attemptedMoveSinceSample ||= step.lengthSq() > 1e-7;
    metrics && metrics.moveAttempts++;
  }
  const result = originalMove(enemy, step);
  if (enemy === targetRoot) movedDistanceSinceTick += before.distanceTo(enemy.position);
  if (enemy === targetRoot && metrics) metrics.recordMovement(scenarioElapsed * 1000, result);
  if (metrics && scenarioGroupRoots.has(enemy)) {
    metrics.recordGroupMovement(
      scenarioElapsed * 1000,
      result,
      enemy.userData?.diagnosticActorId || enemy.userData?.behaviorId || enemy.userData?.type
    );
  }
  return result;
};
manager.onAIEvent = event => {
  if (!metrics || !targetRoot) return;
  const sourceIsScenarioMember = scenarioGroupRoots.has(event.root);
  const targetInstance = manager.instanceByRoot.get(targetRoot);
  const sourceIsWardenChild = currentDefinition?.archetype.id === 'warden'
    && targetInstance?._children?.has?.(event.root);
  if (!sourceIsScenarioMember && !sourceIsWardenChild) return;
  if (event.type === 'projectile_fired') {
    recordActorShot(event.root, event.kind || event.root?.userData?.behaviorId || 'unknown');
    return;
  }
  metrics.recordAIEvent(scenarioElapsed * 1000, event, {
    healerHidden: currentDefinition?.archetype.id === 'healer'
      && !hasLineOfSight(targetRoot.position, player.position),
    targetRoot
  });
};

function addObstacle(kind, centerZ, archetype, centerX = 0, rotationY = 0) {
  if (activeObstacle) return;
  activeObstacleParts = [];
  if (kind === 'narrow_choke') {
    activeObstacle = new THREE.Group();
    for (const x of [-2.4, 2.4]) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.5, 1.0), mats.wall);
      part.position.set(x, 1.75, centerZ);
      activeObstacle.add(part);
      activeObstacleParts.push(part);
    }
  } else if (kind === 'barrel') {
    activeObstacle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.15, 16), mats.crate);
    activeObstacle.position.set(centerX, 0.575, centerZ);
    activeObstacleParts.push(activeObstacle);
  } else {
    const isFullOccluder = kind === 'full_wall' || kind === 'search_wall';
    const isWallEdge = kind === 'wall_edge';
    const height = (isFullOccluder || isWallEdge) ? (archetype.id === 'warden' ? 36 : 3.5) : 0.9;
    const width = isWallEdge ? 3.2 : (kind === 'search_wall' ? 96 : (isFullOccluder ? 10 : 4.5));
    activeObstacle = new THREE.Mesh(new THREE.BoxGeometry(width, height, isFullOccluder ? 0.8 : 1.0), mats.wall);
    activeObstacle.position.set(centerX, height / 2, centerZ);
    activeObstacleParts.push(activeObstacle);
  }
  activeObstacle.rotation.y = rotationY;
  activeObstacle.name = `diagnostic_${kind}`;
  activeObstacle.userData.diagnosticObstacleKind = kind;
  scene.add(activeObstacle);
  objects.push(...activeObstacleParts);
  manager.refreshColliders(objects);
}

function removeObstacle() {
  if (!activeObstacle) return;
  scene.remove(activeObstacle);
  for (const part of activeObstacleParts) {
    const index = objects.indexOf(part);
    if (index >= 0) objects.splice(index, 1);
    part.geometry?.dispose?.();
  }
  activeObstacle = null;
  activeObstacleParts = [];
  manager.refreshColliders(objects);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function shotOrigin(instance, sourceRoot = targetRoot) {
  if (instance?._muzzleWorld) return instance._muzzleWorld();
  return sourceRoot.position.clone().add(new THREE.Vector3(0, 0.8, 0));
}

function tacticalLineOfSight(instance, sourceRoot = targetRoot) {
  const origin = shotOrigin(instance, sourceRoot);
  const line = manager._tacticalLineClear(sourceRoot, origin, player.position, 0.18);
  return {
    worldVisible: line.worldClear,
    tacticalVisible: line.clear,
    blockingAlly: line.blockerRoot
  };
}

function recordActorShot(sourceRoot, kind) {
  if (!metrics || !sourceRoot) return;
  const sight = tacticalLineOfSight(manager.instanceByRoot.get(sourceRoot), sourceRoot);
  metrics.recordShot(scenarioElapsed * 1000, {
    ...sight,
    kind,
    actorId: sourceRoot.userData?.diagnosticActorId || sourceRoot.userData?.behaviorId || sourceRoot.userData?.type
  });
}

function hasLineOfSight(from, to, exactOrigin = false) {
  if (!objects.length) return true;
  const origin = exactOrigin ? from.clone() : from.clone().add(new THREE.Vector3(0, 0.8, 0));
  const target = to.clone();
  const direction = target.sub(origin);
  const distance = direction.length();
  const ray = new THREE.Raycaster(origin, direction.normalize(), 0, Math.max(0, distance - 0.05));
  return ray.intersectObjects(objects, false).length === 0;
}

function compactState(instance) {
  if (!instance) return 'missing';
  if (instance.root?.userData?.aiState) return instance.root.userData.aiState;
  if (instance._charging) return 'dash';
  if ((instance._windUpTimer || 0) > 0) return 'dash_windup';
  if ((instance._recoverTimer || 0) > 0) return 'dash_recover';
  if ((instance._stunTimer || 0) > 0) return 'stunned';
  if (instance.inBurst) return 'firing_burst';
  if ((instance.windupTime || 0) > 0 || (instance.windup || 0) > 0) return 'aim_windup';
  if (instance.relocating || (instance.postShotRelocate || 0) > 0) return 'relocating';
  if ((instance.tuckTimer || 0) > 0) return 'tucked';
  if (instance.peekOffset) return 'peeking';
  if ((instance.pulseTimer || 0) > 0) return 'healing_pulse';
  if (instance.state && instance.state !== 'idle') return instance.state;
  if (instance._attackPhase && instance._attackPhase !== 'idle') return `melee_${instance._attackPhase}`;
  return 'idle';
}

function installPathLogging() {
  const pathfind = manager._ctx?.pathfind;
  if (!pathfind || pathfind.__diagnosticWrapped) return;
  const originalRecompute = pathfind.recomputeIfStale;
  pathfind.recomputeIfStale = (enemy, goal, options = {}) => {
    const promise = originalRecompute(enemy, goal, options);
    const recomputed = !!promise.pathRecomputed;
    if (enemy === manager.instanceByRoot.get(targetRoot) && metrics) {
      if (promise.pathRecomputed) {
        metrics.pathRequests++;
        metrics.addEvent(scenarioElapsed * 1000, 'path_requested', { goal: { x: round(goal.x), z: round(goal.z) } });
      } else {
        metrics.pathCacheHits++;
      }
    }
    promise.then(path => {
      if (!recomputed || enemy !== manager.instanceByRoot.get(targetRoot) || !metrics) return;
      metrics.pathResolutions++;
      if (!path?.length) metrics.pathFailures++;
      metrics.addEvent(scenarioElapsed * 1000, 'path_resolved', { waypoints: path?.length || 0 });
    }).catch(error => recordError(error, 'pathfind'));
    return promise;
  };
  pathfind.__diagnosticWrapped = true;
}

function clearActors() {
  removeObstacle();
  manager.reset();
  manager.suspendWaves = true;
  // EnemyManager.reset clears the public sets but intentionally preserves some
  // hot-path caches used by the game. A multi-scenario diagnostic must not let
  // stale raycast roots or root indices leak into the next isolated case.
  manager._enemyRootsArr.length = 0;
  manager._rootIndex = new WeakMap();
  manager.instanceByRoot = new WeakMap();
  targetRoot = null;
  blockerRoot = null;
  scenarioGroupRoots = new Set();
  groupActorSerial = 0;
  manager._ctx = null;
}

function mixedCompanionTypes(archetype) {
  if (archetype.id === 'healer') return ['tank', 'shooter', 'grunt'];
  if (archetype.id === 'flyer') return ['flyer', 'shooter', 'tank'];
  if (archetype.role === 'ranged' || archetype.role === 'sniper') return ['tank', 'grunt', 'healer'];
  return ['grunt', 'shooter', 'healer'];
}

function setupScenario(definition) {
  clearActors();
  currentDefinition = definition;
  manager.isLastWaveEnemy = root => definition.scenario.id === 'last_survivor_bomb'
    && runtimeIsLastWaveEnemy(root);
  scenarioElapsed = 0;
  lastLos = null;
  lastState = '';
  attemptedMoveSinceSample = false;
  player.position.set(0, 1.7, -8);
  player.userData.combatHp = 100;
  player.userData.combatMaxHp = 100;
  playerForward.set(1, 0, 0);
  const targetZ = player.position.z + definition.archetype.spawnDistance;
  targetRoot = manager.spawnAt(definition.archetype.id, new THREE.Vector3(0, 0.8, targetZ), { countsTowardAlive: true });
  targetRoot.userData.hp = 1e9;
  targetRoot.userData.maxHp = 1e9;
  targetRoot.userData.diagnosticActorId = 'primary';
  scenarioGroupRoots.add(targetRoot);
  const instance = manager.instanceByRoot.get(targetRoot);
  const obstacleZ = (player.position.z + targetZ) / 2;
  const spawnFixtureAlly = (type, position, { hp = 1e9, maxHp = 1e9 } = {}) => {
    const root = manager.spawnAt(type, position, { countsTowardAlive: true });
    root.userData.hp = hp;
    root.userData.maxHp = maxHp;
    root.userData.stunnedUntil = Infinity;
    return root;
  };
  const spawnGroupEnemy = (type, position) => {
    const root = manager.spawnAt(type, position, { countsTowardAlive: true });
    root.userData.hp = 1e9;
    root.userData.maxHp = 1e9;
    root.userData.diagnosticActorId = `group_${++groupActorSerial}`;
    scenarioGroupRoots.add(root);
    return root;
  };
  if (definition.scenario.id === 'wall_occlusion' || definition.scenario.id === 'sight_reacquisition') {
    addObstacle('full_wall', obstacleZ, definition.archetype);
  } else if (definition.scenario.id === 'wall_edge_stability') {
    addObstacle('wall_edge', obstacleZ, definition.archetype, -1.5);
  } else if (definition.scenario.id === 'narrow_choke') {
    addObstacle('narrow_choke', obstacleZ, definition.archetype);
  } else if (definition.scenario.id === 'low_wall_navigation') {
    if (definition.archetype.role === 'ranged' || definition.archetype.role === 'sniper') {
      const side = instance?.strafeDir || instance?._strafeDir || 1;
      addObstacle('low_wall', targetZ, definition.archetype, side * 2.0, Math.PI / 2);
    } else if (definition.archetype.id === 'healer') {
      addObstacle('low_wall', targetZ + 2.5, definition.archetype, 0, 0);
    } else {
      addObstacle('low_wall', obstacleZ, definition.archetype);
    }
  } else if (definition.scenario.id === 'barrel_navigation') {
    if (definition.archetype.role === 'ranged' || definition.archetype.role === 'sniper') {
      const side = instance?.strafeDir || instance?._strafeDir || 1;
      addObstacle('barrel', targetZ, definition.archetype, side * 1.5);
    } else if (definition.archetype.id === 'healer') {
      addObstacle('barrel', targetZ + 1.8, definition.archetype);
    } else {
      addObstacle('barrel', obstacleZ, definition.archetype);
    }
  }
  if (['ally_blocking', 'ally_blocked_charge'].includes(definition.scenario.id)) {
    blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(0, 0.8, targetZ - 2.4));
  } else if (definition.scenario.id === 'crossing_ally') {
    blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(-4, 0.8, targetZ - 3.5));
  } else if (['ally_fire_blocking', 'sniper_ally_obstruction'].includes(definition.scenario.id)) {
    blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(0, 0.8, (player.position.z + targetZ) * 0.5));
  } else if (definition.scenario.id === 'ally_cover_usage') {
    blockerRoot = spawnFixtureAlly('tank', new THREE.Vector3(0, 1.1, targetZ - 8));
    blockerRoot.userData.diagnosticActorId = 'mobile_cover_tank';
  } else if (definition.scenario.id === 'aerial_congestion') {
    blockerRoot = spawnFixtureAlly('flyer', new THREE.Vector3(0.35, targetRoot.position.y, targetZ - 1.0));
  } else if (definition.scenario.id === 'dive_corridor') {
    blockerRoot = spawnFixtureAlly('flyer', new THREE.Vector3(0, Math.max(3, targetRoot.position.y - 1.5), (player.position.z + targetZ) * 0.5));
  }

  if (definition.scenario.healerSetup) {
    if (definition.scenario.healerSetup === 'injured_cover') {
      addObstacle('full_wall', targetZ - 4, definition.archetype);
      blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(1.2, 0.8, targetZ - 2), { hp: 30, maxHp: 100 });
    } else if (definition.scenario.healerSetup === 'injured_exposed') {
      blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(1.2, 0.8, targetZ - 2), { hp: 30, maxHp: 100 });
    } else if (definition.scenario.healerSetup === 'healthy_group') {
      blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(-1.5, 0.8, targetZ - 2), { hp: 100, maxHp: 100 });
      spawnFixtureAlly('tank', new THREE.Vector3(1.8, 1.1, targetZ - 2.5), { hp: 220, maxHp: 220 });
    } else if (definition.scenario.healerSetup === 'alone') {
      // The last-survivor bomb needs a clear chase lane so its fuse, damage,
      // attribution, and self-removal are all exercised deterministically.
    } else if (definition.scenario.healerSetup === 'two_healers') {
      blockerRoot = spawnFixtureAlly('grunt', new THREE.Vector3(0, 0.8, targetZ - 2), { hp: 25, maxHp: 100 });
      spawnFixtureAlly('healer', new THREE.Vector3(2.2, 0.8, targetZ + 0.5));
    }
  }
  if (definition.scenario.groupSetup) {
    const companionCount = Math.max(0, (definition.scenario.groupSize || 1) - 1);
    const sameTypeOffsets = [
      { x: 2.6, y: 0, z: 0.6 },
      { x: -2.6, y: 1.05, z: 0.6 },
      { x: 0, y: 0, z: 2.8 }
    ];
    const mixedOffsets = [
      { x: -1.8, y: 0, z: -3.0 },
      { x: 2.8, y: 1.05, z: 0.8 },
      { x: -2.8, y: 0, z: 2.8 }
    ];
    const types = definition.scenario.groupSetup === 'same_type'
      ? Array.from({ length: companionCount }, () => definition.archetype.id)
      : mixedCompanionTypes(definition.archetype).slice(0, companionCount);
    const offsets = definition.scenario.groupSetup === 'same_type' ? sameTypeOffsets : mixedOffsets;
    for (let index = 0; index < types.length; index++) {
      const offset = offsets[index];
      const isAir = types[index] === 'flyer';
      const root = spawnGroupEnemy(types[index], new THREE.Vector3(
        offset.x,
        isAir ? targetRoot.position.y + offset.y : 0.8,
        targetZ + offset.z
      ));
      blockerRoot ||= root;
    }
    if (definition.scenario.groupSetup === 'mixed') {
      const injured = Array.from(scenarioGroupRoots).find(root => root !== targetRoot && root.userData?.behaviorId !== 'healer');
      if (injured) injured.userData.hp = Math.max(1, injured.userData.maxHp - 300);
    }
  }
  const distance = horizontalDistance(targetRoot.position, player.position);
  metrics = new EnemyReactionMetrics({
    enemyId: definition.archetype.id,
    role: definition.archetype.role,
    scenarioId: definition.scenario.id,
    startPosition: targetRoot.position,
    initialPlayerDistance: distance,
    preferredBand: definition.archetype.preferredBand,
    expectedGroupSize: definition.scenario.groupSize || 1
  });
  metrics.addEvent(0, 'scenario_started', { enemy: definition.archetype.id, scenario: definition.scenario.id, initialPlayerDistance: round(distance) });
}

function updateScenario(dt) {
  scenarioElapsed += dt;
  const scenario = currentDefinition.scenario;
  if (scenario.id === 'moving_target') player.position.x = Math.sin(scenarioElapsed * 1.25) * 6;
  if (scenario.groupSetup) player.position.x = Math.sin(scenarioElapsed * 0.75) * 3;
  if (scenario.id === 'crossing_ally' && blockerRoot) blockerRoot.position.x = Math.sin(scenarioElapsed * 1.1) * 4;
  if (scenario.id === 'ally_cover_usage' && blockerRoot) {
    blockerRoot.position.x = Math.sin(scenarioElapsed * 0.42) * 1.35;
  }
  if (scenario.id === 'last_known_search' && scenarioElapsed >= scenario.hideAtSeconds && !activeObstacle) {
    addObstacle('search_wall', (player.position.z + targetRoot.position.z) * 0.5, currentDefinition.archetype);
    player.position.x = 2.5;
    metrics.addEvent(scenarioElapsed * 1000, 'player_hidden_and_moved');
  }
  if (scenario.id === 'sight_reacquisition' && activeObstacle && scenarioElapsed >= scenario.revealAtSeconds) {
    removeObstacle();
    metrics.revealedAtMs = scenarioElapsed * 1000;
    metrics.addEvent(metrics.revealedAtMs, 'player_revealed');
  }
  const instance = manager.instanceByRoot.get(targetRoot);
  if (scenario.id === 'lost_los_cancellation' && scenarioElapsed >= scenario.obstacleAtSeconds && !activeObstacle) {
    addObstacle('full_wall', (player.position.z + targetRoot.position.z) * 0.5, currentDefinition.archetype);
    metrics.addEvent(scenarioElapsed * 1000, 'los_forced_hidden');
  }
  if (scenario.id === 'wall_impact' && instance?._charging && !activeObstacle) {
    addObstacle('full_wall', targetRoot.position.z - 2.2, currentDefinition.archetype);
    metrics.addEvent(scenarioElapsed * 1000, 'charge_wall_inserted');
  }
  if (scenario.id === 'miss_recovery' && instance?._charging) player.position.x = 8;
  if (scenario.id === 'range_recovery') {
    if (scenarioElapsed >= (scenario.rushPlayerAtSeconds || 4) && scenarioElapsed < 9) {
      player.position.set(targetRoot.position.x + 2.5, 1.7, targetRoot.position.z - 1);
    } else if (scenarioElapsed >= 9) {
      player.position.set(0, 1.7, -8);
    }
  }
  if (scenario.playerAiming === true) {
    playerForward.copy(targetRoot.position).sub(player.position).setY(0).normalize();
  } else {
    playerForward.set(1, 0, 0);
  }
  const before = targetRoot.position.clone();
  movedDistanceSinceTick = 0;
  const sightBeforeUpdate = tacticalLineOfSight(instance);
  lastLos = sightBeforeUpdate.worldVisible;
  manager.tickAI(player, dt, (damage, source, attribution = {}) => {
    const damageSourceRoot = attribution.sourceRoot || targetRoot;
    const sightAtDamage = tacticalLineOfSight(manager.instanceByRoot.get(damageSourceRoot), damageSourceRoot);
    metrics.recordDamage(scenarioElapsed * 1000, damage, {
      source,
      worldVisible: sightAtDamage.worldVisible,
      tacticalVisible: sightAtDamage.tacticalVisible,
      sourceRoot: attribution.sourceRoot,
      ownerRoot: attribution.ownerRoot,
      wardenRoot: currentDefinition.archetype.id === 'warden' ? targetRoot : null,
      primaryRoot: targetRoot
    });
  });
  installPathLogging();
  const movedDistance = horizontalDistance(before, targetRoot.position);
  movedDistanceSinceTick = movedDistance;
  const sight = tacticalLineOfSight(instance);
  const sensed = manager._sensePlayer(targetRoot, 0);
  lastLos = sight.worldVisible;
  const playerDistance = horizontalDistance(targetRoot.position, player.position);
  const [bandMin, bandMax] = currentDefinition.archetype.preferredBand;
  let allyDistance = Infinity;
  let bodyPenetrating = false;
  const targetProfile = manager._profileForRoot(targetRoot);
  for (const ally of manager.enemies) {
    if (ally === targetRoot) continue;
    const distanceToAlly = horizontalDistance(targetRoot.position, ally.position);
    allyDistance = Math.min(allyDistance, distanceToAlly);
    const allyProfile = manager._profileForRoot(ally);
    const verticalOverlap = Math.abs(targetRoot.position.y - ally.position.y)
      < (targetProfile.collisionHeight + allyProfile.collisionHeight) * 0.5;
    bodyPenetrating ||= verticalOverlap
      && distanceToAlly < targetProfile.collisionRadius + allyProfile.collisionRadius - 0.02;
  }
  if (currentDefinition.archetype.id === 'warden' && instance?._children?.size > 1) {
    const children = Array.from(instance._children);
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        allyDistance = Math.min(allyDistance, horizontalDistance(children[i].position, children[j].position));
        const childDistance = horizontalDistance(children[i].position, children[j].position);
        const childProfileA = manager._profileForRoot(children[i]);
        const childProfileB = manager._profileForRoot(children[j]);
        const verticalOverlap = Math.abs(children[i].position.y - children[j].position.y)
          < (childProfileA.collisionHeight + childProfileB.collisionHeight) * 0.5;
        bodyPenetrating ||= verticalOverlap
          && childDistance < childProfileA.collisionRadius + childProfileB.collisionRadius - 0.02;
      }
    }
  }
  if (scenario.groupSetup && scenarioGroupRoots.size > 1) {
    const groupRoots = Array.from(scenarioGroupRoots).filter(root => manager.enemies.has(root));
    for (let i = 0; i < groupRoots.length; i++) {
      for (let j = i + 1; j < groupRoots.length; j++) {
        const first = groupRoots[i];
        const second = groupRoots[j];
        const distance = horizontalDistance(first.position, second.position);
        allyDistance = Math.min(allyDistance, distance);
        const firstProfile = manager._profileForRoot(first);
        const secondProfile = manager._profileForRoot(second);
        const verticalOverlap = Math.abs(first.position.y - second.position.y)
          < (firstProfile.collisionHeight + secondProfile.collisionHeight) * 0.5;
        bodyPenetrating ||= verticalOverlap
          && distance < firstProfile.collisionRadius + secondProfile.collisionRadius - 0.02;
      }
    }
  }
  const obstacleBox = activeObstacle ? new THREE.Box3().setFromObject(activeObstacle) : null;
  const insideObstacle = !!obstacleBox?.containsPoint(targetRoot.position);
  let nearObstacle = false;
  if (obstacleBox) {
    const dx = Math.max(obstacleBox.min.x - targetRoot.position.x, 0, targetRoot.position.x - obstacleBox.max.x);
    const dz = Math.max(obstacleBox.min.z - targetRoot.position.z, 0, targetRoot.position.z - obstacleBox.max.z);
    nearObstacle = Math.hypot(dx, dz) < 1.1;
  }
  const windupActive = (instance?.windupTime || 0) > 0 || (instance?.windup || 0) > 0 || (instance?._windUpTimer || 0) > 0 || instance?.state === 'windup';
  let simultaneousAttackers = 0;
  for (const root of scenarioGroupRoots) {
    if (!manager.enemies.has(root)) continue;
    const member = manager.instanceByRoot.get(root);
    const attackActive = member?._charging
      || member?.inBurst
      || member?.state === 'dive'
      || member?.state === 'windup'
      || (member?._windUpTimer || 0) > 0
      || (member?.windupTime || 0) > 0
      || (member?.windup || 0) > 0
      || (member?._attackPhase && member._attackPhase !== 'idle' && member._attackPhase !== 'recover');
    if (attackActive) simultaneousAttackers++;
  }
  const validCombatAnchor = (currentDefinition.archetype.role === 'ranged' || currentDefinition.archetype.role === 'sniper')
    && playerDistance >= bandMin && playerDistance <= bandMax && sensed.tacticalFireClear;
  metrics.validCombatAnchor ||= validCombatAnchor;
  if (obstacleBox) {
    metrics.obstaclePlanePassed ||= targetRoot.position.z < obstacleBox.min.z - currentDefinition.archetype.collisionRadius;
  }
  metrics.observeTick({
    atMs: scenarioElapsed * 1000,
    dt,
    worldVisible: sight.worldVisible,
    stableVisible: sensed.stableWorldLOS,
    locomotionClear: sensed.locomotionClear,
    tacticalVisible: sight.tacticalVisible,
    playerDistance,
    inPreferredBand: playerDistance >= bandMin && playerDistance <= bandMax,
    windupActive,
    charging: !!(instance?._charging) || instance?.state === 'dive',
    allyDistance,
    bodyPenetrating,
    allySide: blockerRoot ? Math.sign(targetRoot.position.z - blockerRoot.position.z) : null,
    insideObstacle,
    nearObstacle,
    attemptedMove: attemptedMoveSinceSample,
    movedDistance,
    swarmCount: instance?._children?.size || 0,
    groupSize: Array.from(scenarioGroupRoots).filter(root => manager.enemies.has(root)).length,
    simultaneousAttackers,
    state: compactState(instance)
  });
}

function sampleScenario() {
  if (!targetRoot) return;
  const instance = manager.instanceByRoot.get(targetRoot);
  const sight = tacticalLineOfSight(instance);
  const sensed = manager._sensePlayer(targetRoot, 0);
  const visible = sight.worldVisible;
  lastLos = visible;
  const state = compactState(instance);
  if (state !== lastState) {
    lastState = state;
  }
  const toPlayer = player.position.clone().sub(targetRoot.position).setY(0);
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(targetRoot.quaternion).setY(0);
  const tracking = toPlayer.lengthSq() > 1e-5 && facing.lengthSq() > 1e-5 && facing.normalize().dot(toPlayer.normalize()) > 0.35;
  metrics.observe({
    atMs: scenarioElapsed * 1000,
    position: targetRoot.position,
    playerDistance: horizontalDistance(targetRoot.position, player.position),
    visible,
    stableVisible: sensed.stableWorldLOS,
    locomotionClear: sensed.locomotionClear,
    tacticalVisible: sight.tacticalVisible,
    blockingCategory: !sensed.locomotionClear ? 'world_or_body_corridor' : (sensed.blockingAlly ? 'ally_fire_line' : null),
    selectedTarget: instance?.selectedTargetRoot?.userData?.behaviorId
      || instance?.selectedCoverRoot?.userData?.diagnosticActorId
      || instance?.selectedCoverRoot?.userData?.behaviorId
      || (instance?._outerAnchor ? `${round(instance._outerAnchor.x)},${round(instance._outerAnchor.z)}` : null),
    tracking,
    attemptedMove: attemptedMoveSinceSample,
    allyDistance: blockerRoot ? horizontalDistance(targetRoot.position, blockerRoot.position) : Infinity,
    state,
    speed: movedDistanceSinceTick * 60
  });
  if (currentDefinition.scenario.groupSetup) {
    metrics.observeGroup(
      scenarioElapsed * 1000,
      Array.from(scenarioGroupRoots)
        .filter(root => manager.enemies.has(root))
        .map(root => ({
          id: root.userData?.diagnosticActorId || root.userData?.behaviorId || root.userData?.type,
          type: root.userData?.behaviorId || root.userData?.type,
          x: root.position.x,
          y: root.position.y,
          z: root.position.z,
          playerDistance: horizontalDistance(root.position, player.position),
          state: compactState(manager.instanceByRoot.get(root))
        }))
    );
  }
  attemptedMoveSinceSample = false;
}

function renderRows(matrix) {
  elements.rows.innerHTML = '';
  resultRows = new Map();
  for (const item of matrix) {
    const row = document.createElement('tr');
    row.dataset.state = 'pending';
    row.innerHTML = `<td>${item.archetype.label}</td><td>${item.scenario.label}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>Pending</td>`;
    elements.rows.appendChild(row);
    resultRows.set(item.id, row);
  }
}

function updateResultRow(definition, result) {
  const row = resultRows.get(definition.id);
  if (!row) return;
  row.dataset.state = result.assessment.status;
  row.children[2].textContent = `${result.metrics.distanceTravelled.toFixed(1)} m`;
  row.children[3].textContent = `${result.metrics.progressToPlayer.toFixed(1)} m`;
  row.children[4].textContent = `${Math.round(result.metrics.stuckRatio * 100)}%`;
  row.children[5].textContent = `${Math.round(result.metrics.visibleRatio * 100)}%`;
  row.children[6].textContent = result.assessment.summary;
  row.title = result.assessment.findings.map(item => `${item.severity.toUpperCase()}: ${item.message}`).join('\n') || 'No findings';
}

function updateSummary(results) {
  const counts = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 };
  for (const result of results) counts[result.assessment.status]++;
  elements.pass.textContent = `Pass ${counts.pass}`;
  elements.warn.textContent = `Warn ${counts.warn}`;
  elements.fail.textContent = `Fail ${counts.fail}`;
  if (elements.inconclusive) elements.inconclusive.textContent = `Inconclusive ${counts.inconclusive}`;
  if (elements.notApplicable) elements.notApplicable.textContent = `N/A ${counts.not_applicable}`;
}

function notApplicableResult(definition) {
  const result = {
    enemyId: definition.archetype.id,
    role: definition.archetype.role,
    scenarioId: definition.scenario.id,
    preferredBand: definition.archetype.preferredBand,
    metrics: {
      distanceTravelled: 0, progressToPlayer: 0, stuckRatio: 0, visibleRatio: 0,
      simulationSeconds: 0, damageTotal: 0, damageEvents: 0, shots: 0
    },
    footprintLegend: [],
    footprint: [],
    timeline: []
  };
  result.assessment = evaluateEnemyReaction(result);
  return result;
}

let syntheticFrameAt = performance.now();
function nextFrame() {
  if (deterministicFrameDriver) {
    return new Promise(resolve => setTimeout(() => {
      syntheticFrameAt += 50;
      resolve(syntheticFrameAt);
    }, 0));
  }
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function runDiagnostic() {
  if (running) return;
  running = true;
  stopRequested = false;
  report = null;
  errors.length = 0;
  interruptions.length = 0;
  runStartedAt = performance.now();
  const startedAt = new Date().toISOString();
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.enemy.disabled = true;
  elements.scenario.disabled = true;
  elements.copy.disabled = true;
  elements.download.disabled = true;
  elements.output.classList.remove('ready');
  const matrix = buildEnemyReactionMatrix({ enemy: elements.enemy.value || null, scenario: elements.scenario.value || null });
  renderRows(matrix);
  const results = [];

  try {
    for (let index = 0; index < matrix.length; index++) {
      if (stopRequested) break;
      const definition = matrix[index];
      if (!definition.applicable) {
        const result = notApplicableResult(definition);
        results.push(result);
        updateResultRow(definition, result);
        updateSummary(results);
        elements.progress.style.width = `${((index + 1) / matrix.length) * 100}%`;
        continue;
      }
      setupScenario(definition);
      const row = resultRows.get(definition.id);
      row.dataset.state = 'running';
      row.scrollIntoView({ block: 'nearest' });
      elements.status.textContent = `${definition.archetype.label}: ${definition.scenario.label}`;
      let accumulator = 0;
      let lastAt = await nextFrame();
      let lastSampleAt = -Infinity;
      while (scenarioElapsed < definition.scenario.durationSeconds && !stopRequested) {
        const now = await nextFrame();
        if (document.hidden) { lastAt = now; continue; }
        const realDt = Math.min(0.05, Math.max(0.001, (now - lastAt) / 1000));
        lastAt = now;
        accumulator += realDt * speed;
        while (accumulator >= 1 / 60) {
          updateScenario(1 / 60);
          accumulator -= 1 / 60;
        }
        if (scenarioElapsed - lastSampleAt >= 0.2) {
          sampleScenario();
          lastSampleAt = scenarioElapsed;
        }
        renderer.render(scene, camera);
        elements.elapsed.textContent = `${((now - runStartedAt) / 1000).toFixed(1)}s`;
        elements.progress.style.width = `${((index + scenarioElapsed / definition.scenario.durationSeconds) / matrix.length) * 100}%`;
      }
      if (stopRequested) {
        interruptions.push({
          type: 'user_stopped',
          atMs: round(performance.now() - runStartedAt, 1),
          enemyId: definition.archetype.id,
          scenarioId: definition.scenario.id
        });
        break;
      }
      metrics.addEvent(scenarioElapsed * 1000, 'scenario_completed');
      const result = metrics.finish();
      results.push(result);
      updateResultRow(definition, result);
      updateSummary(results);
    }
  } catch (error) {
    recordError(error, currentDefinition?.id || 'diagnostic');
  } finally {
    clearActors();
    report = buildEnemyReactionReport({
      environment: {
        appVersion: APP_VERSION,
        page: 'test-enemy-reactions.html',
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio: window.devicePixelRatio || 1,
        renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
        simulationHz: 60,
        sampleIntervalMs: 200,
        timeScale: speed,
        frameDriver: deterministicFrameDriver ? 'deterministic-ci' : 'requestAnimationFrame',
        enemyFilter: elements.enemy.value || null,
        scenarioFilter: elements.scenario.value || null,
        deterministicSeed: '0x0ea7c0de'
      },
      startedAt,
      completedAt: new Date().toISOString(),
      results,
      errors,
      interruptions
    });
    elements.output.value = JSON.stringify(report);
    elements.output.classList.add('ready');
    elements.copy.disabled = false;
    elements.download.disabled = false;
    elements.run.disabled = false;
    elements.stop.disabled = true;
    elements.enemy.disabled = false;
    elements.scenario.disabled = false;
    if (!stopRequested) elements.progress.style.width = '100%';
    elements.status.textContent = stopRequested
      ? 'Stopped — partial report ready'
      : (errors.length ? 'Partial report ready — runtime errors captured' : 'Report ready — review findings or copy JSON');
    window.__enemyReactionDiagnosticReport = report;
    window.__enemyReactionDiagnosticDone = true;
    try { localStorage.setItem('qoj.enemyReaction.lastReport', elements.output.value); } catch (error) { recordError(error, 'report-persistence'); }
    console.info('Enemy reaction diagnostic report', report);
    running = false;
  }
}

elements.run.addEventListener('click', runDiagnostic);
elements.stop.addEventListener('click', () => {
  if (!running) return;
  stopRequested = true;
  elements.stop.disabled = true;
  elements.status.textContent = 'Stopping…';
});
elements.enemy.addEventListener('change', () => {
  const enemyId = elements.enemy.value;
  for (const option of elements.scenario.options) {
    if (!option.value) continue;
    option.disabled = !!enemyId && !isScenarioApplicable(enemyId, option.value);
  }
  if (elements.scenario.selectedOptions[0]?.disabled) elements.scenario.value = '';
});
elements.enemy.dispatchEvent(new Event('change'));
elements.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(elements.output.value); }
  catch { elements.output.focus(); elements.output.select(); document.execCommand('copy'); }
  elements.copy.textContent = 'Copied';
  setTimeout(() => { elements.copy.textContent = 'Copy JSON'; }, 1200);
});
elements.download.addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([elements.output.value], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `qoj-enemy-reactions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (storedReportView) {
  const pre = document.createElement('pre');
  pre.id = 'storedEnemyReactionReport';
  const stored = localStorage.getItem('qoj.enemyReaction.lastReport') || '{}';
  if (storedReportView === 'summary') {
    try {
      const parsed = JSON.parse(stored);
      pre.textContent = JSON.stringify({ environment: parsed.environment, summary: parsed.summary, errors: parsed.errors }, null, 2);
    } catch {
      pre.textContent = '{}';
    }
  } else {
    pre.textContent = stored;
  }
  document.body.replaceChildren(pre);
} else {
  renderer.render(scene, camera);
  if (autoRun) runDiagnostic();
}
