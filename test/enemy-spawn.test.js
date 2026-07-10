import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function sequenceRng(values) {
  let i = 0;
  return () => values[i++] ?? values.at(-1) ?? 0;
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const len = this.length(); if (len) { this.x /= len; this.y /= len; this.z /= len; } return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
class Box3 {
  constructor() { this.min = new Vector3(); this.max = new Vector3(); }
  set(min, max) { this.min = min.clone ? min.clone() : min; this.max = max.clone ? max.clone() : max; return this; }
  setFromObject() { return this; }
  intersectsBox() { return false; }
}
class Raycaster { set() {} intersectObjects() { return []; } }
class InstancedMesh { constructor() { this.instanceMatrix = { setUsage() {}, needsUpdate: false }; this.count = 0; } }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerSrcPath = path.resolve(__dirname, '../src/enemies/manager.js');
let managerCode = fs.readFileSync(managerSrcPath, 'utf8');
managerCode = managerCode.replace("import { ARENA_RADIUS } from '../world.js';", 'const ARENA_RADIUS = 40;');
const managerTmpPath = path.resolve(__dirname, '../src/enemies/_manager_temp.mjs');
fs.writeFileSync(managerTmpPath, managerCode);
const { EnemyManager } = await import(pathToFileURL(managerTmpPath));
fs.unlinkSync(managerTmpPath);

const THREE = {
  Vector3,
  Box3,
  Raycaster,
  SphereGeometry: class {},
  MeshBasicMaterial: class {},
  InstancedMesh,
  Matrix4: class { makeTranslation() {} },
  DynamicDrawUsage: 'DynamicDrawUsage'
};

function makeManager(rng) {
  return new EnemyManager(
    THREE,
    { add() {}, remove() {} },
    {},
    [],
    () => ({ position: new Vector3(0, 0, 0), forward: new Vector3(0, 0, 1) }),
    Infinity,
    null,
    rng
  );
}

test('spawn fallback uses injected rng reproducibly', () => {
  const rngValues = [0.8, 0.2];
  const first = makeManager(sequenceRng(rngValues));
  const second = makeManager(sequenceRng(rngValues));
  first.spawnRings = { edge: [], mid: [] };
  second.spawnRings = { edge: [], mid: [] };

  const firstPos = first._chooseSpawnPos();
  const secondPos = second._chooseSpawnPos();

  assert.deepEqual(
    { x: firstPos.x, y: firstPos.y, z: firstPos.z },
    { x: secondPos.x, y: secondPos.y, z: secondPos.z }
  );
  assert.deepEqual({ x: firstPos.x, y: firstPos.y, z: firstPos.z }, { x: 21, y: 0.8, z: -21 });
});
