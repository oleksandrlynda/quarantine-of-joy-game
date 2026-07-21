import { defineCaptureObjective, defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  CLINIC_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  POWER_RELAY_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';

export const SANITIZER_SPIRE_ASSET_IDS = Object.freeze([
  'spirefacade', 'spirebackdrop', 'censorshipnodes', 'suppressiontiles',
  'clinic', 'clinicwall', 'corridor', 'decon', 'emergencysign',
  'reinforcementdoor', 'shutter', 'terminal', 'powerrelay', 'ammostation',
  'stairs', 'catwalk', 'cargolift', 'peekcover', 'cornercover'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({ asset, position: [x, 0, z], scale, yaw, tags });
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const TERMINAL_PLACEMENT = P('terminal', -15.5, 7.5, 1.05, Math.PI / 2);
const POWER_RELAY_PLACEMENT = P('powerrelay', 15.5, 7.5, 1.05, -Math.PI / 2);
const CLINIC_PLACEMENTS = Object.freeze([
  P('clinic', -19.5, -20.5, 1.25), P('clinic', 19.5, -20.5, 1.25, Math.PI)
]);
const CORNER_COVER_PLACEMENTS = Object.freeze([
  P('cornercover', -17, 10.5, 1.0), P('cornercover', 17, 10.5, 1.0, Math.PI)
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const S = (id, position, facing, allow, clearance, air = false) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves: [6, 10], clearance, route: id, air
});

// Level 02 is deliberately centered on world origin: Sanitizer's nodes and beam
// bounds still use world-centered coordinates. The 54 m square gives the boss a
// 46 m clear short axis while the two side galleries provide reliable beam cover.
export const SANITIZER_SPIRE = defineLevel({
  id: 'sanitizer-spire',
  nameKey: 'level.spire.name',
  bossObjectiveKey: 'level.spire.destroyCommissioner',
  liberationTitleKey: 'level.spire.liberating',
  firstWave: 6,
  bossWave: 10,
  size: [54, 54],
  playerSpawn: [0, 1.7, 22],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([-10, 14]),
  bossClearZone: { center: [0, 0], radius: 11 },
  bossArenaBounds: Object.freeze({ minX: -25.5, maxX: 25.5, minZ: -25.5, maxZ: 25.5 }),
  bossAnchor: [0, 0.8, -4],
  weatherByWave: {
    6: 'sanitizer-sterile',
    7: 'sanitizer-lockdown',
    8: 'sanitizer-purge',
    9: 'sanitizer-lockdown',
    10: 'sanitizer-boss'
  },
  routes: Object.freeze([
    { id: 'west-clinic', color: '#43cbd0', clearance: 3.2, raisedFlank: true },
    { id: 'press-floor', color: '#f2f4ed', clearance: 7.5, objective: true },
    { id: 'east-decon', color: '#ff5e54', clearance: 3.2 }
  ]),
  assets: Object.freeze([
    P('spirebackdrop', 0, -31, 2.7),
    P('spirefacade', 0, -23.2, 2.2),
    // A deliberate Bureau facade: balanced shell, unequal playable flanks.
    ...CLINIC_PLACEMENTS,
    P('corridor', -25, -5, 1.18, Math.PI / 2), P('corridor', 25, -5, 1.18, -Math.PI / 2),
    P('clinicwall', -26, 10, 1.12, Math.PI / 2), P('clinicwall', 26, 10, 1.12, -Math.PI / 2),
    P('decon', -20, 19, 1.12), P('decon', 20, 19, 1.12, Math.PI),
    P('reinforcementdoor', -11, -21, 1.05), P('reinforcementdoor', 11, -21, 1.05),
    P('shutter', -23.8, 8, 1.1, Math.PI / 2), P('shutter', 23.8, 8, 1.1, -Math.PI / 2),
    P('emergencysign', 0, 21.5, 1.05, Math.PI),
    // Decorative node language stays behind the live Wave 10 node ring.
    P('censorshipnodes', 0, -17, 1.12, 0, ['bossDressing', 'suppressionDressing']),
    P('suppressiontiles', 17.5, 14, .88, -Math.PI / 2, ['suppressionDressing']),
    TERMINAL_PLACEMENT, POWER_RELAY_PLACEMENT,
    P('ammostation', 0, 18, 1.0, Math.PI),
    // A compact, two-ended west gallery breaks the mirror layout and gives
    // Shooters a real elevation decision without intruding on the boss ring.
    P('stairs', -20, 5, 1.0), P('catwalk', -20, 0, 1.0, Math.PI / 2), P('stairs', -20, -5, 1.0, Math.PI),
    P('peekcover', -12.5, -8, 1.05, Math.PI / 2), P('peekcover', 12.5, -8, 1.05, -Math.PI / 2),
    ...CORNER_COVER_PLACEMENTS
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -27, 54, 1, 7, 3.5, { blocksShots: false }),
    B('south-boundary', 0, 27, 54, 1, 4, 2),
    // The north ballistic boundary is three independent solid sections. Two
    // clinic-width apertures are represented only by a sill and header, so no
    // hidden full plane can intercept shots through their visible windows.
    B('north-boundary-west-shot', -25.25, -27, 3.5, 1, 7, 3.5, { blocksMovement: false }),
    B('north-boundary-center-shot', 0, -27, 31, 1, 7, 3.5, { blocksMovement: false }),
    B('north-boundary-east-shot', 25.25, -27, 3.5, 1, 7, 3.5, { blocksMovement: false }),
    B('north-west-window-sill', -19.5, -27, 8, 1, 1.2, .6, { blocksMovement: false }),
    B('north-east-window-sill', 19.5, -27, 8, 1, 1.2, .6, { blocksMovement: false }),
    B('north-west-window-header', -19.5, -27, 8, 1, 4.1, 4.95, { blocksMovement: false }),
    B('north-east-window-header', 19.5, -27, 8, 1, 4.1, 4.95, { blocksMovement: false }),
    // Side boundaries still contain the player, but their ballistic layer is
    // split around the two service-pod observation windows.
    B('west-boundary', -27, 0, 1, 54, 6, 3, { blocksShots: false }),
    B('east-boundary', 27, 0, 1, 54, 6, 3, { blocksShots: false }),
    B('west-boundary-north-shot', -27, -17.3, 1, 19.4, 6, 3, { blocksMovement: false }),
    B('east-boundary-north-shot', 27, -17.3, 1, 19.4, 6, 3, { blocksMovement: false }),
    B('west-boundary-south-shot', -27, 12.3, 1, 29.4, 6, 3, { blocksMovement: false }),
    B('east-boundary-south-shot', 27, 12.3, 1, 29.4, 6, 3, { blocksMovement: false }),
    B('west-window-boundary-sill', -27, -5, 1, 5.2, 1.2, .6, { blocksMovement: false }),
    B('east-window-boundary-sill', 27, -5, 1, 5.2, 1.2, .6, { blocksMovement: false }),
    B('west-window-boundary-header', -27, -5, 1, 5.2, 3.1, 4.45, { blocksMovement: false }),
    B('east-window-boundary-header', 27, -5, 1, 5.2, 3.1, 4.45, { blocksMovement: false }),
    // Match the full visible facade footprint. The previous shallow shell ended
    // 1.3 m behind its south face, letting bodies enter the model before stopping.
    B('spire-shell', 0, -23.2, 17.2, 7.85, 8, 4),
    B('west-reinforcement-door', -11, -21.05, 5.7, 1.2, 3.9, 1.95),
    B('east-reinforcement-door', 11, -21.05, 5.7, 1.2, 3.9, 1.95),
    // Full movement shells prevent jumping inside. Separate ballistic proxies
    // leave the visible front glazing open to bullets.
    ...assetProfile(CLINIC_PLACEMENTS[0], 'west-clinic', CLINIC_COLLIDER_PROFILE),
    ...assetProfile(CLINIC_PLACEMENTS[1], 'east-clinic', CLINIC_COLLIDER_PROFILE),
    // Clinic perimeter observation strips are shoot-through, but their sill and
    // header still stop players and preserve the wall silhouette.
    B('west-wall-movement', -26, 10, 1.36, 7.7, 3.7, 1.85, { blocksShots: false }),
    B('east-wall-movement', 26, 10, 1.36, 7.7, 3.7, 1.85, { blocksShots: false }),
    B('west-wall-sill', -26, 10, 1.36, 7.7, 1.3, .65, { blocksMovement: false }),
    B('east-wall-sill', 26, 10, 1.36, 7.7, 1.3, .65, { blocksMovement: false }),
    B('west-wall-cap', -26, 10, 1.36, 7.7, .9, 3.225, { blocksMovement: false }),
    B('east-wall-cap', 26, 10, 1.36, 7.7, .9, 3.225, { blocksMovement: false }),
    // These read as enclosed service pods from the arena. Their complete volume
    // blocks movement, while ballistic proxies cover only the visible sidewalls
    // so the central observation opening remains shoot-through.
    B('west-corridor-movement', -25, -5, 7.35, 5.25, 4.2, 2.1, { blocksShots: false }),
    B('east-corridor-movement', 25, -5, 7.35, 5.25, 4.2, 2.1, { blocksShots: false }),
    B('west-corridor-north-wall', -25, -7.48, 7.35, .48, 4.2, 2.1, { blocksMovement: false }),
    B('west-corridor-south-wall', -25, -2.52, 7.35, .48, 4.2, 2.1, { blocksMovement: false }),
    B('east-corridor-north-wall', 25, -7.48, 7.35, .48, 4.2, 2.1, { blocksMovement: false }),
    B('east-corridor-south-wall', 25, -2.52, 7.35, .48, 4.2, 2.1, { blocksMovement: false }),
    // Decon arches are portals, not doors. Collision follows the four posts and
    // intentionally leaves each 4.2 m centre opening traversable.
    B('west-decon-left-post', -22.33, 19, .78, 1.05, 3.65, 1.825), B('west-decon-right-post', -17.67, 19, .78, 1.05, 3.65, 1.825),
    B('east-decon-left-post', 17.67, 19, .78, 1.05, 3.65, 1.825), B('east-decon-right-post', 22.33, 19, .78, 1.05, 3.65, 1.825),
    B('west-shutter', -23.8, 8, 1, 6.3, 4.1, 2.05), B('east-shutter', 23.8, 8, 1, 6.3, 4.1, 2.05),
    // The south sign is a portal: its two visible posts are solid while the
    // player spawn and central opening remain clear.
    B('emergency-sign-west-post', -2.67, 21.42, .75, .65, 4, 2),
    B('emergency-sign-east-post', 2.67, 21.42, .75, .65, 4, 2),
    B('ammo-station', 0, 18, 3.9, 1.7, 3.1, 1.55),
    ...assetProfile(TERMINAL_PLACEMENT, 'west-terminal', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(POWER_RELAY_PLACEMENT, 'east-relay', POWER_RELAY_COLLIDER_PROFILE),
    // Peek barriers use a full, shallow movement shell so the camera cannot enter
    // their artwork. Their ballistic layer follows the two masses, sill and
    // lintel, leaving the visible centre slot genuinely open to gunfire.
    B('west-beam-cover', -12.5, -8, 1.05, 6.3, 2.75, 1.375, { blocksShots: false }),
    B('east-beam-cover', 12.5, -8, 1.05, 6.3, 2.75, 1.375, { blocksShots: false }),
    B('west-beam-cover-north-mass', -12.5, -9.87, .9, 2.48, 2.58, 1.29, { blocksMovement: false }),
    B('west-beam-cover-south-mass', -12.5, -6.13, .9, 2.48, 2.58, 1.29, { blocksMovement: false }),
    B('west-beam-cover-sill', -12.5, -8, .9, 1.3, 1.14, .57, { blocksMovement: false }),
    B('west-beam-cover-lintel', -12.5, -8, .9, 1.3, .76, 2.36, { blocksMovement: false }),
    B('east-beam-cover-north-mass', 12.5, -9.87, .9, 2.48, 2.58, 1.29, { blocksMovement: false }),
    B('east-beam-cover-south-mass', 12.5, -6.13, .9, 2.48, 2.58, 1.29, { blocksMovement: false }),
    B('east-beam-cover-sill', 12.5, -8, .9, 1.3, 1.14, .57, { blocksMovement: false }),
    B('east-beam-cover-lintel', 12.5, -8, .9, 1.3, .76, 2.36, { blocksMovement: false }),
    // West raised flank: solid rails/supports around independently walkable
    // stair ramps and deck surfaces.
    B('west-flank-stair-south-rail-west', -21.42, 5, .24, 4.15, 2.5, 1.25),
    B('west-flank-stair-south-rail-east', -18.58, 5, .24, 4.15, 2.5, 1.25),
    B('west-flank-stair-north-rail-west', -21.42, -5, .24, 4.15, 2.5, 1.25),
    B('west-flank-stair-north-rail-east', -18.58, -5, .24, 4.15, 2.5, 1.25),
    B('west-flank-catwalk-rail-west', -20.72, 0, .18, 5.7, 1.0, 2.72),
    B('west-flank-catwalk-rail-east', -19.28, 0, .18, 5.7, 1.0, 2.72),
    B('west-flank-catwalk-post-nw', -20.55, -2.5, .22, .22, 2.25, 1.125),
    B('west-flank-catwalk-post-ne', -19.45, -2.5, .22, .22, 2.25, 1.125),
    B('west-flank-catwalk-post-mw', -20.55, 0, .22, .22, 2.25, 1.125),
    B('west-flank-catwalk-post-me', -19.45, 0, .22, .22, 2.25, 1.125),
    B('west-flank-catwalk-post-sw', -20.55, 2.5, .22, .22, 2.25, 1.125),
    B('west-flank-catwalk-post-se', -19.45, 2.5, .22, .22, 2.25, 1.125),
    ...assetProfile(CORNER_COVER_PLACEMENTS[0], 'west-corner-cover', CORNER_COVER_COLLIDER_PROFILE),
    ...assetProfile(CORNER_COVER_PLACEMENTS[1], 'east-corner-cover', CORNER_COVER_COLLIDER_PROFILE)
  ]),
  walkableSurfaces: Object.freeze([
    { id:'west-flank-stair-south-ramp', position:[-20, 1.14, 5], size:[2.65, .24, 4.15], rotation:[.49, 0, 0], tags:['walkable'] },
    B('west-flank-catwalk-deck', -20, 0, 1.48, 5.8, .24, 2.37, { tags:['walkable'] }),
    { id:'west-flank-stair-north-ramp', position:[-20, 1.14, -5], size:[2.65, .24, 4.15], rotation:[.49, Math.PI, 0], tags:['walkable'] }
  ]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [54, 54] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    S('north-press-door', [-11, .8, -17.5], [0, 0, 1], ['grunt','shooter','rusher','tank'], { grunt:1.4, shooter:1.35, rusher:1.4, tank:2.35 }),
    S('west-clinic-door', [-23, .8, -10], [1, 0, 0], ['grunt','shooter','rusher'], { grunt:1.35, shooter:1.3, rusher:1.4 }),
    S('east-decon-door', [23, .8, 14], [-1, 0, 0], ['grunt','shooter','rusher','tank'], { grunt:1.35, shooter:1.3, rusher:1.4, tank:2.3 }),
    S('south-reinforcement', [-12, .8, 21], [0, 0, -1], ['grunt','shooter','rusher','tank'], { grunt:1.4, shooter:1.35, rusher:1.4, tank:2.35 }),
    S('air-west', [-18, 8, -10], [0, 0, 1], ['flyer'], { flyer:2.4 }, true),
    S('air-east', [18, 8, 5], [0, 0, -1], ['flyer'], { flyer:2.4 }, true)
  ]),
  objectives: Object.freeze({
    suppressionNodes: Object.freeze([
      defineCaptureObjective({ id:'west-censor', position:[-15.5, 7.5], radius:5.25, seconds:4, nameKey:'level.spire.westCensor' }),
      defineCaptureObjective({ id:'east-censor', position:[15.5, 7.5], radius:5.25, seconds:4, nameKey:'level.spire.eastCensor' }),
      defineCaptureObjective({ id:'press-censor', position:[0, -17], radius:5.25, seconds:4, nameKey:'level.spire.pressCensor' })
    ])
  }),
  waves: Object.freeze({
    6: defineEncounterWave({ id:'enter-the-spire', titleKey:'level.spire.wave6', activeCap:10, packages:[['grunt','grunt','grunt','grunt','shooter','rusher','tank'], ['grunt','grunt','grunt','shooter','shooter','rusher','tank']], ammoPackages:[[-10,14]], healthPackages:[[10,14]] }),
    7: defineEncounterWave({ id:'sterile-crossfire', titleKey:'level.spire.wave7', activeCap:11, packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank']] }),
    8: defineEncounterWave({ id:'break-the-censors', titleKey:'level.spire.wave8', objective:'multi-capture', objectiveTargets:'suppressionNodes', activeCap:12, packages:[['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank'], ['grunt','grunt','shooter','rusher','tank'], ['grunt','grunt','shooter','rusher','tank']] }),
    9: defineEncounterWave({ id:'press-control-lockdown', titleKey:'level.spire.wave9', activeCap:12, packages:[['grunt','grunt','shooter','shooter','rusher','rusher','tank','tank'], ['grunt','grunt','grunt','shooter','shooter','rusher','rusher','tank'], ['grunt','grunt','shooter','rusher']] }),
    10: defineEncounterWave({ id:'commissioner-sanitizer', titleKey:'level.spire.wave10', boss:'sanitizer', packages:[], ammoPackages:[[-10,14],[10,14]], healthPackages:[[0,14]] })
  })
});
