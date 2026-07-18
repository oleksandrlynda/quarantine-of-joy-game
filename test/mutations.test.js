import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_STORAGE_KEY,
  CROWD_HECKLER_REFUND,
  ArchiveMutations,
  MUTATION_OFFER_WAVES,
  describeWeaponMastery
} from '../src/mutations.js';
import { GameSession } from '../src/game/session.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem(key) { return key in store ? store[key] : null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; }
  };
}

test('archive starts hidden with zero mastery and persists purchases', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  const state = archive.getPersistentState();
  assert.equal(state.schemaVersion, ARCHIVE_SCHEMA_VERSION);
  assert.equal(state.revealed, false);
  assert.equal(state.fragments, 0);
  assert.deepEqual(state.unlocked, []);
  assert.deepEqual(state.discoveredWeapons, ['pistol']);
  assert.deepEqual(state.revealedWeapons, []);
  assert.deepEqual(state.ownedWeapons, []);
  assert.equal(state.survivalMutationsRevealed, false);
  assert.equal(state.weaponGrades.pistol, 0);
  assert.equal(state.weaponGrades.smg_damage, 0);
  assert.equal(state.weaponGrades.rifle_damage, 0);

  assert.equal(archive.reveal(), true);
  archive._awardFragments(4);
  assert.equal(archive.purchase('irony_armor').reason, 'milestone');
  assert.equal(archive.revealSurvivalMutations(9), false);
  assert.equal(archive.revealSurvivalMutations(10), true);
  assert.deepEqual(archive.purchase('irony_armor'), { ok: true, id: 'irony_armor', fragments: 0 });

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getPersistentState().revealed, true);
  assert.equal(restored.isUnlocked('irony_armor'), true);
  assert.equal(JSON.parse(storage.store[ARCHIVE_STORAGE_KEY]).fragments, 0);
});

test('mutation purchases reject unknown, duplicate, and unaffordable entries', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  assert.equal(archive.purchase('missing').reason, 'unknown');
  assert.equal(archive.purchaseAbility('punchline_rush').reason, 'insufficient');
  archive._awardFragments(10);
  assert.equal(archive.purchaseAbility('punchline_rush').ok, true);
  assert.equal(archive.purchaseAbility('punchline_rush').reason, 'owned');
  assert.equal(archive.getPersistentState().fragments, 0);
});

test('Overkill Confetti has two low-cost permanent Archive grades', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(10);
  assert.equal(archive.getMutationCost('overkill_confetti'), 3);
  assert.equal(archive.purchase('overkill_confetti').ok, true);
  assert.equal(archive.getMutationGrade('overkill_confetti'), 1);
  assert.equal(archive.getMutationCost('overkill_confetti'), 7);
  assert.equal(archive.purchase('overkill_confetti').ok, true);
  assert.equal(archive.getMutationGrade('overkill_confetti'), 2);
  assert.equal(archive.getMutationCost('overkill_confetti'), null);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'overkill_confetti'), false);
});

test('Algorithm Roulette has two permanent Stagecraft grades at 3 and 7 fragments', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(10);
  assert.equal(archive.getMutationCost('algorithm_roulette'), 3);
  assert.equal(archive.purchase('algorithm_roulette').ok, true);
  assert.equal(archive.getMutationGrade('algorithm_roulette'), 1);
  assert.equal(archive.getMutationCost('algorithm_roulette'), 7);
  assert.equal(archive.purchase('algorithm_roulette').ok, true);
  assert.equal(archive.getMutationGrade('algorithm_roulette'), 2);
  assert.equal(archive.getMutationCost('algorithm_roulette'), null);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'algorithm_roulette'), false);
});

