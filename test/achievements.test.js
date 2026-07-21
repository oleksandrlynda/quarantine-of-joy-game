import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AchievementsManager,
  ACHIEVEMENT_DEFINITIONS,
  CORE_WEAPONS,
  WEATHER_MODES
} from '../src/achievements.js';

function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
}

function makeManager(initial = {}) {
  const storage = makeStorage(initial);
  global.localStorage = storage;
  global.document = { dispatchEvent() {} };
  const manager = new AchievementsManager({ onUnlock: () => {} });
  return { manager, storage };
}

function start(manager, mode = 'standard') {
  manager.check({ type: 'runStart', mode });
}

function startWave(manager, number, options = {}) {
  manager.check({ type: 'waveStart', number, startHp: 100, weather: 'clear', isBoss: false, ...options });
}

function completeWave(manager, number, options = {}) {
  manager.check({ type: 'waveComplete', number, duration: 45, isBoss: false, ...options });
}

function combat(manager, options = {}) {
  manager.check({
    type: 'combatHit',
    weapon: 'Pistol',
    attackId: `attack-${Math.random()}`,
    targetId: `target-${Math.random()}`,
    targetType: 'grunt',
    damage: 25,
    killed: true,
    isHead: false,
    distance: 5,
    magazineRemaining: 1,
    remainingBefore: 2,
    gameTime: 1,
    ...options
  });
}

test('v2 collection has 58 entries, eight secrets, and ignores the legacy array', () => {
  const { manager } = makeManager({ achievements: JSON.stringify(['firstBlood', 'collector']) });
  const collection = manager.getCollection();

  assert.equal(ACHIEVEMENT_DEFINITIONS.length, 58);
  assert.equal(ACHIEVEMENT_DEFINITIONS.filter(item => item.hidden).length, 8);
  assert.equal(collection.length, 58);
  assert.equal(collection.some(item => item.unlocked), false);
  assert.equal(collection.find(item => item.id === 'termsOfEngagement').title, 'achievements.secret.name');
  assert.equal(collection.find(item => item.id === 'termsOfEngagement').progressLabel, null);
  assert.equal(collection.find(item => item.id === 'remoteWork').hidden, false);
});

test('every achievement has a unique, text-free SVG icon and secrets stay redacted', () => {
  const iconPaths = ACHIEVEMENT_DEFINITIONS.map(item => item.icon.split('?')[0]);
  assert.equal(new Set(iconPaths).size, ACHIEVEMENT_DEFINITIONS.length);

  for (const iconPath of iconPaths) {
    const source = fs.readFileSync(new URL(`../${iconPath}`, import.meta.url), 'utf8');
    assert.match(source, /^<svg[^>]+viewBox="0 0 64 64"/);
    assert.match(source, /<title>[^<]+<\/title>/);
    assert.doesNotMatch(source, /<text\b/);
  }

  const { manager } = makeManager();
  const hidden = manager.getCollection().find(item => item.id === 'termsOfEngagement');
  assert.match(hidden.icon, /\/secret\.svg\?/);
});

test('collection groups related career milestone ladders', () => {
  const ids = ACHIEVEMENT_DEFINITIONS.map(item => item.id);
  const adjacent = (...group) => {
    const start = ids.indexOf(group[0]);
    assert.deepEqual(ids.slice(start, start + group.length), group);
  };

  adjacent('firstBlood', 'monsterHunter', 'massUnfollow');
  adjacent('rookieScore', 'veteranScore', 'primeTime');
  adjacent('collector', 'streetSweeper', 'contentHoarder', 'adFreeExperience');
  adjacent('arsenal', 'endlessBarrage', 'noTimeToBuffer');
  adjacent('firstCancellation', 'unkillableIsh', 'damageControl', 'engagementBait');
});

