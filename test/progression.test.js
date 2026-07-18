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

test('classified milestones reveal weapon trials and the Grenade Slot 3 package', () => {
  setupLocalStorage();
  const revealed = [];
  const trials = new Set();
  let dossierClaims = 0;
  let grenadeSlots = 0;
  const mutations = {
    revealClassifiedWeapon(id) { revealed.push(id); return true; },
    grantWeaponTrial(id) { trials.add(id); return true; },
    getClassifiedWeaponDefinition(id) { return { id }; },
    hasWeaponAccess(id) { return trials.has(id); },
    claimClassifiedDossier() { dossierClaims += 1; return 5; },
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
  assert.equal(trials.has('rifle'), true);
  p.onBossDefeated(10);
  assert.equal(trials.has('dmr'), true);
  p.onBossDefeated(15);
  assert.equal(trials.has('grenade'), true);
  assert.equal(grenadeSlots, 1);
  assert.equal(dossierClaims, 1);
  p.onBossDefeated(20);
  assert.equal(trials.has('dynamite'), false);
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

