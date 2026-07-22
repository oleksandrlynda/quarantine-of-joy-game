import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const loader = fs.readFileSync(new URL('../loader.js', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
const enemyManager = fs.readFileSync(new URL('../src/enemies/manager.js', import.meta.url), 'utf8');
const spatialIndex = fs.readFileSync(new URL('../src/enemies/spatial-index.js', import.meta.url), 'utf8');
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

test('browser runtime pins one shared Three core for engine addons', () => {
  assert.match(index, /<script type="importmap">/);
  assert.match(index, /"three":\s*"https:\/\/unpkg\.com\/three@0\.159\.0\/build\/three\.module\.js"/);
  for (const source of [main, player, loader]) {
    assert.doesNotMatch(source, /examples\/jsm\/.*\?module/);
  }
  assert.match(main, /from 'three\/addons\/controls\/PointerLockControls\.js'/);
  assert.match(loader, /from 'three\/addons\/loaders\/GLTFLoader\.js'/);
});

test('enemy proximity and swept-collision hot paths avoid temporary coordinate-key arrays', () => {
  assert.match(spatialIndex, /let yCells = this\.cells\.get\(cx\)/);
  assert.doesNotMatch(spatialIndex, /cellKey/);
  assert.doesNotMatch(enemyManager, /for \(const \[origin, delta, min, max\] of \[/);
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

test('startup enemy warmup compiles and uploads every configured regular archetype', () => {
  assert.match(main, /const kinds = Object\.keys\(enemyManager\.typeConfig \|\| \{\}\)/);
  assert.match(main, /player\.resetPosition\(\.\.\.relayLevel\.playerSpawn\)/);
  assert.match(main, /relayLevel\.onWaveStart\(resolveStandardStartWave\(\)\)/);
  assert.match(main, /relayLevel\.update\(0, controls\.getObject\(\)\)/);
  assert.match(main, /await renderer\.compileAsync\(scene, camera\)/);
  assert.match(main, /renderProductionScene\(\)/);
  assert.match(main, /await new Promise\(resolve => requestAnimationFrame\(resolve\)\)/);
  assert.match(main, /enemy_runtime_baseline_warmup/);
  assert.match(main, /for \(const root of roots\) enemyManager\.remove\(root\);[\s\S]*?enemy_runtime_baseline_warmup[\s\S]*?await renderer\.compileAsync\(scene, camera\)/);
  assert.match(main, /enemy_runtime_warmup_complete/);
  assert.doesNotMatch(main, /const kinds = \['grunt', 'rusher', 'shooter', 'sniper', 'tank'\]/);
});

test('loading veil remains visible until runtime enemy and VFX warmup completes', () => {
  const readyAt = main.indexOf("setLoading(1.0, t('loading.ready'))");
  const enemyWarmAt = main.indexOf('enemy_runtime_warmup_complete');
  const hideAt = main.lastIndexOf("loadingEl.style.display = 'none'");
  assert.ok(readyAt >= 0 && enemyWarmAt > readyAt && hideAt > enemyWarmAt);
});

test('first Play reuses the pristine warmed authored level while later runs reset it', () => {
  const startGameSource = main.slice(main.indexOf('function startGame(){'), main.indexOf('function registerTutorialShootingTarget'));
  assert.match(main, /let standardRunHasStarted = false/);
  assert.match(startGameSource, /const canReusePristineInitialLevel = !standardRunHasStarted/);
  assert.match(startGameSource, /if \(!canReusePristineInitialLevel\) relayLevel\.reset\(\)/);
  assert.match(startGameSource, /reset\(\);\s*standardRunHasStarted = true/);
});

test('enemy projectile geometry is cached and telegraph buffers are reused per enemy', () => {
  assert.match(shooter, /getCachedRenderResource\(/);
  assert.match(sniper, /getCachedRenderResource\(/);
  assert.match(shooter, /this\._aimLine\.visible = false/);
  assert.match(sniper, /this\._aimLine\.visible = false/);
  assert.match(shooter, /this\._aimLine\.geometry\?\.dispose\?\.\(\)/);
  assert.match(sniper, /this\._aimLine\.geometry\?\.dispose\?\.\(\)/);
});
