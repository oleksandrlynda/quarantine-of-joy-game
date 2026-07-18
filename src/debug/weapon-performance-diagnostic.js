import { WAVE72_ENCOUNTER } from '../enemies/wave-definitions.js';

const ROUND_DIGITS = 10;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function roundOne(value) {
  return Math.round(finite(value) * ROUND_DIGITS) / ROUND_DIGITS;
}

function boundedSeconds(params, key, min, max, fallback) {
  const raw = params?.get?.(key);
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function createWeaponDiagnosticConfig(params = new URLSearchParams()) {
  return {
    scenarioDurationMs: boundedSeconds(params, 'duration', 0.5, 10, 5) * 1000,
    warmupDurationMs: boundedSeconds(params, 'warmup', 0.1, 3, 1) * 1000
  };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[Math.min(ordered.length - 1, rank)];
}

function scenario(definition) {
  return Object.freeze({
    weapon: 'Rifle',
    moving: false,
    firing: false,
    weaponHidden: false,
    materialMode: 'production',
    motionFrozen: false,
    ...definition
  });
}

export const WEAPON_DIAGNOSTIC_SCENARIOS = Object.freeze([
  scenario({
    id: 'world_moving_weapon_hidden',
    label: 'World moving — weapon hidden',
    moving: true,
    weaponHidden: true
  }),
  scenario({ id: 'pistol_stationary', label: 'Pistol — stationary', weapon: 'Pistol' }),
  scenario({ id: 'pistol_moving', label: 'Pistol — moving', weapon: 'Pistol', moving: true }),
  scenario({ id: 'pistol_moving_firing', label: 'Pistol — moving + firing', weapon: 'Pistol', moving: true, firing: true }),
  scenario({ id: 'smg_stationary', label: 'SMG — stationary', weapon: 'SMG' }),
  scenario({ id: 'smg_moving', label: 'SMG — moving', weapon: 'SMG', moving: true }),
  scenario({
    id: 'smg_moving_motion_frozen',
    label: 'SMG — moving, weapon motion frozen',
    weapon: 'SMG',
    moving: true,
    motionFrozen: true
  }),
  scenario({
    id: 'smg_moving_basic',
    label: 'SMG — moving, unlit material override',
    weapon: 'SMG',
    moving: true,
    materialMode: 'basic_override'
  }),
  scenario({ id: 'smg_moving_firing', label: 'SMG — moving + firing', weapon: 'SMG', moving: true, firing: true }),
  scenario({
    id: 'smg_moving_firing_basic',
    label: 'SMG — moving + firing, unlit material override',
    weapon: 'SMG',
    moving: true,
    firing: true,
    materialMode: 'basic_override'
  }),
  scenario({ id: 'rifle_stationary', label: 'Rifle — stationary', weapon: 'Rifle' }),
  scenario({ id: 'rifle_moving', label: 'Rifle — moving', weapon: 'Rifle', moving: true }),
  scenario({ id: 'rifle_moving_firing', label: 'Rifle — moving + firing', weapon: 'Rifle', moving: true, firing: true })
]);

function environmentScenario(definition) {
  return Object.freeze({
    category: 'level-environment',
    moving: false,
    firing: false,
    weaponHidden: true,
    ...definition
  });
}

export const ENVIRONMENT_DIAGNOSTIC_SCENARIOS = Object.freeze([
  environmentScenario({ id: 'environment_records', level: 'records', label: 'Environment - Records Courtyard' }),
  environmentScenario({ id: 'environment_dustline', level: 'dustline', label: 'Environment - Dustline Checkpoint' }),
  environmentScenario({ id: 'environment_floodgate', level: 'floodgate', label: 'Environment - Floodgate Underpass' }),
  environmentScenario({ id: 'environment_freight', level: 'freight', label: 'Environment - Freight Annex' }),
  environmentScenario({ id: 'environment_blackout', level: 'blackout', label: 'Environment - Blackout Cistern' })
]);

export const WAVE72_STRESS_PROFILE = Object.freeze({
  wave: WAVE72_ENCOUNTER.wave,
  clearFractionPerSurge: WAVE72_ENCOUNTER.clearFractionPerSurge,
  surgeFractions: Object.freeze([0.25, 0.5, 0.75]),
  roster: Object.freeze({
    grunt: WAVE72_ENCOUNTER.initialRoster.grunt,
    gruntling: WAVE72_ENCOUNTER.initialRoster.gruntling,
    rusher: WAVE72_ENCOUNTER.initialRoster.rusher,
    tank: WAVE72_ENCOUNTER.initialRoster.tank,
    flyer: WAVE72_ENCOUNTER.initialRoster.flyer
  }),
  supports: Object.freeze({
    healer: WAVE72_ENCOUNTER.initialRoster.healer,
    warden: WAVE72_ENCOUNTER.initialRoster.warden
  })
});

function persistentPhase(definition) {
  return Object.freeze({
    weapon: 'SMG',
    moving: true,
    firing: true,
    preserveScene: true,
    transition: 'preserve',
    ...definition
  });
}

export const PERSISTENT_COMBAT_DIAGNOSTIC_PHASES = Object.freeze([
  persistentPhase({
    id: 'persistent_fresh_baseline',
    label: 'Persistent scene - fresh baseline',
    transition: 'initialize_persistent_scene'
  }),
  persistentPhase({
    id: 'persistent_enemy_mix',
    label: 'Persistent scene - regular enemy mix',
    transition: 'spawn_enemy_mix'
  }),
  persistentPhase({
    id: 'persistent_boss_active',
    label: 'Persistent scene - boss and minions',
    transition: 'start_boss_wave_5'
  }),
  persistentPhase({
    id: 'persistent_post_boss_retained',
    label: 'Persistent scene - post-boss retained state',
    transition: 'remove_boss_preserve_resources'
  }),
  persistentPhase({
    id: 'persistent_wave72_swarm',
    label: 'Wave 72 - dark-arena swarm surges',
    transition: 'cleanup_then_spawn_wave72_swarm',
    wave: WAVE72_STRESS_PROFILE.wave,
    stressProfile: WAVE72_STRESS_PROFILE
  }),
  persistentPhase({
    id: 'persistent_post_cleanup_control',
    label: 'Persistent scene - explicit cleanup control',
    transition: 'explicit_cleanup'
  })
]);

export class ScenarioMetrics {
  constructor(definition = {}) {
    this.definition = { ...definition };
    this.frameMs = [];
    this.playerSimulationMs = [];
    this.weaponEffectsMs = [];
    this.renderMs = [];
    this.frames = 0;
    this.shots = 0;
    this.totalDrawCalls = 0;
    this.maxDrawCalls = 0;
    this.maxTriangles = 0;
    this.maxPrograms = 0;
    this.maxGeometries = 0;
    this.maxTextures = 0;
    this.maxEffects = 0;
    this.maxEffectPoolObjects = 0;
    this.maxDecals = 0;
    this.framesOver33 = 0;
    this.framesOver50 = 0;
  }

  addFrame(sample = {}) {
    const frameMs = Math.max(0, finite(sample.frameMs));
    const playerSimulationMs = Math.max(0, finite(sample.playerSimulationMs));
    const weaponEffectsMs = Math.max(0, finite(sample.weaponEffectsMs));
    const renderMs = Math.max(0, finite(sample.renderMs));
    const drawCalls = Math.max(0, finite(sample.drawCalls));

    this.frames++;
    this.frameMs.push(frameMs);
    this.playerSimulationMs.push(playerSimulationMs);
    this.weaponEffectsMs.push(weaponEffectsMs);
    this.renderMs.push(renderMs);
    this.totalDrawCalls += drawCalls;
    this.maxDrawCalls = Math.max(this.maxDrawCalls, drawCalls);
    this.maxTriangles = Math.max(this.maxTriangles, Math.max(0, finite(sample.triangles)));
    this.maxPrograms = Math.max(this.maxPrograms, Math.max(0, finite(sample.programs)));
    this.maxGeometries = Math.max(this.maxGeometries, Math.max(0, finite(sample.geometries)));
    this.maxTextures = Math.max(this.maxTextures, Math.max(0, finite(sample.textures)));
    this.maxEffects = Math.max(this.maxEffects, Math.max(0, finite(sample.effects)));
    this.maxEffectPoolObjects = Math.max(this.maxEffectPoolObjects, Math.max(0, finite(sample.effectPoolObjects)));
    this.maxDecals = Math.max(this.maxDecals, Math.max(0, finite(sample.decals)));
    if (frameMs >= 33) this.framesOver33++;
    if (frameMs >= 50) this.framesOver50++;
  }

  addShot() {
    this.shots++;
  }

  complete({ durationMs, materialTypes = [], movement = null } = {}) {
    const measuredDurationMs = Math.max(
      0,
      finite(durationMs, this.frameMs.reduce((total, value) => total + value, 0))
    );
    const totalFrameMs = this.frameMs.reduce((total, value) => total + value, 0);
    const totalPlayerSimulationMs = this.playerSimulationMs.reduce((total, value) => total + value, 0);
    const totalWeaponEffectsMs = this.weaponEffectsMs.reduce((total, value) => total + value, 0);
    const totalRenderMs = this.renderMs.reduce((total, value) => total + value, 0);
    const uniqueMaterials = [...new Set(materialTypes.filter(value => typeof value === 'string' && value))].sort();

    return {
      ...this.definition,
      durationMs: roundOne(measuredDurationMs),
      frames: this.frames,
      averageFps: measuredDurationMs > 0 ? roundOne((this.frames * 1000) / measuredDurationMs) : 0,
      averageFrameMs: this.frames ? roundOne(totalFrameMs / this.frames) : 0,
      p50FrameMs: roundOne(percentile(this.frameMs, 0.5)),
      p95FrameMs: roundOne(percentile(this.frameMs, 0.95)),
      worstFrameMs: roundOne(percentile(this.frameMs, 1)),
      framesOver33: this.framesOver33,
      framesOver50: this.framesOver50,
      framesOver33Percent: this.frames ? roundOne((this.framesOver33 / this.frames) * 100) : 0,
      framesOver50Percent: this.frames ? roundOne((this.framesOver50 / this.frames) * 100) : 0,
      averagePlayerSimulationMs: this.frames ? roundOne(totalPlayerSimulationMs / this.frames) : 0,
      p95PlayerSimulationMs: roundOne(percentile(this.playerSimulationMs, 0.95)),
      maxPlayerSimulationMs: roundOne(percentile(this.playerSimulationMs, 1)),
      averageWeaponEffectsMs: this.frames ? roundOne(totalWeaponEffectsMs / this.frames) : 0,
      p95WeaponEffectsMs: roundOne(percentile(this.weaponEffectsMs, 0.95)),
      maxWeaponEffectsMs: roundOne(percentile(this.weaponEffectsMs, 1)),
      averageRenderMs: this.frames ? roundOne(totalRenderMs / this.frames) : 0,
      p95RenderMs: roundOne(percentile(this.renderMs, 0.95)),
      maxRenderMs: roundOne(percentile(this.renderMs, 1)),
      averageDrawCalls: this.frames ? roundOne(this.totalDrawCalls / this.frames) : 0,
      maxDrawCalls: this.maxDrawCalls,
      maxTriangles: this.maxTriangles,
      maxPrograms: this.maxPrograms,
      maxGeometries: this.maxGeometries,
      maxTextures: this.maxTextures,
      maxEffects: this.maxEffects,
      maxEffectPoolObjects: this.maxEffectPoolObjects,
      maxDecals: this.maxDecals,
      shots: this.shots,
      shotsPerSecond: measuredDurationMs > 0 ? roundOne(this.shots / (measuredDurationMs / 1000)) : 0,
      materialTypes: uniqueMaterials,
      movement
    };
  }
}

function numericStateDelta(startState = {}, endState = {}) {
  const delta = {};
  for (const [key, endValue] of Object.entries(endState || {})) {
    const startValue = startState?.[key];
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) continue;
    delta[key] = roundOne(endValue - startValue);
  }
  return delta;
}

