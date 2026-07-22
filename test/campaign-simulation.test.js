import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  DEFAULT_CAMPAIGN_ERROR_LIMIT,
  DEFAULT_CAMPAIGN_EVENT_LIMIT,
  DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS,
  evaluateCampaignCombatStall,
  evaluateCampaignLineOfFire,
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
  summarizeCampaignCollisionEvents,
  summarizeCampaignPerformanceEvents,
  summarizeRoster,
  validateCampaignSnapshot,
  validateWaveCompletion
} from '../src/debug/campaign-simulation.js';

test('seeded campaign starts and routes are deterministic per wave', () => {
  const first = seededPlayerStart('QA-SEED', 35, [0, 1.7, 26]);
  const repeat = seededPlayerStart('QA-SEED', 35, [0, 1.7, 26]);
  const otherWave = seededPlayerStart('QA-SEED', 36, [0, 1.7, 26]);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, otherWave);
  assert.deepEqual(buildPlayerRoute('QA-SEED', 35, first, 30, 4), buildPlayerRoute('QA-SEED', 35, first, 30, 4));
});

test('campaign recorder stops exactly at the first 50 errors by default', () => {
  let now = 0;
  const recorder = new CampaignSimulationRecorder({ seed: 'LIMIT', now: () => now++, wallNow: () => 0 });
  recorder.beginWave(1);
  for (let index = 0; index < DEFAULT_CAMPAIGN_ERROR_LIMIT + 5; index++) recorder.error(`e${index}`, 'failure');
  assert.equal(recorder.errors.length, DEFAULT_CAMPAIGN_ERROR_LIMIT);
  assert.equal(recorder.stopped, true);
  assert.equal(recorder.stopReason, 'error_limit');
  assert.equal(recorder.waves[0].status, 'stopped');
});

test('campaign recorder compacts nested Three.js roots instead of retaining scene graphs', () => {
  const recorder = new CampaignSimulationRecorder({ seed: 'COMPACT', wallNow: () => 0 });
  const blockerRoot = {
    isObject3D: true,
    uuid: 'enemy-123',
    name: 'Blocker',
    type: 'Group',
    position: { x: 1.23456, y: .8, z: -9.87654 },
    userData: { type: 'rusher', behaviorId: 'rusher', hp: 60, maxHp: 60 },
    parent: { retainedSceneGraph: true },
    children: [{ geometry: { retainedGeometry: true } }]
  };

  const event = recorder.record('ai', 'state_changed', { data: { blockerRoot } });

  assert.deepEqual(event.data.data.blockerRoot, {
    object3D: true,
    id: 'enemy-123',
    name: 'Blocker',
    type: 'rusher',
    behaviorId: 'rusher',
    colliderId: null,
    hp: 60,
    maxHp: 60,
    position: { x: 1.235, y: .8, z: -9.877 }
  });
  assert.equal('parent' in event.data.data.blockerRoot, false);
  assert.equal('children' in event.data.data.blockerRoot, false);
});

test('campaign snapshot validation catches core state corruption', () => {
  const issues = validateCampaignSnapshot({
    wave: 4,
    player: { position: { x: NaN, y: 1.7, z: 0 } },
    alive: -1,
    activeEnemies: 0,
    hp: -5,
    renderer: { drawCalls: 1, triangles: 2, geometries: 3, textures: 4 }
  }, 5);
  assert.deepEqual(issues.map(issue => issue.code), [
    'wave_mismatch', 'player_position_non_finite', 'enemy_count_negative', 'player_hp_invalid'
  ]);
});

test('campaign roster summary preserves every planned enemy', () => {
  assert.deepEqual(summarizeRoster(['grunt', 'rusher', 'grunt', 'tank']), { grunt: 2, rusher: 1, tank: 1 });
});

