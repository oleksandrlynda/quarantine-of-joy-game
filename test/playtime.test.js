import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPlaytime, PLAYTIME_STORAGE_KEY, PlaytimeTracker } from '../src/game/playtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); }
  };
}

test('playtime formatting omits seconds and keeps long hour totals', () => {
  assert.equal(formatPlaytime(0), '0 minutes');
  assert.equal(formatPlaytime(30 * 60 + 59), '30 minutes');
  assert.equal(formatPlaytime(90 * 60), '1h 30 minutes');
  assert.equal(formatPlaytime(72 * 60 * 60), '72 hours');
});

test('playtime formatting handles singular units and Ukrainian plurals', () => {
  assert.equal(formatPlaytime(60), '1 minute');
  assert.equal(formatPlaytime(60 * 60), '1 hour');
  assert.equal(formatPlaytime(21 * 60, 'uk'), '21 хвилина');
  assert.equal(formatPlaytime((2 * 60 + 4) * 60, 'uk'), '2 години 4 хвилини');
  assert.equal(formatPlaytime(72 * 60 * 60, 'uk'), '72 години');
});

test('playtime tracker restores, accumulates, and periodically persists active time', () => {
  const storage = makeStorage({ [PLAYTIME_STORAGE_KEY]: '120' });
  const tracker = new PlaytimeTracker({ storage, saveIntervalSeconds: 10 });

  tracker.add(4);
  assert.equal(storage.store[PLAYTIME_STORAGE_KEY], '120');
  tracker.add(6);
  assert.equal(storage.store[PLAYTIME_STORAGE_KEY], '130');
  assert.equal(tracker.totalSeconds, 130);
});

test('playtime tracker ignores invalid or non-positive frame deltas', () => {
  const tracker = new PlaytimeTracker({ storage: makeStorage() });

  tracker.add(-1);
  tracker.add(Number.NaN);
  assert.equal(tracker.totalSeconds, 0);
});

test('the main menu exposes the localized persistent playtime value', () => {
  const html = read('index.html');
  const main = read('src/main.js');
  const en = JSON.parse(read('i18n/en.json'));
  const uk = JSON.parse(read('i18n/uk.json'));

  assert.match(html, /data-i18n="playtime\.label"[^>]*>Time played/);
  assert.match(html, /class="playtimeValue"/);
  assert.match(main, /!document\.body\.classList\.contains\('menu-open'\)/);
  assert.match(main, /window\.addEventListener\('pagehide', \(\) => playtimeTracker\.persist\(\)\)/);
  assert.equal(en['playtime.label'], 'Time played');
  assert.equal(uk['playtime.label'], 'Час у грі');
});
