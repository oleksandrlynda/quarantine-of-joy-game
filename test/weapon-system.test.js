import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponSystem } from '../src/weapons/system.js';
import { SMG } from '../src/weapons/smg.js';
import { Rifle } from '../src/weapons/rifle.js';
import { DMR } from '../src/weapons/dmr.js';
import { Minigun } from '../src/weapons/minigun.js';
import { Shotgun } from '../src/weapons/shotgun.js';
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

test('Armory offers exclude revealed or trial classified primaries until they are owned', () => {
  const owned = new Set();
  const mutations = {
    isWeaponClassified: weapon => ['rifle', 'dmr'].includes(weapon),
    isWeaponOwned: weapon => owned.has(weapon),
    hasWeaponAccess: () => true
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  const unlocks = { rifle: true, dmr: true, smg: true };

  assert.deepEqual(ws.getUnlockedPrimaries(unlocks).map(choice => choice.name), ['SMG']);

  owned.add('rifle');
  assert.deepEqual(ws.getUnlockedPrimaries(unlocks).map(choice => choice.name), ['Rifle', 'SMG']);
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

test('Backup Broadcast puts SMG in Slot 2 and Wave 2 grants a Shotgun primary', () => {
  setupLocalStorage();
  const ws = makeWeaponSystem();
  const smg = ws.replaceSecondaryWithSMG();
  const progression = new Progression({ weaponSystem: ws, documentRef: makeDoc(), onPause: () => {} });

  assert.equal(smg.name, 'SMG');
  assert.equal(ws.hasPrimaryWeapon(), false);
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG']);

  progression.onWave(2);

  assert.equal(ws.hasPrimaryWeapon(), true);
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Shotgun', 'SMG']);
  assert.equal(ws.currentIndex, 0);
  assert.equal(ws.current.name, 'Shotgun');

  ws.resetRunInventory();
  assert.equal(ws.hasPrimaryWeapon(), false);
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Pistol']);
});

test('wave progression repairs an older best-wave save and still grants the Wave 2 SMG', () => {
  const store = setupLocalStorage();
  store.bs3d_unlocks = JSON.stringify({ bestWave: 5 });
  const ws = makeWeaponSystem();
  const progression = new Progression({ weaponSystem: ws, documentRef: makeDoc(), onPause: () => {} });

  progression.onWave(1);
  progression.onWave(2);

  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Pistol']);
  assert.equal(progression.unlocks.smg, true);
  assert.equal(progression.unlocks.shotgun, true);
  assert.equal(progression.unlocks.minigun, true);
  assert.equal(progression.unlocks.beamsaber, true);
  assert.equal(JSON.parse(store.bs3d_unlocks).smg, true);
});

test('Wave 2 grants the SMG in a debug playtest without saving campaign progress', () => {
  const store = setupLocalStorage();
  const ws = makeWeaponSystem();
  const mutations = { getRunState: () => ({ tutorial: false, debug: true }), onWaveStarted() {} };
  const progression = new Progression({
    weaponSystem: ws,
    documentRef: makeDoc(),
    onPause: () => {},
    mutations
  });

  progression.onWave(2);

  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Pistol']);
  assert.equal(progression.unlocks.bestWave, 0);
  assert.equal(store.bs3d_unlocks, undefined);
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

test('Backup Broadcast preserves an owned tactical Slot 3 package', () => {
  setupLocalStorage();
  const mutations = {
    isWeaponOwned: weapon => weapon === 'grenade',
    hasWeaponAccess: weapon => weapon === 'grenade',
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  const progression = new Progression({ weaponSystem: ws, documentRef: makeDoc(), onPause: () => {} });

  ws.replaceSecondaryWithSMG();
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['SMG', 'Grenade']);
  progression.onWave(2);
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Shotgun', 'SMG', 'Grenade']);
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

test('chapter checkpoint restores the earned weapon and tactical layout at full ammo', () => {
  const mutations = {
    hasWeaponAccess: () => true,
    isWeaponOwned: weapon => weapon === 'grenade',
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  ws.swapPrimary(() => new Shotgun());
  ws.ensureGrenadeSlot();
  ws.switchSlot(2);
  const checkpoint = ws.exportCheckpointState();
  ws.inventory[0].ammoInMag = 0;

  ws.resetRunInventory();
  assert.equal(ws.restoreCheckpointState(checkpoint), true);
  assert.deepEqual(ws.inventory.map(weapon => weapon.name), ['Shotgun', 'Pistol', 'Grenade']);
  assert.equal(ws.current.name, 'Pistol');
  assert.equal(ws.inventory[0].getAmmo() > 0, true);
});

test('legacy post-campaign fallback respects classified ownership', () => {
  const unowned = new WeaponSystem({
    updateHUD: () => {},
    mutations: { isWeaponOwned: () => false, discoverWeapon() {} }
  });
  unowned.setPostCampaignLoadout();
  assert.deepEqual(unowned.inventory.map(weapon => weapon.name), ['SMG', 'Pistol']);

  const owned = new WeaponSystem({
    updateHUD: () => {},
    mutations: { isWeaponOwned: weapon => weapon === 'rifle', discoverWeapon() {} }
  });
  owned.setPostCampaignLoadout();
  assert.deepEqual(owned.inventory.map(weapon => weapon.name), ['Rifle', 'SMG', 'Pistol']);
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
  ws.current.reserveAmmo = 45;

  const gained = ws.onAmmoPickup(20);

  assert.equal(gained, 5);
  assert.equal(ws.current.getReserve(), 50);
  assert.equal(ws.onAmmoPickup(20), 0, 'a full reserve rejects excess pickup ammo');
});

test('swapPrimary never carries ammo beyond the new primary reserve limit', () => {
  const ws = makeWeaponSystem();
  ws.current.reserveAmmo = 41;

  const smg = ws.swapPrimary(() => new SMG());
  assert.equal(smg.getReserve(), 108);
  assert.deepEqual(ws.inventory.map(w => w.name), ['SMG', 'Pistol']);

  smg.reserveAmmo = 25;
  const rifle = ws.swapPrimary(() => new Rifle());
  assert.equal(rifle.getReserve(), 64);
  assert.deepEqual(ws.inventory.map(w => w.name), ['Rifle', 'Pistol']);
});

test('Background Sync regenerates exactly 5% of base reserve per ten seconds', () => {
  const mutations = {
    getRank: id => id === 'background_sync' ? 1 : 0,
    getReserveLimit: (base, specific) => specific,
    discoverWeapon() {}
  };
  const cases = [
    [SMG, 32],
    [Rifle, 19],
    [Shotgun, 7],
    [DMR, 10],
    [Minigun, 108]
  ];

  for (const [WeaponType, expectedMinute] of cases) {
    const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
    const weapon = ws.swapPrimary(() => new WeaponType());
    weapon.ammoInMag = 0;
    weapon.reserveAmmo = 0;
    ws.update(9.99);
    assert.equal(weapon.getReserve(), 0, `${weapon.name} waits for the full interval`);
    ws.update(0.01);
    ws.update(50);
    assert.equal(weapon.getReserve(), expectedMinute, `${weapon.name} one-minute regeneration`);
  }
});

test('Deep Reserves adds 30% of base reserve per run rank without boosting regen', () => {
  let rank = 4;
  const mutations = {
    getRank: id => id === 'background_sync' ? 1 : (id === 'deep_reserves' ? rank : 0),
    getReserveLimit: (base, specific) => specific + Math.floor(base * 0.3 * rank),
    discoverWeapon() {}
  };
  const ws = new WeaponSystem({ updateHUD: () => {}, mutations });
  const smg = ws.swapPrimary(() => new SMG());

  assert.equal(smg.getReserveCapacity(), 237);
  assert.equal(smg.getReserve(), 237);
  smg.ammoInMag = 0;
  smg.reserveAmmo = 0;
  ws.update(60);
  assert.equal(smg.getReserve(), 32, 'regen remains floor(108 * 30%) after one minute');

  rank = 0;
  assert.equal(smg.getReserveCapacity(), 108);
  assert.equal(smg.addReserve(999), 76);
  assert.equal(smg.getReserve(), 108);
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
    getMinigunReserveSize() { return grade === 3 ? 660 : 360; }
  };
  const minigun = new Minigun({ mastery });
  assert.equal(minigun.getAmmo(), 200);
  assert.equal(minigun.getReserve(), 360);
  grade = 3;
  minigun.reset();
  assert.equal(minigun.getAmmo(), 320);
  assert.equal(minigun.getReserve(), 660);
});

test('Minigun ammo pickups use the four-times heavy-weapon multiplier', () => {
  const ws = makeWeaponSystem();
  const minigun = ws.swapPrimary(() => new Minigun());
  minigun.reserveAmmo = 0;

  assert.equal(ws.onAmmoPickup(20), 80);
  assert.equal(minigun.getReserve(), 80);
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
