import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createEnvironmentAssetRegistry } from '../src/assets/environment/index.js';
import * as sharedCollisionProfiles from '../src/assets/collision-profiles.js';
import {
  AMMO_STATION_COLLIDER_PROFILE,
  APARTMENT_COLLIDER_PROFILE,
  ARCHIVE_SEED_COLLIDER_PROFILE,
  assetColliderProfileIds,
  BARRIERS_COLLIDER_PROFILE,
  BENT_TREE_COLLIDER_PROFILE,
  BILLBOARD_WALL_COLLIDER_PROFILE,
  BREACH_VENT_COLLIDER_PROFILE,
  BREAKABLE_COVER_COLLIDER_PROFILE,
  BROADLEAF_COLLIDER_PROFILE,
  CAPTURE_BEACON_COLLIDER_PROFILE,
  CHECKPOINT_COLLIDER_PROFILE,
  CLINIC_COLLIDER_PROFILE,
  CONCRETE_WALL_COLLIDER_PROFILE,
  CORNER_COVER_COLLIDER_PROFILE,
  CORNER_SHOP_COLLIDER_PROFILE,
  COVER_HEIGHTS_COLLIDER_PROFILE,
  DEAD_TREE_COLLIDER_PROFILE,
  ENDURANCE_MONUMENT_COLLIDER_PROFILE,
  FACADE_COLLIDER_PROFILE,
  FILTER_RUIN_COLLIDER_PROFILE,
  FLOODGATE_KIT_COLLIDER_PROFILE,
  GABION_COLLIDER_PROFILE,
  GENERATOR_COLLIDER_PROFILE,
  GREYWATER_CORE_COLLIDER_PROFILE,
  GLITCH_TOPIARY_COLLIDER_PROFILE,
  GUARD_BOOTH_COLLIDER_PROFILE,
  HESCO_COLLIDER_PROFILE,
  instantiateAssetColliderProfile,
  KIOSK_COLLIDER_PROFILE,
  LAST_LIGHT_REACTOR_COLLIDER_PROFILE,
  LIGHT_MAST_COLLIDER_PROFILE,
  MED_CACHE_COLLIDER_PROFILE,
  PEEK_COVER_COLLIDER_PROFILE,
  PIPES_COLLIDER_PROFILE,
  POWER_RELAY_COLLIDER_PROFILE,
  PUMP_TURBINE_COLLIDER_PROFILE,
  RELAY_MAST_COLLIDER_PROFILE,
  ROADBLOCK_COLLIDER_PROFILE,
  REEL_COLLIDER_PROFILE,
  RETAINING_WALL_COLLIDER_PROFILE,
  SANDBANK_COLLIDER_PROFILE,
  SCREEN_WALL_COLLIDER_PROFILE,
  SERVICE_WALL_COLLIDER_PROFILE,
  SLUICE_CONDUITS_COLLIDER_PROFILE,
  SPONSOR_PROJECTOR_COLLIDER_PROFILE,
  STORM_BEACON_COLLIDER_PROFILE,
  STORM_SIREN_COLLIDER_PROFILE,
  STREET_TREE_COLLIDER_PROFILE,
  TERMINAL_COLLIDER_PROFILE,
  TOWER_COLLIDER_PROFILE,
  TROLLEY_COLLIDER_PROFILE,
  WAREHOUSE_COLLIDER_PROFILE,
  WINDBREAKS_COLLIDER_PROFILE
} from '../src/assets/collision-profiles.js';
import {
  ARCHIVES_COLLIDER_PROFILE,
  CARGO_GATE_COLLIDER_PROFILE,
  CARGO_LIFT_COLLIDER_PROFILE,
  CATHEDRAL_KIT_COLLIDER_PROFILE,
  CATWALK_COLLIDER_PROFILE,
  CLINIC_WALL_COLLIDER_PROFILE,
  CORRIDOR_COLLIDER_PROFILE,
  DASHBOARD_WINDOWS_COLLIDER_PROFILE,
  EMERGENCY_SIGN_COLLIDER_PROFILE,
  END_CHOICE_COLLIDER_PROFILE,
  EXPANSE_BENT_TREE_COLLIDER_PROFILE,
  EXPANSE_DEAD_TREE_COLLIDER_PROFILE,
  EXPANSE_HESCO_COLLIDER_PROFILE,
  EXPANSE_WINDBREAK_COLLIDER_PROFILE,
  LADDER_PLATFORM_COLLIDER_PROFILE,
  MIRROR_CHOIR_COLLIDER_PROFILE,
  EXPANSE_TOWER_EDGE_COLLIDER_PROFILE,
  REINFORCEMENT_DOOR_COLLIDER_PROFILE,
  ROOT_ALTAR_COLLIDER_PROFILE,
  SHUTTER_COLLIDER_PROFILE,
  STAIRS_COLLIDER_PROFILE
} from '../src/assets/late-collision-profiles.js';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { SANITIZER_SPIRE } from '../src/levels/sanitizer-spire.js';
import { AD_ZONE_ARENA } from '../src/levels/ad-zone-arena.js';
import { TREND_WASTES } from '../src/levels/trend-wastes.js';
import { MIRROR_GARDEN } from '../src/levels/mirror-garden.js';
import { CONTENT_COURT } from '../src/levels/content-court.js';
import { SERVER_CATHEDRAL } from '../src/levels/server-cathedral.js';
import { SANDSTORM_EXPANSE } from '../src/levels/sandstorm-expanse.js';
import { FLOODGATE_CONTINUITY } from '../src/levels/floodgate-continuity.js';
import { BLACKOUT_CISTERN } from '../src/levels/blackout-cistern.js';
import { LAST_ORDER_BASE } from '../src/levels/last-order-base.js';

