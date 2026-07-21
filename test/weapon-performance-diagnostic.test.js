import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ENVIRONMENT_DIAGNOSTIC_SCENARIOS,
  PERSISTENT_COMBAT_DIAGNOSTIC_PHASES,
  PersistentCombatMetrics,
  WAVE72_STRESS_PROFILE,
  WEAPON_DIAGNOSTIC_SCENARIOS,
  ScenarioMetrics,
  buildWeaponDiagnosticReport,
  createWeaponDiagnosticConfig
} from '../src/debug/weapon-performance-diagnostic.js';

test('environment diagnostic covers every playable demo level with stable ids', () => {
  assert.deepEqual(
    ENVIRONMENT_DIAGNOSTIC_SCENARIOS.map(scenario => scenario.level),
    ['records', 'dustline', 'floodgate', 'freight', 'blackout']
  );
  assert.equal(new Set(ENVIRONMENT_DIAGNOSTIC_SCENARIOS.map(scenario => scenario.id)).size, 5);
  for (const scenario of ENVIRONMENT_DIAGNOSTIC_SCENARIOS) {
    assert.equal(scenario.category, 'level-environment');
    assert.equal(scenario.weaponHidden, true);
  }
});

test('browser diagnostic uses full measurement defaults unless timing is explicitly overridden', () => {
  assert.deepEqual(createWeaponDiagnosticConfig(new URLSearchParams()), {
    scenarioDurationMs: 5000,
    warmupDurationMs: 1000
  });
  assert.deepEqual(createWeaponDiagnosticConfig(new URLSearchParams('duration=0.5&warmup=0.1')), {
    scenarioDurationMs: 500,
    warmupDurationMs: 100
  });
  assert.deepEqual(createWeaponDiagnosticConfig(new URLSearchParams('duration=&warmup=invalid')), {
    scenarioDurationMs: 5000,
    warmupDurationMs: 1000
  });
});

test('browser diagnostic covers controlled world, weapon, motion, material, and firing comparisons', () => {
  const ids = WEAPON_DIAGNOSTIC_SCENARIOS.map(scenario => scenario.id);

  assert.equal(new Set(ids).size, ids.length, 'scenario ids must be unique');
  assert.ok(ids.includes('world_moving_weapon_hidden'));
  for (const weapon of ['pistol', 'smg', 'rifle']) {
    assert.ok(ids.includes(`${weapon}_stationary`));
    assert.ok(ids.includes(`${weapon}_moving`));
    assert.ok(ids.includes(`${weapon}_moving_firing`));
  }
  assert.ok(ids.includes('smg_moving_motion_frozen'));
  assert.ok(ids.includes('smg_moving_basic'));
  assert.ok(ids.includes('smg_moving_firing_basic'));
});

test('persistent combat sequence keeps one weapon and scene across combat, boss, retention, and cleanup phases', () => {
  const ids = PERSISTENT_COMBAT_DIAGNOSTIC_PHASES.map(phase => phase.id);

  assert.deepEqual(ids, [
    'persistent_fresh_baseline',
    'persistent_enemy_mix',
    'persistent_boss_active',
    'persistent_post_boss_retained',
    'persistent_wave72_swarm',
    'persistent_post_cleanup_control'
  ]);
  assert.equal(new Set(ids).size, ids.length);
  for (const phase of PERSISTENT_COMBAT_DIAGNOSTIC_PHASES) {
    assert.equal(phase.weapon, 'SMG');
    assert.equal(phase.moving, true);
    assert.equal(phase.firing, true);
    assert.equal(phase.preserveScene, true);
  }
  assert.equal(PERSISTENT_COMBAT_DIAGNOSTIC_PHASES[4].transition, 'cleanup_then_spawn_wave72_swarm');
  assert.equal(PERSISTENT_COMBAT_DIAGNOSTIC_PHASES[5].transition, 'explicit_cleanup');
});