test('English and Ukrainian localize every achievement and secret placeholder', () => {
  const en = JSON.parse(fs.readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
  const uk = JSON.parse(fs.readFileSync(new URL('../i18n/uk.json', import.meta.url), 'utf8'));
  for (const item of ACHIEVEMENT_DEFINITIONS) {
    for (const resources of [en, uk]) {
      assert.equal(typeof resources[item.titleKey], 'string', item.titleKey);
      assert.equal(typeof resources[item.descKey], 'string', item.descKey);
    }
  }
  for (const key of ['achievements.secret.name', 'achievements.secret.desc']) {
    assert.equal(typeof en[key], 'string');
    assert.equal(typeof uk[key], 'string');
  }
});

test('v2 unlocks and career counters persist while run progress resets', () => {
  const { manager, storage } = makeManager();
  start(manager);
  combat(manager);
  manager.check({ type: 'score', amount: 900 });

  const restored = new AchievementsManager({ onUnlock: () => {} });
  assert.equal(restored.unlocked.has('firstBlood'), true);
  assert.equal(restored.career.kills, 1);
  assert.equal(restored.career.score, 900);
  assert.equal(restored.run.score, 0);
  assert.equal(JSON.parse(storage.store.achievements_v2).version, 2);
});

test('Prime Time tracks and persists one million career points', () => {
  const { manager, storage } = makeManager();
  start(manager);
  manager.career.score = 999900;
  manager.check({ type: 'score', amount: 100 });

  assert.equal(manager.unlocked.has('primeTime'), true);
  assert.equal(manager.getCollection().find(item => item.id === 'primeTime').progressLabel, '1000000 / 1000000');
  assert.equal(JSON.parse(storage.store.achievements_v2).career.score, 1000000);
});

test('unlocked cards keep completed progress after run state resets', () => {
  const { manager } = makeManager();
  start(manager);
  manager.check({ type: 'score', amount: 10000 });
  startWave(manager, 1);
  completeWave(manager, 1);

  start(manager);
  const collection = manager.getCollection();
  const rookie = collection.find(item => item.id === 'rookieScore');
  const veteran = collection.find(item => item.id === 'veteranScore');
  const firstWave = collection.find(item => item.id === 'waveBeginner');

  assert.equal(rookie.progressLabel, '1000 / 1000');
  assert.equal(veteran.progressLabel, '10000 / 10000');
  assert.equal(firstWave.progressLabel, '1 / 1');
  assert.equal(rookie.progressRatio, 1);
});

test('career prestige achievements track kills, pickups, shots, deaths, and received damage', () => {
  const { manager, storage } = makeManager();
  start(manager);
  manager.career.kills = 4999;
  manager.career.pickups = 999;
  manager.career.shots = 49999;
  manager.career.deaths = 199;
  manager.career.damageTaken = 9990;

  combat(manager);
  manager.check({ type: 'pickup', pickupType: 'ammo' });
  manager.check({ type: 'shot', weapon: 'Pistol' });
  manager.check({ type: 'playerDied' });
  manager.check({ type: 'playerDamaged', amount: 10 });

  for (const id of ['massUnfollow', 'contentHoarder', 'endlessBarrage', 'firstCancellation', 'unkillableIsh', 'damageControl']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }

  const saved = JSON.parse(storage.store.achievements_v2).career;
  assert.equal(saved.deaths, 200);
  assert.equal(saved.damageTaken, 10000);
});

test('tutorial and debug events never advance progress', () => {
  const { manager } = makeManager();
  start(manager, 'tutorial');
  combat(manager);
  assert.equal(manager.career.kills, 0);

  start(manager);
  combat(manager, { source: 'debug' });
  assert.equal(manager.career.kills, 0);
});

test('the original ten achievements use career, run, and wave scopes', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 10);
  for (let i = 0; i < 100; i++) combat(manager);
  for (let i = 0; i < 500; i++) manager.check({ type: 'shot', weapon: 'Pistol' });
  for (let i = 0; i < 10; i++) manager.check({ type: 'pickup', pickupType: 'ammo' });
  manager.check({ type: 'score', amount: 10000 });
  manager.check({ type: 'time', delta: 900 });
  completeWave(manager, 10, { duration: 29 });

  for (const id of ['firstBlood', 'monsterHunter', 'rookieScore', 'veteranScore', 'waveBeginner', 'waveMaster', 'collector', 'arsenal', 'speedRunner', 'survivor']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }
});

