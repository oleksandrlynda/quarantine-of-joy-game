// Minimal narrative system: modal story beats + queued messages
import { getLanguage } from './i18n/index.js';

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
    this._beats = {};
    this._beatsUrl = beatsUrl;
    this._lastShownAt = 0;
    this._minGapMs = minGapMs;
    this.SEEN_KEY = 'bs3d_story_seen';
    this._seen = this._loadSeen();
    this._currentBeat = null;
    this._tickerShown = false;
    this._bossActive = false;
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
    this._tickerShown = false;
    this._bossActive = false;
  }

  startRun(){
    this.enabled = true;
    this._tickerShown = false;
    this._bossActive = false;
    const lang = getLanguage();
    const urls = ['i18n/story_en.json'];
    if (lang !== 'en') urls.push(`i18n/story_${lang}.json`);
    if (this._beatsUrl) urls.push(this._beatsUrl);
    try {
      Promise.all(urls.map(u => fetch(u).then(r => r.ok ? r.json() : null).catch(()=>null)))
        .then(results => {
          const beats = {};
          results.forEach(data => {
            if (data && data.beats) Object.assign(beats, data.beats);
          });
          this._beats = beats;
          this._enqueueBeat('intro');
          this._enqueueBeat('controlsTip');
          this._maybeShow();
          setTimeout(() => {
            this._enqueueBeat('intro2');
            this._maybeShow();
          }, 4000);
        })
        .catch(() => {
          this._enqueueBeat('intro');
          this._maybeShow();
          setTimeout(() => {
            this._enqueueBeat('intro2');
            this._maybeShow();
          }, 4000);
        });
    } catch(_) {
      this._enqueueBeat('intro');
      this._maybeShow();
      setTimeout(() => {
        this._enqueueBeat('intro2');
        this._maybeShow();
      }, 4000);
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
    // Drop a ticker snippet the first time we get past wave 1, then occasionally
    if (this.ticker && wave > 1 && !this._bossActive) {
      const tickers = Object.keys(this._beats).filter(id => this._beats[id].mode === 'ticker');
      const remaining = tickers.filter(id => !this._beatsFired.has(id));
      if (remaining.length > 0) {
        const shouldShow = !this._tickerShown || Math.random() < 0.3;
        if (shouldShow) {
          const pick = remaining[Math.floor(Math.random() * remaining.length)];
          this._enqueueBeat(pick);
          this._tickerShown = true;
        }
      }
    }
    this._maybeShow();
  }

  onBossStart(wave){
    if (!this.enabled) return;
    try {
      if (typeof window !== 'undefined' && window._HUD && typeof window._HUD.clearTicker === 'function') {
        window._HUD.clearTicker();
      }
    } catch(_) {}
    this._bossActive = true;
    this._enqueueBeat(`boss_${wave}_start`);
    this._enqueueBeat(`boss_${wave}_ticker`);
    this._maybeShow();
  }

  onBossDeath(wave){
    if (!this.enabled) return;
    try {
      if (typeof window !== 'undefined' && window._HUD && typeof window._HUD.clearTicker === 'function') {
        window._HUD.clearTicker();
      }
    } catch(_) {}
    this._enqueueBeat(`boss_${wave}_down`);
    this._enqueueBeat(`boss_${wave}_ticker`);
    if (wave === 5) this._enqueueBeat('boss_5_report');
    const beat = this._beats[`boss_${wave}_ticker`];
    const repeat = typeof beat?.repeat === 'number' ? beat.repeat : 3;
    const interval = typeof beat?.interval === 'number' ? beat.interval : 8000;
    setTimeout(()=>{ this._bossActive = false; }, repeat * (interval + 240));
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
      const repeat = typeof beat.repeat === 'number' ? beat.repeat : 3;
      const interval = typeof beat.interval === 'number' ? beat.interval : 8000;
      if (ticker) ticker(beat.text, repeat, interval);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      const now = performance.now ? performance.now() : Date.now();
      this._lastShownAt = (beat.id && beat.id.startsWith('boss_'))
        ? now
        : now + repeat * (interval + 240);
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

