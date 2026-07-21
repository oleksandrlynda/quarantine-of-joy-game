import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDebugEnvironment,
  PerformanceEventLog,
  sanitizeDiagnosticValue
} from '../src/debug/performance-event-log.js';

function makeStorage(initial = {}) {
  return {
    values: { ...initial },
    reads: 0,
    writes: 0,
    getItem(key) { this.reads++; return this.values[key] ?? null; },
    setItem(key, value) { this.writes++; this.values[key] = String(value); },
    removeItem(key) { delete this.values[key]; }
  };
}

function makeClock(start = 1000) {
  let value = start;
  return { now: () => value, advance: amount => { value += amount; } };
}

test('disabled logger performs no storage reads, writes, or event allocations', () => {
  const storage = makeStorage();
  const logger = new PerformanceEventLog({ enabled: false, storage });
  assert.equal(logger.event('game', 'start'), null);
  assert.equal(logger.observeFrame({ active: true, frameMs: 100 }), false);
  assert.deepEqual(logger.getEvents(), []);
  assert.equal(storage.reads, 0);
  assert.equal(storage.writes, 0);
  assert.deepEqual(Object.keys(logger), ['enabled']);
});

test('enabled in-memory logging can disable all persistence work', () => {
  const storage = makeStorage();
  let scheduled = 0;
  const logger = new PerformanceEventLog({
    enabled: true,
    persistenceEnabled: false,
    storage,
    recordPageBoundary: false,
    setTimeoutFn: () => { scheduled++; return 1; }
  });

  logger.event('performance', 'frame_sample', { frames: 300 });
  assert.equal(logger.getEvents().length, 1);
  assert.equal(logger.flush(), false);
  logger.clear();
  assert.equal(storage.reads, 0);
  assert.equal(storage.writes, 0);
  assert.equal(scheduled, 0);
});

test('events are ordered and the bounded log evicts oldest entries', () => {
  const clock = makeClock();
  const logger = new PerformanceEventLog({
    enabled: true,
    maxEvents: 3,
    storage: makeStorage(),
    now: clock.now,
    wallNow: clock.now,
    recordPageBoundary: false,
    setTimeoutFn: () => 1
  });
  for (let i = 0; i < 5; i++) { logger.event('test', `event_${i}`, { i }); clock.advance(10); }
  assert.deepEqual(logger.getEvents().map(event => event.name), ['event_2', 'event_3', 'event_4']);
  assert.deepEqual(logger.getEvents().map(event => event.seq), [3, 4, 5]);
});

test('persistence restores events, adds a reload boundary, and clear removes storage', () => {
  const storage = makeStorage();
  const first = new PerformanceEventLog({ enabled: true, storage, persistDelayMs: 0, setTimeoutFn: () => 1 });
  first.event('game', 'start', { wave: 1 });
  assert.equal(first.flush(), true);

  const second = new PerformanceEventLog({ enabled: true, storage, setTimeoutFn: () => 1 });
  assert.ok(second.getEvents().some(event => event.name === 'start'));
  assert.equal(second.getEvents().at(-1).name, 'page.reload');
  second.clear();
  assert.deepEqual(second.getEvents(), []);
  assert.equal(storage.values['qoj.debug.performance-events.v1'], undefined);
});

test('corrupted persistence is discarded without preventing new events', () => {
  const key = 'qoj.debug.performance-events.v1';
  const storage = makeStorage({ [key]: '{broken' });
  const logger = new PerformanceEventLog({ enabled: true, storage, setTimeoutFn: () => 1 });
  assert.equal(logger.getEvents().at(-1).name, 'page.open');
  assert.equal(storage.values[key], undefined);
});

test('diagnostic sanitization truncates strings and handles circular data', () => {
  const circular = { message: 'x'.repeat(5000) };
  circular.self = circular;
  const clean = sanitizeDiagnosticValue(circular);
  assert.equal(clean.message.length, 4000);
  assert.equal(clean.self, '[circular]');
});

