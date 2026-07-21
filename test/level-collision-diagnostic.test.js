import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { FREIGHT_ANNEX } from '../src/levels/freight-annex.js';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { LAST_ORDER_BASE } from '../src/levels/last-order-base.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { FLOODGATE_CONTINUITY } from '../src/levels/floodgate-continuity.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';
import { findPath } from '../src/path.js';
import {
  buildLevelCollisionReport,
  evaluateAssetBoundaryProbe,
  evaluateAssetApproachProbe,
  evaluateLevelJourneyProbe,
  evaluateSolidCollisionProbe,
  LEVEL_1_JOURNEYS,
  LEVEL_2_COLLISION_PHASES,
  LEVEL_2_JOURNEYS,
  LEVEL_3_COLLISION_PHASES,
  LEVEL_3_JOURNEYS,
  LEVEL_4_COLLISION_PHASES,
  LEVEL_4_JOURNEYS,
  LEVEL_5_COLLISION_PHASES,
  LEVEL_5_JOURNEYS,
  LEVEL_6_COLLISION_PHASES,
  LEVEL_6_JOURNEYS,
  CONTENT_COURT_COLLISION_PHASES,
  CONTENT_COURT_JOURNEYS,
  LAST_ORDER_COLLISION_PHASES,
  LAST_ORDER_JOURNEYS,
  SERVER_CATHEDRAL_COLLISION_PHASES,
  SERVER_CATHEDRAL_JOURNEYS,
  SANDSTORM_COLLISION_PHASES,
  SANDSTORM_JOURNEYS,
  FLOODGATE_COLLISION_PHASES,
  FLOODGATE_JOURNEYS,
  BLACKOUT_CISTERN_COLLISION_PHASES,
  BLACKOUT_CISTERN_JOURNEYS,
  LEVEL_COLLISION_PHASES,
  getLevelCollisionProfile,
  level1AssetCollisionExpectation,
  level1AssetPhaseExpectedVisible,
  level2AssetCollisionExpectation,
  level2AssetPhaseExpectedVisible,
  level3AssetCollisionExpectation,
  level3AssetPhaseExpectedVisible,
  level4AssetCollisionExpectation,
  level4AssetPhaseExpectedVisible,
  level5AssetCollisionExpectation,
  level5AssetPhaseExpectedVisible,
  level6AssetCollisionExpectation,
  level6AssetPhaseExpectedVisible,
  contentCourtAssetCollisionExpectation,
  contentCourtAssetPhaseExpectedVisible,
  lastOrderAssetCollisionExpectation,
  lastOrderAssetPhaseExpectedVisible,
  serverCathedralAssetCollisionExpectation,
  serverCathedralAssetPhaseExpectedVisible,
  sandstormAssetCollisionExpectation,
  sandstormAssetPhaseExpectedVisible,
  floodgateAssetCollisionExpectation,
  floodgateAssetPhaseExpectedVisible,
  blackoutCisternAssetCollisionExpectation,
  blackoutCisternAssetPhaseExpectedVisible,
  summarizeBoundaryFidelity,
  segmentIntersectsExpandedBounds2D
} from '../src/debug/level-collision-diagnostic.js';

function colliderWorldAabb(collider) {
  const [x, y, z] = collider.position;
  const [width, height, depth] = collider.size;
  const yaw = collider.rotation?.[1] || 0;
  const worldWidth = Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth;
  const worldDepth = Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * depth;
  return new THREE.Box3(
    new THREE.Vector3(x - worldWidth / 2, y - height / 2, z - worldDepth / 2),
    new THREE.Vector3(x + worldWidth / 2, y + height / 2, z + worldDepth / 2)
  );
}

test('boundary fidelity separates matched, phantom, and uncovered radial samples', () => {
  const fidelity = summarizeBoundaryFidelity([
    { visualDistance: 4, colliderDistance: 4.1 },
    { visualDistance: 5, colliderDistance: 3.8 },
    { visualDistance: 2.5, colliderDistance: 4 },
    { visualDistance: null, colliderDistance: 3 },
    { visualDistance: 2, colliderDistance: null }
  ]);
  assert.equal(fidelity.sampleCount, 5);
  assert.equal(fidelity.matched, 1);
  assert.equal(fidelity.colliderOnly, 1);
  assert.equal(fidelity.visualOnly, 1);
  assert.equal(fidelity.overblocking, 2);
  assert.equal(fidelity.underblocking, 2);
  assert.ok(Math.abs(fidelity.maxOverreach - 1.2) < 1e-9);
  assert.ok(Math.abs(fidelity.maxUnderreach - 1.5) < 1e-9);
});

test('asset boundary evaluation fails material phantom shape overreach and warns severe undercoverage', () => {
  const result = evaluateAssetBoundaryProbe({
    assetId: 'test-prop',
    placementIndex: 0,
    assetLoaded: true,
    expectedVisible: true,
    actualVisible: true,
    expectation: { mode: 'solid', colliderIds: ['test'], sizeCheck: 'composite', occupancyPolicy: 'solid' },
    missingColliderIds: [],
    overlappingColliderIds: ['test'],
    activeColliderIds: ['test'],
    boundaryFidelity: {
      sampleCount: 48,
      colliderOnlyRatio: .21,
      visualOnlyRatio: .1,
      overblockingRatio: .3,
      underblockingRatio: .52,
      maxOverreach: .8,
      maxUnderreach: .9,
      matchedRatio: .2
    }
  });
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.findings.map(item => item.code), [
    'asset_boundary_overblocks_visible_shape',
    'asset_boundary_underrepresents_visible_shape'
  ]);
});

function solidProbe(overrides = {}) {
  return {
    objectId: 'test-solid',
    objectKind: 'solid',
    geometry: { height: 2.4, crossingDepth: 1 },
    channels: {
      playerWalk: { exercised: true, blocked: true },
      playerJumpWalk: { exercised: true, expectedPass: false, passed: false },
      enemyWalk: { exercised: true, blocked: true },
      playerShot: { exercised: true, blocked: true },
      enemyShot: { exercised: true, blocked: true }
    },
    ...overrides
  };
}

test('every Level 1 visual placement has an explicit collision contract with valid boundary ids', () => {
  const boundaryIds = new Set([
    ...RELAY_DISTRICT.colliders.map(item => item.id),
    ...RELAY_DISTRICT.walkableSurfaces.map(item => item.id)
  ]);

  for (const placement of RELAY_DISTRICT.assets) {
    const expectation = level1AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing contract for ${placement.asset}`);
    assert.ok(['solid', 'nonblocking'].includes(expectation.mode), `invalid mode for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }

  const infestation = RELAY_DISTRICT.assets.find(item => item.asset === 'broodinfestation');
  const fireEscape = RELAY_DISTRICT.assets.find(item => item.asset === 'fireescape');
  const floorHatch = RELAY_DISTRICT.assets.find(item => item.asset === 'floorhatch');
  assert.equal(level1AssetCollisionExpectation(infestation).occupancyPolicy, 'ambient_allowed');
  assert.equal(level1AssetCollisionExpectation(fireEscape).occupancyPolicy, 'walkable_composite');
  assert.equal(level1AssetCollisionExpectation(floorHatch).occupancyPolicy, 'review');
});

