import { defineEncounterWave, defineLevel, defineSpawnEntrance, shiftLevelWaves } from './contracts.js';
import {
  AMMO_STATION_COLLIDER_PROFILE,
  ARCHIVE_SEED_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  FLOODGATE_KIT_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  GENERATOR_COLLIDER_PROFILE,
  GREYWATER_CORE_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  MED_CACHE_COLLIDER_PROFILE,
  PEEK_COVER_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  PUMP_TURBINE_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  SLUICE_CONDUITS_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  CARGO_LIFT_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE,
  SHUTTER_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

export const FLOODGATE_CONTINUITY_ASSET_IDS = Object.freeze([
  'floodgatebackdrop', 'floodgatekit', 'pumpturbine', 'sluiceconduits', 'archiveseed',
  'greywatercore', 'waterlinedebris', 'retainingwall', 'concretewall', 'servicewall',
  'drainage', 'pipes', 'generator', 'reel', 'tower', 'catwalk', 'footbridge', 'stairs',
  'ladderplatform', 'loadingramp', 'shutter', 'reinforcementdoor', 'cargolift',
  'floorhatch', 'breachvent', 'terminal', 'powerrelay', 'capturebeacon', 'ammostation',
  'medcache', 'gabion', 'peekcover', 'breakablecover', 'lightmast'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = [], options = {}) => ({
  asset, position: [x, 0, z], scale, yaw, tags, ...options
});
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
// Keep practical-light solids clear of the west/east vent pads at z=-16.
const FLOODGATE_LIGHT_MASTS = Object.freeze([
  P('lightmast', -34, -22, .85, Math.PI / 2), P('lightmast', 34, -22, .85, -Math.PI / 2)
]);
const HANDSHAKE_RELAY_PLACEMENTS = Object.freeze([
  P('terminal', -22, -16, .78, 0, ['handshakeRelay']),
  P('powerrelay', 22, -16, .78, Math.PI, ['handshakeRelay'])
]);
const PUMP_CONTROL_PLACEMENTS = Object.freeze([
  P('capturebeacon', -22, 0, .72, 0, ['pumpControl']),
  P('capturebeacon', 0, 0, .72, 0, ['pumpControl']),
  P('capturebeacon', 22, 0, .72, 0, ['pumpControl'])
]);
const FLOODGATE_NORTH_PORTALS = Object.freeze([
  P('reinforcementdoor', -22, -32, .86, 0),
  P('shutter', 0, -32, .82, 0),
  P('reinforcementdoor', 22, -32, .86, 0)
]);
const FLOODGATE_SOUTH_PORTALS = Object.freeze([
  P('cargolift', -22, 32, .82, Math.PI),
  P('shutter', 0, 32, .82, Math.PI),
  P('cargolift', 22, 32, .82, Math.PI)
]);
const FLOODGATE_BREACH_VENTS = Object.freeze([
  P('breachvent', -37, -16, .8, Math.PI / 2),
  P('breachvent', -37, 16, .8, Math.PI / 2),
  P('breachvent', 37, -16, .8, -Math.PI / 2),
  P('breachvent', 37, 16, .8, -Math.PI / 2)
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const G = counts => Object.entries(counts).flatMap(([type, count]) => Array(count).fill(type));
const W = data => defineEncounterWave(data);
const GROUND_TYPES = Object.freeze(['grunt', 'shooter', 'rusher', 'rusher_elite', 'rusher_explosive', 'tank', 'healer', 'sniper']);
const AIR_TYPES = Object.freeze(['flyer', 'warden']);
const S = (id, position, facing, allow = GROUND_TYPES, clearance = { default: 1.5, tank: 2.7 }, air = false, activeWaves = [51, 71]) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves, clearance, air, route: id
});

export const FLOODGATE_WATER_BY_WAVE = Object.freeze({
  51: 'dry', 52: 'low', 53: 'medium', 54: 'low', 55: 'high', 56: 'medium', 57: 'low',
  58: 'low', 59: 'medium', 60: 'high', 61: 'low', 62: 'medium', 63: 'high', 64: 'medium',
  65: 'low', 66: 'medium', 67: 'high', 68: 'low', 69: 'high', 70: 'medium', 71: 'high'
});

const BEATS = Object.freeze({
  51: { id: 'signal-below' }, 52: { id: 'sealed-response' }, 53: { id: 'first-inflow' },
  54: { id: 'maintenance-wake' }, 55: { id: 'spillway-rise' }, 56: { id: 'protocol-warden', warden: true },
  57: { id: 'cut-handshake', objective: 'multi-capture', objectiveTargets: 'handshakeRelays' },
  58: { id: 'descent' }, 59: { id: 'water-logic' }, 60: { id: 'high-channel' },
  61: { id: 'turbine-crossfire' }, 62: { id: 'bridge-order' }, 63: { id: 'maintenance-command', warden: true },
  64: { id: 'drain-archive', objective: 'multi-capture', objectiveTargets: 'pumpControls' },
  65: { id: 'vault-entry' }, 66: { id: 'seed-guard' }, 67: { id: 'cold-stack' },
  68: { id: 'continuity-lock' }, 69: { id: 'data-flood' },
  70: { id: 'purge-seeds', objective: 'multi-capture', objectiveTargets: 'archiveSeeds', warden: true },
  71: { id: 'data-deluge', objective: 'hold', objectiveTarget: 'masterOverride', warden: true }
});

function packageFor(wave, packageIndex) {
  const chapter = wave <= 57 ? 0 : wave <= 64 ? 1 : 2;
  const pressure = wave - 51;
  const counts = {
    grunt: 3 + ((wave + packageIndex) % 3),
    shooter: 3 + chapter + ((wave + packageIndex * 2) % 3),
    flyer: 2 + chapter + ((wave + packageIndex) % 3),
    rusher: 1 + ((pressure + packageIndex) % 3),
    tank: chapter + ((wave + packageIndex) % 2),
    healer: packageIndex % 2,
    sniper: wave >= 53 ? ((wave + packageIndex) % 2) : 0
  };
  if (wave >= 58 && packageIndex === 2) counts.rusher_elite = 1;
  if (wave >= 65 && packageIndex === 3) counts.rusher_explosive = 1;
  if (BEATS[wave].warden && packageIndex === 3) counts.warden = 1;
  return G(counts);
}

const WAVES = Object.freeze(Object.fromEntries(Object.entries(BEATS).map(([waveKey, beat]) => {
  const wave = Number(waveKey);
  const objective = beat.objective;
  const packageCount = objective === 'hold' ? 3 : objective === 'multi-capture'
    ? (beat.objectiveTargets === 'handshakeRelays' ? 3 : 4)
    : 4;
  return [wave, W({
    id: beat.id,
    titleKey: `level.floodgate.wave${wave}`,
    activeCap: Math.min(32, 24 + Math.floor((wave - 51) / 4)),
    reinforcementClearFraction: wave >= 65 ? .48 : .54,
    ...(objective ? { objective, ...(beat.objectiveTarget ? { objectiveTarget: beat.objectiveTarget } : {}), ...(beat.objectiveTargets ? { objectiveTargets: beat.objectiveTargets } : {}) } : {}),
    packages: Array.from({ length: packageCount }, (_, index) => packageFor(wave, index))
  })];
})));

export const FLOODGATE_CONTINUITY = shiftLevelWaves(defineLevel({
  id: 'floodgate-continuity',
  nameKey: 'level.floodgate.name',
  liberationTitleKey: 'level.floodgate.coreOffline',
  liberationDetailKey: 'level.floodgate.protocolStopped',
  firstWave: 51,
  finalWave: 71,
  size: [76, 66],
  playerSpawn: [-22, 1.7, 29],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-24, 21]),
  bossClearZone: { center: [0, -18], radius: 6 },
  bossArenaBounds: Object.freeze({ minX: -36, maxX: 36, minZ: -31, maxZ: 31 }),
  bossAnchor: [0, .8, -18],
  waterByWave: FLOODGATE_WATER_BY_WAVE,
  checkpointStarts: Object.freeze({ 58: 'spillway', 65: 'galleries' }),
  weatherByWave: Object.freeze(Object.fromEntries(Array.from({ length: 21 }, (_, index) => {
    const wave = 51 + index;
    const mode = wave <= 57 ? 'floodgate-spillway-rain'
      : wave <= 64 ? 'floodgate-gallery-fog'
        : wave === 71 ? 'floodgate-deluge-rain+fog'
          : 'floodgate-vault-fog';
    return [wave, mode];
  }))),
  routes: Object.freeze([
    { id: 'west-dry-maintenance', color: '#e4b44e', clearance: 9, alwaysDry: true, landmark: true },
    { id: 'central-sluice-channel', color: '#54d8d4', clearance: 10, floodable: true },
    { id: 'east-overhead-service', color: '#9e83ef', clearance: 8, elevated: true },
    { id: 'north-floodgate-crossing', color: '#d7e6df', clearance: 7.5, reconnect: true },
    { id: 'central-pump-crossing', color: '#d7e6df', clearance: 7.5, reconnect: true },
    { id: 'south-vault-crossing', color: '#d7e6df', clearance: 7.5, reconnect: true }
  ]),
  assets: Object.freeze([
    P('floodgatebackdrop', -30, -42, 1.04), P('floodgatebackdrop', 0, -42.5, 1.04), P('floodgatebackdrop', 30, -42, 1.04),
    P('floodgatekit', 0, -27, 1.12, 0, ['floodgateLandmark'], { variantFamily: 'floodgate', initialVariant: 'closed' }),
    P('pumpturbine', -25.5, -10, .88, Math.PI / 2), P('pumpturbine', 25.5, -10, .88, -Math.PI / 2),
    P('sluiceconduits', 0, -9, .9), P('sluiceconduits', 0, 10, .88, Math.PI),
    P('archiveseed', -14, 8, .9, 0, ['archiveSeeds', 'seed1'], { variantFamily: 'archiveSeed', initialVariant: 'shielded' }),
    P('archiveseed', 0, 8, .9, 0, ['archiveSeeds', 'seed2'], { variantFamily: 'archiveSeed', initialVariant: 'shielded' }),
    P('archiveseed', 14, 8, .9, 0, ['archiveSeeds', 'seed3'], { variantFamily: 'archiveSeed', initialVariant: 'shielded' }),
    P('greywatercore', 0, -18, 1.05, 0, ['greywaterCore', 'liberation']),

    P('ammostation', -30, 23, .88, Math.PI / 2), P('medcache', -18, 23, .85, -Math.PI / 2),
    P('ammostation', 30, 23, .88, -Math.PI / 2), P('medcache', 18, 23, .85, Math.PI / 2),
    ...HANDSHAKE_RELAY_PLACEMENTS,
    ...PUMP_CONTROL_PLACEMENTS,

    P('waterlinedebris', -29, -21, .78, .18), P('waterlinedebris', 29, -21, .78, -.18),
    P('waterlinedebris', -28, 17, .74, -.12), P('waterlinedebris', 28, 17, .74, .12),
    P('pipes', -32, -3, .82, Math.PI / 2), P('reel', 32, -3, .82, -Math.PI / 2),
    P('generator', -31, 9, .8, Math.PI / 2), P('generator', 31, 9, .8, -Math.PI / 2),
    P('gabion', -13, -6, .82, .08), P('gabion', 13, -6, .82, -.08),
    P('peekcover', -13, 16, .82, Math.PI), P('peekcover', 13, 16, .82, Math.PI),
    P('breakablecover', -13, 25, .8), P('breakablecover', 13, 25, .8, Math.PI),
    ...FLOODGATE_LIGHT_MASTS,

    ...FLOODGATE_NORTH_PORTALS,
    ...FLOODGATE_SOUTH_PORTALS,
    FLOODGATE_BREACH_VENTS[0], P('floorhatch', -35, 3.5, .8, Math.PI / 2), FLOODGATE_BREACH_VENTS[1],
    FLOODGATE_BREACH_VENTS[2], P('floorhatch', 35, 3.5, .8, -Math.PI / 2), FLOODGATE_BREACH_VENTS[3]
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -33, 76, 1, 5), B('south-boundary', 0, 33, 76, 1, 5),
    B('west-boundary', -38, 0, 1, 66, 5), B('east-boundary', 38, 0, 1, 66, 5),
    B('medium-channel-lock', 0, 0, 12, 1.2, 1.2, .6, { tags: ['floodMediumLock'] }),
    B('high-east-lock', 22, 14, 9, 1.2, 1.2, .6, { tags: ['floodHighLock'] }),
    ...assetProfile(P('floodgatekit', 0, -27, 1.12), 'north-floodgate', FLOODGATE_KIT_COLLIDER_PROFILE),
    ...assetProfile(P('pumpturbine', -25.5, -10, .88, Math.PI / 2), 'west-pump', PUMP_TURBINE_COLLIDER_PROFILE),
    ...assetProfile(P('pumpturbine', 25.5, -10, .88, -Math.PI / 2), 'east-pump', PUMP_TURBINE_COLLIDER_PROFILE),
    ...assetProfile(P('sluiceconduits', 0, -9, .9), 'north-sluice', SLUICE_CONDUITS_COLLIDER_PROFILE),
    ...assetProfile(P('sluiceconduits', 0, 10, .88, Math.PI), 'south-sluice', SLUICE_CONDUITS_COLLIDER_PROFILE),
    ...assetProfile(P('archiveseed', -14, 8, .9), 'west-archive-seed', ARCHIVE_SEED_COLLIDER_PROFILE),
    ...assetProfile(P('archiveseed', 0, 8, .9), 'center-archive-seed', ARCHIVE_SEED_COLLIDER_PROFILE),
    ...assetProfile(P('archiveseed', 14, 8, .9), 'east-archive-seed', ARCHIVE_SEED_COLLIDER_PROFILE),
    ...assetProfile(P('greywatercore', 0, -18, 1.05), 'greywater-core', GREYWATER_CORE_COLLIDER_PROFILE),
    ...assetProfile(P('ammostation', -30, 23, .88, Math.PI / 2), 'west-ammo', AMMO_STATION_COLLIDER_PROFILE),
    ...assetProfile(P('medcache', -18, 23, .85, -Math.PI / 2), 'west-med', MED_CACHE_COLLIDER_PROFILE),
    ...assetProfile(P('ammostation', 30, 23, .88, -Math.PI / 2), 'east-ammo', AMMO_STATION_COLLIDER_PROFILE),
    ...assetProfile(P('medcache', 18, 23, .85, Math.PI / 2), 'east-med', MED_CACHE_COLLIDER_PROFILE),
    ...assetProfile(P('pipes', -32, -3, .82, Math.PI / 2), 'west-pipes', PIPES_COLLIDER_PROFILE),
    ...assetProfile(P('reel', 32, -3, .82, -Math.PI / 2), 'east-reel', REEL_COLLIDER_PROFILE),
    ...assetProfile(P('generator', -31, 9, .8, Math.PI / 2), 'west-generator', GENERATOR_COLLIDER_PROFILE),
    ...assetProfile(P('generator', 31, 9, .8, -Math.PI / 2), 'east-generator', GENERATOR_COLLIDER_PROFILE),
    ...assetProfile(P('gabion', -13, -6, .82, .08), 'west-gabion', GABION_COLLIDER_PROFILE),
    ...assetProfile(P('gabion', 13, -6, .82, -.08), 'east-gabion', GABION_COLLIDER_PROFILE),
    ...assetProfile(P('peekcover', -13, 16, .82, Math.PI), 'west-peek-cover', PEEK_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('peekcover', 13, 16, .82, Math.PI), 'east-peek-cover', PEEK_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('breakablecover', -13, 25, .8), 'west-breakable-cover', BREAKABLE_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('breakablecover', 13, 25, .8, Math.PI), 'east-breakable-cover', BREAKABLE_COVER_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_LIGHT_MASTS[0], 'north-west-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_LIGHT_MASTS[1], 'north-east-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(HANDSHAKE_RELAY_PLACEMENTS[0], 'handshake-west', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(HANDSHAKE_RELAY_PLACEMENTS[1], 'handshake-east', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(PUMP_CONTROL_PLACEMENTS[0], 'pump-control-west', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(PUMP_CONTROL_PLACEMENTS[1], 'pump-control-center', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(PUMP_CONTROL_PLACEMENTS[2], 'pump-control-east', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_NORTH_PORTALS[0], 'north-west-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_NORTH_PORTALS[1], 'north-shutter', SHUTTER_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_NORTH_PORTALS[2], 'north-east-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_SOUTH_PORTALS[0], 'south-west-cargo-lift', CARGO_LIFT_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_SOUTH_PORTALS[1], 'south-shutter', SHUTTER_COLLIDER_PROFILE),
    ...assetProfile(FLOODGATE_SOUTH_PORTALS[2], 'south-east-cargo-lift', CARGO_LIFT_COLLIDER_PROFILE),
    ...FLOODGATE_BREACH_VENTS.flatMap((placement, index) => assetProfile(placement, `side-breach-vent-${index + 1}`, BREACH_VENT_COLLIDER_PROFILE))
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [76, 66] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    // Pads sit on the arena side of the visible portal geometry. The 2.7 m
    // tank reservation must clear the real door threshold and lift deck, not
    // merely the outer arena boundary.
    S('north-west-ground', [-22, .8, -28.5], [0, 0, 1]), S('north-center-ground', [12, .8, -29.5], [0, 0, 1]), S('north-east-ground', [22, .8, -28.5], [0, 0, 1]),
    S('south-west-ground', [-22, .8, 28], [0, 0, -1]), S('south-center-ground', [0, .8, 28], [0, 0, -1]), S('south-east-ground', [22, .8, 28], [0, 0, -1]),
    S('west-north-vent', [-34, .8, -16], [1, 0, 0]), S('west-center-hatch', [-34, .8, 3.5], [1, 0, 0]), S('west-south-vent', [-34, .8, 16], [1, 0, 0]),
    S('east-north-vent', [34, .8, -16], [-1, 0, 0]), S('east-center-hatch', [34, .8, 3.5], [-1, 0, 0]), S('east-south-vent', [34, .8, 16], [-1, 0, 0]),
    S('north-west-air', [-23, 8, -29], [0, 0, 1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('north-east-air', [23, 8, -29], [0, 0, 1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('west-air', [-35, 8, -4], [1, 0, 0], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('east-air', [35, 8, -4], [-1, 0, 0], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('south-west-air', [-18, 8, 29], [0, 0, -1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true),
    S('south-east-air', [18, 8, 29], [0, 0, -1], AIR_TYPES, { flyer: 2.4, warden: 3.5 }, true)
  ]),
  objectives: Object.freeze({
    handshakeRelays: Object.freeze([
      Object.freeze({ id: 'west-handshake', nameKey: 'level.floodgate.westRelay', position: [-22, -16], radius: 3.5, seconds: 10 }),
      Object.freeze({ id: 'east-handshake', nameKey: 'level.floodgate.eastRelay', position: [22, -16], radius: 3.5, seconds: 10 })
    ]),
    pumpControls: Object.freeze([
      Object.freeze({ id: 'west-pump', nameKey: 'level.floodgate.westPump', position: [-22, 0], radius: 3.5, seconds: 9 }),
      Object.freeze({ id: 'channel-pump', nameKey: 'level.floodgate.channelPump', position: [0, 0], radius: 3.5, seconds: 9 }),
      Object.freeze({ id: 'east-pump', nameKey: 'level.floodgate.eastPump', position: [22, 0], radius: 3.5, seconds: 9 })
    ]),
    archiveSeeds: Object.freeze([
      Object.freeze({ id: 'west-seed', nameKey: 'level.floodgate.westSeed', position: [-14, 8], radius: 3.2, seconds: 10 }),
      Object.freeze({ id: 'center-seed', nameKey: 'level.floodgate.centerSeed', position: [0, 8], radius: 3.2, seconds: 10 }),
      Object.freeze({ id: 'east-seed', nameKey: 'level.floodgate.eastSeed', position: [14, 8], radius: 3.2, seconds: 10 })
    ]),
    masterOverride: Object.freeze({ position: [0, -18], radius: 5.2, seconds: 36 })
  }),
  waves: WAVES
}), 1);