const generatedManifest = JSON.parse(readFileSync(new URL('../assets/generated/asset-manifest.json', import.meta.url), 'utf8'));
const generatedAsset = id => generatedManifest.assets.find(asset => asset.id === id);
const environmentAssets = createEnvironmentAssetRegistry({ THREE });
const buildEnvironmentAsset = id => {
  const definition = environmentAssets.find(asset => asset.id === id);
  assert.ok(definition, `${id} model factory is registered`);
  return definition.build();
};
const modelHasBox = (root, expected) => {
  let matched = false;
  root.traverse(node => {
    const parameters = node.geometry?.parameters;
    if (!parameters || node.geometry.type !== 'BoxGeometry') return;
    const actual = [parameters.width, parameters.height, parameters.depth];
    if (actual.every((value, index) => Math.abs(value - expected[index]) < 1e-6)) matched = true;
  });
  return matched;
};
const modelHasCylinder = (root, expected) => {
  let matched = false;
  root.traverse(node => {
    const parameters = node.geometry?.parameters;
    if (!parameters || node.geometry.type !== 'CylinderGeometry') return;
    const actual = [parameters.radiusTop, parameters.radiusBottom, parameters.height];
    if (actual.every((value, index) => Math.abs(value - expected[index]) < 1e-6)) matched = true;
  });
  return matched;
};

test('asset collision profiles follow placement scale, yaw, and position', () => {
  const colliders = instantiateAssetColliderProfile({
    assetId: 'sample',
    idPrefix: 'placed',
    placement: { position: [10, 2, -5], scale: 2, yaw: Math.PI / 2 },
    primitives: [{
      id: 'body', shape: 'box', position: [1, 1, 2], size: [2, 3, 4],
      blocksMovement: true, blocksShots: false, blocksSight: false
    }]
  });

  assert.equal(colliders.length, 1);
  assert.deepEqual(colliders[0].position.map(value => Math.round(value * 1e6) / 1e6), [14, 4, -7]);
  assert.deepEqual(colliders[0].size, [4, 6, 8]);
  assert.equal(colliders[0].rotation[1], Math.PI / 2);
  assert.equal(colliders[0].assetId, 'sample');
  assert.equal(colliders[0].primitiveId, 'body');
});

