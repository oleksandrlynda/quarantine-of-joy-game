import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_STORAGE_KEY,
  CROWD_HECKLER_REFUND,
  ArchiveMutations,
  MUTATION_OFFER_WAVES,
  STANDARD_MUTATION_RANK_CAPS,
  STANDARD_MUTATION_RANK_UPGRADE_COSTS,
  describeMutationRank,
  describeWeaponMastery,
  resolveDebugShopCredits
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

test('debug Archive wallet resolves defaults and clamps custom credits', () => {
  assert.equal(resolveDebugShopCredits(new URLSearchParams()), null);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('shop=1')), 300);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('archive=1')), 300);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('credits=250')), 250);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('credits=100')), 200);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('credits=900')), 400);
  assert.equal(resolveDebugShopCredits(new URLSearchParams('fragments=375')), 375);
});

test('debug Archive purchases remain in memory and do not overwrite the real save', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  archive._awardFragments(5);
  const realSave = storage.store[ARCHIVE_STORAGE_KEY];

  assert.equal(archive.enableDebugShop(300), 300);
  assert.equal(archive.getPersistentState().revealed, true);
  assert.equal(archive.getPersistentState().fragments, 300);
  assert.equal(archive.purchaseAbility('dynamite').ok, true);
  assert.equal(archive.getPersistentState().fragments, 272);
  assert.equal(storage.store[ARCHIVE_STORAGE_KEY], realSave);

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getPersistentState().fragments, 5);
  assert.equal(restored.isAbilityOwned('dynamite'), false);
});

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
  assert.equal(state.survivalUnlockWave, 0);
  assert.equal(state.weaponGrades.pistol, 0);
  assert.equal(state.weaponGrades.smg_damage, 0);
  assert.equal(state.weaponGrades.rifle_damage, 0);

  assert.equal(archive.reveal(), true);
  archive._awardFragments(4);
  assert.equal(archive.purchase('irony_armor').reason, 'milestone');
  assert.equal(archive.revealSurvivalMutations(4), false);
  assert.equal(archive.revealSurvivalMutations(5), true);
  assert.equal(archive.isSurvivalMutationRevealed('irony_armor'), true);
  assert.equal(archive.isSurvivalMutationRevealed('main_character_energy'), false);
  assert.equal(archive.revealSurvivalMutations(10), true);
  assert.deepEqual(archive.purchase('irony_armor'), { ok: true, id: 'irony_armor', grade: 0, rankCap: 2, fragments: 0 });

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getPersistentState().revealed, true);
  assert.equal(restored.isUnlocked('irony_armor'), true);
  assert.equal(restored.getMutationGrade('irony_armor'), 0);
  assert.equal(restored.getMutationRankCap('irony_armor'), 2);
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

test('Overkill Confetti has three low-cost permanent Archive grades', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(13);
  for (const [grade, cost] of [2, 4, 7].entries()) {
    assert.equal(archive.getMutationCost('overkill_confetti'), cost);
    assert.equal(archive.purchase('overkill_confetti').ok, true);
    assert.equal(archive.getMutationGrade('overkill_confetti'), grade + 1);
  }
  assert.equal(archive.getMutationCost('overkill_confetti'), null);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'overkill_confetti'), false);
});

test('Algorithm Roulette has three permanent Stagecraft grades at 2, 4, and 7 fragments', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(13);
  for (const [grade, cost] of [2, 4, 7].entries()) {
    assert.equal(archive.getMutationCost('algorithm_roulette'), cost);
    assert.equal(archive.purchase('algorithm_roulette').ok, true);
    assert.equal(archive.getMutationGrade('algorithm_roulette'), grade + 1);
  }
  assert.equal(archive.getMutationCost('algorithm_roulette'), null);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'algorithm_roulette'), false);
});

test('Opening Act and Final Cut use permanent three-grade Stagecraft pricing', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(28);

  for (const cost of [2, 4, 7]) {
    assert.equal(archive.getMutationCost('opening_act'), cost);
    assert.equal(archive.purchase('opening_act').ok, true);
  }
  assert.equal(archive.getMutationGrade('opening_act'), 3);
  assert.equal(archive.getMutationCost('opening_act'), null);

  for (const cost of [3, 5, 7]) {
    assert.equal(archive.getMutationCost('final_cut'), cost);
    assert.equal(archive.purchase('final_cut').ok, true);
  }
  assert.equal(archive.getMutationGrade('final_cut'), 3);
  assert.equal(archive.getMutationCost('final_cut'), null);

  const offered = archive.getEligibleDefinitions().map(def => def.id);
  assert.equal(offered.includes('opening_act'), false);
  assert.equal(offered.includes('final_cut'), false);
});

