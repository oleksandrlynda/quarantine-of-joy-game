// Progression: tier-aware early game, no duplicate offers vs. current, safer restricted picks

// Exported helper for testing weapon offer selection
import { logError } from './util/log.js';
export function pickTwoDistinct(pool){
  if (pool.length <= 1) return pool.slice(0, 1);
  // pick two uniformly without replacement
  const i = Math.floor(Math.random()*pool.length);
  let j = Math.floor(Math.random()*pool.length);
  while (j === i) j = Math.floor(Math.random()*pool.length);
  return [pool[i], pool[j]];
}

export class Progression {
  constructor({ weaponSystem, documentRef, onPause, controls }){
    this.ws = weaponSystem;
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;

    this.UNLOCKS_KEY = 'bs3d_unlocks';
    this.unlocks = this._loadUnlocks();

    this.offerCooldown = 0;         // prevents back-to-back only when an offer is accepted
    this.offerOpen = false;
    this._offerHandlersBound = false;
    this.bossKills = 0;             // track number of defeated bosses this run
    this.sidearmOfferShown = false; // show once per run
    this.selectedPick = null;
    this.declineSelected = false;

    this._bindOfferUI();
  }

  // ---------- Persistence ----------
  _loadUnlocks(){
    const base = { bestWave:0, smg:false, shotgun:false, rifle:false, dmr:false, beamsaber:false, minigun:false };
    try {
      const s = localStorage.getItem(this.UNLOCKS_KEY);
      return s ? { ...base, ...JSON.parse(s) } : base;
    } catch {
      return base;
    }
  }
  _saveUnlocks(){ try { localStorage.setItem(this.UNLOCKS_KEY, JSON.stringify(this.unlocks)); } catch (e) { logError(e); } }

  // ---------- Wave hooks ----------
  onWave(wave){
    // Persist unlocks by best wave reached (kept compatible with your main.js boss hooks)
    if (wave > (this.unlocks.bestWave||0)){
      this.unlocks.bestWave = wave;
      if (wave >= 2) this.unlocks.smg = true;        // earlier SMG to improve onboarding
      if (wave >= 3) this.unlocks.shotgun = true;
      if (wave >= 4) this.unlocks.minigun = true;
      if (wave >= 6) this.unlocks.rifle = true;
      if (wave >= 11) this.unlocks.dmr = true;
      if (wave >= 3) this.unlocks.beamsaber = true;
      this._saveUnlocks();
    }

    // Early guided milestones (tier-aware)
    // Use unlockOverrides to allow showing items before their persistent unlocks fire.
    // const early = { shotgun:true, smg:true, rifle:true, dmr:true, beamsaber:true, minigun:true };

    if (wave === 1) { return; }

    if (wave === 2) {
      // Guarantee SMG as first primary (safer for new players than Shotgun)
      const pool = this.ws.getUnlockedPrimaries(this.unlocks);
      const smg = pool.find(x => x.name === 'SMG');
      if (smg) this.ws.swapPrimary(smg.make);
      return;
    }

    if (wave === 3) { this._presentOffer(['Shotgun','SMG'], this.unlocks); return; }
    if (wave === 4) { this._presentOffer(['BeamSaber'], this.unlocks); return; }          // single pick allowed; we’ll fill if filtered
    if (wave === 6) { this._presentOffer(['Rifle','SMG'], this.unlocks); return; }
    if (wave === 8) { this._presentOffer(['Minigun'], this.unlocks); return; }
    if (wave === 11){ this._presentOffer(['Rifle','DMR'], this.unlocks); return; }
    if (wave === 12){ this._presentOffer(['DMR','BeamSaber'], this.unlocks); return; }

    // Normal cadence: even waves ≥ 6 (respect cooldown)
    if (wave >= 6 && (wave % 2) === 0){
      if (this.offerCooldown > 0) this.offerCooldown -= 1;
      else this._presentOffer();
    }

    // Sidearm offer once per run at wave ≥ 15
    if (!this.sidearmOfferShown && wave >= 15){
      this._presentSidearmOffer();
      this.sidearmOfferShown = true;
    }
  }

