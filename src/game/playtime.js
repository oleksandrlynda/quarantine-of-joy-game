import { getNumber, setNumber } from '../util/storage.js';

export const PLAYTIME_STORAGE_KEY = 'bs3d_playtime_seconds';

function ukrainianUnit(value, one, few, many) {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 14) return many;
  const remainder10 = value % 10;
  if (remainder10 === 1) return one;
  if (remainder10 >= 2 && remainder10 <= 4) return few;
  return many;
}

export function formatPlaytime(totalSeconds, locale = 'en') {
  const totalMinutes = Math.max(0, Math.floor((Number(totalSeconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (String(locale).toLowerCase().startsWith('uk')) {
    const minuteText = `${minutes} ${ukrainianUnit(minutes, 'хвилина', 'хвилини', 'хвилин')}`;
    if (hours === 0) return minuteText;
    const hourText = `${hours} ${ukrainianUnit(hours, 'година', 'години', 'годин')}`;
    return minutes === 0 ? hourText : `${hourText} ${minuteText}`;
  }

  const minuteText = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (hours === 0) return minuteText;
  if (minutes === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${minuteText}`;
}

export class PlaytimeTracker {
  constructor({
    storage,
    storageKey = PLAYTIME_STORAGE_KEY,
    saveIntervalSeconds = 15
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.saveIntervalSeconds = Math.max(1, Number(saveIntervalSeconds) || 15);
    this.totalSeconds = Math.max(0, getNumber(storageKey, 0, storage));
    this.unsavedSeconds = 0;
  }

  add(deltaSeconds) {
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta <= 0) return this.totalSeconds;
    this.totalSeconds += delta;
    this.unsavedSeconds += delta;
    if (this.unsavedSeconds >= this.saveIntervalSeconds) this.persist();
    return this.totalSeconds;
  }

  persist() {
    if (this.unsavedSeconds <= 0) return true;
    const saved = setNumber(this.storageKey, this.totalSeconds, this.storage);
    if (saved) this.unsavedSeconds = 0;
    return saved;
  }

  reset() {
    this.totalSeconds = 0;
    this.unsavedSeconds = 0;
  }
}