test('Background Sync unlocks at Wave 10 as a one-rank run mutation', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage, rng: () => 0 });
  archive._awardFragments(6);

  assert.equal(archive.purchase('background_sync').reason, 'milestone');
  archive.revealSurvivalMutations(10);
  assert.equal(archive.purchase('background_sync').ok, true);
  assert.equal(archive.isUnlocked('background_sync'), true);
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getMutationRankCap('background_sync'), 1);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'background_sync'), true);
  assert.equal(archive.applyRank('background_sync').ok, true);
  assert.equal(archive.getRank('background_sync'), 1);
  assert.equal(archive.getEligibleDefinitions().some(def => def.id === 'background_sync'), false);

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.isUnlocked('background_sync'), true);
});

test('Backup Broadcast costs four fragments and replaces the run sidearm once', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  let replacements = 0;
  const weaponSystem = {
    replaceSecondaryWithSMG() {
      replacements += 1;
      return { name: 'SMG' };
    }
  };
  archive._awardFragments(4);

  assert.equal(archive.purchase('smg_sidearm').reason, 'milestone');
  archive.revealSurvivalMutations(5);
  assert.equal(archive.getMutationCost('smg_sidearm'), 4);
  assert.equal(archive.purchase('smg_sidearm').ok, true);
  assert.equal(archive.getMutationRankCap('smg_sidearm'), 1);
  assert.deepEqual(describeMutationRank('smg_sidearm', 0), {
    current: 'Pistol', next: 'SMG', unit: 'mutation.unit.secondarySlot'
  });
  assert.equal(archive.applyRank('smg_sidearm', { weaponSystem }).ok, true);
  assert.equal(replacements, 1);
  assert.equal(archive.applyRank('smg_sidearm', { weaponSystem }).reason, 'capped');

  archive.resetRun();
  assert.equal(archive.getRank('smg_sidearm'), 0);
  assert.equal(archive.isUnlocked('smg_sidearm'), true);
});

test('Deep Reserves is a four-rank run mutation with one cheap cap upgrade', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  archive._awardFragments(6);
  archive.revealSurvivalMutations(10);

  assert.deepEqual(describeMutationRank('deep_reserves', 0), {
    current: '100%', next: '130%', unit: 'mutation.unit.reserveLimit'
  });
  assert.equal(archive.getReserveLimit(64), 64);
  assert.equal(archive.getMutationCost('deep_reserves'), 3);
  assert.equal(archive.purchase('deep_reserves').ok, true);
  assert.equal(archive.getMutationRankCap('deep_reserves'), 2);
  assert.equal(archive.getReserveExpansionGrade(), 0, 'Archive ownership alone grants no reserve power');
  assert.equal(archive.applyRank('deep_reserves').ok, true);
  assert.equal(archive.applyRank('deep_reserves').ok, true);
  assert.equal(archive.applyRank('deep_reserves').reason, 'capped');
  assert.equal(archive.getReserveLimit(64), 102);

  archive.resetRun();
  assert.equal(archive.getReserveLimit(64), 64);
  assert.equal(archive.getMutationCost('deep_reserves'), 3);
  assert.equal(archive.purchase('deep_reserves').ok, true);
  assert.equal(archive.getMutationRankCap('deep_reserves'), 4);
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getMutationCost('deep_reserves'), null);
  assert.equal(archive.purchase('deep_reserves').reason, 'capped');
  for (let rank = 1; rank <= 4; rank++) assert.equal(archive.applyRank('deep_reserves').ok, true);
  assert.equal(archive.getReserveLimit(64), 140);
  assert.equal(archive.getReserveLimit(360, 660), 1092, 'weapon mastery reserve is preserved and the base-reserve bonus stays additive');

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getMutationRankCap('deep_reserves'), 4);
  assert.equal(restored.getReserveExpansionGrade(), 0);
  assert.equal(restored.getReserveLimit(108), 108);
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
  assert.equal(migrated.areSurvivalMutationsRevealed(), false);
  assert.equal(migrated.isSurvivalMutationRevealed('irony_armor'), true);
  assert.equal(migrated.getMutationRankCap('irony_armor'), 10);
  assert.equal(migrated.isUnlocked('crowd_heckler'), false);

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getPersistentState().fragments, 3 + CROWD_HECKLER_REFUND);
});

