import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { clonePrefab, loadGeneratedModels } from '../../loader.js?v=9';
import { EnemyManager, resolveBehaviorProfile } from '../enemies.js?v=1.0.7';
import { PlayerController } from '../player.js';
import { findPath } from '../path.js';
import { RELAY_DISTRICT, RELAY_DISTRICT_ASSET_IDS } from '../levels/relay-district.js';
import { SANITIZER_SPIRE, SANITIZER_SPIRE_ASSET_IDS } from '../levels/sanitizer-spire.js';
import { AD_ZONE_ARENA, AD_ZONE_ARENA_ASSET_IDS } from '../levels/ad-zone-arena.js';
import { TREND_WASTES, TREND_WASTES_ASSET_IDS } from '../levels/trend-wastes.js';
import { FREIGHT_ANNEX, FREIGHT_ANNEX_ASSET_IDS } from '../levels/freight-annex.js';
import { MIRROR_GARDEN, MIRROR_GARDEN_ASSET_IDS } from '../levels/mirror-garden.js';
import { CONTENT_COURT, CONTENT_COURT_ASSET_IDS } from '../levels/content-court.js';
import { LAST_ORDER_BASE, LAST_ORDER_BASE_ASSET_IDS } from '../levels/last-order-base.js';
import { SERVER_CATHEDRAL, SERVER_CATHEDRAL_ASSET_IDS } from '../levels/server-cathedral.js';
import { SANDSTORM_EXPANSE, SANDSTORM_EXPANSE_ASSET_IDS } from '../levels/sandstorm-expanse.js';
import { FLOODGATE_CONTINUITY, FLOODGATE_CONTINUITY_ASSET_IDS } from '../levels/floodgate-continuity.js';
import { BLACKOUT_CISTERN, BLACKOUT_CISTERN_ASSET_IDS } from '../levels/blackout-cistern.js';
import { LevelRuntime } from '../levels/runtime.js';
import { APP_VERSION } from '../version.js';
import { performHitscan } from '../weapons/hitscan.js';
import { resolveBlockBoxChannels } from './block-boxes.js';
import {
  buildLevelCollisionReport,
  evaluateAssetBoundaryProbe,
  evaluateAssetApproachProbe,
  evaluateLevelJourneyProbe,
  evaluateSolidCollisionProbe,
  getLevelCollisionProfile,
  summarizeBoundaryFidelity,
  segmentIntersectsExpandedBounds2D
} from './level-collision-diagnostic.js';

const elements = {
  level: document.getElementById('levelFilter'),
  phase: document.getElementById('phaseFilter'),
  kind: document.getElementById('kindFilter'),
  object: document.getElementById('objectFilter'),
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
  inconclusive: document.getElementById('inconclusiveCount')
};

const params = new URL(location.href).searchParams;
const debugColliderChannels = resolveBlockBoxChannels(params);
const requestedLevelId = ({
  relay: 'relay-district', spire: 'sanitizer-spire', adzone: 'ad-zone-arena',
  wastes: 'trend-wastes', freight: 'freight-annex', mirror: 'mirror-garden', court: 'content-court',
  lastorder: 'last-order-base', cathedral: 'server-cathedral',
  expanse: 'sandstorm-expanse', floodgate: 'floodgate-continuity', cistern: 'blackout-cistern'
})[params.get('level')] || params.get('level') || 'relay-district';
const levelCatalog = Object.freeze({
  'relay-district': Object.freeze({ definition: RELAY_DISTRICT, assetIds: RELAY_DISTRICT_ASSET_IDS }),
  'sanitizer-spire': Object.freeze({ definition: SANITIZER_SPIRE, assetIds: SANITIZER_SPIRE_ASSET_IDS }),
  'ad-zone-arena': Object.freeze({ definition: AD_ZONE_ARENA, assetIds: AD_ZONE_ARENA_ASSET_IDS }),
  'trend-wastes': Object.freeze({ definition: TREND_WASTES, assetIds: TREND_WASTES_ASSET_IDS }),
  'freight-annex': Object.freeze({ definition: FREIGHT_ANNEX, assetIds: FREIGHT_ANNEX_ASSET_IDS }),
  'mirror-garden': Object.freeze({ definition: MIRROR_GARDEN, assetIds: MIRROR_GARDEN_ASSET_IDS }),
  'content-court': Object.freeze({ definition: CONTENT_COURT, assetIds: CONTENT_COURT_ASSET_IDS }),
  'last-order-base': Object.freeze({ definition: LAST_ORDER_BASE, assetIds: LAST_ORDER_BASE_ASSET_IDS }),
  'server-cathedral': Object.freeze({ definition: SERVER_CATHEDRAL, assetIds: SERVER_CATHEDRAL_ASSET_IDS }),
  'sandstorm-expanse': Object.freeze({ definition: SANDSTORM_EXPANSE, assetIds: SANDSTORM_EXPANSE_ASSET_IDS }),
  'floodgate-continuity': Object.freeze({ definition: FLOODGATE_CONTINUITY, assetIds: FLOODGATE_CONTINUITY_ASSET_IDS }),
  'blackout-cistern': Object.freeze({ definition: BLACKOUT_CISTERN, assetIds: BLACKOUT_CISTERN_ASSET_IDS })
});
const levelConfig = levelCatalog[requestedLevelId];
if (!levelConfig) throw new RangeError(`Unknown collision diagnostic level: ${requestedLevelId}`);
const levelDefinition = levelConfig.definition;
const collisionProfile = getLevelCollisionProfile(levelDefinition.id);
const autoRun = params.get('autorun') === '1';
const errors = [];
const interruptions = [];
let running = false;
let stopRequested = false;
let runStartedAt = 0;
let report = null;
let hiddenAt = null;
let matrix = [];
let rowById = new Map();

const round = (value, digits = 3) => {
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
scene.background = new THREE.Color(0x101821);
scene.fog = new THREE.Fog(0x101821, 80, 175);
const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.1, 240);
camera.position.set(43, 48, 51);
camera.lookAt(0, 0, -2);
scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x24354b, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(18, 30, 22);
scene.add(keyLight);

const objects = [];
let levelRuntime = null;
let colliderEntries = [];
let colliderById = new Map();
let assetEntries = [];
let activeBoxHelper = null;
let activeJourneyLine = null;
const materialCompatibilityRepairs = [];
// Decorative ground rings, decals, and trim below a normal step do not
// represent body-penetration defects. Taller geometry remains testable.
const WALKABLE_VISUAL_TRIM_HEIGHT = 0.35;
let journeyVisualYieldStride = 120;

const journeyMarker = new THREE.Group();
const journeyBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.38, 0.38, 1.25, 12),
  new THREE.MeshBasicMaterial({ color: 0xffe55c, transparent: true, opacity: 0.92 })
);
journeyBody.position.y = 0.63;
const journeyHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0x56efff })
);
journeyHead.position.y = 1.48;
journeyMarker.add(journeyBody, journeyHead);
journeyMarker.visible = false;
scene.add(journeyMarker);

const probeScene = new THREE.Scene();
const probeObjects = [];
const probeMats = {
  floor: new THREE.MeshBasicMaterial(),
  wall: new THREE.MeshBasicMaterial(),
  crate: new THREE.MeshBasicMaterial(),
  enemy: new THREE.MeshBasicMaterial(),
  head: new THREE.MeshBasicMaterial(),
  glow: new THREE.MeshBasicMaterial(),
  tracer: new THREE.LineBasicMaterial(),
  spark: new THREE.MeshBasicMaterial()
};
const probeManager = new EnemyManager(
  THREE,
  probeScene,
  probeMats,
  probeObjects,
  () => ({ position: new THREE.Vector3(999, 1.7, 999), forward: new THREE.Vector3(0, 0, -1) }),
  40,
  null,
  () => 0.5
);
probeManager.suspendWaves = true;
const probeCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
const probePlayer = new PlayerController(THREE, probeCamera, renderer.domElement, [], Infinity);
probePlayer.headBobEnabled = false;

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function normalizeSceneMaterialHooks() {
  const visited = new Set();
  scene.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || visited.has(material)) continue;
      visited.add(material);
      if (typeof material.onBuild === 'function') continue;
      materialCompatibilityRepairs.push({
        object: object.name || object.type || 'unnamed',
        material: material.name || material.type || 'unnamed'
      });
      material.onBuild = function diagnosticMaterialBuild() {};
    }
  });
}

function boxToData(box) {
  if (!box || box.isEmpty()) return null;
  return {
    min: { x: round(box.min.x), y: round(box.min.y), z: round(box.min.z) },
    max: { x: round(box.max.x), y: round(box.max.y), z: round(box.max.z) }
  };
}

function crossingSpec(object) {
  object.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const axis = size.x <= size.z ? 'x' : 'z';
  const direction = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const crossingDepth = axis === 'x' ? size.x : size.z;
  return { box, size, center, axis, direction, crossingDepth };
}

function resetProbePlayer(start, direction) {
  const root = probePlayer.controls.getObject();
  root.position.copy(start);
  root.rotation.set(0, Math.atan2(-direction.x, -direction.z), 0, 'YXZ');
  probePlayer.camera.rotation.x = 0;
  probePlayer.velocityY = 0;
  probePlayer.velXZ.set(0, 0, 0);
  probePlayer.stamina = probePlayer.staminaMax;
  probePlayer.canJump = true;
  probePlayer.keys.clear();
  probePlayer.keys.add('KeyW');
  probePlayer._groundCache.x = Infinity;
  probePlayer._groundCache.z = Infinity;
  probePlayer._groundCache.y = 0;
}