test('Level 1 phase contracts cover every wave plus liberation visibility changes', () => {
  assert.deepEqual(LEVEL_COLLISION_PHASES.map(phase => phase.id), [
    'wave_1', 'wave_2', 'wave_3', 'wave_4', 'wave_5', 'liberated'
  ]);
  const infestation = RELAY_DISTRICT.assets.find(item => item.asset === 'broodinfestation');
  const terminal = RELAY_DISTRICT.assets.find(item => item.asset === 'terminal');
  const building = RELAY_DISTRICT.assets.find(item => item.asset === 'apartment');
  assert.equal(level1AssetPhaseExpectedVisible(infestation, 'wave_4'), false);
  assert.equal(level1AssetPhaseExpectedVisible(infestation, 'wave_5'), true);
  assert.equal(level1AssetPhaseExpectedVisible(infestation, 'liberated'), false);
  assert.equal(level1AssetPhaseExpectedVisible(terminal, 'wave_4'), true);
  assert.equal(level1AssetPhaseExpectedVisible(terminal, 'wave_5'), false);
  assert.equal(level1AssetPhaseExpectedVisible(terminal, 'liberated'), true);
  assert.equal(level1AssetPhaseExpectedVisible(building, 'wave_5'), true);
});

test('full-scene journey contracts cover player objectives and every ground entrance', () => {
  assert.equal(LEVEL_1_JOURNEYS.filter(journey => journey.actor === 'player').length, 5);
  assert.equal(LEVEL_1_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 5);
  assert.ok(LEVEL_1_JOURNEYS.some(journey => journey.id === 'player_spawn_to_mast'));
  assert.ok(LEVEL_1_JOURNEYS.some(journey => journey.id === 'enemy_north_to_spawn'));
  assert.ok(LEVEL_1_JOURNEYS.every(journey => journey.start.length === 2 && journey.goal.length === 2));
});

test('Level 2 uses the same collision contract, phase, and ten-journey matrix', () => {
  const boundaryIds = new Set([
    ...SANITIZER_SPIRE.colliders.map(item => item.id),
    ...SANITIZER_SPIRE.walkableSurfaces.map(item => item.id)
  ]);
  for (const placement of SANITIZER_SPIRE.assets) {
    const expectation = level2AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing Level 2 contract for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }
  assert.deepEqual(LEVEL_2_COLLISION_PHASES.map(phase => phase.id), [
    'wave_6', 'wave_7', 'wave_8', 'wave_9', 'wave_10', 'liberated'
  ]);
  assert.equal(LEVEL_2_JOURNEYS.filter(journey => journey.actor === 'player').length, 11);
  assert.equal(LEVEL_2_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 21);
  assert.equal(LEVEL_2_JOURNEYS.filter(journey => journey.contractKind === 'portal_transit').length, 18);
  assert.equal(LEVEL_2_JOURNEYS.filter(journey => journey.contractKind === 'portal_convoy').length, 4);
  assert.equal(LEVEL_2_JOURNEYS.filter(journey => journey.enemyType === 'tank').length, 6);
  assert.equal(getLevelCollisionProfile('sanitizer-spire').journeys, LEVEL_2_JOURNEYS);

  const bossDressing = SANITIZER_SPIRE.assets.find(item => item.asset === 'censorshipnodes');
  const suppression = SANITIZER_SPIRE.assets.find(item => item.asset === 'suppressiontiles');
  assert.equal(level2AssetPhaseExpectedVisible(bossDressing, 'wave_9'), true);
  assert.equal(level2AssetPhaseExpectedVisible(bossDressing, 'wave_10'), true);
  assert.equal(level2AssetPhaseExpectedVisible(bossDressing, 'liberated'), false);
  assert.equal(level2AssetPhaseExpectedVisible(suppression, 'wave_7'), false);
  assert.equal(level2AssetPhaseExpectedVisible(suppression, 'wave_8'), true);
});

test('every Level 2 journey has a production path with the correct actor margin', () => {
  const movementBoxes = SANITIZER_SPIRE.colliders
    .filter(collider => collider.blocksMovement !== false)
    .map(colliderWorldAabb);
  for (const journey of LEVEL_2_JOURNEYS) {
    const path = findPath(
      { x: journey.start[0], z: journey.start[1] },
      { x: journey.goal[0], z: journey.goal[1] },
      movementBoxes,
      { gridSize: 0.75, radius: 56, agentRadius: journey.agentRadius ?? (journey.actor === 'player' ? 0.5 : 0.73) }
    );
    assert.ok(path.length, `${journey.id} has no production route`);
  }
});

test('Level 3 covers all six entrances, moving cover, phases, and solid asset boundaries', () => {
  const boundaryIds = new Set(AD_ZONE_ARENA.colliders.map(item => item.id));
  for (const placement of AD_ZONE_ARENA.assets) {
    const expectation = level3AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing Level 3 contract for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }
  assert.deepEqual(LEVEL_3_COLLISION_PHASES.map(phase => phase.id), [
    'wave_11', 'wave_12', 'wave_13', 'wave_14', 'wave_15', 'liberated'
  ]);
  assert.equal(LEVEL_3_JOURNEYS.filter(journey => journey.actor === 'player').length, 6);
  assert.equal(LEVEL_3_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 6);
  assert.equal(getLevelCollisionProfile('ad-zone-arena').journeys, LEVEL_3_JOURNEYS);
  assert.ok(getLevelCollisionProfile('ad-zone-arena').phaseSensitiveTags.includes('movingCover'));
  assert.equal(AD_ZONE_ARENA.entrances.filter(entrance => !entrance.air).length, 6);

  const bossDressing = AD_ZONE_ARENA.assets.find(item => item.asset === 'adtrappylon');
  const objective = AD_ZONE_ARENA.assets.find(item => item.asset === 'terminal');
  assert.equal(level3AssetPhaseExpectedVisible(bossDressing, 'wave_14'), false);
  assert.equal(level3AssetPhaseExpectedVisible(bossDressing, 'wave_15'), true);
  assert.equal(level3AssetPhaseExpectedVisible(bossDressing, 'liberated'), false);
  assert.equal(level3AssetPhaseExpectedVisible(objective, 'wave_14'), true);
  assert.equal(level3AssetPhaseExpectedVisible(objective, 'wave_15'), false);
  assert.equal(level3AssetPhaseExpectedVisible(objective, 'liberated'), true);

  const missingSolidPlacements = AD_ZONE_ARENA.assets.filter(placement => level3AssetCollisionExpectation(placement).missingBoundary);
  assert.equal(missingSolidPlacements.length, 0);
  assert.ok(AD_ZONE_ARENA.assets.filter(placement => placement.tags.includes('movingCover'))
    .every(placement => level3AssetCollisionExpectation(placement).colliderIds.length === 5));
  for (const asset of ['sponsorprojector', 'capturebeacon', 'terminal']) {
    const placement = AD_ZONE_ARENA.assets.find(item => item.asset === asset);
    assert.equal(level3AssetCollisionExpectation(placement).phaseBound, true, `${asset} must hide its collision with its visual`);
  }
  const catwalk = AD_ZONE_ARENA.assets.find(item => item.asset === 'catwalk');
  assert.equal(level3AssetCollisionExpectation(catwalk).occupancyPolicy, 'support_composite');
  assert.equal(level3AssetCollisionExpectation(catwalk).colliderIds.length, 7);
});