test('Wave 73 stress profile models the shooter-free surge roster and persistent supports', () => {
  assert.equal(WAVE72_STRESS_PROFILE.wave, 73);
  assert.deepEqual(WAVE72_STRESS_PROFILE.roster, {
    grunt: 10,
    gruntling: 10,
    rusher: 12,
    tank: 3,
    flyer: 5
  });
  assert.equal(Object.values(WAVE72_STRESS_PROFILE.roster).reduce((sum, count) => sum + count, 0), 40);
  assert.deepEqual(WAVE72_STRESS_PROFILE.supports, { healer: 1, warden: 1 });
  assert.equal('shooter' in WAVE72_STRESS_PROFILE.roster, false);
  assert.deepEqual(WAVE72_STRESS_PROFILE.surgeFractions, [0.25, 0.5, 0.75]);
  assert.equal(WAVE72_STRESS_PROFILE.clearFractionPerSurge, 0.4);
});

test('scenario metrics calculate frame pacing, render percentiles, activity, and renderer maxima', () => {
  const metrics = new ScenarioMetrics({
    id: 'smg_moving',
    label: 'SMG moving',
    weapon: 'SMG',
    moving: true
  });

  for (const sample of [
    { frameMs: 16, playerSimulationMs: 1, weaponEffectsMs: 2, renderMs: 4, drawCalls: 20, triangles: 100, programs: 3, geometries: 8, textures: 2, effects: 1, decals: 0 },
    { frameMs: 20, playerSimulationMs: 2, weaponEffectsMs: 3, renderMs: 6, drawCalls: 25, triangles: 120, programs: 4, geometries: 9, textures: 2, effects: 3, decals: 1 },
    { frameMs: 40, playerSimulationMs: 3, weaponEffectsMs: 4, renderMs: 12, drawCalls: 30, triangles: 140, programs: 4, geometries: 10, textures: 3, effects: 2, decals: 2 },
    { frameMs: 60, playerSimulationMs: 4, weaponEffectsMs: 5, renderMs: 20, drawCalls: 35, triangles: 160, programs: 5, geometries: 11, textures: 3, effects: 4, decals: 3 }
  ]) metrics.addFrame(sample);
  metrics.addShot();
  metrics.addShot();

  const result = metrics.complete({
    durationMs: 136,
    materialTypes: ['MeshStandardMaterial'],
    movement: { distanceMeters: 12.5, averageSpeedMetersPerSecond: 6 }
  });

  assert.equal(result.frames, 4);
  assert.equal(result.averageFps, 29.4);
  assert.equal(result.averageFrameMs, 34);
  assert.equal(result.p95FrameMs, 60);
  assert.equal(result.worstFrameMs, 60);
  assert.equal(result.framesOver33Percent, 50);
  assert.equal(result.framesOver50Percent, 25);
  assert.equal(result.averagePlayerSimulationMs, 2.5);
  assert.equal(result.p95PlayerSimulationMs, 4);
  assert.equal(result.averageWeaponEffectsMs, 3.5);
  assert.equal(result.p95WeaponEffectsMs, 5);
  assert.equal(result.averageRenderMs, 10.5);
  assert.equal(result.p95RenderMs, 20);
  assert.equal(result.maxDrawCalls, 35);
  assert.equal(result.maxTriangles, 160);
  assert.equal(result.maxEffects, 4);
  assert.equal(result.maxDecals, 3);
  assert.equal(result.shots, 2);
  assert.equal(result.shotsPerSecond, 14.7);
  assert.deepEqual(result.materialTypes, ['MeshStandardMaterial']);
  assert.deepEqual(result.movement, { distanceMeters: 12.5, averageSpeedMetersPerSecond: 6 });
});