function simulatePlayerCrossing(object, { jump = false, launchOffset = 1.2 } = {}) {
  const spec = crossingSpec(object);
  const startDistance = spec.crossingDepth * 0.5 + launchOffset;
  const start = spec.center.clone().addScaledVector(spec.direction, -startDistance);
  start.y = 1.7;
  probePlayer.refreshColliders([object]);
  resetProbePlayer(start, spec.direction);
  if (jump) probePlayer.jump();
  const expectedProgress = spec.crossingDepth + launchOffset + 0.8;
  const frames = Math.ceil((expectedProgress / probePlayer.moveSpeed + 0.85) * 60);
  for (let frame = 0; frame < frames; frame++) probePlayer.update(1 / 60);
  probePlayer.keys.clear();
  const root = probePlayer.controls.getObject();
  const progress = root.position.clone().sub(start).dot(spec.direction);
  return {
    exercised: true,
    passed: progress >= expectedProgress - 0.2,
    blocked: progress < expectedProgress - 0.2,
    progress: round(progress),
    expectedProgress: round(expectedProgress),
    finalHeight: round(root.position.y)
  };
}

function simulateBestPlayerJump(object, geometry, expectedPassOverride = null) {
  const attempts = [0.9, 1.2, 1.55].map(launchOffset => simulatePlayerCrossing(object, { jump: true, launchOffset }));
  const best = attempts.sort((a, b) => (b.passed - a.passed) || b.progress - a.progress)[0];
  return {
    ...best,
    expectedPass: typeof expectedPassOverride === 'boolean'
      ? expectedPassOverride
      : geometry.height <= 1.25 && geometry.crossingDepth <= 2.6,
    attempts: attempts.map(item => ({ passed: item.passed, progress: item.progress, finalHeight: item.finalHeight }))
  };
}

function simulateEnemyCrossing(object) {
  const spec = crossingSpec(object);
  const startDistance = spec.crossingDepth * 0.5 + 1.25;
  const start = spec.center.clone().addScaledVector(spec.direction, -startDistance);
  start.y = 0.8;
  const expectedProgress = spec.crossingDepth + 2.05;
  const root = new THREE.Group();
  root.position.copy(start);
  root.userData = { type: 'grunt', behaviorId: 'grunt' };
  probeManager.refreshColliders([object]);
  probeManager.spatialIndex.clear();
  let blockedBy = null;
  const step = spec.direction.clone().multiplyScalar(3.2 / 60);
  const frames = Math.ceil((expectedProgress / 3.2 + 0.8) * 60);
  for (let frame = 0; frame < frames; frame++) {
    const movement = probeManager._moveWithCollisions(root, step);
    blockedBy ||= movement.blockedBy;
  }
  const progress = root.position.clone().sub(start).dot(spec.direction);
  return {
    exercised: true,
    passed: progress >= expectedProgress - 0.2,
    blocked: progress < expectedProgress - 0.2,
    blockedBy,
    progress: round(progress),
    expectedProgress: round(expectedProgress)
  };
}

function shotGeometry(object) {
  const spec = crossingSpec(object);
  const startDistance = spec.crossingDepth * 0.5 + 1.5;
  const origin = spec.center.clone().addScaledVector(spec.direction, -startDistance);
  const end = spec.center.clone().addScaledVector(spec.direction, startDistance);
  const shotY = Math.max(spec.box.min.y + 0.15, Math.min(spec.box.max.y - 0.15, 1.4));
  origin.y = shotY;
  end.y = shotY;
  return { ...spec, origin, end, expectedProgress: startDistance * 2 };
}

function simulatePlayerShot(object) {
  const spec = shotGeometry(object);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial());
  target.position.copy(spec.end);
  target.userData.head = null;
  target.updateMatrixWorld(true);
  const enemyManager = {
    enemies: new Set([target]),
    getEnemyRaycastTargets: () => [target]
  };
  const result = performHitscan({
    THREE,
    raycaster: new THREE.Raycaster(),
    enemyManager,
    objects: [object],
    origin: spec.origin,
    dir: spec.direction,
    range: spec.expectedProgress + 2
  });
  target.geometry.dispose();
  target.material.dispose();
  return {
    exercised: true,
    blocked: result.type === 'world' && result.hitObject === object,
    passed: result.type === 'enemy' || result.type === 'none',
    hitType: result.type,
    distance: round(result.distance),
    expectedProgress: round(spec.expectedProgress)
  };
}

function simulateEnemyShot(object) {
  const spec = shotGeometry(object);
  probeManager.refreshColliders([object]);
  probeManager.clearProjectiles();
  const owner = new THREE.Group();
  owner.userData.type = 'shooter';
  const speed = 30;
  probeManager._spawnBullet('shooter', spec.origin, spec.direction.clone().multiplyScalar(speed), 5, 10, owner);
  let blocked = false;
  let travelled = 0;
  const frames = Math.ceil(((spec.expectedProgress + 1) / speed) * 60) + 4;
  for (let frame = 0; frame < frames; frame++) {
    probeManager._updateBulletPools(1 / 60, {
      player: { position: new THREE.Vector3(999, 1.7, 999) },
      damagePlayer() {}
    });
    const pool = probeManager._bulletPools.shooter;
    if (pool.count === 0) {
      blocked = true;
      break;
    }
    const bullet = pool.items[0];
    travelled = (bullet.px - spec.origin.x) * spec.direction.x + (bullet.pz - spec.origin.z) * spec.direction.z;
    if (travelled >= spec.expectedProgress) break;
  }
  probeManager.clearProjectiles();
  return {
    exercised: true,
    blocked,
    passed: !blocked,
    progress: round(travelled),
    expectedProgress: round(spec.expectedProgress)
  };
}

function testSolid(entry) {
  const spec = crossingSpec(entry.object);
  const blocksMovement = entry.definition?.blocksMovement !== false;
  const blocksShots = entry.definition?.blocksShots !== false;
  const notApplicable = { exercised: false, notApplicable: true };
  const geometry = {
    width: round(spec.size.x),
    height: round(spec.size.y),
    depth: round(spec.size.z),
    crossingAxis: spec.axis,
    crossingDepth: round(spec.crossingDepth),
    bounds: boxToData(spec.box)
  };
  const channels = {
    playerWalk: blocksMovement ? simulatePlayerCrossing(entry.object) : notApplicable,
    playerJumpWalk: null,
    enemyWalk: blocksMovement ? simulateEnemyCrossing(entry.object) : notApplicable,
    playerShot: blocksShots ? simulatePlayerShot(entry.object) : notApplicable,
    enemyShot: blocksShots ? simulateEnemyShot(entry.object) : notApplicable
  };
  channels.playerJumpWalk = blocksMovement
    ? simulateBestPlayerJump(entry.object, geometry, entry.definition?.jumpExpectedPass)
    : notApplicable;
  return evaluateSolidCollisionProbe({
    objectId: entry.id,
    levelObjectId: entry.levelObjectId,
    label: entry.label,
    objectKind: 'solid',
    phaseId: entry.phase.id,
    phaseLabel: entry.phase.label,
    geometry,
    channels
  });
}

function boxesOverlapXZ(a, b, tolerance = 0.02) {
  return a.max.x + tolerance >= b.min.x && a.min.x - tolerance <= b.max.x
    && a.max.z + tolerance >= b.min.z && a.min.z - tolerance <= b.max.z;
}

function unionBounds(boxes) {
  const output = new THREE.Box3();
  output.makeEmpty();
  for (const box of boxes) output.union(box);
  return output;
}

const fidelityRaycaster = new THREE.Raycaster();
const fidelityDirection = new THREE.Vector3();
const fidelityOrigin = new THREE.Vector3();

function measureRadialBoundaryFidelity(entry, expectedObjects) {
  if (!entry.visualBounds || entry.visualBounds.isEmpty() || !expectedObjects.length) return null;
  const activeColliders = expectedObjects
    .filter(item => objects.includes(item.object) && item.object.userData?.blocksShots !== false)
    .map(item => item.object);
  const visualMeshes = entry.visualMeshBounds
    .map(item => item.object)
    .filter(object => effectiveVisibility(object));
  if (!activeColliders.length || !visualMeshes.length) return null;
  const bounds = entry.visualBounds.clone();
  for (const item of expectedObjects) bounds.union(item.bounds);
  // Loose cable loops on these two machinery assets displace the full visual
  // Box3 centre away from their authored solid core. Aim only those probes at
  // the ballistic core; ordinary assets retain the visual centre so separated
  // module families (cover heights, windbreak states) still exercise their gaps.
  const colliderCoreBounds = unionBounds(activeColliders.map(object => new THREE.Box3().setFromObject(object)));
  const center = ['generator', 'reel'].includes(entry.placement?.asset)
    ? colliderCoreBounds.getCenter(new THREE.Vector3())
    : entry.visualBounds.getCenter(new THREE.Vector3());
  const visualSize = entry.visualBounds.getSize(new THREE.Vector3());
  const combinedSize = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(1, Math.hypot(combinedSize.x, combinedSize.z) * .5 + 1);
  const minY = entry.visualBounds.min.y;
  const height = Math.max(.1, visualSize.y);
  const layerFractions = entry.placement?.asset === 'generator' ? [.18, .38, .68] : [.12, .38, .68];
  const layers = layerFractions.map(fraction => minY + height * fraction);
  const samples = [];
  for (const y of layers) {
    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2;
      fidelityDirection.set(-Math.cos(angle), 0, -Math.sin(angle));
      fidelityOrigin.set(
        center.x + Math.cos(angle) * radius,
        y,
        center.z + Math.sin(angle) * radius
      );
      fidelityRaycaster.set(fidelityOrigin, fidelityDirection);
      fidelityRaycaster.near = 0;
      fidelityRaycaster.far = radius * 2;
      const visualHit = fidelityRaycaster.intersectObjects(visualMeshes, false)[0] || null;
      const colliderHit = fidelityRaycaster.intersectObjects(activeColliders, false)[0] || null;
      samples.push({
        layer: round((y - minY) / height),
        angleDegrees: round(angle * 180 / Math.PI, 1),
        visualDistance: visualHit ? round(visualHit.distance) : null,
        colliderDistance: colliderHit ? round(colliderHit.distance) : null
      });
    }
  }
  return {
    ...summarizeBoundaryFidelity(samples),
    tolerance: .35,
    layers: layers.map(y => round(y)),
    radialDirections: 16,
    samples
  };
}

