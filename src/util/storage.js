function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readRaw(key, storage = defaultStorage()) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value, storage = defaultStorage()) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageValue(key, storage = defaultStorage()) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

export function getString(key, defaultValue = '', storage = defaultStorage()) {
  const value = readRaw(key, storage);
  return value == null ? defaultValue : String(value);
}

export function setString(key, value, storage = defaultStorage()) {
  return writeRaw(key, String(value), storage);
}

export function getNumber(key, defaultValue = 0, storage = defaultStorage()) {
  const value = readRaw(key, storage);
  if (value == null || value === '') return defaultValue;
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

export function setNumber(key, value, storage = defaultStorage()) {
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  return writeRaw(key, String(number), storage);
}

export function setMaxNumber(key, value, defaultValue = 0, storage = defaultStorage()) {
  const current = getNumber(key, defaultValue, storage);
  const next = Number(value);
  if (!Number.isFinite(next) || next <= current) return current;
  setNumber(key, next, storage);
  return next;
}

export function getJSON(key, defaultValue = null, storage = defaultStorage()) {
  const value = readRaw(key, storage);
  if (value == null || value === '') return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

export function setJSON(key, value, storage = defaultStorage()) {
  try {
    return writeRaw(key, JSON.stringify(value), storage);
  } catch {
    return false;
  }
}
