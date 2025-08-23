import test from 'node:test';
import assert from 'node:assert';
import { EnemyManager } from '../src/enemies/manager.js';

class Vector3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
}

class Box3 {
  constructor(min = new Vector3(), max = new Vector3()) { this.min = min; this.max = max; }
  set(min, max){ this.min = new Vector3(min.x, min.y, min.z); this.max = new Vector3(max.x, max.y, max.z); return this; }
  setFromObject(o){ return this.set(o.min, o.max); }
  intersectsBox(box){
    return !(box.max.x < this.min.x || box.min.x > this.max.x ||
             box.max.y < this.min.y || box.min.y > this.max.y ||
             box.max.z < this.min.z || box.min.z > this.max.z);
  }
}

class Raycaster { set(){} }

const THREE = { Vector3, Box3, Raycaster };

class TestEnemyManager extends EnemyManager {
  _initBulletPools() {}
}

function mkManager(obbs, groundFn) {
  const mgr = new TestEnemyManager(THREE, {}, {}, [], null, Infinity, null);
  mgr.objectBBs = obbs;
  mgr.objects = [];
  mgr._groundHeightAt = groundFn;
  return mgr;
}

test('enemy steps over small obstacle', () => {
  const obb = new Box3(new Vector3(0.5,0,-0.5), new Vector3(1.5,0.15,0.5));
  const ground = (x,z) => (x>=0.5 && x<=1.5 && z>=-0.5 && z<=0.5) ? 0.15 : 0;
  const mgr = mkManager([obb], ground);
  const enemy = { position: new Vector3(0,0.8,0) };
  mgr._moveWithCollisions(enemy, new Vector3(1,0,0));
  assert.ok(Math.abs(enemy.position.x - 1) < 1e-6);
  assert.ok(Math.abs(enemy.position.y - 0.95) < 1e-6);
});

test('enemy blocked by tall obstacle', () => {
  const obb = new Box3(new Vector3(0.5,0,-0.5), new Vector3(1.5,0.6,0.5));
  const ground = (x,z) => (x>=0.5 && x<=1.5 && z>=-0.5 && z<=0.5) ? 0.6 : 0;
  const mgr = mkManager([obb], ground);
  const enemy = { position: new Vector3(0,0.8,0) };
  mgr._moveWithCollisions(enemy, new Vector3(1,0,0));
  assert.strictEqual(enemy.position.x, 0);
  assert.strictEqual(enemy.position.y, 0.8);
});
