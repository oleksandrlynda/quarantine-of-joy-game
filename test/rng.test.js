import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSeededRng, makeNamespacedRng, generateSeedString } from '../src/util/rng.js';

test('makeSeededRng returns deterministic sequence', () => {
  const rng1 = makeSeededRng('seed');
  const rng2 = makeSeededRng('seed');
  const seq1 = [rng1(), rng1(), rng1()];
  const seq2 = [rng2(), rng2(), rng2()];
  assert.deepStrictEqual(seq1, seq2);
});

test('rand.int and rand.range produce numbers in range', () => {
  const rng = makeSeededRng('seed');
  for (let i = 0; i < 10; i++) {
    const intVal = rng.int(1, 5);
    assert.ok(intVal >= 1 && intVal <= 5);
    const rangeVal = rng.range(10, 20);
    assert.ok(rangeVal >= 10 && rangeVal < 20);
  }
});

test('makeNamespacedRng combines seed and namespace', () => {
  const a = makeNamespacedRng('base', 'ns');
  const b = makeSeededRng('base:ns');
  assert.equal(a(), b());
});

test('generateSeedString returns expected alphabet and length', () => {
  const str = generateSeedString(12);
  assert.equal(str.length, 12);
  assert.match(str, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
});
