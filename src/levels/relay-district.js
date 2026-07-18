import {
  defineCaptureObjective,
  defineEncounterWave,
  defineLevel,
  defineSpawnEntrance
} from './contracts.js';

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

const groundSpawn = (id, position, facing, allow, activeWaves, clearance) => defineSpawnEntrance({
  id, position, facing, allow, activeWaves, clearance, route: id
});

export const RELAY_DISTRICT = defineLevel({
  id: 'relay-district',
  nameKey: 'level.relay.name',
  size: [64, 56],
  playerSpawn: [0, 1.7, 22],
  playerFacing: [0, 0, -1],
  bossClearZone: { center: [0, -7], radius: 10.5 },
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
    // Peripheral skyline masses conceal the arena rim and give the district
    // three architectural depth layers without changing combat collision.
    P('relaybackdrop', -32.2, 3.5, 1.9, Math.PI / 2, ['liberation']),
    P('relaybackdrop', 32.2, 3.5, 1.9, -Math.PI / 2, ['liberation']),
    P('apartment', -23.5, -25.5, 1.85, 0, ['liberation']),
    P('cornershop', 23.5, -25, 1.8, Math.PI, ['liberation']),
    P('facade', -13.5, -26.5, 1.5, 0, ['liberation']),
    P('facade', 13.5, -26.5, 1.5, 0, ['liberation']),
    P('reinforcementdoor', -5, -24.2, 1.25),
    P('emergencysign', 7.5, -23.8, 1.05, Math.PI, ['liberation']),

    // Side architecture creates street walls and occlusion for authored spawns.
    P('civicwall', -30.5, -5, 1.35, Math.PI / 2),
    P('civicwall', -30.5, 13, 1.35, Math.PI / 2),
    P('civicwall', 30.5, -5, 1.35, -Math.PI / 2),
    P('civicwall', 30.5, 13, 1.35, -Math.PI / 2),
    P('fireescape', -28, -10, 1.15),

    // Landmark court and paired Wave 3 feeds.
    P('relaymast', 0, -7, 1.55, 0, ['liberation']),
    P('capturebeacon', 0, -7, 0.78, 0, ['objective']),
    P('terminal', -15.5, 2, 1.1, Math.PI / 2, ['objective']),
    P('powerrelay', 15.5, 2, 1.1, -Math.PI / 2, ['objective']),
    P('lightmast', -13.5, -18, 0.92), P('lightmast', 13.5, -18, 0.92),
    P('lightmast', -13.5, 7, 0.92), P('lightmast', 13.5, 7, 0.92),

    // Aligned cover clusters: two decisions per lane and a readable south threshold.
    P('checkpoint', -24, 11.5, 1.08, Math.PI / 2),
    P('gabion', -22, -1, 0.9, Math.PI / 2),
    P('roadblock', -24, -15.5, 0.9, Math.PI / 2),
    P('cornercover', 22, 11.5, 0.95, Math.PI),
    P('gabion', 22, -1, 0.9, Math.PI / 2),
    P('barriers', 24, -15, 0.9, Math.PI / 2),
    P('barriers', -9, 14.5, 0.88), P('roadblock', 9, 14.5, 0.88),

    P('floorhatch', -12, -16, 1.05, 0, ['spawn']),
    P('breachvent', 22, -17, 1.05, Math.PI, ['spawn']),
    P('broodinfestation', 0, -9, 1.75, 0, ['infestation']),

    // Four landscaped pockets soften the block without obscuring combat lanes.
    P('streettree', -28, 23, 1.05), P('streettree', 28, 23, 1.05),
    P('streettree', -28, -20, 0.95), P('streettree', 28, -20, 0.95)
  ]),
  colliders: Object.freeze([
    B('north-boundary', 0, -28, 64, 1, 8, 4), B('south-boundary', 0, 28, 64, 1, 4, 2),
    B('west-boundary', -32, 0, 1, 56, 6, 3), B('east-boundary', 32, 0, 1, 56, 6, 3),
    B('north-west-buildings', -22, -24.8, 20, 6.5, 9, 4.5), B('north-east-buildings', 22, -24.8, 20, 6.5, 9, 4.5),
    B('north-civic-frame', 0, -24.8, 18, 1.2, 5.5, 2.75),

    // Decorative architecture is still solid. Keep these colliders tight so the
    // side routes retain their authored 2.4 m clearance and spawn pads stay open.
    B('west-civic-wall-north', -30.5, -5, 1.1, 8.6, 3.9, 1.95),
    B('west-civic-wall-south', -30.5, 13, 1.1, 8.6, 3.9, 1.95),
    B('east-civic-wall-north', 30.5, -5, 1.1, 8.6, 3.9, 1.95),
    B('east-civic-wall-south', 30.5, 13, 1.1, 8.6, 3.9, 1.95),

    // The fire escape remains traversable: only its backing and support posts
    // block movement; its stairs and landings live in walkableSurfaces below.
    B('fireescape-backing', -28, -11.2, 6.2, 0.4, 5.5, 2.75),
    B('fireescape-support-west', -29.95, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-support-east', -26.05, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-bridge-support-west', -24.55, -10.3, 0.5, 0.5, 3.8, 1.9),
    B('fireescape-bridge-support-east', -22.8, -10.3, 0.5, 0.5, 3.8, 1.9),

    B('lightmast-north-west', -13.5, -18, 2.2, 1.55, 5.2, 2.6),
    B('lightmast-north-east', 13.5, -18, 2.2, 1.55, 5.2, 2.6),
    B('lightmast-south-west', -13.5, 7, 2.2, 1.55, 5.2, 2.6),
    B('lightmast-south-east', 13.5, 7, 2.2, 1.55, 5.2, 2.6),

    B('streettree-south-west', -28, 23, 3.5, 2.85, 4.9, 2.45),
    B('streettree-south-east', 28, 23, 3.5, 2.85, 4.9, 2.45),
    B('streettree-north-west', -28, -20, 3.2, 2.6, 4.5, 2.25),
    B('streettree-north-east', 28, -20, 3.2, 2.6, 4.5, 2.25),
    B('rear-breach-vent', 22, -17, 5.5, 0.85, 3.65, 1.825),

    B('west-checkpoint', -24, 11.5, 4.2, 6, 2.5, 1.25), B('east-corner-cover', 22, 11.5, 4, 2.2, 1.25, 0.625),
    B('west-cover-mid', -22, -1, 1.7, 4.2, 1.2, 0.6), B('west-cover-north', -24, -15.5, 2, 4.5, 1.2, 0.6),
    B('east-cover-mid', 22, -1, 1.7, 4.2, 1.2, 0.6), B('east-cover-north', 24, -15, 1.8, 4.2, 1.2, 0.6),
    B('south-cover-west', -9, 14.5, 4.5, 1.6, 1.15, 0.575), B('south-cover-east', 9, 14.5, 4.5, 1.6, 1.15, 0.575),
    B('relay-base', 0, -7, 2.7, 2.7, 3.4, 1.7, ['objective']),
    B('west-terminal', -15.5, 2, 1.6, 1.6, 2, 1, ['objective']),
    B('east-relay', 15.5, 2, 1.9, 1.9, 2.4, 1.2, ['objective'])
  ]),
  walkableSurfaces: Object.freeze([
    B('fireescape-landing', -28, -10, 5.5, 2.4, 0.25, 2.8, ['walkable']),
    { id: 'fireescape-ramp', position: [-28, 1.35, -5.5], size: [2.4, 0.25, 7], rotation: [-0.38, 0, 0], tags: ['walkable'] }
  ]),
  grassExclusions: Object.freeze([
    { center: [0, 3], size: [29, 48] }, { center: [-22, 2], size: [15, 52] },
    { center: [22, 2], size: [15, 52] }, { center: [0, -24], size: [64, 9] }
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
    1: defineEncounterWave({ id: 'break-cordon', titleKey: 'level.relay.wave1', packages: [['grunt','grunt','grunt','grunt','grunt','grunt']] }),
    2: defineEncounterWave({ id: 'clear-blind-spots', titleKey: 'level.relay.wave2', packages: [['grunt','grunt','grunt','grunt','grunt','grunt','grunt','shooter']] }),
    3: defineEncounterWave({ id: 'restore-feeds', titleKey: 'level.relay.wave3', objective: 'feeds', packages: [['grunt','grunt','grunt','grunt'], ['grunt','grunt','shooter'], ['grunt','grunt','tank']] }),
    4: defineEncounterWave({ id: 'overcharge-mast', titleKey: 'level.relay.wave4', objective: 'mast', packages: [['grunt','grunt','grunt','grunt'], ['grunt','grunt','shooter'], ['grunt','grunt','shooter','tank']] }),
    5: defineEncounterWave({ id: 'nest-at-relay', titleKey: 'level.relay.wave5', boss: 'broodmaker-light', packages: [] })
  })
});
