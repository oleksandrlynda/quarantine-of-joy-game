export const ABILITY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'dynamite',
    cost: 35,
    cooldownSeconds: 25,
    maxCharges: 3,
    nameKey: 'ability.dynamite.name',
    descriptionKey: 'ability.dynamite.desc',
    icon: 'assets/icons/weapon-dynamite.svg'
  }),
  Object.freeze({
    id: 'gravity_well',
    cost: 70,
    cooldownSeconds: 40,
    maxCharges: 1,
    nameKey: 'ability.gravityWell.name',
    descriptionKey: 'ability.gravityWell.desc',
    icon: 'assets/icons/weapon-gravitywell.svg'
  }),
  Object.freeze({
    id: 'satellite_strike',
    cost: 32,
    cooldownSeconds: 32,
    maxCharges: 1,
    nameKey: 'ability.satelliteStrike.name',
    descriptionKey: 'ability.satelliteStrike.desc',
    icon: 'assets/icons/weapon-satellite.svg'
  }),
  Object.freeze({
    id: 'punchline_rush',
    cost: 10,
    cooldownSeconds: 12,
    maxCharges: 1,
    nameKey: 'mutation.rush.name',
    descriptionKey: 'ability.punchlineRush.desc',
    icon: 'assets/icons/ability-punchline-rush.svg'
  })
]);

export const ABILITY_BY_ID = new Map(ABILITY_DEFINITIONS.map(definition => [definition.id, definition]));

export function normalizeAbilityId(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized === 'gravitywell') return 'gravity_well';
  if (normalized === 'satellite' || normalized === 'satellitestrike') return 'satellite_strike';
  if (normalized === 'rush' || normalized === 'punchlinerush') return 'punchline_rush';
  return normalized;
}