  // ---------- UI plumbing ----------
  _bindOfferUI(){
    this.offerEl = this.doc.getElementById('offer');
    this.choicesEl = this.doc.getElementById('offerChoices');
    this.declineBtn = this.doc.getElementById('offerDecline');
    this.acceptBtn = this.doc.getElementById('offerAccept');
    if (this.declineBtn) this.declineBtn.onclick = () => this._selectDecline();
    if (this.acceptBtn) this.acceptBtn.onclick = () => {
      if (this.selectedPick) this._accept(this.selectedPick);
      else if (this.declineSelected) this._decline();
    };
  }

  // ---------- Offer helpers ----------
  _currentPrimaryName(){
    return (this.ws?.current?.name) || null;
  }

  _currentSidearmName(){
    const inv = this.ws?.inventory || [];
    // assuming slot 0 = primary, slot 1 = sidearm if present
    if (inv.length >= 2 && inv[1] && inv[1].name) return inv[1].name;
    return null;
  }

  _filterOutCurrent(pool){
    const cur = this._currentPrimaryName();
    return pool.filter(p => p && p.name !== cur);
  }

  _expandIfTooShort(picks, fallbackPool){
    // If after restrictions we have <2, top up from fallback (excluding duplicates)
    if (picks.length >= 2) return picks;
    const names = new Set(picks.map(p => p.name));
    for (const c of fallbackPool){
      if (!names.has(c.name)){
        picks.push(c);
        if (picks.length === 2) break;
      }
    }
    return picks;
  }

