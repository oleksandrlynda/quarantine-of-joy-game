import test from 'node:test';
import assert from 'node:assert/strict';
import { getJSON, getNumber, setJSON, setMaxNumber, setNumber } from '../src/util/storage.js';
import { Progression } from '../src/progression.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
}

function makeThrowingStorage() {
  return {
    getItem() { throw new Error('get failed'); },
    setItem() { throw new Error('set failed'); }
  };
}

function makeDoc() {
  return {
    getElementById() { return null; },
    createElement() { return { appendChild() {} }; }
  };
}

test('missing keys return numeric and JSON defaults', () => {
  const storage = makeStorage();

  assert.equal(getNumber('missing-number', 7, storage), 7);
  assert.deepEqual(getJSON('missing-json', { enabled: true }, storage), { enabled: true });
});

test('invalid numbers and invalid JSON return defaults', () => {
  const storage = makeStorage({ n: 'not-a-number', j: '{broken' });

  assert.equal(getNumber('n', 3, storage), 3);
  assert.deepEqual(getJSON('j', ['fallback'], storage), ['fallback']);
});

test('storage exceptions are caught and do not crash callers', () => {
  const storage = makeThrowingStorage();

  assert.equal(getNumber('n', 5, storage), 5);
  assert.deepEqual(getJSON('j', { safe: true }, storage), { safe: true });
  assert.equal(setNumber('n', 1, storage), false);
  assert.equal(setJSON('j', { safe: true }, storage), false);
});

test('best score storage only increases when higher values are submitted', () => {
  const storage = makeStorage({ best: '100' });

  assert.equal(setMaxNumber('best', 80, 0, storage), 100);
  assert.equal(storage.store.best, '100');
  assert.equal(setMaxNumber('best', 120, 0, storage), 120);
  assert.equal(storage.store.best, '120');
});

test('progression unlock JSON merges with default unlock shape', () => {
  const storage = makeStorage({ bs3d_unlocks: JSON.stringify({ bestWave: 4, smg: true }) });
  global.localStorage = storage;

  const progression = new Progression({
    weaponSystem: { getUnlockedPrimaries: () => [], swapPrimary: () => {} },
    documentRef: makeDoc(),
    onPause: () => {}
  });

  assert.deepEqual(progression.unlocks, {
    bestWave: 4,
    smg: true,
    shotgun: false,
    rifle: false,
    dmr: false,
    beamsaber: false,
    minigun: false
  });
});
