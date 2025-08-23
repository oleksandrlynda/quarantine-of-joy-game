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
globalThis.window = { addEventListener: noop, matchMedia: ()=>({ matches:false }), innerWidth:800, innerHeight:600 };
globalThis.document = { body: { addEventListener: noop }, getElementById: ()=>null };
globalThis.localStorage = { _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); } };

// Create temporary copy of player.js with stubbed PointerLockControls import
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playerSrcPath = path.resolve(__dirname, '../src/player.js');
let code = fs.readFileSync(playerSrcPath, 'utf8');
const stub = "class PointerLockControls {\n  constructor(camera, domElement){\n    this.domElement = domElement;\n    this.camera = camera;\n    this.isLocked = true;\n    this._object = new THREE.Object3D();\n  }\n  getObject(){ return this._object; }\n}\n";
code = code.replace("import { PointerLockControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js?module';\n", stub);
const tmpPath = path.resolve(__dirname, './_player_temp.mjs');
fs.writeFileSync(tmpPath, code);
const { PlayerController } = await import(pathToFileURL(tmpPath));
fs.unlinkSync(tmpPath);

// Helper to make basic camera stub
function makeCamera(){
  return { rotation:{x:0,y:0,z:0}, fov:75, updateProjectionMatrix: noop };
}

// Tests

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
