import { resolveBossBehaviorProfile } from '../bosses/behavior-profiles.js';

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

const profile = (definition) => Object.freeze({
  trackingRequired: false,
  directLineAttacks: false,
  phaseTrigger: null,
  contactRole: 'ranged_controller',
  minimumAuxiliaries: 0,
  maximumAuxiliaries: 12,
  scenarios: [],
  ...definition
});

export const BOSS_BEHAVIOR_PROFILES = Object.freeze({
  broodmaker: profile({
    id: 'broodmaker', label: 'Broodmaker', wave: 5, spawnDistance: 22,
    trackingRequired: true, minimumAuxiliaries: 3, maximumAuxiliaries: 10,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'summon_coordination', 'recovery_loop']
  }),
  sanitizer: profile({
    id: 'sanitizer', label: 'Commissioner Sanitizer', wave: 10, spawnDistance: 24,
    trackingRequired: true, directLineAttacks: true, phaseTrigger: 'remove_suppression_nodes',
    minimumAuxiliaries: 3, maximumAuxiliaries: 12,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'summon_coordination', 'objective_gating', 'recovery_loop']
  }),
  captain: profile({
    id: 'captain', label: 'Influencer Captain', wave: 15, spawnDistance: 24,
    trackingRequired: true, directLineAttacks: true, phaseTrigger: 'hp_55',
    minimumAuxiliaries: 0, maximumAuxiliaries: 8,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'recovery_loop']
  }),
  shard: profile({
    id: 'shard', label: 'Algorithm Shard Avatar', wave: 20, spawnDistance: 24,
    directLineAttacks: true, phaseTrigger: 'hp_55', minimumAuxiliaries: 0, maximumAuxiliaries: 4,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'recovery_loop']
  }),
  broodmaker_heavy: profile({
    id: 'broodmaker_heavy', label: 'Broodmaker Prime', wave: 25, spawnDistance: 22,
    trackingRequired: true, phaseTrigger: 'hp_55', minimumAuxiliaries: 3, maximumAuxiliaries: 10,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop']
  }),
  hydraclone: profile({
    id: 'hydraclone', label: 'Echo Hydraclone', wave: 30, spawnDistance: 18,
    trackingRequired: true, contactRole: 'melee', phaseTrigger: 'hp_65', minimumAuxiliaries: 1, maximumAuxiliaries: 36,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop']
  }),
  adjudicator: profile({
    id: 'adjudicator', label: 'Strike Adjudicator', wave: 35, spawnDistance: 20,
    trackingRequired: true, contactRole: 'hybrid', phaseTrigger: 'hp_55', minimumAuxiliaries: 1, maximumAuxiliaries: 10,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'phase_transition', 'summon_coordination', 'recovery_loop']
  }),
  algorithm: profile({
    id: 'algorithm', label: 'The Algorithm', wave: 40, spawnDistance: 8,
    contactRole: 'anchor', directLineAttacks: true, phaseTrigger: 'solve_control', minimumAuxiliaries: 3, maximumAuxiliaries: 4,
    scenarios: ['attack_cadence', 'moving_player', 'close_pressure', 'cover_response', 'phase_transition', 'summon_coordination', 'objective_gating', 'recovery_loop']
  })
});

export const BOSS_REACTION_ARCHETYPES = Object.freeze(Object.values(BOSS_BEHAVIOR_PROFILES));