test('two-coordinate objective points are interpreted as x/z positions', () => {
  assert.deepEqual(normalizeObjectivePosition([0, -7]), { x: 0, y: 1.7, z: -7 });
  assert.deepEqual(normalizeObjectivePosition([2, 0.8, 9]), { x: 2, y: 1.7, z: 9 });
});

test('objective combat leash preserves valid strafes and projects only out-of-range positions', () => {
  assert.deepEqual(
    leashObjectivePosition({ x: 15.5, y: 1.7, z: 2 }, { x: 17.5, y: 1.7, z: 2 }, 3.5),
    { x: 17.5, y: 1.7, z: 2, leashed: false, distance: 2 }
  );
  assert.deepEqual(
    leashObjectivePosition({ x: 15.5, y: 1.7, z: 2 }, { x: 15.5, y: 1.7, z: 10 }, 3.5),
    { x: 15.5, y: 1.7, z: 4.9, leashed: true, distance: 2.9 }
  );
});

test('objective alignment candidates remain deterministic and inside the capture radius', () => {
  const candidates = buildObjectiveAlignmentCandidates([-15.5, 7.5], 5.25);
  assert.equal(candidates.length, 17);
  assert.deepEqual(candidates[0], { x: -15.5, y: 1.7, z: 7.5 });
  assert.equal(new Set(candidates.map(candidate => `${candidate.x},${candidate.z}`)).size, 17);
  for (const candidate of candidates) {
    assert.ok(Math.hypot(candidate.x + 15.5, candidate.z - 7.5) < 5.25);
  }
});

test('objective geometry and combat priority preserve an uncontested capture', () => {
  assert.equal(isCampaignObjectivePositionInside({ x: -24, z: 16 }, { x: -19.91, z: 18.19 }, 4.25), false);
  assert.equal(isCampaignObjectivePositionInside({ x: -24, z: 16 }, { x: -21, z: 17 }, 4.25), true);
  assert.equal(shouldPrioritizeCampaignObjectiveHold({
    holdActive: true,
    objectiveComplete: false,
    contested: false,
    lineOfFireClear: false
  }), true);
  assert.equal(shouldPrioritizeCampaignObjectiveHold({
    holdActive: true,
    objectiveComplete: false,
    contested: true,
    lineOfFireClear: false
  }), false);
});

test('objective completion is re-evaluated while combat is running', () => {
  assert.equal(isCampaignObjectiveTargetComplete({ kind: 'sponsor', complete: false }), false);
  assert.equal(isCampaignObjectiveTargetComplete({ kind: 'sponsor', complete: true }), true);
  assert.equal(isCampaignObjectiveTargetComplete({
    kind: 'multi-capture',
    targets: [{ complete: true }, { complete: false }]
  }, 1), false);
  assert.equal(isCampaignObjectiveTargetComplete({
    kind: 'multi-capture',
    targets: [{ complete: true }, { complete: false }]
  }, 0), true);
  assert.equal(isCampaignObjectiveTargetComplete({ kind: 'liberation' }, 0, true), true);
});

test('hold objectives are required and use production objective progress', () => {
  assert.equal(isCampaignObjectiveRequiredKind('hold'), true);
  assert.equal(isCampaignObjectiveRequiredKind('eliminate'), false);
  assert.equal(campaignObjectiveTargetProgress({ kind: 'hold', progress: .625 }), .625);
  assert.equal(campaignObjectiveTargetProgress({
    kind: 'multi-capture',
    targets: [{ progress: 5.2, seconds: 10 }]
  }), .52);
});

test('production self-destructs count as exercised enemies without pretending HP reached zero', () => {
  assert.equal(isCampaignProductionElimination({ userData: { hp: 5, productionSelfDestruct: true } }), true);
  assert.equal(isCampaignProductionElimination({ userData: { hp: 0 } }), true);
  assert.equal(isCampaignProductionElimination({ userData: { hp: 5 } }), false);
  const healer = fs.readFileSync(new URL('../src/enemies/healer.js', import.meta.url), 'utf8');
  assert.match(healer, /root\.userData\.productionSelfDestruct = true/);
  const rusher = fs.readFileSync(new URL('../src/enemies/rusher.js', import.meta.url), 'utf8');
  assert.match(rusher, /e\.userData\.productionSelfDestruct = true/);
});

