import { getJSON, setJSON } from './util/storage.js';
import { ABILITY_BY_ID, normalizeAbilityId } from './abilities/definitions.js?v=1.0.3-dynamite-grade2';

export const ARCHIVE_STORAGE_KEY = 'qoj_archive_v1';
export const ARCHIVE_SCHEMA_VERSION = 11;
export const SURVIVAL_EARLY_UNLOCK_WAVE = 5;
export const SURVIVAL_UNLOCK_WAVE = 10;
export const ARCHIVE_MILESTONE_WAVES = Object.freeze([15, 30, 45, 60]);
export const MUTATION_OFFER_WAVES = Object.freeze([1, 7, 9, 13, 15, 17, 19, 21, 23]);
export const MAX_RUN_MUTATION_POINTS = 10;
export const CROWD_HECKLER_REFUND = 7;
export const CALLBACK_ELIMINATION_CADENCE = 8;
export const AMMO_REGEN_INTERVAL_SECONDS = 10;
export const AMMO_REGEN_BASE_RESERVE_RATE = 0.05;
export const RESERVE_EXPANSION_PER_GRADE = 0.30;
export const STANDARD_MUTATION_RANK_CAPS = Object.freeze([2, 4, 6, 8, 10]);
export const STANDARD_MUTATION_RANK_UPGRADE_COSTS = Object.freeze([2, 2, 3, 3]);

export function resolveDebugShopCredits(params) {
  if (!params?.get) return null;
  const raw = params.get('credits') ?? params.get('fragments');
  if (raw != null && raw !== '') {
    const requested = Math.floor(Number(raw));
    if (Number.isFinite(requested)) return Math.max(200, Math.min(400, requested));
  }
  return params.get('shop') === '1' || params.get('archive') === '1' ? 300 : null;
}

export const CLASSIFIED_WEAPON_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'rifle', cost: 10, revealType: 'wave', revealWave: 6, revealKey: 'classified.rifle.reveal', revealedKey: 'classified.rifle.revealed', nameKey: 'classified.rifle.name', descriptionKey: 'classified.rifle.desc' }),
  Object.freeze({ id: 'dmr', cost: 18, revealType: 'boss', revealWave: 10, revealKey: 'classified.dmr.reveal', revealedKey: 'classified.dmr.revealed', nameKey: 'classified.dmr.name', descriptionKey: 'classified.dmr.desc' }),
  Object.freeze({ id: 'grenade', cost: 50, revealType: 'boss', revealWave: 15, revealKey: 'classified.grenade.reveal', revealedKey: 'classified.grenade.revealed', grantsThirdSlot: true, tacticalSlot: true, nameKey: 'classified.grenade.name', descriptionKey: 'classified.grenade.desc' })
]);

export const MUTATION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'irony_armor', category: 'survival', cost: 4, rankCaps: STANDARD_MUTATION_RANK_CAPS, rankUpgradeCosts: STANDARD_MUTATION_RANK_UPGRADE_COSTS, unlockWave: SURVIVAL_EARLY_UNLOCK_WAVE, nameKey: 'mutation.armor.name', descriptionKey: 'mutation.armor.desc', maxRank: 10, maxGrade: 4 }),
  Object.freeze({ id: 'extended_bit', category: 'survival', cost: 5, rankCaps: STANDARD_MUTATION_RANK_CAPS, rankUpgradeCosts: STANDARD_MUTATION_RANK_UPGRADE_COSTS, unlockWave: SURVIVAL_EARLY_UNLOCK_WAVE, nameKey: 'mutation.stamina.name', descriptionKey: 'mutation.stamina.desc', maxRank: 10, maxGrade: 4 }),
  Object.freeze({ id: 'smg_sidearm', category: 'survival', cost: 4, unlockWave: SURVIVAL_EARLY_UNLOCK_WAVE, nameKey: 'mutation.smgSidearm.name', descriptionKey: 'mutation.smgSidearm.desc', maxRank: 1 }),
  Object.freeze({ id: 'main_character_energy', category: 'survival', cost: 6, rankCaps: STANDARD_MUTATION_RANK_CAPS, rankUpgradeCosts: STANDARD_MUTATION_RANK_UPGRADE_COSTS, unlockWave: SURVIVAL_UNLOCK_WAVE, nameKey: 'mutation.health.name', descriptionKey: 'mutation.health.desc', maxRank: 10, maxGrade: 4 }),
  Object.freeze({ id: 'callback', category: 'survival', cost: 15, rankCaps: STANDARD_MUTATION_RANK_CAPS, rankUpgradeCosts: STANDARD_MUTATION_RANK_UPGRADE_COSTS, unlockWave: SURVIVAL_UNLOCK_WAVE, nameKey: 'mutation.callback.name', descriptionKey: 'mutation.callback.desc', maxRank: 10, maxGrade: 4 }),
  Object.freeze({ id: 'overkill_confetti', category: 'spectacle', cost: 2, costs: Object.freeze([2, 4, 7]), nameKey: 'mutation.confetti.name', descriptionKey: 'mutation.confetti.desc', maxRank: 0, maxGrade: 3 }),
  Object.freeze({ id: 'algorithm_roulette', category: 'spectacle', cost: 2, costs: Object.freeze([2, 4, 7]), nameKey: 'mutation.roulette.name', descriptionKey: 'mutation.roulette.desc', maxRank: 0, maxGrade: 3 }),
  Object.freeze({ id: 'opening_act', category: 'spectacle', cost: 2, costs: Object.freeze([2, 4, 7]), nameKey: 'mutation.openingAct.name', descriptionKey: 'mutation.openingAct.desc', maxRank: 0, maxGrade: 3 }),
  Object.freeze({ id: 'final_cut', category: 'spectacle', cost: 3, costs: Object.freeze([3, 5, 7]), nameKey: 'mutation.finalCut.name', descriptionKey: 'mutation.finalCut.desc', maxRank: 0, maxGrade: 3 }),
  Object.freeze({ id: 'rifle_focus', category: 'ability', weaponId: 'rifle', cost: 15, nameKey: 'mutation.rifleFocus.name', descriptionKey: 'mutation.rifleFocus.desc', maxRank: 0 }),
  Object.freeze({ id: 'dmr_scope', category: 'ability', weaponId: 'dmr', cost: 18, nameKey: 'mutation.dmrScope.name', descriptionKey: 'mutation.dmrScope.desc', maxRank: 0 }),
  Object.freeze({ id: 'background_sync', category: 'survival', cost: 6, unlockWave: SURVIVAL_UNLOCK_WAVE, nameKey: 'mutation.backgroundSync.name', descriptionKey: 'mutation.backgroundSync.desc', maxRank: 1 }),
  Object.freeze({ id: 'deep_reserves', category: 'survival', cost: 3, rankCaps: Object.freeze([2, 4]), rankUpgradeCosts: Object.freeze([3]), unlockWave: SURVIVAL_UNLOCK_WAVE, nameKey: 'mutation.deepReserves.name', descriptionKey: 'mutation.deepReserves.desc', maxRank: 4, maxGrade: 1 })
]);