test('frame observation excludes inactive gaps and emits stall context plus five-second samples', () => {
  const clock = makeClock(0);
  const logger = new PerformanceEventLog({
    enabled: true,
    storage: makeStorage(),
    now: clock.now,
    wallNow: () => 100000 + clock.now(),
    recordPageBoundary: false,
    setTimeoutFn: () => 1
  });

  logger.observeFrame({ nowMs: 0, frameMs: 300, active: false, visible: true });
  clock.advance(800);
  logger.observeFrame({
    nowMs: clock.now(), frameMs: 60, active: true, visible: true,
    enemies: 4, drawCalls: 20, geometries: 100, programs: 2, effectPoolObjects: 4,
    phaseTimings: { renderMs: 8, measuredWorkMs: 10, unattributedMs: 50 }
  });
  assert.equal(logger.getEvents().filter(event => event.name === 'frame_stall').length, 1);

  for (let i = 0; i < 310; i++) {
    clock.advance(16.7);
    logger.observeFrame({
      nowMs: clock.now(), frameMs: i === 100 ? 55 : 16.7, active: true, visible: true,
      dpr: 1.25, drawCalls: i === 200 ? 124 : 24, triangles: i === 200 ? 90000 : 45000,
      geometries: i < 150 ? 100 : 125, programs: i < 250 ? 2 : 3,
      effectPoolObjects: i < 180 ? 4 : 16, sceneObjects: 40 + (i % 3),
      enemies: 8, projectiles: 3, effects: 4, pickups: 2, wave: 2, weather: 'windy',
      phaseTimings: { renderMs: i === 200 ? 12 : 2, enemyAiMs: 0.5, measuredWorkMs: 4, unattributedMs: 12 }
    });
  }
  const sample = logger.getEvents().find(event => event.name === 'frame_sample');
  assert.ok(sample);
  assert.ok(sample.data.averageFps > 50);
  assert.ok(sample.data.p95FrameMs <= sample.data.worstFrameMs);
  assert.equal(sample.data.wave, 2);
  assert.equal(sample.data.weather, 'windy');
  assert.equal(sample.data.maxDrawCalls, 124);
  assert.equal(sample.data.maxTriangles, 90000);
  assert.equal(sample.data.geometryGrowth, 25);
  assert.equal(sample.data.programGrowth, 1);
  assert.equal(sample.data.effectPoolGrowth, 12);
  assert.equal(sample.data.maxSceneObjects, 42);
  assert.ok(sample.data.phaseAveragesMs.renderMs >= 2);
  assert.equal(sample.data.phaseMaximaMs.renderMs, 12);
});

test('slow-frame percentage notes use observed counts rather than a coarse percentile edge', () => {
  const clock = makeClock(0);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    recordPageBoundary: false, setTimeoutFn: () => 1
  });
  for (let i = 0; i < 100; i++) {
    clock.advance(50);
    logger.observeFrame({ nowMs: clock.now(), frameMs: i < 4 ? 40 : 20, active: true, visible: true });
  }
  const sample = logger.getEvents().find(event => event.name === 'frame_sample');
  assert.equal(sample.data.framesOver33Percent, 4);
  assert.ok(sample.notes.every(note => !note.includes('% of frames exceeded 33 ms')));
});

test('frame samples separate moving and stationary render behavior', () => {
  const clock = makeClock(0);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    recordPageBoundary: false, setTimeoutFn: () => 1
  });

  for (let i = 0; i < 100; i++) {
    const moving = i >= 50;
    clock.advance(50);
    logger.observeFrame({
      nowMs: clock.now(),
      frameMs: moving ? 50 : 20,
      active: true,
      visible: true,
      phaseTimings: {
        renderMs: moving ? 38 : 4,
        measuredWorkMs: moving ? 39 : 5,
        unattributedMs: 1,
        movement: {
          moving,
          inputActive: moving,
          speedMetersPerSecond: moving ? 6 : 0,
          position: { x: i, y: 1.7, z: 0 },
          yawDegrees: 15,
          pitchDegrees: -4
        },
        renderer: {
          drawCalls: moving ? 90 : 20,
          triangles: 43000,
          shadowsEnabled: true,
          grassInstances: 20000
        }
      }
    });
  }

  const sample = logger.getEvents().find(event => event.name === 'frame_sample');
  assert.equal(sample.data.movementBreakdown.stationary.frames, 50);
  assert.equal(sample.data.movementBreakdown.stationary.averageFps, 50);
  assert.equal(sample.data.movementBreakdown.stationary.averageRenderMs, 4);
  assert.equal(sample.data.movementBreakdown.moving.frames, 50);
  assert.equal(sample.data.movementBreakdown.moving.averageFps, 20);
  assert.equal(sample.data.movementBreakdown.moving.averageRenderMs, 38);
  assert.equal(sample.data.movementBreakdown.moving.averageDrawCalls, 90);
});

