import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ENEMY_REACTION_ARCHETYPES,
  ENEMY_REACTION_SCENARIOS,
  EnemyReactionMetrics,
  buildEnemyReactionMatrix,
  buildEnemyReactionReport,
  evaluateEnemyReaction
} from '../src/debug/enemy-reaction-diagnostic.js';

test('reaction matrix runs only role-applicable cases while retaining optional N/A coverage', () => {
  const matrix = buildEnemyReactionMatrix();
  const fullMatrix = buildEnemyReactionMatrix({ includeNotApplicable: true });
  assert.equal(fullMatrix.length, ENEMY_REACTION_ARCHETYPES.length * ENEMY_REACTION_SCENARIOS.length);
  assert.equal(new Set(matrix.map(item => item.id)).size, matrix.length);
  assert.ok(matrix.length < fullMatrix.length / 2);
  assert.ok(matrix.every(item => item.applicable));
  assert.deepEqual(
    ENEMY_REACTION_SCENARIOS.filter(item => item.visibleNavigation).map(item => item.id),
    ['low_wall_navigation', 'barrel_navigation']
  );
  assert.deepEqual(
    ENEMY_REACTION_SCENARIOS.filter(item => item.groupSetup).map(item => item.id),
    ['duo_attack', 'squad_attack', 'mixed_squad_attack']
  );
  assert.equal(matrix.find(item => item.id === 'shooter__squad_attack').applicable, true);
  assert.equal(matrix.find(item => item.id === 'healer__squad_attack'), undefined);
  assert.equal(matrix.find(item => item.id === 'healer__mixed_squad_attack').applicable, true);
  assert.equal(fullMatrix.find(item => item.id === 'warden__mixed_squad_attack').applicable, false);
  assert.equal(matrix.find(item => item.id === 'shooter__ally_cover_usage').applicable, true);
  assert.equal(fullMatrix.find(item => item.id === 'sniper__ally_cover_usage').applicable, false);
  assert.equal(matrix.find(item => item.id === 'healer__last_survivor_bomb').applicable, true);
});

test('high-frequency metrics expose LOS flicker, ally-obstructed fire, and footprints', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'shooter', role: 'ranged', scenarioId: 'low_wall_navigation',
    startPosition: { x: 0, y: 0.8, z: 16 }, initialPlayerDistance: 24, preferredBand: [7, 35]
  });
  for (let index = 0; index < 8; index++) {
    metrics.observeTick({
      atMs: index * 100, dt: 0.1, worldVisible: index % 2 === 0, tacticalVisible: index % 2 === 0,
      playerDistance: 24, inPreferredBand: true, windupActive: index % 2 === 0,
      charging: false, allyDistance: 0.8, insideObstacle: false, nearObstacle: true,
      attemptedMove: true, movedDistance: 0, swarmCount: 0
    });
  }
  metrics.recordShot(850, { worldVisible: true, tacticalVisible: false, kind: 'shooter' });
  metrics.recordDamage(875, 22, { source: 'projectile', worldVisible: true, tacticalVisible: false });
  metrics.observe({
    atMs: 900, position: { x: 1, y: 0.8, z: 15 }, playerDistance: 23,
    visible: true, tacticalVisible: false, tracking: true, attemptedMove: true,
    allyDistance: 0.8, state: 'windup', speed: 2
  });
  const result = metrics.finish();
  assert.ok(result.metrics.microLosToggles >= 3);
  assert.equal(result.metrics.shotsThroughAllies, 1);
  assert.equal(result.metrics.damageTotal, 22);
  assert.equal(result.metrics.damageWhileTacticallyBlocked, 22);
  assert.equal(result.metrics.actionCounts.projectile_fired, 1);
  assert.ok(result.metrics.stateDurations.idle > 0);
  assert.equal(result.footprint.length, 1);
  assert.equal(result.assessment.status, 'fail');
  assert.ok(result.assessment.findings.some(item => item.code === 'los_edge_flicker'));
  assert.ok(result.assessment.findings.some(item => item.code === 'shoots_through_allies'));
});

