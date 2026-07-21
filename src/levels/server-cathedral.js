import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  BREACH_VENT_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  LIGHT_MAST_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  SERVICE_WALL_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  ARCHIVES_COLLIDER_PROFILE,
  CARGO_LIFT_COLLIDER_PROFILE,
  CATHEDRAL_KIT_COLLIDER_PROFILE,
  CATWALK_COLLIDER_PROFILE,
  CLINIC_WALL_COLLIDER_PROFILE,
  CORRIDOR_COLLIDER_PROFILE,
  DASHBOARD_WINDOWS_COLLIDER_PROFILE,
  EMERGENCY_SIGN_COLLIDER_PROFILE,
  END_CHOICE_COLLIDER_PROFILE,
  LADDER_PLATFORM_COLLIDER_PROFILE,
  MIRROR_CHOIR_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE,
  ROOT_ALTAR_COLLIDER_PROFILE,
  SHUTTER_COLLIDER_PROFILE,
  STAIRS_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

export const SERVER_CATHEDRAL_ASSET_IDS = Object.freeze([
  'cathedralbackdrop', 'cathedralkit', 'dashboardwindows', 'corridor',
  'servicewall', 'clinicwall', 'archives', 'catwalk', 'stairs',
  'ladderplatform', 'cargolift', 'terminal', 'powerrelay', 'capturebeacon',
  'emergencysign', 'lightmast', 'reinforcementdoor', 'shutter', 'breachvent',
  'mirrorchoir', 'rootaltar', 'endchoice', 'cathedralroutes'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const CATHEDRAL_LIGHT_MASTS = Object.freeze([
  P('lightmast', -26, -25, .9),
  P('lightmast', 26, -25, .9, 0, ['observerHandClearance'])
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [36, 40], clearance, air, route: id
});

const LOGIC_NODE_POSITIONS = Object.freeze([
  Object.freeze([5.5, 9.53]),
  Object.freeze([5.5, -9.53]),
  Object.freeze([-11, 0])
]);
const CATHEDRAL_TERMINAL = P('terminal', -24.5, -17, .92, Math.PI / 2);
const CATHEDRAL_POWER_RELAY = P('powerrelay', 24.5, -17, .92, -Math.PI / 2);
const CATHEDRAL_KITS = Object.freeze([
  P('cathedralkit', -20, -29.5, 2.15), P('cathedralkit', 0, -29.5, 2.15), P('cathedralkit', 20, -29.5, 2.15)
]);
const CATHEDRAL_WINDOWS = Object.freeze([
  P('dashboardwindows', -20, -30.2, 1.8), P('dashboardwindows', 0, -30.2, 1.8), P('dashboardwindows', 20, -30.2, 1.8)
]);
const CATHEDRAL_EDGE_STRUCTURES = Object.freeze({
  corridor: P('corridor', -31, -15, 1.02, Math.PI / 2),
  serviceWall: P('servicewall', 31, -15, 1.02, -Math.PI / 2),
  clinicWall: P('clinicwall', -31, 15, 1.02, Math.PI / 2),
  archives: P('archives', 31, 15, 1.02, -Math.PI / 2),
  reinforcementDoor: P('reinforcementdoor', -31, 0, .94, Math.PI / 2),
  breachVent: P('breachvent', 31, 0, .94, -Math.PI / 2)
});
const CATHEDRAL_TRAVERSAL_PROPS = Object.freeze({
  lift: P('cargolift', -24.5, 10.5, .9, Math.PI / 2),
  catwalk: P('catwalk', 24.5, 10.5, .88, -Math.PI / 2),
  ladder: P('ladderplatform', -24.5, 22, .86, Math.PI / 2),
  stairs: P('stairs', 24.5, 22, .86, -Math.PI / 2, ['observerHandClearance'])
});
const CATHEDRAL_LOGIC_LOCKS = Object.freeze([
  P('shutter', -13, 0, 1.55, 0, ['cathedralLeftLock']),
  P('shutter', 13, 0, 1.55, 0, ['cathedralRightLock'])
]);
const CATHEDRAL_CHOIRS = Object.freeze([
  P('mirrorchoir', -23.5, -7.5, 1.02, Math.PI / 2, ['choirDressing']),
  P('mirrorchoir', 23.5, -7.5, 1.02, -Math.PI / 2, ['choirDressing'])
]);
const CATHEDRAL_ROOT_ALTAR = P('rootaltar', 0, 0, 1.08, 0, ['rootDressing']);
const CATHEDRAL_END_CHOICE = P('endchoice', 0, 24, 1.08, 0, ['endChoice']);
const LOGIC_NODE_PLACEMENTS = Object.freeze([
  P('terminal', LOGIC_NODE_POSITIONS[0][0], LOGIC_NODE_POSITIONS[0][1], .76, Math.PI, ['logicDressing']),
  P('powerrelay', LOGIC_NODE_POSITIONS[1][0], LOGIC_NODE_POSITIONS[1][1], .76, 0, ['logicDressing']),
  P('capturebeacon', LOGIC_NODE_POSITIONS[2][0], LOGIC_NODE_POSITIONS[2][1], .74, Math.PI / 2, ['logicDressing'])
]);

// Server Cathedral is the campaign's final arena. The three colored naves and
// outer processional loop never change identity, while two visible logic gates
// shift the Wave 37/38 routes and fully retract before the Algorithm arrives.
// All permanent combat collision stays outside the central 42 x 42 m floor.
export const SERVER_CATHEDRAL = defineLevel({
  id: 'server-cathedral',
  nameKey: 'level.cathedral.name',
  bossObjectiveKey: 'level.cathedral.destroyAlgorithm',
  liberationTitleKey: 'level.cathedral.liberating',
  liberationDetailKey: 'level.cathedral.algorithmReleased',
  firstWave: 36,
  bossWave: 40,
  size: [64, 64],
  playerSpawn: [0, 1.7, 28],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([0, 19]),
  bossClearZone: { center: [0, 0], radius: 15.5 },
  bossArenaBounds: Object.freeze({ minX: -29, maxX: 29, minZ: -29, maxZ: 29 }),
  bossAnchor: [0, .8, 0],
  // A single future-generation frame witnesses the Algorithm encounter from
  // the sealed east perimeter. It is environmental foreshadowing only: no HUD,
  // target, combat behavior, or post-boss presence.
  storyObserver: Object.freeze({
    id: 'breaker-generation-observer',
    model: 'breaker',
    position: Object.freeze([57.9, -37.98, 0]),
    yaw: -Math.PI / 2,
    scale: 18,
    pose: 'border-lean',
    headPitch: .27,
    visibleWaves: Object.freeze([40]),
    hideWhenLiberated: true,
    nonCombat: true
  }),
  weatherByWave: {
    36: 'cathedral-nave-fog',
    37: 'cathedral-logic-fog',
    38: 'cathedral-choir-fog-wind',
    39: 'cathedral-root-fog',
    40: 'cathedral-boss-fog-wind'
  },
  routes: Object.freeze([
    { id: 'cyan-nave', color: '#55d8e0', clearance: 8, landmark: true },
    { id: 'purple-nave', color: '#9a7cff', clearance: 8, flank: true },
    { id: 'orange-nave', color: '#f1a24e', clearance: 8, flank: true },
    { id: 'processional-loop', color: '#b8c4d4', clearance: 7.5, flank: true },
    { id: 'logic-crossings', color: '#e0e8f5', clearance: 7.5, destructible: true }
  ]),
  assets: Object.freeze([
    // The native backdrop is 14 m wide. At 2.15x, 30.2 m spacing keeps the
    // three silhouettes edge-to-edge without colliding at the horizon.
    P('cathedralbackdrop', -30.2, -43, 2.15),
    P('cathedralbackdrop', 0, -44, 2.15),
    P('cathedralbackdrop', 30.2, -43, 2.15),

    // A continuous north facade frames the nave entrances. Side modules sit
    // beyond the loop so their detail never reads as unexplained collision.
    ...CATHEDRAL_KITS,
    ...CATHEDRAL_WINDOWS,
    CATHEDRAL_EDGE_STRUCTURES.corridor, CATHEDRAL_EDGE_STRUCTURES.serviceWall,
    CATHEDRAL_EDGE_STRUCTURES.clinicWall, CATHEDRAL_EDGE_STRUCTURES.archives,
    CATHEDRAL_EDGE_STRUCTURES.reinforcementDoor, CATHEDRAL_EDGE_STRUCTURES.breachVent,
    P('emergencysign', -11, 29.5, .9, Math.PI), P('emergencysign', 11, 29.5, .9, Math.PI),

    // Repeated route modules reinforce the same three-color language from
    // entrance to altar without relying on small disconnected floor decals.
    P('cathedralroutes', 0, -18, 2.65), P('cathedralroutes', 0, 0, 2.65), P('cathedralroutes', 0, 18, 2.65),

    // Logic rooms temporarily change only two flank lanes. Their shutters and
    // colliders share tags so visible state and collision can never disagree.
    ...CATHEDRAL_LOGIC_LOCKS,
    CATHEDRAL_TERMINAL, CATHEDRAL_POWER_RELAY,
    CATHEDRAL_TRAVERSAL_PROPS.lift, CATHEDRAL_TRAVERSAL_PROPS.catwalk,
    CATHEDRAL_TRAVERSAL_PROPS.ladder,
    CATHEDRAL_TRAVERSAL_PROPS.stairs,
    ...CATHEDRAL_LIGHT_MASTS,

    ...CATHEDRAL_CHOIRS,
    CATHEDRAL_ROOT_ALTAR,

    // Wave 39's authored controls exactly match the Algorithm's Wave 40 node
    // bearings (11 m radius). They hide for the boss so mechanic and dressing
    // cannot overlap or imply a fourth target.
    ...LOGIC_NODE_PLACEMENTS,

    // This is a destination, not cover. It appears only after the boss and
    // stays on the south processional edge, clear of combat and spawn pads.
    CATHEDRAL_END_CHOICE
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -32, 64, 1, 5.2), B('south-boundary', 0, 32, 64, 1, 5.2),
    B('west-boundary', -32, 0, 1, 64, 5.2), B('east-boundary', 32, 0, 1, 64, 5.2),

    // Temporary gates are inside the future boss floor by design, but are
    // explicitly disabled for Waves 39/40 and liberation.
    ...assetProfile(CATHEDRAL_LOGIC_LOCKS[0], 'west-logic-lock', SHUTTER_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_LOGIC_LOCKS[1], 'east-logic-lock', SHUTTER_COLLIDER_PROFILE),

    ...CATHEDRAL_KITS.flatMap((placement, index) => assetProfile(placement, `north-nave-${index + 1}`, CATHEDRAL_KIT_COLLIDER_PROFILE)),
    ...CATHEDRAL_WINDOWS.flatMap((placement, index) => assetProfile(placement, `north-dashboard-${index + 1}`, DASHBOARD_WINDOWS_COLLIDER_PROFILE)),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.corridor, 'west-corridor', CORRIDOR_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.serviceWall, 'east-service-wall', SERVICE_WALL_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.clinicWall, 'west-clinic-wall', CLINIC_WALL_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.archives, 'east-archives', ARCHIVES_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.reinforcementDoor, 'west-reinforcement-door', REINFORCEMENT_DOOR_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_EDGE_STRUCTURES.breachVent, 'east-breach-vent', BREACH_VENT_COLLIDER_PROFILE),
    ...assetProfile(P('emergencysign', -11, 29.5, .9, Math.PI), 'south-west-emergency-sign', EMERGENCY_SIGN_COLLIDER_PROFILE),
    ...assetProfile(P('emergencysign', 11, 29.5, .9, Math.PI), 'south-east-emergency-sign', EMERGENCY_SIGN_COLLIDER_PROFILE),

    // Permanent readable cover remains beyond +/-21 m on at least one axis,
    // preserving an unobstructed 42 x 42 m square for all Algorithm phases.
    ...assetProfile(CATHEDRAL_TERMINAL, 'north-west-control', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_POWER_RELAY, 'north-east-control', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_TRAVERSAL_PROPS.lift, 'west-lift', CARGO_LIFT_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_TRAVERSAL_PROPS.catwalk, 'east-catwalk', CATWALK_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_TRAVERSAL_PROPS.ladder, 'south-west-platform', LADDER_PLATFORM_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_TRAVERSAL_PROPS.stairs, 'south-east-stairs', STAIRS_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_LIGHT_MASTS[0], 'north-west-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_LIGHT_MASTS[1], 'north-east-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(LOGIC_NODE_PLACEMENTS[0], 'logic-node-cyan', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(LOGIC_NODE_PLACEMENTS[1], 'logic-node-purple', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(LOGIC_NODE_PLACEMENTS[2], 'logic-node-orange', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...CATHEDRAL_CHOIRS.flatMap((placement, index) => assetProfile(placement, `mirror-choir-${index + 1}`, MIRROR_CHOIR_COLLIDER_PROFILE)),
    ...assetProfile(CATHEDRAL_ROOT_ALTAR, 'root-altar', ROOT_ALTAR_COLLIDER_PROFILE),
    ...assetProfile(CATHEDRAL_END_CHOICE, 'end-choice', END_CHOICE_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [64, 64] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-west-nave', [-10, .8, -27.5], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('north-east-nave', [10, .8, -27.5], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('south-west-nave', [-16, .8, 27.5], [0, 0, -1], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('south-east-nave', [13, .8, 27.5], [0, 0, -1], ['grunt','shooter','rusher','sniper'], { default: 1.45 }),
    S('west-north-transept', [-29, .8, -10], [1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('west-south-transept', [-29, .8, 8], [1, 0, 0], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('east-north-transept', [29, .8, -8], [-1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { default: 1.45, tank: 2.45 }),
    S('east-south-transept', [29, .8, 10], [-1, 0, 0], ['grunt','shooter','rusher','tank'], { default: 1.45, tank: 2.45 }),
    S('cathedral-gallery-air', [0, 8, -25], [0, 0, 1], ['flyer'], { flyer: 2.4 }, true)
  ]),
  objectives: Object.freeze({
    logicNodes: Object.freeze([
      Object.freeze({ id: 'cyan-logic-node', nameKey: 'level.cathedral.cyanNode', position: LOGIC_NODE_POSITIONS[0], radius: 3, seconds: 8.5 }),
      Object.freeze({ id: 'purple-logic-node', nameKey: 'level.cathedral.purpleNode', position: LOGIC_NODE_POSITIONS[1], radius: 3, seconds: 8.5 }),
      Object.freeze({ id: 'orange-logic-node', nameKey: 'level.cathedral.orangeNode', position: LOGIC_NODE_POSITIONS[2], radius: 3, seconds: 8.5 })
    ]),
    endingChoices: Object.freeze({
      // The console pushes the production player capsule about 1 m from the
      // panel center. Keep the interaction volumes just beyond that resolved
      // distance so both choices remain reachable without pixel-perfect input.
      free: Object.freeze({ id: 'free', position: Object.freeze([-1.15, 24]), radius: 1.75, seconds: 2 }),
      reset: Object.freeze({ id: 'reset', position: Object.freeze([1.15, 24]), radius: 1.75, seconds: 2 })
    })
  }),
  waves: Object.freeze({
    36: defineEncounterWave({ id: 'data-nave-breach', titleKey: 'level.cathedral.wave36', activeCap: 16, packages: [['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','rusher','sniper']], ammoPackages: [[-10,23]], healthPackages: [[10,23]] }),
    37: defineEncounterWave({ id: 'logic-rooms', titleKey: 'level.cathedral.wave37', activeCap: 16, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','rusher','rusher','sniper']] }),
    38: defineEncounterWave({ id: 'mirror-choir', titleKey: 'level.cathedral.wave38', activeCap: 17, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','shooter','rusher','tank','sniper']] }),
    39: defineEncounterWave({ id: 'root-altar', titleKey: 'level.cathedral.wave39', objective: 'multi-capture', objectiveTargets: 'logicNodes', activeCap: 17, packages: [['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank','sniper','sniper'], ['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','shooter','shooter','rusher','tank','sniper']] }),
    40: defineEncounterWave({ id: 'the-algorithm', titleKey: 'level.cathedral.wave40', boss: 'algorithm', packages: [], ammoPackages: [[0,19],[18,14],[24,-2],[10,-21],[-10,-21],[-24,-2],[-18,14]], healthPackages: [[-10,23],[10,23]] })
  })
});