test('wave challenges track damage, healing, reloads, headshots, and timing', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 1, { startHp: 25 });
  manager.check({ type: 'shot', weapon: 'Pistol' });
  for (let i = 0; i < 10; i++) combat(manager, { isHead: true });
  completeWave(manager, 1, { duration: 19 });

  for (const id of ['cleanFeed', 'headlineMaterial', 'noTimeToBuffer', 'engagementBait', 'rapidResponse']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }

  startWave(manager, 2, { startHp: 25 });
  manager.check({ type: 'playerDamaged', amount: 1 });
  manager.check({ type: 'reload', weapon: 'Pistol' });
  manager.check({ type: 'pickup', pickupType: 'med', healAmount: 5 });
  completeWave(manager, 2);
  assert.equal(manager.wave.active, false);
});

test('weapon-only, pistol-only, and pickup-free streaks obey full-wave rules', () => {
  const { manager } = makeManager();
  start(manager);
  for (let wave = 1; wave <= 5; wave++) {
    startWave(manager, wave);
    manager.check({ type: 'shot', weapon: 'Pistol' });
    combat(manager, { weapon: 'Pistol' });
    completeWave(manager, wave);
  }
  assert.equal(manager.unlocked.has('defaultSettings'), true);
  assert.equal(manager.unlocked.has('adFreeExperience'), true);

  start(manager);
  for (let wave = 1; wave <= 5; wave++) {
    startWave(manager, wave);
    combat(manager, { weapon: 'BeamSaber', killed: false });
    completeWave(manager, wave);
  }
  assert.equal(manager.unlocked.has('termsOfEngagement'), true);

  start(manager);
  for (let wave = 1; wave <= 10; wave++) {
    startWave(manager, wave);
    combat(manager, { weapon: 'Shotgun', killed: false });
    completeWave(manager, wave);
  }
  assert.equal(manager.unlocked.has('termsAndConditionsApply'), true);

  start(manager);
  startWave(manager, 1);
  combat(manager, { weapon: 'BeamSaber', killed: false });
  combat(manager, { weapon: 'Grenade', killed: false });
  completeWave(manager, 1);
  assert.equal(manager.run.weaponOnlyStreaks.BeamSaber, 0);
});

test('attack attribution unlocks last word, shotgun, DMR, and Minigun feats', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 1);
  combat(manager, { weapon: 'Pistol', remainingBefore: 1, magazineRemaining: 0 });
  for (let i = 0; i < 3; i++) combat(manager, { weapon: 'Shotgun', attackId: 'shotgun-one', targetId: `shotgun-${i}` });
  combat(manager, { weapon: 'DMR', isHead: true, distance: 25 });
  for (let i = 0; i < 10; i++) combat(manager, { weapon: 'Minigun', gameTime: 10 + i * .4 });

  for (const id of ['lastWord', 'replyAll', 'remoteWork', 'algorithmicBoost']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }
});