export class PersistentCombatMetrics extends ScenarioMetrics {
  constructor(definition = {}) {
    super(definition);
    this.enemyAiMs = [];
    this.worldSystemsMs = [];
    this.totalEnemies = 0;
    this.totalEnemyProjectiles = 0;
    this.totalPickups = 0;
    this.totalSceneObjects = 0;
    this.maxEnemies = 0;
    this.maxEnemyProjectiles = 0;
    this.maxPickups = 0;
    this.maxSceneObjects = 0;
  }

  addFrame(sample = {}) {
    super.addFrame(sample);
    const enemyAiMs = Math.max(0, finite(sample.enemyAiMs));
    const worldSystemsMs = Math.max(0, finite(sample.worldSystemsMs));
    const enemies = Math.max(0, finite(sample.enemies));
    const enemyProjectiles = Math.max(0, finite(sample.enemyProjectiles));
    const pickups = Math.max(0, finite(sample.pickups));
    const sceneObjects = Math.max(0, finite(sample.sceneObjects));
    this.enemyAiMs.push(enemyAiMs);
    this.worldSystemsMs.push(worldSystemsMs);
    this.totalEnemies += enemies;
    this.totalEnemyProjectiles += enemyProjectiles;
    this.totalPickups += pickups;
    this.totalSceneObjects += sceneObjects;
    this.maxEnemies = Math.max(this.maxEnemies, enemies);
    this.maxEnemyProjectiles = Math.max(this.maxEnemyProjectiles, enemyProjectiles);
    this.maxPickups = Math.max(this.maxPickups, pickups);
    this.maxSceneObjects = Math.max(this.maxSceneObjects, sceneObjects);
  }