export const WEAPON_MASTERY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'smg_capacity', weaponId: 'smg', costs: Object.freeze([4, 6, 8]), nameKey: 'mastery.smg.name', descriptionKey: 'mastery.smg.desc', maxGrade: 3 }),
  Object.freeze({ id: 'smg_damage', weaponId: 'smg', gradeKey: 'smg_damage', costs: Object.freeze([8, 14, 20]), nameKey: 'mastery.smgDamage.name', descriptionKey: 'mastery.smgDamage.desc', maxGrade: 3 }),
  Object.freeze({ id: 'rifle_capacity', weaponId: 'rifle', costs: Object.freeze([4, 6, 8]), nameKey: 'mastery.rifle.name', descriptionKey: 'mastery.rifle.desc', maxGrade: 3 }),
  Object.freeze({ id: 'rifle_damage', weaponId: 'rifle', gradeKey: 'rifle_damage', costs: Object.freeze([8, 14, 20]), nameKey: 'mastery.rifleDamage.name', descriptionKey: 'mastery.rifleDamage.desc', maxGrade: 3 }),
  Object.freeze({ id: 'pistol_caliber', weaponId: 'pistol', costs: Object.freeze([4, 5, 6]), nameKey: 'mastery.pistol.name', descriptionKey: 'mastery.pistol.desc', maxGrade: 3 }),
  Object.freeze({ id: 'dmr_capacity', weaponId: 'dmr', costs: Object.freeze([4, 5, 6]), nameKey: 'mastery.dmr.name', descriptionKey: 'mastery.dmr.desc', maxGrade: 3 }),
  Object.freeze({ id: 'shotgun_payload', weaponId: 'shotgun', costs: Object.freeze([4, 5, 6]), nameKey: 'mastery.shotgun.name', descriptionKey: 'mastery.shotgun.desc', maxGrade: 3 }),
  Object.freeze({ id: 'minigun_overdrive', weaponId: 'minigun', costs: Object.freeze([10, 24, 38]), nameKey: 'mastery.minigun.name', descriptionKey: 'mastery.minigun.desc', maxGrade: 3 }),
  Object.freeze({ id: 'beamsaber_combo', weaponId: 'beamsaber', costs: Object.freeze([4, 5, 6]), nameKey: 'mastery.beamsaber.name', descriptionKey: 'mastery.beamsaber.desc', maxGrade: 3 })
]);

const MUTATION_BY_ID = new Map(MUTATION_DEFINITIONS.map(def => [def.id, def]));
const MASTERY_BY_ID = new Map(WEAPON_MASTERY_DEFINITIONS.map(def => [def.id, def]));
const MASTERY_BY_WEAPON = new Map(WEAPON_MASTERY_DEFINITIONS.map(def => [def.weaponId, def]));
const CLASSIFIED_BY_ID = new Map(CLASSIFIED_WEAPON_DEFINITIONS.map(def => [def.id, def]));

function normalizeWeaponId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultWeaponGrades() {
  return Object.fromEntries(WEAPON_MASTERY_DEFINITIONS.map(def => [def.gradeKey || def.weaponId, 0]));
}

function defaultMutationGrades() {
  return Object.fromEntries(MUTATION_DEFINITIONS.filter(def => (def.maxGrade || 0) > 0).map(def => [def.id, 0]));
}

function defaultAbilityGrades() {
  return Object.fromEntries([...ABILITY_BY_ID.keys()].map(id => [id, 0]));
}

function defaultPersistentState() {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    revealed: false,
    fragments: 0,
    unlocked: [],
    mutationGrades: defaultMutationGrades(),
    weaponGrades: defaultWeaponGrades(),
    discoveredWeapons: ['pistol'],
    revealedWeapons: [],
    ownedWeapons: [],
    equippedTactical: null,
    ownedAbilities: [],
    abilityGrades: defaultAbilityGrades(),
    equippedAbility: null,
    survivalUnlockWave: 0,
    archiveMilestonesClaimed: []
  };
}

