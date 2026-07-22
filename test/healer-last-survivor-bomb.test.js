import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HealerEnemy, HEALER_LAST_SURVIVOR_BOMB } from '../src/enemies/healer.js';

function makeHealer() {
  return new HealerEnemy({
    THREE,
    mats: {},
    cfg: { type: 'healer', hp: 90, speedMin: 2.2, speedMax: 2.6, color: 0x84cc16 },
    spawnPos: new THREE.Vector3(0, 0.8, 0),
    rng: () => 0.5
  });
}

function makeContext(healer, { last = true } = {}) {
  const damage = [];
  const removed = [];
  return {
    damage,
    removed,
    player: { position: new THREE.Vector3(0, 0.8, 0), userData: { combatHp: 160, combatMaxHp: 200 } },
    enemyManager: {
      isLastWaveEnemy: root => last && root === healer.root,
      remove: root => removed.push(root)
    },
    moveWithCollisions: (root, step) => root.position.add(step),
    damagePlayer: (amount, metadata) => damage.push({ amount, metadata }),
    setAIState() {},
    emitAIEvent() {},
    sensePlayer: () => ({ rawWorldLOS: true })
  };
}

test('last surviving healer turns its green signals red and detonates for 50% current HP', () => {
  const healer = makeHealer();
  const ctx = makeContext(healer);
  assert.ok(healer._signalMaterials.length > 0);

  healer.update(HEALER_LAST_SURVIVOR_BOMB.fuseSeconds, ctx);

  assert.equal(healer.root.userData.healerBombArmed, true);
  assert.ok(healer._signalMaterials.every(material => material.color.getHex() === 0xef233c));
  assert.equal(ctx.damage.length, 1);
  assert.equal(ctx.damage[0].amount, 80);
  assert.equal(ctx.damage[0].metadata.sourceKind, 'healer_last_survivor_bomb');
  assert.equal(ctx.damage[0].metadata.bypassArmor, true);
  assert.deepEqual(ctx.removed, [healer.root]);
});

test('healer remains a medic while another wave enemy is alive', () => {
  const healer = makeHealer();
  const ctx = makeContext(healer, { last: false });

  healer.update(0.1, ctx);

  assert.equal(healer.root.userData.healerBombArmed, undefined);
  assert.equal(ctx.damage.length, 0);
});

test('a retreating healer takes a tangential escape when world collision blocks its route', () => {
  const healer = makeHealer();
  healer.root.position.set(34.9, 0.8, -14.5);
  const attempts = [];
  const ctx = {
    moveWithCollisions(root, step) {
      attempts.push(step.clone());
      if (attempts.length === 1) {
        return { requestedDistance: step.length(), appliedDistance: 0, blockedBy: 'world' };
      }
      root.position.add(step);
      return { requestedDistance: step.length(), appliedDistance: step.length(), blockedBy: null };
    }
  };

  healer._moveToward(
    new THREE.Vector3(40, 0.8, -18),
    new THREE.Vector3(-10, 0.8, 9),
    0.1,
    ctx
  );

  assert.equal(attempts.length, 2);
  assert.ok(Math.abs(attempts[1].z) > 0.01, 'escape attempt should move along the blocker');
  assert.ok(healer._boundaryEscapeTimer > 0);
});
