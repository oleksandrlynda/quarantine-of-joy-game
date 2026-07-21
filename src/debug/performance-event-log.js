const SCHEMA_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'qoj.debug.performance-events.v1';
const FRAME_BUCKETS = [8, 12, 16.7, 20, 25, 33, 50, 75, 100, 150, 250, 500, Infinity];
const SAFE_PARAM_KEYS = ['seed', 'aa', 'shadows', 'tone', 'autoDPR', 'warmup', 'prewarm', 'debug', 'moveProbe', 'story'];

function randomId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function roundOne(value) {
  return Math.round(finiteNumber(value) * 10) / 10;
}

function sanitizeScriptSource(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value), globalThis.location?.href || 'http://localhost/');
    return String(parsed.pathname || '').slice(-500) || null;
  } catch {
    return String(value).split(/[?#]/, 1)[0].slice(-500) || null;
  }
}

export function sanitizeDiagnosticValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (value instanceof Error) {
    return {
      name: String(value.name || 'Error').slice(0, 120),
      message: String(value.message || value).slice(0, 2000),
      stack: String(value.stack || '').slice(0, 12000)
    };
  }
  if (depth >= 5) return '[max-depth]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const result = value.slice(0, 100).map(item => sanitizeDiagnosticValue(item, depth + 1, seen));
      seen.delete(value);
      return result;
    }
    const result = {};
    for (const key of Object.keys(value).slice(0, 100)) {
      result[String(key).slice(0, 160)] = sanitizeDiagnosticValue(value[key], depth + 1, seen);
    }
    seen.delete(value);
    return result;
  }
  return String(value).slice(0, 4000);
}

function createFrameWindow(startedAt = 0, phaseTimingKeys = []) {
  const phaseTotals = Object.create(null);
  const phaseMaxima = Object.create(null);
  for (const key of phaseTimingKeys) {
    phaseTotals[key] = 0;
    phaseMaxima[key] = 0;
  }
  return {
    startedAt,
    frames: 0,
    totalMs: 0,
    worstMs: 0,
    over33: 0,
    over50: 0,
    buckets: new Array(FRAME_BUCKETS.length).fill(0),
    drawCallsTotal: 0,
    maxDrawCalls: 0,
    maxTriangles: 0,
    maxEnemies: 0,
    maxEffects: 0,
    geometryStart: null,
    maxGeometries: 0,
    programStart: null,
    maxPrograms: 0,
    effectPoolStart: null,
    maxEffectPoolObjects: 0,
    maxSceneObjects: 0,
    phaseFrames: 0,
    phaseTotals,
    phaseMaxima,
    movementBreakdown: {
      moving: createMovementFrameWindow(),
      stationary: createMovementFrameWindow()
    }
  };
}

function createMovementFrameWindow() {
  return {
    frames: 0,
    totalFrameMs: 0,
    worstFrameMs: 0,
    over33: 0,
    renderFrames: 0,
    totalRenderMs: 0,
    maxRenderMs: 0,
    drawCallFrames: 0,
    totalDrawCalls: 0,
    maxDrawCalls: 0,
    totalSpeed: 0
  };
}

function summarizeMovementFrameWindow(window) {
  const averageFrameMs = window.frames ? window.totalFrameMs / window.frames : 0;
  return {
    frames: window.frames,
    averageFps: averageFrameMs > 0 ? roundOne(1000 / averageFrameMs) : 0,
    averageFrameMs: roundOne(averageFrameMs),
    worstFrameMs: roundOne(window.worstFrameMs),
    framesOver33Percent: window.frames ? roundOne((window.over33 / window.frames) * 100) : 0,
    averageRenderMs: window.renderFrames ? roundOne(window.totalRenderMs / window.renderFrames) : 0,
    maxRenderMs: roundOne(window.maxRenderMs),
    averageDrawCalls: window.drawCallFrames ? roundOne(window.totalDrawCalls / window.drawCallFrames) : 0,
    maxDrawCalls: window.maxDrawCalls,
    averageSpeedMetersPerSecond: window.frames ? roundOne(window.totalSpeed / window.frames) : 0
  };
}

function approximatePercentile(window, percentile) {
  if (!window.frames) return 0;
  const target = Math.max(1, Math.ceil(window.frames * percentile));
  let cumulative = 0;
  for (let i = 0; i < window.buckets.length; i++) {
    cumulative += window.buckets[i];
    if (cumulative >= target) {
      const edge = FRAME_BUCKETS[i];
      return edge === Infinity ? window.worstMs : edge;
    }
  }
  return window.worstMs;
}

function sanitizeRestoredEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (!Number.isFinite(event.seq) || typeof event.category !== 'string' || typeof event.name !== 'string') return null;
  return {
    seq: event.seq,
    sessionId: String(event.sessionId || ''),
    pageId: String(event.pageId || ''),
    tMs: finiteNumber(event.tMs),
    wallTime: String(event.wallTime || ''),
    category: event.category.slice(0, 80),
    name: event.name.slice(0, 120),
    severity: String(event.severity || 'info').slice(0, 20),
    data: sanitizeDiagnosticValue(event.data || {}),
    notes: Array.isArray(event.notes) ? event.notes.slice(0, 20).map(note => String(note).slice(0, 500)) : []
  };
}

export class PerformanceEventLog {
  constructor({
    enabled = false,
    maxEvents = 1000,
    persistenceEnabled = true,
    storage,
    storageKey = DEFAULT_STORAGE_KEY,
    now,
    wallNow,
    persistDelayMs = 5000,
    setTimeoutFn,
    clearTimeoutFn,
    requestIdleCallbackFn,
    cancelIdleCallbackFn,
    eventTarget,
    documentRef,
    PerformanceObserverClass,
    recordPageBoundary = true
  } = {}) {
    this.enabled = enabled === true;
    if (!this.enabled) return;
    this.maxEvents = Math.max(1, Math.floor(maxEvents));
    this.persistenceEnabled = persistenceEnabled !== false;
    this.phaseTimingKeys = [
      'playerSimulationMs', 'enemyAiMs', 'effectsPickupsMs',
      'weatherAudioMs', 'housekeepingMs', 'renderMs',
      'measuredWorkMs', 'unattributedMs'
    ];
    try { this.storage = storage === undefined ? globalThis.sessionStorage : storage; }
    catch { this.storage = null; }
    this.storageKey = storageKey;
    this.now = now || (() => globalThis.performance?.now?.() ?? Date.now());
    this.wallNow = wallNow || (() => Date.now());
    this.persistDelayMs = Math.max(0, persistDelayMs);
    this.setTimeoutFn = setTimeoutFn || globalThis.setTimeout?.bind(globalThis);
    this.clearTimeoutFn = clearTimeoutFn || globalThis.clearTimeout?.bind(globalThis);
    this.requestIdleCallbackFn = requestIdleCallbackFn || globalThis.requestIdleCallback?.bind(globalThis);
    this.cancelIdleCallbackFn = cancelIdleCallbackFn || globalThis.cancelIdleCallback?.bind(globalThis);
    this.eventTarget = eventTarget === undefined ? globalThis.window : eventTarget;
    this.documentRef = documentRef === undefined ? globalThis.document : documentRef;
    this.events = [];
    this.subscribers = new Set();
    this._persistTimer = null;
    this._idleHandle = null;
    this._dirty = false;
    this._destroyed = false;
    this._observer = null;
    this._longAnimationFrameObserver = null;
    this._pageStartedAt = this.now();
    this._ignoreFramesUntil = 0;
    this._lastLongTaskAt = -Infinity;
    this._lastLongAnimationFrameAt = -Infinity;
    this._lastLongAnimationFrameSummary = null;
    this._lastDprChangeAt = -Infinity;
    this._lastStallAt = -Infinity;
    this._suppressedStalls = 0;
    this._lastSampleContext = null;
    this._lastMovementState = null;
    this._lastMovementTransitionAt = -Infinity;
    this._lastPersistenceFlushAt = -Infinity;
    this._lastPersistenceFlushDurationMs = 0;
    this._lastPersistenceBytes = 0;
    this._lastPersistenceEventCount = 0;
    this._frameWindow = createFrameWindow(this._pageStartedAt, this.phaseTimingKeys);
    this._boundPageHide = () => this.flush();

    const restored = this.persistenceEnabled ? this._restore() : null;
    this.pageId = randomId('page');
    this.sessionId = restored?.sessionId || randomId('session');
    this.sessionStartedAt = finiteNumber(restored?.sessionStartedAt, this.wallNow());
    this.nextSeq = Math.max(1, finiteNumber(restored?.nextSeq, 1));
    if (restored?.events?.length) this.events = restored.events.slice(-this.maxEvents);

    this.eventTarget?.addEventListener?.('pagehide', this._boundPageHide);
    const ObserverClass = PerformanceObserverClass === undefined ? globalThis.PerformanceObserver : PerformanceObserverClass;
    this._startLongTaskObserver(ObserverClass);
    this._startLongAnimationFrameObserver(ObserverClass);
    if (recordPageBoundary) {
      this.event('system', restored?.events?.length ? 'page.reload' : 'page.open', {
        restoredEvents: restored?.events?.length || 0
      });
    }
  }