function sanitizePersistentState(raw) {
  const base = defaultPersistentState();
  const rawUnlocked = Array.isArray(raw?.unlocked) ? raw.unlocked : [];
  const refundCrowdHeckler = Number(raw?.schemaVersion) < ARCHIVE_SCHEMA_VERSION && rawUnlocked.includes('crowd_heckler');
  const unlocked = [...new Set(rawUnlocked.filter(id => MUTATION_BY_ID.has(id)))];
  const ownedSurvivalMutation = unlocked.some(id => MUTATION_BY_ID.get(id)?.category === 'survival')
    || Object.entries(raw?.mutationGrades || {}).some(([id, grade]) => MUTATION_BY_ID.get(id)?.category === 'survival' && Number(grade) > 0);
  const mutationGrades = defaultMutationGrades();
  for (const id of Object.keys(mutationGrades)) {
    const def = MUTATION_BY_ID.get(id);
    const migratedGrade = Array.isArray(def?.costs) && rawUnlocked.includes(id) ? 1 : 0;
    const legacyFullRankGrade = Number(raw?.schemaVersion) < 11 && Array.isArray(def?.rankCaps) && def.maxRank === 10 && rawUnlocked.includes(id)
      ? def.maxGrade
      : 0;
    const storedGrade = Math.max(migratedGrade, legacyFullRankGrade, Math.floor(Number(raw?.mutationGrades?.[id]) || 0));
    mutationGrades[id] = Math.min(def?.maxGrade || 0, storedGrade);
  }
  const weaponGrades = { ...base.weaponGrades };
  for (const weaponId of Object.keys(weaponGrades)) {
    weaponGrades[weaponId] = Math.min(3, Math.max(0, Math.floor(Number(raw?.weaponGrades?.[weaponId]) || 0)));
  }
  const discoveredWeapons = [...new Set([
    'pistol',
    ...(Array.isArray(raw?.discoveredWeapons) ? raw.discoveredWeapons.map(normalizeWeaponId) : [])
  ].filter(id => MASTERY_BY_WEAPON.has(id)))];
  const revealedWeapons = [...new Set((Array.isArray(raw?.revealedWeapons) ? raw.revealedWeapons : [])
    .map(normalizeWeaponId)
    .filter(id => CLASSIFIED_BY_ID.has(id)))];
  const ownedWeapons = [...new Set((Array.isArray(raw?.ownedWeapons) ? raw.ownedWeapons : [])
    .map(normalizeWeaponId)
    .filter(id => CLASSIFIED_BY_ID.has(id)))];
  if (Number(raw?.schemaVersion) < 6) {
    for (const weaponId of ['rifle', 'dmr']) {
      if (!discoveredWeapons.includes(weaponId)) continue;
      if (!revealedWeapons.includes(weaponId)) revealedWeapons.push(weaponId);
      if (!ownedWeapons.includes(weaponId)) ownedWeapons.push(weaponId);
    }
  }
  for (const weaponId of ownedWeapons) {
    if (!revealedWeapons.includes(weaponId)) revealedWeapons.push(weaponId);
  }
  const ownedTacticals = ownedWeapons.filter(id => CLASSIFIED_BY_ID.get(id)?.tacticalSlot === true);
  const requestedTactical = normalizeWeaponId(raw?.equippedTactical);
  const equippedTactical = ownedTacticals.includes(requestedTactical)
    ? requestedTactical
    : (ownedTacticals[0] || null);
  const legacyAbilities = [];
  if (rawUnlocked.includes('punchline_rush')) legacyAbilities.push('punchline_rush');
  if (Array.isArray(raw?.ownedWeapons) && raw.ownedWeapons.map(normalizeWeaponId).includes('dynamite')) legacyAbilities.push('dynamite');
  const gradedAbilities = Object.entries(raw?.abilityGrades || {})
    .filter(([, grade]) => Number(grade) > 0)
    .map(([id]) => id);
  const ownedAbilities = [...new Set([
    ...(Array.isArray(raw?.ownedAbilities) ? raw.ownedAbilities : []),
    ...gradedAbilities,
    ...legacyAbilities
  ].map(normalizeAbilityId).filter(id => ABILITY_BY_ID.has(id)))];
  const abilityGrades = defaultAbilityGrades();
  for (const id of ownedAbilities) {
    const definition = ABILITY_BY_ID.get(id);
    abilityGrades[id] = Math.min(definition?.maxGrade || 1, Math.max(1, Math.floor(Number(raw?.abilityGrades?.[id]) || 1)));
  }
  const requestedAbility = normalizeAbilityId(raw?.equippedAbility);
  const equippedAbility = ownedAbilities.includes(requestedAbility)
    ? requestedAbility
    : (ownedAbilities.includes('punchline_rush') ? 'punchline_rush' : (ownedAbilities[0] || null));
  const ownedSurvivalWave = unlocked.reduce((highest, id) => {
    const def = MUTATION_BY_ID.get(id);
    return def?.category === 'survival' ? Math.max(highest, def.unlockWave || 0) : highest;
  }, 0);
  const survivalUnlockWave = Math.max(
    ownedSurvivalWave,
    Math.max(0, Math.floor(Number(raw?.survivalUnlockWave) || 0))
  );
  const archiveMilestonesClaimed = [...new Set([
    ...(Array.isArray(raw?.archiveMilestonesClaimed) ? raw.archiveMilestonesClaimed : [])
  ].map(Number).filter(wave => ARCHIVE_MILESTONE_WAVES.includes(wave)))].sort((a, b) => a - b);
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    revealed: raw?.revealed === true,
    fragments: Math.max(0, Math.floor(Number(raw?.fragments) || 0)) + (refundCrowdHeckler ? CROWD_HECKLER_REFUND : 0),
    unlocked,
    mutationGrades,
    weaponGrades,
    discoveredWeapons,
    revealedWeapons,
    ownedWeapons,
    equippedTactical,
    ownedAbilities,
    abilityGrades,
    equippedAbility,
    survivalUnlockWave: Math.max(survivalUnlockWave, ownedSurvivalMutation ? SURVIVAL_EARLY_UNLOCK_WAVE : 0),
    archiveMilestonesClaimed
  };
}

function emptyRanks() {
  return Object.fromEntries(MUTATION_DEFINITIONS.map(def => [def.id, 0]));
}

