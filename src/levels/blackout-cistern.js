import { defineEncounterWave, defineLevel, defineSpawnEntrance, shiftLevelWaves } from './contracts.js';
import {
  AMMO_STATION_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LAST_LIGHT_REACTOR_COLLIDER_PROFILE,
  MED_CACHE_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  CARGO_LIFT_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

export const BLACKOUT_CISTERN_ASSET_IDS = Object.freeze([
  'lastlightreactor', 'cisternfloorkit', 'cisternbackdrop',
  'ammostation', 'medcache', 'cornercover', 'breakablecover', 'gabion',
  'floorhatch', 'breachvent', 'reinforcementdoor', 'cargolift', 'drainage', 'pipes'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({
  asset, position: [x, 0, z], scale, yaw, tags
});
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const CISTERN_REINFORCEMENT_DOOR = P('reinforcementdoor', -20.4, -11.8, .78, Math.PI / 3);
const CISTERN_CARGO_LIFT = P('cargolift', 20.4, -11.8, .78, -Math.PI / 3);
const B = (id, x, z, width, depth, yaw = 0, height = 4.8) => ({
  id,
  position: [x, height / 2, z],
  size: [width, height, depth],
  rotation: [0, yaw, 0]
});

const GROUND_TYPES = Object.freeze(['grunt', 'gruntling', 'rusher', 'tank', 'healer']);
const AIR_TYPES = Object.freeze(['flyer', 'warden']);
const S = (id, angle, { air = false, allow = null, clearance = null } = {}) => {
  // Ground actors materialize in front of the authored sector portals. A
  // 19.6 m radius keeps the tank reservation clear of the deeper lift deck
  // while preserving the same inward-facing radial route.
  const radius = air ? 24 : 19.6;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return defineSpawnEntrance({
    id,
    position: [x, air ? 7 : .8, z],
    facing: [-Math.cos(angle), 0, -Math.sin(angle)],
    allow: allow || (air ? AIR_TYPES : GROUND_TYPES),
    activeWaves: [72, 72],
    clearance: clearance || (air ? { flyer: 2.4, warden: 3.5 } : { default: 1.5, tank: 2.7 }),
    air,
    route: id
  });
};

const perimeterColliders = Array.from({ length: 16 }, (_, index) => {
  const angle = index * Math.PI * 2 / 16;
  return B(
    `cistern-rim-${index + 1}`,
    Math.cos(angle) * 28.7,
    Math.sin(angle) * 28.7,
    11.35,
    1.1,
    -angle - Math.PI / 2
  );
});

export const BLACKOUT_CISTERN = shiftLevelWaves(defineLevel({
  id: 'blackout-cistern',
  nameKey: 'level.cistern.name',
  firstWave: 72,
  finalWave: 72,
  size: [58, 58],
  playerSpawn: [0, 1.7, 7.5],
  playerFacing: [0, 0, -1],
  // Keep the emergency crate inside the south sector, but outside the 3 m
  // reservation around the corrected sector-5 enemy entrance.
  emergencyAmmoSpawn: Object.freeze([0, 16]),
  weatherByWave: Object.freeze({ 72: 'clear' }),
  routes: Object.freeze(Array.from({ length: 6 }, (_, index) => ({
    id: `dark-sector-${index + 1}`,
    color: index % 2 ? '#9d70d6' : '#5bd8d0',
    clearance: 7.5,
    dark: true
  }))),
  assets: Object.freeze([
    P('cisternfloorkit', 0, 0, 1.08),
    P('lastlightreactor', 0, 0, 1, 0, ['lastLight', 'objective']),

    P('cisternbackdrop', 0, -28.2, 1.04),
    P('cisternbackdrop', 28.2, 0, 1.04, Math.PI / 2),
    P('cisternbackdrop', 0, 28.2, 1.04, Math.PI),
    P('cisternbackdrop', -28.2, 0, 1.04, -Math.PI / 2),

    P('ammostation', -4.8, 4.2, .84, Math.PI / 4, ['surgeSupply']),
    P('medcache', 4.8, 4.2, .82, -Math.PI / 4, ['surgeSupply']),
    P('cornercover', -11.5, -5.5, .72, .35),
    P('cornercover', 11.5, -5.5, .72, -.35),
    P('breakablecover', -10.8, 11.2, .72, Math.PI),
    P('gabion', 10.8, 11.2, .72, Math.PI),

    CISTERN_REINFORCEMENT_DOOR,
    P('breachvent', 0, -23.5, .78, 0),
    CISTERN_CARGO_LIFT,
    P('floorhatch', 20.4, 11.8, .78, -Math.PI * 2 / 3),
    P('breachvent', 0, 23.5, .78, Math.PI),
    P('floorhatch', -20.4, 11.8, .78, Math.PI * 2 / 3),
    P('drainage', -15.4, 0, .7, Math.PI / 2),
    P('pipes', 15.4, 0, .7, -Math.PI / 2)
  ]),
  colliders: Object.freeze([
    ...perimeterColliders,
    ...assetProfile(P('lastlightreactor', 0, 0), 'last-light-reactor', LAST_LIGHT_REACTOR_COLLIDER_PROFILE),
    ...assetProfile(P('ammostation', -4.8, 4.2, .84, Math.PI / 4), 'surge-ammo', AMMO_STATION_COLLIDER_PROFILE),
    ...assetProfile(P('medcache', 4.8, 4.2, .82, -Math.PI / 4), 'surge-med', MED_CACHE_COLLIDER_PROFILE),
    ...assetProfile(P('cornercover', -11.5, -5.5, .72, .35), 'west-corner-cover', CORNER_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('cornercover', 11.5, -5.5, .72, -.35), 'east-corner-cover', CORNER_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('breakablecover', -10.8, 11.2, .72, Math.PI), 'south-west-cover', BREAKABLE_COVER_COLLIDER_PROFILE),
    ...assetProfile(P('gabion', 10.8, 11.2, .72, Math.PI), 'south-east-cover', GABION_COLLIDER_PROFILE),
    ...assetProfile(P('breachvent', 0, -23.5, .78, 0), 'north-breach-vent', BREACH_VENT_COLLIDER_PROFILE),
    ...assetProfile(P('breachvent', 0, 23.5, .78, Math.PI), 'south-breach-vent', BREACH_VENT_COLLIDER_PROFILE),
    ...assetProfile(P('pipes', 15.4, 0, .7, -Math.PI / 2), 'east-pipes', PIPES_COLLIDER_PROFILE),
    ...assetProfile(CISTERN_REINFORCEMENT_DOOR, 'north-west-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(CISTERN_CARGO_LIFT, 'north-east-cargo-lift', CARGO_LIFT_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [60, 60] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('sector-1-ground', -Math.PI * 5 / 6),
    S('sector-2-ground', -Math.PI / 2, { allow: ['grunt', 'gruntling', 'rusher', 'healer'], clearance: { default: 1.1 } }),
    S('sector-3-ground', -Math.PI / 6),
    S('sector-4-ground', Math.PI / 6),
    S('sector-5-ground', Math.PI / 2, { allow: ['grunt', 'gruntling', 'rusher', 'healer'], clearance: { default: 1.1 } }),
    S('sector-6-ground', Math.PI * 5 / 6),
    S('sector-1-air', -Math.PI * 5 / 6, { air: true }),
    S('sector-2-air', -Math.PI / 2, { air: true }),
    S('sector-3-air', -Math.PI / 6, { air: true }),
    S('sector-4-air', Math.PI / 6, { air: true }),
    S('sector-5-air', Math.PI / 2, { air: true }),
    S('sector-6-air', Math.PI * 5 / 6, { air: true })
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({
    72: defineEncounterWave({
      id: 'last-light',
      titleKey: 'level.cistern.wave72',
      specialEncounter: 'last_light',
      activeCap: 60,
      packages: [],
      ammoPackages: [[0,16],[14,12],[17,-6],[7,-17],[-7,-17],[-17,-6],[-14,12]],
      healthPackages: [[-9,20],[9,20]]
    })
  })
}), 1);
