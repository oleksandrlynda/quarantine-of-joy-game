import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ReusablePool } from '../src/bosses/reusable-pool.js';
import { Sanitizer } from '../src/bosses/sanitizer.js';

test('boss visual pool reuses released objects without reconstructing them', () => {
  let created = 0;
  const released = [];
  const pool = new ReusablePool({
    create: () => ({ id: ++created }),
    reset: (value, context) => { value.context = context; },
    release: value => released.push(value.id)
  });

  const first = pool.acquire('first');
  assert.equal(pool.activeCount, 1);
  assert.equal(first.context, 'first');
  assert.equal(pool.release(first), true);
  assert.equal(pool.release(first), false, 'double release must be ignored');

  const second = pool.acquire('second');
  assert.equal(second, first);
  assert.equal(second.context, 'second');
  assert.equal(created, 1);
  assert.deepEqual(released, [1]);
});

test('boss visual pool preallocation and destroy own each resource exactly once', () => {
  let created = 0;
  const destroyed = [];
  const pool = new ReusablePool({
    preallocate: 3,
    create: () => ({ id: ++created }),
    destroy: value => destroyed.push(value.id)
  });

  const active = pool.acquire();
  assert.equal(created, 3);
  assert.equal(pool.totalCount, 3);
  pool.destroy();
  pool.destroy();

  assert.equal(pool.activeCount, 0);
  assert.deepEqual(destroyed.sort(), [1, 2, 3]);
  assert.throws(() => pool.acquire(), /destroyed pool/);
  assert.ok(active);
});

test('Sanitizer cleanup removes surviving panic rushers and clears ownership', () => {
  const survivingRusher = { id: 'surviving-rusher' };
  const alreadyDefeatedRusher = { id: 'defeated-rusher' };
  const removed = [];
  const enemyManager = {
    enemies: new Set([survivingRusher]),
    remove(root) {
      removed.push(root);
      this.enemies.delete(root);
    }
  };
  const sanitizer = Object.assign(Object.create(Sanitizer.prototype), {
    nodes: null,
    _beamMesh: null,
    _telegraph: null,
    enemyManager,
    _eliteRoots: new Set(),
    _tankRoots: new Set(),
    _turretRoots: new Set(),
    _panicRoots: new Set([survivingRusher, alreadyDefeatedRusher]),
    _tiles: [],
    _tilePool: { destroy() {} }
  });

  sanitizer.onRemoved({ remove() {} });

  assert.deepEqual(removed, [survivingRusher]);
  assert.equal(sanitizer._panicRoots.size, 0);
  assert.equal(enemyManager.enemies.size, 0);
});

test('boss attack paths use cached or pooled visuals instead of procedural reconstruction', async () => {
  const [sanitizer, captain, zeppelin, main, loader] = await Promise.all([
    readFile(new URL('../src/bosses/sanitizer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/bosses/captain.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/bosses/zeppelin.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../loader.js', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(sanitizer, /new THREE\.CircleGeometry\(r, 24\)/);
  assert.match(sanitizer, /this\._tilePool\.acquire\(\)/);
  assert.match(sanitizer, /this\._panicRoots\.add\(root\)/);
  assert.doesNotMatch(captain, /createAdZoneMarkerAsset/);
  assert.match(captain, /this\._zonePool\.acquire\(\)/);
  assert.doesNotMatch(zeppelin, /new THREE\.(CylinderGeometry|RingGeometry|EdgesGeometry)/);
  assert.doesNotMatch(zeppelin, /boss_bomb|_bombPool|_dropPod/);
  assert.match(main, /getBossShaderWarmupExtras\(\{ THREE, mats \}\)/);
  assert.match(main, /'performance', 'boss_instantiated'/);
  assert.match(loader, /o\.isLineSegments/);
});
