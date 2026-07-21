import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../loader.js', import.meta.url), 'utf8');
const weather = fs.readFileSync(new URL('../src/weather.js', import.meta.url), 'utf8');
const grass = fs.readFileSync(new URL('../src/graphics/grass.js', import.meta.url), 'utf8');
const flyer = fs.readFileSync(new URL('../src/enemies/flyer.js', import.meta.url), 'utf8');
const shooter = fs.readFileSync(new URL('../src/enemies/shooter.js', import.meta.url), 'utf8');
const healer = fs.readFileSync(new URL('../src/enemies/healer.js', import.meta.url), 'utf8');
const sniper = fs.readFileSync(new URL('../src/enemies/sniper.js', import.meta.url), 'utf8');
const warden = fs.readFileSync(new URL('../src/enemies/warden.js', import.meta.url), 'utf8');

test('live startup prewarms shaders once before gameplay by default', () => {
  assert.match(main, /shouldPrewarmShaders\(params\.get\('warmup'\)\)/);
  assert.match(main, /loadAllModels\(\{[^}]*skipWarmup:\s*true[^}]*\}\)/s);
  assert.match(main, /if \(shaderWarm\)[\s\S]*prewarmAllShaders/);
});

test('barrel explosion shaders and sprite material join startup warmup', () => {
  assert.match(main, /createEffectsShaderWarmupExtras\(THREE\)/);
  assert.match(loader, /o\.isPoints\s*\|\|\s*o\.isSprite/);
});

test('live thunder path reuses cached noise instead of filling a strike-sized buffer', () => {
  assert.match(weather, /getThunderNoiseBuffer\(a,\s*this\._thunderNoiseCache\)/);
  assert.doesNotMatch(weather, /bufferSize\s*=\s*2\s*\*\s*a\.sampleRate/);
});

test('live grass shader separates slow lean from bounded bounce frequency', () => {
  assert.match(main, /updateGrassWeatherMotion\(grassWeatherMotion/);
  assert.match(grass, /leanBias\s*\+\s*sway\s*\*\s*gustStrength/);
  assert.match(grass, /time\.value\s*\+=\s*dt\s*\*\s*0\.85/);
  assert.doesNotMatch(grass, /time\.value\s*\+=\s*dt\s*\*\s*\([^)]*windStrength/);
});

test('grass orientation is applied before one shared world-space wind displacement', () => {
  const rotateAt = grass.indexOf('pos = vec3(');
  const displaceAt = grass.indexOf('pos.xz += windDirection * disp;');
  assert.ok(rotateAt >= 0 && displaceAt > rotateAt, 'wind displacement must follow blade orientation');
});

test('recurring specialist enemies clone cached render templates', () => {
  for (const source of [flyer, shooter, healer, sniper, warden]) {
    assert.match(source, /instantiateSharedTemplate\(/);
  }
});

test('enemy projectile geometry is cached and telegraph buffers are reused per enemy', () => {
  assert.match(shooter, /getCachedRenderResource\(/);
  assert.match(sniper, /getCachedRenderResource\(/);
  assert.match(shooter, /this\._aimLine\.visible = false/);
  assert.match(sniper, /this\._aimLine\.visible = false/);
  assert.match(shooter, /this\._aimLine\.geometry\?\.dispose\?\.\(\)/);
  assert.match(sniper, /this\._aimLine\.geometry\?\.dispose\?\.\(\)/);
});