  complete({ startState = {}, endState = {}, ...options } = {}) {
    const result = super.complete(options);
    const totalEnemyAiMs = this.enemyAiMs.reduce((total, value) => total + value, 0);
    const totalWorldSystemsMs = this.worldSystemsMs.reduce((total, value) => total + value, 0);
    return {
      ...result,
      averageEnemyAiMs: this.frames ? roundOne(totalEnemyAiMs / this.frames) : 0,
      p95EnemyAiMs: roundOne(percentile(this.enemyAiMs, 0.95)),
      maxEnemyAiMs: roundOne(percentile(this.enemyAiMs, 1)),
      averageWorldSystemsMs: this.frames ? roundOne(totalWorldSystemsMs / this.frames) : 0,
      p95WorldSystemsMs: roundOne(percentile(this.worldSystemsMs, 0.95)),
      maxWorldSystemsMs: roundOne(percentile(this.worldSystemsMs, 1)),
      averageEnemies: this.frames ? roundOne(this.totalEnemies / this.frames) : 0,
      averageEnemyProjectiles: this.frames ? roundOne(this.totalEnemyProjectiles / this.frames) : 0,
      averagePickups: this.frames ? roundOne(this.totalPickups / this.frames) : 0,
      averageSceneObjects: this.frames ? roundOne(this.totalSceneObjects / this.frames) : 0,
      maxEnemies: this.maxEnemies,
      maxEnemyProjectiles: this.maxEnemyProjectiles,
      maxPickups: this.maxPickups,
      maxSceneObjects: this.maxSceneObjects,
      startState,
      endState,
      stateDelta: numericStateDelta(startState, endState)
    };
  }
}