test('persistent metrics expose full-loop phase cost, scene counts, and boundary deltas', () => {
  const metrics = new PersistentCombatMetrics({
    id: 'persistent_boss_active',
    label: 'Boss active',
    weapon: 'SMG'
  });

  metrics.addFrame({
    frameMs: 20,
    playerSimulationMs: 1,
    weaponEffectsMs: 2,
    enemyAiMs: 4,
    worldSystemsMs: 3,
    renderMs: 5,
    drawCalls: 100,
    triangles: 1000,
    programs: 8,
    geometries: 40,
    textures: 5,
    effects: 3,
    effectPoolObjects: 6,
    decals: 2,
    enemies: 5,
    enemyProjectiles: 7,
    pickups: 2,
    sceneObjects: 80
  });
  metrics.addFrame({
    frameMs: 40,
    playerSimulationMs: 2,
    weaponEffectsMs: 4,
    enemyAiMs: 8,
    worldSystemsMs: 5,
    renderMs: 10,
    drawCalls: 140,
    triangles: 1500,
    programs: 10,
    geometries: 48,
    textures: 6,
    effects: 5,
    effectPoolObjects: 8,
    decals: 4,
    enemies: 7,
    enemyProjectiles: 11,
    pickups: 3,
    sceneObjects: 96
  });

  const result = metrics.complete({
    durationMs: 60,
    startState: {
      sceneObjects: 70,
      enemies: 1,
      enemyProjectiles: 0,
      effects: 0,
      pickups: 0,
      drawCalls: 80,
      triangles: 800,
      programs: 7,
      geometries: 35,
      textures: 5,
      usedJSHeapSize: 1000
    },
    endState: {
      sceneObjects: 96,
      enemies: 7,
      enemyProjectiles: 11,
      effects: 5,
      pickups: 3,
      drawCalls: 140,
      triangles: 1500,
      programs: 10,
      geometries: 48,
      textures: 6,
      usedJSHeapSize: 1600
    }
  });

  assert.equal(result.averageEnemyAiMs, 6);
  assert.equal(result.p95EnemyAiMs, 8);
  assert.equal(result.averageWorldSystemsMs, 4);
  assert.equal(result.averageEnemies, 6);
  assert.equal(result.maxEnemies, 7);
  assert.equal(result.maxEnemyProjectiles, 11);
  assert.equal(result.maxPickups, 3);
  assert.equal(result.maxSceneObjects, 96);
  assert.equal(result.stateDelta.sceneObjects, 26);
  assert.equal(result.stateDelta.geometries, 13);
  assert.equal(result.stateDelta.usedJSHeapSize, 600);
});

test('diagnostic report retains results and emits cautious factual deltas', () => {
  const make = (id, values) => ({
    id,
    averageFrameMs: values.frame,
    averageRenderMs: values.render,
    framesOver33Percent: values.slow,
    averageFps: values.fps
  });
  const report = buildWeaponDiagnosticReport({
    environment: { appVersion: 'test' },
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    environmentScenarios: [
      { id: 'environment_records', averageFps: 40, averageFrameMs: 25, p95FrameMs: 30, framesOver33Percent: 5, averageRenderMs: 12, p95RenderMs: 18, averageDrawCalls: 300, maxTriangles: 50000, maxPrograms: 8, maxGeometries: 90, loadMs: 800 },
      { id: 'environment_dustline', averageFps: 20, averageFrameMs: 50, p95FrameMs: 70, framesOver33Percent: 80, averageRenderMs: 30, p95RenderMs: 44, averageDrawCalls: 450, maxTriangles: 65000, maxPrograms: 10, maxGeometries: 120, loadMs: 1000 }
    ],
    scenarios: [
      make('smg_moving', { frame: 40, render: 20, slow: 50, fps: 25 }),
      make('smg_moving_basic', { frame: 20, render: 5, slow: 10, fps: 50 }),
      make('smg_moving_firing', { frame: 50, render: 25, slow: 60, fps: 20 }),
      make('smg_moving_firing_basic', { frame: 25, render: 7, slow: 15, fps: 40 }),
      make('rifle_moving', { frame: 22, render: 6, slow: 12, fps: 45.5 }),
      make('rifle_moving_firing', { frame: 24, render: 7, slow: 15, fps: 41.7 })
    ],
    errors: []
  });

  assert.equal(report.schemaVersion, 3);
  assert.equal(report.kind, 'weapon-performance-diagnostic');
  assert.equal(report.levelEnvironments.scenarios.length, 2);
  assert.equal(report.levelEnvironments.comparisons.recordsVsDustline.averageFps.changePercent, -50);
  assert.equal(report.levelEnvironments.comparisons.recordsVsDustline.averageDrawCalls.changePercent, 50);
  assert.equal(report.scenarios.length, 6);
  assert.equal(report.comparisons.smgBasicVsLit.averageRenderMs.changePercent, -75);
  assert.equal(report.comparisons.smgFiringBasicVsLit.averageFrameMs.changePercent, -50);
  assert.equal(report.comparisons.smgMovingVsRifleMoving.averageFps.changePercent, 82);
  assert.deepEqual(report.errors, []);
  assert.match(report.notes[0], /signals/i);
  assert.doesNotMatch(report.notes.join(' '), /confirmed cause/i);
});

