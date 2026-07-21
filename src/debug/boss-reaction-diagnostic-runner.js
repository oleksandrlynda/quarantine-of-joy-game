import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { EnemyManager } from '../enemies.js?v=1.0.7&rev=boss-pressure7';
import { RELAY_DISTRICT } from '../levels/relay-district.js';
import { FLOODGATE_CONTINUITY } from '../levels/floodgate-continuity.js';
import { LevelRuntime } from '../levels/runtime.js';
import { APP_VERSION } from '../version.js';
import {
  BOSS_REACTION_ARCHETYPES,
  BOSS_PLAYER_STRATEGIES,
  BOSS_REACTION_SCENARIOS,
  BossReactionMetrics,
  advanceBossStaminaRun,
  bossReactionScenarioSeed,
  buildBossReactionMatrix,
  buildBossReactionReport,
  createBossStaminaRunState,
  isBossScenarioApplicable
} from './boss-reaction-diagnostic.js?rev=ballistic-indirect1';

const elements = {
  panel: document.getElementById('panel'),
  panelToggle: document.getElementById('panelToggle'),
  boss: document.getElementById('bossFilter'),
  scenario: document.getElementById('scenarioFilter'),
  strategy: document.getElementById('strategyFilter'),
  speed: document.getElementById('speedFilter'),
  run: document.getElementById('run'),
  stop: document.getElementById('stop'),
  copy: document.getElementById('copyReport'),
  download: document.getElementById('downloadReport'),
  status: document.getElementById('status'),
  elapsed: document.getElementById('elapsed'),
  progress: document.getElementById('progress'),
  rows: document.getElementById('rows'),
  output: document.getElementById('output'),
  pass: document.getElementById('passCount'),
  warn: document.getElementById('warnCount'),
  fail: document.getElementById('failCount'),
  inconclusive: document.getElementById('inconclusiveCount'),
  notApplicable: document.getElementById('notApplicableCount')
};

for (const item of BOSS_REACTION_ARCHETYPES) elements.boss.add(new Option(item.label, item.id));
for (const item of BOSS_REACTION_SCENARIOS) {
  if (!item.strategyId) elements.scenario.add(new Option(item.label, item.id));
}
for (const item of BOSS_PLAYER_STRATEGIES) elements.strategy.add(new Option(item.label, item.id));

const params = new URL(location.href).searchParams;
if (params.has('boss')) elements.boss.value = params.get('boss');
if (params.has('scenario')) elements.scenario.value = params.get('scenario');
if (params.has('strategy')) elements.strategy.value = params.get('strategy');
if (params.has('speed')) {
  const requestedSpeed = String(THREE.MathUtils.clamp(Number(params.get('speed')) || 8, 0.25, 12));
  if ([...elements.speed.options].some(option => option.value === requestedSpeed)) elements.speed.value = requestedSpeed;
}
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

function setPanelCollapsed(collapsed) {
  const isCollapsed = collapsed === true;
  elements.panel.dataset.collapsed = String(isCollapsed);
  elements.panelToggle.setAttribute('aria-expanded', String(!isCollapsed));
  elements.panelToggle.textContent = isCollapsed ? 'Expand panel' : 'Collapse panel';
}

const seededRandom = (seed = 0xb055c0de) => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
};

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

function recordError(error, source = 'runtime') {
  const value = error instanceof Error ? error : new Error(String(error));
  errors.push({
    atMs: round(performance.now() - runStartedAt, 1),
    source,
    name: value.name,
    message: value.message,
    stack: String(value.stack || '').slice(0, 1600)
  });
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
scene.background = new THREE.Color(0x160f18);
scene.fog = new THREE.Fog(0x160f18, 75, 190);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 240);
camera.position.set(24, 22, 30);
camera.lookAt(0, 1, 3);
scene.add(new THREE.HemisphereLight(0xffe2c2, 0x1b2438, 1.75));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
keyLight.position.set(10, 20, 14);
scene.add(keyLight);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2734, roughness: 0.92, metalness: 0.04 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(180, 90, 0xa46f50, 0x4d3c45);
grid.position.y = 0.01;
scene.add(grid);

const player = new THREE.Group();
player.position.set(0, 1.7, -8);
const playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.45, 0.9, 5, 10),
  new THREE.MeshStandardMaterial({ color: 0x56d9ff, emissive: 0x08364c })
);
player.add(playerMesh);
scene.add(player);

const mats = {
  floor: floorMaterial,
  wall: new THREE.MeshLambertMaterial({ color: 0xc27b52 }),
  crate: new THREE.MeshLambertMaterial({ color: 0x8c563d }),
  enemy: new THREE.MeshLambertMaterial({ color: 0xef4444 }),
  head: new THREE.MeshLambertMaterial({ color: 0x111827 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffc15c }),
  tracer: new THREE.LineBasicMaterial({ color: 0xffffff }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffaa00 })
};

const objects = [];
let activeObstacle = null;
let currentDefinition = null;
let targetRoot = null;
let bossInstance = null;
let metrics = null;
let scenarioElapsed = 0;
let resultRows = new Map();
let bossUpdatesThisTick = 0;
let bossMovementBlockedThisTick = false;
let bossBlockedBySelfOwnedAuxiliaryThisTick = false;
let bossMovementBlockerTypeThisTick = null;
let phaseTriggerApplied = false;
let finalPhaseTriggerApplied = false;
let gateProbe = null;
let gateSolved = false;
let closePressureApplied = false;
let strategyFireCooldown = 0;
let strategyShotProbe = null;
let strategyRunAngle = 0;
let strategyStaminaRunState = createBossStaminaRunState();
let benchmarkBoundaryGroup = null;
let benchmarkBoundaryObjects = [];
let relayArenaRuntime = null;
let relayArenaGroup = null;
let relayColliderBounds = [];
let relayRouteIndex = 0;
let relayObservedAuxiliaries = new WeakSet();

const RELAY_BROODMAKER_ROUTE = Object.freeze([
  Object.freeze({ at: 0, label: 'south_player_spawn', position: Object.freeze([0, 1.7, 22]) }),
  Object.freeze({ at: 5, label: 'central_south_lane', position: Object.freeze([0, 1.7, 10]) }),
  Object.freeze({ at: 9, label: 'west_service_lane', position: Object.freeze([-10, 1.7, 9]) }),
  Object.freeze({ at: 14, label: 'west_civic_court', position: Object.freeze([-10, 1.7, -8]) }),
  Object.freeze({ at: 19, label: 'east_civic_court', position: Object.freeze([10, 1.7, -8]) }),
  Object.freeze({ at: 24, label: 'east_shopping_lane', position: Object.freeze([10, 1.7, 9]) }),
  Object.freeze({ at: 28, label: 'central_return_lane', position: Object.freeze([0, 1.7, 10]) })
]);

