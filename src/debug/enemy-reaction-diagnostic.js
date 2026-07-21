import {
  ENEMY_BEHAVIOR_PROFILES,
  isScenarioApplicable
} from '../enemies/behavior-profiles.js';

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

const ARCHETYPE_LABELS = Object.freeze({
  grunt: 'Grunt', gruntling: 'Gruntling', tank: 'Tank', rusher: 'Rusher',
  rusher_elite: 'Elite rusher', rusher_explosive: 'Explosive rusher', bailiff: 'Bailiff',
  shooter: 'Shooter', sniper: 'Sniper', flyer: 'Flyer', pelican: 'Propaganda Pelican', healer: 'Healer', warden: 'Swarm warden'
});

const SPAWN_DISTANCE = Object.freeze({ shooter: 22, sniper: 28, pelican: 20, healer: 20, warden: 28 });

export const ENEMY_REACTION_ARCHETYPES = Object.freeze(
  Object.values(ENEMY_BEHAVIOR_PROFILES).map(profile => Object.freeze({
    id: profile.id,
    label: ARCHETYPE_LABELS[profile.id],
    role: profile.role,
    movementLayer: profile.movementLayer,
    spawnDistance: SPAWN_DISTANCE[profile.id] || 16,
    preferredBand: profile.preferredRange,
    collisionRadius: profile.collisionRadius
  }))
);

export const ENEMY_REACTION_SCENARIOS = Object.freeze([
  { id: 'open_pursuit', label: 'Open pursuit', description: 'Visible player; engage or establish the role range.' },
  { id: 'wall_occlusion', label: 'Player behind wall', obstacleKind: 'full_wall', description: 'No attacks or live tracking through a wall.' },
  { id: 'last_known_search', label: 'Last-known search', obstacleKind: 'full_wall', hideAtSeconds: 1, description: 'Pursue memory for five seconds, search for three, then expire it.' },
  { id: 'sight_reacquisition', label: 'Sight reacquisition', obstacleKind: 'full_wall', revealAtSeconds: 6, description: 'Reacquire after a hidden interval.' },
  { id: 'ally_blocking', label: 'Stationary ally route block', allyKind: 'stationary', description: 'Yield or route without body penetration.' },
  { id: 'crossing_ally', label: 'Crossing ally', allyKind: 'crossing', description: 'Resolve a moving crossing body.' },
  { id: 'moving_target', label: 'Moving target', movingPlayer: true, description: 'Track, lead, or intercept a strafing player.' },
  { id: 'low_wall_navigation', label: 'Visible player / low wall', visibleNavigation: true, obstacleKind: 'low_wall', description: 'Body route blocked while vision remains open.' },
  { id: 'barrel_navigation', label: 'Visible player / barrel', visibleNavigation: true, obstacleKind: 'barrel', description: 'Small solid prop blocks the direct body corridor.' },
  { id: 'narrow_choke', label: 'Narrow choke', obstacleKind: 'narrow_choke', description: 'Navigate a radius-expanded narrow route.' },
  { id: 'clear_charge', label: 'Clear charge', description: 'Rusher reserves, telegraphs, dashes, and recovers.' },
  { id: 'ally_blocked_charge', label: 'Ally-blocked charge', allyKind: 'stationary', description: 'An ally cancels or delays the charge.' },
  { id: 'wall_impact', label: 'Charge wall impact', obstacleKind: 'full_wall', description: 'World impact enters recovery.' },
  { id: 'miss_recovery', label: 'Charge miss / recovery', movingPlayer: true, description: 'A missed charge still recovers.' },
  { id: 'wall_edge_stability', label: 'Wall-edge LOS stability', obstacleKind: 'wall_edge', description: 'Peek without hidden/open flicker loops.' },
  { id: 'ally_fire_blocking', label: 'Ally fire obstruction', allyKind: 'fire_line', description: 'Reposition instead of firing through an ally.' },
  { id: 'ally_cover_usage', label: 'Shooter / frontline ally cover', allyKind: 'mobile_cover', description: 'Use a Grunt or Tank as moving cover, tuck during cooldown, and side-peek through a safe firing lane.' },
  { id: 'range_recovery', label: 'Range recovery', rushPlayerAtSeconds: 4, description: 'Recover the required role distance after being rushed.' },
  { id: 'player_aiming', label: 'Sniper / player aiming', playerAiming: true, description: 'Counter-aim tuck is valid defensive behavior.' },
  { id: 'player_not_aiming', label: 'Sniper / player not aiming', playerAiming: false, description: 'Establish a precision line and fire.' },
  { id: 'precision_position', label: 'Sniper precision position', description: 'Hold a stable 22–30 m firing anchor.' },
  { id: 'lost_los_cancellation', label: 'Sniper lost-LOS cancellation', obstacleAtSeconds: 2.2, description: 'Cancel aim when LOS is lost.' },
  { id: 'sniper_ally_obstruction', label: 'Sniper ally obstruction', allyKind: 'fire_line', description: 'Cancel aim and relocate around the ally.' },
  { id: 'injured_ally_cover', label: 'Healer / injured ally in cover', healerSetup: 'injured_cover', description: 'Heal an injured ally while hidden.' },
  { id: 'injured_ally_exposed', label: 'Healer / exposed injured ally', healerSetup: 'injured_exposed', description: 'Find a viable protected pulse position.' },
  { id: 'healthy_group', label: 'Healer / healthy group', healerSetup: 'healthy_group', description: 'Stay behind allies and do not pulse needlessly.' },
  { id: 'last_survivor_bomb', label: 'Healer / last-survivor bomb', healerSetup: 'alone', description: 'When it is the final wave enemy, chase, telegraph, and detonate for 50% of the player\'s current HP.' },
  { id: 'healer_non_stacking', label: 'Two-healer non-stacking', healerSetup: 'two_healers', description: 'Only the strongest heal applies per target per tick.' },
  { id: 'aerial_congestion', label: 'Aerial congestion', allyKind: 'aerial', description: 'Altitude-aware separation prevents overlap.' },
  { id: 'dive_corridor', label: 'Blocked dive corridor', allyKind: 'aerial_fire_line', description: 'Delay or change the dive angle.' },
  { id: 'pelican_bombing_cycle', label: 'Pelican bombing cycle', description: 'Approach to the 5–7 m release band, drop one grenade, retreat, and begin recharging.' },
  { id: 'outer_ring_retreat', label: 'Warden outer-ring retreat', description: 'Remain outside 18 m after positioning grace.' },
  { id: 'formation_separation', label: 'Warden formation separation', description: 'Maintain 10–15 children without overlap.' },
  { id: 'child_damage_attribution', label: 'Warden child attribution', description: 'Child attacks retain Warden ownership.' },
  { id: 'duo_attack', label: 'Two-enemy attack', groupSetup: 'same_type', groupSize: 2, description: 'Two matching enemies attack together without sharing bodies or invalidating one another\'s attack lanes.' },
  { id: 'squad_attack', label: 'Four-enemy attack', groupSetup: 'same_type', groupSize: 4, description: 'A compact same-role squad must spread, engage, and recover without pass-through or permanent lane contention.' },
  { id: 'mixed_squad_attack', label: 'Mixed four-enemy attack', groupSetup: 'mixed', groupSize: 4, description: 'Frontline, ranged, and support roles attack as a small mixed squad while preserving collision and firing safety.' }
]);

function scenarioDuration(archetype, scenario) {
  if (archetype.id === 'warden') return 24;
  if (archetype.id === 'pelican') return 18;
  if (archetype.id === 'shooter' || archetype.id === 'sniper' || archetype.id === 'healer') return 18;
  if (scenario.groupSetup) return 18;
  if (['wall_occlusion', 'last_known_search', 'sight_reacquisition', 'low_wall_navigation', 'barrel_navigation', 'narrow_choke', 'wall_impact'].includes(scenario.id)) return 16;
  return 12;
}

export function buildEnemyReactionMatrix({ enemy = null, scenario = null, includeNotApplicable = false } = {}) {
  const enemies = enemy
    ? ENEMY_REACTION_ARCHETYPES.filter(item => item.id === enemy)
    : ENEMY_REACTION_ARCHETYPES;
  const scenarios = scenario
    ? ENEMY_REACTION_SCENARIOS.filter(item => item.id === scenario)
    : ENEMY_REACTION_SCENARIOS;
  return enemies.flatMap(archetype => scenarios.flatMap(definition => {
    const applicable = isScenarioApplicable(archetype.id, definition.id);
    if (!applicable && !includeNotApplicable) return [];
    return [{
      id: `${archetype.id}__${definition.id}`,
      archetype,
      applicable,
      scenario: Object.freeze({ ...definition, durationSeconds: scenarioDuration(archetype, definition) })
    }];
  }));
}

