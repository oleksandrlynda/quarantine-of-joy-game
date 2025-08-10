// Lightweight progression + armory offers

export class Progression {
  constructor({ weaponSystem, documentRef, onPause, controls }){
    this.ws = weaponSystem;
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;
    this.UNLOCKS_KEY = 'bs3d_unlocks';
    this.unlocks = this._loadUnlocks();
    this.offerCooldown = 0; // prevents back-to-back only when an offer is accepted
    this._bindOfferUI();
    this.offerOpen = false;
    this._offerHandlersBound = false;
  }

  _loadUnlocks(){
    try {
      const s = localStorage.getItem(this.UNLOCKS_KEY);
      return s ? JSON.parse(s) : { bestWave:0, smg:false, shotgun:false, dmr:false };
    } catch {
      return { bestWave:0, smg:false, shotgun:false, dmr:false };
    }
  }
  _saveUnlocks(){ try { localStorage.setItem(this.UNLOCKS_KEY, JSON.stringify(this.unlocks)); } catch {} }

  onWave(wave){
    // Unlock by wave milestones
    if (wave > (this.unlocks.bestWave||0)){
      this.unlocks.bestWave = wave;
      if (wave >= 3) this.unlocks.smg = true;
      if (wave >= 4) this.unlocks.shotgun = true;
      if (wave >= 6) this.unlocks.dmr = true;
      this._saveUnlocks();
    }
    // Schedule armory offer on even waves starting at 2, unless cooldown from last accept
    if (wave >= 2 && (wave % 2) === 0){
      if (this.offerCooldown > 0) { this.offerCooldown -= 1; }
      else { this._presentOffer(); }
    }
  }

  _bindOfferUI(){
    this.offerEl = this.doc.getElementById('offer');
    this.choicesEl = this.doc.getElementById('offerChoices');
    this.declineBtn = this.doc.getElementById('offerDecline');
    if (this.declineBtn) this.declineBtn.onclick = () => this._decline();
  }

  _presentOffer(){
    if (!this.offerEl || !this.choicesEl) return;
    const unlocked = this.ws.getUnlockedPrimaries(this.unlocks);
    // Remove current primary from pool
    const pool = unlocked.filter(x => x.name !== (this.ws.current?.name || 'Rifle'));
    if (pool.length === 0) return;
    // pick 2 distinct (or 1 if only one)
    const picks = [];
    const rnd = (n)=> Math.floor(Math.random()*n);
    picks.push(pool[rnd(pool.length)]);
    if (pool.length > 1){
      let idx = rnd(pool.length);
      while (pool[idx].name === picks[0].name) idx = rnd(pool.length);
      picks.push(pool[idx]);
    }
    // build UI
    this.choicesEl.innerHTML = '';
    for (const p of picks){
      const d = this.doc.createElement('div'); d.className = 'choice';
      const img = this.doc.createElement('img'); img.alt = p.name; img.src = this._iconFor(p.name);
      const label = this.doc.createElement('div'); label.textContent = p.name;
      d.appendChild(img); d.appendChild(label);
      d.onclick = () => this._accept(p);
      this.choicesEl.appendChild(d);
    }
    this.offerEl.style.display = '';
    this.offerOpen = true;
    this.onPause(true);
    // Release pointer lock so the player can use the mouse
    try { this.controls?.unlock?.(); } catch {}
    // prevent accidental game reset UI while offer is up
    try { if (this.doc && this.doc.getElementById('center')) this.doc.getElementById('center').style.display = 'none'; } catch{}
    // key bindings 1/2 to choose, Esc to decline
    if (!this._offerHandlersBound){
      this._offerKeyHandler = (e)=>{
        if (!this.offerOpen) return;
        if (e.code === 'Digit1') { const n = this.choicesEl.children[0]; if (n) n.click(); }
        else if (e.code === 'Digit2') { const n = this.choicesEl.children[1]; if (n) n.click(); }
        else if (e.code === 'Escape' || e.code === 'KeyF') { this._decline(); }
      };
      window.addEventListener('keydown', this._offerKeyHandler);
      this._offerHandlersBound = true;
    }
  }

  _decline(){
    // +20% reserve to current primary
    const cur = this.ws.current; if (cur) cur.addReserve(Math.floor((cur.getReserve() || 0) * 0.2));
    this._closeOffer(false);
  }

  _accept(pick){
    this.ws.swapPrimary(pick.make);
    this.offerCooldown = 1; // skip next even-wave offer
    this._closeOffer(true);
  }

  _closeOffer(accepted){
    if (this.offerEl) this.offerEl.style.display = 'none';
    this.offerOpen = false;
    this.onPause(false);
    // Try to re-lock pointer immediately after interaction
    // This is triggered from a click/keypress, so it's a valid user gesture
    try { this.controls?.lock?.(); } catch {}
  }

  _iconFor(name){
    const map = { Rifle:'assets/icons/weapon-rifle.svg', SMG:'assets/icons/weapon-smg.svg', Shotgun:'assets/icons/weapon-shotgun.svg', DMR:'assets/icons/weapon-dmr.svg', Pistol:'assets/icons/weapon-pistol.svg' };
    return map[name] || map.Rifle;
  }
}