const playerForward = new THREE.Vector3(1, 0, 0);
const playerKnockbackOffset = new THREE.Vector3();
const diagnosticPlayerCandidate = new THREE.Vector3();
const strategyOrbitCenter = new THREE.Vector3();
const getPlayer = () => ({ position: player.position.clone(), forward: playerForward.clone() });
// Authored rectangular colliders own the boundary; avoid layering the legacy
// circular arena clamp over the production-sized diagnostic footprint.
const manager = new EnemyManager(THREE, scene, mats, objects, getPlayer, Infinity, null, seededRandom());
manager.suspendWaves = true;
player.applyKnockback = vector => {
  if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.z)) return;
  playerKnockbackOffset.add(vector);
  diagnosticPlayerCandidate.copy(player.position).add(vector);
  setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
};

manager.onAIEvent = event => {
  if (!metrics || !targetRoot) return;
  const sourceRoot = event.root || null;
  const sourcePosition = event.origin || sourceRoot?.position || targetRoot.position;
  const broodPlacement = event.type === 'boss_add_spawned' && event.ability === 'brood_wall'
    ? measureBroodScreenPlacement(event.spawnedRoot?.position, targetRoot.position, player.position)
    : null;
  const blockerRoot = event.blockerRoot || null;
  const blockerOwnedByBoss = !!blockerRoot && (
    blockerRoot.userData?.bossOwnerRoot === targetRoot
    || blockerRoot.userData?.summonerRoot === targetRoot
    || bossInstance?.nodes?.roots?.includes?.(blockerRoot)
  );
  if (sourceRoot === targetRoot && event.type === 'movement_blocked') {
    bossMovementBlockedThisTick = true;
    bossBlockedBySelfOwnedAuxiliaryThisTick ||= blockerOwnedByBoss;
    bossMovementBlockerTypeThisTick = blockerRoot?.userData?.type || event.blockedBy || 'unknown';
  }
  metrics.recordAIEvent(scenarioElapsed * 1000, {
    ...event,
    betweenBossAndPlayer: broodPlacement?.betweenBossAndPlayer ?? event.betweenBossAndPlayer,
    screenProjection: broodPlacement?.screenProjection ?? null,
    screenLateralDistance: broodPlacement?.screenLateralDistance ?? null,
    sourceType: sourceRoot?.userData?.type || event.enemyId || 'unknown',
    sourceRole: sourceRoot === targetRoot ? 'boss' : 'auxiliary',
    worldVisible: hasLineOfSight(sourcePosition, player.position),
    blockerType: blockerRoot?.userData?.type || null,
    blockerOwnership: blockerOwnedByBoss ? 'self_owned_auxiliary' : (blockerRoot ? 'other_actor' : null)
  });
};

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function measureBroodScreenPlacement(spawnPosition, bossPosition, playerPosition) {
  if (!spawnPosition || !bossPosition || !playerPosition) return null;
  const axisX = playerPosition.x - bossPosition.x;
  const axisZ = playerPosition.z - bossPosition.z;
  const axisLengthSq = axisX * axisX + axisZ * axisZ;
  if (axisLengthSq < 0.0001) return null;
  const spawnX = spawnPosition.x - bossPosition.x;
  const spawnZ = spawnPosition.z - bossPosition.z;
  const screenProjection = (spawnX * axisX + spawnZ * axisZ) / axisLengthSq;
  const closestX = bossPosition.x + axisX * screenProjection;
  const closestZ = bossPosition.z + axisZ * screenProjection;
  const screenLateralDistance = Math.hypot(spawnPosition.x - closestX, spawnPosition.z - closestZ);
  return {
    betweenBossAndPlayer: screenProjection >= 0.08 && screenProjection <= 0.92 && screenLateralDistance <= 4.5,
    screenProjection: round(screenProjection, 3),
    screenLateralDistance: round(screenLateralDistance, 3)
  };
}

function setDiagnosticPlayerPosition(requestedPosition) {
  const requested = requestedPosition.clone();
  if (!targetRoot) {
    player.position.copy(requestedPosition);
    return;
  }
  const profile = manager._profileForRoot(targetRoot);
  const minimumDistance = profile.collisionRadius + 0.62;
  let dx = requestedPosition.x - targetRoot.position.x;
  let dz = requestedPosition.z - targetRoot.position.z;
  let distance = Math.hypot(dx, dz);
  if (distance < minimumDistance) {
    dx = player.position.x - targetRoot.position.x;
    dz = player.position.z - targetRoot.position.z;
    distance = Math.hypot(dx, dz);
    if (distance < 0.001) {
      dx = -playerForward.x;
      dz = -playerForward.z;
      distance = Math.hypot(dx, dz) || 1;
    }
    requestedPosition.x = targetRoot.position.x + (dx / distance) * minimumDistance;
    requestedPosition.z = targetRoot.position.z + (dz / distance) * minimumDistance;
    metrics?.recordFixtureCorrection?.(scenarioElapsed * 1000, {
      from: { x: round(player.position.x), z: round(player.position.z) },
      requested: { x: round(requested.x), z: round(requested.z) },
      resolved: { x: round(requestedPosition.x), z: round(requestedPosition.z) },
      minimumDistance
    });
  }
  requestedPosition.y = 1.7;
  player.position.copy(requestedPosition);
}

function hasLineOfSight(from, to) {
  if (!objects.length) return true;
  const origin = from.clone().add(new THREE.Vector3(0, 0.9, 0));
  const direction = to.clone().sub(origin);
  const distance = direction.length();
  if (distance <= 0.001) return true;
  const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, Math.max(0, distance - 0.05));
  return raycaster.intersectObjects(objects, false).length === 0;
}

function relayPlayableBounds() {
  return {
    minX: -RELAY_DISTRICT.size[0] / 2,
    maxX: RELAY_DISTRICT.size[0] / 2,
    minZ: -RELAY_DISTRICT.size[1] / 2,
    maxZ: RELAY_DISTRICT.size[1] / 2
  };
}

function benchmarkPlayableBounds() {
  return {
    minX: -FLOODGATE_CONTINUITY.size[0] / 2,
    maxX: FLOODGATE_CONTINUITY.size[0] / 2,
    minZ: -FLOODGATE_CONTINUITY.size[1] / 2,
    maxZ: FLOODGATE_CONTINUITY.size[1] / 2
  };
}

