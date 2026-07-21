const freezeProfile = (profile) => Object.freeze({
  ...profile,
  groundOffset: profile.groundOffset ?? (profile.movementLayer === 'ground' ? 0.8 : (profile.collisionHeight || 1.6) * 0.5),
  preferredRange: Object.freeze([...(profile.preferredRange || [0, Infinity])]),
  actions: Object.freeze([...(profile.actions || [])]),
  scenarios: Object.freeze([...(profile.scenarios || [])])
});

const GROUND_SCENARIOS = Object.freeze([
  'open_pursuit',
  'wall_occlusion',
  'last_known_search',
  'sight_reacquisition',
  'ally_blocking',
  'crossing_ally',
  'moving_target',
  'low_wall_navigation',
  'barrel_navigation',
  'narrow_choke',
  'duo_attack',
  'squad_attack',
  'mixed_squad_attack'
]);

const RANGED_SCENARIOS = Object.freeze([
  ...GROUND_SCENARIOS,
  'wall_edge_stability',
  'ally_fire_blocking',
  'range_recovery'
]);

const RUSHER_SCENARIOS = Object.freeze([
  ...GROUND_SCENARIOS,
  'clear_charge',
  'ally_blocked_charge',
  'wall_impact',
  'miss_recovery'
]);

const AIR_SCENARIOS = Object.freeze([
  'open_pursuit',
  'wall_occlusion',
  'sight_reacquisition',
  'moving_target',
  'aerial_congestion',
  'dive_corridor',
  'duo_attack',
  'squad_attack',
  'mixed_squad_attack'
]);

const PELICAN_SCENARIOS = Object.freeze([
  'open_pursuit',
  'wall_occlusion',
  'sight_reacquisition',
  'moving_target',
  'aerial_congestion',
  'pelican_bombing_cycle',
  'duo_attack',
  'squad_attack',
  'mixed_squad_attack'
]);

const SUPPORT_SCENARIOS = Object.freeze([
  'wall_occlusion',
  'sight_reacquisition',
  'injured_ally_cover',
  'injured_ally_exposed',
  'healthy_group',
  'last_survivor_bomb',
  'healer_non_stacking',
  'mixed_squad_attack'
]);

const WARDEN_SCENARIOS = Object.freeze([
  'wall_occlusion',
  'moving_target',
  'aerial_congestion',
  'outer_ring_retreat',
  'formation_separation',
  'child_damage_attribution'
]);

