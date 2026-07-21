import {
  defineCaptureObjective,
  defineEncounterWave,
  defineLevel,
  defineSpawnEntrance
} from './contracts.js';
import {
  APARTMENT_COLLIDER_PROFILE,
  BARRIERS_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  CORNER_SHOP_COLLIDER_PROFILE,
  FACADE_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  RELAY_MAST_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  STREET_TREE_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const RELAY_DISTRICT_ASSET_IDS = Object.freeze([
  'apartment', 'cornershop', 'facade', 'civicwall',
  'streettree', 'checkpoint', 'roadblock', 'barriers', 'gabion', 'terminal',
  'powerrelay', 'capturebeacon', 'reinforcementdoor', 'floorhatch', 'breachvent',
  'relaymast', 'fireescape', 'broodinfestation', 'relaystreetkit', 'relaybackdrop',
  'cornercover', 'lightmast', 'emergencysign'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, tags = []) => ({
  id, position: [x, y, z], size: [width, height, depth], tags
});

const RELAY_MAST_PLACEMENT = P('relaymast', 0, -7, 1.55, 0, ['liberation']);
const TERMINAL_PLACEMENT = P('terminal', -15.5, 2, 1.1, Math.PI / 2, ['objective', 'phase-hidden-objective']);
const POWER_RELAY_PLACEMENT = P('powerrelay', 15.5, 2, 1.1, -Math.PI / 2, ['objective', 'phase-hidden-objective']);
const APARTMENT_PLACEMENT = P('apartment', -23.5, -25.5, 1.85, 0, ['liberation']);
const CORNER_SHOP_PLACEMENT = P('cornershop', 23.5, -25, 1.8, Math.PI, ['liberation']);
const FACADE_PLACEMENTS = Object.freeze([
  P('facade', -13.5, -26.5, 1.5, 0, ['liberation']), P('facade', 13.5, -26.5, 1.5, 0, ['liberation'])
]);
const CHECKPOINT_PLACEMENT = P('checkpoint', -24, 11.5, 1.08, Math.PI / 2);
const CORNER_COVER_PLACEMENT = P('cornercover', 22, 11.5, 0.95, Math.PI);
const BREACH_VENT_PLACEMENT = P('breachvent', 22, -17, 1.05, Math.PI, ['spawn']);
const GABION_PLACEMENTS = Object.freeze([
  P('gabion', -22, -1, 0.9, Math.PI / 2), P('gabion', 22, -1, 0.9, Math.PI / 2)
]);
const BARRIER_PLACEMENTS = Object.freeze([
  P('barriers', 24, -15, 0.9, Math.PI / 2), P('barriers', -9, 14.5, 0.88)
]);
const ROADBLOCK_PLACEMENTS = Object.freeze([
  P('roadblock', -24, -15.5, 0.9, Math.PI / 2), P('roadblock', 9, 14.5, 0.88)
]);
const LIGHT_MAST_PLACEMENTS = Object.freeze([
  P('lightmast', -13.5, -18, 0.92), P('lightmast', 13.5, -18, 0.92),
  P('lightmast', -13.5, 7, 0.92), P('lightmast', 13.5, 7, 0.92)
]);
const STREET_TREE_PLACEMENTS = Object.freeze([
  P('streettree', -28, 23, 1.05), P('streettree', 28, 23, 1.05),
  P('streettree', -28, -20, 0.95), P('streettree', 28, -20, 0.95)
]);

const assetProfile = (placement, idPrefix, primitives, tags = []) => instantiateAssetColliderProfile({
  assetId: placement.asset,
  idPrefix,
  placement,
  primitives,
  tags
});

const groundSpawn = (id, position, facing, allow, activeWaves, clearance) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves, clearance, route: id
});

