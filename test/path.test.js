import test from 'node:test';
import assert from 'node:assert/strict';

import { findPath, recomputeIfStale, nextWaypoint, clear } from '../src/path.js';

const obstacle = { min: { x: 2, z: -1 }, max: { x: 3, z: 1 } };

test('findPath circumvents blocking obstacle', () => {
  const start = { x: 0, z: 0 };
  const goal = { x: 5, z: 0 };
  const path = findPath(start, goal, [obstacle]);
  assert.equal(path[0].x, start.x);
  assert.equal(path[path.length - 1].x, goal.x);
  assert.ok(path.length > 2);
  assert.ok(path.some(p => p.z !== 0));
});

test('recomputeIfStale caches paths for a short duration', async () => {
  const enemy = { position: { x: 0, z: 0 } };
  const player = { x: 5, z: 0 };
  const opts = { cacheFor: 0.05 }; // 50ms
  const first = await recomputeIfStale(enemy, player, [obstacle], opts);
  const cachedRequest = recomputeIfStale(enemy, player, [obstacle], opts);
  assert.equal(cachedRequest.pathRecomputed, false);
  const second = await cachedRequest;
  assert.strictEqual(first, second);
  await new Promise(r => setTimeout(r, 60));
  const third = await recomputeIfStale(enemy, player, [obstacle], opts);
  assert.notStrictEqual(first, third);
  clear(enemy);
});

test('nextWaypoint advances along the cached path', async () => {
  const enemy = { position: { x: 0, z: 0 } };
  const player = { x: 5, z: 0 };
  const path = await recomputeIfStale(enemy, player, [obstacle], { cacheFor: 1 });
  const first = nextWaypoint(enemy);
  assert.deepStrictEqual(first, path[1]);
  enemy.position = { ...first };
  const second = nextWaypoint(enemy);
  assert.deepStrictEqual(second, path[2]);
  clear(enemy);
});

test('grid rasterization treats mirrored navigable goals equally near an obstacle', () => {
  const relayBase = { min: { x: -2.85, z: -10 }, max: { x: 2.85, z: -4 } };
  const options = { gridSize: 0.75, radius: 56, agentRadius: 0.73 };
  const westPath = findPath({ x: -27, z: 3.5 }, { x: -4, z: -7 }, [relayBase], options);
  const eastPath = findPath({ x: 27, z: -9 }, { x: 4, z: -7 }, [relayBase], options);

  assert.ok(westPath.length > 0);
  assert.ok(eastPath.length > 0);
  assert.deepEqual(westPath.at(-1), { x: -4, z: -7 });
  assert.deepEqual(eastPath.at(-1), { x: 4, z: -7 });
});

test('fractional Wave 13 start advances past the southeast roadblock', async () => {
  const start = { x: 22.9, z: 13.5 };
  const goal = { x: 0.4, z: 9.2 };
  const roadblock = { min: { x: 15, z: 11 }, max: { x: 22, z: 15 } };
  const options = { gridSize: 1, radius: 20, agentRadius: 0.6, cacheFor: 1 };
  const path = findPath(start, goal, [roadblock], options);

  assert.ok(path.length > 2);
  assert.deepEqual(path[0], start, 'the first waypoint must not snap back into roadblock collision');
  assert.deepEqual(path.at(-1), goal);

  const enemy = { position: { ...start } };
  const cachedPath = await recomputeIfStale(enemy, goal, [roadblock], options);
  assert.deepEqual(cachedPath[0], start);
  assert.deepEqual(nextWaypoint(enemy), cachedPath[1], 'an enemy at the exact start must advance immediately');
  clear(enemy);
});

test('nextWaypoint remains null on repeated ticks after the cached path is exhausted', async () => {
  const enemy = { position: { x: 0, z: 0 } };
  const player = { x: 5, z: 0 };
  await recomputeIfStale(enemy, player, [obstacle], { cacheFor: 1 });

  let waypoint = nextWaypoint(enemy);
  while (waypoint) {
    enemy.position = { ...waypoint };
    waypoint = nextWaypoint(enemy);
  }

  assert.equal(nextWaypoint(enemy), null);
  assert.equal(nextWaypoint(enemy), null);
  clear(enemy);
});

test('recomputeIfStale handles empty paths gracefully', async () => {
  const enemy = { position: { x: 0, z: 0 } };
  const player = { x: 5, z: 0 };
  const blocker = { min: { x: -1, z: -1 }, max: { x: 6, z: 1 } }; // spans entire route
  const path = await recomputeIfStale(enemy, player, [blocker], { cacheFor: 1 });
  assert.deepStrictEqual(path, []);
  const again = await recomputeIfStale(enemy, player, [blocker], { cacheFor: 1 });
  assert.deepStrictEqual(again, []);
  clear(enemy);
});

