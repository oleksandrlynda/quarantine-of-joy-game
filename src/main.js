import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';
import { WeatherSystem } from './weather.js';
import { createWorld, setArenaRadius, DEFAULT_ARENA_RADIUS } from './world.js?v=2';
import { makeSeededRng, makeNamespacedRng, generateSeedString } from './util/rng.js';
import { EnemyManager } from './enemies.js?v=1.0.6';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { ObstacleManager } from './obstacles/manager.js';
import { Music } from './music.js';
import { SFX } from './sfx.js';
import { SONGS } from './musicLibrary.js';
import { WeaponSystem } from './weapons/system.js';
import { WeaponView } from './weapons/view.js';
import { AbilitySystem } from './abilities/system.js';
import { ABILITY_DEFINITIONS } from './abilities/definitions.js';
import { startEditor } from './editor.js';
import { Progression } from './progression.js';
import { clonePrefab, loadAllModels, loadGeneratedModels, prewarmAllShaders } from '../loader.js?v=6';
import { StoryManager } from './story.js';
import { t } from './i18n/index.js?v=1.0.6';
import { logError, setDiagnosticErrorSink } from './util/log.js';
import { cullGrassUnderObjects } from './graphics/grass.js';
import { AchievementsManager } from './achievements.js?v=1.0.6';
import { TutorialManager } from './tutorial-manager.js';
import { GameSession } from './game/session.js';
import { createWaveStartHandler } from './game/wave-flow.js';
import { getPlayerHudStats } from './game/hud-stats.js';
import { createDprBudget, nextAdaptiveDpr, scheduleCappedFrame, shouldPrewarmShaders, TARGET_FRAME_MS } from './game/render-budget.js';
import { createWave72Visuals } from './game/wave72-visuals.js';
import { AlgorithmRoulette, EliminationSpectacle, StagecraftDeaths } from './game/fun-events.js';
import { selectFinalCutVariant } from './game/final-cut-animations.js';
import { applyGrassWeatherUniforms, createGrassWeatherMotion, updateGrassWeatherMotion } from './game/grass-weather-motion.js';
import { getNumber, getString, setMaxNumber, setNumber, setString } from './util/storage.js';
import { APP_VERSION_LABEL } from './version.js?v=1.0.6';
import { collectDebugEnvironment, formatDiagnosticEvent, PerformanceEventLog } from './debug/performance-event-log.js';
import { GameplayEventAggregator } from './debug/gameplay-event-aggregator.js';
import { MotionEventAggregator } from './debug/motion-event-aggregator.js';
import { MovementRenderProbe } from './debug/movement-render-probe.js';
import { getBossShaderWarmupExtras } from './bosses/visual-cache.js';
import { ArchiveMutations, CLASSIFIED_WEAPON_DEFINITIONS, describeSpectacleGrade, describeWeaponMastery, MUTATION_DEFINITIONS, SURVIVAL_UNLOCK_WAVE, WEAPON_MASTERY_DEFINITIONS } from './mutations.js';
import { RELAY_DISTRICT, RELAY_DISTRICT_ASSET_IDS } from './levels/relay-district.js';
import { LevelRuntime } from './levels/runtime.js';
import { createMenuBackground, MENU_BACKGROUND_ASSET_IDS } from './menu-background.js';

const moduleStartedAt = performance.now();

// Prefer the flag set in index.html; fallback to media query
const isMobile = (typeof window !== 'undefined' && 'IS_MOBILE' in window && window.IS_MOBILE)
  ? !!window.IS_MOBILE
  : window.matchMedia?.('(pointer:coarse)').matches === true;

document.querySelectorAll('.appVersionValue').forEach(el => {
  el.textContent = APP_VERSION_LABEL;
});

// --- Music selection ---
const MUSIC_KEY = 'bs3d_music';
const musicSelect = document.getElementById('musicSelect');
let musicChoice = getString(MUSIC_KEY, 'library');
let sunoAudio = null; // HTMLAudioElement for Suno playback
let sunoTrackIndex = 0; // rotate through SUNO_TRACKS
if (musicSelect) {
  musicSelect.value = musicChoice;
  musicSelect.addEventListener('change', e => {
    musicChoice = e.target.value;
    setString(MUSIC_KEY, musicChoice);
    if (musicChoice === 'suno') {
      playSuno();
    } else {
      stopSuno();
      music.start();
    }
  });
}

// ------ Seeded RNG + URL persistence ------
const url = new URL(window.location.href);
const params = url.searchParams;
const debugPerf = params.get('debug') === '1';
const requestedDebugWave = debugPerf ? Math.floor(Number(params.get('wave'))) : 1;
const debugStartWave = Number.isFinite(requestedDebugWave)
  ? Math.max(1, Math.min(72, requestedDebugWave))
  : 1;
const hasDebugWaveOverride = debugPerf && params.has('wave') && debugStartWave > 1;
const movementProbeMode = params.get('moveProbe');
const movementProbeEnabled = debugPerf && (movementProbeMode === '1' || movementProbeMode === 'weapon');
const relayOverviewMode = params.get('relayView') === 'top';
if (relayOverviewMode) document.body.classList.add('relay-overview');
const QUALITY_KEY = 'bs3d_quality';
let startQuality = null;
const savedQuality = getString(QUALITY_KEY, null);
if (savedQuality && !['aa','shadows','tone','autoDPR'].some(k => params.has(k))) startQuality = savedQuality;
const shapeSelect = document.getElementById('arenaShape');
// TODO: Implement later different arena shapes
// let arenaShape = params.get('shape') || (shapeSelect ? shapeSelect.value : 'box');
const arenaShape = 'box';
if (shapeSelect) {
  shapeSelect.value = arenaShape;
  shapeSelect.addEventListener('change', e => {
    const u = new URL(window.location.href);
    u.searchParams.set('shape', e.target.value);
    window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
  });
}
let seed = params.get('seed');
if (!seed) {
  seed = generateSeedString(6);
  params.set('seed', seed);
  history.replaceState(null, '', `${url.pathname}?${params.toString()}`);
}
const rng = makeSeededRng(seed);

const perfLog = new PerformanceEventLog({ enabled: debugPerf });
const gameplayLog = debugPerf ? new GameplayEventAggregator({
  enabled: true,
  onBatch: batch => perfLog.event('gameplay', 'activity_batch', batch)
}) : null;
const motionLog = debugPerf ? new MotionEventAggregator({
  enabled: true,
  onBatch: batch => perfLog.event(
    'gameplay',
    batch.metric === 'distanceMeters' ? 'movement_batch' : 'camera_batch',
    batch
  )
}) : null;
if (debugPerf) {
  document.body.classList.add('debug-mode');
  setDiagnosticErrorSink((error, context) => {
    perfLog.event('error', 'caught', { error, context }, 'error');
  });
  window.addEventListener('error', event => {
    perfLog.event('error', 'uncaught', {
      error: event.error || event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno
    }, 'error');
  });
  window.addEventListener('unhandledrejection', event => {
    perfLog.event('error', 'unhandled_rejection', { reason: event.reason }, 'error');
  });
  perfLog.event('system', 'boot', {
    moduleInitMs: Math.round((performance.now() - moduleStartedAt) * 10) / 10,
    seed
  });
}

// Seed HUD
const seedEl = document.getElementById('seed');
const copySeedBtn = document.getElementById('copySeed');
const newSeedBtn = document.getElementById('newSeed');
if (seedEl) seedEl.textContent = seed;
if (copySeedBtn) {
  copySeedBtn.onclick = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copySeedBtn.textContent = t('hud.copied');
      setTimeout(() => (copySeedBtn.textContent = t('hud.copy')), 900);
    } catch (e) {
      prompt(t('hud.copyPrompt'), shareUrl);
    }
  };
}
if (newSeedBtn) {
  newSeedBtn.onclick = () => {
    const fresh = generateSeedString(6);
    const u = new URL(window.location.href);
    u.searchParams.set('seed', fresh);
    window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
  };
}

const startTipEl = document.getElementById('startTip');
if (isMobile && startTipEl) startTipEl.textContent = t('start.tipMobile');
const mobileControlsEl = document.getElementById('mobileControls');
if (mobileControlsEl) mobileControlsEl.style.display = isMobile ? '' : 'none';

// ------ World (renderer, scene, camera, lights, sky, materials, arena) ------
const { renderer, scene, camera, skyMat, hemi, dir, mats, objects, arenaRadius, grassMesh } = createWorld(THREE, rng, arenaShape);
let menuBackground = window.__menuBackground || null;
let debugEnvironment = debugPerf
  ? collectDebugEnvironment({ renderer, params, version: APP_VERSION_LABEL, seed, quality: savedQuality })
  : null;
if (debugPerf) perfLog.event('system', 'environment', debugEnvironment);
const wantEditor = (new URL(window.location.href)).searchParams.get('editor') === '1';
const storyParam = (new URL(window.location.href)).searchParams.get('story');
const storyDisabled = storyParam === '0' || storyParam === 'false';
const levelParam = params.get('level');
const relayDefaultEligible = !levelParam && !wantEditor && debugStartWave <= 5;

// Show loading overlay during asset + shader prewarm
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loadingBar');
const loadingText = document.getElementById('loadingText');
function setLoading(pct, label){
  if (!loadingEl) return;
  const raw = Math.max(0, Math.min(1, pct||0));
  const v = window.__menuBootstrapReady ? .18 + .82 * raw : raw;
  if (loadingBar) loadingBar.style.width = `${(v*100).toFixed(0)}%`;
  if (loadingText) loadingText.textContent = `${(v*100).toFixed(0)}%`;
  const loadingLabel = document.getElementById('loadingLabel');
  if (loadingLabel && label) loadingLabel.textContent = label;
  loadingEl.setAttribute('aria-valuenow', `${(v*100).toFixed(0)}`);
}

// Kick asset load + shader warmup before proceeding
const modelLoadStartedAt = debugPerf ? performance.now() : 0;
try {
  setLoading(0.02, t('loading.models'));
  const progress = (done, total) => {
    setLoading(0.02 + 0.48 * (done / Math.max(1, total)), `${t('loading.models')} ${done}/${total}`);
  };
  const shaderWarm = shouldPrewarmShaders(params.get('warmup'));
  const { registry } = await loadAllModels({ renderer, onProgress: progress, skipWarmup: true });
  const startupMenuAssetIds = (!menuBackground && !wantEditor && !relayOverviewMode) ? MENU_BACKGROUND_ASSET_IDS : [];
  const generatedStartupIds = relayDefaultEligible
    ? [...new Set([...RELAY_DISTRICT_ASSET_IDS, ...startupMenuAssetIds])]
    : [...startupMenuAssetIds];
  if (generatedStartupIds.length) {
    await loadGeneratedModels({
      ids: generatedStartupIds,
      onProgress: (done, total) => setLoading(0.5 + 0.04 * (done / Math.max(1, total)), `${t('loading.models')} ${done}/${total}`),
      optimizeStatic: true
    });
  }
  if (!menuBackground && !wantEditor && !relayOverviewMode) {
    try {
      menuBackground = createMenuBackground({
        THREE,
        canvas: document.getElementById('menuBackground'),
        clonePrefab
      });
      if (document.body.classList.contains('menu-open')) menuBackground?.show();
    } catch (error) {
      logError(error, 'menu background initialization');
    }
  }
  if (debugPerf) {
    perfLog.event('loading', 'models_complete', {
      durationMs: Math.round((performance.now() - modelLoadStartedAt) * 10) / 10,
      loadedModels: registry?.size || 0
    });
  }
  if (shaderWarm) {
    setLoading(0.55, t('loading.compiling'));
    const shaderWarmStartedAt = debugPerf ? performance.now() : 0;
    const bossWarmupExtras = getBossShaderWarmupExtras({ THREE, mats });
    await prewarmAllShaders(renderer, {
      registry,
      includeShadows: renderer.shadowMap?.enabled,
      includeDepthVariants: true,
      extras: bossWarmupExtras
    });
    if (debugPerf) {
      perfLog.event('loading', 'shader_warmup_complete', {
        durationMs: Math.round((performance.now() - shaderWarmStartedAt) * 10) / 10,
        shadows: !!renderer.shadowMap?.enabled
      });
    }
  } else {
    if (debugPerf) perfLog.event('loading', 'shader_warmup_skipped', { reason: 'warmup=0' }, 'warning');
  }
  setLoading(1.0, t('loading.ready'));
  // Hide overlay
  if (loadingEl) loadingEl.style.display = 'none';
} catch(e) {
  console.warn('Warmup failed — continuing without precompiled shaders');
  if (debugPerf) perfLog.event('loading', 'startup_failed', { error: e }, 'error');
  if (loadingEl) loadingEl.style.display = 'none';
}

// Obstacles / Level loading (deterministic per seed or explicit map)
const obstacleManager = new ObstacleManager(THREE, scene, mats);
let levelInfo = null;
let currentMap = null; // active custom map definition, null for procedural arena
if (levelParam) {
  try {
    // Expect a JSON blob or a relative path under assets/levels
    if (levelParam.trim().startsWith('{')) {
      const map = JSON.parse(levelParam);
      levelInfo = obstacleManager.loadFromMap(map, objects);
      currentMap = map;
    } else {
      // Synchronous fetch is not available; kick async and block wave start until loaded
      // Start a fetch but meanwhile place nothing yet; we will continue after load
      // For simplicity, attempt to fetch and then proceed. If it fails, fall back to procedural.
      // Note: this top-level await style via IIFE
      await (async ()=>{
        const res = await fetch(`assets/levels/${levelParam.replace(/[^a-zA-Z0-9-_\.]/g,'')}`);
          if (res.ok) {
            const map = await res.json();
            levelInfo = obstacleManager.loadFromMap(map, objects);
            currentMap = map;
          } else {
            obstacleManager.generate(seed, objects);
            currentMap = null;
          }
      })();
    }
  } catch (e) {
    logError(e);
    // On any error, fall back to procedural
    obstacleManager.generate(seed, objects);
    currentMap = null;
  }
} else if (!relayDefaultEligible) {
  obstacleManager.generate(seed, objects);
  currentMap = null;
}
cullGrassUnderObjects(grassMesh, objects);
// Update player collider list now that obstacles have been added
// (player constructed below will read from updated objects)

// Weather system
const weather = new WeatherSystem({ THREE, scene, skyMat, hemi, dir, mats });
const wave72Visuals = createWave72Visuals({ THREE, scene, hemi, dir, skyMat });
if (debugPerf) {
  const originalWeatherSetMode = weather.setMode.bind(weather);
  weather.setMode = (mode) => {
    const previous = weather.mode;
    const result = originalWeatherSetMode(mode);
    if (weather.mode !== previous) perfLog.event('weather', 'changed', { from: previous, to: weather.mode });
    return result;
  };
  perfLog.event('weather', 'initial', { mode: weather.mode });
}
const grassWeatherMotion = createGrassWeatherMotion();
const grassWeatherRng = makeNamespacedRng(seed, 'grass-weather');

// Adjust player forward direction for crosswind when windy
const _origGetDir = camera.getWorldDirection.bind(camera);
camera.getWorldDirection = function(target){
  _origGetDir(target);
  const windLevel = weather && Math.max(
    weather._mix?.wind || 0,
    weather._mix?.sand || 0,
    weather.mode && (weather.mode.includes('wind') || weather.mode.includes('sand')) ? 1 : 0
  );
  if (windLevel > 0.01){
    // Reduce crosswind impact on aiming by 90%
    const yaw = weather.wind.x * 0.003 * windLevel;
    target.applyAxisAngle(new THREE.Vector3(0,1,0), yaw).normalize();
  }
  return target;
};

// ------ Player ------
const player = new PlayerController(THREE, camera, document.body, objects, arenaRadius);
if (debugPerf) {
  player.onLookAnomaly = data => {
    perfLog.event('input', 'look_delta_rejected', data, 'warning');
  };
}
const controls = player.controls;
scene.add(controls.getObject());
// Ensure player colliders include maze/destructibles
if (player.refreshColliders) player.refreshColliders(objects);

// Resize
window.addEventListener('resize', ()=>{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
});

