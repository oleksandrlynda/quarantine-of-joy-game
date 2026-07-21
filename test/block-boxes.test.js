import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { colliderBlocksChannel, resolveBlockBoxChannels } from '../src/debug/block-boxes.js';
import { LevelRuntime } from '../src/levels/runtime.js';

test('block-box flag accepts all, channel lists, and readable aliases', () => {
  assert.deepEqual(resolveBlockBoxChannels(new URLSearchParams()), []);
  assert.deepEqual(resolveBlockBoxChannels(new URLSearchParams('blockBoxes=all')), ['move', 'shoot', 'see']);
  assert.deepEqual(resolveBlockBoxChannels(new URLSearchParams('blockBoxes=movement,shots,los')), ['move', 'shoot', 'see']);
  assert.deepEqual(resolveBlockBoxChannels(new URLSearchParams('blockBoxes=shoot')), ['shoot']);
});

test('sight blocking follows shots by default but supports an explicit override', () => {
  assert.equal(colliderBlocksChannel({ blocksShots: false }, 'see'), false);
  assert.equal(colliderBlocksChannel({ blocksShots: false, blocksSight: true }, 'see'), true);
  assert.equal(colliderBlocksChannel({ blocksMovement: false }, 'move'), false);
});

test('debug outlines are separate non-raycast scene objects and preserve collider bounds', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {},
    debugColliderChannels: ['move', 'shoot', 'see']
  });
  const definition = {
    id: 'debug-box-test',
    firstWave: 1,
    assets: [],
    colliders: [{ id: 'split-proxy', position: [2, 1, 3], size: [4, 2, 6], blocksShots: false }],
    walkableSurfaces: [],
    entrances: [],
    waves: {}
  };
  runtime.load(definition);

  const collider = runtime.colliderObjects[0];
  const debugRoot = collider.userData.debugColliderRoot;
  assert.ok(debugRoot);
  assert.equal(debugRoot.children.length, 1, 'movement-only proxy shows only its active channel');
  assert.equal(debugRoot.children[0].userData.colliderDebugChannel, 'move');
  assert.equal(objects.includes(debugRoot), false, 'debug root must never enter gameplay collision objects');
  assert.equal(debugRoot.children[0].raycast(), undefined);
  assert.deepEqual(new THREE.Box3().setFromObject(collider).getSize(new THREE.Vector3()).toArray(), [4, 2, 6]);
});

test('runtime uses shared primitive geometry and preserves exact ballistic shapes', () => {
  const scene = new THREE.Scene();
  const objects = [];
  const runtime = new LevelRuntime({
    THREE,
    scene,
    objects,
    grassMesh: null,
    weather: { setMode() {} },
    clonePrefab: () => new THREE.Group(),
    cullGrass() {},
    onObjective() {},
    onRefreshColliders() {}
  });
  runtime.load({
    id: 'primitive-test', firstWave: 1, assets: [], entrances: [], waves: {}, walkableSurfaces: [],
    colliders: [
      { id: 'box-a', shape: 'box', position: [0, 1, 0], size: [2, 2, 2] },
      { id: 'box-b', shape: 'box', position: [4, 1, 0], size: [1, 2, 3] },
      { id: 'round', shape: 'cylinder', position: [8, 1, 0], size: [3, 2, 3] },
      { id: 'brace', shape: 'beam', from: [10, 0, 0], to: [12, 4, 0], thickness: .2, depth: .3 }
    ]
  });

  const [boxA, boxB, round, brace] = runtime.colliderObjects;
  assert.equal(boxA.geometry, boxB.geometry, 'boxes share one unit geometry');
  assert.notEqual(boxA.geometry, round.geometry, 'cylinders use their own shared primitive');
  assert.equal(round.geometry.type, 'CylinderGeometry');
  assert.equal(brace.geometry, boxA.geometry, 'beam proxies reuse the unit box');
  assert.notEqual(round.raycast, THREE.Mesh.prototype.raycast, 'collider raycasts avoid rendered-triangle traversal');
  assert.equal(round.userData.colliderShape, 'cylinder');
  assert.ok(Math.abs(new THREE.Box3().setFromObject(round).getSize(new THREE.Vector3()).x - 3) < 1e-6);
  assert.ok(Math.abs(brace.scale.y - Math.hypot(2, 4)) < 1e-6);
  assert.ok(brace.quaternion.angleTo(new THREE.Quaternion()) > .1, 'beam rotates onto its authored endpoints');

  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(9.49, 1, 4), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(round, false).length > 0, 'analytic ray hits inside the round edge');
  ray.set(new THREE.Vector3(9.51, 1, 4), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(round, false).length, 0, 'analytic ray does not hit the empty AABB corner');
});