function callbackProfileForRank(rank) {
  const resolvedRank = Math.min(10, Math.max(0, Math.floor(Number(rank) || 0)));
  if (resolvedRank <= 0) return { enabled: false, rank: 0, cadence: CALLBACK_ELIMINATION_CADENCE, radius: 0, pushDistance: 0 };
  return {
    enabled: true,
    rank: resolvedRank,
    cadence: CALLBACK_ELIMINATION_CADENCE,
    radius: 3.3 + resolvedRank * 0.2,
    pushDistance: 1.3 + resolvedRank * 0.1
  };
}

export class ArchiveMutations {
  constructor({ storage, rng = Math.random, onPersistentChange = null, onRunChange = null, onFragmentsAwarded = null } = {}) {
    this.storage = storage;
    this.rng = rng;
    this.onPersistentChange = onPersistentChange;
    this.onRunChange = onRunChange;
    this.onFragmentsAwarded = onFragmentsAwarded;
    this.debugShop = false;
    const raw = getJSON(ARCHIVE_STORAGE_KEY, defaultPersistentState(), storage);
    this.state = sanitizePersistentState(raw);
    const priorProgression = getJSON('bs3d_unlocks', {}, storage);
    const priorBestWave = Math.max(0, Math.floor(Number(priorProgression?.bestWave) || 0));
    const priorSurvivalWave = priorBestWave > SURVIVAL_UNLOCK_WAVE
      ? SURVIVAL_UNLOCK_WAVE
      : priorBestWave > SURVIVAL_EARLY_UNLOCK_WAVE ? SURVIVAL_EARLY_UNLOCK_WAVE : 0;
    if (priorSurvivalWave > this.state.survivalUnlockWave) this.state.survivalUnlockWave = priorSurvivalWave;
    if (JSON.stringify(raw) !== JSON.stringify(this.state)) setJSON(ARCHIVE_STORAGE_KEY, this.state, this.storage);
    this.resetRun({ tutorial: false });
  }

  _save() {
    if (!this.debugShop) setJSON(ARCHIVE_STORAGE_KEY, this.state, this.storage);
    this.onPersistentChange?.(this.getPersistentState());
  }

  enableDebugShop(fragments = 300) {
    const balance = Math.max(200, Math.min(400, Math.floor(Number(fragments) || 300)));
    this.debugShop = true;
    this.state.revealed = true;
    this.state.fragments = balance;
    this.onPersistentChange?.(this.getPersistentState());
    return balance;
  }

  getPersistentState() {
    return {
      ...this.state,
      unlocked: [...this.state.unlocked],
      mutationGrades: { ...this.state.mutationGrades },
      weaponGrades: { ...this.state.weaponGrades },
      discoveredWeapons: [...this.state.discoveredWeapons],
      revealedWeapons: [...this.state.revealedWeapons],
      ownedWeapons: [...this.state.ownedWeapons],
      ownedAbilities: [...this.state.ownedAbilities],
      abilityGrades: { ...this.state.abilityGrades },
      archiveMilestonesClaimed: [...this.state.archiveMilestonesClaimed]
    };
  }

  getRunState() {
    return {
      tutorial: this.run.tutorial,
      debug: this.run.debug,
      ranks: { ...this.run.ranks },
      points: this.run.points,
      fragmentsEarned: this.run.fragmentsEarned,
      trialWeapons: [...this.run.trialWeapons],
      callbackEliminations: this.run.callbackEliminations
    };
  }

  resetRun({ tutorial = false, debug = false } = {}) {
    this.run = {
      tutorial: tutorial === true,
      debug: debug === true,
      ranks: emptyRanks(),
      points: 0,
      fragmentsEarned: 0,
      waveRewards: new Set(),
      bossRewards: new Set(),
      trialWeapons: new Set(),
      callbackEliminations: 0
    };
    this.onRunChange?.(this.getRunState());
  }

  reveal() {
    if (this.state.revealed) return false;
    this.state.revealed = true;
    this._save();
    return true;
  }

  isUnlocked(id) {
    const def = MUTATION_BY_ID.get(id);
    if (Array.isArray(def?.costs)) return this.getMutationGrade(id) > 0;
    return this.state.unlocked.includes(id);
  }

  isAbilityOwned(id) {
    return this.state.ownedAbilities.includes(normalizeAbilityId(id));
  }

  getAbilityGrade(id) {
    const abilityId = normalizeAbilityId(id);
    if (!this.isAbilityOwned(abilityId)) return 0;
    return Math.min(ABILITY_BY_ID.get(abilityId)?.maxGrade || 1, Math.max(1, Math.floor(Number(this.state.abilityGrades?.[abilityId]) || 1)));
  }

  getAbilityCost(id) {
    const abilityId = normalizeAbilityId(id);
    const definition = ABILITY_BY_ID.get(abilityId);
    if (!definition) return null;
    const grade = this.getAbilityGrade(abilityId);
    const maxGrade = definition.maxGrade || 1;
    if (grade >= maxGrade) return null;
    return Array.isArray(definition.costs) ? definition.costs[grade] : definition.cost;
  }

  getEquippedAbility() {
    return this.state.equippedAbility || null;
  }

  equipAbility(id) {
    const abilityId = normalizeAbilityId(id);
    if (!ABILITY_BY_ID.has(abilityId)) return { ok: false, reason: 'unknown' };
    if (!this.isAbilityOwned(abilityId)) return { ok: false, reason: 'unowned' };
    if (this.state.equippedAbility === abilityId) return { ok: false, reason: 'equipped' };
    this.state.equippedAbility = abilityId;
    this._save();
    return { ok: true, id: abilityId };
  }

