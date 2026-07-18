import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { createWorld } from '../world.js?v=2';
import { Effects } from '../effects.js';
import { EnemyManager } from '../enemies.js';
import { Pickups } from '../pickups.js';
import { PlayerController } from '../player.js';
import { WeatherSystem } from '../weather.js';
import { WeaponView } from '../weapons/view.js';
import { Pistol } from '../weapons/pistol.js';
import { SMG } from '../weapons/smg.js';
import { Rifle } from '../weapons/rifle.js';
import { APP_VERSION } from '../version.js';
import { scheduleCappedFrame, TARGET_FRAME_MS } from '../game/render-budget.js';
import {
  ENVIRONMENT_DIAGNOSTIC_SCENARIOS,
  PERSISTENT_COMBAT_DIAGNOSTIC_PHASES,
  PersistentCombatMetrics,
  WAVE72_STRESS_PROFILE,
  WEAPON_DIAGNOSTIC_SCENARIOS,
  ScenarioMetrics,
  buildWeaponDiagnosticReport,
  createWeaponDiagnosticConfig
} from './weapon-performance-diagnostic.js';

const statusEl = document.getElementById('status');
const elapsedEl = document.getElementById('elapsed');
const progressEl = document.getElementById('progressBar');
const rowsEl = document.getElementById('scenarioRows');
const outputEl = document.getElementById('diagnosticOutput');
const copyButton = document.getElementById('copyReport');
const downloadButton = document.getElementById('downloadReport');
const runAgainButton = document.getElementById('runAgain');
const environmentFrame = document.getElementById('environmentFrame');

const DEFAULT_FLAGS = Object.freeze({
  aa: '1',
  shadows: '1',
  tone: '1',
  autoDPR: '0',
  environmentSuite: '1'
});
const ALLOWED_PARAMS = new Set(['aa', 'shadows', 'tone', 'autoDPR', 'duration', 'warmup', 'environmentSuite', 'environmentDuration', 'environmentWarmup']);
const errors = [];
const interruptions = [];
const environmentResults = [];
const results = [];
const persistentResults = [];
const persistentTransitions = [];
const startedAt = new Date().toISOString();
const runStartedAtMs = performance.now();
let hiddenStartedAtMs = null;
let hiddenDurationMs = 0;
let completed = false;
let report = null;

function roundOne(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function truncate(value, limit = 1500) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function recordError(error, source = 'runtime') {
  const errorLike = error && typeof error === 'object' ? error : null;
  const value = error instanceof Error
    ? error
    : Object.assign(new Error(String(errorLike?.message ?? error ?? 'Unknown error')), {
        name: String(errorLike?.name || 'Error'),
        stack: String(errorLike?.stack || '')
      });
  errors.push({
    atMs: roundOne(performance.now() - runStartedAtMs),
    source,
    name: truncate(value.name || 'Error', 80),
    message: truncate(value.message || value, 500),
    stack: truncate(value.stack || '', 1500)
  });
}

window.addEventListener('error', event => {
  recordError(event.error || event.message, 'window.error');
});
window.addEventListener('unhandledrejection', event => {
  recordError(event.reason, 'unhandledrejection');
});

function applyDefaultFlags() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const [key, value] of Object.entries(DEFAULT_FLAGS)) {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }
  if (changed) history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  return new URL(window.location.href).searchParams;
}

const params = applyDefaultFlags();
const { scenarioDurationMs, warmupDurationMs } = createWeaponDiagnosticConfig(params);
const environmentSuiteEnabled = params.get('environmentSuite') !== '0';
const boundedSeconds = (key, fallback, min, max) => {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? THREE.MathUtils.clamp(value, min, max) * 1000 : fallback * 1000;
};
const environmentDurationMs = boundedSeconds('environmentDuration', 3, 1, 10);
const environmentWarmupMs = boundedSeconds('environmentWarmup', 1, .25, 3);

const ALL_DIAGNOSTIC_STEPS = [
  ...(environmentSuiteEnabled ? ENVIRONMENT_DIAGNOSTIC_SCENARIOS : []),
  ...WEAPON_DIAGNOSTIC_SCENARIOS,
  ...PERSISTENT_COMBAT_DIAGNOSTIC_PHASES
];

