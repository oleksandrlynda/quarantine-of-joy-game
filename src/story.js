// Minimal narrative system: modal story beats + queued messages

export class StoryManager {
  constructor({ documentRef, onPause, controls, toastFn, beatsUrl = null, minGapMs = 2200 }){
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;
    this.toast = typeof toastFn === 'function' ? toastFn : null;
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
  intro: { id:'intro', text: 'MOD: Welcome to Echo City. BoB’s Content Quarantine muted the feed. We smuggle laughter back—one district at a time.' },
  intro2: { id:'intro2', text: 'MOD: You’re the Courier for the Memetic Underground. Recover Archive fragments and light the map back up.' },
  controlsTip: { id:'controlsTip', text: 'WASD move • Shift sprint • Ctrl crouch • Space jump • R reload. Headshots hit harder.', persistOnce: true },
  firstWave: { id:'firstWave', text: 'MOD: Patrol drones first. Keep moving, pick your shots. Combo feeds color—and power.', persistOnce: true },
  act1_brief: { id:'act1_brief', text: 'MOD: Act I—Wake the Feed. Hold hype to re‑saturate the block. The crowd is watching.', persistOnce: true },
  bossIncoming: { id:'bossIncoming', text: 'MOD: Crackdown unit on scope. Boss signature inbound—prep ammo and space.' },
  midRun: { id:'midRun', text: 'GLITCHCAT: Telemetry’s clean. Patterns ramping. Keep the rhythm; joy follows.', persistOnce: true },
  lateRun: { id:'lateRun', text: 'MOD: Deep in now. Elites deploying. Prioritize targets; use cover between pushes.', persistOnce: true },
  lowHp: { id:'lowHp', text: 'Critical health! Break line of sight and use cover or medkits.', persistOnce: true },
  firstMed: { id:'firstMed', text: 'Medkit collected. Stay mobile and top up when safe.', persistOnce: true },
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


