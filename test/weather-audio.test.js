import test from 'node:test';
import assert from 'node:assert/strict';
import { getThunderNoiseBuffer, THUNDER_NOISE_SECONDS } from '../src/game/weather-audio.js';

test('thunder reuses a short noise buffer instead of allocating on every strike', () => {
  let createCalls = 0;
  const context = {
    sampleRate: 48000,
    createBuffer(_channels, length) {
      createCalls++;
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    }
  };
  const cache = {};
  const first = getThunderNoiseBuffer(context, cache, () => 0.5);
  const second = getThunderNoiseBuffer(context, cache, () => 0.5);

  assert.equal(first, second);
  assert.equal(createCalls, 1);
  assert.equal(first.length, context.sampleRate * THUNDER_NOISE_SECONDS);
  assert.ok(THUNDER_NOISE_SECONDS <= 0.5);
});
