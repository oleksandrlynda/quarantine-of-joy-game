import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAssetRegistry } from '../src/assets/registry.js';
import { batchStaticPrefab, staticBatchBlocker } from '../src/assets/static-batching.js';
import { disposeObject3D, prepareAssetForExport } from '../tools/exporter/core.js';

function metrics(root) {
  // Precise vertex bounds avoid the deliberate conservative expansion Three.js
  // applies to rotated primitive bounding boxes before they are baked together.
  const bounds = new THREE.Box3().setFromObject(root, true);
  let meshes = 0;
  let triangles = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    meshes += 1;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
  });
  return { bounds, meshes, triangles };
}

test('static batching preserves bounds and triangles while merging equal-material meshes', () => {
  const root = new THREE.Group();
  root.name = 'warehouse';
  root.userData.asset = { id: 'warehouse' };
  const wall = new THREE.MeshStandardMaterial({ color: 0x777777, name: 'wall' });
  const trim = new THREE.MeshStandardMaterial({ color: 0x222222, name: 'trim' });
  for (const [x, material] of [[-2, wall], [0, wall], [2, trim]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
    mesh.position.set(x, 1, 0);
    root.add(mesh);
  }
  const before = metrics(root);
  const result = batchStaticPrefab({ THREE, mergeGeometries, entry: { id: 'warehouse', category: 'buildings' }, root });
  const after = metrics(result.root);

  assert.equal(result.batched, true);
  assert.equal(before.meshes, 3);
  assert.equal(after.meshes, 2);
  assert.equal(after.triangles, before.triangles);
  assert.ok(after.bounds.min.distanceTo(before.bounds.min) < 1e-6);
  assert.ok(after.bounds.max.distanceTo(before.bounds.max) < 1e-6);
  assert.deepEqual(result.root.userData.asset, { id: 'warehouse' });
});

test('static batching refuses animated actors but preserves hierarchy-driven variants', () => {
  const enemy = new THREE.Group();
  enemy.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  assert.equal(staticBatchBlocker({ entry: { category: 'enemies' }, root: enemy }), 'animated-category');

  const variant = new THREE.Group();
  const state = new THREE.Group();
  state.name = 'state_open';
  const material = new THREE.MeshBasicMaterial();
  state.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  variant.add(state);
  const result = batchStaticPrefab({ THREE, mergeGeometries, entry: { id: 'door', category: 'access' }, root: variant });
  assert.equal(result.batched, true);
  assert.equal(variant.getObjectByName('state_open'), state);
  assert.equal(state.children.length, 1);
  assert.equal(staticBatchBlocker({ entry: { category: 'buildings' }, root: enemy, hasAnimations: true }), 'animation-clips');
});

test('static batching keeps unsupported renderables intact while optimizing compatible meshes', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry()), new THREE.LineBasicMaterial());
  root.add(edges);
  const result = batchStaticPrefab({ THREE, mergeGeometries, entry: { category: 'props' }, root });

  assert.equal(result.batched, true);
  assert.equal(result.root, root);
  assert.equal(result.root.children.length, 2);
  assert.ok(result.root.children.includes(edges));
});

test('every registered static model batches safely and buildings stay within ten draw meshes', () => {
  const assets = createAssetRegistry({ THREE }).filter(asset => !['enemies', 'bosses'].includes(asset.category));
  let sourceMeshes = 0;
  let outputMeshes = 0;

  for (const asset of assets) {
    const prepared = prepareAssetForExport({ THREE, definition: asset, built: asset.build() });
    const before = metrics(prepared.root);
    const stateNames = [];
    prepared.root.traverse(object => { if (/^state_/i.test(object.name || '')) stateNames.push(object.name); });
    const result = batchStaticPrefab({ THREE, mergeGeometries, entry: asset, root: prepared.root });
    const after = metrics(result.root);
    const remainingStateNames = [];
    result.root.traverse(object => { if (/^state_/i.test(object.name || '')) remainingStateNames.push(object.name); });

    assert.equal(result.batched, true, `${asset.id} should contain a safe static batch`);
    assert.equal(after.triangles, before.triangles, `${asset.id} changed triangle coverage`);
    assert.ok(after.bounds.min.distanceTo(before.bounds.min) < 1e-4, `${asset.id} changed minimum bounds`);
    assert.ok(after.bounds.max.distanceTo(before.bounds.max) < 1e-4, `${asset.id} changed maximum bounds`);
    assert.deepEqual(remainingStateNames.sort(), stateNames.sort(), `${asset.id} lost a state hierarchy contract`);
    if (asset.category === 'buildings') assert.ok(after.meshes <= 10, `${asset.id} exceeds the building draw-mesh budget`);
    sourceMeshes += before.meshes;
    outputMeshes += after.meshes;
    disposeObject3D(result.root);
  }

  assert.equal(assets.length, 116);
  assert.ok(outputMeshes <= sourceMeshes * 0.32, `static batching only reduced ${sourceMeshes} meshes to ${outputMeshes}`);
});