  purchaseAbility(id) {
    const abilityId = normalizeAbilityId(id);
    const definition = ABILITY_BY_ID.get(abilityId);
    if (!definition) return { ok: false, reason: 'unknown' };
    const grade = this.getAbilityGrade(abilityId);
    const maxGrade = definition.maxGrade || 1;
    if (grade >= maxGrade) return { ok: false, reason: maxGrade > 1 ? 'maxed' : 'owned' };
    const cost = this.getAbilityCost(abilityId);
    if (this.state.fragments < cost) return { ok: false, reason: 'insufficient' };
    this.state.fragments -= cost;
    const nextGrade = grade + 1;
    if (!this.isAbilityOwned(abilityId)) this.state.ownedAbilities.push(abilityId);
    this.state.abilityGrades[abilityId] = nextGrade;
    this.state.equippedAbility = abilityId;
    this._save();
    return { ok: true, id: abilityId, grade: nextGrade, equippedAbility: abilityId, fragments: this.state.fragments };
  }

  areSurvivalMutationsRevealed() {
    return this.state.survivalUnlockWave >= SURVIVAL_UNLOCK_WAVE;
  }

  getSurvivalUnlockWave() {
    return Math.max(0, Math.floor(Number(this.state.survivalUnlockWave) || 0));
  }

  isSurvivalMutationRevealed(id) {
    const def = MUTATION_BY_ID.get(id);
    return def?.category === 'survival' && this.getSurvivalUnlockWave() >= (def.unlockWave || SURVIVAL_UNLOCK_WAVE);
  }

  revealSurvivalMutations(wave) {
    const clearedWave = Math.max(0, Math.floor(Number(wave) || 0));
    const milestone = clearedWave >= SURVIVAL_UNLOCK_WAVE
      ? SURVIVAL_UNLOCK_WAVE
      : clearedWave >= SURVIVAL_EARLY_UNLOCK_WAVE ? SURVIVAL_EARLY_UNLOCK_WAVE : 0;
    if (this.run.tutorial || this.run.debug || milestone <= this.getSurvivalUnlockWave()) return false;
    this.state.survivalUnlockWave = milestone;
    this._save();
    return true;
  }

  getClassifiedWeaponDefinition(weapon) {
    return CLASSIFIED_BY_ID.get(normalizeWeaponId(weapon)) || null;
  }

  isWeaponClassified(weapon) {
    return CLASSIFIED_BY_ID.has(normalizeWeaponId(weapon));
  }

  isWeaponRevealed(weapon) {
    return this.state.revealedWeapons.includes(normalizeWeaponId(weapon));
  }

  isWeaponOwned(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    return !CLASSIFIED_BY_ID.has(weaponId) || this.state.ownedWeapons.includes(weaponId);
  }

  getEquippedTactical() {
    return this.state.equippedTactical || null;
  }

  equipTactical(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    const def = CLASSIFIED_BY_ID.get(weaponId);
    if (!def?.tacticalSlot) return { ok: false, reason: 'not_tactical' };
    if (!this.state.ownedWeapons.includes(weaponId)) return { ok: false, reason: 'unowned' };
    if (this.state.equippedTactical === weaponId) return { ok: false, reason: 'equipped' };
    this.state.equippedTactical = weaponId;
    this._save();
    return { ok: true, id: weaponId };
  }

  revealClassifiedWeapon(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    if (!CLASSIFIED_BY_ID.has(weaponId) || this.isWeaponRevealed(weaponId)) return false;
    this.state.revealedWeapons.push(weaponId);
    this._save();
    return true;
  }

  purchaseClassifiedWeapon(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    const def = CLASSIFIED_BY_ID.get(weaponId);
    if (!def) return { ok: false, reason: 'unknown' };
    if (!this.isWeaponRevealed(weaponId)) return { ok: false, reason: 'classified' };
    if (this.state.ownedWeapons.includes(weaponId)) return { ok: false, reason: 'owned' };
    if (this.state.fragments < def.cost) return { ok: false, reason: 'insufficient' };
    this.state.fragments -= def.cost;
    this.state.ownedWeapons.push(weaponId);
    if (def.tacticalSlot) this.state.equippedTactical = weaponId;
    this._save();
    const result = { ok: true, id: weaponId, fragments: this.state.fragments, grantsThirdSlot: def.grantsThirdSlot === true };
    if (def.tacticalSlot) result.equippedTactical = weaponId;
    return result;
  }