function finding(code, severity, message, evidence = {}) {
  return { code, severity, message, evidence };
}

export function evaluateEnemyReaction(result) {
  const { enemyId, scenarioId, role, metrics = {} } = result;
  if (enemyId && !isScenarioApplicable(enemyId, scenarioId)) {
    return {
      status: 'not_applicable',
      findings: [finding('scenario_not_applicable', 'not_applicable', 'This scenario is outside the shared behavior contract for this archetype.', { enemyId, scenarioId })],
      summary: 'Not applicable'
    };
  }
  const findings = [];
  const moved = Number(metrics.distanceTravelled) || 0;
  const progress = Number(metrics.progressToPlayer) || 0;
  const stuckRatio = Number(metrics.stuckRatio) || 0;
  const minAllyDistance = Number(metrics.minAllyDistance);
  const isGroupCombatScenario = ['duo_attack', 'squad_attack', 'mixed_squad_attack'].includes(scenarioId);

  if ((role === 'melee' || role === 'rusher') && (metrics.moveAttempts || 0) > 0 && moved < 0.6) {
    findings.push(finding('inactive', 'fail', 'Enemy showed almost no locomotion or combat repositioning.', { distanceTravelled: moved }));
  }

  if ((metrics.maxConsecutiveBodyPenetrationTicks || 0) > 1 || (metrics.passThroughEvents || 0) > 0) {
    findings.push(finding('enemy_body_penetration', 'fail', 'Enemy bodies overlapped or crossed through one another.', {
      bodyOverlapRatio: metrics.bodyOverlapRatio || 0,
      maxConsecutiveBodyPenetrationTicks: metrics.maxConsecutiveBodyPenetrationTicks || 0,
      passThroughEvents: metrics.passThroughEvents || 0,
      minimumBodyClearance: metrics.minimumBodyClearance
    }));
  }
  if ((metrics.shotsThroughAllies || 0) > 0) {
    findings.push(finding('shoots_through_allies', 'fail', isGroupCombatScenario
      ? 'A ranged squad member fired through an allied body instead of holding or changing its line.'
      : 'Enemy fired through an allied body instead of treating it as temporary cover.', {
      shotsThroughAllies: metrics.shotsThroughAllies,
      shotsThroughAlliesByActor: metrics.shotsThroughAlliesByActor || {},
      allyBlockedFireSeconds: metrics.allyBlockedFireSeconds || 0,
      performanceNote: 'Use a capped nearest-allies segment test or spatial broadphase, not a raycast against the full enemy set.'
    }));
  }
  if ((metrics.microStableLosToggles ?? metrics.microLosToggles ?? 0) >= 3) {
    findings.push(finding('los_edge_flicker', 'fail', 'Line of sight repeatedly flickered at an obstacle edge.', {
      losTransitions: metrics.losTransitions,
      rawMicroLosToggles: metrics.microLosToggles,
      stableLosTransitions: metrics.stableLosTransitions,
      microStableLosToggles: metrics.microStableLosToggles,
      longestVisibleWindowMs: metrics.longestVisibleWindowMs,
      windupCancellations: metrics.windupCancellations || 0
    }));
  }
  const constraintBlocks = (metrics.movementBlockers?.ally || 0) + (metrics.movementBlockers?.world || 0);
  const constraintBlockRatio = constraintBlocks / Math.max(1, metrics.moveAttempts || 0);
  const actionableStuckRatio = Math.min(stuckRatio, constraintBlockRatio);
  if (actionableStuckRatio > 0.65) {
    findings.push(finding('stuck', 'fail', 'Enemy spent most sampled time unable to resolve world or allied movement constraints.', {
      stuckRatio,
      constraintBlockRatio
    }));
  } else if (actionableStuckRatio > 0.35) {
    findings.push(finding('stuck_risk', 'warn', 'Enemy repeatedly lost movement against world or allied steering constraints.', {
      stuckRatio,
      constraintBlockRatio
    }));
  }

  if (scenarioId === 'open_pursuit' && role === 'melee' && (metrics.closestPlayerDistance ?? Infinity) > metrics.initialPlayerDistance - 2) {
    findings.push(finding('weak_pursuit', 'fail', 'Melee enemy never closed meaningful distance in open sight.', { closestPlayerDistance: metrics.closestPlayerDistance }));
  }
  if (scenarioId === 'open_pursuit' && role === 'rusher') {
    if ((metrics.dashCount || 0) === 0) findings.push(finding('rusher_no_dash', 'fail', 'Rusher never entered its signature dash loop.', { footprint: 'See result.footprint' }));
    else if ((metrics.closestPlayerDistance ?? Infinity) > 3 && metrics.damageEvents === 0) {
      findings.push(finding('rusher_missed_charge', 'fail', 'Rusher dashed but never reached a credible impact distance.', {
        dashCount: metrics.dashCount,
        closestPlayerDistance: metrics.closestPlayerDistance,
        pathEfficiency: metrics.pathEfficiency
      }));
    } else if ((metrics.pathEfficiency || 0) > 2.5 && metrics.damageEvents === 0) {
      findings.push(finding('rusher_overshoot', 'warn', 'Rusher reached the player area but lost excessive distance to overshoot or looping.', {
        pathEfficiency: metrics.pathEfficiency,
        closestPlayerDistance: metrics.closestPlayerDistance,
        finalPlayerDistance: metrics.finalPlayerDistance
      }));
    }
  }
  if (scenarioId === 'wall_occlusion') {
    if ((metrics.longestHiddenWindowMs || 0) < 1000) {
      findings.push(finding('occlusion_not_exercised', 'inconclusive', 'The wall never produced a sustained hidden interval, so this case cannot pass.', {
        longestHiddenWindowMs: metrics.longestHiddenWindowMs || 0
      }));
    }
    if ((metrics.damageWhileOccluded || 0) > 0 || (metrics.shotsWhileOccluded || 0) > 0) {
      findings.push(finding('attacks_through_wall', 'fail', 'Enemy damaged or fired at the player while the diagnostic ray confirmed occlusion.', {
        damageWhileOccluded: metrics.damageWhileOccluded || 0,
        shotsWhileOccluded: metrics.shotsWhileOccluded || 0
      }));
    }
    if ((metrics.maxLateralOffset || 0) < 1.2 && moved > 0.6) {
      findings.push(finding('no_route_search', 'warn', 'Enemy moved but did not commit laterally around the blocking wall.', { maxLateralOffset: metrics.maxLateralOffset || 0 }));
    }
  }
  if (scenarioId === 'sight_reacquisition') {
    const reacquisitionExercised = (metrics.longestHiddenWindowMs || 0) >= 1000;
    if (!reacquisitionExercised) {
      findings.push(finding('reacquisition_occlusion_not_exercised', 'inconclusive', 'The target was not hidden long enough before reveal to validate reacquisition.', {
        longestHiddenWindowMs: metrics.longestHiddenWindowMs || 0
      }));
    } else {
      if (metrics.damageWhileOccluded > 0 || metrics.shotsWhileOccluded > 0) {
        findings.push(finding('attacks_before_reveal', 'fail', 'Enemy attacked before line of sight was restored.'));
      }
      if (metrics.reactionLatencyMs == null) {
        findings.push(finding('failed_to_reacquire', 'fail', 'Enemy did not produce measurable pursuit, aim, or attack response after reveal.'));
      } else if (metrics.reactionLatencyMs > 1500) {
        findings.push(finding('slow_reacquisition', 'warn', 'Enemy reaction after sight restoration was slow.', { reactionLatencyMs: metrics.reactionLatencyMs }));
      }
    }
  }
  if (scenarioId === 'last_known_search') {
    if ((metrics.longestHiddenWindowMs || 0) < 8000) {
      findings.push(finding('memory_window_not_exercised', 'inconclusive', 'The player was not continuously hidden long enough to exercise five-second memory plus three-second search.', {
        longestHiddenWindowMs: metrics.longestHiddenWindowMs || 0
      }));
    } else if ((metrics.stateDurations?.searching || 0) <= 0) {
      findings.push(finding('search_phase_missing', 'fail', 'Enemy never entered its explicit search phase after last-known pursuit expired.'));
    }
    if ((metrics.damageWhileOccluded || 0) > 0 || (metrics.shotsWhileOccluded || 0) > 0) {
      findings.push(finding('live_tracking_while_hidden', 'fail', 'Enemy attacked the moved player through occlusion instead of using its last-known position.'));
    }
  }
  if (scenarioId === 'ally_blocking' && role !== 'support') {
    if (Number.isFinite(minAllyDistance) && minAllyDistance < 1.1) {
      findings.push(finding('ally_overlap', 'fail', 'Enemy overlapped the ally blocking its route.', { minAllyDistance }));
    }
    if ((metrics.maxLateralOffset || 0) < 0.7 && progress < 1.5) {
      findings.push(finding('blocked_by_ally', 'fail', 'Enemy neither passed nor steered around the blocking ally.', {
        maxLateralOffset: metrics.maxLateralOffset || 0,
        progressToPlayer: progress
      }));
    }
  }
  if (scenarioId === 'clear_charge' && role === 'rusher') {
    if ((metrics.dashCount || 0) === 0) {
      findings.push(finding('clear_charge_not_exercised', 'inconclusive', 'The clear charge lane never produced a dash.'));
    } else if ((metrics.stateDurations?.dash_recover || 0) <= 0 && !(metrics.actionCounts?.charge_ended > 0)) {
      findings.push(finding('charge_recovery_missing', 'fail', 'Rusher dashed but never entered recovery.'));
    }
  }
  if (scenarioId === 'ally_blocked_charge' && role === 'rusher') {
    const cancelCount = metrics.actionCounts?.charge_cancelled || metrics.actionCounts?.movement_blocked || 0;
    if (cancelCount <= 0) findings.push(finding('blocked_charge_not_exercised', 'inconclusive', 'No charge cancellation or blocked-lane action was observed.'));
  }
  const scoredTrackingRatio = metrics.engagementTrackingRatio ?? metrics.trackingRatio ?? 0;
  if (scenarioId === 'moving_target' && role !== 'support' && scoredTrackingRatio < 0.35) {
    findings.push(finding('poor_tracking', 'warn', 'Enemy facing or movement tracked the strafing player in too few relevant samples.', {
      trackingRatio: scoredTrackingRatio,
      trackingWindow: metrics.engagementTrackingRatio != null ? 'engagement' : 'all_samples'
    }));
  }

  const excludedFiringScenarios = new Set(['player_aiming', 'last_known_search', 'lost_los_cancellation']);
  if ((role === 'ranged' || role === 'sniper') && !excludedFiringScenarios.has(scenarioId)) {
    const continuousWindowRequired = role === 'sniper' ? 1900 : 900;
    if ((metrics.firingOpportunitySeconds || 0) >= 0.8
      && (metrics.longestStableVisibleWindowMs || metrics.longestVisibleWindowMs || 0) >= continuousWindowRequired
      && (metrics.shots || 0) === 0) {
      findings.push(finding('failed_to_fire', 'fail', 'Enemy had a stable in-range firing solution but never fired.', {
        firingOpportunitySeconds: metrics.firingOpportunitySeconds,
        windupCancellations: metrics.windupCancellations || 0,
        longestVisibleWindowMs: metrics.longestVisibleWindowMs
      }));
    }
    if ((metrics.windupCancellations || 0) >= 2 && (metrics.shots || 0) === 0) {
      findings.push(finding('aim_loop_cancelled', 'fail', 'Repeated aim wind-ups were cancelled without producing a shot.', { windupCancellations: metrics.windupCancellations }));
    }
  }

  if (role === 'support' && scenarioId !== 'last_survivor_bomb') {
    const preferredMin = result.preferredBand?.[0] ?? 9;
    if ((metrics.closestPlayerDistance ?? Infinity) < preferredMin - 1.5) {
      findings.push(finding('support_too_close', 'fail', 'Support enemy moved substantially inside its intended player standoff distance.', {
        enemyId,
        closestPlayerDistance: metrics.closestPlayerDistance,
        preferredMinimum: preferredMin
      }));
    }
  }

  if (scenarioId === 'low_wall_navigation' || scenarioId === 'barrel_navigation') {
    if ((metrics.visibleRatio || 0) < 0.85) {
      findings.push(finding('visible_route_lost_los', 'fail', 'The navigation obstacle should preserve sight, but LOS was lost too often.', { visibleRatio: metrics.visibleRatio }));
    }
    if ((metrics.obstaclePenetrationSamples || 0) > 0) {
      findings.push(finding('walked_through_obstacle', 'fail', 'Enemy footprint entered the solid navigation obstacle.', { obstaclePenetrationSamples: metrics.obstaclePenetrationSamples }));
    }
    if ((metrics.nearObstacleRatio || 0) === 0 && !metrics.obstaclePlanePassed && !metrics.validCombatAnchor) {
      findings.push(finding('scenario_not_exercised', 'inconclusive', 'Enemy never reached the navigation obstacle, so this case cannot be marked healthy.', {
        distanceTravelled: moved,
        obstacleKind: scenarioId
      }));
    } else if ((metrics.nearObstacleStuckRatio || 0) > 0.65
      || (!metrics.obstaclePlanePassed && !metrics.validCombatAnchor)) {
      findings.push(finding('failed_visible_obstacle_bypass', 'fail', 'Enemy neither advanced past nor routed around the visible low obstacle.', {
        obstacleBypassProgress: metrics.obstacleBypassProgress || 0,
        maxLateralOffset: metrics.maxLateralOffset || 0,
        nearObstacleStuckRatio: metrics.nearObstacleStuckRatio || 0,
        obstaclePlanePassed: !!metrics.obstaclePlanePassed,
        validCombatAnchor: !!metrics.validCombatAnchor
      }));
    }
  }

  const firingEvidenceScenarios = new Set([
    'open_pursuit', 'moving_target', 'wall_edge_stability', 'range_recovery',
    'player_not_aiming', 'precision_position', 'low_wall_navigation', 'barrel_navigation'
  ]);
  if ((role === 'ranged' || role === 'sniper') && firingEvidenceScenarios.has(scenarioId) && (metrics.shots || 0) === 0) {
    const requiredWindowMs = role === 'sniper' ? 1900 : 900;
    const stableWindowMs = metrics.longestStableVisibleWindowMs || metrics.longestVisibleWindowMs || 0;
    if ((metrics.firingOpportunitySeconds || 0) < 0.5 || stableWindowMs < requiredWindowMs) {
      findings.push(finding('firing_opportunity_not_exercised', 'inconclusive', 'No continuous stable in-range firing opportunity occurred; this case cannot pass.', {
        firingOpportunitySeconds: metrics.firingOpportunitySeconds || 0,
        longestStableVisibleWindowMs: stableWindowMs,
        requiredWindowMs
      }));
    }
  }

  if (enemyId === 'shooter' && scenarioId === 'moving_target' && (metrics.damageTotal || 0) <= 0) {
    findings.push(finding('shooter_seeded_damage_missing', (metrics.shots || 0) > 0 ? 'fail' : 'inconclusive', 'Shooter did not land measurable damage in the seeded moving-target case.', {
      shots: metrics.shots || 0,
      damageTotal: metrics.damageTotal || 0
    }));
  }

  if (enemyId === 'shooter' && scenarioId === 'ally_cover_usage') {
    const selected = metrics.actionCounts?.ally_cover_selected || 0;
    const hidden = metrics.actionCounts?.ally_cover_hidden || 0;
    const peeked = metrics.actionCounts?.ally_cover_peek_started || 0;
    if (selected <= 0) {
      findings.push(finding('shooter_ally_cover_not_selected', 'fail', 'Shooter ignored the provided frontline Tank/Grunt cover opportunity.', {
        allyCoverSelections: selected
      }));
    } else {
      if (hidden <= 0) {
        findings.push(finding('shooter_did_not_tuck_behind_ally', 'fail', 'Shooter selected allied cover but never tucked behind it during burst cooldown.', {
          allyCoverSelections: selected,
          allyCoverHiddenTransitions: hidden
        }));
      }
      if (peeked <= 0) {
        findings.push(finding('shooter_did_not_peek_from_ally', 'fail', 'Shooter selected allied cover but never established a safe side-peek.', {
          allyCoverSelections: selected,
          allyCoverPeekTransitions: peeked
        }));
      }
    }
    if ((metrics.shots || 0) <= 0) {
      findings.push(finding('shooter_cover_attack_not_exercised', 'inconclusive', 'No shot was observed from the ally-cover position, so attack safety is not proven.'));
    }
  }

  const groupCombatScenario = isGroupCombatScenario;
  if (groupCombatScenario) {
    const expectedGroupSize = metrics.expectedGroupSize || 1;
    if ((metrics.groupSizePeak || 0) < expectedGroupSize) {
      findings.push(finding('group_not_fully_spawned', 'inconclusive', 'The required small combat group was never present together.', {
        expectedGroupSize,
        groupSizePeak: metrics.groupSizePeak || 0
      }));
    }
    if ((metrics.groupAttackEvents || 0) === 0 && (metrics.damageEvents || 0) === 0) {
      findings.push(finding('group_attack_not_exercised', 'inconclusive', 'No member produced an attack event, so group combat cannot pass.'));
    } else if ((metrics.damageTotal || 0) <= 0 && role !== 'support') {
      findings.push(finding('group_landed_no_damage', 'fail', 'The group attacked but landed no measurable damage during the seeded combat window.', {
        groupAttackEvents: metrics.groupAttackEvents || 0,
        uniqueGroupAttackers: metrics.uniqueGroupAttackers || 0
      }));
    }
    if (expectedGroupSize >= 4 && (metrics.uniqueGroupAttackers || 0) < 2 && (metrics.groupAttackEvents || 0) > 0) {
      findings.push(finding('group_attack_participation_low', 'warn', 'Only one squad member contributed an observed attack.', {
        uniqueGroupAttackers: metrics.uniqueGroupAttackers || 0,
        expectedGroupSize
      }));
    }
    if ((metrics.projectilesBlockedByAllies || 0) > 0) {
      findings.push(finding('group_projectiles_hit_allies', 'fail', 'A ranged group member launched a projectile into an allied body instead of holding or changing its line.', {
        projectilesBlockedByAllies: metrics.projectilesBlockedByAllies
      }));
    }
    if ((metrics.groupBlockedMoveRatio || 0) > 0.7 && (metrics.groupMoveAttempts || 0) >= 12) {
      findings.push(finding('group_lane_deadlock', 'fail', 'Most group movement requests were blocked, indicating a persistent lane deadlock.', {
        groupBlockedMoveRatio: metrics.groupBlockedMoveRatio,
        groupMoveAttempts: metrics.groupMoveAttempts
      }));
    } else if ((metrics.groupBlockedMoveRatio || 0) > 0.45 && (metrics.groupMoveAttempts || 0) >= 12) {
      findings.push(finding('group_lane_contention', 'warn', 'The group spent substantial movement time resolving allied lanes.', {
        groupBlockedMoveRatio: metrics.groupBlockedMoveRatio
      }));
    }
  }

  if (enemyId === 'sniper') {
    if (scenarioId === 'player_not_aiming' && (metrics.shots || 0) === 0 && (metrics.firingOpportunitySeconds || 0) >= 0.5) {
      findings.push(finding('sniper_did_not_fire', 'fail', 'Sniper had an unopposed precision opportunity but did not fire.'));
    }
    if (scenarioId === 'player_aiming') {
      const tuckedSeconds = metrics.stateDurations?.tucked || metrics.stateDurations?.counter_aim_tuck || 0;
      if (tuckedSeconds <= 0 && !(metrics.actionCounts?.sniper_tucked > 0)) {
        findings.push(finding('sniper_tuck_not_exercised', 'inconclusive', 'The counter-aim tuck was never observed, so defensive behavior cannot pass.'));
      }
    }
  }

  if (enemyId === 'healer') {
    const healerDamage = groupCombatScenario ? (metrics.targetDamageTotal || 0) : (metrics.damageTotal || 0);
    if (scenarioId !== 'last_survivor_bomb' && healerDamage > 0) {
      findings.push(finding('healer_damaged_player', 'fail', 'Healer must never attack or damage the player.', { damageTotal: healerDamage }));
    }
    if (scenarioId === 'last_survivor_bomb') {
      const armed = metrics.actionCounts?.healer_bomb_armed || 0;
      const exploded = metrics.actionCounts?.healer_bomb_exploded || 0;
      if (armed <= 0 || exploded <= 0) {
        findings.push(finding('healer_bomb_not_exercised', 'inconclusive', 'The last-survivor Healer did not complete its arm-and-detonate sequence.', { armed, exploded }));
      } else if (Math.abs(healerDamage - 50) > 0.5) {
        findings.push(finding('healer_bomb_damage_wrong', 'fail', 'With the diagnostic player at 100 HP, the bomb must remove exactly 50% current HP.', { damageTotal: healerDamage }));
      }
    }
    if (scenarioId === 'injured_ally_cover' || scenarioId === 'injured_ally_exposed') {
      if ((metrics.healingAttempted || 0) <= 0) {
        findings.push(finding('healing_opportunity_not_exercised', 'inconclusive', 'No healing pulse was attempted in the injured-ally scenario.'));
      } else if ((metrics.effectiveHpRestored || 0) <= 0) {
        findings.push(finding('healer_restored_no_hp', 'fail', 'Healing was attempted but restored no measurable HP.', {
          healingAttempted: metrics.healingAttempted,
          effectiveHpRestored: metrics.effectiveHpRestored || 0
        }));
      }
      if (scenarioId === 'injured_ally_cover' && (metrics.healingWhileHidden || 0) <= 0) {
        findings.push(finding('healer_not_hidden', 'fail', 'Healer did not restore HP from a hidden position.'));
      }
    }
    if (scenarioId === 'healthy_group' && (metrics.healingAttempted || 0) > 0) {
      findings.push(finding('unnecessary_healing', 'fail', 'Healer pulsed despite no injured target.', { healingAttempted: metrics.healingAttempted }));
    }
    if (scenarioId === 'mixed_squad_attack') {
      if ((metrics.healingAttempted || 0) <= 0) {
        findings.push(finding('mixed_group_heal_not_exercised', 'inconclusive', 'The healer never attempted to support its injured frontline ally.'));
      } else if ((metrics.effectiveHpRestored || 0) <= 0) {
        findings.push(finding('mixed_group_heal_ineffective', 'fail', 'The healer attempted support pulses but restored no measurable HP.'));
      }
    }
  }

  if (enemyId === 'pelican' && scenarioId === 'pelican_bombing_cycle') {
    const runs = metrics.actionCounts?.pelican_attack_run_started || 0;
    const drops = metrics.actionCounts?.pelican_grenade_dropped || 0;
    const explosions = metrics.actionCounts?.pelican_grenade_exploded || 0;
    const recharges = metrics.actionCounts?.pelican_recharge_started || 0;
    if (runs <= 0 || drops <= 0) {
      findings.push(finding('pelican_drop_not_exercised', 'inconclusive', 'The Pelican never completed its approach and grenade release.', { runs, drops }));
    } else {
      if (explosions < drops) {
        findings.push(finding('pelican_grenade_did_not_resolve', 'fail', 'A released Pelican grenade did not reach its explosion state.', { drops, explosions }));
      }
      if (recharges <= 0) {
        findings.push(finding('pelican_retreat_recharge_missing', 'fail', 'The Pelican dropped a grenade but did not finish retreating into recharge.', { drops, recharges }));
      }
      if ((metrics.minimumPelicanReleaseDistance ?? Infinity) < 4.95
        || (metrics.maximumPelicanReleaseDistance ?? -Infinity) > 7.05) {
        findings.push(finding('pelican_release_range_invalid', 'fail', 'The Pelican released outside its required 5–7 m band.', {
          minimumReleaseDistance: metrics.minimumPelicanReleaseDistance,
          maximumReleaseDistance: metrics.maximumPelicanReleaseDistance
        }));
      }
      if ((metrics.damageBySource?.pelican_grenade || 0) <= 0) {
        findings.push(finding('pelican_grenade_damage_missing', 'fail', 'The stationary diagnostic player received no grenade damage during a completed bombing cycle.', {
          damageBySource: metrics.damageBySource || {}
        }));
      }
    }
  }

  if (enemyId === 'warden') {
    if (scenarioId === 'outer_ring_retreat') {
      if ((metrics.positioningGraceSamples || 0) <= 0) {
        findings.push(finding('outer_ring_not_exercised', 'inconclusive', 'No post-grace positioning samples were recorded.'));
      } else if ((metrics.postGraceMinimumPlayerDistance ?? Infinity) < 18) {
        findings.push(finding('warden_too_close', 'fail', 'Warden remained inside the required 18 m standoff after its grace period.', {
          postGraceMinimumPlayerDistance: metrics.postGraceMinimumPlayerDistance
        }));
      }
    }
    if (scenarioId === 'formation_separation' && (metrics.swarmPeak || 0) < 10) {
      findings.push(finding('warden_swarm_not_exercised', 'inconclusive', 'Warden never established the required 10-child formation.', { swarmPeak: metrics.swarmPeak || 0 }));
    }
    if (scenarioId === 'child_damage_attribution') {
      if ((metrics.childDamageEvents || 0) === 0) {
        findings.push(finding('child_attack_not_exercised', 'inconclusive', 'No child attack landed, so ownership attribution was not exercised.'));
      } else if ((metrics.childDamageAttributedToWarden || 0) !== (metrics.childDamageEvents || 0)) {
        findings.push(finding('warden_child_attribution_lost', 'fail', 'One or more child attacks were not attributed to the Warden.', {
          childDamageEvents: metrics.childDamageEvents,
          childDamageAttributedToWarden: metrics.childDamageAttributedToWarden || 0
        }));
      }
    }
  }

  const failed = findings.some(item => item.severity === 'fail');
  const inconclusive = findings.some(item => item.severity === 'inconclusive');
  const warned = findings.some(item => item.severity === 'warn');
  return {
    status: failed ? 'fail' : inconclusive ? 'inconclusive' : warned ? 'warn' : 'pass',
    findings,
    summary: failed ? 'Needs AI fix' : inconclusive ? 'Evidence missing' : warned ? 'Review recommended' : 'Behavior healthy'
  };
}

