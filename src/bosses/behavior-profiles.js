const freezeProfile = profile => Object.freeze({
  movementLayer: 'ground',
  groundOffset: 0.8,
  collisionRadius: 1,
  collisionHeight: 2,
  bodyPriority: 6,
  canDisplace: true,
  ...profile,
  preferredRange: Object.freeze([...(profile.preferredRange || [0, Infinity])])
});

// Production collision and positioning contracts for every registered boss
// body. EnemyManager consumes these before falling back to a regular-enemy
// profile, so a large boss can never silently inherit Grunt dimensions.
export const BOSS_BEHAVIOR_PROFILES = Object.freeze({
  boss_broodmaker: freezeProfile({
    id: 'boss_broodmaker', role: 'ranged_controller', collisionRadius: 2.15,
    collisionHeight: 3.8, bodyPriority: 8, preferredRange: [15, 22]
  }),
  boss_broodmaker_heavy: freezeProfile({
    id: 'boss_broodmaker_heavy', role: 'ranged_controller', collisionRadius: 2.45,
    collisionHeight: 4.2, bodyPriority: 9, preferredRange: [15, 22]
  }),
  boss_sanitizer: freezeProfile({
    id: 'boss_sanitizer', role: 'ranged_controller', collisionRadius: 1.9,
    collisionHeight: 3.7, bodyPriority: 8, preferredRange: [13, 22]
  }),
  boss_captain: freezeProfile({
    id: 'boss_captain', role: 'ranged_controller', collisionRadius: 1.55,
    collisionHeight: 3.2, bodyPriority: 7, preferredRange: [14, 23]
  }),
  boss_shard: freezeProfile({
    id: 'boss_shard', role: 'ranged_controller', collisionRadius: 1.75,
    collisionHeight: 3.5, bodyPriority: 8, preferredRange: [13, 22]
  }),
  boss_hydraclone: freezeProfile({
    id: 'boss_hydraclone', role: 'melee', collisionRadius: 1.35,
    collisionHeight: 3.1, bodyPriority: 8, preferredRange: [0, 3]
  }),
  hydraclone: freezeProfile({
    id: 'hydraclone', role: 'melee', collisionRadius: 0.78,
    collisionHeight: 2.1, bodyPriority: 5, preferredRange: [0, 2.3]
  }),
  boss_strike_adjudicator: freezeProfile({
    id: 'boss_strike_adjudicator', role: 'hybrid', collisionRadius: 1.85,
    collisionHeight: 3.8, bodyPriority: 8, preferredRange: [3, 7]
  }),
  boss_algorithm: freezeProfile({
    id: 'boss_algorithm', role: 'anchor', collisionRadius: 2.7,
    collisionHeight: 5.4, bodyPriority: 10, canDisplace: false, preferredRange: [8, Infinity]
  }),
  boss_algorithm_echo: freezeProfile({
    id: 'boss_algorithm_echo', role: 'ranged', collisionRadius: 0.7,
    collisionHeight: 2, bodyPriority: 4, canDisplace: false, preferredRange: [8, 18]
  }),
  boss_node: freezeProfile({
    id: 'boss_node', role: 'objective', collisionRadius: 0.72,
    collisionHeight: 1.8, bodyPriority: 10, canDisplace: false
  }),
  boss_node_algorithm: freezeProfile({
    id: 'boss_node_algorithm', role: 'objective', collisionRadius: 0.82,
    collisionHeight: 2.1, bodyPriority: 10, canDisplace: false
  }),
  purge_node: freezeProfile({
    id: 'purge_node', role: 'objective', collisionRadius: 0.75,
    collisionHeight: 1.9, bodyPriority: 10, canDisplace: false
  }),
  boss_pod_engine: freezeProfile({
    id: 'boss_pod_engine', role: 'objective', movementLayer: 'air', groundOffset: 1.2,
    collisionRadius: 0.9, collisionHeight: 1.8, bodyPriority: 10, canDisplace: false
  }),
  boss_shard_mirage: freezeProfile({
    id: 'boss_shard_mirage', role: 'decoy', collisionRadius: 0.55,
    collisionHeight: 1.8, bodyPriority: 1, canDisplace: false
  })
});

export function resolveBossBehaviorProfile(value) {
  return BOSS_BEHAVIOR_PROFILES[value] || null;
}
