import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { WeatherSystem } from './weather.js?rev=sanitizer-atmosphere2';
import { createWorld, setArenaRadius, DEFAULT_ARENA_RADIUS } from './world.js?v=2&rev=relay-level1-final7';
import { makeSeededRng, makeNamespacedRng, generateSeedString } from './util/rng.js';
import { EnemyManager } from './enemies.js?v=1.0.7&rev=wave46-recovery1';
import { PlayerController } from './player.js?rev=collision7-ceiling1';
import { Effects, createEffectsShaderWarmupExtras } from './effects.js';
import { Pickups } from './pickups.js?rev=campaign-turbo-stability2';
import { ObstacleManager } from './obstacles/manager.js';
import { Music } from './music.js';
import { SFX } from './sfx.js';
import { SONGS } from './musicLibrary.js';
import { WeaponSystem } from './weapons/system.js?rev=smg-sidearm1';
import { WeaponView } from './weapons/view.js';
import { AbilitySystem } from './abilities/system.js?v=1.0.3&rev=ammo-rescue2';
import { ABILITY_DEFINITIONS, resolveDebugAbility } from './abilities/definitions.js?v=1.0.3-dynamite-grade2';
import { startEditor } from './editor.js';
import { Progression } from './progression.js?v=1.0.3&rev=continue-checkpoint1';
import {
  clonePrefab,
  loadAllModels,
  loadGeneratedModels,
  prewarmAllShaders,
  repairInvalidMaterialBuildHooks
} from '../loader.js?v=9&rev=level-transition1';
import { StoryManager } from './story.js?rev=story-narrative2';
import { t } from './i18n/index.js?v=1.0.3&rev=tutorial-complete1';
import { logError, setDiagnosticErrorSink } from './util/log.js';
import { cullGrassUnderObjects } from './graphics/grass.js';
import { AchievementsManager } from './achievements.js?v=1.0.3&rev=continue-checkpoint1';
import { TutorialManager } from './tutorial-manager.js?rev=blind-room11';
import { GameSession } from './game/session.js?rev=ammo-rescue2';
import { formatPlaytime, PlaytimeTracker } from './game/playtime.js';
import { createWaveStartHandler } from './game/wave-flow.js';
import {
  getCampaignCheckpoint,
  getCampaignCheckpointState,
  hasSavedCampaignProgress,
  isCampaignChapterStart,
  isCampaignComplete,
  markLastOrderComplete,
  recordCampaignChapterPosition,
  resetCampaignPosition,
  resolveSavedCampaignStartWave,
  saveCampaignCheckpointState
} from './game/campaign-checkpoint.js?rev=continue-checkpoint1';
import { getPlayerHudStats } from './game/hud-stats.js';
import { LevelTransitionController } from './game/level-transition.js?rev=1';
import { createDprBudget, nextAdaptiveDpr, scheduleCappedFrame, shouldPrewarmShaders, TARGET_FRAME_MS } from './game/render-budget.js';
import { createWave72Visuals } from './game/wave72-visuals.js';
import { AlgorithmRoulette, EliminationSpectacle, StagecraftDeaths } from './game/fun-events.js';
import { selectFinalCutVariant } from './game/final-cut-animations.js';
import { applyGrassWeatherUniforms, createGrassWeatherMotion, updateGrassWeatherMotion } from './game/grass-weather-motion.js';
import { getNumber, getString, setMaxNumber, setNumber, setString } from './util/storage.js';
import { clampSettingVolume, normalizeQuality, resolveAudioVolumes } from './settings.js';
import { APP_VERSION_LABEL } from './version.js?v=1.0.3';
import { collectDebugEnvironment, formatDiagnosticEvent, PerformanceEventLog } from './debug/performance-event-log.js';
import {
  buildCampaignCombatRepositionOrder,
  buildCombatFiringPositionCandidates,
  buildObjectiveAlignmentCandidates,
  buildPlayerRoute,
  campaignObjectiveTargetProgress,
  CampaignSimulationRecorder,
  DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS,
  DEFAULT_CAMPAIGN_BOSS_SUPPORT_MIN_TARGETS,
  DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS,
  DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS,
  evaluateCampaignLineOfFire,
  evaluateCampaignCombatStall,
  hasCampaignObjectiveProgressStalled,
  isCampaignObjectiveAlignmentActive,
  isCampaignObjectivePositionInside,
  isCampaignObjectiveRequiredKind,
  isCampaignProductionElimination,
  isCampaignProductionAimMismatch,
  isCampaignObjectiveTargetComplete,
  leashObjectivePosition,
  normalizeObjectivePosition,
  reconcileCampaignEliminationCount,
  seededPlayerStart,
  selectCampaignAreaSupportTarget,
  selectCampaignCombatTarget,
  shouldPrioritizeCampaignObjectiveHold,
  shouldPromoteProductionDiagnosticToCampaignError,
  shouldThrottleCampaignAIEvent,
  shouldTreatCampaignSpawnFailureAsError,
  shouldUseCampaignBossSupport,
  summarizeCampaignPerformanceEvents,
  summarizeRoster,
  validateCampaignSnapshot,
  validateWaveCompletion
} from './debug/campaign-simulation.js?rev=wave46-recovery1';
import { GameplayEventAggregator } from './debug/gameplay-event-aggregator.js';
import { MotionEventAggregator } from './debug/motion-event-aggregator.js';
import { MovementRenderProbe } from './debug/movement-render-probe.js';
import { BLOCK_BOX_CHANNEL_META, resolveBlockBoxChannels } from './debug/block-boxes.js';
import { getBossShaderWarmupExtras } from './bosses/visual-cache.js';
import { ArchiveMutations, CLASSIFIED_WEAPON_DEFINITIONS, describeSpectacleGrade, describeWeaponMastery, MUTATION_DEFINITIONS, resolveDebugShopCredits, SURVIVAL_UNLOCK_WAVE, WEAPON_MASTERY_DEFINITIONS } from './mutations.js?v=1.0.3&rev=smg-sidearm1';
import { sortArchiveItemsByCost } from './archive-order.js';
import { RELAY_DISTRICT, RELAY_DISTRICT_ASSET_IDS } from './levels/relay-district.js?rev=boss-health-packages1&ammo-rescue=2';
import { SANITIZER_SPIRE, SANITIZER_SPIRE_ASSET_IDS } from './levels/sanitizer-spire.js?rev=campaign-turbo-stability2&ammo-rescue=2';
import { AD_ZONE_ARENA, AD_ZONE_ARENA_ASSET_IDS } from './levels/ad-zone-arena.js?rev=boss-health-packages1&ammo-rescue=2';
import { TREND_WASTES, TREND_WASTES_ASSET_IDS } from './levels/trend-wastes.js?rev=boss-health-packages1&ammo-rescue=2';
import { FREIGHT_ANNEX, FREIGHT_ANNEX_ASSET_IDS } from './levels/freight-annex.js?rev=boss-health-packages1&ammo-rescue=2';
import { MIRROR_GARDEN, MIRROR_GARDEN_ASSET_IDS } from './levels/mirror-garden.js?rev=boss-health-packages1&ammo-rescue=2';
import { CONTENT_COURT, CONTENT_COURT_ASSET_IDS } from './levels/content-court.js?rev=boss-health-packages1&ammo-rescue=2';
import { SERVER_CATHEDRAL, SERVER_CATHEDRAL_ASSET_IDS } from './levels/server-cathedral.js?rev=cathedral-route-collision3&ammo-rescue=2';
import { LAST_ORDER_BASE, LAST_ORDER_BASE_ASSET_IDS } from './levels/last-order-base.js?rev=last-order-collisions1';
import { SANDSTORM_EXPANSE, SANDSTORM_EXPANSE_ASSET_IDS } from './levels/sandstorm-expanse.js?rev=expanse-level9-first1&ammo-rescue=3';
import { FLOODGATE_CONTINUITY, FLOODGATE_CONTINUITY_ASSET_IDS } from './levels/floodgate-continuity.js?rev=floodgate-level10-first1&ammo-rescue=3';
import { BLACKOUT_CISTERN, BLACKOUT_CISTERN_ASSET_IDS } from './levels/blackout-cistern.js?rev=boss-health-packages1&ammo-rescue=3';
import { TUTORIAL_YARD, TUTORIAL_YARD_ASSET_IDS } from './levels/tutorial-yard.js?rev=blind-room11&ammo-rescue=2';
import { isAuthoredCampaignWave } from './levels/campaign-range.js';
import { LevelRuntime } from './levels/runtime.js?rev=wave40-clear1';
import { destructiblesForLevel } from './levels/destructibles.js';
import { findPath } from './path.js?rev=campaign-turbo-stability2';
import { createMenuBackground, MENU_BACKGROUND_ASSET_IDS } from './menu-background.js';

function authoredLevelForWave(wave) {
  if (wave > 73) return null;
  if (wave >= 73) return BLACKOUT_CISTERN;
  if (wave >= 52) return FLOODGATE_CONTINUITY;
  if (wave >= 42) return SANDSTORM_EXPANSE;
  if (wave >= 41) return LAST_ORDER_BASE;
  if (wave >= 36) return SERVER_CATHEDRAL;
  if (wave >= 31) return CONTENT_COURT;
  if (wave >= 26) return MIRROR_GARDEN;
  if (wave >= 21) return FREIGHT_ANNEX;
  if (wave >= 16) return TREND_WASTES;
  if (wave >= 11) return AD_ZONE_ARENA;
  if (wave >= 6) return SANITIZER_SPIRE;
  return RELAY_DISTRICT;
}

const moduleStartedAt = performance.now();

// Prefer the flag set in index.html; fallback to media query
const isMobile = (typeof window !== 'undefined' && 'IS_MOBILE' in window && window.IS_MOBILE)
  ? !!window.IS_MOBILE
  : window.matchMedia?.('(pointer:coarse)').matches === true;

document.querySelectorAll('.appVersionValue').forEach(el => {
  el.textContent = APP_VERSION_LABEL;
});

const playtimeTracker = new PlaytimeTracker();
function updatePlaytimeDisplay() {
  const formatted = formatPlaytime(playtimeTracker.totalSeconds, document.documentElement.lang);
  document.querySelectorAll('.playtimeValue').forEach(el => {
    el.textContent = formatted;
  });
}
updatePlaytimeDisplay();
window.addEventListener('qoj:languagechange', updatePlaytimeDisplay);
window.addEventListener('pagehide', () => playtimeTracker.persist());

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
const qaSimulationMode = params.get('qaSimulation') === '1';
let qaSimulationTimeScale = 1;
const debugPerf = params.get('debug') === '1' || qaSimulationMode;
const SUPPORT_LOGS_KEY = 'bs3d_support_logs';
const supportLogsEnabled = getString(SUPPORT_LOGS_KEY, '0') === '1';
const diagnosticLogsEnabled = debugPerf || supportLogsEnabled;
const debugColliderChannels = resolveBlockBoxChannels(params);
const requestedDebugWave = debugPerf ? Math.floor(Number(params.get('wave'))) : 1;
const debugStartWave = Number.isFinite(requestedDebugWave)
  ? Math.max(1, Math.min(73, requestedDebugWave))
  : 1;
const hasDebugWaveOverride = debugPerf && params.has('wave') && debugStartWave > 1;
function resolveStandardStartWave() {
  if (hasDebugWaveOverride) return debugStartWave;
  return resolveSavedCampaignStartWave();
}
const initialRunStartWave = resolveStandardStartWave();
const debugAbilityId = debugPerf ? resolveDebugAbility(params) : null;
const debugShopCredits = debugPerf ? resolveDebugShopCredits(params) : null;
const movementProbeMode = params.get('moveProbe');
const movementProbeEnabled = debugPerf && (movementProbeMode === '1' || movementProbeMode === 'weapon');
const relayOverviewMode = params.get('relayView') === 'top';
const relayPlayerPreviewMode = params.get('relayView') === 'player';
const tutorialPreviewMode = params.get('tutorialView') === 'player';
const relayPreviewShot = params.get('relayShot');
const requestedRelayPreviewWave = Math.floor(Number(params.get('relayWave')));
const relayPreviewWave = Number.isFinite(requestedRelayPreviewWave)
  ? Math.max(1, Math.min(73, requestedRelayPreviewWave))
  : 1;
if (relayOverviewMode) document.body.classList.add('relay-overview');
if (relayPlayerPreviewMode) document.body.classList.add('relay-player-preview');
const QUALITY_KEY = 'bs3d_quality';
let startQuality = null;
const storedQuality = getString(QUALITY_KEY, null);
const savedQuality = normalizeQuality(storedQuality);
if (storedQuality && !['aa','shadows','tone','autoDPR'].some(k => params.has(k))) startQuality = savedQuality;
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

const perfLog = new PerformanceEventLog({
  enabled: diagnosticLogsEnabled,
  // The campaign recorder already owns the run timeline. Serializing the
  // secondary performance log into sessionStorage every few seconds creates a
  // needless main-thread spike during Turbo runs.
  persistenceEnabled: !qaSimulationMode
});
const gameplayLog = diagnosticLogsEnabled ? new GameplayEventAggregator({
  enabled: true,
  onBatch: batch => perfLog.event('gameplay', 'activity_batch', batch)
}) : null;
const motionLog = diagnosticLogsEnabled ? new MotionEventAggregator({
  enabled: true,
  onBatch: batch => perfLog.event(
    'gameplay',
    batch.metric === 'distanceMeters' ? 'movement_batch' : 'camera_batch',
    batch
  )
}) : null;
if (debugPerf) document.body.classList.add('debug-mode');
if (diagnosticLogsEnabled) {
  document.body.classList.add('diagnostic-logs-enabled');
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
    seed,
    mode: debugPerf ? 'debug' : 'support'
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
let pendingTransitionWaveStart = null;
const levelTransition = new LevelTransitionController({
  documentRef: document,
  element: document.getElementById('levelTransition'),
  labelElement: document.getElementById('levelTransitionLabel'),
  onFreeze: () => {
    try { player?.keys?.clear?.(); } catch (e) { logError(e); }
    try { weaponSystem?.triggerUp?.(); weaponSystem?.triggerAltUp?.(); } catch (e) { logError(e); }
  },
  onThaw: () => {
    // Discard keydown events accumulated while the simulation was frozen so
    // the player never walks or fires automatically as the veil clears.
    try { player?.keys?.clear?.(); } catch (e) { logError(e); }
    try { weaponSystem?.triggerUp?.(); weaponSystem?.triggerAltUp?.(); } catch (e) { logError(e); }
  },
  onEvent: (name, data) => {
    if (diagnosticLogsEnabled) perfLog.event('transition', name, data, name === 'error' || name === 'overdue' ? 'warning' : 'info');
  }
});
if (debugPerf) window.__levelTransition = levelTransition;
function repairSceneMaterialBuildHooks(source) {
  const result = repairInvalidMaterialBuildHooks(scene);
  if (result.repairedCount > 0 && diagnosticLogsEnabled) {
    perfLog.event('render', 'material_build_hook_repaired', {
      source,
      wave: enemyManager?.wave ?? initialRunStartWave,
      levelId: relayLevel?.definition?.id || null,
      ...result
    }, 'warning');
  }
  return result;
}

function renderProductionScene() {
  try {
    renderer.render(scene, camera);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('material.onBuild')) throw error;

    const repair = repairSceneMaterialBuildHooks('renderer_retry');
    if (repair.repairedCount === 0) throw error;
    renderer.render(scene, camera);
  }
}
let menuBackground = window.__menuBackground || null;
let debugEnvironment = diagnosticLogsEnabled
  ? collectDebugEnvironment({ renderer, params, version: APP_VERSION_LABEL, seed, quality: savedQuality })
  : null;