test('Opening Act and Final Cut use permanent two-grade Stagecraft pricing', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(25);

  assert.equal(archive.getMutationCost('opening_act'), 3);
  assert.equal(archive.purchase('opening_act').ok, true);
  assert.equal(archive.getMutationCost('opening_act'), 7);
  assert.equal(archive.purchase('opening_act').ok, true);
  assert.equal(archive.getMutationGrade('opening_act'), 2);
  assert.equal(archive.getMutationCost('opening_act'), null);

  assert.equal(archive.getMutationCost('final_cut'), 5);
  assert.equal(archive.purchase('final_cut').ok, true);
  assert.equal(archive.getMutationCost('final_cut'), 10);
  assert.equal(archive.purchase('final_cut').ok, true);
  assert.equal(archive.getMutationGrade('final_cut'), 2);
  assert.equal(archive.getMutationCost('final_cut'), null);

  const offered = archive.getEligibleDefinitions().map(def => def.id);
  assert.equal(offered.includes('opening_act'), false);
  assert.equal(offered.includes('final_cut'), false);
});

test('legacy Crowd Heckler ownership is removed and refunded exactly once', () => {
  const storage = makeStorage({
    [ARCHIVE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      revealed: true,
      fragments: 3,
      unlocked: ['crowd_heckler', 'irony_armor']
    })
  });
  const migrated = new ArchiveMutations({ storage });
  assert.equal(migrated.getPersistentState().fragments, 3 + CROWD_HECKLER_REFUND);
  assert.deepEqual(migrated.getPersistentState().unlocked, ['irony_armor']);
  assert.equal(migrated.areSurvivalMutationsRevealed(), true);
  assert.equal(migrated.getMutationRankCap('irony_armor'), 10);
  assert.equal(migrated.isUnlocked('crowd_heckler'), false);

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getPersistentState().fragments, 3 + CROWD_HECKLER_REFUND);
});

test('schema v4 weapon grades migrate to magazine tracks without free damage grades', () => {
  const storage = makeStorage({
    [ARCHIVE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 4,
      weaponGrades: { smg: 2, rifle: 1 },
      discoveredWeapons: ['smg', 'rifle']
    })
  });
  const archive = new ArchiveMutations({ storage });
  assert.equal(archive.getMasteryGrade('smg_capacity'), 2);
  assert.equal(archive.getMasteryGrade('rifle_capacity'), 1);
  assert.equal(archive.getMasteryGrade('smg_damage'), 0);
  assert.equal(archive.getMasteryGrade('rifle_damage'), 0);
  assert.equal(archive.isWeaponRevealed('rifle'), true);
  assert.equal(archive.isWeaponOwned('rifle'), true);
});

test('a prior save that cleared Wave 10 receives the survival shop milestone', () => {
  const storage = makeStorage({
    bs3d_unlocks: JSON.stringify({ bestWave: 11 })
  });
  const archive = new ArchiveMutations({ storage });

  assert.equal(archive.areSurvivalMutationsRevealed(), true);
  assert.equal(JSON.parse(storage.store[ARCHIVE_STORAGE_KEY]).survivalMutationsRevealed, true);
});

test('classified weapons separate hidden, trial, and permanent ownership states', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  assert.equal(archive.purchaseClassifiedWeapon('rifle').reason, 'classified');
  assert.equal(archive.revealClassifiedWeapon('rifle'), true);
  assert.equal(archive.grantWeaponTrial('rifle'), true);
  assert.equal(archive.hasWeaponAccess('rifle'), true);
  archive.discoverWeapon('Rifle');
  assert.equal(archive.purchaseMastery('rifle_capacity').reason, 'undiscovered');
  archive._awardFragments(10);
  assert.deepEqual(archive.purchaseClassifiedWeapon('rifle'), {
    ok: true,
    id: 'rifle',
    fragments: 0,
    grantsThirdSlot: false
  });
  assert.equal(archive.isWeaponOwned('rifle'), true);
  assert.equal(archive.purchaseMastery('rifle_capacity').reason, 'insufficient');
  archive.resetRun();
  assert.equal(archive.hasWeaponAccess('rifle'), true, 'ownership survives when the trial resets');
});

