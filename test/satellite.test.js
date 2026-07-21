import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculateSatelliteDamage, SatelliteDesignator } from '../src/weapons/satellite.js';

function makeContext() {
  const scene = new THREE.Scene();
  const enemies = new Set();
  const radialHits = [];
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 0);
  camera.updateWorldMatrix(true, true);
  return {
    THREE,
    camera,
    raycaster: new THREE.Raycaster(),
    objects: [],
    enemyManager: {
      enemies,
      remove(root) { enemies.delete(root); }
    },
    obstacleManager: {
      scene,
      handleRadialHit(position, radius, damage) { radialHits.push({ position, radius, damage }); }
    },
    effects: {},
    pickups: {},
    combo: { multiplier: 1 },
    updateHUD() {},
    addScore() {},
    addComboAction() {},
    radialHits
  };
}

test('satellite damage preserves a lethal center and bounded quarter-damage edge', () => {
  assert.equal(calculateSatelliteDamage(300, 0, 4.6), 300);
  assert.equal(calculateSatelliteDamage(300, 6.5, 6.5), 75);
  assert.equal(calculateSatelliteDamage(300, 99, 6.5), 75);
});

test('satellite designator paints a clamped ground target with one pending strike', () => {
  const satellite = new SatelliteDesignator();
  const ctx = makeContext();
  satellite.beginAttack(ctx);
  satellite.onFire(ctx);

  assert.equal(satellite.pendingStrikes.length, 1);
  assert.equal(satellite.canFire(performance.now()), false);
  assert.equal(satellite.pendingStrikes[0].position.y, 0.06);
  assert.ok(satellite.pendingStrikes[0].position.distanceTo(ctx.camera.position) <= satellite.maxRange + 2);
  assert.equal(ctx.obstacleManager.scene.children.includes(satellite.pendingStrikes[0].warning), true);
  assert.equal(typeof satellite.hasAltFire, 'undefined');
});

test('satellite accepts an explicit support target and rejects overlapping pending strikes', () => {
  const satellite = new SatelliteDesignator();
  const ctx = makeContext();
  ctx.abilityTargetPoint = new THREE.Vector3(7, 0.8, -9);

  assert.equal(satellite.onFire(ctx), true);
  assert.deepEqual(satellite.pendingStrikes[0].position.toArray(), [7, 0.06, -9]);
  assert.equal(satellite.onFire(ctx), false);
  assert.equal(satellite.pendingStrikes.length, 1);
});

test('satellite beam waits for its telegraph, damages once, then cleans itself up', () => {
  const satellite = new SatelliteDesignator();
  const ctx = makeContext();
  const enemy = new THREE.Object3D();
  enemy.position.set(0, 0.06, -24);
  enemy.userData = { hp: 500, type: 'tank' };
  ctx.enemyManager.enemies.add(enemy);

  satellite.beginAttack(ctx);
  satellite.onFire(ctx);
  satellite.update(1.34, ctx);
  assert.equal(enemy.userData.hp, 500);
  assert.equal(satellite.pendingStrikes.length, 1);

  satellite.update(0.02, ctx);
  assert.equal(enemy.userData.hp, 200);
  assert.equal(satellite.pendingStrikes.length, 0);
  assert.equal(satellite.activeBeams.length, 1);
  assert.equal(ctx.radialHits.length, 1);
  assert.equal(ctx.radialHits[0].radius, 6.5);

  satellite.update(0.25, ctx);
  assert.equal(satellite.activeBeams.length, 0);
  assert.equal(ctx.obstacleManager.scene.children.length, 0);
});

test('satellite strike deals only half of its normal damage to the active boss', () => {
  const satellite = new SatelliteDesignator();
  const ctx = makeContext();
  const boss = new THREE.Object3D();
  const regular = new THREE.Object3D();
  boss.position.set(0, 0.06, -24);
  regular.position.copy(boss.position);
  boss.userData = { hp: 500, type: 'boss_test' };
  regular.userData = { hp: 500, type: 'tank' };
  ctx.enemyManager.enemies.add(boss);
  ctx.enemyManager.enemies.add(regular);
  ctx.enemyManager.bossManager = { active: true, boss: { root: boss } };

  satellite.onFire(ctx);
  satellite.update(satellite.strikeDelay, ctx);

  assert.equal(boss.userData.hp, 350);
  assert.equal(regular.userData.hp, 200);
});

test('clearing the prototype removes pending warnings without triggering damage', () => {
  const satellite = new SatelliteDesignator();
  const ctx = makeContext();
  satellite.beginAttack(ctx);
  satellite.onFire(ctx);

  satellite.clearWorld(ctx);
  assert.equal(satellite.pendingStrikes.length, 0);
  assert.equal(satellite.activeBeams.length, 0);
  assert.equal(ctx.obstacleManager.scene.children.length, 0);
});