// ------ Enemies ------
const enemyManager = new EnemyManager(
  THREE,
  scene,
  mats,
  objects,
  () => {
    const pos = controls.getObject().position.clone();
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    return { position: pos, forward: f };
  },
  arenaRadius,
  obstacleManager,
  makeNamespacedRng(seed, 'enemies')
);
if (debugPerf) {
  const originalSpawnAt = enemyManager.spawnAt.bind(enemyManager);
  enemyManager.spawnAt = (type, position, options = {}) => {
    const root = originalSpawnAt(type, position, options);
    // Delayed regular-wave spawns pass countsTowardAlive:false because their
    // count is reserved at wave start. Direct counted spawns are boss adds or
    // other dynamic reinforcements and need their own diagnostic accounting.
    if (root && options.countsTowardAlive !== false) {
      gameplayLog.record('enemies', 1, performance.now(), enemyManager.wave || 0, session?.score || 0, type);
    }
    return root;
  };
}
// Ensure enemy manager colliders include arena floor and obstacles
if (enemyManager.refreshColliders) enemyManager.refreshColliders(objects);
// If map provided explicit enemy spawns, feed them to manager
if (levelInfo && Array.isArray(levelInfo.enemySpawnPoints) && levelInfo.enemySpawnPoints.length) {
  enemyManager.customSpawnPoints = levelInfo.enemySpawnPoints;
}
const effects = new Effects(THREE, scene, camera);
if (debugPerf) {
  const particleMethods = [
    ['spawnBulletImpact', () => 80],
    ['enemyDeath', () => 140],
    ['spawnExplosion', () => 126],
    ['spawnGroundSlam', radius => 146 + Math.floor((radius || 5) * 0.9)]
  ];
  for (const [method, emittedCount] of particleMethods) {
    const original = effects[method]?.bind(effects);
    if (!original) continue;
    effects[method] = (first, second, third) => {
      gameplayLog.record('particles', emittedCount(second), performance.now(), enemyManager?.wave || 0, session?.score || 0);
      return original(first, second, third);
    };
  }
}
// Enable muzzle flash overlay for player weapons
effects.muzzleEnabled = true;
// First-person simple weapon view (barrel meshes)
const weaponView = new WeaponView(THREE, camera);
effects.setMuzzleAnchor(weaponView.sockets.muzzle);
const movementRenderProbe = movementProbeEnabled ? new MovementRenderProbe({
  enabled: true,
  mode: movementProbeMode === 'weapon' ? 'weapon' : 'full',
  weaponRoot: weaponView.root,
  weaponView,
  player,
  grassMesh,
  renderer,
  onEvent: (name, data) => perfLog.event('performance', name, data)
}) : null;
const pickups = new Pickups(THREE, scene, makeNamespacedRng(seed, 'pickups'));
enemyManager.pickups = pickups;
const tutorial = new TutorialManager({ documentRef: document, enemyManager });

// Wire obstacle manager hooks now that managers exist
obstacleManager.enemyManager = enemyManager;
obstacleManager.pickups = pickups;
obstacleManager.getPlayer = () => controls.getObject();
obstacleManager.onScore = (points) => { addScore(points); };
obstacleManager.onPlayerDamage = (amount) => {
  if (paused || session.gameOver) return;
  const damageResult = applyPlayerDamage(amount, 'obstacle');
  // Apply universal hit VFX on any damage source
  if (!damageResult.ignored && effects && typeof effects.onPlayerHit === 'function') effects.onPlayerHit(amount);
  updateHUD();
};
// When obstacles change, refresh colliders for both player and enemies
obstacleManager.onCollidersChanged = (objs) => {
  try { if (player && typeof player.refreshColliders === 'function') player.refreshColliders(objs); } catch (e) { logError(e); }
  try { if (enemyManager && typeof enemyManager.refreshColliders === 'function') enemyManager.refreshColliders(objs); } catch (e) { logError(e); }
};

const relayLevel = new LevelRuntime({
  THREE,
  scene,
  objects,
  grassMesh,
  weather,
  clonePrefab,
  cullGrass: cullGrassUnderObjects,
  onObjective: state => renderRelayObjective(state),
  onWarning: message => console.warn(message),
  onRefreshColliders: () => {
    player.refreshColliders?.(objects);
    enemyManager.refreshColliders?.(objects);
  },
  onTransitionToLegacy: transitionRelayToLegacyArena
});
relayLevel.attach({ enemyManager });
if (relayDefaultEligible) relayLevel.load(RELAY_DISTRICT);
if (relayOverviewMode && relayLevel.active) {
  scene.add(camera);
  camera.position.set(0, 62, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.fov = 58;
  camera.updateProjectionMatrix();
  weaponView.root.visible = false;
}

function transitionRelayToLegacyArena() {
  if (!relayLevel.active) return;
  relayLevel.unload();
  obstacleManager.generate(seed, objects);
  cullGrassUnderObjects(grassMesh, objects);
  player.refreshColliders?.(objects);
  enemyManager.refreshColliders?.(objects);
  enemyManager.customSpawnPoints = null;
  levelInfo = null;
  weather.setMode('clear');
  enemyManager.tryAdvanceWave();
}

// ------ Gun / Shooting ------
let paused=false;
let gameOverLogged=false;
function logGameOver(source){
  if (!debugPerf || gameOverLogged) return;
  gameOverLogged = true;
  const state = captureGameplayState();
  perfLog.event('game', 'game_over', {
    source,
    score: session.score,
    wave: enemyManager?.wave || 0,
    gameTimeSeconds: Math.round((gameTime || 0) * 10) / 10,
    runElapsedSeconds: Math.max(0, Math.round((gameTime - debugRunStartedAt) * 10) / 10),
    hp: session.hp,
    activityThisWave: gameplayDelta(debugWaveBaseline?.totals, state.totals),
    activityThisRun: state.totals
  }, 'warning');
}
let lastMeleeSfxAt = -1;
let lastMeleeVfxAt = -1;
const MELEE_SFX_COOLDOWN = 0.25; // seconds
const MELEE_VFX_COOLDOWN = 0.10; // seconds; allow gentle pulsing while holding contact
const EMERGENCY_AMMO_COOLDOWN = 22; // seconds of active gameplay between emergency ammo drops
const hpEl = document.getElementById('hp'), hpMaxEl = document.getElementById('hpMax'), ammoEl = document.getElementById('ammo'), magEl = document.getElementById('mag'), scoreEl = document.getElementById('score'), bestEl = document.getElementById('best'), waveEl = document.getElementById('wave');
const staminaBarEl = document.getElementById('staminaBar');
const staminaValueEl = document.getElementById('staminaValue');
const staminaMaxValueEl = document.getElementById('staminaMaxValue');
const hpBlocksEl = document.getElementById('hpBlocks');
const stamBlocksEl = document.getElementById('stamBlocks');
const armorPillEl = document.getElementById('armorPill');
const armorBlocksEl = document.getElementById('armorBlocks');
const armorValueEl = document.getElementById('armorValue');
const armorMaxValueEl = document.getElementById('armorMaxValue');
const hudRootEl = document.getElementById('hud');
const HP_BLOCKS = 10;
const STAM_BLOCKS = 10;
let lastHpBlocksKey = '';
let lastStamBlockCount = -1;
let lastArmorBlocksKey = '';

function setTextIfChanged(element, value){
  if (!element) return;
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

function setDisplayIfChanged(element, value){
  if (element && element.style.display !== value) element.style.display = value;
}

function setWidthIfChanged(element, value){
  if (element && element.style.width !== value) element.style.width = value;
}

function ensureMeterBlocks(container, count){
  if (!container) return;
  if (container.childElementCount === count) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) container.appendChild(document.createElement('span'));
}

function paintHpBlocks(hp, maxHp = 100){
  ensureMeterBlocks(hpBlocksEl, HP_BLOCKS);
  if (!hpBlocksEl) return;
  const per = maxHp / HP_BLOCKS;
  const filled = hp / per;
  const key = `${Math.floor(filled)}:${filled % 1 > 0 ? 1 : 0}`;
  if (key === lastHpBlocksKey) return;
  lastHpBlocksKey = key;
  const kids = hpBlocksEl.children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].classList.remove('on', 'half');
    if (filled >= i + 1) kids[i].classList.add('on');
    else if (filled > i) kids[i].classList.add('half');
  }
}

function paintStamBlocks(pct01){
  ensureMeterBlocks(stamBlocksEl, STAM_BLOCKS);
  if (!stamBlocksEl) return;
  const onCount = Math.round(Math.max(0, Math.min(1, pct01)) * STAM_BLOCKS);
  if (onCount === lastStamBlockCount) return;
  lastStamBlockCount = onCount;
  const kids = stamBlocksEl.children;
  for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i < onCount);
}

ensureMeterBlocks(hpBlocksEl, HP_BLOCKS);
ensureMeterBlocks(stamBlocksEl, STAM_BLOCKS);
paintHpBlocks(100);
paintStamBlocks(1);

const fpsEl = document.getElementById('fps');
// Perf HUD is opt-in so release play is free of diagnostic visual noise.
if (hudRootEl && params.get('debug') === '1') hudRootEl.classList.add('debug-util');
let dbgCallsEl = null;
if (debugPerf) {
  dbgCallsEl = document.createElement('div');
  dbgCallsEl.id = 'drawCalls';
  dbgCallsEl.className = 'debug-perf';
  dbgCallsEl.textContent = 'Calls: 0  Tris: 0  Tex: 0';
  const util = document.querySelector('.hud-util');
  try {
    if (util) util.appendChild(dbgCallsEl);
    else document.body.appendChild(dbgCallsEl);
  } catch (e) { logError(e); }
}
const weaponNameEl = document.getElementById('weapon');
const weaponIconEl = document.getElementById('weaponIcon');
const weaponPickerEl = document.getElementById('weaponPicker');
const abilityPillEl = document.getElementById('abilityPill');
const abilityIconEl = document.getElementById('abilityIcon');
const abilityNameEl = document.getElementById('abilityName');
const abilityChargesEl = document.getElementById('abilityCharges');
const abilityCooldownEl = document.getElementById('abilityCooldown');
const hpPillEl = document.getElementById('hpPill');
const ammoPillEl = document.getElementById('ammoPill');
const waveBarEl = document.getElementById('waveBar');
const wavePillEl = document.getElementById('wavePill');
const remainingEl = document.getElementById('remaining');
const remainingUnitEl = document.getElementById('remainingUnit');
const objectiveTrackerEl = document.getElementById('objectiveTracker');
const objectiveTitleEl = document.getElementById('objectiveTitle');
const objectiveDetailEl = document.getElementById('objectiveDetail');
const objectiveBarEl = document.getElementById('objectiveBar');
const hydraWrapEl = document.getElementById('hydraWrap');
const hydraCountEl = document.getElementById('hydraCount');
const zoomOverlayEl = document.getElementById('zoomOverlay');
const hitmarkerEl = document.getElementById('hitmarker');
const bossHudEl = document.getElementById('bossHud');

function renderRelayObjective(state = {}) {
  if (!objectiveTrackerEl) return;
  objectiveTrackerEl.hidden = !state.visible;
  if (!state.visible) return;
  setTextIfChanged(objectiveTitleEl, t(state.titleKey || 'level.relay.name'));
  let detailKey = 'level.relay.eliminate';
  let detail = '';
  if (state.contested) detailKey = 'level.relay.contested';
  else if (state.kind === 'feeds') {
    detailKey = 'level.relay.feedsRemaining';
    detail = t(detailKey).replace('{count}', state.remainingTargets ?? 2);
  } else if (state.kind === 'mast') {
    detailKey = 'level.relay.holdRemaining';
    detail = t(detailKey).replace('{seconds}', Math.ceil(Math.max(0, (state.seconds || 0) - (state.elapsed || 0))));
  } else if (state.kind === 'boss') detailKey = 'level.relay.destroyNest';
  else if (state.kind === 'liberation') detailKey = 'level.relay.signalRestored';
  setTextIfChanged(objectiveDetailEl, detail || t(detailKey));
  const hasProgress = ['feeds', 'mast', 'liberation'].includes(state.kind);
  objectiveTrackerEl.classList.toggle('no-progress', !hasProgress);
  objectiveTrackerEl.classList.toggle('contested', !!state.contested);
  setWidthIfChanged(objectiveBarEl, `${Math.round(Math.max(0, Math.min(1, state.progress || 0)) * 100)}%`);
}
const bossNameEl = document.getElementById('bossName');
const bossHpBarEl = document.getElementById('bossHpBar');
const toastsEl = document.getElementById('toasts');
const tickerEl = document.getElementById('newsTicker');
let tickerQueue = Promise.resolve();
let weaponPickerTimer = null;

const WEAPON_ICON_MAP = Object.freeze({
  Rifle:'assets/icons/weapon-rifle.svg',
  SMG:'assets/icons/weapon-smg.svg',
  Shotgun:'assets/icons/weapon-shotgun.svg',
  DMR:'assets/icons/weapon-dmr.svg',
  Minigun:'assets/icons/weapon-minigun.svg',
  Pistol:'assets/icons/weapon-pistol.svg',
  BeamSaber:'assets/icons/weapon-beamsaber.svg',
  Grenade:'assets/icons/weapon-pistol.svg',
  Dynamite:'assets/icons/weapon-dynamite.svg',
  Satellite:'assets/icons/weapon-satellite.svg',
  GravityWell:'assets/icons/weapon-gravitywell.svg'
});

function weaponIconFor(name) {
  return WEAPON_ICON_MAP[name] || WEAPON_ICON_MAP.Rifle;
}

function paintArmorBlocks(armor, maxArmor){
  ensureMeterBlocks(armorBlocksEl, 10);
  if (!armorBlocksEl) return;
  const per = Math.max(1, maxArmor / 10);
  const filled = armor / per;
  const key = `${Math.round(filled * 2)}:${Math.round(maxArmor)}`;
  if (key === lastArmorBlocksKey) return;
  lastArmorBlocksKey = key;
  Array.from(armorBlocksEl.children).forEach((block, index) => block.classList.toggle('on', filled >= index + 0.5));
}

function setWeaponZoom(multiplier) {
  const factor = Number(multiplier) || 1;
  player.setZoomMultiplier(factor);
  if (!zoomOverlayEl) return;
  const active = factor > 1;
  zoomOverlayEl.classList.toggle('is-active', active);
  zoomOverlayEl.dataset.weapon = active ? (factor >= 3 ? 'dmr' : 'rifle') : '';
}

const achievements = new AchievementsManager();
const weaponAchievements = {
  check: event => {
    if (event?.type === 'shot') {
      if (debugPerf) gameplayLog.record('shots', 1, performance.now(), enemyManager?.wave || 0, session?.score || 0);
      triggerAlgorithmRouletteShot(event);
    }
    return achievements.check(event);
  }
};
let lastWaveStartTime = 0;

const _origEnemyRemove = enemyManager.remove.bind(enemyManager);
enemyManager.remove = (root) => {
  const killed = root?.userData?.hp <= 0;
  const wave = enemyManager?.wave || 0;
  const bossRoot = enemyManager.bossManager?.active ? enemyManager.bossManager?.boss?.root : null;
  const boss = root === bossRoot;
  const stageEvent = killed ? stagecraftDeaths.recordElimination({
    wave,
    openingGrade: mutations.getMutationGrade('opening_act'),
    finalGrade: mutations.getMutationGrade('final_cut'),
    lastEnemy: enemyManager.isLastWaveEnemy?.(root) === true,
    regularWave: wave % 5 !== 0 && !enemyManager.bossManager?.active,
    boss,
    tutorial: currentRunTutorial
  }) : null;
  const res = _origEnemyRemove(root);
  if (killed) {
    gameplayLog?.record('kills', 1, performance.now(), wave, session?.score || 0);
    triggerCallbackElimination();
    triggerEliminationSpectacle(root);
    triggerStagecraftDeath(root, stageEvent);
  }
  return res;
};

function clearTicker(){
  tickerQueue = Promise.resolve();
  if (!tickerEl) return;
  try {
    while (tickerEl.firstChild) {
      tickerEl.removeChild(tickerEl.firstChild);
    }
  } catch (e) { logError(e); }
}

// Best score persistence
const BEST_KEY = 'bs3d_best_score';
const savedBestForSession = getNumber(BEST_KEY, 0);
const comboCfg = {
  decayTime: 3.5,
  thresholds: [2, 5, 9], // actions required to reach tiers 1,2,3
  multipliers: [1.0, 1.2, 1.5, 2.0], // must be thresholds.length+1
  maxTier: 3
};
const comboEl = document.getElementById('combo');
const comboLabelEl = document.getElementById('comboLabel');
const comboBarEl = document.getElementById('comboBar');
const crosshairEl = document.getElementById('crosshair');
const session = new GameSession({
  initialBest: savedBestForSession,
  comboConfig: comboCfg,
  emergencyAmmoCooldown: EMERGENCY_AMMO_COOLDOWN,
  onBest: (value) => { setMaxNumber(BEST_KEY, value); },
  onScore: (points) => achievements.check({ type: 'score', amount: points }),
  onComboTier: (tier, prev) => {
    achievements.check({ type: 'comboTier', tier, previous: prev });
    if (tier > prev) { effects.promotionPulse(); effects.setTracerTint(tier / comboCfg.maxTier); }
    else { effects.setTracerTint(tier / comboCfg.maxTier); }
  }
});
const mutations = new ArchiveMutations({ rng: makeNamespacedRng(seed, 'mutations') });
const eliminationSpectacle = new EliminationSpectacle();
const algorithmRoulette = new AlgorithmRoulette({ rng: makeNamespacedRng(seed, 'algorithm-roulette') });
const stagecraftDeaths = new StagecraftDeaths();
const combo = session.combo;
let openingActComboHold = 0;

