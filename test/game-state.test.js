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

test('emergency ammo only appears with no non-pistol ammo, at most one map ammo, and elapsed cooldown', () => {
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

  const tooManyMapAmmo = { active: new Set([{ userData: { type: 'ammo' } }, { userData: { type: 'ammo' } }]) };
  const mapAmmoBlocks = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups: tooManyMapAmmo, gameTime: 23 });
  assert.deepEqual(mapAmmoBlocks, []);

  const afterCooldown = session.getEmergencyAmmoDrops({ weaponSystem: emptyWeapons, pickups, gameTime: 23 });
  assert.equal(afterCooldown.length, 3);
});
