import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/session.js';

function makeWeaponSystem({ ammo = 0, reserve = 0, includePistol = true } = {}) {
  const calls = { ammoPickup: [], reset: 0 };
  const inventory = [];
  if (includePistol) inventory.push({ name: 'Pistol', getAmmo: () => 99, getReserve: () => 99 });
  inventory.push({ name: 'Rifle', getAmmo: () => ammo, getReserve: () => reserve });
  return {
    calls,
    inventory,
    onAmmoPickup(amount) { calls.ammoPickup.push(amount); },
    reset() { calls.reset += 1; }
  };
}

test('damage reduces HP and sets gameOver at 0', () => {
  let gameOverCalls = 0;
  const session = new GameSession({ onGameOver: () => { gameOverCalls += 1; } });

  const first = session.damage(35);
  assert.equal(first.hp, 65);
  assert.equal(first.gameOver, false);
  assert.equal(session.gameOver, false);

  const lethal = session.damage(100);
  assert.equal(lethal.hp, 0);
  assert.equal(lethal.gameOver, true);
  assert.equal(lethal.died, true);
  assert.equal(session.gameOver, true);
  assert.equal(gameOverCalls, 1);
});

test('armor absorbs damage before HP and reports the split', () => {
  const session = new GameSession();
  session.addArmorCapacity(20);
  const hit = session.damage(30);
  assert.equal(hit.armorAbsorbed, 20);
  assert.equal(hit.hpDamage, 10);
  assert.equal(hit.armor, 0);
  assert.equal(hit.hp, 90);
  session.repairArmor();
  assert.equal(session.armor, 20);
});

test('explicit percentage hazards can bypass armor and damage HP directly', () => {
  const session = new GameSession();
  session.addArmorCapacity(20);
  const hit = session.damage(50, { bypassArmor: true });
  assert.equal(hit.armorAbsorbed, 0);
  assert.equal(hit.hpDamage, 50);
  assert.equal(hit.armor, 20);
  assert.equal(hit.hp, 50);
});

test('direct health adjustments bypass armor and respect health bounds', () => {
  const session = new GameSession();
  session.addArmorCapacity(20);
  session.hp = 80;
  assert.deepEqual(session.adjustHealth(5), { before: 80, hp: 85, amount: 5 });
  assert.deepEqual(session.adjustHealth(-7, { minimum: 1 }), { before: 85, hp: 78, amount: -7 });
  assert.equal(session.armor, 20);
  assert.deepEqual(session.adjustHealth(999), { before: 78, hp: 100, amount: 22 });
});

test('run stat mutations reset to base values', () => {
  const session = new GameSession();
  const player = {
    baseStaminaMax: 100,
    staminaMax: 115,
    stamina: 12,
    resetStaminaCapacity() { this.staminaMax = this.baseStaminaMax; this.stamina = this.staminaMax; }
  };
  session.addMaxHp(20);
  session.addArmorCapacity(20);
  session.damage(15);
  session.reset({ player });
  assert.equal(session.maxHp, 100);
  assert.equal(session.hp, 100);
  assert.equal(session.maxArmor, 0);
  assert.equal(session.armor, 0);
  assert.equal(player.staminaMax, 100);
  assert.equal(player.stamina, 100);
});

test('chapter checkpoint restores build capacities and score with full resources', () => {
  const session = new GameSession();
  session.addMaxHp(20);
  session.addArmorCapacity(12);
  session.addScore(875);
  session.damage(37);
  const checkpoint = session.exportCheckpointState();

  session.reset();
  assert.equal(session.restoreCheckpointState(checkpoint), true);
  assert.equal(session.maxHp, 120);
  assert.equal(session.hp, 120);
  assert.equal(session.maxArmor, 12);
  assert.equal(session.armor, 12);
  assert.equal(session.score, 875);
});

