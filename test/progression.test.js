import test from 'node:test';
import assert from 'node:assert/strict';
import { Progression, pickTwoDistinct } from '../src/progression.js';
import { GameSession } from '../src/game/session.js';

function makeStubDoc(){
  const elements = {};
  return {
    createElement(tag){
      return {
        tag,
        children: [],
        className: '',
        style: {},
        onclick: null,
        appendChild(child){ this.children.push(child); },
        append(...children){ this.children.push(...children); },
        classList: { add(){}, remove(){} },
        set textContent(v){ this._text = v; },
        get textContent(){ return this._text; },
        set alt(v){ this._alt = v; },
        get alt(){ return this._alt; },
        src: '',
      };
    },
    getElementById(id){
      if (!elements[id]){
        elements[id] = {
          id,
          style: {},
          children: [],
          disabled: false,
          classList: { add(){}, remove(){} },
          appendChild(child){ this.children.push(child); },
          innerHTML: '',
          onclick: null,
        };
      }
      return elements[id];
    }
  };
}

// Helper to reset global localStorage mock
function setupLocalStorage(){
  const store = {};
  global.localStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
  };
  return store;
}

test('unlock persistence across instances', () => {
  const store = setupLocalStorage();
  const doc = makeStubDoc();
  const ws = { getUnlockedPrimaries: () => [], swapPrimary: () => {} };
  const p1 = new Progression({ weaponSystem: ws, documentRef: doc, onPause: () => {} });
  p1._presentOffer = () => {}; // avoid DOM work
  p1._presentSidearmOffer = () => {};
  p1.onWave(6); // should unlock several weapons and save

  // new instance should load unlocks from localStorage
  const p2 = new Progression({ weaponSystem: ws, documentRef: doc, onPause: () => {} });
  assert.equal(p2.unlocks.bestWave, 6);
  assert.equal(p2.unlocks.smg, true);
  assert.equal(p2.unlocks.shotgun, true);
  assert.equal(p2.unlocks.minigun, true);
  assert.equal(p2.unlocks.rifle, false, 'classified ownership is managed by the Archive');
  assert.equal(p2.unlocks.beamsaber, true);
});

test('pickTwoDistinct returns unique entries', () => {
  const pool = ['a','b','c'];
  let calls = 0;
  const seq = [0.1, 0.1, 0.6];
  const rng = () => seq[calls++];
  const picks = pickTwoDistinct(pool, rng);
  assert.equal(picks.length, 2);
  assert.notEqual(picks[0], picks[1]);
});

test('sidearm offers exclude current sidearm', () => {
  setupLocalStorage();
  const doc = makeStubDoc();
  const ws = {
    inventory: [{ name: 'Rifle' }, { name: 'Pistol' }],
    sidearmClasses: { Pistol: function(){}, Grenade: function(){}, BeamSaber: function(){} },
    getSidearms: () => [
      { name: 'Pistol', make: () => ({}) },
      { name: 'Grenade', make: () => ({}) },
      { name: 'BeamSaber', make: () => ({}) }
    ]
  };
  const p = new Progression({ weaponSystem: ws, documentRef: doc, onPause: () => {} });
  p._presentOffer = () => {};
  p._presentSidearmOffer();
  const choices = doc.getElementById('offerChoices').children;
  const names = choices.map(c => c.children[1].textContent);
  assert.deepEqual(names.sort(), ['BeamSaber','Grenade']);
});

test('decline tops off low reserve', () => {
  setupLocalStorage();
  const doc = makeStubDoc();
  let hud = 0;
  const cur = {
    cfg: { reserve: 100 },
    reserve: 20,
    getReserve(){ return this.reserve; },
    addReserve(n){ this.reserve += n; }
  };
  const ws = { current: cur, updateHUD(){ hud += 1; } };
  const p = new Progression({ weaponSystem: ws, documentRef: doc, onPause: () => {} });
  p._decline();
  assert.equal(cur.reserve, 100);
  assert.equal(hud, 1);
});

test('decline grants 50% bonus at or above half reserve', () => {
  setupLocalStorage();
  const doc = makeStubDoc();
  let hud = 0;
  const cur = {
    cfg: { reserve: 100 },
    reserve: 60,
    getReserve(){ return this.reserve; },
    addReserve(n){ this.reserve += n; }
  };
  const ws = { current: cur, updateHUD(){ hud += 1; } };
  const p = new Progression({ weaponSystem: ws, documentRef: doc, onPause: () => {} });
  p._decline();
  assert.equal(cur.reserve, 110);
  assert.equal(hud, 1);
});

