import test from 'node:test';
import assert from 'node:assert/strict';
import { Weapon } from '../src/weapons/base.js';

test('tryFire reduces ammo and respects fire delay', () => {
  const w = new Weapon({ mode: 'semi', fireDelayMs: 100, magSize: 2, reserve: 0 });
  const achievementEvents = [];
  let viewCycles = 0;
  const ctx = {
    achievements: { check: event => achievementEvents.push(event) },
    weaponView: { onFire: () => { viewCycles += 1; } }
  };
  const origNow = performance.now;
  let now = 0;
  performance.now = () => now;
  try {
    assert.equal(w.getAmmo(), 2);
    assert.ok(w.tryFire(ctx));
    assert.equal(w.getAmmo(), 1);

    now = 50;
    assert.equal(w.tryFire(ctx), false, 'cannot fire during cooldown');
    now = 100;
    assert.ok(w.tryFire(ctx), 'fires after cooldown');

    assert.equal(w.getAmmo(), 0);
    now = 200;
    assert.equal(w.tryFire(ctx), false, 'cannot fire with empty mag');
    assert.deepEqual(achievementEvents.map(event => ({ type: event.type, weapon: event.weapon, magazineRemaining: event.magazineRemaining })), [
      { type: 'shot', weapon: 'Weapon', magazineRemaining: 1 },
      { type: 'shot', weapon: 'Weapon', magazineRemaining: 0 }
    ]);
    assert.notEqual(achievementEvents[0].attackId, achievementEvents[1].attackId);
    assert.equal(viewCycles, 2, 'each accepted shot cycles the equipped viewmodel action');
  } finally {
    performance.now = origNow;
  }
});

test('reload fills magazine from reserve', () => {
  const w = new Weapon({ mode: 'semi', fireDelayMs: 0, magSize: 3, reserve: 5 });
  w.ammoInMag = 1; // simulate two shots fired
  let played = false;
  const reloaded = w.reload(() => { played = true; });
  assert.ok(reloaded);
  assert.equal(w.getAmmo(), 3);
  assert.equal(w.getReserve(), 3);
  assert.ok(played, 'sound callback invoked');

  assert.equal(w.reload(), false, 'cannot reload when mag full');
  w.ammoInMag = 0;
  w.reserveAmmo = 0;
  assert.equal(w.reload(), false, 'cannot reload without reserve');
});

test('addReserve increases reserve and reset restores counts', () => {
  const w = new Weapon({ mode: 'semi', fireDelayMs: 0, magSize: 5, reserve: 10 });
  w.addReserve(5);
  assert.equal(w.getReserve(), 15);
  w.addReserve(-3);
  assert.equal(w.getReserve(), 15, 'negative amounts ignored');

  w.ammoInMag = 2;
  w.reserveAmmo = 7;
  w.reset();
  assert.equal(w.getAmmo(), 5);
  assert.equal(w.getReserve(), 10);
});

test('reset resolves dynamic magazine and reserve capacities', () => {
  let grade = 0;
  const w = new Weapon({
    mode: 'semi',
    fireDelayMs: 0,
    magSize: 5,
    reserve: 10,
    getMagSize: () => grade === 1 ? 7 : 5,
    getReserveSize: () => grade === 1 ? 20 : 10
  });
  assert.equal(w.getAmmo(), 5);
  assert.equal(w.getReserve(), 10);
  grade = 1;
  w.reset();
  assert.equal(w.getAmmo(), 7);
  assert.equal(w.getReserve(), 20);
});