  _selectPick(p, el){
    this.selectedPick = p;
    this.declineSelected = false;
    Array.from(this.choicesEl.children).forEach(c => c.classList.remove('selected'));
    this.declineBtn?.classList.remove('selected');
    el.classList.add('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = false;
  }

  _selectDecline(){
    this.selectedPick = null;
    this.declineSelected = true;
    Array.from(this.choicesEl.children).forEach(c => c.classList.remove('selected'));
    this.declineBtn?.classList.add('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = false;
  }

  // ---------- Primary offers ----------
  _presentOffer(restrictNames, unlockOverrides){
    if (!this.offerEl || !this.choicesEl) return;

    // Base unlocked pool (optionally overridden for early guidance)
    const unlocked = this.ws.getUnlockedPrimaries(
      unlockOverrides ? { ...this.unlocks, ...unlockOverrides } : this.unlocks
    );

    // Always remove CURRENT weapon from consideration
    let basePool = this._filterOutCurrent(unlocked);

    // Apply restrictions (and still exclude current)
    let pool = basePool;
    if (Array.isArray(restrictNames) && restrictNames.length > 0){
      const wanted = new Set(restrictNames);
      pool = basePool.filter(p => wanted.has(p.name));
    }

    // If pool is empty (e.g., restriction excluded the current and left nothing), fall back to basePool
    if (pool.length === 0) pool = basePool.slice();

    // If still empty (e.g., only weapon unlocked is the one we hold), abort
    if (pool.length === 0) return;

    // Choose up to two distinct picks, and if restricted left us short, fill from basePool
    let picks = pickTwoDistinct(pool);
    picks = this._expandIfTooShort(picks, basePool);

    // Build UI
    this.choicesEl.innerHTML = '';
    if (this.acceptBtn) this.acceptBtn.disabled = true;
    this.selectedPick = null;
    this.declineSelected = false;
    this.declineBtn?.classList.remove('selected');
    for (const p of picks){
      const d = this.doc.createElement('div'); d.className = 'choice';
      const img = this.doc.createElement('img'); img.alt = p.name; img.src = this._iconFor(p.name);
      const label = this.doc.createElement('div'); label.textContent = p.name;
      d.appendChild(img); d.appendChild(label);
      d.onclick = () => this._selectPick(p, d);
      this.choicesEl.appendChild(d);
    }

    this.offerEl.style.display = '';
    this.offerOpen = true;
    this.onPause(true);

    // Release pointer lock so the player can use the mouse
    try { this.controls?.unlock?.(); } catch (e) { logError(e); }

    // Hide reset UI while offer is up
    try {
      const center = this.doc.getElementById('center');
      if (center) center.style.display = 'none';
    } catch (e) { logError(e); }

    // Key bindings: 1/2 select options, Enter/Space confirm, Esc/F select decline
    if (!this._offerHandlersBound){
      this._offerKeyHandler = (e)=>{
        if (!this.offerOpen) return;
        if (e.code === 'Digit1') { const n = this.choicesEl.children[0]; if (n) n.click(); }
        else if (e.code === 'Digit2') { const n = this.choicesEl.children[1]; if (n) n.click(); }
        else if (e.code === 'Escape' || e.code === 'KeyF') { this.declineBtn?.click(); }
        else if (e.code === 'Enter' || e.code === 'Space') { if (this.acceptBtn && !this.acceptBtn.disabled) this.acceptBtn.click(); }
      };
      window.addEventListener('keydown', this._offerKeyHandler);
      this._offerHandlersBound = true;
    }
  }

  // ---------- Sidearm offers ----------
  _presentSidearmOffer(){
    if (!this.offerEl || !this.choicesEl) return;

    // Prefer system-provided sidearms; otherwise default set
    const raw = this.ws.getSidearms ? this.ws.getSidearms() : [
      { name:'Pistol', make:()=>new (this.ws.sidearmClasses?.Pistol ?? function(){})() },
      { name:'Grenade', make:()=>new (this.ws.sidearmClasses?.Grenade ?? function(){})() },
      { name:'BeamSaber', make:()=>new (this.ws.sidearmClasses?.BeamSaber ?? function(){})() },
    ];

    // Filter out current sidearm so we never offer the same
    const curSidearm = this._currentSidearmName();
    const sidearms = raw.filter(p => p && p.name !== curSidearm);

    if (!sidearms.length) return;

    this.choicesEl.innerHTML = '';
    if (this.acceptBtn) this.acceptBtn.disabled = true;
    this.selectedPick = null;
    this.declineSelected = false;
    this.declineBtn?.classList.remove('selected');
    for (const p of sidearms){
      const d = this.doc.createElement('div'); d.className = 'choice';
      const img = this.doc.createElement('img'); img.alt = p.name;
      // Reuse pistol icon for grenade if you have no grenade icon, keep your previous behavior
      img.src = this._iconFor(p.name === 'Grenade' ? 'Pistol' : p.name);
      const label = this.doc.createElement('div'); label.textContent = p.name;
      d.appendChild(img); d.appendChild(label);
      d.onclick = () => this._selectPick({ ...p, sidearm:true }, d);
      this.choicesEl.appendChild(d);
    }

    this.offerEl.style.display = '';
    this.offerOpen = true;
    this.onPause(true);
    try { this.controls?.unlock?.(); } catch (e) { logError(e); }
  }

  // ---------- Accept / Decline ----------
  _decline(){
    // +20% reserve to current primary
    const cur = this.ws.current;
    if (cur) cur.addReserve(Math.floor((cur.getReserve() || 0) * 0.2));
    this._closeOffer(false);
  }

  _accept(pick){
    if (pick?.sidearm){
      const cur = this.ws.inventory;
      const inst = pick.make();
      if (cur.length === 1) cur.push(inst); else cur[1] = inst;
      this.ws.currentIndex = Math.min(this.ws.currentIndex, this.ws.inventory.length - 1);
      this.ws.updateHUD?.();
      this._closeOffer(true);
      return;
    }
    this.ws.swapPrimary(pick.make);
    this.offerCooldown = 1; // skip next even-wave offer
    this._closeOffer(true);
  }

  _closeOffer(accepted){
    if (this.offerEl) this.offerEl.style.display = 'none';
    this.offerOpen = false;
    this.onPause(false);
    this.selectedPick = null;
    this.declineSelected = false;
    this.declineBtn?.classList.remove('selected');
    if (this.acceptBtn) this.acceptBtn.disabled = true;
    Array.from(this.choicesEl?.children || []).forEach(c => c.classList.remove('selected'));
    // Try to re-lock pointer immediately after interaction (valid user gesture)
    try { this.controls?.lock?.(); } catch (e) { logError(e); }
  }

  // ---------- Icons ----------
  _iconFor(name){
    const map = {
      Rifle:'assets/icons/weapon-rifle.svg',
      SMG:'assets/icons/weapon-smg.svg',
      Shotgun:'assets/icons/weapon-shotgun.svg',
      DMR:'assets/icons/weapon-dmr.svg',
      Minigun:'assets/icons/weapon-minigun.svg',
      Pistol:'assets/icons/weapon-pistol.svg',
      BeamSaber:'assets/icons/weapon-beamsaber.svg'
    };
    return map[name] || map.Rifle;
  }
}