function addBenchmarkArenaBoundary() {
  if (benchmarkBoundaryGroup) return;
  const [width, depth] = FLOODGATE_CONTINUITY.size;
  const height = 5;
  const thickness = 1;
  const material = mats.wall.clone();
  material.transparent = true;
  material.opacity = 0.24;
  material.depthWrite = false;
  benchmarkBoundaryGroup = new THREE.Group();
  benchmarkBoundaryGroup.name = 'diagnostic:largest-production-boundary';
  const definitions = [
    ['north', 0, -depth / 2, width, thickness],
    ['south', 0, depth / 2, width, thickness],
    ['west', -width / 2, 0, thickness, depth],
    ['east', width / 2, 0, thickness, depth]
  ];
  benchmarkBoundaryObjects = definitions.map(([side, x, z, sizeX, sizeZ]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sizeX, height, sizeZ), material);
    wall.name = `diagnostic-${side}-boundary`;
    wall.position.set(x, height / 2, z);
    wall.userData = { diagnosticBoundary: true, blocksMovement: true, blocksShots: true };
    benchmarkBoundaryGroup.add(wall);
    objects.push(wall);
    return wall;
  });
  scene.add(benchmarkBoundaryGroup);
  manager.refreshColliders(objects);
}

function removeBenchmarkArenaBoundary() {
  if (!benchmarkBoundaryGroup) return;
  scene.remove(benchmarkBoundaryGroup);
  for (const wall of benchmarkBoundaryObjects) {
    const index = objects.indexOf(wall);
    if (index >= 0) objects.splice(index, 1);
    wall.geometry?.dispose?.();
  }
  benchmarkBoundaryObjects[0]?.material?.dispose?.();
  benchmarkBoundaryObjects = [];
  benchmarkBoundaryGroup = null;
  manager.refreshColliders(objects);
}

function relayPositionInsideBounds(position, radius = 0) {
  const bounds = relayPlayableBounds();
  return position.x - radius >= bounds.minX
    && position.x + radius <= bounds.maxX
    && position.z - radius >= bounds.minZ
    && position.z + radius <= bounds.maxZ;
}

function relaySolidOverlap(position, radius = 0.5) {
  for (const { bounds, object } of relayColliderBounds) {
    const nearestX = Math.max(bounds.min.x, Math.min(position.x, bounds.max.x));
    const nearestZ = Math.max(bounds.min.z, Math.min(position.z, bounds.max.z));
    const dx = position.x - nearestX;
    const dz = position.z - nearestZ;
    if (dx * dx + dz * dz < radius * radius) {
      return object;
    }
  }
  return null;
}

function relayPositionIntersectsSolid(position, radius = 0.5) {
  return !!relaySolidOverlap(position, radius);
}

function disposeRelayArenaGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse?.(node => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

function addRelayDistrictArena() {
  if (relayArenaRuntime) return;
  relayArenaRuntime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: null,
    clonePrefab: null,
    cullGrass: null,
    onObjective: null,
    onWarning: message => console.warn(message),
    onRefreshColliders: () => manager.refreshColliders(objects),
    onTransitionToLegacy: null
  });
  relayArenaRuntime.attach({ enemyManager: manager });
  relayArenaRuntime.load(RELAY_DISTRICT);
  relayArenaRuntime.onWaveStart(5);
  relayArenaGroup = relayArenaRuntime.group;
  relayArenaGroup.name = 'diagnostic:relay-district';
  for (const collider of relayArenaRuntime.colliderObjects) {
    collider.material.visible = true;
    collider.material.color.setHex(collider.name.includes('boundary') || collider.name.includes('buildings') ? 0x7f3440 : 0x3a6b78);
    collider.material.transparent = true;
    collider.material.opacity = collider.name.includes('boundary') ? 0.28 : 0.2;
    collider.material.depthWrite = false;
  }
  for (const surface of relayArenaRuntime.walkableObjects) {
    surface.material.visible = true;
    surface.material.color.setHex(0x55b887);
    surface.material.transparent = true;
    surface.material.opacity = 0.18;
    surface.material.wireframe = true;
  }
  relayColliderBounds = relayArenaRuntime.colliderObjects.map(object => {
    object.updateWorldMatrix(true, false);
    return { object, bounds: new THREE.Box3().setFromObject(object) };
  });
  relayRouteIndex = 0;
  relayObservedAuxiliaries = new WeakSet();
  manager.refreshColliders(objects);
  camera.position.set(38, 42, 44);
  camera.lookAt(0, 0, -3);
}

function removeRelayDistrictArena() {
  if (!relayArenaRuntime) return;
  const group = relayArenaGroup;
  relayArenaRuntime.unload({ restoreGrass: false });
  disposeRelayArenaGroup(group);
  relayArenaRuntime = null;
  relayArenaGroup = null;
  relayColliderBounds = [];
  relayRouteIndex = 0;
  relayObservedAuxiliaries = new WeakSet();
  manager.refreshColliders(objects);
  camera.position.set(24, 22, 30);
  camera.lookAt(0, 1, 3);
}

function addBossWall() {
  if (activeObstacle || !targetRoot) return;
  const midpoint = player.position.clone().add(targetRoot.position).multiplyScalar(0.5);
  activeObstacle = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 1.2), mats.wall);
  activeObstacle.position.set(midpoint.x, 3, midpoint.z);
  activeObstacle.userData.diagnosticObstacleKind = 'boss_wall';
  scene.add(activeObstacle);
  objects.push(activeObstacle);
  manager.refreshColliders(objects);
}

function removeBossWall() {
  if (!activeObstacle) return;
  scene.remove(activeObstacle);
  const index = objects.indexOf(activeObstacle);
  if (index >= 0) objects.splice(index, 1);
  activeObstacle.geometry?.dispose?.();
  activeObstacle = null;
  manager.refreshColliders(objects);
}

function clearBossScenario() {
  removeBossWall();
  removeBenchmarkArenaBoundary();
  removeRelayDistrictArena();
  try { manager.bossManager?.boss?.onRemoved?.(scene); } catch (error) { recordError(error, 'boss-cleanup'); }
  manager.reset();
  manager.suspendWaves = true;
  manager.customSpawnPoints = null;
  manager._enemyRootsArr.length = 0;
  manager._rootIndex = new WeakMap();
  manager.instanceByRoot = new WeakMap();
  manager._ctx = null;
  currentDefinition = null;
  targetRoot = null;
  bossInstance = null;
  metrics = null;
  gateProbe = null;
  strategyShotProbe = null;
  closePressureApplied = false;
}

function strategyOrbitRadius(definition) {
  const spawnDistance = definition.archetype.spawnDistance;
  if (definition.strategy?.id === 'shoot') return Math.max(12, Math.min(18, spawnDistance * 0.75));
  if (definition.strategy?.id === 'run' || definition.strategy?.id === 'run_stamina') {
    return Math.max(18, Math.min(24, spawnDistance));
  }
  return null;
}

function seedForDefinition(definition) {
  return bossReactionScenarioSeed({
    bossId: definition.archetype.id,
    scenarioId: definition.scenario.id,
    strategyId: definition.strategy?.id || null
  });
}