test('every Level 3 journey has a production path with the correct actor margin', () => {
  const movementBoxes = AD_ZONE_ARENA.colliders
    .filter(collider => collider.blocksMovement !== false)
    .map(colliderWorldAabb);
  for (const journey of LEVEL_3_JOURNEYS) {
    const path = findPath(
      { x: journey.start[0], z: journey.start[1] },
      { x: journey.goal[0], z: journey.goal[1] },
      movementBoxes,
      { gridSize: 0.75, radius: 60, agentRadius: journey.actor === 'player' ? 0.5 : 0.73 }
    );
    assert.ok(path.length, `${journey.id} has no production route`);
  }
});

test('Level 4 covers all six entrances, wind lanes, phases, and visual collision contracts', () => {
  const boundaryIds = new Set([
    ...TREND_WASTES.colliders.map(item => item.id),
    ...TREND_WASTES.walkableSurfaces.map(item => item.id)
  ]);
  for (const placement of TREND_WASTES.assets) {
    const expectation = level4AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing Level 4 contract for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }
  assert.deepEqual(LEVEL_4_COLLISION_PHASES.map(phase => phase.id), [
    'wave_16', 'wave_17', 'wave_18', 'wave_19', 'wave_20', 'liberated'
  ]);
  assert.equal(LEVEL_4_JOURNEYS.filter(journey => journey.actor === 'player').length, 6);
  assert.equal(LEVEL_4_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 6);
  assert.equal(TREND_WASTES.entrances.filter(entrance => !entrance.air).length, 6);
  assert.equal(getLevelCollisionProfile('trend-wastes').journeys, LEVEL_4_JOURNEYS);
  assert.equal(level4AssetPhaseExpectedVisible({}, 'wave_20'), true);
  assert.equal(level4AssetPhaseExpectedVisible({}, 'liberated'), true);
  for (const asset of ['stormbeacon', 'lightmast', 'capturebeacon', 'benttree', 'deadtree']) {
    const placement = TREND_WASTES.assets.find(item => item.asset === asset);
    assert.equal(level4AssetCollisionExpectation(placement).mode, 'solid');
  }
  const bentTree = TREND_WASTES.assets.find(item => item.asset === 'benttree');
  assert.equal(level4AssetCollisionExpectation(bentTree).colliderIds.length, 8);
  const drainage = TREND_WASTES.assets.find(item => item.asset === 'drainage');
  assert.equal(level4AssetCollisionExpectation(drainage).occupancyPolicy, 'ambient_allowed');
  const terrain = TREND_WASTES.assets.find(item => item.asset === 'wastesterrainkit');
  assert.equal(level4AssetCollisionExpectation(terrain).occupancyPolicy, 'walkable_composite');
  assert.equal(level4AssetCollisionExpectation(terrain).colliderIds.length, 3);
  assert.ok(LEVEL_4_JOURNEYS.every(journey => journey.staticOnce));
});

test('every Level 4 journey has a production path with the correct actor margin', () => {
  const movementBoxes = TREND_WASTES.colliders
    .filter(collider => collider.blocksMovement !== false)
    .map(colliderWorldAabb);
  for (const journey of LEVEL_4_JOURNEYS) {
    const path = findPath(
      { x: journey.start[0], z: journey.start[1] },
      { x: journey.goal[0], z: journey.goal[1] },
      movementBoxes,
      { gridSize: 0.75, radius: 60, agentRadius: journey.actor === 'player' ? 0.5 : 0.73 }
    );
    assert.ok(path.length, `${journey.id} has no production route`);
  }
});

test('Level 5 covers all freight entrances, infection phases, and visual collision contracts', () => {
  const boundaryIds = new Set([
    ...FREIGHT_ANNEX.colliders.map(item => item.id),
    ...FREIGHT_ANNEX.walkableSurfaces.map(item => item.id)
  ]);
  for (const placement of FREIGHT_ANNEX.assets) {
    const expectation = level5AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing Level 5 contract for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }
  assert.deepEqual(LEVEL_5_COLLISION_PHASES.map(phase => phase.id), [
    'wave_21', 'wave_22', 'wave_23', 'wave_24', 'wave_25', 'liberated'
  ]);
  assert.equal(LEVEL_5_JOURNEYS.filter(journey => journey.actor === 'player').length, 8);
  assert.equal(LEVEL_5_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 12);
  assert.equal(LEVEL_5_JOURNEYS.filter(journey => journey.contractKind === 'portal_transit').length, 6);
  assert.equal(LEVEL_5_JOURNEYS.filter(journey => journey.contractKind === 'portal_convoy').length, 2);
  assert.ok(LEVEL_5_JOURNEYS.every(journey => journey.staticOnce));
  assert.equal(FREIGHT_ANNEX.entrances.filter(entrance => !entrance.air).length, 6);
  assert.equal(getLevelCollisionProfile('freight-annex').journeys, LEVEL_5_JOURNEYS);

  const infectedProps = FREIGHT_ANNEX.assets.find(item => item.asset === 'infectedprops');
  const nest = FREIGHT_ANNEX.assets.find(item => item.asset === 'industrialnest');
  const floorHatch = FREIGHT_ANNEX.assets.find(item => item.asset === 'floorhatch');
  const burrow = FREIGHT_ANNEX.assets.find(item => item.asset === 'burrowbreach');
  assert.equal(level5AssetPhaseExpectedVisible(infectedProps, 'wave_22'), false);
  assert.equal(level5AssetPhaseExpectedVisible(infectedProps, 'wave_23'), true);
  assert.equal(level5AssetPhaseExpectedVisible(infectedProps, 'liberated'), false);
  assert.equal(level5AssetPhaseExpectedVisible(nest, 'wave_24'), false);
  assert.equal(level5AssetPhaseExpectedVisible(nest, 'wave_25'), true);
  assert.equal(level5AssetCollisionExpectation(nest).phaseBound, true);
  assert.deepEqual(level5AssetCollisionExpectation(nest).colliderIds, ['boss-industrial-nest']);
  assert.equal(level5AssetCollisionExpectation(floorHatch).occupancyPolicy, 'ambient_allowed');
  assert.equal(level5AssetCollisionExpectation(burrow).occupancyPolicy, 'ambient_allowed');
});

