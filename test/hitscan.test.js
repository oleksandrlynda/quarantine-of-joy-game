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