export const BOSS_REACTION_SCENARIOS = Object.freeze([
  { id: 'attack_cadence', label: 'Attack cadence', durationSeconds: 20, description: 'Exercise the core attack loop, telegraphs, damage, and recovery.' },
  { id: 'moving_player', label: 'Moving-player response', durationSeconds: 20, movingPlayer: true, description: 'Track or pattern around a strafing player without becoming inactive.' },
  { id: 'close_pressure', label: 'Close-range pressure', durationSeconds: 16, closeAtSeconds: 4, description: 'Respond when the player closes without prolonged body overlap.' },
  { id: 'cover_response', label: 'Player behind cover', durationSeconds: 18, obstacleKind: 'boss_wall', description: 'Direct line attacks must respect world cover.' },
  { id: 'phase_transition', label: 'Phase transition', durationSeconds: 14, triggerAtSeconds: 2.5, description: 'Exercise the real phase gate and confirm the combat state changes.' },
  { id: 'summon_coordination', label: 'Adds and objectives', durationSeconds: 24, description: 'Spawn or maintain encounter auxiliaries without exceeding the boss cap.' },
  { id: 'objective_gating', label: 'Objective damage gate', durationSeconds: 10, description: 'Locked damage is rejected and solving the objective opens boss damage.' },
  { id: 'recovery_loop', label: 'Long recovery loop', durationSeconds: 30, movingPlayer: true, description: 'Complete multiple attack cycles without freezing in an active state.' }
]);

export function isBossScenarioApplicable(bossId, scenarioId) {
  return BOSS_BEHAVIOR_PROFILES[bossId]?.scenarios.includes(scenarioId) || false;
}