test('every Level 5 journey has a production path with the correct actor margin', () => {
  const movementBoxes = FREIGHT_ANNEX.colliders
    .filter(collider => collider.blocksMovement !== false)
    .map(colliderWorldAabb);
  for (const journey of LEVEL_5_JOURNEYS) {
    const path = findPath(
      { x: journey.start[0], z: journey.start[1] },
      { x: journey.goal[0], z: journey.goal[1] },
      movementBoxes,
      { gridSize: 0.75, radius: 68, agentRadius: journey.actor === 'player' ? 0.5 : 0.73 }
    );
    assert.ok(path.length, `${journey.id} has no production route`);
  }
});

test('Level 6 covers all Mirror Garden phases, ground entrances, and retracting thresholds', () => {
  const boundaryIds = new Set(MIRROR_GARDEN.colliders.map(item => item.id));
  for (const placement of MIRROR_GARDEN.assets) {
    const expectation = level6AssetCollisionExpectation(placement);
    assert.ok(expectation, `missing Level 6 contract for ${placement.asset}`);
    for (const colliderId of expectation.colliderIds) {
      assert.ok(boundaryIds.has(colliderId), `${placement.asset} refers to missing ${colliderId}`);
    }
  }

  assert.deepEqual(LEVEL_6_COLLISION_PHASES.map(phase => phase.id), [
    'wave_26', 'wave_27', 'wave_28', 'wave_29', 'wave_30', 'liberated'
  ]);
  assert.equal(MIRROR_GARDEN.entrances.filter(entrance => !entrance.air).length, 7);
  assert.equal(LEVEL_6_JOURNEYS.filter(journey => journey.actor === 'player').length, 9);
  assert.equal(LEVEL_6_JOURNEYS.filter(journey => journey.actor === 'enemy').length, 11);
  assert.equal(LEVEL_6_JOURNEYS.filter(journey => journey.contractKind === 'portal_transit').length, 8);
  assert.equal(LEVEL_6_JOURNEYS.filter(journey => journey.enemyType === 'tank').length, 4);
  assert.equal(getLevelCollisionProfile('mirror-garden').journeys, LEVEL_6_JOURNEYS);

  const mirror = MIRROR_GARDEN.assets.find(item => item.asset === 'mirrorpanels');
  const generation = MIRROR_GARDEN.assets.find(item => item.asset === 'generationmarkers');
  const splitRing = MIRROR_GARDEN.assets.find(item => item.asset === 'splitring');
  assert.equal(level6AssetPhaseExpectedVisible(mirror, 'wave_29'), true);
  assert.equal(level6AssetPhaseExpectedVisible(mirror, 'wave_30'), false);
  assert.equal(level6AssetPhaseExpectedVisible(mirror, 'liberated'), false);
  assert.equal(level6AssetPhaseExpectedVisible(generation, 'wave_26'), false);
  assert.equal(level6AssetPhaseExpectedVisible(generation, 'wave_27'), true);
  assert.equal(level6AssetPhaseExpectedVisible(generation, 'liberated'), false);
  assert.equal(level6AssetPhaseExpectedVisible(splitRing, 'wave_30'), true);
  assert.equal(level6AssetPhaseExpectedVisible(splitRing, 'liberated'), false);
  assert.equal(level6AssetCollisionExpectation(mirror).phaseBound, true);

  assert.equal(MIRROR_GARDEN.assets
    .filter(placement => level6AssetCollisionExpectation(placement).missingBoundary).length, 0);
  assert.ok(MIRROR_GARDEN.assets.filter(placement => placement.asset === 'lightmast')
    .every(placement => level6AssetCollisionExpectation(placement).colliderIds.length === 3));
  assert.ok(MIRROR_GARDEN.assets.filter(placement => placement.asset === 'emergencysign')
    .every(placement => level6AssetCollisionExpectation(placement).occupancyPolicy === 'portal_composite'));
});

test('every Level 6 journey has a production path in its contracted phase geometry', () => {
  for (const journey of LEVEL_6_JOURNEYS) {
    const openShortcut = !!journey.applicablePhases;
    const movementBoxes = MIRROR_GARDEN.colliders
      .filter(collider => collider.blocksMovement !== false
        && (!openShortcut || !(collider.tags || []).includes('phase-hidden-objective')))
      .map(colliderWorldAabb);
    const path = findPath(
      { x: journey.start[0], z: journey.start[1] },
      { x: journey.goal[0], z: journey.goal[1] },
      movementBoxes,
      { gridSize: 0.75, radius: 68, agentRadius: journey.agentRadius ?? (journey.actor === 'player' ? 0.5 : 0.73) }
    );
    assert.ok(path.length, `${journey.id} has no production route`);
  }
});

test('adaptive approach crossing requires the actual route corridor to touch the target', () => {
  const bounds = { min: { x: -1, z: -1 }, max: { x: 1, z: 1 } };
  assert.equal(segmentIntersectsExpandedBounds2D({ x: 0, z: -4 }, { x: 0, z: 4 }, bounds, 0.45), true);
  assert.equal(segmentIntersectsExpandedBounds2D({ x: 2, z: -4 }, { x: 2, z: 4 }, bounds, 0.45), false);
  assert.equal(segmentIntersectsExpandedBounds2D({ x: 1.3, z: -4 }, { x: 1.3, z: 4 }, bounds, 0.45), true);
});

test('solid checks pass only when walking and both weapon channels are blocked', () => {
  const healthy = evaluateSolidCollisionProbe(solidProbe());
  assert.equal(healthy.status, 'pass');

  const leaking = evaluateSolidCollisionProbe(solidProbe({
    channels: {
      ...solidProbe().channels,
      playerWalk: { exercised: true, blocked: false, progress: 4, expectedProgress: 3 },
      enemyShot: { exercised: true, blocked: false, progress: 4, expectedProgress: 3 }
    }
  }));
  assert.equal(leaking.status, 'fail');
  assert.ok(leaking.findings.some(item => item.code === 'player_walked_through_solid'));
  assert.ok(leaking.findings.some(item => item.code === 'enemy_shot_through_solid'));
});