export function buildEnemyReactionReport({ environment, startedAt, completedAt, results, errors = [], interruptions = [] }) {
  const statusCounts = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 };
  const findingCounts = {};
  const combatByEnemy = {};
  const groupCombatOutput = [];
  let totalDamage = 0;
  let totalDamageEvents = 0;
  for (const result of results) {
    statusCounts[result.assessment.status] = (statusCounts[result.assessment.status] || 0) + 1;
    for (const item of result.assessment.findings) {
      if (item.severity === 'not_applicable') continue;
      findingCounts[item.code] = (findingCounts[item.code] || 0) + 1;
    }
    const combat = combatByEnemy[result.enemyId] || (combatByEnemy[result.enemyId] = { damage: 0, damageEvents: 0, shots: 0, simulationSeconds: 0 });
    const isGroupCombat = (result.metrics.expectedGroupSize || 1) > 1;
    const attributableDamage = isGroupCombat ? (result.metrics.targetDamageTotal || 0) : (result.metrics.damageTotal || 0);
    combat.damage += attributableDamage;
    combat.damageEvents += isGroupCombat ? (result.metrics.targetDamageEvents || 0) : (result.metrics.damageEvents || 0);
    combat.shots += isGroupCombat ? (result.metrics.targetShots || 0) : (result.metrics.shots || 0);
    combat.simulationSeconds += result.metrics.simulationSeconds || 0;
    totalDamage += result.metrics.damageTotal || 0;
    totalDamageEvents += result.metrics.damageEvents || 0;
    if (isGroupCombat) {
      groupCombatOutput.push({
        enemyId: result.enemyId,
        scenarioId: result.scenarioId,
        status: result.assessment.status,
        expectedGroupSize: result.metrics.expectedGroupSize,
        groupSizePeak: result.metrics.groupSizePeak,
        damage: round(result.metrics.damageTotal || 0),
        targetDamage: round(result.metrics.targetDamageTotal || 0),
        uniqueAttackers: result.metrics.uniqueGroupAttackers || 0,
        uniqueDamageDealers: result.metrics.uniqueGroupDamageDealers || 0,
        shots: result.metrics.shots || 0,
        projectilesBlockedByAllies: result.metrics.projectilesBlockedByAllies || 0,
        movementBlockedRatio: round(result.metrics.groupBlockedMoveRatio || 0),
        maximumBodyPenetrationTicks: result.metrics.maxConsecutiveBodyPenetrationTicks || 0
      });
    }
  }
  const prioritizedFixes = Object.entries(findingCounts)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  const combatOutput = Object.entries(combatByEnemy).map(([enemyId, combat]) => ({
    enemyId,
    damage: round(combat.damage),
    damageEvents: combat.damageEvents,
    shots: combat.shots,
    damagePerSecond: round(combat.damage / Math.max(0.001, combat.simulationSeconds))
  })).sort((a, b) => b.damage - a.damage);
  return {
    schemaVersion: 3,
    diagnostic: 'enemy-reaction',
    startedAt,
    completedAt,
    environment,
    summary: {
      scenariosRun: results.length,
      ...statusCounts,
      prioritizedFixes,
      totalDamage: round(totalDamage),
      totalDamageEvents,
      combatOutput,
      groupCombatOutput
    },
    results,
    errors,
    interruptions
  };
}

