const DEFAULT_TIMING = Object.freeze({
  coverMs: 320,
  minimumCoveredMs: 2200,
  revealMs: 900,
  targetMaximumMs: 5000
});

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultDelay(ms) {
  return new Promise(resolve => globalThis.setTimeout(resolve, Math.max(0, ms)));
}

function setPhase(element, phase) {
  if (!element) return;
  element.dataset.phase = phase;
  element.classList.toggle('is-covering', phase === 'covering');
  element.classList.toggle('is-covered', phase === 'covered');
  element.classList.toggle('is-revealing', phase === 'revealing');
}

/**
 * Keeps level construction and first-use GPU work behind a compositor-friendly
 * vision veil. The controller never marks the game as paused: callers use the
 * synchronous `active` flag to gate simulation while browser timers and the
 * transition animation continue to run.
 */
export class LevelTransitionController {
  constructor({
    documentRef = globalThis.document,
    element = documentRef?.getElementById?.('levelTransition') || null,
    labelElement = documentRef?.getElementById?.('levelTransitionLabel') || null,
    coverMs = DEFAULT_TIMING.coverMs,
    minimumCoveredMs = DEFAULT_TIMING.minimumCoveredMs,
    revealMs = DEFAULT_TIMING.revealMs,
    targetMaximumMs = DEFAULT_TIMING.targetMaximumMs,
    now = defaultNow,
    delay = defaultDelay,
    onFreeze = () => {},
    onThaw = () => {},
    onEvent = () => {}
  } = {}) {
    this.document = documentRef;
    this.element = element;
    this.labelElement = labelElement;
    this.coverMs = Math.max(0, Number(coverMs) || 0);
    this.minimumCoveredMs = Math.max(0, Number(minimumCoveredMs) || 0);
    this.revealMs = Math.max(0, Number(revealMs) || 0);
    this.targetMaximumMs = Math.max(0, Number(targetMaximumMs) || 0);
    this.now = typeof now === 'function' ? now : defaultNow;
    this.delay = typeof delay === 'function' ? delay : defaultDelay;
    this.onFreeze = typeof onFreeze === 'function' ? onFreeze : () => {};
    this.onThaw = typeof onThaw === 'function' ? onThaw : () => {};
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.active = false;
    this.phase = 'idle';
    this.current = null;
    this._runPromise = null;
  }

  run({
    fromId = null,
    toId = null,
    label = '',
    theme = 'neutral',
    prepare = () => {},
    precompile = () => {}
  } = {}) {
    if (this._runPromise) return this._runPromise;

    const startedAt = this.now();
    this.active = true;
    this.phase = 'covering';
    this.current = { fromId, toId, theme, startedAt };
    this.document?.body?.classList?.add?.('level-transition-active');
    if (this.element) {
      this.element.hidden = false;
      this.element.dataset.theme = theme;
      this.element.setAttribute?.('aria-hidden', 'false');
      // Commit the transparent base state before applying the cover class.
      // Otherwise a freshly unhidden element can skip the intended fade and
      // expose a frame of synchronous level construction.
      void this.element.offsetWidth;
      setPhase(this.element, 'covering');
    }
    if (this.labelElement) this.labelElement.textContent = label;
    this.onFreeze({ fromId, toId, theme });
    this.onEvent('start', { fromId, toId, theme, startedAt });

    this._runPromise = this._execute({ fromId, toId, theme, startedAt, prepare, precompile })
      .finally(() => {
        this.phase = 'idle';
        this.active = false;
        this.current = null;
        this._runPromise = null;
        this.document?.body?.classList?.remove?.('level-transition-active');
        if (this.element) {
          this.element.hidden = true;
          this.element.dataset.phase = 'idle';
          this.element.setAttribute?.('aria-hidden', 'true');
          this.element.classList.remove('is-covering', 'is-covered', 'is-revealing');
        }
        this.onThaw({ fromId, toId, theme });
      });

    return this._runPromise;
  }

  async _execute({ fromId, toId, theme, startedAt, prepare, precompile }) {
    let failure = null;
    await this.delay(this.coverMs);
    const coveredAt = this.now();
    this.phase = 'covered';
    setPhase(this.element, 'covered');
    this.onEvent('covered', { fromId, toId, theme, elapsedMs: coveredAt - startedAt });

    try {
      const prepared = await prepare();
      await precompile(prepared);
    } catch (error) {
      failure = error;
      this.onEvent('error', {
        fromId,
        toId,
        theme,
        elapsedMs: this.now() - startedAt,
        message: String(error?.message || error || 'Level transition failed')
      });
    }

    const coveredElapsed = this.now() - coveredAt;
    if (coveredElapsed < this.minimumCoveredMs) {
      await this.delay(this.minimumCoveredMs - coveredElapsed);
    }

    const readyAt = this.now();
    const elapsedMs = readyAt - startedAt;
    if (this.targetMaximumMs > 0 && elapsedMs > this.targetMaximumMs) {
      this.onEvent('overdue', { fromId, toId, theme, elapsedMs, targetMaximumMs: this.targetMaximumMs });
    }
    this.phase = 'revealing';
    setPhase(this.element, 'revealing');
    this.onEvent('ready', { fromId, toId, theme, elapsedMs });
    await this.delay(this.revealMs);
    this.onEvent('complete', { fromId, toId, theme, elapsedMs: this.now() - startedAt });

    if (failure) throw failure;
    return { fromId, toId, theme, elapsedMs };
  }
}

export { DEFAULT_TIMING as LEVEL_TRANSITION_TIMING };