  grantClassifiedWeapon(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    const def = CLASSIFIED_BY_ID.get(weaponId);
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.state.ownedWeapons.includes(weaponId)) return { ok: false, reason: 'owned' };
    if (!this.state.revealedWeapons.includes(weaponId)) this.state.revealedWeapons.push(weaponId);
    this.state.ownedWeapons.push(weaponId);
    if (def.tacticalSlot) this.state.equippedTactical = weaponId;
    this._save();
    const result = { ok: true, id: weaponId, fragments: this.state.fragments, grantsThirdSlot: def.grantsThirdSlot === true };
    if (def.tacticalSlot) result.equippedTactical = weaponId;
    return result;
  }

  grantWeaponTrial(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    if (!CLASSIFIED_BY_ID.has(weaponId) || !this.isWeaponRevealed(weaponId) || this.isWeaponOwned(weaponId) || this.run.trialWeapons.has(weaponId)) return false;
    this.run.trialWeapons.add(weaponId);
    this.onRunChange?.(this.getRunState());
    return true;
  }

  hasWeaponAccess(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    return !CLASSIFIED_BY_ID.has(weaponId) || this.isWeaponOwned(weaponId) || this.run.trialWeapons.has(weaponId);
  }

  isWeaponProgressionAvailable(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    return CLASSIFIED_BY_ID.has(weaponId) ? this.isWeaponOwned(weaponId) : this.isWeaponDiscovered(weaponId);
  }

  purchase(id) {
    const def = MUTATION_BY_ID.get(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (def.weaponId && !this.isWeaponProgressionAvailable(def.weaponId)) return { ok: false, reason: 'undiscovered' };
    if (def.category === 'survival' && !this.isSurvivalMutationRevealed(id)) return { ok: false, reason: 'milestone' };
    if (Array.isArray(def.rankCaps)) {
      if (!this.isUnlocked(id)) {
        if (this.state.fragments < def.cost) return { ok: false, reason: 'insufficient' };
        this.state.fragments -= def.cost;
        this.state.unlocked.push(id);
        this.state.mutationGrades[id] = 0;
        this._save();
        return { ok: true, id, grade: 0, rankCap: def.rankCaps[0], fragments: this.state.fragments };
      }
      const grade = this.getMutationGrade(id);
      if (grade >= def.maxGrade) return { ok: false, reason: 'capped' };
      const cost = def.rankUpgradeCosts[grade];
      if (this.state.fragments < cost) return { ok: false, reason: 'insufficient' };
      this.state.fragments -= cost;
      this.state.mutationGrades[id] = grade + 1;
      this._save();
      return { ok: true, id, grade: grade + 1, rankCap: def.rankCaps[grade + 1], fragments: this.state.fragments };
    }
    if (Array.isArray(def.costs)) {
      const grade = this.getMutationGrade(id);
      if (grade >= def.maxGrade) return { ok: false, reason: 'capped' };
      const cost = def.costs[grade];
      if (this.state.fragments < cost) return { ok: false, reason: 'insufficient' };
      this.state.fragments -= cost;
      this.state.mutationGrades[id] = grade + 1;
      if (!this.state.unlocked.includes(id)) this.state.unlocked.push(id);
      this._save();
      return { ok: true, id, fragments: this.state.fragments };
    }
    if (this.isUnlocked(id)) return { ok: false, reason: 'unlocked' };
    if (this.state.fragments < def.cost) return { ok: false, reason: 'insufficient' };
    this.state.fragments -= def.cost;
    this.state.unlocked.push(id);
    this._save();
    return { ok: true, id, fragments: this.state.fragments };
  }

  getMutationGrade(id) {
    const maxGrade = MUTATION_BY_ID.get(id)?.maxGrade || 0;
    return Math.min(maxGrade, Math.max(0, Math.floor(Number(this.state.mutationGrades[id]) || 0)));
  }

  getMutationCost(id) {
    const def = MUTATION_BY_ID.get(id);
    if (Array.isArray(def?.rankCaps)) {
      if (!this.isUnlocked(id)) return def.cost;
      const grade = this.getMutationGrade(id);
      return grade >= def.maxGrade ? null : def.rankUpgradeCosts[grade];
    }
    if (!def || !Array.isArray(def.costs)) return def?.category === 'survival' && this.isUnlocked(id) ? null : (def?.cost ?? null);
    const grade = this.getMutationGrade(id);
    return grade >= def.maxGrade ? null : def.costs[grade];
  }

  getReserveExpansionGrade() {
    return this.getRank('deep_reserves');
  }

  getReserveLimit(baseReserve, weaponSpecificReserve = baseReserve) {
    const base = Math.max(0, Math.floor(Number(baseReserve) || 0));
    const specific = Math.max(base, Math.floor(Number(weaponSpecificReserve) || 0));
    const expansion = Math.floor(base * this.getReserveExpansionGrade() * RESERVE_EXPANSION_PER_GRADE);
    return specific + expansion;
  }

  getMutationRankCap(id) {
    const def = MUTATION_BY_ID.get(id);
    if (!def) return 0;
    if (def.category === 'survival') {
      if (!this.isUnlocked(id)) return 0;
      if (Array.isArray(def.rankCaps)) return def.rankCaps[this.getMutationGrade(id)] || def.rankCaps[0];
      return def.maxRank;
    }
    return def.maxRank || 0;
  }

  isWeaponDiscovered(weapon) {
    return this.state.discoveredWeapons.includes(normalizeWeaponId(weapon));
  }

  discoverWeapon(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    if (!MASTERY_BY_WEAPON.has(weaponId) || this.isWeaponDiscovered(weaponId)) return false;
    this.state.discoveredWeapons.push(weaponId);
    this._save();
    return true;
  }

  getWeaponGrade(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    return Math.min(3, Math.max(0, Number(this.state.weaponGrades[weaponId]) || 0));
  }

  getMasteryGrade(id) {
    const def = MASTERY_BY_ID.get(id);
    if (!def) return 0;
    return Math.min(3, Math.max(0, Number(this.state.weaponGrades[def.gradeKey || def.weaponId]) || 0));
  }

  getMasteryCost(id) {
    const def = MASTERY_BY_ID.get(id);
    if (!def) return null;
    const grade = this.getMasteryGrade(id);
    return grade >= def.maxGrade ? null : def.costs[grade];
  }

  purchaseMastery(id) {
    const def = MASTERY_BY_ID.get(id);
    if (!def) return { ok: false, reason: 'unknown' };
    if (!this.isWeaponProgressionAvailable(def.weaponId)) return { ok: false, reason: 'undiscovered' };
    const grade = this.getMasteryGrade(id);
    if (grade >= def.maxGrade) return { ok: false, reason: 'capped' };
    const cost = def.costs[grade];
    if (this.state.fragments < cost) return { ok: false, reason: 'insufficient' };
    this.state.fragments -= cost;
    this.state.weaponGrades[def.gradeKey || def.weaponId] = grade + 1;
    this._save();
    return { ok: true, id, weaponId: def.weaponId, grade: grade + 1, fragments: this.state.fragments };
  }

  getMagazineSize(weapon, baseSize) {
    const weaponId = normalizeWeaponId(weapon);
    const grade = this.getWeaponGrade(weaponId);
    if (weaponId === 'smg') return [36, 40, 44, 48][grade];
    if (weaponId === 'rifle') return [16, 18, 20, 22][grade];
    if (weaponId === 'dmr') return [12, 13, 14, 15][grade];
    if (weaponId === 'minigun') return [200, 240, 280, 320][grade];
    return Math.max(0, Math.floor(Number(baseSize) || 0));
  }

  getPistolDamageMultiplier() {
    return 1 + this.getWeaponGrade('pistol') * 0.05;
  }

  getWeaponDamageMultiplier(weapon) {
    const weaponId = normalizeWeaponId(weapon);
    if (weaponId !== 'smg' && weaponId !== 'rifle') return 1;
    return [1, 1.05, 1.1, 1.15][this.getMasteryGrade(`${weaponId}_damage`)];
  }

  getShotgunPelletDamage() {
    return [12, 12.5, 13, 13.5][this.getWeaponGrade('shotgun')];
  }

  getMinigunProfile() {
    const grade = this.getWeaponGrade('minigun');
    return {
      grade,
      damageMultiplier: [1, 1.1, 1.2, 1.3][grade],
      spreadMultiplier: [1, 0.9, 0.8, 0.7][grade]
    };
  }

  getMinigunReserveSize() {
    return [360, 440, 540, 660][this.getWeaponGrade('minigun')];
  }

  getBeamSaberComboProfile() {
    const grade = this.getWeaponGrade('beamsaber');
    if (grade <= 0) return { enabled: false, grade };
    return {
      enabled: true,
      grade,
      firstDamage: 22 + grade * 2,
      secondDamage: 26 + grade * 2,
      delayMs: 160,
      lockoutMs: 700
    };
  }

  getCallbackProfile(rank = this.getRank('callback')) {
    return callbackProfileForRank(rank);
  }

  recordElimination() {
    const profile = this.getCallbackProfile();
    if (this.run.tutorial || !profile.enabled) return { ...profile, triggered: false, count: 0, remaining: profile.cadence };
    this.run.callbackEliminations += 1;
    const progress = this.run.callbackEliminations % profile.cadence;
    return {
      ...profile,
      triggered: progress === 0,
      count: this.run.callbackEliminations,
      remaining: progress === 0 ? 0 : profile.cadence - progress
    };
  }

  _awardFragments(amount) {
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0 || this.run.tutorial || this.run.debug) return 0;
    this.state.fragments += gain;
    this.run.fragmentsEarned += gain;
    this._save();
    this.onFragmentsAwarded?.(gain);
    this.onRunChange?.(this.getRunState());
    return gain;
  }

  claimArchiveMilestone(wave) {
    const milestone = Math.max(0, Math.floor(Number(wave) || 0));
    if (this.run.tutorial || this.run.debug || !ARCHIVE_MILESTONE_WAVES.includes(milestone) || this.state.archiveMilestonesClaimed.includes(milestone)) return 0;
    this.state.archiveMilestonesClaimed.push(milestone);
    this.state.archiveMilestonesClaimed.sort((a, b) => a - b);
    return this._awardFragments(5);
  }

  onWaveStarted(wave) {
    const current = Math.max(1, Math.floor(Number(wave) || 1));
    const cleared = current - 1;
    if (this.run.tutorial || this.run.debug || cleared < 2 || cleared % 2 !== 0 || this.run.waveRewards.has(cleared)) return 0;
    this.run.waveRewards.add(cleared);
    return this._awardFragments(cleared > 15 ? 2 : 1);
  }

  onBossDefeated(wave, { session } = {}) {
    const bossWave = Math.max(0, Math.floor(Number(wave) || 0));
    session?.repairArmor?.();
    this.revealSurvivalMutations(bossWave);
    if (this.run.tutorial || this.run.debug || bossWave <= 0 || this.run.bossRewards.has(bossWave)) return 0;
    this.run.bossRewards.add(bossWave);
    return this._awardFragments(bossWave > 15 ? 4 : 2);
  }

  shouldOfferAtWave(wave) {
    return !this.run.tutorial && !this.run.debug && MUTATION_OFFER_WAVES.includes(Math.floor(Number(wave) || 0));
  }

  getRank(id) {
    return Math.max(0, this.run.ranks[id] || 0);
  }

  getEligibleDefinitions() {
    if (this.run.points >= MAX_RUN_MUTATION_POINTS) return [];
    return MUTATION_DEFINITIONS.filter(def => def.maxRank > 0 && this.isUnlocked(def.id) && this.getRank(def.id) < this.getMutationRankCap(def.id));
  }

  _pickOne(list) {
    if (!list.length) return null;
    return list[Math.floor(this.rng() * list.length) % list.length];
  }

  getOffer(maxChoices = 3) {
    const eligible = this.getEligibleDefinitions();
    if (eligible.length <= maxChoices) return eligible.slice();
    const owned = eligible.filter(def => this.getRank(def.id) > 0);
    const picks = [];
    const guaranteed = this._pickOne(owned);
    if (guaranteed) picks.push(guaranteed);
    const remaining = eligible.filter(def => !picks.includes(def));
    while (picks.length < maxChoices && remaining.length) {
      const picked = this._pickOne(remaining);
      picks.push(picked);
      remaining.splice(remaining.indexOf(picked), 1);
    }
    return picks;
  }

  applyRank(id, { session, player, weaponSystem } = {}) {
    const def = MUTATION_BY_ID.get(id);
    if (!def || !this.isUnlocked(id)) return { ok: false, reason: 'locked' };
    const before = this.getRank(id);
    if (before >= this.getMutationRankCap(id) || this.run.points >= MAX_RUN_MUTATION_POINTS) return { ok: false, reason: 'capped' };
    this.run.ranks[id] = before + 1;
    this.run.points += 1;
    if (id === 'irony_armor') session?.addArmorCapacity?.(2, { fill: true });
    if (id === 'main_character_energy') {
      session?.addMaxHp?.(2, { heal: false });
      session?.heal?.(1);
    }
    if (id === 'extended_bit') player?.addStaminaCapacity?.(3, { fill: true });
    if (id === 'smg_sidearm') weaponSystem?.replaceSecondaryWithSMG?.();
    this.onRunChange?.(this.getRunState());
    return { ok: true, id, rank: before + 1, points: this.run.points };
  }
}