export class EnemyReactionMetrics {
  constructor({ enemyId, role, scenarioId, startPosition, initialPlayerDistance, preferredBand = [0, Infinity], expectedGroupSize = 1 }) {
    this.enemyId = enemyId;
    this.role = role;
    this.scenarioId = scenarioId;
    this.startPosition = { ...startPosition };
    this.initialPlayerDistance = initialPlayerDistance;
    this.preferredBand = preferredBand;
    this.expectedGroupSize = expectedGroupSize;
    this.groupSizePeak = 1;
    this.groupMoveAttempts = 0;
    this.groupBlockedMoveAttempts = 0;
    this.groupAttackEvents = 0;
    this.projectilesBlockedByAllies = 0;
    this.simultaneousAttackersPeak = 0;
    this._groupAttackers = new Set();
    this._groupDamageDealers = new Set();
    this._groupShooters = new Set();
    this.targetDamageTotal = 0;
    this.targetDamageEvents = 0;
    this.targetShots = 0;
    this.groupFootprint = [];
    this.samples = 0;
    this.visibleSamples = 0;
    this.stableVisibleSamples = 0;
    this.locomotionClearSamples = 0;
    this.tacticalClearSamples = 0;
    this.trackingSamples = 0;
    this.engagementTrackingSamples = 0;
    this.engagementTrackingEligibleSamples = 0;
    this.stuckSamples = 0;
    this.moveAttempts = 0;
    this.blockedMoveAttempts = 0;
    this.requestedMovement = 0;
    this.appliedMovement = 0;
    this.movementBlockers = {};
    this.blockerIdentities = {};
    this.distanceTravelled = 0;
    this.maxLateralOffset = 0;
    this.minAllyDistance = Infinity;
    this.closestPlayerDistance = initialPlayerDistance;
    this.farthestPlayerDistance = initialPlayerDistance;
    this.damageEvents = 0;
    this.damageTotal = 0;
    this.damageWhileOccluded = 0;
    this.damageWhileTacticallyBlocked = 0;
    this.damageBySource = {};
    this.damageByOwner = {};
    this.childDamageEvents = 0;
    this.childDamageAttributedToWarden = 0;
    this.minimumPelicanReleaseDistance = Infinity;
    this.maximumPelicanReleaseDistance = -Infinity;
    this.firstDamageAtMs = null;
    this.lastDamageAtMs = null;
    this.shots = 0;
    this.shotsWhileOccluded = 0;
    this.shotsThroughAllies = 0;
    this.shotsThroughAlliesByActor = {};
    this.losTransitions = 0;
    this.microLosToggles = 0;
    this.stableLosTransitions = 0;
    this.microStableLosToggles = 0;
    this.longestVisibleWindowMs = 0;
    this.longestHiddenWindowMs = 0;
    this.tacticalLosTransitions = 0;
    this.firingOpportunitySeconds = 0;
    this.allyBlockedFireSeconds = 0;
    this.windupCancellations = 0;
    this.dashCount = 0;
    this.bodyOverlapTicks = 0;
    this.maxConsecutiveBodyPenetrationTicks = 0;
    this._consecutiveBodyPenetrationTicks = 0;
    this.tickCount = 0;
    this.passThroughEvents = 0;
    this.minimumBodyClearance = Infinity;
    this.obstaclePenetrationSamples = 0;
    this.nearObstacleStuckTicks = 0;
    this.nearObstacleTicks = 0;
    this.swarmPeak = 0;
    this.healingAttempted = 0;
    this.effectiveHpRestored = 0;
    this.healingWhileHidden = 0;
    this.healTargets = {};
    this.positioningGraceSamples = 0;
    this.postGraceMinimumPlayerDistance = Infinity;
    this.obstaclePlanePassed = false;
    this.validCombatAnchor = false;
    this.simulationSeconds = 0;
    this.maximumHorizontalSpeed = 0;
    this._horizontalSpeedTotal = 0;
    this.stateDurations = {};
    this.actionCounts = {};
    this.pathRequests = 0;
    this.pathCacheHits = 0;
    this.pathResolutions = 0;
    this.pathFailures = 0;
    this.revealedAtMs = null;
    this.reactionAtMs = null;
    this.timeline = [];
    this._timelineStoredByType = {};
    this.timelineOmittedByType = {};
    this.footprint = [];
    this._lastPosition = { ...startPosition };
    this._lastLos = null;
    this._lastTacticalLos = null;
    this._lastStableLos = null;
    this._lastStableLosChangeAtMs = 0;
    this._lastLosChangeAtMs = 0;
    this._visibleWindowMs = 0;
    this._hiddenWindowMs = 0;
    this._stableVisibleWindowMs = 0;
    this.longestStableVisibleWindowMs = 0;
    this._lastWindupActive = false;
    this._lastCharging = false;
    this._lastAllySide = null;
    this._lastShotCountForWindup = 0;
  }