test('production asset profiles keep primitive counts bounded and channels explicit', () => {
  const profiles = [
    RELAY_MAST_COLLIDER_PROFILE, LIGHT_MAST_COLLIDER_PROFILE, STREET_TREE_COLLIDER_PROFILE,
    TERMINAL_COLLIDER_PROFILE, POWER_RELAY_COLLIDER_PROFILE, CAPTURE_BEACON_COLLIDER_PROFILE,
    APARTMENT_COLLIDER_PROFILE, CORNER_SHOP_COLLIDER_PROFILE, CHECKPOINT_COLLIDER_PROFILE,
    GABION_COLLIDER_PROFILE, BARRIERS_COLLIDER_PROFILE, ROADBLOCK_COLLIDER_PROFILE,
    BREACH_VENT_COLLIDER_PROFILE, CORNER_COVER_COLLIDER_PROFILE, FACADE_COLLIDER_PROFILE,
    CLINIC_COLLIDER_PROFILE, COVER_HEIGHTS_COLLIDER_PROFILE, PEEK_COVER_COLLIDER_PROFILE,
    BREAKABLE_COVER_COLLIDER_PROFILE, PIPES_COLLIDER_PROFILE, REEL_COLLIDER_PROFILE,
    BROADLEAF_COLLIDER_PROFILE, WINDBREAKS_COLLIDER_PROFILE, GLITCH_TOPIARY_COLLIDER_PROFILE,
    KIOSK_COLLIDER_PROFILE, TOWER_COLLIDER_PROFILE, GUARD_BOOTH_COLLIDER_PROFILE,
    SPONSOR_PROJECTOR_COLLIDER_PROFILE, STORM_BEACON_COLLIDER_PROFILE, FILTER_RUIN_COLLIDER_PROFILE,
    SCREEN_WALL_COLLIDER_PROFILE, RETAINING_WALL_COLLIDER_PROFILE, CONCRETE_WALL_COLLIDER_PROFILE,
    SERVICE_WALL_COLLIDER_PROFILE, GENERATOR_COLLIDER_PROFILE, HESCO_COLLIDER_PROFILE,
    TROLLEY_COLLIDER_PROFILE, WAREHOUSE_COLLIDER_PROFILE, BENT_TREE_COLLIDER_PROFILE,
    DEAD_TREE_COLLIDER_PROFILE, BILLBOARD_WALL_COLLIDER_PROFILE,
    AMMO_STATION_COLLIDER_PROFILE, MED_CACHE_COLLIDER_PROFILE, STORM_SIREN_COLLIDER_PROFILE,
    ENDURANCE_MONUMENT_COLLIDER_PROFILE, FLOODGATE_KIT_COLLIDER_PROFILE,
    PUMP_TURBINE_COLLIDER_PROFILE, SLUICE_CONDUITS_COLLIDER_PROFILE,
    ARCHIVE_SEED_COLLIDER_PROFILE, GREYWATER_CORE_COLLIDER_PROFILE,
    LAST_LIGHT_REACTOR_COLLIDER_PROFILE,
    CATHEDRAL_KIT_COLLIDER_PROFILE, DASHBOARD_WINDOWS_COLLIDER_PROFILE,
    CORRIDOR_COLLIDER_PROFILE, CLINIC_WALL_COLLIDER_PROFILE,
    ARCHIVES_COLLIDER_PROFILE, REINFORCEMENT_DOOR_COLLIDER_PROFILE, SHUTTER_COLLIDER_PROFILE,
    EMERGENCY_SIGN_COLLIDER_PROFILE, CARGO_LIFT_COLLIDER_PROFILE, CATWALK_COLLIDER_PROFILE,
    LADDER_PLATFORM_COLLIDER_PROFILE, STAIRS_COLLIDER_PROFILE, MIRROR_CHOIR_COLLIDER_PROFILE,
    ROOT_ALTAR_COLLIDER_PROFILE, END_CHOICE_COLLIDER_PROFILE, SANDBANK_COLLIDER_PROFILE,
    CARGO_GATE_COLLIDER_PROFILE, EXPANSE_HESCO_COLLIDER_PROFILE,
    EXPANSE_WINDBREAK_COLLIDER_PROFILE, EXPANSE_DEAD_TREE_COLLIDER_PROFILE,
    EXPANSE_BENT_TREE_COLLIDER_PROFILE, EXPANSE_TOWER_EDGE_COLLIDER_PROFILE
  ];
  assert.deepEqual(profiles.map(profile => profile.length), [12, 3, 2, 4, 7, 8, 2, 1, 5, 3, 3, 4, 4, 2, 6, 6, 6, 4, 4, 3, 7, 2, 7, 12, 2, 6, 3, 3, 5, 5, 4, 3, 2, 3, 2, 8, 7, 2, 8, 5, 5, 1, 1, 3, 3, 6, 3, 3, 2, 2, 3, 5, 3, 2, 3, 5, 2, 2, 5, 6, 4, 4, 9, 10, 6, 3, 3, 2, 2, 4, 3, 3, 3]);
  assert.ok(profiles.every(profile => profile.length <= 12), 'asset profiles stay within the low-primitive production budget');
  for (const primitive of profiles.flat()) {
    assert.equal(typeof primitive.blocksMovement, 'boolean');
    assert.equal(typeof primitive.blocksShots, 'boolean');
    assert.equal(typeof primitive.blocksSight, 'boolean');
  }
});

