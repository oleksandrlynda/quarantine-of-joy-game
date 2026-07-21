import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { WEATHER_PARTICLE_BUDGETS, WeatherSystem } from '../src/weather.js';

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

test('rain uses restrained streaks with depth fading instead of additive white squares', () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe8ff, 20, 160);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4488aa, .9);
  const dir = new THREE.DirectionalLight(0xffffff, .8);
  const skyMat = {
    uniforms: {
      top: { value: new THREE.Color(0xaee9ff) },
      bottom: { value: new THREE.Color(0xf1e3ff) },
      flashIntensity: { value: 0 },
      flashDir: { value: new THREE.Vector3(0, 1, 0) }
    }
  };
  const weather = new WeatherSystem({
    THREE,
    scene,
    skyMat,
    hemi,
    dir,
    mats: { weather: { wetness: { value: 0 }, snow: { value: 0 } } }
  });

  assert.equal(weather.rain.material.blending, THREE.NormalBlending);
  assert.equal(weather.rain.material.depthTest, true);
  assert.equal(weather.rain.material.uniforms.uOpacity.value, .34);
  assert.match(weather.rain.material.vertexShader, /nearFade/);
  assert.match(weather.rain.material.vertexShader, /farFade/);
  assert.match(weather.rain.material.fragmentShader, /streak/);
});