  addEvent(atMs, type, data = {}) {
    const count = (this.actionCounts[type] || 0) + 1;
    this.actionCounts[type] = count;
    const stored = this._timelineStoredByType[type] || 0;
    // Keep exact event totals, dense early evidence, and logarithmic samples of
    // long repetitions. A deadlock can no longer add one JSON row per AI tick.
    const keep = stored < 32 || (count > 32 && (count & (count - 1)) === 0);
    if (keep && this.timeline.length < 512) {
      this.timeline.push({ atMs: round(atMs, 1), type, occurrence: count, ...data });
      this._timelineStoredByType[type] = stored + 1;
    } else {
      this.timelineOmittedByType[type] = (this.timelineOmittedByType[type] || 0) + 1;
    }
  }

  recordMovement(atMs, result = {}) {
    const requested = Number(result.requestedDistance) || 0;
    const applied = Number(result.appliedDistance) || 0;
    this.requestedMovement += requested;
    this.appliedMovement += applied;
    if (result.blockedBy) {
      this.blockedMoveAttempts++;
      this.movementBlockers[result.blockedBy] = (this.movementBlockers[result.blockedBy] || 0) + 1;
      const blockerId = result.blockerRoot?.userData?.behaviorId || result.blockerRoot?.userData?.type || null;
      if (blockerId) this.blockerIdentities[blockerId] = (this.blockerIdentities[blockerId] || 0) + 1;
      this.addEvent(atMs, 'movement_blocked', { blockedBy: result.blockedBy, blockerId, requested: round(requested), applied: round(applied) });
    }
  }