test('production eliminations between combat phases reconcile the wave roster', () => {
  assert.equal(reconcileCampaignEliminationCount(60, 63), 63);
  assert.equal(reconcileCampaignEliminationCount(72, 72), 72);
  assert.equal(reconcileCampaignEliminationCount(100, 68), 100);
});

test('high-frequency AI transitions are aggregated instead of exhausting report memory', () => {
  assert.equal(shouldThrottleCampaignAIEvent('state_changed'), true);
  assert.equal(shouldThrottleCampaignAIEvent('movement_blocked'), true);
  assert.equal(shouldThrottleCampaignAIEvent('charge_started'), false);
});

test('long-range blocked recovery commits to one side around the known blocker', () => {
  const order = buildCampaignCombatRepositionOrder({
    aimDistance: 80,
    worldDistance: 65,
    stableSide: 'KeyA',
    oppositeSide: 'KeyD'
  });
  assert.deepEqual(order, ['KeyA']);
  assert.equal(order.includes('KeyS'), false);
});

test('missing world distance is not mistaken for a point-blank blocker', () => {
  const order = buildCampaignCombatRepositionOrder({
    aimDistance: 80,
    worldDistance: null,
    stableSide: 'KeyA',
    oppositeSide: 'KeyD'
  });
  assert.deepEqual(order, ['KeyW', 'KeyW', 'KeyA', 'KeyW', 'KeyD', 'KeyW']);
  assert.equal(order[0], 'KeyW');
});

test('moderate-range world-blocked recovery commits to one direction around cover', () => {
  assert.deepEqual(buildCampaignCombatRepositionOrder({
    aimDistance: 18,
    worldDistance: 5,
    stableSide: 'KeyD',
    oppositeSide: 'KeyA'
  }), ['KeyD']);
  assert.deepEqual(buildCampaignCombatRepositionOrder({
    aimDistance: 15,
    worldDistance: 1.3,
    stableSide: 'KeyD',
    oppositeSide: 'KeyA'
  }), ['KeyS', 'KeyD', 'KeyA']);
});

test('long-range production aim recovery cannot repeat a blocked forward approach forever', () => {
  const order = buildCampaignCombatRepositionOrder({
    productionAimMismatch: true,
    aimDistance: 50.6,
    worldDistance: 50.5,
    stableSide: 'KeyA',
    oppositeSide: 'KeyD'
  });
  assert.deepEqual(order, ['KeyW', 'KeyA', 'KeyW', 'KeyD', 'KeyS']);
  assert.equal(order.includes('KeyA'), true);
  assert.equal(order.includes('KeyD'), true);
});

test('ending-choice and multi-capture alignment require the intended active target', () => {
  assert.equal(isCampaignObjectiveAlignmentActive({ kind: 'ending-choice', activeChoice: 'free' }, { id: 'free' }), true);
  assert.equal(isCampaignObjectiveAlignmentActive({ kind: 'ending-choice', activeChoice: null }, { id: 'free' }), false);
  assert.equal(isCampaignObjectiveAlignmentActive({ kind: 'multi-capture', activeTargetKey: 'center' }, { nameKey: 'center' }), true);
  assert.equal(isCampaignObjectiveAlignmentActive({ kind: 'multi-capture', activeTargetKey: 'west' }, { nameKey: 'center' }), false);
});

test('objective watchdog measures time since progress instead of total target time', () => {
  assert.equal(DEFAULT_CAMPAIGN_OBJECTIVE_PROGRESS_TIMEOUT_SECONDS, 30);
  assert.equal(hasCampaignObjectiveProgressStalled({ nowSeconds: 100, lastProgressAtSeconds: 71 }), false);
  assert.equal(hasCampaignObjectiveProgressStalled({ nowSeconds: 101, lastProgressAtSeconds: 71 }), true);
  assert.equal(hasCampaignObjectiveProgressStalled({ nowSeconds: 400, lastProgressAtSeconds: 399 }), false);
});