  _restore() {
    try {
      const raw = this.storage?.getItem?.(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.events)) return null;
      return {
        sessionId: String(parsed.sessionId || ''),
        sessionStartedAt: finiteNumber(parsed.sessionStartedAt),
        nextSeq: finiteNumber(parsed.nextSeq, 1),
        events: parsed.events.map(sanitizeRestoredEvent).filter(Boolean)
      };
    } catch {
      try { this.storage?.removeItem?.(this.storageKey); } catch {}
      return null;
    }
  }

  _startLongTaskObserver(ObserverClass) {
    if (typeof ObserverClass !== 'function') return;
    try {
      this._observer = new ObserverClass(entries => {
        for (const entry of entries.getEntries?.() || []) {
          const durationMs = finiteNumber(entry.duration);
          if (durationMs < 50) continue;
          this._lastLongTaskAt = finiteNumber(entry.startTime, this.now());
          const nearRecentStall = Math.abs(this._lastLongTaskAt - this._lastStallAt) <= 300;
          if (nearRecentStall) {
            const recentStall = this.events.findLast?.(event => event.category === 'performance' && event.name === 'frame_stall');
            if (recentStall && !recentStall.notes.includes('Browser long task observed near this stall.')) {
              recentStall.notes.push('Browser long task observed near this stall.');
              recentStall.notes = recentStall.notes.filter(note => note !== 'No correlated cause was observed by the current probes.');
              this._dirty = true;
            }
          }
          this.event('performance', 'long_task', {
            durationMs: Math.round(durationMs * 10) / 10,
            startTimeMs: Math.round(this._lastLongTaskAt * 10) / 10,
            attribution: sanitizeDiagnosticValue(entry.attribution || [])
          }, durationMs >= 100 ? 'warning' : 'info', nearRecentStall ? ['Frame stall observed near this long task.'] : []);
        }
      });
      this._observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this._observer = null;
    }
  }

  _startLongAnimationFrameObserver(ObserverClass) {
    if (typeof ObserverClass !== 'function' || !ObserverClass.supportedEntryTypes?.includes?.('long-animation-frame')) return;
    try {
      this._longAnimationFrameObserver = new ObserverClass(entries => {
        for (const entry of entries.getEntries?.() || []) {
          const durationMs = finiteNumber(entry.duration);
          if (durationMs < 50) continue;
          const startTimeMs = finiteNumber(entry.startTime, this.now());
          const endTimeMs = startTimeMs + durationMs;
          const renderStartMs = finiteNumber(entry.renderStart);
          const styleStartMs = finiteNumber(entry.styleAndLayoutStart);
          const scripts = Array.isArray(entry.scripts) ? entry.scripts : [];
          let scriptDurationMs = 0;
          const scriptSummaries = scripts
            .map(script => {
              const duration = Math.max(0, finiteNumber(script.duration));
              scriptDurationMs += duration;
              return {
                durationMs: roundOne(duration),
                forcedStyleAndLayoutMs: roundOne(script.forcedStyleAndLayoutDuration),
                pauseDurationMs: roundOne(script.pauseDuration),
                invoker: String(script.invoker || script.invokerType || '').slice(0, 160) || null,
                source: sanitizeScriptSource(script.sourceURL),
                functionName: String(script.sourceFunctionName || '').slice(0, 160) || null
              };
            })
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 5);
          const summary = {
            durationMs: roundOne(durationMs),
            blockingDurationMs: roundOne(entry.blockingDuration),
            startTimeMs: roundOne(startTimeMs),
            renderDurationMs: renderStartMs > 0 ? roundOne(endTimeMs - renderStartMs) : 0,
            styleAndLayoutDurationMs: styleStartMs > 0 ? roundOne(endTimeMs - styleStartMs) : 0,
            scriptDurationMs: roundOne(scriptDurationMs),
            scripts: scriptSummaries
          };
          this._lastLongAnimationFrameAt = startTimeMs;
          this._lastLongAnimationFrameSummary = summary;
          const nearRecentStall = Math.abs(startTimeMs - this._lastStallAt) <= 300;
          if (nearRecentStall) {
            const recentStall = this.events.findLast?.(event => event.category === 'performance' && event.name === 'frame_stall');
            if (recentStall) {
              recentStall.data.nearbyLongAnimationFrame = sanitizeDiagnosticValue(summary);
              if (!recentStall.notes.some(note => note.includes('Long animation frame telemetry'))) {
                recentStall.notes.push(`Long animation frame telemetry: ${summary.scriptDurationMs} ms script, ${summary.renderDurationMs} ms browser render segment.`);
              }
              recentStall.notes = recentStall.notes.filter(note => note !== 'No correlated cause was observed by the current probes.');
              this._dirty = true;
            }
          }
          this.event('performance', 'long_animation_frame', summary, durationMs >= 100 ? 'warning' : 'info',
            nearRecentStall ? ['Frame stall observed near this long animation frame.'] : []);
        }
      });
      this._longAnimationFrameObserver.observe({ entryTypes: ['long-animation-frame'] });
    } catch {
      this._longAnimationFrameObserver = null;
    }
  }

  event(category, name, data = {}, severity = 'info', notes = []) {
    if (!this.enabled || this._destroyed) return null;
    const wall = this.wallNow();
    const entry = {
      seq: this.nextSeq++,
      sessionId: this.sessionId,
      pageId: this.pageId,
      tMs: Math.max(0, wall - this.sessionStartedAt),
      wallTime: new Date(wall).toISOString(),
      category: String(category || 'system').slice(0, 80),
      name: String(name || 'event').slice(0, 120),
      severity: String(severity || 'info').slice(0, 20),
      data: sanitizeDiagnosticValue(data),
      notes: Array.isArray(notes) ? notes.slice(0, 20).map(note => String(note).slice(0, 500)) : []
    };
    this.events.push(entry);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    if (entry.category === 'performance' && entry.name === 'dpr.changed') this._lastDprChangeAt = this.now();
    this._dirty = true;
    this._schedulePersist();
    for (const subscriber of this.subscribers) {
      try { subscriber(entry); } catch {}
    }
    return entry;
  }

  observeFrame(context = {}) {
    if (!this.enabled || this._destroyed) return false;
    const nowMs = finiteNumber(context.nowMs, this.now());
    const active = context.active === true;
    const visible = context.visible !== false;
    if (!active || !visible) {
      this._ignoreFramesUntil = Math.max(this._ignoreFramesUntil, nowMs + 750);
      this._frameWindow = createFrameWindow(nowMs, this.phaseTimingKeys);
      this._lastMovementState = null;
      return false;
    }
    if (nowMs < this._ignoreFramesUntil) return false;

    const frameMs = Math.max(0, finiteNumber(context.frameMs));
    const window = this._frameWindow;
    window.frames++;
    window.totalMs += frameMs;
    window.worstMs = Math.max(window.worstMs, frameMs);
    if (frameMs > 33) window.over33++;
    if (frameMs >= 50) window.over50++;
    const bucketIndex = FRAME_BUCKETS.findIndex(edge => frameMs <= edge);
    window.buckets[bucketIndex < 0 ? window.buckets.length - 1 : bucketIndex]++;
    const drawCalls = Math.max(0, finiteNumber(context.drawCalls));
    const triangles = Math.max(0, finiteNumber(context.triangles));
    const geometries = Math.max(0, finiteNumber(context.geometries));
    const programs = Math.max(0, finiteNumber(context.programs));
    const effectPoolObjects = Math.max(0, finiteNumber(context.effectPoolObjects));
    window.drawCallsTotal += drawCalls;
    window.maxDrawCalls = Math.max(window.maxDrawCalls, drawCalls);
    window.maxTriangles = Math.max(window.maxTriangles, triangles);
    window.maxEnemies = Math.max(window.maxEnemies, Math.max(0, finiteNumber(context.enemies)));
    window.maxEffects = Math.max(window.maxEffects, Math.max(0, finiteNumber(context.effects)));
    if (window.geometryStart == null) window.geometryStart = geometries;
    window.maxGeometries = Math.max(window.maxGeometries, geometries);
    if (window.programStart == null) window.programStart = programs;
    window.maxPrograms = Math.max(window.maxPrograms, programs);
    if (window.effectPoolStart == null) window.effectPoolStart = effectPoolObjects;
    window.maxEffectPoolObjects = Math.max(window.maxEffectPoolObjects, effectPoolObjects);
    window.maxSceneObjects = Math.max(window.maxSceneObjects, Math.max(0, finiteNumber(context.sceneObjects)));
    if (context.phaseTimings && typeof context.phaseTimings === 'object') {
      window.phaseFrames++;
      for (const key of this.phaseTimingKeys) {
        const value = Math.max(0, finiteNumber(context.phaseTimings[key]));
        window.phaseTotals[key] += value;
        window.phaseMaxima[key] = Math.max(window.phaseMaxima[key], value);
      }
      this._observeMovementFrame(window, frameMs, nowMs, context.phaseTimings);
    }

    if (frameMs >= 50) this._recordStall(frameMs, nowMs, context);
    if ((nowMs - window.startedAt) >= 5000) this._emitFrameSample(nowMs, context);
    return true;
  }

  _observeMovementFrame(frameWindow, frameMs, nowMs, phaseTimings) {
    const movement = phaseTimings?.movement;
    if (!movement || typeof movement.moving !== 'boolean') return;
    const state = movement.moving ? 'moving' : 'stationary';
    const stateWindow = frameWindow.movementBreakdown[state];
    stateWindow.frames++;
    stateWindow.totalFrameMs += frameMs;
    stateWindow.worstFrameMs = Math.max(stateWindow.worstFrameMs, frameMs);
    if (frameMs > 33) stateWindow.over33++;
    stateWindow.totalSpeed += Math.max(0, finiteNumber(movement.speedMetersPerSecond));

    const renderMs = Math.max(0, finiteNumber(phaseTimings.renderMs));
    stateWindow.renderFrames++;
    stateWindow.totalRenderMs += renderMs;
    stateWindow.maxRenderMs = Math.max(stateWindow.maxRenderMs, renderMs);

    const renderer = phaseTimings.renderer;
    if (renderer && Number.isFinite(renderer.drawCalls)) {
      const drawCalls = Math.max(0, renderer.drawCalls);
      stateWindow.drawCallFrames++;
      stateWindow.totalDrawCalls += drawCalls;
      stateWindow.maxDrawCalls = Math.max(stateWindow.maxDrawCalls, drawCalls);
    }

    if (this._lastMovementState == null) {
      this._lastMovementState = state;
      return;
    }
    if (state === this._lastMovementState) return;

    const previous = this._lastMovementState;
    this._lastMovementState = state;
    this._lastMovementTransitionAt = nowMs;
    this.event('performance', 'movement_state_changed', {
      from: previous,
      to: state,
      inputActive: movement.inputActive === true,
      speedMetersPerSecond: roundOne(movement.speedMetersPerSecond),
      position: movement.position || null,
      distanceFromCenter: roundOne(movement.distanceFromCenter),
      yawDegrees: roundOne(movement.yawDegrees),
      pitchDegrees: roundOne(movement.pitchDegrees),
      cameraFov: roundOne(movement.cameraFov),
      sprinting: movement.sprinting === true,
      renderMs: roundOne(phaseTimings.renderMs),
      renderer: phaseTimings.renderer || null
    });
  }

  _recordStall(frameMs, nowMs, context) {
    if ((nowMs - this._lastStallAt) < 250) {
      this._suppressedStalls++;
      return;
    }
    const notes = [];
    if (Math.abs(nowMs - this._lastLongTaskAt) <= 300) notes.push('Browser long task observed near this stall.');
    const longAnimationFrameNear = Math.abs(nowMs - this._lastLongAnimationFrameAt) <= 300;
    if (longAnimationFrameNear) notes.push('Long animation frame telemetry was observed near this stall.');
    if ((nowMs - this._lastDprChangeAt) <= 1200) notes.push('Adaptive DPR changed recently.');
    const previous = this._lastSampleContext;
    if (previous && finiteNumber(context.drawCalls) >= finiteNumber(previous.drawCalls) * 1.25 + 10) {
      notes.push('Draw-call count increased relative to the previous sample.');
    }
    if (previous && finiteNumber(context.enemies) >= finiteNumber(previous.enemies) + 5) {
      notes.push('Active enemy count increased relative to the previous sample.');
    }
    if (previous && finiteNumber(context.geometries) >= finiteNumber(previous.geometries) + 20) {
      notes.push('Allocated geometry count increased relative to the previous sample.');
    }
    if (previous && finiteNumber(context.programs) > finiteNumber(previous.programs)) {
      notes.push('Renderer program count increased relative to the previous sample.');
    }
    if (previous && finiteNumber(context.effectPoolObjects) >= finiteNumber(previous.effectPoolObjects) + 8) {
      notes.push('Effect pool capacity increased relative to the previous sample.');
    }
    const phaseTimings = context.phaseTimings;
    const measuredFrame = this._snapshotMeasuredFrame(context);
    const persistenceNear = Math.abs(nowMs - this._lastPersistenceFlushAt) <= 300
      && this._lastPersistenceFlushDurationMs >= 1;
    if (persistenceNear) {
      notes.push(`Diagnostic persistence completed near this stall (${roundOne(this._lastPersistenceFlushDurationMs)} ms).`);
    }
    if (phaseTimings && typeof phaseTimings === 'object') {
      const phases = [
        ['player simulation', phaseTimings.playerSimulationMs],
        ['enemy AI', phaseTimings.enemyAiMs],
        ['effects and pickups', phaseTimings.effectsPickupsMs],
        ['weather and audio', phaseTimings.weatherAudioMs],
        ['housekeeping', phaseTimings.housekeepingMs],
        ['render', phaseTimings.renderMs]
      ];
      let largest = phases[0];
      for (let i = 1; i < phases.length; i++) {
        if (finiteNumber(phases[i][1]) > finiteNumber(largest[1])) largest = phases[i];
      }
      if (finiteNumber(largest[1]) >= 1) {
        notes.push(`Largest measured previous-frame phase was ${largest[0]} (${finiteNumber(largest[1])} ms).`);
      }
      const unattributedMs = finiteNumber(phaseTimings.unattributedMs);
      if (unattributedMs >= Math.max(20, frameMs * 0.5)) {
        notes.push(`${unattributedMs} ms of the frame interval was outside measured game phases.`);
      }
    }
    if (measuredFrame.movement?.moving === true) {
      notes.push(`During the measured frame the player was moving at ${roundOne(measuredFrame.movement.speedMetersPerSecond)} m/s.`);
    } else if (measuredFrame.movement?.moving === false) {
      notes.push('During the measured frame the player was stationary.');
    }
    if ((nowMs - this._lastMovementTransitionAt) <= 1000) {
      notes.push('A movement-state transition was observed within the previous second.');
    }
    if (!notes.length) notes.push('No correlated cause was observed by the current probes.');
    this.event('performance', 'frame_stall', {
      frameMs: Math.round(frameMs * 10) / 10,
      suppressedSincePrevious: this._suppressedStalls,
      ...this._snapshotContext(context),
      nearbyDiagnosticWork: persistenceNear ? {
        name: 'persistence_flush',
        durationMs: roundOne(this._lastPersistenceFlushDurationMs),
        bytes: this._lastPersistenceBytes,
        eventCount: this._lastPersistenceEventCount
      } : null,
      nearbyLongAnimationFrame: longAnimationFrameNear
        ? sanitizeDiagnosticValue(this._lastLongAnimationFrameSummary)
        : null,
      measuredFrame,
      phaseTimings: phaseTimings && typeof phaseTimings === 'object'
        ? sanitizeDiagnosticValue(phaseTimings)
        : null
    }, frameMs >= 100 ? 'error' : 'warning', notes);
    this._suppressedStalls = 0;
    this._lastStallAt = nowMs;
  }

  _snapshotMeasuredFrame(context) {
    const phaseTimings = context.phaseTimings;
    return sanitizeDiagnosticValue({
      movement: phaseTimings?.movement || null,
      renderer: phaseTimings?.renderer || null
    });
  }

  _snapshotContext(context) {
    return sanitizeDiagnosticValue({
      dpr: context.dpr,
      drawCalls: context.drawCalls,
      triangles: context.triangles,
      textures: context.textures,
      geometries: context.geometries,
      programs: context.programs,
      sceneObjects: context.sceneObjects,
      effectPoolObjects: context.effectPoolObjects,
      enemies: context.enemies,
      projectiles: context.projectiles,
      effects: context.effects,
      pickups: context.pickups,
      wave: context.wave,
      weather: context.weather,
      paused: context.paused,
      visible: context.visible
    });
  }

  _emitFrameSample(nowMs, context) {
    const window = this._frameWindow;
    const averageFrameMs = window.frames ? window.totalMs / window.frames : 0;
    const slowFramePercent = window.frames ? (window.over33 / window.frames) * 100 : 0;
    const phaseAveragesMs = {};
    const phaseMaximaMs = {};
    for (const key of this.phaseTimingKeys) {
      phaseAveragesMs[key] = window.phaseFrames ? roundOne(window.phaseTotals[key] / window.phaseFrames) : 0;
      phaseMaximaMs[key] = roundOne(window.phaseMaxima[key]);
    }
    const data = {
      windowMs: Math.round(nowMs - window.startedAt),
      frames: window.frames,
      averageFps: averageFrameMs > 0 ? Math.round((1000 / averageFrameMs) * 10) / 10 : 0,
      p95FrameMs: Math.min(Math.round(window.worstMs * 10) / 10, approximatePercentile(window, 0.95)),
      worstFrameMs: Math.round(window.worstMs * 10) / 10,
      framesOver33Ms: window.over33,
      framesOver50Ms: window.over50,
      framesOver33Percent: roundOne(slowFramePercent),
      averageDrawCalls: window.frames ? roundOne(window.drawCallsTotal / window.frames) : 0,
      maxDrawCalls: window.maxDrawCalls,
      maxTriangles: window.maxTriangles,
      maxEnemies: window.maxEnemies,
      maxEffects: window.maxEffects,
      geometryGrowth: Math.max(0, window.maxGeometries - finiteNumber(window.geometryStart)),
      maxGeometries: window.maxGeometries,
      programGrowth: Math.max(0, window.maxPrograms - finiteNumber(window.programStart)),
      maxPrograms: window.maxPrograms,
      effectPoolGrowth: Math.max(0, window.maxEffectPoolObjects - finiteNumber(window.effectPoolStart)),
      maxEffectPoolObjects: window.maxEffectPoolObjects,
      maxSceneObjects: window.maxSceneObjects,
      phaseAveragesMs,
      phaseMaximaMs,
      movementBreakdown: {
        moving: summarizeMovementFrameWindow(window.movementBreakdown.moving),
        stationary: summarizeMovementFrameWindow(window.movementBreakdown.stationary)
      },
      ...this._snapshotContext(context)
    };
    const notes = [];
    if (slowFramePercent >= 5) notes.push(`${roundOne(slowFramePercent)}% of frames exceeded 33 ms in this sample window.`);
    if (data.framesOver50Ms > 0) notes.push('One or more visible gameplay stalls occurred in this sample window.');
    if (data.geometryGrowth >= 20) notes.push(`Allocated geometry count increased by ${data.geometryGrowth} within this sample window.`);
    if (data.programGrowth > 0) notes.push(`Renderer program count increased by ${data.programGrowth} within this sample window.`);
    if (data.effectPoolGrowth >= 8) notes.push(`Effect pool capacity increased by ${data.effectPoolGrowth} objects within this sample window.`);
    const movingFrames = data.movementBreakdown.moving.frames;
    const stationaryFrames = data.movementBreakdown.stationary.frames;
    const movingRenderMs = data.movementBreakdown.moving.averageRenderMs;
    const stationaryRenderMs = data.movementBreakdown.stationary.averageRenderMs;
    if (movingFrames >= 10 && stationaryFrames >= 10 && movingRenderMs >= stationaryRenderMs * 1.5 + 2) {
      notes.push(`Moving frames averaged ${movingRenderMs} ms render versus ${stationaryRenderMs} ms while stationary; this is a correlation, not a confirmed cause.`);
    }
    this.event('performance', 'frame_sample', data, data.framesOver50Ms ? 'warning' : 'info', notes);
    this._lastSampleContext = this._snapshotContext(context);
    this._frameWindow = createFrameWindow(nowMs, this.phaseTimingKeys);
  }

  getEvents() {
    if (!this.enabled) return [];
    return this.events.map(event => sanitizeRestoredEvent(event)).filter(Boolean);
  }

  exportReport(environment = {}) {
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      capturedAt: new Date(this.wallNow()).toISOString(),
      sessionId: this.sessionId || null,
      pageId: this.pageId || null,
      environment: sanitizeDiagnosticValue(environment),
      events: this.getEvents()
    }, null, 2);
  }

  clear() {
    if (!this.enabled) return;
    this.events.length = 0;
    this.nextSeq = 1;
    this._dirty = false;
    this._cancelPersist();
    if (this.persistenceEnabled) {
      try { this.storage?.removeItem?.(this.storageKey); } catch {}
    }
    for (const subscriber of this.subscribers) {
      try { subscriber(null); } catch {}
    }
  }

  subscribe(subscriber) {
    if (!this.enabled || typeof subscriber !== 'function') return () => {};
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  _schedulePersist() {
    if (!this.enabled || !this.persistenceEnabled || this._persistTimer != null || typeof this.setTimeoutFn !== 'function') return;
    this._persistTimer = this.setTimeoutFn(() => {
      this._persistTimer = null;
      if (typeof this.requestIdleCallbackFn === 'function') {
        this._idleHandle = this.requestIdleCallbackFn(() => {
          this._idleHandle = null;
          this.flush();
        }, { timeout: 1000 });
      } else {
        this.flush();
      }
    }, this.persistDelayMs);
  }

  _cancelPersist() {
    if (this._persistTimer != null && typeof this.clearTimeoutFn === 'function') this.clearTimeoutFn(this._persistTimer);
    if (this._idleHandle != null && typeof this.cancelIdleCallbackFn === 'function') this.cancelIdleCallbackFn(this._idleHandle);
    this._persistTimer = null;
    this._idleHandle = null;
  }

  flush() {
    if (!this.enabled || !this.persistenceEnabled || !this._dirty) return false;
    this._cancelPersist();
    const startedAt = this.now();
    try {
      const serialized = JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        sessionId: this.sessionId,
        sessionStartedAt: this.sessionStartedAt,
        nextSeq: this.nextSeq,
        events: this.events
      });
      this.storage?.setItem?.(this.storageKey, serialized);
      this._dirty = false;
      this._lastPersistenceFlushAt = this.now();
      this._lastPersistenceFlushDurationMs = Math.max(0, this._lastPersistenceFlushAt - startedAt);
      this._lastPersistenceBytes = serialized.length;
      this._lastPersistenceEventCount = this.events.length;
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    if (this._destroyed) return;
    this.flush();
    this._destroyed = true;
    this._cancelPersist();
    this._observer?.disconnect?.();
    this._longAnimationFrameObserver?.disconnect?.();
    this.eventTarget?.removeEventListener?.('pagehide', this._boundPageHide);
    this.subscribers.clear();
  }
}

