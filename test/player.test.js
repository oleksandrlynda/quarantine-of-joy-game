import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Minimal THREE.js stub
class Vector3 {
  constructor(x=0, y=0, z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(v,s){ this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
  subVectors(a,b){ this.x=a.x-b.x; this.y=a.y-b.y; this.z=a.z-b.z; return this; }
  multiplyScalar(s){ this.x*=s; this.y*=s; this.z*=s; return this; }
  lengthSq(){ return this.x*this.x + this.y*this.y + this.z*this.z; }
  length(){ return Math.sqrt(this.lengthSq()); }
  normalize(){ const len=this.length(); if(len>0) this.multiplyScalar(1/len); return this; }
  clampLength(min,max){ const len=this.length(); if(len===0) return this; if(len>max) return this.multiplyScalar(max/len); if(len<min) return this.multiplyScalar(min/len); return this; }
  crossVectors(a,b){ const ax=a.x, ay=a.y, az=a.z; const bx=b.x, by=b.y, bz=b.z; this.x=ay*bz-az*by; this.y=az*bx-ax*bz; this.z=ax*by-ay*bx; return this; }
  applyQuaternion(q){ // identity-only for tests
    return this;
  }
}
class Quaternion { constructor(){ this.x=0; this.y=0; this.z=0; this.w=1; } }
class Object3D { constructor(){ this.position=new Vector3(); this.quaternion=new Quaternion(); this.rotation={x:0,y:0,z:0}; } }
class Raycaster { constructor(){ this.far=Infinity; } set(){} intersectObjects(){ return []; } }
class Box3 {
  constructor(){ this.min = new Vector3(); this.max = new Vector3(); }
  setFromObject(){ return this; }
  intersectsBox(){ return false; }
}
const THREE = { Vector3, Quaternion, Object3D, Raycaster, Box3 };

// Expose globally so stubbed module can access
globalThis.THREE = THREE;

// Stub DOM globals
const noop = ()=>{};
const documentListeners = [];
globalThis.window = { addEventListener: noop, matchMedia: ()=>({ matches:false }), innerWidth:800, innerHeight:600 };
globalThis.document = {
  body: { addEventListener: noop, ownerDocument: null },
  addEventListener(type, handler, options){ documentListeners.push({ type, handler, options }); },
  getElementById: ()=>null
};
globalThis.document.body.ownerDocument = globalThis.document;
globalThis.localStorage = { _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); } };

// Create temporary copy of player.js with stubbed PointerLockControls import
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playerSrcPath = path.resolve(__dirname, '../src/player.js');
let code = fs.readFileSync(playerSrcPath, 'utf8');
const stub = "class PointerLockControls {\n  constructor(camera, domElement){\n    this.domElement = domElement;\n    this.camera = camera;\n    this.isLocked = true;\n    this._object = new THREE.Object3D();\n  }\n  getObject(){ return this._object; }\n}\n";
code = code.replace(
  /import \{ PointerLockControls \} from 'three\/addons\/controls\/PointerLockControls\.js';\r?\n/,
  stub
);
const tmpPath = path.resolve(__dirname, './_player_temp.mjs');
fs.writeFileSync(tmpPath, code);
const { PlayerController } = await import(pathToFileURL(tmpPath));
fs.unlinkSync(tmpPath);

// Helper to make basic camera stub
function makeCamera(){
  return { rotation:{x:0,y:0,z:0}, fov:75, zoom:1, updateProjectionMatrix: noop };
}

// Tests

test('player collision keeps movement shells and ignores ballistic-only window proxies', () => {
  const movementShell = { userData: { blocksShots: false } };
  const ballisticSill = { userData: { blocksMovement: false } };
  const player = new PlayerController(THREE, makeCamera(), document.body, [movementShell, ballisticSill], Infinity);

  assert.equal(player.collisionObjects.includes(movementShell), true);
  assert.equal(player.collisionObjects.includes(ballisticSill), false);
  assert.equal(player.objectBBs.length, 1);
  assert.equal(player.colliderHalf.x, .45);
});

test('upward movement stops at the underside of a solid ceiling', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.controls.getObject().position.set(0, 1.7, 0);
  const ceiling = new Box3();
  ceiling.min.set(-9, 2.7, -9);
  ceiling.max.set(9, 3, 9);
  player.objectBBs = [ceiling];
  player.canJump = true;
  player.jump();

  for (let i = 0; i < 4; i++) player.update(.05);

  assert.ok(player.controls.getObject().position.y <= 2.6);
  assert.equal(player.velocityY, 0);
});

test('stamina drains when sprinting and jumping then regenerates', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.canJump = true;
  player.keys.add('ShiftLeft');
  player.keys.add('KeyW');

  const start = player.getStamina();
  player.update(1); // sprint for 1s
  const afterSprint = player.getStamina();
  assert.equal(afterSprint, start - player.staminaSprintCostPerSec);

  player.jump();
  const afterJump = player.getStamina();
  assert.equal(afterJump, afterSprint - player.staminaJumpCost);

  player.keys.clear();
  player.update(0.25); // still within regen delay
  assert.equal(player.getStamina(), afterJump);

  player.update(0.25); // delay elapsed, regen starts
  const regenStart = player.getStamina();
  assert(regenStart > afterJump);
});

