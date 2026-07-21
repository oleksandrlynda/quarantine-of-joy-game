import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  BREAKABLE_COVER_COLLIDER_PROFILE,
  CONCRETE_WALL_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  GENERATOR_COLLIDER_PROFILE,
  HESCO_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  PIPES_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  SERVICE_WALL_COLLIDER_PROFILE,
  TROLLEY_COLLIDER_PROFILE,
  WAREHOUSE_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const FREIGHT_ANNEX_ASSET_IDS = Object.freeze([
  'freightbackdrop', 'warehouse', 'servicewall', 'cargogate', 'concretewall',
  'loadingramp', 'catwalk', 'stairs', 'ladderplatform', 'generator', 'pipes',
  'reel', 'trolley', 'cargolift', 'floorhatch', 'breachvent', 'shutter',
  'gabion', 'hesco', 'breakablecover', 'industrialnest', 'infectedprops',
  'burrowbreach', 'freightlanekit'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const GABION_PLACEMENT = P('gabion', -19, 23, 1.0, .08);
const PIPES_PLACEMENT = P('pipes', 21, 14, 1.0, -Math.PI / 2);
const REEL_PLACEMENT = P('reel', -22, -16, .95, .12);
const BREAKABLE_COVER_PLACEMENT = P('breakablecover', 23, 20, 1.0, -.14);
const WAREHOUSE_PLACEMENTS = Object.freeze([
  P('warehouse', -22, -28, 1.18, .02), P('warehouse', 22, -28, 1.18, -.02)
]);
const SERVICE_WALL_PLACEMENTS = Object.freeze([
  P('servicewall', -32, -8, 1.15, Math.PI / 2), P('servicewall', 32, -8, 1.15, -Math.PI / 2)
]);
const CONCRETE_WALL_PLACEMENTS = Object.freeze([
  P('concretewall', -32, 14, 1.15, Math.PI / 2), P('concretewall', 32, 14, 1.15, -Math.PI / 2)
]);
const GENERATOR_PLACEMENT = P('generator', -21, 14, 1.02, .08);
const TROLLEY_PLACEMENT = P('trolley', 22, -16, .98, -.12);
const HESCO_PLACEMENT = P('hesco', 19, 23, .95, -.08);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [21, 25], clearance, air, route: id
});