export function collectDebugEnvironment({ renderer, params, version, seed, quality } = {}) {
  const environment = {
    version: version || null,
    seed: seed || null,
    quality: quality || null,
    urlParams: {},
    browser: {
      userAgent: globalThis.navigator?.userAgent || null,
      platform: globalThis.navigator?.platform || null,
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency || null,
      deviceMemoryGb: globalThis.navigator?.deviceMemory || null
    },
    display: {
      viewportWidth: globalThis.innerWidth || null,
      viewportHeight: globalThis.innerHeight || null,
      devicePixelRatio: globalThis.devicePixelRatio || 1
    },
    webgl: {}
  };
  for (const key of SAFE_PARAM_KEYS) {
    if (params?.has?.(key)) environment.urlParams[key] = params.get(key);
  }
  if (params?.has?.('level')) {
    const level = params.get('level') || '';
    environment.urlParams.level = level.trim().startsWith('{') ? '[inline-level-omitted]' : level.slice(0, 160);
  }
  try {
    const gl = renderer?.getContext?.();
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    environment.webgl.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl?.getParameter?.(gl.VENDOR);
    environment.webgl.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER);
    environment.webgl.version = gl?.getParameter?.(gl.VERSION) || null;
  } catch {
    environment.webgl = { unavailable: true };
  }
  return sanitizeDiagnosticValue(environment);
}

export function formatDiagnosticEvent(event) {
  if (!event) return '';
  const seconds = (finiteNumber(event.tMs) / 1000).toFixed(3).padStart(9, ' ');
  const severity = String(event.severity || 'info').toUpperCase().padEnd(7, ' ');
  const label = `${event.category}.${event.name}`;
  const details = event.data && Object.keys(event.data).length ? ` ${JSON.stringify(event.data)}` : '';
  const notes = event.notes?.length ? ` | ${event.notes.join(' ')}` : '';
  return `[+${seconds}s] ${severity} ${label}${details}${notes}`;
}