  recordGroupMovement(atMs, result = {}, actorId = 'unknown') {
    this.groupMoveAttempts++;
    // Reaching the player is normal melee contact, not evidence that squad members
    // are deadlocking one another in a lane.
    if (!result.blockedBy || result.blockedBy === 'player') return;
    this.groupBlockedMoveAttempts++;
    const blockerId = result.blockerRoot?.userData?.diagnosticActorId
      || result.blockerRoot?.userData?.behaviorId
      || result.blockerRoot?.userData?.type
      || null;
    this.addEvent(atMs, 'group_movement_blocked', {
      actorId,
      blockedBy: result.blockedBy,
      blockerId,
      requested: round(result.requestedDistance),
      applied: round(result.appliedDistance)
    });
  }

  recordAIEvent(atMs, event, { healerHidden = false, targetRoot = null } = {}) {
    if (!event?.type) return;
    const rootId = event.root?.userData?.diagnosticActorId || event.root?.userData?.behaviorId || event.root?.userData?.type || null;
    const blockerId = event.blockerRoot?.userData?.diagnosticActorId || event.blockerRoot?.userData?.behaviorId || event.blockerRoot?.userData?.type || null;
    const targetId = event.targetRoot?.userData?.diagnosticActorId || event.targetRoot?.userData?.behaviorId || event.targetRoot?.userData?.type || null;
    const coverId = event.coverRoot?.userData?.diagnosticActorId || event.coverRoot?.userData?.behaviorId || event.coverRoot?.userData?.type || null;
    this.addEvent(atMs, event.type, {
      rootId,
      blockerId,
      targetId,
      coverId,
      ...(Number.isFinite(event.releaseDistance) ? { releaseDistance: round(event.releaseDistance) } : {}),
      ...(Number.isFinite(event.blastRadius) ? { blastRadius: round(event.blastRadius) } : {}),
      ...(Number.isFinite(event.rechargeTime) ? { rechargeTime: round(event.rechargeTime) } : {})
    });
    if (event.type === 'pelican_grenade_dropped' && Number.isFinite(event.releaseDistance)) {
      this.minimumPelicanReleaseDistance = Math.min(this.minimumPelicanReleaseDistance, event.releaseDistance);
      this.maximumPelicanReleaseDistance = Math.max(this.maximumPelicanReleaseDistance, event.releaseDistance);
    }
    if (['melee_hit', 'gavel_hit', 'charge_hit', 'flyer_dive_hit', 'projectile_fired', 'pelican_grenade_dropped'].includes(event.type)) {
      this.groupAttackEvents++;
      if (rootId) this._groupAttackers.add(rootId);
    }
    if (event.type === 'projectile_blocked_by_ally') this.projectilesBlockedByAllies++;
    if (event.type === 'heal_attempted' && event.root === targetRoot) this.healingAttempted += Number(event.amount) || 0;
    if (event.type === 'heal_applied' && event.root === targetRoot) {
      const attempted = Number(event.attemptedAmount) || 0;
      const effective = Number(event.effectiveAmount) || 0;
      // heal_attempted is emitted earlier; only use the applied event as fallback.
      if ((this.actionCounts.heal_attempted || 0) === 0) this.healingAttempted += attempted;
      this.effectiveHpRestored += effective;
      if (healerHidden) this.healingWhileHidden += effective;
      if (targetId) this.healTargets[targetId] = (this.healTargets[targetId] || 0) + effective;
    }
  }

