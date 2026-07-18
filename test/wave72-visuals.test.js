import test from 'node:test';
import assert from 'node:assert/strict';

import { createWave72Visuals } from '../src/game/wave72-visuals.js';

class Color {
  constructor(value) { this.value = value; }
  clone() { return new Color(this.value); }
  copy(other) { this.value = other.value; return this; }
  setHex(value) { this.value = value; return this; }
}

class Node {
  constructor() {
    this.children = [];
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.rotation = { x: 0 };
  }
  add(child) { this.children.push(child); }
  traverse(visitor) {
    visitor(this);
    for (const child of this.children) {
      if (typeof child.traverse === 'function') child.traverse(visitor);
      else visitor(child);
    }
  }
}

class Disposable {
  constructor(options = {}) { Object.assign(this, options); this.disposed = false; }
  dispose() { this.disposed = true; }
}

class Geometry extends Disposable {
  constructor(...args) { super(); this.args = args; }
}

const THREE = {
  Group: class extends Node {},
  PointLight: class extends Node {
    constructor(color, intensity, distance, decay) {
      super();
      Object.assign(this, { color, intensity, distance, decay });
    }
  },
  Mesh: class extends Node {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  },
  MeshBasicMaterial: Disposable,
  CircleGeometry: Geometry,
  RingGeometry: Geometry,
  ConeGeometry: Geometry,
  SphereGeometry: Geometry,
  TorusGeometry: Geometry,
  DoubleSide: 'double-side',
  AdditiveBlending: 'additive'
};

test('Wave 72 visuals enforce darkness and restore the previous environment on stop', () => {
  const scene = {
    added: [],
    removed: [],
    fog: { color: new Color(0xcfe8ff), near: 20, far: 160 },
    add(node) { this.added.push(node); },
    remove(node) { this.removed.push(node); }
  };
  const hemi = { intensity: 0.9 };
  const dir = { intensity: 0.8 };
  const skyMat = { uniforms: { top: { value: new Color(0xaee9ff) }, bottom: { value: new Color(0xf1e3ff) } } };
  const visuals = createWave72Visuals({ THREE, scene, hemi, dir, skyMat });

  visuals.start();
  visuals.update();

  assert.equal(visuals.active, true);
  assert.equal(scene.added.length, 1);
  assert.equal(scene.added[0].children.length, 9);
  assert.equal(scene.added[0].children[0].intensity, 18);
  assert.equal(scene.added[0].children[2].geometry.args[0], 5);
  assert.equal(scene.added[0].children[2].material.opacity, 0.34);
  assert.equal(hemi.intensity, 0.012);
  assert.equal(dir.intensity, 0.02);
  assert.equal(scene.fog.color.value, 0x010706);
  assert.equal(scene.fog.near, 5);
  assert.equal(scene.fog.far, 42);
  assert.equal(skyMat.uniforms.top.value.value, 0x000203);

  const visualGroup = scene.added[0];
  visuals.stop();

  assert.equal(visuals.active, false);
  assert.deepEqual(scene.removed, [visualGroup]);
  assert.equal(hemi.intensity, 0.9);
  assert.equal(dir.intensity, 0.8);
  assert.equal(scene.fog.color.value, 0xcfe8ff);
  assert.equal(scene.fog.near, 20);
  assert.equal(scene.fog.far, 160);
  for (const child of visualGroup.children.filter(child => child.geometry)) {
    assert.equal(child.geometry.disposed, true);
    assert.equal(child.material.disposed, true);
  }
});