test('combo, boss, Hydraclone, and weather achievements use their dedicated scopes', () => {
  const { manager } = makeManager();
  start(manager);
  manager.check({ type: 'comboTier', tier: 3, previous: 2 });
  for (let i = 0; i < 15; i++) combat(manager);
  assert.equal(manager.unlocked.has('goingViral'), true);
  assert.equal(manager.unlocked.has('hotMic'), true);

  manager.check({ type: 'bossStart', wave: 5, bossId: 'boss_broodmaker' });
  manager.check({ type: 'bossDefeated', wave: 5, bossId: 'boss_broodmaker' });
  manager.check({ type: 'bossStart', wave: 10, bossId: 'boss_sanitizer' });
  manager.check({ type: 'playerDamaged', amount: 1 });
  manager.check({ type: 'bossDefeated', wave: 10, bossId: 'boss_sanitizer' });
  startWave(manager, 30, { isBoss: true });
  manager.check({ type: 'bossStart', wave: 30, bossId: 'hydra_test' });
  manager.check({ type: 'hydraGeneration', generation: 2 });
  manager.check({ type: 'bossDefeated', wave: 30, bossId: 'hydra_test', maxGeneration: 2 });
  completeWave(manager, 30, { isBoss: true });

  for (const id of ['breakTheBureau', 'untouchable', 'factChecker', 'threePartExpose']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }

  for (let i = 0; i < WEATHER_MODES.length; i++) {
    startWave(manager, i + 1, { weather: WEATHER_MODES[i] });
    completeWave(manager, i + 1);
  }
  assert.equal(manager.unlocked.has('allWeatherAudience'), true);
});

test('career weapon mastery exposes exact progress and unlocks the collection goals', () => {
  const { manager } = makeManager();
  start(manager);
  for (const weapon of CORE_WEAPONS) {
    manager.check({ type: 'shot', weapon });
    for (let i = 0; i < 50; i++) combat(manager, { weapon });
  }

  for (const id of ['fullSpectrum', 'cutTheFeed', 'omnichannel', 'streetSweeper']) {
    if (id === 'streetSweeper') {
      for (let i = 0; i < 25; i++) manager.check({ type: 'pickup', pickupType: 'ammo' });
    }
    assert.equal(manager.unlocked.has(id), true, id);
  }

  const collection = manager.getCollection();
  const omnichannel = collection.find(item => item.id === 'omnichannel');
  assert.equal(omnichannel.progressLabel, '7 / 7');
  const revealedSecret = collection.find(item => item.id === 'fullSpectrum');
  assert.equal(revealedSecret.title, 'ach.fullSpectrum.name');
  assert.equal(revealedSecret.progressLabel, '7 / 7');
});

test('Archive achievements track visits, purchases, grades, earned fragments, and the weapon reward', () => {
  const { manager, storage } = makeManager();

  manager.check({ type: 'archiveOpen' });
  manager.check({ type: 'archiveFragmentsEarned', amount: 25 });
  manager.check({ type: 'archivePurchase', category: 'mastery', itemId: 'pistol_caliber', cost: 10, grade: 1 });
  manager.check({ type: 'archivePurchase', category: 'mastery', itemId: 'pistol_caliber', cost: 40, grade: 2 });
  manager.check({ type: 'archivePurchase', category: 'mastery', itemId: 'pistol_caliber', cost: 70, grade: 3 });

  for (const id of ['openTheFiles', 'paperTrail', 'masterCopy', 'fragmented', 'blackBudget']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }
  assert.deepEqual(manager.getUnlockedRewards(), [{ achievementId: 'blackBudget', type: 'weapon', weaponId: 'grenade' }]);

  const saved = JSON.parse(storage.store.achievements_v2).career;
  assert.equal(saved.archivePurchases, 3);
  assert.equal(saved.archiveFragmentsEarned, 25);
  assert.equal(saved.archiveFragmentsSpent, 120);
  assert.equal(saved.archiveMaxGrade, 3);

  const { manager: classifiedManager } = makeManager();
  classifiedManager.check({ type: 'archivePurchase', category: 'classified', itemId: 'grenade', cost: 50 });
  assert.equal(classifiedManager.career.archiveFragmentsSpent, 0);
  assert.equal(classifiedManager.unlocked.has('blackBudget'), false);
});