test('support roles are judged by standoff instead of player-facing tracking', () => {
  const healthy = evaluateEnemyReaction({
    enemyId: 'healer', scenarioId: 'moving_target', role: 'support', preferredBand: [12, 80],
    metrics: { distanceTravelled: 8, closestPlayerDistance: 14, trackingRatio: 0, stuckRatio: 0 }
  });
  assert.ok(!healthy.findings.some(item => item.code === 'poor_tracking'));
  assert.ok(!healthy.findings.some(item => item.code === 'support_too_close'));
});

test('small-group combat requires spawned actors and attack evidence', () => {
  const missingGroup = evaluateEnemyReaction({
    enemyId: 'grunt', scenarioId: 'squad_attack', role: 'melee', preferredBand: [0, 2.3],
    metrics: {
      expectedGroupSize: 4, groupSizePeak: 2, groupAttackEvents: 0,
      damageEvents: 0, damageTotal: 0, distanceTravelled: 3, stuckRatio: 0
    }
  });
  assert.equal(missingGroup.status, 'inconclusive');
  assert.ok(missingGroup.findings.some(item => item.code === 'group_not_fully_spawned'));
  assert.ok(missingGroup.findings.some(item => item.code === 'group_attack_not_exercised'));

  const unsafeGroup = evaluateEnemyReaction({
    enemyId: 'shooter', scenarioId: 'squad_attack', role: 'ranged', preferredBand: [12, 18],
    metrics: {
      expectedGroupSize: 4, groupSizePeak: 4, groupAttackEvents: 5,
      uniqueGroupAttackers: 3, damageEvents: 2, damageTotal: 44,
      projectilesBlockedByAllies: 1, distanceTravelled: 4, stuckRatio: 0
    }
  });
  assert.equal(unsafeGroup.status, 'fail');
  assert.ok(unsafeGroup.findings.some(item => item.code === 'group_projectiles_hit_allies'));
});

test('Shooter ally-cover case requires selection, cooldown tuck, safe peek, and firing evidence', () => {
  const unsafe = evaluateEnemyReaction({
    enemyId: 'shooter', scenarioId: 'ally_cover_usage', role: 'ranged', preferredBand: [12, 18],
    metrics: { distanceTravelled: 2, stuckRatio: 0, shots: 0, actionCounts: {} }
  });
  assert.equal(unsafe.status, 'fail');
  assert.ok(unsafe.findings.some(item => item.code === 'shooter_ally_cover_not_selected'));

  const healthy = evaluateEnemyReaction({
    enemyId: 'shooter', scenarioId: 'ally_cover_usage', role: 'ranged', preferredBand: [12, 18],
    metrics: {
      distanceTravelled: 6, stuckRatio: 0, shots: 3, damageTotal: 22,
      actionCounts: { ally_cover_selected: 1, ally_cover_hidden: 1, ally_cover_peek_started: 2 }
    }
  });
  assert.equal(healthy.status, 'pass');
});

test('small-group metrics retain per-actor movement, damage, and footprints', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'grunt', role: 'melee', scenarioId: 'duo_attack',
    startPosition: { x: 0, y: 0.8, z: 8 }, initialPlayerDistance: 16,
    preferredBand: [0, 2.3], expectedGroupSize: 2
  });
  const primary = { userData: { diagnosticActorId: 'primary', behaviorId: 'grunt' } };
  metrics.recordGroupMovement(100, { requestedDistance: 1, appliedDistance: 0.2, blockedBy: 'ally' }, 'primary');
  metrics.recordDamage(200, 12, { source: 'melee', sourceRoot: primary, ownerRoot: primary, primaryRoot: primary });
  metrics.observeGroup(250, [
    { id: 'primary', type: 'grunt', x: 0, y: 0.8, z: 7, playerDistance: 15, state: 'pursuing' },
    { id: 'group_1', type: 'grunt', x: 2, y: 0.8, z: 8, playerDistance: 16, state: 'routing' }
  ]);
  const result = metrics.finish();
  assert.equal(result.metrics.groupMoveAttempts, 1);
  assert.equal(result.metrics.groupBlockedMoveAttempts, 1);
  assert.equal(result.metrics.targetDamageTotal, 12);
  assert.equal(result.metrics.uniqueGroupDamageDealers, 1);
  assert.equal(result.groupFootprint.length, 1);
});

