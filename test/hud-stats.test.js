import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayerHudStats } from '../src/game/hud-stats.js';

test('HUD stats expose current and enhanced capacities after a mutation rank', () => {
  const session = { hp: 84, maxHp: 102, armor: 2, maxArmor: 2 };
  const player = { stamina: 103, staminaMax: 103 };

  assert.deepEqual(getPlayerHudStats(session, player), {
    hp: 84,
    maxHp: 102,
    armor: 2,
    maxArmor: 2,
    stamina: 103,
    maxStamina: 103,
    stamina01: 1
  });
});

test('HUD stats clamp invalid and over-capacity runtime values', () => {
  const session = { hp: 140, maxHp: 120, armor: -3, maxArmor: 4 };
  const player = { stamina: 150, staminaMax: 130 };

  assert.deepEqual(getPlayerHudStats(session, player), {
    hp: 120,
    maxHp: 120,
    armor: 0,
    maxArmor: 4,
    stamina: 130,
    maxStamina: 130,
    stamina01: 1
  });
});
