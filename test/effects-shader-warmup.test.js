import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = globalThis.window || {};
const { Effects, createEffectsShaderWarmupExtras } = await import('../src/effects.js');

test('explosions do not change the scene-wide point-light shader variant', () => {
  assert.doesNotMatch(Effects.prototype.spawnExplosion.toString(), /PointLight/);
});

test('explosion warmup representatives cover every first-use material', () => {
  const extras = createEffectsShaderWarmupExtras(THREE);
  assert.equal(extras.length, 1);

  const materialNames = new Set();
  let sparks = null;
  let smoke = null;
  extras[0].traverse(object => {
    if (object.material?.name) materialNames.add(object.material.name);
    if (object.isPoints) sparks = object;
    if (object.isSprite) smoke = object;
  });

  assert.deepEqual(materialNames, new Set([
    'qoj-explosion-ring',
    'qoj-explosion-core',
    'qoj-explosion-sparks',
    'qoj-explosion-smoke'
  ]));
  assert.ok(sparks?.geometry.getAttribute('aDir'));
  assert.ok(sparks?.geometry.getAttribute('aSpeed'));
  assert.ok(sparks?.geometry.getAttribute('aLife'));
  assert.ok(smoke, 'smoke SpriteMaterial must be compiled before the first explosion');

  extras[0].traverse(object => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
});
