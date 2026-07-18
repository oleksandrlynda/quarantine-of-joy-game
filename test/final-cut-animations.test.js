import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.min.js';
import {
  createEnhancedBlockBot,
  createEnhancedGruntBot,
  createEnhancedRunnerBot
} from '../src/assets/enemy-retrofits.js';
import {
  createFinalCutMotion,
  FINAL_CUT_VARIANTS,
  selectFinalCutVariant
} from '../src/game/final-cut-animations.js';

class FakeVector {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new FakeVector(this.x, this.y, this.z); }
  copy(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  addScaledVector(value, scale) { this.x += value.x * scale; this.y += value.y * scale; this.z += value.z * scale; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() {
    const length = Math.sqrt(this.lengthSq()) || 1;
    this.x /= length; this.y /= length; this.z /= length;
    return this;
  }
  multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; }
}

function makeRoot(y = 0) {
  return {
    position: new FakeVector(1, y, 2),
    rotation: new FakeVector(),
    scale: new FakeVector(1, 1, 1)
  };
}

test('Final Cut selection is deterministic and respects grade and airborne pools', () => {
  const input = { wave: 14, enemyType: 'grunt', enemyId: 9 };
  assert.equal(selectFinalCutVariant(input), selectFinalCutVariant(input));
  assert.equal(selectFinalCutVariant({ ...input, grade: 1, airborne: true }), FINAL_CUT_VARIANTS.SIGNAL_LOST);

  const gradeOne = new Set();
  const gradeTwo = new Set();
  const airborneGradeTwo = new Set();
  for (let enemyId = 0; enemyId < 120; enemyId++) {
    gradeOne.add(selectFinalCutVariant({ grade: 1, wave: 14, enemyType: 'grunt', enemyId }));
    gradeTwo.add(selectFinalCutVariant({ grade: 2, wave: 14, enemyType: 'grunt', enemyId }));
    airborneGradeTwo.add(selectFinalCutVariant({ grade: 2, wave: 14, enemyType: 'flyer', enemyId, airborne: true }));
  }
  assert.deepEqual([...gradeOne].sort(), [FINAL_CUT_VARIANTS.BACKDROP, FINAL_CUT_VARIANTS.FOLD].sort());
  assert.equal(gradeTwo.has(FINAL_CUT_VARIANTS.SIDE_EXIT), true);
  assert.equal(gradeTwo.has(FINAL_CUT_VARIANTS.FALL_APART), true);
  assert.equal(gradeTwo.has(FINAL_CUT_VARIANTS.CORKSCREW), false);
  assert.deepEqual([...airborneGradeTwo].sort(), [FINAL_CUT_VARIANTS.CORKSCREW, FINAL_CUT_VARIANTS.SIGNAL_LOST].sort());
});

test('grounded Fold and Side Exit finish on their starting floor plane', () => {
  for (const variant of [FINAL_CUT_VARIANTS.FOLD, FINAL_CUT_VARIANTS.SIDE_EXIT]) {
    const root = makeRoot(0.8);
    const motion = createFinalCutMotion(root, { variant, grade: 2, direction: new FakeVector(0, 0, 1) });
    motion.applyElapsed(motion.duration);
    assert.equal(root.position.y, 0.8);
  }
});

test('Fall Apart separates logical body sections and settles them above the floor', () => {
  const root = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  torso.position.set(0, 1.5, 0);
  torso.userData.bodyPart = 'torso';
  const chestDetail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2));
  chestDetail.position.set(0, 0.2, 0.55);
  chestDetail.userData.bodyPart = 'torso';
  torso.add(chestDetail);
  const armAssembly = new THREE.Group();
  armAssembly.position.set(0.9, 1.1, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4));
  arm.userData.bodyPart = 'arm';
  const untaggedArmor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.5));
  untaggedArmor.position.set(0, 0.42, 0);
  armAssembly.add(arm, untaggedArmor);
  root.add(torso, armAssembly);

  const motion = createFinalCutMotion(root, {
    variant: FINAL_CUT_VARIANTS.FALL_APART,
    grade: 2,
    direction: new THREE.Vector3(0, 0, 1)
  });
  assert.equal(motion.pieceCount, 2);
  motion.applyElapsed(motion.duration);
  assert.equal(root.position.y, 0);
  assert.equal(arm.parent, armAssembly);
  assert.equal(untaggedArmor.parent, armAssembly);
  assert.equal(armAssembly.parent, root);
  assert.equal(chestDetail.parent, torso);
  assert.ok(Math.hypot(torso.position.x, torso.position.z) >= 0.6);
  assert.ok(Math.hypot(armAssembly.position.x - 0.9, armAssembly.position.z) >= 0.6);

  motion.restore();
  assert.deepEqual(torso.position.toArray(), [0, 1.5, 0]);
  assert.deepEqual(armAssembly.position.toArray(), [0.9, 1.1, 0]);
});

