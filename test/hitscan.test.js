import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { performHitscan } from '../src/weapons/hitscan.js';

function meshAt(z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  mesh.position.z = z;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function hitscanWith({ enemyZ, worldZ }) {
  const enemy = meshAt(enemyZ);
  const world = meshAt(worldZ);
  const enemyManager = {
    enemies: new Set([enemy]),
    getEnemyRaycastTargets: () => [enemy]
  };
  const result = performHitscan({
    THREE,
    camera: new THREE.PerspectiveCamera(),
    raycaster: new THREE.Raycaster(),
    enemyManager,
    objects: [world],
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    range: 30
  });
  return { result, enemy, world };
}

test('hitscan selects nearer world geometry instead of an enemy behind it', () => {
  const { result, world } = hitscanWith({ enemyZ: -10, worldZ: -5 });

  assert.equal(result.type, 'world');
  assert.equal(result.hitObject, world);
  assert.ok(Math.abs(result.distance - 4.5) < 1e-6);
});

test('hitscan still selects an enemy when it is in front of world geometry', () => {
  const { result, enemy } = hitscanWith({ enemyZ: -5, worldZ: -10 });

  assert.equal(result.type, 'enemy');
  assert.equal(result.enemyRoot, enemy);
  assert.ok(Math.abs(result.distance - 4.5) < 1e-6);
});

test('hitscan ignores movement-only proxies used behind shoot-through windows', () => {
  const enemy = meshAt(-10);
  const movementShell = meshAt(-5);
  movementShell.userData.blocksShots = false;
  const enemyManager = {
    enemies: new Set([enemy]),
    getEnemyRaycastTargets: () => [enemy]
  };

  const result = performHitscan({
    THREE,
    camera: new THREE.PerspectiveCamera(),
    raycaster: new THREE.Raycaster(),
    enemyManager,
    objects: [movementShell],
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    range: 30
  });

  assert.equal(result.type, 'enemy');
  assert.equal(result.enemyRoot, enemy);
});

test('hitscan diagnostics inherit collider identity from a raycast child', () => {
  const enemy = meshAt(-10);
  const collider = new THREE.Group();
  collider.name = 'collider:corner-cover-post';
  collider.userData.colliderId = 'corner-cover-post';
  collider.userData.blocksShots = true;
  const raycastChild = meshAt(-5);
  raycastChild.name = 'profile-primitive';
  raycastChild.position.z = 0;
  collider.position.z = -5;
  collider.add(raycastChild);
  collider.updateMatrixWorld(true);
  const enemyManager = {
    enemies: new Set([enemy]),
    getEnemyRaycastTargets: () => [enemy]
  };

  performHitscan({
    THREE,
    camera: new THREE.PerspectiveCamera(),
    raycaster: new THREE.Raycaster(),
    enemyManager,
    objects: [collider],
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    range: 30
  });

  assert.equal(globalThis.__QOJ_LAST_SHOT.colliderId, 'corner-cover-post');
  assert.equal(globalThis.__QOJ_LAST_SHOT.worldObject, 'collider:corner-cover-post');
  assert.equal(globalThis.__QOJ_LAST_SHOT.blocksShots, true);
});
