// Armory and Punchline offer scheduling with one shared, queued modal.
import { logError } from './util/log.js';
import { getJSON, setJSON } from './util/storage.js';
import { describeMutationRank } from './mutations.js';

export function pickTwoDistinct(pool, rng = Math.random){
  if (pool.length <= 1) return pool.slice(0, 1);
  const i = Math.floor(rng() * pool.length);
  let j = Math.floor(rng() * pool.length);
  while (j === i) j = Math.floor(rng() * pool.length);
  return [pool[i], pool[j]];
}

export class Progression {
  constructor({
    weaponSystem,
    documentRef,
    onPause,
    controls,
    rng = Math.random,
    mutations = null,
    session = null,
    player = null,
    translate = key => key,
    onMutationApplied = null,
    onClassifiedReveal = null
  }){
    this.ws = weaponSystem;
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;
    this.rng = rng;
    this.mutations = mutations;
    this.session = session;
    this.player = player;
    this.translate = translate;
    this.onMutationApplied = onMutationApplied;
    this.onClassifiedReveal = onClassifiedReveal;

    this.UNLOCKS_KEY = 'bs3d_unlocks';
    this.unlocks = this._loadUnlocks();
    this.offerCooldown = 0;
    this.offerOpen = false;
    this.offerMode = 'weapon';
    this.offerQueue = [];
    this._offerHandlersBound = false;
    this.bossKills = 0;
    this.defeatedBossWaves = new Set();
    this.sidearmOfferShown = false;
    this.selectedPick = null;
    this.declineSelected = false;
    this._bindOfferUI();
  }

  _loadUnlocks(){
    const base = { bestWave:0, smg:false, shotgun:false, rifle:false, dmr:false, beamsaber:false, minigun:false };
    return { ...base, ...getJSON(this.UNLOCKS_KEY, {}) };
  }

  _saveUnlocks(){ setJSON(this.UNLOCKS_KEY, this.unlocks); }

  resetRun() {
    this.offerCooldown = 0;
    this.bossKills = 0;
    this.defeatedBossWaves.clear();
    this.sidearmOfferShown = false;
    this.offerQueue.length = 0;
    this.offerOpen = false;
    this.selectedPick = null;
    this.declineSelected = false;
    if (this.offerEl) this.offerEl.style.display = 'none';
  }

  _isProgressionRun() {
    const run = this.mutations?.getRunState?.();
    return run?.tutorial !== true && run?.debug !== true;
  }

  onWave(wave){
    this.mutations?.onWaveStarted?.(wave);
    if (!this._isProgressionRun()) return;
    if (wave > (this.unlocks.bestWave || 0)){
      this.unlocks.bestWave = wave;
      if (wave >= 2) this.unlocks.smg = true;
      if (wave >= 3) this.unlocks.shotgun = true;
      if (wave >= 4) this.unlocks.minigun = true;
      if (wave >= 3) this.unlocks.beamsaber = true;
      this._saveUnlocks();
    }

    if (wave === 6) this._revealClassifiedTrial('rifle');

    if (wave === 1) {
      if (this.mutations?.shouldOfferAtWave?.(wave)) this.requestMutationOffer();
      return;
    }
    if (wave === 2) {
      const smg = this.ws.getUnlockedPrimaries(this._effectiveUnlocks()).find(x => x.name === 'SMG');
      if (smg) this.ws.swapPrimary(smg.make);
      return;
    }

    let guided = false;
    const guidedOffers = new Map([
      [3, ['Shotgun', 'SMG']],
      [4, ['BeamSaber']],
      [6, ['Rifle', 'SMG']],
      [8, ['Minigun']],
      [11, ['Rifle', 'DMR']],
      [12, ['DMR', 'BeamSaber']]
    ]);
    if (guidedOffers.has(wave)) {
      guided = true;
      const names = guidedOffers.get(wave);
      this._runOrQueue(() => this._presentOffer(names, this.unlocks));
    }

    if (!guided && wave >= 6 && wave % 2 === 0){
      if (this.offerCooldown > 0) this.offerCooldown -= 1;
      else this._runOrQueue(() => this._presentOffer());
    }

    if (this.mutations?.shouldOfferAtWave?.(wave)) this.requestMutationOffer();
  }