  observeTick({
    atMs,
    dt,
    worldVisible,
    stableVisible = worldVisible,
    locomotionClear = true,
    tacticalVisible,
    playerDistance,
    inPreferredBand,
    windupActive,
    charging,
    allyDistance = Infinity,
    bodyPenetrating = allyDistance < 1.1,
    allySide = null,
    insideObstacle = false,
    nearObstacle = false,
    attemptedMove = false,
    movedDistance = 0,
    swarmCount = 0,
    groupSize = 1,
    simultaneousAttackers = 0,
    state = 'idle'
  }) {
    this.tickCount++;
    this.simulationSeconds += dt;
    const horizontalSpeed = movedDistance / Math.max(0.0001, dt);
    this.maximumHorizontalSpeed = Math.max(this.maximumHorizontalSpeed, horizontalSpeed);
    this._horizontalSpeedTotal += horizontalSpeed;
    this.stateDurations[state] = (this.stateDurations[state] || 0) + dt;
    this.closestPlayerDistance = Math.min(this.closestPlayerDistance, playerDistance);
    this.farthestPlayerDistance = Math.max(this.farthestPlayerDistance, playerDistance);
    this.minimumBodyClearance = Math.min(this.minimumBodyClearance, allyDistance);
    this.swarmPeak = Math.max(this.swarmPeak, swarmCount);
    this.groupSizePeak = Math.max(this.groupSizePeak, groupSize);
    this.simultaneousAttackersPeak = Math.max(this.simultaneousAttackersPeak, simultaneousAttackers);
    this.stableVisibleSamples += stableVisible ? 1 : 0;
    this.locomotionClearSamples += locomotionClear ? 1 : 0;
    this.tacticalClearSamples += tacticalVisible ? 1 : 0;
    if (atMs >= 5000) {
      this.positioningGraceSamples++;
      this.postGraceMinimumPlayerDistance = Math.min(this.postGraceMinimumPlayerDistance, playerDistance);
    }
    if (bodyPenetrating) {
      this.bodyOverlapTicks++;
      this._consecutiveBodyPenetrationTicks++;
      this.maxConsecutiveBodyPenetrationTicks = Math.max(this.maxConsecutiveBodyPenetrationTicks, this._consecutiveBodyPenetrationTicks);
    } else {
      this._consecutiveBodyPenetrationTicks = 0;
    }
    if (insideObstacle) this.obstaclePenetrationSamples++;
    if (nearObstacle) {
      this.nearObstacleTicks++;
      if (attemptedMove && movedDistance < 0.002) this.nearObstacleStuckTicks++;
    }

    if (this._lastLos == null) {
      this._lastLos = worldVisible;
      this._lastLosChangeAtMs = atMs;
    } else if (this._lastLos !== worldVisible) {
      const windowMs = atMs - this._lastLosChangeAtMs;
      this.losTransitions++;
      if (windowMs < 450) this.microLosToggles++;
      this.addEvent(atMs, 'los_changed', { visible: worldVisible, stableForMs: round(windowMs, 1) });
      this._lastLos = worldVisible;
      this._lastLosChangeAtMs = atMs;
    }
    if (worldVisible) {
      this._visibleWindowMs += dt * 1000;
      this._hiddenWindowMs = 0;
      this.longestVisibleWindowMs = Math.max(this.longestVisibleWindowMs, this._visibleWindowMs);
    } else {
      this._hiddenWindowMs += dt * 1000;
      this._visibleWindowMs = 0;
      this.longestHiddenWindowMs = Math.max(this.longestHiddenWindowMs, this._hiddenWindowMs);
    }
    if (stableVisible) {
      this._stableVisibleWindowMs += dt * 1000;
      this.longestStableVisibleWindowMs = Math.max(this.longestStableVisibleWindowMs, this._stableVisibleWindowMs);
    } else {
      this._stableVisibleWindowMs = 0;
    }
    if (this._lastStableLos == null) {
      this._lastStableLos = stableVisible;
      this._lastStableLosChangeAtMs = atMs;
    } else if (this._lastStableLos !== stableVisible) {
      const stableWindowMs = atMs - this._lastStableLosChangeAtMs;
      this.stableLosTransitions++;
      if (stableWindowMs < 450) this.microStableLosToggles++;
      this._lastStableLos = stableVisible;
      this._lastStableLosChangeAtMs = atMs;
    }
    if (this._lastTacticalLos != null && this._lastTacticalLos !== tacticalVisible) this.tacticalLosTransitions++;
    this._lastTacticalLos = tacticalVisible;
    if (worldVisible && !tacticalVisible) this.allyBlockedFireSeconds += dt;
    if (stableVisible && tacticalVisible && inPreferredBand) this.firingOpportunitySeconds += dt;

    if (this._lastWindupActive && !windupActive && this.shots === this._lastShotCountForWindup && !charging) {
      this.windupCancellations++;
      this.addEvent(atMs, 'windup_cancelled', { worldVisible, tacticalVisible });
    }
    if (!this._lastWindupActive && windupActive) {
      this._lastShotCountForWindup = this.shots;
      this.addEvent(atMs, 'windup_started');
    }
    if (!this._lastCharging && charging) {
      this.dashCount++;
      this.addEvent(atMs, 'dash_started');
    }
    if (this._lastCharging && !charging) this.addEvent(atMs, 'dash_ended');
    this._lastWindupActive = windupActive;
    this._lastCharging = charging;

    if (bodyPenetrating && allySide != null && this._lastAllySide != null
      && allySide !== this._lastAllySide && allyDistance < 1.2) {
      this.passThroughEvents++;
      this.addEvent(atMs, 'ally_pass_through', { allyDistance: round(allyDistance) });
    }
    if (allySide != null) this._lastAllySide = allySide;
  }

  recordShot(atMs, { worldVisible, tacticalVisible, kind = 'unknown', actorId = null }) {
    this.shots++;
    if (!worldVisible) this.shotsWhileOccluded++;
    if (worldVisible && !tacticalVisible) {
      this.shotsThroughAllies++;
      const actor = actorId || kind || 'unknown';
      this.shotsThroughAlliesByActor[actor] = (this.shotsThroughAlliesByActor[actor] || 0) + 1;
    }
    if (actorId) {
      this._groupShooters.add(actorId);
      this._groupAttackers.add(actorId);
    }
    if (actorId === 'primary') this.targetShots++;
    this.groupAttackEvents++;
    this.addEvent(atMs, 'projectile_fired', { kind, actorId, worldVisible, tacticalVisible });
  }

  recordDamage(atMs, damage, {
    source = 'unknown', worldVisible = true, tacticalVisible = true,
    sourceRoot = null, ownerRoot = null, wardenRoot = null, primaryRoot = null
  } = {}) {
    const amount = Number(damage) || 0;
    const sourceId = source || 'unknown';
    this.damageEvents++;
    this.damageTotal += amount;
    if (sourceRoot && sourceRoot === primaryRoot) {
      this.targetDamageTotal += amount;
      this.targetDamageEvents++;
    }
    this.damageBySource[sourceId] = (this.damageBySource[sourceId] || 0) + amount;
    const ownerId = ownerRoot?.userData?.behaviorId || ownerRoot?.userData?.type || sourceId;
    const sourceActorId = sourceRoot?.userData?.diagnosticActorId || sourceRoot?.userData?.behaviorId || sourceRoot?.userData?.type || null;
    if (sourceActorId) {
      this._groupDamageDealers.add(sourceActorId);
      this._groupAttackers.add(sourceActorId);
    }
    this.damageByOwner[ownerId] = (this.damageByOwner[ownerId] || 0) + amount;
    if (sourceRoot?.userData?.type?.startsWith?.('flyer')) {
      this.childDamageEvents++;
      if (ownerRoot && ownerRoot === wardenRoot) this.childDamageAttributedToWarden++;
    }
    if (!worldVisible) this.damageWhileOccluded += amount;
    if (worldVisible && !tacticalVisible) this.damageWhileTacticallyBlocked += amount;
    if (this.firstDamageAtMs == null) this.firstDamageAtMs = atMs;
    this.lastDamageAtMs = atMs;
    this.addEvent(atMs, 'player_damaged', {
      damage: round(amount), source: sourceId, owner: ownerId, worldVisible, tacticalVisible
    });
  }

  observe({
    atMs, position, playerDistance, visible, stableVisible = visible,
    locomotionClear = true, tacticalVisible = visible, blockingCategory = null,
    selectedTarget = null, tracking, trackingEligible = true, attemptedMove = false,
    allyDistance = Infinity, state = 'idle', speed = 0
  }) {
    const dx = position.x - this._lastPosition.x;
    const dz = position.z - this._lastPosition.z;
    const delta = Math.hypot(dx, dz);
    this.samples++;
    this.visibleSamples += visible ? 1 : 0;
    this.trackingSamples += tracking ? 1 : 0;
    if (trackingEligible) {
      this.engagementTrackingEligibleSamples++;
      this.engagementTrackingSamples += tracking ? 1 : 0;
    }
    this.distanceTravelled += delta;
    this.maxLateralOffset = Math.max(this.maxLateralOffset, Math.abs(position.x - this.startPosition.x));
    this.minAllyDistance = Math.min(this.minAllyDistance, allyDistance);
    this.closestPlayerDistance = Math.min(this.closestPlayerDistance, playerDistance);
    this.farthestPlayerDistance = Math.max(this.farthestPlayerDistance, playerDistance);
    if (attemptedMove && delta < 0.008) this.stuckSamples++;
    if (this.revealedAtMs != null && this.reactionAtMs == null && (delta > 0.025 || this.shots > 0 || this.damageEvents > 0)) {
      this.reactionAtMs = atMs;
      this.addEvent(atMs, 'reaction_detected');
    }
    this.finalPlayerDistance = playerDistance;
    this.footprint.push([
      round(atMs, 1), round(position.x), round(position.z), round(position.y), round(playerDistance), round(speed),
      visible ? 1 : 0, stableVisible ? 1 : 0, locomotionClear ? 1 : 0,
      tacticalVisible ? 1 : 0, blockingCategory, selectedTarget, state
    ]);
    this._lastPosition = { ...position };
  }

  observeGroup(atMs, actors) {
    if (!actors?.length || this.expectedGroupSize <= 1) return;
    this.groupFootprint.push([
      round(atMs, 1),
      ...actors.map(actor => [
        actor.id,
        actor.type,
        round(actor.x),
        round(actor.z),
        round(actor.y),
        round(actor.playerDistance),
        actor.state
      ])
    ]);
  }