function metricDelta(baseline, candidate, key) {
  const before = finite(baseline?.[key]);
  const after = finite(candidate?.[key]);
  return {
    baseline: roundOne(before),
    candidate: roundOne(after),
    change: roundOne(after - before),
    changePercent: before === 0 ? null : roundOne(((after - before) / before) * 100)
  };
}

function compare(scenariosById, baselineId, candidateId) {
  const baseline = scenariosById.get(baselineId);
  const candidate = scenariosById.get(candidateId);
  if (!baseline || !candidate) return null;
  return {
    baselineScenario: baselineId,
    candidateScenario: candidateId,
    averageFps: metricDelta(baseline, candidate, 'averageFps'),
    averageFrameMs: metricDelta(baseline, candidate, 'averageFrameMs'),
    p95FrameMs: metricDelta(baseline, candidate, 'p95FrameMs'),
    framesOver33Percent: metricDelta(baseline, candidate, 'framesOver33Percent'),
    averagePlayerSimulationMs: metricDelta(baseline, candidate, 'averagePlayerSimulationMs'),
    p95PlayerSimulationMs: metricDelta(baseline, candidate, 'p95PlayerSimulationMs'),
    averageWeaponEffectsMs: metricDelta(baseline, candidate, 'averageWeaponEffectsMs'),
    p95WeaponEffectsMs: metricDelta(baseline, candidate, 'p95WeaponEffectsMs'),
    averageEnemyAiMs: metricDelta(baseline, candidate, 'averageEnemyAiMs'),
    p95EnemyAiMs: metricDelta(baseline, candidate, 'p95EnemyAiMs'),
    averageWorldSystemsMs: metricDelta(baseline, candidate, 'averageWorldSystemsMs'),
    p95WorldSystemsMs: metricDelta(baseline, candidate, 'p95WorldSystemsMs'),
    averageRenderMs: metricDelta(baseline, candidate, 'averageRenderMs'),
    p95RenderMs: metricDelta(baseline, candidate, 'p95RenderMs')
  };
}

