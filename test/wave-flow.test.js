import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/session.js';
import { createWaveStartHandler } from '../src/game/wave-flow.js';

test('wave start records first-wave hooks without completing a prior wave', () => {
  const session = new GameSession();
  const checks = [];
  const calls = [];
  let lastWaveStart = -1;
  let hudUpdates = 0;
  let toast = '';
  const enemyManager = { wave: 1, waveStartingAlive: 0 };
  const handler = createWaveStartHandler({
    session,
    enemyManager,
    achievements: { check: event => checks.push(event) },
    pickups: { onWave: wave => calls.push(['pickups', wave]) },
    weather: { onWave: () => calls.push(['weather']) },
    player: { refreshColliders: objects => calls.push(['colliders', objects.length]) },
    objects: [{ id: 'crate' }],
    progression: { onWave: wave => calls.push(['progression', wave]) },
    story: { onWave: wave => calls.push(['story', wave]) },
    getGameTime: () => 5,
    setLastWaveStartTime: value => { lastWaveStart = value; },
    updateHUD: () => { hudUpdates++; },
    showToast: text => { toast = text; }
  });

  handler(1, 7);

  assert.deepEqual(checks, [{ type: 'wave', number: 1 }]);
  assert.equal(lastWaveStart, 5);
  assert.equal(enemyManager.waveStartingAlive, 7);
  assert.equal(session.waveStartingAlive, 7);
  assert.deepEqual(calls, [
    ['pickups', 1],
    ['weather'],
    ['colliders', 1],
    ['progression', 1],
    ['story', 1]
  ]);
  assert.equal(hudUpdates, 1);
  assert.equal(toast, 'Wave 1 start');
});

test('wave start after wave one emits wave completion duration before new wave event', () => {
  const session = new GameSession();
  const checks = [];
  let lastWaveStart = 10;
  const enemyManager = { wave: 2, waveStartingAlive: 0 };
  const handler = createWaveStartHandler({
    session,
    enemyManager,
    achievements: { check: event => checks.push(event) },
    getGameTime: () => 42,
    getLastWaveStartTime: () => lastWaveStart,
    setLastWaveStartTime: value => { lastWaveStart = value; }
  });

  handler(2, 11);

  assert.deepEqual(checks, [
    { type: 'waveComplete', time: 32 },
    { type: 'wave', number: 2 }
  ]);
  assert.equal(lastWaveStart, 42);
  assert.equal(enemyManager.waveStartingAlive, 11);
});

test('wave start resolves progression and story lazily for late main initialization', () => {
  const session = new GameSession();
  const calls = [];
  const enemyManager = { wave: 2, waveStartingAlive: 0 };
  let progression;
  let story;
  const handler = createWaveStartHandler({
    session,
    enemyManager,
    getProgression: () => progression,
    getStory: () => story
  });

  progression = { onWave: wave => calls.push(['progression', wave]) };
  story = { onWave: wave => calls.push(['story', wave]) };

  handler(2, 11);

  assert.deepEqual(calls, [
    ['progression', 2],
    ['story', 2]
  ]);
});