export const RELAY_DISTRICT = defineLevel({
  id: 'relay-district',
  nameKey: 'level.relay.name',
  size: [64, 56],
  playerSpawn: [0, 1.7, 22],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-8, 10]),
  bossClearZone: { center: [0, -7], radius: 10.5 },
  // Clear floor inside the authored collision faces. Broodmaker applies its
  // own body-radius margin before selecting a relocation point.
  bossArenaBounds: Object.freeze({ minX: -31.5, maxX: 31.5, minZ: -21.5, maxZ: 27.5 }),
  bossAnchor: [0, 0.8, -11.5],
  weatherByWave: {
    1: 'relay-cordon',
    2: 'relay-alarm',
    3: 'relay-rain',
    4: 'relay-signalstorm',
    5: 'relay-infestationstorm'
  },
  routes: Object.freeze([
    { id: 'west-service', color: '#37d6e8', clearance: 2.4, raisedFlank: true },
    { id: 'civic-court', color: '#c7ff36', clearance: 4.8, objective: true },
    { id: 'east-shopping', color: '#ffb12e', clearance: 2.4 }
  ]),
  assets: Object.freeze([
    // The north block is one composed civic frontage, not a skyline scatter.
    P('relaybackdrop', 0, -31.5, 2.35, 0, ['liberation']),
    APARTMENT_PLACEMENT,
    CORNER_SHOP_PLACEMENT,
    ...FACADE_PLACEMENTS,
    P('reinforcementdoor', -5, -24.2, 1.25),
    P('emergencysign', 7.5, -23.8, 1.05, Math.PI, ['liberation']),

    // Side architecture creates street walls and occlusion for authored spawns.
    P('civicwall', -30.5, -5, 1.35, Math.PI / 2),
    P('civicwall', -30.5, 13, 1.35, Math.PI / 2),
    P('civicwall', 30.5, -5, 1.35, -Math.PI / 2),
    P('civicwall', 30.5, 13, 1.35, -Math.PI / 2),
    P('fireescape', -28, -10, 1.15),

    // Landmark court and paired Wave 3 feeds.
    RELAY_MAST_PLACEMENT,
    P('capturebeacon', 0, -7, 0.78, 0, ['objective']),
    TERMINAL_PLACEMENT,
    POWER_RELAY_PLACEMENT,
    ...LIGHT_MAST_PLACEMENTS,

    // Aligned cover clusters: two decisions per lane and a readable south threshold.
    CHECKPOINT_PLACEMENT,
    GABION_PLACEMENTS[0],
    ROADBLOCK_PLACEMENTS[0],
    CORNER_COVER_PLACEMENT,
    GABION_PLACEMENTS[1],
    BARRIER_PLACEMENTS[0],
    BARRIER_PLACEMENTS[1], ROADBLOCK_PLACEMENTS[1],

    P('floorhatch', -12, -16, 1.05, 0, ['spawn']),
    BREACH_VENT_PLACEMENT,
    P('broodinfestation', 0, -9, 1.75, 0, ['infestation']),

    // Four landscaped pockets soften the block without obscuring combat lanes.
    ...STREET_TREE_PLACEMENTS
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -28, 64, 1, 8, 4), B('south-boundary', 0, 28, 64, 1, 4, 2),
    B('west-boundary', -32, 0, 1, 56, 6, 3), B('east-boundary', 32, 0, 1, 56, 6, 3),
    ...assetProfile(APARTMENT_PLACEMENT, 'north-west-apartment', APARTMENT_COLLIDER_PROFILE),
    ...assetProfile(CORNER_SHOP_PLACEMENT, 'north-east-cornershop', CORNER_SHOP_COLLIDER_PROFILE),
    ...assetProfile(FACADE_PLACEMENTS[0], 'north-west-facade', FACADE_COLLIDER_PROFILE),
    ...assetProfile(FACADE_PLACEMENTS[1], 'north-east-facade', FACADE_COLLIDER_PROFILE),
    B('north-civic-frame', 0.7, -24.45, 19.4, 1.9, 5.5, 2.75),

    // Decorative architecture is still solid. Keep these colliders tight so the
    // side routes retain their authored 2.4 m clearance and spawn pads stay open.
    B('west-civic-wall-north', -30.5, -5, 1.5, 9.25, 4.35, 2.175),
    B('west-civic-wall-south', -30.5, 13, 1.5, 9.25, 4.35, 2.175),
    B('east-civic-wall-north', 30.5, -5, 1.5, 9.25, 4.35, 2.175),
    B('east-civic-wall-south', 30.5, 13, 1.5, 9.25, 4.35, 2.175),

    // The fire escape remains traversable: only its backing and support posts
    // block movement; its stairs and landings live in walkableSurfaces below.
    B('fireescape-backing', -28, -11.2, 6.2, 0.4, 5.5, 2.75),
    B('fireescape-support-west', -29.95, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-support-east', -26.05, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-bridge-support-west', -24.55, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-bridge-support-east', -22.8, -10.3, 0.5, 0.5, 3.8, 1.9),

    ...assetProfile(LIGHT_MAST_PLACEMENTS[0], 'lightmast-north-west', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(LIGHT_MAST_PLACEMENTS[1], 'lightmast-north-east', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(LIGHT_MAST_PLACEMENTS[2], 'lightmast-south-west', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(LIGHT_MAST_PLACEMENTS[3], 'lightmast-south-east', LIGHT_MAST_COLLIDER_PROFILE),

    ...assetProfile(STREET_TREE_PLACEMENTS[0], 'streettree-south-west', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(STREET_TREE_PLACEMENTS[1], 'streettree-south-east', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(STREET_TREE_PLACEMENTS[2], 'streettree-north-west', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(STREET_TREE_PLACEMENTS[3], 'streettree-north-east', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(BREACH_VENT_PLACEMENT, 'rear-breach-vent', BREACH_VENT_COLLIDER_PROFILE),

    ...assetProfile(CHECKPOINT_PLACEMENT, 'west-checkpoint', CHECKPOINT_COLLIDER_PROFILE),
    ...assetProfile(CORNER_COVER_PLACEMENT, 'east-corner-cover', CORNER_COVER_COLLIDER_PROFILE),
    ...assetProfile(GABION_PLACEMENTS[0], 'west-cover-mid', GABION_COLLIDER_PROFILE),
    ...assetProfile(ROADBLOCK_PLACEMENTS[0], 'west-cover-north', ROADBLOCK_COLLIDER_PROFILE),
    ...assetProfile(GABION_PLACEMENTS[1], 'east-cover-mid', GABION_COLLIDER_PROFILE),
    ...assetProfile(BARRIER_PLACEMENTS[0], 'east-cover-north', BARRIERS_COLLIDER_PROFILE),
    ...assetProfile(BARRIER_PLACEMENTS[1], 'south-cover-west', BARRIERS_COLLIDER_PROFILE),
    ...assetProfile(ROADBLOCK_PLACEMENTS[1], 'south-cover-east', ROADBLOCK_COLLIDER_PROFILE),
    ...assetProfile(RELAY_MAST_PLACEMENT, 'relay-mast', RELAY_MAST_COLLIDER_PROFILE, ['objective']),
    ...assetProfile(TERMINAL_PLACEMENT, 'west-terminal', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(POWER_RELAY_PLACEMENT, 'east-relay', POWER_RELAY_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([
    B('fireescape-landing', -28, -10, 5.5, 2.4, 0.25, 2.8, ['walkable']),
    { id: 'fireescape-ramp', position: [-28, 1.35, -5.5], size: [2.4, 0.25, 7], rotation: [-0.38, 0, 0], tags: ['walkable'] }
  ]),
  grassExclusions: Object.freeze([
    { center: [0, 3], size: [29, 48] }, { center: [-22, 2], size: [15, 52] },
    { center: [22, 2], size: [15, 52] }, { center: [0, -24], size: [64, 9] }
  ]),
  // Restore low grass around the four street trees after the road/plaza mask.
  // These are playable landscaping pockets, kept off objectives and main lanes.
  grassPatches: Object.freeze([
    { center: [-28, 23], radius: [3.4, 3.1], heightScale: .72 },
    { center: [28, 23], radius: [3.4, 3.1], heightScale: .72 },
    { center: [-28, -20], radius: [3.15, 2.85], heightScale: .68 },
    { center: [28, -20], radius: [3.15, 2.85], heightScale: .68 }
  ]),
  entrances: Object.freeze([
    groundSpawn('north-door', [-5, 0.8, -20], [0, 0, 1], ['grunt', 'shooter', 'tank'], [1, 5], { grunt: 1.4, shooter: 1.35, tank: 2.25 }),
    groundSpawn('west-gate', [-27, 0.8, 3.5], [1, 0, 0], ['grunt', 'shooter', 'tank'], [1, 5], { grunt: 1.4, shooter: 1.35, tank: 2.35 }),
    groundSpawn('east-alley', [27, 0.8, -9], [-1, 0, 0], ['grunt', 'shooter', 'tank'], [2, 5], { grunt: 1.35, shooter: 1.3, tank: 2.25 }),
    groundSpawn('floor-hatch', [-12, 0.8, -14.1], [0, 0, 1], ['grunt', 'gruntling'], [3, 5], { grunt: 1.25, gruntling: 0.85 }),
    groundSpawn('rear-vent', [21.5, 0.8, -14.2], [-0.7, 0, 0.7], ['shooter', 'gruntling'], [3, 5], { shooter: 1.25, gruntling: 0.85 }),
    defineSpawnEntrance({ id: 'future-air-west', position: [-17, 8, -18], facing: [0, 0, 1], allow: ['flyer'], activeWaves: [1, 5], clearance: { flyer: 2.4 }, air: true }),
    defineSpawnEntrance({ id: 'future-air-east', position: [18, 9, -16], facing: [0, 0, 1], allow: ['flyer'], activeWaves: [1, 5], clearance: { flyer: 2.4 }, air: true })
  ]),
  objectives: Object.freeze({
    westFeed: defineCaptureObjective({ id: 'west-feed', position: [-15.5, 2], radius: 3.5, seconds: 6, nameKey: 'level.relay.westFeed' }),
    eastFeed: defineCaptureObjective({ id: 'east-feed', position: [15.5, 2], radius: 3.5, seconds: 6, nameKey: 'level.relay.eastFeed' }),
    mast: defineCaptureObjective({ id: 'relay-mast', position: [0, -7], radius: 5.5, seconds: 24, nameKey: 'level.relay.mast' })
  }),
  waves: Object.freeze({
    1: defineEncounterWave({ id: 'break-cordon', titleKey: 'level.relay.wave1', activeCap: 8, packages: [['grunt','grunt','grunt','grunt','grunt','grunt'], ['grunt','grunt']] }),
    2: defineEncounterWave({ id: 'clear-blind-spots', titleKey: 'level.relay.wave2', activeCap: 9, packages: [['grunt','grunt','grunt','grunt','grunt','grunt','grunt','shooter'], ['grunt','grunt','shooter']] }),
    3: defineEncounterWave({ id: 'restore-feeds', titleKey: 'level.relay.wave3', objective: 'feeds', activeCap: 10, packages: [['grunt','grunt','grunt','grunt'], ['grunt','grunt','grunt','shooter','shooter'], ['grunt','grunt','grunt','shooter','tank']] }),
    4: defineEncounterWave({ id: 'overcharge-mast', titleKey: 'level.relay.wave4', objective: 'mast', activeCap: 11, packages: [['grunt','grunt','grunt','grunt','grunt','shooter'], ['grunt','grunt','grunt','grunt','shooter','shooter'], ['grunt','grunt','shooter','tank']] }),
    5: defineEncounterWave({ id: 'nest-at-relay', titleKey: 'level.relay.wave5', boss: 'broodmaker-light', packages: [], ammoPackages: [[-8, 10], [8, 10]], healthPackages: [[0, 16]] })
  })
});