function compareEnvironment(scenariosById, baselineId, candidateId) {
  const baseline = scenariosById.get(baselineId);
  const candidate = scenariosById.get(candidateId);
  if (!baseline || !candidate) return null;
  return {
    baselineScenario: baselineId,
    candidateScenario: candidateId,
    averageFps: metricDelta(baseline, candidate, 'averageFps'),
    averageFrameMs: metricDelta(baseline, candidate, 'averageFrameMs'),
    p95FrameMs: metricDelta(baseline, candidate, 'p95FrameMs'),
    framesOver33Percent: metricDelta(baseline, candidate, 'framesOver33Percent'),
    averageRenderMs: metricDelta(baseline, candidate, 'averageRenderMs'),
    p95RenderMs: metricDelta(baseline, candidate, 'p95RenderMs'),
    averageDrawCalls: metricDelta(baseline, candidate, 'averageDrawCalls'),
    maxTriangles: metricDelta(baseline, candidate, 'maxTriangles'),
    maxPrograms: metricDelta(baseline, candidate, 'maxPrograms'),
    maxGeometries: metricDelta(baseline, candidate, 'maxGeometries'),
    loadMs: metricDelta(baseline, candidate, 'loadMs')
  };
}

const RETENTION_KEYS = Object.freeze([
  'sceneObjects',
  'enemies',
  'enemyProjectiles',
  'effects',
  'effectPoolObjects',
  'pickups',
  'drawCalls',
  'triangles',
  'programs',
  'geometries',
  'textures',
  'usedJSHeapSize'
]);

function retainedStateDelta(baseline, candidate) {
  const before = baseline?.endState || {};
  const after = candidate?.endState || {};
  const delta = {};
  for (const key of RETENTION_KEYS) {
    if (!Number.isFinite(before[key]) || !Number.isFinite(after[key])) continue;
    delta[key] = roundOne(after[key] - before[key]);
  }
  return delta;
}

function assessPersistentRetention(baseline, candidate) {
  const delta = retainedStateDelta(baseline, candidate);
  const requiredLiveKeys = ['sceneObjects', 'enemies', 'enemyProjectiles', 'effects', 'pickups', 'drawCalls'];
  const hasLiveState = requiredLiveKeys.every(key => Number.isFinite(delta[key]));
  if (!hasLiveState) {
    return {
      classification: 'inconclusive',
      explanation: 'The capture does not include enough live-scene counters to distinguish a shared render cache from retained gameplay objects.'
    };
  }

  const retainedGameplay = ['enemies', 'enemyProjectiles', 'pickups'].some(key => delta[key] > 0)
    || delta.effects > 1;
  const pooledSceneObjects = Math.max(0, delta.effectPoolObjects || 0);
  const retainedScene = delta.sceneObjects - pooledSceneObjects > 2 || delta.drawCalls > 2;
  if (retainedGameplay || retainedScene) {
    return {
      classification: 'live_state_retained',
      explanation: 'Gameplay or rendered scene state remains above the fresh baseline after cleanup; inspect the positive live-object and draw-call deltas.'
    };
  }

  if ((delta.geometries || 0) > 0 || (delta.programs || 0) > 0 || (delta.textures || 0) > 0) {
    return {
      classification: 'bounded_shared_render_cache',
      explanation: 'Cleanup returned live objects and draw calls to baseline while renderer resources stayed warm, which is consistent with reusable enemy or boss template caches.'
    };
  }

  return {
    classification: 'clean',
    explanation: 'Cleanup returned both live scene state and renderer resources to the fresh baseline.'
  };
}