test('browser entrypoint exposes the diagnostic runner and report controls', () => {
  const html = fs.readFileSync(new URL('../test-enemy-reactions.html', import.meta.url), 'utf8');
  assert.match(html, /enemy-reaction-diagnostic-runner\.js/);
  assert.match(html, /id="copyReport"/);
  assert.match(html, /id="downloadReport"/);
  assert.match(html, /id="stop"/);
  assert.match(html, /id="rows"/);
});

test('repeated timeline events keep exact counts but compact their serialized evidence', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'flyer', role: 'air', scenarioId: 'aerial_congestion',
    startPosition: { x: 0, y: 5, z: 0 }, initialPlayerDistance: 10
  });
  for (let index = 0; index < 2000; index++) metrics.addEvent(index, 'movement_blocked', { blockedBy: 'ally' });
  const result = metrics.finish();
  assert.equal(result.metrics.actionCounts.movement_blocked, 2000);
  assert.ok(result.timeline.length < 50);
  assert.ok(result.metrics.timelineOmittedByType.movement_blocked > 1900);
});

test('last-survivor Healer is judged by its percentage bomb instead of medic no-damage rules', () => {
  const assessment = evaluateEnemyReaction({
    enemyId: 'healer', scenarioId: 'last_survivor_bomb', role: 'support', preferredBand: [18, Infinity],
    metrics: {
      distanceTravelled: 5, stuckRatio: 0, damageTotal: 50,
      actionCounts: { healer_bomb_armed: 1, healer_bomb_exploded: 1 }
    }
  });
  assert.equal(assessment.status, 'pass');
  assert.ok(!assessment.findings.some(item => item.code === 'healer_damaged_player'));
});

test('wall attacks and ally overlaps become actionable failures', () => {
  const wall = evaluateEnemyReaction({
    scenarioId: 'wall_occlusion', role: 'ranged',
    metrics: { distanceTravelled: 3, damageWhileOccluded: 12, shotsWhileOccluded: 1, maxLateralOffset: 2 }
  });
  assert.equal(wall.status, 'fail');
  assert.ok(wall.findings.some(item => item.code === 'attacks_through_wall'));

  const ally = evaluateEnemyReaction({
    scenarioId: 'ally_blocking', role: 'melee',
    metrics: { distanceTravelled: 2, minAllyDistance: 0.4, maxLateralOffset: 0.2, progressToPlayer: 0.5 }
  });
  assert.equal(ally.status, 'fail');
  assert.ok(ally.findings.some(item => item.code === 'ally_overlap'));
  assert.ok(ally.findings.some(item => item.code === 'blocked_by_ally'));
});

test('diagnostic ignores player-contact melee blocking but keeps allied deadlocks actionable', () => {
  const playerContact = evaluateEnemyReaction({
    enemyId: 'grunt', scenarioId: 'open_pursuit', role: 'melee', preferredBand: [0, 2.3],
    metrics: {
      distanceTravelled: 12, initialPlayerDistance: 18, closestPlayerDistance: 0.2,
      moveAttempts: 600, stuckRatio: 0.55, movementBlockers: { player: 320 }
    }
  });
  assert.ok(!playerContact.findings.some(item => item.code === 'stuck_risk' || item.code === 'stuck'));

  const allyDeadlock = evaluateEnemyReaction({
    enemyId: 'bailiff', scenarioId: 'ally_blocking', role: 'melee', preferredBand: [0, 2.25],
    metrics: {
      distanceTravelled: 1, progressToPlayer: 1, maxLateralOffset: 0.1, minAllyDistance: 1.2,
      moveAttempts: 100, stuckRatio: 0.9, movementBlockers: { ally: 90 }
    }
  });
  assert.ok(allyDeadlock.findings.some(item => item.code === 'stuck'));
  assert.ok(allyDeadlock.findings.some(item => item.code === 'blocked_by_ally'));
});

