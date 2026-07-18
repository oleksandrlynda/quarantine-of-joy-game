import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BOSS_BEHAVIOR_PROFILES,
  BOSS_REACTION_ARCHETYPES,
  BOSS_REACTION_SCENARIOS,
  BossReactionMetrics,
  buildBossReactionMatrix,
  buildBossReactionReport,
  evaluateBossReaction,
  isBossScenarioApplicable
} from '../src/debug/boss-reaction-diagnostic.js';

test('boss contracts cover all campaign boss waves with filtered scenario matrices', () => {
  assert.deepEqual(BOSS_REACTION_ARCHETYPES.map(item => item.wave), [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.equal(BOSS_BEHAVIOR_PROFILES.broodmaker_heavy.phaseTrigger, 'hp_55');
  assert.equal(isBossScenarioApplicable('algorithm', 'objective_gating'), true);
  assert.equal(isBossScenarioApplicable('broodmaker', 'objective_gating'), false);

  const matrix = buildBossReactionMatrix();
  const fullMatrix = buildBossReactionMatrix({ includeNotApplicable: true });
  assert.equal(fullMatrix.length, BOSS_REACTION_ARCHETYPES.length * BOSS_REACTION_SCENARIOS.length);
  assert.ok(matrix.length < fullMatrix.length);
  assert.equal(new Set(matrix.map(item => item.id)).size, matrix.length);
  assert.ok(matrix.every(item => item.applicable));
  assert.equal(buildBossReactionMatrix({ boss: 'captain', scenario: 'phase_transition' }).length, 1);
  assert.equal(buildBossReactionMatrix({ boss: 'captain', scenario: 'objective_gating' }).length, 0);
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
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.diagnostic, 'boss-reaction');
  assert.equal(report.summary.pass, 1);
  assert.equal(report.summary.byBoss.sanitizer.pass, 1);
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
  assert.equal(metrics.timeline.filter(event => event.type === 'movement_blocked').length, 3);
  assert.equal(metrics.timeline.at(-1).type, 'ability_started');
  assert.equal(metrics.actionCounts.movement_blocked, 100);
  assert.ok(metrics.timelineOmitted >= 97);
});

test('enemy and boss pages expose separate behavior-diagnostic tabs and manual controls', () => {
  const enemyHtml = fs.readFileSync(new URL('../test-enemy-reactions.html', import.meta.url), 'utf8');
  const bossHtml = fs.readFileSync(new URL('../test-boss-reactions.html', import.meta.url), 'utf8');

  assert.match(enemyHtml, /href="test-boss-reactions\.html">Bosses/);
  assert.match(bossHtml, /href="test-enemy-reactions\.html">Regular enemies/);
  assert.match(bossHtml, /boss-reaction-diagnostic-runner\.js/);
  assert.match(bossHtml, /id="bossFilter"/);
  assert.match(bossHtml, /id="scenarioFilter"/);
  assert.match(bossHtml, /id="stop"/);
  assert.match(bossHtml, /nothing starts automatically/i);
});