export function buildBossReactionMatrix({ boss = null, scenario = null, includeNotApplicable = false } = {}) {
  const bosses = boss ? BOSS_REACTION_ARCHETYPES.filter(item => item.id === boss) : BOSS_REACTION_ARCHETYPES;
  const scenarios = scenario ? BOSS_REACTION_SCENARIOS.filter(item => item.id === scenario) : BOSS_REACTION_SCENARIOS;
  return bosses.flatMap(archetype => scenarios.flatMap(definition => {
    const applicable = isBossScenarioApplicable(archetype.id, definition.id);
    if (!applicable && !includeNotApplicable) return [];
    return [{
      id: `${archetype.id}__${definition.id}`,
      archetype,
      applicable,
      scenario: definition
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
      closestPlayerDistance: metrics.closestPlayerDistance
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
  if (scenarioId === 'close_pressure' && contract.contactRole === 'ranged_controller' && (metrics.maxConsecutiveTooCloseTicks || 0) > 180) {
    findings.push(finding('ranged_boss_failed_to_recover_distance', 'fail', 'The ranged boss remained inside its minimum working distance for more than three seconds.', {
      preferredMinimumDistance: metrics.preferredMinimumDistance,
      tooCloseRatio: metrics.tooCloseRatio,
      maxConsecutiveTooCloseTicks: metrics.maxConsecutiveTooCloseTicks
    }));
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
        damageThroughWorldEvents: metrics.damageThroughWorldEvents
      }));
    }
    if ((metrics.projectileFiresWhileWorldBlocked || 0) > 0) {
      findings.push(finding('projectile_fired_through_cover', 'fail', 'A boss or owned ranged unit fired a projectile while solid world cover blocked its target line.', {
        projectileFiresWhileWorldBlocked: metrics.projectileFiresWhileWorldBlocked,
        blockedFireBySourceType: metrics.blockedFireBySourceType
      }));
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
    if ((metrics.longestNoActionSeconds || 0) > 12) {
      findings.push(finding('boss_recovery_stall', 'fail', 'The boss spent too long without attacking or changing combat state.', {
        longestNoActionSeconds: metrics.longestNoActionSeconds,
        finalState: metrics.finalState
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
  constructor({ bossId, scenarioId, startPosition, initialPlayerDistance, initialAuxiliaries = 0, preferredMinimumDistance = null }) {
    this.bossId = bossId;
    this.scenarioId = scenarioId;
    this.startPosition = { ...startPosition };
    this.initialPlayerDistance = initialPlayerDistance;
    this.initialAuxiliaries = initialAuxiliaries;
    const productionProfile = resolveBossBehaviorProfile(BOSS_ROOT_TYPE_BY_ID[bossId]);
    this.preferredMinimumDistance = preferredMinimumDistance ?? productionProfile?.preferredRange?.[0] ?? 0;
    this.simulationSeconds = 0;
    this.distanceTravelled = 0;
    this.closestPlayerDistance = Infinity;
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
  }

  addEvent(atMs, type, data = {}) {
    if (this.timeline.length < 60) this.timeline.push({ atMs: round(atMs, 1), type, ...data });
    else this.timelineOmitted++;
  }

  recordAIEvent(atMs, event = {}) {
    if (!event.type) return;
    const sourceType = event.sourceType || event.root?.userData?.type || 'unknown';
    const sourceRole = event.sourceRole
      || (event.isPrimary || event.root?.userData?.diagnosticActorId === 'boss_primary' ? 'boss' : 'auxiliary');
    const isBoss = sourceRole === 'boss';
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
    if (event.type === 'projectile_fired') {
      this.projectileFireEvents++;
      if (event.worldVisible === false) {
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
    const highFrequency = ['movement_blocked', 'movement_slid_around_ally', 'ally_displaced'].includes(event.type);
    if (!highFrequency || count <= 3) {
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
        distanceToPlayer: event.distanceToPlayer == null ? null : round(event.distanceToPlayer),
        distanceToBoss: event.distanceToBoss == null ? null : round(event.distanceToBoss),
        strikesBefore: event.strikesBefore ?? null,
        strikesAfter: event.strikesAfter ?? null,
        requestedMines: event.requestedMines ?? null,
        spawnedMines: event.spawnedMines ?? null
      });
    } else {
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
    this.addEvent(atMs, 'player_damaged', { amount: round(value), sourceType, sourceRole, sourceKind, worldVisible, directLine });
  }

  observeTick({
    atMs, dt, position, playerDistance, tracking = false, overlappingPlayer = false,
    penetratingPlayer = overlappingPlayer, insidePreferredMinimum = false,
    worldVisible = true, updatesThisTick = 1, telegraphActive = false,
    attackActive = false, state = 'idle', phase = null, phaseLabel = null,
    movementBlocked = false, blockedBySelfOwnedAuxiliary = false, movementBlockerType = null,
    auxiliaries = []
  }) {
    this.simulationSeconds += dt;
    const moved = Math.hypot(position.x - this._lastPosition.x, position.z - this._lastPosition.z);
    this.distanceTravelled += moved;
    this._lastPosition = { x: position.x, y: position.y, z: position.z };
    this.closestPlayerDistance = Math.min(this.closestPlayerDistance, playerDistance);
    this.sampleCount++;
    if (tracking) this.trackingSamples++;
    if (!worldVisible) this.worldBlockedSeconds += dt;
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
      this.tooCloseTicks++;
      this._consecutiveTooCloseTicks++;
      this.maxConsecutiveTooCloseTicks = Math.max(this.maxConsecutiveTooCloseTicks, this._consecutiveTooCloseTicks);
    } else {
      this._consecutiveTooCloseTicks = 0;
    }

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
    const metrics = {
      simulationSeconds: round(this.simulationSeconds, 2),
      distanceTravelled: round(this.distanceTravelled),
      initialPlayerDistance: round(this.initialPlayerDistance),
      closestPlayerDistance: round(Number.isFinite(this.closestPlayerDistance) ? this.closestPlayerDistance : 0),
      trackingRatio: round(this.trackingSamples / Math.max(1, this.sampleCount), 3),
      overlapRatio: round(this.playerOverlapTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveOverlapTicks: this.maxConsecutiveOverlapTicks,
      penetrationRatio: round(this.playerPenetrationTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutivePenetrationTicks: this.maxConsecutivePenetrationTicks,
      preferredMinimumDistance: round(this.preferredMinimumDistance),
      tooCloseRatio: round(this.tooCloseTicks / Math.max(1, this.sampleCount), 3),
      maxConsecutiveTooCloseTicks: this.maxConsecutiveTooCloseTicks,
      worldBlockedSeconds: round(this.worldBlockedSeconds, 2),
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
      damageEvents: this.damageEvents,
      damageTotal: round(this.damageTotal),
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
      metrics,
      timeline: this.timeline,
      timelineOmitted: this.timelineOmitted
    };
    result.assessment = evaluateBossReaction(result);
    return result;
  }
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
    schemaVersion: 3,
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
    results,
    errors,
    interruptions
  };
}