test('checkpoint entry does not award fragments for a wave cleared in an earlier run', () => {
  setupLocalStorage();
  const awarded = [];
  const mutations = {
    onWaveStarted: wave => awarded.push(wave),
    getRunState: () => ({ tutorial: false, debug: false }),
    shouldOfferAtWave: () => false,
    isWeaponOwned: () => false
  };
  const ws = { getUnlockedPrimaries: () => [], swapPrimary: () => {} };
  const progression = new Progression({ weaponSystem: ws, documentRef: makeStubDoc(), mutations });
  progression._presentOffer = () => false;

  progression.onWave(11, { awardPriorWave: false, forceWeaponOffer: true });
  progression.onWave(12);

  assert.deepEqual(awarded, [12]);
});

test('legacy checkpoint fallback opens the Armory chooser without requiring a prior-wave reward', () => {
  setupLocalStorage();
  const awarded = [];
  const offers = [];
  const mutations = {
    onWaveStarted: wave => awarded.push(wave),
    getRunState: () => ({ tutorial: false, debug: false }),
    shouldOfferAtWave: () => false,
    isWeaponOwned: () => false
  };
  const progression = new Progression({
    weaponSystem: { getUnlockedPrimaries: () => [], swapPrimary: () => {} },
    documentRef: makeStubDoc(),
    mutations
  });
  progression._presentOffer = (...args) => {
    offers.push(args);
    return true;
  };

  progression.onWave(21, { awardPriorWave: false, forceWeaponOffer: true });

  assert.equal(offers.length, 1, 'odd-wave chapter resumes still receive an Armory decision');
  assert.deepEqual(awarded, []);
  assert.equal(progression.unlocks.bestWave, 21);
  assert.equal(progression.unlocks.smg, true);
  assert.equal(progression.unlocks.shotgun, true);
  assert.equal(progression.unlocks.minigun, true);
  assert.equal(progression.unlocks.beamsaber, true);
});

test('Wave 42 requests the Armory chooser both after Wave 41 and from Continue', () => {
  setupLocalStorage();
  const mutations = {
    onWaveStarted: () => 0,
    getRunState: () => ({ tutorial: false, debug: false }),
    shouldOfferAtWave: () => false,
    isWeaponOwned: () => false
  };
  const progression = new Progression({
    weaponSystem: { getUnlockedPrimaries: () => [], swapPrimary: () => {} },
    documentRef: makeStubDoc(),
    mutations
  });
  let offers = 0;
  progression._presentOffer = () => {
    offers += 1;
    return true;
  };

  progression.onWave(41);
  progression.onWave(42);
  assert.equal(offers, 1, 'natural Wave 41 to 42 transition');

  progression.resetRun();
  progression.onWave(42, { awardPriorWave: false });
  assert.equal(offers, 2, 'direct Wave 42 Continue');
});

test('restored odd-wave chapters keep natural Armory cadence', () => {
  setupLocalStorage();
  const mutations = {
    onWaveStarted: () => 0,
    getRunState: () => ({ tutorial: false, debug: false }),
    shouldOfferAtWave: () => false,
    isWeaponOwned: () => false
  };
  const progression = new Progression({
    weaponSystem: { getUnlockedPrimaries: () => [], swapPrimary: () => {} },
    documentRef: makeStubDoc(),
    mutations
  });
  let offers = 0;
  progression._presentOffer = () => { offers += 1; return true; };

  progression.onWave(21, { awardPriorWave: false });
  assert.equal(offers, 0, 'Wave 21 does not gain an extra offer just because it was resumed');
});

test('progression checkpoint restores offer cadence and boss history', () => {
  setupLocalStorage();
  const progression = new Progression({ weaponSystem: {}, documentRef: makeStubDoc() });
  progression.offerCooldown = 1;
  progression.bossKills = 3;
  progression.defeatedBossWaves = new Set([5, 10, 15]);
  progression.sidearmOfferShown = true;
  const state = progression.exportRunCheckpoint();

  progression.resetRun();
  assert.equal(progression.restoreRunCheckpoint(state), true);
  assert.equal(progression.offerCooldown, 1);
  assert.equal(progression.bossKills, 3);
  assert.deepEqual([...progression.defeatedBossWaves], [5, 10, 15]);
  assert.equal(progression.sidearmOfferShown, true);
});

