import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponSystem } from '../src/weapons/system.js';
import { SMG } from '../src/weapons/smg.js';
import { Rifle } from '../src/weapons/rifle.js';
import { Progression } from '../src/progression.js';

function makeWeaponSystem() {
  return new WeaponSystem({ updateHUD: () => {} });
}

function setupLocalStorage() {
  const store = {};
  global.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
  return store;
}

function makeDoc() {
  return {
    getElementById() { return null; },
    createElement() { return { appendChild() {} }; }
  };
}

test('initial inventory starts pistol-only in the sidearm slot', () => {
  const ws = makeWeaponSystem();

  assert.deepEqual(ws.inventory.map(w => w.name), ['Pistol']);
  assert.equal(ws.currentIndex, 0);
  assert.equal(ws.current.name, 'Pistol');
});

test('wave 2 progression auto-equips SMG as first primary and preserves Pistol sidearm', () => {
  setupLocalStorage();
  const ws = makeWeaponSystem();
  const progression = new Progression({ weaponSystem: ws, documentRef: makeDoc(), onPause: () => {} });

  progression.onWave(2);

  assert.deepEqual(ws.inventory.map(w => w.name), ['SMG', 'Pistol']);
  assert.equal(ws.currentIndex, 0);
  assert.equal(ws.current.name, 'SMG');
  assert.equal(progression.unlocks.smg, true);
});

test('slot switching and swapPrimary preserve the sidearm', () => {
  const ws = makeWeaponSystem();

  ws.swapPrimary(() => new SMG());
  assert.deepEqual(ws.inventory.map(w => w.name), ['SMG', 'Pistol']);

  ws.switchSlot(2);
  assert.equal(ws.current.name, 'Pistol');
  ws.switchSlot(1);
  assert.equal(ws.current.name, 'SMG');
  assert.deepEqual(ws.inventory.map(w => w.name), ['SMG', 'Pistol']);
});

test('swapPrimary carries half old reserve into the new primary reserve', () => {
  const ws = makeWeaponSystem();
  ws.current.reserveAmmo = 41;

  const smg = ws.swapPrimary(() => new SMG());
  assert.equal(smg.getReserve(), 108 + Math.floor(41 * 0.5));
  assert.deepEqual(ws.inventory.map(w => w.name), ['SMG', 'Pistol']);

  smg.reserveAmmo = 25;
  const rifle = ws.swapPrimary(() => new Rifle());
  assert.equal(rifle.getReserve(), 64 + Math.floor(25 * 0.5));
  assert.deepEqual(ws.inventory.map(w => w.name), ['Rifle', 'Pistol']);
});