test('shared catalog re-exports the canonical late structural profiles without a duplicate definition', () => {
  const canonical = {
    ARCHIVES_COLLIDER_PROFILE,
    CARGO_LIFT_COLLIDER_PROFILE,
    CATHEDRAL_KIT_COLLIDER_PROFILE,
    CATWALK_COLLIDER_PROFILE,
    CLINIC_WALL_COLLIDER_PROFILE,
    CORRIDOR_COLLIDER_PROFILE,
    EMERGENCY_SIGN_COLLIDER_PROFILE,
    END_CHOICE_COLLIDER_PROFILE,
    LADDER_PLATFORM_COLLIDER_PROFILE,
    MIRROR_CHOIR_COLLIDER_PROFILE,
    REINFORCEMENT_DOOR_COLLIDER_PROFILE,
    ROOT_ALTAR_COLLIDER_PROFILE,
    SHUTTER_COLLIDER_PROFILE,
    STAIRS_COLLIDER_PROFILE
  };
  for (const [name, profile] of Object.entries(canonical)) {
    assert.equal(sharedCollisionProfiles[name], profile, `${name} must have one canonical module identity`);
  }
});

test('asset collision profiles reject implicit channel behavior', () => {
  assert.throws(() => instantiateAssetColliderProfile({
    assetId: 'unsafe',
    idPrefix: 'unsafe',
    placement: { position: [0, 0, 0], scale: 1, yaw: 0 },
    primitives: [{ id: 'implicit', position: [0, 1, 0], size: [1, 2, 1] }]
  }), /explicit blocksMovement/);
});

test('horizontal cylinder profiles compose their authored root yaw with placement yaw', () => {
  const [collider] = instantiateAssetColliderProfile({
    assetId: 'reel', idPrefix: 'reel',
    placement: { position: [0, 0, 0], scale: 1, yaw: .2 },
    primitives: [{
      id: 'drum', shape: 'cylinder', position: [0, 1, 0], size: [2, 1, 2], horizontalCylinderYaw: -.28,
      blocksMovement: false, blocksShots: true, blocksSight: true
    }]
  });
  assert.deepEqual(collider.rotation, [Math.PI / 2, 0, .08000000000000002]);
});

