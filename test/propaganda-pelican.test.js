import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createPropagandaPelican } from '../src/assets/propaganda-pelican.js';
import { PELICAN_BALANCE, PropagandaPelicanEnemy } from '../src/enemies/pelican.js';

function makeMaterials() {
  return { head: new THREE.MeshLambertMaterial({ color: 0x161916 }) };
}

function makeEnemy(position = new THREE.Vector3(0, 7, 10)) {
  return new PropagandaPelicanEnemy({
    THREE,
    mats: makeMaterials(),
    cfg: { type: 'pelican', hp: 100 },
    spawnPos: position,
    rng: () => 0
  });
}

test('Propaganda Pelican has a long beak, broad silhouette, and visible grenade rack', () => {
  const built = createPropagandaPelican({ THREE, mats: makeMaterials() });
  const bounds = new THREE.Box3().setFromObject(built.root);
  const size = bounds.getSize(new THREE.Vector3());

  assert.ok(size.x > 4.5, `expected broad wings, got ${size.x.toFixed(2)}m`);
  assert.ok(size.z > 2.8, `expected long bird body, got ${size.z.toFixed(2)}m`);
  assert.equal(built.refs.grenadeRack.children.length, 3);
  assert.equal(built.head.userData.bodyPart, 'head');
  assert.ok(built.refs.beak.geometry.type.includes('Cone'));
});

test('Pelican balance preserves the requested 5-7 metre release band', () => {
  assert.equal(PELICAN_BALANCE.releaseMin, 5);
  assert.equal(PELICAN_BALANCE.releaseMax, 7);
  assert.ok(PELICAN_BALANCE.blastRadius < PELICAN_BALANCE.releaseMin);
  assert.ok(PELICAN_BALANCE.rechargeMin >= 3.5);
});

test('Pelican blends air-body separation into its flight path', () => {
  const enemy = makeEnemy();
  const player = new THREE.Object3D();
  player.position.set(0, 1.6, 0);
  enemy.state = 'approach';
  let appliedStep = null;
  const ctx = {
    player,
    separation: () => new THREE.Vector3(1, 0, 0),
    moveWithCollisions(_root, step) { appliedStep = step.clone(); },
    setAIState() {}
  };

  enemy.update(0.1, ctx);

  assert.ok(appliedStep.x > 0, 'expected lateral separation away from the allied flight lane');
  assert.ok(appliedStep.z < 0, 'expected the bombing run to keep advancing toward the player');
  assert.ok(Math.abs(appliedStep.length() - PELICAN_BALANCE.approachSpeed * 0.1) < 1e-6);
});

test('Pelican approaches, drops one spherical grenade, retreats, and damages only after impact', () => {
  const enemy = makeEnemy();
  const scene = new THREE.Scene();
  const player = new THREE.Object3D();
  player.position.set(0, 1.6, 0);
  const damage = [];
  const states = [];
  const events = [];
  const ctx = {
    player,
    scene,
    moveWithCollisions(root, step) { root.position.add(step); },
    setAIState(_root, state) { states.push(state); },
    damagePlayer(amount, metadata) { damage.push({ amount, metadata }); },
    emitAIEvent(_root, type, data = {}) { events.push({ type, ...data }); }
  };

  enemy.update(1.2, ctx);
  assert.equal(enemy.state, 'approach');
  for (let index = 0; index < 20 && enemy.state === 'approach'; index += 1) enemy.update(0.1, ctx);

  assert.equal(enemy.state, 'retreat');
  assert.equal(enemy.grenades.length, 1);
  assert.equal(enemy.grenades[0].mesh.geometry.type, 'SphereGeometry');
  assert.equal(damage.length, 0);
  assert.ok(states.includes('bombing_run'));
  const dropped = events.find(event => event.type === 'pelican_grenade_dropped');
  assert.ok(dropped.releaseDistance >= PELICAN_BALANCE.releaseMin);
  assert.ok(dropped.releaseDistance <= PELICAN_BALANCE.releaseMax);

  for (let index = 0; index < 30 && damage.length === 0; index += 1) enemy.update(0.05, ctx);
  assert.equal(damage.length, 1);
  assert.ok(damage[0].amount >= PELICAN_BALANCE.grenadeEdgeDamage);
  assert.ok(damage[0].amount <= PELICAN_BALANCE.grenadeDamage);
  assert.equal(damage[0].metadata.sourceKind, 'pelican_grenade');
});