function testAsset(entry) {
  const expectedObjects = (entry.expectation?.colliderIds || []).map(id => colliderById.get(id)).filter(Boolean);
  const missingColliderIds = (entry.expectation?.colliderIds || []).filter(id => !colliderById.has(id));
  const visualBounds = entry.visualBounds?.clone() || null;
  const expectedBoxes = expectedObjects.map(item => item.bounds);
  const overlappingColliderIds = visualBounds
    ? expectedObjects.filter(item => boxesOverlapXZ(visualBounds, item.bounds)).map(item => item.id)
    : [];
  const visualSizeVector = visualBounds && !visualBounds.isEmpty() ? visualBounds.getSize(new THREE.Vector3()) : null;
  const colliderUnion = expectedBoxes.length ? unionBounds(expectedBoxes) : null;
  const colliderSizeVector = colliderUnion && !colliderUnion.isEmpty() ? colliderUnion.getSize(new THREE.Vector3()) : null;
  const visualArea = visualSizeVector ? Math.max(0.001, visualSizeVector.x * visualSizeVector.z) : 0;
  const intentionallyTrimmedGroundVisual = !!entry.root && !visualSizeVector
    && entry.expectation?.mode === 'nonblocking'
    && entry.expectation?.occupancyPolicy === 'ambient_allowed';
  const colliderArea = expectedBoxes.reduce((sum, box) => {
    const size = box.getSize(new THREE.Vector3());
    return sum + size.x * size.z;
  }, 0);
  const boundaryFidelity = entry.expectation?.mode === 'solid'
    ? measureRadialBoundaryFidelity(entry, expectedObjects)
    : null;
  return evaluateAssetBoundaryProbe({
    objectId: entry.id,
    levelObjectId: entry.levelObjectId,
    label: `${entry.placement.asset} @ ${entry.placement.position[0]}, ${entry.placement.position[2]}`,
    objectKind: 'visual_asset',
    phaseId: entry.phase.id,
    phaseLabel: entry.phase.label,
    assetId: entry.placement.asset,
    placementIndex: entry.placementIndex,
    expectation: entry.expectation,
    expectedVisible: collisionProfile.assetPhaseExpectedVisible(entry.placement, entry.phase.id),
    actualVisible: !!entry.root?.visible,
    activeColliderIds: expectedObjects.filter(item => objects.includes(item.object)).map(item => item.id),
    assetLoaded: !!entry.root && (!!visualSizeVector || intentionallyTrimmedGroundVisual),
    intentionallyTrimmedGroundVisual,
    missingColliderIds,
    overlappingColliderIds,
    visualBounds: boxToData(visualBounds),
    colliderBounds: boxToData(colliderUnion),
    visualSize: visualSizeVector ? { x: round(visualSizeVector.x), y: round(visualSizeVector.y), z: round(visualSizeVector.z) } : null,
    colliderSize: colliderSizeVector ? { x: round(colliderSizeVector.x), y: round(colliderSizeVector.y), z: round(colliderSizeVector.z) } : null,
    footprintRatio: visualArea > 0 ? round(colliderArea / visualArea) : null,
    boundaryFidelity
  });
}

function effectiveVisibility(root) {
  for (let node = root; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

function penetrationDepth(a, b) {
  return Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.05
    && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 0.05
    && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.05;
}

const penetrationRaycaster = new THREE.Raycaster();
const penetrationAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1)
];

function bodyIntersectsVisibleMesh(body, meshEntry) {
  if (!penetrationDepth(body, meshEntry.bounds)) return false;
  const center = body.getCenter(new THREE.Vector3());
  const size = body.getSize(new THREE.Vector3());
  for (let axisIndex = 0; axisIndex < penetrationAxes.length; axisIndex++) {
    const axis = penetrationAxes[axisIndex];
    const length = axisIndex === 0 ? size.x : (axisIndex === 1 ? size.y : size.z);
    const origin = center.clone().addScaledVector(axis, -length * 0.5 - 0.01);
    penetrationRaycaster.set(origin, axis);
    penetrationRaycaster.near = 0;
    penetrationRaycaster.far = length + 0.02;
    if (penetrationRaycaster.intersectObject(meshEntry.object, false).length) return true;
  }
  // A body can be wholly inside a closed mesh without crossing a surface.
  // Use an oblique parity ray and collapse duplicate triangle hits at a shared face.
  const parityDirection = new THREE.Vector3(1, 0.137, 0.071).normalize();
  penetrationRaycaster.set(center, parityDirection);
  penetrationRaycaster.near = 0.001;
  penetrationRaycaster.far = 200;
  const hits = penetrationRaycaster.intersectObject(meshEntry.object, false);
  let uniqueHits = 0;
  let lastDistance = -Infinity;
  for (const hit of hits) {
    if (Math.abs(hit.distance - lastDistance) <= 0.002) continue;
    uniqueHits++;
    lastDistance = hit.distance;
  }
  return uniqueHits % 2 === 1;
}

function actorBodyBox(position, actor, enemyType = 'grunt') {
  const enemyProfile = actor === 'enemy' ? resolveBehaviorProfile(enemyType) : null;
  const radius = actor === 'player' ? probePlayer.colliderHalf.x : enemyProfile.collisionRadius;
  const eyeOrOffset = actor === 'player' ? 1.7 : 0.8;
  const height = actor === 'player' ? probePlayer.fullHeight : enemyProfile.collisionHeight;
  const feetY = position.y - eyeOrOffset;
  return new THREE.Box3(
    new THREE.Vector3(position.x - radius, feetY + 0.05, position.z - radius),
    new THREE.Vector3(position.x + radius, feetY + height, position.z + radius)
  );
}

function visualPenetrations(position, actor, targetEntry = null, enemyType = 'grunt') {
  const body = actorBodyBox(position, actor, enemyType);
  const penetrations = [];
  const candidates = targetEntry ? [targetEntry] : assetEntries;
  for (const entry of candidates) {
    if (!entry.root || !effectiveVisibility(entry.root)) continue;
    if ((!targetEntry && entry.expectation?.mode === 'nonblocking')
      || entry.expectation?.occupancyPolicy === 'ambient_allowed'
      || entry.expectation?.occupancyPolicy === 'walkable_composite') continue;
    const meshHit = entry.visualMeshBounds.find(item => bodyIntersectsVisibleMesh(body, item));
    if (meshHit) {
      penetrations.push({
        assetId: entry.placement.asset,
        placementIndex: entry.placementIndex,
        mesh: meshHit.name,
        position: { x: round(position.x), y: round(position.y), z: round(position.z) },
        actorBodyBounds: boxToData(body),
        meshBounds: boxToData(meshHit.bounds)
      });
    }
  }
  return penetrations;
}

