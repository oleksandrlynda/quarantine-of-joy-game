import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayEventAggregator } from '../src/debug/gameplay-event-aggregator.js';

test('disabled gameplay aggregation is inert', () => {
  const aggregator = new GameplayEventAggregator({ enabled: false });
  assert.equal(aggregator.record('shots', 1000, 10, 1, 0), null);
  assert.deepEqual(aggregator.getTotals(), {});
});

test('high-frequency activity emits one threshold batch with its gameplay range', () => {
  const emitted = [];
  const aggregator = new GameplayEventAggregator({
    enabled: true,
    thresholds: { shots: 3 },
    onBatch: batch => emitted.push(batch)
  });
  aggregator.record('shots', 1, 100, 1, 0);
  aggregator.record('shots', 1, 250, 1, 10);
  const batch = aggregator.record('shots', 1, 500, 2, 30);
  assert.equal(emitted.length, 1);
  assert.equal(batch.count, 3);
  assert.equal(batch.total, 3);
  assert.deepEqual(batch.range, {
    startedAtMs: 100,
    endedAtMs: 500,
    durationMs: 400,
    startWave: 1,
    endWave: 2,
    startScore: 0,
    endScore: 30
  });
});

test('particle bursts aggregate by emitted particle count rather than effect calls', () => {
  const aggregator = new GameplayEventAggregator({ enabled: true, thresholds: { particles: 1000 } });
  for (let i = 0; i < 12; i++) assert.equal(aggregator.record('particles', 80, i * 10, 1, 0), null);
  const batch = aggregator.record('particles', 80, 120, 1, 0);
  assert.equal(batch.count, 1040);
  assert.equal(aggregator.getTotals().particles, 1040);
});

test('reset starts a fresh run without carrying partial batches', () => {
  const aggregator = new GameplayEventAggregator({ enabled: true, thresholds: { kills: 2 } });
  aggregator.record('kills', 1, 10, 1, 100);
  aggregator.reset();
  assert.equal(aggregator.record('kills', 1, 20, 1, 100), null);
  assert.deepEqual(aggregator.getTotals(), { kills: 1 });
});

test('optional details are aggregated into a bounded batch breakdown', () => {
  const aggregator = new GameplayEventAggregator({ enabled: true, thresholds: { enemies: 3 } });
  aggregator.record('enemies', 1, 0, 5, 0, 'broodling');
  aggregator.record('enemies', 1, 10, 5, 0, 'flyer');
  const batch = aggregator.record('enemies', 1, 20, 5, 0, 'broodling');
  assert.deepEqual(batch.breakdown, { broodling: 2, flyer: 1 });
});