test('special reserve spawn retries warn while terminal spawn failures still error', () => {
  assert.equal(shouldTreatCampaignSpawnFailureAsError({ specialWaveActive: true }), false);
  assert.equal(shouldTreatCampaignSpawnFailureAsError({ specialWaveActive: false }), true);
});

test('full campaign event budget retains the measured campaign timeline through Wave 73', () => {
  assert.ok(DEFAULT_CAMPAIGN_EVENT_LIMIT >= 43656);
});

test('campaign line-of-fire assessment requires the selected target before world geometry', () => {
  const target = {};
  const otherEnemy = {};
  assert.deepEqual(evaluateCampaignLineOfFire({ target, enemyRoot: target, enemyDistance: 12, worldDistance: 20 }), {
    clear: true, reason: 'clear'
  });
  assert.deepEqual(evaluateCampaignLineOfFire({ target, enemyRoot: target, enemyDistance: 12, worldDistance: 4 }), {
    clear: false, reason: 'world_blocked'
  });
  assert.deepEqual(evaluateCampaignLineOfFire({ target, enemyRoot: otherEnemy, enemyDistance: 5 }), {
    clear: false, reason: 'enemy_occluded'
  });
});

test('production wall hits contradict a clear ideal QA aim probe', () => {
  assert.equal(isCampaignProductionAimMismatch({
    probe: { clear: true, reason: 'clear' },
    shot: { selectedType: 'world', colliderId: 'west-boundary' }
  }), true);
  assert.equal(isCampaignProductionAimMismatch({
    probe: { clear: false, reason: 'world_blocked' },
    shot: { selectedType: 'world' }
  }), false);
  assert.equal(isCampaignProductionAimMismatch({
    probe: { clear: true },
    shot: { selectedType: 'enemy' }
  }), false);
});

test('combat firing candidates use meaningful distances and respect arena and objective limits', () => {
  const candidates = buildCombatFiringPositionCandidates({
    target: { x: -20, y: 1.7, z: -9 },
    current: { x: 3, y: 1.7, z: 17 },
    arenaRadius: 30
  });
  assert.ok(candidates.length >= 20);
  assert.ok(candidates.every(candidate => Math.hypot(candidate.x, candidate.z) <= 28.5));
  assert.ok(candidates.some(candidate => Math.hypot(candidate.x + 20, candidate.z + 9) >= 15));

  const objectiveCandidates = buildCombatFiringPositionCandidates({
    target: { x: -20, y: 1.7, z: -9 },
    current: { x: -15.5, y: 1.7, z: 7.5 },
    arenaRadius: 30,
    holdPosition: { x: -15.5, y: 1.7, z: 7.5, radius: 5.25 }
  });
  assert.ok(objectiveCandidates.length > 0);
  assert.ok(objectiveCandidates.every(candidate => Math.hypot(candidate.x + 15.5, candidate.z - 7.5) < 4.91));
});

test('invulnerable boss phases prioritize registered encounter targets', () => {
  const boss = { name: 'captain' };
  const nearPod = { name: 'zeppelin-engine-near', distance: 4 };
  const farPod = { name: 'zeppelin-engine-far', distance: 12 };
  const targets = [boss, farPod, nearPod];
  const selected = selectCampaignCombatTarget(targets, {
    bossRoot: boss,
    bossInvulnerable: true,
    distanceSquared: target => target.distance ?? 0,
    lineOfFireClear: target => target === boss
  });
  assert.equal(selected, nearPod, 'shielded boss must not win selection when phase targets exist');
  assert.equal(selectCampaignCombatTarget([boss], {
    bossRoot: boss,
    bossInvulnerable: false,
    lineOfFireClear: () => true
  }), boss);
});