function showJourneyPath(entry, path = null) {
  if (activeJourneyLine) scene.remove(activeJourneyLine);
  activeJourneyLine = null;
  const route = path?.length ? path : [
    { x: entry.journey.start[0], z: entry.journey.start[1] },
    { x: entry.journey.goal[0], z: entry.journey.goal[1] }
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(route.map(point => new THREE.Vector3(point.x, 0.18, point.z)));
  const material = new THREE.LineBasicMaterial({ color: entry.journey.actor === 'player' ? 0xffe55c : 0xff6b74 });
  activeJourneyLine = new THREE.Line(geometry, material);
  scene.add(activeJourneyLine);
  journeyMarker.visible = true;
  journeyMarker.position.set(entry.journey.start[0], 0, entry.journey.start[1]);
  journeyBody.material.color.setHex(entry.journey.actor === 'player' ? 0xffe55c : 0xff6b74);
}

async function simulatePortalConvoy(entry) {
  const { journey } = entry;
  const count = Math.max(2, journey.convoyCount || 3);
  const profile = resolveBehaviorProfile(journey.enemyType || 'grunt');
  const plane = journey.portalPlane;
  const directionSign = Math.sign(journey.goal[1] - journey.start[1]) || 1;
  const direction = new THREE.Vector3(0, 0, directionSign);
  const roots = [];
  const stateByRoot = new Map();
  const indexByRoot = new Map();
  const spacing = profile.collisionRadius * 2 + 0.16;
  for (let index = 0; index < count; index++) {
    const root = new THREE.Group();
    root.position.set(journey.start[0], 0.8, journey.start[1] - directionSign * index * spacing);
    root.userData = { type: profile.id, behaviorId: profile.id };
    roots.push(root);
    indexByRoot.set(root, index);
    stateByRoot.set(root, { crossed: false, complete: false, stoppedFrames: 0, maxStoppedFrames: 0 });
  }

  probeManager.refreshColliders(objects);
  const previousEnemies = probeManager.enemies;
  let active = [...roots];
  let elapsedFrames = 0;
  let maxConsecutiveVisualPenetrationTicks = 0;
  let visualPenetrationTicks = 0;
  const penetratedAssets = new Map();
  const blockedBy = {};
  const footprints = [];
  try {
    while (elapsedFrames < 12 * 60 && active.length) {
      probeManager.enemies = new Set(active);
      probeManager.spatialIndex.rebuild(active, root => probeManager._profileForRoot(root));
      active.sort((a, b) => directionSign * (b.position.z - a.position.z));
      for (const root of active) {
        const beforeZ = root.position.z;
        const movement = probeManager._moveWithCollisions(root, direction.clone().multiplyScalar(3.2 / 60));
        if (movement.blockedBy) blockedBy[movement.blockedBy] = (blockedBy[movement.blockedBy] || 0) + 1;
        const state = stateByRoot.get(root);
        const moved = Math.abs(root.position.z - beforeZ);
        state.stoppedFrames = moved < 0.002 ? state.stoppedFrames + 1 : 0;
        state.maxStoppedFrames = Math.max(state.maxStoppedFrames, state.stoppedFrames);
        if (!state.crossed && (beforeZ - plane.value) * (root.position.z - plane.value) <= 0) {
          state.crossed = root.position.x >= plane.min + profile.collisionRadius
            && root.position.x <= plane.max - profile.collisionRadius;
        }
        if (state.crossed && directionSign * (root.position.z - plane.value) >= 2) state.complete = true;
        const penetrations = visualPenetrations(root.position, 'enemy', null, profile.id);
        const actorIndex = indexByRoot.get(root);
        const activePenetrationKeys = new Set();
        if (penetrations.length) {
          visualPenetrationTicks++;
          for (const penetration of penetrations) {
            const key = `${actorIndex}:${penetration.assetId}:${penetration.placementIndex}`;
            activePenetrationKeys.add(key);
            const previous = penetratedAssets.get(key);
            const consecutiveTicks = (previous?.consecutiveTicks || 0) + 1;
            const record = previous || {
              actorIndex,
              assetId: penetration.assetId,
              placementIndex: penetration.placementIndex,
              firstMesh: penetration.mesh,
              firstContact: {
                atSeconds: round(elapsedFrames / 60, 3),
                position: penetration.position,
                actorBodyBounds: penetration.actorBodyBounds,
                meshBounds: penetration.meshBounds
              },
              totalTicks: 0,
              maxConsecutiveTicks: 0,
              consecutiveTicks: 0
            };
            record.totalTicks++;
            record.consecutiveTicks = consecutiveTicks;
            record.maxConsecutiveTicks = Math.max(record.maxConsecutiveTicks, consecutiveTicks);
            maxConsecutiveVisualPenetrationTicks = Math.max(maxConsecutiveVisualPenetrationTicks, consecutiveTicks);
            penetratedAssets.set(key, record);
          }
        }
        for (const [key, record] of penetratedAssets) {
          if (record.actorIndex === actorIndex && !activePenetrationKeys.has(key)) record.consecutiveTicks = 0;
        }
      }
      active = active.filter(root => !stateByRoot.get(root).complete);
      if (elapsedFrames % 30 === 0) {
        footprints.push({
          atSeconds: round(elapsedFrames / 60, 1),
          remaining: active.length,
          actors: roots.map((root, index) => ({ index, x: round(root.position.x), z: round(root.position.z), ...stateByRoot.get(root) }))
        });
      }
      elapsedFrames++;
      if (elapsedFrames % journeyVisualYieldStride === 0) await nextFrame();
    }
  } finally {
    probeManager.enemies = previousEnemies;
    probeManager.spatialIndex.clear();
  }
  const states = [...stateByRoot.values()];
  const completed = states.filter(state => state.complete).length;
  const maxStuckFrames = Math.max(0, ...states.map(state => state.maxStoppedFrames));
  const penetrationEvidence = [...penetratedAssets.values()]
    .map(({ consecutiveTicks, ...item }) => item)
    .sort((a, b) => b.maxConsecutiveTicks - a.maxConsecutiveTicks || b.totalTicks - a.totalTicks);
  return {
    pathFound: true,
    reachedGoal: completed === count,
    pathWaypoints: 0,
    elapsedSeconds: round(elapsedFrames / 60),
    initialDistance: Math.abs(journey.goal[1] - journey.start[1]),
    finalDistance: completed === count ? 0 : active.length,
    progressRatio: round(completed / count),
    distanceTravelled: null,
    maxConsecutiveStuckSeconds: round(maxStuckFrames / 60),
    blockedBy,
    jumpCount: 0,
    visualPenetrationTicks,
    maxConsecutiveVisualPenetrationTicks,
    penetratedAssetCount: penetrationEvidence.length,
    penetrationEvidenceOmitted: Math.max(0, penetrationEvidence.length - 8),
    penetratedAssets: penetrationEvidence.slice(0, 8),
    footprints,
    agentRadius: profile.collisionRadius,
    bodyRadius: profile.collisionRadius,
    enemyType: profile.id,
    convoyCount: count,
    convoyCompleted: completed,
    portalCrossed: states.every(state => state.crossed),
    portalCrossingCoordinate: journey.start[0],
    portalCrossingWithinOpening: states.every(state => state.crossed)
  };
}

async function simulateJourney(entry) {
  const { journey } = entry;
  if (journey.contractKind === 'portal_convoy') return simulatePortalConvoy(entry);
  const start = { x: journey.start[0], z: journey.start[1] };
  const goal = { x: journey.goal[0], z: journey.goal[1] };
  probeManager.refreshColliders(objects);
  probeManager.spatialIndex.clear();
  const enemyProfile = journey.actor === 'enemy' ? resolveBehaviorProfile(journey.enemyType || 'grunt') : null;
  const agentRadius = journey.agentRadius ?? (journey.actor === 'player' ? 0.5 : 0.73);
  const path = findPath(start, goal, probeManager.objectBBs, {
    gridSize: 0.75,
    radius: journey.pathRadius ?? 56,
    agentRadius
  });
  showJourneyPath(entry, path);
  const initialDistance = Math.hypot(goal.x - start.x, goal.z - start.z);
  const penetratedAssets = new Map();
  const blockedBy = {};
  const footprints = [];
  let visualPenetrationTicks = 0;
  let maxConsecutiveVisualPenetrationTicks = 0;
  let maxConsecutiveStuckFrames = 0;
  let consecutiveStuckFrames = 0;
  let distanceTravelled = 0;
  let jumpCount = 0;
  let wasAirborne = false;
  let waypointIndex = 0;
  let reachedGoal = false;
  let elapsedFrames = 0;
  let portalCrossed = false;
  let portalCrossingCoordinate = null;
  let portalCrossingWithinOpening = false;
  const maxFrames = 26 * 60;

  if (!path.length) {
    return {
      pathFound: false,
      reachedGoal: false,
      pathWaypoints: 0,
      elapsedSeconds: 0,
      finalDistance: initialDistance,
      progressRatio: 0,
      maxConsecutiveStuckSeconds: 0,
      visualPenetrationTicks: 0,
      maxConsecutiveVisualPenetrationTicks: 0,
      penetratedAssetCount: 0,
      penetrationEvidenceOmitted: 0,
      penetratedAssets: [],
      footprints: []
    };
  }

  const enemyRoot = journey.actor === 'enemy' ? new THREE.Group() : null;
  if (enemyRoot) {
    enemyRoot.position.set(start.x, 0.8, start.z);
    enemyRoot.userData = { type: journey.enemyType || 'grunt', behaviorId: enemyProfile.id };
  } else {
    probePlayer.refreshColliders(objects);
    resetProbePlayer(new THREE.Vector3(start.x, 1.7, start.z), new THREE.Vector3(0, 0, -1));
  }
  const actorRoot = enemyRoot || probePlayer.controls.getObject();

  while (elapsedFrames < maxFrames) {
    const distanceToGoal = Math.hypot(goal.x - actorRoot.position.x, goal.z - actorRoot.position.z);
    if (distanceToGoal <= journey.tolerance) {
      reachedGoal = true;
      break;
    }
    while (waypointIndex < path.length - 1
      && Math.hypot(path[waypointIndex].x - actorRoot.position.x, path[waypointIndex].z - actorRoot.position.z) < 0.62) {
      waypointIndex++;
    }
    const waypoint = path[Math.min(waypointIndex, path.length - 1)];
    const dx = waypoint.x - actorRoot.position.x;
    const dz = waypoint.z - actorRoot.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const previousX = actorRoot.position.x;
    const previousZ = actorRoot.position.z;

    if (journey.actor === 'player') {
      actorRoot.rotation.y = Math.atan2(-dx / length, -dz / length);
      probePlayer.update(1 / 60);
      const airborne = probePlayer.velocityY > 0.05;
      if (airborne && !wasAirborne) jumpCount++;
      wasAirborne = airborne;
    } else {
      const movement = probeManager._moveWithCollisions(enemyRoot, new THREE.Vector3(dx / length, 0, dz / length).multiplyScalar(3.2 / 60));
      if (movement.blockedBy) blockedBy[movement.blockedBy] = (blockedBy[movement.blockedBy] || 0) + 1;
    }

    const moved = Math.hypot(actorRoot.position.x - previousX, actorRoot.position.z - previousZ);
    distanceTravelled += moved;
    if (moved < 0.002) consecutiveStuckFrames++;
    else consecutiveStuckFrames = 0;
    maxConsecutiveStuckFrames = Math.max(maxConsecutiveStuckFrames, consecutiveStuckFrames);

    if (journey.portalPlane && !portalCrossed) {
      const plane = journey.portalPlane;
      const previousAxis = plane.axis === 'x' ? previousX : previousZ;
      const currentAxis = actorRoot.position[plane.axis];
      const previousSide = previousAxis - plane.value;
      const currentSide = currentAxis - plane.value;
      if (previousSide === 0 || currentSide === 0 || previousSide * currentSide < 0) {
        const denominator = currentAxis - previousAxis;
        const fraction = Math.abs(denominator) > 1e-6 ? (plane.value - previousAxis) / denominator : 0;
        const previousCross = plane.crossAxis === 'x' ? previousX : previousZ;
        const currentCross = actorRoot.position[plane.crossAxis];
        portalCrossingCoordinate = previousCross + (currentCross - previousCross) * Math.max(0, Math.min(1, fraction));
        portalCrossed = true;
        portalCrossingWithinOpening = portalCrossingCoordinate >= plane.min + agentRadius
          && portalCrossingCoordinate <= plane.max - agentRadius;
      }
    }

    const penetrations = visualPenetrations(actorRoot.position, journey.actor, null, journey.enemyType || 'grunt');
    const activePenetrationKeys = new Set();
    if (penetrations.length) {
      visualPenetrationTicks++;
      for (const penetration of penetrations) {
        const key = `${penetration.assetId}:${penetration.placementIndex}`;
        activePenetrationKeys.add(key);
        const previous = penetratedAssets.get(key);
        const consecutiveTicks = (previous?.consecutiveTicks || 0) + 1;
        const record = previous || {
          assetId: penetration.assetId,
          placementIndex: penetration.placementIndex,
          firstMesh: penetration.mesh,
          firstContact: {
            atSeconds: round(elapsedFrames / 60, 3),
            position: penetration.position,
            actorBodyBounds: penetration.actorBodyBounds,
            meshBounds: penetration.meshBounds
          },
          totalTicks: 0,
          maxConsecutiveTicks: 0,
          consecutiveTicks: 0
        };
        record.totalTicks++;
        record.consecutiveTicks = consecutiveTicks;
        record.maxConsecutiveTicks = Math.max(record.maxConsecutiveTicks, consecutiveTicks);
        maxConsecutiveVisualPenetrationTicks = Math.max(maxConsecutiveVisualPenetrationTicks, record.maxConsecutiveTicks);
        penetratedAssets.set(key, record);
      }
    }
    for (const [key, record] of penetratedAssets) {
      if (!activePenetrationKeys.has(key)) record.consecutiveTicks = 0;
    }
    if (elapsedFrames % 30 === 0) {
      footprints.push({
        atSeconds: round(elapsedFrames / 60, 1),
        x: round(actorRoot.position.x),
        y: round(actorRoot.position.y),
        z: round(actorRoot.position.z),
        distanceToGoal: round(distanceToGoal),
        waypointIndex
      });
    }
    journeyMarker.position.set(actorRoot.position.x, Math.max(0, actorRoot.position.y - (journey.actor === 'player' ? 1.7 : 0.8)), actorRoot.position.z);
    elapsedFrames++;
    if (elapsedFrames % journeyVisualYieldStride === 0) await nextFrame();
  }

  if (journey.actor === 'player') probePlayer.keys.clear();
  const finalDistance = Math.hypot(goal.x - actorRoot.position.x, goal.z - actorRoot.position.z);
  const penetrationEvidence = [...penetratedAssets.values()]
    .map(({ consecutiveTicks, ...item }) => item)
    .sort((a, b) => b.maxConsecutiveTicks - a.maxConsecutiveTicks || b.totalTicks - a.totalTicks);
  footprints.push({
    atSeconds: round(elapsedFrames / 60, 1),
    x: round(actorRoot.position.x),
    y: round(actorRoot.position.y),
    z: round(actorRoot.position.z),
    distanceToGoal: round(finalDistance),
    waypointIndex
  });
  return {
    pathFound: true,
    reachedGoal,
    pathWaypoints: path.length,
    elapsedSeconds: round(elapsedFrames / 60),
    initialDistance: round(initialDistance),
    finalDistance: round(finalDistance),
    progressRatio: round(Math.max(0, Math.min(1, 1 - finalDistance / Math.max(0.001, initialDistance)))),
    distanceTravelled: round(distanceTravelled),
    maxConsecutiveStuckSeconds: round(maxConsecutiveStuckFrames / 60),
    blockedBy,
    jumpCount,
    visualPenetrationTicks,
    maxConsecutiveVisualPenetrationTicks,
    penetratedAssetCount: penetrationEvidence.length,
    penetrationEvidenceOmitted: Math.max(0, penetrationEvidence.length - 8),
    penetratedAssets: penetrationEvidence.slice(0, 8),
    footprints,
    agentRadius: round(agentRadius),
    bodyRadius: round(journey.actor === 'player' ? probePlayer.colliderHalf.x : enemyProfile.collisionRadius),
    enemyType: journey.actor === 'enemy' ? enemyProfile.id : null,
    portalCrossed,
    portalCrossingCoordinate: portalCrossingCoordinate == null ? null : round(portalCrossingCoordinate),
    portalCrossingWithinOpening
  };
}

async function testJourney(entry) {
  const metrics = await simulateJourney(entry);
  return evaluateLevelJourneyProbe({
    objectId: entry.id,
    levelObjectId: entry.levelObjectId,
    label: entry.label,
    objectKind: 'journey',
    phaseId: entry.phase.id,
    phaseLabel: entry.phase.label,
    journeyId: entry.journey.id,
    actor: entry.journey.actor,
    enemyType: entry.journey.enemyType || null,
    contractKind: entry.journey.contractKind || null,
    portalId: entry.journey.portalId || null,
    portalPlane: entry.journey.portalPlane || null,
    start: entry.journey.start,
    goal: entry.journey.goal,
    tolerance: entry.journey.tolerance,
    metrics
  });
}

const assetApproachDirections = Object.freeze([
  Object.freeze({ id: 'north', x: 0, z: -1 }),
  Object.freeze({ id: 'north_east', x: 0.7071, z: -0.7071 }),
  Object.freeze({ id: 'east', x: 1, z: 0 }),
  Object.freeze({ id: 'south_east', x: 0.7071, z: 0.7071 }),
  Object.freeze({ id: 'south', x: 0, z: 1 }),
  Object.freeze({ id: 'south_west', x: -0.7071, z: 0.7071 }),
  Object.freeze({ id: 'west', x: -1, z: 0 }),
  Object.freeze({ id: 'north_west', x: -0.7071, z: -0.7071 })
]);

function approachStartIsValid(position, actor) {
  const radius = actor === 'player' ? probePlayer.colliderHalf.x : 0.58;
  const bounds = levelDefinition.bossArenaBounds;
  if (position.x < bounds.minX + radius || position.x > bounds.maxX - radius
    || position.z < bounds.minZ + radius || position.z > bounds.maxZ - radius) {
    return { valid: false, reason: 'outside_playable_bounds' };
  }
  const body = actorBodyBox(position, actor);
  if (probeManager.objectBBs.some(box => penetrationDepth(body, box))) return { valid: false, reason: 'start_inside_collider' };
  if (visualPenetrations(position, actor).length) return { valid: false, reason: 'start_inside_visible_geometry' };
  return { valid: true, reason: null };
}

function minimumApproachesForEntry(entry) {
  const center = entry.visualBounds?.getCenter(new THREE.Vector3());
  if (!center) return 3;
  const bounds = levelDefinition.bossArenaBounds;
  const boundaryDistance = Math.min(
    center.x - bounds.minX,
    bounds.maxX - center.x,
    center.z - bounds.minZ,
    bounds.maxZ - center.z
  );
  // Perimeter architecture cannot provide meaningful starts from the sealed
  // side of the arena. Two independent playable approaches are sufficient.
  return boundaryDistance < 4.5 ? 2 : 3;
}

function showApproachLine(entry, start, goal) {
  if (activeJourneyLine) scene.remove(activeJourneyLine);
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(start.x, 0.2, start.z),
    new THREE.Vector3(goal.x, 0.2, goal.z)
  ]);
  activeJourneyLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: entry.actor === 'player' ? 0xffe55c : 0xff6b74 }));
  scene.add(activeJourneyLine);
  journeyMarker.visible = true;
  journeyMarker.position.set(start.x, 0, start.z);
  journeyBody.material.color.setHex(entry.actor === 'player' ? 0xffe55c : 0xff6b74);
}

