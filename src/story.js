// Minimal narrative system: modal story beats + queued messages

export class StoryManager {
  constructor({ documentRef, onPause, controls, toastFn, tickerFn, beatsUrl = null, minGapMs = 2200 }){
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;
    this.toast = typeof toastFn === 'function' ? toastFn : null;
    this.ticker = typeof tickerFn === 'function' ? tickerFn : null;
    this.queue = [];
    this.active = false;
    this.enabled = false;
    this._bindUI();
    this._beatsFired = new Set();
    this._beats = { ...NARRATIVE_BEATS };
    this._beatsUrl = beatsUrl;
    this._lastShownAt = 0;
    this._minGapMs = minGapMs;
    this.SEEN_KEY = 'bs3d_story_seen';
    this._seen = this._loadSeen();
    this._currentBeat = null;
  }

  _bindUI(){
    this.container = this.doc.getElementById('story');
    this.textEl = this.doc.getElementById('storyText');
    this.nextBtn = this.doc.getElementById('storyNext');
    if (this.nextBtn) this.nextBtn.onclick = ()=> this._next();
  }

  reset(){
    this.queue.length = 0;
    this.active = false;
    this.enabled = false;
    if (this.container) this.container.style.display = 'none';
  }

  startRun(){
    this.enabled = true;
    // Optionally load external beats for easy authoring
    if (this._beatsUrl) {
      try {
        fetch(this._beatsUrl).then(r=> r.ok ? r.json() : null).then(data=>{
          if (data && data.beats) {
            // Merge and override existing beats
            this._beats = { ...this._beats, ...data.beats };
          }
          this._enqueueBeat('intro');
          this._enqueueBeat('intro2');
          this._enqueueBeat('controlsTip');
          this._maybeShow();
        }).catch(()=>{ this._enqueueBeat('intro'); this._maybeShow(); });
      } catch(_) { this._enqueueBeat('intro'); this._maybeShow(); }
    } else {
      this._enqueueBeat('intro');
      this._enqueueBeat('intro2');
      this._enqueueBeat('controlsTip');
      this._maybeShow();
    }
  }

  onWave(wave){
    if (!this.enabled) return;
    // Gate a few milestone beats
    if (wave === 1) this._enqueueBeat('firstWave');
    if (wave === 2) this._enqueueBeat('act1_brief');
    if (wave === 5) this._enqueueBeat('bossIncoming');
    if (wave === 10) this._enqueueBeat('midRun');
    if (wave === 20) this._enqueueBeat('lateRun');
    // Occasionally drop a fun ticker snippet mid-run
    if (this.ticker && wave > 1 && Math.random() < 0.3) {
      const tickers = Object.keys(this._beats).filter(id => this._beats[id].mode === 'ticker');
      const remaining = tickers.filter(id => !this._beatsFired.has(id));
      if (remaining.length > 0) {
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        this._enqueueBeat(pick);
      }
    }
    this._maybeShow();
  }

  onBossStart(wave){
    if (!this.enabled) return;
    this._enqueueBeat(`boss_${wave}_start`);
    this._maybeShow();
  }

  onBossDeath(wave){
    if (!this.enabled) return;
    this._enqueueBeat(`boss_${wave}_down`);
    if (wave === 5) this._enqueueBeat('boss_5_report');
    this._maybeShow();
  }

  onLowHp(){
    if (!this.enabled) return;
    this._enqueueBeat('lowHp');
    this._maybeShow();
  }

  onFirstMedPickup(){
    if (!this.enabled) return;
    this._enqueueBeat('firstMed');
    this._maybeShow();
  }

  // --- Internal ---
  _enqueueBeat(id){
    if (this._beatsFired.has(id)) return;
    const beat = this._beats[id];
    if (!beat) return;
    if (beat.persistOnce && this._seen[id]) return;
    if (beat.mode === 'ticker' && !this.ticker && !(typeof window !== 'undefined' && window._HUD && typeof window._HUD.ticker === 'function')) return;
    this._beatsFired.add(id);
    this.queue.push(beat);
  }

  _maybeShow(){
    if (this.active) return;
    if (this.queue.length === 0) return;
    // If another modal (armory offer) is open, delay story until it's closed
    if (this._isOfferOpen()) { setTimeout(()=> this._maybeShow(), 150); return; }
    const now = performance.now ? performance.now() : Date.now();
    const waitMs = Math.max(0, this._minGapMs - (now - this._lastShownAt));
    const showNext = () => {
      const next = this.queue.shift();
      if (!next || typeof next.text !== 'string') { setTimeout(()=> this._maybeShow(), 0); return; }
      this._show(next);
    };
    if (waitMs > 16) { setTimeout(showNext, waitMs); } else { showNext(); }
  }