function bossState(instance) {
  if (!instance) return 'missing';
  if (instance._attackState && instance._attackState !== 'idle') return `attack_${instance._attackState}`;
  if (instance._beamState && instance._beamState !== 'idle') return `beam_${instance._beamState}`;
  if (instance._jumpState && instance._jumpState !== 'idle') return `jump_${instance._jumpState}`;
  if (instance._meleeState && instance._meleeState !== 'idle') return `melee_${instance._meleeState}`;
  if (instance._burrowPhase) return `burrow_${instance._burrowPhase}`;
  if (instance._cloneCast) return `cast_${instance._cloneCast.kind || 'clone'}`;
  if (instance._burstActive) return 'volley_burst';
  if ((instance.telegraphTime || 0) > 0 || (instance._telegraphTime || 0) > 0
    || ((instance._teleTime || 0) > 0 && !!instance._teleData)) return 'telegraph';
  if ((instance._phaseTelegraph || 0) > 0) return 'phase_telegraph';
  return 'idle';
}

function bossCombatSnapshot(instance) {
  const state = bossState(instance);
  const telegraphActive = state.includes('windup')
    || state === 'telegraph'
    || state === 'phase_telegraph'
    || state === 'burrow_sink'
    || state.startsWith('cast_')
    || !!instance?._telegraph
    || (manager.bossManager.telegraphTime || 0) > 0;
  const attackActive = ['attack_sweep', 'attack_active', 'beam_sweep', 'beam_burst', 'melee_active', 'volley_burst'].includes(state)
    || state.startsWith('jump_active')
    || !!instance?._burstActive;
  return { state, telegraphActive, attackActive };
}

function scenarioAuxiliaries() {
  if (!targetRoot) return [];
  return Array.from(manager.enemies).filter(root => root !== targetRoot);
}

function removeObjectiveRoot(root) {
  if (root && manager.enemies.has(root)) manager.remove(root);
}

function solveBossObjectives(instance) {
  if (currentDefinition.archetype.id === 'sanitizer') {
    for (const root of [...(instance.nodes?.roots || [])]) removeObjectiveRoot(root);
    return true;
  }
  if (currentDefinition.archetype.id === 'algorithm') {
    if (instance.phase === 2) {
      const correctEcho = Array.from(instance.echoes || []).find(echo => echo.correct);
      if (correctEcho?.root) {
        removeObjectiveRoot(correctEcho.root);
        return true;
      }
    }
    for (const node of [...(instance.nodes || [])]) removeObjectiveRoot(node.root);
    return true;
  }
  return false;
}

function setBossHpRatio(instance, ratio) {
  const root = instance.root;
  const maximum = Number(instance.maxHp || root.userData.maxHp || root.userData.hp) || 1;
  const current = Number(root.userData.hp) || maximum;
  const desired = maximum * ratio;
  const multiplier = Math.max(1, Number(root.userData.damageMul) || 1);
  root.userData.hp = current - Math.max(0, current - desired) / multiplier;
  if (currentDefinition?.strategy && metrics) {
    const adjusted = Math.max(0, current - Number(root.userData.hp));
    metrics.strategyPhaseHpAdjustment += adjusted;
    metrics.addEvent(scenarioElapsed * 1000, 'strategy_phase_hp_adjusted', {
      fromHp: round(current), toHp: round(Number(root.userData.hp)),
      adjustment: round(adjusted), targetRatio: ratio
    });
  }
}

function applyPhaseTrigger() {
  if (phaseTriggerApplied || !bossInstance || !metrics) return;
  const kind = currentDefinition.archetype.phaseTrigger;
  phaseTriggerApplied = true;
  metrics.phaseTriggerApplied = true;
  if (currentDefinition.scenario.id === 'summon_coordination') metrics.summonOpportunityApplied = true;
  if (kind === 'remove_suppression_nodes') {
    solveBossObjectives(bossInstance);
  } else if (kind === 'solve_control') {
    solveBossObjectives(bossInstance);
    setBossHpRatio(bossInstance, 0.62);
  } else if (kind === 'hp_55') {
    setBossHpRatio(bossInstance, 0.55);
  } else if (kind === 'hp_65') {
    setBossHpRatio(bossInstance, 0.65);
  }
  metrics.addEvent(scenarioElapsed * 1000, 'phase_trigger_applied', { kind });
}

function applyFinalPhaseTrigger() {
  if (finalPhaseTriggerApplied || !bossInstance || !metrics
    || currentDefinition.archetype.id !== 'algorithm') return;
  finalPhaseTriggerApplied = true;
  metrics.finalPhaseTriggerApplied = true;
  solveBossObjectives(bossInstance);
  setBossHpRatio(bossInstance, 0.22);
  // Make the signature Collapse Ring observable inside this focused window.
  bossInstance._logicPulseCooldown = 0;
  metrics.addEvent(scenarioElapsed * 1000, 'final_phase_trigger_applied', {
    kind: 'algorithm_collapse', targetHpRatio: 0.22
  });
}

function beginDamageProbe(kind) {
  const before = Number(targetRoot?.userData?.hp);
  if (!Number.isFinite(before)) return;
  targetRoot.userData.hp = before - 100;
  gateProbe = { kind, before };
}

function finishDamageProbe() {
  if (!gateProbe || !metrics || !targetRoot) return;
  const accepted = Math.max(0, gateProbe.before - Number(targetRoot.userData.hp));
  if (gateProbe.kind === 'locked') {
    metrics.objectiveGateTested = true;
    metrics.lockedDamageAccepted = accepted;
  } else {
    metrics.objectiveUnlockTested = true;
    metrics.unlockedDamageAccepted = accepted;
  }
  metrics.addEvent(scenarioElapsed * 1000, 'objective_damage_probe', { kind: gateProbe.kind, accepted: round(accepted) });
  gateProbe = null;
}

function strategyObjectiveRoots() {
  if (!bossInstance || !targetRoot) return [];
  if (currentDefinition.archetype.id === 'sanitizer') return [...(bossInstance.nodes?.roots || [])];
  if (currentDefinition.archetype.id === 'algorithm') {
    if (bossInstance.phase === 2) return [...(bossInstance.echoes || [])].map(echo => echo.root);
    return [...(bossInstance.nodes || [])].map(node => node.root);
  }
  if (currentDefinition.archetype.id === 'captain') return [...(bossInstance._zeppelin?.enginePods || [])];
  return [];
}

function strategyShotTarget() {
  const objective = strategyObjectiveRoots().find(root => root && manager.enemies.has(root) && Number(root.userData?.hp) > 0);
  return objective || targetRoot;
}

