import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGrassWeatherUniforms,
  createGrassWeatherMotion,
  STORM_GRASS_HOLD_MAX,
  STORM_GRASS_HOLD_MIN,
  STORM_GRASS_SHIFT_MAX,
  STORM_GRASS_SHIFT_MIN,
  updateGrassWeatherMotion
} from '../src/game/grass-weather-motion.js';

test('storm grass holds one direction for 10-15 seconds before a modest wind shift', () => {
  const state = createGrassWeatherMotion();
  const rng = () => 0;

  updateGrassWeatherMotion(state, { time: 0, dt: 1 / 60, stormMix: 1, rng });
  assert.equal(state.targetAngle, 0);
  assert.equal(state.nextTurnAt, STORM_GRASS_HOLD_MIN);

  updateGrassWeatherMotion(state, { time: 9.99, dt: 1 / 60, stormMix: 1, rng });
  assert.equal(state.targetAngle, 0);

  updateGrassWeatherMotion(state, { time: 10, dt: 1 / 60, stormMix: 1, rng });
  assert.ok(Math.abs(state.targetAngle) >= STORM_GRASS_SHIFT_MIN);
  assert.ok(Math.abs(state.targetAngle) <= STORM_GRASS_SHIFT_MAX);
  assert.ok(state.nextTurnAt - 10 >= STORM_GRASS_HOLD_MIN);
  assert.ok(state.nextTurnAt - 10 <= STORM_GRASS_HOLD_MAX);
});

test('wind shifts are spring-smoothed and storm bounce remains energetic but bounded', () => {
  const state = createGrassWeatherMotion();
  const rng = () => 0;

  for (let i = 0; i < 600; i++) {
    updateGrassWeatherMotion(state, { time: i / 60, dt: 1 / 60, stormMix: 1, rng });
  }
  const angleBeforeTurn = state.angle;
  const sameState = updateGrassWeatherMotion(state, { time: 10, dt: 1 / 60, stormMix: 1, rng });

  assert.equal(sameState, state, 'controller should update in place without per-frame allocation');
  assert.ok(Math.abs(state.angle - angleBeforeTurn) < 0.03, 'direction should not snap on wind shift');

  for (let i = 1; i <= 240; i++) {
    updateGrassWeatherMotion(state, { time: 10 + i / 60, dt: 1 / 60, stormMix: 1, rng });
  }
  assert.ok(state.lean > 0.4, `expected stable same-side lean, got ${state.lean}`);
  assert.ok(Math.abs(state.angle - state.targetAngle) < 0.08, 'direction should settle toward the shifted wind');
  assert.ok(state.gust >= 0.16 && state.gust <= 0.22, `expected dynamic bounded gust, got ${state.gust}`);
});

test('uniform application is shared, world-aligned, and safe for cached legacy materials', () => {
  const direction = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const modern = {
    uniforms: {
      windDirection: { value: direction },
      leanBias: { value: 0 },
      gustStrength: { value: 0 },
      heightFactor: { value: 1 },
      snowMix: { value: 0 }
    }
  };
  const state = { lean: 0.52, gust: 0.18, angle: Math.PI / 6 };

  assert.equal(applyGrassWeatherUniforms(modern, state, {
    baseWindX: 1,
    baseWindZ: 0,
    heightFactor: 0.8,
    snowMix: 0.2
  }), true);
  assert.ok(Math.abs(direction.x - Math.cos(Math.PI / 6)) < 1e-9);
  assert.ok(Math.abs(direction.y - Math.sin(Math.PI / 6)) < 1e-9);
  assert.equal(modern.uniforms.leanBias.value, 0.52);
  assert.equal(modern.uniforms.gustStrength.value, 0.18);

  const legacy = { uniforms: { windStrength: { value: 3 } } };
  assert.doesNotThrow(() => applyGrassWeatherUniforms(legacy, state));
  assert.ok(legacy.uniforms.windStrength.value <= 0.6);
  assert.equal(applyGrassWeatherUniforms(null, state), false);
});