  _show(beat){
    if (!beat || typeof beat.text !== 'string') { return; }
    // Toast-mode beats are non-blocking
    if (beat && beat.mode === 'toast'){
      const toast = this.toast || (typeof window !== 'undefined' && window._HUD && typeof window._HUD.toast === 'function' ? window._HUD.toast : null);
      if (toast) toast(beat.text);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      this._lastShownAt = performance.now ? performance.now() : Date.now();
      // chain next if any
      if (this.queue.length > 0) setTimeout(()=> this._maybeShow(), 50);
      return;
    }
    // Ticker-mode beats show in bottom news feed, also non-blocking
    if (beat && beat.mode === 'ticker'){
      const ticker = this.ticker || (typeof window !== 'undefined' && window._HUD && typeof window._HUD.ticker === 'function' ? window._HUD.ticker : null);
      if (ticker) ticker(beat.text);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      this._lastShownAt = performance.now ? performance.now() : Date.now();
      if (this.queue.length > 0) setTimeout(()=> this._maybeShow(), 50);
      return;
    }
    if (!this.container || !this.textEl) return;
    this.active = true;
    this._currentBeat = beat;
    this.textEl.textContent = beat.text;
    this.container.style.display = '';
    this.onPause(true);
    // Release pointer lock for interaction
    try { this.controls?.unlock?.(); } catch {}
  }

  _next(){
    if (!this.container) return;
    this.container.style.display = 'none';
    this.active = false;
    // Mark seen for persist-once beats when modal is acknowledged
    try {
      if (this._currentBeat && this._currentBeat.id) {
        this._markSeen(this._currentBeat.id, this._currentBeat.persistOnce);
      }
    } catch(_) {}
    this._currentBeat = null;
    // If an armory offer is up, keep game paused and do NOT relock pointer
    if (!this._isOfferOpen()) {
      this.onPause(false);
      // Attempt to re-lock pointer immediately after interaction
      // This is triggered from a click/keypress, so it's a valid user gesture
      try { this.controls?.lock?.(); } catch {}
    }
    this._lastShownAt = performance.now ? performance.now() : Date.now();
    // Show next queued beat if any
    if (this.queue.length > 0) {
      // Slight delay to avoid double-click skipping
      setTimeout(()=> this._maybeShow(), 50);
    }
  }

  _loadSeen(){
    try {
      const s = localStorage.getItem(this.SEEN_KEY);
      return s ? JSON.parse(s) : {};
    } catch(_) { return {}; }
  }
  _saveSeen(){
    try { localStorage.setItem(this.SEEN_KEY, JSON.stringify(this._seen)); } catch(_) {}
  }
  _markSeen(id, persist){
    if (!id || !persist) return;
    this._seen[id] = true; this._saveSeen();
  }
  _isOfferOpen(){
    try {
      const el = (this.doc && this.doc.getElementById) ? this.doc.getElementById('offer') : null;
      if (!el) return false;
      // Offer shows by setting style.display = '' (default visible). Hidden when 'none'.
      return el.style.display !== 'none';
    } catch(_) { return false; }
  }
}

