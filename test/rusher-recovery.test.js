import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldClearRusherChargeLane } from '../src/enemies/rusher.js';

test('rusher clears an ally charge lane only while direct locomotion is valid', () => {
  const blockerRoot = {};
  const corridor = { clear: false, blockerRoot };
  assert.equal(shouldClearRusherChargeLane({
    hasLOS: true,
    locomotionClear: true,
    isStuck: false,
    chargeCorridor: corridor
  }), true);
  assert.equal(shouldClearRusherChargeLane({
    hasLOS: true,
    locomotionClear: false,
    isStuck: true,
    chargeCorridor: corridor
  }), false, 'world-blocked rushers must stay in routing recovery');
  assert.equal(shouldClearRusherChargeLane({
    hasLOS: false,
    locomotionClear: true,
    isStuck: false,
    chargeCorridor: corridor
  }), false);
});

