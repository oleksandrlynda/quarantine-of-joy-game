import test from 'node:test';
import assert from 'node:assert/strict';

class FakeColor {
  constructor(value) { this.value = value; }
  set(value) { this.value = value; return this; }
}

class FakeRingGeometry {
  constructor(...args) { this.args = args; this.disposed = false; }
  dispose() { this.disposed = true; }
}

function makeRingMaterial() {
  return {
    uniforms: {
      uElapsed: { value: -1 },
      uLife: { value: -1 },
      uStart: { value: -1 },
      uEnd: { value: -1 },
      uColor: { value: new FakeColor(0) }
    }
  };
}

test('spawnGroundRing initializes a prewarmed mesh with the ring shader', async () => {
  globalThis.window = globalThis.window || {};
  const { Effects } = await import('../src/effects.js');
  const defaultGeometry = new FakeRingGeometry();
  const defaultMaterial = {
    disposed: false,
    dispose() { this.disposed = true; }
  };
  const ring = {
    geometry: defaultGeometry,
    material: defaultMaterial,
    userData: {},
    position: { copy(value) { this.value = value; } },
    rotation: { x: 0 },
    visible: false
  };
  const effects = Object.create(Effects.prototype);
  effects.THREE = { RingGeometry: FakeRingGeometry, Color: FakeColor };
  effects._ringSharedMatProto = { clone: makeRingMaterial };
  effects._ringPool = { free: [ring], active: [], cap: 24 };
  effects.scene = { add() {} };

  const center = {
    clone() {
      return { y: 2, setY(y) { this.y = y; return this; } };
    }
  };
  const result = effects.spawnGroundRing(center, 1.6, 0xff88aa);

  assert.equal(result, ring);
  assert.equal(defaultMaterial.disposed, true);
  assert.equal(defaultGeometry.disposed, true);
  assert.equal(ring.userData.ringGeometryKind, 'ground');
  assert.equal(ring.material.uniforms.uElapsed.value, 0);
  assert.equal(ring.material.uniforms.uLife.value, 0.6);
  assert.ok(Math.abs(ring.material.uniforms.uStart.value - 0.16) < Number.EPSILON);
  assert.equal(ring.material.uniforms.uEnd.value, 1.6);
  assert.equal(ring.material.uniforms.uColor.value.value, 0xff88aa);
  assert.equal(effects._ringPool.active[0].ttl, 0.6);
});