// Simple data-driven beats. Expand freely.
const NARRATIVE_BEATS = {
  intro: { id:'intro', text: 'Operator, welcome to Block Strike. Your objective: survive the test arena and gather data.' },
  firstWave: { id:'firstWave', text: 'Wave one: expect light drones. Test your aim. Headshots recommended.', mode: 'toast', persistOnce: true },
  bossIncoming: { id:'bossIncoming', text: 'Boss signatures detected. Brace and conserve ammo between phases.' },
  midRun: { id:'midRun', text: 'Telemetry clean. Enemy patterns increasing in complexity. Keep moving.', mode: 'toast', persistOnce: true },
  lateRun: { id:'lateRun', text: 'You are deep in. Adversaries deploying elites. Prioritize targets and use cover.', mode: 'toast', persistOnce: true },
  lowHp: { id:'lowHp', text: 'Critical health! Break line of sight and use cover or medkits.', mode: 'toast', persistOnce: true },
  firstMed: { id:'firstMed', text: 'Medkit collected. Stay mobile and top up when safe.', mode: 'toast', persistOnce: true },
  ticker_gossip1: { id:'ticker_gossip1', text: 'Newsflash: lab coffee machine may be sentient.', mode: 'ticker' },
  ticker_gossip2: { id:'ticker_gossip2', text: 'Rumor: maintenance drones plan a union vote.', mode: 'ticker' },
  ticker_gossip3: { id:'ticker_gossip3', text: "Fun fact: drones still can't appreciate jazz.", mode: 'ticker' },
  ticker_gossip4: { id:'ticker_gossip4', text: 'Alert: vending machines now accept emotional support coins.', mode: 'ticker' },
  ticker_gossip5: { id:'ticker_gossip5', text: 'Insider: test drones spotted debating optimal pathfinding routes.', mode: 'ticker' },
  ticker_gossip6: { id:'ticker_gossip6', text: 'Reminder: update reflex implants before prime-time waves.', mode: 'ticker' },
  ticker_gossip7: { id:'ticker_gossip7', text: 'Breaking: scientists teach drones to high-five — results mixed.', mode: 'ticker' },
  ticker_gossip8: { id:'ticker_gossip8', text: 'Bulletin: cafeteria introduces mystery-flavor nutrient bars.', mode: 'ticker' },
  ticker_gossip9: { id:'ticker_gossip9', text: 'Whisper: someone replaced ammo crates with party poppers. Investigating...', mode: 'ticker' },
  ticker_gossip10: { id:'ticker_gossip10', text: 'Report: arena floor requests a day off to recharge its tiles.', mode: 'ticker' },
  ticker_gossip11: { id:'ticker_gossip11', text: 'Leak: AI curator secretly writes poetry during off cycles.', mode: 'ticker' },
  ticker_gossip12: { id:'ticker_gossip12', text: 'FYI: vents rumored to host micro-society of dust bunnies.', mode: 'ticker' },
  ticker_gossip13: { id:'ticker_gossip13', text: 'Memo: please stop naming your turrets; recycling gets awkward.', mode: 'ticker' },
  ticker_gossip14: { id:'ticker_gossip14', text: 'Rumor: hidden achievement for complimenting a drone before disabling it.', mode: 'ticker' },
  ticker_gossip15: { id:'ticker_gossip15', text: 'Alert: rogue trainee spotted speed-running safety briefings.', mode: 'ticker' },
  ticker_gossip16: { id:'ticker_gossip16', text: 'Fun fact: reloading to the beat increases accuracy by 0%. Still fun.', mode: 'ticker' },
  // Boss-specific hooks; generic fallback copy is fine
  'boss_5_start': { id:'boss_5_start', text: 'Broodmaker spawns incoming. Eliminate pods to thin the swarm.' },
  'boss_5_down': { id:'boss_5_down', text: 'MOD: Broodmaker down. Swarm quieting. Scoop supplies and reset your lane.' },
  boss_5_report: { id:'boss_5_report', text: 'MOD: Uplink clean. The block’s laughing again. BoB will counter—eyes up.', mode: 'toast', persistOnce: true },
  'boss_10_start': { id:'boss_10_start', text: 'MOD: Commissioner Sanitizer’s spire team online. Area denial and beams—strafe clean.' },
  'boss_10_down': { id:'boss_10_down', text: 'MOD: Sanitizer silenced. Broadcast reached the block. Armory channels are opening.' },
  'boss_15_start': { id:'boss_15_start', text: 'MOD: Influencer Militia Captain with Ad Zeppelin support. Cancel sponsorship pods to break the shield.' },
  'boss_15_down': { id:'boss_15_down', text: 'MOD: Captain dropped. Formation broken; sponsors ghosted.' },
  'boss_20_start': { id:'boss_20_start', text: 'GLITCHCAT: Algorithm Shard Avatar manifesting. Watch emissive tells; play off‑beat.' },
  'boss_20_down': { id:'boss_20_down', text: 'GLITCHCAT: Shard reconciled. Signal variance restored.' },
  'boss_25_start': { id:'boss_25_start', text: 'Broodmaker returns, reinforced. Spread the damage, clear eggs fast.' },
  'boss_25_down': { id:'boss_25_down', text: 'Heavy Broodmaker down. You are becoming the problem.' }
  ,
  'boss_30_start': { id:'boss_30_start', text: 'Hydraclone detected. Eliminate clones quickly to prevent overwhelming numbers.' },
  'boss_30_down': { id:'boss_30_down', text: 'Hydraclone neutralized. The field quiets—for now.' },
  'boss_35_start': { id:'boss_35_start', text: 'Strike Adjudicator enters. Expect precision strikes and punish windows—stay moving.' },
  'boss_35_down': { id:'boss_35_down', text: 'Adjudicator down. You have exceeded projections.' }
};