test('chapter checkpoint replays the exact Armory choices instead of rerolling', () => {
  setupLocalStorage();
  const choices = ['SMG', 'Shotgun', 'Minigun'].map(name => ({ name, make: () => ({ name }) }));
  const makeWeaponSystem = () => ({
    inventory: [{ name: 'Pistol' }],
    getPrimaryWeapon: () => ({ name: 'Pistol' }),
    getUnlockedPrimaries: () => choices,
    switchSlot() {},
    updateHUD() {}
  });
  const original = new Progression({
    weaponSystem: makeWeaponSystem(),
    documentRef: makeStubDoc(),
    rng: (() => { const values = [0, 0.5]; let index = 0; return () => values[index++] ?? 0.5; })()
  });
  assert.equal(original._presentOffer(), true);
  const checkpoint = original.exportRunCheckpoint();

  const restored = new Progression({
    weaponSystem: makeWeaponSystem(),
    documentRef: makeStubDoc(),
    rng: () => 0.99
  });
  restored.restoreRunCheckpoint(checkpoint);
  assert.equal(restored._presentOffer(), true);
  assert.deepEqual(restored.activeOfferSnapshot, checkpoint.entryOffer);
});

test('chapter checkpoint replays the exact mutation choices instead of rerolling', () => {
  setupLocalStorage();
  const definitions = ['irony_armor', 'extended_bit', 'main_character_energy'].map(id => ({
    id,
    maxRank: 2,
    nameKey: `${id}.name`,
    descriptionKey: `${id}.desc`
  }));
  const makeMutations = offered => ({
    getOffer: () => offered,
    getEligibleDefinitions: () => definitions,
    getRank: () => 0,
    getMutationRankCap: () => 2
  });
  const original = new Progression({
    weaponSystem: {},
    documentRef: makeStubDoc(),
    mutations: makeMutations(definitions.slice(0, 2))
  });
  assert.equal(original._presentMutationOffer(), true);
  const checkpoint = original.exportRunCheckpoint();

  const restored = new Progression({
    weaponSystem: {},
    documentRef: makeStubDoc(),
    mutations: makeMutations(definitions.slice(1))
  });
  restored.restoreRunCheckpoint(checkpoint);
  assert.equal(restored._presentMutationOffer(), true);
  assert.deepEqual(restored.activeOfferSnapshot, checkpoint.entryOffer);
});

test('queued offers wait for the active offer and then preserve order', () => {
  setupLocalStorage();
  const p = new Progression({ weaponSystem: {}, documentRef: makeStubDoc(), onPause: () => {} });
  const calls = [];
  p.offerOpen = true;
  p._runOrQueue(() => { calls.push('mutation'); return true; });
  p._runOrQueue(() => { calls.push('sidearm'); return true; });
  assert.deepEqual(calls, []);
  assert.equal(p.offerQueue.length, 2);
  p.offerOpen = false;
  p._showNextQueued();
  assert.deepEqual(calls, ['mutation']);
  assert.equal(p.offerQueue.length, 1);
});

test('defeating the Wave 5 boss triggers the first mutation offer exactly once', () => {
  setupLocalStorage();
  const p = new Progression({ weaponSystem: {}, documentRef: makeStubDoc(), onPause: () => {} });
  let mutationOffers = 0;
  p.requestMutationOffer = () => { mutationOffers += 1; return true; };

  assert.equal(p.onBossDefeated(5), true);
  assert.equal(mutationOffers, 1);
  assert.equal(p.bossKills, 1);
  assert.equal(p.onBossDefeated(5), false);
  assert.equal(mutationOffers, 1);
  assert.equal(p.bossKills, 1);

  assert.equal(p.onBossDefeated(10), false);
  assert.equal(mutationOffers, 1);
  assert.equal(p.bossKills, 2);
});