test('split Level 2 collider proxies only require their applicable channels', () => {
  const movementOnly = evaluateSolidCollisionProbe(solidProbe({
    channels: {
      playerWalk: { exercised: true, blocked: true },
      playerJumpWalk: { exercised: true, expectedPass: false, passed: false },
      enemyWalk: { exercised: true, blocked: true },
      playerShot: { exercised: false, notApplicable: true },
      enemyShot: { exercised: false, notApplicable: true }
    }
  }));
  const ballisticOnly = evaluateSolidCollisionProbe(solidProbe({
    channels: {
      playerWalk: { exercised: false, notApplicable: true },
      playerJumpWalk: { exercised: false, notApplicable: true },
      enemyWalk: { exercised: false, notApplicable: true },
      playerShot: { exercised: true, blocked: true },
      enemyShot: { exercised: true, blocked: true }
    }
  }));
  assert.equal(movementOnly.status, 'pass');
  assert.equal(ballisticOnly.status, 'pass');
});

test('low cover that blocks walking but cannot be jumped is reported as a warning', () => {
  const result = evaluateSolidCollisionProbe(solidProbe({
    geometry: { height: 1.15, crossingDepth: 1.6 },
    channels: {
      ...solidProbe().channels,
      playerJumpWalk: { exercised: true, expectedPass: true, passed: false, progress: 0.8 }
    }
  }));
  assert.equal(result.status, 'warn');
  assert.ok(result.findings.some(item => item.code === 'low_obstacle_not_jumpable'));
});

test('visual boundary checks distinguish missing, disconnected, and intentional non-blocking assets', () => {
  const missing = evaluateAssetBoundaryProbe({
    objectId: 'asset:terminal:0', objectKind: 'visual_asset', assetId: 'terminal', placementIndex: 0,
    expectation: { mode: 'solid', colliderIds: ['west-terminal'], sizeCheck: 'direct' },
    assetLoaded: true, missingColliderIds: ['west-terminal'], overlappingColliderIds: []
  });
  assert.equal(missing.status, 'fail');
  assert.equal(missing.findings[0].code, 'asset_expected_collider_missing');

  const disconnected = evaluateAssetBoundaryProbe({
    objectId: 'asset:terminal:0', objectKind: 'visual_asset', assetId: 'terminal', placementIndex: 0,
    expectation: { mode: 'solid', colliderIds: ['west-terminal'], sizeCheck: 'direct' },
    assetLoaded: true, missingColliderIds: [], overlappingColliderIds: []
  });
  assert.equal(disconnected.status, 'fail');
  assert.equal(disconnected.findings[0].code, 'asset_visual_and_boundary_disconnected');

  const decorative = evaluateAssetBoundaryProbe({
    objectId: 'asset:floorhatch:0', objectKind: 'visual_asset', assetId: 'floorhatch', placementIndex: 0,
    expectation: { mode: 'nonblocking', colliderIds: [], sizeCheck: 'none' },
    assetLoaded: true, missingColliderIds: [], overlappingColliderIds: []
  });
  assert.equal(decorative.status, 'pass');
});

test('phase-hidden assets fail on wrong visibility or a lingering dedicated collision boundary', () => {
  const wrongVisibility = evaluateAssetBoundaryProbe({
    objectId: 'wave_5:asset:terminal:0', objectKind: 'visual_asset', assetId: 'terminal', placementIndex: 0,
    phaseId: 'wave_5', expectedVisible: false, actualVisible: true,
    expectation: { mode: 'solid', colliderIds: ['west-terminal'], sizeCheck: 'shared' },
    assetLoaded: true, missingColliderIds: [], overlappingColliderIds: ['west-terminal'], activeColliderIds: ['west-terminal']
  });
  assert.equal(wrongVisibility.status, 'fail');
  assert.ok(wrongVisibility.findings.some(item => item.code === 'asset_phase_visibility_mismatch'));

  const ghostBoundary = evaluateAssetBoundaryProbe({
    objectId: 'wave_5:asset:terminal:0', objectKind: 'visual_asset', assetId: 'terminal', placementIndex: 0,
    phaseId: 'wave_5', expectedVisible: false, actualVisible: false,
    expectation: { mode: 'solid', colliderIds: ['west-terminal'], sizeCheck: 'direct' },
    assetLoaded: true, missingColliderIds: [], overlappingColliderIds: ['west-terminal'], activeColliderIds: ['west-terminal']
  });
  assert.equal(ghostBoundary.status, 'fail');
  assert.ok(ghostBoundary.findings.some(item => item.code === 'hidden_asset_retains_solid_boundary'));

  const hiddenAndInactive = evaluateAssetBoundaryProbe({
    objectId: 'wave_24:asset:industrialnest:0', objectKind: 'visual_asset', assetId: 'industrialnest', placementIndex: 0,
    phaseId: 'wave_24', expectedVisible: false, actualVisible: false,
    expectation: { mode: 'solid', colliderIds: ['boss-industrial-nest'], sizeCheck: 'direct', phaseBound: true },
    assetLoaded: true, missingColliderIds: [], overlappingColliderIds: ['boss-industrial-nest'], activeColliderIds: []
  });
  assert.equal(hiddenAndInactive.status, 'pass');
});

test('journeys require destination progress, no prolonged stuck state, and no visible penetration', () => {
  const base = {
    objectId: 'wave_1:journey:player_spawn_to_mast', objectKind: 'journey',
    phaseId: 'wave_1', journeyId: 'player_spawn_to_mast', start: [0, 22], goal: [0, -2]
  };
  const healthy = evaluateLevelJourneyProbe({
    ...base,
    metrics: { pathFound: true, reachedGoal: true, finalDistance: 0.8, progressRatio: 0.97, maxConsecutiveStuckSeconds: 0.4, visualPenetrationTicks: 0 }
  });
  assert.equal(healthy.status, 'pass');

  const trapped = evaluateLevelJourneyProbe({
    ...base,
    metrics: {
      pathFound: true, reachedGoal: false, finalDistance: 15, progressRatio: 0.35,
      elapsedSeconds: 26, maxConsecutiveStuckSeconds: 8, blockedBy: { world: 480 },
      visualPenetrationTicks: 42, maxConsecutiveVisualPenetrationTicks: 42,
      penetratedAssetCount: 1, penetratedAssets: [{ assetId: 'checkpoint', totalTicks: 42, maxConsecutiveTicks: 42 }]
    }
  });
  assert.equal(trapped.status, 'fail');
  assert.ok(trapped.findings.some(item => item.code === 'journey_destination_unreachable'));
  assert.ok(trapped.findings.some(item => item.code === 'journey_stuck'));
  assert.ok(trapped.findings.some(item => item.code === 'journey_entered_visible_geometry'));
});

