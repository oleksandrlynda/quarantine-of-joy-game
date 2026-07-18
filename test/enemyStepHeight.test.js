import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyManager } from '../src/enemies/manager.js';

function makeTHREEStub(){
  class Vector3 {
    constructor(x=0, y=0, z=0){ this.x=x; this.y=y; this.z=z; }
    set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
    addScaledVector(v, s){ this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  }
  class Box3 {
    constructor(){ this.min=new Vector3(); this.max=new Vector3(); }
    set(min,max){ this.min=min; this.max=max; return this; }
    intersectsBox(){ return false; }
  }
  class Raycaster {}
  return { Vector3, Box3, Raycaster };
}

class TestEnemyManager extends EnemyManager {
  constructor(groundHeights){
    const THREE = makeTHREEStub();
    const scene = { add(){}, remove(){} };
    const mats = {};
    super(THREE, scene, mats, []);
    this.groundHeights = groundHeights;
  }
  _initBulletPools() {}
  _groundHeightAt(x){
    if (x < 1) return this.groundHeights[0];
    if (x < 2) return this.groundHeights[1];
    return this.groundHeights[2] ?? this.groundHeights[this.groundHeights.length-1];
  }
}

test('regular enemy chain-steps 40% obstacles', () => {
  const heights = [0, 0.64, 1.28];
  const mgr = new TestEnemyManager(heights);
  const enemy = { position: new mgr.THREE.Vector3(0, mgr.enemyHalf.y, 0), userData: { type: 'grunt' } };
  mgr._moveWithCollisions(enemy, new mgr.THREE.Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.y - (heights[1] + mgr.enemyHalf.y)) < 1e-5);
  mgr._moveWithCollisions(enemy, new mgr.THREE.Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.y - (heights[2] + mgr.enemyHalf.y)) < 1e-5);
});

test('tanks fail when rise exceeds 30%', () => {
  const heights = [0, 0.64];
  const mgr = new TestEnemyManager(heights);
  const enemy = { position: new mgr.THREE.Vector3(0, mgr.enemyHalf.y, 0), userData: { type: 'tank' } };
  mgr._moveWithCollisions(enemy, new mgr.THREE.Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.y - mgr.enemyHalf.y) < 1e-5);
});

test('regular enemy fails a single 80% obstacle', () => {
  const heights = [0, 1.28];
  const mgr = new TestEnemyManager(heights);
  const enemy = { position: new mgr.THREE.Vector3(0, mgr.enemyHalf.y, 0), userData: { type: 'grunt' } };
  mgr._moveWithCollisions(enemy, new mgr.THREE.Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.y - mgr.enemyHalf.y) < 1e-5);
});

test('enemy descending from 40% obstacle snaps to ground', () => {
  const heights = [0.64, 0];
  const mgr = new TestEnemyManager(heights);
  const enemy = { position: new mgr.THREE.Vector3(0, heights[0] + mgr.enemyHalf.y, 0), userData: { type: 'grunt' } };
  mgr._moveWithCollisions(enemy, new mgr.THREE.Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.y - mgr.enemyHalf.y) < 1e-5);
});
