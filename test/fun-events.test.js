import test from 'node:test';
import assert from 'node:assert/strict';
import { AlgorithmRoulette, EliminationSpectacle, StagecraftDeaths } from '../src/game/fun-events.js';

test('opt-in elimination spectacle fires confetti every tenth regular enemy', () => {
  const spectacle = new EliminationSpectacle();
  assert.equal(spectacle.recordElimination().count, 0);
  assert.equal(spectacle.recordElimination({ enabled: true, boss: true }).count, 0);
  assert.equal(spectacle.recordElimination({ enabled: true, tutorial: true }).count, 0);
  for (let count = 1; count < 10; count++) {
    assert.equal(spectacle.recordElimination({ enabled: true }).confetti, false);
  }
  assert.deepEqual(spectacle.recordElimination({ enabled: true }), { confetti: true, count: 10 });
  spectacle.reset();
  assert.equal(spectacle.eliminations, 0);
});

test('Algorithm Roulette resolves every seventh sky shot once per wave with grade-specific odds', () => {
  const rolls = [0.5, 0.52];
  const roulette = new AlgorithmRoulette({ rng: () => rolls.shift() });
  const base = { directionY: 0.9, hp: 80, maxHp: 100, weapon: 'Pistol' };

  for (let shot = 1; shot < 7; shot++) {
    const progress = roulette.tryShot({ ...base, wave: 1, grade: 1 });
    assert.equal(progress.triggered, false);
    assert.equal(progress.progress, shot);
  }
  assert.deepEqual(roulette.tryShot({ ...base, wave: 1, grade: 1 }), {
    triggered: true, counted: true, won: true, grade: 1, wave: 1, delta: 5, progress: 7, remaining: 0
  });
  assert.equal(roulette.tryShot({ ...base, wave: 1, grade: 1 }).counted, false);

  for (let shot = 1; shot < 7; shot++) roulette.tryShot({ ...base, wave: 2, grade: 2 });
  assert.deepEqual(roulette.tryShot({ ...base, wave: 2, grade: 2 }), {
    triggered: true, counted: true, won: false, grade: 2, wave: 2, delta: -6, progress: 7, remaining: 0
  });
});

test('Algorithm Roulette ignores unsafe, full-health, tutorial, saber, and non-upward shots', () => {
  const roulette = new AlgorithmRoulette({ rng: () => 0 });
  const base = { wave: 3, directionY: 0.9, hp: 80, maxHp: 100, weapon: 'Rifle', grade: 1 };

  assert.equal(roulette.tryShot({ ...base, grade: 0 }).counted, false);
  assert.equal(roulette.tryShot({ ...base, hp: 7 }).triggered, false);
  assert.equal(roulette.tryShot({ ...base, hp: 100 }).triggered, false);
  assert.equal(roulette.tryShot({ ...base, tutorial: true }).triggered, false);
  assert.equal(roulette.tryShot({ ...base, weapon: 'BeamSaber' }).triggered, false);
  assert.equal(roulette.tryShot({ ...base, directionY: 0.5 }).triggered, false);
  for (let shot = 1; shot < 7; shot++) assert.equal(roulette.tryShot(base).triggered, false);
  assert.equal(roulette.tryShot(base).triggered, true);
});

test('Opening Act triggers only on the first regular elimination of each wave', () => {
  const stagecraft = new StagecraftDeaths();
  const first = stagecraft.recordElimination({ wave: 2, openingGrade: 2, regularWave: true });
  assert.deepEqual(first, {
    triggered: true,
    style: 'opening_act',
    grade: 2,
    wave: 2,
    elimination: 1,
    staminaRestore: 0,
    comboHoldSeconds: 3
  });
  assert.equal(stagecraft.recordElimination({ wave: 2, openingGrade: 2, regularWave: true }).triggered, false);
  assert.equal(stagecraft.recordElimination({ wave: 3, openingGrade: 1, regularWave: true }).triggered, true);
  assert.equal(stagecraft.recordElimination({ wave: 5, openingGrade: 2, regularWave: false, boss: true }).triggered, false);
  assert.equal(stagecraft.recordElimination({ wave: 6, openingGrade: 2, regularWave: true, tutorial: true }).triggered, false);
});

test('Final Cut takes priority on the last regular enemy and Grade II restores stamina', () => {
  const stagecraft = new StagecraftDeaths();
  const final = stagecraft.recordElimination({
    wave: 4,
    openingGrade: 2,
    finalGrade: 2,
    lastEnemy: true,
    regularWave: true
  });
  assert.deepEqual(final, {
    triggered: true,
    style: 'final_cut',
    grade: 2,
    wave: 4,
    elimination: 1,
    staminaRestore: 10,
    comboHoldSeconds: 0
  });
  stagecraft.reset();
  assert.equal(stagecraft.wave, null);
  assert.equal(stagecraft.eliminations, 0);
  const gradeOne = stagecraft.recordElimination({ wave: 7, finalGrade: 1, lastEnemy: true, regularWave: true });
  assert.equal(gradeOne.style, 'final_cut');
  assert.equal(gradeOne.staminaRestore, 0);
});
