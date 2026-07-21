import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createEnhancedAdjudicatorAsset,
  createEnhancedBroodmakerAsset,
  createEnhancedCaptainAsset,
  createEnhancedHydracloneAsset,
  createEnhancedSanitizerAsset,
  createEnhancedShardAvatarAsset,
  createEnhancedZeppelinAsset
} from '../src/assets/boss-retrofits.js';
import { createSanitizerAsset } from '../src/assets/boss_sanitizer.js';
import { createAdZeppelinAsset, createInfluencerCaptainAsset } from '../src/assets/boss_captain.js';
import { createStrikeAdjudicatorAsset } from '../src/assets/boss_adjudicator.js';
import { createAssetRegistry } from '../src/assets/registry.js';
import { Hydraclone } from '../src/bosses/hydraclone.js';
import { Sanitizer } from '../src/bosses/sanitizer.js';
import {
  createCaptainVisual,
  createSanitizerVisual,
  createZeppelinVisual
} from '../src/bosses/visual-cache.js';

const FACTORIES = [
  createEnhancedBroodmakerAsset,
  createEnhancedSanitizerAsset,
  createEnhancedCaptainAsset,
  createEnhancedZeppelinAsset,
  createEnhancedShardAvatarAsset,
  createEnhancedHydracloneAsset,
  createEnhancedAdjudicatorAsset
];

function makeMaterials() {
  return { head: new THREE.MeshLambertMaterial({ color: 0x111827 }) };
}

function disposeBuilt(built) {
  built.root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material?.dispose?.();
  });
}

function worldPosition(node) {
  node.updateWorldMatrix(true, false);
  return node.getWorldPosition(new THREE.Vector3());
}

function isDescendant(parent, node) {
  let cursor = node;
  while (cursor) {
    if (cursor === parent) return true;
    cursor = cursor.parent;
  }
  return false;
}

test('every reviewed boss has a buildable enhanced asset', () => {
  for (const create of FACTORIES) {
    const built = create({ THREE, mats: makeMaterials(), scale: create === createEnhancedCaptainAsset ? 1.2 : 1, generation: 0, podCount: 3 });
    try {
      assert.equal(built.root.isGroup, true, `${create.name} should return a group root`);
      assert.match(built.root.userData.retrofit, /-mk\d+$/);
      assert.ok(built.refs && Object.keys(built.refs).length > 0);
      assert.ok(new THREE.Box3().setFromObject(built.root).isEmpty() === false);
    } finally {
      disposeBuilt(built);
    }
  }
});

