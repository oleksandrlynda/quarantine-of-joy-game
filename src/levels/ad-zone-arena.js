import { defineCaptureObjective, defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  BARRIERS_COLLIDER_PROFILE,
  BILLBOARD_WALL_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  CORNER_SHOP_COLLIDER_PROFILE,
  COVER_HEIGHTS_COLLIDER_PROFILE,
  GUARD_BOOTH_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  KIOSK_COLLIDER_PROFILE,
  LIGHT_MAST_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  SPONSOR_PROJECTOR_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE,
  TOWER_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const AD_ZONE_ARENA_ASSET_IDS = Object.freeze([
  'adzonebackdrop', 'billboardwall', 'sponsorprojector', 'adtrappylon', 'adplazakit',
  'kiosk', 'cornershop', 'guardbooth', 'screenwall', 'barriers', 'roadblock',
  'coverheights', 'breakablecover', 'lightmast', 'tower', 'catwalk',
  'capturebeacon', 'terminal'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, tags = [], motion = null) => ({
  id, position: [x, y, z], size: [width, height, depth], tags, motion
});
const AD_ZONE_LIGHT_MASTS = Object.freeze([
  P('lightmast', -25, 8.5, 1.1), P('lightmast', 24.5, -2.5, 1.1)
]);
const CAPTURE_BEACON_PLACEMENT = P('capturebeacon', -6.2, 6.8, 1.0, .08, ['objective', 'phase-hidden-objective']);
const TERMINAL_PLACEMENT = P('terminal', 6.5, 6.8, 1.0, -.08, ['objective', 'phase-hidden-objective']);
const CORNER_SHOP_PLACEMENT = P('cornershop', -23.5, -21.5, 1.18, .04);
const BARRIERS_PLACEMENT = P('barriers', -18.5, 12.8, 1.05, .12);
const ROADBLOCK_PLACEMENT = P('roadblock', 18.5, 12.8, 1.05, -.12);
const COVER_HEIGHTS_PLACEMENT = P('coverheights', -18, -8.5, 1.02, Math.PI / 2);
const BREAKABLE_COVER_PLACEMENT = P('breakablecover', 18, -8.5, 1.02, -Math.PI / 2);
const GUARD_BOOTH_PLACEMENT = P('guardbooth', -15.5, -22, 1.02);
const TOWER_PLACEMENT = P('tower', 17.5, -20.8, 1.12);
const KIOSK_PLACEMENTS = Object.freeze([
  P('kiosk', -25.2, -7, 1.02, Math.PI / 2), P('kiosk', 25.2, 7.5, 1.02, -Math.PI / 2)
]);
const SPONSOR_PROJECTOR_PLACEMENT = P('sponsorprojector', 0, 5.5, 1.05, 0, ['objective', 'liberation', 'phase-hidden-objective']);
const BILLBOARD_PLACEMENTS = Object.freeze([
  P('billboardwall', -11.5, -2.5, 1.1, .55, ['movingCover', 'liberation']),
  P('billboardwall', 11.5, 3.5, 1.1, -.55, ['movingCover', 'liberation'])
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const movingBillboardProfile = (placement, idPrefix, index) => assetProfile(
  placement, idPrefix, BILLBOARD_WALL_COLLIDER_PROFILE
).map(definition => ({
  ...definition,
  motion: {
    kind: 'billboard', index,
    baseYaw: definition.rotation?.[1] || placement.yaw || 0,
    origin: [...placement.position],
    baseOffset: [definition.position[0] - placement.position[0], definition.position[2] - placement.position[2]]
  }
}));
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [11, 15], clearance, route: id, air
});

// Level 03 keeps the Captain's recommended 52 x 46 m combat floor inside a
// visible 60 x 54 m plaza. The Zeppelin is an overhead objective and receives
// its own wider corridor rather than forcing the walkable arena to become empty.
export const AD_ZONE_ARENA = defineLevel({
  id: 'ad-zone-arena',
  nameKey: 'level.adzone.name',
  bossObjectiveKey: 'level.adzone.destroyCaptain',
  liberationTitleKey: 'level.adzone.liberating',
  liberationDetailKey: 'level.adzone.signalRestored',
  firstWave: 11,
  bossWave: 15,
  size: [60, 54],
  playerSpawn: [0, 1.7, 22],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-14, 10]),
  bossClearZone: { center: [0, -3], radius: 10 },
  bossArenaBounds: Object.freeze({ minX: -28.5, maxX: 28.5, minZ: -25.5, maxZ: 25.5 }),
  bossAnchor: [0, .8, -4],
  airCorridor: Object.freeze({ minX: -46, maxX: 46, minZ: -30, maxZ: 30, minY: 7, retreatY: 26 }),
  weatherByWave: {
    11: 'adzone-open',
    12: 'adzone-neon',
    13: 'adzone-sponsored',
    14: 'adzone-lockdown',
    15: 'adzone-boss'
  },
  routes: Object.freeze([
    { id: 'cyan-market', color: '#43d9d2', clearance: 6.5, flank: true },
    { id: 'sponsor-court', color: '#ff9b35', clearance: 10, objective: true },
    { id: 'magenta-service', color: '#ec4f91', clearance: 6.5, flank: true }
  ]),
  assets: Object.freeze([
    P('adzonebackdrop', -20, -31.5, 2.35), P('adzonebackdrop', 20, -31.5, 2.35),
    CORNER_SHOP_PLACEMENT, P('screenwall', 22.5, -21.5, 1.18, -.05),
    GUARD_BOOTH_PLACEMENT, TOWER_PLACEMENT,
    P('catwalk', 25.1, -8.5, 1.05, Math.PI / 2),
    ...KIOSK_PLACEMENTS,
    ...AD_ZONE_LIGHT_MASTS,
    ...BILLBOARD_PLACEMENTS,
    SPONSOR_PROJECTOR_PLACEMENT,
    CAPTURE_BEACON_PLACEMENT,
    TERMINAL_PLACEMENT,
    P('adplazakit', 0, 13.5, 1.08),
    BARRIERS_PLACEMENT, ROADBLOCK_PLACEMENT,
    COVER_HEIGHTS_PLACEMENT, BREAKABLE_COVER_PLACEMENT,
    P('adtrappylon', -7.5, -10, 1.08, .08, ['bossDressing']),
    P('adtrappylon', 7.5, -10, 1.08, -.08, ['bossDressing'])
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -27, 60, 1, 5, 2.5), B('south-boundary', 0, 27, 60, 1, 4, 2),
    B('west-boundary', -30, 0, 1, 54, 5, 2.5), B('east-boundary', 30, 0, 1, 54, 5, 2.5),
    ...assetProfile(CORNER_SHOP_PLACEMENT, 'west-market-shell', CORNER_SHOP_COLLIDER_PROFILE),
    B('east-screen-shell', 22.5, -21.5, 10.5, 5.2, 5.5, 2.75),
    ...assetProfile(GUARD_BOOTH_PLACEMENT, 'west-guardbooth', GUARD_BOOTH_COLLIDER_PROFILE),
    ...assetProfile(TOWER_PLACEMENT, 'east-tower', TOWER_COLLIDER_PROFILE),
    ...assetProfile(KIOSK_PLACEMENTS[0], 'west-kiosk', KIOSK_COLLIDER_PROFILE),
    ...assetProfile(KIOSK_PLACEMENTS[1], 'east-kiosk', KIOSK_COLLIDER_PROFILE),
    ...movingBillboardProfile(BILLBOARD_PLACEMENTS[0], 'west-billboard', 0),
    ...movingBillboardProfile(BILLBOARD_PLACEMENTS[1], 'east-billboard', 1),
    ...assetProfile(COVER_HEIGHTS_PLACEMENT, 'west-cover', COVER_HEIGHTS_COLLIDER_PROFILE),
    ...assetProfile(BREAKABLE_COVER_PLACEMENT, 'east-cover', BREAKABLE_COVER_COLLIDER_PROFILE),
    ...assetProfile(BARRIERS_PLACEMENT, 'south-west-barrier', BARRIERS_COLLIDER_PROFILE),
    ...assetProfile(ROADBLOCK_PLACEMENT, 'south-east-roadblock', ROADBLOCK_COLLIDER_PROFILE),
    ...assetProfile(AD_ZONE_LIGHT_MASTS[0], 'west-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    ...assetProfile(AD_ZONE_LIGHT_MASTS[1], 'east-lightmast', LIGHT_MAST_COLLIDER_PROFILE),
    // Actors may move beneath the catwalk, but its six supports remain solid
    // and its overhead deck blocks projectiles instead of behaving like air.
    B('east-catwalk-post-north-west', 24.52, -5.88, .22, .22, 2.37, 1.185),
    B('east-catwalk-post-north-east', 25.68, -5.88, .22, .22, 2.37, 1.185),
    B('east-catwalk-post-mid-west', 24.52, -8.5, .22, .22, 2.37, 1.185),
    B('east-catwalk-post-mid-east', 25.68, -8.5, .22, .22, 2.37, 1.185),
    B('east-catwalk-post-south-west', 24.52, -11.13, .22, .22, 2.37, 1.185),
    B('east-catwalk-post-south-east', 25.68, -11.13, .22, .22, 2.37, 1.185),
    { ...B('east-catwalk-deck', 25.1, -8.5, 1.62, 6.1, .25, 2.36), blocksMovement: false, blocksShots: true },
    // Objective colliders are explicitly phase-bound so boss-wave visuals and
    // collision always disappear together.
    ...assetProfile(SPONSOR_PROJECTOR_PLACEMENT, 'sponsor-projector', SPONSOR_PROJECTOR_COLLIDER_PROFILE),
    ...assetProfile(CAPTURE_BEACON_PLACEMENT, 'capture-beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    ...assetProfile(TERMINAL_PLACEMENT, 'adzone-terminal', TERMINAL_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [60, 54] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-left-gate', [-9, .8, -23], [0, 0, 1], ['grunt','shooter','rusher','tank','sniper'], { grunt:1.35, shooter:1.3, rusher:1.4, tank:2.35, sniper:1.35 }),
    S('north-right-gate', [8, .8, -23], [0, 0, 1], ['grunt','shooter','rusher','tank'], { grunt:1.35, shooter:1.3, rusher:1.4, tank:2.35 }),
    S('west-market-gate', [-26.5, .8, 16], [1, 0, 0], ['grunt','shooter','rusher','tank'], { grunt:1.35, shooter:1.3, rusher:1.4, tank:2.3 }),
    S('east-service-gate', [26.5, .8, 16], [-1, 0, 0], ['grunt','shooter','rusher','tank','sniper'], { grunt:1.35, shooter:1.3, rusher:1.4, tank:2.3, sniper:1.35 }),
    S('south-west-gate', [-11, .8, 23], [0, 0, -1], ['grunt','shooter','rusher'], { grunt:1.35, shooter:1.3, rusher:1.4 }),
    S('south-east-gate', [11, .8, 23], [0, 0, -1], ['grunt','shooter','rusher'], { grunt:1.35, shooter:1.3, rusher:1.4 }),
    S('propaganda-air-west', [-21, 7, -20], [0, 0, 1], ['pelican'], { pelican:3.2 }, true),
    S('propaganda-air-east', [21, 7, -20], [0, 0, 1], ['pelican'], { pelican:3.2 }, true)
  ]),
  objectives: Object.freeze({
    sponsor: defineCaptureObjective({ id: 'sponsor-court', position: [0, 5.5], radius: 5.5, seconds: 20, nameKey: 'level.adzone.sponsor' })
  }),
  waves: Object.freeze({
    11: defineEncounterWave({ id:'seize-the-plaza', titleKey:'level.adzone.wave11', activeCap:12, packages:[['grunt','grunt','grunt','grunt','shooter','shooter','rusher','rusher'], ['grunt','grunt','grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','pelican']], ammoPackages:[[-14,10]], healthPackages:[[14,10]] }),
    12: defineEncounterWave({ id:'moving-message', titleKey:'level.adzone.wave12', activeCap:12, packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank'], ['grunt','grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','pelican'], ['grunt','grunt','shooter']] }),
    13: defineEncounterWave({ id:'sponsor-window', titleKey:'level.adzone.wave13', objective:'sponsor', activeCap:13, packages:[['grunt','grunt','grunt','shooter','shooter','rusher'], ['grunt','grunt','grunt','grunt','shooter','shooter','rusher','rusher'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper','pelican']] }),
    14: defineEncounterWave({ id:'brand-lockdown', titleKey:'level.adzone.wave14', activeCap:13, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank','pelican'], ['grunt','grunt','shooter','shooter','rusher','rusher','tank','sniper']] }),
    15: defineEncounterWave({ id:'influencer-captain', titleKey:'level.adzone.wave15', boss:'captain', packages:[], ammoPackages:[[-14,10],[14,10]], healthPackages:[[0,15]] })
  })
});
