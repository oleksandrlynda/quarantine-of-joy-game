import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUALITY,
  clampSettingVolume,
  normalizeQuality,
  resolveAudioVolumes
} from '../src/settings.js';

test('quality defaults to the renderer-compatible medium preset', () => {
  assert.equal(DEFAULT_QUALITY, 'med');
  assert.equal(normalizeQuality(null), 'med');
  assert.equal(normalizeQuality('invalid'), 'med');
  assert.equal(normalizeQuality('ultra'), 'ultra');
});

test('audio settings migrate the legacy shared volume independently', () => {
  assert.deepEqual(resolveAudioVolumes({ legacy: 0.4 }), { effects: 0.4, music: 0.4 });
  assert.deepEqual(
    resolveAudioVolumes({ legacy: 0.4, effects: '0.8', music: '0' }),
    { effects: 0.8, music: 0 }
  );
});

test('setting volumes are clamped to a safe range', () => {
  assert.equal(clampSettingVolume(-1), 0);
  assert.equal(clampSettingVolume(2), 1);
  assert.equal(clampSettingVolume('bad', 0.6), 0.6);
});
