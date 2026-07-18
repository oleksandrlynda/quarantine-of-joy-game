import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AbilitySystem } from '../src/abilities/system.js';
import { ABILITY_BY_ID } from '../src/abilities/definitions.js';

function makeContext() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 0, -8);
  camera.updateWorldMatrix(true, true);
  return {
    THREE,
    camera,
    raycaster: new THREE.Raycaster(),
    objects: [],
    enemyManager: { enemies: new Set(), applyKnockback() {}, remove() {} },
    obstacleManager: { scene, handleRadialHit() {} },
    effects: {},
    pickups: {},
    combo: { multiplier: 1 },
    addScore() {},
    addComboAction() {},
    updateHUD() {},
    getPlayerPosition: target => target.set(20, 1.7, 0),
    applyPlayerKnockback() {}
  };
}

test('ability definitions preserve the approved cooldowns and Dynamite charge count', () => {
  assert.equal(ABILITY_BY_ID.get('dynamite').cooldownSeconds, 25);
  assert.equal(ABILITY_BY_ID.get('dynamite').maxCharges, 3);
  assert.equal(ABILITY_BY_ID.get('gravity_well').cooldownSeconds, 40);
  assert.equal(ABILITY_BY_ID.get('gravity_well').cost, 70);
  assert.equal(ABILITY_BY_ID.get('satellite_strike').cooldownSeconds, 32);
  assert.equal(ABILITY_BY_ID.get('punchline_rush').cooldownSeconds, 12);
});

test('Dynamite casts directly on Q and sequentially regenerates three charges', () => {
  const ctx = makeContext();
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => 'dynamite'
  });

  assert.equal(system.activate(), true);
  assert.equal(system.activate(), true);
  assert.equal(system.activate(), true);
  assert.equal(system.activate(), false);
  assert.equal(system.getState().charges, 0);
  assert.equal(system.runtimes.get('dynamite').payload.charges.length, 3);

  system.update(25);
  assert.equal(system.getState().charges, 1);
  assert.equal(system.getState().cooldownRemaining, 25);
  system.update(50);
  assert.equal(system.getState().charges, 3);
  assert.equal(system.getState().cooldownRemaining, 0);
});

test('single-charge abilities reject repeat casts until their cooldown completes', () => {
  const ctx = makeContext();
  let equipped = 'gravity_well';
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => equipped
  });

  assert.equal(system.activate(), true);
  assert.equal(system.activate(), false);
  system.update(39.9);
  assert.equal(system.getState().ready, false);
  system.update(0.1);
  assert.equal(system.getState().ready, true);

  equipped = 'satellite_strike';
  assert.equal(system.activate(), true);
  assert.equal(system.getState().cooldownRemaining, 32);
});

test('Punchline Rush uses its callback and a 12-second cooldown without weapon switching', () => {
  let rushes = 0;
  const system = new AbilitySystem({
    getEquippedAbility: () => 'punchline_rush',
    activateRush: () => { rushes += 1; return true; }
  });

  assert.equal(system.activate(), true);
  assert.equal(rushes, 1);
  assert.equal(system.activate(), false);
  system.update(12);
  assert.equal(system.activate(), true);
  assert.equal(rushes, 2);
});