test('diagnostic report compares retained post-boss state with fresh and explicit-cleanup controls', () => {
  const phase = (id, fps, render, geometries, sceneObjects) => ({
    id,
    averageFps: fps,
    averageFrameMs: 1000 / fps,
    p95FrameMs: 1000 / fps,
    framesOver33Percent: fps < 30 ? 100 : 0,
    averagePlayerSimulationMs: 1,
    p95PlayerSimulationMs: 1,
    averageWeaponEffectsMs: 2,
    p95WeaponEffectsMs: 2,
    averageEnemyAiMs: 3,
    p95EnemyAiMs: 3,
    averageWorldSystemsMs: 1,
    p95WorldSystemsMs: 1,
    averageRenderMs: render,
    p95RenderMs: render,
    endState: { geometries, sceneObjects }
  });
  const report = buildWeaponDiagnosticReport({
    persistentPhases: [
      phase('persistent_fresh_baseline', 60, 4, 20, 50),
      phase('persistent_enemy_mix', 50, 6, 40, 90),
      phase('persistent_boss_active', 25, 18, 140, 260),
      phase('persistent_post_boss_retained', 30, 14, 120, 180),
      phase('persistent_post_cleanup_control', 55, 5, 30, 60)
    ]
  });

  assert.equal(report.schemaVersion, 3);
  assert.equal(report.persistentCombat.phases.length, 5);
  assert.equal(report.persistentCombat.comparisons.freshVsPostBoss.averageFps.changePercent, -50);
  assert.equal(report.persistentCombat.comparisons.postBossVsCleanup.averageRenderMs.changePercent, -64.3);
  assert.deepEqual(report.persistentCombat.resourceRetention.postBossVsFresh, {
    geometries: 100,
    sceneObjects: 130
  });
  assert.deepEqual(report.persistentCombat.resourceRetention.cleanupVsFresh, {
    geometries: 10,
    sceneObjects: 10
  });
  assert.equal(report.persistentCombat.resourceRetention.assessment.classification, 'inconclusive');
  assert.match(report.notes.join(' '), /retained/i);
  assert.doesNotMatch(report.notes.join(' '), /confirmed cause/i);
});

test('diagnostic report distinguishes bounded shared caches from retained live scene state', () => {
  const phase = (id, endState) => ({ id, endState });
  const freshState = {
    sceneObjects: 114,
    enemies: 0,
    enemyProjectiles: 0,
    effects: 1,
    pickups: 0,
    drawCalls: 84,
    programs: 31,
    geometries: 26,
    textures: 0
  };
  const report = buildWeaponDiagnosticReport({
    persistentPhases: [
      phase('persistent_fresh_baseline', freshState),
      phase('persistent_post_cleanup_control', {
        ...freshState,
        sceneObjects: 115,
        effects: 0,
        drawCalls: 82,
        programs: 39,
        geometries: 190,
        textures: 1
      })
    ]
  });

  assert.equal(
    report.persistentCombat.resourceRetention.assessment.classification,
    'bounded_shared_render_cache'
  );
  assert.match(report.persistentCombat.resourceRetention.assessment.explanation, /reusable/i);
});