test('the classified Grenade package persists as the dedicated Slot 3 choice', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  archive._awardFragments(50);
  archive.revealClassifiedWeapon('grenade');
  assert.equal(archive.purchaseClassifiedWeapon('grenade').equippedTactical, 'grenade');
  assert.equal(archive.getEquippedTactical(), 'grenade');

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getEquippedTactical(), 'grenade');
});

test('active abilities persist ownership and one equipped Q choice', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  archive._awardFragments(77);
  assert.equal(archive.purchaseAbility('dynamite').ok, true);
  assert.equal(archive.purchaseAbility('satellite_strike').ok, true);
  assert.equal(archive.getEquippedAbility(), 'satellite_strike');
  assert.equal(archive.equipAbility('dynamite').ok, true);

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.isAbilityOwned('dynamite'), true);
  assert.equal(restored.isAbilityOwned('satellite_strike'), true);
  assert.equal(restored.getEquippedAbility(), 'dynamite');
});

test('legacy Rush and Dynamite purchases migrate into the ability slot', () => {
  const storage = makeStorage({
    [ARCHIVE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 8,
      unlocked: ['punchline_rush'],
      ownedWeapons: ['dynamite'],
      equippedTactical: 'dynamite'
    })
  });
  const archive = new ArchiveMutations({ storage });
  assert.equal(archive.isAbilityOwned('punchline_rush'), true);
  assert.equal(archive.isAbilityOwned('dynamite'), true);
  assert.equal(archive.getEquippedAbility(), 'punchline_rush');
});

test('late Archive income doubles after Wave 15 and the dossier pays once', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  assert.equal(archive.onBossDefeated(15), 2);
  assert.equal(archive.claimClassifiedDossier(), 5);
  assert.equal(archive.claimClassifiedDossier(), 0);
  assert.equal(archive.onWaveStarted(17), 2);
  assert.equal(archive.onBossDefeated(20), 4);
  assert.equal(archive.getPersistentState().fragments, 13);
  assert.equal(archive.getRunState().fragmentsEarned, 13);
});

test('wave and boss progression is disabled in tutorials and wave-skipped debug runs', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  assert.equal(archive.onWaveStarted(2), 0);
  assert.equal(archive.onWaveStarted(3), 1);
  assert.equal(archive.onWaveStarted(3), 0);
  assert.equal(archive.onWaveStarted(5), 1);
  assert.equal(archive.onBossDefeated(5), 2);
  assert.equal(archive.onBossDefeated(5), 0);
  assert.equal(archive.getPersistentState().fragments, 4);
  assert.equal(archive.getRunState().fragmentsEarned, 4);

  archive.resetRun({ tutorial: true });
  assert.equal(archive.shouldOfferAtWave(1), false);
  assert.equal(archive.onWaveStarted(3), 0);
  assert.equal(archive.onBossDefeated(5), 0);
  assert.equal(archive.getPersistentState().fragments, 4);

  archive.resetRun({ debug: true });
  assert.equal(archive.getRunState().debug, true);
  assert.equal(archive.shouldOfferAtWave(1), false);
  assert.equal(archive.onWaveStarted(3), 0);
  assert.equal(archive.onBossDefeated(10), 0);
  assert.equal(archive.areSurvivalMutationsRevealed(), false);
  assert.equal(archive.getPersistentState().fragments, 4);
});

test('owned mutation is guaranteed in an offer and mastery never enters the pool', () => {
  const archive = new ArchiveMutations({ storage: makeStorage(), rng: () => 0.99 });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(30);
  for (const id of ['irony_armor', 'extended_bit', 'main_character_energy']) archive.purchase(id);
  archive.purchaseMastery('pistol_caliber');
  archive.applyRank('irony_armor');
  const offer = archive.getOffer(3);
  assert.equal(offer.length, 3);
  assert.equal(offer.some(def => def.id === 'irony_armor'), true);
  assert.equal(offer.some(def => def.id === 'pistol_caliber'), false);
});

