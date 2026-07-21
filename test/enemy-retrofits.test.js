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

test('regular-enemy rigid batching preserves every gameplay ref and reduces the family render cost', () => {
  let sourceMeshes = 0;
  let outputMeshes = 0;
  for (const create of FACTORIES) {
    const built = create({ THREE, mats: makeMaterials(), scale: 1 });
    try {
      const descendants = new Set();
      built.root.traverse(object => descendants.add(object));
      const refs = [];
      const collect = value => {
        if (value?.isObject3D) refs.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect({ head: built.head, refs: built.refs });
      assert.ok(refs.every(ref => descendants.has(ref)), `${create.name} detached a gameplay ref`);
      assert.ok(built.root.userData.rigidBatch, `${create.name} did not cross the rigid batching boundary`);
      assert.ok(built.root.userData.rigidBatch.outputMeshes <= built.root.userData.rigidBatch.sourceMeshes);
      sourceMeshes += built.root.userData.rigidBatch.sourceMeshes;
      outputMeshes += built.root.userData.rigidBatch.outputMeshes;
    } finally {
      disposeBuilt(built);
    }
  }
  assert.ok(outputMeshes <= sourceMeshes * .82, `regular enemies only reduced ${sourceMeshes} meshes to ${outputMeshes}`);
});

test('opaque armor colors survive batching as a vertex palette while emissive refs stay separate', () => {
  const shooter = createEnhancedShooterBot({ THREE, mats: makeMaterials() });
  try {
    const paletteMeshes = [];
    shooter.root.traverse(node => {
      if (node.isMesh && /^rigid_vertex_palette_/.test(node.material?.name || '')) paletteMeshes.push(node);
    });
    assert.ok(paletteMeshes.length > 0);
    assert.ok(paletteMeshes.every(mesh => mesh.material.vertexColors && mesh.geometry.getAttribute('color')));
    const colors = new Set();
    for (const mesh of paletteMeshes) {
      const attribute = mesh.geometry.getAttribute('color');
      for (let index = 0; index < attribute.count; index += 1) {
        colors.add(`${attribute.getX(index).toFixed(3)}:${attribute.getY(index).toFixed(3)}:${attribute.getZ(index).toFixed(3)}`);
      }
    }
    assert.ok(colors.size >= 3, 'batched Shooter armor should retain its distinct opaque colors');
    assert.equal(shooter.refs.muzzle.material.emissive.getHex() !== 0, true);
    assert.equal(shooter.refs.muzzle.material.name.startsWith('rigid_vertex_palette_'), false);
  } finally {
    disposeBuilt(shooter);
  }
});

test('live Grunt stays within the optimized rigid-part render budget', () => {
  const grunt = createEnhancedGruntBot({ THREE, mats: makeMaterials(), scale: .88 });
  try {
    const materials = new Set();
    let meshes = 0;
    let details = 0;
    let triangles = 0;
    grunt.root.traverse((node) => {
      if (!node.isMesh) return;
      meshes += 1;
      if (node.userData?.performanceDetail) details += 1;
      materials.add(node.material);
      triangles += Math.floor((node.geometry.index?.count || node.geometry.attributes.position.count) / 3);
    });

    assert.ok(meshes <= 11, `optimized Grunt exceeded its 11-mesh budget with ${meshes}`);
    assert.ok(materials.size <= 2, `optimized Grunt exceeded its two-material budget with ${materials.size}`);
    assert.ok(triangles <= 500, `optimized Grunt exceeded its 500-triangle budget with ${triangles}`);
    assert.equal(details, 1, 'only the merged armor ornament should be distance-cullable');
    assert.ok(['leftArm', 'rightArm', 'leftLeg', 'rightLeg'].every(key => grunt.refs[key]?.isGroup));
    assert.equal(grunt.head.userData.bodyPart, 'head');
    assert.ok(grunt.root.children.some(node => node.name === 'grunt-merged-torso'));
  } finally {
    disposeBuilt(grunt);
  }
});

test('retrofit weapon and shield mounts preserve their animated parent contracts', () => {
  const shooter = createEnhancedShooterBot({ THREE, mats: makeMaterials() });
  const runner = createEnhancedRunnerBot({ THREE, mats: makeMaterials() });
  const explosive = createEnhancedExplosiveRusherBot({ THREE, mats: makeMaterials() });
  const bailiff = createEnhancedBailiffBot({ THREE, mats: makeMaterials() });
  const blocker = createEnhancedBlockBot({ THREE, mats: makeMaterials() });
  const sniper = createEnhancedSniperBot({ THREE, mats: makeMaterials() });

  try {
    assert.equal(shooter.refs.leftArm.isGroup, true);
    assert.equal(shooter.refs.rightArm.isGroup, true);
    assert.equal(shooter.refs.muzzleBrake.parent, shooter.refs.gun);
    assert.equal(shooter.refs.chestTargetBar.parent.parent.userData.bodyPart, 'torso');
    assert.equal(shooter.refs.visorFocus.parent, shooter.head);
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
    for (const built of [shooter, runner, explosive, bailiff, blocker, sniper]) disposeBuilt(built);
  }
});

test('Swarm Warden carries a local underside highlight for spawn readability', () => {
  const warden = createEnhancedSwarmWarden({ THREE, mats: makeMaterials() });

  try {
    const { highlightBeacon, highlightLight, recallRing, thrusterGlows } = warden.refs;
    assert.equal(highlightBeacon.name, 'warden-highlight-beacon');
    assert.equal(highlightLight.isPointLight, true);
    assert.equal(highlightLight.parent, highlightBeacon);
    assert.ok(highlightLight.intensity >= 24, 'the Warden highlight should remain combat-readable');
    assert.ok(highlightLight.distance >= 18 && highlightLight.distance <= 26, 'the highlight should stay local to the Warden');
    assert.equal(recallRing?.isMesh, true, 'recall animation should use a stable mesh ref');
    assert.equal(thrusterGlows.length, warden.refs.thrusters.length, 'every thruster should retain its animated glow ref');
  } finally {
    disposeBuilt(warden);
  }
});
