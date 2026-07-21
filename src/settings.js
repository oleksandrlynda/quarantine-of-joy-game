export const DEFAULT_QUALITY = 'med';
export const QUALITY_PRESETS = Object.freeze(['low', 'med', 'high', 'ultra']);

export function normalizeQuality(value) {
  return QUALITY_PRESETS.includes(value) ? value : DEFAULT_QUALITY;
}

export function clampSettingVolume(value, fallback = 0) {
  const parsed = value == null || value === '' ? NaN : Number(value);
  const resolved = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(0, Math.min(1, Number.isFinite(resolved) ? resolved : 0));
}

export function resolveAudioVolumes({ legacy = 1, effects, music } = {}) {
  const legacyVolume = clampSettingVolume(legacy, 1);
  return {
    effects: clampSettingVolume(effects, legacyVolume),
    music: clampSettingVolume(music, legacyVolume)
  };
}