test('diagnostic retention assessment discounts scene nodes owned by warmed VFX pools', () => {
  const phase = (id, endState) => ({ id, endState });
  const freshState = {
    sceneObjects: 120,
    enemies: 0,
    enemyProjectiles: 0,
    effects: 13,
    effectPoolObjects: 5,
    pickups: 0,
    drawCalls: 94,
    programs: 32,
    geometries: 24,
    textures: 1
  };
  const report = buildWeaponDiagnosticReport({
    persistentPhases: [
      phase('persistent_fresh_baseline', freshState),
      phase('persistent_post_cleanup_control', {
        ...freshState,
        sceneObjects: 123,
        effectPoolObjects: 8,
        drawCalls: 95,
        programs: 40,
        geometries: 230
      })
    ]
  });

  assert.equal(
    report.persistentCombat.resourceRetention.assessment.classification,
    'bounded_shared_render_cache'
  );
  assert.equal(report.persistentCombat.resourceRetention.cleanupVsFresh.effectPoolObjects, 3);
});

test('diagnostic report compares Wave 72 against the regular mix and fresh baseline', () => {
  const phase = (id, fps, render) => ({
    id,
    averageFps: fps,
    averageFrameMs: 1000 / fps,
    p95FrameMs: 1000 / fps,
    averageRenderMs: render,
    endState: {}
  });
  const report = buildWeaponDiagnosticReport({
    persistentPhases: [
      phase('persistent_fresh_baseline', 60, 1),
      phase('persistent_enemy_mix', 58, 2),
      { ...phase('persistent_wave72_swarm', 42, 7), wave72Stress: { maxEnemies: 92 } },
      phase('persistent_post_cleanup_control', 60, 1)
    ]
  });

  assert.equal(report.persistentCombat.comparisons.freshVsWave72.averageFps.candidate, 42);
  assert.equal(report.persistentCombat.comparisons.enemyMixVsWave72.averageRenderMs.change, 5);
  assert.deepEqual(report.persistentCombat.wave72Stress, { maxEnemies: 92 });
});

test('standalone browser page auto-starts and exposes copyable output without loading index', () => {
  const html = fs.readFileSync(new URL('../test-weapon-performance.html', import.meta.url), 'utf8');

  assert.match(html, /id="diagnosticOutput"/);
  assert.match(html, /id="copyReport"/);
  assert.match(html, /id="environmentFrame"/);
  assert.match(html, /weapon-performance-diagnostic-runner\.js/);
  assert.doesNotMatch(html, /index\.html/);
});

test('moving scenarios drive the real player controller with held forward input', () => {
  const runner = fs.readFileSync(new URL('../src/debug/weapon-performance-diagnostic-runner.js', import.meta.url), 'utf8');

  assert.match(runner, /import \{ PlayerController \} from '\.\.\/player\.js'/);
  assert.match(runner, /new PlayerController\(/);
  assert.match(runner, /player\.keys\.add\('KeyW'\)/);
  assert.match(runner, /player\.update\(simulationDt\)/);
  assert.match(runner, /applyRecoil:\s*recoil\s*=>\s*player\.applyRecoil\(recoil\)/);
  assert.doesNotMatch(runner, /function configureCamera\(/);
});

test('browser runner exercises the real persistent enemy and boss lifecycle without changing weapons', () => {
  const runner = fs.readFileSync(new URL('../src/debug/weapon-performance-diagnostic-runner.js', import.meta.url), 'utf8');

  assert.match(runner, /import \{ EnemyManager \} from '\.\.\/enemies\.js/);
  assert.match(runner, /PERSISTENT_COMBAT_DIAGNOSTIC_PHASES/);
  assert.match(runner, /enemyManager\.tickAI\(/);
  assert.match(runner, /bossManager\.startBoss\(5\)/);
  assert.match(runner, /preparePersistentWave72\(\)/);
  assert.match(runner, /simulateWave72PartialClear\(\)/);
  assert.match(runner, /updateWave72Stress\(\)/);
  assert.match(runner, /spawnWave72Roster\(WAVE72_STRESS_PROFILE\.roster/);
  assert.match(runner, /dataset\.weaponDiagnosticSummary/);
  assert.match(runner, /capturePersistentState\(/);
  assert.match(runner, /transitionPersistentPhase\(/);
  assert.match(runner, /enemyManager\.clearProjectiles\(\)/);
});