function triggerCallbackElimination() {
  const callback = mutations.recordElimination?.();
  if (!callback?.triggered || session.gameOver) return false;
  const position = controls.getObject().position.clone();
  enemyManager.applyRadialKnockback?.(position, {
    radius: callback.radius,
    pushDistance: callback.pushDistance,
    affectBosses: false
  });
  effects?.spawnGroundRing?.(position, callback.radius, 0x67e8f9);
  effects?.spawnGroundRing?.(position, callback.radius * 0.58, 0xf472b6);
  effects?.shake?.(0.08, 0.16);
  return true;
}

function triggerEliminationSpectacle(root) {
  const grade = mutations.getMutationGrade('overkill_confetti');
  const bossRoot = enemyManager.bossManager?.active ? enemyManager.bossManager?.boss?.root : null;
  const event = eliminationSpectacle.recordElimination({
    enabled: grade > 0,
    boss: root === bossRoot,
    tutorial: currentRunTutorial
  });
  if (!event.confetti) return false;
  effects?.spawnConfetti?.(root?.position?.clone?.() || controls.getObject().position.clone());
  if (grade >= 2) {
    const result = session.adjustHealth(2);
    if (result.amount > 0) showToast(t('mutation.confetti.heal').replace('{amount}', String(result.amount)));
    updateHUD();
  }
  return true;
}

function showStageCue(text, style) {
  if (!text || !document?.body) return;
  document.querySelectorAll('.stage-cue').forEach(existing => existing.remove());
  const cue = document.createElement('div');
  cue.className = `stage-cue stage-cue-${style}`;
  cue.setAttribute('role', 'status');
  cue.textContent = text;
  document.body.appendChild(cue);
  setTimeout(() => cue.remove(), 1250);
}

function triggerStagecraftDeath(root, event) {
  if (!event?.triggered || !root?.position) return false;
  const playerPosition = controls.getObject().position;
  const direction = root.position.clone().sub(playerPosition).setY(0);
  if (direction.lengthSq() < 0.0001) camera.getWorldDirection(direction).setY(0).negate();
  const enemyType = root.userData?.type || root.userData?.enemyVariant || 'grunt';
  const airborne = root.userData?.isFlyer === true || enemyType.includes('flyer') || enemyType === 'warden';
  const variant = event.style === 'final_cut' ? selectFinalCutVariant({
    grade: event.grade,
    wave: event.wave,
    enemyType,
    enemyId: event.elimination,
    airborne
  }) : null;
  effects?.animateStageDeath?.(root, { style: event.style, grade: event.grade, direction, variant });

  const center = root.position.clone();
  if (event.style === 'opening_act') {
    effects?.spawnGroundRing?.(center, event.grade >= 2 ? 3.1 : 2.5, 0x67e8f9);
    effects?.shake?.(event.grade >= 2 ? 0.1 : 0.06, 0.16);
    openingActComboHold = Math.max(openingActComboHold, event.comboHoldSeconds || 0);
    showStageCue(t('fun.openingAct.cue'), 'opening');
  } else {
    effects?.spawnGroundRing?.(center, event.grade >= 2 ? 3.4 : 2.8, 0xfacc15);
    effects?.spawnGroundRing?.(center, event.grade >= 2 ? 2.1 : 1.7, 0xf472b6);
    effects?.shake?.(event.grade >= 2 ? 0.14 : 0.09, 0.22);
    const restored = player.restoreStamina?.(event.staminaRestore || 0) || 0;
    showStageCue(t('fun.finalCut.cue'), 'final');
    if (restored > 0) showToast(t('fun.finalCut.stamina').replace('{amount}', String(Math.round(restored))));
    updateHUD();
  }
  return true;
}

function triggerAlgorithmRouletteShot(shot) {
  const grade = mutations.getMutationGrade('algorithm_roulette');
  if (!session || !algorithmRoulette || grade <= 0) return false;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const event = algorithmRoulette.tryShot({
    wave: enemyManager?.wave,
    directionY: direction.y,
    hp: session.hp,
    maxHp: session.maxHp,
    weapon: shot?.weapon,
    grade,
    tutorial: currentRunTutorial,
    gameOver: session.gameOver
  });
  if (!event.triggered) return false;
  const result = session.adjustHealth(event.delta, { minimum: 1 });
  const position = controls.getObject().position.clone();
  if (result.amount > 0) {
    effects?.spawnGroundRing?.(position, 2.2, 0x7cff9b);
    showToast(t('fun.algorithm.win').replace('{amount}', String(result.amount)));
  } else {
    effects?.spawnGroundRing?.(position, 2.2, 0xff5c7a);
    effects?.onPlayerHit?.(Math.abs(result.amount));
    showToast(t('fun.algorithm.loss').replace('{amount}', String(Math.abs(result.amount))));
  }
  updateHUD();
  return true;
}

function applyPlayerDamage(amount, source = 'enemy', { bypassArmor = false } = {}) {
  if (paused || session.gameOver) return { gameOver: session.gameOver, died: false, hp: session.hp };
  if (player?.isInvulnerable?.()) {
    return {
      gameOver: false,
      died: false,
      hp: session.hp,
      armor: session.armor,
      armorAbsorbed: 0,
      hpDamage: 0,
      ignored: true,
      invulnerable: true
    };
  }
  const damageResult = session.damage(amount, { bypassArmor });
  achievements.check({ type: 'playerDamaged', amount, source });
  if (damageResult.died) {
    achievements.check({ type: 'playerDied', source });
    logGameOver(source);
    mutations.reveal();
    showDefeatPanel();
    try { controls.unlock?.(); } catch (e) { logError(e); }
    stopSuno();
  }
  return damageResult;
}

function updateComboLabel(){
  if (!comboEl) return;
  setTextIfChanged(comboLabelEl, `${t('hud.combo')} ×${combo.multiplier.toFixed(1)}`);
  for (let tier = 1; tier <= 4; tier++) comboEl.classList.toggle(`tier${tier}`, combo.tier === tier);
}
function addComboAction(points){ session.addComboAction(points); updateComboLabel(); }
function resetCombo(){ session.resetCombo(); updateComboLabel(); if(comboBarEl){ comboBarEl.style.width = '0%'; } }

let weaponSystem; // initialized later
let abilitySystem; // equipped Q ability + cooldown runtime
let progression;  // armory offers + unlocks
let story;        // lightweight narrative beats
let offerActive = false; // suppress panel on pointer unlock during offers
let currentRunTutorial = false;

function renderWeaponPicker(){
  if (!weaponPickerEl || !weaponSystem) return;
  const slots = weaponSystem.inventory || [];
  const fragment = document.createDocumentFragment();
  slots.forEach((weapon, index) => {
    const slot = document.createElement('div');
    const active = index === weaponSystem.currentIndex;
    slot.className = `hud-weapon-slot${active ? ' is-active' : ''}`;
    slot.setAttribute('aria-label', `${index + 1}: ${weapon?.name || 'Weapon'}${active ? ', active' : ''}`);

    const key = document.createElement('span');
    key.className = 'weapon-slot-key';
    key.textContent = String(index + 1);

    const content = document.createElement('span');
    const icon = document.createElement('img');
    icon.className = 'weapon-slot-icon';
    icon.src = weaponIconFor(weapon?.name);
    icon.alt = '';

    const name = document.createElement('span');
    name.className = 'weapon-slot-name';
    name.textContent = weapon?.name || 'Weapon';

    const ammo = document.createElement('span');
    ammo.className = 'weapon-slot-ammo';
    const isBeamSaber = weapon?.name === 'BeamSaber';
    const loaded = isBeamSaber ? '∞' : (weapon?.getAmmo?.() ?? 0);
    const reserve = isBeamSaber ? '∞' : (weapon?.getReserve?.() ?? 0);
    ammo.textContent = `${loaded} / ${reserve}`;

    content.append(icon, name, ammo);
    slot.append(key, content);
    fragment.append(slot);
  });
  weaponPickerEl.replaceChildren(fragment);
}

function showWeaponPicker(){
  if (!weaponPickerEl || !weaponSystem) return;
  renderWeaponPicker();
  weaponPickerEl.classList.add('is-visible');
  if (weaponPickerTimer) clearTimeout(weaponPickerTimer);
  weaponPickerTimer = setTimeout(() => {
    weaponPickerEl.classList.remove('is-visible');
    weaponPickerTimer = null;
  }, 1600);
}

function updateHUD(){
  const stats = getPlayerHudStats(session, player);
  const w = weaponSystem ? weaponSystem.current : null;
  const isBeamSaber = w?.name === 'BeamSaber';
  const ammoVal = weaponSystem ? (isBeamSaber ? '∞' : weaponSystem.getAmmo()) : 30;
  const reserveVal = weaponSystem ? (isBeamSaber ? '∞' : weaponSystem.getReserve()) : 60;
  setTextIfChanged(weaponNameEl, w ? w.name : 'Rifle');
  if (ammoPillEl) {
    const key = (w?.name || 'Rifle').toLowerCase();
    for (const weapon of ['rifle','smg','shotgun','dmr','minigun','pistol','beamsaber','grenade','dynamite','satellite','gravitywell']) {
      ammoPillEl.classList.toggle(`weapon-${weapon}`, weapon === key);
    }
  }
  if (weaponIconEl) {
    const icon = weaponIconFor(w?.name);
    if (weaponIconEl.getAttribute('src') !== icon) weaponIconEl.src = icon;
  }
  setTextIfChanged(hpEl, Math.floor(stats.hp));
  setTextIfChanged(hpMaxEl, Math.floor(stats.maxHp));
  paintHpBlocks(stats.hp, stats.maxHp);
  setDisplayIfChanged(armorPillEl, stats.maxArmor > 0 ? '' : 'none');
  setTextIfChanged(armorValueEl, Math.floor(stats.armor));
  setTextIfChanged(armorMaxValueEl, Math.floor(stats.maxArmor));
  paintArmorBlocks(stats.armor, stats.maxArmor);
  setTextIfChanged(staminaValueEl, Math.floor(stats.stamina));
  setTextIfChanged(staminaMaxValueEl, Math.floor(stats.maxStamina));
  setTextIfChanged(ammoEl, ammoVal);
  setTextIfChanged(magEl, reserveVal);
  setTextIfChanged(scoreEl, session.score);
  setTextIfChanged(bestEl, session.best);
  setTextIfChanged(waveEl, enemyManager.wave);
  if (weaponPickerEl?.classList.contains('is-visible')) renderWeaponPicker();
  updateHUDComboAndBoss();
  updateMobileAltButton();
  updateAbilityHUD();
}

function updateHUDComboAndBoss(){
  updateComboLabel();
  // Stamina HUD
  const stats = getPlayerHudStats(session, player);
  const stam01 = stats.stamina01;
  setTextIfChanged(staminaValueEl, Math.floor(stats.stamina));
  setTextIfChanged(staminaMaxValueEl, Math.floor(stats.maxStamina));
  setWidthIfChanged(staminaBarEl, `${(stam01*100).toFixed(1)}%`);
  paintStamBlocks(stam01);
  // Low state cues
  if (hpPillEl){ hpPillEl.classList.remove('low','crit'); if (session.hp <= 25) { hpPillEl.classList.add('crit'); } else if (session.hp <= 50) { hpPillEl.classList.add('low'); } }
  if (ammoPillEl){
    const ammoValLocal = weaponSystem ? weaponSystem.getAmmo() : 30;
    const isBeam = weaponSystem?.current?.name === 'BeamSaber';
    ammoPillEl.classList.remove('need-reload');
    if (!isBeam && ammoValLocal <= 0) ammoPillEl.classList.add('need-reload');
  }
  // Hydra lineage aggregate
  let hydraAlive = 0, hydraDesc = 0;
  try {
    const bb = enemyManager?._ctx?.blackboard;
    if (bb && bb.hydraLineages) {
      for (const v of Object.values(bb.hydraLineages)) {
        hydraAlive += v.alive || 0;
        hydraDesc += v.descendants || 0;
      }
    }
  } catch (e) { logError(e); }
  if (hydraWrapEl) {
    if (hydraAlive > 0) {
      setDisplayIfChanged(hydraWrapEl, '');
      setTextIfChanged(hydraCountEl, `${hydraAlive}/${hydraDesc}`);
    } else {
      setDisplayIfChanged(hydraWrapEl, 'none');
    }
  }
  // Wave progress (account for hydra descendants)
  if (waveBarEl && typeof enemyManager.waveStartingAlive === 'number'){
    const total = Math.max(1, enemyManager.waveStartingAlive + hydraDesc);
    const remaining = Math.max(0, enemyManager.alive|0);
    const done01 = Math.max(0, Math.min(1, 1 - (remaining / total)));
    setWidthIfChanged(waveBarEl, `${(done01*100).toFixed(1)}%`);
    if (wavePillEl) wavePillEl.classList.toggle('hydra', hydraAlive > 0);
    if (hudRootEl) hudRootEl.classList.toggle('wave-hydra', hydraAlive > 0);
  }
  const specialWave = enemyManager.specialWaveState;
  if (specialWave?.active && specialWave.packagesCommitted < specialWave.definition.packageCount) {
    setTextIfChanged(remainingEl, `${specialWave.packagesCommitted}/${specialWave.definition.packageCount}`);
    setTextIfChanged(remainingUnitEl, t('hud.surges'));
  } else {
    setTextIfChanged(remainingEl, Math.max(0, enemyManager.alive|0));
    setTextIfChanged(remainingUnitEl, t('hud.left'));
  }
  // Hide remaining when boss active
  try {
    const bossActive = !!(enemyManager && enemyManager.bossManager && enemyManager.bossManager.active && enemyManager.bossManager.boss);
    const wrap = document.getElementById('remainingWrap');
    setDisplayIfChanged(wrap, bossActive ? 'none' : '');
    // Boss HUD
    if (bossHudEl) {
      if (bossActive) {
        setDisplayIfChanged(bossHudEl, '');
        const boss = enemyManager.bossManager.boss;
        const data = boss?.root?.userData || {};
        const name = data.displayName || (data.type ? String(data.type).replace(/^boss_/, '').replace(/_/g,' ') : 'Boss');
        const phaseLabel = data.phaseLabel ? ` · ${data.phaseLabel}` : '';
        setTextIfChanged(bossNameEl, `${name}${phaseLabel}`);
        const maxHp = enemyManager.bossManager._musicBossMaxHp || boss?.root?.userData?.maxHp || boss?.root?.userData?.hp || 1;
        const curHp = Math.max(0, Math.min(maxHp, boss?.root?.userData?.hp || maxHp));
        setWidthIfChanged(bossHpBarEl, `${((curHp/maxHp)*100).toFixed(1)}%`);
      } else {
        setDisplayIfChanged(bossHudEl, 'none');
      }
    }
  } catch (e) { logError(e); }
}

function addScore(points){
  session.addScore(points);
  updateHUD();
}
updateHUD();

let debugWaveBaseline = null;
let debugRunStartedAt = 0;

function captureGameplayState(){
  const currentWeapon = weaponSystem?.current;
  return {
    atGameTime: gameTime,
    score: session.score,
    hp: session.hp,
    comboTier: session.combo?.tier || 0,
    weapon: currentWeapon?.name || null,
    magazine: currentWeapon?.getAmmo?.() ?? currentWeapon?.ammoInMag ?? null,
    reserve: currentWeapon?.getReserve?.() ?? currentWeapon?.reserveAmmo ?? null,
    totalNonPistolAmmo: session.totalNonPistolAmmo(weaponSystem),
    totals: {
      ...(gameplayLog?.getTotals() || {}),
      ...(motionLog?.getTotals() || {})
    }
  };
}

function countPlannedEnemies(types, wave){
  if (!Array.isArray(types)) {
    const bossType = enemyManager.bossManager?.boss?.root?.userData?.type;
    return bossType ? { [bossType]: 1 } : (wave % 5 === 0 ? { boss: 1 } : {});
  }
  const counts = {};
  for (const type of types) counts[type] = (counts[type] || 0) + 1;
  return counts;
}