test('one ability activation defeating five unique enemies unlocks Executive Function', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 1);

  for (let i = 0; i < 5; i++) {
    combat(manager, {
      weapon: 'Ability:dynamite',
      attackId: 'Ability:dynamite:1',
      targetId: `ability-target-${i}`
    });
  }

  assert.equal(manager.unlocked.has('executiveFunction'), true);
  assert.equal(manager.getCollection().find(item => item.id === 'executiveFunction').progressLabel, '5 / 5');
});

test('ability mastery offers a second permanent Grenade Launcher route', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 1);
  manager.career.abilityKills = 99;

  combat(manager, {
    weapon: 'Ability:satellite_strike',
    attackId: 'Ability:satellite_strike:1',
    targetId: 'ability-mastery-target'
  });

  assert.equal(manager.unlocked.has('appliedResearch'), true);
  assert.equal(manager.unlocked.has('controlledDemolition'), true);
  assert.deepEqual(manager.getUnlockedRewards(), [{
    achievementId: 'controlledDemolition',
    type: 'weapon',
    weaponId: 'grenade'
  }]);
});

test('a flawless Wave 15 boss fight offers the skill route to the Grenade Launcher', () => {
  const { manager } = makeManager();
  start(manager);
  manager.check({ type: 'bossStart', wave: 15, bossId: 'boss_captain' });
  manager.check({ type: 'bossDefeated', wave: 15, bossId: 'boss_captain' });

  assert.equal(manager.unlocked.has('hostileTakeover'), true);
  assert.deepEqual(manager.getUnlockedRewards(), [{
    achievementId: 'hostileTakeover',
    type: 'weapon',
    weaponId: 'grenade'
  }]);
});

test('ability-specific achievements track Bait, Gravity Well, and low-health Supply Drops', () => {
  const { manager } = makeManager();
  start(manager);
  startWave(manager, 1);

  manager.check({ type: 'engagementBaitAffected', count: 8, attackId: 'Ability:engagement_bait:1' });
  manager.check({ type: 'supplyDropOpened', hp: 25 });
  for (let i = 0; i < 8; i++) {
    combat(manager, {
      weapon: 'Ability:gravity_well',
      attackId: 'Ability:gravity_well:1',
      targetId: `gravity-target-${i}`
    });
  }

  for (const id of ['baitAndSwitch', 'eventHorizon', 'specialDelivery']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }
  assert.equal(manager.run.maxBaitAffected, 8);
  assert.equal(manager.run.maxGravityWellAttackKills, 8);
});

test('Archive capstones reconcile category ownership, classified clearance, and maxed upgrades', () => {
  const { manager, storage } = makeManager();

  manager.check({
    type: 'archiveState',
    categoriesOwned: ['classified', 'survival', 'spectacle', 'mastery', 'ability'],
    classifiedWeaponsOwned: 3,
    maxedUpgrades: 5
  });

  for (const id of ['archiveAuthority', 'fullClearance', 'finalDraft']) {
    assert.equal(manager.unlocked.has(id), true, id);
  }
  const saved = JSON.parse(storage.store.achievements_v2).career;
  assert.deepEqual(saved.archiveCategoriesOwned, ['classified', 'survival', 'spectacle', 'mastery', 'ability']);
  assert.equal(saved.classifiedWeaponsOwned, 3);
  assert.equal(saved.maxedArchiveUpgrades, 5);
});

test('Clean Sweep requires flawless Wave 5, 10, and 15 boss fights in one run', () => {
  const { manager } = makeManager();
  start(manager);

  for (const wave of [5, 10, 15]) {
    manager.check({ type: 'bossStart', wave, bossId: `boss_${wave}` });
    manager.check({ type: 'bossDefeated', wave, bossId: `boss_${wave}` });
  }
  assert.equal(manager.unlocked.has('cleanSweep'), true);
  assert.equal(manager.getCollection().find(item => item.id === 'cleanSweep').progressLabel, '3 / 3');

  start(manager);
  assert.equal(manager.run.flawlessBossWaves.size, 0);
});
