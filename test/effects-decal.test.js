import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = globalThis.window || {};
const { Effects } = await import('../src/effects.js');

function makeEffects() {
  const effects = Object.create(Effects.prototype);
  effects.THREE = THREE;
  effects.scene = new THREE.Scene();
  effects._decals = [];
  effects._decalMax = 64;
  effects._decalGeo = new THREE.PlaneGeometry(1, 1);
  effects._decalMatProto = new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 0.95 },
      uColor: { value: new THREE.Color(0x151515) },
      uSoft: { value: 0.5 }
    }
  });
  effects._decalMatPool = [];
  effects._alive = [];
  effects._tracerPool = { active: [] };
  effects._flashPool = { active: [] };
  effects._ringPool = { active: [] };
  effects._shakeOffset = new THREE.Vector3();
  effects._shakeTime = 0;
  effects._shakeDur = 0;
  effects.camera = null;
  effects._updateTracerPool = () => {};
  effects._updateFlashPool = () => {};
  effects._updateRingPool = () => {};
  effects._muzzleGroup = null;
  effects.hitStrength = 0;
  effects.fatigueOverlay = null;
  return effects;
}

test('world decal attaches to the hit mesh and leaves the scene with it', () => {
  const effects = makeEffects();
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);

  effects.spawnBulletDecal(
    new THREE.Vector3(0, 0, 0.5),
    new THREE.Vector3(0, 0, 1),
    { object: surface }
  );

  const decal = effects._decals[0].mesh;
  assert.equal(decal.parent, surface);
  assert.equal(effects.scene.getObjectById(decal.id), decal);

  surface.removeFromParent();
  assert.equal(effects.scene.getObjectById(decal.id), undefined);
});

test('decal cleanup removes an attached decal from its actual parent', () => {
  const effects = makeEffects();
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);
  effects.spawnBulletDecal(
    new THREE.Vector3(0, 0, 0.5),
    new THREE.Vector3(0, 0, 1),
    { object: surface }
  );

  const decal = effects._decals[0].mesh;
  effects.clearAll();

  assert.equal(decal.parent, null);
  assert.equal(effects._decals.length, 0);
  assert.equal(effects._decalMatPool.length, 1);
});

test('decal follows the exact animated child mesh that was hit', () => {
  const effects = makeEffects();
  const enemyRoot = new THREE.Group();
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.2, 0.4),
    new THREE.MeshBasicMaterial()
  );
  enemyRoot.position.set(3, 1, -4);
  arm.position.set(0.8, 0.5, 0);
  enemyRoot.add(arm);
  effects.scene.add(enemyRoot);
  effects.scene.updateMatrixWorld(true);
  const hitPoint = arm.localToWorld(new THREE.Vector3(0, 0, 0.2));

  effects.spawnBulletDecal(hitPoint, new THREE.Vector3(0, 0, 1), {
    object: arm,
    attachTo: arm,
    owner: enemyRoot
  });

  const decal = effects._decals[0].mesh;
  const localPosition = decal.position.clone();
  assert.equal(decal.parent, arm);

  arm.rotation.y = Math.PI / 2;
  arm.position.x += 1;
  effects.scene.updateMatrixWorld(true);
  const expectedWorldPosition = arm.localToWorld(localPosition.clone());
  const actualWorldPosition = decal.getWorldPosition(new THREE.Vector3());
  assert.ok(actualWorldPosition.distanceTo(expectedWorldPosition) < 1e-9);
});

test('decal orientation uses the hit mesh normal matrix under rotation and non-uniform scale', () => {
  const effects = makeEffects();
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  surface.rotation.set(0.35, 0.7, -0.2);
  surface.scale.set(2, 0.6, 1.4);
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);
  const localNormal = new THREE.Vector3(1, 1, 0).normalize();
  const expectedNormal = localNormal.clone().applyMatrix3(
    new THREE.Matrix3().getNormalMatrix(surface.matrixWorld)
  ).normalize();

  effects.spawnBulletDecal(new THREE.Vector3(0, 0, 0), localNormal, { object: surface });

  const decal = effects._decals[0].mesh;
  effects.scene.updateMatrixWorld(true);
  const actualNormal = new THREE.Vector3(0, 0, 1).applyMatrix3(
    new THREE.Matrix3().getNormalMatrix(decal.matrixWorld)
  ).normalize();
  assert.ok(actualNormal.dot(expectedNormal) > 0.999999);
});