// Freight Annex uses the expanded 64 x 60 m boss module requested for the
// heavy Broodmaker. Solid cover remains outside the 13 m relocation core and
// every ambush entrance opens into one of three complete circulation lanes.
export const FREIGHT_ANNEX = defineLevel({
  id: 'freight-annex',
  nameKey: 'level.freight.name',
  bossObjectiveKey: 'level.freight.destroyBroodmaker',
  liberationTitleKey: 'level.freight.liberating',
  liberationDetailKey: 'level.freight.routeRestored',
  firstWave: 21,
  bossWave: 25,
  size: [68, 64],
  playerSpawn: [0, 1.7, 27],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-18, 8]),
  bossClearZone: { center: [0, -2], radius: 13 },
  bossArenaBounds: Object.freeze({ minX: -32, maxX: 32, minZ: -30, maxZ: 30 }),
  bossAnchor: [0, .8, -2],
  weatherByWave: {
    21: 'freight-haze-fog',
    22: 'freight-crosswind-fog-wind',
    23: 'freight-smog-fog',
    24: 'freight-infection-fog-wind',
    25: 'freight-boss-fog-wind'
  },
  routes: Object.freeze([
    { id: 'west-service-loop', color: '#42c8c2', clearance: 7, flank: true },
    { id: 'loading-spine', color: '#f0a543', clearance: 12, landmark: true },
    { id: 'east-service-loop', color: '#df6943', clearance: 7, flank: true },
    { id: 'north-loading-crossing', color: '#c9b98d', clearance: 6.5, elevated: true },
    { id: 'south-yard-crossing', color: '#c9b98d', clearance: 7.5, ambush: true }
  ]),
  assets: Object.freeze([
    // The backdrop is 14.5 m wide before scaling. At 2x these modules meet
    // without overlapping, keeping the distant crane and silo silhouettes clean.
    P('freightbackdrop', -29, -41, 2), P('freightbackdrop', 0, -42, 2), P('freightbackdrop', 29, -41, 2),

    ...WAREHOUSE_PLACEMENTS,
    P('cargogate', 0, -28, 1.18), P('freightlanekit', 0, -22, 1.08),
    ...SERVICE_WALL_PLACEMENTS,
    ...CONCRETE_WALL_PLACEMENTS,

    // Two readable elevation loops frame the yard without entering the boss core.
    P('loadingramp', -26, 5, 1.05, Math.PI / 2), P('catwalk', -27, -3, 1.02, Math.PI / 2),
    P('stairs', -25.5, -12, 1.02), P('ladderplatform', -27, 13, 1.0, Math.PI / 2),
    P('cargolift', 27, -5, 1.03, -Math.PI / 2), P('catwalk', 27, 3.5, 1.02, Math.PI / 2),
    P('stairs', 25.5, 12, 1.02, Math.PI), P('ladderplatform', 26, -14, 1.0, -Math.PI / 2),

    P('shutter', -30, -17, 1.0, Math.PI / 2), P('shutter', 30, -17, 1.0, -Math.PI / 2),
    P('floorhatch', -12, 18, 1.0), P('floorhatch', 12, 18, 1.0),
    P('breachvent', 30, -12, 1.0, -Math.PI / 2),
    GENERATOR_PLACEMENT, PIPES_PLACEMENT,
    REEL_PLACEMENT, TROLLEY_PLACEMENT,
    GABION_PLACEMENT, HESCO_PLACEMENT,
    BREAKABLE_COVER_PLACEMENT,

    // Infection is staged: the prop family appears from Wave 23, while the
    // nest and the large breach arrive only with the Wave 25 boss takeover.
    P('infectedprops', 17.5, 20.5, .82, -.1, ['infectionDressing']),
    P('industrialnest', 0, -18, 1.08, 0, ['infestation', 'bossDressing']),
    P('burrowbreach', 0, -2, 1.18, 0, ['infestation', 'bossDressing'])
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -32, 68, 1, 4.8), B('south-boundary', 0, 32, 68, 1, 4.8),
    B('west-boundary', -34, 0, 1, 64, 4.8), B('east-boundary', 34, 0, 1, 64, 4.8),
    ...assetProfile(WAREHOUSE_PLACEMENTS[0], 'north-west-warehouse', WAREHOUSE_COLLIDER_PROFILE),
    ...assetProfile(WAREHOUSE_PLACEMENTS[1], 'north-east-warehouse', WAREHOUSE_COLLIDER_PROFILE),
    // Match the complete visible container envelopes, including their outer
    // shoulders, while preserving the model's 4.2 m centre portal. That width
    // leaves a real grid cell after tank-radius and path-raster margins.
    B('north-gate-west-container', -3.6, -28.22, 3.0, 2.85, 3.05),
    B('north-gate-east-container', 3.6, -27.78, 3.0, 2.85, 3.05),
    // Side architecture sits two metres inside the arena boundary and needs
    // its own collision instead of borrowing the disconnected outer wall.
    ...assetProfile(SERVICE_WALL_PLACEMENTS[0], 'west-service-wall', SERVICE_WALL_COLLIDER_PROFILE),
    ...assetProfile(SERVICE_WALL_PLACEMENTS[1], 'east-service-wall', SERVICE_WALL_COLLIDER_PROFILE),
    ...assetProfile(CONCRETE_WALL_PLACEMENTS[0], 'west-concrete-wall', CONCRETE_WALL_COLLIDER_PROFILE),
    ...assetProfile(CONCRETE_WALL_PLACEMENTS[1], 'east-concrete-wall', CONCRETE_WALL_COLLIDER_PROFILE),
    // Freight lane asphalt is walkable; these boxes cover only the four raised
    // container masses so pathfinding routes around them instead of through art.
    B('freight-lane-straight', -4.86, -22.67, 3.75, 1.8, 1.95),
    B('freight-lane-corner-horizontal', -.32, -22.84, 3.3, 1.55, 1.95),
    B('freight-lane-corner-vertical', 1.19, -21.76, 1.55, 2.7, 1.95),
    B('freight-lane-endcap', 4.19, -22.67, 2.55, 1.75, 1.95),
    // The diagonal gate arm extends beyond the endcap container body.
    B('freight-lane-endcap-gate', 6.12, -22, 1.5, 1.9, .42, .88),
    B('west-elevation-loop', -27, -2.5, 4.4, 13, 3.2), B('east-elevation-loop', 27, -.5, 4.4, 13, 3.2),
    // Stairs retain walkable centres and solid side rails.
    B('west-stair-rail-west', -26.95, -12, .24, 4.25, 2.65), B('west-stair-rail-east', -24.05, -12, .24, 4.25, 2.65),
    B('east-stair-rail-west', 24.05, 12, .24, 4.25, 2.65), B('east-stair-rail-east', 26.95, 12, .24, 4.25, 2.65),
    // Ladder modules stay open beneath their decks; only posts, ladder rails
    // and the overhead deck participate in collision.
    B('west-ladder-post-a', -27.85, 11.55, .2, .2, 3.05), B('west-ladder-post-b', -26.15, 11.55, .2, .2, 3.05),
    B('west-ladder-post-c', -27.85, 14.45, .2, .2, 3.05), B('west-ladder-post-d', -26.15, 14.45, .2, .2, 3.05),
    B('west-ladder-rail-a', -25.82, 14, .16, .16, 3.2), B('west-ladder-rail-b', -25.82, 13.35, .16, .16, 3.2),
    B('west-ladder-deck', -27, 13, 2.25, 3.4, .28, 3.05, { blocksMovement: false }),
    B('east-ladder-post-a', 25.15, -15.45, .2, .2, 3.05), B('east-ladder-post-b', 26.85, -15.45, .2, .2, 3.05),
    B('east-ladder-post-c', 25.15, -12.55, .2, .2, 3.05), B('east-ladder-post-d', 26.85, -12.55, .2, .2, 3.05),
    B('east-ladder-rail-a', 24.82, -15, .16, .16, 3.2), B('east-ladder-rail-b', 24.82, -14.35, .16, .16, 3.2),
    B('east-ladder-deck', 26, -14, 2.25, 3.4, .28, 3.05, { blocksMovement: false }),
    B('west-shutter', -30, -17, 1.25, 5.75, 3.7), B('east-shutter', 30, -17, 1.25, 5.75, 3.7),
    B('east-breach-vent-north-post', 30, -14.1, 1.25, 1.05, 3.5),
    B('east-breach-vent-south-post', 30, -9.9, 1.25, 1.05, 3.5),
    B('east-breach-vent-sill', 30, -12, 1.25, 3.2, .7, .35, { blocksMovement: false }),
    B('east-breach-vent-header', 30, -12, 1.25, 3.2, .9, 3.02, { blocksMovement: false }),
    B('boss-industrial-nest', 0, -17.95, 4.35, 4.35, 2.1, 1.05, { tags: ['bossDressing'] }),
    ...assetProfile(REEL_PLACEMENT, 'west-north-cover', REEL_COLLIDER_PROFILE),
    ...assetProfile(TROLLEY_PLACEMENT, 'east-north-cover', TROLLEY_COLLIDER_PROFILE),
    ...assetProfile(GENERATOR_PLACEMENT, 'west-south-cover', GENERATOR_COLLIDER_PROFILE),
    ...assetProfile(PIPES_PLACEMENT, 'east-south-cover', PIPES_COLLIDER_PROFILE),
    ...assetProfile(GABION_PLACEMENT, 'south-west-cover', GABION_COLLIDER_PROFILE),
    ...assetProfile(HESCO_PLACEMENT, 'south-east-cover', HESCO_COLLIDER_PROFILE),
    ...assetProfile(BREAKABLE_COVER_PLACEMENT, 'east-breakable-cover', BREAKABLE_COVER_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([
    { id: 'west-stair-ramp', position: [-25.5, 1.14, -12], size: [2.65, .24, 4.15], rotation: [.49, 0, 0], tags: ['walkable'] },
    { id: 'east-stair-ramp', position: [25.5, 1.14, 12], size: [2.65, .24, 4.15], rotation: [.49, Math.PI, 0], tags: ['walkable'] }
  ]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [68, 64] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-left-gate', [-12, .8, -25], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.45, sniper:1.45 }),
    S('north-right-gate', [12, .8, -25], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.45, sniper:1.45 }),
    S('west-service-gate', [-29, .8, 8], [1, 0, 0], ['grunt','shooter','rusher','tank'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.45 }),
    S('east-service-gate', [29, .8, 8], [-1, 0, 0], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('floor-hatch', [-12, .8, 18], [0, 0, -1], ['grunt','rusher','tank'], { grunt:1.4, rusher:1.45, tank:2.45 }),
    S('rear-vent', [29, .8, -12], [-1, 0, 0], ['grunt','shooter','rusher'], { default:1.45 })
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({
    21: defineEncounterWave({ id:'yard-intake', titleKey:'level.freight.wave21', packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper']], ammoPackages:[[-18,8]], healthPackages:[[18,8]] }),
    22: defineEncounterWave({ id:'lift-ambush', titleKey:'level.freight.wave22', packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper']] }),
    23: defineEncounterWave({ id:'infected-manifest', titleKey:'level.freight.wave23', packages:[['grunt','grunt','shooter','shooter','shooter','rusher','rusher','tank','tank','sniper']] }),
    24: defineEncounterWave({ id:'cargo-breach', titleKey:'level.freight.wave24', packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','rusher','tank','tank','sniper']] }),
    25: defineEncounterWave({ id:'broodmaker-prime', titleKey:'level.freight.wave25', boss:'broodmaker-heavy', packages:[], ammoPackages:[[-18,8],[18,8],[0,20]], healthPackages:[[0,25]] })
  })
});