async function simulateAssetApproaches(entry) {
  const visualBounds = entry.visualBounds;
  if (!visualBounds || visualBounds.isEmpty()) return { approaches: [] };
  probeManager.refreshColliders(objects);
  probeManager.spatialIndex.clear();
  // Phase changes mutate the shared collision collection. Take an explicit
  // player snapshot for every asset so a diagonal probe never reuses the
  // collider boxes cached by an earlier journey or phase.
  if (entry.actor === 'player') probePlayer.refreshColliders(objects);
  const approachBounds = visualBounds.clone();
  const movementTargetBoxes = [];
  const movementTargetColliderIds = [];
  for (const colliderId of entry.expectation?.colliderIds || []) {
    const collider = colliderById.get(colliderId);
    if (!collider?.bounds) continue;
    approachBounds.union(collider.bounds);
    if (collider.definition?.blocksMovement !== false) {
      movementTargetBoxes.push(collider.bounds);
      movementTargetColliderIds.push(colliderId);
    }
  }
  const crossingTargetBounds = entry.expectation?.mode === 'solid' && movementTargetBoxes.length
    ? unionBounds(movementTargetBoxes)
    : visualBounds;
  const center = approachBounds.getCenter(new THREE.Vector3());
  const size = approachBounds.getSize(new THREE.Vector3());
  const radius = entry.actor === 'player' ? probePlayer.colliderHalf.x : 0.58;
  const approaches = [];

  for (const direction of assetApproachDirections) {
    const tangent = new THREE.Vector3(-direction.z, 0, direction.x);
    const supportDistance = Math.abs(direction.x) * size.x * 0.5 + Math.abs(direction.z) * size.z * 0.5;
    let selectedStart = null;
    let selectedGoal = null;
    let selectedLateralOffset = null;
    let lastInvalidReason = 'no_valid_perimeter_start';
    const lateralOffsets = [0, radius + 0.45, -(radius + 0.45), radius + 1.1, -(radius + 1.1)];
    const clearances = [1.8, 1.15, 2.6, 3.5];
    for (const clearance of clearances) {
      for (const lateralOffset of lateralOffsets) {
        const startCandidate = new THREE.Vector3(
          center.x + direction.x * (supportDistance + radius + clearance) + tangent.x * lateralOffset,
          entry.actor === 'player' ? 1.7 : 0.8,
          center.z + direction.z * (supportDistance + radius + clearance) + tangent.z * lateralOffset
        );
        const validity = approachStartIsValid(startCandidate, entry.actor);
        if (!validity.valid) {
          lastInvalidReason = validity.reason;
          continue;
        }
        selectedStart = startCandidate;
        selectedLateralOffset = lateralOffset;
        selectedGoal = new THREE.Vector3(
          center.x - direction.x * (supportDistance + radius + 0.8) + tangent.x * lateralOffset,
          startCandidate.y,
          center.z - direction.z * (supportDistance + radius + 0.8) + tangent.z * lateralOffset
        );
        break;
      }
      if (selectedStart) break;
    }
    if (!selectedStart || !selectedGoal) {
      approaches.push({ direction: direction.id, exercised: false, reason: lastInvalidReason });
      continue;
    }
    const start = selectedStart;
    const goal = selectedGoal;
    const plannedCorridorIntersectsTarget = segmentIntersectsExpandedBounds2D(start, goal, crossingTargetBounds, radius);

    showApproachLine(entry, start, goal);
    const enemyRoot = entry.actor === 'enemy' ? new THREE.Group() : null;
    if (enemyRoot) {
      enemyRoot.position.copy(start);
      enemyRoot.userData = { type: 'grunt', behaviorId: 'grunt' };
    } else {
      probePlayer.refreshColliders(objects);
      resetProbePlayer(start, new THREE.Vector3(-direction.x, 0, -direction.z));
    }
    const actorRoot = enemyRoot || probePlayer.controls.getObject();
    const travelDirection = goal.clone().sub(start).setY(0).normalize();
    const requestedDistance = start.distanceTo(goal);
    let totalPenetrationTicks = 0;
    let consecutivePenetrationTicks = 0;
    let maxConsecutivePenetrationTicks = 0;
    let firstContact = null;
    let consecutiveStoppedFrames = 0;
    let stoppedByWorld = false;
    let crossedVisualFootprint = false;
    let elapsedFrames = 0;
    let progress = 0;
    let maxLateralDeviation = 0;
    let reachedFarSide = false;
    let minimumHeight = actorRoot.position.y;
    let maximumHeight = actorRoot.position.y;

    while (elapsedFrames < 12 * 60) {
      const previousX = actorRoot.position.x;
      const previousZ = actorRoot.position.z;
      if (entry.actor === 'player') {
        const toGoal = goal.clone().sub(actorRoot.position).setY(0);
        actorRoot.rotation.y = Math.atan2(-toGoal.x, -toGoal.z);
        probePlayer.update(1 / 60);
      } else {
        const movement = probeManager._moveWithCollisions(enemyRoot, travelDirection.clone().multiplyScalar(3.2 / 60));
        if (movement.blockedBy === 'world') stoppedByWorld = true;
      }
      const moved = Math.hypot(actorRoot.position.x - previousX, actorRoot.position.z - previousZ);
      minimumHeight = Math.min(minimumHeight, actorRoot.position.y);
      maximumHeight = Math.max(maximumHeight, actorRoot.position.y);
      consecutiveStoppedFrames = moved < 0.002 ? consecutiveStoppedFrames + 1 : 0;
      progress = (actorRoot.position.x - start.x) * travelDirection.x + (actorRoot.position.z - start.z) * travelDirection.z;
      const lateralDeviation = Math.abs((actorRoot.position.x - start.x) * tangent.x + (actorRoot.position.z - start.z) * tangent.z);
      maxLateralDeviation = Math.max(maxLateralDeviation, lateralDeviation);
      const penetrations = visualPenetrations(actorRoot.position, entry.actor, entry.assetEntry);
      if (penetrations.length) {
        totalPenetrationTicks++;
        consecutivePenetrationTicks++;
        maxConsecutivePenetrationTicks = Math.max(maxConsecutivePenetrationTicks, consecutivePenetrationTicks);
        firstContact ||= {
          atSeconds: round(elapsedFrames / 60, 3),
          position: penetrations[0].position,
          actorBodyBounds: penetrations[0].actorBodyBounds,
          mesh: penetrations[0].mesh,
          meshBounds: penetrations[0].meshBounds
        };
      } else {
        consecutivePenetrationTicks = 0;
      }
      journeyMarker.position.set(actorRoot.position.x, Math.max(0, actorRoot.position.y - (entry.actor === 'player' ? 1.7 : 0.8)), actorRoot.position.z);
      elapsedFrames++;
      if (progress >= requestedDistance - 0.25) {
        reachedFarSide = true;
        const actualCorridorIntersectsTarget = segmentIntersectsExpandedBounds2D(start, actorRoot.position, crossingTargetBounds, radius);
        crossedVisualFootprint = plannedCorridorIntersectsTarget && actualCorridorIntersectsTarget
          && maxLateralDeviation <= radius * 0.75 && !stoppedByWorld;
        break;
      }
      if (consecutiveStoppedFrames >= 24) {
        stoppedByWorld = true;
        break;
      }
      if (elapsedFrames % journeyVisualYieldStride === 0) await nextFrame();
    }
    if (entry.actor === 'player') probePlayer.keys.clear();
    approaches.push({
      direction: direction.id,
      exercised: true,
      elapsedSeconds: round(elapsedFrames / 60),
      requestedDistance: round(requestedDistance),
      appliedDistance: round(progress),
      selectedLateralOffset: round(selectedLateralOffset),
      plannedCorridorIntersectsTarget,
      movementTargetColliderIds,
      crossingTargetBounds: boxToData(crossingTargetBounds),
      maxLateralDeviation: round(maxLateralDeviation),
      heightRange: { min: round(minimumHeight), max: round(maximumHeight), final: round(actorRoot.position.y) },
      actorBody: { radius: round(radius), height: entry.actor === 'player' ? probePlayer.fullHeight : 1.6 },
      reachedFarSide,
      stoppedByWorld,
      crossedVisualFootprint,
      totalPenetrationTicks,
      maxConsecutivePenetrationTicks,
      firstContact
    });
    await nextFrame();
  }
  return {
    approaches,
    exercisedApproaches: approaches.filter(item => item.exercised).length,
    penetratedApproaches: approaches.filter(item => item.maxConsecutivePenetrationTicks > 1).length,
    crossedApproaches: approaches.filter(item => item.crossedVisualFootprint).length
  };
}