function finishStrategyShot() {
  if (!strategyShotProbe || !metrics) return;
  const { root, before, targetRole, targetType } = strategyShotProbe;
  const after = Math.max(0, Number(root?.userData?.hp) || 0);
  const acceptedDamage = Math.max(0, before - after);
  const destroyed = targetRole !== 'boss' && after <= 0;
  metrics.recordPlayerShot(scenarioElapsed * 1000, {
    hit: true,
    acceptedDamage,
    targetRole,
    targetType,
    destroyed
  });
  if (destroyed && manager.enemies.has(root)) manager.remove(root);
  strategyShotProbe = null;
}

function fireStrategyShot(strategy) {
  const root = strategyShotTarget();
  if (!root || !targetRoot) {
    metrics.recordPlayerShot(scenarioElapsed * 1000, { hit: false });
    return;
  }
  const targetPosition = root.getWorldPosition?.(new THREE.Vector3()) || root.position;
  if (!targetPosition || !hasLineOfSight(player.position, targetPosition)) {
    metrics.recordPlayerShot(scenarioElapsed * 1000, { hit: false, targetType: root.userData?.type || 'unknown' });
    return;
  }
  const before = Math.max(0, Number(root.userData?.hp) || 0);
  const targetRole = root === targetRoot ? 'boss' : 'objective';
  const targetType = root.userData?.type || targetRole;
  let requestedDamage = strategy.shotDamage;
  if (targetRole === 'boss') {
    const maximum = Number(bossInstance.maxHp || root.userData.maxHp || metrics.initialBossHp) || before;
    const floor = maximum * 0.2;
    const multiplier = Math.max(1, Number(root.userData.damageMul) || 1);
    requestedDamage = Math.min(requestedDamage, Math.max(0, (before - floor) / multiplier));
  }
  if (requestedDamage <= 0) {
    metrics.recordPlayerShot(scenarioElapsed * 1000, { hit: true, acceptedDamage: 0, targetRole, targetType });
    return;
  }
  root.userData.hp = before - requestedDamage;
  strategyShotProbe = { root, before, targetRole, targetType };
}

