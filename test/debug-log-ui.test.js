import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('debug log controls and modal are present but hidden outside debug mode', () => {
  const html = read('index.html');
  const css = read('styles/styles.css');
  for (const id of ['openDebugLog', 'pauseDebugLog', 'debugLogMenu', 'debugLogStream', 'debugLogCopy', 'debugLogClear', 'debugLogBack']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="openDebugLog"[^>]*debug-only-control|debug-only-control[^>]*id="openDebugLog"/);
  assert.match(html, /id="pauseDebugLog"[^>]*debug-only-control|debug-only-control[^>]*id="pauseDebugLog"/);
  assert.match(css, /\.debug-only-control\s*\{\s*display\s*:\s*none\s*!important/);
  assert.match(css, /body\.debug-mode \.debug-only-control\s*\{\s*display\s*:\s*block\s*!important/);
});

test('debug menu returns to its originating start or pause menu and exports a full report', () => {
  const main = read('src/main.js');
  assert.match(main, /debugLogReturn\s*=\s*from/);
  assert.match(main, /debugLogReturn === 'pause' \? 'pause' : 'start'/);
  assert.match(main, /perfLog\.exportReport\(debugEnvironment\)/);
  assert.match(main, /navigator\.clipboard(?:\?\.)?\.writeText\(report\)/);
  assert.match(main, /perfLog\.clear\(\)/);
});

test('English and Ukrainian include every debug log control translation', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const uk = JSON.parse(read('i18n/uk.json'));
  for (const key of ['debugLog.open', 'debugLog.title', 'debugLog.copy', 'debugLog.clear', 'debugLog.copied', 'debugLog.copyFailed', 'debugLog.empty', 'debugLog.events']) {
    assert.equal(typeof en[key], 'string');
    assert.equal(typeof uk[key], 'string');
    assert.ok(en[key].length > 0);
    assert.ok(uk[key].length > 0);
  }
});

test('gameplay diagnostics aggregate high-frequency activity instead of logging individual actions', () => {
  const main = read('src/main.js');
  const aggregator = read('src/debug/gameplay-event-aggregator.js');
  assert.match(aggregator, /shots:\s*1000/);
  assert.match(aggregator, /kills:\s*50/);
  assert.match(aggregator, /enemies:\s*50/);
  assert.match(aggregator, /particles:\s*3000/);
  assert.match(main, /'gameplay', 'activity_batch'/);
  assert.match(main, /'game', 'wave_complete'/);
  assert.doesNotMatch(main, /perfLog\.event\([^\n]*['"](?:shot|kill|particle|enemy)['"]/);
});

test('movement, camera, and coarse previous-frame phases are wired into diagnostics', () => {
  const main = read('src/main.js');
  assert.match(main, /new MotionEventAggregator\(/);
  assert.match(main, /'movement_batch'/);
  assert.match(main, /'camera_batch'/);
  assert.match(main, /\['shots', 'kills', 'enemies', 'particles', 'distanceMeters', 'cameraDegrees'\]/);
  assert.match(main, /measurement:\s*'previous_rendered_frame'/);
  assert.match(main, /phaseTimings:\s*hasPreviousPhaseTiming \? previousPhaseTiming : null/);
  assert.match(main, /options\.countsTowardAlive !== false/);
  assert.match(main, /gameplayLog\.record\('enemies',[\s\S]*type\)/);
});

test('rejected pointer-lock camera spikes are wired into debug diagnostics', () => {
  const main = read('src/main.js');
  assert.match(main, /player\.onLookAnomaly\s*=/);
  assert.match(main, /look_delta_rejected/);
});

test('movement performance diagnostics align player, view, grass, shadow, and renderer state', () => {
  const main = read('src/main.js');
  assert.match(main, /const movement\s*=\s*currentPhaseTiming\.movement/);
  assert.match(main, /movement\.moving\s*=/);
  assert.match(main, /movement\.speedMetersPerSecond\s*=/);
  assert.match(main, /movement\.position\.x\s*=/);
  assert.match(main, /movement\.yawDegrees\s*=/);
  assert.match(main, /currentPhaseTiming\.renderer\.drawCalls\s*=/);
  assert.match(main, /currentPhaseTiming\.renderer\.shadowsEnabled\s*=/);
  assert.match(main, /currentPhaseTiming\.renderer\.grassInstances\s*=/);
});

test('opt-in movement probe is wired without changing normal debug sessions', () => {
  const main = read('src/main.js');
  const player = read('src/player.js');
  assert.match(main, /movementProbeMode === '1' \|\| movementProbeMode === 'weapon'/);
  assert.match(main, /new MovementRenderProbe\(/);
  assert.match(main, /movementRenderProbe\.beforeFrame\(/);
  assert.match(main, /movementRenderProbe\.afterFrame\(/);
  assert.match(player, /this\.headBobEnabled\s*=\s*true/);
  assert.match(player, /this\.headBobEnabled\s*!==\s*false/);
});
