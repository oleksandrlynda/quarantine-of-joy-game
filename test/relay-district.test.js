import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_DISTRICT } from '../src/levels/relay-district.js';
import { entranceClearanceFor, validateSpawnEntrance } from '../src/levels/contracts.js';
import { validateLevelSpawnNetwork } from '../src/levels/runtime.js';

const countRoster = packages => packages.flat().reduce((counts, type) => {
  counts[type] = (counts[type] || 0) + 1;
  return counts;
}, {});

test('Relay authored spawn entrances have complete finite contracts and static clearance', () => {
  const validation = validateLevelSpawnNetwork(RELAY_DISTRICT);
  assert.equal(validation.length, 7);
  assert.deepEqual(validation.filter(result => !result.valid), []);
  for (const { entrance } of validation) {
    assert.deepEqual(validateSpawnEntrance(entrance), []);
    assert.ok(Math.hypot(...entrance.facing) > 0);
    for (const type of entrance.allow) assert.ok(entranceClearanceFor(entrance, type) > 0);
  }
});

test('Relay ground entrances cover five identities and Broodmaker adds are constrained to hatch and vent', () => {
  const ground = RELAY_DISTRICT.entrances.filter(entrance => !entrance.air);
  assert.deepEqual(ground.map(entrance => entrance.id), [
    'north-door', 'west-gate', 'east-alley', 'floor-hatch', 'rear-vent'
  ]);
  assert.deepEqual(
    ground.filter(entrance => entrance.allow.includes('gruntling')).map(entrance => entrance.id),
    ['floor-hatch', 'rear-vent']
  );
  assert.equal(RELAY_DISTRICT.entrances.filter(entrance => entrance.air).length, 2);
});

test('Relay exact wave rosters match the campaign encounter plan', () => {
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[1].packages), { grunt: 6 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[2].packages), { grunt: 7, shooter: 1 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[3].packages), { grunt: 8, shooter: 1, tank: 1 });
  assert.deepEqual(countRoster(RELAY_DISTRICT.waves[4].packages), { grunt: 8, shooter: 2, tank: 1 });
  assert.equal(RELAY_DISTRICT.waves[5].boss, 'broodmaker-light');
});

test('Relay routes and capture objectives retain authored gameplay clearances and timings', () => {
  assert.equal(RELAY_DISTRICT.size[0], 64);
  assert.equal(RELAY_DISTRICT.size[1], 56);
  assert.ok(RELAY_DISTRICT.routes.every(route => route.clearance >= 2.2));
  assert.equal(RELAY_DISTRICT.objectives.westFeed.seconds, 6);
  assert.equal(RELAY_DISTRICT.objectives.eastFeed.seconds, 6);
  assert.equal(RELAY_DISTRICT.objectives.mast.seconds, 24);
  assert.equal(RELAY_DISTRICT.objectives.mast.radius, 5.5);
  assert.equal(RELAY_DISTRICT.objectives.mast.decay, false);
});

test('Relay decorative solids have explicit collision without blocking traversal surfaces', () => {
  const colliderIds = new Set(RELAY_DISTRICT.colliders.map(collider => collider.id));
  const requiredColliders = [
    'west-civic-wall-north', 'west-civic-wall-south',
    'east-civic-wall-north', 'east-civic-wall-south',
    'fireescape-backing',
    'fireescape-support-west', 'fireescape-support-east',
    'fireescape-bridge-support-west', 'fireescape-bridge-support-east',
    'lightmast-north-west', 'lightmast-north-east',
    'lightmast-south-west', 'lightmast-south-east',
    'streettree-south-west', 'streettree-south-east',
    'streettree-north-west', 'streettree-north-east',
    'rear-breach-vent'
  ];

  for (const id of requiredColliders) assert.ok(colliderIds.has(id), `Missing collider: ${id}`);
  assert.deepEqual(
    RELAY_DISTRICT.walkableSurfaces.map(surface => surface.id),
    ['fireescape-landing', 'fireescape-ramp']
  );
});
