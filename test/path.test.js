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
  const second = await recomputeIfStale(enemy, player, [obstacle], opts);
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

