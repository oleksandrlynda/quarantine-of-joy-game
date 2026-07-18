import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionEventAggregator } from '../src/debug/motion-event-aggregator.js';

test('disabled motion aggregation remains allocation-light and inert', () => {
  const motion = new MotionEventAggregator({ enabled: false });
  assert.equal(motion.observe(100, true, 1, 0, 1, 0, 0, 0, 0), false);
  assert.deepEqual(motion.getTotals(), {});
  assert.deepEqual(Object.keys(motion), ['enabled']);
});

test('movement batches preserve position, active time, wave, and score ranges', () => {
  const batches = [];
  const motion = new MotionEventAggregator({
    enabled: true,
    sampleIntervalMs: 100,
    movementThresholdMeters: 5,
    onBatch: batch => batches.push(batch)
  });
  motion.observe(0, true, 1, 0, 0, 0, 0, 0, 0);
  motion.observe(100, true, 1, 10, 3, 0, 0, 0, 0);
  motion.observe(200, true, 2, 20, 6, 0, 0, 0, 0);
  const batch = batches.find(item => item.metric === 'distanceMeters');
  assert.equal(batch.distanceMeters, 6);
  assert.equal(batch.displacementMeters, 6);
  assert.equal(batch.range.activeDurationMs, 200);
  assert.equal(batch.range.startWave, 1);
  assert.equal(batch.range.endWave, 2);
  assert.equal(batch.range.startScore, 10);
  assert.equal(batch.range.endScore, 20);
});

test('camera batches accumulate wrapped yaw changes without treating wraparound as a full spin', () => {
  const batches = [];
  const motion = new MotionEventAggregator({
    enabled: true,
    sampleIntervalMs: 16,
    cameraThresholdDegrees: 20,
    onBatch: batch => batches.push(batch)
  });
  motion.observe(0, true, 1, 0, 0, 0, 0, 170 * Math.PI / 180, 0);
  motion.observe(20, true, 1, 0, 0, 0, 0, -170 * Math.PI / 180, 0);
  const batch = batches.find(item => item.metric === 'cameraDegrees');
  assert.ok(batch.angularTravelDegrees >= 20 && batch.angularTravelDegrees < 21);
});

test('pause gaps and teleports do not inflate movement totals', () => {
  const motion = new MotionEventAggregator({ enabled: true, sampleIntervalMs: 16, teleportThresholdMeters: 10 });
  motion.observe(0, true, 1, 0, 0, 0, 0, 0, 0);
  motion.observe(20, true, 1, 0, 2, 0, 0, 0, 0);
  motion.observe(40, false, 1, 0, 2, 0, 0, 0, 0);
  motion.observe(5000, true, 1, 0, 100, 0, 0, 0, 0);
  motion.observe(5020, true, 1, 0, 101, 0, 0, 0, 0);
  assert.equal(motion.getTotals().distanceMeters, 3);
});
