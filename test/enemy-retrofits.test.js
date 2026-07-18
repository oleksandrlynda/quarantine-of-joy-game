import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createEnhancedBailiffBot,
  createEnhancedBlockBot,
  createEnhancedEliteRusherBot,
  createEnhancedExplosiveRusherBot,
  createEnhancedGruntBot,
  createEnhancedGruntlingBot,
  createEnhancedHealerBot,
  createEnhancedRunnerBot,
  createEnhancedShooterBot,
  createEnhancedSniperBot,
  createEnhancedSwarmWarden,
  createEnhancedWingedDrone
} from '../src/assets/enemy-retrofits.js';

const FACTORIES = [
  createEnhancedGruntBot,
  createEnhancedGruntlingBot,
  createEnhancedShooterBot,
  createEnhancedRunnerBot,
  createEnhancedEliteRusherBot,
  createEnhancedExplosiveRusherBot,
  createEnhancedBailiffBot,
  createEnhancedBlockBot,
  createEnhancedHealerBot,
  createEnhancedSniperBot,
  createEnhancedWingedDrone,
  createEnhancedSwarmWarden
];

function makeMaterials() {
  return {
    head: new THREE.MeshLambertMaterial({ color: 0x111827 }),
    glow: new THREE.MeshLambertMaterial({ color: 0xbef264 })
  };
}

function disposeBuilt(built) {
  built.root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material?.dispose?.();
  });
}

test('every live regular-enemy archetype has a buildable retrofit factory', () => {
  for (const create of FACTORIES) {
    const built = create({ THREE, mats: makeMaterials(), scale: 1 });
    try {
      assert.equal(built.root.isGroup, true, `${create.name} should return a group root`);
      assert.equal(built.root.userData.assetRevision, 'enemy-retrofit-mk2');
      assert.equal(built.head.isObject3D, true);
      assert.ok(built.refs && Object.keys(built.refs).length > 0);
      let performanceDetails = 0;
      built.root.traverse(node => { if (node.userData?.performanceDetail) performanceDetails++; });
      assert.ok(performanceDetails > 0, `${create.name} should expose distance-cullable ornaments`);
    } finally {
      disposeBuilt(built);
    }
  }
});

test('retrofit weapon and shield mounts preserve their animated parent contracts', () => {
  const runner = createEnhancedRunnerBot({ THREE, mats: makeMaterials() });
  const explosive = createEnhancedExplosiveRusherBot({ THREE, mats: makeMaterials() });
  const bailiff = createEnhancedBailiffBot({ THREE, mats: makeMaterials() });
  const blocker = createEnhancedBlockBot({ THREE, mats: makeMaterials() });
  const sniper = createEnhancedSniperBot({ THREE, mats: makeMaterials() });

  try {
    assert.equal(runner.refs.knife.rotation.y, Math.PI);
    assert.equal(runner.refs.blade.parent, runner.refs.knife);
    assert.equal(explosive.refs.payloadCore.parent.parent.userData.bodyPart, 'torso');
    assert.equal(bailiff.refs.knife.visible, false);
    assert.equal(bailiff.refs.gavel.parent, bailiff.refs.rightArm);
    assert.equal(blocker.refs.shield.parent, blocker.refs.leftArm);
    assert.equal(blocker.refs.shield.rotation.y, -Math.PI / 2);
    assert.equal(sniper.refs.rifle.rotation.y, Math.PI);
    assert.ok(sniper.head.scale.y < 1);
  } finally {
    for (const built of [runner, explosive, bailiff, blocker, sniper]) disposeBuilt(built);
  }
});
