import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WAVE72_ENCOUNTER,
  expandWaveRoster,
  getSpecialWaveDefinition
} from '../src/enemies/wave-definitions.js';

test('Wave 73 definition commits the documented 165 enemies across four packages', () => {
  const initial = expandWaveRoster(WAVE72_ENCOUNTER.initialRoster);
  const reinforcement = expandWaveRoster(WAVE72_ENCOUNTER.reinforcementRoster);

  assert.equal(initial.length, 42);
  assert.equal(reinforcement.length, 41);
  assert.equal(initial.length + reinforcement.length * 3, 165);
  assert.equal(initial.filter(type => type === 'warden').length, 1);
  assert.equal(reinforcement.includes('warden'), false);
  assert.equal(initial.includes('shooter') || initial.includes('sniper'), false);
  assert.equal(reinforcement.includes('shooter') || reinforcement.includes('sniper'), false);
  assert.equal(WAVE72_ENCOUNTER.activeCap, 60);
  assert.deepEqual(WAVE72_ENCOUNTER.roleCaps, { tank: 6, flyer: 10, healer: 2 });
});

test('special wave lookup only selects the authored Wave 73 encounter', () => {
  assert.equal(getSpecialWaveDefinition(72), null);
  assert.equal(getSpecialWaveDefinition(73), WAVE72_ENCOUNTER);
  assert.equal(getSpecialWaveDefinition(74), null);
});
