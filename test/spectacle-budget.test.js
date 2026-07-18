import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WEATHER_PARTICLE_BUDGETS } from '../src/weather.js';

const grass = fs.readFileSync(new URL('../src/graphics/grass.js', import.meta.url), 'utf8');
const world = fs.readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');

test('lush grass density is preserved with a single-quad blade budget', () => {
  assert.match(world, /bladeCount:\s*20000/);
  assert.match(grass, /new THREE\.PlaneGeometry\(0\.1,\s*1,\s*1,\s*1\)/);
  assert.doesNotMatch(grass, /colorA\.clone\(\)/);
});

test('weather fields preserve spectacle inside conservative particle caps', () => {
  assert.deepEqual(WEATHER_PARTICLE_BUDGETS, {
    rain: 4200,
    snow: 1800,
    fog: 700,
    sand: 1000,
    wind: 900
  });

  assert.ok(WEATHER_PARTICLE_BUDGETS.rain >= 4000);
  assert.ok(WEATHER_PARTICLE_BUDGETS.snow >= 1500);
  assert.ok(WEATHER_PARTICLE_BUDGETS.fog >= 600);
});