function gameplayDelta(previous, current){
  const result = {};
  for (const metric of ['shots', 'kills', 'enemies', 'particles', 'distanceMeters', 'cameraDegrees']) {
    const value = Math.max(0, (current?.[metric] || 0) - (previous?.[metric] || 0));
    result[metric] = metric === 'distanceMeters' || metric === 'cameraDegrees'
      ? Math.round(value * 10) / 10
      : value;
  }
  return result;
}

// update HUD when a new wave starts and when remaining enemies changes
const handleWaveStart = createWaveStartHandler({
  session,
  enemyManager,
  achievements,
  pickups,
  weather,
  player,
  objects,
  getProgression: () => progression,
  getStory: () => story,
  getGameTime: () => gameTime,
  getWaveContext: (wave) => ({
    startHp: session.hp,
    weather: weather.mode,
    isBoss: wave % 5 === 0
  }),
  getLastWaveStartTime: () => lastWaveStartTime,
  setLastWaveStartTime: value => { lastWaveStartTime = value; },
  updateHUD,
  showToast
});
enemyManager.onWave = (wave, startingAlive, plannedTypes) => {
  const waveStartState = debugPerf ? captureGameplayState() : null;
  const plannedComposition = debugPerf ? countPlannedEnemies(plannedTypes, wave) : null;
  if (debugPerf && wave > 1) {
    perfLog.event('game', 'wave_complete', {
      wave: wave - 1,
      durationSeconds: Math.max(0, Math.round((gameTime - lastWaveStartTime) * 10) / 10),
      runElapsedSeconds: Math.max(0, Math.round((gameTime - debugRunStartedAt) * 10) / 10),
      scoreGained: Math.max(0, waveStartState.score - (debugWaveBaseline?.score || 0)),
      endState: {
        score: waveStartState.score,
        hp: waveStartState.hp,
        comboTier: waveStartState.comboTier,
        weapon: waveStartState.weapon,
        magazine: waveStartState.magazine,
        reserve: waveStartState.reserve,
        totalNonPistolAmmo: waveStartState.totalNonPistolAmmo
      },
      activity: gameplayDelta(debugWaveBaseline?.totals, waveStartState.totals)
    });
  }
  if (gameplayLog) {
    const plannedEntries = Object.entries(plannedComposition || {});
    if (plannedEntries.length) {
      for (const [type, count] of plannedEntries) {
        gameplayLog.record('enemies', count, performance.now(), wave, session.score, type);
      }
    } else {
      gameplayLog.record('enemies', startingAlive, performance.now(), wave, session.score, 'unknown');
    }
  }
  handleWaveStart(wave, startingAlive);
  relayLevel.onWaveStart(wave);
  if (wave === 5 && mutations.getEligibleDefinitions().length > 0) {
    showToast(t('mutation.progress.bossReady'));
  }
  if (debugPerf) {
    perfLog.event('game', 'wave_start', {
      wave,
      startingAlive,
      composition: plannedComposition,
      weather: weather.mode,
      runElapsedSeconds: Math.max(0, Math.round((gameTime - debugRunStartedAt) * 10) / 10)
    });
    debugWaveBaseline = { ...waveStartState, wave };
  }
};
enemyManager.onRemaining = () => updateHUD();
enemyManager.onSpecialWave = event => {
  if (event.type === 'start') {
    wave72Visuals.start();
    showToast(t('wave72.start'));
  } else if (event.type === 'surge-warning') {
    showToast(t('wave72.warning').replace('{surge}', event.surge).replace('{total}', event.totalSurges));
  } else if (event.type === 'surge') {
    showToast(t('wave72.surge').replace('{surge}', event.surge).replace('{total}', event.totalSurges));
  } else if (event.type === 'complete') {
    wave72Visuals.stop();
    showToast(t('wave72.complete'));
  } else if (event.type === 'cancel') {
    wave72Visuals.stop();
  }
  updateHUD();
};

// Sounds: create music first, then SFX sharing its context and FX bus
const baseMusicVol = 0.35;
const baseSfxVol = 0.65;
const storedSound = getNumber('soundVolume', 1);
const music = new Music({ bpm: 132, volume: baseMusicVol * storedSound });
const S = new SFX({
  audioContextProvider: () => music.getContext(),
  fxBusProvider: () => music.getFxBus(),
  volume: baseSfxVol * storedSound,
});
// Expose for ambient enemy vocals
try { window._SFX = S; } catch (e) { logError(e); }
let currentSongIndex = 0;
let lastSongRotateBar = -1;
function loadCurrentSong(){
  const song = SONGS[currentSongIndex % SONGS.length];
  music.loadSong(song);
  // Mark switch point so rotation cadence is consistent even across boss transitions
  lastSongRotateBar = music.barCounter;
}
loadCurrentSong();

const soundSlider = document.getElementById('soundVolume');
if (soundSlider){
  soundSlider.value = String(storedSound);
  soundSlider.addEventListener('input', e=>{
    const v = parseFloat(e.target.value);
    music.setVolume(baseMusicVol * v);
    S.setVolume(baseSfxVol * v);
    setNumber('soundVolume', v);
  });
}

const SUNO_TRACKS = [
  'assets/music/suno-remix-1-non-commercial-use-only.mp3',
  'assets/music/suno-remix-2-non-commercial-use-only.mp3',
  'assets/music/suno-remix-3-non-commercial-use-only.mp3',
  'assets/music/suno-remix-4-non-commercial-use-only.mp3',
  'assets/music/suno-remix-5-non-commercial-use-only.mp3',
];
const SUNO_BOSS_TRACK = 'assets/music/boss-standoff 1 (Suno Remix) - non commerial use only.mp3';

function stopSuno(){
  if (sunoAudio) {
    try { sunoAudio.pause(); sunoAudio.currentTime = 0; } catch (e) { logError(e); }
    sunoAudio = null;
  }
}

function playSuno(){
  stopSuno();
  const track = SUNO_TRACKS[sunoTrackIndex % SUNO_TRACKS.length];
  sunoTrackIndex = (sunoTrackIndex + 1) % SUNO_TRACKS.length;
  sunoAudio = new Audio(track);
  sunoAudio.volume = 0.35;
  sunoAudio.muted = S.isMuted;
  sunoAudio.addEventListener('ended', playSuno);
  try { sunoAudio.play(); } catch (e) { logError(e); }
  try { music.stop?.(); } catch (e) { logError(e); }
}

function playSunoBoss(){
  stopSuno();
  sunoAudio = new Audio(SUNO_BOSS_TRACK);
  sunoAudio.volume = 0.35;
  sunoAudio.muted = S.isMuted;
  sunoAudio.loop = true;
  try { sunoAudio.play(); } catch (e) { logError(e); }
  try { music.stop?.(); } catch (e) { logError(e); }
}

document.getElementById('mute').onclick=()=>{
  const muted = !(S.isMuted);
  S.setMuted(muted);
  document.getElementById('mute').textContent = muted?'🔇':'🔊';
  music.setMuted(muted);
  if (sunoAudio) sunoAudio.muted = muted;
};

// Tracer + sparks
const tracers = [];
function addTracer(from, to){
  // New: use effects-driven sprite tracer for motion
  if (effects && typeof effects.spawnBulletTracer === 'function') {
    const muzzlePos = effects.getMuzzleWorldPos(new THREE.Vector3());
    effects.spawnBulletTracer(muzzlePos, to, { ttl: 0.12, width: 0.04, impact: true });
  } else {
    // Fallback to legacy line if effects unavailable
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(g, mats.tracer.clone());
    line.userData = { life: 0 };
    scene.add(line); tracers.push(line);
  }
}
function addSpark(at){
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mats.spark.clone());
  s.position.copy(at); s.userData={ life:0 };
  scene.add(s); tracers.push(s); // reuse same update list
}

// Hitscan raycaster
const raycaster = new THREE.Raycaster();

// Initialize weapon system and input
weaponSystem = new WeaponSystem({
  THREE,
  camera,
  raycaster,
  enemyManager,
  objects,
  effects,
  obstacleManager,
  pickups,
  S,
  updateHUD: () => updateHUD(),
  addScore: (p) => addScore(p),
  addComboAction: (p) => addComboAction(p),
  combo,
  addTracer: (from, to) => addTracer(from, to),
  applyRecoil: (r)=> player.applyRecoil?.(r),
  applyPlayerKnockback: (vector) => player.applyKnockback?.(vector),
  getPlayerPosition: (target) => target.copy(controls.getObject().position),
  setZoomMultiplier: (multiplier) => setWeaponZoom(multiplier),
  weaponView,
  achievements: weaponAchievements,
  getGameTime: () => gameTime,
  onWeaponSwitch: () => { showWeaponPicker(); updateMobileAltButton(); },
  mutations
});
abilitySystem = new AbilitySystem({
  getContext: () => weaponSystem.context(),
  getEquippedAbility: () => mutations.getEquippedAbility?.(),
  activateRush: () => performPunchlineRush(),
  onStateChange: () => updateAbilityHUD()
});
if (hasDebugWaveOverride) abilitySystem.setDebugAbility(params.get('ability') || 'dynamite');
// Set initial weapon view
try { weaponView.setWeapon(weaponSystem.getPrimaryName()); } catch (e) { logError(e); }
progression = new Progression({
  weaponSystem,
  documentRef: document,
  onPause: (lock)=>{ offerActive = !!lock; paused = !!lock; },
  controls,
  rng: makeNamespacedRng(seed, 'progression'),
  mutations,
  session,
  player,
  translate: t,
  onMutationApplied: () => { updateHUD(); updateMobileAltButton(); },
  onClassifiedReveal: ({ definition }) => {
    const weaponName = definition ? t(definition.nameKey) : t('classified.hidden.name');
    showToast(t('classified.revealToast').replace('{weapon}', weaponName));
    updateArchiveAvailability();
  }
});
tutorial.weaponSystem = weaponSystem;
story = storyDisabled ? null : new StoryManager({ documentRef: document, onPause: (lock)=>{ paused = !!lock; }, controls, toastFn: (t)=> showToast(t), tickerFn: (t,r,i)=> showTicker(t,r,i) });

function updateMobileAltButton(){
  const altButton = document.getElementById('btnAlt');
  if (!altButton) return;
  altButton.style.display = weaponSystem?.hasCurrentAltFire?.() ? '' : 'none';
}

function updateAbilityHUD(){
  const state = abilitySystem?.getState?.();
  setDisplayIfChanged(abilityPillEl, state ? '' : 'none');
  if (state && abilityPillEl) {
    setTextIfChanged(abilityNameEl, t(state.definition.nameKey));
    setTextIfChanged(abilityChargesEl, `${state.charges}/${state.maxCharges}`);
    setTextIfChanged(abilityCooldownEl, state.ready ? t('ability.ready') : `${Math.max(0, state.cooldownRemaining).toFixed(1)}s`);
    if (abilityIconEl?.getAttribute('src') !== state.definition.icon) abilityIconEl.src = state.definition.icon;
    abilityPillEl.classList.toggle('is-cooldown', !state.ready);
    abilityPillEl.style.setProperty('--ability-ready', `${Math.round(state.cooldownProgress * 100)}%`);
  }
  const abilityButton = document.getElementById('btnRush');
  if (!abilityButton) return;
  setDisplayIfChanged(abilityButton, state ? '' : 'none');
  abilityButton.disabled = !state?.ready;
  abilityButton.textContent = state?.ready ? 'Q' : String(Math.ceil(state?.cooldownRemaining || 0));
}

let rushHitEnemies = new Set();

function performPunchlineRush(){
  if (!player.startRush({ distance: 10, duration: 0.6, regenDelay: 0, requireFullStamina: false, consumeStamina: false })) return false;
  rushHitEnemies = new Set();
  effects?.spawnGroundSlam?.(controls.getObject().position.clone(), 1.6);
  return true;
}

function activateEquippedAbility(){
  if (paused || session.gameOver || !controls.isLocked) return false;
  return abilitySystem?.activate?.() === true;
}

player.onRushStep = ({ position, direction }) => {
  const affected = enemyManager.applyRushImpact(position, direction, {
    radius: 1.65,
    pushDistance: 2.6,
    stunSeconds: 1.5,
    hitSet: rushHitEnemies
  });
  for (const root of affected) {
    effects?.spawnGroundRing?.(root.position.clone(), 0.9, 0x67e8f9);
  }
};
player.onRushEnd = () => updateAbilityHUD();



if (!isMobile) {
  // Desktop: support primary fire + right-click alt fire
  window.addEventListener('mousedown', e => {
    if (!controls.isLocked || paused) return;
    if (e.button === 2) weaponSystem.triggerAltDown();
    else weaponSystem.triggerDown();
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 2) weaponSystem.triggerAltUp();
    else weaponSystem.triggerUp();
  });

  // Disable context menu so right-click is usable for alt fire
  window.addEventListener('contextmenu', e => { e.preventDefault(); });

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyR') { weaponSystem.reload(); }
    if (e.code === 'KeyQ' && !e.repeat) { activateEquippedAbility(); }
    if (e.code === 'KeyP') {
      paused = !paused;
      if (debugPerf) perfLog.event('game', paused ? 'pause' : 'resume', { source: 'keyboard' });
    }
    if (e.code === 'Digit1') { weaponSystem.switchSlot(1); }
    if (e.code === 'Digit2') { weaponSystem.switchSlot(2); }
    if (e.code === 'Digit3') { weaponSystem.switchSlot(3); }
    if (e.code === 'Digit4') { weaponSystem.switchSlot(4); }
    if (e.code === 'Digit5') { weaponSystem.switchSlot(5); }
    if (e.code === 'Digit6') { weaponSystem.switchSlot(6); }
    if (e.code === 'Digit7') { weaponSystem.switchSlot(7); }
    // Update view on quick slot changes
    try { weaponView.setWeapon(weaponSystem.getPrimaryName()); } catch (e) { logError(e); }
  });

} else {
  // Mobile: touch controls (fire, reload, jump)
  const fireBtn = document.getElementById('btnFire');
  const altBtn = document.getElementById('btnAlt');
  const rushBtn = document.getElementById('btnRush');
  const reloadBtn = document.getElementById('btnReload');
  const jumpBtn = document.getElementById('btnJump');

  if (fireBtn) {
    fireBtn.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      weaponSystem.triggerDown();
    }, { passive: false });
    const end = () => weaponSystem.triggerUp();
    fireBtn.addEventListener('touchend', end);
    fireBtn.addEventListener('touchcancel', end);
  }

  if (altBtn) {
    altBtn.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
    }, { passive: false });
    altBtn.addEventListener('touchend', () => {
      weaponSystem.triggerAltDown();
      weaponSystem.triggerAltUp();
    });
  }

  if (rushBtn) {
    rushBtn.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
    }, { passive: false });
    rushBtn.addEventListener('touchend', activateEquippedAbility);
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    reloadBtn.addEventListener('touchend', () => { weaponSystem.reload(); });
  }

  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    jumpBtn.addEventListener('touchend', () => { player.jump(); });
  }

  // Optional: quick-slot keyboard shortcuts generally don't apply on mobile
}

updateHUD();