export function buildWeaponDiagnosticReport({
  environment = {},
  startedAt = null,
  completedAt = null,
  environmentScenarios = [],
  scenarios = [],
  persistentPhases = [],
  persistentTransitions = [],
  errors = [],
  interruptions = []
} = {}) {
  const finished = completedAt || new Date().toISOString();
  const byId = new Map(scenarios.map(result => [result.id, result]));
  const environmentsById = new Map(environmentScenarios.map(result => [result.id, result]));
  const persistentById = new Map(persistentPhases.map(result => [result.id, result]));
  const fresh = persistentById.get('persistent_fresh_baseline');
  const postBoss = persistentById.get('persistent_post_boss_retained');
  const wave72 = persistentById.get('persistent_wave72_swarm');
  const cleanup = persistentById.get('persistent_post_cleanup_control');
  return {
    schemaVersion: 3,
    kind: 'weapon-performance-diagnostic',
    capturedAt: finished,
    startedAt,
    completedAt: finished,
    environment,
    levelEnvironments: {
      scenarios: environmentScenarios,
      comparisons: {
        recordsVsDustline: compareEnvironment(environmentsById, 'environment_records', 'environment_dustline'),
        recordsVsFloodgate: compareEnvironment(environmentsById, 'environment_records', 'environment_floodgate'),
        recordsVsFreight: compareEnvironment(environmentsById, 'environment_records', 'environment_freight'),
        recordsVsBlackout: compareEnvironment(environmentsById, 'environment_records', 'environment_blackout')
      }
    },
    scenarios,
    comparisons: {
      worldMovementVsSmg: compare(byId, 'world_moving_weapon_hidden', 'smg_moving'),
      pistolMovingVsStationary: compare(byId, 'pistol_stationary', 'pistol_moving'),
      pistolFiringVsMoving: compare(byId, 'pistol_moving', 'pistol_moving_firing'),
      smgMovingVsStationary: compare(byId, 'smg_stationary', 'smg_moving'),
      smgMotionFrozenVsAnimated: compare(byId, 'smg_moving', 'smg_moving_motion_frozen'),
      smgBasicVsLit: compare(byId, 'smg_moving', 'smg_moving_basic'),
      smgFiringVsMoving: compare(byId, 'smg_moving', 'smg_moving_firing'),
      smgFiringBasicVsLit: compare(byId, 'smg_moving_firing', 'smg_moving_firing_basic'),
      rifleMovingVsStationary: compare(byId, 'rifle_stationary', 'rifle_moving'),
      rifleFiringVsMoving: compare(byId, 'rifle_moving', 'rifle_moving_firing'),
      smgMovingVsRifleMoving: compare(byId, 'smg_moving', 'rifle_moving'),
      smgFiringVsRifleFiring: compare(byId, 'smg_moving_firing', 'rifle_moving_firing')
    },
    persistentCombat: {
      phases: persistentPhases,
      transitions: persistentTransitions,
      comparisons: {
        freshVsEnemyMix: compare(persistentById, 'persistent_fresh_baseline', 'persistent_enemy_mix'),
        enemyMixVsBoss: compare(persistentById, 'persistent_enemy_mix', 'persistent_boss_active'),
        freshVsPostBoss: compare(persistentById, 'persistent_fresh_baseline', 'persistent_post_boss_retained'),
        freshVsWave72: compare(persistentById, 'persistent_fresh_baseline', 'persistent_wave72_swarm'),
        enemyMixVsWave72: compare(persistentById, 'persistent_enemy_mix', 'persistent_wave72_swarm'),
        wave72VsCleanup: compare(persistentById, 'persistent_wave72_swarm', 'persistent_post_cleanup_control'),
        postBossVsCleanup: compare(persistentById, 'persistent_post_boss_retained', 'persistent_post_cleanup_control'),
        freshVsCleanup: compare(persistentById, 'persistent_fresh_baseline', 'persistent_post_cleanup_control')
      },
      resourceRetention: {
        postBossVsFresh: retainedStateDelta(fresh, postBoss),
        cleanupVsFresh: retainedStateDelta(fresh, cleanup),
        assessment: assessPersistentRetention(fresh, cleanup)
      },
      wave72Stress: wave72?.wave72Stress || null
    },
    errors,
    interruptions,
    notes: [
      'Comparisons are diagnostic signals from controlled scenarios; they identify correlations, not a confirmed performance cause.',
      'Level-environment phases load the real demo scenes in an isolated same-origin frame; startup time is reported separately and warm-up frames are excluded.',
      'Persistent combat phases keep one scene and SMG alive so retained post-boss state remains observable until the explicit cleanup control.',
      'The Wave 72 phase uses a 40-unit melee and flyer roster, persistent Warden and healer supports, and three simulated reinforcement thresholds after partial clears.',
      'Renderer geometry, program, and texture totals include intentionally warm shared enemy and boss template caches; treat them as a live leak only when live objects or draw calls remain elevated, or repeated cycles keep growing.',
      'Warm-up frames are excluded from every scenario result.',
      'Keep the tab visible and avoid resizing or interacting with it while the run is active.'
    ]
  };
}