test('portal transit cannot pass by routing around a player-traversable opening', () => {
  const base = {
    objectId: 'wave_6:journey:portal_west_tank_southbound', objectKind: 'journey',
    phaseId: 'wave_6', journeyId: 'portal_west_tank_southbound', actor: 'enemy', enemyType: 'tank',
    contractKind: 'portal_transit', portalId: 'west-decon',
    portalPlane: { axis: 'z', value: 19, crossAxis: 'x', min: -21.94, max: -18.06 },
    start: [-20, 22.5], goal: [-20, 15.5]
  };
  const healthy = evaluateLevelJourneyProbe({
    ...base,
    metrics: {
      pathFound: true, reachedGoal: true, portalCrossed: true, portalCrossingWithinOpening: true,
      portalCrossingCoordinate: -20, maxConsecutiveStuckSeconds: 0, maxConsecutiveVisualPenetrationTicks: 0
    }
  });
  const bypassed = evaluateLevelJourneyProbe({
    ...base,
    metrics: {
      pathFound: true, reachedGoal: true, portalCrossed: true, portalCrossingWithinOpening: false,
      portalCrossingCoordinate: -17, maxConsecutiveStuckSeconds: 0, maxConsecutiveVisualPenetrationTicks: 0
    }
  });
  assert.equal(healthy.status, 'pass');
  assert.equal(bypassed.status, 'fail');
  assert.ok(bypassed.findings.some(item => item.code === 'portal_transit_bypassed_opening'));
});

test('asset approach judgments require broad exercise and distinguish solid penetration from explicit non-blocking geometry', () => {
  const approaches = ['north', 'east', 'south', 'west'].map(direction => ({
    direction, exercised: true, stoppedByWorld: true, crossedVisualFootprint: false,
    totalPenetrationTicks: 0, maxConsecutivePenetrationTicks: 0
  }));
  const solidPass = evaluateAssetApproachProbe({
    objectId: 'wave_1:approach:checkpoint:0:player', objectKind: 'asset_approach',
    phaseId: 'wave_1', assetId: 'checkpoint', actor: 'player', expectation: { mode: 'solid' },
    metrics: { approaches }
  });
  assert.equal(solidPass.status, 'pass');

  const penetrated = approaches.map((item, index) => index === 1 ? {
    ...item, totalPenetrationTicks: 18, maxConsecutivePenetrationTicks: 18,
    firstContact: { position: { x: 1, y: 1.7, z: 2 } }
  } : item);
  const solidFail = evaluateAssetApproachProbe({
    objectId: 'wave_1:approach:checkpoint:0:player', objectKind: 'asset_approach',
    phaseId: 'wave_1', assetId: 'checkpoint', actor: 'player', expectation: { mode: 'solid' },
    metrics: { approaches: penetrated }
  });
  assert.equal(solidFail.status, 'fail');
  assert.ok(solidFail.findings.some(item => item.code === 'asset_approach_entered_visible_geometry'));

  const nonblocking = evaluateAssetApproachProbe({
    objectId: 'wave_1:approach:floorhatch:0:player', objectKind: 'asset_approach',
    phaseId: 'wave_1', assetId: 'floorhatch', actor: 'player', expectation: { mode: 'nonblocking' },
    metrics: { approaches: penetrated }
  });
  assert.equal(nonblocking.status, 'warn');

  const legalSlide = evaluateAssetApproachProbe({
    objectId: 'wave_1:approach:barriers:0:player', objectKind: 'asset_approach',
    phaseId: 'wave_1', assetId: 'barriers', actor: 'player', expectation: { mode: 'solid' },
    minimumApproaches: 1,
    metrics: {
      approaches: [{
        direction: 'north_east', exercised: true, stoppedByWorld: true,
        reachedFarSide: true, maxLateralDeviation: 1.2, crossedVisualFootprint: false,
        totalPenetrationTicks: 0, maxConsecutivePenetrationTicks: 0
      }]
    }
  });
  assert.equal(legalSlide.status, 'pass');

  const steppedOverBase = evaluateAssetApproachProbe({
    objectId: 'wave_13:approach:capturebeacon:0:player', objectKind: 'asset_approach',
    phaseId: 'wave_13', assetId: 'capturebeacon', actor: 'player',
    expectation: { mode: 'solid', occupancyPolicy: 'step_base_composite' },
    minimumApproaches: 1,
    metrics: {
      approaches: [{
        direction: 'north', exercised: true, stoppedByWorld: true,
        crossedVisualFootprint: true, totalPenetrationTicks: 0, maxConsecutivePenetrationTicks: 0
      }]
    }
  });
  assert.equal(steppedOverBase.status, 'pass');
});

test('level report keeps failures and inconclusive evidence out of healthy summary', () => {
  const report = buildLevelCollisionReport({
    levelId: 'sanitizer-spire',
    startedAt: '2026-07-19T00:00:00.000Z',
    completedAt: '2026-07-19T00:00:01.000Z',
    results: [
      { objectKind: 'solid', status: 'pass', findings: [] },
      { objectKind: 'solid', status: 'fail', findings: [{ code: 'player_shot_through_solid' }] },
      { objectKind: 'visual_asset', status: 'inconclusive', findings: [{ code: 'asset_collision_contract_missing' }] }
    ]
  });
  assert.equal(report.schemaVersion, 7);
  assert.equal(report.diagnostic, 'level-collision');
  assert.equal(report.levelId, 'sanitizer-spire');
  assert.equal(report.summary.healthy, false);
  assert.deepEqual(report.summary.byKind.solid, { pass: 1, warn: 0, fail: 1, inconclusive: 0 });
  assert.deepEqual(report.summary.byPhase.unspecified, { pass: 1, warn: 0, fail: 1, inconclusive: 1 });
  assert.equal(report.summary.inconclusive, 1);
});

test('level report consolidates repeated phase evidence into physical root causes', () => {
  const repeatedFinding = { code: 'asset_approach_entered_visible_geometry', severity: 'fail' };
  const report = buildLevelCollisionReport({
    levelId: 'ad-zone-arena',
    results: [
      { objectId: 'wave_11:approach:roadblock:0:player', levelObjectId: 'approach:roadblock:0:player', objectKind: 'asset_approach', phaseId: 'wave_11', status: 'fail', findings: [repeatedFinding] },
      { objectId: 'wave_12:approach:roadblock:0:player', levelObjectId: 'approach:roadblock:0:player', objectKind: 'asset_approach', phaseId: 'wave_12', status: 'fail', findings: [repeatedFinding] }
    ]
  });
  assert.equal(report.summary.prioritizedFindings[0].count, 2);
  assert.equal(report.summary.uniqueRootCauses, 1);
  assert.deepEqual(report.summary.rootCauseFindings[0], {
    code: 'asset_approach_entered_visible_geometry',
    levelObjectId: 'approach:roadblock:0:player',
    objectKind: 'asset_approach',
    severity: 'fail',
    occurrences: 2,
    phases: ['wave_11', 'wave_12']
  });
});