test('movement transition events preserve aligned position, view, and render state', () => {
  const clock = makeClock(0);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    recordPageBoundary: false, setTimeoutFn: () => 1
  });
  const observe = (moving, x, renderMs) => {
    clock.advance(100);
    logger.observeFrame({
      nowMs: clock.now(), frameMs: 20, active: true, visible: true,
      phaseTimings: {
        renderMs,
        movement: {
          moving,
          inputActive: moving,
          speedMetersPerSecond: moving ? 6 : 0,
          position: { x, y: 1.7, z: 3 },
          yawDegrees: 35,
          pitchDegrees: -8
        },
        renderer: { drawCalls: moving ? 82 : 19, triangles: 42000, shadowsEnabled: true }
      }
    });
  };

  observe(false, 0, 4);
  observe(false, 0, 5);
  observe(true, 1, 37);
  observe(true, 2, 39);
  observe(false, 2, 6);

  const transitions = logger.getEvents().filter(event => event.name === 'movement_state_changed');
  assert.equal(transitions.length, 2);
  assert.equal(transitions[0].data.from, 'stationary');
  assert.equal(transitions[0].data.to, 'moving');
  assert.equal(transitions[0].data.position.x, 1);
  assert.equal(transitions[0].data.renderMs, 37);
  assert.equal(transitions[0].data.renderer.drawCalls, 82);
  assert.equal(transitions[1].data.from, 'moving');
  assert.equal(transitions[1].data.to, 'stationary');
});

test('stall events include the movement and renderer state from the measured frame', () => {
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), recordPageBoundary: false,
    setTimeoutFn: () => 1, now: () => 1000, wallNow: () => 1000
  });
  logger.observeFrame({
    nowMs: 1000, frameMs: 70, active: true, visible: true,
    phaseTimings: {
      renderMs: 55,
      movement: {
        moving: true,
        inputActive: true,
        speedMetersPerSecond: 6,
        position: { x: 12, y: 1.7, z: -4 },
        yawDegrees: 90,
        pitchDegrees: -6
      },
      renderer: { drawCalls: 96, triangles: 44000, shadowsEnabled: true, grassInstances: 20000 }
    }
  });

  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  assert.equal(stall.data.measuredFrame.movement.moving, true);
  assert.equal(stall.data.measuredFrame.movement.position.x, 12);
  assert.equal(stall.data.measuredFrame.renderer.drawCalls, 96);
  assert.ok(stall.notes.some(note => note.includes('player was moving')));
});

test('hidden, paused, and immediate-resume gaps never become frame stalls', () => {
  const logger = new PerformanceEventLog({
    enabled: true,
    storage: makeStorage(),
    recordPageBoundary: false,
    setTimeoutFn: () => 1,
    now: () => 0,
    wallNow: () => 1000
  });
  logger.observeFrame({ nowMs: 0, frameMs: 800, active: true, visible: false });
  logger.observeFrame({ nowMs: 500, frameMs: 500, active: false, visible: true });
  logger.observeFrame({ nowMs: 1000, frameMs: 300, active: true, visible: true });
  assert.equal(logger.getEvents().filter(event => event.name === 'frame_stall').length, 0);
  logger.observeFrame({ nowMs: 1300, frameMs: 70, active: true, visible: true });
  assert.equal(logger.getEvents().filter(event => event.name === 'frame_stall').length, 1);
});

test('long tasks are recorded and correlated with nearby frame stalls', () => {
  let observerCallback = null;
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const clock = makeClock(1000);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    PerformanceObserverClass: Observer, recordPageBoundary: false, setTimeoutFn: () => 1
  });
  observerCallback({ getEntries: () => [{ duration: 82, startTime: 1000, attribution: [] }] });
  logger.observeFrame({ nowMs: 1000, frameMs: 90, active: true, visible: true });
  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  assert.ok(stall.notes.some(note => note.includes('long task')));
});

test('long tasks reported after a stall update the recent stall correlation', () => {
  let observerCallback = null;
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const clock = makeClock(1000);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    PerformanceObserverClass: Observer, recordPageBoundary: false, setTimeoutFn: () => 1
  });
  logger.observeFrame({ nowMs: 1000, frameMs: 70, active: true, visible: true });
  observerCallback({ getEntries: () => [{ duration: 68, startTime: 1005, attribution: [] }] });
  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  const longTask = logger.getEvents().find(event => event.name === 'long_task');
  assert.ok(stall.notes.some(note => note.includes('long task')));
  assert.ok(!stall.notes.some(note => note.includes('No correlated cause')));
  assert.ok(longTask.notes.some(note => note.includes('stall')));
});

