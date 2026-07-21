import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { disposeOwnedObject3D } from '../src/bosses/resource-lifecycle.js';
import { Hydraclone } from '../src/bosses/hydraclone.js';
import { ShardAvatar } from '../src/bosses/shard.js';

test('owned boss hierarchies dispose shared-in-tree resources exactly once', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  let geometryDisposals = 0;
  let materialDisposals = 0;
  geometry.addEventListener('dispose', () => { geometryDisposals++; });
  material.addEventListener('dispose', () => { materialDisposals++; });

  assert.deepEqual(disposeOwnedObject3D(root), { geometries: 1, materials: 1 });
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test('Shard mirage replacement and boss removal release owned GPU resources', () => {
  const scene = new THREE.Scene();
  const enemies = new Set();
  const instances = new Map();
  const enemyManager = {
    enemies,
    registerExternalEnemy(instance) {
      instances.set(instance.root, instance);
      enemies.add(instance.root);
      scene.add(instance.root);
    },
    remove(root) {
      if (!enemies.delete(root)) return;
      scene.remove(root);
      const instance = instances.get(root);
      instances.delete(root);
      instance?.onRemoved?.(scene);
    }
  };
  let rngIndex = 0;
  const shard = new ShardAvatar({
    THREE,
    mats: {},
    spawnPos: new THREE.Vector3(),
    enemyManager,
    rng: () => ((rngIndex++ * 0.37 + 0.13) % 1)
  });
  scene.add(shard.root);
  shard.root.updateMatrixWorld(true);
  shard._spawnMirages({ scene });
  const firstMirage = shard.mirages[0];
  const firstGeometry = firstMirage.root.getObjectByProperty('isMesh', true).geometry;
  let firstGeometryDisposals = 0;
  firstGeometry.addEventListener('dispose', () => { firstGeometryDisposals++; });

  shard._spawnMirages({ scene });
  assert.equal(firstGeometryDisposals, 1, 'replaced mirage geometry must be released');
  assert.equal(enemies.has(firstMirage.root), false, 'replaced mirage must leave the enemy manager');

  const bossGeometry = shard.root.getObjectByProperty('isMesh', true).geometry;
  let bossGeometryDisposals = 0;
  bossGeometry.addEventListener('dispose', () => { bossGeometryDisposals++; });
  shard.onRemoved(scene);
  assert.equal(bossGeometryDisposals, 1);
  assert.equal(enemies.size, 0);
});

test('removed Hydraclone generations release their unique model geometry', () => {
  const scene = new THREE.Scene();
  const enemyManager = {
    scene,
    getPlayer: () => ({ position: new THREE.Vector3() })
  };
  const hydra = new Hydraclone({
    THREE,
    mats: { head: new THREE.MeshLambertMaterial() },
    spawnPos: new THREE.Vector3(),
    generation: 3,
    bossId: 'resource-release',
    enemyManager,
    rng: () => 0.5
  });
  const geometry = hydra.root.getObjectByProperty('isMesh', true).geometry;
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals++; });
  hydra.onRemoved(scene);
  assert.equal(disposals, 1);
  Hydraclone.resetLineage('resource-release');
});
