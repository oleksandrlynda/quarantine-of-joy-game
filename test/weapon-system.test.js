import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponSystem } from '../src/weapons/system.js';
import { SMG } from '../src/weapons/smg.js';
import { Rifle } from '../src/weapons/rifle.js';
import { DMR } from '../src/weapons/dmr.js';
import { Minigun } from '../src/weapons/minigun.js';
import { BeamSaber } from '../src/weapons/beamsaber.js';
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

test('debug wave loadout contains guns only because Q abilities are not weapon slots', () => {
  const ws = makeWeaponSystem();

  ws.setDebugWaveLoadout();

  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Rifle', 'SMG', 'DMR', 'Pistol']);
  assert.equal(ws.currentIndex, 0);
  assert.equal(ws.current.name, 'Rifle');
  for (const weapon of ws.inventory) {
    assert.equal(weapon.getAmmo() > 0, true);
    assert.equal(weapon.getReserve() > 0, true);
  }
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

test('owned Grenade package preserves a dedicated Slot 3 when the first primary arrives', () => {
  const mutations = {
    isWeaponOwned: weapon => weapon === 'grenade',
    hasWeaponAccess: weapon => weapon === 'grenade',
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Pistol', 'Grenade']);
  ws.swapPrimary(() => new SMG());
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Pistol', 'Grenade']);
  assert.equal(ws.inventory[2].name, 'Grenade');
  ws.resetRunInventory();
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Pistol', 'Grenade']);
});

test('primary offers never replace an active Pistol or Grenade slot', () => {
  const mutations = {
    isWeaponOwned: weapon => weapon === 'grenade',
    hasWeaponAccess: weapon => weapon === 'grenade',
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  ws.swapPrimary(() => new SMG());
  ws.switchSlot(3);

  ws.swapPrimary(() => new Rifle());

  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Rifle', 'Pistol', 'Grenade']);
  assert.equal(ws.currentIndex, 0);
  assert.equal(ws.current.name, 'Rifle');
});

test('Grenade trial creates Slot 3 for one run but reset removes an unowned trial', () => {
  let trial = true;
  const mutations = {
    isWeaponOwned: () => false,
    hasWeaponAccess: weapon => weapon === 'grenade' && trial,
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  ws.swapPrimary(() => new SMG());
  assert.ok(ws.ensureGrenadeSlot());
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Pistol', 'Grenade']);
  trial = false;
  ws.resetRunInventory();
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Pistol']);
});

test('legacy Dynamite tactical state cannot create an active weapon slot', () => {
  const mutations = {
    getEquippedTactical: () => 'dynamite',
    isWeaponOwned: weapon => weapon === 'dynamite',
    hasWeaponAccess: weapon => weapon === 'dynamite',
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  ws.swapPrimary(() => new SMG());
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Pistol']);
  ws.resetRunInventory();
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Pistol']);
});

test('inventory changes notify the transient weapon picker', () => {
  let pickerCalls = 0;
  const ws = new WeaponSystem({
    updateHUD: () => {},
    onWeaponSwitch: () => { pickerCalls += 1; }
  });

  ws.swapPrimary(() => new SMG());
  ws.switchSlot(2);

  assert.equal(pickerCalls, 2);
});

test('ammo pickups report the scaled reserve amount shown in the pickup feed', () => {
  const ws = makeWeaponSystem();

  const gained = ws.onAmmoPickup(20);

  assert.equal(gained, 9);
  assert.equal(ws.current.getReserve(), 50 + 9);
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

test('successful reload emits one attributed achievement event', () => {
  const events = [];
  const ws = new WeaponSystem({
    updateHUD: () => {},
    achievements: { check: event => events.push(event) }
  });
  ws.current.ammoInMag = 0;

  ws.reload();
  ws.reload();

  assert.deepEqual(events, [{ type: 'reload', weapon: 'Pistol' }]);
});

test('Rifle and DMR right-click zoom requires its Archive optic unlock', () => {
  const zoomChanges = [];
  const unlocked = new Set();
  const ws = new WeaponSystem({
    updateHUD: () => {},
    setZoomMultiplier: value => zoomChanges.push(value),
    mutations: { isUnlocked: id => unlocked.has(id), discoverWeapon() {} }
  });

  ws.swapPrimary(() => new Rifle());
  assert.equal(ws.hasCurrentAltFire(), false);
  assert.equal(ws.triggerAltDown(), false);
  assert.deepEqual(zoomChanges, []);
  unlocked.add('rifle_focus');
  assert.equal(ws.hasCurrentAltFire(), true);
  ws.triggerAltDown();
  ws.triggerAltUp();
  ws.triggerAltDown();
  assert.deepEqual(zoomChanges, [1.5, 1]);

  ws.swapPrimary(() => new DMR());
  assert.equal(ws.hasCurrentAltFire(), false);
  assert.equal(ws.triggerAltDown(), false);
  unlocked.add('dmr_scope');
  assert.equal(ws.hasCurrentAltFire(), true);
  ws.triggerAltDown();
  ws.switchSlot(2);
  assert.deepEqual(zoomChanges, [1.5, 1, 3, 1]);
});

test('Minigun mastery expands both magazine and starting reserve', () => {
  let grade = 0;
  const mastery = {
    getMagazineSize(_weapon, base) { return grade === 3 ? 320 : base; },
    getMinigunReserveSize() { return grade === 3 ? 540 : 300; }
  };
  const minigun = new Minigun({ mastery });
  assert.equal(minigun.getAmmo(), 200);
  assert.equal(minigun.getReserve(), 300);
  grade = 3;
  minigun.reset();
  assert.equal(minigun.getAmmo(), 320);
  assert.equal(minigun.getReserve(), 540);
});

test('SMG mastery expands the magazine without changing reserve or adding alt fire', () => {
  let grade = 0;
  const mastery = {
    getMagazineSize(_weapon, base) { return grade === 3 ? 48 : base; }
  };
  const smg = new SMG({ mastery });
  assert.equal(smg.getAmmo(), 36);
  assert.equal(smg.getReserve(), 108);
  assert.equal(typeof smg.hasAltFire, 'undefined');

  grade = 3;
  smg.reset();
  assert.equal(smg.getAmmo(), 48);
  assert.equal(smg.getReserve(), 108);

  const ws = new WeaponSystem({ updateHUD: () => {} });
  ws.swapPrimary(() => smg);
  assert.equal(ws.hasCurrentAltFire(), false);
});

test('SMG and Rifle resolve their premium damage grades from mutation context', () => {
  const mutations = {
    getWeaponDamageMultiplier(weapon) { return weapon === 'SMG' ? 1.1 : 1.15; }
  };
  assert.equal(new SMG().getDamageMultiplier({ mutations }), 1.1);
  assert.equal(new Rifle().getDamageMultiplier({ mutations }), 1.15);
  assert.equal(new SMG().getDamageMultiplier({}), 1);
});

test('Beam Saber Grade I alternate performs two fast combo hits', async () => {
  const saber = new BeamSaber();
  const slashes = [];
  saber._slash = (_ctx, damage, heavy) => slashes.push({ damage, heavy });
  const ctx = {
    mutations: {
      getBeamSaberComboProfile: () => ({ enabled: true, firstDamage: 24, secondDamage: 28, delayMs: 0, lockoutMs: 700 })
    }
  };
  const originalNow = performance.now;
  performance.now = () => 1000;
  try {
    assert.equal(saber.hasAltFire(ctx), true);
    saber.altTriggerDown(ctx);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(slashes, [
      { damage: 24, heavy: false },
      { damage: 28, heavy: true }
    ]);
    assert.equal(saber._nextFireAtMs, 1700);
  } finally {
    saber.altTriggerCancel(ctx);
    performance.now = originalNow;
  }
});