test('registered bosses preserve gameplay refs within the rigid render budget', () => {
  const bosses = createAssetRegistry({ THREE }).filter(asset => asset.category === 'bosses');
  let sourceMeshes = 0;
  let outputMeshes = 0;
  const builtAssets = [];
  try {
    for (const asset of bosses) {
      const built = asset.build();
      builtAssets.push(built);
      const descendants = new Set();
      built.root.traverse(object => descendants.add(object));
      const refs = [];
      const collect = value => {
        if (value?.isObject3D) refs.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect({ head: built.head, refs: built.refs });
      assert.ok(refs.every(ref => descendants.has(ref)), `${asset.id} detached a gameplay ref`);
      const budget = built.root.userData.rigidBatch;
      assert.ok(budget, `${asset.id} did not cross the rigid batching boundary`);
      assert.ok(budget.outputMeshes <= 43, `${asset.id} exceeds the 43-mesh boss budget`);
      sourceMeshes += budget.sourceMeshes;
      outputMeshes += budget.outputMeshes;
    }
    assert.ok(outputMeshes <= sourceMeshes * .78, `bosses only reduced ${sourceMeshes} meshes to ${outputMeshes}`);
  } finally {
    builtAssets.forEach(disposeBuilt);
  }
});

test('boss weapon and flight axes agree with their gameplay fronts', () => {
  const currentSanitizer = createSanitizerAsset({ THREE, mats: makeMaterials() });
  const sanitizer = createEnhancedSanitizerAsset({ THREE, mats: makeMaterials() });
  const currentCaptain = createInfluencerCaptainAsset({ THREE, mats: makeMaterials(), scale: 1.2 });
  const captain = createEnhancedCaptainAsset({ THREE, mats: makeMaterials(), scale: 1.2 });
  const currentAdjudicator = createStrikeAdjudicatorAsset({ THREE, mats: makeMaterials() });
  const adjudicator = createEnhancedAdjudicatorAsset({ THREE, mats: makeMaterials() });
  const currentZeppelin = createAdZeppelinAsset({ THREE, mats: makeMaterials(), scale: 2, podCount: 3 });
  const zeppelin = createEnhancedZeppelinAsset({ THREE, mats: makeMaterials(), scale: 2, podCount: 3 });

  try {
    assert.ok(worldPosition(currentSanitizer.refs.tip).z < 0);
    assert.ok(worldPosition(sanitizer.refs.tip).z > 0);
    assert.ok(worldPosition(currentCaptain.refs.muzzle).z < 0);
    assert.ok(worldPosition(captain.refs.muzzle).z > 0);
    assert.ok(worldPosition(currentAdjudicator.refs.gavelImpact).z < 0);
    assert.ok(worldPosition(adjudicator.refs.gavelImpact).z > 0);

    const currentSize = new THREE.Box3().setFromObject(currentZeppelin.root).getSize(new THREE.Vector3());
    const enhancedSize = new THREE.Box3().setFromObject(zeppelin.root).getSize(new THREE.Vector3());
    assert.ok(currentSize.y > currentSize.x, 'current zeppelin should reproduce the vertical hull fault');
    assert.ok(enhancedSize.x > enhancedSize.y, 'enhanced zeppelin should align its long hull to +X flight');
  } finally {
    for (const built of [currentSanitizer, sanitizer, currentCaptain, captain, currentAdjudicator, adjudicator, currentZeppelin, zeppelin]) disposeBuilt(built);
  }
});

test('enhanced boss gameplay refs keep their animated parent contracts', () => {
  const brood = createEnhancedBroodmakerAsset({ THREE, mats: makeMaterials() });
  const sanitizer = createEnhancedSanitizerAsset({ THREE, mats: makeMaterials() });
  const captain = createEnhancedCaptainAsset({ THREE, mats: makeMaterials(), scale: 1.2 });
  const zeppelin = createEnhancedZeppelinAsset({ THREE, mats: makeMaterials(), scale: 2, podCount: 3 });
  const shard = createEnhancedShardAvatarAsset({ THREE, mats: makeMaterials(), scale: 1.2 });
  const hydra = createEnhancedHydracloneAsset({ THREE, mats: makeMaterials(), generation: 0, scale: 1 });
  const adjudicator = createEnhancedAdjudicatorAsset({ THREE, mats: makeMaterials() });

  try {
    assert.equal(brood.refs.leftArm.parent, brood.refs.burrowAnchor.children[0]);
    assert.equal(brood.refs.rightArm.parent, brood.refs.burrowAnchor.children[0]);
    assert.ok(isDescendant(sanitizer.refs.rightArm, sanitizer.refs.tip));
    assert.ok(isDescendant(captain.refs.gun, captain.refs.muzzle));
    assert.ok(zeppelin.refs.bombRails.every((rail) => rail.parent === zeppelin.refs.body));
    assert.ok(zeppelin.refs.pods.every((pod) => pod.root.parent === zeppelin.refs.body && pod.hit.parent === pod.root));
    assert.equal(zeppelin.refs.hullStruts.length, 2, 'gondola should have two visible hull mounts');
    assert.equal(zeppelin.refs.podStruts.length, zeppelin.refs.pods.length, 'every engine pod should have a visible mount');
    assert.ok(zeppelin.refs.hullStruts.every((strut) => strut.parent === zeppelin.refs.body));
    assert.ok(zeppelin.refs.podStruts.every((strut) => strut.parent === zeppelin.refs.body));

    zeppelin.root.updateWorldMatrix(true, true);
    const hullBounds = new THREE.Box3();
    for (const hullPart of zeppelin.refs.hullParts) hullBounds.expandByObject(hullPart);
    const gondolaBounds = new THREE.Box3().setFromObject(zeppelin.refs.gondola);
    for (const strut of zeppelin.refs.hullStruts) {
      const strutBounds = new THREE.Box3().setFromObject(strut);
      assert.ok(hullBounds.intersectsBox(strutBounds), 'gondola mount should enter the hull skin');
      assert.ok(gondolaBounds.intersectsBox(strutBounds), 'gondola mount should enter the gondola roof');
    }
    zeppelin.refs.podStruts.forEach((strut, index) => {
      const strutBounds = new THREE.Box3().setFromObject(strut);
      assert.ok(hullBounds.intersectsBox(strutBounds), `engine mount ${index} should enter the hull skin`);
      assert.ok(new THREE.Box3().setFromObject(zeppelin.refs.pods[index].root).intersectsBox(strutBounds), `engine mount ${index} should enter its pod`);
    });
    assert.equal(shard.refs.core.parent, shard.head.parent);
    assert.equal(hydra.refs.core.parent.userData.bodyPart, 'torso');
    assert.ok(isDescendant(adjudicator.refs.gavel, adjudicator.refs.gavelImpact));
  } finally {
    for (const built of [brood, sanitizer, captain, zeppelin, shard, hydra, adjudicator]) disposeBuilt(built);
  }
});

test('approved boss retrofits are the production runtime and export assets', () => {
  const sanitizerVisual = createSanitizerVisual({ THREE, mats: makeMaterials() });
  const captainVisual = createCaptainVisual({ THREE, mats: makeMaterials() });
  const zeppelinVisual = createZeppelinVisual({ THREE, mats: makeMaterials() });
  const hydra = new Hydraclone({
    THREE,
    mats: makeMaterials(),
    spawnPos: new THREE.Vector3(),
    generation: 0,
    bossId: 'test-production-retrofit',
    rng: () => 0.5
  });
  const approved = new Map([
    ['boss_sanitizer', 'sanitizer-mk2'],
    ['boss_captain', 'captain-mk2'],
    ['boss_hydraclone', 'hydraclone-mk2'],
    ['boss_zeppelin_pod', 'zeppelin-mk4']
  ]);
  const registry = createAssetRegistry({ THREE });
  const exported = [];

  try {
    assert.equal(sanitizerVisual.root.userData.retrofit, 'sanitizer-mk2');
    assert.equal(captainVisual.root.userData.retrofit, 'captain-mk2');
    assert.equal(zeppelinVisual.root.userData.retrofit, 'zeppelin-mk4');
    let hydraHeadMeshes = 0;
    hydra.head.traverse(node => { if (node.isMesh) hydraHeadMeshes += 1; });
    assert.ok(hydraHeadMeshes >= 4, 'runtime Hydraclone should retain its enhanced split-signal head geometry');

    for (const [id, retrofit] of approved) {
      const asset = registry.find((entry) => entry.id === id);
      const built = asset.build();
      exported.push(built);
      assert.match(asset.factoryName, /^createEnhanced/);
      assert.equal(built.root.userData.retrofit, retrofit);
    }
  } finally {
    hydra.onRemoved({ remove() {} });
    for (const built of exported) disposeBuilt(built);
  }
});

test('Sanitizer strafes inside its combat band while facing the player', () => {
  const root = new THREE.Group();
  const sanitizer = Object.assign(Object.create(Sanitizer.prototype), {
    THREE,
    root,
    speed: 1.8,
    _jumpState: 'idle',
    _yaw: 0,
    _moveDelta: new THREE.Vector3(),
    _hasLineOfSight: () => true
  });
  const ctx = {
    player: { position: new THREE.Vector3(20, 0, 0) },
    objects: [],
    moveWithCollisions(enemy, step) { enemy.position.add(step); }
  };

  sanitizer._updateMovement(0.1, ctx);

  assert.ok(Math.abs(root.position.z) > 0, 'Sanitizer should orbit instead of collapsing its ranged band');
  assert.ok(root.rotation.y > 0, 'Sanitizer should yaw toward +X while strafing');
});