test('schema 10 mutation owners keep their previously purchased rank access without permanent effects', () => {
  const storage = makeStorage({
    [ARCHIVE_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 10,
      unlocked: ['irony_armor', 'deep_reserves'],
      mutationGrades: { deep_reserves: 4 },
      survivalUnlockWave: 10
    })
  });
  const migrated = new ArchiveMutations({ storage });

  assert.equal(migrated.getMutationGrade('irony_armor'), 4);
  assert.equal(migrated.getMutationRankCap('irony_armor'), 10);
  assert.equal(migrated.getMutationGrade('deep_reserves'), 1);
  assert.equal(migrated.getMutationRankCap('deep_reserves'), 4);
  assert.equal(migrated.getReserveExpansionGrade(), 0);
  assert.equal(migrated.getReserveLimit(108), 108);
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
  assert.equal(JSON.parse(storage.store[ARCHIVE_STORAGE_KEY]).survivalUnlockWave, 10);
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

test('achievement rewards grant a classified weapon without charging fragments', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });

  assert.deepEqual(archive.grantClassifiedWeapon('grenade'), {
    ok: true,
    id: 'grenade',
    fragments: 0,
    grantsThirdSlot: true,
    equippedTactical: 'grenade'
  });
  assert.equal(archive.isWeaponRevealed('grenade'), true);
  assert.equal(archive.isWeaponOwned('grenade'), true);
  assert.equal(archive.grantClassifiedWeapon('grenade').reason, 'owned');

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.isWeaponOwned('grenade'), true);
  assert.equal(restored.getEquippedTactical(), 'grenade');
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

test('Dynamite purchases persist Grade I at 28 and Grade II at 40 fragments', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  archive._awardFragments(68);

  assert.equal(archive.getAbilityCost('dynamite'), 28);
  assert.deepEqual(archive.purchaseAbility('dynamite'), {
    ok: true,
    id: 'dynamite',
    grade: 1,
    equippedAbility: 'dynamite',
    fragments: 40
  });
  assert.equal(archive.getAbilityGrade('dynamite'), 1);
  assert.equal(archive.getAbilityCost('dynamite'), 40);
  assert.equal(archive.purchaseAbility('dynamite').grade, 2);
  assert.equal(archive.getAbilityGrade('dynamite'), 2);
  assert.equal(archive.getAbilityCost('dynamite'), null);
  assert.equal(archive.purchaseAbility('dynamite').reason, 'maxed');

  const restored = new ArchiveMutations({ storage });
  assert.equal(restored.getAbilityGrade('dynamite'), 2);
});

test('the three support abilities are purchasable and equip through the Archive', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(45);

  assert.equal(archive.purchaseAbility('supply_drop').ok, true);
  assert.equal(archive.purchaseAbility('overtime').ok, true);
  assert.equal(archive.purchaseAbility('engagement_bait').ok, true);
  assert.equal(archive.getPersistentState().fragments, 0);
  assert.equal(archive.getEquippedAbility(), 'engagement_bait');
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

test('late Archive income doubles after Wave 15 and milestone caches pay once', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  assert.equal(archive.onBossDefeated(15), 2);
  assert.equal(archive.claimArchiveMilestone(15), 5);
  assert.equal(archive.claimArchiveMilestone(15), 0);
  assert.equal(archive.claimArchiveMilestone(30), 5);
  assert.equal(archive.claimArchiveMilestone(30), 0);
  assert.equal(archive.claimArchiveMilestone(45), 5);
  assert.equal(archive.claimArchiveMilestone(60), 5);
  assert.equal(archive.claimArchiveMilestone(75), 0);
  assert.equal(archive.onWaveStarted(17), 2);
  assert.equal(archive.onBossDefeated(20), 4);
  assert.equal(archive.getPersistentState().fragments, 28);
  assert.equal(archive.getRunState().fragmentsEarned, 28);
  assert.deepEqual(archive.getPersistentState().archiveMilestonesClaimed, [15, 30, 45, 60]);
});

