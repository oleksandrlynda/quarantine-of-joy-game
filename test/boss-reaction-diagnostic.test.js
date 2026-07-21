import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BOSS_BEHAVIOR_PROFILES,
  BOSS_PLAYER_STRATEGIES,
  BOSS_REACTION_ARCHETYPES,
  BOSS_REACTION_SCENARIOS,
  BOSS_STAMINA_RUN_PROFILE,
  BossReactionMetrics,
  advanceBossStaminaRun,
  bossReactionScenarioSeed,
  buildBossReactionMatrix,
  buildBossReactionReport,
  createBossStaminaRunState,
  evaluateBossReaction,
  isBossScenarioApplicable
} from '../src/debug/boss-reaction-diagnostic.js';

test('boss contracts cover all campaign boss waves with filtered scenario matrices', () => {
  assert.deepEqual(BOSS_REACTION_ARCHETYPES.map(item => item.wave), [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.equal(BOSS_BEHAVIOR_PROFILES.broodmaker_heavy.phaseTrigger, 'hp_55');
  assert.equal(isBossScenarioApplicable('algorithm', 'objective_gating'), true);
  assert.equal(isBossScenarioApplicable('algorithm', 'final_phase'), true);
  assert.equal(isBossScenarioApplicable('captain', 'final_phase'), false);
  assert.equal(isBossScenarioApplicable('captain', 'rare_ability'), true);
  assert.equal(isBossScenarioApplicable('sanitizer', 'rare_ability'), false);
  assert.equal(isBossScenarioApplicable('broodmaker', 'objective_gating'), false);
  assert.equal(isBossScenarioApplicable('broodmaker', 'relay_district_arena'), true);
  assert.equal(isBossScenarioApplicable('sanitizer', 'relay_district_arena'), false);

  const matrix = buildBossReactionMatrix();
  const fullMatrix = buildBossReactionMatrix({ includeNotApplicable: true });
  const behaviorScenarioCount = BOSS_REACTION_SCENARIOS.filter(item => !item.strategyId).length;
  assert.equal(fullMatrix.length, BOSS_REACTION_ARCHETYPES.length * behaviorScenarioCount);
  assert.ok(matrix.length < fullMatrix.length);
  assert.equal(new Set(matrix.map(item => item.id)).size, matrix.length);
  assert.ok(matrix.every(item => item.applicable));
  assert.equal(buildBossReactionMatrix({ boss: 'captain', scenario: 'phase_transition' }).length, 1);
  assert.equal(buildBossReactionMatrix({ boss: 'algorithm', scenario: 'final_phase' }).length, 1);
  assert.equal(buildBossReactionMatrix({ boss: 'captain', scenario: 'objective_gating' }).length, 0);
  assert.equal(buildBossReactionMatrix({ boss: 'broodmaker', scenario: 'relay_district_arena' }).length, 1);
  assert.deepEqual(BOSS_PLAYER_STRATEGIES.map(item => item.id), ['shoot', 'run', 'run_stamina', 'hide']);
  assert.equal(buildBossReactionMatrix({ strategy: 'all' }).length, BOSS_REACTION_ARCHETYPES.length * BOSS_PLAYER_STRATEGIES.length + 1);
  assert.equal(buildBossReactionMatrix({ boss: 'captain', strategy: 'shoot' })[0].id, 'captain__strategy_shoot');
  assert.equal(buildBossReactionMatrix({ boss: 'captain', strategy: 'run_stamina' })[0].id, 'captain__strategy_run_stamina');
});

test('stamina-managed running mirrors production endurance and recovery pacing', () => {
  assert.deepEqual(BOSS_STAMINA_RUN_PROFILE, {
    walkSpeed: 6,
    sprintMultiplier: 1.6,
    lowStaminaSprintMultiplier: 1.2,
    staminaMax: 100,
    staminaDrainPerSecond: 12,
    staminaRegenPerSecond: 18,
    staminaRegenDelaySeconds: 0.5,
    lowStaminaThreshold: 15,
    minimumSprintStamina: 0.5
  });
  const state = createBossStaminaRunState();
  for (let frame = 0; frame < 24 * 60; frame++) advanceBossStaminaRun(state, 1 / 60);
  assert.equal(state.exhaustionCount, 2);
  assert.equal(Math.round(state.minimumStamina * 10) / 10, 0.4);
  assert.equal(Math.round(state.sprintSeconds * 10) / 10, 16.6);
  assert.equal(Math.round(state.recoverySeconds * 10) / 10, 7.4);
  assert.equal(Math.round(state.intendedDistance), 198);
  assert.equal(Math.round(state.stamina * 10) / 10, 15.7);
  assert.equal(state.mode, 'recover');
});

test('strategy comparisons use paired per-boss random seeds', () => {
  const captainShoot = bossReactionScenarioSeed({ bossId: 'captain', scenarioId: 'strategy_shoot', strategyId: 'shoot' });
  const captainStamina = bossReactionScenarioSeed({ bossId: 'captain', scenarioId: 'strategy_run_stamina', strategyId: 'run_stamina' });
  const sanitizerStamina = bossReactionScenarioSeed({ bossId: 'sanitizer', scenarioId: 'strategy_run_stamina', strategyId: 'run_stamina' });
  assert.equal(captainShoot, captainStamina);
  assert.notEqual(captainShoot, sanitizerStamina);
  assert.notEqual(
    bossReactionScenarioSeed({ bossId: 'captain', scenarioId: 'attack_cadence' }),
    bossReactionScenarioSeed({ bossId: 'captain', scenarioId: 'cover_response' })
  );
});

test('Relay District Broodmaker judgment requires valid add placement, navigation, range, and minion-screen evidence', () => {
  const healthy = evaluateBossReaction({
    bossId: 'broodmaker', scenarioId: 'relay_district_arena', metrics: {
      simulationSeconds: 32,
      arenaLoaded: true,
      arenaId: 'relay-district',
      arenaColliderCount: 40,
      arenaRouteCompleted: true,
      arenaRouteStopsVisited: 7,
      arenaRouteStopsPlanned: 7,
      arenaInvalidRouteStops: 0,
      arenaBossOutOfBoundsTicks: 0,
      arenaPlayerOutOfBoundsTicks: 0,
      arenaAuxiliaryPlacementIssues: 0,
      arenaWorkingRangeTicks: 600,
      arenaWorkingRangeRatio: 0.31,
      arenaVisibleWorkingRangeRatio: 0.62,
      broodWallSpawnEvents: 6,
      broodWallBetweenRatio: 1,
      movementBlockedRatio: 0.08,
      maxConsecutiveMovementBlockedTicks: 55,
      auxiliariesPeak: 5,
      maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(healthy.status, 'pass');

  const broken = evaluateBossReaction({
    bossId: 'broodmaker', scenarioId: 'relay_district_arena', metrics: {
      simulationSeconds: 32,
      arenaLoaded: true,
      arenaId: 'relay-district',
      arenaColliderCount: 40,
      arenaRouteCompleted: true,
      arenaRouteStopsVisited: 7,
      arenaRouteStopsPlanned: 7,
      arenaInvalidRouteStops: 0,
      arenaBossOutOfBoundsTicks: 0,
      arenaPlayerOutOfBoundsTicks: 0,
      arenaAuxiliaryPlacementIssues: 1,
      arenaWorkingRangeTicks: 0,
      arenaWorkingRangeRatio: 0,
      arenaVisibleWorkingRangeRatio: 0,
      broodWallSpawnEvents: 0,
      broodWallBetweenRatio: 0,
      movementBlockedRatio: 0.4,
      maxConsecutiveMovementBlockedTicks: 241,
      auxiliariesPeak: 3,
      maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(broken.status, 'fail');
  assert.ok(broken.findings.some(item => item.code === 'relay_brood_add_placement_invalid'));
  assert.ok(broken.findings.some(item => item.code === 'relay_brood_screen_not_formed'));
  assert.ok(broken.findings.some(item => item.code === 'relay_broodmaker_navigation_stalled'));
});

test('boss judgment catches duplicate updates and direct damage through cover', () => {
  const result = evaluateBossReaction({
    bossId: 'captain',
    scenarioId: 'cover_response',
    metrics: {
      simulationSeconds: 18,
      duplicateUpdateTicks: 4,
      maximumUpdatesPerTick: 2,
      worldBlockedSeconds: 15,
      damageThroughWorld: 28,
      damageThroughWorldEvents: 1,
      auxiliariesPeak: 0,
      maxConsecutiveOverlapTicks: 0
    }
  });

  assert.equal(result.status, 'fail');
  assert.ok(result.findings.some(item => item.code === 'boss_updated_multiple_times'));
  assert.ok(result.findings.some(item => item.code === 'boss_damage_through_cover'));
});

test('phase and objective scenarios cannot pass without exercising their gates', () => {
  const phase = evaluateBossReaction({
    bossId: 'sanitizer',
    scenarioId: 'phase_transition',
    metrics: {
      simulationSeconds: 14,
      phaseTriggerApplied: true,
      phaseTransitions: 0,
      phaseLabelTransitions: 0,
      phasesSeen: [1],
      phaseLabelsSeen: [],
      auxiliariesPeak: 3
    }
  });
  assert.equal(phase.status, 'fail');
  assert.ok(phase.findings.some(item => item.code === 'boss_phase_did_not_transition'));

  const collapse = evaluateBossReaction({
    bossId: 'algorithm',
    scenarioId: 'final_phase',
    metrics: {
      simulationSeconds: 16,
      finalPhaseTriggerApplied: true,
      phasesSeen: [1, 2, 3],
      phaseLabelsSeen: ['Control', 'Paradox', 'Coherence Collapse'],
      abilityStartsByAbility: { algorithm_collapse_ring: 1 },
      auxiliariesPeak: 3
    }
  });
  assert.equal(collapse.status, 'pass');

  const objective = evaluateBossReaction({
    bossId: 'algorithm',
    scenarioId: 'objective_gating',
    metrics: {
      simulationSeconds: 10,
      objectiveGateTested: true,
      lockedDamageAccepted: 0,
      objectiveUnlockTested: true,
      unlockedDamageAccepted: 100,
      auxiliariesPeak: 3
    }
  });
  assert.equal(objective.status, 'pass');

  const rareAbility = evaluateBossReaction({
    bossId: 'captain', scenarioId: 'rare_ability', metrics: {
      simulationSeconds: 12,
      abilityStartsByAbility: { captain_cluster_rocket: 1 },
      abilityReleasesByAbility: { captain_cluster_rocket: 1 },
      abilityOutcomesByAbility: { captain_cluster_rocket: 8 },
      auxiliariesPeak: 0
    }
  });
  assert.equal(rareAbility.status, 'pass');
});

test('boss metrics retain compact combat, phase, auxiliary, and telegraph evidence', () => {
  const metrics = new BossReactionMetrics({
    bossId: 'sanitizer',
    scenarioId: 'attack_cadence',
    startPosition: { x: 0, y: 0.8, z: 16 },
    initialPlayerDistance: 24,
    initialAuxiliaries: 3
  });
  metrics.observeTick({
    atMs: 100, dt: 0.1, position: { x: 0.1, y: 0.8, z: 16 }, playerDistance: 24,
    tracking: true, updatesThisTick: 1, telegraphActive: true, attackActive: false,
    state: 'beam_windup', phase: 1, phaseLabel: 'Suppression', auxiliaries: [
      { userData: { type: 'boss_node' } }, { userData: { type: 'boss_node' } }, { userData: { type: 'boss_node' } }
    ]
  });
  metrics.observeTick({
    atMs: 900, dt: 0.1, position: { x: 0.2, y: 0.8, z: 16 }, playerDistance: 24,
    tracking: true, updatesThisTick: 1, telegraphActive: false, attackActive: true,
    state: 'beam_sweep', phase: 1, phaseLabel: 'Suppression', auxiliaries: []
  });
  metrics.recordDamage(1000, 24, { worldVisible: true, sourceType: 'boss_sanitizer' });
  metrics.observeTick({
    atMs: 1200, dt: 0.1, position: { x: 0.2, y: 0.8, z: 16 }, playerDistance: 24,
    tracking: true, updatesThisTick: 1, telegraphActive: false, attackActive: false,
    state: 'idle', phase: 2, phaseLabel: 'Vents open', auxiliaries: []
  });
  const result = metrics.finish();

  assert.equal(result.metrics.telegraphStarts, 1);
  assert.equal(result.metrics.attackStarts, 1);
  assert.equal(result.metrics.telegraphedDamageEvents, 1);
  assert.equal(result.metrics.phaseTransitions, 1);
  assert.equal(result.metrics.auxiliaryTypes.boss_node, 3);
  assert.equal(result.assessment.status, 'pass');

  const report = buildBossReactionReport({
    environment: { timeScale: 8 }, startedAt: 'start', completedAt: 'end', results: [result]
  });
  assert.equal(report.schemaVersion, 7);
  assert.equal(report.diagnostic, 'boss-reaction');
  assert.equal(report.summary.pass, 1);
  assert.equal(report.summary.byBoss.sanitizer.pass, 1);
});

test('strategy metrics and reports expose comparable player and boss performance', () => {
  const metrics = new BossReactionMetrics({
    bossId: 'captain', scenarioId: 'strategy_shoot', strategyId: 'shoot',
    startPosition: { x: 0, y: 0.8, z: 16 }, playerStartPosition: { x: 0, y: 1.7, z: -8 },
    initialPlayerDistance: 24, initialBossHp: 3500
  });
  metrics.recordAIEvent(100, { type: 'ability_started', sourceRole: 'boss', sourceType: 'boss_captain' });
  metrics.phaseTriggerApplied = true;
  metrics.phaseTransitions = 1;
  metrics.recordPlayerShot(200, { hit: true, acceptedDamage: 50, targetRole: 'boss', targetType: 'boss_captain' });
  metrics.recordDamage(300, 24, { sourceRole: 'boss', sourceType: 'boss_captain', requiresTelegraph: false });
  metrics.observeTick({
    atMs: 1000, dt: 1, position: { x: 0, y: 0.8, z: 16 }, playerDistance: 20,
    worldVisible: true, playerPosition: { x: 4, y: 1.7, z: -8 }, bossHp: 3450,
    updatesThisTick: 1, state: 'attack', auxiliaries: []
  });
  const result = metrics.finish();
  assert.equal(result.strategyId, 'shoot');
  assert.equal(result.metrics.playerDamageToBoss, 50);
  assert.equal(result.metrics.playerOutgoingDps, 50);
  assert.equal(result.metrics.incomingDps, 24);
  assert.equal(result.metrics.playerDistanceTravelled, 4);
  assert.equal(result.metrics.bossHpRemainingRatio, 0.986);

  const report = buildBossReactionReport({
    environment: { timeScale: 8 }, startedAt: 'start', completedAt: 'end', results: [result]
  });
  assert.equal(report.strategyBenchmarks.captain.strategies.shoot.incomingDps, 24);
  assert.equal(report.strategyBenchmarks.captain.strategies.shoot.outgoingDps, 50);
  assert.equal(report.strategyBenchmarks.captain.strategies.shoot.phaseTriggerApplied, true);
  assert.equal(report.strategyBenchmarks.captain.strategies.shoot.closestPlayerDistance, 20);
});

test('strategy report separates impossible kiting from stamina-managed balance evidence', () => {
  const result = (strategyId, incomingDps, extra = {}) => ({
    bossId: 'captain', strategyId, assessment: { status: 'pass', findings: [] },
    metrics: { simulationSeconds: 24, incomingDps, damageTotal: incomingDps * 24, ...extra }
  });
  const report = buildBossReactionReport({
    environment: {}, startedAt: 'start', completedAt: 'end', results: [
      result('shoot', 20),
      result('run', 0, { strategyMovementMode: 'unlimited_stress', strategyIntendedDistance: 414.72 }),
      result('run_stamina', 8, {
        strategyMovementMode: 'stamina_managed', strategyIntendedDistance: 198,
        strategyStaminaFinal: 13.8, strategyStaminaMinimum: 0,
        strategySprintSeconds: 16.67, strategyRecoverySeconds: 7.33,
        strategyExhaustionCount: 2
      })
    ]
  });
  const benchmark = report.strategyBenchmarks.captain;
  assert.equal(benchmark.strategies.run.stressOnly, true);
  assert.equal(benchmark.strategies.run_stamina.stressOnly, false);
  assert.equal(benchmark.strategies.run_stamina.exhaustionCount, 2);
  assert.equal(benchmark.comparisons.runDamageReductionVsShootPct, 60);
  assert.equal(benchmark.comparisons.unlimitedRunDamageReductionVsShootPct, 100);
  assert.equal(benchmark.comparisons.staminaVsUnlimitedIncomingDpsDelta, 8);
  assert.ok(benchmark.tuningSignals.some(signal => signal.includes('impossible unlimited kite')));
});

test('strategy assessment verifies movement and solid-cover behavior', () => {
  const hiddenLeak = evaluateBossReaction({
    bossId: 'shard', scenarioId: 'strategy_hide', metrics: {
      strategyId: 'hide', simulationSeconds: 24, bossActionEvents: 2,
      playerHiddenSeconds: 14, damageThroughWorld: 12, damageThroughWorldEvents: 1,
      auxiliariesPeak: 0, maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(hiddenLeak.status, 'fail');
  assert.ok(hiddenLeak.findings.some(item => item.code === 'strategy_damage_through_cover'));

  const stationaryRun = evaluateBossReaction({
    bossId: 'hydraclone', scenarioId: 'strategy_run', metrics: {
      strategyId: 'run', simulationSeconds: 24, bossActionEvents: 2,
      playerDistanceTravelled: 5, auxiliariesPeak: 1, maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(stationaryRun.status, 'inconclusive');
  assert.ok(stationaryRun.findings.some(item => item.code === 'run_strategy_not_exercised'));
});

test('phase-aware strategy assessment exposes missing phase coverage and zero pressure', () => {
  const missingPhase = evaluateBossReaction({
    bossId: 'broodmaker_heavy', scenarioId: 'strategy_run', metrics: {
      strategyId: 'run', simulationSeconds: 24, bossActionEvents: 3,
      playerDistanceTravelled: 300, strategyPhaseCoverageRequired: true,
      phaseTriggerApplied: false, auxiliariesPeak: 4, maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(missingPhase.status, 'fail');
  assert.ok(missingPhase.findings.some(item => item.code === 'strategy_phase_trigger_not_exercised'));

  const unlimitedZeroPressure = evaluateBossReaction({
    bossId: 'captain', scenarioId: 'strategy_run', metrics: {
      strategyId: 'run', simulationSeconds: 24, bossActionEvents: 8,
      playerDistanceTravelled: 300, strategyPhaseCoverageRequired: true,
      phaseTriggerApplied: true, phaseTransitions: 1, phasesSeen: [1, 2],
      damageEvents: 0, auxiliariesPeak: 3, maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(unlimitedZeroPressure.status, 'pass');
  assert.equal(unlimitedZeroPressure.findings.some(item => item.code === 'strategy_no_player_damage_observed'), false);

  const staminaZeroPressure = evaluateBossReaction({
    bossId: 'captain', scenarioId: 'strategy_run_stamina', metrics: {
      strategyId: 'run_stamina', simulationSeconds: 24, bossActionEvents: 8,
      playerDistanceTravelled: 198, strategyPhaseCoverageRequired: true,
      phaseTriggerApplied: true, phaseTransitions: 1, phasesSeen: [1, 2],
      damageEvents: 0, auxiliariesPeak: 3, maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(staminaZeroPressure.status, 'warn');
  assert.ok(staminaZeroPressure.findings.some(item => item.code === 'strategy_no_player_damage_observed'));
});

test('auxiliary damage is retained without being judged as untelegraphed boss damage', () => {
  const metrics = new BossReactionMetrics({
    bossId: 'broodmaker',
    scenarioId: 'attack_cadence',
    startPosition: { x: 0, y: 0.8, z: 20 },
    initialPlayerDistance: 20
  });
  metrics.recordAIEvent(100, {
    type: 'boss_add_spawned', sourceRole: 'boss', sourceType: 'boss_broodmaker',
    ability: 'brood_wall', betweenBossAndPlayer: true
  });
  metrics.recordDamage(6000, 16, {
    sourceRole: 'auxiliary', sourceType: 'gruntling', sourceKind: 'melee', worldVisible: true
  });
  const result = metrics.finish();

  assert.equal(result.metrics.bossDamageEvents, 0);
  assert.equal(result.metrics.auxiliaryDamageEvents, 1);
  assert.equal(result.metrics.bossUntelegraphedDamageEvents, 0);
  assert.equal(result.assessment.findings.some(item => item.code === 'boss_damage_without_recent_telegraph'), false);
});

test('contact judgment distinguishes solid penetration, valid melee contact, and ranged distance recovery', () => {
  const melee = evaluateBossReaction({
    bossId: 'hydraclone', scenarioId: 'close_pressure', metrics: {
      simulationSeconds: 16, attackStarts: 1, bossActionEvents: 0, bossDamageEvents: 1,
      maxConsecutivePenetrationTicks: 0, closestPlayerDistance: 1.4,
      auxiliariesPeak: 0, distanceTravelled: 1
    }
  });
  assert.equal(melee.findings.some(item => item.code === 'boss_player_body_penetration'), false);

  const ranged = evaluateBossReaction({
    bossId: 'broodmaker', scenarioId: 'close_pressure', metrics: {
      simulationSeconds: 16, bossActionEvents: 1, bossDamageEvents: 0,
      maxConsecutivePenetrationTicks: 0, maxConsecutiveTooCloseTicks: 240,
      preferredMinimumDistance: 15, tooCloseRatio: 0.5, auxiliariesPeak: 3
    }
  });
  assert.equal(ranged.status, 'fail');
  assert.ok(ranged.findings.some(item => item.code === 'ranged_boss_failed_to_recover_distance'));
});

test('blocked projectile firing and unexercised summon gates cannot pass healthy', () => {
  const cover = evaluateBossReaction({
    bossId: 'sanitizer', scenarioId: 'cover_response', metrics: {
      simulationSeconds: 18, worldBlockedSeconds: 12, projectileFiresWhileWorldBlocked: 1,
      blockedFireBySourceType: { shooter: 1 }, auxiliariesPeak: 3,
      maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(cover.status, 'fail');
  assert.ok(cover.findings.some(item => item.code === 'projectile_fired_through_cover'));

  const summon = evaluateBossReaction({
    bossId: 'hydraclone', scenarioId: 'summon_coordination', metrics: {
      simulationSeconds: 24, auxiliariesPeak: 0, summonOpportunityApplied: false,
      maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(summon.status, 'inconclusive');
  assert.ok(summon.findings.some(item => item.code === 'boss_summon_opportunity_not_exercised'));
});

test('ballistic indirect projectiles are not misclassified as direct fire through cover', () => {
  const metrics = new BossReactionMetrics({
    bossId: 'captain', scenarioId: 'strategy_hide', strategyId: 'hide',
    startPosition: { x: 0, y: 0.8, z: 0 }, initialPlayerDistance: 18
  });
  metrics.recordAIEvent(100, {
    type: 'projectile_fired', sourceRole: 'boss', sourceType: 'boss_captain',
    worldVisible: false, indirectFire: true, trajectory: 'ballistic'
  });
  metrics.recordAIEvent(200, {
    type: 'projectile_fired', sourceRole: 'boss', sourceType: 'boss_captain',
    worldVisible: false
  });
  assert.equal(metrics.projectileFireEvents, 2);
  assert.equal(metrics.projectileFiresWhileWorldBlocked, 1);
});

test('boss-owned blockers fail explicitly instead of passing on generic action evidence', () => {
  const assessment = evaluateBossReaction({
    bossId: 'adjudicator', scenarioId: 'close_pressure', metrics: {
      simulationSeconds: 16,
      bossActionEvents: 2,
      bossActionCounts: { citation_applied: 1, citation_mine_spawned: 2 },
      maxConsecutiveSelfOwnedBlockTicks: 31,
      selfOwnedBlockTicks: 80,
      movementBlockerTypes: { purge_node: 80 },
      auxiliariesPeak: 2,
      distanceTravelled: 2,
      maxConsecutivePenetrationTicks: 0
    }
  });
  assert.equal(assessment.status, 'fail');
  assert.ok(assessment.findings.some(item => item.code === 'adjudicator_trapped_by_citation_mines'));
});

test('high-frequency collision noise is compacted without hiding boss-specific events', () => {
  const metrics = new BossReactionMetrics({
    bossId: 'sanitizer', scenarioId: 'attack_cadence',
    startPosition: { x: 0, y: 0.8, z: 20 }, initialPlayerDistance: 20, initialAuxiliaries: 3
  });
  for (let index = 0; index < 100; index++) {
    metrics.recordAIEvent(index, {
      type: 'movement_blocked', sourceRole: 'boss', sourceType: 'boss_sanitizer',
      blockedBy: 'ally', blockerType: 'boss_node', blockerOwnership: 'self_owned_auxiliary'
    });
  }
  metrics.recordAIEvent(101, {
    type: 'ability_started', sourceRole: 'boss', sourceType: 'boss_sanitizer', ability: 'sanitizer_beam'
  });
  metrics.recordAIEvent(102, {
    type: 'ability_released', sourceRole: 'boss', sourceType: 'boss_sanitizer', ability: 'sanitizer_beam'
  });
  metrics.recordAIEvent(103, {
    type: 'ability_resolved', sourceRole: 'boss', sourceType: 'boss_sanitizer', ability: 'sanitizer_beam', hitPlayer: false
  });
  assert.equal(metrics.timeline.filter(event => event.type === 'movement_blocked').length, 3);
  assert.equal(metrics.timeline.at(-1).type, 'ability_resolved');
  assert.equal(metrics.actionCounts.movement_blocked, 100);
  assert.equal(metrics.bossAbilityStarts, 1);
  assert.equal(metrics.bossAbilityReleases, 1);
  assert.equal(metrics.bossAbilityOutcomes, 1);
  assert.equal(metrics.bossAbilityHitOutcomes, 0);
  assert.equal(metrics.bossAbilityMissOutcomes, 1);
  assert.deepEqual(metrics.abilityStartsByAbility, { sanitizer_beam: 1 });
  assert.deepEqual(metrics.abilityReleasesByAbility, { sanitizer_beam: 1 });
  assert.deepEqual(metrics.abilityOutcomesByAbility, { sanitizer_beam: 1 });
  assert.deepEqual(metrics.abilityHitsByAbility, {});
  assert.deepEqual(metrics.abilityMissesByAbility, { sanitizer_beam: 1 });
  assert.ok(metrics.timelineOmitted >= 97);
  for (let index = 0; index < 100; index++) {
    metrics.recordAIEvent(200 + index, {
      type: 'state_changed', sourceRole: 'auxiliary', sourceType: 'shooter'
    });
  }
  metrics.addStrategyEvent(400, 'strategy_stamina_exhausted', { stamina: 0.4 });
  const result = metrics.finish();
  assert.equal(metrics.timeline.filter(event => event.type === 'state_changed').length, 3);
  assert.deepEqual(result.strategyTimeline, [
    { atMs: 400, type: 'strategy_stamina_exhausted', stamina: 0.4 }
  ]);
});

test('enemy and boss pages expose separate behavior-diagnostic tabs and manual controls', () => {
  const enemyHtml = fs.readFileSync(new URL('../test-enemy-reactions.html', import.meta.url), 'utf8');
  const bossHtml = fs.readFileSync(new URL('../test-boss-reactions.html', import.meta.url), 'utf8');
  const bossRunner = fs.readFileSync(new URL('../src/debug/boss-reaction-diagnostic-runner.js', import.meta.url), 'utf8');

  assert.match(enemyHtml, /href="test-boss-reactions\.html">Bosses/);
  assert.match(enemyHtml, /href="test-level-collisions\.html">Level obstacles/);
  assert.match(bossHtml, /href="test-enemy-reactions\.html">Regular enemies/);
  assert.match(bossHtml, /href="test-level-collisions\.html">Level obstacles/);
  assert.match(bossHtml, /boss-reaction-diagnostic-runner\.js/);
  assert.match(bossHtml, /id="bossFilter"/);
  assert.match(bossHtml, /id="scenarioFilter"/);
  assert.match(bossHtml, /id="strategyFilter"/);
  assert.match(bossHtml, /value="all" selected>All strategies \+ stamina \+ ability coverage/);
  assert.match(bossHtml, /id="speedFilter"/);
  assert.match(bossHtml, /id="panel" data-collapsed="false"/);
  assert.match(bossHtml, /id="panelToggle"/);
  assert.match(bossHtml, /id="stop"/);
  assert.match(bossHtml, /nothing starts automatically/i);
  assert.match(bossRunner, /setPanelCollapsed\(true\)/);
  assert.match(bossRunner, /setPanelCollapsed\(false\)/);
  assert.match(bossRunner, /elements\.speed\.disabled = true/);
  assert.match(bossRunner, /FLOODGATE_CONTINUITY\.size/);
  assert.match(bossRunner, /getPlayer, Infinity, null, seededRandom/);
  assert.match(bossRunner, /strategyOrbitCenter\.x \+ Math\.sin/);
  assert.match(bossRunner, /manager\.bossManager\.rng = scenarioRandom/);
  assert.match(bossRunner, /strategy_signature_ability_armed/);
});
