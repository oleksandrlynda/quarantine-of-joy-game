import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/session.js';
import { combatKillScore, applyCombatScoring } from '../src/game/combat-scoring.js';

test('combatKillScore applies body/head base scores and combo multiplier', () => {
  assert.equal(combatKillScore({ isHead: false, multiplier: 1.5 }), 150);
  assert.equal(combatKillScore({ isHead: true, multiplier: 2 }), 300);
  assert.equal(combatKillScore({ isHead: false, multiplier: 1.25, bodyScore: 120 }), 150);
});

test('killing blows add score and one combo action through GameSession', () => {
  const session = new GameSession();

  const result = applyCombatScoring({ killed: true, isHead: true, multiplier: 2 }, { session });

  assert.deepEqual(result, { killed: true, points: 300, comboPoints: 1 });
  assert.equal(session.score, 300);
  assert.equal(session.combo.streakPoints, 1);
});

test('non-lethal hits add combo pressure without awarding score', () => {
  const session = new GameSession();

  const result = applyCombatScoring({ killed: false }, { session });

  assert.deepEqual(result, { killed: false, points: 0, comboPoints: 0.25 });
  assert.equal(session.score, 0);
  assert.equal(session.combo.streakPoints, 0.25);
});

test('combat scoring supports weapon-specific base score and combo awards', () => {
  const session = new GameSession();

  const result = applyCombatScoring({
    killed: true,
    isHead: false,
    multiplier: 1.25,
    bodyScore: 120,
    comboPoints: 0.75
  }, { session });

  assert.deepEqual(result, { killed: true, points: 150, comboPoints: 0.75 });
  assert.equal(session.score, 150);
  assert.equal(session.combo.streakPoints, 0.75);
});