test('hard-profile extrema stay synchronized with generated model bounds', () => {
  const relayBounds = generatedAsset('relaymast').bounds;
  const relayBase = RELAY_MAST_COLLIDER_PROFILE.find(primitive => primitive.id === 'shot-base');
  const relayPole = RELAY_MAST_COLLIDER_PROFILE.find(primitive => primitive.id === 'shot-pole');
  assert.ok(Math.abs(relayBase.size[0] - relayBounds.size.x) < .001);
  assert.ok(Math.abs(relayBase.size[2] - relayBounds.size.z) < .001);
  assert.ok(Math.abs(relayPole.position[1] + relayPole.size[1] / 2 - relayBounds.max.y) < .001);

  const lightBounds = generatedAsset('lightmast').bounds;
  const lampBar = LIGHT_MAST_COLLIDER_PROFILE.find(primitive => primitive.id === 'lamp-bar');
  assert.ok(Math.abs(lampBar.position[1] + lampBar.size[1] / 2 - lightBounds.max.y) < .001);

  const planter = STREET_TREE_COLLIDER_PROFILE.find(primitive => primitive.id === 'planter');
  assert.deepEqual(planter.size, [3.3, .86, 2.65], 'street-tree hard collision follows the modeled planter, not its canopy bounds');

  const terminalBounds = generatedAsset('terminal').bounds;
  const terminalBase = TERMINAL_COLLIDER_PROFILE.find(primitive => primitive.id === 'base');
  assert.equal(terminalBase.size[0], terminalBounds.size.x);

  const powerRelayBounds = generatedAsset('powerrelay').bounds;
  const powerRelayBase = POWER_RELAY_COLLIDER_PROFILE.find(primitive => primitive.id === 'base');
  assert.equal(powerRelayBase.size[2], powerRelayBounds.size.z);

  const beaconBounds = generatedAsset('capturebeacon').bounds;
  const beaconBase = CAPTURE_BEACON_COLLIDER_PROFILE.find(primitive => primitive.id === 'shot-base');
  assert.equal(beaconBase.size[0], beaconBounds.size.x);
  assert.equal(beaconBase.size[2], beaconBounds.size.z);
});

test('late structural profiles preserve model openings instead of merging cages and ranks into invisible walls', () => {
  const cathedral = buildEnvironmentAsset('cathedralkit');
  for (const size of [[.65, 4.6, .65], [5.3, .28, .48]]) {
    assert.ok(modelHasBox(cathedral, size), `Cathedral source owns ${size.join(' x ')}`);
    assert.ok(CATHEDRAL_KIT_COLLIDER_PROFILE.some(primitive =>
      primitive.shape === 'box' && primitive.size.every((value, index) => value === size[index])));
  }

  const lift = buildEnvironmentAsset('cargolift');
  assert.ok(modelHasBox(lift, [.18, 3.2, .18]));
  const liftPosts = CARGO_LIFT_COLLIDER_PROFILE.filter(primitive => primitive.id.startsWith('post-'));
  assert.equal(liftPosts.length, 4, 'the lift cage keeps four exact corner posts');
  assert.ok(liftPosts.every(primitive => primitive.size[0] === .18 && primitive.size[2] === .18));
  assert.ok(!CARGO_LIFT_COLLIDER_PROFILE.some(primitive =>
    primitive.blocksMovement && primitive.size[1] > 1.5 && (primitive.size[0] > .3 || primitive.size[2] > .3)),
  'no tall lift primitive fills the open cage between bars');

  const catwalk = buildEnvironmentAsset('catwalk');
  assert.ok(modelHasBox(catwalk, [.18, 2.25, .18]));
  assert.equal(CATWALK_COLLIDER_PROFILE.filter(primitive => primitive.id.endsWith('inner-post')).length, 3);
  assert.equal(CATWALK_COLLIDER_PROFILE.find(primitive => primitive.id === 'deck').blocksMovement, false,
    'the elevated deck does not create an invisible ground-height wall');

  const ladder = buildEnvironmentAsset('ladderplatform');
  assert.ok(modelHasBox(ladder, [.16, 3, .16]));
  assert.equal(LADDER_PLATFORM_COLLIDER_PROFILE.filter(primitive => primitive.id.endsWith('inner-post')).length, 2);
  assert.equal(LADDER_PLATFORM_COLLIDER_PROFILE.find(primitive => primitive.id === 'ladder-envelope').blocksShots, false,
    'shots may pass through the visible ladder gaps');

  const choir = buildEnvironmentAsset('mirrorchoir');
  for (const size of [[.94, 2.55, .12], [.72, .92, .62]]) assert.ok(modelHasBox(choir, size));
  assert.equal(MIRROR_CHOIR_COLLIDER_PROFILE.length, 10);
  assert.equal(MIRROR_CHOIR_COLLIDER_PROFILE.filter(primitive => primitive.id.startsWith('mirror-')).length, 5);
  assert.equal(MIRROR_CHOIR_COLLIDER_PROFILE.filter(primitive => primitive.id.startsWith('terminal-')).length, 5);
  assert.ok(MIRROR_CHOIR_COLLIDER_PROFILE.every(primitive => primitive.size[2] <= .62),
    'choir ranks retain the visible gaps between mirrors and terminals');

  const archiveShelves = ARCHIVES_COLLIDER_PROFILE.filter(primitive => primitive.id.endsWith('shelf'));
  assert.ok(archiveShelves.every(primitive => primitive.blocksMovement && !primitive.blocksShots && !primitive.blocksSight),
    'shelf footprints block bodies without becoming opaque invisible cupboards');
});