// ------ Game Loop ------
const clock = new THREE.Clock();
let gameTime = 0; // advances only when not paused and controls are locked
// FPS limit
const TARGET_FPS = 60;
const FRAME_MIN_MS = TARGET_FRAME_MS;
let _lastFrameAt = performance.now();
let _lastRenderedAt = _lastFrameAt;
// Adaptive resolution is the safe default; High/Ultra explicitly disable it.
const autoDpr = params.get('autoDPR') !== '0';
const dprBudget = createDprBudget(window.devicePixelRatio || 1, autoDpr);
let _dpr = dprBudget.initial;
let _frameEmaMs = 1000 / TARGET_FPS;
let _lastDprAdjustAt = 0;
let lastCrosshairSignature = '';
function createPhaseTimingBuffer(){
  return {
    measurement: 'previous_rendered_frame',
    playerSimulationMs: 0,
    enemyAiMs: 0,
    effectsPickupsMs: 0,
    weatherAudioMs: 0,
    housekeepingMs: 0,
    renderMs: 0,
    measuredWorkMs: 0,
    intervalMs: 0,
    unattributedMs: 0,
    movement: {
      moving: false,
      inputActive: false,
      speedMetersPerSecond: 0,
      position: { x: 0, y: 0, z: 0 },
      distanceFromCenter: 0,
      yawDegrees: 0,
      pitchDegrees: 0,
      cameraFov: 0,
      sprinting: false,
      probePhase: null
    },
    renderer: {
      drawCalls: 0,
      triangles: 0,
      shadowsEnabled: false,
      shadowAutoUpdate: false,
      grassInstances: 0,
      grassVisible: false,
      grassFrustumCulled: true,
      viewportPixels: 0
    }
  };
}
function resetPhaseTimingBuffer(timing){
  timing.playerSimulationMs = 0;
  timing.enemyAiMs = 0;
  timing.effectsPickupsMs = 0;
  timing.weatherAudioMs = 0;
  timing.housekeepingMs = 0;
  timing.renderMs = 0;
  timing.measuredWorkMs = 0;
  timing.intervalMs = 0;
  timing.unattributedMs = 0;
}
function roundedMs(value){ return Math.round(Math.max(0, value) * 10) / 10; }
const phaseTimingBuffers = debugPerf ? [createPhaseTimingBuffer(), createPhaseTimingBuffer()] : null;
let phaseTimingIndex = 0;
let hasPreviousPhaseTiming = false;
function step(){
  const now = performance.now();
  const frameSchedule = scheduleCappedFrame(now, _lastFrameAt, FRAME_MIN_MS);

  if (!frameSchedule.shouldRender) { requestAnimationFrame(step); return; }
  _lastFrameAt = frameSchedule.lastScheduledAt;
  const elapsedMs = now - _lastRenderedAt;
  _lastRenderedAt = now;
  const currentPhaseTiming = debugPerf ? phaseTimingBuffers[phaseTimingIndex] : null;
  const previousPhaseTiming = debugPerf ? phaseTimingBuffers[1 - phaseTimingIndex] : null;
  if (currentPhaseTiming) resetPhaseTimingBuffer(currentPhaseTiming);
  let phaseMark = debugPerf ? performance.now() : 0;

  // --- FPS calc (EMA over ~0.5s) using RAF intervals ---
  const dtRaf = Math.min(0.1, Math.max(0, elapsedMs / 1000));
  if (!step._fps) { step._fps = { ema: null, accum: 0 }; }
  const instFps = elapsedMs > 0 ? 1000 / elapsedMs : 0;
  const alpha = 1 - Math.exp(-(dtRaf || 0.016) / 0.5);
  step._fps.ema = (step._fps.ema == null) ? instFps : (step._fps.ema * (1 - alpha) + instFps * alpha);
  step._fps.accum += dtRaf;
  if (fpsEl && step._fps.accum >= 0.2) { fpsEl.textContent = String(Math.round(step._fps.ema)); step._fps.accum = 0; }

  const dt = Math.min(0.033, clock.getDelta());
  const gameplayActive = (controls.isLocked || isMobile) && !paused && !session.gameOver;
  const movementInputActive = gameplayActive && (
    player.keys.has('KeyW') || player.keys.has('KeyA') ||
    player.keys.has('KeyS') || player.keys.has('KeyD')
  );
  const movementProbePhase = movementRenderProbe
    ? movementRenderProbe.beforeFrame({
      nowMs: now,
      moving: gameplayActive && (
        movementInputActive || Math.sqrt(Math.max(0, player.velXZ?.lengthSq?.() || 0)) > 0.15
      )
    })
    : null;
  if(gameplayActive){
    // advance game time only while active
    gameTime += dt;
    achievements.check({ type: 'time', delta: dt });
    // player movement update
    player.update(dt);
    relayLevel.update(dt, controls.getObject());
    if (debugPerf) {
      const movement = currentPhaseTiming.movement;
      const playerObject = controls.getObject();
      const speedMetersPerSecond = Math.sqrt(Math.max(0, player.velXZ?.lengthSq?.() || 0));
      const inputActive = player.keys.has('KeyW') || player.keys.has('KeyA') ||
        player.keys.has('KeyS') || player.keys.has('KeyD');
      movement.moving = speedMetersPerSecond > 0.15;
      movement.inputActive = inputActive;
      movement.speedMetersPerSecond = roundedMs(speedMetersPerSecond);
      movement.position.x = roundedMs(playerObject.position.x);
      movement.position.y = roundedMs(playerObject.position.y);
      movement.position.z = roundedMs(playerObject.position.z);
      movement.distanceFromCenter = roundedMs(Math.hypot(playerObject.position.x, playerObject.position.z));
      movement.yawDegrees = roundedMs(THREE.MathUtils.radToDeg(player.yawObject?.rotation?.y || 0));
      movement.pitchDegrees = roundedMs(THREE.MathUtils.radToDeg(camera.rotation.x || 0));
      movement.cameraFov = roundedMs(camera.fov || 0);
      movement.sprinting = inputActive && (player.keys.has('ShiftLeft') || player.keys.has('ShiftRight'));
      movement.probePhase = movementProbePhase;
    }
    // weapon view update using player inputs (approx from key state and mouse movement are handled by PointerLock, so we feed movement intent only)
    try {
      const x = (player.keys.has('KeyD')?1:0) + (player.keys.has('KeyA')?-1:0);
      const y = (player.keys.has('KeyW')?1:0) + (player.keys.has('KeyS')?-1:0);
      weaponView.setMove(x, y);
      const sprinting = player.keys.has('ShiftLeft') || player.keys.has('ShiftRight');
      weaponView.setSprint(sprinting ? 1 : 0);
      // ADS: right mouse button not tracked here; leave default 0. We can add a listener later if needed.
      weaponView.update(dt);
    } catch (e) { logError(e); }
    // Update stamina HUD every frame
    if (player && typeof player.getStamina01 === 'function') {
      const stats = getPlayerHudStats(session, player);
      const pct = stats.stamina01;
      setWidthIfChanged(staminaBarEl, `${(pct*100).toFixed(1)}%`);
      paintStamBlocks(pct);
      setTextIfChanged(staminaValueEl, Math.floor(stats.stamina));
      setTextIfChanged(staminaMaxValueEl, Math.floor(stats.maxStamina));
      updateAbilityHUD();
    }
    // Fatigue visuals + breath SFX when low stamina
    if (effects && typeof effects.setFatigue === 'function' && player && typeof player.getStamina01 === 'function'){
      const s01 = player.getStamina01();
      // Map low stamina to fatigue: start at <= 0.3, max at 0
      const fatigue = Math.max(0, Math.min(1, (0.3 - s01) / 0.3));
      effects.setFatigue(fatigue);
      // Breath SFX gating
      if (S && S.startBreath && S.stopBreath){
        if (fatigue > 0.05){
          S.startBreath();
          if (S._breath && typeof S._breath.setExhausted === 'function') S._breath.setExhausted(fatigue);
        } else {
          S.stopBreath();
        }
      }
    }

    if (debugPerf) {
      const phaseNow = performance.now();
      currentPhaseTiming.playerSimulationMs = roundedMs(phaseNow - phaseMark);
      phaseMark = phaseNow;
    }

    // enemies AI
    const fo = controls.getObject();
    fo.userData.combatHp = session.hp;
    fo.userData.combatMaxHp = session.maxHp;
    enemyManager.tickAI(fo, dt, (damage, source, attribution = {})=>{
      const damageResult = applyPlayerDamage(damage, source || 'enemy', { bypassArmor: !!attribution.bypassArmor });
      if (damageResult.died) S.hurt();
      // VFX for all hits; for melee, pulse at a small cooldown with a stronger bump for readability
      if (!damageResult.ignored && effects && typeof effects.onPlayerHit === 'function') {
        if (source === 'melee') {
          if (lastMeleeVfxAt < 0 || (gameTime - lastMeleeVfxAt) >= MELEE_VFX_COOLDOWN) {
            const boosted = Math.max(damage, 6);
            effects.onPlayerHit(boosted);
            lastMeleeVfxAt = gameTime;
          }
        } else {
          effects.onPlayerHit(damage);
        }
      }
      if (!damageResult.ignored && source === 'melee') {
        if (lastMeleeSfxAt < 0 || (gameTime - lastMeleeSfxAt) >= MELEE_SFX_COOLDOWN) {
          S.hit();
          lastMeleeSfxAt = gameTime;
        }
      }
      updateHUD();
      // Low HP trigger for story
      try { if (session.hp <= 25) story?.onLowHp?.(); } catch (e) { logError(e); }
    });

    if (debugPerf) {
      const phaseNow = performance.now();
      currentPhaseTiming.enemyAiMs = roundedMs(phaseNow - phaseMark);
      phaseMark = phaseNow;
    }

    // legacy tracers removal (if any left around)
    for(let i=tracers.length-1;i>=0;i--){ const obj = tracers[i]; obj.userData.life += dt; if(obj.isLine){ obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.12); if(obj.userData.life>0.12){ scene.remove(obj); tracers.splice(i,1); } } else { obj.scale.multiplyScalar(1 + dt*10); if(obj.material.opacity===undefined){ obj.material.transparent=true; obj.material.opacity=1; } obj.material.opacity = Math.max(0, 1 - obj.userData.life/0.25); if(obj.userData.life>0.25){ scene.remove(obj); tracers.splice(i,1); } } }
    // effects update
    effects.update(dt);

    // pickups update (magnet + animation)
    pickups.update(dt, controls.getObject().position, (type, amount, where) => {
      let healAmount = 0;
      if (type === 'ammo') {
        let pickupResult = null;
        try { pickupResult = session.applyPickup(type, amount, { weaponSystem }); } catch (e) { logError(e); }
        showPickupToast(type, pickupResult?.amount ?? 0);
      }
      else if (type === 'med') {
        const hpBefore = session.hp;
        let pickupResult = null;
        try { pickupResult = session.applyPickup(type, amount, { story, sfx: S }); } catch (e) { logError(e); }
        healAmount = Math.max(0, session.hp - hpBefore);
        showPickupToast(type, pickupResult?.amount ?? healAmount);
      }
      updateHUD();
      achievements.check({ type: 'pickup', pickupType: type, healAmount });
      tutorial.onPickup?.(type);
    });

    // Emergency ammo assistance: if player has no ammo (mag + reserve) and there are
    // at most 1 ammo pickup on the map, drop 3 at center to prevent softlocks
    try {
      if (weaponSystem && pickups && pickups.active) {
        const center = new THREE.Vector3(0, 0, 0);
        const drops = session.getEmergencyAmmoDrops({ weaponSystem, pickups, gameTime });
        for (const off of drops) { pickups.spawn('ammo', center.clone().add(new THREE.Vector3(off.x, off.y, off.z))); }
      }
    } catch (e) { logError(e); }

    // Obstacles update (reserved for future moving obstacles)
    obstacleManager.update(dt);

    // weapon system update (auto fire pacing)
    if (weaponSystem) weaponSystem.update(dt);
    if (abilitySystem) {
      abilitySystem.update(dt);
      updateAbilityHUD();
    }

    // Crosshair bloom visualization
    if (crosshairEl && weaponSystem) {
      const bloom = weaponSystem.getCurrentBloom01 ? weaponSystem.getCurrentBloom01() : 0;
      const prof = weaponSystem.getCrosshairProfile ? weaponSystem.getCrosshairProfile() : { baseScale:1, minAlpha:0.6, k:0.8, thickPx:2 };
      const scale = (prof.baseScale + bloom * prof.k).toFixed(3);
      const alpha = (prof.minAlpha + bloom * 0.25);
      const alphaText = alpha.toFixed(3);
      const thickness = `${prof.thickPx|0}px`;
      const gap = (prof.gapPx + bloom * (prof.gapPx * 0.9)).toFixed(2);
      const len = (prof.lenPx + bloom * (prof.lenPx * 0.6)).toFixed(2);
      const rotation = typeof prof.rotDeg === 'number' ? `${prof.rotDeg}deg` : '0deg';
      const tint = bloom < 0.05 ? '#16a34a' : 'var(--ui)';
      const signature = `${scale}|${alphaText}|${thickness}|${gap}|${len}|${rotation}|${tint}`;
      if (signature !== lastCrosshairSignature) {
        lastCrosshairSignature = signature;
        crosshairEl.style.setProperty('--xh-scale', scale);
        crosshairEl.style.setProperty('--xh-alpha', alphaText);
        crosshairEl.style.setProperty('--xh-thick', thickness);
        crosshairEl.style.setProperty('--xh-gap', `${gap}px`);
        crosshairEl.style.setProperty('--xh-len', `${len}px`);
        crosshairEl.style.setProperty('--xh-rot', rotation);
        crosshairEl.style.setProperty('--xh', tint);
      }
    }

    if (debugPerf) {
      const phaseNow = performance.now();
      currentPhaseTiming.effectsPickupsMs = roundedMs(phaseNow - phaseMark);
      phaseMark = phaseNow;
    }

    // Weather update (uses gameTime so it freezes cleanly when paused)
    weather.update(gameTime, controls.getObject());
    wave72Visuals.update();

    // Update grass appearance based on precipitation and wind
    if (grassMesh && grassMesh.material && grassMesh.material.uniforms) {
      const rainMix = weather._mix?.rain || 0;
      const snowMix = weather._mix?.snow || 0;
      const heightFactor = Math.max(0.2, 1 - 0.3 * rainMix - 0.6 * snowMix);

      const windMix = Math.max(weather._mix?.wind || 0, weather._mix?.sand || 0);
      const wind = weather.wind || { x: 1, z: 0 };
      updateGrassWeatherMotion(grassWeatherMotion, {
        time: gameTime,
        dt,
        stormMix: windMix,
        rainMix,
        snowMix,
        rng: grassWeatherRng
      });
      applyGrassWeatherUniforms(grassMesh.material, grassWeatherMotion, {
        baseWindX: wind.x,
        baseWindZ: wind.z,
        heightFactor,
        snowMix
      });
    }

    // Feed music mood from weather for subtle DNA
    try {
      const mode = weather.mode || 'clear';
      const fogMix = (weather._mix?.fog) || (mode.includes('fog') ? 1 : 0);
      const rainMix = (weather._mix?.rain) || (mode.includes('rain') ? 1 : 0);
      const sandMix = (weather._mix?.sand) || (mode.includes('sand') ? 1 : 0);
      // Darker pads and softer hats in fog/rain/sand
      const hatCut = 6000 - 1800 * Math.min(1, (fogMix * 0.6 + rainMix * 0.4 + sandMix * 0.7));
      const padBright = 2000 - 600 * Math.min(1, fogMix + sandMix) + 300 * Math.min(1, rainMix);
      music.hatCutoffHz = Math.max(2200, hatCut|0);
      music.padBaseBrightnessHz = Math.max(1200, padBright|0);
      if (typeof music.setMood === 'function') music.setMood({ fog: fogMix, rain: rainMix, sand: sandMix });
    } catch (e) { logError(e); }
  }

  // Drive subtle cloud motion (frozen while paused because gameTime doesn't advance)
  skyMat.uniforms.time.value = gameTime;

  // combo decay + HUD bar update
  if (combo.decayTimer > 0) {
    if (openingActComboHold > 0) openingActComboHold = Math.max(0, openingActComboHold - dt);
    else session.decayCombo(dt);
    if (comboBarEl) {
      const pct = Math.max(0, Math.min(1, combo.decayTimer / comboCfg.decayTime));
      comboBarEl.style.width = `${(pct*100).toFixed(1)}%`;
    }
    if (combo.decayTimer <= 0) { resetCombo(); }
  }

  // Music energy follows combo tier smoothly
  music.setEnergy(combo.tier);

  // If a boss is active, ramp boss intensity based on boss HP (lower HP = higher intensity)
  if (enemyManager && enemyManager.bossManager && enemyManager.bossManager.active && enemyManager.bossManager.boss && typeof music.setBossIntensity === 'function') {
    const bm = enemyManager.bossManager;
    const boss = bm.boss;
    const maxHp = bm._musicBossMaxHp || boss?.maxHp || boss?.root?.userData?.hp || 1;
    const hp = Math.max(0, Math.min(maxHp, boss?.root?.userData?.hp || maxHp));
    const intensity = Math.max(0, Math.min(1, 1 - (hp / maxHp)));
    music.setBossIntensity(intensity);
  }

  // Rotate track every N bars to keep variety (skip during boss theme)
  const isBossTrack = SONGS[currentSongIndex % SONGS.length]?.isBoss;
  if (!isBossTrack && music.barCounter > 0) {
    const barsSinceSwitch = lastSongRotateBar < 0 ? music.barCounter : (music.barCounter - lastSongRotateBar);
    if (barsSinceSwitch >= 32) {
      currentSongIndex = (currentSongIndex + 1) % SONGS.length;
      loadCurrentSong();
      lastSongRotateBar = music.barCounter;
    }
  }

  if (debugPerf) {
    const phaseNow = performance.now();
    currentPhaseTiming.weatherAudioMs = roundedMs(phaseNow - phaseMark);
    phaseMark = phaseNow;
  }

  // (pickups and weather are updated only while active in the gated block above)

  // Adaptive DPR update (EMA over frame interval)
  if (autoDpr) {
    _frameEmaMs = _frameEmaMs * 0.9 + elapsedMs * 0.1;
    if ((now - _lastDprAdjustAt) > 900) {
      const nextDpr = nextAdaptiveDpr(_dpr, _frameEmaMs, dprBudget);
      if (nextDpr !== _dpr) {
        const previousDpr = _dpr;
        _dpr = nextDpr;
        renderer.setPixelRatio(_dpr);
        _lastDprAdjustAt = now;
        if (debugPerf) perfLog.event('performance', 'dpr.changed', {
          from: previousDpr,
          to: _dpr,
          frameEmaMs: Math.round(_frameEmaMs * 10) / 10,
          reason: _dpr < previousDpr ? 'slow_frame_recovery' : 'available_headroom'
        });
      }
    }
  }

  if (debugPerf) {
    const phaseNow = performance.now();
    currentPhaseTiming.housekeepingMs = roundedMs(phaseNow - phaseMark);
    phaseMark = phaseNow;
  }

  if (!document.body.classList.contains('menu-background-active')) renderer.render(scene,camera);

  if (debugPerf) {
    const phaseNow = performance.now();
    currentPhaseTiming.renderMs = roundedMs(phaseNow - phaseMark);
    const info = renderer.info;
    const grassInstances = grassMesh?.geometry?.getAttribute?.('offset')?.count || 0;
    currentPhaseTiming.renderer.drawCalls = info?.render?.calls || 0;
    currentPhaseTiming.renderer.triangles = info?.render?.triangles || 0;
    currentPhaseTiming.renderer.shadowsEnabled = !!renderer.shadowMap?.enabled;
    currentPhaseTiming.renderer.shadowAutoUpdate = !!renderer.shadowMap?.autoUpdate;
    currentPhaseTiming.renderer.grassInstances = grassInstances;
    currentPhaseTiming.renderer.grassVisible = grassMesh?.visible !== false;
    currentPhaseTiming.renderer.grassFrustumCulled = grassMesh?.frustumCulled !== false;
    currentPhaseTiming.renderer.viewportPixels = Math.round(window.innerWidth * window.innerHeight * _dpr * _dpr);
    if (movementRenderProbe) {
      movementRenderProbe.afterFrame({
        renderMs: currentPhaseTiming.renderMs,
        drawCalls: currentPhaseTiming.renderer.drawCalls,
        triangles: currentPhaseTiming.renderer.triangles
      });
    }
    currentPhaseTiming.measuredWorkMs = roundedMs(
      currentPhaseTiming.playerSimulationMs + currentPhaseTiming.enemyAiMs +
      currentPhaseTiming.effectsPickupsMs + currentPhaseTiming.weatherAudioMs +
      currentPhaseTiming.housekeepingMs + currentPhaseTiming.renderMs
    );
    if (hasPreviousPhaseTiming) {
      previousPhaseTiming.intervalMs = roundedMs(elapsedMs);
      previousPhaseTiming.unattributedMs = roundedMs(elapsedMs - previousPhaseTiming.measuredWorkMs);
    }
    const playerObject = controls.getObject();
    motionLog.observe(
      now,
      gameplayActive,
      enemyManager.wave,
      session.score,
      playerObject.position.x,
      playerObject.position.y,
      playerObject.position.z,
      camera.rotation.y,
      camera.rotation.x
    );
    const effectPoolObjects =
      (effects._tracerPool?.active?.length || 0) + (effects._tracerPool?.free?.length || 0) +
      (effects._flashPool?.active?.length || 0) + (effects._flashPool?.free?.length || 0) +
      (effects._ringPool?.active?.length || 0) + (effects._ringPool?.free?.length || 0);
    perfLog.observeFrame({
      nowMs: now,
      frameMs: elapsedMs,
      active: gameplayActive,
      visible: document.visibilityState !== 'hidden',
      dpr: _dpr,
      drawCalls: info?.render?.calls || 0,
      triangles: info?.render?.triangles || 0,
      textures: info?.memory?.textures || 0,
      geometries: info?.memory?.geometries || 0,
      programs: info?.programs?.length || 0,
      sceneObjects: scene.children?.length || 0,
      effectPoolObjects,
      enemies: enemyManager.instances?.size || 0,
      projectiles: (enemyManager._bulletPools?.shooter?.count || 0) + (enemyManager._bulletPools?.sniper?.count || 0),
      effects: (effects._alive?.length || 0) + (effects._tracerPool?.active?.length || 0) + (effects._flashPool?.active?.length || 0) + (effects._ringPool?.active?.length || 0),
      pickups: pickups.active?.size || 0,
      wave: enemyManager.wave,
      weather: weather.mode,
      paused,
      phaseTimings: hasPreviousPhaseTiming ? previousPhaseTiming : null
    });
    hasPreviousPhaseTiming = true;
    phaseTimingIndex = 1 - phaseTimingIndex;
  }

  // Debug counters ~5Hz
  if (debugPerf && (!step._dbg || !step._dbg.t || (now - step._dbg.t) > 200)) {
    step._dbg = step._dbg || {}; step._dbg.t = now;
    const info = renderer.info;
    if (info && dbgCallsEl) {
      const calls = (info.render && info.render.calls) || 0;
      const tris = (info.render && info.render.triangles) || 0;
      const tex = (info.memory && info.memory.textures) || 0;
      dbgCallsEl.textContent = `Calls: ${calls}  Tris: ${tris}  Tex: ${tex}`;
    }
  }
  requestAnimationFrame(step);
}
requestAnimationFrame(step);

