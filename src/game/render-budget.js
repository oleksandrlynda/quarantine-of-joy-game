export const TARGET_FRAME_MS = 1000 / 60;
export const ADAPTIVE_DPR_MIN = 0.8;
export const ADAPTIVE_DPR_MAX = 1.5;
export const ADAPTIVE_DPR_START = 1.25;

const DPR_DOWNSCALE_MS = 1000 / 55;
const DPR_UPSCALE_MS = 1000 / 59;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundDpr(value) {
  return Math.round(value * 20) / 20;
}

export function shouldPrewarmShaders(warmupParam) {
  return warmupParam !== '0';
}

export function createDprBudget(deviceDpr = 1, adaptive = true) {
  const nativeDpr = finitePositive(deviceDpr, 1);
  const max = adaptive
    ? Math.min(ADAPTIVE_DPR_MAX, nativeDpr)
    : Math.min(2, nativeDpr);
  const min = Math.min(ADAPTIVE_DPR_MIN, max);
  const initial = adaptive ? Math.min(ADAPTIVE_DPR_START, max) : max;
  return { min, max, initial };
}

export function nextAdaptiveDpr(current, frameEmaMs, budget) {
  const min = finitePositive(budget?.min, ADAPTIVE_DPR_MIN);
  const max = Math.max(min, finitePositive(budget?.max, ADAPTIVE_DPR_MAX));
  const dpr = Math.min(max, Math.max(min, finitePositive(current, min)));

  if (frameEmaMs > DPR_DOWNSCALE_MS && dpr > min) {
    return Math.max(min, roundDpr(dpr - 0.1));
  }
  if (frameEmaMs < DPR_UPSCALE_MS && dpr < max) {
    return Math.min(max, roundDpr(dpr + 0.05));
  }
  return dpr;
}

// Preserve the fractional remainder of capped RAF intervals. Without this,
// displays whose refresh rate is not a multiple of 60 settle into a lower,
// uneven cadence (for example roughly 48 FPS on a 144 Hz display).
export function scheduleCappedFrame(now, lastScheduledAt, frameMs = TARGET_FRAME_MS) {
  const interval = finitePositive(frameMs, TARGET_FRAME_MS);
  const elapsed = Math.max(0, now - lastScheduledAt);
  // Browser RAF timestamps on a nominal 60 Hz display commonly arrive a few
  // tenths of a millisecond before 16.667 ms. Treat that as the same refresh;
  // otherwise one early callback is rejected and becomes a visible 33 ms frame.
  const earlyToleranceMs = Math.min(0.75, interval * 0.04);
  if (elapsed < interval - earlyToleranceMs) {
    return { shouldRender: false, lastScheduledAt };
  }
  if (elapsed < interval) {
    return { shouldRender: true, lastScheduledAt: now };
  }
  return {
    shouldRender: true,
    lastScheduledAt: now - (elapsed % interval)
  };
}
