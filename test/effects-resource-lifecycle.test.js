import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const { Effects } = await import('../src/effects.js');

class FakeBufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.needsUpdate = false;
  }
}

class FakeBufferGeometry {
  constructor() {
    this.attributes = {};
    this.disposeCalls = 0;
  }

  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }

  dispose() {
    this.disposeCalls += 1;
  }
}

class FakeShaderMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.uniforms = options.uniforms || {};
    this.disposeCalls = 0;
  }

  dispose() {
    this.disposeCalls += 1;
  }
}

class FakePoints {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.parent = null;
  }
}

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new FakeVector3(this.x, this.y, this.z);
  }

  copy(value) {
    this.x = value.x;
    this.y = value.y;
    this.z = value.z;
    return this;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize() {
    const length = Math.sqrt(this.lengthSq());
    if (length > 0) {
      this.x /= length;
      this.y /= length;
      this.z /= length;
    }
    return this;
  }

  dot(value) {
    return this.x * value.x + this.y * value.y + this.z * value.z;
  }

  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }

  applyMatrix4() {
    return this;
  }
}

class FakeMatrix4 {
  makeRotationAxis() {
    return this;
  }
}

class FakeScene {
  constructor() {
    this.children = [];
  }

  add(object) {
    if (!this.children.includes(object)) this.children.push(object);
    object.parent = this;
  }

  remove(object) {
    const index = this.children.indexOf(object);
    if (index >= 0) this.children.splice(index, 1);
    object.parent = null;
  }

  has(object) {
    return this.children.includes(object);
  }
}

const THREE = {
  AdditiveBlending: 'additive',
  BufferAttribute: FakeBufferAttribute,
  BufferGeometry: FakeBufferGeometry,
  Matrix4: FakeMatrix4,
  Points: FakePoints,
  ShaderMaterial: FakeShaderMaterial,
  Vector3: FakeVector3
};

function makeEffects() {
  const effects = Object.create(Effects.prototype);
  effects.THREE = THREE;
  effects.scene = new FakeScene();
  effects.camera = null;
  effects._alive = [];
  effects._decals = [];
  effects._impactPool = { free: [], cap: 16 };
  effects._deathPool = { free: [], cap: 6 };
  effects._shakeTime = 0;
  effects._shakeDur = 0;
  effects._shakeOffset = new FakeVector3();
  effects._updateTracerPool = () => {};
  effects._updateFlashPool = () => {};
  effects._updateRingPool = () => {};
  effects._muzzleGroup = null;
  effects.hitStrength = 0;
  effects.fatigueOverlay = null;
  return effects;
}

test('expired impact systems return to the pool without disposing reusable GPU resources', () => {
  const effects = makeEffects();
  effects.spawnBulletImpact(new FakeVector3(1, 2, 3), new FakeVector3(0, 1, 0));
  const points = effects._alive[0].points;

  effects.update(0.7);

  assert.equal(effects._impactPool.free.length, 1);
  assert.equal(points.geometry.disposeCalls, 0);
  assert.equal(points.material.disposeCalls, 0);
});

test('reused impact systems are reattached to the scene', () => {
  const effects = makeEffects();
  effects.spawnBulletImpact(new FakeVector3(), new FakeVector3(0, 1, 0));
  const firstPoints = effects._alive[0].points;
  effects.update(0.7);

  effects.spawnBulletImpact(new FakeVector3(4, 0, 2), new FakeVector3(1, 0, 0));

  assert.equal(effects._alive[0].points, firstPoints);
  assert.equal(effects.scene.has(firstPoints), true);
});

test('expired enemy-death systems return to the pool without disposing reusable GPU resources', () => {
  const effects = makeEffects();
  effects.enemyDeath(new FakeVector3(2, 0, 5));
  const points = effects._alive[0].points;

  effects.update(1.1);

  assert.equal(effects._deathPool.free.length, 1);
  assert.equal(points.geometry.disposeCalls, 0);
  assert.equal(points.material.disposeCalls, 0);
});

test('impact systems never exceed their configured pool cap under saturation', () => {
  const effects = makeEffects();

  for (let i = 0; i <= effects._impactPool.cap; i += 1) {
    effects.spawnBulletImpact(new FakeVector3(i, 0, 0), new FakeVector3(0, 1, 0));
  }

  assert.ok(effects._alive.length <= effects._impactPool.cap);
  assert.ok(effects.scene.children.length <= effects._impactPool.cap);
});

test('enemy-death systems never exceed their configured pool cap under saturation', () => {
  const effects = makeEffects();

  for (let i = 0; i <= effects._deathPool.cap; i += 1) {
    effects.enemyDeath(new FakeVector3(i, 0, 0));
  }

  assert.ok(effects._alive.length <= effects._deathPool.cap);
  assert.ok(effects.scene.children.length <= effects._deathPool.cap);
});