test('boss support Gravity Well selects the densest living cluster with QA-only cadence', () => {
  assert.equal(DEFAULT_CAMPAIGN_BOSS_SUPPORT_COOLDOWN_SECONDS, 1);
  assert.equal(DEFAULT_CAMPAIGN_BOSS_SUPPORT_MIN_TARGETS, 4);
  const targets = [
    { hp: 650, position: { x: -2.9, z: 32.7 } },
    { hp: 650, position: { x: -1.3, z: 31.4 } },
    { hp: 565, position: { x: 1.3, z: 30.8 } },
    { hp: 650, position: { x: 3.6, z: 31.2 } },
    { hp: 0, position: { x: 0, z: 31 } },
    { hp: 900, position: { x: -20, z: -20 } }
  ];
  const selected = selectCampaignAreaSupportTarget(targets, { radius: 8 });
  assert.equal(selected.count, 4);
  assert.ok(targets.slice(0, 4).includes(selected.target));
});

test('boss support follows authored or active bosses instead of wave modulo', () => {
  assert.equal(shouldUseCampaignBossSupport({ authoredBoss: true, bossActive: false }), true);
  assert.equal(shouldUseCampaignBossSupport({ authoredBoss: false, bossActive: true }), true);
  assert.equal(shouldUseCampaignBossSupport({ authoredBoss: false, bossActive: false }), false);
});

test('campaign report seals final telemetry and cannot mutate after export', () => {
  let now = 0;
  const recorder = new CampaignSimulationRecorder({
    seed: 'SEALED',
    now: () => now,
    wallNow: () => 1000 + now
  });
  recorder.beginWave(46);
  now = 10;
  recorder.stop('combat_stalled');
  recorder.record('telemetry', 'ai_activity_summary', { count: 2 });
  const report = recorder.buildReport({ performance: { sampleWindows: 1 } });
  const exported = JSON.stringify(report);
  const eventCount = report.events.length;

  assert.notEqual(report.events, recorder.events);
  assert.equal(report.summary.events, eventCount);
  assert.equal(report.collision.playerRouteSamples, 0);
  assert.equal(report.collision.enemyMovementBlocked, 0);
  assert.equal(report.events.at(-1).name, 'ai_activity_summary');
  assert.equal(recorder.record('production', 'late_event'), null);
  assert.equal(recorder.error('late_error', 'too late'), null);
  assert.equal(recorder.beginWave(47), null);
  assert.equal(recorder.endWave(), null);
  assert.equal(recorder.stop('late_stop'), null);
  assert.equal(report.events.length, eventCount);
  assert.equal(JSON.stringify(report), exported);
});

test('combat watchdog allows long boss fights while net HP progress continues', () => {
  assert.equal(DEFAULT_CAMPAIGN_COMBAT_PROGRESS_TIMEOUT_MS, 90000);
  assert.equal(evaluateCampaignCombatStall({
    consecutiveMisses: 0,
    nowMs: 180000,
    lastProgressAtMs: 179900
  }), null);
  assert.equal(evaluateCampaignCombatStall({
    consecutiveMisses: 0,
    nowMs: 180000,
    lastProgressAtMs: 89999
  }), 'no_net_hp_progress');
  assert.equal(evaluateCampaignCombatStall({
    consecutiveMisses: 60,
    nowMs: 1000,
    lastProgressAtMs: 900
  }), 'consecutive_misses');
});

test('isolated render stalls stay diagnostic without failing campaign correctness', () => {
  assert.equal(shouldPromoteProductionDiagnosticToCampaignError({
    severity: 'error', category: 'performance', name: 'frame_stall'
  }), false);
  assert.equal(shouldPromoteProductionDiagnosticToCampaignError({
    severity: 'error', category: 'game', name: 'state_corrupt'
  }), true);
  assert.equal(shouldPromoteProductionDiagnosticToCampaignError({
    severity: 'warning', category: 'performance', name: 'frame_stall'
  }), false);
});