test('supported long-animation-frame telemetry adds sanitized script and browser-render attribution', () => {
  const callbacks = {};
  class Observer {
    static supportedEntryTypes = ['long-animation-frame'];
    constructor(callback) { this.callback = callback; }
    observe(options) { callbacks[options.entryTypes[0]] = this.callback; }
    disconnect() {}
  }
  const clock = makeClock(1000);
  const logger = new PerformanceEventLog({
    enabled: true, storage: makeStorage(), now: clock.now, wallNow: clock.now,
    PerformanceObserverClass: Observer, recordPageBoundary: false, setTimeoutFn: () => 1
  });
  logger.observeFrame({ nowMs: 1000, frameMs: 80, active: true, visible: true });
  callbacks['long-animation-frame']({ getEntries: () => [{
    duration: 80,
    startTime: 1000,
    blockingDuration: 30,
    renderStart: 1050,
    styleAndLayoutStart: 1060,
    scripts: [{
      duration: 25,
      forcedStyleAndLayoutDuration: 3,
      pauseDuration: 1,
      invoker: 'Window.requestAnimationFrame',
      sourceURL: 'http://localhost:8080/src/main.js?secret=removed',
      sourceFunctionName: 'step'
    }]
  }] });
  const loaf = logger.getEvents().find(event => event.name === 'long_animation_frame');
  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  assert.equal(loaf.data.scriptDurationMs, 25);
  assert.equal(loaf.data.renderDurationMs, 30);
  assert.equal(loaf.data.styleAndLayoutDurationMs, 20);
  assert.equal(loaf.data.scripts[0].source, '/src/main.js');
  assert.equal(loaf.data.scripts[0].functionName, 'step');
  assert.equal(stall.data.nearbyLongAnimationFrame.scriptDurationMs, 25);
  assert.ok(stall.notes.some(note => note.includes('Long animation frame telemetry')));
});

test('stall events include previous-frame phase timing without claiming causation', () => {
  const logger = new PerformanceEventLog({
    enabled: true,
    storage: makeStorage(),
    recordPageBoundary: false,
    setTimeoutFn: () => 1,
    now: () => 1000,
    wallNow: () => 1000
  });
  logger.observeFrame({
    nowMs: 1000,
    frameMs: 80,
    active: true,
    visible: true,
    phaseTimings: {
      measurement: 'previous_rendered_frame',
      playerSimulationMs: 4,
      enemyAiMs: 11,
      effectsPickupsMs: 7,
      weatherAudioMs: 2,
      housekeepingMs: 1,
      renderMs: 15,
      measuredWorkMs: 40,
      intervalMs: 80,
      unattributedMs: 40
    }
  });
  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  assert.equal(stall.data.phaseTimings.measurement, 'previous_rendered_frame');
  assert.equal(stall.data.phaseTimings.renderMs, 15);
  assert.ok(stall.notes.some(note => note.includes('Largest measured previous-frame phase was render')));
  assert.ok(stall.notes.some(note => note.includes('outside measured game phases')));
  assert.ok(stall.notes.every(note => !note.toLowerCase().includes('caused')));
});

test('stall events correlate measured diagnostic persistence work without recursive log events', () => {
  const clock = makeClock(1000);
  const storage = makeStorage();
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    clock.advance(12);
    originalSetItem(key, value);
  };
  const logger = new PerformanceEventLog({
    enabled: true, storage, now: clock.now, wallNow: clock.now,
    recordPageBoundary: false, setTimeoutFn: () => 1
  });
  logger.event('test', 'before_flush', { value: 1 });
  assert.equal(logger.flush(), true);
  assert.equal(logger.getEvents().length, 1);
  clock.advance(100);
  logger.observeFrame({ nowMs: clock.now(), frameMs: 70, active: true, visible: true });
  const stall = logger.getEvents().find(event => event.name === 'frame_stall');
  assert.equal(stall.data.nearbyDiagnosticWork.name, 'persistence_flush');
  assert.equal(stall.data.nearbyDiagnosticWork.durationMs, 12);
  assert.ok(stall.notes.some(note => note.includes('Diagnostic persistence')));
});

test('export report contains sanitized environment and every retained event', () => {
  const logger = new PerformanceEventLog({ enabled: true, storage: makeStorage(), recordPageBoundary: false, setTimeoutFn: () => 1 });
  logger.event('game', 'start', { value: 1 });
  logger.event('weather', 'changed', { mode: 'snow' });
  const report = JSON.parse(logger.exportReport({ version: 'v1', secret: undefined }));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.environment.version, 'v1');
  assert.equal(report.events.length, 2);
});

test('environment collection omits inline levels while keeping diagnostic flags', () => {
  const params = new URLSearchParams('debug=1&moveProbe=1&seed=ABC123&level=%7B%22secret%22%3A1%7D&unknown=nope');
  const environment = collectDebugEnvironment({ params, version: 'v1', seed: 'ABC123' });
  assert.equal(environment.urlParams.debug, '1');
  assert.equal(environment.urlParams.moveProbe, '1');
  assert.equal(environment.urlParams.level, '[inline-level-omitted]');
  assert.equal(environment.urlParams.unknown, undefined);
});
