import test from 'node:test';
import assert from 'node:assert/strict';
import { sortArchiveItemsByCost } from '../src/archive-order.js';

test('Archive items are sorted from lowest purchase cost to highest', () => {
  const items = [
    { id: 'dynamite', cost: 28 },
    { id: 'gravity_well', cost: 55 },
    { id: 'satellite_strike', cost: 42 },
    { id: 'punchline_rush', cost: 10 }
  ];

  assert.deepEqual(
    sortArchiveItemsByCost(items).map(item => item.id),
    ['punchline_rush', 'dynamite', 'satellite_strike', 'gravity_well']
  );
  assert.equal(items[0].id, 'dynamite', 'sorting must not mutate frozen definition order');
});

test('Archive items without a remaining price are placed after purchasable items', () => {
  const items = [
    { id: 'maxed', nextCost: null },
    { id: 'premium', nextCost: 40 },
    { id: 'standard', nextCost: 15 },
    { id: 'owned', nextCost: undefined }
  ];

  assert.deepEqual(
    sortArchiveItemsByCost(items, item => item.nextCost).map(item => item.id),
    ['standard', 'premium', 'maxed', 'owned']
  );
});
