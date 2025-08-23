import test from 'node:test';
import assert from 'node:assert/strict';
import { Progression, pickTwoDistinct } from '../src/progression.js';

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
  assert.equal(p2.unlocks.rifle, true);
  assert.equal(p2.unlocks.beamsaber, true);
});

test('pickTwoDistinct returns unique entries', () => {
  const pool = ['a','b','c'];
  let calls = 0;
  const seq = [0.1, 0.1, 0.6];
  const origRand = Math.random;
  Math.random = () => seq[calls++];
  const picks = pickTwoDistinct(pool);
  Math.random = origRand;
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

