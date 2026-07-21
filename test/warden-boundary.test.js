import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { SwarmWarden } from '../src/enemies/warden.js';

function makeMaterials() {
  return {
    head: new THREE.MeshLambertMaterial({ color: 0x111827 }),
    glow: new THREE.MeshLambertMaterial({ color: 0xbef264 })
  };
}

function makeWarden({ arenaRadius = 40, authoredArenaRadius = 29 } = {}) {
  const enemyManager = {
    encounterHooks: { getArenaRadius: () => authoredArenaRadius },
    enemies: new Set(),
    instanceByRoot: new Map()
  };
  const warden = new SwarmWarden({
    THREE,
    mats: makeMaterials(),
    cfg: { hp: 420 },
    spawnPos: new THREE.Vector3(0, 7, 0),
    enemyManager,
    arenaRadius,
    rng: () => 0
  });
  return { warden, enemyManager };
}

test('Swarm Warden uses the smaller authored level radius for movement and child spawns', () => {
  const { warden } = makeWarden();
  assert.equal(warden._arenaClamp, 28);
});

test('Swarm Warden clamps and validates its fallback child spawn', () => {
  const { warden, enemyManager } = makeWarden();
  warden.root.position.set(40, 25.5, -40);
  warden.root.updateMatrixWorld(true);

  const bayCount = warden.refs.bayMuzzles.length;
  let clearanceChecks = 0;
  enemyManager._isSpawnAreaClear = () => ++clearanceChecks > bayCount;

  const position = warden._pickSpawnFromBay({
    player: { position: new THREE.Vector3(0, 1.7, 0) }
  });

  assert.ok(position, 'expected the clear fallback position to be returned');
  assert.equal(clearanceChecks, bayCount + 1, 'fallback should use the same clearance check as bay spawns');
  assert.ok(Math.abs(position.x) <= 27.4);
  assert.ok(Math.abs(position.z) <= 27.4);
});