test('classified milestones reveal primary licenses without trials and keep the Grenade Slot 3 trial', () => {
  setupLocalStorage();
  const revealed = [];
  const trials = new Set();
  let dossierClaims = 0;
  let grenadeSlots = 0;
  const mutations = {
    revealClassifiedWeapon(id) { revealed.push(id); return true; },
    grantWeaponTrial(id) { trials.add(id); return true; },
    getClassifiedWeaponDefinition(id) { return { id, tacticalSlot: id === 'grenade' }; },
    isWeaponOwned() { return false; },
    claimArchiveMilestone() { dossierClaims += 1; return 5; },
    shouldOfferAtWave() { return false; }
  };
  const ws = {
    getUnlockedPrimaries: () => [],
    ensureGrenadeSlot() { grenadeSlots += 1; }
  };
  const notifications = [];
  const p = new Progression({
    weaponSystem: ws,
    documentRef: makeStubDoc(),
    onPause: () => {},
    mutations,
    onClassifiedReveal: event => notifications.push(event.weaponId)
  });
  p._presentOffer = () => false;

  p.onWave(6);
  assert.equal(trials.has('rifle'), false);
  p.onBossDefeated(10);
  assert.equal(trials.has('dmr'), false);
  p.onBossDefeated(15);
  assert.equal(trials.has('grenade'), true);
  assert.equal(grenadeSlots, 1);
  assert.equal(dossierClaims, 1);
  p.onBossDefeated(20);
  assert.equal(trials.has('dynamite'), false);
  p.onBossDefeated(30);
  p.onBossDefeated(45);
  p.onBossDefeated(60);
  assert.equal(dossierClaims, 4);
  assert.deepEqual(revealed, ['rifle', 'dmr', 'grenade']);
  assert.deepEqual(notifications, ['rifle', 'dmr', 'grenade']);
});

test('an unlocked mutation can be offered from Wave 1 of a new run', () => {
  setupLocalStorage();
  const doc = makeStubDoc();
  const mutations = {
    onWaveStarted() {},
    shouldOfferAtWave: wave => wave === 1,
    getOffer: () => [{
      id: 'irony_armor',
      nameKey: 'mutation.armor.name',
      descriptionKey: 'mutation.armor.desc',
      maxRank: 10
    }],
    getRank: () => 0,
    getMutationRankCap: () => 10
  };
  const p = new Progression({
    weaponSystem: {},
    documentRef: doc,
    onPause: () => {},
    mutations,
    translate: key => key
  });

  p.onWave(1);

  assert.equal(p.offerOpen, true);
  assert.equal(p.offerMode, 'mutation');
  assert.equal(doc.getElementById('offerChoices').children.length, 1);
  assert.equal(doc.getElementById('offerChoices').children[0].children[2].textContent, 'mutation.rank 1/10');
});

test('a wave-skipped debug run cannot update persistent progression', () => {
  setupLocalStorage();
  let mutationWaveCalls = 0;
  let classifiedReveals = 0;
  const mutations = {
    getRunState: () => ({ tutorial: false, debug: true }),
    onWaveStarted() { mutationWaveCalls += 1; },
    revealClassifiedWeapon() { classifiedReveals += 1; return true; }
  };
  const p = new Progression({
    weaponSystem: {},
    documentRef: makeStubDoc(),
    onPause: () => {},
    mutations
  });

  p.onWave(40);
  assert.equal(p.onBossDefeated(10), false);

  assert.equal(mutationWaveCalls, 1);
  assert.equal(p.unlocks.bestWave, 0);
  assert.equal(p.bossKills, 0);
  assert.equal(classifiedReveals, 0);
});

test('accepting the Wave 5 Irony Armor offer creates armor that protects HP', () => {
  setupLocalStorage();
  const doc = makeStubDoc();
  const session = new GameSession();
  let rank = 0;
  const mutations = {
    getOffer: () => [{
      id: 'irony_armor',
      nameKey: 'mutation.armor.name',
      descriptionKey: 'mutation.armor.desc',
      maxRank: 10
    }],
    getRank: () => rank,
    getMutationRankCap: () => 3,
    applyRank(id, context) {
      assert.equal(id, 'irony_armor');
      rank += 1;
      context.session.addArmorCapacity(2, { fill: true });
      return { ok: true, id, rank };
    }
  };
  const ws = { updateHUD() {} };
  const p = new Progression({
    weaponSystem: ws,
    documentRef: doc,
    onPause: () => {},
    mutations,
    session,
    translate: key => key
  });

  assert.equal(p.onBossDefeated(5), true);
  assert.equal(p.offerOpen, true);
  assert.equal(doc.getElementById('offerChoices').children[0].children[2].textContent, 'mutation.rank 1/3');
  doc.getElementById('offerChoices').children[0].onclick();
  doc.getElementById('offerAccept').onclick();

  assert.equal(rank, 1);
  assert.equal(session.maxArmor, 2);
  assert.equal(session.armor, 2);
  const punch = session.damage(2);
  assert.equal(punch.armorAbsorbed, 2);
  assert.equal(punch.hp, 100);
});

