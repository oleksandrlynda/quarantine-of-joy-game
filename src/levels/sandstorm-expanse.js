import { defineEncounterWave, defineLevel, defineSpawnEntrance, shiftLevelWaves } from './contracts.js';
import {
  AMMO_STATION_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  ENDURANCE_MONUMENT_COLLIDER_PROFILE,
  FILTER_RUIN_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  MED_CACHE_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  SANDBANK_COLLIDER_PROFILE,
  SCREEN_WALL_COLLIDER_PROFILE,
  STORM_BEACON_COLLIDER_PROFILE,
  STORM_SIREN_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  CARGO_GATE_COLLIDER_PROFILE,
  EXPANSE_BENT_TREE_COLLIDER_PROFILE,
  EXPANSE_DEAD_TREE_COLLIDER_PROFILE,
  EXPANSE_HESCO_COLLIDER_PROFILE,
  EXPANSE_TOWER_EDGE_COLLIDER_PROFILE,
  EXPANSE_WINDBREAK_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

export const SANDSTORM_EXPANSE_ASSET_IDS = Object.freeze([
  'sandstormbackdrop', 'sandbankkit', 'stormsiren', 'endurancemonument',
  'hesco', 'screenwall', 'retainingwall', 'roadblock', 'roadcurb', 'drainage',
  'roaddamage', 'benttree', 'deadtree', 'lightmast', 'tower', 'pipes', 'reel',
  'gabion', 'checkpoint', 'cargogate', 'reinforcementdoor', 'ammostation',
  'medcache', 'capturebeacon', 'powerrelay', 'stormbeacon', 'filterruin', 'windbreaks'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const EXPANSE_LIGHT_MASTS = Object.freeze([
  P('lightmast', -34, 14, .82, Math.PI / 2), P('lightmast', 34, 14, .82, -Math.PI / 2)
]);
const EXPANSE_TOWERS = Object.freeze([
  P('tower', -35, -14, .78, Math.PI / 2), P('tower', 35, -14, .78, -Math.PI / 2)
]);
const FAILURE_BEACON_PLACEMENTS = Object.freeze([
  P('capturebeacon', -22, -2, .76, 0, ['failureBeacon', 'westRoute']),
  P('powerrelay', 22, -2, .76, Math.PI, ['failureBeacon', 'eastRoute'])
]);
const SANDBANK_PLACEMENTS = Object.freeze([
  P('sandbankkit', -11, -7, .95, .18), P('sandbankkit', 11, -7, .9, -.2),
  P('sandbankkit', -11, 7, .88, -.18), P('sandbankkit', 11, 7, .96, .2)
]);
const EXPANSE_NORTH_PORTALS = Object.freeze([
  P('reinforcementdoor', -22, -29, .86, 0), P('cargogate', 0, -29, .82, 0), P('reinforcementdoor', 22, -29, .86, 0)
]);
const EXPANSE_SOUTH_PORTALS = Object.freeze([
  P('checkpoint', -22, 29, .82, Math.PI), P('cargogate', 0, 29, .82, Math.PI), P('checkpoint', 22, 29, .82, Math.PI)
]);
const EXPANSE_DEAD_TREE = P('deadtree', -33, -19, .9, .3);
const EXPANSE_BENT_TREE = P('benttree', 33, -18, .9, -.4);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const G = counts => Object.entries(counts).flatMap(([type, count]) => Array(count).fill(type));
const W = data => defineEncounterWave(data);
const GROUND_TYPES = Object.freeze(['grunt', 'shooter', 'rusher', 'rusher_elite', 'rusher_explosive', 'tank', 'healer', 'sniper']);
const GROUND_TYPES_NO_TANK = Object.freeze(GROUND_TYPES.filter(type => type !== 'tank'));
const AIR_TYPES = Object.freeze(['flyer', 'warden']);
const S = (id, position, facing, allow = GROUND_TYPES, clearance = { default: 1.5, tank: 2.6 }, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [41, 50], clearance, air, route: id
});

// The Expanse is intentionally larger than the campaign arenas. Three broad
// north/south routes reconnect through two sheltered cross-lines, so reduced
// visibility creates uncertainty without turning navigation into guesswork.
export const SANDSTORM_EXPANSE = shiftLevelWaves(defineLevel({
  id: 'sandstorm-expanse',
  nameKey: 'level.expanse.name',
  liberationTitleKey: 'level.expanse.enduranceComplete',
  liberationDetailKey: 'level.expanse.monumentOnline',
  firstWave: 41,
  finalWave: 50,
  size: [72, 60],
  playerSpawn: [0, 1.7, 25.5],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-8, 18]),
  bossClearZone: { center: [0, 1], radius: 5.5 },
  bossArenaBounds: Object.freeze({ minX: -34, maxX: 34, minZ: -28, maxZ: 28 }),
  bossAnchor: [0, .8, 0],
  weatherByWave: Object.freeze(Object.fromEntries(Array.from({ length: 10 }, (_, index) => [41 + index, 'expanse-sand-wind']))),
  stormByWave: Object.freeze({
    41: { normal: 24, heavy: 16, calmSeconds: 18, heavySeconds: 6 },
    42: { normal: 23, heavy: 15, calmSeconds: 16, heavySeconds: 7 },
    43: { normal: 23, heavy: 15, calmSeconds: 16, heavySeconds: 7 },
    44: { normal: 22, heavy: 14, calmSeconds: 14, heavySeconds: 8, startHeavy: true },
    45: { normal: 22, heavy: 15, calmSeconds: 15, heavySeconds: 7 },
    46: { normal: 21, heavy: 14, calmSeconds: 13, heavySeconds: 8 },
    47: { normal: 21, heavy: 14, calmSeconds: 13, heavySeconds: 8, startHeavy: true },
    48: { normal: 20, heavy: 13, calmSeconds: 12, heavySeconds: 9 },
    49: { normal: 19, heavy: 12, calmSeconds: 10, heavySeconds: 10, rotating: true, startHeavy: true },
    50: { normal: 18, heavy: 12, calmSeconds: 10, heavySeconds: 10, rotating: true }
  }),
  routes: Object.freeze([
    { id: 'west-beacon-route', color: '#64d8ca', clearance: 8, landmark: true },
    { id: 'siren-route', color: '#e5b34c', clearance: 9, landmark: true },
    { id: 'east-beacon-route', color: '#e27550', clearance: 8, flank: true },
    { id: 'north-shelter-crossline', color: '#d4c18c', clearance: 7.5, shelter: true },
    { id: 'south-supply-crossline', color: '#d4c18c', clearance: 7.5, shelter: true }
  ]),
  assets: Object.freeze([
    // Three modestly scaled skyline strips cover the wider horizon without
    // intersecting each other or dwarfing the playable foreground.
    P('sandstormbackdrop', -31, -39.5, 1.1), P('sandstormbackdrop', 0, -41, 1.1), P('sandstormbackdrop', 31, -39.5, 1.1),

    P('stormsiren', 0, -20.5, 1.18, 0, ['expanseLandmark']),
    P('stormbeacon', -22, -18, .92, 0, ['expanseBeacon', 'westRoute']),
    P('stormbeacon', 0, -18, .92, 0, ['expanseBeacon', 'centerRoute']),
    P('stormbeacon', 22, -18, .92, 0, ['expanseBeacon', 'eastRoute']),
    P('endurancemonument', 0, 20.5, 1.06, Math.PI, ['enduranceComplete', 'liberation']),

    // The two resupply pockets are enclosed on their storm-facing edges only;
    // the open faces reconnect directly to all three combat routes.
    P('windbreaks', -25, 13.5, .94, Math.PI / 2), P('hesco', -29, 16.5, .9),
    P('ammostation', -24, 16, .9, Math.PI / 2), P('medcache', -20.5, 16, .86, -Math.PI / 2),
    P('windbreaks', 25, 13.5, .94, -Math.PI / 2), P('hesco', 29, 16.5, .9),
    P('ammostation', 24, 16, .9, -Math.PI / 2), P('medcache', 20.5, 16, .86, Math.PI / 2),

    // Low islands live between routes, never across them. They create short
    // decisions under fog while keeping the top view visually continuous.
    ...SANDBANK_PLACEMENTS,
    P('filterruin', -31, -7, .82, Math.PI / 2), P('filterruin', 31, -7, .82, -Math.PI / 2),
    P('screenwall', -32, 6, .88, Math.PI / 2), P('screenwall', 32, 6, .88, -Math.PI / 2),
    P('gabion', -12, 18, .86, .08), P('gabion', 12, 18, .86, -.08),
    P('roadblock', -12, -18, .82, 0), P('roadblock', 12, -18, .82, Math.PI),
    P('pipes', -31, 23, .8, Math.PI / 2), P('reel', 31, 23, .8, -Math.PI / 2),
    EXPANSE_DEAD_TREE, EXPANSE_BENT_TREE,

    // Objective dressing uses the same bounded profiles as its production models.
    ...FAILURE_BEACON_PLACEMENTS,

    // Perimeter entrances visibly explain every ground reinforcement family.
    ...EXPANSE_NORTH_PORTALS,
    ...EXPANSE_SOUTH_PORTALS,
    ...EXPANSE_TOWERS,
    ...EXPANSE_LIGHT_MASTS
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -30, 72, 1, 5), B('south-boundary', 0, 30, 72, 1, 5),
    B('west-boundary', -36, 0, 1, 60, 5), B('east-boundary', 36, 0, 1, 60, 5),
    ...SANDBANK_PLACEMENTS.flatMap((placement, index) => assetProfile(placement, `sandbank-island-${index + 1}`, SANDBANK_COLLIDER_PROFILE)),
    ...assetProfile(P('stormsiren', 0, -20.5, 1.18), 'storm-siren', STORM_SIREN_COLLIDER_PROFILE),
    ...assetProfile(P('endurancemonument', 0, 20.5, 1.06, Math.PI, ['enduranceComplete']), 'endurance-monument', ENDURANCE_MONUMENT_COLLIDER_PROFILE),
    ...assetProfile(P('stormbeacon', -22, -18, .92), 'west-storm-beacon', STORM_BEACON_COLLIDER_PROFILE),
    ...assetProfile(P('stormbeacon', 0, -18, .92), 'center-storm-beacon', STORM_BEACON_COLLIDER_PROFILE),
    ...assetProfile(P('stormbeacon', 22, -18, .92), 'east-storm-beacon', STORM_BEACON_COLLIDER_PROFILE),
    ...assetProfile(P('windbreaks', -25, 13.5, .94, Math.PI / 2), 'west-windbreak', EXPANSE_WINDBREAK_COLLIDER_PROFILE),
    ...assetProfile(P('hesco', -29, 16.5, .9), 'west-hesco', EXPANSE_HESCO_COLLIDER_PROFILE),
    ...assetProfile(P('ammostation', -24, 16, .9, Math.PI / 2), 'west-ammo', AMMO_STATION_COLLIDER_PROFILE),
    ...assetProfile(P('medcache', -20.5, 16, .86, -Math.PI / 2), 'west-med', MED_CACHE_COLLIDER_PROFILE),
    ...assetProfile(P('windbreaks', 25, 13.5, .94, -Math.PI / 2), 'east-windbreak', EXPANSE_WINDBREAK_COLLIDER_PROFILE),
    ...assetProfile(P('hesco', 29, 16.5, .9), 'east-hesco', EXPANSE_HESCO_COLLIDER_PROFILE),
    ...assetProfile(P('ammostation', 24, 16, .9, -Math.PI / 2), 'east-ammo', AMMO_STATION_COLLIDER_PROFILE),
    ...assetProfile(P('medcache', 20.5, 16, .86, Math.PI / 2), 'east-med', MED_CACHE_COLLIDER_PROFILE),
    ...assetProfile(P('filterruin', -31, -7, .82, Math.PI / 2), 'west-filter-ruin', FILTER_RUIN_COLLIDER_PROFILE),
    ...assetProfile(P('filterruin', 31, -7, .82, -Math.PI / 2), 'east-filter-ruin', FILTER_RUIN_COLLIDER_PROFILE),
    ...assetProfile(P('screenwall', -32, 6, .88, Math.PI / 2), 'west-screen', SCREEN_WALL_COLLIDER_PROFILE),
    ...assetProfile(P('screenwall', 32, 6, .88, -Math.PI / 2), 'east-screen', SCREEN_WALL_COLLIDER_PROFILE),
    ...assetProfile(P('gabion', -12, 18, .86, .08), 'north-west-gabion', GABION_COLLIDER_PROFILE),
    ...assetProfile(P('gabion', 12, 18, .86, -.08), 'north-east-gabion', GABION_COLLIDER_PROFILE),
    ...assetProfile(P('roadblock', -12, -18, .82), 'south-west-roadblock', ROADBLOCK_COLLIDER_PROFILE),
    ...assetProfile(P('roadblock', 12, -18, .82, Math.PI), 'south-east-roadblock', ROADBLOCK_COLLIDER_PROFILE),
    ...assetProfile(P('pipes', -31, 23, .8, Math.PI / 2), 'west-pipes', PIPES_COLLIDER_PROFILE),
    ...assetProfile(P('reel', 31, 23, .8, -Math.PI / 2), 'east-reel', REEL_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_DEAD_TREE, 'west-dead-tree', EXPANSE_DEAD_TREE_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_BENT_TREE, 'east-bent-tree', EXPANSE_BENT_TREE_COLLIDER_PROFILE),
    ...EXPANSE_TOWERS.flatMap((placement, index) => assetProfile(placement, `perimeter-tower-${index + 1}`, EXPANSE_TOWER_EDGE_COLLIDER_PROFILE)),
    ...assetProfile(EXPANSE_LIGHT_MASTS[0], 'south-west-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_LIGHT_MASTS[1], 'south-east-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(FAILURE_BEACON_PLACEMENTS[0], 'failure-beacon-west', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(FAILURE_BEACON_PLACEMENTS[1], 'failure-beacon-east', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_NORTH_PORTALS[0], 'north-west-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_NORTH_PORTALS[1], 'north-cargo-gate', CARGO_GATE_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_NORTH_PORTALS[2], 'north-east-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_SOUTH_PORTALS[0], 'south-west-checkpoint', CHECKPOINT_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_SOUTH_PORTALS[1], 'south-cargo-gate', CARGO_GATE_COLLIDER_PROFILE),
    ...assetProfile(EXPANSE_SOUTH_PORTALS[2], 'south-east-checkpoint', CHECKPOINT_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [72, 60] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    // Reserve the full tank pad on the arena side of the now-solid perimeter
    // props. The visual portals remain behind each spawn and still explain it.
    S('north-west-ground', [-22, .8, -25.5], [0, 0, 1]),
    S('north-center-ground', [0, .8, -25.5], [0, 0, 1]),
    S('north-east-ground', [22, .8, -25.5], [0, 0, 1]),
    S('south-west-ground', [-22, .8, 25.5], [0, 0, -1]),
    // The monument and cargo gate leave a healthy infantry lane but not a full
    // 2.6 m tank reservation. Tanks retain eight other ground entrances.
    S('south-center-ground', [0, .8, 25.5], [0, 0, -1], GROUND_TYPES_NO_TANK),
    S('south-east-ground', [22, .8, 25.5], [0, 0, -1]),
    S('west-north-ground', [-31.5, .8, -14], [1, 0, 0]),
    S('west-south-ground', [-26, .8, 22], [1, 0, 0]),
    S('east-north-ground', [31.5, .8, -14], [-1, 0, 0]),
    S('east-south-ground', [27, .8, 22], [-1, 0, 0]),
    S('north-west-air', [-20, 8, -25], [0, 0, 1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('north-east-air', [20, 8, -25], [0, 0, 1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('west-air', [-32, 8, 0], [1, 0, 0], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('east-air', [32, 8, 0], [-1, 0, 0], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('south-air', [0, 8, 25], [0, 0, -1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true)
  ]),
  objectives: Object.freeze({
    supplyHold: Object.freeze({ position: [-24, 16], radius: 4.25, seconds: 28 }),
    failureBeacons: Object.freeze([
      Object.freeze({ id: 'west-storm-beacon', nameKey: 'level.expanse.westBeacon', position: [-22, -2], radius: 3.25, seconds: 9 }),
      Object.freeze({ id: 'east-storm-beacon', nameKey: 'level.expanse.eastBeacon', position: [22, -2], radius: 3.25, seconds: 9 })
    ])
  }),
  waves: Object.freeze({
    41: W({ id: 'into-dust', titleKey: 'level.expanse.wave41', activeCap: 22, ammoPackages: [[-8,18]], healthPackages: [[8,18]], packages: [
      G({ grunt: 4, shooter: 4, flyer: 4, rusher: 2 }), G({ grunt: 3, shooter: 4, flyer: 4, tank: 1, healer: 1, sniper: 1 }),
      G({ grunt: 3, shooter: 3, flyer: 4, rusher: 2, tank: 1, healer: 1 }), G({ grunt: 3, shooter: 3, flyer: 4, rusher: 1, sniper: 1, healer: 1 })
    ] }),
    42: W({ id: 'crosswind', titleKey: 'level.expanse.wave42', activeCap: 23, packages: [
      G({ grunt: 3, shooter: 3, flyer: 6, rusher: 2, healer: 1 }), G({ grunt: 3, shooter: 4, flyer: 5, tank: 1, sniper: 1, rusher: 1 }),
      G({ grunt: 3, shooter: 3, flyer: 4, rusher: 2, healer: 1, sniper: 1 }), G({ grunt: 3, shooter: 3, flyer: 4, rusher: 2, tank: 1, healer: 1 })
    ] }),
    43: W({ id: 'firing-line', titleKey: 'level.expanse.wave43', activeCap: 23, packages: [
      G({ grunt: 3, shooter: 5, sniper: 2, flyer: 4, tank: 1 }), G({ grunt: 3, shooter: 4, sniper: 2, flyer: 4, rusher: 2 }),
      G({ grunt: 3, shooter: 4, sniper: 1, flyer: 4, rusher: 2, healer: 1 }), G({ grunt: 3, shooter: 4, sniper: 1, flyer: 4, tank: 1, healer: 1 })
    ] }),
    44: W({ id: 'blind-push', titleKey: 'level.expanse.wave44', activeCap: 24, packages: [
      G({ grunt: 3, shooter: 4, flyer: 4, rusher: 2, tank: 2, healer: 1 }), G({ grunt: 3, shooter: 4, flyer: 4, rusher: 3, tank: 1, sniper: 1 }),
      G({ grunt: 3, shooter: 4, flyer: 4, rusher_elite: 2, tank: 1, healer: 1 }), G({ grunt: 3, shooter: 3, flyer: 4, rusher: 2, tank: 1, sniper: 1 })
    ] }),
    45: W({ id: 'supply-break', titleKey: 'level.expanse.wave45', objective: 'hold', objectiveTarget: 'supplyHold', activeCap: 24, packages: [
      G({ grunt: 4, shooter: 5, flyer: 5, rusher: 2, tank: 2, healer: 2, sniper: 1 }),
      G({ grunt: 3, shooter: 5, flyer: 5, rusher_elite: 2, tank: 2, healer: 2, sniper: 2 }),
      G({ grunt: 3, shooter: 4, flyer: 5, rusher: 2, tank: 2, healer: 2, sniper: 1 })
    ] }),
    46: W({ id: 'swarm-front', titleKey: 'level.expanse.wave46', activeCap: 25, packages: [
      G({ grunt: 3, shooter: 4, flyer: 7, rusher: 2, healer: 1 }), G({ grunt: 3, shooter: 4, flyer: 7, tank: 1, sniper: 1, healer: 1 }),
      G({ grunt: 3, shooter: 4, flyer: 7, rusher: 2, tank: 1 }), G({ grunt: 3, shooter: 4, flyer: 7, rusher_elite: 1, sniper: 1, healer: 1 })
    ] }),
    47: W({ id: 'crossfire', titleKey: 'level.expanse.wave47', activeCap: 25, packages: [
      G({ grunt: 3, shooter: 5, sniper: 2, flyer: 4, tank: 2, healer: 1 }), G({ grunt: 3, shooter: 5, sniper: 2, flyer: 4, tank: 2, rusher: 1 }),
      G({ grunt: 3, shooter: 4, sniper: 2, flyer: 4, tank: 2, healer: 1, rusher: 1 }), G({ grunt: 3, shooter: 4, sniper: 2, flyer: 4, tank: 1, warden: 1, healer: 1, rusher_elite: 1 })
    ] }),
    48: W({ id: 'beacon-failure', titleKey: 'level.expanse.wave48', objective: 'multi-capture', objectiveTargets: 'failureBeacons', activeCap: 25, packages: [
      G({ grunt: 4, shooter: 6, sniper: 2, flyer: 6, tank: 2, rusher: 2, healer: 2 }),
      G({ grunt: 4, shooter: 6, sniper: 2, flyer: 6, tank: 2, rusher_elite: 2, healer: 2 }),
      G({ grunt: 4, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher: 2, healer: 2, rusher_explosive: 1 })
    ] }),
    49: W({ id: 'no-shelter', titleKey: 'level.expanse.wave49', activeCap: 26, reinforcementClearFraction: .48, packages: [
      G({ grunt: 3, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher: 2 }), G({ grunt: 3, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher_elite: 1, healer: 1 }),
      G({ grunt: 3, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher_explosive: 1, healer: 1 }), G({ grunt: 3, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher: 1, healer: 1 })
    ] }),
    50: W({ id: 'last-horizon', titleKey: 'level.expanse.wave50', activeCap: 26, reinforcementClearFraction: .5, packages: [
      G({ grunt: 4, shooter: 6, sniper: 2, flyer: 6, tank: 2 }), G({ grunt: 4, shooter: 6, sniper: 2, flyer: 6, tank: 1, healer: 1 }),
      G({ grunt: 3, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher_elite: 1, healer: 1 }),
      G({ grunt: 1, shooter: 5, sniper: 2, flyer: 6, tank: 2, rusher_elite: 1, rusher_explosive: 1, healer: 1, warden: 1 })
    ] })
  })
}), 1);
