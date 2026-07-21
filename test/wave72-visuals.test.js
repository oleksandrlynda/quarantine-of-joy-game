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
    this.scale = { value: 1, setScalar: value => { this.scale.value = value; } };
    this.visible = true;
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
  Object3D: class extends Node {},
  PointLight: class extends Node {
    constructor(color, intensity, distance, decay) {
      super();
      Object.assign(this, { color, intensity, distance, decay });
    }
  },
  SpotLight: class extends Node {
    constructor(color, intensity, distance, angle, penumbra, decay) {
      super();
      Object.assign(this, { color, intensity, distance, angle, penumbra, decay });
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
  assert.equal(scene.added[0].children.length, 13);
  assert.equal(scene.added[0].children[0].intensity, 18);
  assert.equal(scene.added[0].children[2].geometry.args[0], 5);
  assert.equal(scene.added[0].children[2].material.opacity, 0.34);
  assert.equal(hemi.intensity, 0.035);
  assert.equal(dir.intensity, 0.045);
  assert.equal(scene.fog.color.value, 0x02100e);
  assert.equal(scene.fog.near, 8);
  assert.equal(scene.fog.far, 52);
  assert.equal(skyMat.uniforms.top.value.value, 0x010707);

  visuals.locatorPulse([3, 1, -4]);
  visuals.setFinalSearchlight(true);
  visuals.update({ wardenPosition: { x: 3, y: 1, z: -4 }, dt: .2 });
  const locator = scene.added[0].children.find(child => child.name === 'warden-locator-pulse');
  const trackingFill = scene.added[0].children.find(child => child.name === 'warden-tracking-fill');
  const searchlight = scene.added[0].children.find(child => child.name === 'warden-final-searchlight');
  assert.equal(locator.visible, true);
  assert.ok(locator.scale.value > 1);
  assert.equal(trackingFill.intensity, 28);
  assert.deepEqual(
    { x: trackingFill.position.x, y: trackingFill.position.y, z: trackingFill.position.z },
    { x: 3, y: 1.5, z: -4 }
  );
  assert.equal(searchlight.intensity, 42);

  visuals.complete();
  visuals.update();
  assert.equal(hemi.intensity, .34);
  assert.equal(dir.intensity, .28);
  assert.equal(scene.fog.far, 96);

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