  onBossDefeated(wave) {
    if (!this._isProgressionRun()) return false;
    const bossWave = Math.floor(Number(wave) || 0);
    if (bossWave <= 0 || this.defeatedBossWaves.has(bossWave)) return false;
    this.defeatedBossWaves.add(bossWave);
    this.bossKills += 1;
    if (bossWave === 10) this._revealClassifiedTrial('dmr');
    if (bossWave === 15) {
      const trialGranted = this._revealClassifiedTrial('grenade');
      this.mutations?.claimClassifiedDossier?.();
      if (trialGranted) this.ws?.ensureGrenadeSlot?.();
    }
    if (bossWave === 5) return this.requestMutationOffer();
    return false;
  }

  _revealClassifiedTrial(weaponId) {
    if (!this.mutations) return false;
    const revealed = this.mutations.revealClassifiedWeapon?.(weaponId) === true;
    if (!revealed) return false;
    const trialGranted = this.mutations.grantWeaponTrial?.(weaponId) === true;
    this.onClassifiedReveal?.({ weaponId, trialGranted, definition: this.mutations.getClassifiedWeaponDefinition?.(weaponId) || null });
    return trialGranted;
  }

  _effectiveUnlocks(overrides = null) {
    const effective = { ...this.unlocks, ...(overrides || {}) };
    if (this.mutations?.hasWeaponAccess) {
      effective.rifle = this.mutations.hasWeaponAccess('rifle');
      effective.dmr = this.mutations.hasWeaponAccess('dmr');
      effective.grenade = this.mutations.hasWeaponAccess('grenade');
    }
    return effective;
  }

  requestMutationOffer() {
    if (!this.mutations) return false;
    return this._runOrQueue(() => this._presentMutationOffer());
  }

  _runOrQueue(action) {
    if (this.offerOpen) {
      this.offerQueue.push(action);
      return true;
    }
    const shown = action();
    if (shown === false && !this.offerOpen) this._showNextQueued();
    return shown;
  }

  _showNextQueued() {
    if (this.offerOpen) return;
    const next = this.offerQueue.shift();
    if (!next) return;
    const shown = next();
    if (shown === false && !this.offerOpen) this._showNextQueued();
  }

  _bindOfferUI(){
    this.offerEl = this.doc.getElementById('offer');
    this.titleEl = this.doc.getElementById('offerTitle');
    this.copyEl = this.doc.getElementById('offerCopy');
    this.choicesEl = this.doc.getElementById('offerChoices');
    this.declineBtn = this.doc.getElementById('offerDecline');
    this.acceptBtn = this.doc.getElementById('offerAccept');
    if (this.declineBtn) this.declineBtn.onclick = () => this._selectDecline();
    if (this.acceptBtn) this.acceptBtn.onclick = () => {
      if (this.selectedPick) this._accept(this.selectedPick);
      else if (this.declineSelected && this.offerMode !== 'mutation') this._decline();
    };
  }

  _currentPrimaryName(){ return this.ws?.inventory?.[0]?.name || null; }

  _currentSidearmName(){
    const inv = this.ws?.inventory || [];
    return inv.length >= 2 ? inv[1]?.name || null : null;
  }

  _filterOutCurrent(pool){
    const current = this._currentPrimaryName();
    return pool.filter(p => p && p.name !== current);
  }

  _expandIfTooShort(picks, fallbackPool){
    if (picks.length >= 2) return picks;
    const names = new Set(picks.map(p => p.name));
    for (const candidate of fallbackPool){
      if (!names.has(candidate.name)) picks.push(candidate);
      if (picks.length === 2) break;
    }
    return picks;
  }

  _prepareOffer(mode, titleKey, copyKey) {
    this.offerMode = mode;
    this.offerEl?.classList?.toggle?.('mutation-offer', mode === 'mutation');
    if (this.titleEl) this.titleEl.textContent = this.translate(titleKey);
    if (this.copyEl) this.copyEl.textContent = this.translate(copyKey);
    if (this.choicesEl) this.choicesEl.innerHTML = '';
    if (this.acceptBtn) this.acceptBtn.disabled = true;
    if (this.declineBtn) this.declineBtn.style.display = mode === 'mutation' ? 'none' : '';
    this.selectedPick = null;
    this.declineSelected = false;
    this.declineBtn?.classList?.remove?.('selected');
  }

