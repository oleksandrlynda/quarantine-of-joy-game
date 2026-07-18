import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loaderSource = await readFile(new URL('../loader.js', import.meta.url), 'utf8');

test('generated static batching normalizes indices and separates incompatible attribute schemas', () => {
  assert.match(loaderSource, /if \(geometry\.index\) \{[\s\S]*geometry\.toNonIndexed\(\)/);
  assert.match(loaderSource, /const attributeSignature = Object\.keys\(geometry\.attributes\)/);
  assert.match(loaderSource, /const key = `\$\{material\.uuid\}::\$\{attributeSignature\}/);
});

test('generated prefab clones sanitize renderer material hooks at the final boundary', () => {
  assert.match(loaderSource, /export function clonePrefab[\s\S]*inst\.traverse[\s\S]*sanitizeMaterialForCompile/);
  assert.match(loaderSource, /typeof mat\.onBuild !== 'function'/);
});

test('full model loading reuses prefabs registered by the menu bootstrap', () => {
  assert.match(loaderSource, /export async function loadAllModels[\s\S]*if \(_registry\.has\(key\)\)/);
});
