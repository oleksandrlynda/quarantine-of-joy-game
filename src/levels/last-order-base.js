import { defineEncounterWave, defineLevel, defineSpawnEntrance } from './contracts.js';
import {
  BREACH_VENT_COLLIDER_PROFILE,
  GENERATOR_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  PIPES_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE
} from '../assets/collision-profiles.js';
import {
  ARCHIVES_COLLIDER_PROFILE,
  EMERGENCY_SIGN_COLLIDER_PROFILE
} from '../assets/late-collision-profiles.js';

export const LAST_ORDER_BASE_ASSET_IDS = Object.freeze([
  'corridor', 'servicewall', 'clinicwall', 'dashboardwindows', 'archives',
  'emergencysign', 'reinforcementdoor', 'shutter', 'breachvent', 'terminal',
  'powerrelay', 'generator', 'pipes', 'floorhatch'
]);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({
  asset, position: [x, 0, z], scale, yaw, tags
});
const TUNNEL_LENGTH_SCALE = 1.8;
const Z = value => value * TUNNEL_LENGTH_SCALE;
const PIPE_BANK = P('pipes', 6.7, Z(2), .72, -Math.PI / 2);
const ARCHIVE_BANK = P('archives', -6.5, Z(15), .72, Math.PI / 2);
const GENERATOR_BANK = P('generator', -6.5, Z(-10), .72, Math.PI / 2);
const DEAD_ZONE_RELAY = P('powerrelay', 6.5, Z(-29), .72, Math.PI, ['deadZoneRelay']);
const ESCAPE_TERMINAL = P('terminal', 0, Z(-39), .82, Math.PI, ['escapeTerminal']);
const BREACH_VENT = P('breachvent', -8.2, Z(-8), .7, Math.PI / 2);
const EMERGENCY_SIGNS = Object.freeze([
  P('emergencysign', 0, Z(24), .9, Math.PI),
  P('emergencysign', 0, Z(-4), .9, Math.PI),
  P('emergencysign', 0, Z(-32), .9, Math.PI)
]);
const assetProfile = (placement, idPrefix, primitives) => instantiateAssetColliderProfile({
  assetId: placement.asset, idPrefix, placement, primitives
});
const B = (id, x, z, width, depth, height = 4.8, y = height / 2, properties = {}) => ({
  id, position: [x, y, z], size: [width, height, depth], ...properties
});
const ENEMY_TYPES = Object.freeze(['bailiff', 'rusher_elite', 'shooter']);
// Keep the ceremonial guard grid clear of the archive/pipe/generator banks.
// Spawning a ground enemy within those colliders makes its first ground probe
// climb to the prop's top, which reads as an unintended jump.
const GUARD_COLUMNS = Object.freeze([-4.2, -1.4, 1.4, 4.2]);
const guardPositions = [];
let guardRow = 0;
for (let z = Z(16); z >= Z(-26); z -= 6) {
  // A guard rooted inside an emergency-sign post begins the chase on top of
  // visible geometry. Leave that ceremonial rank empty instead.
  if (EMERGENCY_SIGNS.some(sign => Math.abs(sign.position[2] - z) < 1.2)) continue;
  for (let column = guardRow % 2; column < GUARD_COLUMNS.length; column += 2) {
    const x = GUARD_COLUMNS[column];
    const west = x < 0;
    guardPositions.push(Object.freeze({
      side: west ? 'west' : 'east',
      position: Object.freeze([x, .8, z]),
      facingYaw: west ? Math.PI / 2 : -Math.PI / 2
    }));
  }
  guardRow += 1;
}
const entrance = (id, x) => defineSpawnEntrance({
  id,
  position: [x, .8, Z(42)],
  facing: [0, 0, -1],
  allow: ENEMY_TYPES,
  activeWaves: [41, 41],
  clearance: { default: 1.25 },
  route: 'pursuit'
});