async function testAssetApproach(entry) {
  const metrics = await simulateAssetApproaches(entry);
  return evaluateAssetApproachProbe({
    objectId: entry.id,
    levelObjectId: entry.levelObjectId,
    label: entry.label,
    objectKind: 'asset_approach',
    phaseId: entry.phase.id,
    phaseLabel: entry.phase.label,
    assetId: entry.placement.asset,
    placementIndex: entry.placementIndex,
    actor: entry.actor,
    expectation: entry.expectation,
    minimumApproaches: minimumApproachesForEntry(entry),
    metrics
  });
}

function focusEntry(entry) {
  if (activeBoxHelper) scene.remove(activeBoxHelper);
  activeBoxHelper = null;
  if (entry.kind === 'journey') {
    showJourneyPath(entry);
    return;
  }
  journeyMarker.visible = false;
  if (activeJourneyLine) {
    scene.remove(activeJourneyLine);
    activeJourneyLine = null;
  }
  for (const collider of colliderEntries) {
    collider.object.material.opacity = collider === entry ? 0.62 : 0.1;
    collider.object.material.color.setHex(collider === entry ? 0xffc94a : 0x3a8ba0);
  }
  const target = entry.object || entry.root;
  if (target) {
    const box = new THREE.Box3().setFromObject(target);
    activeBoxHelper = new THREE.Box3Helper(box, entry.kind === 'solid' ? 0xffdf5d : 0x58e6ff);
    scene.add(activeBoxHelper);
  }
}