export function describeMutationRank(id, rank) {
  const next = Math.min(10, Math.max(0, Number(rank) || 0) + 1);
  if (id === 'irony_armor') return { current: `${rank * 2}`, next: `${next * 2}`, unit: 'mutation.unit.armor' };
  if (id === 'main_character_energy') return { current: `${100 + rank * 2}`, next: `${100 + next * 2}`, unit: 'mutation.unit.hp' };
  if (id === 'extended_bit') return { current: `${100 + rank * 3}`, next: `${100 + next * 3}`, unit: 'mutation.unit.stamina' };
  if (id === 'background_sync') return { current: rank > 0 ? '5% / 10 s' : '0%', next: '5% / 10 s', unit: 'mutation.unit.baseReserveRegen' };
  if (id === 'deep_reserves') return { current: `${100 + rank * 30}%`, next: `${100 + next * 30}%`, unit: 'mutation.unit.reserveLimit' };
  if (id === 'smg_sidearm') return { current: rank > 0 ? 'SMG' : 'Pistol', next: 'SMG', unit: 'mutation.unit.secondarySlot' };
  if (id === 'callback') {
    const current = callbackProfileForRank(rank);
    const upcoming = callbackProfileForRank(next);
    return {
      current: current.enabled ? `${current.radius.toFixed(1)} m / ${current.pushDistance.toFixed(1)} m` : '—',
      next: `${upcoming.radius.toFixed(1)} m / ${upcoming.pushDistance.toFixed(1)} m`,
      unit: 'mutation.unit.radiusPush'
    };
  }
  return { current: String(rank), next: String(next), unit: '' };
}