test('mutation ranks apply capped run stats and reset without removing unlocks', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(30);
  for (const id of ['irony_armor', 'extended_bit', 'main_character_energy']) archive.purchase(id);
  const calls = { armor: 0, hp: 0, stamina: 0 };
  const session = {
    addArmorCapacity(n) { calls.armor += n; },
    addMaxHp(n) { calls.hp += n; }
  };
  const player = { addStaminaCapacity(n) { calls.stamina += n; } };
  archive.applyRank('irony_armor', { session, player });
  archive.applyRank('main_character_energy', { session, player });
  archive.applyRank('extended_bit', { session, player });
  assert.deepEqual(calls, { armor: 2, hp: 2, stamina: 3 });

  archive.resetRun();
  assert.equal(archive.getRunState().points, 0);
  assert.equal(archive.getRank('irony_armor'), 0);
  assert.equal(archive.isUnlocked('irony_armor'), true);
});

test('Callback triggers every eighth elimination and resets its cadence between runs', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(20);
  assert.equal(archive.purchase('callback').ok, true);
  assert.equal(archive.applyRank('callback').ok, true);
  const rankOne = archive.getCallbackProfile();
  assert.equal(rankOne.enabled, true);
  assert.equal(rankOne.rank, 1);
  assert.equal(rankOne.cadence, 8);
  assert.equal(rankOne.radius, 3.5);
  assert.ok(Math.abs(rankOne.pushDistance - 1.4) < 1e-9);
  for (let elimination = 1; elimination < 8; elimination++) {
    assert.equal(archive.recordElimination().triggered, false);
  }
  const callback = archive.recordElimination();
  assert.equal(callback.triggered, true);
  assert.equal(callback.count, 8);

  archive.resetRun();
  assert.equal(archive.getRunState().callbackEliminations, 0);
  assert.equal(archive.recordElimination().triggered, false);
  archive.resetRun({ tutorial: true });
  assert.equal(archive.recordElimination().count, 0);
});

test('survival rank application updates the live session and player capacities', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  const session = new GameSession();
  const player = {
    stamina: 40,
    staminaMax: 100,
    addStaminaCapacity(amount, { fill = true } = {}) {
      this.staminaMax += amount;
      if (fill) this.stamina += amount;
    }
  };
  archive._awardFragments(15);
  for (const id of ['irony_armor', 'extended_bit', 'main_character_energy']) {
    assert.equal(archive.purchase(id).ok, true);
  }

  assert.equal(archive.applyRank('irony_armor', { session, player }).ok, true);
  assert.equal(archive.applyRank('extended_bit', { session, player }).ok, true);
  assert.equal(archive.applyRank('main_character_energy', { session, player }).ok, true);

  assert.deepEqual({ armor: session.armor, maxArmor: session.maxArmor }, { armor: 2, maxArmor: 2 });
  assert.deepEqual({ stamina: player.stamina, staminaMax: player.staminaMax }, { stamina: 43, staminaMax: 103 });
  assert.deepEqual({ hp: session.hp, maxHp: session.maxHp }, { hp: 100, maxHp: 102 });
});

test('offer schedule starts at Wave 1 and preserves ten total choices with the Wave 5 boss reward', () => {
  assert.deepEqual(MUTATION_OFFER_WAVES, [1, 7, 9, 13, 15, 17, 19, 21, 23]);
});

test('run points hard-cap at ten', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(4);
  assert.equal(archive.purchase('irony_armor').ok, true);
  for (let i = 0; i < 10; i++) assert.equal(archive.applyRank('irony_armor').ok, true);
  assert.equal(archive.applyRank('irony_armor').reason, 'capped');
  assert.equal(archive.getRunState().points, 10);
});