test('Fall Apart lands every complete showcase enemy assembly on one floor plane', () => {
  const factories = [
    [createEnhancedGruntBot, 2.7],
    [createEnhancedRunnerBot, 2.7],
    [createEnhancedBlockBot, 2.9]
  ];
  for (const [factory, height] of factories) {
    const built = factory({
      THREE,
      mats: { head: new THREE.MeshStandardMaterial(), glow: new THREE.MeshStandardMaterial() }
    });
    built.root.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(built.root);
    const center = sourceBounds.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group();
    normalized.scale.setScalar(height / (sourceBounds.max.y - sourceBounds.min.y));
    built.root.position.set(-center.x, -sourceBounds.min.y, -center.z);
    normalized.add(built.root);
    const frame = new THREE.Group();
    frame.add(normalized);
    frame.updateMatrixWorld(true);

    const motion = createFinalCutMotion(frame, {
      variant: FINAL_CUT_VARIANTS.FALL_APART,
      grade: 2,
      direction: new THREE.Vector3(0, 0, 1)
    });
    motion.applyElapsed(motion.duration);
    frame.updateMatrixWorld(true);
    const assemblies = frame.children.filter(child => {
      let renderable = false;
      child.traverse(node => { if (node.isMesh) renderable = true; });
      return renderable;
    });
    assert.equal(motion.pieceCount, 8);
    assert.equal(assemblies.length, 8);
    for (const assembly of assemblies) {
      const floorY = new THREE.Box3().setFromObject(assembly).min.y;
      assert.ok(Math.abs(floorY - 0.0235) < 0.0001);
    }
  }
});

test('all six Final Cut motions produce distinct movement and restore their model transform', () => {
  const endingTransforms = new Set();
  for (const variant of Object.values(FINAL_CUT_VARIANTS)) {
    const root = makeRoot(variant === FINAL_CUT_VARIANTS.SIGNAL_LOST ? 3 : 0);
    const motion = createFinalCutMotion(root, { variant, grade: 2, direction: new FakeVector(0, 0, 1) });
    assert.ok(motion.duration >= 1);
    motion.applyElapsed(motion.duration);
    endingTransforms.add([
      root.position.x.toFixed(2), root.position.y.toFixed(2), root.position.z.toFixed(2),
      root.rotation.x.toFixed(2), root.rotation.y.toFixed(2), root.rotation.z.toFixed(2)
    ].join(':'));
    if (variant === FINAL_CUT_VARIANTS.FALL_APART) assert.ok(Math.abs(root.rotation.y) > 0);
    else assert.ok(Math.abs(root.rotation.x) + Math.abs(root.rotation.y) + Math.abs(root.rotation.z) > 0.5);
    if (variant === FINAL_CUT_VARIANTS.SIGNAL_LOST || variant === FINAL_CUT_VARIANTS.CORKSCREW) {
      assert.ok(root.position.y < (variant === FINAL_CUT_VARIANTS.SIGNAL_LOST ? 3 : 0));
    }
    motion.restore();
    assert.deepEqual([root.position.x, root.position.y, root.position.z], [1, variant === FINAL_CUT_VARIANTS.SIGNAL_LOST ? 3 : 0, 2]);
    assert.deepEqual([root.rotation.x, root.rotation.y, root.rotation.z], [0, 0, 0]);
    assert.deepEqual([root.scale.x, root.scale.y, root.scale.z], [1, 1, 1]);
  }
  assert.equal(endingTransforms.size, 6);
});
