import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculateDynamiteDamage, Dynamite } from '../src/weapons/dynamite.js';

function makeContext() {
  const scene = new THREE.Scene();
  const enemies = new Set();
  return {
    THREE,
    camera: new THREE.PerspectiveCamera(),
    raycaster: new THREE.Raycaster(),
    objects: [],
    enemyManager: {
      enemies,
      remove(root) { enemies.delete(root); }
    },
    obstacleManager: { scene, handleRadialHit() {} },
    effects: {},
    pickups: {},
    combo: { multiplier: 1 },
    updateHUD() {},
    addScore() {},
    addComboAction() {}
  };
}

test('dynamite blast damage has a strong center and bounded edge falloff', () => {
  assert.equal(calculateDynamiteDamage(108, 0, 3.1), 108);
  assert.equal(calculateDynamiteDamage(108, 3.1, 3.1), 32);
  assert.equal(calculateDynamiteDamage(108, 99, 3.1), 32);
});

test('dynamite throws sticky charges with a fixed fuse and no alternate trigger', () => {
  const dynamite = new Dynamite();
  const ctx = makeContext();
  dynamite.beginAttack(ctx);
  dynamite.onFire(ctx);

  assert.equal(dynamite.charges.length, 1);
  assert.equal(dynamite.blastRadius, 3.1);
  assert.equal(dynamite.baseDamage, 108);
  assert.equal(dynamite.fuseSeconds, 2.6);
  assert.equal(typeof dynamite.hasAltFire, 'undefined');
  assert.equal(ctx.obstacleManager.scene.children.includes(dynamite.charges[0].root), true);
  dynamite.charges[0].root.position.y = 0.1;
  dynamite.update(1 / 60, ctx);
  assert.equal(dynamite.charges[0].state, 'stuck');
});

test('the fuse automatically explodes every expired charge and clears its world model', () => {
  const dynamite = new Dynamite();
  const ctx = makeContext();
  const enemy = new THREE.Object3D();
  const outsideEnemy = new THREE.Object3D();
  enemy.position.set(0, 0.8, 0);
  outsideEnemy.position.set(4, 0.16, 0);
  enemy.userData = { hp: 300, type: 'grunt' };
  outsideEnemy.userData = { hp: 300, type: 'grunt' };
  ctx.enemyManager.enemies.add(enemy);
  ctx.enemyManager.enemies.add(outsideEnemy);

  for (const x of [0, 8]) {
    const root = new THREE.Group();
    root.position.set(x, 0.16, 0);
    ctx.obstacleManager.scene.add(root);
    dynamite.charges.push({ root, state: 'stuck', age: 0, attackId: `Dynamite:${x}` });
  }

  dynamite.update(2.5, ctx);
  assert.equal(dynamite.charges.length, 2);
  assert.equal(enemy.userData.hp, 300);

  dynamite.update(0.11, ctx);
  assert.equal(dynamite.charges.length, 0);
  assert.equal(ctx.obstacleManager.scene.children.length, 0);
  assert.equal(enemy.userData.hp, 208);
  assert.equal(outsideEnemy.userData.hp, 300);
});

test('two Grade I charges block a third throw without consuming ammunition', () => {
  const dynamite = new Dynamite();
  dynamite.charges = [{}, {}];
  const ammo = dynamite.getAmmo();

  assert.equal(dynamite.canFire(performance.now()), false);
  assert.equal(dynamite.getAmmo(), ammo);
});

test('Grade II configuration restores three charges, 150 damage, and the 5.2 m radius', () => {
  const dynamite = new Dynamite().configure({ baseDamage: 150, blastRadius: 5.2, maxActiveCharges: 3 });

  assert.equal(dynamite.baseDamage, 150);
  assert.equal(dynamite.blastRadius, 5.2);
  assert.equal(dynamite.maxActiveCharges, 3);
});