// ------ UI / Flow ------
const panel = document.getElementById('panel');
const playBtn = document.getElementById('play');
const tutorialBtn = document.getElementById('tutorialBtn');
const pauseMenu = document.getElementById('pauseMenu');
const defeatMenu = document.getElementById('defeatMenu');
const archiveMenu = document.getElementById('archiveMenu');
const openArchiveBtn = document.getElementById('openArchive');
const archiveMenuBalance = document.getElementById('archiveMenuBalance');
const archiveBalance = document.getElementById('archiveBalance');
const archiveGrid = document.getElementById('archiveGrid');
const archiveBack = document.getElementById('archiveBack');
const defeatRetry = document.getElementById('defeatRetry');
const defeatArchive = document.getElementById('defeatArchive');
const defeatMain = document.getElementById('defeatMain');
const defeatWave = document.getElementById('defeatWave');
const defeatScore = document.getElementById('defeatScore');
const defeatFragmentsEarned = document.getElementById('defeatFragmentsEarned');
const defeatFragmentsTotal = document.getElementById('defeatFragmentsTotal');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestart = document.getElementById('pauseRestart');
const pauseMain = document.getElementById('pauseMain');
const pauseWave = document.getElementById('pauseWave');
const pauseScore = document.getElementById('pauseScore');
const openSettingsBtn = document.getElementById('openSettings');
const pauseSettingsBtn = document.getElementById('pauseSettings');
const settingsMenu = document.getElementById('settingsMenu');
const settingsBack = document.getElementById('settingsBack');
const resetStoredDataBtn = document.getElementById('resetStoredData');
const resetDataDialog = document.getElementById('resetDataDialog');
const confirmResetStoredDataBtn = document.getElementById('confirmResetStoredData');
const openAchievementsBtn = document.getElementById('openAchievements');
const pauseAchievementsBtn = document.getElementById('pauseAchievements');
const achievementsMenu = document.getElementById('achievementsMenu');
const achievementsBack = document.getElementById('achievementsBack');
const achievementsClose = document.getElementById('achievementsClose');
const achievementsGrid = document.getElementById('achievementsGrid');
const achievementsTotal = document.getElementById('achievementsTotal');
const achievementsSummary = document.getElementById('achievementsSummary');
const achievementsProgress = document.getElementById('achievementsProgress');
const openDebugLogBtn = document.getElementById('openDebugLog');
const pauseDebugLogBtn = document.getElementById('pauseDebugLog');
const debugLogMenu = document.getElementById('debugLogMenu');
const debugLogStream = document.getElementById('debugLogStream');
const debugLogCount = document.getElementById('debugLogCount');
const debugLogStatus = document.getElementById('debugLogStatus');
const debugLogCopy = document.getElementById('debugLogCopy');
const debugLogClear = document.getElementById('debugLogClear');
const debugLogBack = document.getElementById('debugLogBack');
let settingsReturn = 'panel';
let achievementsReturn = 'panel';
let debugLogReturn = 'panel';
let archiveReturn = 'start';
let debugLogRenderTimer = null;

function showMenuView(view){
  document.body.classList.add('menu-open');
  panel.style.display = view === 'start' ? '' : 'none';
  pauseMenu.style.display = view === 'pause' ? '' : 'none';
  if (defeatMenu) defeatMenu.style.display = view === 'defeat' ? '' : 'none';
  if (archiveMenu) archiveMenu.style.display = view === 'archive' ? '' : 'none';
  settingsMenu.style.display = view === 'settings' ? '' : 'none';
  achievementsMenu.style.display = view === 'achievements' ? '' : 'none';
  debugLogMenu.style.display = view === 'debugLog' ? '' : 'none';
  panel.parentElement.style.display = 'flex';
}

function hideMenuView(){
  menuBackground?.hide();
  document.body.classList.remove('menu-open');
  panel.style.display = '';
  pauseMenu.style.display = 'none';
  if (defeatMenu) defeatMenu.style.display = 'none';
  if (archiveMenu) archiveMenu.style.display = 'none';
  settingsMenu.style.display = 'none';
  achievementsMenu.style.display = 'none';
  debugLogMenu.style.display = 'none';
  panel.parentElement.style.display = 'none';
}

function updateArchiveAvailability(){
  const state = mutations.getPersistentState();
  if (openArchiveBtn) openArchiveBtn.style.display = state.revealed ? '' : 'none';
  if (archiveMenuBalance) archiveMenuBalance.textContent = `◆ ${state.fragments}`;
  if (archiveBalance) archiveBalance.textContent = String(state.fragments);
}

