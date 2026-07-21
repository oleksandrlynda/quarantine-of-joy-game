import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loaderSource = await readFile(new URL('../loader.js', import.meta.url), 'utf8');

test('generated models use the guarded static batching boundary', () => {
  assert.match(loaderSource, /import \{ batchStaticPrefab \} from '\.\/src\/assets\/static-batching\.js'/);
  assert.match(loaderSource, /batchStaticPrefab\(\{[\s\S]*entry,[\s\S]*hasAnimations: !!gltf\.animations\?\.length/);
});

test('generated prefab clones sanitize renderer material hooks at the final boundary', () => {
  assert.match(loaderSource, /export function clonePrefab[\s\S]*inst\.traverse[\s\S]*sanitizeMaterialForCompile/);
  assert.match(loaderSource, /inst\.traverse\(object => \{\s*if \(!object\.material\) return;/);
  assert.match(loaderSource, /typeof mat\.onBuild !== 'function'/);
});

test('import normalization sanitizes lines and points as well as meshes', () => {
  assert.match(loaderSource, /function normalizePrefab[\s\S]*if \(o\.material\)[\s\S]*sanitizeMaterialForCompile/);
  assert.doesNotMatch(loaderSource, /if \(!object\.isMesh && !object\.isSkinnedMesh\) return;/);
});

test('runtime-created materials have a scene repair boundary with compact evidence', () => {
  assert.match(loaderSource, /export function repairInvalidMaterialBuildHooks/);
  assert.match(loaderSource, /root\?\.traverse\?\./);
  assert.match(loaderSource, /repairedCount/);
  assert.match(loaderSource, /evidenceOmitted/);
});

test('full model loading reuses prefabs registered by the menu bootstrap', () => {
  assert.match(loaderSource, /export async function loadAllModels[\s\S]*if \(_registry\.has\(key\)\)/);
});