test('clipboard campaign reports contain a compact performance summary by wave', () => {
  const summary = summarizeCampaignPerformanceEvents([
    { category: 'performance', name: 'frame_sample', data: {
      wave: 41, frames: 300, windowMs: 5000, p95FrameMs: 20, worstFrameMs: 64,
      framesOver33Ms: 3, framesOver50Ms: 1, maxDrawCalls: 90, maxTriangles: 44000,
      maxEnemies: 21, maxEffects: 18, maxGeometries: 120, maxPrograms: 14,
      maxSceneObjects: 32, phaseMaximaMs: { enemyAiMs: 4.5, renderMs: 8.2 }
    } },
    { category: 'production', name: 'performance.frame_sample', data: { data: {
      wave: 42, frames: 250, windowMs: 5000, p95FrameMs: 33, worstFrameMs: 110,
      framesOver33Ms: 8, framesOver50Ms: 2, maxDrawCalls: 105, maxTriangles: 52000,
      maxEnemies: 16, maxEffects: 24, maxGeometries: 128, maxPrograms: 16,
      maxSceneObjects: 35, phaseMaximaMs: { enemyAiMs: 6.5, renderMs: 12.1 }
    } } },
    { category: 'performance', name: 'frame_stall', data: { frameMs: 110 } },
    { category: 'performance', name: 'long_task', data: { durationMs: 84 } },
    { category: 'performance', name: 'long_animation_frame', data: { durationMs: 112 } }
  ]);
  assert.equal(summary.sampleWindows, 2);
  assert.equal(summary.sampledFrames, 550);
  assert.equal(summary.averageFps, 55);
  assert.equal(summary.worstFrameMs, 110);
  assert.equal(summary.framesOver50Ms, 3);
  assert.equal(summary.frameStallsAtLeast100Ms, 1);
  assert.equal(summary.longestTaskMs, 84);
  assert.equal(summary.phaseMaximaMs.enemyAiMs, 6.5);
  assert.equal(summary.byWave[41].averageFps, 60);
  assert.equal(summary.byWave[42].maxDrawCalls, 105);
});

test('clipboard campaign reports contain compact collision and playability evidence by wave', () => {
  const summary = summarizeCampaignCollisionEvents([
    { wave: 40, category: 'player', name: 'route_sample', data: { movementBlocked: true, forwardProgress: 0 } },
    { wave: 40, category: 'player', name: 'route_sample', data: { movementBlocked: false, forwardProgress: 2.5 } },
    { wave: 40, category: 'combat', name: 'line_of_fire_blocked', data: {} },
    { wave: 40, category: 'combat', name: 'engagement_complete', data: { blockedShots: 3, productionAimMismatches: 1 } },
    { wave: 40, category: 'combat', name: 'firing_route_complete', data: { lineOfFire: { clear: true } } },
    { wave: 40, category: 'objective', name: 'collision_safe_alignment', data: {} },
    { wave: 40, category: 'objective', name: 'collision_safe_alignment_failed', data: {} },
    { wave: 40, category: 'telemetry', name: 'ai_activity_summary', data: { activity: [
      { name: 'movement_blocked', qualifier: 'world', count: 7 },
      { name: 'movement_blocked', qualifier: 'ally', count: 4 },
      { name: 'state_changed', qualifier: null, count: 99 }
    ] } }
  ]);

  assert.equal(summary.playerRouteSamples, 2);
  assert.equal(summary.playerRouteBlocked, 1);
  assert.equal(summary.playerRouteLowProgress, 1);
  assert.equal(summary.playerRouteBlockedRatio, .5);
  assert.equal(summary.playerRouteLowProgressRatio, .5);
  assert.equal(summary.lineOfFireBlocked, 1);
  assert.equal(summary.productionAimMismatches, 1);
  assert.equal(summary.blockedProductionShots, 3);
  assert.equal(summary.firingRouteAttempts, 1);
  assert.equal(summary.firingRoutesClear, 1);
  assert.equal(summary.firingRouteClearRatio, 1);
  assert.equal(summary.objectiveAlignments, 1);
  assert.equal(summary.objectiveAlignmentFailures, 1);
  assert.equal(summary.enemyMovementBlocked, 11);
  assert.equal(summary.enemyMovementBlockedByWorld, 7);
  assert.equal(summary.enemyMovementBlockedByAlly, 4);
  assert.equal(summary.byWave[40].playerRouteSamples, 2);
  assert.equal(summary.byWave[40].blockedProductionShots, 3);
  assert.equal(summary.byWave[40].productionAimMismatches, 1);
  assert.equal(summary.byWave[40].objectiveAlignments, 1);
  assert.equal(summary.byWave[40].enemyMovementBlocked, 11);
  assert.equal(summary.byWave[40].enemyMovementBlockedByWorld, 7);
  assert.equal(summary.byWave[40].enemyMovementBlockedByAlly, 4);
});

