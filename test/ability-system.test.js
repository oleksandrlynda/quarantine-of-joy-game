import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AbilitySystem } from '../src/abilities/system.js';
import { ABILITY_BY_ID, resolveDebugAbility } from '../src/abilities/definitions.js';

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

test('ability definitions preserve the approved cooldowns and Dynamite grades', () => {
  assert.equal(ABILITY_BY_ID.get('dynamite').cost, 28);
  assert.deepEqual(ABILITY_BY_ID.get('dynamite').costs, [28, 40]);
  assert.equal(ABILITY_BY_ID.get('dynamite').cooldownSeconds, 35);
  assert.equal(ABILITY_BY_ID.get('dynamite').maxCharges, 2);
  assert.equal(ABILITY_BY_ID.get('gravity_well').cooldownSeconds, 90);
  assert.equal(ABILITY_BY_ID.get('gravity_well').cost, 55);
  assert.equal(ABILITY_BY_ID.get('satellite_strike').cooldownSeconds, 42);
  assert.equal(ABILITY_BY_ID.get('satellite_strike').cost, 42);
  assert.equal(ABILITY_BY_ID.get('punchline_rush').cooldownSeconds, 17);
  assert.equal(ABILITY_BY_ID.get('supply_drop').cooldownSeconds, 60);
  assert.equal(ABILITY_BY_ID.get('overtime').cooldownSeconds, 12);
  assert.equal(ABILITY_BY_ID.get('engagement_bait').cooldownSeconds, 45);
});

test('debug ability flags resolve without requiring a debug wave override', () => {
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&skill=dynamite')), 'dynamite');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&ability=gravity-well')), 'gravity_well');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&satellite=1')), 'satellite_strike');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&rush=1')), 'punchline_rush');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&skill=supply-drop')), 'supply_drop');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&overtime=1')), 'overtime');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1&bait=1')), 'engagement_bait');
  assert.equal(resolveDebugAbility(new URLSearchParams('debug=1')), null);
});

test('Dynamite Grade I casts twice and sequentially regenerates charges over 35 seconds', () => {
  const ctx = makeContext();
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => 'dynamite'
  });

  assert.equal(system.activate(), true);
  assert.equal(system.activate(), true);
  assert.equal(system.activate(), false);
  assert.equal(system.getState().charges, 0);
  assert.equal(system.runtimes.get('dynamite').payload.charges.length, 2);
  assert.equal(system.runtimes.get('dynamite').payload.baseDamage, 108);
  assert.equal(system.runtimes.get('dynamite').payload.blastRadius, 3.1);

  system.update(35);
  assert.equal(system.getState().charges, 1);
  assert.equal(system.getState().cooldownRemaining, 35);
  system.update(35);
  assert.equal(system.getState().charges, 2);
  assert.equal(system.getState().cooldownRemaining, 0);
});

test('Dynamite Grade II restores three stronger wide-radius charges', () => {
  const ctx = makeContext();
  let grade = 1;
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => 'dynamite',
    getAbilityGrade: () => grade
  });

  assert.equal(system.getState().maxCharges, 2);
  grade = 2;
  const state = system.getState();
  const payload = system.runtimes.get('dynamite').payload;
  assert.equal(state.grade, 2);
  assert.equal(state.maxCharges, 3);
  assert.equal(state.cooldownSeconds, 35);
  assert.equal(payload.baseDamage, 150);
  assert.equal(payload.blastRadius, 5.2);
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
  system.update(89.9);
  assert.equal(system.getState().ready, false);
  system.update(0.1);
  assert.equal(system.getState().ready, true);

  equipped = 'satellite_strike';
  assert.equal(system.activate(), true);
  assert.equal(system.getState().cooldownRemaining, 42);
});

test('explicit simulation activation can use Gravity Well on a one-second cooldown', () => {
  const ctx = makeContext();
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => 'satellite_strike'
  });

  assert.equal(system.activateById('gravity_well', {
    cooldownSeconds: 1,
    context: { ...ctx, abilityTargetPoint: new THREE.Vector3(6, 0, -4) }
  }), true);
  assert.equal(system.hasActivePayload('gravity_well'), true);
  assert.equal(system.getState('gravity_well').cooldownRemaining, 1);
  assert.equal(system.getState('satellite_strike').ready, true, 'support activation must not replace the equipped ability');
  system.update(1);
  assert.equal(system.getState('gravity_well').ready, true);
});

test('emergency ammo crate uses the Supply Drop box without spending its ability charge', () => {
  const ctx = makeContext();
  const spawned = [];
  ctx.obstacleManager = new (class {
    constructor() {
      this.scene = ctx.obstacleManager.scene;
      this.instances = [];
    }
    registerAbilityDestructible(instance, objects) {
      this.instances.push(instance);
      this.scene.add(instance.root);
      objects.push(instance.root);
      return true;
    }
  })();
  ctx.pickups = { spawn: type => spawned.push(type) };
  const system = new AbilitySystem({
    getContext: () => ctx,
    getEquippedAbility: () => 'supply_drop'
  });
  const position = new THREE.Vector3(0, 0, 0);

  assert.equal(system.spawnEmergencyAmmoCrate(position), true);
  assert.equal(system.hasEmergencyAmmoCrate(), true);
  assert.equal(system.getState('supply_drop').charges, 1);
  assert.equal(system.spawnEmergencyAmmoCrate(position), false);
});

test('Punchline Rush uses its callback and a 17-second cooldown without weapon switching', () => {
  let rushes = 0;
  const system = new AbilitySystem({
    getEquippedAbility: () => 'punchline_rush',
    activateRush: () => { rushes += 1; return true; }
  });

  assert.equal(system.activate(), true);
  assert.equal(rushes, 1);
  assert.equal(system.activate(), false);
  system.update(17);
  assert.equal(system.activate(), true);
  assert.equal(rushes, 2);
});