for (const definition of ALL_DIAGNOSTIC_STEPS) {
  const row = document.createElement('tr');
  row.id = `scenario-${definition.id}`;
  row.dataset.state = 'pending';
  row.innerHTML = `<td>${definition.label}</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
  row.insertAdjacentHTML('beforeend', '<td>—</td>');
  rowsEl.appendChild(row);
}

function updateRow(id, result, state = 'complete') {
  const row = document.getElementById(`scenario-${id}`);
  if (!row) return;
  row.dataset.state = state;
  if (!result) return;
  const cells = row.children;
  cells[1].textContent = result.averageFps.toFixed(1);
  cells[2].textContent = `${result.p95FrameMs.toFixed(1)} ms`;
  cells[3].textContent = `${result.framesOver33Percent.toFixed(1)}%`;
  cells[4].textContent = `${result.averageRenderMs.toFixed(1)} ms`;
  cells[5].textContent = result.averageDrawCalls.toFixed(1);
}

function setCurrentRow(id) {
  for (const definition of ALL_DIAGNOSTIC_STEPS) {
    const row = document.getElementById(`scenario-${definition.id}`);
    if (row?.dataset.state === 'running') row.dataset.state = 'pending';
  }
  const current = document.getElementById(`scenario-${id}`);
  if (current) {
    current.dataset.state = 'running';
    current.scrollIntoView({ block: 'nearest' });
  }
}

function seededRandom(seed = 0x51a7f00d) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sanitizedParams() {
  const safe = {};
  for (const [key, value] of params.entries()) {
    if (ALLOWED_PARAMS.has(key)) safe[key] = truncate(value, 80);
  }
  return safe;
}

function collectEnvironment(renderer) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const memory = performance.memory;
  return {
    appVersion: APP_VERSION,
    page: 'test-weapon-performance.html',
    parameters: sanitizedParams(),
    userAgent: truncate(navigator.userAgent, 500),
    platform: truncate(navigator.userAgentData?.platform || navigator.platform || 'unknown', 120),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: roundOne(window.devicePixelRatio || 1),
    rendererPixelRatio: roundOne(renderer.getPixelRatio()),
    hardwareConcurrency: Number(navigator.hardwareConcurrency) || null,
    deviceMemoryGb: Number(navigator.deviceMemory) || null,
    jsHeapSizeLimit: Number(memory?.jsHeapSizeLimit) || null,
    webgl: {
      version: truncate(gl.getParameter(gl.VERSION), 160),
      shadingLanguageVersion: truncate(gl.getParameter(gl.SHADING_LANGUAGE_VERSION), 160),
      vendor: truncate(debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), 200),
      renderer: truncate(debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), 300)
    },
    targetFrameMs: roundOne(TARGET_FRAME_MS),
    scenarioDurationMs,
    warmupDurationMs,
    environmentSuiteEnabled,
    environmentDurationMs,
    environmentWarmupMs,
    deterministicWorldSeed: '0x51a7f00d'
  };
}

function effectCounts(effects) {
  const active =
    (effects._alive?.length || 0) +
    (effects._tracerPool?.active?.length || 0) +
    (effects._flashPool?.active?.length || 0) +
    (effects._ringPool?.active?.length || 0);
  const pooled =
    (effects._tracerPool?.active?.length || 0) + (effects._tracerPool?.free?.length || 0) +
    (effects._flashPool?.active?.length || 0) + (effects._flashPool?.free?.length || 0) +
    (effects._ringPool?.active?.length || 0) + (effects._ringPool?.free?.length || 0) +
    (effects._impactPool?.free?.length || 0) + (effects._deathPool?.free?.length || 0);
  return { active, pooled, decals: effects._decals?.length || 0 };
}

function materialTypes(weaponView) {
  const types = [];
  for (const object of weaponView._current?.meshes || []) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.type) types.push(material.type);
    }
  }
  return [...new Set(types)].sort();
}

function copyReport() {
  const text = outputEl.value;
  if (!text) return;
  const fallback = () => {
    outputEl.classList.add('ready');
    outputEl.focus();
    outputEl.select();
    document.execCommand('copy');
  };
  const copyPromise = navigator.clipboard?.writeText
    ? navigator.clipboard.writeText(text)
    : Promise.reject(new Error('Clipboard API unavailable'));
  copyPromise
    .catch(fallback)
    .finally(() => {
      copyButton.textContent = 'Copied';
      setTimeout(() => { copyButton.textContent = 'Copy JSON report'; }, 1400);
    });
}

copyButton.addEventListener('click', copyReport);
downloadButton.addEventListener('click', () => {
  if (!outputEl.value) return;
  const blob = new Blob([outputEl.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `qoj-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
runAgainButton.addEventListener('click', () => window.location.reload());

function completeReport(environment, failed = false) {
  if (completed) return;
  completed = true;
  environment.completedMemory = {
    usedJSHeapSize: Number(performance.memory?.usedJSHeapSize) || null,
    totalJSHeapSize: Number(performance.memory?.totalJSHeapSize) || null
  };
  report = buildWeaponDiagnosticReport({
    environment,
    startedAt,
    completedAt: new Date().toISOString(),
    environmentScenarios: environmentResults,
    scenarios: results,
    persistentPhases: persistentResults,
    persistentTransitions,
    errors,
    interruptions
  });
  outputEl.value = JSON.stringify(report, null, 2);
  outputEl.classList.add('ready');
  copyButton.disabled = false;
  downloadButton.disabled = false;
  progressEl.style.width = '100%';
  statusEl.textContent = failed ? 'Diagnostic stopped — copy partial report' : 'Report ready — copy and send it';
  document.title = failed ? 'Diagnostic stopped' : 'Weapon diagnostic report ready';
  window.__weaponPerformanceDiagnosticReport = report;
  window.__weaponPerformanceDiagnosticDone = true;
  document.documentElement.dataset.weaponDiagnosticSummary = JSON.stringify({
    done: true,
    failed,
    errors: errors.length,
    phaseIds: persistentResults.map(result => result.id),
    wave72: report.persistentCombat.wave72Stress
  });
  console.info('Weapon performance diagnostic report', report);
}

function countSceneInventory(scene) {
  const materials = new Set();
  const geometries = new Set();
  const inventory = { nodes: 0, meshes: 0, visibleMeshes: 0, lights: 0, materials: 0, geometries: 0 };
  scene?.traverse?.(object => {
    inventory.nodes++;
    if (object.isLight) inventory.lights++;
    if (!object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh) return;
    inventory.meshes++;
    if (object.visible) inventory.visibleMeshes++;
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  inventory.materials = materials.size;
  inventory.geometries = geometries.size;
  return inventory;
}

function waitForAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function waitForDemoEnvironment(definition) {
  const loadStartedAt = performance.now();
  const url = new URL('demo-level.html', window.location.href);
  url.searchParams.set('level', definition.level);
  url.searchParams.set('diagnostic', '1');
  for (const key of ['aa', 'shadows', 'tone', 'autoDPR']) {
    if (params.has(key)) url.searchParams.set(key, params.get(key));
  }
  environmentFrame.hidden = false;
  environmentFrame.src = url.href;
  const timeoutAt = performance.now() + 45000;
  while (performance.now() < timeoutAt) {
    await new Promise(resolve => setTimeout(resolve, 50));
    let remoteFailure = null;
    try {
      const frameWindow = environmentFrame.contentWindow;
      remoteFailure = frameWindow?.demoLevelDiagnosticError || null;
      const demo = frameWindow?.demoLevelEnvironment;
      if (demo?.ready && demo.renderer && demo.scene && demo.camera) {
        environmentFrame.contentDocument?.getElementById('overlay')?.classList.add('hidden');
        return { demo, loadMs: performance.now() - loadStartedAt };
      }
    } catch (error) {
      recordError(error, `environment-access:${definition.level}`);
    }
    if (remoteFailure) {
      const error = new Error(remoteFailure.message || `Failed loading demo environment "${definition.level}"`);
      error.name = remoteFailure.name || 'Error';
      if (remoteFailure.stack) error.stack = remoteFailure.stack;
      throw error;
    }
  }
  throw new Error(`Timed out loading demo environment "${definition.level}"`);
}

async function measureDemoEnvironment(definition) {
  setCurrentRow(definition.id);
  statusEl.textContent = `Loading environment: ${definition.label}`;
  const { demo, loadMs } = await waitForDemoEnvironment(definition);
  const { renderer, scene, camera, updaters = [] } = demo;
  const metrics = new ScenarioMetrics(definition);
  const inventory = countSceneInventory(scene);
  let lastAt = null;
  let warmupElapsed = 0;
  let measuredElapsed = 0;
  let environmentTime = 0;
  let measuring = false;
  statusEl.textContent = `Environment warm-up: ${definition.label}`;

  while (measuredElapsed < environmentDurationMs) {
    const now = await waitForAnimationFrame();
    if (document.hidden) { lastAt = now; continue; }
    const frameMs = lastAt == null ? TARGET_FRAME_MS : Math.max(0, now - lastAt);
    lastAt = now;
    const dt = Math.min(.05, frameMs / 1000);
    environmentTime += dt;
    for (const update of updaters) update(dt, environmentTime);
    const renderStartedAt = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderStartedAt;
    if (warmupElapsed < environmentWarmupMs) {
      warmupElapsed += frameMs;
      continue;
    }
    if (!measuring) {
      measuring = true;
      statusEl.textContent = `Measuring environment: ${definition.label}`;
    }
    measuredElapsed += frameMs;
    metrics.addFrame({
      frameMs,
      renderMs,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs?.length || 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      sceneObjects: inventory.nodes
    });
  }

  const result = metrics.complete({ durationMs: measuredElapsed });
  result.loadMs = roundOne(loadMs);
  result.inventory = inventory;
  result.rendererEndState = {
    drawCalls: renderer.info.render.calls || 0,
    triangles: renderer.info.render.triangles || 0,
    programs: renderer.info.programs?.length || 0,
    geometries: renderer.info.memory.geometries || 0,
    textures: renderer.info.memory.textures || 0
  };
  result.renderSharePercent = result.averageFrameMs > 0
    ? roundOne((result.averageRenderMs / result.averageFrameMs) * 100)
    : 0;
  result.performanceBand = result.averageFps >= 55 && result.p95FrameMs <= 25
    ? 'healthy'
    : result.averageFps >= 30 ? 'investigate' : 'critical';
  console.info(`[environment diagnostic] ${definition.level}`, result);
  renderer.renderLists?.dispose?.();
  renderer.dispose?.();
  renderer.forceContextLoss?.();
  return result;
}

async function runEnvironmentSuite() {
  if (!environmentSuiteEnabled || !environmentFrame) return;
  for (const definition of ENVIRONMENT_DIAGNOSTIC_SCENARIOS) {
    try {
      const result = await measureDemoEnvironment(definition);
      environmentResults.push(result);
      updateRow(definition.id, result);
    } catch (error) {
      recordError(error, `environment:${definition.level}`);
      updateRow(definition.id, null, 'failed');
    }
    const completedSteps = environmentResults.length;
    progressEl.style.width = `${((completedSteps / ALL_DIAGNOSTIC_STEPS.length) * 100).toFixed(2)}%`;
  }
  environmentFrame.src = 'about:blank';
  environmentFrame.hidden = true;
}

try {
  await runEnvironmentSuite();
  const world = createWorld(THREE, seededRandom());
  const { renderer, scene, camera, skyMat, hemi, dir, mats, objects, arenaRadius } = world;
  scene.add(camera);

  const player = new PlayerController(THREE, camera, renderer.domElement, objects, arenaRadius);
  if (!player.controls.getObject().parent) scene.add(player.controls.getObject());
  const weaponView = new WeaponView(THREE, camera);
  const effects = new Effects(THREE, scene, camera);
  effects.setMuzzleAnchor(weaponView.sockets.muzzle);
  effects.prewarm({ tracers: 64, flashes: 32, rings: 8 });
  const raycaster = new THREE.Raycaster();
  const isolatedEnemyManager = {
    enemies: new Set(),
    alive: 0,
    getEnemyRaycastTargets: () => [],
    applyKnockback: () => {},
    remove: () => {}
  };
  const environment = collectEnvironment(renderer);
  environment.movementDriver = 'PlayerController.update with synthetic held KeyW';
  const factories = {
    Pistol: () => new Pistol(),
    SMG: () => new SMG(),
    Rifle: () => new Rifle()
  };

  const context = {
    THREE,
    camera,
    raycaster,
    enemyManager: isolatedEnemyManager,
    objects,
    effects,
    weaponView,
    obstacleManager: { handleHit: () => {} },
    pickups: null,
    S: null,
    updateHUD: () => {},
    addScore: () => {},
    addComboAction: () => {},
    combo: { multiplier: 1 },
    applyKnockback: () => {},
    applyRecoil: recoil => player.applyRecoil(recoil),
    achievements: null,
    getGameTime: () => persistentElapsedSeconds,
    addTracer: (_from, to) => {
      const muzzle = effects.getMuzzleWorldPos(new THREE.Vector3());
      effects.spawnBulletTracer(muzzle, to, { ttl: 0.12, width: 0.04, impact: true });
    }
  };

  let scenarioIndex = -1;
  let persistentPhaseIndex = -1;
  let runMode = 'isolated';
  let definition = null;
  let metrics = null;
  let activeWeapon = null;
  let persistentEnemyManager = null;
  let persistentPickups = null;
  let persistentWeather = null;
  let persistentElapsedSeconds = 0;
  let persistentStartState = null;
  let wave72Stress = null;
  let wave72CenterLight = null;
  const persistentLightDefaults = { hemi: hemi.intensity, dir: dir.intensity };
  let currentMaterials = [];
  let phase = 'warmup';
  let phaseElapsedMs = 0;
  let lastScheduledAt = performance.now();
  let lastRenderedAt = null;
  let movementDistanceMeters = 0;
  const movementStart = new THREE.Vector3();
  const movementPrevious = new THREE.Vector3();
  let sampledSceneObjects = 0;
  let sceneObjectSampleCountdown = 0;
  let lastUiUpdateAt = -Infinity;

  function resetPlayerForStep() {
    player.keys.clear();
    player.resetPosition(0, 1.7, 8);
    player.stamina = player.staminaMax;
    player._staminaRegenCooldown = 0;
    player.recoilPitchOffset = 0;
    player.appliedRecoilPitch = 0;
    player.recoilPitchVel = 0;
    player.yawObject.rotation.y = 0;
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.fov = player.baseFov;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    if (definition.moving) player.keys.add('KeyW');
    movementDistanceMeters = 0;
    movementStart.copy(player.controls.getObject().position);
    movementPrevious.copy(movementStart);
  }

  function countSceneObjects() {
    let count = 0;
    scene.traverse(() => { count++; });
    return count;
  }

  function countEnemyProjectiles(enemyManager) {
    if (!enemyManager) return 0;
    let count = 0;
    for (const pool of Object.values(enemyManager._bulletPools || {})) count += pool?.count || 0;
    for (const instance of enemyManager.instances || []) {
      count += instance?.projectiles?.length || 0;
      count += instance?._projectiles?.length || 0;
    }
    return count;
  }

  function capturePersistentState() {
    const counts = effectCounts(effects);
    return {
      sceneObjects: countSceneObjects(),
      enemies: persistentEnemyManager?.enemies?.size || 0,
      enemyInstances: persistentEnemyManager?.instances?.size || 0,
      enemyProjectiles: countEnemyProjectiles(persistentEnemyManager),
      effects: counts.active,
      effectPoolObjects: counts.pooled,
      decals: counts.decals,
      pickups: persistentPickups?.active?.size || 0,
      bossActive: !!persistentEnemyManager?.bossManager?.active,
      bossType: persistentEnemyManager?.bossManager?.boss?.root?.userData?.type || null,
      weather: persistentWeather?.mode || null,
      drawCalls: renderer.info.render.calls || 0,
      triangles: renderer.info.render.triangles || 0,
      programs: renderer.info.programs?.length || 0,
      geometries: renderer.info.memory.geometries || 0,
      textures: renderer.info.memory.textures || 0,
      usedJSHeapSize: Number(performance.memory?.usedJSHeapSize) || null
    };
  }

  function createPersistentSystems() {
    const getPlayer = () => {
      const position = player.controls.getObject().position.clone();
      const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      return { position, forward };
    };
    persistentEnemyManager = new EnemyManager(
      THREE,
      scene,
      mats,
      objects,
      getPlayer,
      arenaRadius,
      null,
      seededRandom(0xb055f00d)
    );
    persistentEnemyManager.suspendWaves = true;
    persistentPickups = new Pickups(THREE, scene, seededRandom(0x71c0ffee));
    persistentEnemyManager.pickups = persistentPickups;
    persistentWeather = new WeatherSystem({ THREE, scene, skyMat, hemi, dir, mats });
    persistentWeather.setMode('clear');
    context.enemyManager = persistentEnemyManager;
    context.pickups = persistentPickups;
    context.applyKnockback = (enemy, vector) => persistentEnemyManager.applyKnockback(enemy, vector);
    environment.persistentCombat = {
      scenePreservedAcrossPhases: true,
      fixedWeapon: 'SMG',
      movement: 'synthetic held KeyW',
      firing: true,
      enemyMixCount: 12,
      bossWave: 5,
      bossMinionCount: 6,
      wave72StressProfile: WAVE72_STRESS_PROFILE,
      sceneObjectSampleIntervalFrames: 30,
      sequenceStartedAfterIsolatedControls: true
    };
  }

  function setWave72Lighting(active) {
    if (active) {
      hemi.intensity = 0.015;
      dir.intensity = 0.025;
      if (!wave72CenterLight) {
        wave72CenterLight = new THREE.PointLight(0xfff1b8, 5.5, 18, 2);
        wave72CenterLight.position.set(0, 5, 0);
        wave72CenterLight.castShadow = false;
        scene.add(wave72CenterLight);
      }
      return;
    }
    hemi.intensity = persistentLightDefaults.hemi;
    dir.intensity = persistentLightDefaults.dir;
    if (wave72CenterLight) scene.remove(wave72CenterLight);
    wave72CenterLight = null;
  }

  function makeWave72EnemyDurable(root) {
    if (!root?.userData) return;
    root.userData.hp = 1000000000;
    root.userData.maxHp = 1000000000;
  }

  function wave72SpawnPosition(serial, batchIndex) {
    const angle = serial * 2.399963229728653 + batchIndex * 0.47;
    const radius = 11 + ((serial * 7 + batchIndex * 3) % 19);
    return new THREE.Vector3(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius);
  }

  function spawnWave72Roster(roster, batchIndex) {
    let spawned = 0;
    for (const [type, count] of Object.entries(roster)) {
      for (let index = 0; index < count; index++) {
        const serial = wave72Stress.spawnSerial++;
        const root = persistentEnemyManager.spawnAt(
          type,
          wave72SpawnPosition(serial, batchIndex),
          { countsTowardAlive: true }
        );
        makeWave72EnemyDurable(root);
        if (type === 'warden') {
          const warden = persistentEnemyManager.instanceByRoot.get(root);
          if (warden) {
            warden.desiredMin = 12;
            warden.desiredMax = 12;
            warden.targetCount = 12;
          }
        }
        if (root) spawned++;
      }
    }
    return spawned;
  }

  function preparePersistentWave72() {
    removeAllPersistentEnemies();
    persistentEnemyManager.clearProjectiles();
    effects.clearAll();
    persistentPickups.resetAll();
    persistentEnemyManager.wave = WAVE72_STRESS_PROFILE.wave;
    wave72Stress = {
      active: true,
      spawnSerial: 0,
      nextSurge: 0,
      initialSpawned: 0,
      timeline: []
    };
    setWave72Lighting(true);
    wave72Stress.initialSpawned += spawnWave72Roster(WAVE72_STRESS_PROFILE.roster, 0);
    wave72Stress.initialSpawned += spawnWave72Roster(WAVE72_STRESS_PROFILE.supports, 0);
    persistentEnemyManager.waveStartingAlive = persistentEnemyManager.alive;
  }

  function simulateWave72PartialClear() {
    const candidates = Array.from(persistentEnemyManager.enemies).filter(root => {
      const type = root?.userData?.type;
      return type !== 'swarm_warden' && type !== 'healer';
    });
    const removeCount = Math.floor(candidates.length * WAVE72_STRESS_PROFILE.clearFractionPerSurge);
    if (removeCount <= 0) return 0;
    const selected = new Set();
    for (let index = 0; index < removeCount; index++) {
      selected.add(candidates[Math.floor((index * candidates.length) / removeCount)]);
    }
    for (const root of selected) persistentEnemyManager.remove(root);
    return selected.size;
  }

  function updateWave72Stress() {
    if (!wave72Stress?.active || phase !== 'measure') return;
    const fraction = Math.max(0, Math.min(1, phaseElapsedMs / scenarioDurationMs));
    const thresholds = WAVE72_STRESS_PROFILE.surgeFractions;
    while (wave72Stress.nextSurge < thresholds.length && fraction >= thresholds[wave72Stress.nextSurge]) {
      const surgeIndex = wave72Stress.nextSurge++;
      const before = persistentEnemyManager.enemies.size;
      const startedAt = performance.now();
      const removed = simulateWave72PartialClear();
      const spawned = spawnWave72Roster(WAVE72_STRESS_PROFILE.roster, surgeIndex + 1);
      const after = persistentEnemyManager.enemies.size;
      wave72Stress.timeline.push({
        surge: surgeIndex + 1,
        atFraction: thresholds[surgeIndex],
        before,
        removed,
        spawned,
        after,
        transitionMs: roundOne(performance.now() - startedAt)
      });
      persistentEnemyManager.waveStartingAlive = Math.max(persistentEnemyManager.waveStartingAlive, after);
    }
  }

  function removeAllPersistentEnemies() {
    if (!persistentEnemyManager) return;
    for (const root of Array.from(persistentEnemyManager.enemies)) persistentEnemyManager.remove(root);
  }

  function spawnPersistentEnemyMix() {
    const types = [
      'grunt', 'grunt', 'grunt', 'grunt',
      'shooter', 'shooter', 'shooter',
      'flyer', 'flyer', 'tank', 'healer', 'sniper'
    ];
    for (let index = 0; index < types.length; index++) {
      const angle = (index / types.length) * Math.PI * 2;
      const radius = 12 + (index % 3) * 2;
      const position = new THREE.Vector3(Math.sin(angle) * radius, 0.8, Math.cos(angle) * radius);
      const root = persistentEnemyManager.spawnAt(types[index], position, { countsTowardAlive: true });
      if (root?.userData) {
        root.userData.hp = 1000000000;
        root.userData.maxHp = 1000000000;
      }
    }
    persistentEnemyManager.wave = 4;
    persistentEnemyManager.waveStartingAlive = persistentEnemyManager.alive;
  }

  function spawnPersistentBossAndMinions() {
    removeAllPersistentEnemies();
    persistentEnemyManager.wave = 5;
    const started = persistentEnemyManager.bossManager.startBoss(5);
    if (!started) throw new Error('Persistent diagnostic could not start wave 5 boss');
    const bossRoot = persistentEnemyManager.bossManager.boss?.root;
    if (bossRoot?.userData) {
      bossRoot.userData.hp = 1000000000;
      bossRoot.userData.maxHp = 1000000000;
    }
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      const position = new THREE.Vector3(Math.sin(angle) * 9, 0.8, Math.cos(angle) * 9);
      const root = persistentEnemyManager.spawnAt('gruntling', position, { countsTowardAlive: true });
      if (root?.userData) {
        root.userData.hp = 1000000000;
        root.userData.maxHp = 1000000000;
      }
      if (root) persistentEnemyManager.bossManager.addRoots.add(root);
    }
    for (let index = 0; index < 3; index++) {
      persistentPickups.spawn(index === 2 ? 'med' : 'ammo', new THREE.Vector3(16 + index * 2, 0.6, 14));
    }
    persistentEnemyManager.waveStartingAlive = persistentEnemyManager.alive;
  }

  function removePersistentBossPreservingResources() {
    const bossRoot = persistentEnemyManager?.bossManager?.boss?.root;
    if (bossRoot && persistentEnemyManager.enemies.has(bossRoot)) persistentEnemyManager.remove(bossRoot);
    else persistentEnemyManager?.bossManager?._onBossDeath?.();
    persistentPickups.spawn('ammo', new THREE.Vector3(18, 0.6, 18));
    persistentPickups.spawn('med', new THREE.Vector3(20, 0.6, 18));
  }

  function explicitlyCleanupPersistentState() {
    if (wave72Stress) wave72Stress.active = false;
    setWave72Lighting(false);
    const enemyManager = persistentEnemyManager;
    enemyManager.suspendWaves = true;
    enemyManager.reset();
    enemyManager.clearProjectiles();
    effects.clearAll();
    persistentPickups.resetAll();
    renderer.renderLists?.dispose?.();
  }

  function transitionPersistentPhase(nextDefinition) {
    const before = persistentEnemyManager ? capturePersistentState() : null;
    if (!persistentEnemyManager) createPersistentSystems();
    if (nextDefinition.id === 'persistent_enemy_mix') spawnPersistentEnemyMix();
    else if (nextDefinition.id === 'persistent_boss_active') spawnPersistentBossAndMinions();
    else if (nextDefinition.id === 'persistent_post_boss_retained') removePersistentBossPreservingResources();
    else if (nextDefinition.id === 'persistent_wave72_swarm') preparePersistentWave72();
    else if (nextDefinition.id === 'persistent_post_cleanup_control') explicitlyCleanupPersistentState();
    const after = capturePersistentState();
    persistentTransitions.push({
      phase: nextDefinition.id,
      transition: nextDefinition.transition,
      atMs: roundOne(performance.now() - runStartedAtMs),
      before,
      after
    });
  }

  function setupScenario(index) {
    runMode = 'isolated';
    scenarioIndex = index;
    definition = WEAPON_DIAGNOSTIC_SCENARIOS[index];
    metrics = new ScenarioMetrics(definition);
    phase = 'warmup';
    phaseElapsedMs = 0;
    effects.clearAll();

    resetPlayerForStep();

    activeWeapon?.triggerUp?.();
    activeWeapon = factories[definition.weapon]?.() || new Rifle();
    activeWeapon.ammoInMag = 1000000;
    activeWeapon.reserveAmmo = 1000000;
    activeWeapon._nextFireAtMs = 0;

    weaponView.setDebugBasicMaterial(false);
    weaponView.setDebugMotionFrozen(false);
    weaponView.root.visible = true;
    weaponView.setWeapon(definition.weapon.toLowerCase());
    weaponView.setDebugMotionFrozen(definition.motionFrozen);
    weaponView.setDebugBasicMaterial(definition.materialMode === 'basic_override');
    weaponView.root.visible = !definition.weaponHidden;
    weaponView.setMove(0, definition.moving ? 1 : 0);
    weaponView.setLook(0, 0);
    currentMaterials = materialTypes(weaponView);
    camera.updateMatrixWorld(true);

    try { renderer.compile(scene, camera); } catch (error) { recordError(error, `compile:${definition.id}`); }
    setCurrentRow(definition.id);
    statusEl.textContent = `Warm-up: ${definition.label}`;
  }

  function setupPersistentPhase(index) {
    runMode = 'persistent';
    persistentPhaseIndex = index;
    definition = PERSISTENT_COMBAT_DIAGNOSTIC_PHASES[index];
    transitionPersistentPhase(definition);
    metrics = new PersistentCombatMetrics(definition);
    phase = 'warmup';
    phaseElapsedMs = 0;
    resetPlayerForStep();
    if (index === 0) {
      activeWeapon?.triggerUp?.();
      activeWeapon = new SMG();
      weaponView.setDebugBasicMaterial(false);
      weaponView.setDebugMotionFrozen(false);
      weaponView.root.visible = true;
      weaponView.setWeapon('smg');
      currentMaterials = materialTypes(weaponView);
    }
    activeWeapon.ammoInMag = 1000000;
    activeWeapon.reserveAmmo = 1000000;
    activeWeapon._nextFireAtMs = 0;
    sceneObjectSampleCountdown = 0;
    camera.updateMatrixWorld(true);
    try { renderer.compile(scene, camera); } catch (error) { recordError(error, `compile:${definition.id}`); }
    setCurrentRow(definition.id);
    statusEl.textContent = `Persistent warm-up: ${definition.label}`;
  }

  function finishScenario() {
    activeWeapon?.triggerUp?.();
    const playerPosition = player.controls.getObject().position;
    const movement = {
      driver: 'PlayerController.update',
      heldInput: definition.moving ? 'KeyW' : null,
      distanceMeters: roundOne(movementDistanceMeters),
      averageSpeedMetersPerSecond: phaseElapsedMs > 0
        ? roundOne(movementDistanceMeters / (phaseElapsedMs / 1000))
        : 0,
      from: { x: roundOne(movementStart.x), y: roundOne(movementStart.y), z: roundOne(movementStart.z) },
      to: { x: roundOne(playerPosition.x), y: roundOne(playerPosition.y), z: roundOne(playerPosition.z) }
    };
    const result = metrics.complete({
      durationMs: phaseElapsedMs,
      materialTypes: currentMaterials,
      movement
    });
    results.push(result);
    updateRow(definition.id, result);

    if (scenarioIndex + 1 >= WEAPON_DIAGNOSTIC_SCENARIOS.length) {
      weaponView.setDebugBasicMaterial(false);
      weaponView.setDebugMotionFrozen(false);
      weaponView.root.visible = true;
      effects.clearAll();
      setupPersistentPhase(0);
      return;
    }
    setupScenario(scenarioIndex + 1);
  }

  function finishPersistentPhase() {
    activeWeapon?.triggerUp?.();
    const playerPosition = player.controls.getObject().position;
    const movement = {
      driver: 'PlayerController.update',
      heldInput: 'KeyW',
      distanceMeters: roundOne(movementDistanceMeters),
      averageSpeedMetersPerSecond: phaseElapsedMs > 0
        ? roundOne(movementDistanceMeters / (phaseElapsedMs / 1000))
        : 0,
      from: { x: roundOne(movementStart.x), y: roundOne(movementStart.y), z: roundOne(movementStart.z) },
      to: { x: roundOne(playerPosition.x), y: roundOne(playerPosition.y), z: roundOne(playerPosition.z) }
    };
    const result = metrics.complete({
      durationMs: phaseElapsedMs,
      materialTypes: currentMaterials,
      movement,
      startState: persistentStartState || {},
      endState: capturePersistentState()
    });
    if (definition.id === 'persistent_wave72_swarm') {
      result.wave72Stress = {
        profile: WAVE72_STRESS_PROFILE,
        initialSpawned: wave72Stress?.initialSpawned || 0,
        surgesTriggered: wave72Stress?.timeline?.length || 0,
        timeline: wave72Stress?.timeline ? [...wave72Stress.timeline] : [],
        maxEnemies: result.maxEnemies
      };
    }
    persistentResults.push(result);
    updateRow(definition.id, result);

    if (persistentPhaseIndex + 1 >= PERSISTENT_COMBAT_DIAGNOSTIC_PHASES.length) {
      completeReport(environment);
      return;
    }
    setupPersistentPhase(persistentPhaseIndex + 1);
  }

  function updateProgress(force = false) {
    const now = performance.now();
    if (!force && now - lastUiUpdateAt < 250) return;
    lastUiUpdateAt = now;
    const currentFraction = phase === 'warmup'
      ? 0
      : Math.max(0, Math.min(1, phaseElapsedMs / scenarioDurationMs));
    const completedSteps = environmentResults.length + results.length + persistentResults.length;
    const fraction = (completedSteps + currentFraction) / ALL_DIAGNOSTIC_STEPS.length;
    progressEl.style.width = `${(fraction * 100).toFixed(2)}%`;
    const hiddenNow = hiddenStartedAtMs == null ? 0 : now - hiddenStartedAtMs;
    const activeElapsed = now - runStartedAtMs - hiddenDurationMs - hiddenNow;
    elapsedEl.textContent = `${Math.max(0, activeElapsed / 1000).toFixed(1)}s`;
  }

  function renderFrame(frameMs) {
    const simulationDt = Math.min(0.05, Math.max(0, frameMs / 1000));
    if (runMode === 'persistent') persistentElapsedSeconds += simulationDt;
    const playerStartedAt = performance.now();
    player.update(simulationDt);
    const playerSimulationMs = performance.now() - playerStartedAt;
    const playerPosition = player.controls.getObject().position;
    if (phase === 'measure') {
      movementDistanceMeters += Math.hypot(
        playerPosition.x - movementPrevious.x,
        playerPosition.z - movementPrevious.z
      );
    }
    movementPrevious.copy(playerPosition);

    const weaponEffectsStartedAt = performance.now();
    weaponView.setMove(0, definition.moving ? 1 : 0);
    weaponView.setLook(0, 0);
    weaponView.update(simulationDt);

    let fired = false;
    if (definition.firing) fired = activeWeapon.tryFire(context);
    activeWeapon.update(simulationDt, context);
    const weaponEffectsMs = performance.now() - weaponEffectsStartedAt;

    const enemyAiStartedAt = performance.now();
    if (runMode === 'persistent') {
      const enemyManager = persistentEnemyManager;
      updateWave72Stress();
      enemyManager.tickAI(player.controls.getObject(), simulationDt, () => {});
    }
    const enemyAiMs = performance.now() - enemyAiStartedAt;

    const worldSystemsStartedAt = performance.now();
    effects.update(simulationDt);
    if (runMode === 'persistent') {
      persistentPickups.update(simulationDt, playerPosition, () => {});
      persistentWeather.update(persistentElapsedSeconds, camera);
    }
    skyMat.uniforms.time.value += simulationDt;
    const worldSystemsMs = performance.now() - worldSystemsStartedAt;

    const renderStartedAt = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderStartedAt;

    if (phase === 'measure') {
      const counts = effectCounts(effects);
      if (runMode === 'persistent' && sceneObjectSampleCountdown-- <= 0) {
        sampledSceneObjects = countSceneObjects();
        sceneObjectSampleCountdown = 29;
      }
      metrics.addFrame({
        frameMs,
        playerSimulationMs,
        weaponEffectsMs,
        enemyAiMs,
        worldSystemsMs,
        renderMs,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs?.length || 0,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        effects: counts.active,
        effectPoolObjects: counts.pooled,
        decals: counts.decals,
        enemies: persistentEnemyManager?.enemies?.size || 0,
        enemyProjectiles: countEnemyProjectiles(persistentEnemyManager),
        pickups: persistentPickups?.active?.size || 0,
        sceneObjects: runMode === 'persistent' ? sampledSceneObjects : 0
      });
      if (fired) metrics.addShot();
    }
  }

  function tick(now) {
    if (completed) return;
    requestAnimationFrame(tick);
    if (document.hidden) return;

    const schedule = scheduleCappedFrame(now, lastScheduledAt, TARGET_FRAME_MS);
    lastScheduledAt = schedule.lastScheduledAt;
    if (!schedule.shouldRender) return;

    const frameMs = lastRenderedAt == null ? TARGET_FRAME_MS : Math.max(0, now - lastRenderedAt);
    lastRenderedAt = now;
    renderFrame(frameMs);
    phaseElapsedMs += frameMs;

    if (phase === 'warmup' && phaseElapsedMs >= warmupDurationMs) {
      if (runMode === 'isolated') effects.clearAll();
      activeWeapon.ammoInMag = 1000000;
      activeWeapon._nextFireAtMs = 0;
      metrics = runMode === 'persistent'
        ? new PersistentCombatMetrics(definition)
        : new ScenarioMetrics(definition);
      movementDistanceMeters = 0;
      movementStart.copy(player.controls.getObject().position);
      movementPrevious.copy(movementStart);
      if (runMode === 'persistent') {
        sampledSceneObjects = countSceneObjects();
        sceneObjectSampleCountdown = 29;
        persistentStartState = capturePersistentState();
      }
      phase = 'measure';
      phaseElapsedMs = 0;
      statusEl.textContent = `${runMode === 'persistent' ? 'Persistent measuring' : 'Measuring'}: ${definition.label}`;
    } else if (phase === 'measure' && phaseElapsedMs >= scenarioDurationMs) {
      if (runMode === 'persistent') finishPersistentPhase();
      else finishScenario();
    }
    updateProgress();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenStartedAtMs = performance.now();
      interruptions.push({
        type: 'tab_hidden',
        atMs: roundOne(hiddenStartedAtMs - runStartedAtMs),
        scenario: definition?.id || null,
        phase
      });
      statusEl.textContent = 'Paused — return to this tab';
    } else if (hiddenStartedAtMs != null) {
      const now = performance.now();
      hiddenDurationMs += now - hiddenStartedAtMs;
      interruptions.push({
        type: 'tab_visible',
        atMs: roundOne(now - runStartedAtMs),
        scenario: definition?.id || null,
        phase
      });
      hiddenStartedAtMs = null;
      lastRenderedAt = null;
      lastScheduledAt = now;
      statusEl.textContent = `${phase === 'warmup' ? 'Warm-up' : 'Measuring'}: ${definition.label}`;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    interruptions.push({
      type: 'resize',
      atMs: roundOne(performance.now() - runStartedAtMs),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scenario: definition?.id || null,
      phase
    });
  });

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    recordError(new Error('WebGL context lost during diagnostic'), 'webglcontextlost');
    updateRow(definition?.id, null, 'failed');
    completeReport(environment, true);
  });

  setupScenario(0);
  requestAnimationFrame(tick);
} catch (error) {
  recordError(error, 'initialization');
  const failedId = ALL_DIAGNOSTIC_STEPS[environmentResults.length + results.length + persistentResults.length]?.id;
  if (failedId) updateRow(failedId, null, 'failed');
  completeReport({
    appVersion: APP_VERSION,
    page: 'test-weapon-performance.html',
    parameters: sanitizedParams(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: roundOne(window.devicePixelRatio || 1),
    initializationFailed: true
  }, true);
}