test('Floodgate opening state leaves its visible doorway traversable', () => {
  const opening = FLOODGATE_KIT_COLLIDER_PROFILE.filter(primitive => primitive.tags?.includes('floodgateOpeningCollider'));
  assert.deepEqual(opening.map(primitive => primitive.id).sort(), [
    'opening-east-pier', 'opening-raised-gate', 'opening-west-pier'
  ]);
  const doorwayPoint = { x: -2, y: 1.7, z: 0 };
  const pointInside = primitive => {
    if (primitive.shape !== 'box') return false;
    return Math.abs(doorwayPoint.x - primitive.position[0]) <= primitive.size[0] / 2
      && Math.abs(doorwayPoint.y - primitive.position[1]) <= primitive.size[1] / 2
      && Math.abs(doorwayPoint.z - primitive.position[2]) <= primitive.size[2] / 2;
  };
  assert.ok(!opening.some(primitive => primitive.blocksMovement && pointInside(primitive)),
    'the player-height center of the raised gate must remain free of movement collision');
  assert.equal(opening.filter(primitive => primitive.blocksMovement).length, 2, 'only the visible side piers block movement');
});

test('Floodgate machinery follows upright model mass rather than step-height floor plates', () => {
  const machinery = buildEnvironmentAsset('pumpturbine');
  assert.ok(modelHasCylinder(machinery, [1.25, 1.4, 2.4]), 'pump source has the modeled tapered body');
  assert.ok(modelHasCylinder(machinery, [1.2, 1.55, .6]), 'turbine source has the modeled lower body');
  assert.ok(modelHasBox(machinery, [2.5, 2.2, 1.8]), 'turbine source has the modeled upright cabinet');
  assert.deepEqual(PUMP_TURBINE_COLLIDER_PROFILE.map(primitive => primitive.id), [
    'pump-body', 'turbine-body', 'turbine-stack'
  ]);
  assert.ok(!PUMP_TURBINE_COLLIDER_PROFILE.some(primitive =>
    primitive.shape === 'box' && primitive.size[1] > 1 && primitive.size[0] >= 4.6),
  'low machinery plates are not extruded into tall invisible boxes');

  const greywaterCore = GREYWATER_CORE_COLLIDER_PROFILE.find(primitive => primitive.id === 'core');
  assert.deepEqual(greywaterCore.size, [1.64, 4.9, 1.64],
    'the central proxy does not fill the visible gap out to the energy rings and pylons');
});

test('every authored reusable mast and street-tree placement uses its asset profile', () => {
  const levels = [
    RELAY_DISTRICT, SANITIZER_SPIRE, AD_ZONE_ARENA, TREND_WASTES, MIRROR_GARDEN, CONTENT_COURT,
    SERVER_CATHEDRAL, SANDSTORM_EXPANSE, FLOODGATE_CONTINUITY, BLACKOUT_CISTERN
  ];
  for (const level of levels) {
    const mastPlacements = level.assets.filter(placement => placement.asset === 'lightmast').length;
    const mastPrimitives = level.colliders.filter(collider => collider.assetId === 'lightmast');
    assert.equal(mastPrimitives.length, mastPlacements * LIGHT_MAST_COLLIDER_PROFILE.length, `${level.id} lightmast profiles`);

    const treePlacements = level.assets.filter(placement => placement.asset === 'streettree').length;
    const treePrimitives = level.colliders.filter(collider => collider.assetId === 'streettree');
    assert.equal(treePrimitives.length, treePlacements * STREET_TREE_COLLIDER_PROFILE.length, `${level.id} streettree profiles`);
  }
});