test('recoil values settle back to zero', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.applyRecoil({ pitchRad: 0.1 });
  player.update(0.016);
  assert.notEqual(player.recoilPitchOffset, 0);

  for (let i=0;i<200;i++) player.update(0.016);
  assert(Math.abs(player.recoilPitchOffset) < 1e-3);
  assert(Math.abs(player.recoilPitchVel) < 1e-3);
  assert(Math.abs(player.appliedRecoilPitch) < 1e-3);
});

test('stamina capacity mutation fills its delta and resets between runs', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.stamina = 40;
  player.addStaminaCapacity(3, { fill: true });
  assert.equal(player.staminaMax, 103);
  assert.equal(player.stamina, 43);
  player.resetStaminaCapacity();
  assert.equal(player.staminaMax, 100);
  assert.equal(player.stamina, 100);
});

test('stamina restoration is capped by the current run capacity', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.stamina = 84;
  assert.equal(player.restoreStamina(10), 10);
  assert.equal(player.stamina, 94);
  assert.equal(player.restoreStamina(20), 6);
  assert.equal(player.stamina, 100);
  assert.equal(player.restoreStamina(-5), 0);
});

test('Punchline Rush commits ten meters, grants temporary invulnerability, and delays stamina recovery', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  const steps = [];
  player.onRushStep = event => steps.push(event.travelled);

  assert.equal(player.startRush({ distance: 10, duration: 0.6, regenDelay: 8 }), true);
  assert.equal(player.getStamina(), 0);
  assert.equal(player.isInvulnerable(), true);
  assert.equal(player.startRush(), false);

  player.update(0.3);
  assert.equal(player.isRushing(), true);
  assert(Math.abs(player.controls.getObject().position.z - 3) < 1e-6);
  player.update(0.3);
  assert.equal(player.isInvulnerable(), false);
  assert(Math.abs(player.controls.getObject().position.z + 2) < 1e-6);
  assert.equal(steps.length, 2);

  player.update(7.9);
  assert.equal(player.getStamina(), 0);
  player.update(0.1);
  assert(player.getStamina() > 0);
  assert.equal(player.startRush(), false);
});

test('cooldown-driven Punchline Rush can start without spending stamina', () => {
  const player = new PlayerController(THREE, makeCamera(), document.body, [], Infinity);
  player.stamina = 37;

  assert.equal(player.startRush({
    distance: 10,
    duration: 0.6,
    regenDelay: 0,
    requireFullStamina: false,
    consumeStamina: false
  }), true);
  assert.equal(player.getStamina(), 37);
});

test('weapon zoom smoothly reaches and leaves the requested magnification', () => {
  const camera = makeCamera();
  const player = new PlayerController(THREE, camera, document.body, [], Infinity);

  player.setZoomMultiplier(3);
  for (let i=0; i<60; i++) player.update(0.016);
  assert(Math.abs(camera.zoom - 3) < 1e-4);

  player.setZoomMultiplier(1);
  for (let i=0; i<60; i++) player.update(0.016);
  assert(Math.abs(camera.zoom - 1) < 1e-4);
});

test('look input uses stable FPS Euler order and rejects pointer-lock outliers', () => {
  const camera = makeCamera();
  const player = new PlayerController(THREE, camera, document.body, [], Infinity);
  const lookListener = documentListeners.filter(listener => listener.type === 'mousemove').at(-1);
  let propagationStopped = false;

  assert.equal(camera.rotation.order, 'YXZ');
  assert.equal(lookListener.options, true);
  lookListener.handler({
    movementX: 40,
    movementY: -20,
    stopImmediatePropagation(){ propagationStopped = true; }
  });
  assert.equal(propagationStopped, true);
  assert.equal(player.yawObject.rotation.y, -0.08);
  assert.equal(camera.rotation.x, 0.04);

  const yawBeforeOutlier = player.yawObject.rotation.y;
  const pitchBeforeOutlier = camera.rotation.x;
  const anomalies = [];
  player.onLookAnomaly = data => anomalies.push(data);
  const sixtyDegreeDelta = (Math.PI / 3) / 0.002;
  assert.equal(player._applyLookDelta(sixtyDegreeDelta, 0, 0.002), false);
  assert.equal(player.yawObject.rotation.y, yawBeforeOutlier);
  assert.equal(camera.rotation.x, pitchBeforeOutlier);
  assert.equal(anomalies.length, 1);
  assert.equal(Math.round(anomalies[0].yawDeltaDegrees), 60);
  assert.equal(anomalies[0].thresholdDegrees, 45);
});