function updatePlayerStrategy(dt, strategy) {
  if (!strategy || !targetRoot) return;
  const spawnDistance = currentDefinition.archetype.spawnDistance;
  if (strategy.id === 'shoot') {
    const radius = Math.max(12, Math.min(18, spawnDistance * 0.75));
    const angle = scenarioElapsed * 0.35;
    diagnosticPlayerCandidate.set(
      strategyOrbitCenter.x + Math.sin(angle) * radius,
      1.7,
      strategyOrbitCenter.z - Math.cos(angle) * radius
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
    strategyFireCooldown -= dt;
    if (strategyFireCooldown <= 0 && !strategyShotProbe) {
      strategyFireCooldown += strategy.fireIntervalSeconds;
      fireStrategyShot(strategy);
    }
  } else if (strategy.id === 'run') {
    const radius = Math.max(18, Math.min(24, spawnDistance));
    const angle = scenarioElapsed * 0.72;
    const movementSpeed = radius * 0.72;
    metrics.strategyMovementSpeed = movementSpeed;
    metrics.strategyIntendedDistance += movementSpeed * dt;
    diagnosticPlayerCandidate.set(
      strategyOrbitCenter.x + Math.sin(angle) * radius,
      1.7,
      strategyOrbitCenter.z - Math.cos(angle) * radius
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
  } else if (strategy.id === 'run_stamina') {
    const radius = Math.max(18, Math.min(24, spawnDistance));
    const previousMode = strategyStaminaRunState.mode;
    const movementSpeed = advanceBossStaminaRun(strategyStaminaRunState, dt);
    strategyRunAngle += movementSpeed / radius * dt;
    diagnosticPlayerCandidate.set(
      strategyOrbitCenter.x + Math.sin(strategyRunAngle) * radius,
      1.7,
      strategyOrbitCenter.z - Math.cos(strategyRunAngle) * radius
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
    metrics.strategyMovementSpeed = movementSpeed;
    metrics.strategyIntendedDistance = strategyStaminaRunState.intendedDistance;
    metrics.strategyStaminaFinal = strategyStaminaRunState.stamina;
    metrics.strategyStaminaMinimum = strategyStaminaRunState.minimumStamina;
    metrics.strategySprintSeconds = strategyStaminaRunState.sprintSeconds;
    metrics.strategyRecoverySeconds = strategyStaminaRunState.recoverySeconds;
    metrics.strategyExhaustionCount = strategyStaminaRunState.exhaustionCount;
    if (strategyStaminaRunState.mode !== previousMode) {
      metrics.addStrategyEvent(scenarioElapsed * 1000,
        strategyStaminaRunState.mode === 'recover' ? 'strategy_stamina_exhausted' : 'strategy_stamina_recovered', {
          stamina: round(strategyStaminaRunState.stamina),
          movementSpeed
        });
    }
  } else if (strategy.id === 'hide') {
    const cycle = scenarioElapsed % 8;
    const peek = cycle >= 5.5 && cycle < 7.5;
    const peekSide = Math.floor(scenarioElapsed / 8) % 2 ? -1 : 1;
    diagnosticPlayerCandidate.set(
      peek ? peekSide * 9.5 : Math.sin(scenarioElapsed * 0.6) * 4.5,
      1.7,
      -8
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
  }
}

function setupBossScenario(definition) {
  clearBossScenario();
  currentDefinition = definition;
  scenarioElapsed = 0;
  phaseTriggerApplied = false;
  finalPhaseTriggerApplied = false;
  gateSolved = false;
  closePressureApplied = false;
  strategyFireCooldown = 0;
  strategyShotProbe = null;
  strategyRunAngle = 0;
  strategyStaminaRunState = createBossStaminaRunState();
  playerKnockbackOffset.set(0, 0, 0);
  const relayArenaScenario = definition.scenario.arenaId === RELAY_DISTRICT.id;
  if (relayArenaScenario) addRelayDistrictArena();
  else addBenchmarkArenaBoundary();
  const orbitRadius = strategyOrbitRadius(definition);
  const initialPlayerPosition = relayArenaScenario ? RELAY_BROODMAKER_ROUTE[0].position
    : orbitRadius == null ? [0, 1.7, -8] : [0, 1.7, -orbitRadius];
  player.position.set(...initialPlayerPosition);
  playerForward.set(1, 0, 0);
  const scenarioSeed = seedForDefinition(definition);
  const scenarioRandom = seededRandom(scenarioSeed);
  manager.rng = scenarioRandom;
  manager.bossManager.rng = scenarioRandom;
  manager.customSpawnPoints = [relayArenaScenario ? new THREE.Vector3(...RELAY_DISTRICT.bossAnchor)
    : orbitRadius == null
      ? new THREE.Vector3(0, 0.8, player.position.z + definition.archetype.spawnDistance)
      : new THREE.Vector3(0, 0.8, 0)];
  if (!manager.bossManager.startBoss(definition.archetype.wave)) throw new Error(`Boss wave ${definition.archetype.wave} did not start`);
  bossInstance = manager.bossManager.boss;
  targetRoot = bossInstance?.root;
  if (!targetRoot) throw new Error(`Boss ${definition.archetype.id} has no root`);
  targetRoot.userData.diagnosticActorId = 'boss_primary';
  strategyOrbitCenter.copy(targetRoot.position).setY(0);

  const originalUpdate = bossInstance.update.bind(bossInstance);
  bossInstance.update = (dt, ctx) => {
    bossUpdatesThisTick++;
    return originalUpdate(dt, ctx);
  };

  if (definition.scenario.obstacleKind === 'boss_wall') addBossWall();
  const initialAuxiliaries = scenarioAuxiliaries().length;
  metrics = new BossReactionMetrics({
    bossId: definition.archetype.id,
    scenarioId: definition.scenario.id,
    strategyId: definition.strategy?.id || null,
    startPosition: targetRoot.position,
    playerStartPosition: player.position,
    initialPlayerDistance: horizontalDistance(targetRoot.position, player.position),
    initialBossHp: Number(targetRoot.userData.hp),
    initialAuxiliaries,
    preferredMinimumDistance: manager._profileForRoot(targetRoot).preferredRange?.[0] || 0
  });
  metrics.scenarioSeed = `0x${scenarioSeed.toString(16).padStart(8, '0')}`;
  if (!relayArenaScenario) {
    metrics.arenaId = 'largest-production-footprint';
    metrics.arenaLoaded = true;
    metrics.arenaBounds = benchmarkPlayableBounds();
    metrics.arenaColliderCount = benchmarkBoundaryObjects.length;
  }
  if (definition.strategy) {
    metrics.addStrategyEvent(0, 'strategy_started', {
      strategyId: definition.strategy.id,
      orbitCenter: { x: round(strategyOrbitCenter.x), z: round(strategyOrbitCenter.z) },
      orbitRadius: orbitRadius == null ? null : round(orbitRadius),
      scenarioSeed: metrics.scenarioSeed
    });
  }
  metrics.addEvent(0, 'scenario_started', {
    boss: definition.archetype.id,
    wave: definition.archetype.wave,
    scenario: definition.scenario.id,
    strategy: definition.strategy?.id || null,
    initialAuxiliaries
  });
  if (definition.scenario.id === 'rare_ability' && definition.archetype.id === 'captain') {
    bossInstance._rocketVolleyCycles = bossInstance._rocketCycleTarget;
    metrics.addEvent(0, 'rare_ability_armed', {
      ability: 'captain_cluster_rocket',
      completedVolleyCycles: bossInstance._rocketVolleyCycles,
      requiredVolleyCycles: bossInstance._rocketCycleTarget
    });
  }
  if (definition.strategy && definition.archetype.id === 'captain') {
    // Give every strategy one comparable pre-Zeppelin rocket opportunity. The
    // production boss still earns later rockets through its normal 10-20
    // completed-volley cadence.
    bossInstance._rocketVolleyCycles = bossInstance._rocketCycleTarget;
    metrics.addStrategyEvent(0, 'strategy_signature_ability_armed', {
      ability: 'captain_cluster_rocket',
      completedVolleyCycles: bossInstance._rocketVolleyCycles,
      requiredVolleyCycles: bossInstance._rocketCycleTarget
    });
  }
  if (relayArenaScenario) {
    const invalidRouteStops = RELAY_BROODMAKER_ROUTE.filter(stop => {
      const position = new THREE.Vector3(...stop.position);
      return !relayPositionInsideBounds(position, 0.45) || relayPositionIntersectsSolid(position, 0.45);
    }).length;
    metrics.configureArena({
      id: RELAY_DISTRICT.id,
      bounds: relayPlayableBounds(),
      colliderCount: relayArenaRuntime.colliderObjects.length,
      routeStopsPlanned: RELAY_BROODMAKER_ROUTE.length,
      invalidRouteStops,
      objectiveCount: 0,
      objectivePlacementIssues: 0,
      objectivePlacementDetails: []
    });
    metrics.recordArenaRouteStop(0, 0, RELAY_BROODMAKER_ROUTE[0].label, {
      x: RELAY_BROODMAKER_ROUTE[0].position[0],
      z: RELAY_BROODMAKER_ROUTE[0].position[2]
    });
    relayRouteIndex = 1;
  }
}

function updateBossScenario(dt) {
  scenarioElapsed += dt;
  const scenario = currentDefinition.scenario;
  if (scenario.arenaId === RELAY_DISTRICT.id) {
    while (relayRouteIndex < RELAY_BROODMAKER_ROUTE.length
      && scenarioElapsed >= RELAY_BROODMAKER_ROUTE[relayRouteIndex].at) {
      const stop = RELAY_BROODMAKER_ROUTE[relayRouteIndex];
      diagnosticPlayerCandidate.set(...stop.position);
      setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
      metrics.recordArenaRouteStop(scenarioElapsed * 1000, relayRouteIndex, stop.label, {
        x: stop.position[0], z: stop.position[2]
      });
      relayRouteIndex++;
    }
  }
  if (scenario.movingPlayer) {
    playerKnockbackOffset.multiplyScalar(Math.exp(-3.5 * dt));
    diagnosticPlayerCandidate.set(
      Math.sin(scenarioElapsed * 1.05) * 7 + playerKnockbackOffset.x,
      1.7,
      -8 + playerKnockbackOffset.z
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
  }
  if (scenario.closeAtSeconds && scenarioElapsed >= scenario.closeAtSeconds && !closePressureApplied) {
    const profile = manager._profileForRoot(targetRoot);
    const closeDistance = profile.collisionRadius + 0.75;
    const closeDirection = new THREE.Vector3(1, 0, -0.3).normalize().multiplyScalar(closeDistance);
    diagnosticPlayerCandidate.set(
      targetRoot.position.x + closeDirection.x,
      1.7,
      targetRoot.position.z + closeDirection.z
    );
    setDiagnosticPlayerPosition(diagnosticPlayerCandidate);
    closePressureApplied = true;
    metrics.addEvent(scenarioElapsed * 1000, 'player_closed_range');
  }
  if ((scenario.id === 'phase_transition' || scenario.id === 'final_phase')
    && scenarioElapsed >= scenario.triggerAtSeconds) applyPhaseTrigger();
  if (scenario.id === 'final_phase' && scenarioElapsed >= scenario.finalTriggerAtSeconds) applyFinalPhaseTrigger();
  if (currentDefinition.strategy && currentDefinition.archetype.phaseTrigger
    && scenarioElapsed >= scenario.phaseTriggerAtSeconds) applyPhaseTrigger();
  if (currentDefinition.strategy && currentDefinition.archetype.id === 'algorithm'
    && scenarioElapsed >= scenario.finalPhaseTriggerAtSeconds) applyFinalPhaseTrigger();
  if (scenario.id === 'summon_coordination' && currentDefinition.archetype.phaseTrigger && scenarioElapsed >= 2.5) {
    applyPhaseTrigger();
    metrics.summonOpportunityApplied = true;
  }
  if (scenario.id === 'objective_gating') {
    if (!metrics.objectiveGateTested && !gateProbe && scenarioElapsed >= 1) beginDamageProbe('locked');
    if (!gateSolved && scenarioElapsed >= 3) {
      gateSolved = solveBossObjectives(bossInstance);
      metrics.addEvent(scenarioElapsed * 1000, 'objective_solved', { solved: gateSolved });
    }
      if (gateSolved && !metrics.objectiveUnlockTested && !gateProbe && scenarioElapsed >= 4) beginDamageProbe('unlocked');
  }

  updatePlayerStrategy(dt, currentDefinition.strategy);
  playerForward.copy(targetRoot.position).sub(player.position).setY(0).normalize();

  bossUpdatesThisTick = 0;
  bossMovementBlockedThisTick = false;
  bossBlockedBySelfOwnedAuxiliaryThisTick = false;
  bossMovementBlockerTypeThisTick = null;
  manager.tickAI(player, dt, (damage, source, attribution = {}) => {
    const sourceRoot = attribution.sourceRoot || attribution.ownerRoot || targetRoot;
    const sourcePosition = attribution.sourceOrigin || sourceRoot?.position || targetRoot.position;
    const sourceKind = attribution.sourceKind || source || 'enemy';
    const directLine = /projectile|beam|volley|shot|barrage|cross_burst/i.test(sourceKind);
    const sourceRole = sourceRoot === targetRoot ? 'boss' : 'auxiliary';
    const requiresTelegraph = sourceRole === 'boss'
      && !/tile|mine|ad_zone|damage_zone|environment/i.test(sourceKind);
    metrics.recordDamage(scenarioElapsed * 1000, damage, {
      worldVisible: hasLineOfSight(sourcePosition, player.position),
      sourceType: sourceRoot?.userData?.type || source || 'boss',
      sourceRole,
      sourceKind,
      directLine,
      requiresTelegraph
    });
  });
  finishStrategyShot();
  finishDamageProbe();

  const distance = horizontalDistance(targetRoot.position, player.position);
  const toPlayer = player.position.clone().sub(targetRoot.position).setY(0);
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(targetRoot.quaternion).setY(0);
  const tracking = toPlayer.lengthSq() > 1e-5 && facing.lengthSq() > 1e-5
    && facing.normalize().dot(toPlayer.normalize()) > 0.35;
  const combat = bossCombatSnapshot(bossInstance);
  const collisionProfile = manager._profileForRoot(targetRoot);
  const preferredRange = collisionProfile.preferredRange || [0, Number.POSITIVE_INFINITY];
  const solidContactDistance = collisionProfile.collisionRadius + 0.6;
  const preferredMinimumDistance = collisionProfile.preferredRange?.[0] || 0;
  const worldVisible = hasLineOfSight(targetRoot.position, player.position);
  const auxiliaries = scenarioAuxiliaries();
  metrics.observeTick({
    atMs: scenarioElapsed * 1000,
    dt,
    position: targetRoot.position,
    playerDistance: distance,
    tracking,
    overlappingPlayer: distance < solidContactDistance,
    penetratingPlayer: distance < solidContactDistance - 0.04,
    insidePreferredMinimum: preferredMinimumDistance > 0 && distance < preferredMinimumDistance,
    worldVisible,
    updatesThisTick: bossUpdatesThisTick,
    telegraphActive: combat.telegraphActive,
    attackActive: combat.attackActive,
    state: combat.state,
    phase: bossInstance.phase ?? null,
    phaseLabel: targetRoot.userData.phaseLabel || null,
    movementBlocked: bossMovementBlockedThisTick,
    blockedBySelfOwnedAuxiliary: bossBlockedBySelfOwnedAuxiliaryThisTick,
    movementBlockerType: bossMovementBlockerTypeThisTick,
    playerPosition: player.position,
    bossHp: Number(targetRoot.userData.hp),
    auxiliaries
  });
  if (scenario.arenaId === RELAY_DISTRICT.id) {
    const invalidAuxiliaries = [];
    for (const auxiliary of auxiliaries) {
      if (auxiliary.userData?.type === 'boss_node' || relayObservedAuxiliaries.has(auxiliary)) continue;
      relayObservedAuxiliaries.add(auxiliary);
      const radius = manager._profileForRoot(auxiliary).collisionRadius || 0.8;
      const insideBounds = relayPositionInsideBounds(auxiliary.position, radius);
      const collider = relaySolidOverlap(auxiliary.position, radius);
      if (!insideBounds || collider) {
        invalidAuxiliaries.push({
          root: auxiliary,
          type: auxiliary.userData?.type || 'unknown',
          position: { x: round(auxiliary.position.x), z: round(auxiliary.position.z) },
          reason: insideBounds ? collider?.name || 'world_collider' : 'outside_playable_bounds'
        });
      }
    }
    metrics.recordArenaTick({
      atMs: scenarioElapsed * 1000,
      bossInBounds: relayPositionInsideBounds(targetRoot.position, collisionProfile.collisionRadius),
      playerInBounds: relayPositionInsideBounds(player.position, 0.45),
      inWorkingRange: distance >= preferredRange[0] && distance <= preferredRange[1],
      worldVisible,
      invalidAuxiliaries
    });
  }
}

function renderRows(matrix) {
  elements.rows.innerHTML = '';
  resultRows = new Map();
  for (const item of matrix) {
    const row = document.createElement('tr');
    row.dataset.state = 'pending';
    row.innerHTML = `<td>${item.archetype.label}</td><td>${item.scenario.label}</td><td>${item.strategy?.label || '—'}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>Pending</td>`;
    elements.rows.appendChild(row);
    resultRows.set(item.id, row);
  }
}

function updateResultRow(definition, result) {
  const row = resultRows.get(definition.id);
  if (!row) return;
  row.dataset.state = result.assessment.status;
  row.children[3].textContent = String(result.metrics.attackStarts + result.metrics.bossActionEvents);
  row.children[4].textContent = result.strategyId ? result.metrics.incomingDps.toFixed(1) : round(result.metrics.damageTotal).toString();
  row.children[5].textContent = result.strategyId ? result.metrics.playerOutgoingDps.toFixed(1) : '—';
  row.children[6].textContent = result.strategyId ? `${Math.round((1 - result.metrics.playerExposureRatio) * 100)}%` : '—';
  row.children[7].textContent = result.strategyId && result.metrics.bossHpRemainingRatio != null
    ? `${Math.round(result.metrics.bossHpRemainingRatio * 100)}%`
    : '—';
  row.children[8].textContent = result.assessment.summary;
  row.title = result.assessment.findings.map(item => `${item.severity.toUpperCase()}: ${item.message}`).join('\n') || 'No findings';
}

function updateSummary(results) {
  const counts = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 };
  for (const result of results) counts[result.assessment.status]++;
  elements.pass.textContent = `Pass ${counts.pass}`;
  elements.warn.textContent = `Warn ${counts.warn}`;
  elements.fail.textContent = `Fail ${counts.fail}`;
  elements.inconclusive.textContent = `Inconclusive ${counts.inconclusive}`;
  elements.notApplicable.textContent = `N/A ${counts.not_applicable}`;
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
  setPanelCollapsed(true);
  stopRequested = false;
  report = null;
  errors.length = 0;
  interruptions.length = 0;
  runStartedAt = performance.now();
  const startedAt = new Date().toISOString();
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.boss.disabled = true;
  elements.scenario.disabled = true;
  elements.strategy.disabled = true;
  elements.speed.disabled = true;
  elements.copy.disabled = true;
  elements.download.disabled = true;
  elements.output.classList.remove('ready');
  const matrix = buildBossReactionMatrix({
    boss: elements.boss.value || null,
    scenario: elements.strategy.value ? null : (elements.scenario.value || null),
    strategy: elements.strategy.value || null
  });
  const speed = THREE.MathUtils.clamp(Number(elements.speed.value) || 8, 0.25, 12);
  renderRows(matrix);
  const results = [];

  try {
    for (let index = 0; index < matrix.length; index++) {
      if (stopRequested) break;
      const definition = matrix[index];
      setupBossScenario(definition);
      const row = resultRows.get(definition.id);
      row.dataset.state = 'running';
      row.scrollIntoView({ block: 'nearest' });
      elements.status.textContent = `${definition.archetype.label}: ${definition.strategy?.label || definition.scenario.label}`;
      let accumulator = 0;
      let lastAt = await nextFrame();
      while (scenarioElapsed < definition.scenario.durationSeconds && !stopRequested) {
        const now = await nextFrame();
        if (document.hidden) { lastAt = now; continue; }
        const realDt = Math.min(0.05, Math.max(0.001, (now - lastAt) / 1000));
        lastAt = now;
        accumulator += realDt * speed;
        while (accumulator >= 1 / 60) {
          updateBossScenario(1 / 60);
          accumulator -= 1 / 60;
        }
        renderer.render(scene, camera);
        elements.elapsed.textContent = `${((now - runStartedAt) / 1000).toFixed(1)}s`;
        elements.progress.style.width = `${((index + scenarioElapsed / definition.scenario.durationSeconds) / matrix.length) * 100}%`;
      }
      if (stopRequested) {
        interruptions.push({
          type: 'user_stopped',
          atMs: round(performance.now() - runStartedAt, 1),
          bossId: definition.archetype.id,
          scenarioId: definition.scenario.id,
          strategyId: definition.strategy?.id || null
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
    recordError(error, currentDefinition?.id || 'boss-diagnostic');
  } finally {
    clearBossScenario();
    report = buildBossReactionReport({
      environment: {
        appVersion: APP_VERSION,
        page: 'test-boss-reactions.html',
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio: window.devicePixelRatio || 1,
        renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
        simulationHz: 60,
        timeScale: speed,
        frameDriver: deterministicFrameDriver ? 'deterministic-ci' : 'requestAnimationFrame',
        bossFilter: elements.boss.value || null,
        scenarioFilter: elements.scenario.value || null,
        strategyFilter: elements.strategy.value || null,
        deterministicSeed: '0xb055c0de',
        strategySeedMode: 'paired_per_boss',
        benchmarkArena: {
          sourceLevel: FLOODGATE_CONTINUITY.id,
          size: [...FLOODGATE_CONTINUITY.size],
          boundaryShape: 'authored_rectangle'
        }
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
    elements.boss.disabled = false;
    elements.scenario.disabled = !!elements.strategy.value;
    elements.strategy.disabled = false;
    elements.speed.disabled = false;
    if (!stopRequested) elements.progress.style.width = '100%';
    elements.status.textContent = stopRequested
      ? 'Stopped — partial boss report ready'
      : (errors.length ? 'Partial boss report ready — runtime errors captured' : 'Boss report ready — review findings or copy JSON');
    window.__bossReactionDiagnosticReport = report;
    window.__bossReactionDiagnosticDone = true;
    try { localStorage.setItem('qoj.bossReaction.lastReport', elements.output.value); } catch (error) { recordError(error, 'report-persistence'); }
    console.info('Boss reaction diagnostic report', report);
    running = false;
    setPanelCollapsed(false);
  }
}

elements.run.addEventListener('click', runDiagnostic);
elements.panelToggle.addEventListener('click', () => setPanelCollapsed(elements.panel.dataset.collapsed !== 'true'));
elements.stop.addEventListener('click', () => {
  if (!running) return;
  stopRequested = true;
  elements.stop.disabled = true;
  elements.status.textContent = 'Stopping…';
});
elements.boss.addEventListener('change', () => {
  const bossId = elements.boss.value;
  for (const option of elements.scenario.options) {
    if (!option.value) continue;
    option.disabled = !!bossId && !isBossScenarioApplicable(bossId, option.value);
  }
  if (elements.scenario.selectedOptions[0]?.disabled) elements.scenario.value = '';
});
elements.boss.dispatchEvent(new Event('change'));
elements.strategy.addEventListener('change', () => {
  const benchmarking = !!elements.strategy.value;
  elements.scenario.disabled = benchmarking;
  if (benchmarking) elements.scenario.value = '';
  elements.run.textContent = benchmarking ? 'Run strategy benchmark' : 'Run boss diagnostic';
});
elements.strategy.dispatchEvent(new Event('change'));
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
  anchor.download = `qoj-boss-reactions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
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
  pre.id = 'storedBossReactionReport';
  const stored = localStorage.getItem('qoj.bossReaction.lastReport') || '{}';
  if (storedReportView === 'summary') {
    try {
      const parsed = JSON.parse(stored);
      pre.textContent = JSON.stringify({
        environment: parsed.environment,
        summary: parsed.summary,
        strategyBenchmarks: parsed.strategyBenchmarks,
        errors: parsed.errors
      }, null, 2);
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