  finish() {
    const directDisplacement = Math.hypot(
      this._lastPosition.x - this.startPosition.x,
      this._lastPosition.z - this.startPosition.z
    );
    const result = {
      enemyId: this.enemyId,
      role: this.role,
      scenarioId: this.scenarioId,
      preferredBand: this.preferredBand,
      metrics: {
        samples: this.samples,
        expectedGroupSize: this.expectedGroupSize,
        groupSizePeak: this.groupSizePeak,
        groupMoveAttempts: this.groupMoveAttempts,
        groupBlockedMoveAttempts: this.groupBlockedMoveAttempts,
        groupBlockedMoveRatio: round(this.groupBlockedMoveAttempts / Math.max(1, this.groupMoveAttempts)),
        groupAttackEvents: this.groupAttackEvents,
        uniqueGroupAttackers: this._groupAttackers.size,
        uniqueGroupDamageDealers: this._groupDamageDealers.size,
        uniqueGroupShooters: this._groupShooters.size,
        simultaneousAttackersPeak: this.simultaneousAttackersPeak,
        projectilesBlockedByAllies: this.projectilesBlockedByAllies,
        targetDamageTotal: round(this.targetDamageTotal),
        targetDamageEvents: this.targetDamageEvents,
        targetShots: this.targetShots,
        visibleRatio: round(this.visibleSamples / Math.max(1, this.samples)),
        rawWorldLosRatio: round(this.visibleSamples / Math.max(1, this.samples)),
        stableWorldLosRatio: round(this.stableVisibleSamples / Math.max(1, this.tickCount)),
        locomotionClearRatio: round(this.locomotionClearSamples / Math.max(1, this.tickCount)),
        tacticalFireClearRatio: round(this.tacticalClearSamples / Math.max(1, this.tickCount)),
        trackingRatio: round(this.trackingSamples / Math.max(1, this.samples)),
        engagementTrackingRatio: round(this.engagementTrackingSamples / Math.max(1, this.engagementTrackingEligibleSamples)),
        engagementTrackingSampleCount: this.engagementTrackingEligibleSamples,
        stuckRatio: round(this.stuckSamples / Math.max(1, this.samples)),
        moveAttempts: this.moveAttempts,
        blockedMoveAttempts: this.blockedMoveAttempts,
        requestedMovement: round(this.requestedMovement),
        appliedMovement: round(this.appliedMovement),
        movementBlockers: { ...this.movementBlockers },
        blockerIdentities: { ...this.blockerIdentities },
        distanceTravelled: round(this.distanceTravelled),
        progressToPlayer: round(this.initialPlayerDistance - this.finalPlayerDistance),
        initialPlayerDistance: round(this.initialPlayerDistance),
        finalPlayerDistance: round(this.finalPlayerDistance),
        closestPlayerDistance: round(this.closestPlayerDistance),
        farthestPlayerDistance: round(this.farthestPlayerDistance),
        pathEfficiency: round(this.distanceTravelled / Math.max(0.1, directDisplacement)),
        maxLateralOffset: round(this.maxLateralOffset),
        minAllyDistance: Number.isFinite(this.minAllyDistance) ? round(this.minAllyDistance) : null,
        damageEvents: this.damageEvents,
        damageTotal: round(this.damageTotal),
        damagePerSecond: round(this.damageTotal / Math.max(0.001, this.simulationSeconds)),
        damageBySource: Object.fromEntries(Object.entries(this.damageBySource).map(([source, amount]) => [source, round(amount)])),
        damageByOwner: Object.fromEntries(Object.entries(this.damageByOwner).map(([owner, amount]) => [owner, round(amount)])),
        childDamageEvents: this.childDamageEvents,
        childDamageAttributedToWarden: this.childDamageAttributedToWarden,
        minimumPelicanReleaseDistance: Number.isFinite(this.minimumPelicanReleaseDistance) ? round(this.minimumPelicanReleaseDistance) : null,
        maximumPelicanReleaseDistance: Number.isFinite(this.maximumPelicanReleaseDistance) ? round(this.maximumPelicanReleaseDistance) : null,
        firstDamageAtMs: this.firstDamageAtMs == null ? null : round(this.firstDamageAtMs, 1),
        lastDamageAtMs: this.lastDamageAtMs == null ? null : round(this.lastDamageAtMs, 1),
        damageWhileOccluded: round(this.damageWhileOccluded),
        damageWhileTacticallyBlocked: round(this.damageWhileTacticallyBlocked),
        shots: this.shots,
        shotsWhileOccluded: this.shotsWhileOccluded,
        shotsThroughAllies: this.shotsThroughAllies,
        shotsThroughAlliesByActor: { ...this.shotsThroughAlliesByActor },
        losTransitions: this.losTransitions,
        tacticalLosTransitions: this.tacticalLosTransitions,
        microLosToggles: this.microLosToggles,
        stableLosTransitions: this.stableLosTransitions,
        microStableLosToggles: this.microStableLosToggles,
        longestVisibleWindowMs: round(this.longestVisibleWindowMs, 1),
        longestStableVisibleWindowMs: round(this.longestStableVisibleWindowMs, 1),
        longestHiddenWindowMs: round(this.longestHiddenWindowMs, 1),
        firingOpportunitySeconds: round(this.firingOpportunitySeconds),
        allyBlockedFireSeconds: round(this.allyBlockedFireSeconds),
        windupCancellations: this.windupCancellations,
        dashCount: this.dashCount,
        bodyOverlapRatio: round(this.bodyOverlapTicks / Math.max(1, this.tickCount)),
        maxConsecutiveBodyPenetrationTicks: this.maxConsecutiveBodyPenetrationTicks,
        passThroughEvents: this.passThroughEvents,
        minimumBodyClearance: Number.isFinite(this.minimumBodyClearance) ? round(this.minimumBodyClearance) : null,
        obstaclePenetrationSamples: this.obstaclePenetrationSamples,
        nearObstacleRatio: round(this.nearObstacleTicks / Math.max(1, this.tickCount)),
        nearObstacleStuckRatio: round(this.nearObstacleStuckTicks / Math.max(1, this.nearObstacleTicks)),
        obstacleBypassProgress: round(this.initialPlayerDistance - this.finalPlayerDistance),
        obstaclePlanePassed: this.obstaclePlanePassed,
        validCombatAnchor: this.validCombatAnchor,
        swarmPeak: this.swarmPeak,
        healingAttempted: round(this.healingAttempted),
        effectiveHpRestored: round(this.effectiveHpRestored),
        healingWhileHidden: round(this.healingWhileHidden),
        healTargets: Object.fromEntries(Object.entries(this.healTargets).map(([target, amount]) => [target, round(amount)])),
        positioningGraceSamples: this.positioningGraceSamples,
        postGraceMinimumPlayerDistance: Number.isFinite(this.postGraceMinimumPlayerDistance) ? round(this.postGraceMinimumPlayerDistance) : null,
        simulationSeconds: round(this.simulationSeconds),
        averageHorizontalSpeed: round(this._horizontalSpeedTotal / Math.max(1, this.tickCount)),
        maximumHorizontalSpeed: round(this.maximumHorizontalSpeed),
        netDisplacement: round(directDisplacement),
        stateDurations: Object.fromEntries(Object.entries(this.stateDurations).map(([state, seconds]) => [state, round(seconds)])),
        actionCounts: { ...this.actionCounts },
        timelineOmittedByType: { ...this.timelineOmittedByType },
        pathRequests: this.pathRequests,
        pathCacheHits: this.pathCacheHits,
        pathResolutions: this.pathResolutions,
        pathFailures: this.pathFailures,
        reactionLatencyMs: this.revealedAtMs != null && this.reactionAtMs != null
          ? round(this.reactionAtMs - this.revealedAtMs, 1)
          : null
      },
      footprintLegend: [
        'atMs', 'x', 'z', 'y', 'horizontalPlayerDistance', 'horizontalSpeed',
        'rawWorldLOS', 'stableWorldLOS', 'locomotionClear', 'tacticalFireClear',
        'blockingCategory', 'selectedTargetOrAnchor', 'state'
      ],
      footprint: this.footprint,
      groupFootprintLegend: ['atMs', 'actors:[actorId,type,x,z,y,horizontalPlayerDistance,state]'],
      groupFootprint: this.groupFootprint,
      timeline: this.timeline
    };
    result.assessment = evaluateEnemyReaction(result);
    return result;
  }
}
