function freezeRoster(roster) {
  return Object.freeze({ ...roster });
}

export const WAVE72_ENCOUNTER = Object.freeze({
  wave: 72,
  id: 'last_light',
  name: 'Last Light',
  packageCount: 4,
  clearFractionPerSurge: 0.4,
  minimumSurgeIntervalSeconds: 18,
  surgeWarningSeconds: 3,
  spawnIntervalSeconds: 0.12,
  activeCap: 60,
  roleCaps: freezeRoster({
    tank: 6,
    flyer: 10,
    healer: 2
  }),
  initialRoster: freezeRoster({
    grunt: 10,
    gruntling: 10,
    rusher: 12,
    tank: 3,
    flyer: 5,
    healer: 1,
    warden: 1
  }),
  reinforcementRoster: freezeRoster({
    grunt: 10,
    gruntling: 10,
    rusher: 12,
    tank: 3,
    flyer: 5,
    healer: 1
  })
});

export function expandWaveRoster(roster) {
  const types = [];
  for (const [type, count] of Object.entries(roster || {})) {
    for (let index = 0; index < count; index++) types.push(type);
  }
  return types;
}

export function getSpecialWaveDefinition(wave) {
  return wave === WAVE72_ENCOUNTER.wave ? WAVE72_ENCOUNTER : null;
}