test('reset restores HP, score, combo, stamina-facing hooks, and game-over flag', () => {
  const session = new GameSession();
  const weaponSystem = makeWeaponSystem();
  const player = { stamina: 4, staminaMax: 100 };
  let fatigue = null;
  let breathStops = 0;

  session.damage(100);
  session.addScore(250);
  session.addComboAction(9);
  assert.equal(session.gameOver, true);
  assert.equal(session.combo.tier, 3);

  session.reset({
    weaponSystem,
    player,
    effects: { setFatigue(v) { fatigue = v; } },
    sfx: { stopBreath() { breathStops += 1; } }
  });

  assert.equal(session.hp, 100);
  assert.equal(session.score, 0);
  assert.equal(session.gameOver, false);
  assert.deepEqual(session.combo, { tier: 0, multiplier: 1.0, streakPoints: 0, decayTimer: 0 });
  assert.equal(player.stamina, 100);
  assert.equal(fatigue, 0);
  assert.equal(breathStops, 1);
  assert.equal(weaponSystem.calls.reset, 1);
});

test('pickup application clamps medkits to 100 HP and routes ammo to weapon system', () => {
  const session = new GameSession();
  const weaponSystem = makeWeaponSystem();
  let medStoryCalls = 0;
  const uiCalls = [];

  session.damage(15);
  session.applyPickup('med', 50, {
    story: { onFirstMedPickup() { medStoryCalls += 1; } },
    sfx: { ui(name) { uiCalls.push(name); } }
  });
  assert.equal(session.hp, 100);
  assert.equal(medStoryCalls, 1);
  assert.deepEqual(uiCalls, ['pickup']);

  session.applyPickup('ammo', 23, { weaponSystem });
  assert.deepEqual(weaponSystem.calls.ammoPickup, [23]);
});

test('wave start resets pickups, records counts, and triggers injected hooks', () => {
  const session = new GameSession();
  const calls = [];
  const objects = [{ id: 'crate' }];

  const startingAlive = session.onWaveStart(3, 7, {
    pickups: { onWave(wave) { calls.push(['pickups', wave]); } },
    weather: { onWave() { calls.push(['weather']); } },
    player: { refreshColliders(objs) { calls.push(['player', objs]); } },
    objects,
    progression: { onWave(wave) { calls.push(['progression', wave]); } },
    story: { onWave(wave) { calls.push(['story', wave]); } }
  });

  assert.equal(startingAlive, 7);
  assert.equal(session.waveStartingAlive, 7);
  assert.deepEqual(calls, [
    ['pickups', 3],
    ['weather'],
    ['player', objects],
    ['progression', 3],
    ['story', 3]
  ]);
});

test('emergency ammo appears when non-pistol ammo is empty regardless of distant loose pickups', () => {
  const session = new GameSession({ emergencyAmmoCooldown: 22 });
  const pickups = { active: new Set([{ userData: { type: 'ammo' } }]) };
  const emptyWeapons = makeWeaponSystem({ ammo: 0, reserve: 0 });

  const first = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups, gameTime: 0 });
  assert.deepEqual(first, [
    { x: 0, y: 0, z: 0 },
    { x: 0.9, y: 0, z: 0 },
    { x: -0.9, y: 0, z: 0 }
  ]);

  const tooSoon = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups, gameTime: 10 });
  assert.deepEqual(tooSoon, []);

  const hasAmmo = makeWeaponSystem({ ammo: 1, reserve: 0 });
  const weaponAmmoBlocks = session.getEmergencyAmmoDrops({ weaponSystem: hasAmmo, pickups, gameTime: 23 });
  assert.deepEqual(weaponAmmoBlocks, []);

  const distantMapAmmo = { active: new Set([{ userData: { type: 'ammo' } }, { userData: { type: 'ammo' } }]) };
  const distantPickupsDoNotBlock = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups: distantMapAmmo, gameTime: 23 });
  assert.equal(distantPickupsDoNotBlock.length, 3);

  const secondCooldown = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups, gameTime: 44 });
  assert.deepEqual(secondCooldown, []);

  const afterCooldown = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups, gameTime: 45 });
  assert.equal(afterCooldown.length, 3);
});

test('emergency ammo cooldown is committed only after the crate spawn succeeds', () => {
  const session = new GameSession({ emergencyAmmoCooldown: 22 });
  const emptyWeapons = makeWeaponSystem({ ammo: 0, reserve: 0 });

  assert.equal(session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, gameTime: 5, commit: false }).length, 3);
  assert.equal(session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, gameTime: 6, commit: false }).length, 3);

  session.markEmergencyAmmoDrop(6);
  assert.deepEqual(session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, gameTime: 7, commit: false }), []);
  assert.equal(session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, gameTime: 28, commit: false }).length, 3);
});
