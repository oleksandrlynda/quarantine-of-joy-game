import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const { Effects } = await import('../src/effects.js');

class FakeVector {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new FakeVector(this.x, this.y, this.z); }
  copy(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setY(y) { this.y = y; return this; }
  addScaledVector(value, scale) { this.x += value.x * scale; this.y += value.y * scale; this.z += value.z * scale; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() {
    const length = Math.sqrt(this.lengthSq()) || 1;
    this.x /= length; this.y /= length; this.z /= length;
    return this;
  }
  multiplyScalar(scale) { this.x *= scale; this.y *= scale; this.z *= scale; return this; }
}

function makeRoot() {
  return {
    position: new FakeVector(1, 0, 2),
    rotation: new FakeVector(),
    scale: new FakeVector(1, 1, 1),
    visible: true,
    parent: null,
    removeFromParent() {
      if (this.parent?.remove) this.parent.remove(this);
      this.parent = null;
    }
  };
}

function makeEffects() {
  const scene = {
    added: [],
    add(root) { root.parent = this; this.added.push(root); },
    remove(root) { if (root.parent === this) root.parent = null; }
  };
  const effects = Object.create(Effects.prototype);
  effects.THREE = { Vector3: FakeVector };
  effects.scene = scene;
  effects._alive = [];
  return { effects, scene };
}

test('Opening Act keeps the defeated model visible while launching and spinning it', () => {
  const { effects, scene } = makeEffects();
  const root = makeRoot();
  const entry = effects.animateStageDeath(root, {
    style: 'opening_act',
    grade: 2,
    direction: new FakeVector(1, 0, 0)
  });

  assert.equal(root.parent, scene);
  assert.equal(effects._alive.includes(entry), true);
  entry.tick(0.4);
  assert.ok(root.position.y > 0);
  assert.ok(root.position.x > 1);
  assert.ok(root.rotation.y > 0);
  entry.cleanup();
  assert.equal(root.parent, null);
});

test('Final Cut holds briefly before directing the defeated model into a fall', () => {
  const { effects, scene } = makeEffects();
  const root = makeRoot();
  const entry = effects.animateStageDeath(root, {
    style: 'final_cut',
    grade: 1,
    direction: new FakeVector(0, 0, 1)
  });

  entry.tick(0.1);
  assert.equal(root.position.y, 0);
  entry.tick(0.6);
  assert.ok(root.position.y < 0);
  assert.ok(root.position.z > 2);
  assert.ok(root.rotation.x > 0);
  assert.equal(root.parent, scene);
});