test('every authored objective prop uses its bounded asset profile', () => {
  const levels = [
    RELAY_DISTRICT, SANITIZER_SPIRE, AD_ZONE_ARENA, TREND_WASTES, MIRROR_GARDEN, CONTENT_COURT,
    SERVER_CATHEDRAL, SANDSTORM_EXPANSE, FLOODGATE_CONTINUITY, BLACKOUT_CISTERN
  ];
  const profiles = new Map([
    ['terminal', TERMINAL_COLLIDER_PROFILE],
    ['powerrelay', POWER_RELAY_COLLIDER_PROFILE],
    ['capturebeacon', CAPTURE_BEACON_COLLIDER_PROFILE]
  ]);

  for (const level of levels) {
    for (const [assetId, profile] of profiles) {
      let placementCount = level.assets.filter(placement => placement.asset === assetId).length;
      if (level.id === 'relay-district' && assetId === 'capturebeacon') {
        placementCount -= 1; // Co-located with, and intentionally shares, the Relay mast collision profile.
      }
      const primitives = level.colliders.filter(collider => collider.assetId === assetId);
      assert.equal(primitives.length, placementCount * profile.length, `${level.id} ${assetId} profiles`);
    }
    assert.ok(level.colliders.length <= 150, `${level.id} exceeds the static collider budget`);
  }

  assert.deepEqual(
    assetColliderProfileIds('beacon', CAPTURE_BEACON_COLLIDER_PROFILE),
    CAPTURE_BEACON_COLLIDER_PROFILE.map(primitive => `beacon-${primitive.id}`)
  );
});

