export const ABILITY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'dynamite',
    cost: 28,
    costs: Object.freeze([28, 40]),
    maxGrade: 2,
    cooldownSeconds: 35,
    maxCharges: 2,
    gradeProfiles: Object.freeze([
      Object.freeze({ grade: 1, maxCharges: 2, cooldownSeconds: 35, baseDamage: 108, blastRadius: 3.1 }),
      Object.freeze({ grade: 2, maxCharges: 3, cooldownSeconds: 35, baseDamage: 150, blastRadius: 5.2 })
    ]),
    nameKey: 'ability.dynamite.name',
    descriptionKey: 'ability.dynamite.desc',
    icon: 'assets/icons/weapon-dynamite.svg'
  }),
  Object.freeze({
    id: 'gravity_well',
    cost: 55,
    cooldownSeconds: 90,
    maxCharges: 1,
    nameKey: 'ability.gravityWell.name',
    descriptionKey: 'ability.gravityWell.desc',
    icon: 'assets/icons/weapon-gravitywell.svg'
  }),
  Object.freeze({
    id: 'satellite_strike',
    cost: 42,
    cooldownSeconds: 42,
    maxCharges: 1,
    nameKey: 'ability.satelliteStrike.name',
    descriptionKey: 'ability.satelliteStrike.desc',
    icon: 'assets/icons/weapon-satellite.svg'
  }),
  Object.freeze({
    id: 'punchline_rush',
    cost: 10,
    cooldownSeconds: 17,
    maxCharges: 1,
    nameKey: 'mutation.rush.name',
    descriptionKey: 'ability.punchlineRush.desc',
    icon: 'assets/icons/ability-punchline-rush.svg'
  }),
  Object.freeze({
    id: 'supply_drop',
    cost: 15,
    cooldownSeconds: 60,
    maxCharges: 1,
    nameKey: 'ability.supplyDrop.name',
    descriptionKey: 'ability.supplyDrop.desc',
    icon: 'assets/icons/ability-supply-drop.svg'
  }),
  Object.freeze({
    id: 'overtime',
    cost: 15,
    cooldownSeconds: 12,
    maxCharges: 1,
    nameKey: 'ability.overtime.name',
    descriptionKey: 'ability.overtime.desc',
    icon: 'assets/icons/ability-overtime.svg'
  }),
  Object.freeze({
    id: 'engagement_bait',
    cost: 15,
    cooldownSeconds: 45,
    maxCharges: 1,
    nameKey: 'ability.engagementBait.name',
    descriptionKey: 'ability.engagementBait.desc',
    icon: 'assets/icons/ability-engagement-bait.svg'
  })
]);

export const ABILITY_BY_ID = new Map(ABILITY_DEFINITIONS.map(definition => [definition.id, definition]));

export function resolveAbilityGradeProfile(definitionOrId, grade = 1) {
  const definition = typeof definitionOrId === 'string' ? ABILITY_BY_ID.get(normalizeAbilityId(definitionOrId)) : definitionOrId;
  if (!definition) return null;
  const resolvedGrade = Math.max(1, Math.min(definition.maxGrade || 1, Math.floor(Number(grade) || 1)));
  const gradeProfile = definition.gradeProfiles?.[resolvedGrade - 1] || {};
  return {
    grade: resolvedGrade,
    maxCharges: gradeProfile.maxCharges ?? definition.maxCharges,
    cooldownSeconds: gradeProfile.cooldownSeconds ?? definition.cooldownSeconds,
    baseDamage: gradeProfile.baseDamage,
    blastRadius: gradeProfile.blastRadius
  };
}

export function normalizeAbilityId(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized === 'gravitywell') return 'gravity_well';
  if (normalized === 'satellite' || normalized === 'satellitestrike') return 'satellite_strike';
  if (normalized === 'rush' || normalized === 'punchlinerush') return 'punchline_rush';
  if (normalized === 'supply' || normalized === 'supplydrop') return 'supply_drop';
  if (normalized === 'engagementbait' || normalized === 'bait') return 'engagement_bait';
  return normalized;
}

export function resolveDebugAbility(params) {
  if (!params?.get) return null;
  const direct = normalizeAbilityId(params.get('ability') || params.get('skill'));
  if (ABILITY_BY_ID.has(direct)) return direct;
  const flags = [
    ['dynamite', 'dynamite'],
    ['gravityWell', 'gravity_well'],
    ['gravitywell', 'gravity_well'],
    ['satellite', 'satellite_strike'],
    ['rush', 'punchline_rush'],
    ['supply', 'supply_drop'],
    ['supplyDrop', 'supply_drop'],
    ['overtime', 'overtime'],
    ['bait', 'engagement_bait'],
    ['engagementBait', 'engagement_bait']
  ];
  return flags.find(([flag]) => params.get(flag) === '1')?.[1] || null;
}
