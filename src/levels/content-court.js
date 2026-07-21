import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  CAPTURE_BEACON_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  POWER_RELAY_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const CONTENT_COURT_ASSET_IDS = Object.freeze([
  'courtbackdrop', 'fortwall', 'civicwall', 'corridor', 'archives', 'stairs',
  'reinforcementdoor', 'emergencysign', 'terminal', 'powerrelay', 'capturebeacon',
  'cornercover', 'peekcover', 'breakablecover', 'tribunaldais', 'purgenode',
  'courtbench', 'courtsectoraisles'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const COURT_TERMINAL = P('terminal', -14, -24, .9, .06);
const COURT_POWER_RELAY = P('powerrelay', 14, -24, .9, -.06);
const COURT_CAPTURE_BEACONS = Object.freeze([
  P('capturebeacon', -14, 24, .88, Math.PI), P('capturebeacon', 14, 24, .88, Math.PI)
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [31, 35], clearance, air, route: id
});

// Content Court is a three-sector tribunal rather than a room full of props.
// The 14 m center is intentionally free of permanent collision: Citation mine
// screens can form around the Adjudicator while every radial aisle and the
// outer appeal loop remain valid escape routes.
export const CONTENT_COURT = defineLevel({
  id: 'content-court',
  nameKey: 'level.court.name',
  bossObjectiveKey: 'level.court.destroyAdjudicator',
  liberationTitleKey: 'level.court.liberating',
  liberationDetailKey: 'level.court.authorityBroken',
  firstWave: 31,
  bossWave: 35,
  size: [64, 60],
  playerSpawn: [0, 1.7, 26],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([0, 22]),
  bossClearZone: { center: [0, 0], radius: 14 },
  bossArenaBounds: Object.freeze({ minX: -29, maxX: 29, minZ: -27, maxZ: 27 }),
  bossAnchor: [0, 1.15, 0],
  weatherByWave: {
    31: 'court-docket-fog',
    32: 'court-citation-fog',
    33: 'court-purge-fog-wind',
    34: 'court-verdict-fog-wind',
    35: 'court-boss-fog-wind'
  },
  routes: Object.freeze([
    { id: 'cyan-purge-aisle', color: '#62d9d4', clearance: 8, landmark: true },
    { id: 'orange-citation-aisle', color: '#e7a34b', clearance: 8, flank: true },
    { id: 'purple-verdict-aisle', color: '#a987d4', clearance: 8, flank: true },
    { id: 'appeal-loop', color: '#d8c8a0', clearance: 7.5, flank: true }
  ]),
  assets: Object.freeze([
    // courtbackdrop is 13.5 m wide. At 2.25x, 30.5 m center spacing leaves a
    // small architectural seam without any silhouette collision.
    P('courtbackdrop', -30.5, -39.5, 2.25),
    P('courtbackdrop', 0, -40.5, 2.25),
    P('courtbackdrop', 30.5, -39.5, 2.25),

    // Exterior shell sits beyond the playable boundary; it explains the solid
    // limits without creating invisible walls inside the chamber.
    P('fortwall', -25.5, -29.5, 1.05), P('civicwall', 0, -30, 1.08), P('corridor', 25.5, -29.5, 1.05),
    P('archives', -31, -13, 1.02, Math.PI / 2), P('archives', 31, -13, 1.02, -Math.PI / 2),
    P('reinforcementdoor', -31, 13.5, .96, Math.PI / 2), P('stairs', 31, 13.5, .96, -Math.PI / 2),
    P('emergencysign', -12, 28.5, .9, Math.PI), P('emergencysign', 12, 28.5, .9, Math.PI),

    P('courtsectoraisles', 0, 0, 1.08),
    P('tribunaldais', 0, 0, 1.1, 0, ['courtDressing']),

    // One authored node family terminates each sector. Their footprints stay
    // outside the boss core and read as destination landmarks from spawn.
    P('purgenode', 0, -20.5, .7, 0, ['purgeDressing']),
    P('purgenode', 17.75, 10.25, .7, -Math.PI * 2 / 3, ['purgeDressing']),
    P('purgenode', -17.75, 10.25, .7, Math.PI * 2 / 3, ['purgeDressing']),

    // Benches and controls sit on the appeal loop, never across a radial aisle.
    P('courtbench', -23.5, -12.5, .62, Math.PI / 2), P('courtbench', 23.5, -12.5, .62, -Math.PI / 2),
    P('courtbench', -22.5, 15.5, .62, Math.PI / 2), P('courtbench', 22.5, 15.5, .62, -Math.PI / 2),
    P('cornercover', -25, 2.5, .86, Math.PI / 2), P('peekcover', 25, 2.5, .86, -Math.PI / 2),
    COURT_TERMINAL, COURT_POWER_RELAY,
    ...COURT_CAPTURE_BEACONS,
    P('breakablecover', -25, 23, .82, Math.PI / 2), P('breakablecover', 25, 23, .82, -Math.PI / 2)
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -30, 64, 1, 4.8), B('south-boundary', 0, 30, 64, 1, 4.8),
    B('west-boundary', -32, 0, 1, 60, 4.8), B('east-boundary', 32, 0, 1, 60, 4.8),

    B('north-purge-bank', 0, -20.5, 4.8, 1.7, 2.25),
    B('south-east-purge-bank', 17.75, 10.25, 4.8, 1.7, 2.25),
    B('south-west-purge-bank', -17.75, 10.25, 4.8, 1.7, 2.25),

    B('north-west-bench', -23.5, -12.5, 2.3, 6.35, 1.35),
    B('north-east-bench', 23.5, -12.5, 2.3, 6.35, 1.35),
    B('south-west-bench', -22.5, 15.5, 2.3, 6.35, 1.35),
    B('south-east-bench', 22.5, 15.5, 2.3, 6.35, 1.35),
    B('west-appeal-cover', -25, 2.5, 2.4, 3.4, 1.5),
    B('east-appeal-cover', 25, 2.5, 2.4, 3.4, 1.5),
    ...assetProfile(COURT_TERMINAL, 'north-west-control', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(COURT_POWER_RELAY, 'north-east-control', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(COURT_CAPTURE_BEACONS[0], 'south-west-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(COURT_CAPTURE_BEACONS[1], 'south-east-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    B('south-west-breakable', -25, 23, 2.5, 3.4, 1.4),
    B('south-east-breakable', 25, 23, 2.5, 3.4, 1.4)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [64, 60] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-west-records', [-6, .8, -26.5], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('north-east-records', [6, .8, -26.5], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('south-west-public', [-7, .8, 26.5], [0, 0, -1], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('south-east-public', [7, .8, 26.5], [0, 0, -1], ['grunt','shooter','rusher','sniper'], { default: 1.45 }),
    S('west-cyan-appeal', [-29, .8, -8], [1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('west-purple-appeal', [-29, .8, 10], [1, 0, 0], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('east-orange-appeal', [29, .8, -8], [-1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('east-verdict-appeal', [29, .8, 10], [-1, 0, 0], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('court-gallery-air', [0, 8, -23], [0, 0, 1], ['flyer'], { flyer: 2.4 }, true)
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({
    31: defineEncounterWave({ id: 'call-to-order', titleKey: 'level.court.wave31', activeCap: 15, packages: [['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper']], ammoPackages: [[-10,22]], healthPackages: [[10,22]] }),
    32: defineEncounterWave({ id: 'citation-docket', titleKey: 'level.court.wave32', activeCap: 15, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','rusher','sniper']] }),
    33: defineEncounterWave({ id: 'purge-the-record', titleKey: 'level.court.wave33', activeCap: 16, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','shooter','rusher','tank','sniper']] }),
    34: defineEncounterWave({ id: 'final-objection', titleKey: 'level.court.wave34', activeCap: 16, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper'], ['grunt','shooter','shooter','rusher','rusher','tank','sniper']] }),
    35: defineEncounterWave({ id: 'strike-adjudicator', titleKey: 'level.court.wave35', boss: 'adjudicator', packages: [], ammoPackages: [[0,22],[15.5,15.5],[22,0],[15.5,-15.5],[0,-18],[-15.5,-15.5],[-22,0],[-15.5,15.5]], healthPackages: [[-10,22],[10,22]] })
  })
});