test('group movement excludes player contact from ally-contention evidence', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'grunt', role: 'melee', scenarioId: 'duo_attack',
    startPosition: { x: 0, y: 0.8, z: 8 }, initialPlayerDistance: 16,
    preferredBand: [0, 2.3], expectedGroupSize: 2
  });
  metrics.recordGroupMovement(100, { requestedDistance: 1, appliedDistance: 0, blockedBy: 'player' }, 'grunt_a');
  metrics.recordGroupMovement(200, { requestedDistance: 1, appliedDistance: 0.2, blockedBy: 'ally' }, 'grunt_b');
  const result = metrics.finish();

  assert.equal(result.metrics.groupMoveAttempts, 2);
  assert.equal(result.metrics.groupBlockedMoveAttempts, 1);
  assert.equal(result.metrics.groupBlockedMoveRatio, 0.5);
});

test('Sniper cancellation and completed obstacle bypass are not false firing or exercise failures', () => {
  const cancellation = evaluateEnemyReaction({
    enemyId: 'sniper', scenarioId: 'lost_los_cancellation', role: 'sniper', preferredBand: [22, 30],
    metrics: {
      distanceTravelled: 4, shots: 0, firingOpportunitySeconds: 2.2,
      longestStableVisibleWindowMs: 2200, windupCancellations: 1, stuckRatio: 0,
      actionCounts: { sniper_windup_cancelled: 1 }
    }
  });
  assert.ok(!cancellation.findings.some(item => item.code === 'failed_to_fire'));

  const bypass = evaluateEnemyReaction({
    enemyId: 'tank', scenarioId: 'low_wall_navigation', role: 'tank', preferredBand: [0, 2.4],
    metrics: {
      distanceTravelled: 16, visibleRatio: 1, nearObstacleRatio: 0,
      obstaclePlanePassed: true, obstaclePenetrationSamples: 0, stuckRatio: 0
    }
  });
  assert.ok(!bypass.findings.some(item => item.code === 'scenario_not_exercised'));
});

test('unsafe mixed-squad shots retain the responsible actor', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'grunt', role: 'melee', scenarioId: 'mixed_squad_attack',
    startPosition: { x: 0, y: 0.8, z: 8 }, initialPlayerDistance: 16,
    preferredBand: [0, 2.3], expectedGroupSize: 4
  });
  metrics.recordShot(100, {
    worldVisible: true,
    tacticalVisible: false,
    kind: 'shooter',
    actorId: 'group_2'
  });
  const result = metrics.finish();
  assert.equal(result.metrics.shotsThroughAlliesByActor.group_2, 1);
  const finding = result.assessment.findings.find(item => item.code === 'shoots_through_allies');
  assert.equal(finding.evidence.shotsThroughAlliesByActor.group_2, 1);
});

test('metrics capture reacquisition latency and report prioritizes repeated findings', () => {
  const metrics = new EnemyReactionMetrics({
    enemyId: 'grunt', role: 'melee', scenarioId: 'sight_reacquisition',
    startPosition: { x: 0, y: 0.8, z: 8 }, initialPlayerDistance: 16
  });
  metrics.revealedAtMs = 1000;
  metrics.observe({ atMs: 1100, position: { x: 0, y: 0.8, z: 8 }, playerDistance: 16, visible: true, tracking: true, attemptedMove: true });
  metrics.observe({ atMs: 1250, position: { x: 0, y: 0.8, z: 7.9 }, playerDistance: 15.9, visible: true, tracking: true, attemptedMove: true });
  const result = metrics.finish();
  assert.equal(result.metrics.reactionLatencyMs, 250);

  const failed = {
    ...result,
    assessment: { status: 'fail', findings: [{ code: 'stuck', severity: 'fail' }] }
  };
  const report = buildEnemyReactionReport({
    environment: {}, startedAt: 'a', completedAt: 'b', results: [failed, failed]
  });
  assert.equal(report.summary.fail, 2);
  assert.deepEqual(report.summary.prioritizedFixes[0], { code: 'stuck', count: 2 });
  assert.equal(report.schemaVersion, 3);
  assert.equal(report.summary.inconclusive, 0);
  assert.equal(report.summary.not_applicable, 0);
  assert.equal(report.summary.combatOutput[0].enemyId, 'grunt');
});