test('wave completion rejects the ghost alive count exposed by the first campaign report', () => {
  const issues = validateWaveCompletion({
    wave: 9,
    planned: { mode: 'authored_packages', total: 20 },
    eliminated: 12,
    final: { alive: 8, activeEnemies: 0 },
    queuedEnemies: 0,
    objective: { required: false, complete: true }
  });
  assert.deepEqual(issues.map(issue => issue.code), ['wave_reserved_alive_remaining', 'wave_roster_incomplete']);
});

test('required capture objectives must complete before a wave can pass', () => {
  const issues = validateWaveCompletion({
    wave: 3,
    planned: { mode: 'authored_packages', total: 14 },
    eliminated: 14,
    final: { alive: 0, activeEnemies: 0 },
    objective: { required: true, kind: 'feeds', complete: false }
  });
  assert.deepEqual(issues.map(issue => issue.code), ['objective_incomplete']);
});

test('escape objectives preserve and validate the committed pursuer roster', () => {
  assert.equal(isCampaignObjectiveRequiredKind('escape'), true);
  assert.deepEqual(validateWaveCompletion({
    wave: 41,
    planned: { mode: 'authored_packages', total: 9 },
    eliminated: 0,
    final: { alive: 9, activeEnemies: 21 },
    queuedEnemies: 0,
    objective: { required: true, kind: 'escape', complete: true }
  }), []);
  assert.deepEqual(validateWaveCompletion({
    wave: 41,
    planned: { mode: 'authored_packages', total: 9 },
    eliminated: 0,
    final: { alive: 8, activeEnemies: 20 },
    queuedEnemies: 0,
    objective: { required: true, kind: 'escape', complete: true }
  }).map(issue => issue.code), ['escape_pursuer_roster_incomplete']);
});

test('special encounters must exercise their complete committed roster', () => {
  const issues = validateWaveCompletion({
    wave: 73,
    planned: { mode: 'special_encounter', total: 165 },
    eliminated: 164,
    final: { alive: 0, activeEnemies: 0 },
    objective: { required: false, complete: true }
  });
  assert.deepEqual(issues.map(issue => issue.code), ['wave_roster_incomplete']);
});