function channelCell(value, passWord = 'Blocked') {
  if (!value) return '—';
  if (!value.exercised) return 'N/A';
  return value.blocked ? passWord : 'LEAK';
}

function updateRow(result) {
  const row = rowById.get(result.objectId);
  if (!row) return;
  row.dataset.state = result.status;
  const cells = row.children;
  if (result.objectKind === 'solid') {
    cells[3].textContent = channelCell(result.channels.playerWalk);
    cells[4].textContent = result.channels.playerJumpWalk.notApplicable
      ? 'N/A'
      : (result.channels.playerJumpWalk.passed ? 'Crossed' : 'Blocked');
    cells[5].textContent = channelCell(result.channels.enemyWalk);
    cells[6].textContent = channelCell(result.channels.playerShot);
    cells[7].textContent = channelCell(result.channels.enemyShot);
    cells[8].textContent = `${result.geometry.width}×${result.geometry.height}×${result.geometry.depth}`;
  } else if (result.objectKind === 'visual_asset') {
    cells[8].textContent = result.expectation?.mode === 'nonblocking'
      ? 'Non-blocking'
      : `${result.overlappingColliderIds.length}/${result.expectation?.colliderIds?.length || 0} linked`;
  } else if (result.objectKind === 'journey') {
    const actorCell = result.actor === 'player' ? 3 : 5;
    cells[actorCell].textContent = result.metrics.reachedGoal
      ? 'Reached'
      : `${Math.round((result.metrics.progressRatio || 0) * 100)}%`;
    cells[4].textContent = result.actor === 'player' ? `${result.metrics.jumpCount || 0} jumps` : '—';
    cells[8].textContent = `${result.metrics.pathWaypoints || 0} wp / ${result.metrics.visualPenetrationTicks || 0} intrusions`;
  } else {
    const actorCell = result.actor === 'player' ? 3 : 5;
    cells[actorCell].textContent = `${result.metrics.exercisedApproaches || 0}/8 tested`;
    cells[8].textContent = `${result.metrics.penetratedApproaches || 0} entered / ${result.metrics.crossedApproaches || 0} crossed`;
  }
  cells[9].textContent = result.status.replace('_', ' ');
  cells[9].title = result.summary;
}

function renderRows(entries) {
  elements.rows.innerHTML = '';
  rowById = new Map();
  for (const entry of entries) {
    const row = document.createElement('tr');
    row.dataset.state = 'pending';
    const kindLabel = entry.kind === 'solid'
      ? 'Collider'
      : (entry.kind === 'journey'
        ? `${entry.journey.actor} journey`
        : (entry.kind === 'approach' ? `${entry.actor} approaches` : 'Visual asset'));
    row.innerHTML = `<td>${entry.label}</td><td>${entry.phase.label}</td><td>${kindLabel}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>Pending</td>`;
    row.addEventListener('click', () => focusEntry(entry));
    elements.rows.appendChild(row);
    rowById.set(entry.id, row);
  }
}

function updateSummary(summary = { pass: 0, warn: 0, fail: 0, inconclusive: 0 }) {
  elements.pass.textContent = `Pass ${summary.pass || 0}`;
  elements.warn.textContent = `Warn ${summary.warn || 0}`;
  elements.fail.textContent = `Fail ${summary.fail || 0}`;
  elements.inconclusive.textContent = `Inconclusive ${summary.inconclusive || 0}`;
}

function selectedMatrix() {
  return matrix.filter(entry => (!elements.kind.value || entry.kind === elements.kind.value
      || (elements.kind.value === 'portal_transit' && entry.kind === 'journey' && entry.journey.contractKind?.startsWith?.('portal_')))
    && (!elements.object.value || entry.id === elements.object.value));
}

function selectedPhases() {
  return collisionProfile.phases.filter(phase => !elements.phase.value || phase.id === elements.phase.value);
}

function buildRunMatrix() {
  const phases = selectedPhases();
  const entries = selectedMatrix();
  return phases.flatMap((phase, phaseIndex) => entries
    .filter(entry => {
      const journeyApplicable = entry.kind !== 'journey'
        || !entry.journey.applicablePhases
        || entry.journey.applicablePhases.includes(phase.id);
      if (!journeyApplicable) return false;
      const phaseSensitiveAsset = (entry.kind === 'visual_asset' || entry.kind === 'approach')
        && (entry.placement.tags || []).some(tag => collisionProfile.phaseSensitiveTags.includes(tag));
      const repeatJourneyEachPhase = entry.kind === 'journey' && !entry.journey.staticOnce;
      const phaseSpecificJourney = entry.kind === 'journey' && !!entry.journey.applicablePhases;
      const phaseCovered = elements.phase.value || phaseIndex === 0 || repeatJourneyEachPhase || phaseSpecificJourney || phaseSensitiveAsset;
      const visibleApproach = entry.kind !== 'approach' || collisionProfile.assetPhaseExpectedVisible(entry.placement, phase.id);
      return phaseCovered && visibleApproach;
    })
    .map(entry => ({
      ...entry,
      id: `${phase.id}:${entry.id}`,
      levelObjectId: entry.id,
      phase
    })));
}

function refreshCachedSceneBounds() {
  levelRuntime.group.updateWorldMatrix(true, true);
  for (const collider of colliderEntries) collider.bounds.setFromObject(collider.object);
  for (const entry of assetEntries) {
    for (const meshEntry of entry.visualMeshBounds) {
      const object = meshEntry.object;
      object.updateWorldMatrix(true, false);
      if (!object.geometry?.boundingBox) object.geometry?.computeBoundingBox?.();
      if (object.geometry?.boundingBox) meshEntry.bounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
    }
    if (entry.visualBounds) {
      entry.visualBounds.makeEmpty();
      for (const meshEntry of entry.visualMeshBounds) entry.visualBounds.union(meshEntry.bounds);
    }
  }
}

function applyPhase(phase) {
  levelRuntime.onWaveStart(phase.wave);
  if (phase.liberated) levelRuntime.onBossDefeated(levelDefinition.bossWave);
  if (levelDefinition.id === 'ad-zone-arena') {
    const phaseIndex = collisionProfile.phases.findIndex(candidate => candidate.id === phase.id);
    levelRuntime.movingCoverTime = Math.max(0, phaseIndex) * 3.25;
    levelRuntime._updateAdZoneMotion?.(0);
  }
  refreshCachedSceneBounds();
}

async function runDiagnostic() {
  if (running) return;
  levelRuntime.reset();
  if (levelDefinition.id === 'ad-zone-arena') {
    levelRuntime.movingCoverTime = 0;
    levelRuntime._updateAdZoneMotion?.(0);
    refreshCachedSceneBounds();
  }
  const selected = buildRunMatrix();
  if (!selected.length) {
    elements.status.textContent = 'No objects match the selected filters.';
    return;
  }
  running = true;
  const animatedProbeCount = selected.filter(entry => entry.kind === 'journey' || entry.kind === 'approach').length;
  journeyVisualYieldStride = animatedProbeCount > 0 && animatedProbeCount <= 6 ? 8 : 120;
  stopRequested = false;
  runStartedAt = performance.now();
  errors.length = 0;
  interruptions.length = 0;
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.copy.disabled = true;
  elements.download.disabled = true;
  elements.output.classList.remove('ready');
  elements.output.value = '';
  elements.progress.style.width = '0%';
  updateSummary();
  renderRows(selected);
  const startedAt = new Date().toISOString();
  const results = [];
  let activePhaseId = null;

  for (let index = 0; index < selected.length; index++) {
    if (stopRequested) break;
    const entry = selected[index];
    if (entry.phase.id !== activePhaseId) {
      applyPhase(entry.phase);
      activePhaseId = entry.phase.id;
    }
    const row = rowById.get(entry.id);
    row.dataset.state = 'running';
    elements.status.textContent = `Testing ${entry.phase.label}: ${entry.label}`;
    focusEntry(entry);
    await nextFrame();
    try {
      const result = entry.kind === 'solid'
        ? testSolid(entry)
        : (entry.kind === 'journey'
          ? await testJourney(entry)
          : (entry.kind === 'approach' ? await testAssetApproach(entry) : testAsset(entry)));
      results.push(result);
      updateRow(result);
    } catch (error) {
      recordError(error, entry.id);
      const result = {
        objectId: entry.id,
        levelObjectId: entry.levelObjectId,
        label: entry.label,
        objectKind: entry.kind,
        phaseId: entry.phase.id,
        phaseLabel: entry.phase.label,
        status: 'inconclusive',
        findings: [{ code: 'probe_runtime_error', severity: 'inconclusive', message: String(error?.message || error), evidence: {} }],
        summary: 'The object probe crashed before producing evidence.'
      };
      results.push(result);
      updateRow(result);
    }
    elements.progress.style.width = `${((index + 1) / selected.length) * 100}%`;
    elements.elapsed.textContent = `${((performance.now() - runStartedAt) / 1000).toFixed(1)}s`;
  }

  report = buildLevelCollisionReport({
    levelId: levelDefinition.id,
    environment: {
      appVersion: APP_VERSION,
      page: 'test-level-collisions.html',
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      renderer: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL',
      blockBoxChannels: [...debugColliderChannels],
      blockBoxesAffectCollision: false,
      objectFilter: elements.object.value || null,
      kindFilter: elements.kind.value || null,
      phaseFilter: elements.phase.value || null,
      phases: selectedPhases().map(phase => ({ id: phase.id, label: phase.label })),
      levelLabel: collisionProfile.label,
      journeyContracts: collisionProfile.journeys.map(journey => ({
        id: journey.id,
        actor: journey.actor,
        enemyType: journey.enemyType || null,
        contractKind: journey.contractKind || 'full_scene',
        staticOnce: !!journey.staticOnce,
        applicablePhases: journey.applicablePhases || null
      })),
      assetApproachDirections: assetApproachDirections.map(direction => direction.id),
      assetApproachPolicy: 'adaptive_playable_starts_with_actual_route_target_intersection',
      visualIntersectionMode: 'world_transform_precise_bounds_plus_mesh_rays_and_48_radial_boundary_samples',
      walkableVisualTrimHeight: WALKABLE_VISUAL_TRIM_HEIGHT,
      penetrationEvidenceLimitPerJourney: 8,
      phaseCompaction: elements.phase.value ? 'selected_phase_full_matrix' : 'static_once_phase_sensitive_and_movement_probes_each_phase',
      dynamicColliderSampling: levelDefinition.id === 'ad-zone-arena' ? 'deterministic_pose_per_phase' : null,
      materialCompatibilityRepairs: [...materialCompatibilityRepairs],
      playerBody: { radius: probePlayer.colliderHalf.x, height: probePlayer.fullHeight, jumpVelocity: 7, gravity: 20 },
      enemyBody: { archetype: 'grunt', radius: 0.58, height: 1.6 }
    },
    startedAt,
    completedAt: new Date().toISOString(),
    results,
    errors: [...errors],
    interruptions: [...interruptions, ...(stopRequested ? [{ type: 'manual_stop', completed: results.length, planned: selected.length }] : [])]
  });
  window.__levelCollisionReport = report;
  window.__levelCollisionDiagnosticDone = true;
  const json = JSON.stringify(report);
  elements.output.value = json;
  elements.output.classList.add('ready');
  elements.copy.disabled = false;
  elements.download.disabled = false;
  updateSummary(report.summary);
  elements.status.textContent = stopRequested
    ? `Stopped after ${results.length}/${selected.length} objects.`
    : `Complete: ${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.inconclusive} inconclusive.`;
  running = false;
  elements.run.disabled = false;
  elements.stop.disabled = true;
}

