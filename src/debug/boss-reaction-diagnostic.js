import { resolveBossBehaviorProfile } from '../bosses/behavior-profiles.js';

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

// Mirrors the production PlayerController movement/stamina values without
// importing player.js (which also imports browser-only pointer-lock controls).
export const BOSS_STAMINA_RUN_PROFILE = Object.freeze({
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

export function createBossStaminaRunState() {
  return {
    stamina: BOSS_STAMINA_RUN_PROFILE.staminaMax,
    minimumStamina: BOSS_STAMINA_RUN_PROFILE.staminaMax,
    mode: 'sprint',
    regenCooldown: 0,
    exhaustionCount: 0,
    sprintSeconds: 0,
    recoverySeconds: 0,
    intendedDistance: 0,
    movementSpeed: BOSS_STAMINA_RUN_PROFILE.walkSpeed * BOSS_STAMINA_RUN_PROFILE.sprintMultiplier
  };
}

export function advanceBossStaminaRun(state, dt) {
  const elapsed = Math.max(0, Number(dt) || 0);
  const balance = BOSS_STAMINA_RUN_PROFILE;
  if (state.mode === 'sprint') {
    const multiplier = state.stamina <= balance.lowStaminaThreshold
      ? balance.lowStaminaSprintMultiplier
      : balance.sprintMultiplier;
    state.movementSpeed = balance.walkSpeed * multiplier;
    state.sprintSeconds += elapsed;
    state.stamina = Math.max(0, state.stamina - balance.staminaDrainPerSecond * elapsed);
    if (state.stamina <= balance.minimumSprintStamina) {
      state.mode = 'recover';
      state.regenCooldown = balance.staminaRegenDelaySeconds;
      state.exhaustionCount++;
    }
  } else {
    state.movementSpeed = balance.walkSpeed;
    state.recoverySeconds += elapsed;
    state.regenCooldown = Math.max(0, state.regenCooldown - elapsed);
    if (state.regenCooldown <= 0) {
      state.stamina = Math.min(balance.staminaMax, state.stamina + balance.staminaRegenPerSecond * elapsed);
      if (state.stamina >= balance.staminaMax) state.mode = 'sprint';
    }
  }
  state.minimumStamina = Math.min(state.minimumStamina, state.stamina);
  state.intendedDistance += state.movementSpeed * elapsed;
  return state.movementSpeed;
}

export function bossReactionScenarioSeed({ bossId, scenarioId, strategyId = null }) {
  const pairingKey = strategyId ? `${bossId}:strategy-pair` : `${bossId}:${scenarioId}`;
  let hash = 2166136261;
  for (const character of pairingKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ 0xb055c0de) >>> 0;
}

const profile = (definition) => Object.freeze({
  trackingRequired: false,
  directLineAttacks: false,
  phaseTrigger: null,
  contactRole: 'ranged_controller',
  minimumAuxiliaries: 0,
  maximumAuxiliaries: 12,
  rangeRecoverySeconds: 6,
  recoveryStallSeconds: 12,
  scenarios: [],
  ...definition
});

export const BOSS_BEHAVIOR_PROFILES = Object.freeze({
  broodmaker: profile({
    id: 'broodmaker', label: 'Broodmaker', wave: 5, spawnDistance: 22,
    trackingRequired: true, minimumAuxiliaries: 3, maximumAuxiliaries: 10,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'summon_coordination', 'recovery_loop', 'relay_district_arena', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  sanitizer: profile({
    id: 'sanitizer', label: 'Commissioner Sanitizer', wave: 10, spawnDistance: 24,
    trackingRequired: true, directLineAttacks: true, phaseTrigger: 'remove_suppression_nodes',
    minimumAuxiliaries: 3, maximumAuxiliaries: 12,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'summon_coordination', 'objective_gating', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  captain: profile({
    id: 'captain', label: 'Influencer Captain', wave: 15, spawnDistance: 24,
    trackingRequired: true, directLineAttacks: true, phaseTrigger: 'hp_55',
    rangeRecoverySeconds: 8,
    minimumAuxiliaries: 0, maximumAuxiliaries: 8,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'rare_ability', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  shard: profile({
    id: 'shard', label: 'Algorithm Shard Avatar', wave: 20, spawnDistance: 24,
    directLineAttacks: true, phaseTrigger: 'hp_55', minimumAuxiliaries: 0, maximumAuxiliaries: 4,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  broodmaker_heavy: profile({
    id: 'broodmaker_heavy', label: 'Broodmaker Prime', wave: 25, spawnDistance: 22,
    trackingRequired: true, phaseTrigger: 'hp_55', minimumAuxiliaries: 3, maximumAuxiliaries: 10,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  hydraclone: profile({
    id: 'hydraclone', label: 'Echo Hydraclone', wave: 30, spawnDistance: 18,
    trackingRequired: true, contactRole: 'melee', phaseTrigger: 'hp_65', minimumAuxiliaries: 1, maximumAuxiliaries: 36,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  adjudicator: profile({
    id: 'adjudicator', label: 'Strike Adjudicator', wave: 35, spawnDistance: 20,
    trackingRequired: true, contactRole: 'hybrid', phaseTrigger: 'hp_55', minimumAuxiliaries: 1, maximumAuxiliaries: 10,
    recoveryStallSeconds: 15,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  }),
  algorithm: profile({
    id: 'algorithm', label: 'The Algorithm', wave: 40, spawnDistance: 8,
    contactRole: 'anchor', directLineAttacks: true, phaseTrigger: 'solve_control', minimumAuxiliaries: 3, maximumAuxiliaries: 4,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'final_phase', 'summon_coordination', 'objective_gating', 'recovery_loop', 'strategy_shoot', 'strategy_run', 'strategy_run_stamina', 'strategy_hide']
  })
});

export const BOSS_REACTION_ARCHETYPES = Object.freeze(Object.values(BOSS_BEHAVIOR_PROFILES));

export const BOSS_PLAYER_STRATEGIES = Object.freeze([
  Object.freeze({
    id: 'shoot', label: 'Shoot + strafe', fireIntervalSeconds: 0.4, shotDamage: 50,
    description: 'Continuously strafe at combat range, prioritize encounter objectives, and fire a fixed 125-DPS test weapon.'
  }),
  Object.freeze({
    id: 'run', label: 'Run / evade · unlimited', stressOnly: true,
    description: 'Run indefinitely above production sprint speed as a deliberate worst-case kiting stress test.'
  }),
  Object.freeze({
    id: 'run_stamina', label: 'Run / evade · stamina', stressOnly: false,
    description: 'Sprint at production speed until exhausted, release sprint through the regeneration delay, recover fully, and resume.'
  }),
  Object.freeze({
    id: 'hide', label: 'Hide + peek', obstacleKind: 'boss_wall',
    description: 'Use a solid obstacle, briefly peek around its edges, and measure cover denial and flanking pressure.'
  })
]);

const STRATEGY_BY_ID = Object.freeze(Object.fromEntries(BOSS_PLAYER_STRATEGIES.map(item => [item.id, item])));

export const BOSS_REACTION_SCENARIOS = Object.freeze([
  { id: 'attack_cadence', label: 'Attack cadence', durationSeconds: 20, description: 'Exercise the core attack loop, telegraphs, damage, and recovery.' },
  { id: 'moving_player', label: 'Moving-player response', durationSeconds: 20, movingPlayer: true, description: 'Track or pattern around a strafing player without becoming inactive.' },
  { id: 'close_pressure', label: 'Close-range pressure', durationSeconds: 16, closeAtSeconds: 4, description: 'Respond when the player closes without prolonged body overlap.' },
  { id: 'cover_response', label: 'Player behind cover', durationSeconds: 18, obstacleKind: 'boss_wall', description: 'Direct line attacks must respect world cover.' },
  { id: 'phase_transition', label: 'Phase transition', durationSeconds: 14, triggerAtSeconds: 2.5, description: 'Exercise the real phase gate and confirm the combat state changes.' },
  { id: 'final_phase', label: 'Phase 3 · Collapse', durationSeconds: 16, triggerAtSeconds: 2.5, finalTriggerAtSeconds: 6.5, description: 'Advance Algorithm through Control and Paradox, then exercise Coherence Collapse attacks.' },
  { id: 'rare_ability', label: 'Rare ability coverage', durationSeconds: 12, benchmarkCoverage: true, description: 'Arm an infrequent production ability and verify its complete telegraph, release, and resolution lifecycle.' },
  { id: 'summon_coordination', label: 'Adds and objectives', durationSeconds: 24, description: 'Spawn or maintain encounter auxiliaries without exceeding the boss cap.' },
  { id: 'objective_gating', label: 'Objective damage gate', durationSeconds: 10, description: 'Locked damage is rejected and solving the objective opens boss damage.' },
  { id: 'recovery_loop', label: 'Long recovery loop', durationSeconds: 30, movingPlayer: true, description: 'Complete multiple attack cycles without freezing in an active state.' },
  {
    id: 'relay_district_arena',
    label: 'Level 1 · Relay District',
    durationSeconds: 32,
    arenaId: 'relay-district',
    description: 'Run Broodmaker through the production Level 1 collision layout, player route, ranged positioning, and minion-screen placement.'
  },
  { id: 'strategy_shoot', label: 'Strategy benchmark', strategyId: 'shoot', durationSeconds: 24, phaseTriggerAtSeconds: 8, finalPhaseTriggerAtSeconds: 16, description: STRATEGY_BY_ID.shoot.description },
  { id: 'strategy_run', label: 'Strategy benchmark', strategyId: 'run', durationSeconds: 24, phaseTriggerAtSeconds: 8, finalPhaseTriggerAtSeconds: 16, description: STRATEGY_BY_ID.run.description },
  { id: 'strategy_run_stamina', label: 'Strategy benchmark', strategyId: 'run_stamina', durationSeconds: 24, phaseTriggerAtSeconds: 8, finalPhaseTriggerAtSeconds: 16, description: STRATEGY_BY_ID.run_stamina.description },
  { id: 'strategy_hide', label: 'Strategy benchmark', strategyId: 'hide', durationSeconds: 24, phaseTriggerAtSeconds: 8, finalPhaseTriggerAtSeconds: 16, obstacleKind: 'boss_wall', description: STRATEGY_BY_ID.hide.description }
]);

export function isBossScenarioApplicable(bossId, scenarioId) {
  return BOSS_BEHAVIOR_PROFILES[bossId]?.scenarios.includes(scenarioId) || false;
}

export function buildBossReactionMatrix({ boss = null, scenario = null, strategy = null, includeNotApplicable = false } = {}) {
  const bosses = boss ? BOSS_REACTION_ARCHETYPES.filter(item => item.id === boss) : BOSS_REACTION_ARCHETYPES;
  const scenarios = BOSS_REACTION_SCENARIOS.filter(item => {
    if (scenario && item.id !== scenario) return false;
    if (strategy === 'all') return !!item.strategyId || item.benchmarkCoverage === true;
    if (strategy) return item.strategyId === strategy;
    return !item.strategyId;
  });
  return bosses.flatMap(archetype => scenarios.flatMap(definition => {
    const applicable = isBossScenarioApplicable(archetype.id, definition.id);
    if (!applicable && !includeNotApplicable) return [];
    return [{
      id: `${archetype.id}__${definition.id}`,
      archetype,
      applicable,
      scenario: definition,
      strategy: definition.strategyId ? STRATEGY_BY_ID[definition.strategyId] : null
    }];
  }));
}

function finding(code, severity, message, evidence = {}) {
  return { code, severity, message, evidence };
}

export function evaluateBossReaction(result) {
  const { bossId, scenarioId, metrics = {} } = result;
  const contract = BOSS_BEHAVIOR_PROFILES[bossId];
  if (!contract || !isBossScenarioApplicable(bossId, scenarioId)) {
    return {
      status: 'not_applicable',
      findings: [finding('scenario_not_applicable', 'not_applicable', 'This scenario is outside the boss behavior contract.', { bossId, scenarioId })],
      summary: 'Not applicable'
    };
  }

  const findings = [];
  const bossActionEvents = metrics.bossActionEvents ?? metrics.actionEvents ?? 0;
  const bossDamageEvents = metrics.bossDamageEvents ?? metrics.damageEvents ?? 0;
  const attackEvidence = (metrics.attackStarts || 0) + bossActionEvents + bossDamageEvents;

  if ((metrics.simulationSeconds || 0) <= 0) {
    findings.push(finding('scenario_not_exercised', 'inconclusive', 'No boss simulation time was recorded.'));
  }
  if ((metrics.duplicateUpdateTicks || 0) > 0) {
    findings.push(finding('boss_updated_multiple_times', 'fail', 'The active boss updated more than once during a simulation tick.', {
      duplicateUpdateTicks: metrics.duplicateUpdateTicks,
      maximumUpdatesPerTick: metrics.maximumUpdatesPerTick
    }));
  }
  if ((metrics.auxiliariesPeak || 0) > contract.maximumAuxiliaries) {
    findings.push(finding('boss_auxiliary_cap_exceeded', 'fail', 'The boss exceeded its encounter-specific auxiliary cap.', {
      auxiliariesPeak: metrics.auxiliariesPeak,
      maximumAuxiliaries: contract.maximumAuxiliaries,
      auxiliaryTypes: metrics.auxiliaryTypes
    }));
  }
  if ((metrics.maxConsecutiveSelfOwnedBlockTicks || 0) > 30) {
    findings.push(finding(
      bossId === 'adjudicator' ? 'adjudicator_trapped_by_citation_mines' : 'boss_trapped_by_owned_auxiliary',
      'fail',
      bossId === 'adjudicator'
        ? 'Strike Adjudicator was movement-blocked by its own citation mines for more than half a second.'
        : 'The boss was movement-blocked by one of its own auxiliaries for more than half a second.',
      {
        maxConsecutiveSelfOwnedBlockTicks: metrics.maxConsecutiveSelfOwnedBlockTicks,
        selfOwnedBlockTicks: metrics.selfOwnedBlockTicks,
        movementBlockerTypes: metrics.movementBlockerTypes
      }
    ));
  }
  const penetrationTicks = metrics.maxConsecutivePenetrationTicks ?? metrics.maxConsecutiveOverlapTicks ?? 0;
  if (penetrationTicks > 1) {
    findings.push(finding('boss_player_body_penetration', 'fail', 'Boss and player solid bodies penetrated for more than one simulation tick.', {
      penetrationRatio: metrics.penetrationRatio ?? metrics.overlapRatio,
      maxConsecutivePenetrationTicks: penetrationTicks,
      closestPlayerDistance: metrics.closestPlayerDistance,
      fixtureCollisionCorrections: metrics.fixtureCollisionCorrections || 0,
      footprintReference: 'result.footprint'
    }));
  }

  if (scenarioId === 'attack_cadence') {
    if (attackEvidence <= 0) {
      findings.push(finding('boss_attack_loop_inactive', 'fail', 'The boss completed no observable attack activity during the cadence window.'));
    } else if (bossDamageEvents === 0 && !((bossId === 'broodmaker' || bossId === 'broodmaker_heavy') && (metrics.auxiliaryDamageEvents || 0) > 0)) {
      findings.push(finding('boss_attack_damage_not_exercised', 'warn', 'Attack states were observed, but the stationary target received no damage.', { attackEvidence }));
    }
    if (bossDamageEvents > 0 && (metrics.telegraphStarts || 0) === 0 && (metrics.bossTelegraphEvents || 0) === 0) {
      findings.push(finding('boss_telegraph_missing', 'warn', 'Boss damage occurred without an observable telegraph state.', {
        bossDamageEvents,
        bossActionCounts: metrics.bossActionCounts || metrics.actionCounts
      }));
    } else if ((metrics.bossUntelegraphedDamageEvents ?? metrics.untelegraphedDamageEvents ?? 0) > 0) {
      findings.push(finding('boss_damage_without_recent_telegraph', 'fail', 'Damage occurred outside the recorded telegraph-response window.', {
        untelegraphedDamageEvents: metrics.bossUntelegraphedDamageEvents ?? metrics.untelegraphedDamageEvents,
        telegraphStarts: metrics.telegraphStarts
      }));
    }
  }

  if (bossId === 'adjudicator') {
    const bossCounts = metrics.bossActionCounts || metrics.actionCounts || {};
    if ((bossCounts.citation_applied || 0) <= 0 || (bossCounts.citation_mine_spawned || 0) <= 0) {
      findings.push(finding('adjudicator_citation_not_exercised', 'inconclusive', 'No complete citation mine placement was observed.', {
        citationApplied: bossCounts.citation_applied || 0,
        citationMinesSpawned: bossCounts.citation_mine_spawned || 0
      }));
    }
    if (['attack_cadence', 'moving_player', 'recovery_loop'].includes(scenarioId)
      && (bossCounts.verdict_released || 0) <= 0) {
      findings.push(finding('adjudicator_verdict_not_released', 'fail', 'The Adjudicator did not release a verdict during the combat opportunity.', {
        verdictStarts: bossCounts.verdict_started || 0,
        verdictReleases: bossCounts.verdict_released || 0
      }));
    }
  }

  if (scenarioId === 'moving_player') {
    if (attackEvidence <= 0) findings.push(finding('moving_target_no_response', 'fail', 'The moving player produced no boss attack response.'));
    if (contract.trackingRequired && (metrics.trackingRatio || 0) < 0.2) {
      findings.push(finding('boss_tracking_weak', 'warn', 'The boss faced the moving player in too few samples.', { trackingRatio: metrics.trackingRatio || 0 }));
    }
  }

  if (scenarioId === 'close_pressure' && attackEvidence <= 0 && (metrics.distanceTravelled || 0) < 0.5) {
    findings.push(finding('close_pressure_no_response', 'fail', 'The boss neither attacked nor repositioned after the player closed.'));
  }
  if (scenarioId === 'close_pressure' && contract.contactRole === 'ranged_controller') {
    const hasRecoveryTelemetry = typeof metrics.recoveredPreferredDistance === 'boolean';
    const recovered = hasRecoveryTelemetry
      ? metrics.recoveredPreferredDistance && (metrics.finalPlayerDistance || 0) >= (metrics.preferredMinimumDistance || 0)
      : (metrics.maxConsecutiveTooCloseTicks || 0) <= 180;
    const recoverySeconds = metrics.timeToRecoverPreferredDistance;
    if (!recovered) {
      findings.push(finding('ranged_boss_failed_to_recover_distance', 'fail', 'The ranged boss did not re-establish its minimum working distance during the pressure window.', {
        preferredMinimumDistance: metrics.preferredMinimumDistance,
        finalPlayerDistance: metrics.finalPlayerDistance,
        timeToRecoverPreferredDistance: recoverySeconds,
        tooCloseRatio: metrics.tooCloseRatio,
        maxConsecutiveTooCloseTicks: metrics.maxConsecutiveTooCloseTicks,
        footprintReference: 'result.footprint'
      }));
    } else if (Number.isFinite(recoverySeconds) && recoverySeconds > contract.rangeRecoverySeconds) {
      findings.push(finding('ranged_boss_recovery_slow', 'warn', 'The ranged boss recovered its working distance, but slower than its role target.', {
        timeToRecoverPreferredDistance: recoverySeconds,
        targetRecoverySeconds: contract.rangeRecoverySeconds,
        finalPlayerDistance: metrics.finalPlayerDistance
      }));
    }
  }

  if (scenarioId === 'cover_response') {
    if ((metrics.worldBlockedSeconds || 0) < 2) {
      findings.push(finding('cover_not_exercised', 'inconclusive', 'World cover did not block the boss-player line long enough to judge this case.', {
        worldBlockedSeconds: metrics.worldBlockedSeconds || 0
      }));
    }
    if ((metrics.damageThroughWorld || 0) > 0) {
      findings.push(finding('boss_damage_through_cover', 'fail', 'A direct-line boss attack damaged the player through solid world cover.', {
        damageThroughWorld: metrics.damageThroughWorld,
        damageThroughWorldEvents: metrics.damageThroughWorldEvents,
        damageThroughWorldBySourceKind: metrics.damageThroughWorldBySourceKind
      }));
    }
    if ((metrics.projectileFiresWhileWorldBlocked || 0) > 0) {
      findings.push(finding('projectile_fired_through_cover', 'fail', 'A boss or owned ranged unit fired a projectile while solid world cover blocked its target line.', {
        projectileFiresWhileWorldBlocked: metrics.projectileFiresWhileWorldBlocked,
        blockedFireBySourceType: metrics.blockedFireBySourceType
      }));
    }
  }

  if (scenarioId === 'relay_district_arena') {
    if (!metrics.arenaLoaded || metrics.arenaId !== 'relay-district') {
      findings.push(finding('relay_arena_not_loaded', 'inconclusive', 'The production Relay District fixture was not loaded, so Broodmaker cannot be judged in Level 1.', {
        arenaId: metrics.arenaId || null,
        arenaColliderCount: metrics.arenaColliderCount || 0
      }));
    } else {
      if (!metrics.arenaRouteCompleted) {
        findings.push(finding('relay_player_route_not_completed', 'inconclusive', 'The authored player route did not visit every Relay District test position.', {
          routeStopsVisited: metrics.arenaRouteStopsVisited || 0,
          routeStopsPlanned: metrics.arenaRouteStopsPlanned || 0
        }));
      }
      if ((metrics.arenaInvalidRouteStops || 0) > 0) {
        findings.push(finding('relay_fixture_route_inside_world', 'fail', 'A diagnostic player stop overlaps production Level 1 collision and invalidates that combat opportunity.', {
          arenaInvalidRouteStops: metrics.arenaInvalidRouteStops
        }));
      }
      if ((metrics.arenaBossOutOfBoundsTicks || 0) > 1 || (metrics.arenaPlayerOutOfBoundsTicks || 0) > 1) {
        findings.push(finding('relay_actor_left_playable_bounds', 'fail', 'The boss or diagnostic player left the Relay District playable bounds.', {
          arenaBossOutOfBoundsTicks: metrics.arenaBossOutOfBoundsTicks || 0,
          arenaPlayerOutOfBoundsTicks: metrics.arenaPlayerOutOfBoundsTicks || 0,
          arenaBounds: metrics.arenaBounds
        }));
      }
      if ((metrics.arenaAuxiliaryPlacementIssues || 0) > 0) {
        findings.push(finding('relay_brood_add_placement_invalid', 'fail', 'A Broodmaker add spawned outside Level 1 or inside authored collision.', {
          arenaAuxiliaryPlacementIssues: metrics.arenaAuxiliaryPlacementIssues,
          arenaAuxiliaryPlacementDetails: metrics.arenaAuxiliaryPlacementDetails,
          auxiliaryTypes: metrics.auxiliaryTypes
        }));
      }
      if ((metrics.broodWallSpawnEvents || 0) < contract.minimumAuxiliaries) {
        findings.push(finding('relay_brood_screen_not_formed', 'fail', 'Broodmaker did not create a complete minion screen in the authored Level 1 arena.', {
          broodWallSpawnEvents: metrics.broodWallSpawnEvents || 0,
          minimumWallBodies: contract.minimumAuxiliaries,
          auxiliariesPeak: metrics.auxiliariesPeak || 0
        }));
      } else if ((metrics.broodWallBetweenRatio || 0) < 0.75) {
        findings.push(finding('relay_brood_screen_mispositioned', 'fail', 'Too many Broodmaker adds spawned outside the space between the boss and player.', {
          broodWallSpawnEvents: metrics.broodWallSpawnEvents,
          broodWallBetweenRatio: metrics.broodWallBetweenRatio
        }));
      }
      if ((metrics.arenaWorkingRangeTicks || 0) <= 0) {
        findings.push(finding('relay_broodmaker_never_established_range', 'fail', 'Broodmaker never established its production working range in the Level 1 layout.', {
          initialPlayerDistance: metrics.initialPlayerDistance,
          closestPlayerDistance: metrics.closestPlayerDistance,
          finalPlayerDistance: metrics.finalPlayerDistance
        }));
      } else if ((metrics.arenaWorkingRangeRatio || 0) < 0.2) {
        findings.push(finding('relay_broodmaker_range_uptime_low', 'warn', 'Broodmaker established its working range, but occupied it for too little of the authored route.', {
          arenaWorkingRangeRatio: metrics.arenaWorkingRangeRatio,
          arenaVisibleWorkingRangeRatio: metrics.arenaVisibleWorkingRangeRatio
        }));
      }
      if ((metrics.maxConsecutiveMovementBlockedTicks || 0) > 240) {
        findings.push(finding('relay_broodmaker_navigation_stalled', 'fail', 'Broodmaker remained movement-blocked in Level 1 for more than four consecutive seconds.', {
          maxConsecutiveMovementBlockedTicks: metrics.maxConsecutiveMovementBlockedTicks,
          movementBlockedRatio: metrics.movementBlockedRatio,
          movementBlockerTypes: metrics.movementBlockerTypes
        }));
      } else if ((metrics.maxConsecutiveMovementBlockedTicks || 0) > 120 || (metrics.movementBlockedRatio || 0) > 0.25) {
        findings.push(finding('relay_broodmaker_navigation_constrained', 'warn', 'Broodmaker completed the route but spent excessive time constrained by Level 1 collision or its minion screen.', {
          maxConsecutiveMovementBlockedTicks: metrics.maxConsecutiveMovementBlockedTicks,
          movementBlockedRatio: metrics.movementBlockedRatio,
          movementBlockerTypes: metrics.movementBlockerTypes
        }));
      }
    }
  }

  if (scenarioId === 'phase_transition') {
    if (!metrics.phaseTriggerApplied) {
      findings.push(finding('phase_trigger_not_exercised', 'inconclusive', 'The phase transition fixture was never applied.'));
    } else if ((metrics.phaseTransitions || 0) <= 0 && (metrics.phaseLabelTransitions || 0) <= 0) {
      findings.push(finding('boss_phase_did_not_transition', 'fail', 'The boss did not change phase or phase label after its contract trigger.', {
        phasesSeen: metrics.phasesSeen,
        phaseLabelsSeen: metrics.phaseLabelsSeen
      }));
    }
  }

  if (scenarioId === 'final_phase') {
    if (!metrics.finalPhaseTriggerApplied) {
      findings.push(finding('final_phase_trigger_not_exercised', 'inconclusive', 'The final-phase fixture was never applied.'));
    } else if (!(metrics.phasesSeen || []).includes(3)) {
      findings.push(finding('algorithm_collapse_not_reached', 'fail', 'Algorithm never entered Coherence Collapse.', {
        phasesSeen: metrics.phasesSeen,
        phaseLabelsSeen: metrics.phaseLabelsSeen
      }));
    }
    const abilityStarts = metrics.abilityStartsByAbility || metrics.abilityStarts || {};
    if ((abilityStarts.algorithm_collapse_ring || 0) <= 0) {
      findings.push(finding('algorithm_collapse_ring_not_exercised', 'fail', 'Phase 3 did not start a Collapse Ring during the coverage window.', {
        abilityStarts
      }));
    }
  }

  if (scenarioId === 'summon_coordination' && (metrics.auxiliariesPeak || 0) < contract.minimumAuxiliaries) {
    const opportunityApplied = metrics.summonOpportunityApplied ?? !contract.phaseTrigger;
    findings.push(finding(
      opportunityApplied ? 'boss_auxiliaries_not_exercised' : 'boss_summon_opportunity_not_exercised',
      opportunityApplied ? 'fail' : 'inconclusive',
      opportunityApplied
        ? 'The required boss adds or encounter objectives were not present.'
        : 'The boss summon gate was never exercised, so add behavior cannot be judged.',
      {
        auxiliariesPeak: metrics.auxiliariesPeak || 0,
        minimumAuxiliaries: contract.minimumAuxiliaries,
        auxiliaryTypes: metrics.auxiliaryTypes
      }
    ));
  }
  if (scenarioId === 'summon_coordination' && (bossId === 'broodmaker' || bossId === 'broodmaker_heavy')) {
    if ((metrics.broodWallSpawnEvents || 0) < contract.minimumAuxiliaries) {
      findings.push(finding('brood_wall_not_formed', 'fail', 'Broodmaker did not create a full minion screen between itself and the player.', {
        broodWallSpawnEvents: metrics.broodWallSpawnEvents || 0,
        minimumWallBodies: contract.minimumAuxiliaries
      }));
    } else if ((metrics.broodWallBetweenRatio || 0) < 0.75) {
      findings.push(finding('brood_wall_mispositioned', 'fail', 'Too many Broodmaker adds spawned outside the boss-player screen.', {
        broodWallBetweenRatio: metrics.broodWallBetweenRatio
      }));
    }
  }

  if (scenarioId === 'objective_gating') {
    if (!metrics.objectiveGateTested) {
      findings.push(finding('objective_gate_not_exercised', 'inconclusive', 'The locked-damage probe was not executed.'));
    } else if ((metrics.lockedDamageAccepted || 0) > 0.01) {
      findings.push(finding('objective_gate_leaks_damage', 'fail', 'Boss HP decreased while its objective damage gate was locked.', {
        lockedDamageAccepted: metrics.lockedDamageAccepted
      }));
    }
    if (!metrics.objectiveUnlockTested) {
      findings.push(finding('objective_unlock_not_exercised', 'inconclusive', 'The post-objective damage probe was not executed.'));
    } else if ((metrics.unlockedDamageAccepted || 0) <= 0.01) {
      findings.push(finding('objective_gate_did_not_open', 'fail', 'Boss HP still rejected damage after the objective was solved.', {
        unlockedDamageAccepted: metrics.unlockedDamageAccepted
      }));
    }
  }

  if (scenarioId === 'recovery_loop') {
    if (attackEvidence < 2) {
      findings.push(finding('boss_recovery_loop_inactive', 'fail', 'The long run did not complete enough observable attack cycles.', { attackEvidence }));
    }
    if ((metrics.longestNoActionSeconds || 0) > contract.recoveryStallSeconds) {
      findings.push(finding('boss_recovery_stall', 'fail', 'The boss spent too long without attacking or changing combat state.', {
        longestNoActionSeconds: metrics.longestNoActionSeconds,
        allowedNoActionSeconds: contract.recoveryStallSeconds,
        finalState: metrics.finalState,
        distanceTravelled: metrics.distanceTravelled,
        bossActionCounts: metrics.bossActionCounts || metrics.actionCounts
      }));
    }
  }

  if (scenarioId === 'rare_ability' && bossId === 'captain') {
    const starts = metrics.abilityStartsByAbility || {};
    const releases = metrics.abilityReleasesByAbility || {};
    const outcomes = metrics.abilityOutcomesByAbility || {};
    if ((starts.captain_cluster_rocket || 0) <= 0) {
      findings.push(finding('captain_cluster_rocket_not_started', 'fail', 'The armed rare-ability fixture never started Captain\'s cluster rocket.'));
    } else if ((releases.captain_cluster_rocket || 0) <= 0) {
      findings.push(finding('captain_cluster_rocket_not_released', 'fail', 'Captain started the cluster rocket but never released its eight submunitions.'));
    } else if ((outcomes.captain_cluster_rocket || 0) < 8) {
      findings.push(finding('captain_cluster_rocket_incomplete', 'fail', 'Fewer than eight cluster outcomes resolved.', {
        resolvedClusters: outcomes.captain_cluster_rocket || 0,
        expectedClusters: 8
      }));
    }
  }

  if (scenarioId.startsWith('strategy_')) {
    if (attackEvidence <= 0) {
      findings.push(finding('strategy_benchmark_no_boss_pressure', 'fail', 'The boss produced no observable attack pressure during the player-strategy benchmark.'));
    }
    if (metrics.strategyId === 'shoot') {
      if ((metrics.playerShotAttempts || 0) <= 0) {
        findings.push(finding('shoot_strategy_not_exercised', 'inconclusive', 'The benchmark player never attempted a shot.'));
      } else if ((metrics.playerShotHits || 0) <= 0) {
        findings.push(finding('shoot_strategy_no_hits', 'inconclusive', 'The benchmark player fired but never established a valid target line.'));
      }
    }
    if ((metrics.strategyId === 'run' || metrics.strategyId === 'run_stamina')
      && (metrics.playerDistanceTravelled || 0) < 20) {
      findings.push(finding('run_strategy_not_exercised', 'inconclusive', 'The benchmark player did not travel far enough to exercise pursuit behavior.', {
        playerDistanceTravelled: metrics.playerDistanceTravelled || 0
      }));
    }
    if (metrics.strategyId === 'hide') {
      if ((metrics.playerHiddenSeconds || 0) < 6) {
        findings.push(finding('hide_strategy_not_exercised', 'inconclusive', 'The obstacle did not block the player-boss line long enough to benchmark cover behavior.', {
          playerHiddenSeconds: metrics.playerHiddenSeconds || 0
        }));
      }
      if ((metrics.damageThroughWorld || 0) > 0) {
        findings.push(finding('strategy_damage_through_cover', 'fail', 'Direct-line damage reached the hiding player through solid cover.', {
          damageThroughWorld: metrics.damageThroughWorld,
          damageThroughWorldEvents: metrics.damageThroughWorldEvents
        }));
      }
      if ((metrics.projectileFiresWhileWorldBlocked || 0) > 0) {
        findings.push(finding('strategy_projectile_fired_through_cover', 'fail', 'A boss or owned ranged unit fired while solid cover blocked its target line.', {
          projectileFiresWhileWorldBlocked: metrics.projectileFiresWhileWorldBlocked,
          blockedFireBySourceType: metrics.blockedFireBySourceType
        }));
      }
    }
    if (metrics.strategyPhaseCoverageRequired) {
      if (!metrics.phaseTriggerApplied) {
        findings.push(finding('strategy_phase_trigger_not_exercised', 'fail', 'The phase-aware benchmark never applied its production phase gate.'));
      } else if ((metrics.phaseTransitions || 0) <= 0 && (metrics.phaseLabelTransitions || 0) <= 0) {
        findings.push(finding('strategy_phase_not_observed', 'fail', 'The boss did not visibly enter its later phase after the benchmark gate.', {
          phasesSeen: metrics.phasesSeen,
          phaseLabelsSeen: metrics.phaseLabelsSeen
        }));
      }
      if (bossId === 'algorithm' && (!metrics.finalPhaseTriggerApplied || !(metrics.phasesSeen || []).includes(3))) {
        findings.push(finding('strategy_algorithm_collapse_not_observed', 'fail', 'The strategy benchmark did not reach Algorithm Phase 3.', {
          finalPhaseTriggerApplied: !!metrics.finalPhaseTriggerApplied,
          phasesSeen: metrics.phasesSeen
        }));
      }
    }
    const starts = metrics.abilityStartsByAbility || {};
    if (bossId === 'broodmaker_heavy' && metrics.phaseTriggerApplied
      && (starts.broodmaker_toxic_goo || 0) <= 0) {
      findings.push(finding('strategy_toxic_goo_not_exercised', 'fail', 'Heavy Broodmaker entered Phase 2 without starting toxic goo.'));
    }
    if (bossId === 'algorithm' && metrics.finalPhaseTriggerApplied
      && (starts.algorithm_collapse_ring || 0) <= 0) {
      findings.push(finding('strategy_collapse_ring_not_exercised', 'fail', 'Algorithm reached Phase 3 without starting a Collapse Ring.'));
    }
    if ((metrics.damageEvents || 0) <= 0 && metrics.strategyId !== 'run'
      && !findings.some(item => item.severity === 'fail' || item.severity === 'inconclusive')) {
      findings.push(finding('strategy_no_player_damage_observed', 'warn', 'The boss produced attack activity but dealt no damage to this player strategy.', {
        strategyId: metrics.strategyId,
        bossActionEvents: metrics.bossActionEvents || 0,
        playerDistanceTravelled: metrics.playerDistanceTravelled || 0
      }));
    }
  }

  const rank = { fail: 3, warn: 2, inconclusive: 1, not_applicable: 0 };
  let status = 'pass';
  for (const item of findings) {
    if ((rank[item.severity] || 0) > (rank[status] || 0)) status = item.severity;
  }
  return {
    status,
    findings,
    summary: status === 'pass' ? 'Healthy' : findings.find(item => item.severity === status)?.message || status
  };
}

const BOSS_ROOT_TYPE_BY_ID = Object.freeze({
  broodmaker: 'boss_broodmaker',
  sanitizer: 'boss_sanitizer',
  captain: 'boss_captain',
  shard: 'boss_shard',
  broodmaker_heavy: 'boss_broodmaker_heavy',
  hydraclone: 'boss_hydraclone',
  adjudicator: 'boss_strike_adjudicator',
  algorithm: 'boss_algorithm'
});

export class BossReactionMetrics {
  constructor({
    bossId, scenarioId, strategyId = null, startPosition, playerStartPosition = null,
    initialPlayerDistance, initialBossHp = null, initialAuxiliaries = 0, preferredMinimumDistance = null
  }) {
    this.bossId = bossId;
    this.scenarioId = scenarioId;
    this.strategyId = strategyId;
    this.startPosition = { ...startPosition };
    this.playerStartPosition = playerStartPosition ? { ...playerStartPosition } : null;
    this.initialPlayerDistance = initialPlayerDistance;
    this.initialBossHp = Math.max(0, Number(initialBossHp) || 0);
    this.finalBossHp = this.initialBossHp;
    this.strategyPhaseHpAdjustment = 0;
    this.initialAuxiliaries = initialAuxiliaries;
    const productionProfile = resolveBossBehaviorProfile(BOSS_ROOT_TYPE_BY_ID[bossId]);
    this.preferredMinimumDistance = preferredMinimumDistance ?? productionProfile?.preferredRange?.[0] ?? 0;
    this.simulationSeconds = 0;
    this.distanceTravelled = 0;
    this.closestPlayerDistance = Infinity;
    this.finalPlayerDistance = initialPlayerDistance;
    this.recoveredPreferredDistance = false;
    this.timeToRecoverPreferredDistance = null;
    this._preferredRangeBreachAtMs = null;
    this.trackingSamples = 0;
    this.sampleCount = 0;
    this.playerOverlapTicks = 0;
    this._consecutiveOverlapTicks = 0;
    this.maxConsecutiveOverlapTicks = 0;
    this.playerPenetrationTicks = 0;
    this._consecutivePenetrationTicks = 0;
    this.maxConsecutivePenetrationTicks = 0;
    this.tooCloseTicks = 0;
    this._consecutiveTooCloseTicks = 0;
    this.maxConsecutiveTooCloseTicks = 0;
    this.worldBlockedSeconds = 0;
    this.playerVisibleSeconds = 0;
    this.playerHiddenSeconds = 0;
    this.playerDistanceTravelled = 0;
    this.strategyMovementMode = strategyId === 'run' ? 'unlimited_stress'
      : strategyId === 'run_stamina' ? 'stamina_managed' : null;
    this.strategyIntendedDistance = 0;
    this.strategyMovementSpeed = 0;
    this.strategyStaminaFinal = null;
    this.strategyStaminaMinimum = null;
    this.strategySprintSeconds = 0;
    this.strategyRecoverySeconds = 0;
    this.strategyExhaustionCount = 0;
    this.scenarioSeed = null;
    this._lastPlayerPosition = playerStartPosition ? { ...playerStartPosition } : null;
    this.playerShotAttempts = 0;
    this.playerShotHits = 0;
    this.playerDamageDealt = 0;
    this.playerDamageToBoss = 0;
    this.playerDamageToObjectives = 0;
    this.playerObjectiveKills = 0;
    this.updateCalls = 0;
    this.duplicateUpdateTicks = 0;
    this.maximumUpdatesPerTick = 0;
    this.telegraphStarts = 0;
    this.attackStarts = 0;
    this.actionEvents = 0;
    this.actionCounts = {};
    this.bossSpecificEventCounts = {};
    this.bossActionEvents = 0;
    this.auxiliaryActionEvents = 0;
    this.bossActionCounts = {};
    this.auxiliaryActionCounts = {};
    this.bossAbilityStarts = 0;
    this.bossAbilityReleases = 0;
    this.bossAbilityOutcomes = 0;
    this.bossAbilityHitOutcomes = 0;
    this.bossAbilityMissOutcomes = 0;
    this.abilityStartsByAbility = {};
    this.abilityReleasesByAbility = {};
    this.abilityOutcomesByAbility = {};
    this.abilityHitsByAbility = {};
    this.abilityMissesByAbility = {};
    this.bossTelegraphEvents = 0;
    this.projectileFireEvents = 0;
    this.projectileFiresWhileWorldBlocked = 0;
    this.blockedFireBySourceType = {};
    this.projectilesBlockedByWorld = 0;
    this.movementBlockedTicks = 0;
    this._consecutiveMovementBlockedTicks = 0;
    this.maxConsecutiveMovementBlockedTicks = 0;
    this.selfOwnedBlockTicks = 0;
    this._consecutiveSelfOwnedBlockTicks = 0;
    this.maxConsecutiveSelfOwnedBlockTicks = 0;
    this.movementBlockerTypes = {};
    this.damageEvents = 0;
    this.damageTotal = 0;
    this.bossDamageEvents = 0;
    this.bossDamageTotal = 0;
    this.auxiliaryDamageEvents = 0;
    this.auxiliaryDamageTotal = 0;
    this.damageBySourceType = {};
    this.damageBySourceKind = {};
    this.damageEventsBySourceKind = {};
    this.damageThroughWorldBySourceKind = {};
    this.untelegraphedDamageBySourceKind = {};
    this.maximumDamageEvent = 0;
    this.damageThroughWorld = 0;
    this.damageThroughWorldEvents = 0;
    this.telegraphedDamageEvents = 0;
    this.untelegraphedDamageEvents = 0;
    this.bossTelegraphedDamageEvents = 0;
    this.bossUntelegraphedDamageEvents = 0;
    this.auxiliariesPeak = initialAuxiliaries;
    this.auxiliaryTypes = {};
    this.phaseTransitions = 0;
    this.phaseLabelTransitions = 0;
    this.phasesSeen = [];
    this.phaseLabelsSeen = [];
    this.phaseTriggerApplied = false;
    this.finalPhaseTriggerApplied = false;
    this.strategyPhaseCoverageRequired = !!strategyId && !!BOSS_BEHAVIOR_PROFILES[bossId]?.phaseTrigger;
    this.summonOpportunityApplied = !BOSS_BEHAVIOR_PROFILES[bossId]?.phaseTrigger;
    this.broodWallSpawnEvents = 0;
    this.broodWallBetweenEvents = 0;
    this.objectiveGateTested = false;
    this.objectiveUnlockTested = false;
    this.lockedDamageAccepted = 0;
    this.unlockedDamageAccepted = 0;
    this.stateDurations = {};
    this.stateTransitions = 0;
    this.finalState = 'idle';
    this.longestNoActionSeconds = 0;
    this._noActionSeconds = 0;
    this._lastPosition = { ...startPosition };
    this._lastTelegraphActive = false;
    this._lastAttackActive = false;
    this._lastTelegraphAtMs = -Infinity;
    this._lastPhase = null;
    this._lastPhaseLabel = null;
    this._lastState = null;
    this.timeline = [];
    this.timelineOmitted = 0;
    this.damageTimelineOmitted = 0;
    this.strategyTimeline = [];
    this.strategyTimelineOmitted = 0;
    this.fixtureCollisionCorrections = 0;
    this.arenaId = null;
    this.arenaLoaded = false;
    this.arenaBounds = null;
    this.arenaColliderCount = 0;
    this.arenaRouteStopsPlanned = 0;
    this.arenaRouteStopsVisited = 0;
    this.arenaInvalidRouteStops = 0;
    this.arenaBossOutOfBoundsTicks = 0;
    this.arenaPlayerOutOfBoundsTicks = 0;
    this.arenaWorkingRangeTicks = 0;
    this.arenaVisibleWorkingRangeTicks = 0;
    this.arenaObjectiveCount = 0;
    this.arenaObjectivePlacementIssues = 0;
    this.arenaObjectivePlacementDetails = [];
    this.arenaAuxiliaryPlacementIssues = 0;
    this.arenaAuxiliaryPlacementDetails = [];
    this._arenaVisitedRouteStops = new Set();
    this._arenaInvalidAuxiliaries = new WeakSet();
    this.footprint = [];
    this._footprintElapsed = 0;
    this._lastFootprintPenetrating = false;
    this._lastFootprintTooClose = false;
  }

  addEvent(atMs, type, data = {}) {
    if (this.timeline.length < 60) this.timeline.push({ atMs: round(atMs, 1), type, ...data });
    else this.timelineOmitted++;
  }

  addStrategyEvent(atMs, type, data = {}) {
    if (this.strategyTimeline.length < 24) {
      this.strategyTimeline.push({ atMs: round(atMs, 1), type, ...data });
    } else {
      this.strategyTimelineOmitted++;
    }
  }

  recordAIEvent(atMs, event = {}) {
    if (!event.type) return;
    const sourceType = event.sourceType || event.root?.userData?.type || 'unknown';
    const sourceRole = event.sourceRole
      || (event.isPrimary || event.root?.userData?.diagnosticActorId === 'boss_primary' ? 'boss' : 'auxiliary');
    const isBoss = sourceRole === 'boss';
    const ability = event.ability || event.attack || 'unknown';
    const roleCounts = isBoss ? this.bossActionCounts : this.auxiliaryActionCounts;
    this.actionCounts[event.type] = (this.actionCounts[event.type] || 0) + 1;
    roleCounts[event.type] = (roleCounts[event.type] || 0) + 1;
    if (!['movement_blocked', 'movement_slid_around_ally', 'ally_displaced'].includes(event.type)) {
      this.bossSpecificEventCounts[event.type] = (this.bossSpecificEventCounts[event.type] || 0) + 1;
    }
    if (['projectile_fired', 'ability_started', 'ability_released', 'boss_add_spawned', 'melee_started', 'melee_hit',
      'ad_zone_detonated', 'verdict_started', 'verdict_released', 'citation_applied', 'citation_mine_detonated'].includes(event.type)) {
      this.actionEvents++;
      if (isBoss) this.bossActionEvents++;
      else this.auxiliaryActionEvents++;
      this._noActionSeconds = 0;
    }
    if (isBoss && ['ability_started', 'telegraph_started', 'melee_started', 'verdict_started', 'citation_mine_armed'].includes(event.type)) {
      this.bossTelegraphEvents++;
      this._lastTelegraphAtMs = atMs;
    }
    if (isBoss && event.type === 'ability_started') {
      this.bossAbilityStarts++;
      this.abilityStartsByAbility[ability] = (this.abilityStartsByAbility[ability] || 0) + 1;
    }
    if (isBoss && event.type === 'ability_released') {
      this.bossAbilityReleases++;
      this.abilityReleasesByAbility[ability] = (this.abilityReleasesByAbility[ability] || 0) + 1;
    }
    const carriesHitOutcome = typeof event.hitPlayer === 'boolean'
      && ['ability_released', 'ability_resolved', 'ad_zone_detonated', 'verdict_released', 'citation_mine_detonated'].includes(event.type);
    if (isBoss && (carriesHitOutcome || ['ability_resolved', 'ability_cancelled', 'shot_withheld'].includes(event.type))) {
      this.bossAbilityOutcomes++;
      this.abilityOutcomesByAbility[ability] = (this.abilityOutcomesByAbility[ability] || 0) + 1;
    }
    if (isBoss && carriesHitOutcome) {
      const outcomeCounts = event.hitPlayer ? this.abilityHitsByAbility : this.abilityMissesByAbility;
      outcomeCounts[ability] = (outcomeCounts[ability] || 0) + 1;
      if (event.hitPlayer) this.bossAbilityHitOutcomes++;
      else this.bossAbilityMissOutcomes++;
    } else if (isBoss && event.type === 'shot_withheld') {
      this.bossAbilityMissOutcomes++;
      this.abilityMissesByAbility[ability] = (this.abilityMissesByAbility[ability] || 0) + 1;
    }
    if (event.type === 'projectile_fired') {
      this.projectileFireEvents++;
      if (event.worldVisible === false && event.indirectFire !== true) {
        this.projectileFiresWhileWorldBlocked++;
        this.blockedFireBySourceType[sourceType] = (this.blockedFireBySourceType[sourceType] || 0) + 1;
      }
    }
    if (event.type === 'projectile_blocked_by_world') this.projectilesBlockedByWorld++;
    if (event.type === 'boss_add_spawned' && event.ability === 'brood_wall') {
      this.broodWallSpawnEvents++;
      if (event.betweenBossAndPlayer) this.broodWallBetweenEvents++;
    }
    const count = this.actionCounts[event.type];
    const highFrequency = ['movement_blocked', 'movement_slid_around_ally', 'ally_displaced'].includes(event.type)
      || (!isBoss && event.type === 'state_changed');
    const duplicateDamageEvent = event.type === 'player_damaged';
    if (!duplicateDamageEvent && (!highFrequency || count <= 3)) {
      this.addEvent(atMs, event.type, {
        ability: event.ability || null,
        attack: event.attack || null,
        kind: event.kind || null,
        sourceType,
        sourceRole,
        blockedBy: event.blockedBy || null,
        blockerType: event.blockerType || null,
        blockerOwnership: event.blockerOwnership || null,
        hitPlayer: event.hitPlayer ?? null,
        worldBlocked: event.worldBlocked ?? null,
        worldClear: event.worldClear ?? null,
        indirectFire: event.indirectFire ?? null,
        trajectory: event.trajectory || null,
        betweenBossAndPlayer: event.betweenBossAndPlayer ?? null,
        screenProjection: event.screenProjection ?? null,
        screenLateralDistance: event.screenLateralDistance ?? null,
        distanceToPlayer: event.distanceToPlayer == null ? null : round(event.distanceToPlayer),
        distanceToBoss: event.distanceToBoss == null ? null : round(event.distanceToBoss),
        strikesBefore: event.strikesBefore ?? null,
        strikesAfter: event.strikesAfter ?? null,
        requestedMines: event.requestedMines ?? null,
        spawnedMines: event.spawnedMines ?? null,
        variant: event.variant || null,
        reason: event.reason || null,
        projectileCount: event.projectileCount ?? null,
        requestedProjectiles: event.requestedProjectiles ?? null,
        withheldCount: event.withheldCount ?? null,
        spawnedCount: event.spawnedCount ?? null,
        mirageCount: event.mirageCount ?? null,
        ringCount: event.ringCount ?? null
      });
    } else if (highFrequency || duplicateDamageEvent) {
      this.timelineOmitted++;
    }
  }

  recordDamage(atMs, amount, {
    worldVisible = true, sourceType = 'boss', sourceRole = 'boss', sourceKind = 'enemy',
    directLine = false, requiresTelegraph = true
  } = {}) {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;
    this.damageEvents++;
    this.damageTotal += value;
    this.damageBySourceType[sourceType] = round((this.damageBySourceType[sourceType] || 0) + value);
    this.damageBySourceKind[sourceKind] = round((this.damageBySourceKind[sourceKind] || 0) + value);
    this.damageEventsBySourceKind[sourceKind] = (this.damageEventsBySourceKind[sourceKind] || 0) + 1;
    if (sourceRole === 'boss') {
      this.bossDamageEvents++;
      this.bossDamageTotal += value;
    } else {
      this.auxiliaryDamageEvents++;
      this.auxiliaryDamageTotal += value;
    }
    this.maximumDamageEvent = Math.max(this.maximumDamageEvent, value);
    if (!worldVisible && directLine) {
      this.damageThroughWorld += value;
      this.damageThroughWorldEvents++;
      this.damageThroughWorldBySourceKind[sourceKind] = round((this.damageThroughWorldBySourceKind[sourceKind] || 0) + value);
    }
    if (requiresTelegraph) {
      if (atMs - this._lastTelegraphAtMs <= 4000) {
        this.telegraphedDamageEvents++;
        if (sourceRole === 'boss') this.bossTelegraphedDamageEvents++;
      } else {
        this.untelegraphedDamageEvents++;
        this.untelegraphedDamageBySourceKind[sourceKind] = (this.untelegraphedDamageBySourceKind[sourceKind] || 0) + 1;
        if (sourceRole === 'boss') this.bossUntelegraphedDamageEvents++;
      }
    }
    this._noActionSeconds = 0;
    const kindEventCount = this.damageEventsBySourceKind[sourceKind];
    const decisiveCoverEvent = !worldVisible && directLine
      && (this.damageThroughWorldBySourceKind[sourceKind] || 0) <= value + 0.001;
    if (kindEventCount <= 3 || decisiveCoverEvent) {
      this.addEvent(atMs, 'player_damaged', {
        amount: round(value), sourceType, sourceRole, sourceKind, worldVisible, directLine
      });
    } else {
      this.timelineOmitted++;
      this.damageTimelineOmitted++;
    }
  }

  recordFixtureCorrection(atMs, { from, requested, resolved, minimumDistance }) {
    this.fixtureCollisionCorrections++;
    if (this.fixtureCollisionCorrections <= 3) {
      this.addEvent(atMs, 'player_fixture_collision_resolved', {
        from, requested, resolved, minimumDistance: round(minimumDistance)
      });
    } else {
      this.timelineOmitted++;
    }
  }

  recordPlayerShot(atMs, {
    attempted = true, hit = false, acceptedDamage = 0, targetType = 'unknown', targetRole = 'boss', destroyed = false
  } = {}) {
    if (attempted) this.playerShotAttempts++;
    if (!hit) return;
    this.playerShotHits++;
    const damage = Math.max(0, Number(acceptedDamage) || 0);
    this.playerDamageDealt += damage;
    if (targetRole === 'boss') this.playerDamageToBoss += damage;
    else this.playerDamageToObjectives += damage;
    if (destroyed && targetRole !== 'boss') this.playerObjectiveKills++;
    if (this.playerShotHits <= 6 || destroyed) {
      this.addEvent(atMs, 'benchmark_player_shot', {
        targetType, targetRole, acceptedDamage: round(damage), destroyed
      });
    } else {
      this.timelineOmitted++;
    }
  }

  configureArena({
    id, bounds, colliderCount = 0, routeStopsPlanned = 0, invalidRouteStops = 0,
    objectiveCount = 0, objectivePlacementIssues = 0, objectivePlacementDetails = []
  }) {
    this.arenaId = id || null;
    this.arenaLoaded = !!id;
    this.arenaBounds = bounds ? { ...bounds } : null;
    this.arenaColliderCount = Math.max(0, Number(colliderCount) || 0);
    this.arenaRouteStopsPlanned = Math.max(0, Number(routeStopsPlanned) || 0);
    this.arenaInvalidRouteStops = Math.max(0, Number(invalidRouteStops) || 0);
    this.arenaObjectiveCount = Math.max(0, Number(objectiveCount) || 0);
    this.arenaObjectivePlacementIssues = Math.max(0, Number(objectivePlacementIssues) || 0);
    this.arenaObjectivePlacementDetails = objectivePlacementDetails.slice(0, 8);
  }

  recordArenaRouteStop(atMs, index, label, position) {
    if (this._arenaVisitedRouteStops.has(index)) return;
    this._arenaVisitedRouteStops.add(index);
    this.arenaRouteStopsVisited = this._arenaVisitedRouteStops.size;
    this.addEvent(atMs, 'arena_route_stop_reached', { index, label, position });
  }

  recordArenaTick({ atMs = 0, bossInBounds = true, playerInBounds = true, inWorkingRange = false, worldVisible = false, invalidAuxiliaries = [] } = {}) {
    if (!bossInBounds) this.arenaBossOutOfBoundsTicks++;
    if (!playerInBounds) this.arenaPlayerOutOfBoundsTicks++;
    if (inWorkingRange) {
      this.arenaWorkingRangeTicks++;
      if (worldVisible) this.arenaVisibleWorkingRangeTicks++;
    }
    for (const item of invalidAuxiliaries) {
      const auxiliary = item?.root || item;
      if (!auxiliary || this._arenaInvalidAuxiliaries.has(auxiliary)) continue;
      this._arenaInvalidAuxiliaries.add(auxiliary);
      this.arenaAuxiliaryPlacementIssues++;
      const detail = item?.root ? {
        type: item.type || auxiliary.userData?.type || 'unknown',
        position: item.position || null,
        reason: item.reason || 'unknown'
      } : { type: auxiliary.userData?.type || 'unknown', position: null, reason: 'unknown' };
      if (this.arenaAuxiliaryPlacementDetails.length < 8) this.arenaAuxiliaryPlacementDetails.push(detail);
      this.addEvent(atMs, 'arena_auxiliary_placement_invalid', detail);
    }
  }

  observeTick({
    atMs, dt, position, playerDistance, tracking = false, overlappingPlayer = false,
    penetratingPlayer = overlappingPlayer, insidePreferredMinimum = false,
    worldVisible = true, updatesThisTick = 1, telegraphActive = false,
    attackActive = false, state = 'idle', phase = null, phaseLabel = null,
    movementBlocked = false, blockedBySelfOwnedAuxiliary = false, movementBlockerType = null,
    playerPosition = null, bossHp = null,
    auxiliaries = []
  }) {
    this.simulationSeconds += dt;
    const moved = Math.hypot(position.x - this._lastPosition.x, position.z - this._lastPosition.z);
    this.distanceTravelled += moved;
    this._lastPosition = { x: position.x, y: position.y, z: position.z };
    this.closestPlayerDistance = Math.min(this.closestPlayerDistance, playerDistance);
    this.finalPlayerDistance = playerDistance;
    this.sampleCount++;
    if (tracking) this.trackingSamples++;
    if (!worldVisible) {
      this.worldBlockedSeconds += dt;
      this.playerHiddenSeconds += dt;
    } else {
      this.playerVisibleSeconds += dt;
    }
    if (playerPosition && this._lastPlayerPosition) {
      this.playerDistanceTravelled += Math.hypot(
        playerPosition.x - this._lastPlayerPosition.x,
        playerPosition.z - this._lastPlayerPosition.z
      );
    }
    if (playerPosition) this._lastPlayerPosition = { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z };
    if (Number.isFinite(Number(bossHp))) this.finalBossHp = Math.max(0, Number(bossHp));
    if (movementBlocked) {
      this.movementBlockedTicks++;
      this._consecutiveMovementBlockedTicks++;
      this.maxConsecutiveMovementBlockedTicks = Math.max(this.maxConsecutiveMovementBlockedTicks, this._consecutiveMovementBlockedTicks);
      const blockerType = movementBlockerType || 'unknown';
      this.movementBlockerTypes[blockerType] = (this.movementBlockerTypes[blockerType] || 0) + 1;
    } else {
      this._consecutiveMovementBlockedTicks = 0;
    }
    if (blockedBySelfOwnedAuxiliary) {
      this.selfOwnedBlockTicks++;
      this._consecutiveSelfOwnedBlockTicks++;
      this.maxConsecutiveSelfOwnedBlockTicks = Math.max(this.maxConsecutiveSelfOwnedBlockTicks, this._consecutiveSelfOwnedBlockTicks);
    } else {
      this._consecutiveSelfOwnedBlockTicks = 0;
    }

    if (overlappingPlayer) {
      this.playerOverlapTicks++;
      this._consecutiveOverlapTicks++;
      this.maxConsecutiveOverlapTicks = Math.max(this.maxConsecutiveOverlapTicks, this._consecutiveOverlapTicks);
    } else {
      this._consecutiveOverlapTicks = 0;
    }
    if (penetratingPlayer) {
      this.playerPenetrationTicks++;
      this._consecutivePenetrationTicks++;
      this.maxConsecutivePenetrationTicks = Math.max(this.maxConsecutivePenetrationTicks, this._consecutivePenetrationTicks);
    } else {
      this._consecutivePenetrationTicks = 0;
    }
    if (insidePreferredMinimum) {
      if (this._preferredRangeBreachAtMs == null) this._preferredRangeBreachAtMs = atMs;
      this.tooCloseTicks++;
      this._consecutiveTooCloseTicks++;
      this.maxConsecutiveTooCloseTicks = Math.max(this.maxConsecutiveTooCloseTicks, this._consecutiveTooCloseTicks);
    } else {
      this._consecutiveTooCloseTicks = 0;
      if (this._preferredRangeBreachAtMs != null && this.timeToRecoverPreferredDistance == null) {
        this.recoveredPreferredDistance = true;
        this.timeToRecoverPreferredDistance = Math.max(0, (atMs - this._preferredRangeBreachAtMs) / 1000);
      }
    }

    this._footprintElapsed += dt;
    const footprintTransition = penetratingPlayer !== this._lastFootprintPenetrating
      || insidePreferredMinimum !== this._lastFootprintTooClose;
    if (playerPosition && this.footprint.length < 160 && (this._footprintElapsed >= 0.25 || footprintTransition)) {
      this.footprint.push([
        round(atMs, 1), round(position.x), round(position.z),
        round(playerPosition.x), round(playerPosition.z), round(playerDistance),
        state, penetratingPlayer ? 1 : 0, insidePreferredMinimum ? 1 : 0
      ]);
      this._footprintElapsed = 0;
    }
    this._lastFootprintPenetrating = penetratingPlayer;
    this._lastFootprintTooClose = insidePreferredMinimum;

    this.updateCalls += updatesThisTick;
    this.maximumUpdatesPerTick = Math.max(this.maximumUpdatesPerTick, updatesThisTick);
    if (updatesThisTick > 1) this.duplicateUpdateTicks++;

    let actionObserved = false;
    if (telegraphActive && !this._lastTelegraphActive) {
      this.telegraphStarts++;
      this._lastTelegraphAtMs = atMs;
      this.addEvent(atMs, 'telegraph_started', { state });
      actionObserved = true;
    }
    if (attackActive && !this._lastAttackActive) {
      this.attackStarts++;
      this.addEvent(atMs, 'attack_started', { state });
      actionObserved = true;
    }
    this._lastTelegraphActive = telegraphActive;
    this._lastAttackActive = attackActive;

    this.stateDurations[state] = (this.stateDurations[state] || 0) + dt;
    if (this._lastState != null && state !== this._lastState) {
      this.stateTransitions++;
      const transition = `state:${this._lastState}->${state}`;
      this.bossSpecificEventCounts[transition] = (this.bossSpecificEventCounts[transition] || 0) + 1;
      this.addEvent(atMs, 'state_changed', { from: this._lastState, to: state });
      actionObserved = true;
    }
    this._lastState = state;
    this.finalState = state;

    if (phase != null && !this.phasesSeen.includes(phase)) this.phasesSeen.push(phase);
    if (this._lastPhase != null && phase != null && phase !== this._lastPhase) {
      this.phaseTransitions++;
      const transition = `phase:${this._lastPhase}->${phase}`;
      this.bossSpecificEventCounts[transition] = (this.bossSpecificEventCounts[transition] || 0) + 1;
      this.addEvent(atMs, 'phase_changed', { from: this._lastPhase, to: phase });
      actionObserved = true;
    }
    if (phase != null) this._lastPhase = phase;

    if (phaseLabel && !this.phaseLabelsSeen.includes(phaseLabel)) this.phaseLabelsSeen.push(phaseLabel);
    if (this._lastPhaseLabel != null && phaseLabel && phaseLabel !== this._lastPhaseLabel) {
      this.phaseLabelTransitions++;
      const transition = `phase_label:${this._lastPhaseLabel}->${phaseLabel}`;
      this.bossSpecificEventCounts[transition] = (this.bossSpecificEventCounts[transition] || 0) + 1;
      this.addEvent(atMs, 'phase_label_changed', { from: this._lastPhaseLabel, to: phaseLabel });
      actionObserved = true;
    }
    if (phaseLabel) this._lastPhaseLabel = phaseLabel;

    this.auxiliariesPeak = Math.max(this.auxiliariesPeak, auxiliaries.length);
    const auxiliaryCounts = {};
    for (const auxiliary of auxiliaries) {
      const type = auxiliary?.userData?.type || 'unknown';
      auxiliaryCounts[type] = (auxiliaryCounts[type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(auxiliaryCounts)) {
      this.auxiliaryTypes[type] = Math.max(this.auxiliaryTypes[type] || 0, count);
    }

    if (actionObserved) this._noActionSeconds = 0;
    else this._noActionSeconds += dt;
    this.longestNoActionSeconds = Math.max(this.longestNoActionSeconds, this._noActionSeconds);
  }

  finish() {
    const simulationSeconds = Math.max(0, this.simulationSeconds);
    const metrics = {
      simulationSeconds: round(simulationSeconds, 2),
      strategyId: this.strategyId,
      distanceTravelled: round(this.distanceTravelled),
      playerDistanceTravelled: round(this.playerDistanceTravelled),
      strategyMovementMode: this.strategyMovementMode,
      strategyIntendedDistance: round(this.strategyIntendedDistance),
      strategyMovementSpeed: round(this.strategyMovementSpeed),
      strategyStaminaFinal: this.strategyStaminaFinal == null ? null : round(this.strategyStaminaFinal),
      strategyStaminaMinimum: this.strategyStaminaMinimum == null ? null : round(this.strategyStaminaMinimum),
      strategySprintSeconds: round(this.strategySprintSeconds, 2),
      strategyRecoverySeconds: round(this.strategyRecoverySeconds, 2),
      strategyExhaustionCount: this.strategyExhaustionCount,
      scenarioSeed: this.scenarioSeed,
      initialPlayerDistance: round(this.initialPlayerDistance),
      closestPlayerDistance: round(Number.isFinite(this.closestPlayerDistance) ? this.closestPlayerDistance : 0),
      finalPlayerDistance: round(this.finalPlayerDistance),
      recoveredPreferredDistance: this.recoveredPreferredDistance,
      timeToRecoverPreferredDistance: this.timeToRecoverPreferredDistance == null
        ? null
        : round(this.timeToRecoverPreferredDistance, 2),
      trackingRatio: round(this.trackingSamples / Math.max(1, this.sampleCount), 3),
      overlapRatio: round(this.playerOverlapTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveOverlapTicks: this.maxConsecutiveOverlapTicks,
      penetrationRatio: round(this.playerPenetrationTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutivePenetrationTicks: this.maxConsecutivePenetrationTicks,
      preferredMinimumDistance: round(this.preferredMinimumDistance),
      tooCloseRatio: round(this.tooCloseTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveTooCloseTicks: this.maxConsecutiveTooCloseTicks,
      worldBlockedSeconds: round(this.worldBlockedSeconds, 2),
      playerVisibleSeconds: round(this.playerVisibleSeconds, 2),
      playerHiddenSeconds: round(this.playerHiddenSeconds, 2),
      playerExposureRatio: round(this.playerVisibleSeconds / Math.max(0.001, simulationSeconds), 3),
      playerShotAttempts: this.playerShotAttempts,
      playerShotHits: this.playerShotHits,
      playerAccuracy: round(this.playerShotHits / Math.max(1, this.playerShotAttempts), 3),
      playerDamageDealt: round(this.playerDamageDealt),
      playerDamageToBoss: round(this.playerDamageToBoss),
      playerDamageToObjectives: round(this.playerDamageToObjectives),
      playerObjectiveKills: this.playerObjectiveKills,
      playerOutgoingDps: round(this.playerDamageToBoss / Math.max(0.001, simulationSeconds), 2),
      initialBossHp: round(this.initialBossHp),
      finalBossHp: round(this.finalBossHp),
      bossHpRemainingRatio: this.initialBossHp > 0 ? round(this.finalBossHp / this.initialBossHp, 3) : null,
      strategyPhaseHpAdjustment: round(this.strategyPhaseHpAdjustment),
      combatBossHpRemainingRatio: this.initialBossHp > 0
        ? round(Math.min(this.initialBossHp, this.finalBossHp + this.strategyPhaseHpAdjustment) / this.initialBossHp, 3)
        : null,
      updateCalls: this.updateCalls,
      duplicateUpdateTicks: this.duplicateUpdateTicks,
      maximumUpdatesPerTick: this.maximumUpdatesPerTick,
      telegraphStarts: this.telegraphStarts,
      attackStarts: this.attackStarts,
      actionEvents: this.actionEvents,
      actionCounts: { ...this.actionCounts },
      bossSpecificEventCounts: { ...this.bossSpecificEventCounts },
      bossActionEvents: this.bossActionEvents,
      auxiliaryActionEvents: this.auxiliaryActionEvents,
      bossActionCounts: { ...this.bossActionCounts },
      auxiliaryActionCounts: { ...this.auxiliaryActionCounts },
      bossAbilityStarts: this.bossAbilityStarts,
      bossAbilityReleases: this.bossAbilityReleases,
      bossAbilityOutcomes: this.bossAbilityOutcomes,
      bossAbilityHitOutcomes: this.bossAbilityHitOutcomes,
      bossAbilityMissOutcomes: this.bossAbilityMissOutcomes,
      abilityStartsByAbility: { ...this.abilityStartsByAbility },
      abilityReleasesByAbility: { ...this.abilityReleasesByAbility },
      abilityOutcomesByAbility: { ...this.abilityOutcomesByAbility },
      abilityHitsByAbility: { ...this.abilityHitsByAbility },
      abilityMissesByAbility: { ...this.abilityMissesByAbility },
      bossTelegraphEvents: this.bossTelegraphEvents,
      projectileFireEvents: this.projectileFireEvents,
      projectileFiresWhileWorldBlocked: this.projectileFiresWhileWorldBlocked,
      blockedFireBySourceType: { ...this.blockedFireBySourceType },
      projectilesBlockedByWorld: this.projectilesBlockedByWorld,
      movementBlockedTicks: this.movementBlockedTicks,
      movementBlockedRatio: round(this.movementBlockedTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveMovementBlockedTicks: this.maxConsecutiveMovementBlockedTicks,
      selfOwnedBlockTicks: this.selfOwnedBlockTicks,
      selfOwnedBlockRatio: round(this.selfOwnedBlockTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveSelfOwnedBlockTicks: this.maxConsecutiveSelfOwnedBlockTicks,
      movementBlockerTypes: { ...this.movementBlockerTypes },
      fixtureCollisionCorrections: this.fixtureCollisionCorrections,
      arenaId: this.arenaId,
      arenaLoaded: this.arenaLoaded,
      arenaBounds: this.arenaBounds ? { ...this.arenaBounds } : null,
      arenaColliderCount: this.arenaColliderCount,
      arenaRouteStopsPlanned: this.arenaRouteStopsPlanned,
      arenaRouteStopsVisited: this.arenaRouteStopsVisited,
      arenaRouteCompleted: this.arenaRouteStopsPlanned > 0 && this.arenaRouteStopsVisited >= this.arenaRouteStopsPlanned,
      arenaInvalidRouteStops: this.arenaInvalidRouteStops,
      arenaBossOutOfBoundsTicks: this.arenaBossOutOfBoundsTicks,
      arenaPlayerOutOfBoundsTicks: this.arenaPlayerOutOfBoundsTicks,
      arenaWorkingRangeTicks: this.arenaWorkingRangeTicks,
      arenaWorkingRangeRatio: round(this.arenaWorkingRangeTicks / Math.max(1, this.sampleCount), 3),
      arenaVisibleWorkingRangeTicks: this.arenaVisibleWorkingRangeTicks,
      arenaVisibleWorkingRangeRatio: round(this.arenaVisibleWorkingRangeTicks / Math.max(1, this.arenaWorkingRangeTicks), 3),
      arenaObjectiveCount: this.arenaObjectiveCount,
      arenaObjectivePlacementIssues: this.arenaObjectivePlacementIssues,
      arenaObjectivePlacementDetails: this.arenaObjectivePlacementDetails.map(item => ({ ...item })),
      arenaAuxiliaryPlacementIssues: this.arenaAuxiliaryPlacementIssues,
      arenaAuxiliaryPlacementDetails: this.arenaAuxiliaryPlacementDetails.map(item => ({ ...item })),
      damageEvents: this.damageEvents,
      damageTotal: round(this.damageTotal),
      incomingDps: round(this.damageTotal / Math.max(0.001, simulationSeconds), 2),
      bossDamageEvents: this.bossDamageEvents,
      bossDamageTotal: round(this.bossDamageTotal),
      auxiliaryDamageEvents: this.auxiliaryDamageEvents,
      auxiliaryDamageTotal: round(this.auxiliaryDamageTotal),
      damageBySourceType: { ...this.damageBySourceType },
      damageBySourceKind: { ...this.damageBySourceKind },
      damageEventsBySourceKind: { ...this.damageEventsBySourceKind },
      damageThroughWorldBySourceKind: { ...this.damageThroughWorldBySourceKind },
      untelegraphedDamageBySourceKind: { ...this.untelegraphedDamageBySourceKind },
      maximumDamageEvent: round(this.maximumDamageEvent),
      damageThroughWorld: round(this.damageThroughWorld),
      damageThroughWorldEvents: this.damageThroughWorldEvents,
      telegraphedDamageEvents: this.telegraphedDamageEvents,
      untelegraphedDamageEvents: this.untelegraphedDamageEvents,
      bossTelegraphedDamageEvents: this.bossTelegraphedDamageEvents,
      bossUntelegraphedDamageEvents: this.bossUntelegraphedDamageEvents,
      initialAuxiliaries: this.initialAuxiliaries,
      auxiliariesPeak: this.auxiliariesPeak,
      auxiliaryTypes: { ...this.auxiliaryTypes },
      phaseTransitions: this.phaseTransitions,
      phaseLabelTransitions: this.phaseLabelTransitions,
      phasesSeen: [...this.phasesSeen],
      phaseLabelsSeen: [...this.phaseLabelsSeen],
      phaseTriggerApplied: this.phaseTriggerApplied,
      finalPhaseTriggerApplied: this.finalPhaseTriggerApplied,
      strategyPhaseCoverageRequired: this.strategyPhaseCoverageRequired,
      summonOpportunityApplied: this.summonOpportunityApplied,
      broodWallSpawnEvents: this.broodWallSpawnEvents,
      broodWallBetweenRatio: round(this.broodWallBetweenEvents / Math.max(1, this.broodWallSpawnEvents), 3),
      objectiveGateTested: this.objectiveGateTested,
      objectiveUnlockTested: this.objectiveUnlockTested,
      lockedDamageAccepted: round(this.lockedDamageAccepted),
      unlockedDamageAccepted: round(this.unlockedDamageAccepted),
      stateDurations: Object.fromEntries(Object.entries(this.stateDurations).map(([key, value]) => [key, round(value, 2)])),
      stateTransitions: this.stateTransitions,
      finalState: this.finalState,
      longestNoActionSeconds: round(this.longestNoActionSeconds, 2)
    };
    const result = {
      bossId: this.bossId,
      scenarioId: this.scenarioId,
      strategyId: this.strategyId,
      metrics,
      footprintLegend: ['atMs', 'bossX', 'bossZ', 'playerX', 'playerZ', 'distance', 'state', 'penetrating', 'insidePreferredMinimum'],
      footprint: this.footprint,
      timeline: this.timeline,
      timelineOmitted: this.timelineOmitted,
      damageTimelineOmitted: this.damageTimelineOmitted,
      strategyTimeline: this.strategyTimeline,
      strategyTimelineOmitted: this.strategyTimelineOmitted,
      fixtureCollisionCorrections: this.fixtureCollisionCorrections
    };
    result.assessment = evaluateBossReaction(result);
    return result;
  }
}

function buildStrategyBenchmarks(results) {
  const byBoss = {};
  for (const result of results) {
    if (!result.strategyId) continue;
    const metrics = result.metrics || {};
    const boss = byBoss[result.bossId] || (byBoss[result.bossId] = {
      bossId: result.bossId,
      bossLabel: BOSS_BEHAVIOR_PROFILES[result.bossId]?.label || result.bossId,
      strategies: {},
      comparisons: {},
      tuningSignals: []
    });
    boss.strategies[result.strategyId] = {
      label: STRATEGY_BY_ID[result.strategyId]?.label || result.strategyId,
      stressOnly: STRATEGY_BY_ID[result.strategyId]?.stressOnly === true,
      status: result.assessment.status,
      incomingDps: metrics.incomingDps || 0,
      totalDamageTaken: metrics.damageTotal || 0,
      outgoingDps: metrics.playerOutgoingDps || 0,
      damageToBoss: metrics.playerDamageToBoss || 0,
      damageToObjectives: metrics.playerDamageToObjectives || 0,
      bossHpRemainingRatio: metrics.combatBossHpRemainingRatio ?? metrics.bossHpRemainingRatio,
      rawBossHpRemainingRatio: metrics.bossHpRemainingRatio,
      fixtureHpAdjustment: metrics.strategyPhaseHpAdjustment || 0,
      phasesSeen: [...(metrics.phasesSeen || [])],
      phaseLabelsSeen: [...(metrics.phaseLabelsSeen || [])],
      phaseTriggerApplied: !!metrics.phaseTriggerApplied,
      finalPhaseTriggerApplied: !!metrics.finalPhaseTriggerApplied,
      abilitiesObserved: Object.keys(metrics.abilityStartsByAbility || {}),
      exposureRatio: metrics.playerExposureRatio || 0,
      hiddenSeconds: metrics.playerHiddenSeconds || 0,
      playerDistanceTravelled: metrics.playerDistanceTravelled || 0,
      bossDistanceTravelled: metrics.distanceTravelled || 0,
      initialPlayerDistance: metrics.initialPlayerDistance || 0,
      closestPlayerDistance: metrics.closestPlayerDistance || 0,
      finalPlayerDistance: metrics.finalPlayerDistance || 0,
      fixtureCollisionCorrections: metrics.fixtureCollisionCorrections || 0,
      movementMode: metrics.strategyMovementMode || null,
      intendedDistance: metrics.strategyIntendedDistance || 0,
      movementSpeedAtEnd: metrics.strategyMovementSpeed || 0,
      staminaFinal: metrics.strategyStaminaFinal ?? null,
      staminaMinimum: metrics.strategyStaminaMinimum ?? null,
      sprintSeconds: metrics.strategySprintSeconds || 0,
      recoverySeconds: metrics.strategyRecoverySeconds || 0,
      exhaustionCount: metrics.strategyExhaustionCount || 0,
      attackPressurePerMinute: round(
        ((metrics.attackStarts || 0) + (metrics.bossActionEvents || 0)) * 60 / Math.max(0.001, metrics.simulationSeconds || 0),
        2
      ),
      auxiliariesPeak: metrics.auxiliariesPeak || 0
    };
  }

  for (const boss of Object.values(byBoss)) {
    const shoot = boss.strategies.shoot;
    const unlimitedRun = boss.strategies.run;
    const staminaRun = boss.strategies.run_stamina;
    const realisticRun = staminaRun || unlimitedRun;
    const hide = boss.strategies.hide;
    const incomingValues = Object.values(boss.strategies).map(item => item.incomingDps);
    const reduction = (baseline, candidate) => baseline?.incomingDps > 0 && candidate
      ? round((1 - candidate.incomingDps / baseline.incomingDps) * 100, 1)
      : null;
    boss.comparisons = {
      runDamageReductionVsShootPct: reduction(shoot, realisticRun),
      staminaRunDamageReductionVsShootPct: reduction(shoot, staminaRun),
      unlimitedRunDamageReductionVsShootPct: reduction(shoot, unlimitedRun),
      staminaVsUnlimitedIncomingDpsDelta: staminaRun && unlimitedRun
        ? round(staminaRun.incomingDps - unlimitedRun.incomingDps, 2)
        : null,
      hideDamageReductionVsShootPct: reduction(shoot, hide),
      incomingDpsSpread: round(Math.max(...incomingValues) - Math.min(...incomingValues), 2)
    };
    if (shoot && shoot.incomingDps <= 0 && realisticRun?.incomingDps <= 0 && hide?.incomingDps <= 0) {
      boss.tuningSignals.push('No strategy received damage; review attack reach, aim, or release cadence.');
    }
    if (realisticRun?.incomingDps <= 0) {
      boss.tuningSignals.push('The stamina-managed running strategy received no damage; review interception, pursuit speed, or predictive pressure.');
    } else if (realisticRun && shoot?.incomingDps > 0 && realisticRun.incomingDps < shoot.incomingDps * 0.25) {
      boss.tuningSignals.push('Stamina-managed running removes more than 75% of incoming DPS; consider stronger pursuit or predictive pressure.');
    }
    if (unlimitedRun?.incomingDps <= 0 && staminaRun?.incomingDps > 0) {
      boss.tuningSignals.push('The boss cannot catch the impossible unlimited kite but does pressure the stamina-managed runner; production movement tuning is not indicated by that stress-test miss alone.');
    }
    if (hide?.incomingDps <= 0) {
      boss.tuningSignals.push('The hiding strategy received no damage; verify intentional safe cover or add an honest anti-cover response.');
    } else if (hide && shoot?.incomingDps > 0 && hide.incomingDps > shoot.incomingDps * 1.1) {
      boss.tuningSignals.push('Hiding increases incoming pressure; anti-cover or add pressure is active, so inspect attribution before changing direct-line attacks.');
    } else if (hide && shoot?.incomingDps > 0 && hide.incomingDps > shoot.incomingDps * 0.9) {
      boss.tuningSignals.push('Hiding offers less than 10% damage reduction; inspect attribution before deciding whether cover response needs tuning.');
    }
    if (shoot && shoot.outgoingDps <= 0 && (shoot.damageToObjectives || 0) <= 0) {
      boss.tuningSignals.push('The shooting strategy could not damage the boss or an encounter objective.');
    }
  }
  return byBoss;
}

export function buildBossReactionReport({ environment, startedAt, completedAt, results, errors = [], interruptions = [] }) {
  const counts = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 };
  const byBoss = {};
  const findingCounts = {};
  for (const result of results) {
    const status = result.assessment.status;
    counts[status]++;
    const bucket = byBoss[result.bossId] || (byBoss[result.bossId] = { pass: 0, warn: 0, fail: 0, inconclusive: 0, not_applicable: 0 });
    bucket[status]++;
    for (const item of result.assessment.findings) findingCounts[item.code] = (findingCounts[item.code] || 0) + 1;
  }
  return {
    schemaVersion: 7,
    diagnostic: 'boss-reaction',
    startedAt,
    completedAt,
    environment,
    summary: {
      total: results.length,
      ...counts,
      healthy: counts.pass === results.length && counts.warn === 0
        && counts.fail === 0 && counts.inconclusive === 0 && errors.length === 0,
      byBoss,
      prioritizedFindings: Object.entries(findingCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, count }))
    },
    strategyBenchmarks: buildStrategyBenchmarks(results),
    results,
    errors,
    interruptions
  };
}
