export const DEFAULT_GAMEPLAY_THRESHOLDS = Object.freeze({
  shots: 1000,
  kills: 50,
  enemies: 50,
  particles: 3000
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export class GameplayEventAggregator {
  constructor({ enabled = false, thresholds = DEFAULT_GAMEPLAY_THRESHOLDS, onBatch } = {}) {
    this.enabled = enabled === true;
    if (!this.enabled) return;
    this.thresholds = { ...thresholds };
    this.onBatch = typeof onBatch === 'function' ? onBatch : null;
    this.totals = Object.create(null);
    this.windows = Object.create(null);
  }

  record(metric, amount = 1, nowMs = 0, wave = 0, score = 0, detail = null) {
    if (!this.enabled) return null;
    const threshold = Math.max(1, Math.floor(finite(this.thresholds[metric], Infinity)));
    const increment = Math.max(0, Math.floor(finite(amount)));
    if (!increment || !Number.isFinite(threshold)) return null;

    this.totals[metric] = (this.totals[metric] || 0) + increment;
    let window = this.windows[metric];
    if (!window) {
      window = this.windows[metric] = {
        count: 0,
        startedAtMs: finite(nowMs),
        startWave: finite(wave),
        startScore: finite(score),
        breakdown: Object.create(null)
      };
    }
    window.count += increment;
    if (detail != null) {
      const key = String(detail).slice(0, 80);
      window.breakdown[key] = (window.breakdown[key] || 0) + increment;
    }
    if (window.count < threshold) return null;

    const endedAtMs = finite(nowMs, window.startedAtMs);
    const batch = {
      metric,
      count: window.count,
      threshold,
      total: this.totals[metric],
      range: {
        startedAtMs: window.startedAtMs,
        endedAtMs,
        durationMs: Math.max(0, endedAtMs - window.startedAtMs),
        startWave: window.startWave,
        endWave: finite(wave),
        startScore: window.startScore,
        endScore: finite(score)
      }
    };
    if (Object.keys(window.breakdown).length) batch.breakdown = { ...window.breakdown };
    delete this.windows[metric];
    try { this.onBatch?.(batch); } catch {}
    return batch;
  }

  getTotals() {
    if (!this.enabled) return {};
    return { ...this.totals };
  }

  reset() {
    if (!this.enabled) return;
    this.totals = Object.create(null);
    this.windows = Object.create(null);
  }
}
