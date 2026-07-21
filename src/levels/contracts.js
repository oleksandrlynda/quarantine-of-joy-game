/**
 * Runtime contracts for authored campaign levels. These factories deliberately
 * return plain data so definitions can be validated in Node without WebGL.
 */
export function defineSpawnEntrance(entrance) {
  return Object.freeze({
    activeWaves: [1, 5],
    clearance: {},
    air: false,
    ...entrance,
    position: Object.freeze([...entrance.position]),
    facing: Object.freeze([...entrance.facing]),
    allow: Object.freeze([...entrance.allow]),
    activeWaves: Object.freeze([...(entrance.activeWaves || [1, 5])]),
    clearance: Object.freeze({ ...(entrance.clearance || {}) })
  });
}

export function defineEncounterWave(wave) {
  return Object.freeze({
    ...wave,
    packages: Object.freeze((wave.packages || []).map(pkg => Object.freeze([...pkg]))),
    ammoPackages: Object.freeze((wave.ammoPackages || []).map(position => Object.freeze([...position]))),
    healthPackages: Object.freeze((wave.healthPackages || []).map(position => Object.freeze([...position])))
  });
}

export function defineCaptureObjective(objective) {
  return Object.freeze({ contested: true, decay: false, ...objective });
}

export function defineLevel(level) {
  return Object.freeze({ ...level });
}

function shiftWaveRecord(record, offset) {
  if (!record) return record;
  return Object.freeze(Object.fromEntries(Object.entries(record).map(([wave, value]) => [Number(wave) + offset, value])));
}

/**
 * Moves a complete authored level along the campaign timeline while preserving
 * its local encounter design. This is intentionally centralized so entrances,
 * objectives, weather, and checkpoint metadata cannot drift apart.
 */
export function shiftLevelWaves(level, offset = 0) {
  const amount = Math.floor(Number(offset) || 0);
  if (!amount) return level;
  return defineLevel({
    ...level,
    waveOffset: (Number(level.waveOffset) || 0) + amount,
    firstWave: level.firstWave + amount,
    finalWave: level.finalWave + amount,
    ...(Number.isFinite(level.bossWave) ? { bossWave: level.bossWave + amount } : {}),
    entrances: Object.freeze((level.entrances || []).map(entrance => defineSpawnEntrance({
      ...entrance,
      activeWaves: entrance.activeWaves.map(wave => wave + amount)
    }))),
    waves: shiftWaveRecord(level.waves, amount),
    weatherByWave: shiftWaveRecord(level.weatherByWave, amount),
    stormByWave: shiftWaveRecord(level.stormByWave, amount),
    waterByWave: shiftWaveRecord(level.waterByWave, amount),
    checkpointStarts: shiftWaveRecord(level.checkpointStarts, amount)
  });
}

export function entranceClearanceFor(entrance, enemyType) {
  return Number(entrance?.clearance?.[enemyType] ?? entrance?.clearance?.default ?? 1);
}

export function validateSpawnEntrance(entrance) {
  const errors = [];
  if (!entrance?.id) errors.push('missing id');
  if (!Array.isArray(entrance?.position) || entrance.position.length !== 3 || !entrance.position.every(Number.isFinite)) {
    errors.push('position must contain three finite coordinates');
  }
  if (!Array.isArray(entrance?.facing) || entrance.facing.length !== 3 || !entrance.facing.every(Number.isFinite)) {
    errors.push('facing must contain three finite coordinates');
  } else if (Math.hypot(...entrance.facing) < 0.001) {
    errors.push('facing must be non-zero');
  }
  if (!Array.isArray(entrance?.allow) || entrance.allow.length === 0) errors.push('allowlist must not be empty');
  if (!Array.isArray(entrance?.activeWaves) || entrance.activeWaves.length !== 2 || !entrance.activeWaves.every(Number.isFinite)) {
    errors.push('activeWaves must be a finite [first,last] range');
  }
  for (const type of entrance?.allow || []) {
    if (!(entranceClearanceFor(entrance, type) > 0)) errors.push(`clearance for ${type} must be positive`);
  }
  return errors;
}