export const ENEMY_BEHAVIOR_PROFILES = Object.freeze({
  grunt: freezeProfile({
    id: 'grunt', role: 'melee', movementLayer: 'ground', collisionRadius: 0.58,
    collisionHeight: 1.6, bodyPriority: 2, preferredRange: [0, 2.3],
    actions: ['pursue', 'route', 'yield', 'melee'], scenarios: GROUND_SCENARIOS
  }),
  gruntling: freezeProfile({
    id: 'gruntling', role: 'melee', movementLayer: 'ground', collisionRadius: 0.34,
    collisionHeight: 1.0, bodyPriority: 0, preferredRange: [0, 1.8],
    actions: ['pursue', 'route', 'yield', 'melee'], scenarios: GROUND_SCENARIOS
  }),
  tank: freezeProfile({
    id: 'tank', role: 'tank', movementLayer: 'ground', collisionRadius: 0.92,
    collisionHeight: 2.25, bodyPriority: 4, canDisplace: true, preferredRange: [0, 2.4],
    actions: ['pursue', 'route', 'displace', 'melee', 'slam'], scenarios: GROUND_SCENARIOS
  }),
  rusher: freezeProfile({
    id: 'rusher', role: 'rusher', movementLayer: 'ground', collisionRadius: 0.52,
    collisionHeight: 1.55, bodyPriority: 3, chargeRadius: 0.7, preferredRange: [0, 5],
    actions: ['pursue', 'route', 'charge', 'recover'], scenarios: RUSHER_SCENARIOS
  }),
  rusher_elite: freezeProfile({
    id: 'rusher_elite', role: 'rusher', movementLayer: 'ground', collisionRadius: 0.56,
    collisionHeight: 1.65, bodyPriority: 3, chargeRadius: 0.76, preferredRange: [0, 5],
    actions: ['pursue', 'route', 'predict', 'charge', 'recover'], scenarios: RUSHER_SCENARIOS
  }),
  rusher_explosive: freezeProfile({
    id: 'rusher_explosive', role: 'rusher', movementLayer: 'ground', collisionRadius: 0.6,
    collisionHeight: 1.65, bodyPriority: 3, chargeRadius: 0.95, preferredRange: [0, 5],
    actions: ['pursue', 'route', 'reserve_wide_lane', 'charge', 'explode', 'recover'], scenarios: RUSHER_SCENARIOS
  }),
  bailiff: freezeProfile({
    id: 'bailiff', role: 'melee', movementLayer: 'ground', collisionRadius: 0.6,
    collisionHeight: 1.7, bodyPriority: 2, preferredRange: [0, 2.25],
    actions: ['pursue', 'route', 'gap_close', 'gavel_strike'], scenarios: GROUND_SCENARIOS
  }),
  shooter: freezeProfile({
    id: 'shooter', role: 'ranged', movementLayer: 'ground', collisionRadius: 0.55,
    collisionHeight: 1.7, bodyPriority: 1, preferredRange: [12, 18],
    actions: ['range', 'route', 'peek', 'ally_cover', 'aim', 'burst', 'counter_aim_evade', 'gun_butt', 'relocate'],
    scenarios: Object.freeze([...RANGED_SCENARIOS, 'ally_cover_usage'])
  }),
  sniper: freezeProfile({
    id: 'sniper', role: 'sniper', movementLayer: 'ground', collisionRadius: 0.55,
    collisionHeight: 1.75, bodyPriority: 1, preferredRange: [22, 30],
    actions: ['range', 'route', 'precision_anchor', 'aim', 'fire', 'tuck', 'relocate'],
    scenarios: Object.freeze([
      ...RANGED_SCENARIOS,
      'player_aiming', 'player_not_aiming', 'precision_position',
      'lost_los_cancellation', 'sniper_ally_obstruction'
    ])
  }),
  flyer: freezeProfile({
    id: 'flyer', role: 'air', movementLayer: 'air', collisionRadius: 0.48,
    collisionHeight: 0.9, bodyPriority: 2, preferredRange: [8, 12],
    actions: ['orbit', 'windup', 'dive', 'recover'], scenarios: AIR_SCENARIOS
  }),
  pelican: freezeProfile({
    id: 'pelican', role: 'air_bomber', movementLayer: 'air', collisionRadius: 1.05,
    collisionHeight: 1.3, bodyPriority: 3, preferredRange: [5, 18],
    actions: ['recharge', 'approach', 'drop_grenade', 'retreat'], scenarios: PELICAN_SCENARIOS
  }),
  healer: freezeProfile({
    id: 'healer', role: 'support', movementLayer: 'ground', collisionRadius: 0.55,
    collisionHeight: 1.65, bodyPriority: 1, preferredRange: [18, Infinity],
    actions: ['select_ally', 'seek_cover', 'hold', 'heal', 'retreat', 'last_survivor_bomb'], scenarios: SUPPORT_SCENARIOS
  }),
  warden: freezeProfile({
    id: 'warden', role: 'support', movementLayer: 'air', collisionRadius: 1.8,
    collisionHeight: 3.5, bodyPriority: 4, preferredRange: [18, Infinity],
    actions: ['outer_ring', 'retreat', 'maintain_swarm', 'recall'], scenarios: WARDEN_SCENARIOS
  })
});

export function resolveBehaviorId(value) {
  if (!value) return 'grunt';
  if (value === 'swarm_warden') return 'warden';
  return ENEMY_BEHAVIOR_PROFILES[value] ? value : 'grunt';
}

export function resolveBehaviorProfile(value) {
  return ENEMY_BEHAVIOR_PROFILES[resolveBehaviorId(value)];
}

export function isScenarioApplicable(enemyId, scenarioId) {
  return resolveBehaviorProfile(enemyId).scenarios.includes(scenarioId);
}