test('one survival purchase unlocks the full temporary run-rank track', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(4);
  assert.equal(archive.getMutationRankCap('irony_armor'), 0);
  assert.equal(archive.purchase('irony_armor').reason, 'milestone');
  archive.onBossDefeated(10);
  assert.equal(archive.areSurvivalMutationsRevealed(), true);
  assert.equal(archive.purchase('irony_armor').ok, true);
  assert.equal(archive.getMutationRankCap('irony_armor'), 10);
  assert.equal(archive.purchase('irony_armor').reason, 'unlocked');
  assert.equal(archive.getRank('irony_armor'), 0);
});

test('first boss-cycle earnings buy one Grade I mastery and no second purchase', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.onWaveStarted(3);
  archive.onWaveStarted(5);
  archive.onBossDefeated(5);
  assert.equal(archive.getPersistentState().fragments, 4);
  assert.deepEqual(archive.purchaseMastery('pistol_caliber'), {
    ok: true,
    id: 'pistol_caliber',
    weaponId: 'pistol',
    grade: 1,
    fragments: 0
  });
  assert.equal(archive.purchase('irony_armor').reason, 'milestone');
});

test('cheap SMG magazine mastery costs 4/6/8 without granting damage', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(18);
  assert.equal(archive.purchaseMastery('smg_capacity').reason, 'undiscovered');
  assert.equal(archive.discoverWeapon('SMG'), true);
  assert.equal(archive.discoverWeapon('SMG'), false);
  for (const [grade, cost] of [4, 6, 8].entries()) {
    assert.equal(archive.getMasteryCost('smg_capacity'), cost);
    assert.equal(archive.purchaseMastery('smg_capacity').grade, grade + 1);
  }
  assert.equal(archive.purchaseMastery('smg_capacity').reason, 'capped');
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getMagazineSize('SMG', 36), 48);
  assert.equal(archive.getWeaponDamageMultiplier('SMG'), 1);
  assert.deepEqual(describeWeaponMastery('smg_capacity', 2), { current: 44, next: 48, unit: 'mastery.unit.rounds' });
});

test('premium SMG damage mastery costs 10/20/32 without granting ammunition', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(62);
  archive.discoverWeapon('SMG');
  for (const cost of [10, 20, 32]) {
    assert.equal(archive.getMasteryCost('smg_damage'), cost);
    assert.equal(archive.purchaseMastery('smg_damage').ok, true);
  }
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getMagazineSize('SMG', 36), 36);
  assert.equal(archive.getWeaponDamageMultiplier('SMG'), 1.15);
  assert.deepEqual(describeWeaponMastery('smg_damage', 2), { current: '110%', next: '115%', unit: 'mastery.unit.damage' });
});

test('Rifle magazine and damage masteries progress independently', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(90);
  archive.revealClassifiedWeapon('Rifle');
  assert.equal(archive.purchaseClassifiedWeapon('Rifle').ok, true);
  archive.discoverWeapon('Rifle');
  for (const cost of [4, 6, 8]) {
    assert.equal(archive.getMasteryCost('rifle_capacity'), cost);
    assert.equal(archive.purchaseMastery('rifle_capacity').ok, true);
  }
  assert.equal(archive.getMagazineSize('Rifle', 16), 22);
  assert.equal(archive.getWeaponDamageMultiplier('Rifle'), 1);
  for (const cost of [10, 20, 32]) {
    assert.equal(archive.getMasteryCost('rifle_damage'), cost);
    assert.equal(archive.purchaseMastery('rifle_damage').ok, true);
  }
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getMagazineSize('Rifle', 16), 22);
  assert.equal(archive.getWeaponDamageMultiplier('Rifle'), 1.15);
});