test('Wave 41 Last Order has a full escape collision contract', () => {
  const profile = getLevelCollisionProfile('last-order-base');
  assert.equal(profile.phases, LAST_ORDER_COLLISION_PHASES);
  assert.equal(profile.journeys, LAST_ORDER_JOURNEYS);
  assert.deepEqual(LAST_ORDER_COLLISION_PHASES.map(phase => phase.wave), [41]);

  const fullEscape = LAST_ORDER_JOURNEYS.find(journey => journey.id === 'player_full_escape');
  assert.deepEqual(fullEscape.start, [LAST_ORDER_BASE.playerSpawn[0], LAST_ORDER_BASE.playerSpawn[2]]);
  assert.deepEqual(fullEscape.goal, LAST_ORDER_BASE.objectives.escape.position);
  assert.ok(fullEscape.pathRadius > 56, 'the route search must cover the full 120m escape corridor');

  const [width, depth] = LAST_ORDER_BASE.size;
  for (const journey of LAST_ORDER_JOURNEYS) {
    for (const [x, z] of [journey.start, journey.goal]) {
      assert.ok(Math.abs(x) <= width / 2, `${journey.id} x=${x} must remain inside the corridor`);
      assert.ok(Math.abs(z) <= depth / 2, `${journey.id} z=${z} must remain inside the corridor`);
    }
  }

  const colliderIds = new Set(LAST_ORDER_BASE.colliders.map(collider => collider.id));
  for (const placement of LAST_ORDER_BASE.assets) {
    assert.equal(lastOrderAssetPhaseExpectedVisible(placement, 'wave_41'), true);
    const expectation = lastOrderAssetCollisionExpectation(placement);
    assert.ok(expectation, `${placement.asset} must have a Wave 41 collision contract`);
    if (expectation.mode !== 'solid') continue;
    assert.ok(expectation.colliderIds.length > 0, `${placement.asset} must name its authored colliders`);
    for (const id of expectation.colliderIds) {
      assert.ok(colliderIds.has(id), `${placement.asset} is missing collider ${id}`);
    }
  }
});

test('late campaign levels expose complete asset, phase, and journey collision contracts', () => {
  const configurations = [
    {
      level: CONTENT_COURT,
      phases: CONTENT_COURT_COLLISION_PHASES,
      journeys: CONTENT_COURT_JOURNEYS,
      expectation: contentCourtAssetCollisionExpectation,
      visibility: contentCourtAssetPhaseExpectedVisible,
      phaseWaves: [31, 32, 33, 34, 35, 35]
    },
    {
      level: SERVER_CATHEDRAL,
      phases: SERVER_CATHEDRAL_COLLISION_PHASES,
      journeys: SERVER_CATHEDRAL_JOURNEYS,
      expectation: serverCathedralAssetCollisionExpectation,
      visibility: serverCathedralAssetPhaseExpectedVisible,
      phaseWaves: [36, 37, 38, 39, 40, 40]
    },
    {
      level: SANDSTORM_EXPANSE,
      phases: SANDSTORM_COLLISION_PHASES,
      journeys: SANDSTORM_JOURNEYS,
      expectation: sandstormAssetCollisionExpectation,
      visibility: sandstormAssetPhaseExpectedVisible,
      phaseWaves: [42, 45, 48, 51, 51]
    },
    {
      level: FLOODGATE_CONTINUITY,
      phases: FLOODGATE_COLLISION_PHASES,
      journeys: FLOODGATE_JOURNEYS,
      expectation: floodgateAssetCollisionExpectation,
      visibility: floodgateAssetPhaseExpectedVisible,
      phaseWaves: [52, 59, 66, 72, 72]
    },
    {
      level: BLACKOUT_CISTERN,
      phases: BLACKOUT_CISTERN_COLLISION_PHASES,
      journeys: BLACKOUT_CISTERN_JOURNEYS,
      expectation: blackoutCisternAssetCollisionExpectation,
      visibility: blackoutCisternAssetPhaseExpectedVisible,
      phaseWaves: [73, 73]
    }
  ];

  for (const configuration of configurations) {
    const { level, phases, journeys, expectation } = configuration;
    const profile = getLevelCollisionProfile(level.id);
    assert.equal(profile.phases, phases, `${level.id} phase catalog`);
    assert.equal(profile.journeys, journeys, `${level.id} journey catalog`);
    assert.deepEqual(phases.map(phase => phase.wave), configuration.phaseWaves, `${level.id} phase waves`);
    assert.ok(journeys.some(journey => journey.actor === 'player'), `${level.id} needs a player journey`);
    assert.ok(journeys.some(journey => journey.actor === 'enemy'), `${level.id} needs an enemy journey`);

    const boundaryIds = new Set([
      ...level.colliders.map(collider => collider.id),
      ...level.walkableSurfaces.map(surface => surface.id)
    ]);
    const placementCount = new Map();
    for (const placement of level.assets) {
      const placementIndex = placementCount.get(placement.asset) || 0;
      placementCount.set(placement.asset, placementIndex + 1);
      const contract = expectation(placement, placementIndex, level);
      assert.ok(contract, `${level.id} ${placement.asset} #${placementIndex + 1} is missing a collision contract`);
      assert.ok(['solid', 'nonblocking'].includes(contract.mode), `${level.id} ${placement.asset} contract mode`);
      if (contract.mode === 'solid') {
        assert.ok(contract.colliderIds.length > 0, `${level.id} ${placement.asset} must name colliders`);
        for (const id of contract.colliderIds) {
          assert.ok(boundaryIds.has(id), `${level.id} ${placement.asset} refers to missing ${id}`);
        }
      }
    }
  }

  assert.throws(() => getLevelCollisionProfile('new-level-without-contract'), /Unknown level collision profile/);

  const choir = SERVER_CATHEDRAL.assets.find(placement => placement.tags.includes('choirDressing'));
  const root = SERVER_CATHEDRAL.assets.find(placement => placement.tags.includes('rootDressing'));
  const monument = SANDSTORM_EXPANSE.assets.find(placement => placement.tags.includes('enduranceComplete'));
  const seed = FLOODGATE_CONTINUITY.assets.find(placement => placement.tags.includes('archiveSeeds'));
  assert.equal(serverCathedralAssetPhaseExpectedVisible(choir, 'wave_37'), false);
  assert.equal(serverCathedralAssetPhaseExpectedVisible(choir, 'wave_38'), true);
  assert.equal(serverCathedralAssetPhaseExpectedVisible(root, 'wave_38'), false);
  assert.equal(serverCathedralAssetPhaseExpectedVisible(root, 'wave_40'), true);
  assert.equal(sandstormAssetPhaseExpectedVisible(monument, 'wave_51'), false);
  assert.equal(sandstormAssetPhaseExpectedVisible(monument, 'liberated'), true);
  assert.equal(floodgateAssetPhaseExpectedVisible(seed, 'wave_59'), false);
  assert.equal(floodgateAssetPhaseExpectedVisible(seed, 'wave_66'), true);
  assert.equal(floodgateAssetPhaseExpectedVisible(seed, 'liberated'), false);
  assert.equal(blackoutCisternAssetPhaseExpectedVisible(BLACKOUT_CISTERN.assets[0], 'wave_73'), true);
});

