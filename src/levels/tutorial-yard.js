import { defineLevel, defineSpawnEntrance } from './contracts.js';
import { instantiateAssetColliderProfile, TERMINAL_COLLIDER_PROFILE } from '../assets/collision-profiles.js';

export const TUTORIAL_YARD_ASSET_IDS = Object.freeze(['terminal', 'emergencysign']);

const P = (asset, x, z, scale = 1, yaw = 0, tags = []) => ({
  asset, position: [x, 0, z], scale, yaw, tags
});
const B = (id, x, z, width, depth, height = 2.4, y = height / 2, tags = []) => ({
  id, position: [x, y, z], size: [width, height, depth], tags
});

const EXIT_TERMINAL = P('terminal', 6.3, -7.65, .72, 0, ['objective']);

export const TUTORIAL_YARD = defineLevel({
  id: 'tutorial-yard',
  nameKey: 'level.tutorial.name',
  firstWave: 1,
  // A 4x4 grid of 4.5 m training cells. A literal four-metre room cannot
  // exercise Shooter behaviour because its production firing band is 12-18 m.
  size: [18, 18],
  ceilingHeight: 4,
  playerSpawn: [0, 1.7, 7],
  playerFacing: [0, 0, -1],
  emergencyAmmoSpawn: Object.freeze([5.7, 3.2]),
  tutorial: Object.freeze({
    walkTarget: Object.freeze([0, 5.2]),
    jumpTarget: Object.freeze([0, 4.25]),
    shootingTarget: Object.freeze([0, -7.7]),
    obstacleTarget: Object.freeze([-5.8, 1.2]),
    cratePosition: Object.freeze([5.7, 0, 3.2]),
    // Spawn across the open south lane from the crate. The central barricade
    // must never occlude the first live enemy before the player identifies it.
    gruntSpawn: Object.freeze([-5.5, .8, 3]),
    gruntFacing: Object.freeze([1, 0, 0]),
    shooterSpawn: Object.freeze([0, .8, -7.5]),
    // Recommended safe pocket behind the south cover. It always counts so a
    // grazing ray cannot trap the player; any other genuine cover also counts.
    coverZone: Object.freeze({ center: [2.65, 5.25], radius: 1.4, seconds: 1.5 }),
    finalGruntSpawns: Object.freeze([
      Object.freeze([-5.2, .8, -4.8]),
      Object.freeze([0, .8, -6]),
      Object.freeze([5.2, .8, -4.8])
    ])
  }),
  weatherByWave: Object.freeze({ 1: 'clear' }),
  assets: Object.freeze([
    EXIT_TERMINAL,
    P('emergencysign', -3.1, -8.25, .62, Math.PI)
  ]),
  colliders: Object.freeze([
    B('north-wall', 0, -9, 18, .5, 4, 2),
    B('south-wall', 0, 9, 18, .5, 4, 2),
    B('west-wall', -9, 0, .5, 18, 4, 2),
    B('east-wall', 9, 0, .5, 18, 4, 2),
    // PlayerController treats this thin slab as an overhead blocker, closing
    // the visual ceiling and preventing jump-height sky leaks.
    {
      ...B('ceiling', 0, 0, 18, 18, .3, 3.85, ['tutorialCeiling']),
      blocksSpawn: false,
      // The ceiling blocks bodies and shots, but it must never be sampled as
      // terrain by ground-bound AI. Otherwise an enemy's first movement tick
      // snaps it onto the roof while its objective marker stays on the floor.
      blocksGrounding: false
    },
    // Invisible ballistic proxy for the visible red practice plate.
    { ...B('shooting-target', 0, -8.54, 2.2, .18, 1.3, 1.75, ['tutorialTarget']), blocksMovement: false },
    // The first low obstacle is visibly jumpable and leaves side bypasses.
    B('jump-hurdle', 0, 4.25, 7.2, .7, .72, .36, ['tutorialObstacle']),
    // Shooter lesson cover: a waist-high centre mass with two offset wings.
    // Offset from the centre jump lane; this fully occludes a standing player
    // at the marked pocket while keeping the Shooter 13 m away.
    B('cover-core', 2.65, 3.25, 2.8, .75, 2.05, 1.025, ['tutorialCover']),
    B('cover-west-wing', -4.8, .2, 2.2, .72, 1.8, .9, ['tutorialCover']),
    B('cover-east-wing', 4.8, -.2, 2.2, .72, 1.8, .9, ['tutorialCover']),
    ...instantiateAssetColliderProfile({
      assetId: EXIT_TERMINAL.asset,
      idPrefix: 'tutorial-exit-terminal',
      placement: EXIT_TERMINAL,
      primitives: TERMINAL_COLLIDER_PROFILE,
      tags: ['objective']
    })
  ]),
  walkableSurfaces: Object.freeze([]),
  grassExclusions: Object.freeze([{ center: [0, 0], size: [22, 22] }]),
  grassPatches: Object.freeze([]),
  entrances: Object.freeze([
    defineSpawnEntrance({
      id: 'tutorial-grunt', position: [-5.5, .8, 3], facing: [1, 0, 0],
      allow: ['grunt'], activeWaves: [1, 1], clearance: { grunt: 1.25 }
    }),
    defineSpawnEntrance({
      id: 'tutorial-shooter', position: [0, .8, -7.5], facing: [0, 0, 1],
      allow: ['shooter'], activeWaves: [1, 1], clearance: { shooter: .85 }
    })
  ]),
  objectives: Object.freeze({}),
  waves: Object.freeze({})
});