test('decal keeps its requested world size on a scaled surface', () => {
  const effects = makeEffects();
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  surface.position.set(2, -1, 4);
  surface.rotation.set(0.2, -0.45, 0.3);
  surface.scale.set(12, 3, 0.25);
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);
  const localHitPoint = new THREE.Vector3(0, 0, 0.5);
  const hitPoint = surface.localToWorld(localHitPoint.clone());

  effects.spawnBulletDecal(hitPoint, new THREE.Vector3(0, 0, 1), {
    object: surface,
    size: 0.1
  });

  const decal = effects._decals[0].mesh;
  effects.scene.updateMatrixWorld(true);
  const left = decal.localToWorld(new THREE.Vector3(-0.5, 0, 0));
  const right = decal.localToWorld(new THREE.Vector3(0.5, 0, 0));
  const bottom = decal.localToWorld(new THREE.Vector3(0, -0.5, 0));
  const top = decal.localToWorld(new THREE.Vector3(0, 0.5, 0));

  // spawnBulletDecal varies each axis between 90% and 120% of requested size.
  assert.ok(left.distanceTo(right) >= 0.09 && left.distanceTo(right) <= 0.12);
  assert.ok(bottom.distanceTo(top) >= 0.09 && bottom.distanceTo(top) <= 0.12);
});

test('owner cleanup removes only decals belonging to that owner', () => {
  const effects = makeEffects();
  const firstOwner = new THREE.Group();
  const secondOwner = new THREE.Group();
  const firstSurface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const secondSurface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  firstOwner.add(firstSurface);
  secondOwner.add(secondSurface);
  effects.scene.add(firstOwner, secondOwner);
  effects.scene.updateMatrixWorld(true);
  effects.spawnBulletDecal(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), { object: firstSurface, owner: firstOwner });
  effects.spawnBulletDecal(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), { object: secondSurface, owner: secondOwner });
  const removedDecal = effects._decals[0].mesh;

  effects.clearDecalsFor(firstOwner);

  assert.equal(removedDecal.parent, null);
  assert.equal(effects._decals.length, 1);
  assert.equal(effects._decals[0].owner, secondOwner);
});

test('update immediately retires an enemy decal whose owner left the scene', () => {
  const effects = makeEffects();
  const owner = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  owner.add(surface);
  effects.scene.add(owner);
  effects.scene.updateMatrixWorld(true);
  effects.spawnBulletDecal(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), { object: surface, owner });
  const decal = effects._decals[0].mesh;
  owner.removeFromParent();

  effects.update(0.016);

  assert.equal(decal.parent, null);
  assert.equal(effects._decals.length, 0);
  assert.equal(effects._decalMatPool.length, 1);
});

test('TTL fades and removes an attached decal from a live surface', () => {
  const effects = makeEffects();
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);
  effects.spawnBulletDecal(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), { object: surface, ttl: 1 });
  const entry = effects._decals[0];

  effects.update(0.5);
  assert.ok(Math.abs(entry.material.uniforms.uAlpha.value - entry.baseAlpha * 0.5) < 1e-9);
  effects.update(0.5);

  assert.equal(entry.mesh.parent, null);
  assert.equal(effects._decals.length, 0);
  assert.equal(effects._decalMatPool.length, 1);
});

test('decal cap evicts the oldest attached decal without touching newer decals', () => {
  const effects = makeEffects();
  effects._decalMax = 2;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  effects.scene.add(surface);
  effects.scene.updateMatrixWorld(true);
  effects.spawnBulletDecal(new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0, 0, 1), { object: surface });
  effects.spawnBulletDecal(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), { object: surface });
  const oldest = effects._decals[0].mesh;
  const second = effects._decals[1].mesh;
  effects.spawnBulletDecal(new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0, 0, 1), { object: surface });

  assert.equal(effects._decals.length, 2);
  assert.equal(oldest.parent, null);
  assert.equal(effects._decals[0].mesh, second);
  assert.equal(effects._decals.every(entry => entry.mesh.parent === surface), true);
});

test('decal without a hit object remains a scene-owned fallback', () => {
  const effects = makeEffects();

  effects.spawnBulletDecal(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0));

  assert.equal(effects._decals[0].mesh.parent, effects.scene);
});
