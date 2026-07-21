import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  BROADLEAF_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  COVER_HEIGHTS_COLLIDER_PROFILE,
  FACADE_COLLIDER_PROFILE,
  GLITCH_TOPIARY_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  PEEK_COVER_COLLIDER_PROFILE,
  STREET_TREE_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const MIRROR_GARDEN_ASSET_IDS = Object.freeze([
  'mirrorbackdrop', 'civicwall', 'facade', 'streettree', 'broadleaf',
  'coverheights', 'peekcover', 'cornercover', 'capturebeacon', 'powerrelay',
  'terminal', 'lightmast', 'emergencysign', 'mirrorpanels',
  'generationmarkers', 'splitring', 'glitchtopiary', 'mirrorgardenpaths'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const MIRROR_LIGHT_MASTS = Object.freeze([
  P('lightmast', -27, -27, .94, Math.PI / 4), P('lightmast', 27, -27, .94, -Math.PI / 4),
  P('lightmast', -27, 27, .94, Math.PI * 3 / 4), P('lightmast', 27, 27, .94, -Math.PI * 3 / 4)
]);
const MIRROR_STREET_TREES = Object.freeze([
  P('streettree', -29, 12, 1.0), P('streettree', -16, -28, .95), P('streettree', -18, 27.5, .95)
]);
const MIRROR_TERMINAL = P('terminal', -24, 23, .9, .08);
const MIRROR_POWER_RELAY = P('powerrelay', 24, 23, .9, -.08);
const MIRROR_CAPTURE_BEACONS = Object.freeze([
  P('capturebeacon', -24, -23, .88), P('capturebeacon', 24, -23, .88)
]);
const MIRROR_FACADES = Object.freeze([
  P('facade', -22, -31, 1.02), P('facade', 22, -31, 1.02)
]);
const MIRROR_CORNER_COVER = P('cornercover', -25, 8, .86, Math.PI / 2);
const MIRROR_TOPIARIES = Object.freeze([
  P('glitchtopiary', -23, -16, 1.02, .18), P('glitchtopiary', 23, -16, 1.02, -.18),
  P('glitchtopiary', -23, 16, 1.02, -.12), P('glitchtopiary', 23, 16, 1.02, .12)
]);
const MIRROR_BROADLEAVES = Object.freeze([
  P('broadleaf', 29, -12, 1.0), P('broadleaf', 16, -28, .95), P('broadleaf', 16, 28, .95)
]);
const MIRROR_COVER_HEIGHTS = Object.freeze([
  P('coverheights', -25, -7, .84, Math.PI / 2), P('coverheights', 25, 8, .82, -Math.PI / 2)
]);
const MIRROR_PEEK_COVER = P('peekcover', 25, -7, .88, -Math.PI / 2);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [26, 30], clearance, air, route: id
});

