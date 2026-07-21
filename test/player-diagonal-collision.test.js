import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';

const noop = () => {};
globalThis.THREE = THREE;
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 720 };
globalThis.document = {
  body: { addEventListener: noop, ownerDocument: null },
  addEventListener: noop,
  getElementById: () => null
};
globalThis.document.body.ownerDocument = globalThis.document;
globalThis.localStorage = { getItem: () => null, setItem: noop };

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/player.js');
let playerSource = fs.readFileSync(sourcePath, 'utf8');
const controlsStub = `class PointerLockControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.isLocked = true;
    this._object = new THREE.Object3D();
  }
  getObject() { return this._object; }
}
`;
playerSource = playerSource.replace(
  /import \{ PointerLockControls \} from 'https:\/\/unpkg\.com\/three@0\.159\.0\/examples\/jsm\/controls\/PointerLockControls\.js\?module';\r?\n/,
  controlsStub
);
const temporaryModule = path.resolve(testDirectory, './_player_diagonal_temp.mjs');
fs.writeFileSync(temporaryModule, playerSource);
const { PlayerController } = await import(pathToFileURL(temporaryModule));
fs.unlinkSync(temporaryModule);

test('production player cannot cross a thin Level 1 collider on a straight diagonal', () => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  const collider = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.65, 1.4));
  collider.position.set(22, 1.825, -17);
  collider.updateMatrixWorld(true);
  const player = new PlayerController(THREE, camera, document.body, [collider], Infinity);
  player.refreshColliders([collider]);

  const outward = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const travel = outward.clone().negate();
  const start = new THREE.Vector3(25.245, 1.7, -20.245);
  const goal = new THREE.Vector3(19.46, 1.7, -14.46);
  const root = player.controls.getObject();
  root.position.copy(start);
  root.rotation.y = Math.atan2(-travel.x, -travel.z);
  player.keys.add('KeyW');
  const tangent = new THREE.Vector3(-outward.z, 0, outward.x);
  const requestedDistance = start.distanceTo(goal);
  let progress = 0;
  let maxLateralDeviation = 0;

  for (let frame = 0; frame < 180; frame++) {
    player.update(1 / 60);
    const displacement = root.position.clone().sub(start);
    progress = displacement.dot(travel);
    maxLateralDeviation = Math.max(maxLateralDeviation, Math.abs(displacement.dot(tangent)));
    if (progress >= requestedDistance - 0.25) break;
  }

  const crossedStraightThrough = progress >= requestedDistance - 0.25 && maxLateralDeviation <= 0.35 * 0.75;
  assert.equal(crossedStraightThrough, false);
});

test('ground sampling cannot snap a player from beside a tall collider onto its roof', () => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  const tallProp = new THREE.Mesh(new THREE.BoxGeometry(4, 5.5, 4));
  tallProp.position.set(0, 2.75, 0);
  tallProp.updateMatrixWorld(true);
  const player = new PlayerController(THREE, camera, document.body, [tallProp], Infinity);
  player.refreshColliders([tallProp]);
  const root = player.controls.getObject();

  root.position.set(0, 1.7, 0);
  player._groundCache.x = Infinity;
  assert.equal(player._groundHeightAt(0, 0, true), 0);

  // Once the feet are already at roof height (for example after a valid
  // landing), that same surface remains usable as ground.
  root.position.set(0, 7.2, 0);
  player._groundCache.x = Infinity;
  assert.equal(player._groundHeightAt(0, 0, true), 5.5);
});

test('player can move out of an existing collider overlap without moving deeper into it', () => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  const collider = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4));
  collider.position.set(0, 2, 0);
  collider.updateMatrixWorld(true);
  const player = new PlayerController(THREE, camera, document.body, [collider], Infinity);
  player.refreshColliders([collider]);
  const root = player.controls.getObject();

  // The 0.45m player half-width overlaps the collider by 0.15m.
  root.position.set(2.3, 1.7, 0);
  player.keys.add('KeyD');
  for (let frame = 0; frame < 20; frame++) player.update(1 / 60);
  player.keys.clear();

  assert.ok(root.position.x > 2.45, `expected overlap escape, got x=${root.position.x}`);
});