if (diagnosticLogsEnabled) perfLog.event('system', 'environment', debugEnvironment);
const wantEditor = (new URL(window.location.href)).searchParams.get('editor') === '1';
const storyParam = (new URL(window.location.href)).searchParams.get('story');
const storyDisabled = storyParam === '0' || storyParam === 'false';
let story;        // lightweight narrative beats
const levelParam = params.get('level');
const relayDefaultEligible = !levelParam && !wantEditor && isAuthoredCampaignWave(initialRunStartWave);

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
const modelLoadStartedAt = diagnosticLogsEnabled ? performance.now() : 0;
try {
  setLoading(0.02, t('loading.models'));
  const progress = (done, total) => {
    setLoading(0.02 + 0.48 * (done / Math.max(1, total)), `${t('loading.models')} ${done}/${total}`);
  };
  const shaderWarm = shouldPrewarmShaders(params.get('warmup'));
  const { registry } = await loadAllModels({ renderer, onProgress: progress, skipWarmup: true });
  const startupMenuAssetIds = (!menuBackground && !wantEditor && !relayOverviewMode && !relayPlayerPreviewMode) ? MENU_BACKGROUND_ASSET_IDS : [];
  const generatedStartupIds = relayDefaultEligible
    ? [...new Set([...RELAY_DISTRICT_ASSET_IDS, ...SANITIZER_SPIRE_ASSET_IDS, ...AD_ZONE_ARENA_ASSET_IDS, ...TREND_WASTES_ASSET_IDS, ...FREIGHT_ANNEX_ASSET_IDS, ...MIRROR_GARDEN_ASSET_IDS, ...CONTENT_COURT_ASSET_IDS, ...SERVER_CATHEDRAL_ASSET_IDS, ...LAST_ORDER_BASE_ASSET_IDS, ...SANDSTORM_EXPANSE_ASSET_IDS, ...FLOODGATE_CONTINUITY_ASSET_IDS, ...BLACKOUT_CISTERN_ASSET_IDS, ...TUTORIAL_YARD_ASSET_IDS, ...startupMenuAssetIds])]
    : [...new Set([...TUTORIAL_YARD_ASSET_IDS, ...startupMenuAssetIds])];
  if (generatedStartupIds.length) {
    await loadGeneratedModels({
      ids: generatedStartupIds,
      onProgress: (done, total) => setLoading(0.5 + 0.04 * (done / Math.max(1, total)), `${t('loading.models')} ${done}/${total}`),
      optimizeStatic: true
    });
  }
  if (!menuBackground && !wantEditor && !relayOverviewMode && !relayPlayerPreviewMode) {
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
  if (diagnosticLogsEnabled) {
    perfLog.event('loading', 'models_complete', {
      durationMs: Math.round((performance.now() - modelLoadStartedAt) * 10) / 10,
      loadedModels: registry?.size || 0
    });
  }
  if (shaderWarm) {
    setLoading(0.55, t('loading.compiling'));
    const shaderWarmStartedAt = diagnosticLogsEnabled ? performance.now() : 0;
    const shaderWarmupExtras = [
      ...getBossShaderWarmupExtras({ THREE, mats }),
      ...createEffectsShaderWarmupExtras(THREE)
    ];
    await prewarmAllShaders(renderer, {
      registry,
      includeShadows: renderer.shadowMap?.enabled,
      includeDepthVariants: true,
      extras: shaderWarmupExtras
    });
    if (diagnosticLogsEnabled) {
      perfLog.event('loading', 'shader_warmup_complete', {
        durationMs: Math.round((performance.now() - shaderWarmStartedAt) * 10) / 10,
        shadows: !!renderer.shadowMap?.enabled
      });
    }
  } else {
    if (diagnosticLogsEnabled) perfLog.event('loading', 'shader_warmup_skipped', { reason: 'warmup=0' }, 'warning');
  }
  setLoading(1.0, t('loading.ready'));
  // The runtime-enemy warmup below still has to compile first-wave shader and
  // instancing variants. Keep the veil up until that work has fully drained.
} catch(e) {
  console.warn('Warmup failed — continuing without precompiled shaders');
  if (diagnosticLogsEnabled) perfLog.event('loading', 'startup_failed', { error: e }, 'error');
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
if (debugPerf) window.__wave72Visuals = wave72Visuals;
if (diagnosticLogsEnabled) {
  const originalWeatherSetMode = weather.setMode.bind(weather);
  weather.setMode = (mode, options) => {
    const previous = weather.mode;
    const result = originalWeatherSetMode(mode, options);
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
if (diagnosticLogsEnabled) {
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
    const aimDirection = new THREE.Vector3();
    camera.getWorldDirection(aimDirection).normalize();
    const f = aimDirection.clone(); f.y = 0; f.normalize();
    return {
      position: pos,
      forward: f,
      aimOrigin: camera.getWorldPosition(new THREE.Vector3()),
      aimDirection
    };
  },
  arenaRadius,
  obstacleManager,
  makeNamespacedRng(seed, 'enemies')
);
if (diagnosticLogsEnabled) {
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
if (diagnosticLogsEnabled) {
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
const tutorial = new TutorialManager({
  documentRef: document,
  enemyManager,
  getPlayer: () => controls.getObject(),
  onStep: state => renderRelayObjective(state)
});

// Wire obstacle manager hooks now that managers exist
obstacleManager.enemyManager = enemyManager;
obstacleManager.pickups = pickups;
obstacleManager.effects = effects;
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
  onTransitionToLegacy: transitionToNextCampaignLevel,
  onLastOrderPowerdown: () => story?.onChapterComplete?.('lastorder'),
  onCheckpoint: checkpoint => {
    if (checkpoint?.levelId !== 'floodgate-continuity') return;
    setMaxNumber('bs3d_floodgate_checkpoint', checkpoint.wave, 0);
    showToast(t(checkpoint.wave >= 66 ? 'level.floodgate.checkpointTwo' : 'level.floodgate.checkpointOne'));
    story?.onCheckpoint?.(checkpoint);
  },
  onPlayerHazard: hazard => {
    if (paused || session.gameOver || hazard?.type !== 'floodwater') return;
    const result = applyPlayerDamage(hazard.damage, 'floodwater');
    if (!result.ignored) effects?.onPlayerHit?.(hazard.damage);
    updateHUD();
  },
  onLoadDestructibles: definition => {
    obstacleManager.loadPlacements(destructiblesForLevel(definition?.id), objects);
  },
  onClearDestructibles: () => {
    abilitySystem?.clearWorldObjects?.();
    obstacleManager.clear();
  },
  debugColliderChannels
});
tutorial.onMarker = state => relayLevel.setTutorialObjectiveMarker(state);
relayLevel.attach({ enemyManager });
if (relayDefaultEligible) relayLevel.load(authoredLevelForWave(relayPlayerPreviewMode || relayOverviewMode ? relayPreviewWave : initialRunStartWave));
function positionRelayOverviewCamera(){
  scene.add(camera);
  camera.position.set(0, 68, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.fov = 58;
  camera.updateProjectionMatrix();
  weaponView.root.visible = false;
}
if (relayOverviewMode && relayLevel.active) {
  positionRelayOverviewCamera();
}

function loadLiveCampaignLevel(definition) {
  pickups.resetAll();
  relayLevel.load(definition);
  if (diagnosticLogsEnabled) perfLog.event('resource', 'level_disposed', relayLevel.lastDisposedResources);
  if (relayLevel.playerSpawn) {
    player.resetPosition(...relayLevel.playerSpawn);
    player.yawObject.rotation.y = 0;
  }
  enemyManager.customSpawnPoints = null;
  levelInfo = null;
}

async function precompileTransitionScene() {
  const primed = enemyManager.primeAuthoredSpawnTypes?.() || { spawnedTypes: [], remaining: 0 };
  repairSceneMaterialBuildHooks('level_transition_prepare');
  // Apply immediate weather uniforms without advancing game time. Gameplay,
  // AI, cooldowns, and wave clocks remain gated by levelTransition.active.
  weather.update(gameTime, controls.getObject());
  if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
  else renderer.compile?.(scene, camera);
  repairSceneMaterialBuildHooks('level_transition_pre_render');
  // Pay geometry upload, shadow-map, and first-render costs while the compositor
  // veil is fully opaque. The normal loop intentionally skips world rendering.
  renderProductionScene();
  await new Promise(resolve => requestAnimationFrame(resolve));
  return primed;
}

function beginLiveLevelTransition({ fromId, toDefinition, theme = 'neutral', switchLevel, onComplete = null }) {
  if (!toDefinition || levelTransition.active) return false;
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    flushPendingTransitionWaveStart();
    onComplete?.();
  };
  levelTransition.run({
    fromId,
    toId: toDefinition.id,
    theme,
    label: t('transition.calibrating'),
    prepare: switchLevel,
    precompile: precompileTransitionScene
  }).then(() => {
    finalize();
  }).catch(error => {
    logError(error, `level transition ${fromId || 'unknown'} -> ${toDefinition.id}`);
    finalize();
  });
  return true;
}

function transitionToNextCampaignLevel(result = {}) {
  if (!relayLevel.active) return;
  if (result.lastOrderComplete) {
    // The campaign simulator owns level iteration. Preserve the completed
    // escape snapshot until Wave 41 is recorded instead of asynchronously
    // replacing it with Expanse Wave 42 during the objective checkpoint.
    if (qaSimulationMode) return;
    // Write the earned Wave 41 build under the destination checkpoint before
    // advancing position. Wave 42 replaces this provisional state after its
    // authored entry offer is created.
    persistCampaignCheckpointState(42, { provisional: true });
    markLastOrderComplete();
    showToast(t('level.lastOrder.completeToast'));
    beginLiveLevelTransition({
      fromId: 'last-order-base',
      toDefinition: SANDSTORM_EXPANSE,
      theme: 'storm',
      switchLevel: () => {
        enemyManager.suspendWaves = true;
        try {
          enemyManager.reset({ wave: 42 });
          loadLiveCampaignLevel(SANDSTORM_EXPANSE);
        } finally {
          enemyManager.suspendWaves = false;
        }
        enemyManager.startWave();
      }
    });
    return;
  }
  if (result.greywaterComplete) {
    story?.onChapterComplete?.('vault');
    setString('bs3d_greywater_complete', '1');
    setMaxNumber('bs3d_floodgate_checkpoint', 73, 0);
    showToast(t('level.floodgate.runComplete'));
    const switchLevel = () => {
      enemyManager.suspendWaves = true;
      enemyManager.reset({ wave: 1 });
      pickups.resetAll();
      relayLevel.load(BLACKOUT_CISTERN);
      if (diagnosticLogsEnabled) perfLog.event('resource', 'level_disposed', relayLevel.lastDisposedResources);
      session.gameOver = true;
    };
    const finish = () => {
      if (!isMobile) {
        try { controls.unlock(); } catch (e) { logError(e); }
      }
      showStartPanel();
    };
    if (qaSimulationMode) { switchLevel(); finish(); }
    else beginLiveLevelTransition({
      fromId: 'floodgate-continuity',
      toDefinition: BLACKOUT_CISTERN,
      switchLevel,
      onComplete: finish
    });
    return;
  }
  if (result.enduranceComplete) {
    story?.onChapterComplete?.('expanse');
    setString('bs3d_sandstorm_complete', '1');
    showToast(t('level.expanse.runComplete'));
    const switchLevel = () => {
      enemyManager.suspendWaves = true;
      enemyManager.reset({ wave: 1 });
      pickups.resetAll();
      relayLevel.load(FLOODGATE_CONTINUITY);
      if (diagnosticLogsEnabled) perfLog.event('resource', 'level_disposed', relayLevel.lastDisposedResources);
      session.gameOver = true;
    };
    const finish = () => {
      if (!isMobile) {
        try { controls.unlock(); } catch (e) { logError(e); }
      }
      showStartPanel();
    };
    if (qaSimulationMode) { switchLevel(); finish(); }
    else beginLiveLevelTransition({
      fromId: 'sandstorm-expanse',
      toDefinition: FLOODGATE_CONTINUITY,
      switchLevel,
      onComplete: finish
    });
    return;
  }
  if (result.endingChoice) {
    setString('bs3d_ending_state', result.endingChoice);
    showToast(t(`level.cathedral.${result.endingChoice}Confirmed`));
  }
  const nextDefinition = ({
    'relay-district': SANITIZER_SPIRE,
    'sanitizer-spire': AD_ZONE_ARENA,
    'ad-zone-arena': TREND_WASTES,
    'trend-wastes': FREIGHT_ANNEX,
    'freight-annex': MIRROR_GARDEN,
    'mirror-garden': CONTENT_COURT,
    'content-court': SERVER_CATHEDRAL,
    'server-cathedral': LAST_ORDER_BASE
  })[relayLevel.definition?.id] || null;
  const fromId = relayLevel.definition?.id || null;
  const advance = () => enemyManager.tryAdvanceWave({
    beforeStart: () => {
      if (nextDefinition) return loadLiveCampaignLevel(nextDefinition);
      pickups.resetAll();
      relayLevel.unload();
      if (diagnosticLogsEnabled) perfLog.event('resource', 'level_disposed', relayLevel.lastDisposedResources);
      obstacleManager.generate(seed, objects);
      cullGrassUnderObjects(grassMesh, objects);
      player.refreshColliders?.(objects);
      enemyManager.refreshColliders?.(objects);
      enemyManager.customSpawnPoints = null;
      levelInfo = null;
      weather.setMode('clear');
    }
  });
  if (qaSimulationMode || !nextDefinition) {
    advance();
    return;
  }
  beginLiveLevelTransition({
    fromId,
    toDefinition: nextDefinition,
    switchLevel: () => {
      if (!advance()) throw new Error(`Wave ${enemyManager.wave} could not advance during level transition`);
    }
  });
}

// ------ Gun / Shooting ------
// The document starts on the main menu. Treat that as paused on every input
// model, including touch devices that do not rely on pointer lock.
let paused=document.body.classList.contains('menu-open');
let gameOverLogged=false;
function logGameOver(source){
  if (!diagnosticLogsEnabled || gameOverLogged) return;
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
if (debugColliderChannels.length) {
  const legend = document.createElement('div');
  legend.id = 'blockBoxLegend';
  legend.setAttribute('aria-label', 'Collider debug channels');
  const title = document.createElement('strong');
  title.textContent = 'BLOCK BOXES';
  legend.appendChild(title);
  for (const channel of debugColliderChannels) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.backgroundColor = `#${BLOCK_BOX_CHANNEL_META[channel].color.toString(16).padStart(6, '0')}`;
    item.append(swatch, BLOCK_BOX_CHANNEL_META[channel].label);
    legend.appendChild(item);
  }
  document.body.appendChild(legend);
}
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
const objectiveKickerEl = document.getElementById('objectiveKicker');
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
  setTextIfChanged(objectiveKickerEl, t(state.levelNameKey || 'level.relay.name'));
  setTextIfChanged(objectiveTitleEl, t(state.titleKey || 'level.relay.name'));
  let detailKey = 'level.relay.eliminate';
  let detail = state.detail || '';
  if (state.contested) detailKey = 'level.relay.contested';
  else if (state.kind === 'feeds') {
    detailKey = 'level.relay.feedsRemaining';
    detail = t(detailKey).replace('{count}', state.remainingTargets ?? 2);
  } else if (state.kind === 'multi-capture') {
    if (state.activeTargetKey) {
      detailKey = 'level.spire.disablingCensor';
      detail = t(detailKey)
        .replace('{target}', t(state.activeTargetKey))
        .replace('{seconds}', state.activeSecondsRemaining ?? 0);
    } else {
      detailKey = 'level.spire.censorsRemaining';
      detail = t(detailKey).replace('{count}', state.remainingTargets ?? 3);
    }
  } else if (state.kind === 'mast') {
    detailKey = 'level.relay.holdRemaining';
    detail = t(detailKey).replace('{seconds}', Math.ceil(Math.max(0, (state.seconds || 0) - (state.elapsed || 0))));
  } else if (state.kind === 'sponsor') {
    detailKey = 'level.adzone.holdSponsor';
    detail = t(detailKey).replace('{seconds}', Math.ceil(Math.max(0, (state.seconds || 0) - (state.elapsed || 0))));
  } else if (state.kind === 'surge') {
    detailKey = state.detailKey || 'level.cistern.surgeDetail';
    detail = t(detailKey)
      .replace('{surge}', state.surge ?? 1)
      .replace('{total}', state.totalSurges ?? 4);
  } else if (state.kind === 'escape') detailKey = state.detailKey || 'level.lastOrder.escapeDetail';
  else if (state.kind === 'boss') detailKey = state.detailKey || 'level.relay.destroyNest';
  else if (state.kind === 'liberation') detailKey = state.detailKey || 'level.relay.signalRestored';
  else if (state.kind === 'ending-choice') detailKey = state.detailKey || 'level.cathedral.chooseEndingDetail';
  setTextIfChanged(objectiveDetailEl, detail || t(detailKey));
  const hasProgress = ['tutorial', 'feeds', 'multi-capture', 'mast', 'sponsor', 'surge', 'escape', 'liberation', 'ending-choice'].includes(state.kind);
  objectiveTrackerEl.classList.toggle('no-progress', !hasProgress);
  objectiveTrackerEl.classList.toggle('contested', !!state.contested);
  setWidthIfChanged(objectiveBarEl, `${Math.round(Math.max(0, Math.min(1, state.progress || 0)) * 100)}%`);
}
if (relayOverviewMode && relayLevel.active) {
  enemyManager.wave = relayPreviewWave;
  relayLevel.onWaveStart(relayPreviewWave);
  // The overhead camera is a geometry review surface. Keep the selected wave's
  // dressing, but do not obscure collision and ground continuity with fog.
  weather.setMode('clear', { immediate: true });
  // Player/controller initialization can restore its ordinary first-person
  // transform after the early setup above. Reassert the art-review camera once
  // all runtime systems and the selected chapter dressing are initialized.
  positionRelayOverviewCamera();
}
const bossNameEl = document.getElementById('bossName');
const bossHpBarEl = document.getElementById('bossHpBar');
const toastsEl = document.getElementById('toasts');
const tickerEl = document.getElementById('newsTicker');
const storyBroadcastEl = document.getElementById('storyBroadcast');
const storyBroadcastTextEl = document.getElementById('storyBroadcastText');
let tickerQueue = Promise.resolve();
let weaponPickerTimer = null;
let storyBroadcastTimer = null;

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
      if (diagnosticLogsEnabled) gameplayLog.record('shots', 1, performance.now(), enemyManager?.wave || 0, session?.score || 0);
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
const mutations = new ArchiveMutations({
  rng: makeNamespacedRng(seed, 'mutations'),
  onFragmentsAwarded: amount => achievements.check({ type: 'archiveFragmentsEarned', amount })
});
for (const reward of achievements.getUnlockedRewards?.() || []) {
  if (reward.type === 'weapon') mutations.grantClassifiedWeapon(reward.weaponId);
}
if (debugShopCredits != null) mutations.enableDebugShop(debugShopCredits);
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
    const result = session.adjustHealth(grade >= 3 ? 2 : 1);
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
    openingActComboHold = Math.max(openingActComboHold, event.comboHoldSeconds || 0);
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
  if (event.neutralized) {
    effects?.spawnGroundRing?.(position, 2.2, 0xfacc15);
    showToast(t('fun.algorithm.neutral'));
  } else if (result.amount > 0) {
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

function applyPlayerDamage(amount, source = 'enemy', { bypassArmor = false, ...attribution } = {}) {
  if (paused || session.gameOver) return { gameOver: session.gameOver, died: false, hp: session.hp };
  if (qaSimulationMode) {
    window.__qaCampaignBridge?.recordPlayerDamage?.({ amount, source, bypassArmor, ...attribution });
    return {
      gameOver: false,
      died: false,
      hp: session.hp,
      armor: session.armor,
      armorAbsorbed: 0,
      hpDamage: 0,
      ignored: true,
      simulationInvulnerable: true
    };
  }
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
    if (hudRootEl) hudRootEl.classList.toggle('boss-active', bossActive);
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
let hasCommittedRunWave = false;
let checkpointForceWeaponOffer = false;
let activeCheckpointSnapshotWave = 0;

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

function syncAuthoredAmmoPackages(wave) {
  abilitySystem?.clearBossAmmoCrates?.();
  const positions = relayLevel.definition?.waves?.[wave]?.ammoPackages || [];
  for (const position of positions) {
    if (!Array.isArray(position) || position.length < 2) continue;
    abilitySystem?.spawnBossAmmoCrate?.(new THREE.Vector3(position[0], 0, position[1]));
  }
}

function syncAuthoredHealthPackages(wave) {
  abilitySystem?.clearBossHealthCrates?.();
  const positions = relayLevel.definition?.waves?.[wave]?.healthPackages || [];
  for (const position of positions) {
    if (!Array.isArray(position) || position.length < 2) continue;
    abilitySystem?.spawnBossHealthCrate?.(new THREE.Vector3(position[0], 0, position[1]));
  }
}

// update HUD when a new wave starts and when remaining enemies changes
const handleWaveStart = createWaveStartHandler({
  session,
  enemyManager,
  achievements: qaSimulationMode ? null : achievements,
  pickups,
  weather,
  player,
  objects,
  getProgression: () => qaSimulationMode ? null : progression,
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
function commitWaveStart(wave, startingAlive, plannedTypes, { levelPrepared = false } = {}) {
  const recordPreviousWave = hasCommittedRunWave;
  const runEntry = !hasCommittedRunWave;
  const forceWeaponOffer = runEntry
    && !currentRunTutorial
    && !hasDebugWaveOverride
    && !qaSimulationMode
    && checkpointForceWeaponOffer;
  const waveStartState = diagnosticLogsEnabled ? captureGameplayState() : null;
  const plannedComposition = diagnosticLogsEnabled ? countPlannedEnemies(plannedTypes, wave) : null;
  if (diagnosticLogsEnabled && wave > 1 && recordPreviousWave) {
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
  handleWaveStart(wave, startingAlive, { recordPreviousWave, forceWeaponOffer });
  if (!currentRunTutorial && !hasDebugWaveOverride && !qaSimulationMode) {
    const previousCheckpoint = getCampaignCheckpoint();
    const checkpoint = recordCampaignChapterPosition(wave);
    if (wave <= 40 && checkpoint > previousCheckpoint) {
      const chapterName = t(authoredLevelForWave(checkpoint)?.nameKey || 'level.relay.name');
      showToast(t('start.checkpointSaved').replace('{chapter}', chapterName));
    }
    if (isCampaignChapterStart(wave) && activeCheckpointSnapshotWave !== wave) {
      persistCampaignCheckpointState(wave, {
        forceWeaponOffer: runEntry && checkpointForceWeaponOffer
      });
    }
  }
  if (!levelPrepared) {
    relayLevel.onWaveStart(wave);
    syncAuthoredAmmoPackages(wave);
    syncAuthoredHealthPackages(wave);
  }
  if (wave === 5 && mutations.getEligibleDefinitions().length > 0) {
    showToast(t('mutation.progress.bossReady'));
  }
  if (diagnosticLogsEnabled) {
    perfLog.event('game', 'wave_start', {
      wave,
      startingAlive,
      composition: plannedComposition,
      weather: weather.mode,
      runElapsedSeconds: Math.max(0, Math.round((gameTime - debugRunStartedAt) * 10) / 10)
    });
    debugWaveBaseline = { ...waveStartState, wave };
  }
  hasCommittedRunWave = true;
}

function persistCampaignCheckpointState(wave, { forceWeaponOffer = false, provisional = false } = {}) {
  const checkpointSaved = saveCampaignCheckpointState({
    wave,
    provisional,
    forceWeaponOffer,
    mutations: mutations.exportRunCheckpoint?.(),
    progression: progression?.exportRunCheckpoint?.(),
    weapons: weaponSystem?.exportCheckpointState?.(),
    session: session.exportCheckpointState?.(),
    player: player.exportCheckpointState?.(),
    achievements: achievements.exportRunCheckpoint?.()
  });
  if (checkpointSaved && !provisional) activeCheckpointSnapshotWave = wave;
  return checkpointSaved;
}

function prepareTransitionWaveEnvironment(wave) {
  relayLevel.onWaveStart(wave);
  syncAuthoredAmmoPackages(wave);
  syncAuthoredHealthPackages(wave);
}

function flushPendingTransitionWaveStart() {
  const pending = pendingTransitionWaveStart;
  pendingTransitionWaveStart = null;
  if (!pending) return;
  commitWaveStart(pending.wave, pending.startingAlive, pending.plannedTypes, { levelPrepared: true });
}

enemyManager.onWave = (wave, startingAlive, plannedTypes) => {
  if (levelTransition.active) {
    pendingTransitionWaveStart = { wave, startingAlive, plannedTypes };
    prepareTransitionWaveEnvironment(wave);
    return;
  }
  commitWaveStart(wave, startingAlive, plannedTypes);
};
enemyManager.onRemaining = () => updateHUD();
enemyManager.onSpecialWave = event => {
  relayLevel.onSpecialWaveEvent?.(event);
  if (event.type === 'start') {
    wave72Visuals.start();
    showToast(t('wave72.start'));
    story?.onSpecialWave?.(event, { endingState: getString('bs3d_ending_state', '') });
  } else if (event.type === 'surge-warning') {
    showToast(t('wave72.warning').replace('{surge}', event.surge).replace('{total}', event.totalSurges));
  } else if (event.type === 'surge') {
    showToast(t('wave72.surge').replace('{surge}', event.surge).replace('{total}', event.totalSurges));
  } else if (event.type === 'locator-pulse') {
    wave72Visuals.locatorPulse(event.position);
  } else if (event.type === 'final-searchlight') {
    wave72Visuals.setFinalSearchlight(true);
    showToast(t('wave72.searchlight'));
  } else if (event.type === 'complete') {
    wave72Visuals.complete();
    setString('bs3d_lastlight_complete', '1');
    // The next Play begins a new campaign economy cycle; earned Archive
    // currency itself remains permanent.
    mutations.resetCampaignRewardLedger?.();
    enemyManager.suspendWaves = true;
    session.gameOver = true;
    showToast(t('wave72.complete'));
    const finishLastLight = () => {
      if (!isMobile) {
        try { controls.unlock(); } catch (e) { logError(e); }
      }
      showStartPanel();
    };
    const epilogueQueued = story?.onSpecialWave?.(event, {
      endingState: getString('bs3d_ending_state', ''),
      onComplete: finishLastLight
    });
    if (!epilogueQueued) finishLastLight();
  } else if (event.type === 'cancel') {
    wave72Visuals.stop();
  }
  updateHUD();
};

// Sounds: create music first, then SFX sharing its context and FX bus
const baseMusicVol = 0.35;
const baseSfxVol = 0.65;
const legacySoundVolume = getNumber('soundVolume', 1);
const initialAudioVolumes = resolveAudioVolumes({
  legacy: legacySoundVolume,
  effects: getString('sfxVolume', null),
  music: getString('musicVolume', null)
});
let storedSfxVolume = initialAudioVolumes.effects;
let storedMusicVolume = initialAudioVolumes.music;
const music = new Music({ bpm: 132, volume: baseMusicVol * storedMusicVolume });
const S = new SFX({
  audioContextProvider: () => music.getContext(),
  fxBusProvider: () => music.getFxBus(),
  volume: baseSfxVol * storedSfxVolume,
});
obstacleManager.sfx = S;
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

const sfxVolumeSlider = document.getElementById('sfxVolume');
if (sfxVolumeSlider){
  sfxVolumeSlider.value = String(storedSfxVolume);
  sfxVolumeSlider.addEventListener('input', e=>{
    storedSfxVolume = clampSettingVolume(e.target.value);
    S.setVolume(baseSfxVol * storedSfxVolume);
    setNumber('sfxVolume', storedSfxVolume);
  });
}
const musicVolumeSlider = document.getElementById('musicVolume');
if (musicVolumeSlider){
  musicVolumeSlider.value = String(storedMusicVolume);
  musicVolumeSlider.addEventListener('input', e=>{
    storedMusicVolume = clampSettingVolume(e.target.value);
    music.setVolume(baseMusicVol * storedMusicVolume);
    if (sunoAudio) sunoAudio.volume = baseMusicVol * storedMusicVolume;
    setNumber('musicVolume', storedMusicVolume);
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
  sunoAudio.volume = baseMusicVol * storedMusicVolume;
  sunoAudio.muted = S.isMuted;
  sunoAudio.addEventListener('ended', playSuno);
  try { sunoAudio.play(); } catch (e) { logError(e); }
  try { music.stop?.(); } catch (e) { logError(e); }
}

function playSunoBoss(){
  stopSuno();
  sunoAudio = new Audio(SUNO_BOSS_TRACK);
  sunoAudio.volume = baseMusicVol * storedMusicVolume;
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
  getContext: () => ({ ...weaponSystem.context(), playerController: player, session }),
  getEquippedAbility: () => mutations.getEquippedAbility?.(),
  getAbilityGrade: id => mutations.getAbilityGrade?.(id) || 1,
  activateRush: () => performPunchlineRush(),
  onStateChange: () => updateAbilityHUD()
});
if (debugAbilityId) abilitySystem.setDebugAbility(debugAbilityId);
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
tutorial.spawnCrate = position => abilitySystem.spawnEmergencyAmmoCrate(
  new THREE.Vector3(position[0], position[1] || 0, position[2])
);
story = storyDisabled ? null : new StoryManager({
  documentRef: document,
  onPause: (lock)=>{ paused = !!lock; },
  controls,
  toastFn: (t)=> showToast(t),
  tickerFn: (t,r,i)=> showTicker(t,r,i),
  broadcastFn: (t, holdMs)=> showStoryBroadcast(t, holdMs)
});

function updateMobileAltButton(){
  const altButton = document.getElementById('btnAlt');
  if (!altButton) return;
  const available = weaponSystem?.hasCurrentAltFire?.() === true;
  altButton.hidden = !available;
  altButton.disabled = !available;
  altButton.setAttribute('aria-hidden', String(!available));
  setDisplayIfChanged(altButton, available ? '' : 'none');
}

function updateAbilityHUD(){
  const state = abilitySystem?.getState?.();
  if (hudRootEl) hudRootEl.classList.toggle('ability-active', Boolean(state));
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
  const abilityButtonValue = document.getElementById('btnRushValue');
  setTextIfChanged(abilityButtonValue, state?.ready ? '' : String(Math.ceil(state?.cooldownRemaining || 0)));
}

let rushHitEnemies = new Set();

function performPunchlineRush(){
  if (!player.startRush({ distance: 10, duration: 0.6, regenDelay: 0, requireFullStamina: false, consumeStamina: false })) return false;
  rushHitEnemies = new Set();
  effects?.spawnGroundSlam?.(controls.getObject().position.clone(), 1.6);
  return true;
}

function activateEquippedAbility(){
  if (paused || levelTransition.active || session.gameOver || (!controls.isLocked && !isMobile)) return false;
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
    if (!controls.isLocked || paused || levelTransition.active) return;
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
    if (levelTransition.active) return;
    if (e.code === 'KeyR') { weaponSystem.reload(); }
    if (e.code === 'KeyQ' && !e.repeat) { activateEquippedAbility(); }
    if (e.code === 'KeyP') {
      paused = !paused;
      if (diagnosticLogsEnabled) perfLog.event('game', paused ? 'pause' : 'resume', { source: 'keyboard' });
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
function roundedSigned(value){ return Math.round(Number(value || 0) * 10) / 10; }
const phaseTimingBuffers = diagnosticLogsEnabled ? [createPhaseTimingBuffer(), createPhaseTimingBuffer()] : null;
let phaseTimingIndex = 0;
let hasPreviousPhaseTiming = false;
function step(){
  const now = performance.now();
  const frameSchedule = scheduleCappedFrame(now, _lastFrameAt, FRAME_MIN_MS);

  if (!frameSchedule.shouldRender) { requestAnimationFrame(step); return; }
  _lastFrameAt = frameSchedule.lastScheduledAt;
  const elapsedMs = now - _lastRenderedAt;
  _lastRenderedAt = now;
  const currentPhaseTiming = diagnosticLogsEnabled ? phaseTimingBuffers[phaseTimingIndex] : null;
  const previousPhaseTiming = diagnosticLogsEnabled ? phaseTimingBuffers[1 - phaseTimingIndex] : null;
  if (currentPhaseTiming) resetPhaseTimingBuffer(currentPhaseTiming);
  let phaseMark = diagnosticLogsEnabled ? performance.now() : 0;

  // --- FPS calc (EMA over ~0.5s) using RAF intervals ---
  const dtRaf = Math.min(0.1, Math.max(0, elapsedMs / 1000));
  if (!step._fps) { step._fps = { ema: null, accum: 0 }; }
  const instFps = elapsedMs > 0 ? 1000 / elapsedMs : 0;
  const alpha = 1 - Math.exp(-(dtRaf || 0.016) / 0.5);
  step._fps.ema = (step._fps.ema == null) ? instFps : (step._fps.ema * (1 - alpha) + instFps * alpha);
  step._fps.accum += dtRaf;
  if (fpsEl && step._fps.accum >= 0.2) { fpsEl.textContent = String(Math.round(step._fps.ema)); step._fps.accum = 0; }

  const baseDt = Math.min(0.033, clock.getDelta());
  // The campaign harness can accelerate production simulation time without
  // changing normal gameplay or bypassing any player/enemy update systems.
  const dt = baseDt * (qaSimulationMode ? qaSimulationTimeScale : 1);
  const gameplayActive = (controls.isLocked || isMobile || qaSimulationMode) && !paused && !levelTransition.active && !session.gameOver;
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
    const trackablePlaytime = !qaSimulationMode
      && document.visibilityState !== 'hidden'
      && !document.body.classList.contains('menu-open');
    if (trackablePlaytime) {
      const previousPlaytimeMinute = Math.floor(playtimeTracker.totalSeconds / 60);
      playtimeTracker.add(dt);
      if (Math.floor(playtimeTracker.totalSeconds / 60) !== previousPlaytimeMinute) updatePlaytimeDisplay();
    }
    achievements.check({ type: 'time', delta: dt });
    // player movement update
    player.update(dt);
    tutorial.update(dt);
    relayLevel.update(dt, controls.getObject());
    if (diagnosticLogsEnabled) {
      const movement = currentPhaseTiming.movement;
      const playerObject = controls.getObject();
      const speedMetersPerSecond = Math.sqrt(Math.max(0, player.velXZ?.lengthSq?.() || 0));
      const inputActive = player.keys.has('KeyW') || player.keys.has('KeyA') ||
        player.keys.has('KeyS') || player.keys.has('KeyD');
      movement.moving = speedMetersPerSecond > 0.15;
      movement.inputActive = inputActive;
      movement.speedMetersPerSecond = roundedMs(speedMetersPerSecond);
      movement.position.x = roundedSigned(playerObject.position.x);
      movement.position.y = roundedSigned(playerObject.position.y);
      movement.position.z = roundedSigned(playerObject.position.z);
      movement.distanceFromCenter = roundedMs(Math.hypot(playerObject.position.x, playerObject.position.z));
      movement.yawDegrees = roundedSigned(THREE.MathUtils.radToDeg(player.yawObject?.rotation?.y || 0));
      movement.pitchDegrees = roundedSigned(THREE.MathUtils.radToDeg(camera.rotation.x || 0));
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

    if (diagnosticLogsEnabled) {
      const phaseNow = performance.now();
      currentPhaseTiming.playerSimulationMs = roundedMs(phaseNow - phaseMark);
      phaseMark = phaseNow;
    }

    // enemies AI
    const fo = controls.getObject();
    fo.userData.combatHp = session.hp;
    fo.userData.combatMaxHp = session.maxHp;
    enemyManager.tickAI(fo, dt, (damage, source, attribution = {})=>{
      const damageResult = applyPlayerDamage(damage, source || 'enemy', { ...attribution, bypassArmor: !!attribution.bypassArmor });
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

    if (diagnosticLogsEnabled) {
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

    // Emergency ammo assistance: when the primary arsenal is dry, use the
    // active level's authored resupply point. Loose ammo elsewhere in a large
    // arena must not strand the player, and a failed spawn must not consume
    // the retry cooldown.
    try {
      if (weaponSystem && pickups && pickups.active && !abilitySystem?.hasEmergencyAmmoCrate?.()) {
        const drops = session.getEmergencyAmmoDrops({ weaponSystem, gameTime, commit: false });
        const spawn = relayLevel.definition?.emergencyAmmoSpawn;
        const position = Array.isArray(spawn) && spawn.length >= 2
          ? new THREE.Vector3(spawn[0], 0, spawn[1])
          : null;
        if (drops.length > 0 && position && abilitySystem?.spawnEmergencyAmmoCrate?.(position)) {
          session.markEmergencyAmmoDrop(gameTime);
        }
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

    if (diagnosticLogsEnabled) {
      const phaseNow = performance.now();
      currentPhaseTiming.effectsPickupsMs = roundedMs(phaseNow - phaseMark);
      phaseMark = phaseNow;
    }

    // Weather update (uses gameTime so it freezes cleanly when paused)
    weather.update(gameTime, controls.getObject());
    const lastLightWarden = wave72Visuals.active
      ? [...enemyManager.enemies].find(root => {
          const type = root?.userData?.type;
          return type === 'warden' || type === 'swarm_warden';
        })
      : null;
    wave72Visuals.update({ wardenPosition: lastLightWarden?.position || null, dt });

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
  if (!levelTransition.active && combo.decayTimer > 0) {
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

  if (diagnosticLogsEnabled) {
    const phaseNow = performance.now();
    currentPhaseTiming.weatherAudioMs = roundedMs(phaseNow - phaseMark);
    phaseMark = phaseNow;
  }

  // (pickups and weather are updated only while active in the gated block above)

  // Adaptive DPR update (EMA over frame interval)
  if (autoDpr && !levelTransition.active) {
    _frameEmaMs = _frameEmaMs * 0.9 + elapsedMs * 0.1;
    if ((now - _lastDprAdjustAt) > 900) {
      const nextDpr = nextAdaptiveDpr(_dpr, _frameEmaMs, dprBudget);
      if (nextDpr !== _dpr) {
        const previousDpr = _dpr;
        _dpr = nextDpr;
        renderer.setPixelRatio(_dpr);
        _lastDprAdjustAt = now;
        if (diagnosticLogsEnabled) perfLog.event('performance', 'dpr.changed', {
          from: previousDpr,
          to: _dpr,
          frameEmaMs: Math.round(_frameEmaMs * 10) / 10,
          reason: _dpr < previousDpr ? 'slow_frame_recovery' : 'available_headroom'
        });
      }
    }
  }

  if (diagnosticLogsEnabled) {
    const phaseNow = performance.now();
    currentPhaseTiming.housekeepingMs = roundedMs(phaseNow - phaseMark);
    phaseMark = phaseNow;
  }

  if (!levelTransition.active && !document.body.classList.contains('menu-background-active')) renderProductionScene();

  if (diagnosticLogsEnabled) {
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
const newGameBtn = document.getElementById('newGame');
const newGameDialog = document.getElementById('newGameDialog');
const confirmNewGameBtn = document.getElementById('confirmNewGame');
const tutorialBtn = document.getElementById('tutorialBtn');
const pauseMenu = document.getElementById('pauseMenu');
const defeatMenu = document.getElementById('defeatMenu');
const tutorialCompleteMenu = document.getElementById('tutorialCompleteMenu');
const tutorialCompleteYes = document.getElementById('tutorialCompleteYes');
const tutorialCompleteAlsoYes = document.getElementById('tutorialCompleteAlsoYes');
const archiveMenu = document.getElementById('archiveMenu');
const openArchiveBtn = document.getElementById('openArchive');
const archiveMenuBalance = document.getElementById('archiveMenuBalance');
const archiveBalance = document.getElementById('archiveBalance');
const archiveGrid = document.getElementById('archiveGrid');
const archiveBack = document.getElementById('archiveBack');
const archiveClose = document.getElementById('archiveClose');
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
const settingsTabs = [...document.querySelectorAll('[data-settings-tab]')];
const settingsPanels = [...document.querySelectorAll('[data-settings-panel]')];
const supportLogsToggle = document.getElementById('supportLogsEnabled');
const settingsOpenLog = document.getElementById('settingsOpenLog');
let settingsReturn = 'panel';
let achievementsReturn = 'panel';
let debugLogReturn = 'panel';
let archiveReturn = 'start';
let debugLogRenderTimer = null;

function activateSettingsTab(name, { focus = false } = {}){
  const activeTab = settingsTabs.find(tab => tab.dataset.settingsTab === name) || settingsTabs[0];
  if (!activeTab) return;
  for (const tab of settingsTabs) {
    const selected = tab === activeTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of settingsPanels) panel.hidden = panel.dataset.settingsPanel !== activeTab.dataset.settingsTab;
  if (focus) activeTab.focus();
}

for (const tab of settingsTabs) {
  tab.onclick = () => activateSettingsTab(tab.dataset.settingsTab);
  tab.addEventListener('keydown', event => {
    const currentIndex = settingsTabs.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % settingsTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + settingsTabs.length) % settingsTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = settingsTabs.length - 1;
    else return;
    event.preventDefault();
    activateSettingsTab(settingsTabs[nextIndex].dataset.settingsTab, { focus: true });
  });
}
document.querySelector('.settings-tabs')?.setAttribute('aria-label', t('settings.tabsLabel'));
activateSettingsTab('video');
if (supportLogsToggle) supportLogsToggle.checked = supportLogsEnabled;
if (settingsOpenLog) settingsOpenLog.disabled = !diagnosticLogsEnabled;

function showMenuView(view){
  document.body.classList.add('menu-open');
  panel.style.display = view === 'start' ? '' : 'none';
  pauseMenu.style.display = view === 'pause' ? '' : 'none';
  if (defeatMenu) defeatMenu.style.display = view === 'defeat' ? '' : 'none';
  if (tutorialCompleteMenu) tutorialCompleteMenu.style.display = view === 'tutorialComplete' ? '' : 'none';
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
  if (tutorialCompleteMenu) tutorialCompleteMenu.style.display = 'none';
  if (archiveMenu) archiveMenu.style.display = 'none';
  settingsMenu.style.display = 'none';
  achievementsMenu.style.display = 'none';
  debugLogMenu.style.display = 'none';
  panel.parentElement.style.display = 'none';
}

function updateArchiveAvailability(){
  const state = mutations.getPersistentState();
  if (openArchiveBtn) openArchiveBtn.disabled = !state.revealed;
  if (archiveMenuBalance) archiveMenuBalance.textContent = `◆ ${state.fragments}`;
  if (archiveBalance) archiveBalance.textContent = String(state.fragments);
}

function checkArchiveAchievement(event) {
  const run = mutations.getRunState();
  const source = mutations.debugShop || run.tutorial || run.debug ? 'debug' : undefined;
  achievements.check({ ...event, source });
}

function getArchiveAchievementSnapshot() {
  const state = mutations.getPersistentState();
  const categoriesOwned = [];
  if (state.ownedWeapons.length > 0) categoriesOwned.push('classified');
  if (MUTATION_DEFINITIONS.some(def => def.category === 'survival' && mutations.isUnlocked(def.id))) categoriesOwned.push('survival');
  if (MUTATION_DEFINITIONS.some(def => def.category === 'spectacle' && mutations.getMutationGrade(def.id) > 0)) categoriesOwned.push('spectacle');
  if (WEAPON_MASTERY_DEFINITIONS.some(def => mutations.getMasteryGrade(def.id) > 0)) categoriesOwned.push('mastery');
  if (state.ownedAbilities.length > 0 || MUTATION_DEFINITIONS.some(def => def.category === 'ability' && mutations.isUnlocked(def.id))) categoriesOwned.push('ability');

  const maxedSpectacles = MUTATION_DEFINITIONS
    .filter(def => def.category === 'spectacle' && def.maxGrade > 1 && mutations.getMutationGrade(def.id) >= def.maxGrade)
    .length;
  const maxedRankedMutations = MUTATION_DEFINITIONS
    .filter(def => def.category === 'survival' && Array.isArray(def.rankCaps) && mutations.getMutationGrade(def.id) >= def.maxGrade)
    .length;
  const maxedMasteries = WEAPON_MASTERY_DEFINITIONS
    .filter(def => mutations.getMasteryGrade(def.id) >= def.maxGrade)
    .length;
  const maxedAbilities = ABILITY_DEFINITIONS
    .filter(def => def.maxGrade > 1 && mutations.getAbilityGrade(def.id) >= def.maxGrade)
    .length;

  return {
    type: 'archiveState',
    categoriesOwned,
    classifiedWeaponsOwned: CLASSIFIED_WEAPON_DEFINITIONS.filter(def => mutations.isWeaponOwned(def.id)).length,
    maxedUpgrades: maxedSpectacles + maxedRankedMutations + maxedMasteries + maxedAbilities
  };
}

function recordArchivePurchase(result, { category, cost, grade = 0 }) {
  if (!result?.ok) return;
  checkArchiveAchievement({
    type: 'archivePurchase',
    category,
    itemId: result.id,
    cost,
    grade
  });
  checkArchiveAchievement(getArchiveAchievementSnapshot());
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
    stateEl.textContent = owned ? t('archive.unlocked') : revealed ? `${def.cost} ◆` : t('classified.status.hidden');
    const name = document.createElement('h3');
    name.textContent = revealed ? t(def.nameKey) : t('classified.hidden.name');
    const description = document.createElement('p');
    description.textContent = revealed ? t(def.descriptionKey) : t(def.revealKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress classified-progress';
    progress.textContent = owned
      ? t(def.tacticalSlot ? 'classified.progress.tacticalReady' : 'classified.progress.armoryReady')
      : revealed ? t(def.revealedKey || 'classified.progress.revealed') : t('classified.progress.hidden');
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = !revealed || (owned ? !def.tacticalSlot || equipped : state.fragments < def.cost);
    action.textContent = owned
      ? t(equipped ? 'archive.equipped' : def.tacticalSlot ? 'archive.equip' : 'archive.unlocked')
      : revealed ? `${t('archive.unlock')} · ${def.cost} ◆` : t('classified.status.hidden');
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
      recordArchivePurchase(result, { category: 'classified', cost: def.cost });
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
      recordArchivePurchase(result, { category: def.category, cost: def.cost });
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
    const grade = mutations.getAbilityGrade(def.id);
    const maxGrade = def.maxGrade || 1;
    const graded = maxGrade > 1;
    const maxed = grade >= maxGrade;
    const cost = mutations.getAbilityCost(def.id);
    const owned = grade > 0;
    const equipped = owned && mutations.getEquippedAbility() === def.id;
    const card = document.createElement('article');
    card.className = `archive-card ability-card${owned ? ' is-unlocked' : ''}${equipped ? ' is-equipped' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = graded
      ? `${t('archive.grade')} ${romanGrade(grade)}/${romanGrade(maxGrade)}${maxed ? ` · ${t('archive.maxed')}` : ''}${equipped ? ` · ${t('archive.equipped')}` : ''}`
      : equipped ? t('archive.equipped') : owned ? t('archive.unlocked') : `${cost} ◆`;
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress ability-progress';
    const displayProfile = def.gradeProfiles?.[Math.max(0, grade - 1)] || def.gradeProfiles?.[0] || def;
    progress.textContent = t('ability.archiveStats')
      .replace('{charges}', String(displayProfile.maxCharges ?? def.maxCharges))
      .replace('{cooldown}', String(displayProfile.cooldownSeconds ?? def.cooldownSeconds));
    const action = document.createElement('button');
    action.type = 'button';
    const upgradeNow = graded && owned && !maxed && equipped;
    action.disabled = (maxed && equipped) || ((upgradeNow || !owned) && state.fragments < cost);
    action.textContent = !owned
      ? `${t('archive.unlock')} · ${cost} ${t('archive.fragments')}`
      : upgradeNow
        ? `${t('archive.upgrade')} · ${cost} ${t('archive.fragments')}`
        : equipped ? (graded ? t('archive.maxed') : t('archive.equipped')) : t('archive.equip');
    action.onclick = () => {
      const result = !owned || upgradeNow ? mutations.purchaseAbility(def.id) : mutations.equipAbility(def.id);
      if (!result.ok) return;
      if (!owned || upgradeNow) recordArchivePurchase(result, { category: 'ability', cost, grade: result.grade });
      renderArchive();
      updateArchiveAvailability();
      updateAbilityHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  const romanGrade = grade => ['0', 'I', 'II', 'III', 'IV'][grade] || String(grade);
  const appendSurvivalCard = (def) => {
    const revealed = mutations.isSurvivalMutationRevealed(def.id);
    const unlocked = mutations.isUnlocked(def.id);
    const graded = Array.isArray(def.rankCaps);
    const grade = graded ? mutations.getMutationGrade(def.id) : 0;
    const maxed = unlocked && (!graded || grade >= def.maxGrade);
    const rankCap = unlocked ? mutations.getMutationRankCap(def.id) : (def.rankCaps?.[0] || def.maxRank);
    const nextRankCap = graded ? def.rankCaps[Math.min(def.maxGrade, grade + 1)] : rankCap;
    const cost = mutations.getMutationCost(def.id);
    const card = document.createElement('article');
    card.className = `archive-card survival-card${unlocked ? ' is-unlocked' : ''}${maxed ? ' is-maxed' : ''}`;
    const stateEl = document.createElement('div');
    stateEl.className = 'archive-state';
    stateEl.textContent = !revealed
      ? t('archive.waveMilestone').replace('{wave}', String(def.unlockWave))
      : !unlocked
        ? `${def.cost} ◆`
        : graded
          ? `${grade === 0 ? t('archive.base') : `${t('archive.grade')} ${romanGrade(grade)}`}/${romanGrade(def.maxGrade)}${maxed ? ` · ${t('archive.maxed')}` : ''}`
          : t('archive.progressionUnlocked');
    const name = document.createElement('h3');
    name.textContent = t(def.nameKey);
    const description = document.createElement('p');
    description.textContent = t(def.descriptionKey);
    const progress = document.createElement('div');
    progress.className = 'archive-progress survival-progress';
    progress.textContent = !revealed
      ? t('mutation.progress.waveGate').replace('{wave}', String(def.unlockWave))
      : !unlocked
        ? t('mutation.progress.poolPurchase').replace('{rank}', String(rankCap))
        : !maxed
          ? `${t('mutation.progress.runCeiling')}: ${rankCap} → ${nextRankCap}`
          : `${t('mutation.progress.poolReady').replace('{rank}', String(rankCap))}${graded ? ` · ${t('archive.maxed')}` : ''}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.disabled = !revealed || maxed || state.fragments < cost;
    action.textContent = !revealed
      ? t('archive.waveMilestone').replace('{wave}', String(def.unlockWave))
      : maxed
        ? (graded ? t('archive.maxed') : t('archive.progressionUnlocked'))
        : `${unlocked ? t('archive.upgrade') : t('archive.unlockProgression')} · ${cost} ${t('archive.fragments')}`;
    action.onclick = () => {
      const result = mutations.purchase(def.id);
      if (!result.ok) return;
      recordArchivePurchase(result, { category: 'survival', cost, grade: result.grade || 0 });
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
      recordArchivePurchase(result, { category: 'spectacle', cost, grade: mutations.getMutationGrade(def.id) });
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
      recordArchivePurchase(result, { category: 'mastery', cost, grade: result.grade });
      weaponSystem?.reset?.();
      renderArchive();
      updateArchiveAvailability();
      updateHUD();
    };
    card.append(stateEl, name, description, progress, action);
    fragment.append(card);
  };

  appendSectionTitle('archive.category.classified');
  sortArchiveItemsByCost(
    CLASSIFIED_WEAPON_DEFINITIONS,
    def => mutations.isWeaponRevealed(def.id) && !mutations.isWeaponOwned(def.id) ? def.cost : null
  ).forEach(appendClassifiedCard);

  const survival = MUTATION_DEFINITIONS.filter(def => def.category === 'survival');
  if (survival.length) {
    appendSectionTitle('archive.category.survival');
    sortArchiveItemsByCost(
      survival,
      def => {
        if (!mutations.isSurvivalMutationRevealed(def.id)) return null;
        return mutations.getMutationCost(def.id);
      }
    ).forEach(appendSurvivalCard);
  }
  const spectacles = MUTATION_DEFINITIONS.filter(def => def.category === 'spectacle');
  if (spectacles.length) {
    appendSectionTitle('archive.category.spectacle');
    sortArchiveItemsByCost(spectacles, def => mutations.getMutationCost(def.id)).forEach(appendSpectacleCard);
  }
  const discoveredMasteries = WEAPON_MASTERY_DEFINITIONS.filter(def => mutations.isWeaponProgressionAvailable(def.weaponId));
  if (discoveredMasteries.length) {
    appendSectionTitle('archive.category.weapons');
    sortArchiveItemsByCost(discoveredMasteries, def => mutations.getMasteryCost(def.id)).forEach(appendMasteryCard);
  }
  const weaponAbilities = MUTATION_DEFINITIONS.filter(def => def.category === 'ability' && (!def.weaponId || mutations.isWeaponProgressionAvailable(def.weaponId)));
  if (ABILITY_DEFINITIONS.length || weaponAbilities.length) {
    appendSectionTitle('archive.category.abilities');
    const abilities = [
      ...ABILITY_DEFINITIONS.map(def => ({ def, append: appendAbilityCard, cost: mutations.getAbilityCost(def.id) })),
      ...weaponAbilities.map(def => ({ def, append: appendMutationCard, cost: mutations.isUnlocked(def.id) ? null : def.cost }))
    ];
    sortArchiveItemsByCost(abilities, item => item.cost).forEach(item => item.append(item.def));
  }
  archiveGrid.replaceChildren(fragment);
}

function openArchive(from = 'start'){
  archiveReturn = from;
  checkArchiveAchievement({ type: 'archiveOpen' });
  renderArchive();
  updateArchiveAvailability();
  showMenuView('archive');
  archiveClose?.focus();
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
    if (item.icon) {
      const icon = document.createElement('img');
      icon.className = 'achievement-icon';
      icon.src = item.icon;
      icon.alt = '';
      badge.appendChild(icon);
    } else {
      badge.textContent = item.badge;
    }

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
  playtimeTracker.reset();
  try { localStorage.clear(); } catch (e) { logError(e); }
  try { sessionStorage.clear(); } catch (e) { logError(e); }
  window.location.reload();
}

function renderDebugLog(){
  if (!diagnosticLogsEnabled || !debugLogStream) return;
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
  if (!diagnosticLogsEnabled || debugLogMenu?.style.display === 'none' || debugLogRenderTimer) return;
  debugLogRenderTimer = setTimeout(() => {
    debugLogRenderTimer = null;
    renderDebugLog();
  }, 120);
}

function openDebugLog(from){
  if (!diagnosticLogsEnabled) return;
  debugLogReturn = from;
  if (debugLogStatus) debugLogStatus.textContent = '';
  perfLog.event('debug', 'log_opened', { from });
  showMenuView('debugLog');
  renderDebugLog();
}

function closeDebugLog(){
  if (debugLogReturn === 'settings') showMenuView('settings');
  else showMenuView(debugLogReturn === 'pause' ? 'pause' : 'start');
}

function updateCampaignStartUI(){
  if (!playBtn) return;
  const startWave = resolveStandardStartWave();
  const campaignComplete = isCampaignComplete();
  const canContinue = !hasDebugWaveOverride && !campaignComplete && hasSavedCampaignProgress();
  const label = document.getElementById('playLabel') || playBtn.querySelector('span') || playBtn;
  const subtitle = document.getElementById('playSubtitle');
  if (canContinue) {
    const chapterName = t(authoredLevelForWave(startWave)?.nameKey || 'level.relay.name');
    label.textContent = t('start.continue');
    if (subtitle) {
      subtitle.textContent = chapterName;
      subtitle.hidden = false;
    }
  } else {
    label.textContent = t('start.play');
    if (subtitle) {
      subtitle.textContent = '';
      subtitle.hidden = true;
    }
  }
  if (newGameBtn) newGameBtn.hidden = hasDebugWaveOverride || !hasSavedCampaignProgress();
}

function openNewGameDialog(){
  if (!newGameDialog) return;
  newGameDialog.showModal();
}

function startNewGame(){
  resetCampaignPosition();
  mutations.resetCampaignRewardLedger?.();
  newGameDialog?.close?.();
  updateCampaignStartUI();
  startGame();
}

async function copyDebugLog(){
  if (!diagnosticLogsEnabled) return;
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

if (diagnosticLogsEnabled) perfLog.subscribe(scheduleDebugLogRender);

function reset(isTutorial = false){ // clear enemies
  currentRunTutorial = isTutorial === true;
  const runStartWave = isTutorial ? 1 : resolveStandardStartWave();
  const storedCheckpoint = !isTutorial && !hasDebugWaveOverride && !qaSimulationMode
    ? getCampaignCheckpointState()
    : null;
  const checkpointState = storedCheckpoint?.wave === runStartWave
    && storedCheckpoint.mutations
    && storedCheckpoint.progression
    && storedCheckpoint.weapons
    && storedCheckpoint.session
    && storedCheckpoint.player
    && storedCheckpoint.achievements
    ? storedCheckpoint
    : null;
  checkpointForceWeaponOffer = checkpointState?.forceWeaponOffer === true
    || (!checkpointState && runStartWave > 1 && runStartWave !== 41);
  activeCheckpointSnapshotWave = 0;
  hasCommittedRunWave = false;
  mutations.resetRun({ tutorial: currentRunTutorial, debug: hasDebugWaveOverride || debugShopCredits != null });
  eliminationSpectacle.reset();
  algorithmRoulette.reset();
  stagecraftDeaths.reset();
  openingActComboHold = 0;
  document.querySelectorAll('.stage-cue').forEach(cue => cue.remove());
  progression?.resetRun?.();
  weaponSystem?.resetRunInventory?.({ tutorial: currentRunTutorial });
  abilitySystem?.reset?.();
  if (!currentRunTutorial && debugAbilityId) abilitySystem?.setDebugAbility?.(debugAbilityId);
  gameOverLogged = false;
  if (diagnosticLogsEnabled) perfLog.event('game', 'reset', { tutorial: isTutorial, previousWave: enemyManager.wave });
  if (diagnosticLogsEnabled) {
    gameplayLog.reset();
    motionLog.reset();
    debugWaveBaseline = null;
    debugRunStartedAt = gameTime;
  }
  stopSuno();
  pickups.resetAll();
  pickups.resetRetentionStats();
  paused=false;
  session.reset({ weaponSystem, player, effects, sfx: S });
  if (!qaSimulationMode) achievements.check({ type: 'runStart', mode: isTutorial ? 'tutorial' : 'standard' });
  let checkpointRestored = false;
  if (checkpointState) {
    const mutationsRestored = mutations.restoreRunCheckpoint?.(checkpointState.mutations) === true;
    const progressionRestored = progression?.restoreRunCheckpoint?.(checkpointState.progression) === true;
    const weaponsRestored = weaponSystem?.restoreCheckpointState?.(checkpointState.weapons) === true;
    const sessionRestored = session.restoreCheckpointState?.(checkpointState.session) === true;
    const playerRestored = player.restoreCheckpointState?.(checkpointState.player) === true;
    const achievementsRestored = achievements.restoreRunCheckpoint?.(checkpointState.achievements) === true;
    checkpointRestored = mutationsRestored
      && progressionRestored
      && weaponsRestored
      && sessionRestored
      && playerRestored
      && achievementsRestored;
    if (diagnosticLogsEnabled) {
      perfLog.event('game', 'checkpoint_restore', {
        wave: runStartWave,
        provisional: checkpointState.provisional === true,
        restored: checkpointRestored,
        mutations: mutationsRestored,
        progression: progressionRestored,
        weapons: weaponsRestored,
        session: sessionRestored,
        player: playerRestored,
        achievements: achievementsRestored
      }, checkpointRestored ? 'info' : 'warning');
    }
    if (checkpointRestored && checkpointState.provisional !== true) activeCheckpointSnapshotWave = runStartWave;
  }
  if (checkpointState && !checkpointRestored) {
    checkpointForceWeaponOffer = runStartWave > 1 && runStartWave !== 41;
  }
  if (!isTutorial && hasDebugWaveOverride) weaponSystem.setDebugWaveLoadout();
  if (!isTutorial && !hasDebugWaveOverride && !checkpointRestored && runStartWave >= 41) weaponSystem.setPostCampaignLoadout?.();
  const prevSuspend = enemyManager.suspendWaves;
  if (isTutorial) enemyManager.suspendWaves = true;
  enemyManager.reset({ wave: runStartWave });
  if (isTutorial) enemyManager.suspendWaves = prevSuspend;
  pickups.onWave(enemyManager.wave);
  updateHUD();
  if (diagnosticLogsEnabled) {
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
  if (relayLevel.active && relayLevel.playerSpawn) {
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
    if (!isTutorial && !relayPlayerPreviewMode && !relayOverviewMode) {
      story?.startRun({
        startWave: runStartWave,
        endingState: getString('bs3d_ending_state', '')
      });
    }
  } catch (e) { logError(e); }
}

function hideCombatHelp(){
  const help = document.getElementById('desktopHelp');
  if (!help || help.classList.contains('hidden')) return;
  help.classList.add('hidden');
  setTimeout(() => { help.style.display = 'none'; }, 700);
}

let standardRunHasStarted = false;
function startGame(){
  if (!hasDebugWaveOverride && isCampaignComplete()) {
    resetCampaignPosition();
    mutations.resetCampaignRewardLedger?.();
    updateCampaignStartUI();
  }
  if (diagnosticLogsEnabled) perfLog.event('game', 'start', { mode: 'standard' });
  wave72Visuals.stop();
  enemyManager.suspendWaves = false;
  if (isMobile) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try { if (req) req.call(el); } catch (e) { logError(e); }
  } else if (!qaSimulationMode) {
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
  } else if (isAuthoredCampaignWave(resolveStandardStartWave())) {
    const nextDefinition = authoredLevelForWave(resolveStandardStartWave());
    const canReusePristineInitialLevel = !standardRunHasStarted
      && relayLevel.definition?.id === nextDefinition?.id;
    if (relayLevel.definition?.id === nextDefinition?.id) {
      if (!canReusePristineInitialLevel) relayLevel.reset();
    }
    else relayLevel.load(nextDefinition);
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
  standardRunHasStarted = true;
  if (!qaSimulationMode) {
    if (musicChoice === 'suno') { playSuno(); } else { music.start(); }
  }
}

function registerTutorialShootingTarget(){
  const collider = relayLevel.colliderObjects?.find?.(object => object?.userData?.colliderId === 'shooting-target');
  const visual = relayLevel.group?.getObjectByName?.('tutorial-shooting-target');
  if (!collider || !visual) return false;
  const target = {
    type: 'tutorialTarget',
    hp: 40,
    root: collider,
    suppressScore: true,
    suppressDefaultDrop: true,
    damage(amount) {
      this.hp -= Math.max(0, Number(amount) || 0);
      return { destroyed: this.hp <= 0, type: this.type };
    },
    onDestroyed() {
      visual.parent?.remove?.(visual);
      visual.traverse?.(node => node.geometry?.dispose?.());
      tutorial.onTargetDestroyed?.();
    }
  };
  obstacleManager.registerAbilityDestructible(target, objects);
  return true;
}

async function startTutorial(){
  if (diagnosticLogsEnabled) perfLog.event('game', 'start', { mode: 'tutorial' });
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
  currentMap = null;
  levelInfo = null;
  obstacleManager.clear();
  relayLevel.load(TUTORIAL_YARD);
  registerTutorialShootingTarget();
  enemyManager.customSpawnPoints = null;
  const tRadius = 12;
  setArenaRadius(tRadius);
  player.arenaRadius = tRadius;
  enemyManager.setArenaRadius(tRadius);
  reset(true);
  tutorial.start(TUTORIAL_YARD.tutorial);
}

function showStartPanel(){
  paused = true;
  settingsReturn = 'panel';
  playtimeTracker.persist();
  updatePlaytimeDisplay();
  updateArchiveAvailability();
  updateCampaignStartUI();
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
  if (diagnosticLogsEnabled) perfLog.event('game', 'tutorial_complete', { gameTimeSeconds: Math.round(gameTime * 10) / 10 });
  // Tear down training without creating another live tutorial session. The
  // next Play/Tutorial action performs its own full reset.
  paused = true;
  session.gameOver = true;
  enemyManager.suspendWaves = true;
  enemyManager.reset({ wave: 1 });
  pickups.resetAll();
  currentMap = null;
  obstacleManager.clear();
  if (isAuthoredCampaignWave(resolveStandardStartWave())) relayLevel.load(authoredLevelForWave(resolveStandardStartWave()));
  else obstacleManager.generate(seed, objects);
  cullGrassUnderObjects(grassMesh, objects);
  enemyManager.refreshColliders(objects);
  levelInfo = null;
  enemyManager.customSpawnPoints = null;
  setArenaRadius(DEFAULT_ARENA_RADIUS);
  player.arenaRadius = DEFAULT_ARENA_RADIUS;
  enemyManager.setArenaRadius(DEFAULT_ARENA_RADIUS);
  currentRunTutorial = false;
  paused = true;
  playtimeTracker.persist();
  updatePlaytimeDisplay();
  menuBackground?.show();
  showMenuView('tutorialComplete');
  if (!isMobile) {
    try { controls.unlock(); } catch (e) { logError(e); }
  }
  tutorialCompleteYes?.focus();
}

tutorial.onEnd = finishTutorial;

function resumeGame(){
  hideMenuView();
  paused=false;
  if (diagnosticLogsEnabled) perfLog.event('game', 'resume', { source: 'pause_menu' });
  controls.lock();
}

function showPauseMenu(source = 'system'){
  // Focus and delayed pointer-unlock events must not replace an open menu.
  if (paused || session.gameOver || document.body.classList.contains('menu-open')) return;
  if (pauseWave) pauseWave.textContent = String(enemyManager?.wave || waveEl?.textContent || 1);
  if (pauseScore) pauseScore.textContent = String(Math.floor(session.score || 0));
  showMenuView('pause');
  paused=true;
  if (diagnosticLogsEnabled) perfLog.event('game', 'pause', { source });
  resumeBtn?.focus();
}

function returnToMainMenu(){
  paused=true;
  if (diagnosticLogsEnabled) perfLog.event('game', 'exit_to_main_menu', { source: 'pause_menu' });
  showStartPanel();
}

playBtn.onclick = () => startGame();
if (newGameBtn) newGameBtn.onclick = openNewGameDialog;
if (confirmNewGameBtn) confirmNewGameBtn.onclick = startNewGame;
if (tutorialBtn) tutorialBtn.onclick = startTutorial;
if (tutorialCompleteYes) tutorialCompleteYes.onclick = startGame;
if (tutorialCompleteAlsoYes) tutorialCompleteAlsoYes.onclick = startGame;
if (tutorialPreviewMode) startTutorial();
if (openArchiveBtn) openArchiveBtn.onclick = () => openArchive('start');
if (defeatRetry) defeatRetry.onclick = startGame;
if (defeatArchive) defeatArchive.onclick = () => openArchive('defeat');
if (defeatMain) defeatMain.onclick = showStartPanel;
if (archiveBack) archiveBack.onclick = closeArchive;
if (archiveClose) archiveClose.onclick = closeArchive;
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
if (settingsOpenLog) settingsOpenLog.onclick = () => openDebugLog('settings');
window.addEventListener('qoj:languagechange', updateCampaignStartUI);
updateCampaignStartUI();
if (supportLogsToggle) supportLogsToggle.onchange = () => {
  setString(SUPPORT_LOGS_KEY, supportLogsToggle.checked ? '1' : '0');
  if (diagnosticLogsEnabled) {
    perfLog.event('settings', 'support_logs_changed', { enabled: supportLogsToggle.checked });
    perfLog.flush();
  }
  window.location.reload();
};
if (debugLogClear) debugLogClear.onclick = () => {
  perfLog.clear();
  renderDebugLog();
  if (debugLogStatus) debugLogStatus.textContent = t('debugLog.empty');
};

// Same-origin campaign QA bridge. The outer diagnostic page drives this API;
// it stays completely dormant in normal play and intentionally uses production
// level, player, enemy, boss, renderer, and wave objects.
if (qaSimulationMode) {
  let qaRecorder = null;
  let qaRunning = false;
  let qaStopRequested = false;
  let qaLastReport = null;
  let qaPaceDelayMs = 100;
  const qaProductionErrorKeys = new Set();
  let qaAIActivity = new Map();
  let qaEnemyTelemetry = new WeakMap();
  let qaLastPlayerTelemetry = null;
  let qaSceneSampleIndex = 0;
  let qaPlayerDamagePressure = null;
  let qaWaveProductionEliminations = 0;
  const qaFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const qaWaitFrames = async (count = 1) => {
    for (let index = 0; index < count; index++) await qaFrame();
  };
  const qaDelay = (multiplier = 1) => new Promise(resolve => {
    const delay = Math.max(0, Math.round(qaPaceDelayMs * multiplier));
    if (delay === 0) resolve();
    else setTimeout(resolve, delay);
  });
  const qaCheckpoint = async (frames = 1, delayMultiplier = 1) => {
    await qaWaitFrames(frames);
    await qaDelay(delayMultiplier);
  };
  const qaWorldPosition = (root, point = new THREE.Vector3()) => {
    if (!root?.position) return null;
    root.updateWorldMatrix?.(true, false);
    return root.getWorldPosition ? root.getWorldPosition(point) : point.copy(root.position);
  };
  const qaRootData = root => {
    const position = qaWorldPosition(root);
    return root ? {
      id: root.uuid || null,
      type: root.userData?.type || 'unknown',
      hp: Number(root.userData?.hp) || 0,
      maxHp: Number(root.userData?.maxHp) || 0,
      generation: Number.isFinite(Number(root.userData?.generation))
        ? Number(root.userData.generation)
        : null,
      position: position ? {
        x: roundedSigned(position.x), y: roundedSigned(position.y), z: roundedSigned(position.z)
      } : null
    } : null;
  };
  const qaRecord = (category, name, data = {}, severity = 'info') => {
    if (!qaRunning || !qaRecorder || qaRecorder.sealed) return null;
    return qaRecorder.record(category, name, data, severity) || null;
  };
  const qaError = (code, message, data = {}, source = 'assertion') => {
    if (!qaRunning || !qaRecorder || qaRecorder.sealed) return null;
    return qaRecorder.error(code, message, data, source) || null;
  };
  perfLog.subscribe(event => {
    if (!qaRunning || !qaRecorder || !event) return;
    qaRecord('production', `${event.category}.${event.name}`, {
      productionSeq: event.seq,
      data: event.data,
      notes: event.notes
    }, event.severity);
    if (shouldPromoteProductionDiagnosticToCampaignError(event)) {
      const errorKey = `${qaRecorder.currentWave?.wave ?? 'run'}:${event.category}:${event.name}`;
      if (qaProductionErrorKeys.has(errorKey)) return;
      qaProductionErrorKeys.add(errorKey);
      qaError(
        `production_${event.category}_${event.name}`,
        `Production diagnostic reported ${event.category}.${event.name}.`,
        { productionSeq: event.seq, data: event.data, notes: event.notes },
        'production_diagnostic'
      );
    }
  });
  const qaMemorySnapshot = () => {
    const memory = globalThis.performance?.memory;
    if (!memory) return null;
    return {
      usedJSHeapBytes: Number(memory.usedJSHeapSize) || 0,
      totalJSHeapBytes: Number(memory.totalJSHeapSize) || 0,
      jsHeapLimitBytes: Number(memory.jsHeapSizeLimit) || 0
    };
  };
  const qaSnapshot = () => {
    const position = controls.getObject().position;
    const info = renderer.info;
    return {
      wave: enemyManager.wave,
      levelId: relayLevel.definition?.id || 'legacy-generated-arena',
      player: {
        position: { x: position.x, y: position.y, z: position.z },
        velocity: { x: player.velXZ?.x || 0, y: player.velocityY || 0, z: player.velXZ?.z || 0 },
        stamina: player.stamina,
        grounded: player.canJump === true
      },
      hp: session.hp,
      armor: session.armor,
      score: session.score,
      alive: enemyManager.alive,
      activeEnemies: enemyManager.enemies.size,
      projectiles: (enemyManager._bulletPools?.shooter?.count || 0) + (enemyManager._bulletPools?.sniper?.count || 0),
      pickups: pickups.active?.size || 0,
      boss: qaRootData(enemyManager.bossManager?.boss?.root),
      weather: weather.mode,
      memory: qaMemorySnapshot(),
      renderer: {
        drawCalls: info?.render?.calls || 0,
        triangles: info?.render?.triangles || 0,
        geometries: info?.memory?.geometries || 0,
        textures: info?.memory?.textures || 0,
        programs: info?.programs?.length || 0
      }
    };
  };
  const qaCrowdSummonSnapshot = () => {
    const controller = enemyManager.crowdSummon;
    const ritual = controller?.active || null;
    const vector = value => value ? {
      x: roundedSigned(value.x), y: roundedSigned(value.y), z: roundedSigned(value.z)
    } : null;
    return {
      unreachableTime: roundedMs(controller?.unreachableTime || 0),
      unreachableThreshold: controller?.balance?.unreachableSeconds ?? null,
      cooldown: roundedMs(controller?.cooldown || 0),
      lastReachable: controller?._lastReachable !== false,
      startBlocker: controller?.lastStartBlocker || null,
      ritualId: ritual?.id || null,
      phase: ritual?.phase || null,
      phaseElapsed: roundedMs(ritual?.elapsed || 0),
      rally: vector(ritual?.rally),
      interruptDamage: controller?.balance?.interruptDamage ?? null,
      participants: (ritual?.participants || []).map(participant => ({
        id: String(participant.root?.uuid || '').slice(0, 48) || null,
        type: participant.root?.userData?.type || 'unknown',
        aiState: participant.root?.userData?.aiState || null,
        position: vector(qaWorldPosition(participant.root)),
        slot: vector(participant.slot),
        distanceToSlot: participant.root?.position && participant.slot
          ? roundedMs(Math.hypot(participant.root.position.x - participant.slot.x, participant.root.position.z - participant.slot.z))
          : null,
        arrived: participant.arrived === true,
        pathReady: participant.pathReady === true,
        movementLocked: participant.root?.userData?.movementLocked === true,
        channelDamage: roundedMs(participant.channelDamage || 0)
      }))
    };
  };
  const qaRecordSceneSample = reason => {
    if (!qaRecorder?.currentWave) return null;
    const sampledAt = gameTime;
    const playerPosition = controls.getObject().position;
    const roots = Array.from(enemyManager.enemies).filter(root => root?.position);
    const positioned = roots.map(root => ({ root, position: qaWorldPosition(root) })).filter(item => item.position);
    const enemies = positioned.map((item, index) => {
      const { root, position } = item;
      const previous = qaEnemyTelemetry.get(root);
      const seconds = previous ? Math.max(.001, sampledAt - previous.at) : 0;
      const moved = previous ? position.distanceTo(previous.position) : 0;
      const instance = enemyManager.instanceByRoot?.get?.(root) || null;
      const state = {};
      for (const key of ['state', '_state', 'phase', '_phase', '_meleeState']) {
        const value = instance?.[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') state[key] = value;
      }
      const nearestAllyDistance = positioned.reduce((nearest, other, otherIndex) => (
        otherIndex === index ? nearest : Math.min(nearest, position.distanceTo(other.position))
      ), Infinity);
      qaEnemyTelemetry.set(root, { at: sampledAt, position: position.clone() });
      return {
        id: String(root.uuid || root.userData?.enemyId || `${root.userData?.type || 'enemy'}-${index}`).slice(0, 48),
        type: root.userData?.type || 'unknown',
        behavior: root.userData?.behaviorId || instance?.constructor?.name || null,
        generation: root.userData?.generation ?? null,
        hp: Number(root.userData?.hp) || 0,
        position: { x: roundedSigned(position.x), y: roundedSigned(position.y), z: roundedSigned(position.z) },
        distanceToPlayer: roundedMs(position.distanceTo(playerPosition)),
        nearestAllyDistance: Number.isFinite(nearestAllyDistance) ? roundedMs(nearestAllyDistance) : null,
        movedSinceSample: roundedMs(moved),
        sampledSpeed: seconds > 0 ? roundedMs(moved / seconds) : null,
        aiState: root.userData?.aiState || null,
        movementLocked: root.userData?.movementLocked === true,
        crowdSummonParticipant: root.userData?.crowdSummonParticipant || null,
        crowdSummoned: root.userData?.crowdSummoned === true,
        crowdSummonRitualId: root.userData?.crowdSummonRitualId || null,
        state
      };
    });
    const playerMoved = qaLastPlayerTelemetry
      ? playerPosition.distanceTo(qaLastPlayerTelemetry.position)
      : 0;
    const playerSeconds = qaLastPlayerTelemetry
      ? Math.max(.001, sampledAt - qaLastPlayerTelemetry.at)
      : 0;
    qaLastPlayerTelemetry = { at: sampledAt, position: playerPosition.clone() };
    const distances = enemies.map(enemy => enemy.distanceToPlayer);
    return qaRecord('telemetry', 'scene_sample', {
      index: ++qaSceneSampleIndex,
      reason,
      gameTime: roundedMs(sampledAt),
      levelId: relayLevel.definition?.id || 'legacy-generated-arena',
      player: {
        position: { x: roundedSigned(playerPosition.x), y: roundedSigned(playerPosition.y), z: roundedSigned(playerPosition.z) },
        velocity: {
          x: roundedSigned(player.velXZ?.x || 0),
          y: roundedSigned(player.velocityY || 0),
          z: roundedSigned(player.velXZ?.z || 0)
        },
        sampledSpeed: playerSeconds > 0 ? roundedMs(playerMoved / playerSeconds) : null,
        movedSinceSample: roundedMs(playerMoved),
        movementInput: Array.from(player.keys).sort(),
        grounded: player.canJump === true,
        hp: session.hp,
        armor: session.armor,
        stamina: roundedMs(player.stamina),
        incomingDamage: qaPlayerDamagePressure ? {
          attempts: qaPlayerDamagePressure.attempts,
          total: roundedMs(qaPlayerDamagePressure.total),
          peak: roundedMs(qaPlayerDamagePressure.peak)
        } : null
      },
      encounter: {
        activeEnemies: enemies.length,
        reservedAlive: enemyManager.alive,
        queuedEnemies: enemyManager._authoredSpawnQueue?.length || 0,
        roster: summarizeRoster(enemies.map(enemy => enemy.type)),
        nearestEnemyDistance: distances.length ? Math.min(...distances) : null,
        enemiesWithin2m: distances.filter(distance => distance <= 2).length,
        enemiesWithin5m: distances.filter(distance => distance <= 5).length,
        enemiesWithin10m: distances.filter(distance => distance <= 10).length,
        crowdSummon: qaCrowdSummonSnapshot(),
        objective: relayLevel.objectiveState ? {
          kind: relayLevel.objectiveState.kind,
          progress: relayLevel.objectiveState.progress,
          contested: relayLevel.objectiveState.contested === true,
          activeTargetKey: relayLevel.objectiveState.activeTargetKey || null
        } : null
      },
      scene: {
        movementColliders: enemyManager.objectBBs?.length || 0,
        shotBlockers: enemyManager.shotBlockers?.length || 0,
        drawCalls: renderer.info?.render?.calls || 0,
        triangles: renderer.info?.render?.triangles || 0,
        memory: qaMemorySnapshot()
      },
      enemies
    });
  };
  const qaTrackAIActivity = event => {
    if (!qaRecorder?.currentWave || !event) return { count: 0, throttled: false };
    const name = event.type || 'event';
    const type = event.root?.userData?.type || event.enemyType || event.enemyId || 'unknown';
    const qualifier = event.blockedBy || event.ability || event.sourceKind || '';
    const key = `${name}:${type}:${qualifier}`;
    let activity = qaAIActivity.get(key);
    if (!activity) {
      activity = {
        name, type, qualifier: qualifier || null, count: 0,
        firstGameTime: roundedMs(gameTime), lastGameTime: roundedMs(gameTime),
        actorIds: new Set(), bounds: null
      };
      qaAIActivity.set(key, activity);
    }
    activity.count++;
    activity.lastGameTime = roundedMs(gameTime);
    if (event.root?.uuid && activity.actorIds.size < 24) activity.actorIds.add(event.root.uuid);
    const position = qaWorldPosition(event.root);
    if (position) {
      activity.bounds ||= { minX: position.x, maxX: position.x, minY: position.y, maxY: position.y, minZ: position.z, maxZ: position.z };
      activity.bounds.minX = Math.min(activity.bounds.minX, position.x);
      activity.bounds.maxX = Math.max(activity.bounds.maxX, position.x);
      activity.bounds.minY = Math.min(activity.bounds.minY, position.y);
      activity.bounds.maxY = Math.max(activity.bounds.maxY, position.y);
      activity.bounds.minZ = Math.min(activity.bounds.minZ, position.z);
      activity.bounds.maxZ = Math.max(activity.bounds.maxZ, position.z);
    }
    return { count: activity.count, throttled: shouldThrottleCampaignAIEvent(name) };
  };
  const qaFlushAIActivity = () => {
    if (!qaAIActivity.size || !qaRecorder?.currentWave) return;
    const activity = Array.from(qaAIActivity.values()).map(item => ({
      name: item.name,
      type: item.type,
      qualifier: item.qualifier,
      count: item.count,
      firstGameTime: item.firstGameTime,
      lastGameTime: item.lastGameTime,
      actorIds: Array.from(item.actorIds),
      bounds: item.bounds ? {
        minX: roundedSigned(item.bounds.minX), maxX: roundedSigned(item.bounds.maxX),
        minY: roundedSigned(item.bounds.minY), maxY: roundedSigned(item.bounds.maxY),
        minZ: roundedSigned(item.bounds.minZ), maxZ: roundedSigned(item.bounds.maxZ)
      } : null
    })).sort((left, right) => right.count - left.count);
    qaRecord('telemetry', 'ai_activity_summary', { wave: qaRecorder.currentWave.wave, activity });
    qaAIActivity.clear();
  };
  const qaFlushPlayerDamagePressure = () => {
    if (!qaPlayerDamagePressure || qaPlayerDamagePressure.flushed || !qaRecorder?.currentWave) return;
    qaPlayerDamagePressure.flushed = true;
    qaRecord('telemetry', 'player_damage_summary', {
      wave: qaRecorder.currentWave.wave,
      simulationInvulnerable: true,
      attempts: qaPlayerDamagePressure.attempts,
      totalIncomingDamage: roundedMs(qaPlayerDamagePressure.total),
      peakHit: roundedMs(qaPlayerDamagePressure.peak),
      firstGameTime: qaPlayerDamagePressure.firstGameTime,
      lastGameTime: qaPlayerDamagePressure.lastGameTime,
      bySource: qaPlayerDamagePressure.bySource
    });
  };
  const qaPlannedWave = wave => {
    const special = enemyManager.specialWaveState?.definition;
    if (special) {
      const rosterTotal = roster => Object.values(roster || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
      const initial = rosterTotal(special.initialRoster);
      const reinforcement = rosterTotal(special.reinforcementRoster);
      return {
        mode: 'special_encounter', id: special.id, total: initial + reinforcement * (special.packageCount - 1),
        initialRoster: { ...special.initialRoster }, reinforcementRoster: { ...special.reinforcementRoster },
        packageCount: special.packageCount, activeCap: special.activeCap
      };
    }
    const authored = relayLevel.definition?.waves?.[wave];
    if (authored) {
      const types = authored.packages?.flat?.() || [];
      return {
        mode: authored.boss ? 'authored_boss' : 'authored_packages',
        id: authored.id || null,
        boss: authored.boss || null,
        total: authored.boss ? 1 : types.length,
        roster: summarizeRoster(types),
        packages: authored.packages?.map(pkg => summarizeRoster(pkg)) || []
      };
    }
    return { mode: wave % 5 === 0 && enemyManager.bossManager?.active ? 'legacy_boss' : 'legacy_wave', total: enemyManager.alive };
  };
  const qaLoadWaveEnvironment = wave => {
    if (isAuthoredCampaignWave(wave)) {
      const definition = authoredLevelForWave(wave);
      if (relayLevel.definition?.id !== definition.id) {
        const previousLevelId = relayLevel.definition?.id || null;
        pickups.resetAll();
        relayLevel.load(definition);
        repairSceneMaterialBuildHooks('qa_level_loaded');
        qaRecord('resource', 'level_transition_cleanup', {
          fromLevelId: previousLevelId,
          toLevelId: definition.id,
          disposed: relayLevel.lastDisposedResources,
          activePickups: pickups.active.size
        });
      }
      if (relayLevel.definition?.id !== definition.id) {
        qaError('level_environment_mismatch', 'Campaign wave loaded the wrong authored environment.', {
          wave,
          expectedLevelId: definition.id,
          actualLevelId: relayLevel.definition?.id || null
        }, 'level-routing');
      } else {
        qaRecord('resource', 'level_environment_ready', {
          wave,
          levelId: definition.id
        });
      }
      return;
    }
    if (relayLevel.active) {
      pickups.resetAll();
      relayLevel.unload();
      obstacleManager.generate(seed, objects);
      cullGrassUnderObjects(grassMesh, objects);
      player.refreshColliders?.(objects);
      enemyManager.refreshColliders?.(objects);
      enemyManager.customSpawnPoints = null;
      levelInfo = null;
    }
  };
  const qaMaterializeInitialWave = () => {
    enemyManager._updateAuthoredSpawnQueue?.(1);
    enemyManager._updateSpecialWave?.(1);
  };
  const qaRunRelayCarSummonScenario = async wave => {
    const collider = relayLevel.definition?.colliders?.find(item => item.id === 'south-cover-east-van-body');
    if (wave !== 1 || relayLevel.definition?.id !== 'relay-district' || !collider?.position || !collider?.size) {
      const context = { wave, levelId: relayLevel.definition?.id || null, colliderFound: !!collider };
      qaError('relay_car_perch_unavailable', 'Relay car summon QA requires Relay District Wave 1 and its south roadblock collider.', context);
      return { id: 'relay-car-summon', complete: false, context };
    }

    const perch = {
      x: collider.position[0],
      y: collider.position[1] + collider.size[1] / 2 + 1.7,
      z: collider.position[2]
    };
    player.keys.clear();
    // resetPosition is intentionally a safe *ground-spawn* helper: its
    // clearance probe checks the ground-level body volume and therefore moves
    // a requested point off any prop beneath it. This scenario specifically
    // needs an already-landed elevated player, so seed the production
    // controller and its grounding cache at the verified collider top.
    player.crouching = false;
    controls.getObject().position.set(perch.x, perch.y, perch.z);
    player.velocityY = 0;
    player.velXZ.set(0, 0, 0);
    player.canJump = true;
    if (player._groundCache) {
      player._groundCache.x = perch.x;
      player._groundCache.y = perch.y - 1.7;
      player._groundCache.z = perch.z;
    }
    player.yawObject.rotation.y = Math.PI;
    await qaCheckpoint(3, .25);

    const startedAt = gameTime;
    const deadline = startedAt + 32;
    let nextSampleAt = startedAt;
    let previousPhase = null;
    let maximumPerchDrift = 0;
    let selectedParticipantIds = [];
    const phasesSeen = new Set();
    let formationSpacing = null;
    qaRecord('scenario', 'relay_car_summon_started', {
      id: 'relay-car-summon', wave, colliderId: collider.id, perch,
      expected: { triggerSeconds: 15, participants: 3, roster: ['pelican', 'pelican', 'swarm_warden'], minimumAirSpawnDistance: 14 }
    });
    qaRecordSceneSample('relay-car-summon-start');

    while (gameTime < deadline && !qaStopRequested && !qaRecorder?.stopped) {
      const playerPosition = controls.getObject().position;
      maximumPerchDrift = Math.max(maximumPerchDrift, Math.hypot(
        playerPosition.x - perch.x,
        playerPosition.y - perch.y,
        playerPosition.z - perch.z
      ));
      const ritual = enemyManager.crowdSummon?.active || null;
      const phase = ritual?.phase || null;
      if (phase) phasesSeen.add(phase);
      if (ritual?.participants?.length && selectedParticipantIds.length === 0) {
        selectedParticipantIds = ritual.participants.map(participant => participant.root?.uuid || null);
      }
      if ((phase === 'forming' || phase === 'channeling') && ritual?.participants?.length === 3) {
        const positions = ritual.participants.map(participant => participant.root.position);
        formationSpacing = Math.min(
          Math.hypot(positions[0].x - positions[1].x, positions[0].z - positions[1].z),
          Math.hypot(positions[0].x - positions[2].x, positions[0].z - positions[2].z),
          Math.hypot(positions[1].x - positions[2].x, positions[1].z - positions[2].z)
        );
      }
      if (phase !== previousPhase) {
        qaRecordSceneSample(`relay-car-summon-phase-${phase || 'waiting'}`);
        previousPhase = phase;
      }
      if (gameTime >= nextSampleAt) {
        qaRecordSceneSample(`relay-car-summon-second-${Math.floor(gameTime - startedAt)}`);
        nextSampleAt += 1;
      }
      const summoned = [...enemyManager.enemies].filter(root => root.userData?.crowdSummoned === true);
      if (!ritual && summoned.length >= 3) break;
      await qaCheckpoint(1, .1);
    }

    qaRecordSceneSample('relay-car-summon-result');
    const summoned = [...enemyManager.enemies].filter(root => root.userData?.crowdSummoned === true);
    const playerPosition = controls.getObject().position;
    const horizontalDistance = root => Math.hypot(root.position.x - playerPosition.x, root.position.z - playerPosition.z);
    const roster = summarizeRoster(summoned.map(root => root.userData?.type || 'unknown'));
    const minimumSummonDistance = summoned.length ? Math.min(...summoned.map(horizontalDistance)) : 0;
    const result = {
      id: 'relay-car-summon', complete: summoned.length >= 3,
      elapsed: roundedMs(gameTime - startedAt), perch,
      playerPosition: { x: roundedSigned(playerPosition.x), y: roundedSigned(playerPosition.y), z: roundedSigned(playerPosition.z) },
      maximumPerchDrift: roundedMs(maximumPerchDrift),
      selectedParticipantIds,
      phasesSeen: [...phasesSeen],
      formationSpacing: formationSpacing == null ? null : roundedMs(formationSpacing),
      roster,
      minimumSummonDistance: roundedMs(minimumSummonDistance),
      summonPositions: summoned.map(qaRootData)
    };
    if (maximumPerchDrift > .3) qaError('relay_car_player_slid', 'Player did not remain stable on the Relay roadblock.', result);
    if (selectedParticipantIds.length !== 3) qaError('relay_car_summoners_missing', 'Exactly three regular enemies were not selected for the car-perch ritual.', result);
    for (const phase of ['gathering', 'forming', 'channeling']) {
      if (!phasesSeen.has(phase)) qaError(`relay_car_${phase}_missing`, `Car-perch ritual never entered ${phase}.`, result);
    }
    if (!(formationSpacing >= 1.5)) qaError('relay_car_formation_spacing', 'Summoners did not hold the configured separated circle.', result);
    if (summoned.length !== 3) qaError('relay_car_summon_incomplete', 'Car-perch ritual did not replace the trio with three aerial enemies before timeout.', result);
    if (roster.pelican !== 2 || roster.swarm_warden !== 1) qaError('relay_car_summon_roster', 'Car-perch ritual did not produce two Pelicans and one Swarm Warden.', result);
    if (summoned.length && minimumSummonDistance < 14) qaError('relay_car_summon_too_close', 'A car-perch summon appeared within 14 metres of the player.', result);
    qaRecord('scenario', 'relay_car_summon_completed', result, result.complete ? 'info' : 'error');
    return result;
  };
  let qaCombatSession = null;
  const qaAimBounds = new THREE.Box3();
  const qaEnemyAimPoint = (root, point = new THREE.Vector3()) => {
    if (!root?.position) return null;
    const type = String(root.userData?.type || '');
    const head = root.userData?.head;
    const isHydraclone = type === 'hydraclone' || type === 'boss_hydraclone';
    if (head?.getWorldPosition && (isHydraclone || type === 'healer' || type.startsWith('boss_'))) {
      head.updateWorldMatrix?.(true, false);
      head.getWorldPosition(point);
    } else if (isHydraclone) {
      root.updateWorldMatrix?.(true, true);
      qaAimBounds.makeEmpty().setFromObject(root, true);
      if (!qaAimBounds.isEmpty()) qaAimBounds.getCenter(point);
      else qaWorldPosition(root, point);
    } else {
      qaWorldPosition(root, point);
      // Preserve the proven humanoid chest aim for normal enemies. Compact
      // Zeppelin engine targets use their authored root centre.
      if (type !== 'boss_pod_engine') point.y += 0.8;
    }
    return point;
  };
  const qaAimAtEnemy = root => {
    const point = qaEnemyAimPoint(root);
    if (!point) return null;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const dz = point.z - origin.z;
    player.yawObject.rotation.y = Math.atan2(-dx, -dz);
    camera.rotation.x = Math.atan2(dy, Math.max(0.001, Math.hypot(dx, dz)));
    player.yawObject.updateMatrixWorld?.(true);
    camera.updateMatrixWorld?.(true);
    return { point, distance: Math.hypot(dx, dy, dz) };
  };
  const qaProbeLineOfFireFrom = (target, originOverride = null) => {
    const point = qaEnemyAimPoint(target);
    if (!point) return { clear: false, reason: 'target_missing' };
    const origin = originOverride
      ? new THREE.Vector3(originOverride.x, originOverride.y ?? controls.getObject().position.y, originOverride.z)
      : camera.getWorldPosition(new THREE.Vector3());
    const direction = point.clone().sub(origin);
    const targetDistance = direction.length();
    if (targetDistance <= .001) return { clear: false, reason: 'target_too_close' };
    raycaster.set(origin, direction.multiplyScalar(1 / targetDistance));
    raycaster.near = 0;
    raycaster.far = targetDistance + 2;
    const candidates = enemyManager.getEnemyRaycastTargets?.() || Array.from(enemyManager.enemies);
    const enemyHit = candidates.length ? raycaster.intersectObjects(candidates, true)[0] || null : null;
    const shotBlockers = enemyManager.shotBlockers?.length
      ? enemyManager.shotBlockers
      : objects.filter(object => object?.userData?.blocksShots !== false);
    const worldHit = shotBlockers.length ? raycaster.intersectObjects(shotBlockers, true)[0] || null : null;
    let enemyRoot = enemyHit?.object || null;
    while (enemyRoot && !enemyManager.enemies.has(enemyRoot)) enemyRoot = enemyRoot.parent;
    const assessment = evaluateCampaignLineOfFire({
      target,
      enemyRoot,
      enemyDistance: enemyHit?.distance,
      worldDistance: worldHit?.distance
    });
    let worldOwner = worldHit?.object || null;
    let namedWorldOwner = worldOwner?.name ? worldOwner : null;
    for (let owner = worldOwner; owner; owner = owner.parent) {
      if (!namedWorldOwner && owner.name) namedWorldOwner = owner;
      if (owner.userData?.colliderId) {
        worldOwner = owner;
        break;
      }
      if (!owner.parent) worldOwner = namedWorldOwner || worldOwner;
    }
    return {
      ...assessment,
      targetDistance: roundedMs(targetDistance),
      enemyDistance: enemyHit ? roundedMs(enemyHit.distance) : null,
      worldDistance: worldHit ? roundedMs(worldHit.distance) : null,
      blockingEnemy: enemyRoot && enemyRoot !== target ? qaRootData(enemyRoot) : null,
      colliderId: worldOwner?.userData?.colliderId || null,
      worldObject: worldOwner?.name || null
    };
  };
  const qaProbeLineOfFire = target => qaProbeLineOfFireFrom(target);
  const qaSelectCombatTarget = () => {
    const boss = enemyManager.bossManager?.boss || null;
    const playerPosition = controls.getObject().position;
    return selectCampaignCombatTarget(
      Array.from(enemyManager.enemies).filter(root => root?.position && Number(root.userData?.hp) > 0),
      {
        bossRoot: boss?.root || null,
        bossInvulnerable: boss?.invuln === true,
        distanceSquared: root => {
          const position = qaWorldPosition(root);
          return position ? playerPosition.distanceToSquared(position) : Infinity;
        },
        lineOfFireClear: root => qaProbeLineOfFire(root).clear
      }
    );
  };
  const qaWaitForReload = async () => {
    let guard = 0;
    while (weaponView?.isReloading?.() && !qaRecorder?.stopped && guard++ < 180) {
      await qaCheckpoint(1, 0.25);
    }
  };
  const qaEnsureCombatAmmo = async stats => {
    if (weaponSystem.getAmmo() > 0) return true;
    if (weaponSystem.getReserve() <= 0) {
      const capacity = weaponSystem.current?.getReserveCapacity?.() || 36;
      weaponSystem.current?.addReserve?.(Math.max(1, capacity));
      stats.resupplies++;
      qaRecord('combat', 'qa_ammo_resupply', {
        weapon: weaponSystem.current?.name || null,
        amount: capacity,
        reason: 'campaign endurance; damage and removal paths remain production-backed'
      }, 'warning');
    }
    weaponSystem.reload();
    stats.reloads++;
    qaRecord('combat', 'reload', {
      weapon: weaponSystem.current?.name || null,
      magazine: weaponSystem.getAmmo(),
      reserve: weaponSystem.getReserve()
    });
    await qaWaitForReload();
    return weaponSystem.getAmmo() > 0;
  };
  const qaAlignWithinObjective = async (holdPosition, {
    target = null,
    force = false,
    reason = 'objective_hold'
  } = {}) => {
    if (!holdPosition) return { aligned: true, attempts: 0, player: qaSnapshot().player };
    const current = controls.getObject().position;
    const stateActive = !target || isCampaignObjectiveAlignmentActive(relayLevel.objectiveState, target);
    if (!force
      && stateActive
      && isCampaignObjectivePositionInside(holdPosition, current, holdPosition.radius, .05)) {
      return { aligned: true, attempts: 0, player: qaSnapshot().player };
    }
    const projected = leashObjectivePosition(holdPosition, current, holdPosition.radius, .55);
    const candidates = [projected, ...buildObjectiveAlignmentCandidates(holdPosition, holdPosition.radius)];
    const attempted = [];
    for (const candidate of candidates) {
      player.resetPosition(candidate.x, candidate.y, candidate.z);
      await qaCheckpoint(1, .08);
      const actual = controls.getObject().position;
      const inside = isCampaignObjectivePositionInside(holdPosition, actual, holdPosition.radius, .05);
      const active = !target || isCampaignObjectiveAlignmentActive(relayLevel.objectiveState, target);
      attempted.push({
        requested: { x: roundedSigned(candidate.x), y: roundedSigned(candidate.y), z: roundedSigned(candidate.z) },
        actual: { x: roundedSigned(actual.x), y: roundedSigned(actual.y), z: roundedSigned(actual.z) },
        inside,
        active
      });
      if (inside && active) {
        const result = { aligned: true, attempts: attempted.length, player: qaSnapshot().player };
        if (attempted.length > 1 || force) qaRecord('objective', 'collision_safe_alignment', {
          reason, holdPosition, ...result, attempted
        });
        return result;
      }
    }
    const result = { aligned: false, attempts: attempted.length, player: qaSnapshot().player, attempted };
    qaRecord('objective', 'collision_safe_alignment_failed', { reason, holdPosition, ...result }, 'warning');
    return result;
  };
  const qaRepositionForCombat = async (target, repositionIndex, holdPosition = null, blockage = null) => {
    const aim = qaAimAtEnemy(target);
    if (!aim) return;
    const preMoveProbe = qaProbeLineOfFire(target);
    const productionAimMismatch = isCampaignProductionAimMismatch({
      probe: preMoveProbe,
      shot: blockage
    });
    const stableSide = String(target.uuid || target.userData?.type || '').charCodeAt(0) % 2 ? 'KeyA' : 'KeyD';
    const oppositeSide = stableSide === 'KeyA' ? 'KeyD' : 'KeyA';
    const movementOrder = buildCampaignCombatRepositionOrder({
      productionAimMismatch,
      worldDistance: blockage?.worldDistance,
      aimDistance: aim.distance,
      stableSide,
      oppositeSide
    });
    const hasBlockerDistance = blockage?.worldDistance != null
      && blockage?.worldDistance !== ''
      && Number.isFinite(Number(blockage.worldDistance));
    const blockerDistance = hasBlockerDistance ? Number(blockage.worldDistance) : Infinity;
    const recoveryMode = productionAimMismatch
      ? 'production_aim_mismatch_approach'
      : blockerDistance < 1.5
      ? 'world_blocker_backoff'
      : blockerDistance + .75 < aim.distance
      ? 'world_blocker_circumnavigation'
      : 'standard';
    const orderIndex = (Math.max(1, repositionIndex) - 1) % movementOrder.length;
    const key = movementOrder[orderIndex];
    const before = controls.getObject().position.clone();
    const movementKeysAttempted = [];
    const drive = async moveKey => {
      movementKeysAttempted.push(moveKey);
      player.keys.add(moveKey);
      if (repositionIndex % 4 === 0) player.keys.add('ShiftLeft');
      try {
        await qaCheckpoint(48, 0.35);
      } finally {
        player.keys.delete(moveKey);
        player.keys.delete('ShiftLeft');
      }
    };
    await drive(key);
    // The Wave 46 report exposed an approach vector pinned against a
    // Sandstorm Expanse sandbank for 60 shots. Try the next deterministic
    // lateral/backoff exit immediately instead of firing again from the exact
    // same collision-resolved position.
    if (productionAimMismatch
      && before.distanceTo(controls.getObject().position) < .05
      && movementOrder.length > 1) {
      const fallbackKey = movementOrder[(orderIndex + 1) % movementOrder.length];
      if (fallbackKey !== key) await drive(fallbackKey);
    }
    let objectiveLeash = null;
    if (holdPosition) {
      objectiveLeash = await qaAlignWithinObjective(holdPosition, { reason: 'combat_reposition' });
    }
    qaRecord('combat', 'reposition', {
      key, target: qaRootData(target), player: qaSnapshot().player,
      objectiveLeash, blockage,
      recoveryMode, movementOrder, movementKeysAttempted,
      moved: roundedMs(before.distanceTo(controls.getObject().position)),
      lineOfFire: qaProbeLineOfFire(target)
    });
  };
  const qaScaleCurrentWeaponCooldown = () => {
    const weapon = weaponSystem.current;
    if (!weapon || !Number.isFinite(weapon._nextFireAtMs) || qaSimulationTimeScale === 1) return;
    const now = performance.now();
    const remainingMs = Math.max(0, weapon._nextFireAtMs - now);
    weapon._nextFireAtMs = now + remainingMs / qaSimulationTimeScale;
  };
  const qaPlanFiringRoute = async (target, holdPosition = null) => {
    const current = controls.getObject().position;
    const candidates = buildCombatFiringPositionCandidates({
      target: qaWorldPosition(target),
      current,
      arenaRadius: player.arenaRadius,
      holdPosition
    });
    const obstacles = enemyManager.objectBBs || [];
    const clearCandidates = [];
    let sliceStartedAt = performance.now();
    for (let index = 0; index < candidates.length; index++) {
      // Candidate raycasts and A* are intentionally synchronous, but a full
      // occlusion search can cover 80 positions. Yield between small CPU
      // slices so Chrome can paint/respond instead of declaring the page hung.
      if (index > 0 && (index % 6 === 0 || performance.now() - sliceStartedAt >= 8)) {
        await qaFrame();
        sliceStartedAt = performance.now();
        if (qaRecorder?.stopped || !enemyManager.enemies.has(target)) break;
      }
      const candidate = candidates[index];
      const lineOfFire = qaProbeLineOfFireFrom(target, candidate);
      if (!lineOfFire.clear) continue;
      if (clearCandidates.length < 8) clearCandidates.push({ candidate, lineOfFire });
      const path = findPath(current, candidate, obstacles, {
        gridSize: 1,
        radius: 3,
        agentRadius: .55
      });
      if (path.length > 1) return {
        candidate,
        path,
        lineOfFire,
        clearCandidates,
        candidatesChecked: index + 1
      };
    }
    return {
      candidate: clearCandidates[0]?.candidate || null,
      path: [],
      lineOfFire: clearCandidates[0]?.lineOfFire || null,
      clearCandidates,
      candidatesChecked: candidates.length
    };
  };
  const qaRelocateForStationaryMechanic = async (target, routePlan) => {
    const type = String(target?.userData?.type || '');
    if (!type.startsWith('boss_node_') || !routePlan?.clearCandidates?.length) return null;
    const before = controls.getObject().position.clone();
    const attempts = [];
    for (const entry of routePlan.clearCandidates) {
      const candidate = entry.candidate;
      player.resetPosition(candidate.x, candidate.y, candidate.z);
      await qaCheckpoint(2, .15);
      const actual = controls.getObject().position;
      const lineOfFire = qaProbeLineOfFire(target);
      attempts.push({
        requested: candidate,
        actual: {
          x: roundedSigned(actual.x),
          y: roundedSigned(actual.y),
          z: roundedSigned(actual.z)
        },
        lineOfFire
      });
      if (!lineOfFire.clear) continue;
      const result = {
        success: true,
        target: qaRootData(target),
        moved: roundedMs(before.distanceTo(actual)),
        attempts
      };
      qaRecord('combat', 'stationary_mechanic_firing_position', result);
      return result;
    }
    const result = { success: false, target: qaRootData(target), attempts };
    qaRecord('combat', 'stationary_mechanic_firing_position_failed', result, 'warning');
    return result;
  };
  const qaDriveFiringRoute = async (target, routePlan, holdPosition = null) => {
    const started = controls.getObject().position.clone();
    let frames = 0;
    let stalledSegments = 0;
    let reachedWaypoints = 0;
    player.keys.add('KeyW');
    try {
      for (const waypoint of routePlan.path.slice(1)) {
        let waypointGuard = 0;
        while (!qaRecorder?.stopped && enemyManager.enemies.has(target) && waypointGuard++ < 18 && frames < 720) {
          const position = controls.getObject().position;
          const dx = waypoint.x - position.x;
          const dz = waypoint.z - position.z;
          if (Math.hypot(dx, dz) <= .7) break;
          player.yawObject.rotation.y = Math.atan2(-dx, -dz);
          const before = position.clone();
          await qaCheckpoint(8, .08);
          frames += 8;
          const moved = before.distanceTo(controls.getObject().position);
          stalledSegments = moved < .04 ? stalledSegments + 1 : 0;
          if (qaProbeLineOfFire(target).clear || stalledSegments >= 4) break;
        }
        reachedWaypoints++;
        if (qaProbeLineOfFire(target).clear || stalledSegments >= 4 || frames >= 720) break;
      }
    } finally {
      player.keys.delete('KeyW');
      player.keys.delete('ShiftLeft');
    }
    let objectiveLeash = null;
    if (holdPosition) {
      objectiveLeash = await qaAlignWithinObjective(holdPosition, { reason: 'combat_firing_route' });
    }
    const result = {
      candidate: routePlan.candidate,
      candidatesChecked: routePlan.candidatesChecked,
      waypoints: routePlan.path.length,
      reachedWaypoints,
      frames,
      moved: roundedMs(started.distanceTo(controls.getObject().position)),
      stalled: stalledSegments >= 4,
      objectiveLeash,
      lineOfFire: qaProbeLineOfFire(target),
      player: qaSnapshot().player
    };
    qaRecord('combat', 'firing_route_complete', result, result.lineOfFire.clear ? 'info' : 'warning');
    return result;
  };
  const qaTryBossSupportWell = (wave, label, stats, authoredBoss = false) => {
    const bossActive = !!(enemyManager.bossManager?.active && enemyManager.bossManager?.boss);
    if (!shouldUseCampaignBossSupport({ authoredBoss, bossActive })
      || enemyManager.enemies.size < DEFAULT_CAMPAIGN_BOSS_SUPPORT_MIN_TARGETS) return false;
    if (abilitySystem?.hasActivePayload?.('gravity_well') === true) return false;
    if (abilitySystem?.getState?.('gravity_well')?.ready !== true) return false;
    const cluster = selectCampaignAreaSupportTarget(enemyManager.enemies, { radius: 8 });
    const targetPosition = cluster?.target ? qaWorldPosition(cluster.target) : null;
    if (!targetPosition) return false;
    const activated = abilitySystem.activateById?.('gravity_well', {
      cooldownSeconds: DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS,
      context: {
        ...weaponSystem.context(),
        playerController: player,
        session,
        suppressGravityPlayerPull: true,
        abilityTargetPoint: targetPosition
      }
    }) === true;
    if (!activated) return false;
    stats.gravityWells++;
    qaRecord('combat', 'boss_support_gravity_well', {
      wave,
      label,
      cooldownSeconds: DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS,
      activeEnemies: enemyManager.enemies.size,
      clusteredTargets: cluster.count,
      clusteredHp: cluster.hp,
      target: qaRootData(cluster.target),
      position: targetPosition
    });
    return true;
  };
  const qaDefeatActiveEnemies = async ({
    wave,
    label,
    holdPosition = null,
    shouldHoldPosition = null,
    getObjectiveProgress = null,
    isObjectiveContested = null,
    authoredBoss = false
  }) => {
    const stats = {
      wave, label, weapon: weaponSystem.current?.name || null,
      activeBefore: enemyManager.enemies.size, kills: 0, shots: 0, hits: 0,
      misses: 0, reloads: 0, resupplies: 0, repositions: 0,
      blockedSightChecks: 0, blockedShots: 0, alignmentRoutes: 0, alignmentDistance: 0,
      productionAimMismatches: 0,
      objectiveHoldReleased: false,
      objectiveDefenseWaits: 0,
      objectiveProgressResets: 0,
      stationaryMechanicRelocations: 0,
      gravityWells: 0,
      gravityWellCooldownSeconds: DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS,
      progressTimeoutMs: DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS,
      durationMs: 0, activeAfter: null
    };
    if (qaRecorder?.stopped || enemyManager.enemies.size === 0) {
      stats.activeAfter = enemyManager.enemies.size;
      return stats;
    }

    const startedAt = performance.now();
    qaCombatSession = stats;
    qaRecord('combat', 'engagement_started', { wave, label, activeEnemies: stats.activeBefore, weapon: stats.weapon });
    let target = null;
    let activeHoldPosition = holdPosition;
    let targetShotsWithoutDamage = 0;
    let targetProgressAt = 0;
    let targetBestHp = Infinity;
    let observedKills = 0;
    let nextBossSupportAttemptAt = 0;
    let bestObjectiveProgress = typeof getObjectiveProgress === 'function'
      ? Number(getObjectiveProgress()) || 0
      : null;
    try {
      while (enemyManager.enemies.size > 0 && !qaRecorder?.stopped) {
        if (bestObjectiveProgress != null) {
          const objectiveProgress = Number(getObjectiveProgress());
          if (Number.isFinite(objectiveProgress) && objectiveProgress > bestObjectiveProgress + .0001) {
            bestObjectiveProgress = objectiveProgress;
            targetProgressAt = gameTime * 1000;
            stats.objectiveProgressResets++;
          }
        }
        if (stats.kills > observedKills) {
          observedKills = stats.kills;
          targetProgressAt = gameTime * 1000;
        }
        const bossSupportEligible = shouldUseCampaignBossSupport({
          authoredBoss,
          bossActive: !!(enemyManager.bossManager?.active && enemyManager.bossManager?.boss)
        });
        if (gameTime >= nextBossSupportAttemptAt
          && bossSupportEligible
          && enemyManager.enemies.size >= DEFAULT_CAMPAIGN_BOSS_SUPPORT_MIN_TARGETS) {
          const activated = qaTryBossSupportWell(wave, label, stats, authoredBoss);
          nextBossSupportAttemptAt = gameTime + (activated
            ? DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS
            : .25);
        }
        if (activeHoldPosition && typeof shouldHoldPosition === 'function' && !shouldHoldPosition()) {
          const releasedHoldPosition = activeHoldPosition;
          activeHoldPosition = null;
          stats.objectiveHoldReleased = true;
          // Completing the objective is meaningful alignment progress. Give the
          // unrestricted route planner a fresh watchdog window instead of
          // carrying over time spent defending the capture point.
          targetProgressAt = gameTime * 1000;
          qaRecord('objective', 'combat_hold_released', {
            wave,
            label,
            holdPosition: releasedHoldPosition,
            activeEnemies: enemyManager.enemies.size,
            target: qaRootData(target),
            player: qaSnapshot().player
          });
        }
        if (!target || !enemyManager.enemies.has(target) || Number(target.userData?.hp) <= 0) {
          target = qaSelectCombatTarget();
          targetShotsWithoutDamage = 0;
          targetProgressAt = gameTime * 1000;
          if (!target) break;
          targetBestHp = Number(target.userData?.hp) || Infinity;
          stats.currentTarget = qaRootData(target);
          qaRecord('combat', 'target_acquired', { target: qaRootData(target), activeEnemies: enemyManager.enemies.size });
          // A visible reaction/aim window prevents target changes from looking
          // like instantaneous automated deletion at observation speeds.
          await qaCheckpoint(2, 1);
        }
        const activeBoss = enemyManager.bossManager?.boss || null;
        if (target === activeBoss?.root && activeBoss.invuln === true && enemyManager.enemies.size > 1) {
          const replacement = qaSelectCombatTarget();
          if (replacement && replacement !== target) {
            qaRecord('combat', 'target_reacquired_for_boss_phase', {
              previous: qaRootData(target),
              target: qaRootData(replacement),
              phase: activeBoss.phase || null,
              phaseLabel: activeBoss.root?.userData?.phaseLabel || null,
              activeEnemies: enemyManager.enemies.size
            });
            target = replacement;
            targetShotsWithoutDamage = 0;
            targetProgressAt = gameTime * 1000;
            targetBestHp = Number(target.userData?.hp) || Infinity;
            stats.currentTarget = qaRootData(target);
          }
        }
        if (!await qaEnsureCombatAmmo(stats)) {
          qaError('combat_out_of_ammo', `Wave ${wave} combat bot could not reload ${stats.weapon}.`, { label, stats });
          qaRecorder.stop('combat_stalled');
          break;
        }

        let aim = qaAimAtEnemy(target);
        let lineOfFire = qaProbeLineOfFire(target);
        if (!lineOfFire.clear) {
          const replacement = qaSelectCombatTarget();
          if (replacement && replacement !== target && qaProbeLineOfFire(replacement).clear) {
            qaRecord('combat', 'target_switched_for_line_of_fire', {
              previous: qaRootData(target), target: qaRootData(replacement), blockage: lineOfFire
            });
            target = replacement;
            targetShotsWithoutDamage = 0;
            targetProgressAt = gameTime * 1000;
            targetBestHp = Number(target.userData?.hp) || Infinity;
            stats.currentTarget = qaRootData(target);
            aim = qaAimAtEnemy(target);
            lineOfFire = qaProbeLineOfFire(target);
          }
        }
        if (!lineOfFire.clear) {
          stats.blockedSightChecks++;
          qaRecord('combat', 'line_of_fire_blocked', {
            target: qaRootData(target), blockage: lineOfFire, attempt: stats.blockedSightChecks
          }, 'warning');
          const defendObjective = shouldPrioritizeCampaignObjectiveHold({
            holdActive: !!activeHoldPosition,
            objectiveComplete: typeof shouldHoldPosition === 'function' ? !shouldHoldPosition() : false,
            contested: typeof isObjectiveContested === 'function' ? isObjectiveContested() : false,
            lineOfFireClear: lineOfFire.clear
          });
          if (defendObjective) {
            stats.objectiveDefenseWaits++;
            await qaAlignWithinObjective(activeHoldPosition, { reason: 'blocked_enemy_objective_defense' });
            if (stats.objectiveDefenseWaits === 1 || stats.objectiveDefenseWaits % 20 === 0) {
              qaRecord('objective', 'combat_holds_point_for_approach', {
                wave,
                label,
                waits: stats.objectiveDefenseWaits,
                progress: typeof getObjectiveProgress === 'function' ? getObjectiveProgress() : null,
                target: qaRootData(target),
                blockage: lineOfFire,
                player: qaSnapshot().player
              });
            }
            await qaCheckpoint(2, .5);
            if (evaluateCampaignCombatStall({ nowMs: gameTime * 1000, lastProgressAtMs: targetProgressAt })) {
              qaError('combat_alignment_stalled', `Wave ${wave} made no combat or objective progress while defending the point.`, {
                label,
                target: qaRootData(target),
                bestObjectiveProgress,
                stats,
                activeGameTimeSinceProgressMs: roundedMs(gameTime * 1000 - targetProgressAt),
                snapshot: qaSnapshot()
              });
              qaRecorder.stop('combat_stalled');
            }
            continue;
          }
          const routePlan = await qaPlanFiringRoute(target, activeHoldPosition);
          if (routePlan.path.length > 1) {
            stats.alignmentRoutes++;
            const routeResult = await qaDriveFiringRoute(target, routePlan, activeHoldPosition);
            stats.alignmentDistance += routeResult.moved;
          } else {
            const mechanicRelocation = await qaRelocateForStationaryMechanic(target, routePlan);
            if (mechanicRelocation?.success) {
              stats.stationaryMechanicRelocations++;
              targetProgressAt = gameTime * 1000;
            } else {
              stats.repositions++;
              await qaRepositionForCombat(target, stats.repositions, activeHoldPosition, lineOfFire);
            }
          }
          if (evaluateCampaignCombatStall({ nowMs: gameTime * 1000, lastProgressAtMs: targetProgressAt })) {
            qaError('combat_alignment_stalled', `Wave ${wave} could not align a clear shot on ${target.userData?.type || 'enemy'}.`, {
              label, target: qaRootData(target), blockage: qaProbeLineOfFire(target), stats,
              activeGameTimeSinceProgressMs: roundedMs(gameTime * 1000 - targetProgressAt), snapshot: qaSnapshot()
            });
            qaRecorder.stop('combat_stalled');
          }
          continue;
        }
        const hpBefore = Number(target.userData?.hp);
        const ammoBefore = weaponSystem.getAmmo();
        weaponSystem.triggerDown();
        weaponSystem.triggerUp();
        const fired = weaponSystem.getAmmo() < ammoBefore;
        if (!fired) {
          await qaCheckpoint(1, 0.25);
          continue;
        }

        qaScaleCurrentWeaponCooldown();
        stats.shots++;
        const stillActive = enemyManager.enemies.has(target);
        const hpAfter = stillActive ? Number(target.userData?.hp) : 0;
        const damaged = !stillActive || hpAfter < hpBefore;
        const netProgress = !stillActive || hpAfter < targetBestHp;
        const postShotProbe = stillActive ? qaProbeLineOfFire(target) : null;
        const productionAimMismatch = stillActive && isCampaignProductionAimMismatch({
          probe: postShotProbe,
          shot: globalThis.__QOJ_LAST_SHOT || null
        });
        if (netProgress) {
          targetBestHp = hpAfter;
          targetProgressAt = gameTime * 1000;
        }
        if (damaged) {
          stats.hits++;
          targetShotsWithoutDamage = 0;
        } else {
          stats.misses++;
          targetShotsWithoutDamage++;
          if (globalThis.__QOJ_LAST_SHOT?.selectedType === 'world') stats.blockedShots++;
          if (productionAimMismatch) stats.productionAimMismatches++;
        }
        qaRecord('combat', 'shot', {
          weapon: stats.weapon,
          target: qaRootData(target),
          hpBefore,
          hpAfter,
          damaged,
          netProgress,
          killed: !stillActive,
          distance: aim ? roundedMs(aim.distance) : null,
          aimPoint: aim?.point ? {
            x: roundedSigned(aim.point.x), y: roundedSigned(aim.point.y), z: roundedSigned(aim.point.z)
          } : null,
          raycast: globalThis.__QOJ_LAST_SHOT || null,
          productionAimMismatch,
          lineOfFireProbe: postShotProbe,
          magazine: weaponSystem.getAmmo(),
          reserve: weaponSystem.getReserve()
        });
        if (stats.shots === 1 || stats.shots % 10 === 0) qaRecordSceneSample(`combat-shot-${stats.shots}`);

        if (stillActive && targetShotsWithoutDamage > 0 && (productionAimMismatch || targetShotsWithoutDamage % 2 === 0)) {
          stats.repositions++;
          await qaRepositionForCombat(target, stats.repositions, activeHoldPosition, globalThis.__QOJ_LAST_SHOT || null);
        }
        const stallReason = stillActive ? evaluateCampaignCombatStall({
          consecutiveMisses: targetShotsWithoutDamage,
          nowMs: gameTime * 1000,
          lastProgressAtMs: targetProgressAt
        }) : null;
        if (stallReason) {
          const message = stallReason === 'consecutive_misses'
            ? `Wave ${wave} missed ${target.userData?.type || 'enemy'} 60 consecutive times through production weapons.`
            : `Wave ${wave} made no net HP progress against ${target.userData?.type || 'enemy'} for 90 active gameplay seconds.`;
          qaError('combat_target_stalled', message, {
            label, target: qaRootData(target), stallReason, targetShotsWithoutDamage,
            targetBestHp, activeGameTimeSinceProgressMs: roundedMs(gameTime * 1000 - targetProgressAt), stats,
            raycast: globalThis.__QOJ_LAST_SHOT || null, snapshot: qaSnapshot()
          });
          qaRecorder.stop('combat_stalled');
          break;
        }
        await qaCheckpoint(1, 1);
      }
    } finally {
      weaponSystem.triggerUp();
      player.keys.delete('KeyW');
      player.keys.delete('KeyS');
      player.keys.delete('KeyA');
      player.keys.delete('KeyD');
      player.keys.delete('ShiftLeft');
      qaCombatSession = null;
    }
    stats.durationMs = roundedMs(performance.now() - startedAt);
    stats.activeAfter = enemyManager.enemies.size;
    qaRecord('combat', qaRecorder?.stopped ? 'engagement_stopped' : 'engagement_complete', stats, qaRecorder?.stopped ? 'warning' : 'info');
    return stats;
  };
  const qaDrainAuthoredQueue = async ({
    wave,
    label,
    holdPosition = null,
    shouldHoldPosition = null,
    getObjectiveProgress = null,
    isObjectiveContested = null,
    authoredBoss = false
  }) => {
    const batches = [];
    let eliminated = 0;
    let guard = 0;
    while (enemyManager._authoredSpawnQueue.length && !qaRecorder?.stopped && guard++ < 200) {
      const queuedBefore = enemyManager._authoredSpawnQueue.length;
      enemyManager._updateAuthoredSpawnQueue?.(1);
      await qaCheckpoint(2, 0.35);
      const snapshot = qaSnapshot();
      if (snapshot.activeEnemies <= 0) {
        const queued = enemyManager._authoredSpawnQueue.map(item => ({
          type: item.type,
          wave: item.wave,
          spawnAttempts: Number(item.spawnAttempts) || 0
        }));
        qaError('authored_spawn_queue_deadlock', `Wave ${wave} could not materialize the remaining ${queuedBefore} enemies for ${label}.`, {
          label,
          queuedBefore,
          queuedAfter: enemyManager._authoredSpawnQueue.length,
          queued,
          queuedRoster: summarizeRoster(queued.map(item => item.type)),
          lastSpawnFailure: enemyManager._lastAuthoredSpawnFailure || null,
          snapshot
        });
        break;
      }
      const combat = await qaDefeatActiveEnemies({
        wave,
        label: `${label}-batch-${batches.length + 1}`,
        holdPosition,
        shouldHoldPosition,
        getObjectiveProgress,
        isObjectiveContested,
        authoredBoss
      });
      const batchEliminated = combat.kills;
      eliminated += batchEliminated;
      batches.push({ label, batch: batches.length + 1, queuedBefore, queuedAfter: enemyManager._authoredSpawnQueue.length, eliminated: batchEliminated, combat, snapshot });
      qaRecord('wave', 'spawn_batch_cleared', batches[batches.length - 1]);
      await qaCheckpoint(1, 0.2);
    }
    if (guard >= 200 && enemyManager._authoredSpawnQueue.length) {
      qaError('authored_spawn_queue_guard', `Wave ${wave} exceeded the authored spawn-drain guard.`, {
        label, queued: enemyManager._authoredSpawnQueue.length
      });
    }
    return { eliminated, batches };
  };
  const qaDrainSpecialReserve = async ({ wave, label }) => {
    const batches = [];
    let eliminated = 0;
    let guard = 0;
    const state = enemyManager.specialWaveState;
    while (state?.reserve.length && !qaRecorder?.stopped && guard++ < 300) {
      const reservedBefore = state.reserve.length;
      enemyManager._updateSpecialWave?.(1);
      await qaCheckpoint(2, 0.35);
      const snapshot = qaSnapshot();
      if (snapshot.activeEnemies <= 0) {
        qaError('special_reserve_deadlock', `Wave ${wave} could not materialize the remaining ${reservedBefore} special enemies for ${label}.`, {
          label, reservedBefore, reservedAfter: state.reserve.length, snapshot
        });
        break;
      }
      const combat = await qaDefeatActiveEnemies({ wave, label: `${label}-batch-${batches.length + 1}` });
      const batchEliminated = combat.kills;
      eliminated += batchEliminated;
      batches.push({ label, batch: batches.length + 1, reservedBefore, reservedAfter: state.reserve.length, eliminated: batchEliminated, combat, snapshot });
      qaRecord('wave', 'special_batch_cleared', batches[batches.length - 1]);
      await qaCheckpoint(1, 0.2);
    }
    if (guard >= 300 && state?.reserve.length) {
      qaError('special_reserve_guard', `Wave ${wave} exceeded the special reserve-drain guard.`, {
        label, reserved: state.reserve.length
      });
    }
    return { eliminated, batches };
  };
  const qaRecordPickupState = wave => {
    const playerPosition = controls.getObject().position;
    const active = Array.from(pickups.active || []);
    const byType = {};
    let nearestDistance = null;
    for (const pickup of active) {
      const type = pickup?.userData?.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      if (!pickup?.position) continue;
      const distance = Math.hypot(
        pickup.position.x - playerPosition.x,
        pickup.position.z - playerPosition.z
      );
      nearestDistance = nearestDistance == null ? distance : Math.min(nearestDistance, distance);
    }
    const result = {
      wave,
      active: active.length,
      byType,
      nearestDistance: nearestDistance == null ? null : roundedMs(nearestDistance),
      maxActive: pickups.maxActive,
      maxLifetimeSeconds: pickups.maxLifetimeSeconds,
      retention: { ...pickups.retention },
      collectionMode: 'production_proximity_during_routes'
    };
    qaRecord('player', 'pickup_state', result);
    return result;
  };
  const qaCompleteEscapeObjective = async (wave, planned, initialState) => {
    const target = normalizeObjectivePosition(initialState.position);
    const start = controls.getObject().position.clone();
    const initialDistance = Math.max(.001, Math.hypot(target.x - start.x, target.z - start.z));
    const powerdownSeconds = Math.max(0, Number(initialState.powerdownSeconds) || 0);
    const maxFrames = Math.ceil((Math.max(30, initialDistance / 3) + powerdownSeconds + 20) * 60);
    const result = {
      required: true,
      kind: 'escape',
      complete: false,
      selected: null,
      phases: ['escape'],
      targets: [],
      eliminated: 0,
      batches: [],
      route: {
        start: { x: roundedSigned(start.x), y: roundedSigned(start.y), z: roundedSigned(start.z) },
        target,
        initialDistance: roundedMs(initialDistance),
        frames: 0,
        distanceTravelled: 0,
        bestProgress: 0,
        maximumActiveEnemies: enemyManager.enemies.size
      }
    };
    let bestProgress = 0;
    let lastProgressAt = gameTime;
    let nextQuarter = 0;
    let consecutiveBlockedFrames = 0;
    let frames = 0;
    let distanceTravelled = 0;
    let previousPhase = initialState.phase || 'chase';

    qaRecord('objective', 'started', { wave, kind: 'escape', state: initialState, route: result.route });
    qaRecordSceneSample('objective-escape-start');
    player.keys.clear();
    try {
      while (!qaRecorder?.stopped && !qaStopRequested && frames < maxFrames) {
        const state = relayLevel.objectiveState;
        if (state?.complete === true) break;
        if (state?.kind !== 'escape') {
          qaError('escape_objective_lost', `Wave ${wave} lost its escape objective before completion.`, {
            planned, state, player: qaSnapshot().player
          });
          break;
        }
        if (state.phase !== previousPhase) {
          previousPhase = state.phase;
          result.phases.push(state.phase);
          qaRecord('objective', 'escape_phase_changed', {
            wave, phase: state.phase, progress: state.progress, player: qaSnapshot().player
          });
        }

        const position = controls.getObject().position;
        const distanceToTarget = Math.hypot(target.x - position.x, target.z - position.z);
        const routeProgress = Math.max(0, Math.min(1, 1 - distanceToTarget / initialDistance));
        if (routeProgress > bestProgress + .0001) {
          bestProgress = routeProgress;
          lastProgressAt = gameTime;
        }
        while (bestProgress + .0001 >= nextQuarter && nextQuarter <= 1) {
          const quarter = Math.round(nextQuarter * 4);
          qaRecord('objective', 'escape_progress', {
            wave,
            progress: roundedMs(bestProgress),
            quarter,
            distanceToTarget: roundedMs(distanceToTarget),
            activeEnemies: enemyManager.enemies.size,
            player: qaSnapshot().player
          });
          qaRecordSceneSample(`objective-escape-quarter-${quarter}`);
          nextQuarter += .25;
        }

        if (state.phase === 'powerdown') {
          player.keys.clear();
          await qaCheckpoint(2, .1);
          frames += 2;
          result.route.maximumActiveEnemies = Math.max(result.route.maximumActiveEnemies, enemyManager.enemies.size);
          continue;
        }

        const dx = target.x - position.x;
        const dz = target.z - position.z;
        player.yawObject.rotation.y = Math.atan2(-dx, -dz);
        player.keys.add('KeyW');
        player.keys.add('ShiftLeft');
        const before = position.clone();
        await qaCheckpoint(4, .05);
        frames += 4;
        const moved = before.distanceTo(controls.getObject().position);
        distanceTravelled += moved;
        consecutiveBlockedFrames = moved < .02 ? consecutiveBlockedFrames + 4 : 0;
        result.route.maximumActiveEnemies = Math.max(result.route.maximumActiveEnemies, enemyManager.enemies.size);

        if (consecutiveBlockedFrames >= 120) {
          qaError('escape_route_stalled', `Wave ${wave} production player could not advance through the escape corridor.`, {
            planned,
            consecutiveBlockedFrames,
            bestProgress,
            player: qaSnapshot().player
          });
          break;
        }
        if (gameTime - lastProgressAt >= DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS) {
          qaError('escape_progress_stalled', `Wave ${wave} escape made no forward progress for ${DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS} seconds.`, {
            planned,
            bestProgress,
            distanceToTarget: roundedMs(distanceToTarget),
            player: qaSnapshot().player
          });
          break;
        }
      }
    } finally {
      player.keys.clear();
    }

    const finalState = relayLevel.objectiveState;
    result.complete = finalState?.kind === 'escape' && finalState.complete === true;
    result.route.frames = frames;
    result.route.distanceTravelled = roundedMs(distanceTravelled);
    result.route.bestProgress = roundedMs(bestProgress);
    result.route.final = qaSnapshot().player;
    result.targets.push({
      targetIndex: 1,
      completed: result.complete,
      phase: finalState?.phase || null,
      steps: frames,
      position: target
    });
    qaRecord('objective', result.complete ? 'completed' : 'failed', {
      wave, result, state: finalState, queuedEnemies: enemyManager._authoredSpawnQueue.length
    }, result.complete ? 'info' : 'error');
    if (!result.complete) {
      qaError('objective_target_incomplete', `Wave ${wave} escape objective did not complete.`, {
        planned, result, state: finalState, player: qaSnapshot().player
      });
    }
    return result;
  };
  const qaCompleteObjective = async (wave, planned, chainDepth = 0) => {
    let state = relayLevel.objectiveState;
    const required = isCampaignObjectiveRequiredKind(state?.kind);
    const result = {
      required,
      kind: state?.kind || 'eliminate',
      complete: !required,
      selected: null,
      phases: state?.kind ? [state.kind] : [],
      targets: [],
      eliminated: 0,
      batches: []
    };
    if (!required) return result;
    if (state.kind === 'escape') return qaCompleteEscapeObjective(wave, planned, state);

    qaRecord('objective', 'started', { wave, kind: state.kind, state });
    const objectiveTargets = state.kind === 'feeds' || state.kind === 'multi-capture'
      ? state.targets
      : state.kind === 'mast' || state.kind === 'hold' || state.kind === 'sponsor'
        ? [state]
        : state.kind === 'ending-choice'
          ? [state.choices?.[0]].filter(Boolean)
          : [null];

    for (let targetIndex = 0; targetIndex < objectiveTargets.length && !qaRecorder?.stopped; targetIndex++) {
      state = relayLevel.objectiveState;
      const target = objectiveTargets[targetIndex];
      const targetIsComplete = () => isCampaignObjectiveTargetComplete(
        relayLevel.objectiveState,
        targetIndex,
        relayLevel._transitioned === true
      );
      let holdPosition = null;
      if (target?.position) {
        const position = normalizeObjectivePosition(target.position);
        holdPosition = { ...position, radius: Math.max(.75, Number(target.radius) || .75) };
        const alignment = await qaAlignWithinObjective(holdPosition, {
          target,
          force: true,
          reason: `objective_${state.kind}_${targetIndex + 1}_start`
        });
        const alignedPosition = { ...qaSnapshot().player.position };
        qaRecord('objective', 'player_on_point', {
          wave, kind: state.kind, targetIndex: targetIndex + 1, targetCount: objectiveTargets.length,
          target: { id: target.id || target.nameKey || targetIndex + 1, position, radius: target.radius, seconds: target.seconds },
          alignedPosition,
          collisionSafe: alignment.aligned,
          alignmentAttempts: alignment.attempts,
          activeTargetKey: relayLevel.objectiveState?.activeTargetKey || null
        }, alignment.aligned ? 'info' : 'warning');
      }

      const targetSeconds = Math.max(4, Number(target?.seconds || (state.kind === 'liberation' ? 4 : 8)));
      const maxSteps = Math.ceil((targetSeconds + 12) * 90);
      const progressTimeoutSeconds = Math.max(DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS, targetSeconds + 12);
      let bestProgress = campaignObjectiveTargetProgress(state, targetIndex);
      let lastProgressAt = gameTime;
      let lastQuarter = -1;
      let stepCount = 0;
      let alignmentFailures = 0;
      while (!qaRecorder?.stopped && stepCount++ < maxSteps) {
        state = relayLevel.objectiveState;
        const targetComplete = targetIsComplete();
        if (targetComplete) break;

        const alignmentTracked = state?.kind === 'multi-capture' || state?.kind === 'ending-choice';
        const geometryActive = !holdPosition || isCampaignObjectivePositionInside(
          holdPosition,
          controls.getObject().position,
          holdPosition.radius,
          .05
        );
        if (target?.position && (!geometryActive || (alignmentTracked && !isCampaignObjectiveAlignmentActive(state, target)))) {
          const alignment = await qaAlignWithinObjective(holdPosition, {
            target,
            force: true,
            reason: `objective_${state?.kind || 'unknown'}_${targetIndex + 1}_recovery`
          });
          state = relayLevel.objectiveState;
          const alignmentActive = alignment.aligned;
          qaRecord('objective', 'point_realigned', {
            wave, targetIndex: targetIndex + 1,
            activeTargetKey: state?.activeTargetKey || state?.activeChoice || null,
            alignmentAttempts: alignment.attempts,
            player: qaSnapshot().player
          }, alignmentActive ? 'info' : 'warning');
          if (alignmentActive) alignmentFailures = 0;
          else if (++alignmentFailures >= 3) {
            qaError('objective_alignment_failed', `Wave ${wave} could not place the production player inside objective target ${targetIndex + 1}.`, {
              target, state, player: qaSnapshot().player
            });
            break;
          }
        }

        const combat = await qaDefeatActiveEnemies({
          wave,
          label: `objective-${state?.kind || 'unknown'}-${targetIndex + 1}`,
          holdPosition,
          shouldHoldPosition: () => !targetIsComplete(),
          getObjectiveProgress: () => campaignObjectiveTargetProgress(relayLevel.objectiveState, targetIndex),
          isObjectiveContested: () => relayLevel.objectiveState?.contested === true,
          authoredBoss: planned.mode === 'authored_boss'
        });
        result.eliminated += combat.kills;
        const drained = await qaDrainAuthoredQueue({
          wave,
          label: `objective-${state?.kind || 'unknown'}-${targetIndex + 1}`,
          holdPosition,
          shouldHoldPosition: () => !targetIsComplete(),
          getObjectiveProgress: () => campaignObjectiveTargetProgress(relayLevel.objectiveState, targetIndex),
          isObjectiveContested: () => relayLevel.objectiveState?.contested === true,
          authoredBoss: planned.mode === 'authored_boss'
        });
        result.eliminated += drained.eliminated;
        result.batches.push(...drained.batches);

        state = relayLevel.objectiveState;
        if (state?.kind && state.kind !== result.kind) {
          qaRecord('objective', 'kind_changed', {
            wave,
            from: result.kind,
            to: state.kind,
            chainDepth,
            player: qaSnapshot().player
          });
          if (chainDepth >= 3) {
            qaError('objective_chain_limit', `Wave ${wave} objective changed too many times.`, {
              planned, result, state, chainDepth
            });
            return result;
          }
          result.targets.push({
            targetIndex: targetIndex + 1,
            completed: true,
            steps: stepCount,
            kind: result.kind,
            transitionedTo: state.kind
          });
          const chained = await qaCompleteObjective(wave, planned, chainDepth + 1);
          result.eliminated += chained.eliminated;
          result.batches.push(...chained.batches);
          result.targets.push(...chained.targets);
          result.phases.push(...chained.phases);
          result.complete = chained.complete;
          result.selected = chained.selected;
          qaRecord('objective', chained.complete ? 'chain_completed' : 'chain_failed', {
            wave, result, state: relayLevel.objectiveState
          }, chained.complete ? 'info' : 'error');
          return result;
        }
        const progress = campaignObjectiveTargetProgress(state, targetIndex);
        const quarter = Math.floor(progress * 4);
        if (quarter > lastQuarter) {
          lastQuarter = quarter;
          qaRecord('objective', 'progress', {
            wave, kind: state?.kind, targetIndex: targetIndex + 1, progress,
            contested: state?.contested === true, remainingTargets: state?.remainingTargets ?? null
          });
          qaRecordSceneSample(`objective-${state?.kind || 'unknown'}-${targetIndex + 1}-quarter-${quarter}`);
        }
        await qaCheckpoint(1, 1);
        state = relayLevel.objectiveState;
        const checkpointProgress = campaignObjectiveTargetProgress(state, targetIndex);
        if (checkpointProgress > bestProgress + .0001) {
          bestProgress = checkpointProgress;
          lastProgressAt = gameTime;
        } else if (hasCampaignObjectiveProgressStalled({
          nowSeconds: gameTime,
          lastProgressAtSeconds: lastProgressAt,
          timeoutSeconds: progressTimeoutSeconds
        })) {
          qaError('objective_progress_stalled', `Wave ${wave} objective target ${targetIndex + 1} made no progress for ${progressTimeoutSeconds} seconds.`, {
            planned, targetIndex, bestProgress, state, player: qaSnapshot().player
          });
          break;
        }
      }

      if (qaRecorder?.stopped) return result;

      state = relayLevel.objectiveState;
      const completed = targetIsComplete();
      result.targets.push({ targetIndex: targetIndex + 1, completed, steps: stepCount });
      qaRecord('objective', completed ? 'target_complete' : 'target_failed', {
        wave, kind: state?.kind, targetIndex: targetIndex + 1, steps: stepCount, state
      }, completed ? 'info' : 'error');
      if (!completed) {
        qaError('objective_target_incomplete', `Wave ${wave} ${result.kind} target ${targetIndex + 1} did not complete.`, {
          planned, targetIndex, state, player: qaSnapshot().player
        });
        break;
      }
    }

    const tail = await qaDrainAuthoredQueue({
      wave,
      label: `objective-${result.kind}-tail`,
      authoredBoss: planned.mode === 'authored_boss'
    });
    result.eliminated += tail.eliminated;
    result.batches.push(...tail.batches);
    state = relayLevel.objectiveState;
    result.complete = result.kind === 'liberation' ? relayLevel._transitioned === true : state?.complete === true;
    result.selected = state?.selected || null;
    qaRecord('objective', result.complete ? 'completed' : 'failed', { wave, result, state }, result.complete ? 'info' : 'error');
    return result;
  };
  const qaExerciseRemainingPackages = async (wave, planned) => {
    const packageSnapshots = [];
    let eliminated = 0;
    const initialTail = await qaDrainAuthoredQueue({
      wave,
      label: 'initial-package-tail',
      authoredBoss: planned.mode === 'authored_boss'
    });
    eliminated += initialTail.eliminated;
    packageSnapshots.push(...initialTail.batches);
    const authoredPackages = relayLevel.definition?.waves?.[wave]?.packages || [];
    let reinforcementGuard = 0;
    while (relayLevel.reinforcementState?.nextPackage < authoredPackages.length && !qaRecorder?.stopped && reinforcementGuard++ < authoredPackages.length + 5) {
      const packageIndex = relayLevel.reinforcementState.nextPackage;
      relayLevel.update(0, controls.getObject());
      const drained = await qaDrainAuthoredQueue({
        wave,
        label: `package-${packageIndex + 1}`,
        authoredBoss: planned.mode === 'authored_boss'
      });
      eliminated += drained.eliminated;
      const snapshot = drained.batches.at(-1)?.snapshot || qaSnapshot();
      packageSnapshots.push({
        packageIndex: packageIndex + 1,
        roster: summarizeRoster(authoredPackages[packageIndex]),
        eliminated: drained.eliminated,
        batches: drained.batches,
        snapshot
      });
      qaRecord('wave', 'package_materialized', packageSnapshots[packageSnapshots.length - 1]);
      if (relayLevel.reinforcementState.nextPackage === packageIndex) {
        qaError('reinforcement_package_not_released', `Wave ${wave} package ${packageIndex + 1} was not released by the production reinforcement gate.`, {
          planned, reinforcementState: relayLevel.reinforcementState, snapshot
        });
        break;
      }
    }

    const state = enemyManager.specialWaveState;
    if (state?.active) {
      const initialSpecial = await qaDrainSpecialReserve({ wave, label: 'surge-1' });
      eliminated += initialSpecial.eliminated;
      packageSnapshots.push({ surge: 1, eliminated: initialSpecial.eliminated, batches: initialSpecial.batches });
      while (state.packagesCommitted < state.definition.packageCount && !qaRecorder?.stopped) {
        const packageIndex = state.packagesCommitted;
        const committed = enemyManager._commitSpecialWavePackage?.(packageIndex);
        if (!committed) {
          qaError('special_surge_commit_failed', `Wave ${wave} surge ${packageIndex + 1} could not be committed.`, { planned, packageIndex });
          break;
        }
        const drained = await qaDrainSpecialReserve({ wave, label: `surge-${packageIndex + 1}` });
        const snapshot = drained.batches.at(-1)?.snapshot || qaSnapshot();
        const packageState = state.packages[packageIndex];
        qaRecord('wave', 'special_surge_materialized', {
          surge: packageIndex + 1,
          totalSurges: state.definition.packageCount,
          packageSize: packageState?.size || 0,
          snapshot
        });
        if ((packageState?.size || 0) > drained.eliminated) {
          qaError('special_surge_incomplete', `Wave ${wave} surge ${packageIndex + 1} materialized ${drained.eliminated} of ${packageState?.size || 0} enemies.`, {
            planned, packageState, drained, snapshot
          });
        }
        eliminated += drained.eliminated;
        packageSnapshots.push({ surge: packageIndex + 1, size: packageState?.size || 0, eliminated: drained.eliminated, batches: drained.batches, snapshot });
      }
    }
    return { eliminated, packageSnapshots };
  };

  const originalQaSpawnAt = enemyManager.spawnAt.bind(enemyManager);
  enemyManager.spawnAt = (type, position, options = {}) => {
    const root = originalQaSpawnAt(type, position, options);
    if (!qaRunning) return root;
    const reportFailureAsError = !root && shouldTreatCampaignSpawnFailureAsError({
      specialWaveActive: enemyManager.specialWaveState?.active === true
    });
    qaRecord('enemy', root ? 'spawned' : 'spawn_failed', {
      type, requestedPosition: position ? { x: position.x, y: position.y, z: position.z } : null,
      actual: qaRootData(root), countsTowardAlive: options.countsTowardAlive !== false,
      retryable: !root && !reportFailureAsError
    }, root ? 'info' : reportFailureAsError ? 'error' : 'warning');
    if (!root && reportFailureAsError) qaError('enemy_spawn_failed', `Failed to spawn ${type}.`, { type, wave: enemyManager.wave }, 'production_spawn');
    return root;
  };
  const originalQaRemove = enemyManager.remove.bind(enemyManager);
  enemyManager.remove = root => {
    if (!qaRunning) return originalQaRemove(root);
    const before = qaRootData(root);
    const productionEliminated = isCampaignProductionElimination(root);
    const selfDestructed = root?.userData?.productionSelfDestruct === true;
    const result = originalQaRemove(root);
    if (before) {
      const removalPath = selfDestructed
        ? 'production_self_destruct'
        : productionEliminated
        ? (qaCombatSession ? 'production_weapon_kill' : 'production_kill')
        : 'production_nonlethal_cleanup';
      if (productionEliminated) qaWaveProductionEliminations++;
      if (qaCombatSession && productionEliminated) qaCombatSession.kills++;
      qaRecord('enemy', 'removed', {
        ...before,
        removalPath,
        combatLabel: qaCombatSession?.label || null
      }, productionEliminated ? 'info' : 'warning');
    }
    return result;
  };
  enemyManager.onAIEvent = event => {
    if (!qaRunning) return;
    const activity = qaTrackAIActivity(event);
    const detail = {};
    for (const [key, value] of Object.entries(event || {})) {
      detail[key] = key.toLowerCase().includes('root') ? qaRootData(value) : value;
    }
    if (activity.throttled && activity.count > 2 && activity.count % 100 !== 0) return;
    if (activity.throttled) detail.aggregatedCount = activity.count;
    qaRecord('ai', event?.type || 'event', detail);
  };

  const qaWindowError = event => {
    if (!qaRunning || !qaRecorder) return;
    qaError('window_error', event.message || 'Uncaught window error', {
      error: event.error, filename: event.filename, line: event.lineno, column: event.colno
    }, 'window.error');
  };
  const qaUnhandledRejection = event => {
    if (!qaRunning || !qaRecorder) return;
    qaError('unhandled_rejection', 'Unhandled promise rejection during campaign simulation.', { reason: event.reason }, 'unhandledrejection');
  };
  window.addEventListener('error', qaWindowError);
  window.addEventListener('unhandledrejection', qaUnhandledRejection);

  window.__qaCampaignBridge = {
    version: 1,
    ready: true,
    get running() { return qaRunning; },
    get report() { return qaLastReport; },
    snapshot: qaSnapshot,
    stop() {
      if (!qaRunning) return;
      qaStopRequested = true;
      qaRecorder?.stop('manual_stop');
    },
    recordPlayerDamage(data) {
      if (!qaRunning) return;
      const amount = Math.max(0, Number(data?.amount) || 0);
      const source = String(data?.source || data?.sourceKind || 'enemy');
      if (qaPlayerDamagePressure) {
        qaPlayerDamagePressure.attempts++;
        qaPlayerDamagePressure.total += amount;
        qaPlayerDamagePressure.peak = Math.max(qaPlayerDamagePressure.peak, amount);
        qaPlayerDamagePressure.firstGameTime ??= roundedMs(gameTime);
        qaPlayerDamagePressure.lastGameTime = roundedMs(gameTime);
        const sourceStats = qaPlayerDamagePressure.bySource[source] ||= { attempts: 0, totalDamage: 0, bypassArmor: false };
        sourceStats.attempts++;
        sourceStats.totalDamage = roundedMs(sourceStats.totalDamage + amount);
        sourceStats.bypassArmor ||= data?.bypassArmor === true;
      }
      const detail = {};
      for (const [key, value] of Object.entries(data || {})) {
        detail[key] = key.toLowerCase().includes('root') ? qaRootData(value) : value;
      }
      qaRecord('player', 'damage_attempt', detail, 'warning');
    },
    status() {
      return {
        ready: true,
        running: qaRunning,
        wave: qaRecorder?.currentWave?.wave || null,
        completedWaves: qaRecorder?.waves.filter(item => item.status === 'pass' || item.status === 'fail').length || 0,
        errors: qaRecorder?.errors.length || 0,
        events: qaRecorder?.events.length || 0,
        combat: qaCombatSession ? {
          label: qaCombatSession.label,
          weapon: qaCombatSession.weapon,
          shots: qaCombatSession.shots,
          kills: qaCombatSession.kills,
          activeEnemies: enemyManager.enemies.size,
          target: qaCombatSession.currentTarget?.type || null
        } : null,
        stopped: qaRecorder?.stopped || false,
        stopReason: qaRecorder?.stopReason || null
      };
    },
    async run({
      fromWave = 1,
      toWave = 73,
      scenario = 'campaign',
      errorLimit = 50,
      routeSamples = 4,
      paceDelayMs = 100,
      simulationTimeScale = 1
    } = {}) {
      if (qaRunning) return qaLastReport;
      const scenarioId = scenario === 'relay-car-summon' ? 'relay-car-summon' : 'campaign';
      if (scenarioId === 'relay-car-summon') fromWave = toWave = 1;
      qaRunning = true;
      qaStopRequested = false;
      qaLastReport = null;
      qaPaceDelayMs = Math.max(0, Math.min(1000, Math.floor(Number(paceDelayMs) || 0)));
      const requestedTimeScale = Number(simulationTimeScale);
      qaSimulationTimeScale = Number.isFinite(requestedTimeScale)
        ? Math.max(0.5, Math.min(4, requestedTimeScale))
        : 1;
      // Reports must only contain diagnostics produced by this run. The
      // performance logger otherwise restores prior page events from storage.
      perfLog.clear();
      qaProductionErrorKeys.clear();
      qaRecorder = new CampaignSimulationRecorder({ seed, fromWave, toWave, errorLimit });
      qaRecord('simulation', 'run_start', {
        seed, fromWave, toWave, scenario: scenarioId, errorLimit, routeSamples, paceDelayMs: qaPaceDelayMs,
        simulationTimeScale: qaSimulationTimeScale,
        combat: { mode: 'production_weapons', weapon: 'DMR', forcedEnemyRemoval: false }
      });
      enemyManager.qaImmediateSpawns = true;
      try {
        startGame();
        weaponSystem.setDebugWaveLoadout();
        weaponSystem.switchSlot(3);
        paused = false;
        await qaCheckpoint(2, 1);
        for (let wave = qaRecorder.fromWave; wave <= qaRecorder.toWave; wave++) {
          if (qaStopRequested || qaRecorder.stopped) break;
          qaLoadWaveEnvironment(wave);
          const baseSpawn = relayLevel.playerSpawn || [0, 1.7, 8];
          const start = seededPlayerStart(seed, wave, baseSpawn);
          qaRecorder.beginWave(wave, { levelId: relayLevel.definition?.id || 'legacy-generated-arena', playerStart: start });
          qaAIActivity.clear();
          qaEnemyTelemetry = new WeakMap();
          qaLastPlayerTelemetry = null;
          qaSceneSampleIndex = 0;
          qaPlayerDamagePressure = {
            attempts: 0, total: 0, peak: 0, firstGameTime: null, lastGameTime: null,
            bySource: {}, flushed: false
          };
          enemyManager.suspendWaves = false;
          enemyManager.reset({ wave });
          enemyManager.suspendWaves = true;
          qaWaveProductionEliminations = 0;
          qaMaterializeInitialWave();
          player.resetPosition(start.x, start.y, start.z);
          player.yawObject.rotation.y = start.yaw;
          await qaCheckpoint(3, 1);
          const planned = qaPlannedWave(wave);
          const escapeObjective = relayLevel.objectiveState?.kind === 'escape';
          qaRecord('wave', 'planned_composition', planned);
          if (scenarioId === 'relay-car-summon') {
            const scenarioResult = await qaRunRelayCarSummonScenario(wave);
            qaFlushAIActivity();
            qaFlushPlayerDamagePressure();
            const final = qaSnapshot();
            qaRecorder.endWave({
              planned, scenario: scenarioResult,
              paceDelayMs: qaPaceDelayMs, simulationTimeScale: qaSimulationTimeScale,
              snapshot: final, final
            });
            break;
          }
          if (escapeObjective) {
            qaRecord('player', 'route_deferred_to_escape', {
              wave,
              levelId: relayLevel.definition?.id || null,
              reason: 'escape_requires_continuous_production_movement'
            });
          } else {
            const route = buildPlayerRoute(seed, wave, start, player.arenaRadius, routeSamples);
            for (let routeIndex = 1; routeIndex < route.length; routeIndex++) {
              if (qaStopRequested || qaRecorder.stopped) break;
              const target = route[routeIndex];
              const before = controls.getObject().position.clone();
              const dx = target.x - before.x;
              const dz = target.z - before.z;
              player.yawObject.rotation.y = Math.atan2(-dx, -dz);
              player.keys.add('KeyW');
              if (routeIndex % 2 === 0) player.keys.add('ShiftLeft');
              if (routeIndex === 1) player.jump();
              await qaCheckpoint(4, 1);
              player.keys.delete('KeyW');
              player.keys.delete('ShiftLeft');
              const after = controls.getObject().position;
              const moved = Math.hypot(after.x - before.x, after.z - before.z);
              const intendedDistance = Math.hypot(dx, dz);
              const forwardProgress = intendedDistance > .001
                ? ((after.x - before.x) * dx + (after.z - before.z) * dz) / intendedDistance
                : 0;
              qaRecord('player', 'route_sample', {
                routeIndex,
                target,
                before: { x: roundedSigned(before.x), y: roundedSigned(before.y), z: roundedSigned(before.z) },
                actual: qaSnapshot().player,
                intendedDistance: roundedMs(intendedDistance),
                movedDistance: roundedMs(moved),
                forwardProgress: roundedMs(forwardProgress),
                movementBlocked: moved < .05
              }, moved < .05 ? 'warning' : 'info');
            }
          }
          player.keys.clear();
          if (qaStopRequested || qaRecorder.stopped) break;
          qaRecordSceneSample('pre-combat');
          const snapshot = qaSnapshot();
          for (const issue of validateCampaignSnapshot(snapshot, wave)) qaError(issue.code, issue.message, snapshot);
          if (planned.total > 0 && snapshot.activeEnemies <= 0) {
            qaError('wave_has_no_active_enemy', `Wave ${wave} planned ${planned.total} enemies but materialized none.`, { planned, snapshot });
          }
          const openingCombat = escapeObjective
            ? {
                wave,
                label: 'initial-wave',
                skipped: true,
                reason: 'escape_objective_preserves_invulnerable_pursuers',
                activeBefore: enemyManager.enemies.size,
                activeAfter: enemyManager.enemies.size,
                kills: 0,
                shots: 0,
                hits: 0
              }
            : await qaDefeatActiveEnemies({
                wave,
                label: 'initial-wave',
                authoredBoss: planned.mode === 'authored_boss'
              });
          if (escapeObjective) qaRecord('combat', 'engagement_skipped', openingCombat);
          let eliminated = openingCombat.kills;
          if (qaStopRequested || qaRecorder.stopped) break;
          const objective = await qaCompleteObjective(wave, planned);
          eliminated += objective.eliminated;
          if (qaStopRequested || qaRecorder.stopped) break;
          const remainingPackages = objective.required
            ? { eliminated: 0, packageSnapshots: objective.batches }
            : await qaExerciseRemainingPackages(wave, planned);
          eliminated += remainingPackages.eliminated;
          if (qaStopRequested || qaRecorder.stopped) break;
          const pickupState = qaRecordPickupState(wave);
          await qaCheckpoint(2, 0.5);
          qaRecordSceneSample('wave-complete');
          const final = qaSnapshot();
          const phaseEliminations = eliminated;
          eliminated = reconcileCampaignEliminationCount(eliminated, qaWaveProductionEliminations);
          if (eliminated !== phaseEliminations) {
            qaRecord('wave', 'production_eliminations_reconciled', {
              phaseEliminations,
              productionEliminations: qaWaveProductionEliminations,
              reconciledEliminations: eliminated,
              difference: eliminated - phaseEliminations
            });
          }
          const completionContext = {
            wave, planned, eliminated, final,
            queuedEnemies: enemyManager._authoredSpawnQueue.length,
            objective
          };
          for (const issue of validateWaveCompletion(completionContext)) {
            qaError(issue.code, issue.message, completionContext);
          }
          qaFlushAIActivity();
          qaFlushPlayerDamagePressure();
          qaRecorder.endWave({
            planned, eliminated, objective, packageSnapshots: remainingPackages.packageSnapshots,
            combat: { opening: openingCombat, mode: 'production_weapons' },
            paceDelayMs: qaPaceDelayMs, simulationTimeScale: qaSimulationTimeScale,
            pickupState, start, snapshot, final
          });
        }
        if (!qaRecorder.stopped) qaRecord('simulation', 'run_complete', { waves: qaRecorder.waves.length, errors: qaRecorder.errors.length });
      } catch (error) {
        qaError('simulation_crash', error?.message || String(error), { error }, 'runner');
        qaRecorder.stop('runner_crash');
      } finally {
        player.keys.clear();
        enemyManager.suspendWaves = true;
        enemyManager.qaImmediateSpawns = false;
        qaFlushAIActivity();
        qaFlushPlayerDamagePressure();
        const productionDebugEvents = perfLog.getEvents();
        qaLastReport = qaRecorder.buildReport({
          appVersion: APP_VERSION_LABEL,
          debugEnvironment,
          performance: summarizeCampaignPerformanceEvents(qaRecorder.events),
          productionDebugEvents,
          scenario: scenarioId,
          paceDelayMs: qaPaceDelayMs,
          simulationTimeScale: qaSimulationTimeScale,
          userAgent: navigator.userAgent,
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }
        });
        qaRunning = false;
        qaSimulationTimeScale = 1;
        paused = true;
        window.__qaCampaignSimulationReport = qaLastReport;
        window.__qaCampaignSimulationDone = true;
        window.dispatchEvent(new CustomEvent('qa-campaign-complete', { detail: qaLastReport.summary }));
      }
      return qaLastReport;
    }
  };
  window.dispatchEvent(new CustomEvent('qa-campaign-ready'));
}

updateArchiveAvailability();
document.addEventListener('achievementUnlocked', event => {
  const reward = event.detail?.reward;
  if (reward?.type === 'weapon') {
    const result = mutations.grantClassifiedWeapon(reward.weaponId);
    if (result.ok) {
      if (result.equippedTactical) weaponSystem?.ensureTacticalSlot?.(result.equippedTactical);
      const definition = mutations.getClassifiedWeaponDefinition(reward.weaponId);
      const weaponName = definition ? t(definition.nameKey) : reward.weaponId;
      showToast(t('achievements.reward.weapon').replace('{weapon}', weaponName));
      checkArchiveAchievement(getArchiveAchievementSnapshot());
      updateArchiveAvailability();
      updateHUD();
    }
  }
  if (achievementsMenu?.style.display !== 'none') renderAchievementsBoard();
});
checkArchiveAchievement(getArchiveAchievementSnapshot());

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (archiveMenu?.style.display === 'none') return;
  event.preventDefault();
  closeArchive();
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
highlightQuality(savedQuality);
function setParams(obj){
  const u = new URL(window.location.href);
  Object.entries(obj).forEach(([k,v])=>{ if (v==null) u.searchParams.delete(k); else u.searchParams.set(k, String(v)); });
  if (debugPerf) u.searchParams.set('debug', '1');
  if (diagnosticLogsEnabled) {
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
  if (qaSimulationMode) return;
  if (document.body.classList.contains('menu-open')) return;
  if (session.gameOver) {
    if (currentRunTutorial) showStartPanel();
    else showDefeatPanel();
  } else {
    showPauseMenu('pointer_unlock');
  }
});

window.addEventListener('blur', ()=>{
  if (qaSimulationMode) return;
  if (!session.gameOver) showPauseMenu('window_blur');
});

document.addEventListener('visibilitychange', ()=>{
  if (document.visibilityState === 'hidden' && !qaSimulationMode) achievements.save();
  if (diagnosticLogsEnabled) perfLog.event('system', 'visibility_changed', { state: document.visibilityState });
  if (document.visibilityState === 'visible') {
    // RAF is commonly suspended while a tab is hidden. Reset both the frame
    // scheduler and diagnostic window so the background interval is not
    // reported as a gameplay/render stall when the tab resumes.
    const visibilityNow = performance.now();
    _lastFrameAt = visibilityNow;
    _lastRenderedAt = visibilityNow;
    hasPreviousPhaseTiming = false;
    if (diagnosticLogsEnabled) perfLog.observeFrame({ nowMs: visibilityNow, active: false, visible: false });
  }
  if (qaSimulationMode) return;
  if (!session.gameOver) showPauseMenu('visibility_change');
});
window.addEventListener('pagehide', () => { if (!qaSimulationMode) achievements.save(); });

// Ensure audio resume on first input (mobile/desktop)
window.addEventListener('pointerup', ()=> S.ensure(), {once:true});

// Materialize, compile, and upload every regular enemy archetype before the
// player can start. Template construction alone does not pay the first-render
// shader/geometry cost, which otherwise appears as a hitch when a later wave
// introduces a specialist for the first time.
try {
  const prewarm = (new URL(window.location.href)).searchParams.get('prewarm') !== '0';
  if (prewarm) {
    const enemyWarmStartedAt = diagnosticLogsEnabled ? performance.now() : 0;
    const kinds = Object.keys(enemyManager.typeConfig || {});
    const roots = [];
    const base = new THREE.Vector3(-((kinds.length - 1) * 0.9), 0.8, -60);
    try {
      for (let i = 0; i < kinds.length; i++) {
        const pos = base.clone().add(new THREE.Vector3(i * 1.8, 0, 0));
        const root = enemyManager.spawnAt(kinds[i], pos, { countsTowardAlive: false });
        if (root) roots.push(root);
      }
      if (relayLevel.active) {
        // Upload the same geometry the player will see from the authored spawn,
        // not just the subset visible from the generic pre-level camera.
        if (relayLevel.playerSpawn) {
          player.resetPosition(...relayLevel.playerSpawn);
          player.yawObject.rotation.y = 0;
        }
        relayLevel.onWaveStart(resolveStandardStartWave());
        weather.update(gameTime, controls.getObject());
        // Populate per-enemy instanced readability/contact-shadow buffers so
        // their shader variants are part of the warm frame as well.
        relayLevel.update(0, controls.getObject());
      }
      repairSceneMaterialBuildHooks('enemy_runtime_warmup');
      if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
      else renderer.compile?.(scene, camera);
      renderProductionScene();
      // A rendered frame can enqueue parallel shader finalization after
      // compileAsync resolves. Keep representatives alive through a second
      // warm render and two compositor turns so Play cannot race that work.
      await new Promise(resolve => requestAnimationFrame(resolve));
      renderProductionScene();
      await new Promise(resolve => requestAnimationFrame(resolve));
    } finally {
      for (const root of roots) enemyManager.remove(root);
      renderer.renderLists?.dispose?.();
    }
    // Some specialists carry their own light, so compiling every representative
    // together produces three-light programs while the ordinary level uses two.
    // Recompile the cleaned scene to cover the baseline variants used on Play.
    repairSceneMaterialBuildHooks('enemy_runtime_baseline_warmup');
    if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
    else renderer.compile?.(scene, camera);
    renderProductionScene();
    await new Promise(resolve => requestAnimationFrame(resolve));
    renderProductionScene();
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (diagnosticLogsEnabled) {
      perfLog.event('loading', 'enemy_runtime_warmup_complete', {
        durationMs: Math.round((performance.now() - enemyWarmStartedAt) * 10) / 10,
        archetypes: roots.length,
        requestedArchetypes: kinds.length
      });
    }
  }
} catch (e) { logError(e, 'enemy runtime warmup'); }

// Pre-warm VFX pools
try { effects.prewarm({ tracers: 64, rings: 8 }); } catch (e) { logError(e); }
if (loadingEl) loadingEl.style.display = 'none';

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
function showToast(text, holdMs = 1500){
  if (!toastsEl) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastsEl.appendChild(el);
  scheduleToastRemoval(el, holdMs);
}

function showStoryBroadcast(text, holdMs = 5600){
  if (!storyBroadcastEl || !storyBroadcastTextEl) return;
  if (storyBroadcastTimer) clearTimeout(storyBroadcastTimer);
  storyBroadcastTextEl.textContent = text;
  storyBroadcastEl.classList.remove('is-visible');
  storyBroadcastEl.offsetHeight;
  storyBroadcastEl.classList.add('is-visible');
  storyBroadcastTimer = setTimeout(() => {
    storyBroadcastEl.classList.remove('is-visible');
    storyBroadcastTimer = null;
  }, Math.max(2500, Number(holdMs) || 5600));
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
    window._HUD.storyBroadcast = (t, holdMs)=> showStoryBroadcast(t, holdMs);
    window._HUD.clearTicker = ()=> clearTicker();
  }
} catch (e) { logError(e); }

// Boss music transitions
if (enemyManager && enemyManager.bossManager) {
  const bm = enemyManager.bossManager;
  const originalStartBoss = bm.startBoss.bind(bm);
  bm.startBoss = (wave) => {
    if (diagnosticLogsEnabled) perfLog.event('game', 'boss_start', { wave });
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
    const bossCreateStartedAt = diagnosticLogsEnabled ? performance.now() : 0;
    const bossResourceBaseline = diagnosticLogsEnabled ? {
      geometries: renderer.info?.memory?.geometries || 0,
      programs: renderer.info?.programs?.length || 0
    } : null;
    const res = originalStartBoss(wave);
    if (res) {
      repairSceneMaterialBuildHooks('boss_instantiated');
      if (diagnosticLogsEnabled) perfLog.event('performance', 'boss_instantiated', {
        wave,
        bossType: bm?.boss?.root?.userData?.type || 'boss',
        durationMs: roundedMs(performance.now() - bossCreateStartedAt),
        rendererBeforeFirstBossFrame: bossResourceBaseline
      });
      if (!qaSimulationMode) {
        achievements.check({
          type: 'bossStart',
          wave,
          bossId: bm?.boss?.root?.userData?.bossId || bm?.boss?.root?.userData?.type || `boss_${wave}`,
          bossType: bm?.boss?.root?.userData?.type || 'boss'
        });
      }
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
    if (!qaSimulationMode) {
      achievements.check({
        type: 'bossDefeated',
        wave: bossWave,
        bossId,
        bossType,
        maxGeneration: Number(hydraLineage?.maxGeneration) || 0
      });
    }
    try { dropPos = bm?.boss?.root?.position?.clone?.() || null; } catch (e) { logError(e); dropPos = null; }
    originalOnBossDeath();
    relayLevel.onBossDefeated(bossWave);
    if (diagnosticLogsEnabled) perfLog.event('game', 'boss_defeated', { wave: bossWave, bossType });
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
        pickups.spawn('ammo', p1, { source: 'boss' });
        pickups.spawn('med', p2, { source: 'boss' });
      }
    } catch (e) { logError(e); }

    try {
      const previousSurvivalWave = mutations.getSurvivalUnlockWave();
      if (!qaSimulationMode) mutations.onBossDefeated(bossWave, { session });
      const survivalUnlockWave = mutations.getSurvivalUnlockWave();
      if (survivalUnlockWave > previousSurvivalWave) {
        const key = survivalUnlockWave >= SURVIVAL_UNLOCK_WAVE
          ? 'mutation.progress.archiveUnlockedAdvanced'
          : 'mutation.progress.archiveUnlockedEarly';
        showToast(t(key));
      }
      updateHUD();
      if (!qaSimulationMode) progression?.onBossDefeated?.(bossWave);
    } catch (e) { logError(e); }
    try { if (story) story.onBossDeath(bm?.wave || 0); } catch (e) { logError(e); }
  };
}

// Deterministic art-review camera: expose a selected authored campaign wave and
// hold the player at the authored spawn without requiring pointer lock.
if (relayPlayerPreviewMode && relayLevel.active) {
  standardRunHasStarted = true;
  reset(false);
  enemyManager.wave = relayPreviewWave;
  relayLevel.onWaveStart(relayPreviewWave);
  const previewDefinition = authoredLevelForWave(relayPreviewWave);
  // Expanse waves author their own storm phase in onWaveStart. Reapplying the
  // baseline here would erase heavy-storm art review shots such as wave 49.
  if (!['sandstorm-expanse', 'blackout-cistern'].includes(previewDefinition.id)) {
    weather.setMode(previewDefinition.weatherByWave[relayPreviewWave], { immediate: true });
  }
  if (previewDefinition.id === 'blackout-cistern') {
    wave72Visuals.start();
    wave72Visuals.update();
    setTimeout(() => wave72Visuals.update(), 0);
  }
  hideMenuView();
  scene.add(camera);
  const previewCameraPosition = relayPreviewShot === 'forest-edge'
    ? [0, 1.7, 24.5]
    : previewDefinition.playerSpawn;
  const previewCameraTarget = relayPreviewShot === 'forest-edge'
    ? [0, 3.8, 46]
    : [0, 2.1, previewDefinition.id === 'ad-zone-arena' ? -4 : -7];
  camera.position.set(...previewCameraPosition);
  camera.up.set(0, 1, 0);
  camera.lookAt(...previewCameraTarget);
  camera.fov = 75;
  camera.updateProjectionMatrix();
  // Preview mode is paused, so advance the immediate weather transition once
  // instead of leaving the art-review frame in the previous clear palette.
  weather.update(0, camera);
  const previewEnemyPositions = [
    [-12, .8, 5], [-5, .8, 1], [4, .8, 2], [12, .8, 5], [-17, .8, -7], [16, .8, -8]
  ];
  for (const position of previewEnemyPositions) enemyManager.spawnAt('grunt', new THREE.Vector3(...position), { countsTowardAlive: false });
  relayLevel.update(0, camera);
  updateHUD();
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