function renderArchive(){
  if (!archiveGrid) return;
  const state = mutations.getPersistentState();
  if (archiveBalance) archiveBalance.textContent = String(state.fragments);
  const fragment = document.createDocumentFragment();

  const appendSectionTitle = (key) => {
    const heading = document.createElement('h3');
    heading.className = 'archive-section-title';
    heading.textContent = t(key);
    fragment.appendChild(heading);
  };

  const appendClassifiedCard = (def) => {
    const revealed = mutations.isWeaponRevealed(def.id);
    const owned = mutations.isWeaponOwned(def.id);
    const equipped = def.tacticalSlot && mutations.getEquippedTactical?.() === def.id;
    const card = document.createElement('article');
    card.className = `archive-card classified-card${revealed ? ' is-revealed' : ' is-classified'}${owned ? ' is-unlocked' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = owned ? t('archive.unlocked') : revealed ? `${def.cost} в—†` : t('classified.status.hidden');
    const name = document.createElement('h3');
    name.textContent = revealed ? t(def.nameKey) : t('classified.hidden.name');
    const description = document.createElement('p');
    description.textContent = revealed ? t(def.descriptionKey) : t(def.revealKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress classified-progress';
    progress.textContent = owned
      ? t(def.tacticalSlot ? 'classified.progress.tacticalReady' : 'classified.progress.armoryReady')
      : revealed ? t('classified.progress.revealed') : t('classified.progress.hidden');
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = !revealed || (owned ? !def.tacticalSlot || equipped : state.fragments < def.cost);
    action.textContent = owned
      ? t(equipped ? 'archive.equipped' : def.tacticalSlot ? 'archive.equip' : 'archive.unlocked')
      : revealed ? `${t('archive.unlock')} В· ${def.cost} ${t('archive.fragments')}` : t('classified.status.hidden');
    action.onclick = () => {
      if (owned && def.tacticalSlot) {
        const equipResult = mutations.equipTactical(def.id);
        if (!equipResult.ok) return;
        weaponSystem?.ensureTacticalSlot?.(def.id);
        renderArchive();
        updateHUD();
        return;
      }
      const result = mutations.purchaseClassifiedWeapon(def.id);
      if (!result.ok) return;
      if (result.equippedTactical) weaponSystem?.ensureTacticalSlot?.(result.equippedTactical);
      renderArchive();
      updateArchiveAvailability();
      updateHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const appendMutationCard = (def) => {
    const unlocked = mutations.isUnlocked(def.id);
    const card = document.createElement('article');
    card.className = `archive-card${unlocked ? ' is-unlocked' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = unlocked ? t('archive.unlocked') : `${def.cost} ◆`;
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress';
    if (def.maxRank > 0) {
      const rank = mutations.getRank(def.id);
      progress.textContent = `${t('mutation.progress.runRank')} ${rank}/${def.maxRank} · ${rank === 0 ? t('mutation.progress.firstBoss') : t('mutation.progress.resets')}`;
    } else {
      progress.textContent = t('mutation.progress.permanentReady');
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = unlocked || state.fragments < def.cost;
    action.textContent = unlocked ? t('archive.unlocked') : `${t('archive.unlock')} · ${def.cost} ${t('archive.fragments')}`;
    action.onclick = () => {
      const result = mutations.purchase(def.id);
      if (!result.ok) return;
      renderArchive();
      updateArchiveAvailability();
      updateMobileAltButton();
      updateAbilityHUD();
      updateHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const appendAbilityCard = (def) => {
    const owned = mutations.isAbilityOwned(def.id);
    const equipped = owned && mutations.getEquippedAbility() === def.id;
    const card = document.createElement('article');
    card.className = `archive-card ability-card${owned ? ' is-unlocked' : ''}${equipped ? ' is-equipped' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = equipped ? t('archive.equipped') : owned ? t('archive.unlocked') : `${def.cost} ◆`;
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress ability-progress';
    progress.textContent = t('ability.archiveStats')
      .replace('{charges}', String(def.maxCharges))
      .replace('{cooldown}', String(def.cooldownSeconds));
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = equipped || (!owned && state.fragments < def.cost);
    action.textContent = owned
      ? t(equipped ? 'archive.equipped' : 'archive.equip')
      : `${t('archive.unlock')} · ${def.cost} ${t('archive.fragments')}`;
    action.onclick = () => {
      const result = owned ? mutations.equipAbility(def.id) : mutations.purchaseAbility(def.id);
      if (!result.ok) return;
      renderArchive();
      updateArchiveAvailability();
      updateAbilityHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const romanGrade = grade => ['0', 'I', 'II', 'III'][grade] || String(grade);
  const appendSurvivalCard = (def) => {
    const revealed = mutations.areSurvivalMutationsRevealed();
    const unlocked = mutations.isUnlocked(def.id);
    const card = document.createElement('article');
    card.className = `archive-card survival-card${unlocked ? ' is-unlocked is-maxed' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = unlocked
      ? t('archive.progressionUnlocked')
      : revealed ? `${def.cost} ◆` : t('archive.waveMilestone').replace('{wave}', String(SURVIVAL_UNLOCK_WAVE));
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress survival-progress';
    progress.textContent = unlocked
      ? t('mutation.progress.poolReady').replace('{rank}', String(def.maxRank))
      : revealed ? t('mutation.progress.poolPurchase').replace('{rank}', String(def.maxRank)) : t('mutation.progress.waveGate').replace('{wave}', String(SURVIVAL_UNLOCK_WAVE));
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = !revealed || unlocked || state.fragments < def.cost;
    action.textContent = unlocked
      ? t('archive.progressionUnlocked')
      : revealed ? `${t('archive.unlockProgression')} · ${def.cost} ${t('archive.fragments')}` : t('archive.waveMilestone').replace('{wave}', String(SURVIVAL_UNLOCK_WAVE));
    action.onclick = () => {
      const result = mutations.purchase(def.id);
      if (!result.ok) return;
      renderArchive();
      updateArchiveAvailability();
      updateHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const appendSpectacleCard = (def) => {
    const grade = mutations.getMutationGrade(def.id);
    const maxed = grade >= def.maxGrade;
    const cost = mutations.getMutationCost(def.id);
    const values = describeSpectacleGrade(def.id, grade);
    const current = values.localized ? t(values.current) : values.current;
    const next = values.localized ? t(values.next) : values.next;
    const card = document.createElement('article');
    card.className = `archive-card spectacle-card${grade > 0 ? ' is-unlocked' : ''}${maxed ? ' is-maxed' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = `${t('archive.grade')} ${romanGrade(grade)}/${romanGrade(def.maxGrade)}${maxed ? ` · ${t('archive.maxed')}` : ''}`;
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress spectacle-progress';
    progress.textContent = maxed ? `${current} · ${t('archive.maxed')}` : `${current} → ${next}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = maxed || state.fragments < cost;
    action.textContent = maxed ? t('archive.maxed') : `${t('archive.upgrade')} · ${cost} ${t('archive.fragments')}`;
    action.onclick = () => {
      const result = mutations.purchase(def.id);
      if (!result.ok) return;
      renderArchive();
      updateArchiveAvailability();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const appendMasteryCard = (def) => {
    const grade = mutations.getMasteryGrade(def.id);
    const maxed = grade >= def.maxGrade;
    const cost = mutations.getMasteryCost(def.id);
    const card = document.createElement('article');
    card.className = `archive-card mastery-card${grade > 0 ? ' is-unlocked' : ''}${maxed ? ' is-maxed' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = `${t('archive.grade')} ${romanGrade(grade)}/${romanGrade(def.maxGrade)}${maxed ? ` · ${t('archive.maxed')}` : ''}`;
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const values = describeWeaponMastery(def.id, grade);
    const current = values.localized ? t(values.current) : values.current;
    const next = values.localized ? t(values.next) : values.next;
    const unit = values.unit ? ` ${t(values.unit)}` : '';
    const progress = document.createElement('div');
    progress.className = 'archive-progress mastery-progress';
    progress.textContent = maxed
      ? `${current}${unit} · ${t('archive.maxed')}`
      : `${current} → ${next}${unit}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = maxed || state.fragments < cost;
    action.textContent = maxed ? t('archive.maxed') : `${t('archive.upgrade')} · ${cost} ${t('archive.fragments')}`;
    action.onclick = () => {
      const result = mutations.purchaseMastery(def.id);
      if (!result.ok) return;
      weaponSystem?.reset?.();
      renderArchive();
      updateArchiveAvailability();
      updateHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  appendSectionTitle('archive.category.classified');
  CLASSIFIED_WEAPON_DEFINITIONS.forEach(appendClassifiedCard);

  const survival = MUTATION_DEFINITIONS.filter(def => def.category === 'survival');
  if (survival.length) {
    appendSectionTitle('archive.category.survival');
    survival.forEach(appendSurvivalCard);
  }
  const spectacles = MUTATION_DEFINITIONS.filter(def => def.category === 'spectacle');
  if (spectacles.length) {
    appendSectionTitle('archive.category.spectacle');
    spectacles.forEach(appendSpectacleCard);
  }
  const discoveredMasteries = WEAPON_MASTERY_DEFINITIONS.filter(def => mutations.isWeaponProgressionAvailable(def.weaponId));
  if (discoveredMasteries.length) {
    appendSectionTitle('archive.category.weapons');
    discoveredMasteries.forEach(appendMasteryCard);
  }
  const weaponAbilities = MUTATION_DEFINITIONS.filter(def => def.category === 'ability' && (!def.weaponId || mutations.isWeaponProgressionAvailable(def.weaponId)));
  if (ABILITY_DEFINITIONS.length || weaponAbilities.length) {
    appendSectionTitle('archive.category.abilities');
    ABILITY_DEFINITIONS.forEach(appendAbilityCard);
    weaponAbilities.forEach(appendMutationCard);
  }
  archiveGrid.replaceChildren(fragment);
}

function openArchive(from = 'start'){
  archiveReturn = from;
  renderArchive();
  updateArchiveAvailability();
  showMenuView('archive');
}

function closeArchive(){
  showMenuView(archiveReturn === 'defeat' ? 'defeat' : 'start');
}

function renderAchievementsBoard(){
  if (!achievementsGrid) return;
  const collection = achievements.getCollection();
  const unlockedCount = collection.filter((item) => item.unlocked).length;
  const totalCount = collection.length;
  const fragment = document.createDocumentFragment();

  for (const item of collection) {
    const card = document.createElement('article');
    card.className = `achievement-card ${item.unlocked ? 'unlocked' : 'locked'}`;

    const badge = document.createElement('div');
    badge.className = 'achievement-card-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = item.badge;

    const copy = document.createElement('div');
    copy.className = 'achievement-card-copy';
    const name = document.createElement('div');
    name.className = 'achievement-card-name';
    name.textContent = item.title;
    const description = document.createElement('div');
    description.className = 'achievement-card-desc';
    description.textContent = item.description;
    copy.append(name, description);
    if (item.progressLabel) {
      const progress = document.createElement('div');
      progress.className = 'achievement-card-progress';
      const progressTrack = document.createElement('span');
      progressTrack.className = 'achievement-card-progress-track';
      const progressFill = document.createElement('i');
      progressFill.style.width = `${Math.max(0, Math.min(1, item.progressRatio || 0)) * 100}%`;
      progressTrack.appendChild(progressFill);
      const progressLabel = document.createElement('span');
      progressLabel.className = 'achievement-card-progress-label';
      progressLabel.textContent = item.progressLabel;
      progress.append(progressTrack, progressLabel);
      copy.appendChild(progress);
    }

    const state = document.createElement('div');
    state.className = 'achievement-card-state';
    state.textContent = t(item.unlocked ? 'achievements.unlocked' : 'achievements.locked');

    card.append(badge, copy, state);
    fragment.appendChild(card);
  }

  achievementsGrid.replaceChildren(fragment);
  if (achievementsTotal) achievementsTotal.textContent = `${unlockedCount} / ${totalCount}`;
  if (achievementsSummary) {
    achievementsSummary.textContent = t('achievements.summary')
      .replace('{unlocked}', String(unlockedCount))
      .replace('{total}', String(totalCount));
  }
  if (achievementsProgress) achievementsProgress.style.width = `${totalCount ? (unlockedCount / totalCount) * 100 : 0}%`;
}

function openAchievements(from){
  achievementsReturn = from;
  renderAchievementsBoard();
  showMenuView('achievements');
}

function closeAchievements(){
  showMenuView(achievementsReturn === 'pause' ? 'pause' : 'start');
}

function openSettings(from){
  settingsReturn = from;
  showMenuView('settings');
}

function closeSettings(){
  showMenuView(settingsReturn === 'pause' ? 'pause' : 'start');
}

function openResetDataDialog(){
  if (!resetDataDialog) return;
  resetDataDialog.showModal();
}

function resetStoredData(){
  try { localStorage.clear(); } catch (e) { logError(e); }
  try { sessionStorage.clear(); } catch (e) { logError(e); }
  window.location.reload();
}

function renderDebugLog(){
  if (!debugPerf || !debugLogStream) return;
  const events = perfLog.getEvents();
  const distanceFromBottom = debugLogStream.scrollHeight - debugLogStream.scrollTop - debugLogStream.clientHeight;
  const followTail = distanceFromBottom < 32;
  debugLogStream.textContent = events.length
    ? events.map(formatDiagnosticEvent).join('\n')
    : t('debugLog.empty');
  if (debugLogCount) debugLogCount.textContent = `${events.length} ${t('debugLog.events')}`;
  if (followTail) debugLogStream.scrollTop = debugLogStream.scrollHeight;
}

function scheduleDebugLogRender(){
  if (!debugPerf || debugLogMenu?.style.display === 'none' || debugLogRenderTimer) return;
  debugLogRenderTimer = setTimeout(() => {
    debugLogRenderTimer = null;
    renderDebugLog();
  }, 120);
}

function openDebugLog(from){
  if (!debugPerf) return;
  debugLogReturn = from;
  if (debugLogStatus) debugLogStatus.textContent = '';
  perfLog.event('debug', 'log_opened', { from });
  showMenuView('debugLog');
  renderDebugLog();
}

function closeDebugLog(){
  showMenuView(debugLogReturn === 'pause' ? 'pause' : 'start');
}

async function copyDebugLog(){
  if (!debugPerf) return;
  debugEnvironment = collectDebugEnvironment({
    renderer,
    params,
    version: APP_VERSION_LABEL,
    seed,
    quality: getString(QUALITY_KEY, savedQuality)
  });
  const report = perfLog.exportReport(debugEnvironment);
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      copied = true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = report;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand('copy');
      textarea.remove();
    }
  } catch (error) {
    perfLog.event('error', 'diagnostic_copy_failed', { error }, 'warning');
  }
  if (debugLogStatus) debugLogStatus.textContent = t(copied ? 'debugLog.copied' : 'debugLog.copyFailed');
}

if (debugPerf) perfLog.subscribe(scheduleDebugLogRender);

function reset(isTutorial = false){ // clear enemies
  currentRunTutorial = isTutorial === true;
  mutations.resetRun({ tutorial: currentRunTutorial, debug: hasDebugWaveOverride });
  eliminationSpectacle.reset();
  algorithmRoulette.reset();
  stagecraftDeaths.reset();
  openingActComboHold = 0;
  document.querySelectorAll('.stage-cue').forEach(cue => cue.remove());
  progression?.resetRun?.();
  weaponSystem?.resetRunInventory?.({ tutorial: currentRunTutorial });
  abilitySystem?.reset?.();
  if (!currentRunTutorial && hasDebugWaveOverride) abilitySystem?.setDebugAbility?.(params.get('ability') || 'dynamite');
  gameOverLogged = false;
  if (debugPerf) perfLog.event('game', 'reset', { tutorial: isTutorial, previousWave: enemyManager.wave });
  if (debugPerf) {
    gameplayLog.reset();
    motionLog.reset();
    debugWaveBaseline = null;
    debugRunStartedAt = gameTime;
  }
  stopSuno();
  pickups.resetAll();
  paused=false;
  session.reset({ weaponSystem, player, effects, sfx: S });
  if (!isTutorial && hasDebugWaveOverride) weaponSystem.setDebugWaveLoadout();
  achievements.check({ type: 'runStart', mode: isTutorial ? 'tutorial' : 'standard' });
  const prevSuspend = enemyManager.suspendWaves;
  if (isTutorial) enemyManager.suspendWaves = true;
  enemyManager.reset({ wave: isTutorial ? 1 : debugStartWave });
  if (isTutorial) enemyManager.suspendWaves = prevSuspend;
  pickups.onWave(enemyManager.wave);
  updateHUD();
  if (debugPerf) {
    const plannedTotals = debugWaveBaseline?.totals || {};
    debugWaveBaseline = { ...captureGameplayState(), totals: plannedTotals, wave: enemyManager.wave };
    perfLog.event('gameplay', 'run_ready', {
      tutorial: isTutorial,
      wave: enemyManager.wave,
      weapon: debugWaveBaseline.weapon,
      magazine: debugWaveBaseline.magazine,
      reserve: debugWaveBaseline.reserve,
      hp: debugWaveBaseline.hp
    });
  }
  if (!isTutorial && relayLevel.active && relayLevel.playerSpawn) {
    player.resetPosition(...relayLevel.playerSpawn);
    player.yawObject.rotation.y = 0;
  } else if (levelInfo && levelInfo.playerSpawn) {
    player.resetPosition(levelInfo.playerSpawn.x, levelInfo.playerSpawn.y, levelInfo.playerSpawn.z);
  } else {
    player.resetPosition(0,1.7,8);
  }
  // Refill stamina on reset
  try { player.stamina = player.staminaMax; } catch (e) { logError(e); }
  try { effects.setFatigue(0); } catch (e) { logError(e); }
  try { S.stopBreath(); } catch (e) { logError(e); }
  try {
    story?.reset();
    if (!isTutorial) story?.startRun();
  } catch (e) { logError(e); }
}

function hideCombatHelp(){
  const help = document.getElementById('desktopHelp');
  if (!help || help.classList.contains('hidden')) return;
  help.classList.add('hidden');
  setTimeout(() => { help.style.display = 'none'; }, 700);
}

function startGame(){
  if (debugPerf) perfLog.event('game', 'start', { mode: 'standard' });
  enemyManager.suspendWaves = false;
  if (isMobile) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try { if (req) req.call(el); } catch (e) { logError(e); }
  } else {
    controls.lock();
  }
  hideCombatHelp();
  hideMenuView();
  if (currentMap?.name === 'tutorial') {
    currentMap = null;
    levelInfo = null;
    enemyManager.customSpawnPoints = null;
    setArenaRadius(DEFAULT_ARENA_RADIUS);
    player.arenaRadius = DEFAULT_ARENA_RADIUS;
    enemyManager.setArenaRadius(DEFAULT_ARENA_RADIUS);
  }
  // Reload whichever map is active so each run starts fresh
  if (currentMap) {
    if (relayLevel.active) relayLevel.unload();
    levelInfo = obstacleManager.loadFromMap(currentMap, objects);
    cullGrassUnderObjects(grassMesh, objects);
    enemyManager.refreshColliders(objects);
    enemyManager.customSpawnPoints = levelInfo.enemySpawnPoints;
  } else if (relayDefaultEligible) {
    obstacleManager.clear();
    if (relayLevel.active) relayLevel.reset();
    else relayLevel.load(RELAY_DISTRICT);
    enemyManager.customSpawnPoints = null;
    levelInfo = null;
  } else {
    if (relayLevel.active) relayLevel.unload();
    obstacleManager.generate(seed, objects);
    cullGrassUnderObjects(grassMesh, objects);
    enemyManager.refreshColliders(objects);
    levelInfo = null;
    enemyManager.customSpawnPoints = null;
  }
  reset();
  if (musicChoice === 'suno') { playSuno(); } else { music.start(); }
}

async function startTutorial(){
  if (debugPerf) perfLog.event('game', 'start', { mode: 'tutorial' });
  if (isMobile) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try { if (req) req.call(el); } catch (e) { logError(e); }
  } else {
    controls.lock();
  }
  hideCombatHelp();
  hideMenuView();
  enemyManager.suspendWaves = true;
  if (relayLevel.active) relayLevel.unload();
  try {
    const res = await fetch('assets/levels/tutorial.json');
    if (res.ok) {
      const map = await res.json();
      currentMap = map;
      levelInfo = obstacleManager.loadFromMap(map, objects);
      cullGrassUnderObjects(grassMesh, objects);
      enemyManager.refreshColliders(objects);
      enemyManager.customSpawnPoints = levelInfo.enemySpawnPoints;
    }
  } catch (e) { logError(e); }
  const tRadius = DEFAULT_ARENA_RADIUS / 3;
  setArenaRadius(tRadius);
  player.arenaRadius = tRadius;
  enemyManager.setArenaRadius(tRadius);
  reset(true);
  const spawns = levelInfo?.enemySpawnPoints || [];
  pickups.spawn('ammo', new THREE.Vector3(5,0,5));
  tutorial.start(spawns);
}

function showStartPanel(){
  settingsReturn = 'panel';
  updateArchiveAvailability();
  menuBackground?.show();
  showMenuView('start');
}

function showDefeatPanel(){
  if (currentRunTutorial) {
    showStartPanel();
    return;
  }
  const persistent = mutations.getPersistentState();
  const runState = mutations.getRunState();
  if (defeatWave) defeatWave.textContent = String(enemyManager?.wave || 1);
  if (defeatScore) defeatScore.textContent = String(Math.floor(session.score || 0));
  if (defeatFragmentsEarned) defeatFragmentsEarned.textContent = `+${runState.fragmentsEarned}`;
  if (defeatFragmentsTotal) defeatFragmentsTotal.textContent = String(persistent.fragments);
  updateArchiveAvailability();
  showMenuView('defeat');
}

function finishTutorial(){
  if (debugPerf) perfLog.event('game', 'tutorial_complete', { gameTimeSeconds: Math.round(gameTime * 10) / 10 });
  enemyManager.suspendWaves = false;
  session.gameOver = true;
  if (!isMobile) {
    try { controls.unlock(); } catch (e) { logError(e); }
  }
  currentMap = null;
  obstacleManager.clear();
  if (relayDefaultEligible) relayLevel.load(RELAY_DISTRICT);
  else obstacleManager.generate(seed, objects);
  cullGrassUnderObjects(grassMesh, objects);
  enemyManager.refreshColliders(objects);
  levelInfo = null;
  enemyManager.customSpawnPoints = null;
  setArenaRadius(DEFAULT_ARENA_RADIUS);
  player.arenaRadius = DEFAULT_ARENA_RADIUS;
  enemyManager.setArenaRadius(DEFAULT_ARENA_RADIUS);
  reset(true);
  showStartPanel();
}

tutorial.onEnd = finishTutorial;

function resumeGame(){
  hideMenuView();
  paused=false;
  if (debugPerf) perfLog.event('game', 'resume', { source: 'pause_menu' });
  controls.lock();
}

function showPauseMenu(source = 'system'){
  if (paused || session.gameOver) return;
  if (pauseWave) pauseWave.textContent = String(enemyManager?.wave || waveEl?.textContent || 1);
  if (pauseScore) pauseScore.textContent = String(Math.floor(session.score || 0));
  showMenuView('pause');
  paused=true;
  if (debugPerf) perfLog.event('game', 'pause', { source });
  resumeBtn?.focus();
}

function returnToMainMenu(){
  paused=true;
  if (debugPerf) perfLog.event('game', 'exit_to_main_menu', { source: 'pause_menu' });
  showStartPanel();
}

playBtn.onclick = startGame;
if (tutorialBtn) tutorialBtn.onclick = startTutorial;
if (openArchiveBtn) openArchiveBtn.onclick = () => openArchive('start');
if (defeatRetry) defeatRetry.onclick = startGame;
if (defeatArchive) defeatArchive.onclick = () => openArchive('defeat');
if (defeatMain) defeatMain.onclick = showStartPanel;
if (archiveBack) archiveBack.onclick = closeArchive;
if (resumeBtn) resumeBtn.onclick = resumeGame;
if (pauseRestart) pauseRestart.onclick = startGame;
if (pauseMain) pauseMain.onclick = returnToMainMenu;
if (openSettingsBtn) openSettingsBtn.onclick = ()=>openSettings('panel');
if (pauseSettingsBtn) pauseSettingsBtn.onclick = ()=>openSettings('pause');
if (settingsBack) settingsBack.onclick = closeSettings;
if (resetStoredDataBtn) resetStoredDataBtn.onclick = openResetDataDialog;
if (confirmResetStoredDataBtn) confirmResetStoredDataBtn.onclick = resetStoredData;
if (openAchievementsBtn) openAchievementsBtn.onclick = ()=>openAchievements('panel');
if (pauseAchievementsBtn) pauseAchievementsBtn.onclick = ()=>openAchievements('pause');
if (achievementsBack) achievementsBack.onclick = closeAchievements;
if (achievementsClose) achievementsClose.onclick = closeAchievements;
if (openDebugLogBtn) openDebugLogBtn.onclick = ()=>openDebugLog('panel');
if (pauseDebugLogBtn) pauseDebugLogBtn.onclick = ()=>openDebugLog('pause');
if (debugLogBack) debugLogBack.onclick = closeDebugLog;
if (debugLogCopy) debugLogCopy.onclick = copyDebugLog;
if (debugLogClear) debugLogClear.onclick = () => {
  perfLog.clear();
  renderDebugLog();
  if (debugLogStatus) debugLogStatus.textContent = t('debugLog.empty');
};
updateArchiveAvailability();
document.addEventListener('achievementUnlocked', () => {
  if (achievementsMenu?.style.display !== 'none') renderAchievementsBoard();
});

// Quality preset buttons: update URL params and reload
const qLow = document.getElementById('qLow');
const qMed = document.getElementById('qMed');
const qHigh = document.getElementById('qHigh');
const qUltra = document.getElementById('qUltra');
const qualityPresets = {
  low: { aa: 0, shadows: 0, autoDPR: 1, tone: 0, debug: 0 },
  med: { aa: 0, shadows: 0, autoDPR: 1, tone: 1, debug: 0 },
  high: { aa: 1, shadows: 1, autoDPR: 0, tone: 1, debug: 0 },
  ultra: { aa: 1, shadows: 1, autoDPR: 0, tone: 1, debug: 0 },
};
function highlightQuality(which){
  qLow?.classList.toggle('selected', which === 'low');
  qMed?.classList.toggle('selected', which === 'med');
  qHigh?.classList.toggle('selected', which === 'high');
  qUltra?.classList.toggle('selected', which === 'ultra');
}
highlightQuality(getString(QUALITY_KEY, null));
function setParams(obj){
  const u = new URL(window.location.href);
  Object.entries(obj).forEach(([k,v])=>{ if (v==null) u.searchParams.delete(k); else u.searchParams.set(k, String(v)); });
  if (debugPerf) u.searchParams.set('debug', '1');
  if (debugPerf) {
    perfLog.event('settings', 'quality_change_requested', { params: obj, targetUrlParams: Object.fromEntries(u.searchParams) });
    perfLog.flush();
  }
  window.location.href = `${u.pathname}?${u.searchParams.toString()}`;
}
if (qLow) qLow.onclick = () => {
  setString(QUALITY_KEY, 'low');
  highlightQuality('low');
  setParams(qualityPresets.low);
};
if (qMed) qMed.onclick = () => {
  setString(QUALITY_KEY, 'med');
  highlightQuality('med');
  setParams(qualityPresets.med);
};
if (qHigh) qHigh.onclick = () => {
  setString(QUALITY_KEY, 'high');
  highlightQuality('high');
  setParams(qualityPresets.high);
};
if (qUltra) qUltra.onclick = () => {
  setString(QUALITY_KEY, 'ultra');
  highlightQuality('ultra');
  setParams(qualityPresets.ultra);
};
if (startQuality && qualityPresets[startQuality]) {
  highlightQuality(startQuality);
  setParams(qualityPresets[startQuality]);
}

controls.addEventListener('unlock', ()=>{
  if (session.gameOver) {
    if (currentRunTutorial) showStartPanel();
    else showDefeatPanel();
  } else {
    showPauseMenu('pointer_unlock');
  }
});

window.addEventListener('blur', ()=>{
  if (!session.gameOver) showPauseMenu('window_blur');
});

document.addEventListener('visibilitychange', ()=>{
  if (document.visibilityState === 'hidden') achievements.save();
  if (debugPerf) perfLog.event('system', 'visibility_changed', { state: document.visibilityState });
  if (!session.gameOver) showPauseMenu('visibility_change');
});
window.addEventListener('pagehide', () => achievements.save());

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});

// Optional: pre-warm enemy assets to avoid first-spawn hitches
try {
  const prewarm = (new URL(window.location.href)).searchParams.get('prewarm') !== '0';
  if (prewarm) {
    const kinds = ['grunt', 'rusher', 'shooter', 'sniper', 'tank'];
    const base = new THREE.Vector3(0, 0.8, -60);
    for (let i=0;i<kinds.length;i++) {
      const pos = base.clone().add(new THREE.Vector3(i*2, 0, 0));
      const root = enemyManager.spawnAt(kinds[i], pos, { countsTowardAlive: false });
      scene.remove(root);
      enemyManager.remove(root);
    }
  }
} catch (e) { logError(e); }

// Pre-warm VFX pools
try { effects.prewarm({ tracers: 64, rings: 8 }); } catch (e) { logError(e); }

// ---- Hitmarker helpers ----
function showHitmarker(){
  if (!hitmarkerEl) return;
  hitmarkerEl.classList.remove('hitmarker-show');
  // force reflow
  hitmarkerEl.offsetHeight;
  hitmarkerEl.classList.add('hitmarker-show');
}
// Expose small API for weapons to indicate hit/kill/headshot if desired later
try { window._HUD = { showHitmarker }; } catch (e) { logError(e); }

// Ticker system
function showTicker(text, repeat = 1, interval = 8000){
  if (!tickerEl) return;
  const cycles = Math.max(1, repeat | 0);
  for (let i = 0; i < cycles; i++){
    tickerQueue = tickerQueue.then(() => new Promise(resolve => {
      const track = document.createElement('div');
      track.className = 'ticker-track';

      const item = document.createElement('span');
      item.className = 'ticker-item';
      item.textContent = text;
      track.appendChild(item);
      tickerEl.appendChild(track);

      const containerWidth = tickerEl.offsetWidth || window.innerWidth;
      const distance = track.offsetWidth + containerWidth;
      const baseSpeed = containerWidth / (interval/1000) / 2.5;
      const duration = distance / baseSpeed;
      track.style.animation = `tickerScroll ${duration}s linear`;

      track.addEventListener('animationend', () => {
        try { tickerEl.removeChild(track); } catch (e) { logError(e); }
        resolve();
      }, { once: true });
    }));
  }
}

// Toast system
function showToast(text){
  if (!toastsEl) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastsEl.appendChild(el);
  scheduleToastRemoval(el, 1500);
}

function scheduleToastRemoval(el, holdMs){
  if (!el) return;
  if (el._toastTimer) clearTimeout(el._toastTimer);
  if (el._toastRemoveTimer) clearTimeout(el._toastRemoveTimer);
  el._toastTimer = setTimeout(() => {
    el.classList.add('out');
    el._toastRemoveTimer = setTimeout(() => {
      try { el.remove(); } catch (e) { logError(e); }
    }, 240);
  }, holdMs);
}

function showPickupToast(type, amount){
  if (!toastsEl) return;
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if (value <= 0) return;
  const pickupType = type === 'ammo' ? 'ammo' : 'med';
  let el = toastsEl.querySelector(`.pickup-toast[data-pickup-type="${pickupType}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = `toast pickup-toast pickup-${pickupType}`;
    el.dataset.pickupType = pickupType;

    const icon = document.createElement('span');
    icon.className = 'pickup-icon';
    if (pickupType === 'ammo') {
      const img = document.createElement('img');
      img.src = WEAPON_ICON_MAP.SMG;
      img.alt = '';
      icon.appendChild(img);
    } else {
      const mark = document.createElement('span');
      mark.textContent = '+';
      mark.setAttribute('aria-hidden', 'true');
      icon.appendChild(mark);
    }

    const copy = document.createElement('span');
    copy.className = 'pickup-copy';
    const title = document.createElement('b');
    title.textContent = t(pickupType === 'ammo' ? 'pickup.ammo' : 'pickup.hp');
    const detail = document.createElement('small');
    detail.textContent = t(pickupType === 'ammo' ? 'pickup.reserve' : 'pickup.recovered');
    copy.append(title, detail);

    const valueEl = document.createElement('span');
    valueEl.className = 'pickup-value';
    el.append(icon, copy, valueEl);
    toastsEl.prepend(el);
  }
  el.classList.remove('out');
  const nextValue = Math.max(0, Number(el.dataset.pickupAmount) || 0) + value;
  el.dataset.pickupAmount = String(nextValue);
  const valueEl = el.querySelector('.pickup-value');
  if (valueEl) valueEl.textContent = `+${nextValue}`;
  scheduleToastRemoval(el, 1400);
}

try {
  if (window && window._HUD) {
    window._HUD.toast = (t)=> showToast(t);
    window._HUD.pickup = (type, amount)=> showPickupToast(type, amount);
    window._HUD.weaponPicker = ()=> showWeaponPicker();
    window._HUD.ticker = (t,r,i)=> showTicker(t,r,i);
    window._HUD.clearTicker = ()=> clearTicker();
  }
} catch (e) { logError(e); }

// Boss music transitions
if (enemyManager && enemyManager.bossManager) {
  const bm = enemyManager.bossManager;
  const originalStartBoss = bm.startBoss.bind(bm);
  bm.startBoss = (wave) => {
    if (debugPerf) perfLog.event('game', 'boss_start', { wave });
    if (musicChoice === 'suno') {
      playSunoBoss();
    } else {
      // Enter boss mode: duck base track and switch to boss song at bar boundary
      music.enterBossMode();
      // Apply per-boss profile
      let profile = { hatExtraDensity: 0.15, padBrightnessHz: 2200, toms: true, stingerTone: 1.0 };
      if (wave === 5) { // Broodmaker light
        profile = { ...profile, motifSemis: [0, -2, 0, -3], leadArpOverride: [0, 12, 7, 12], delayTimeOverride: 0.2 };
      } else if (wave === 10) { // Sanitizer
        profile = { ...profile, motifSemis: [2, 0, -2, 0], padBrightnessHz: 2600, delayTimeOverride: 0.17, stingerTone: 1.1 };
      } else if (wave === 15) { // Captain
        profile = { ...profile, motifSemis: [0, 5, 0, -5], leadArpOverride: [0, 7, 12, 19], delayTimeOverride: 0.19, stingerTone: 0.95 };
      } else if (wave === 20) { // Shard Avatar
        profile = { ...profile, motifSemis: [0, 3, 0, -2], padBrightnessHz: 2400, delayTimeOverride: 0.16, stingerTone: 1.2 };
      } else if (wave === 25) { // Broodmaker heavy
        profile = { ...profile, motifSemis: [0, -1, 0, -3], padBrightnessHz: 2300, delayTimeOverride: 0.18, stingerTone: 0.9 };
      } else if (wave === 40) { // The Algorithm
        profile = { ...profile, motifSemis: [0, 6, -1, 5], leadArpOverride: [0, 12, 6, 18], padBrightnessHz: 3000, delayTimeOverride: 0.13, stingerTone: 1.3 };
      }
      if (music.applyBossProfile) music.applyBossProfile(profile);
      music.playBossStinger({ tone: profile.stingerTone });
      currentSongIndex = SONGS.findIndex(s => s.id === 'boss-standoff');
      if (currentSongIndex < 0) currentSongIndex = 0;
      loadCurrentSong();
    }
    const bossCreateStartedAt = debugPerf ? performance.now() : 0;
    const bossResourceBaseline = debugPerf ? {
      geometries: renderer.info?.memory?.geometries || 0,
      programs: renderer.info?.programs?.length || 0
    } : null;
    const res = originalStartBoss(wave);
    if (res) {
      if (debugPerf) perfLog.event('performance', 'boss_instantiated', {
        wave,
        bossType: bm?.boss?.root?.userData?.type || 'boss',
        durationMs: roundedMs(performance.now() - bossCreateStartedAt),
        rendererBeforeFirstBossFrame: bossResourceBaseline
      });
      achievements.check({
        type: 'bossStart',
        wave,
        bossId: bm?.boss?.root?.userData?.bossId || bm?.boss?.root?.userData?.type || `boss_${wave}`,
        bossType: bm?.boss?.root?.userData?.type || 'boss'
      });
    }
    try { if (story) story.onBossStart(wave); } catch (e) { logError(e); }
    // Record boss max HP for intensity mapping
    try { bm._musicBossMaxHp = bm?.boss?.root?.userData?.hp || bm?.boss?.maxHp || 1; } catch (_) { bm._musicBossMaxHp = 1; }
    return res;
  };
  const originalOnBossDeath = bm._onBossDeath.bind(bm);
  bm._onBossDeath = () => {
    // Capture boss position before original handler clears references
    let dropPos = null;
    const bossType = bm?.boss?.root?.userData?.type || null;
    const bossId = bm?.boss?.root?.userData?.bossId || bossType || `boss_${bm?.wave || 0}`;
    const bossWave = bm?.wave || enemyManager.wave || 0;
    const hydraLineage = enemyManager?._ctx?.blackboard?.hydraLineages?.[bossId];
    achievements.check({
      type: 'bossDefeated',
      wave: bossWave,
      bossId,
      bossType,
      maxGeneration: Number(hydraLineage?.maxGeneration) || 0
    });
    try { dropPos = bm?.boss?.root?.position?.clone?.() || null; } catch (e) { logError(e); dropPos = null; }
    originalOnBossDeath();
    relayLevel.onBossDefeated(bossWave);
    if (debugPerf) perfLog.event('game', 'boss_defeated', { wave: bossWave, bossType });
    if (musicChoice === 'suno') {
      stopSuno();
      playSuno();
    } else {
      // Leave boss mode: restore main playlist and volume
      music.exitBossMode();
      if (music.applyBossProfile) music.applyBossProfile({ hatExtraDensity: 0.0, toms: false, motifSemis: null });
      if (music.setBossIntensity) music.setBossIntensity(0);
      // Advance to next non-boss track
      currentSongIndex = (currentSongIndex + 1) % SONGS.length;
      loadCurrentSong();
    }

    // Guaranteed boss drops: 1 ammo and 1 medkit
    try {
      if (dropPos && pickups && typeof pickups.spawn === 'function') {
        const p1 = dropPos.clone();
        const p2 = dropPos.clone();
        // Small offset so they don't overlap perfectly
        p1.x += 0.8; p2.x -= 0.8;
        pickups.spawn('ammo', p1);
        pickups.spawn('med', p2);
      }
    } catch (e) { logError(e); }

    try {
      const survivalWasRevealed = mutations.areSurvivalMutationsRevealed();
      mutations.onBossDefeated(bossWave, { session });
      if (!survivalWasRevealed && mutations.areSurvivalMutationsRevealed()) {
        showToast(t('mutation.progress.archiveUnlocked'));
      }
      updateHUD();
      progression?.onBossDefeated?.(bossWave);
    } catch (e) { logError(e); }
    try { if (story) story.onBossDeath(bm?.wave || 0); } catch (e) { logError(e); }
  };
}

// --- Boot editor after world init ---
if ((new URL(window.location.href)).searchParams.get('editor') === '1') {
  try { document.getElementById('hud').style.display = 'none'; } catch (e) { logError(e); }
  try { document.getElementById('center').style.display = 'none'; } catch (e) { logError(e); }
  try { music.stop?.(); } catch (e) { logError(e); }
  // Lazy import already done at top; just start
  import('./editor.js').then(mod => {
    try { mod.startEditor({ THREE, scene, camera, renderer, mats, objects }); } catch (e) { logError(e); }
  }).catch(e => { logError(e); });
}