test('earned fragments emit achievement progress only for progression income', () => {
  const awards = [];
  const archive = new ArchiveMutations({
    storage: makeStorage(),
    onFragmentsAwarded: amount => awards.push(amount)
  });

  assert.equal(archive.onWaveStarted(3), 1);
  assert.equal(archive.onBossDefeated(5), 2);
  assert.deepEqual(awards, [1, 2]);

  archive.resetRun({ tutorial: true });
  assert.equal(archive.onBossDefeated(10), 0);
  assert.deepEqual(awards, [1, 2]);
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

test('chapter retries cannot claim the same campaign rewards again', () => {
  const storage = makeStorage();
  const archive = new ArchiveMutations({ storage });
  assert.equal(archive.onWaveStarted(3), 1);
  assert.equal(archive.onBossDefeated(5), 2);

  archive.resetRun();
  assert.equal(archive.onWaveStarted(3), 0);
  assert.equal(archive.onBossDefeated(5), 0);
  assert.equal(archive.getPersistentState().fragments, 3);

  archive.resetCampaignRewardLedger();
  archive.resetRun();
  assert.equal(archive.onWaveStarted(3), 1, 'a deliberate New Game starts a new reward cycle');
  assert.equal(archive.onBossDefeated(5), 2);
  assert.equal(archive.getPersistentState().fragments, 6);
});

test('mutation checkpoint restores ranks, trials, and run counters', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(10);
  assert.equal(archive.purchase('irony_armor').ok, true);
  assert.equal(archive.applyRank('irony_armor').ok, true);
  archive.revealClassifiedWeapon('grenade');
  assert.equal(archive.grantWeaponTrial('grenade'), true);
  for (let i = 0; i < 5; i += 1) archive.recordElimination();
  const checkpoint = archive.exportRunCheckpoint();

  archive.resetRun();
  assert.equal(archive.restoreRunCheckpoint(checkpoint), true);
  assert.equal(archive.getRank('irony_armor'), 1);
  assert.equal(archive.getRunState().points, 1);
  assert.deepEqual(archive.getRunState().trialWeapons, ['grenade']);
  assert.equal(archive.getRunState().callbackEliminations, 0, 'locked Callback progress is harmless without a rank');
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
  assert.deepEqual({ hp: session.hp, maxHp: session.maxHp }, { hp: 101, maxHp: 102 });
});

test('offer schedule starts at Wave 1 and preserves ten total choices with the Wave 5 boss reward', () => {
  assert.deepEqual(MUTATION_OFFER_WAVES, [1, 7, 9, 13, 15, 17, 19, 21, 23]);
});

test('run points hard-cap at ten', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive.revealSurvivalMutations(10);
  archive._awardFragments(14);
  assert.equal(archive.purchase('irony_armor').ok, true);
  for (const cost of STANDARD_MUTATION_RANK_UPGRADE_COSTS) {
    assert.equal(archive.getMutationCost('irony_armor'), cost);
    assert.equal(archive.purchase('irony_armor').ok, true);
  }
  for (let i = 0; i < 10; i++) assert.equal(archive.applyRank('irony_armor').ok, true);
  assert.equal(archive.applyRank('irony_armor').reason, 'capped');
  assert.equal(archive.getRunState().points, 10);
});

test('standard mutation Archive grades raise only the temporary run-rank cap', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(14);
  assert.equal(archive.getMutationRankCap('irony_armor'), 0);
  assert.equal(archive.purchase('irony_armor').reason, 'milestone');
  archive.onBossDefeated(10);
  assert.equal(archive.areSurvivalMutationsRevealed(), true);
  assert.equal(archive.purchase('irony_armor').ok, true);
  assert.equal(archive.getMutationGrade('irony_armor'), 0);
  assert.equal(archive.getMutationRankCap('irony_armor'), 2);
  assert.deepEqual(STANDARD_MUTATION_RANK_CAPS, [2, 4, 6, 8, 10]);
  for (const [grade, expectedCap] of [4, 6, 8, 10].entries()) {
    assert.equal(archive.purchase('irony_armor').ok, true);
    assert.equal(archive.getMutationGrade('irony_armor'), grade + 1);
    assert.equal(archive.getMutationRankCap('irony_armor'), expectedCap);
  }
  assert.equal(archive.purchase('irony_armor').reason, 'capped');
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
  assert.equal(archive.purchase('irony_armor').reason, 'insufficient');
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

test('premium SMG damage mastery costs 8/14/20 without granting ammunition', () => {
  const archive = new ArchiveMutations({ storage: makeStorage() });
  archive._awardFragments(42);
  archive.discoverWeapon('SMG');
  for (const cost of [8, 14, 20]) {
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
  archive._awardFragments(70);
  archive.revealClassifiedWeapon('Rifle');
  assert.equal(archive.purchaseClassifiedWeapon('Rifle').ok, true);
  archive.discoverWeapon('Rifle');
  for (const cost of [4, 6, 8]) {
    assert.equal(archive.getMasteryCost('rifle_capacity'), cost);
    assert.equal(archive.purchaseMastery('rifle_capacity').ok, true);
  }
  assert.equal(archive.getMagazineSize('Rifle', 16), 22);
  assert.equal(archive.getWeaponDamageMultiplier('Rifle'), 1);
  for (const cost of [8, 14, 20]) {
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
    { cost: 10, reserve: 440 },
    { cost: 24, reserve: 540 },
    { cost: 38, reserve: 660 }
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
  assert.equal(archive.getMinigunReserveSize(), 660);
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
  archive._awardFragments(61);
  assert.equal(archive.purchase('rifle_focus').reason, 'undiscovered');
  archive.revealClassifiedWeapon('Rifle');
  assert.equal(archive.purchaseClassifiedWeapon('Rifle').ok, true);
  archive.discoverWeapon('Rifle');
  assert.equal(archive.purchase('rifle_focus').ok, true);
  assert.equal(archive.getPersistentState().fragments, 36);
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