// The Mirror Garden is deliberately wider than the previous combat modules.
// Its clear central court and three concentric circulation bands give the full
// Hydraclone lineage room to split, surround, and telegraph without becoming a
// single unreadable pile. Four mirror thresholds retract for the boss wave,
// turning the cardinal spokes into direct shortcuts through the clone loops.
export const MIRROR_GARDEN = defineLevel({
  id: 'mirror-garden',
  nameKey: 'level.mirror.name',
  bossObjectiveKey: 'level.mirror.destroyHydraclone',
  liberationTitleKey: 'level.mirror.liberating',
  liberationDetailKey: 'level.mirror.routeRestored',
  firstWave: 26,
  bossWave: 30,
  size: [68, 68],
  playerSpawn: [0, 1.7, 30.5],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([0, 24]),
  bossClearZone: { center: [0, 0], radius: 16.5 },
  bossArenaBounds: Object.freeze({ minX: -32, maxX: 32, minZ: -32, maxZ: 32 }),
  bossAnchor: [0, .8, 0],
  weatherByWave: {
    26: 'mirror-mist-fog',
    27: 'mirror-glass-fog-wind',
    28: 'mirror-echo-fog',
    29: 'mirror-fracture-fog-wind',
    30: 'mirror-boss-fog-wind'
  },
  routes: Object.freeze([
    { id: 'inner-clone-loop', color: '#6fe1de', clearance: 8, landmark: true },
    { id: 'middle-reflection-loop', color: '#a984d2', clearance: 7.5, flank: true },
    { id: 'outer-garden-loop', color: '#b7c9a5', clearance: 8.5, flank: true },
    { id: 'north-south-shortcut', color: '#e9d8ff', clearance: 7, destructible: true },
    { id: 'east-west-shortcut', color: '#e9d8ff', clearance: 7, destructible: true }
  ]),
  assets: Object.freeze([
    // Native backdrop width is 13.5 m. At 2.3x, 31 m spacing keeps the formal
    // pavilion modules edge-to-edge without the silhouette collisions seen in
    // earlier exterior levels.
    P('mirrorbackdrop', -31.1, -43, 2.3), P('mirrorbackdrop', 0, -44, 2.3), P('mirrorbackdrop', 31.1, -43, 2.3),

    P('civicwall', -31, -21, 1.08, Math.PI / 2), P('civicwall', 31, -21, 1.08, -Math.PI / 2),
    P('civicwall', -31, 21, 1.08, Math.PI / 2), P('civicwall', 31, 21, 1.08, -Math.PI / 2),
    ...MIRROR_FACADES,
    // Lamp faces are authored toward local +Z. Aim every four-lamp bar at the
    // clone court so the practical model and its runtime wash agree.
    ...MIRROR_LIGHT_MASTS,
    P('emergencysign', -10, 31, .9, Math.PI), P('emergencysign', 10, 31, .9, Math.PI),

    // One large authored path kit establishes the loop language while the
    // runtime floor extends the same geometry to the full 64 m combat module.
    P('mirrorgardenpaths', 0, 0, 2.72),
    P('mirrorpanels', 0, -20.5, .92, 0, ['mirrorBarrier']),
    P('mirrorpanels', 0, 20.5, .92, Math.PI, ['mirrorBarrier']),
    P('mirrorpanels', -20.5, 0, .92, Math.PI / 2, ['mirrorBarrier']),
    P('mirrorpanels', 20.5, 0, .92, -Math.PI / 2, ['mirrorBarrier']),

    ...MIRROR_TOPIARIES,
    // Keep the west gate mouth clear; the former tree placement overlapped the
    // entrance body and spawned ground enemies inside its planter.
    MIRROR_STREET_TREES[0], MIRROR_BROADLEAVES[0],
    MIRROR_STREET_TREES[1], MIRROR_BROADLEAVES[1],
    MIRROR_STREET_TREES[2], MIRROR_BROADLEAVES[2],

    MIRROR_COVER_HEIGHTS[0], MIRROR_PEEK_COVER,
    MIRROR_CORNER_COVER, MIRROR_COVER_HEIGHTS[1],
    MIRROR_TERMINAL, MIRROR_POWER_RELAY,
    ...MIRROR_CAPTURE_BEACONS,

    // Generation cues arrive before the boss. The split emitter remains a
    // Wave 30 landmark so it cannot be mistaken for an early-wave objective.
    P('generationmarkers', -10.5, 10.5, .92, -.1, ['generationDressing']),
    P('generationmarkers', 10.5, -10.5, .92, .1, ['generationDressing']),
    P('splitring', 0, 0, 1.22, 0, ['bossDressing'])
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -34, 68, 1, 4.8), B('south-boundary', 0, 34, 68, 1, 4.8),
    B('west-boundary', -34, 0, 1, 68, 4.8), B('east-boundary', 34, 0, 1, 68, 4.8),

    // Local architecture sits inside the arena boundary and must own collision
    // where it is drawn instead of borrowing the disconnected outer wall.
    B('west-civic-north', -31, -21, 1.2, 7.4, 3.5),
    B('east-civic-north', 31, -21, 1.2, 7.4, 3.5),
    B('west-civic-south', -31, 21, 1.2, 7.4, 3.5),
    B('east-civic-south', 31, 21, 1.2, 7.4, 3.5),
    ...assetProfile(MIRROR_FACADES[0], 'north-west-facade', FACADE_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_FACADES[1], 'north-east-facade', FACADE_COLLIDER_PROFILE),

    ...MIRROR_LIGHT_MASTS.flatMap(placement => {
      const x = placement.position[0];
      const z = placement.position[2];
      const prefix = `${z < 0 ? 'north' : 'south'}-${x < 0 ? 'west' : 'east'}-lightmast`;
      return assetProfile(placement, prefix, LIGHT_MAST_COLLIDER_PROFILE);
    }),

    // Each emergency sign remains a portal: only its two posts are solid.
    B('south-west-sign-west-post', -12.3, 31, .68, .68, 3.45),
    B('south-west-sign-east-post', -7.7, 31, .68, .68, 3.45),
    B('south-east-sign-west-post', 7.7, 31, .68, .68, 3.45),
    B('south-east-sign-east-post', 12.3, 31, .68, .68, 3.45),

    B('north-mirror-threshold', 0, -20.5, 7.8, .62, 3.3, 1.65, { tags: ['phase-hidden-objective'] }),
    B('south-mirror-threshold', 0, 20.5, 7.8, .62, 3.3, 1.65, { tags: ['phase-hidden-objective'] }),
    B('west-mirror-threshold', -20.5, 0, .62, 7.8, 3.3, 1.65, { tags: ['phase-hidden-objective'] }),
    B('east-mirror-threshold', 20.5, 0, .62, 7.8, 3.3, 1.65, { tags: ['phase-hidden-objective'] }),

    ...assetProfile(MIRROR_COVER_HEIGHTS[0], 'north-west-formal-cover', COVER_HEIGHTS_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_PEEK_COVER, 'north-east-formal-cover', PEEK_COVER_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_CORNER_COVER, 'south-west-formal-cover', CORNER_COVER_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_COVER_HEIGHTS[1], 'south-east-formal-cover', COVER_HEIGHTS_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_TERMINAL, 'south-west-control', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_POWER_RELAY, 'south-east-control', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_CAPTURE_BEACONS[0], 'north-west-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_CAPTURE_BEACONS[1], 'north-east-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),

    ...MIRROR_TOPIARIES.flatMap((placement, index) => assetProfile(
      placement,
      ['north-west-topiary', 'north-east-topiary', 'south-west-topiary', 'south-east-topiary'][index],
      GLITCH_TOPIARY_COLLIDER_PROFILE
    )),

    ...assetProfile(MIRROR_STREET_TREES[0], 'west-garden-streettree', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_BROADLEAVES[0], 'east-garden-broadleaf', BROADLEAF_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_STREET_TREES[1], 'north-west-streettree', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_BROADLEAVES[1], 'north-east-broadleaf', BROADLEAF_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_STREET_TREES[2], 'south-west-streettree', STREET_TREE_COLLIDER_PROFILE),
    ...assetProfile(MIRROR_BROADLEAVES[2], 'south-east-broadleaf', BROADLEAF_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [68, 68] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-pavilion', [0, .8, -29.5], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { default:1.45, tank:2.45 }),
    S('south-west-gate', [-11, .8, 29.5], [0, 0, -1], ['grunt','shooter','rusher'], { default:1.45 }),
    S('south-east-gate', [11, .8, 29.5], [0, 0, -1], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('west-garden-gate', [-29.5, .8, 0], [1, 0, 0], ['grunt','shooter','rusher','tank'], { default:1.45, tank:2.45 }),
    S('east-garden-gate', [29.5, .8, 0], [-1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { default:1.45, tank:2.45 }),
    S('north-west-reflection', [-26, .8, -19], [1, 0, 1], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('north-east-reflection', [26, .8, -19], [-1, 0, 1], ['grunt','shooter','rusher','sniper'], { default:1.45 }),
    S('echo-air-ring', [0, 8, -18], [0, 0, 1], ['flyer'], { flyer:2.4 }, true)
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({
    26: defineEncounterWave({ id:'enter-the-garden', titleKey:'level.mirror.wave26', activeCap:14, packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','shooter','rusher','rusher','sniper']], ammoPackages:[[-10,24]], healthPackages:[[10,24]] }),
    27: defineEncounterWave({ id:'false-reflections', titleKey:'level.mirror.wave27', activeCap:14, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','tank','sniper'], ['grunt','shooter','rusher','rusher']] }),
    28: defineEncounterWave({ id:'double-exposure', titleKey:'level.mirror.wave28', activeCap:15, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','shooter','rusher','sniper']] }),
    29: defineEncounterWave({ id:'break-the-image', titleKey:'level.mirror.wave29', activeCap:15, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','shooter','rusher','rusher','tank','sniper']] }),
    30: defineEncounterWave({ id:'echo-hydraclone', titleKey:'level.mirror.wave30', boss:'hydraclone', packages:[], ammoPackages:[[0,24],[17,17],[24,0],[17,-17],[0,-24],[-17,-17],[-24,0],[-17,17]], healthPackages:[[-10,24],[10,24]] })
  })
});
