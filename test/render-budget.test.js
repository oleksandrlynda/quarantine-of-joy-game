import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTIVE_DPR_MAX,
  createDprBudget,
  nextAdaptiveDpr,
  scheduleCappedFrame,
  shouldPrewarmShaders,
  TARGET_FRAME_MS
} from '../src/game/render-budget.js';

test('adaptive DPR starts below expensive native density and remains bounded', () => {
  assert.deepEqual(createDprBudget(2, true), {
    min: 0.8,
    max: ADAPTIVE_DPR_MAX,
    initial: 1.25
  });
  assert.deepEqual(createDprBudget(1, true), { min: 0.8, max: 1, initial: 1 });
});

test('explicit non-adaptive quality preserves native DPR up to the legacy cap', () => {
  assert.deepEqual(createDprBudget(3, false), { min: 0.8, max: 2, initial: 2 });
});

test('adaptive DPR reacts asymmetrically and never escapes its budget', () => {
  const budget = { min: 0.8, max: 1.5 };
  assert.equal(nextAdaptiveDpr(1.25, 20, budget), 1.15);
  assert.equal(nextAdaptiveDpr(1.25, 16, budget), 1.3);
  assert.equal(nextAdaptiveDpr(0.8, 30, budget), 0.8);
  assert.equal(nextAdaptiveDpr(1.5, 10, budget), 1.5);
});

test('60 FPS cap carries refresh remainder instead of settling below target', () => {
  let lastScheduledAt = 0;
  const renderedAt = [];
  const rafMs = 1000 / 144;

  for (let frame = 1; frame <= 144; frame++) {
    const now = frame * rafMs;
    const result = scheduleCappedFrame(now, lastScheduledAt, TARGET_FRAME_MS);
    if (result.shouldRender) {
      renderedAt.push(now);
      lastScheduledAt = result.lastScheduledAt;
    }
  }

  assert.ok(renderedAt.length >= 59 && renderedAt.length <= 60, `rendered ${renderedAt.length} frames`);
  assert.ok(Math.abs(lastScheduledAt - 1000) < TARGET_FRAME_MS);
});

test('60 FPS cap accepts normal early RAF jitter instead of creating 33 ms frames', () => {
  let lastScheduledAt = 0;
  let rendered = 0;
  const slightlyEarlyRafMs = 16.4;

  for (let frame = 1; frame <= 60; frame++) {
    const result = scheduleCappedFrame(frame * slightlyEarlyRafMs, lastScheduledAt, TARGET_FRAME_MS);
    if (result.shouldRender) {
      rendered++;
      lastScheduledAt = result.lastScheduledAt;
    }
  }

  assert.equal(rendered, 60);
});

test('shader warmup prevents first-use gameplay hitches unless explicitly disabled', () => {
  assert.equal(shouldPrewarmShaders(null), true);
  assert.equal(shouldPrewarmShaders('1'), true);
  assert.equal(shouldPrewarmShaders('0'), false);
});
