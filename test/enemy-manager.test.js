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
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const len = this.length(); if (len) { this.x /= len; this.y /= len; this.z /= len; } return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
class Box3 {
  constructor(min = new Vector3(), max = new Vector3()) { this.min = min; this.max = max; }
  set(min, max) { this.min = min.clone ? min.clone() : min; this.max = max.clone ? max.clone() : max; return this; }
  setFromObject(obj) { return this.set(obj.min, obj.max); }
  intersectsBox(other) {
    return !(other.max.x < this.min.x || other.min.x > this.max.x ||
      other.max.y < this.min.y || other.min.y > this.max.y ||
      other.max.z < this.min.z || other.min.z > this.max.z);
  }
}
class Raycaster { set() {} intersectObjects() { return []; } }
class InstancedMesh {
  constructor() {
    this.instanceMatrix = { setUsage() {}, needsUpdate: false };
    this.count = 0;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerSrcPath = path.resolve(__dirname, '../src/enemies/manager.js');
let managerCode = fs.readFileSync(managerSrcPath, 'utf8');
managerCode = managerCode.replace("import { ARENA_RADIUS } from '../world.js';", 'const ARENA_RADIUS = 40;');
const managerTmpPath = path.resolve(__dirname, '../src/enemies/_manager_temp_test.mjs');
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

function makeScene() {
  return {
    added: [],
    removed: [],
    add(obj) { this.added.push(obj); },
    remove(obj) { this.removed.push(obj); }
  };
}

function makeBox(min, max) {
  return { min: new Vector3(min.x, min.y, min.z), max: new Vector3(max.x, max.y, max.z) };
}

function makeManager({ objects = [], rng = sequenceRng([0.8, 0.2]), scene = makeScene() } = {}) {
  const manager = new EnemyManager(
    THREE,
    scene,
    {},
    objects,
    () => ({ position: new Vector3(0, 0, 0), forward: new Vector3(0, 0, 1) }),
    Infinity,
    null,
    rng
  );
  manager.spawnRings = { edge: [], mid: [] };
  return { manager, scene };
}

test('_isSpawnAreaClear rejects positions intersecting obstacle AABBs', () => {
  const obstacle = makeBox({ x: 4, y: 0, z: 4 }, { x: 6, y: 2, z: 6 });
  const { manager } = makeManager({ objects: [obstacle] });

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), false);
  assert.equal(manager._isSpawnAreaClear(new Vector3(12, 0.8, 12), 0.1), true);
});

test('_chooseSpawnPos rejects custom spawn points within 12 units of the player', () => {
  const { manager } = makeManager();
  manager.customSpawnPoints = [
    new Vector3(0, 0.8, 6),
    new Vector3(14, 0.8, -14)
  ];

  const pos = manager._chooseSpawnPos();

  assert.deepEqual({ x: pos.x, y: pos.y, z: pos.z }, { x: 14, y: 0.8, z: -14 });
});

test('_chooseSpawnPos prefers non-visible or not-forward-facing candidates', () => {
  const { manager } = makeManager();
  const forwardVisible = new Vector3(0, 0.8, 20);
  const occludedSide = new Vector3(-20, 0.8, 0);
  manager.customSpawnPoints = [forwardVisible, occludedSide];
  manager._isVisibleFromPlayer = pos => pos !== occludedSide;

  const pos = manager._chooseSpawnPos();

  assert.deepEqual({ x: pos.x, y: pos.y, z: pos.z }, { x: -20, y: 0.8, z: 0 });
});

test('refreshColliders rebuilds obstacle bounding boxes after object changes', () => {
  const first = makeBox({ x: 4, y: 0, z: 4 }, { x: 6, y: 2, z: 6 });
  const second = makeBox({ x: 10, y: 0, z: 10 }, { x: 12, y: 2, z: 12 });
  const { manager } = makeManager({ objects: [first] });

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), false);
  manager.refreshColliders([second]);

  assert.equal(manager._isSpawnAreaClear(new Vector3(5, 0.8, 5), 0.1), true);
  assert.equal(manager._isSpawnAreaClear(new Vector3(11, 0.8, 11), 0.1), false);
});

test('startWave reports wave and remaining counts through hooks', () => {
  const { manager } = makeManager();
  const calls = [];
  manager.bossManager.startBoss = () => false;
  manager._getWaveTypes = (_wave, count) => Array.from({ length: count }, () => 'grunt');
  manager.spawn = () => {};
  manager.onWave = (wave, count) => calls.push(['wave', wave, count]);
  manager.onRemaining = alive => calls.push(['remaining', alive]);

  manager.startWave();

  assert.equal(manager.alive, 11);
  assert.deepEqual(calls, [['wave', 1, 11], ['remaining', 11]]);
});

test('reset clears enemies, projectiles, heal sprites, and restarts waves when not suspended', () => {
  const { manager, scene } = makeManager();
  const enemy = { position: new Vector3(1, 0.8, 1) };
  const healSprite = { sprite: { type: 'heal' } };
  let startWaveCalls = 0;
  manager.enemies.add(enemy);
  manager.instances.add({ root: enemy });
  manager._bulletPools.shooter.count = 2;
  manager._bulletPools.shooter.mesh.count = 2;
  manager._healSprites.push(healSprite);
  manager.bossManager.reset = () => {};
  manager.startWave = () => { startWaveCalls += 1; };

  manager.reset();

  assert.deepEqual(scene.removed, [enemy, healSprite.sprite]);
  assert.equal(manager.enemies.size, 0);
  assert.equal(manager.instances.size, 0);
  assert.equal(manager.alive, 0);
  assert.equal(manager.wave, 1);
  assert.equal(manager._bulletPools.shooter.count, 0);
  assert.equal(manager._bulletPools.shooter.mesh.count, 0);
  assert.equal(manager._healSprites.length, 0);
  assert.equal(startWaveCalls, 1);
});