export const LAST_ORDER_BASE = defineLevel({
  id: 'last-order-base',
  nameKey: 'level.lastOrder.name',
  firstWave: 41,
  finalWave: 41,
  size: [18, Z(104)],
  bossArenaBounds: Object.freeze({ minX: -8.5, maxX: 8.5, minZ: Z(-47.7), maxZ: Z(47.7) }),
  ceilingHeight: 4.15,
  hideWorldGrass: true,
  playerSpawn: [0, 1.7, Z(28)],
  playerFacing: [0, 0, -1],
  weatherByWave: Object.freeze({ 41: 'last-order-base-fog' }),
  routes: Object.freeze([
    { id: 'pursuit', color: '#e65b59', clearance: 7, landmark: true }
  ]),
  assets: Object.freeze([
    ARCHIVE_BANK,
    PIPE_BANK,
    GENERATOR_BANK,
    DEAD_ZONE_RELAY,
    ESCAPE_TERMINAL,
    ...EMERGENCY_SIGNS,
    BREACH_VENT,
    P('floorhatch', 5.5, Z(12), .68)
  ]),
  colliders: Object.freeze([
    B('north-wall', 0, Z(-52), 18, 1),
    B('south-wall', 0, Z(52), 18, 1),
    B('west-wall', -9, 0, 1, Z(104)),
    B('east-wall', 9, 0, 1, Z(104)),
    B('rear-airlock-gate', 0, Z(48), 17, .7, 3.65, 1.825),
    B('finish-airlock-gate', 0, Z(-48), 17, .7, 3.65, 1.825),
    B('ceiling', 0, 0, 18, Z(104), .3, 4.15, {
      tags: ['lastOrderCeiling'], blocksSpawn: false, blocksGrounding: false
    }),
    ...assetProfile(ARCHIVE_BANK, 'last-order-archives', ARCHIVES_COLLIDER_PROFILE),
    ...assetProfile(PIPE_BANK, 'last-order-pipes', PIPES_COLLIDER_PROFILE),
    ...assetProfile(GENERATOR_BANK, 'last-order-generator', GENERATOR_COLLIDER_PROFILE),
    ...assetProfile(DEAD_ZONE_RELAY, 'last-order-power-relay', POWER_RELAY_COLLIDER_PROFILE),
    ...assetProfile(ESCAPE_TERMINAL, 'last-order-terminal', TERMINAL_COLLIDER_PROFILE),
    ...assetProfile(BREACH_VENT, 'last-order-breach-vent', BREACH_VENT_COLLIDER_PROFILE),
    ...EMERGENCY_SIGNS.flatMap((placement, index) => assetProfile(
      placement,
      `last-order-sign-${['entrance', 'middle', 'terminal'][index]}`,
      EMERGENCY_SIGN_COLLIDER_PROFILE
    ))
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [30, Z(120)] }]),
  grassPatches: Object.freeze([]),
  guardRows: Object.freeze({
    rowSpacing: 6,
    columnSpacing: 2.8,
    spawnAhead: 24,
    activationAhead: 8,
    lockBehind: 4.5,
    positions: Object.freeze(guardPositions)
  }),
  entrances: Object.freeze([
    entrance('rear-west', -5.2),
    entrance('rear-center', 0),
    entrance('rear-east', 5.2)
  ]),
  objectives: Object.freeze({
    escape: Object.freeze({ position: [0, Z(-39)], radius: 4.2, powerdownSeconds: 6.5 })
  }),
  waves: Object.freeze({
    41: defineEncounterWave({
      id: 'last-order',
      titleKey: 'level.lastOrder.wave41',
      objective: 'escape',
      objectiveTarget: 'escape',
      activeCap: 9,
      packages: [[
        'bailiff', 'rusher_elite', 'shooter',
        'bailiff', 'rusher_elite', 'shooter',
        'bailiff', 'rusher_elite', 'shooter'
      ]]
    })
  })
});