test('late campaign player objectives and enemy entrances remain routed through phase collision', () => {
  const configurations = [
    [CONTENT_COURT, CONTENT_COURT_COLLISION_PHASES, CONTENT_COURT_JOURNEYS, contentCourtAssetPhaseExpectedVisible],
    [SERVER_CATHEDRAL, SERVER_CATHEDRAL_COLLISION_PHASES, SERVER_CATHEDRAL_JOURNEYS, serverCathedralAssetPhaseExpectedVisible],
    [SANDSTORM_EXPANSE, SANDSTORM_COLLISION_PHASES, SANDSTORM_JOURNEYS, sandstormAssetPhaseExpectedVisible],
    [FLOODGATE_CONTINUITY, FLOODGATE_COLLISION_PHASES, FLOODGATE_JOURNEYS, floodgateAssetPhaseExpectedVisible],
    [BLACKOUT_CISTERN, BLACKOUT_CISTERN_COLLISION_PHASES, BLACKOUT_CISTERN_JOURNEYS, blackoutCisternAssetPhaseExpectedVisible]
  ];

  for (const [level, phases, journeys, visibleInPhase] of configurations) {
    for (const phase of phases) {
      const movementBoxes = level.colliders
        .filter(collider => collider.blocksMovement !== false)
        .filter(collider => visibleInPhase({ tags: collider.tags || [] }, phase.id))
        .map(colliderWorldAabb);
      for (const journey of journeys) {
        if (journey.applicablePhases && !journey.applicablePhases.includes(phase.id)) continue;
        const path = findPath(
          { x: journey.start[0], z: journey.start[1] },
          { x: journey.goal[0], z: journey.goal[1] },
          movementBoxes,
          {
            gridSize: 1,
            radius: journey.pathRadius ?? Math.max(level.size[0], level.size[1]) / 2 + 8,
            agentRadius: journey.agentRadius ?? (journey.actor === 'player' ? .5 : .73)
          }
        );
        assert.ok(path.length, `${level.id} ${phase.id} blocks ${journey.id}`);
      }
    }
  }
});

test('all three diagnostic pages expose the multi-level tab and manual controls', () => {
  const enemyHtml = fs.readFileSync(new URL('../test-enemy-reactions.html', import.meta.url), 'utf8');
  const bossHtml = fs.readFileSync(new URL('../test-boss-reactions.html', import.meta.url), 'utf8');
  const collisionHtml = fs.readFileSync(new URL('../test-level-collisions.html', import.meta.url), 'utf8');

  assert.match(enemyHtml, /href="test-level-collisions\.html">Level obstacles/);
  assert.match(bossHtml, /href="test-level-collisions\.html">Level obstacles/);
  assert.match(collisionHtml, /level-collision-diagnostic-runner\.js/);
  assert.match(collisionHtml, /id="kindFilter"/);
  assert.match(collisionHtml, /id="phaseFilter"/);
  assert.match(collisionHtml, /id="levelFilter"/);
  assert.match(collisionHtml, /value="sanitizer-spire">Level 2/);
  assert.match(collisionHtml, /value="ad-zone-arena">Level 3/);
  assert.match(collisionHtml, /value="trend-wastes">Level 4/);
  assert.match(collisionHtml, /value="freight-annex">Level 5/);
  assert.match(collisionHtml, /value="mirror-garden">Level 6/);
  assert.match(collisionHtml, /value="content-court">Level 7/);
  assert.match(collisionHtml, /value="last-order-base">Special .* Last Order Base \(Wave 41\)/);
  assert.match(collisionHtml, /value="server-cathedral">Server Cathedral/);
  assert.match(collisionHtml, /value="sandstorm-expanse">Sandstorm Expanse/);
  assert.match(collisionHtml, /value="floodgate-continuity">Floodgate Continuity/);
  assert.match(collisionHtml, /value="blackout-cistern">Blackout Cistern/);
  assert.match(collisionHtml, /value="journey">Full-scene journeys/);
  assert.match(collisionHtml, /value="portal_transit">Player\/enemy portal parity/);
  assert.match(collisionHtml, /value="approach">Asset perimeter approaches/);
  assert.match(collisionHtml, /id="objectFilter"/);
  assert.match(collisionHtml, /id="stop"/);
  assert.match(collisionHtml, /Nothing starts automatically/i);
});

test('runtime diagnostic finalizes parent transforms and stores compact reproducible penetration evidence', () => {
  const runner = fs.readFileSync(new URL('../src/debug/level-collision-diagnostic-runner.js', import.meta.url), 'utf8');
  assert.match(runner, /levelRuntime\.group\.updateWorldMatrix\(true, true\)/);
  assert.match(runner, /geometry\?\.boundingBox\?\.clone\(\)\.applyMatrix4\(node\.matrixWorld\)/);
  assert.match(runner, /firstContact:/);
  assert.match(runner, /penetrationEvidence\.slice\(0, 8\)/);
  assert.match(runner, /assetApproachDirections/);
  assert.match(runner, /plannedCorridorIntersectsTarget && actualCorridorIntersectsTarget/);
  assert.match(runner, /selectedLateralOffset/);
  assert.match(runner, /dynamicColliderSampling/);
  assert.match(runner, /refreshCachedSceneBounds/);
  assert.match(runner, /minimumApproachesForEntry/);
  assert.match(runner, /entry\.definition\?\.jumpExpectedPass/);
  assert.match(runner, /if \(entry\.actor === 'player'\) probePlayer\.refreshColliders\(objects\)/);
  assert.match(runner, /journey\.applicablePhases\.includes\(phase\.id\)/);
  assert.match(runner, /LAST_ORDER_BASE/);
  assert.match(runner, /CONTENT_COURT/);
  assert.match(runner, /'last-order-base'/);
  assert.match(runner, /SERVER_CATHEDRAL/);
  assert.match(runner, /SANDSTORM_EXPANSE/);
  assert.match(runner, /FLOODGATE_CONTINUITY/);
  assert.match(runner, /BLACKOUT_CISTERN/);
  assert.match(runner, /journey\.pathRadius \?\? 56/);
});

test('level diagnostic supports non-colliding channel boundary overlays', () => {
  const source = fs.readFileSync(new URL('../src/debug/level-collision-diagnostic-runner.js', import.meta.url), 'utf8');
  assert.match(source, /resolveBlockBoxChannels\(params\)/);
  assert.match(source, /debugColliderChannels/);
  assert.match(source, /blockBoxesAffectCollision:\s*false/);
});