export function describeSpectacleGrade(id, grade) {
  const maxGrade = MUTATION_BY_ID.get(id)?.maxGrade || 0;
  const currentGrade = Math.min(maxGrade, Math.max(0, Math.floor(Number(grade) || 0)));
  const nextGrade = Math.min(maxGrade, currentGrade + 1);
  if (id === 'overkill_confetti') {
    const values = ['mutation.confetti.value.locked', 'mutation.confetti.value.visual', 'mutation.confetti.value.grade2', 'mutation.confetti.value.grade3'];
    return { current: values[currentGrade], next: values[nextGrade], localized: true };
  }
  if (id === 'algorithm_roulette') {
    const values = ['mutation.roulette.value.locked', 'mutation.roulette.value.grade1', 'mutation.roulette.value.grade2', 'mutation.roulette.value.grade3'];
    return { current: values[currentGrade], next: values[nextGrade], localized: true };
  }
  if (id === 'opening_act') {
    const values = ['mutation.openingAct.value.locked', 'mutation.openingAct.value.grade1', 'mutation.openingAct.value.grade2', 'mutation.openingAct.value.grade3'];
    return { current: values[currentGrade], next: values[nextGrade], localized: true };
  }
  if (id === 'final_cut') {
    const values = ['mutation.finalCut.value.locked', 'mutation.finalCut.value.grade1', 'mutation.finalCut.value.grade2', 'mutation.finalCut.value.grade3'];
    return { current: values[currentGrade], next: values[nextGrade], localized: true };
  }
  return { current: '', next: '', localized: false };
}

export function describeWeaponMastery(id, grade) {
  const currentGrade = Math.min(3, Math.max(0, Math.floor(Number(grade) || 0)));
  const nextGrade = Math.min(3, currentGrade + 1);
  if (id === 'smg_capacity') return { current: [36, 40, 44, 48][currentGrade], next: [36, 40, 44, 48][nextGrade], unit: 'mastery.unit.rounds' };
  if (id === 'smg_damage') return { current: `${100 + currentGrade * 5}%`, next: `${100 + nextGrade * 5}%`, unit: 'mastery.unit.damage' };
  if (id === 'rifle_capacity') return { current: [16, 18, 20, 22][currentGrade], next: [16, 18, 20, 22][nextGrade], unit: 'mastery.unit.rounds' };
  if (id === 'rifle_damage') return { current: `${100 + currentGrade * 5}%`, next: `${100 + nextGrade * 5}%`, unit: 'mastery.unit.damage' };
  if (id === 'pistol_caliber') return { current: `${100 + currentGrade * 5}%`, next: `${100 + nextGrade * 5}%`, unit: 'mastery.unit.damage' };
  if (id === 'dmr_capacity') return { current: [12, 13, 14, 15][currentGrade], next: [12, 13, 14, 15][nextGrade], unit: 'mastery.unit.rounds' };
  if (id === 'shotgun_payload') return { current: [12, 12.5, 13, 13.5][currentGrade].toFixed(1), next: [12, 12.5, 13, 13.5][nextGrade].toFixed(1), unit: 'mastery.unit.pelletDamage' };
  if (id === 'minigun_overdrive') {
    const magazines = [200, 240, 280, 320];
    const reserves = [360, 440, 540, 660];
    const damage = [100, 110, 120, 130];
    const spread = [100, 90, 80, 70];
    return {
      current: `${magazines[currentGrade]} / ${reserves[currentGrade]} / ${damage[currentGrade]}% / ${spread[currentGrade]}%`,
      next: `${magazines[nextGrade]} / ${reserves[nextGrade]} / ${damage[nextGrade]}% / ${spread[nextGrade]}%`,
      unit: 'mastery.unit.magReserveDamageSpread'
    };
  }
  if (id === 'beamsaber_combo') {
    return currentGrade === 0
      ? { current: 'mastery.value.chargedSlash', next: 'mastery.value.combo52', localized: true }
      : { current: `${48 + currentGrade * 4}`, next: `${48 + nextGrade * 4}`, unit: 'mastery.unit.comboDamage' };
  }
  return { current: String(currentGrade), next: String(nextGrade), unit: '' };
}