test('premium Minigun mastery costs 10/24/38 and raises reserve each grade', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(72);
  archive.discoverWeapon('Minigun');
  const grades = [
    { cost: 10, reserve: 360 },
    { cost: 24, reserve: 440 },
    { cost: 38, reserve: 540 }
  ];
  for (const { cost, reserve } of grades) {
    assert.equal(archive.getMasteryCost('minigun_overdrive'), cost);
    assert.equal(archive.purchaseMastery('minigun_overdrive').ok, true);
    assert.equal(archive.getMinigunReserveSize(), reserve);
  }
  assert.equal(archive.getPersistentState().fragments, 0);
});

test('mastery profiles preserve intended damage caps', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(117);
  archive.discoverWeapon('Shotgun');
  archive.discoverWeapon('BeamSaber');
  archive.discoverWeapon('Minigun');
  for (const id of ['pistol_caliber', 'shotgun_payload', 'beamsaber_combo', 'minigun_overdrive']) {
    for (let grade = 0; grade < 3; grade++) assert.equal(archive.purchaseMastery(id).ok, true);
  }
  assert.equal(archive.getPistolDamageMultiplier(), 1.15);
  assert.equal(22 * archive.getPistolDamageMultiplier() * 4 >= 100, true);
  assert.equal(archive.getShotgunPelletDamage(), 13.5);
  assert.equal(archive.getMagazineSize('Minigun', 200), 320);
  assert.equal(archive.getMinigunReserveSize(), 540);
  assert.deepEqual(archive.getMinigunProfile(), { grade: 3, damageMultiplier: 1.3, spreadMultiplier: 0.7 });
  assert.deepEqual(archive.getBeamSaberComboProfile(), {
    enabled: true,
    grade: 3,
    firstDamage: 28,
    secondDamage: 32,
    delayMs: 160,
    lockoutMs: 700
  });
});

test('Rifle and DMR optics are discovery-gated permanent utility unlocks', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(78);
  assert.equal(archive.purchase('rifle_focus').reason, 'undiscovered');
  archive.revealClassifiedWeapon('Rifle');
  assert.equal(archive.purchaseClassifiedWeapon('Rifle').ok, true);
  archive.discoverWeapon('Rifle');
  assert.equal(archive.purchase('rifle_focus').ok, true);
  assert.equal(archive.getPersistentState().fragments, 48);
  assert.equal(archive.purchase('dmr_scope').reason, 'undiscovered');
  archive.revealClassifiedWeapon('DMR');
  assert.equal(archive.purchaseClassifiedWeapon('DMR').ok, true);
  archive.discoverWeapon('DMR');
  assert.equal(archive.purchase('dmr_scope').ok, true);
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.isUnlocked('rifle_focus'), true);
  assert.equal(archive.isUnlocked('dmr_scope'), true);
});

test('Punchline Rush costs ten fragments and never enters numerical rank offers', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(10);
  assert.equal(archive.purchaseAbility('punchline_rush').ok, true);
  assert.equal(archive.isAbilityOwned('punchline_rush'), true);
  assert.equal(archive.getEquippedAbility(), 'punchline_rush');
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'punchline_rush'), false);
});

test('ranked Irony Armor absorbs an enemy punch before health', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  const session = new GameSession();
  archive.revealSurvivalMutations(10);
  archive._awardFragments(4);
  archive.purchase('irony_armor');

  const beforeRank = session.damage(1);
  assert.equal(beforeRank.armorAbsorbed, 0);
  assert.equal(beforeRank.hp, 99);
  session.reset();

  archive.applyRank('irony_armor', { session });
  const firstPunch = session.damage(1);
  assert.equal(firstPunch.armorAbsorbed, 1);
  assert.equal(firstPunch.hpDamage, 0);
  assert.equal(firstPunch.armor, 1);
  assert.equal(firstPunch.hp, 100);

  const secondPunch = session.damage(3);
  assert.equal(secondPunch.armorAbsorbed, 1);
  assert.equal(secondPunch.hpDamage, 2);
  assert.equal(secondPunch.armor, 0);
  assert.equal(secondPunch.hp, 98);
});