function populateMatrix() {
  // LevelRuntime places scaled/rotated prefab roots below the level group.
  // Finalize the complete parent chain before caching any child mesh bounds.
  levelRuntime.group.updateWorldMatrix(true, true);
  const rootQueues = new Map();
  for (const child of levelRuntime.group.children) {
    const assetId = child.userData?.levelAssetId || (child.name.startsWith('relay:') ? child.name.slice('relay:'.length) : null);
    if (!assetId) continue;
    if (!rootQueues.has(assetId)) rootQueues.set(assetId, []);
    rootQueues.get(assetId).push(child);
  }

  colliderEntries = [
    ...levelRuntime.colliderObjects.map((object, index) => ({
      id: levelDefinition.colliders[index].id,
      label: levelDefinition.colliders[index].id,
      kind: 'solid',
      object,
      definition: levelDefinition.colliders[index],
      bounds: new THREE.Box3().setFromObject(object)
    })),
    ...levelRuntime.walkableObjects.map((object, index) => ({
      id: levelDefinition.walkableSurfaces[index].id,
      label: levelDefinition.walkableSurfaces[index].id,
      kind: 'walkable',
      object,
      definition: levelDefinition.walkableSurfaces[index],
      bounds: new THREE.Box3().setFromObject(object)
    }))
  ];
  colliderById = new Map(colliderEntries.map(entry => [entry.id, entry]));
  const placementCount = new Map();
  assetEntries = levelDefinition.assets.map(placement => {
    const placementIndex = placementCount.get(placement.asset) || 0;
    placementCount.set(placement.asset, placementIndex + 1);
    const root = rootQueues.get(placement.asset)?.[placementIndex] || null;
    const visualMeshBounds = [];
    root?.traverse(node => {
      if (!node.isMesh) return;
      node.updateWorldMatrix(true, false);
      if (!node.geometry?.boundingBox) node.geometry?.computeBoundingBox?.();
      const bounds = node.geometry?.boundingBox?.clone().applyMatrix4(node.matrixWorld) || new THREE.Box3();
      if (bounds.isEmpty() || bounds.max.y <= WALKABLE_VISUAL_TRIM_HEIGHT) return;
      visualMeshBounds.push({ name: node.name || node.userData?.part || 'mesh', object: node, bounds });
    });
    const visualBounds = visualMeshBounds.length ? unionBounds(visualMeshBounds.map(item => item.bounds)) : null;
    return {
      id: `asset:${placement.asset}:${placementIndex}`,
      label: `${placement.asset} #${placementIndex + 1}`,
      kind: 'visual_asset',
      placement,
      placementIndex,
      root,
      visualMeshBounds,
      visualBounds,
      expectation: collisionProfile.assetCollisionExpectation(placement, placementIndex, levelDefinition)
    };
  });
  const journeyEntries = collisionProfile.journeys.map(journey => ({
    id: `journey:${journey.id}`,
    label: journey.label,
    kind: 'journey',
    journey
  }));
  const approachEntries = assetEntries
    .filter(entry => !collisionProfile.excludedApproachAssets.includes(entry.placement.asset) && entry.visualBounds && !entry.visualBounds.isEmpty())
    .flatMap(entry => ['player', 'enemy'].map(actor => ({
      ...entry,
      id: `approach:${entry.placement.asset}:${entry.placementIndex}:${actor}`,
      label: `${entry.placement.asset} #${entry.placementIndex + 1} — ${actor} perimeter`,
      kind: 'approach',
      actor,
      assetEntry: entry
    })));
  matrix = [...journeyEntries, ...approachEntries, ...colliderEntries.filter(entry => entry.kind === 'solid'), ...assetEntries];
  for (const entry of matrix) elements.object.add(new Option(entry.label, entry.id));
  if (params.has('phase')) elements.phase.value = params.get('phase');
  if (params.has('kind')) elements.kind.value = params.get('kind');
  if (params.has('object')) elements.object.value = params.get('object');
  renderRows(buildRunMatrix());
}

async function initialize() {
  elements.level.value = levelDefinition.id;
  elements.phase.replaceChildren(new Option('All phases', ''));
  for (const phase of collisionProfile.phases) elements.phase.add(new Option(phase.label, phase.id));
  document.title = `Quarantine of Joy — ${collisionProfile.label} Obstacle Diagnostic`;
  document.getElementById('diagnosticTitle').textContent = `${collisionProfile.label} obstacle and boundary diagnostic`;
  document.getElementById('diagnosticDescription').textContent = `Runs full-scene player and enemy journeys plus adaptive perimeter approaches around every visible asset across ${collisionProfile.phases[0].label} through liberation. It checks production movement, hitscan, projectiles, phase visibility, precise world-space mesh contact, and visible-object boundaries.`;
  elements.run.textContent = `Run ${collisionProfile.shortLabel} diagnostic`;
  elements.status.textContent = `Loading ${collisionProfile.shortLabel} production assets…`;
  elements.run.disabled = true;
  await loadGeneratedModels({ ids: levelConfig.assetIds, optimizeStatic: false });
  levelRuntime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: null,
    clonePrefab,
    cullGrass: null,
    onObjective: null,
    onWarning: message => console.warn(message),
    onRefreshColliders: null,
    onTransitionToLegacy: null,
    debugColliderChannels
  });
  levelRuntime.load(levelDefinition);
  levelRuntime.onWaveStart(levelDefinition.firstWave);
  normalizeSceneMaterialHooks();
  for (const collider of levelRuntime.colliderObjects) {
    collider.material.visible = true;
    collider.material.color.setHex(0x3a8ba0);
    collider.material.transparent = true;
    collider.material.opacity = 0.1;
    collider.material.depthWrite = false;
  }
  for (const surface of levelRuntime.walkableObjects) {
    surface.material.visible = true;
    surface.material.color.setHex(0x54e6a5);
    surface.material.transparent = true;
    surface.material.opacity = 0.2;
    surface.material.wireframe = true;
  }
  populateMatrix();
  const blockBoxStatus = debugColliderChannels.length
    ? ` Boundary overlays: ${debugColliderChannels.map(channel => channel.toUpperCase()).join(', ')}.`
    : '';
  elements.status.textContent = `${levelDefinition.colliders.length} solids and ${levelDefinition.assets.length} visual placements ready for ${collisionProfile.shortLabel}.${blockBoxStatus}`;
  elements.run.disabled = false;
  if (autoRun) runDiagnostic();
}

elements.run.addEventListener('click', runDiagnostic);
elements.stop.addEventListener('click', () => { stopRequested = true; });
elements.level.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('level', elements.level.value);
  url.searchParams.delete('phase');
  url.searchParams.delete('object');
  location.assign(url);
});
elements.phase.addEventListener('change', () => renderRows(buildRunMatrix()));
elements.kind.addEventListener('change', () => renderRows(buildRunMatrix()));
elements.object.addEventListener('change', () => renderRows(buildRunMatrix()));
elements.copy.addEventListener('click', async () => {
  if (!report) return;
  await navigator.clipboard.writeText(JSON.stringify(report));
  elements.status.textContent = 'Report copied.';
});
elements.download.addEventListener('click', () => {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${levelDefinition.id}-collision-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
initialize().catch(error => {
  recordError(error, 'initialization');
  elements.status.textContent = `Initialization failed: ${error.message}`;
});