test('post-campaign interior solids have model-backed colliders within the static budget', () => {
  const profileByAsset = new Map([
    ['stormsiren', STORM_SIREN_COLLIDER_PROFILE],
    ['endurancemonument', ENDURANCE_MONUMENT_COLLIDER_PROFILE],
    ['stormbeacon', STORM_BEACON_COLLIDER_PROFILE],
    ['windbreaks', EXPANSE_WINDBREAK_COLLIDER_PROFILE],
    ['hesco', EXPANSE_HESCO_COLLIDER_PROFILE],
    ['ammostation', AMMO_STATION_COLLIDER_PROFILE],
    ['medcache', MED_CACHE_COLLIDER_PROFILE],
    ['filterruin', FILTER_RUIN_COLLIDER_PROFILE],
    ['screenwall', SCREEN_WALL_COLLIDER_PROFILE],
    ['gabion', GABION_COLLIDER_PROFILE],
    ['roadblock', ROADBLOCK_COLLIDER_PROFILE],
    ['pipes', PIPES_COLLIDER_PROFILE],
    ['reel', REEL_COLLIDER_PROFILE],
    ['deadtree', EXPANSE_DEAD_TREE_COLLIDER_PROFILE],
    ['benttree', EXPANSE_BENT_TREE_COLLIDER_PROFILE],
    ['checkpoint', CHECKPOINT_COLLIDER_PROFILE],
    ['cargogate', CARGO_GATE_COLLIDER_PROFILE],
    ['tower', EXPANSE_TOWER_EDGE_COLLIDER_PROFILE],
    ['capturebeacon', CAPTURE_BEACON_COLLIDER_PROFILE],
    ['powerrelay', POWER_RELAY_COLLIDER_PROFILE],
    ['lightmast', LIGHT_MAST_COLLIDER_PROFILE],
    ['floodgatekit', FLOODGATE_KIT_COLLIDER_PROFILE],
    ['pumpturbine', PUMP_TURBINE_COLLIDER_PROFILE],
    ['sluiceconduits', SLUICE_CONDUITS_COLLIDER_PROFILE],
    ['archiveseed', ARCHIVE_SEED_COLLIDER_PROFILE],
    ['greywatercore', GREYWATER_CORE_COLLIDER_PROFILE],
    ['terminal', TERMINAL_COLLIDER_PROFILE],
    ['generator', GENERATOR_COLLIDER_PROFILE],
    ['peekcover', PEEK_COVER_COLLIDER_PROFILE],
    ['breakablecover', BREAKABLE_COVER_COLLIDER_PROFILE],
    ['lastlightreactor', LAST_LIGHT_REACTOR_COLLIDER_PROFILE],
    ['cornercover', CORNER_COVER_COLLIDER_PROFILE],
    ['sandbankkit', SANDBANK_COLLIDER_PROFILE],
    ['cathedralkit', CATHEDRAL_KIT_COLLIDER_PROFILE],
    ['dashboardwindows', DASHBOARD_WINDOWS_COLLIDER_PROFILE],
    ['corridor', CORRIDOR_COLLIDER_PROFILE],
    ['servicewall', SERVICE_WALL_COLLIDER_PROFILE],
    ['clinicwall', CLINIC_WALL_COLLIDER_PROFILE],
    ['archives', ARCHIVES_COLLIDER_PROFILE],
    ['reinforcementdoor', REINFORCEMENT_DOOR_COLLIDER_PROFILE],
    ['breachvent', BREACH_VENT_COLLIDER_PROFILE],
    ['emergencysign', EMERGENCY_SIGN_COLLIDER_PROFILE],
    ['shutter', SHUTTER_COLLIDER_PROFILE],
    ['cargolift', CARGO_LIFT_COLLIDER_PROFILE],
    ['catwalk', CATWALK_COLLIDER_PROFILE],
    ['ladderplatform', LADDER_PLATFORM_COLLIDER_PROFILE],
    ['stairs', STAIRS_COLLIDER_PROFILE],
    ['mirrorchoir', MIRROR_CHOIR_COLLIDER_PROFILE],
    ['rootaltar', ROOT_ALTAR_COLLIDER_PROFILE],
    ['endchoice', END_CHOICE_COLLIDER_PROFILE]
  ]);
  const requiredAssets = new Map([
    [LAST_ORDER_BASE, new Set([
      'archives', 'pipes', 'generator', 'powerrelay', 'terminal', 'emergencysign', 'breachvent'
    ])],
    [SERVER_CATHEDRAL, new Set([
      'cathedralkit', 'dashboardwindows', 'corridor', 'servicewall', 'clinicwall', 'archives', 'reinforcementdoor',
      'breachvent', 'emergencysign', 'shutter', 'terminal', 'powerrelay', 'cargolift', 'catwalk',
      'ladderplatform', 'stairs', 'lightmast', 'mirrorchoir', 'rootaltar', 'capturebeacon', 'endchoice'
    ])],
    [SANDSTORM_EXPANSE, new Set([
      'sandbankkit', 'stormsiren', 'endurancemonument', 'stormbeacon', 'windbreaks', 'hesco', 'ammostation',
      'medcache', 'filterruin', 'screenwall', 'gabion', 'roadblock', 'pipes', 'reel',
      'deadtree', 'benttree', 'capturebeacon', 'powerrelay', 'lightmast',
      'reinforcementdoor', 'cargogate', 'checkpoint', 'tower'
    ])],
    [FLOODGATE_CONTINUITY, new Set([
      'floodgatekit', 'pumpturbine', 'sluiceconduits', 'archiveseed', 'greywatercore',
      'ammostation', 'medcache', 'terminal', 'powerrelay', 'capturebeacon', 'pipes', 'reel',
      'generator', 'gabion', 'peekcover', 'breakablecover', 'lightmast', 'reinforcementdoor',
      'shutter', 'cargolift', 'breachvent'
    ])],
    [BLACKOUT_CISTERN, new Set([
      'lastlightreactor', 'ammostation', 'medcache', 'cornercover', 'breakablecover', 'gabion',
      'reinforcementdoor', 'cargolift', 'breachvent', 'pipes'
    ])]
  ]);

  for (const [level, assets] of requiredAssets) {
    for (const assetId of assets) {
      const placementCount = level.assets.filter(placement => placement.asset === assetId).length;
      assert.ok(placementCount > 0, `${level.id} ${assetId} placement missing`);
      const profile = profileByAsset.get(assetId);
      assert.ok(profile, `${assetId} profile missing from the regression map`);
      const colliderCount = level.colliders.filter(collider => collider.assetId === assetId).length;
      assert.equal(colliderCount, placementCount * profile.length, `${level.id} ${assetId} collision coverage`);
    }
    assert.ok(level.colliders.length <= 150, `${level.id} exceeds the static collider budget`);
  }
});
