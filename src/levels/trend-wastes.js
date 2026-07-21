import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  CAPTURE_BEACON_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE,
  BENT_TREE_COLLIDER_PROFILE,
  DEAD_TREE_COLLIDER_PROFILE,
  FILTER_RUIN_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  HESCO_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  RETAINING_WALL_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  SCREEN_WALL_COLLIDER_PROFILE,
  STORM_BEACON_COLLIDER_PROFILE,
  WINDBREAKS_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const TREND_WASTES_ASSET_IDS = Object.freeze([
  'wastesbackdrop', 'stormbeacon', 'filterruin', 'windbreaks', 'wastesterrainkit',
  'hesco', 'screenwall', 'retainingwall', 'roadblock', 'roadcurb', 'drainage',
  'roaddamage', 'benttree', 'deadtree', 'lightmast', 'checkpoint',
  'capturebeacon', 'pipes', 'reel', 'gabion'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, tags = []) => ({
  id, position: [x, y, z], size: [width, height, depth], tags
});
const WASTES_LIGHT_MAST = P('lightmast', -24, 1, 1.05);
const CAPTURE_BEACON_PLACEMENT = P('capturebeacon', 24, 1, 1.02);
const CHECKPOINT_PLACEMENT = P('checkpoint', -24, -18, 1.0, Math.PI / 2);
const ROADBLOCK_PLACEMENT = P('roadblock', 24, -18, 1.0, -Math.PI / 2);
const GABION_PLACEMENT = P('gabion', 17, 8.5, 1.0, -Math.PI / 2);
const PIPES_PLACEMENT = P('pipes', -17, 8.5, 1.0, Math.PI / 2);
const REEL_PLACEMENT = P('reel', -23, 17.5, .9, .2);
const HESCO_PLACEMENT = P('hesco', -18, -7, 1.0, .08);
const SCREEN_WALL_PLACEMENT = P('screenwall', 18, -7, .92, -.08);
const FILTER_RUIN_PLACEMENT = P('filterruin', 23, 17.5, .82, -.2);
const STORM_BEACON_PLACEMENT = P('stormbeacon', 0, -22, 1.25, 0, ['landmark', 'liberation']);
const RETAINING_WALL_PLACEMENT = P('retainingwall', 0, -28, 1.08);
const BENT_TREE_PLACEMENT = P('benttree', -27, 24, .9, .1);
const DEAD_TREE_PLACEMENT = P('deadtree', 27, 24, .9, -.1);
const WINDBREAK_PLACEMENTS = Object.freeze([
  P('windbreaks', -19, -12.5, .78, .08, ['windbreak']), P('windbreaks', 19, -12.5, .78, -.08, ['windbreak']),
  P('windbreaks', -19, 13.5, .78, -.08, ['windbreak']), P('windbreaks', 19, 13.5, .78, .08, ['windbreak'])
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [16, 20], clearance, route: id
});

// The 60 m shell contains the Shard's full 54 x 54 m combat module. Cover is
// deliberately held outside the 11 m barrage core and split into four compact
// islands, leaving the center and two bypasses readable through heavy sand.
export const TREND_WASTES = defineLevel({
  id: 'trend-wastes',
  nameKey: 'level.wastes.name',
  bossObjectiveKey: 'level.wastes.destroyShard',
  liberationTitleKey: 'level.wastes.liberating',
  liberationDetailKey: 'level.wastes.signalRestored',
  firstWave: 16,
  bossWave: 20,
  size: [60, 60],
  playerSpawn: [0, 1.7, 26],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-10, 15]),
  bossClearZone: { center: [0, -3.5], radius: 11 },
  bossArenaBounds: Object.freeze({ minX: -27, maxX: 27, minZ: -27, maxZ: 27 }),
  bossAnchor: [0, .8, -3.5],
  weatherByWave: {
    16: 'wastes-wind-sand',
    17: 'wastes-wind-sand',
    18: 'wastes-crosswind-sand',
    19: 'wastes-sandstorm-wind',
    20: 'wastes-boss-sand-wind'
  },
  routes: Object.freeze([
    { id: 'west-wind-lane', color: '#4dc9c2', clearance: 7, longRange: true },
    { id: 'storm-eye-road', color: '#f3b548', clearance: 10, landmark: true },
    { id: 'east-wind-lane', color: '#d76c4d', clearance: 7, longRange: true },
    { id: 'north-cross-route', color: '#d8cfad', clearance: 5.5, sheltered: true },
    { id: 'south-cross-route', color: '#d8cfad', clearance: 5.5, sheltered: true }
  ]),
  assets: Object.freeze([
    // Each backdrop is 14 m wide before scaling. At 2x scale these three
    // modules meet edge-to-edge instead of interpenetrating on the horizon.
    P('wastesbackdrop', -28, -37, 2.0), P('wastesbackdrop', 0, -38, 2.0), P('wastesbackdrop', 28, -37, 2.0),
    STORM_BEACON_PLACEMENT,
    WASTES_LIGHT_MAST, CAPTURE_BEACON_PLACEMENT,
    CHECKPOINT_PLACEMENT, ROADBLOCK_PLACEMENT,
    ...WINDBREAK_PLACEMENTS,
    P('wastesterrainkit', 0, 16, 1.25, 0, ['terrain']),
    HESCO_PLACEMENT, PIPES_PLACEMENT,
    SCREEN_WALL_PLACEMENT, GABION_PLACEMENT,
    REEL_PLACEMENT, FILTER_RUIN_PLACEMENT,
    RETAINING_WALL_PLACEMENT, P('drainage', 0, 20.5, .9),
    BENT_TREE_PLACEMENT, DEAD_TREE_PLACEMENT
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -30, 60, 1, 4.5), B('south-boundary', 0, 30, 60, 1, 4.5),
    B('west-boundary', -30, 0, 1, 60, 4.5), B('east-boundary', 30, 0, 1, 60, 4.5),
    // Cover envelopes follow the production prefab footprints. Undersized
    // approximations let bodies enter the visible mesh before collision.
    ...assetProfile(HESCO_PLACEMENT, 'west-north-island', HESCO_COLLIDER_PROFILE),
    ...assetProfile(SCREEN_WALL_PLACEMENT, 'east-north-island', SCREEN_WALL_COLLIDER_PROFILE),
    ...assetProfile(PIPES_PLACEMENT, 'west-south-island', PIPES_COLLIDER_PROFILE),
    ...assetProfile(GABION_PLACEMENT, 'east-south-island', GABION_COLLIDER_PROFILE),
    ...assetProfile(CHECKPOINT_PLACEMENT, 'west-checkpoint', CHECKPOINT_COLLIDER_PROFILE),
    ...assetProfile(ROADBLOCK_PLACEMENT, 'east-roadblock', ROADBLOCK_COLLIDER_PROFILE),
    ...WINDBREAK_PLACEMENTS.flatMap((placement, index) => assetProfile(
      placement,
      ['north-west-windbreak', 'north-east-windbreak', 'south-west-windbreak', 'south-east-windbreak'][index],
      WINDBREAKS_COLLIDER_PROFILE
    )),
    ...assetProfile(REEL_PLACEMENT, 'west-reel', REEL_COLLIDER_PROFILE),
    ...assetProfile(FILTER_RUIN_PLACEMENT, 'east-filter-ruin', FILTER_RUIN_COLLIDER_PROFILE),
    ...assetProfile(STORM_BEACON_PLACEMENT, 'storm-beacon', STORM_BEACON_COLLIDER_PROFILE),
    ...assetProfile(WASTES_LIGHT_MAST, 'west-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(CAPTURE_BEACON_PLACEMENT, 'east-capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(RETAINING_WALL_PLACEMENT, 'north-retaining-wall', RETAINING_WALL_COLLIDER_PROFILE),
    ...assetProfile(BENT_TREE_PLACEMENT, 'south-west-bent-tree', BENT_TREE_COLLIDER_PROFILE),
    ...assetProfile(DEAD_TREE_PLACEMENT, 'south-east-dead-tree', DEAD_TREE_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([
    { id:'south-dune-surface', position:[-5, .34, 16], size:[4.45, .2, 4.7], rotation:[-.12, 0, 0], tags:['walkable'] },
    B('south-road-transition', 0, 16, 4.45, 4.7, .12, .25, ['walkable']),
    B('south-dry-wash', 5, 16, 4.45, 4.7, .12, .28, ['walkable'])
  ]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [60, 60] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-west-cut', [-16, .8, -26], [0, 0, 1], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('north-east-cut', [16, .8, -26], [0, 0, 1], ['grunt','shooter','rusher','tank'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.4 }),
    S('west-wash', [-26, .8, 5], [1, 0, 0], ['grunt','shooter','rusher','tank'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.4 }),
    S('east-wash', [26, .8, 5], [-1, 0, 0], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('south-west-road', [-16, .8, 26], [0, 0, -1], ['grunt','shooter','rusher','tank','sniper'], { grunt:1.4, shooter:1.4, rusher:1.45, tank:2.4, sniper:1.45 }),
    S('south-east-road', [16, .8, 26], [0, 0, -1], ['grunt','shooter','rusher','sniper'], { default:1.45 })
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({
    16: defineEncounterWave({ id:'enter-the-gust', titleKey:'level.wastes.wave16', activeCap:13, packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','sniper'], ['grunt','grunt','grunt','grunt','shooter','shooter','rusher','rusher'], ['grunt','grunt','shooter','sniper']], ammoPackages:[[-10,15]], healthPackages:[[10,15]] }),
    17: defineEncounterWave({ id:'crosswind-fire', titleKey:'level.wastes.wave17', activeCap:13, packages:[['grunt','grunt','shooter','shooter','shooter','rusher','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank'], ['grunt','grunt','shooter','shooter','rusher','tank','sniper']] }),
    18: defineEncounterWave({ id:'blind-lane', titleKey:'level.wastes.wave18', activeCap:14, packages:[['grunt','grunt','grunt','shooter','rusher','rusher','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','shooter','shooter','rusher','tank','sniper','sniper']] }),
    19: defineEncounterWave({ id:'eye-wall', titleKey:'level.wastes.wave19', activeCap:14, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper']] }),
    20: defineEncounterWave({ id:'algorithm-shard', titleKey:'level.wastes.wave20', boss:'shard', packages:[], ammoPackages:[[-16,0],[16,0],[-10,15],[10,15]], healthPackages:[[0,17]] })
  })
});