test('browser campaign machine is production-backed and keeps the 50-error stop contract', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('../src/debug/campaign-simulation-runner.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../test-campaign-simulation.html', import.meta.url), 'utf8');
  assert.match(main, /qaSimulationMode/);
  assert.match(main, /enemyManager\.reset\(\{ wave \}\)/);
  assert.match(main, /buildPlayerRoute\(seed, wave/);
  assert.match(main, /qaDefeatActiveEnemies/);
  assert.match(main, /qaProbeLineOfFire/);
  assert.match(main, /line_of_fire_blocked/);
  assert.match(main, /qaPlanFiringRoute/);
  assert.match(main, /production_aim_mismatch_approach/);
  assert.match(main, /firing_route_complete/);
  assert.match(main, /stationary_mechanic_firing_position/);
  assert.match(main, /type\.startsWith\('boss_node_'\)/);
  assert.match(main, /combat_hold_released/);
  assert.match(main, /boss_support_gravity_well/);
  assert.match(main, /activateById\?\.\('gravity_well'/);
  assert.match(main, /hasActivePayload\?\.\('gravity_well'/);
  assert.match(main, /const isHydraclone = type === 'hydraclone'/);
  assert.match(main, /type === 'healer'/);
  assert.match(main, /type !== 'boss_pod_engine'/);
  assert.match(main, /shouldHoldPosition: \(\) => !targetIsComplete\(\)/);
  assert.match(main, /target_reacquired_for_boss_phase/);
  assert.match(main, /scene_sample/);
  assert.match(main, /qaRunRelayCarSummonScenario/);
  assert.match(main, /south-cover-east-van-body/);
  assert.match(main, /controls\.getObject\(\)\.position\.set\(perch\.x, perch\.y, perch\.z\)/);
  assert.match(main, /player\._groundCache\.y = perch\.y - 1\.7/);
  assert.match(main, /relay_car_summon_roster/);
  assert.match(main, /minimumSummonDistance < 14/);
  assert.match(main, /crowdSummonParticipant/);
  assert.match(main, /distanceToSlot/);
  assert.match(main, /startBlocker: controller\?\.lastStartBlocker/);
  assert.match(main, /ai_activity_summary/);
  assert.match(main, /player_damage_summary/);
  assert.match(main, /movedSinceSample/);
  assert.match(main, /production_weapon_kill/);
  assert.match(main, /forcedEnemyRemoval: false/);
  assert.doesNotMatch(main, /qaEliminateActiveEnemies/);
  assert.match(main, /special_surge_materialized/);
  assert.match(main, /player_on_point/);
  assert.match(main, /objective', 'kind_changed'/);
  assert.match(main, /isCampaignObjectiveRequiredKind/);
  assert.match(main, /state\.kind === 'hold'/);
  assert.match(main, /buildCampaignCombatRepositionOrder/);
  assert.match(main, /production_self_destruct/);
  assert.match(main, /hasCampaignObjectiveProgressStalled/);
  assert.match(main, /shouldTreatCampaignSpawnFailureAsError/);
  assert.match(main, /qaCompleteObjective\(wave, planned, chainDepth \+ 1\)/);
  assert.match(main, /qaRecordPickupState/);
  assert.match(main, /pickup_state/);
  assert.doesNotMatch(main, /qaCollectProductionPickups/);
  assert.match(main, /validateWaveCompletion/);
  assert.match(main, /material_build_hook_repaired/);
  assert.match(main, /level_environment_mismatch/);
  assert.match(runner, /const ERROR_LIMIT = 50/);
  assert.match(runner, /wave: clampWave\(startWave\)/);
  assert.match(runner, /frameUrl\(seed, fromWave\)/);
  assert.match(runner, /paceDelayMs/);
  assert.match(runner, /simulationTimeScale/);
  assert.match(runner, /relay-car-summon/);
  assert.match(runner, /setPanelCollapsed\(true\)/);
  assert.match(html, /max="73" value="73"/);
  assert.match(main, /qaCompleteEscapeObjective/);
  assert.match(main, /escape_objective_preserves_invulnerable_pursuers/);
  assert.match(html, /Simulation speed/);
  assert.match(html, /Relay car perch summon/);
  assert.match(html, /data-time-scale="4"/);
  assert.match(main, /baseDt \* \(qaSimulationMode \? qaSimulationTimeScale : 1\)/);
  assert.match(main, /qaScaleCurrentWeaponCooldown/);
  assert.match(html, /id="panelToggle"/);
  assert.match(html, /first 50 errors/i);
});
