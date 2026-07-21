import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculateGravityWellDamage, GravityWell } from '../src/weapons/gravitywell.js';

function makeContext() {
  const scene = new THREE.Scene();
  const enemies = new Set();
  const pulls = [];
  const playerPulls = [];
  const radialHits = [];
  const playerPosition = new THREE.Vector3(6, 1.7, 0);
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
      applyKnockback(root, vector) {
        pulls.push({ root, vector: vector.clone() });
        if (!root.userData?.knockbackImmune) root.position.add(vector);
      },
      remove(root) { enemies.delete(root); }
    },
    obstacleManager: {
      scene,
      handleRadialHit(position, radius, damage) { radialHits.push({ position, radius, damage }); }
    },
    effects: {},
    pickups: {},
    combo: { multiplier: 1 },
    addScore() {},
    addComboAction() {},
    updateHUD() {},
    getPlayerPosition(target) { return target.copy(playerPosition); },
    applyPlayerKnockback(vector) {
      playerPulls.push(vector.clone());
      playerPosition.add(vector);
    },
    pulls,
    playerPulls,
    playerPosition,
    radialHits
  };
}

function activateWell(well, ctx, position = new THREE.Vector3(0, 0.24, 0)) {
  well.beginAttack(ctx);
  well.onFire(ctx);
  const active = well.wells[0];
  active.root.position.copy(position);
  active.velocity.set(0, 0, 0);
  well._activate(active, ctx);
  return active;
}

test('gravity well implosion has strong center damage and bounded edge falloff', () => {
  assert.equal(calculateGravityWellDamage(240, 0, 5.5), 240);
  assert.equal(calculateGravityWellDamage(240, 5.5, 5.5), 72);
  assert.equal(calculateGravityWellDamage(240, 99, 5.5), 72);
});

test('gravity well throws one containment sphere and activates its visible field on landing', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  well.beginAttack(ctx);
  well.onFire(ctx);

  assert.equal(well.wells.length, 1);
  assert.equal(well.canFire(performance.now()), false);
  assert.equal(well.wells[0].state, 'flying');
  assert.equal(well.wells[0].root.userData.field.visible, false);
  well.wells[0].root.position.y = 0.1;
  well.update(1 / 60, ctx);
  assert.equal(well.wells[0].state, 'active');
  assert.equal(well.wells[0].root.userData.field.visible, true);
});

test('simulation support can place one Gravity Well directly on an enemy cluster', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  ctx.abilityTargetPoint = new THREE.Vector3(7, 4, -3);

  assert.equal(well.onFire(ctx), true);
  assert.equal(well.wells.length, 1);
  assert.equal(well.wells[0].state, 'active');
  assert.deepEqual(well.wells[0].root.position.toArray(), [7, 0.24, -3]);
  assert.equal(well.wells[0].root.userData.field.visible, true);
  assert.equal(well.onFire(ctx), false, 'support casts must not stack active wells');
  assert.equal(well.wells.length, 1);
});

test('active gravity field pulls regular enemies toward its center without tick damage', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  const enemy = new THREE.Object3D();
  enemy.position.set(6, 0.24, 0);
  enemy.userData = { hp: 400, type: 'grunt' };
  ctx.enemyManager.enemies.add(enemy);
  activateWell(well, ctx);

  well.update(0.1, ctx);
  assert.equal(ctx.pulls.length, 1);
  assert.ok(ctx.pulls[0].vector.x < 0);
  assert.ok(enemy.position.x < 6);
  assert.equal(enemy.userData.hp, 400);
});

test('gravity field overpowers an elite runner trying to sprint out of the field', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  const runner = new THREE.Object3D();
  runner.position.set(6, 0.24, 0);
  runner.userData = { hp: 400, type: 'rusher' };
  ctx.enemyManager.enemies.add(runner);
  activateWell(well, ctx);

  runner.position.x += 8.8 * 0.1;
  well.update(0.1, ctx);

  assert.ok(runner.position.x < 6, `runner escaped to x=${runner.position.x}`);
});

test('gravity field captures a top-speed flyer and pulls it downward', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  const flyer = new THREE.Object3D();
  flyer.position.set(6, 4, 0);
  flyer.userData = { hp: 400, type: 'flyer' };
  ctx.enemyManager.enemies.add(flyer);
  activateWell(well, ctx);

  const frame = 1 / 60;
  flyer.position.x += 16.7 * frame;
  well.update(frame, ctx);

  assert.ok(flyer.position.x < 6, `flyer escaped to x=${flyer.position.x}`);
  assert.ok(flyer.position.y < 4, `flyer was not pulled down from y=${flyer.position.y}`);
});

test('gravity field drags the player toward its center but preserves a safe inner radius', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  activateWell(well, ctx);

  well.update(0.1, ctx);
  assert.equal(ctx.playerPulls.length, 1);
  assert.ok(ctx.playerPulls[0].x < 0);
  assert.ok(ctx.playerPosition.x < 6);

  ctx.playerPosition.set(0.5, 1.7, 0);
  ctx.playerPulls.length = 0;
  well.update(0.1, ctx);
  assert.equal(ctx.playerPulls.length, 0);
});

test('simulation support well does not drag the QA player off its combat route', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  ctx.suppressGravityPlayerPull = true;
  activateWell(well, ctx);

  well.update(0.1, ctx);
  assert.equal(ctx.playerPulls.length, 0);
  assert.deepEqual(ctx.playerPosition.toArray(), [6, 1.7, 0]);
});

test('gravity well collapses after 2.5 seconds, damages once, and clears its model', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  const enemy = new THREE.Object3D();
  enemy.position.set(0, 0.24, 0);
  enemy.userData = { hp: 400, type: 'tank' };
  ctx.enemyManager.enemies.add(enemy);
  const active = activateWell(well, ctx);
  active.activeAge = 2.49;

  well.update(0.02, ctx);
  assert.equal(enemy.userData.hp, 160);
  assert.equal(well.wells.length, 0);
  assert.equal(ctx.obstacleManager.scene.children.length, 0);
  assert.equal(ctx.radialHits.length, 1);
  assert.equal(ctx.radialHits[0].radius, 5.5);
});

test('clearing Gravity Well removes its live field without an implosion', () => {
  const well = new GravityWell();
  const ctx = makeContext();
  activateWell(well, ctx);

  well.clearWorld(ctx);
  assert.equal(well.wells.length, 0);
  assert.equal(ctx.obstacleManager.scene.children.length, 0);
  assert.equal(ctx.radialHits.length, 0);
});