  _appendWeaponChoice(p, index, { sidearm = false } = {}) {
    const card = this.doc.createElement('div');
    card.className = 'choice';
    if (card.dataset) card.dataset.slot = String(index + 1);
    const img = this.doc.createElement('img');
    img.className = 'choice-icon';
    img.alt = '';
    img.src = this._iconFor(p.name);
    const label = this.doc.createElement('div');
    label.className = 'choice-name';
    label.textContent = p.name;
    card.appendChild(img);
    card.appendChild(label);
    const pick = sidearm ? { ...p, sidearm: true } : p;
    card.onclick = () => this._selectPick(pick, card);
    this.choicesEl.appendChild(card);
  }

  _showOffer() {
    this.offerEl.style.display = '';
    this.offerOpen = true;
    this.onPause(true);
    try { this.controls?.unlock?.(); } catch (e) { logError(e); }
    try {
      const center = this.doc.getElementById('center');
      if (center) center.style.display = 'none';
    } catch (e) { logError(e); }
    this._bindOfferKeys();
    return true;
  }

  _presentOffer(restrictNames, unlockOverrides){
    if (!this.offerEl || !this.choicesEl) return false;
    const unlocked = this.ws.getUnlockedPrimaries(this._effectiveUnlocks(unlockOverrides));
    const basePool = this._filterOutCurrent(unlocked);
    let pool = basePool;
    if (Array.isArray(restrictNames) && restrictNames.length) {
      const wanted = new Set(restrictNames);
      pool = basePool.filter(p => wanted.has(p.name));
    }
    if (!pool.length) pool = basePool.slice();
    if (!pool.length) return false;
    let picks = pickTwoDistinct(pool, this.rng);
    picks = this._expandIfTooShort(picks, basePool);
    this._prepareOffer('weapon', 'offer.title', 'offer.select');
    picks.forEach((p, index) => this._appendWeaponChoice(p, index));
    this.ws.switchSlot(1);
    this.ws.updateHUD?.();
    return this._showOffer();
  }

  _presentSidearmOffer(){
    if (!this.offerEl || !this.choicesEl) return false;
    const raw = this.ws.getSidearms ? this.ws.getSidearms() : [];
    const sidearms = raw.filter(p => p && p.name !== this._currentSidearmName());
    if (!sidearms.length) return false;
    this._prepareOffer('sidearm', 'offer.sidearmTitle', 'offer.sidearmSelect');
    sidearms.forEach((p, index) => this._appendWeaponChoice(p, index, { sidearm: true }));
    return this._showOffer();
  }

  _presentMutationOffer() {
    if (!this.offerEl || !this.choicesEl) return false;
    const picks = this.mutations?.getOffer?.(3) || [];
    if (!picks.length) return false;
    this._prepareOffer('mutation', 'mutation.offer.title', 'mutation.offer.select');
    picks.forEach((def, index) => {
      const rank = this.mutations.getRank(def.id);
      const rankCap = this.mutations.getMutationRankCap?.(def.id) ?? def.maxRank;
      const values = describeMutationRank(def.id, rank);
      const card = this.doc.createElement('div');
      card.className = 'choice mutation-choice';
      if (card.dataset) card.dataset.slot = String(index + 1);
      const glyph = this.doc.createElement('div');
      glyph.className = `mutation-glyph mutation-${def.id}`;
      glyph.textContent = def.id === 'irony_armor' ? 'A' : def.id === 'extended_bit' ? 'S' : def.id === 'main_character_energy' ? '+' : def.id === 'callback' ? '8×' : '5×';
      const name = this.doc.createElement('div');
      name.className = 'choice-name';
      name.textContent = this.translate(def.nameKey);
      const rankEl = this.doc.createElement('div');
      rankEl.className = 'mutation-rank';
      rankEl.textContent = `${this.translate('mutation.rank')} ${rank + 1}/${rankCap}`;
      const description = this.doc.createElement('p');
      description.className = 'mutation-description';
      description.textContent = this.translate(def.descriptionKey);
      const delta = this.doc.createElement('div');
      delta.className = 'mutation-delta';
      delta.textContent = `${values.current} → ${values.next} ${this.translate(values.unit)}`.trim();
      card.append(glyph, name, rankEl, description, delta);
      card.onclick = () => this._selectPick({ mutationId: def.id }, card);
      this.choicesEl.appendChild(card);
    });
    return this._showOffer();
  }

  _bindOfferKeys() {
    if (this._offerHandlersBound || typeof window === 'undefined') return;
    this._offerKeyHandler = event => {
      if (!this.offerOpen) return;
      if (event.code === 'Digit1') this.choicesEl.children[0]?.click?.();
      else if (event.code === 'Digit2') this.choicesEl.children[1]?.click?.();
      else if (event.code === 'Digit3') this.choicesEl.children[2]?.click?.();
      else if ((event.code === 'Escape' || event.code === 'KeyF') && this.offerMode !== 'mutation') this.declineBtn?.click?.();
      else if ((event.code === 'Enter' || event.code === 'Space') && !this.acceptBtn?.disabled) this.acceptBtn?.click?.();
    };
    window.addEventListener('keydown', this._offerKeyHandler);
    this._offerHandlersBound = true;
  }

  _selectPick(pick, element){
    this.selectedPick = pick;
    this.declineSelected = false;
    Array.from(this.choicesEl?.children || []).forEach(child => child.classList?.remove?.('selected'));
    this.declineBtn?.classList?.remove?.('selected');
    element.classList?.add?.('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = false;
  }

  _selectDecline(){
    if (this.offerMode === 'mutation') return;
    this.selectedPick = null;
    this.declineSelected = true;
    Array.from(this.choicesEl?.children || []).forEach(child => child.classList?.remove?.('selected'));
    this.declineBtn?.classList?.add?.('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = false;
  }

  _decline(){
    const current = this.ws.current;
    if (current){
      const reserveDefault = current.cfg?.reserve || 0;
      const reserveCurrent = current.getReserve?.() || 0;
      if (reserveCurrent < reserveDefault * 0.5) current.addReserve(reserveDefault - reserveCurrent);
      else current.addReserve(Math.floor(reserveDefault * 0.5));
      this.ws.updateHUD?.();
    }
    this._closeOffer(false);
  }

  _accept(pick){
    if (pick?.mutationId) {
      const result = this.mutations.applyRank(pick.mutationId, { session: this.session, player: this.player });
      if (result.ok) {
        this.ws.updateHUD?.();
        this.onMutationApplied?.(result);
      }
      this._closeOffer(result.ok);
      return;
    }
    if (pick?.sidearm){
      const inventory = this.ws.inventory;
      const instance = pick.make();
      if (inventory.length === 1) inventory.push(instance);
      else inventory[1] = instance;
      this.ws.currentIndex = Math.min(this.ws.currentIndex, this.ws.inventory.length - 1);
      if (typeof this.ws.notifyInventoryChange === 'function') this.ws.notifyInventoryChange();
      else this.ws.updateHUD?.();
      this._closeOffer(true);
      return;
    }
    this.ws.swapPrimary(pick.make);
    this.offerCooldown = 1;
    this._closeOffer(true);
  }

  _closeOffer(){
    if (this.offerEl) this.offerEl.style.display = 'none';
    this.offerOpen = false;
    this.selectedPick = null;
    this.declineSelected = false;
    this.declineBtn?.classList?.remove?.('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = true;
    Array.from(this.choicesEl?.children || []).forEach(child => child.classList?.remove?.('selected'));
    if (this.offerQueue.length) {
      this._showNextQueued();
      return;
    }
    this.onPause(false);
    try { this.controls?.lock?.(); } catch (e) { logError(e); }
  }

  _iconFor(name){
    const map = {
      Rifle:'assets/icons/weapon-rifle.svg',
      SMG:'assets/icons/weapon-smg.svg',
      Shotgun:'assets/icons/weapon-shotgun.svg',
      DMR:'assets/icons/weapon-dmr.svg',
      Minigun:'assets/icons/weapon-minigun.svg',
      Pistol:'assets/icons/weapon-pistol.svg',
      BeamSaber:'assets/icons/weapon-beamsaber.svg',
      Grenade:'assets/icons/weapon-pistol.svg',
      Dynamite:'assets/icons/weapon-dynamite.svg'
    };
    return map[name] || map.Rifle;
  }
}
