// Minimal narrative system: modal story beats + queued messages
import { getLanguage } from './i18n/index.js';
import { logError } from './util/log.js';
import {
  districtBeatId,
  getCampaignStoryDistrict,
  POST_CAMPAIGN_WAVE_BEATS
} from './story-campaign.js';

export function visibleStoryText(text) {
  return typeof text === 'string' ? text.replace(/\s+#[A-Za-z0-9_-]+\s*$/, '') : '';
}

export function storyPresentationMode(beat) {
  if (!beat) return 'story';
  if (beat.mode === 'story') return 'story';
  const id = typeof beat.id === 'string' ? beat.id : '';
  const isRunNarrative = id === 'act1_brief'
    || id === 'wave72_mara_lastlight'
    || /^district_.+_(arrival|turn|resolve)$/.test(id)
    || /^postgame_/.test(id)
    || /^boss_\d+_(start|down)$/.test(id);
  return isRunNarrative ? 'broadcast' : (beat.mode || 'story');
}

export class StoryManager {
  constructor({
    documentRef,
    onPause,
    controls,
    toastFn,
    tickerFn,
    broadcastFn,
    beatsUrl = null,
    minGapMs = 2200,
    randomFn = Math.random,
    scheduleFn = setTimeout,
    fetchFn = globalThis.fetch?.bind(globalThis),
    languageFn = getLanguage
  }){
    this.doc = documentRef || document;
    this.onPause = onPause || (()=>{});
    this.controls = controls || null;
    this.toast = typeof toastFn === 'function' ? toastFn : null;
    this.ticker = typeof tickerFn === 'function' ? tickerFn : null;
    this.broadcast = typeof broadcastFn === 'function' ? broadcastFn : null;
    this.queue = [];
    this.active = false;
    this.enabled = false;
    this._bindUI();
    this._beatsFired = new Set();
    this._beats = {};
    this._beatsUrl = beatsUrl;
    this._random = typeof randomFn === 'function' ? randomFn : Math.random;
    const scheduler = typeof scheduleFn === 'function' ? scheduleFn : globalThis.setTimeout;
    this._schedule = scheduler.bind(globalThis);
    this._fetch = typeof fetchFn === 'function' ? fetchFn : null;
    this._getLanguage = typeof languageFn === 'function' ? languageFn : getLanguage;
    this._lastShownAt = 0;
    this._minGapMs = minGapMs;
    this.SEEN_KEY = 'bs3d_story_seen';
    this._seen = this._loadSeen();
    this._currentBeat = null;
    this._tickerShown = false;
    this._bossActive = false;
    this._beatsLoaded = false;
    this._pendingBeatIds = [];
    this._ambientShownDistricts = new Set();
    this._currentWave = 0;
    this._currentDistrictId = null;
    this._runFlags = { lowHp: false, recovered: false };
    this._context = { startWave: 1, endingState: null };
    this._drainCallbacks = [];
    this._runToken = 0;
  }

  _bindUI(){
    this.container = this.doc.getElementById('story');
    this.textEl = this.doc.getElementById('storyText');
    this.nextBtn = this.doc.getElementById('storyNext');
    if (this.nextBtn) this.nextBtn.onclick = ()=> this._next();
  }

  reset(){
    this._runToken += 1;
    this.queue.length = 0;
    this._pendingBeatIds.length = 0;
    this._beatsFired.clear();
    this._ambientShownDistricts.clear();
    this.active = false;
    this.enabled = false;
    if (this.container) this.container.style.display = 'none';
    this._tickerShown = false;
    this._bossActive = false;
    this._beatsLoaded = false;
    this._beats = {};
    this._currentWave = 0;
    this._currentDistrictId = null;
    this._runFlags = { lowHp: false, recovered: false };
    this._context = { startWave: 1, endingState: null };
    this._drainCallbacks.length = 0;
    this._currentBeat = null;
  }

  startRun({ startWave = 1, endingState = null } = {}){
    this.reset();
    this.enabled = true;
    const normalizedStartWave = Math.max(1, Math.floor(Number(startWave)) || 1);
    this._context = { startWave: normalizedStartWave, endingState: endingState || null };
    const runToken = this._runToken;
    const lang = this._getLanguage();
    const urls = ['i18n/story_en.json'];
    if (lang !== 'en') urls.push(`i18n/story_${lang}.json`);
    if (this._beatsUrl) urls.push(this._beatsUrl);
    this.onWave(normalizedStartWave);
    try {
      const requestBeats = this._fetch
        ? Promise.all(urls.map(u => this._fetch(u).then(r => r.ok ? r.json() : null).catch(()=>null)))
        : Promise.resolve([]);
      this._loadPromise = requestBeats
        .then(results => {
          if (!this.enabled || runToken !== this._runToken) return;
          const beats = {};
          results.forEach(data => {
            if (data && data.beats) Object.assign(beats, data.beats);
          });
          this._beats = beats;
          this._beatsLoaded = true;
          if (normalizedStartWave === 1) {
            this._enqueueBeat('intro');
            this._enqueueBeat('controlsTip');
          }
          this._flushPendingBeats();
          this._queueAmbientBeat(this._currentWave);
          this._maybeShow();
          if (normalizedStartWave === 1) {
            this._schedule(() => {
              if (!this.enabled || runToken !== this._runToken) return;
              this._enqueueBeat('intro2');
              this._maybeShow();
            }, 4000);
          }
        })
        .catch(() => {
          if (!this.enabled || runToken !== this._runToken) return;
          this._beatsLoaded = true;
          this._enqueueBeat('intro');
          this._flushPendingBeats();
          this._maybeShow();
          this._schedule(() => {
            if (!this.enabled || runToken !== this._runToken) return;
            this._enqueueBeat('intro2');
            this._maybeShow();
          }, 4000);
        });
      return this._loadPromise;
    } catch (e) {
      logError(e);
      this._enqueueBeat('intro');
      this._maybeShow();
      const runToken = this._runToken;
      this._beatsLoaded = true;
      this._flushPendingBeats();
      this._schedule(() => {
        if (!this.enabled || runToken !== this._runToken) return;
        this._enqueueBeat('intro2');
        this._maybeShow();
      }, 4000);
      return Promise.resolve();
    }
  }

  onWave(wave){
    if (!this.enabled) return;
    const normalizedWave = Math.floor(Number(wave));
    if (!Number.isFinite(normalizedWave)) return;
    this._currentWave = normalizedWave;
    if (normalizedWave === 59) this._enqueueBeat(districtBeatId('spillway', 'resolve'));
    if (normalizedWave === 66) this._enqueueBeat(districtBeatId('galleries', 'resolve'));
    const district = getCampaignStoryDistrict(normalizedWave);
    if (district && district.id !== this._currentDistrictId) {
      this._currentDistrictId = district.id;
      this._runFlags = { lowHp: false, recovered: false };
      this._enqueueBeat(districtBeatId(district.id, 'arrival'));
    }
    if (district && normalizedWave === district.turnWave) {
      this._enqueueBeat(districtBeatId(district.id, 'turn'));
    }
    if (normalizedWave === 42) this._enqueueBranchBeat('postgame_guide');
    if (normalizedWave === 59) this._enqueueBranchBeat('postgame_archive_access');
    const milestoneBeat = POST_CAMPAIGN_WAVE_BEATS[normalizedWave];
    if (milestoneBeat) this._enqueueBeat(milestoneBeat);
    if (normalizedWave === 1) this._enqueueBeat('firstWave');
    if (normalizedWave === 2) this._enqueueBeat('act1_brief');
    this._queueAmbientBeat(normalizedWave);
    this._maybeShow();
  }

  onBossStart(wave){
    if (!this.enabled) return;
    try {
      if (typeof window !== 'undefined' && window._HUD && typeof window._HUD.clearTicker === 'function') {
        window._HUD.clearTicker();
      }
    } catch (e) { logError(e); }
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
    } catch (e) { logError(e); }
    this._enqueueBeat(`boss_${wave}_down`);
    this._enqueueBeat(`boss_${wave}_ticker`);
    const district = getCampaignStoryDistrict(wave);
    if (district) {
      if (this._runFlags.lowHp) {
        this._enqueueBeat(this._runFlags.recovered ? 'memory_recovered' : 'memory_wounded');
      }
      this._enqueueBeat(districtBeatId(district.id, 'resolve'));
    }
    const beat = this._beats[`boss_${wave}_ticker`];
    const repeat = typeof beat?.repeat === 'number' ? beat.repeat : 3;
    const interval = typeof beat?.interval === 'number' ? beat.interval : 8000;
    this._schedule(()=>{ this._bossActive = false; }, repeat * (interval + 240));
    this._maybeShow();
  }

  onLowHp(){
    if (!this.enabled) return;
    this._runFlags.lowHp = true;
    this._enqueueBeat('lowHp');
    this._maybeShow();
  }

  onFirstMedPickup(){
    if (!this.enabled) return;
    if (this._runFlags.lowHp) this._runFlags.recovered = true;
    this._enqueueBeat('firstMed');
    this._maybeShow();
  }

  onChapterComplete(chapterId){
    if (!this.enabled || !chapterId) return false;
    const queued = this._enqueueBranchBeat(districtBeatId(chapterId, 'resolve'));
    this._maybeShow();
    return queued;
  }

  onCheckpoint(checkpoint = {}){
    if (!this.enabled || checkpoint.levelId !== 'floodgate-continuity') return false;
    if (checkpoint.completedWave === 58) return this.onChapterComplete('spillway');
    if (checkpoint.completedWave === 65) return this.onChapterComplete('galleries');
    return false;
  }

  onSpecialWave(event = {}, { endingState = this._context.endingState, onComplete } = {}){
    if (!this.enabled || event.encounter !== 'last_light') return false;
    if (event.type === 'start') {
      const queued = this._enqueueBeat('wave72_mara_lastlight');
      this._maybeShow();
      return queued;
    }
    if (event.type !== 'complete') return false;
    const branch = endingState === 'free' ? 'free' : 'reset';
    return this._playSequence([
      districtBeatId('cistern', 'resolve'),
      'wave72_epilogue_signal',
      `wave72_epilogue_${branch}`,
      'wave72_epilogue_title'
    ], onComplete);
  }

  // --- Internal ---
  _enqueueBeat(id){
    if (this._beatsFired.has(id)) return false;
    const beat = this._beats[id];
    if (!beat) {
      if (!this._beatsLoaded && id && !this._pendingBeatIds.includes(id)) {
        this._pendingBeatIds.push(id);
        return true;
      }
      return false;
    }
    if (beat.persistOnce && storyPresentationMode(beat) !== 'broadcast' && this._seen[id]) return false;
    if (storyPresentationMode(beat) === 'ticker' && !this.ticker && !(typeof window !== 'undefined' && window._HUD && typeof window._HUD.ticker === 'function')) return false;
    this._beatsFired.add(id);
    this.queue.push(beat);
    return true;
  }

  _enqueueBranchBeat(baseId){
    const branch = this._context.endingState;
    const branchId = branch ? `${baseId}_${branch}` : baseId;
    if (!this._beatsLoaded) return this._enqueueBeat(branchId);
    if (branch && this._beats[branchId]) return this._enqueueBeat(branchId);
    return this._enqueueBeat(baseId);
  }

  _playSequence(ids, onComplete){
    const queued = ids.reduce((count, id) => count + (this._enqueueBeat(id) ? 1 : 0), 0);
    if (queued === 0) return false;
    if (typeof onComplete === 'function') this._drainCallbacks.push(onComplete);
    this._maybeShow();
    return true;
  }

  _notifyQueueDrained(){
    if (this.active || this.queue.length > 0 || this._drainCallbacks.length === 0) return;
    const callbacks = this._drainCallbacks.splice(0);
    callbacks.forEach(callback => {
      try { callback(); } catch (e) { logError(e); }
    });
  }

  _flushPendingBeats(){
    const pending = this._pendingBeatIds.splice(0);
    pending.forEach(id => this._enqueueBeat(id));
  }

  _queueAmbientBeat(wave){
    if (!this.ticker || this._bossActive || !this._beatsLoaded) return;
    const district = getCampaignStoryDistrict(wave);
    if (!district || wave <= district.startWave) return;
    const remaining = Object.values(this._beats).filter(beat => (
      beat?.mode === 'ticker'
      && beat?.pool === 'ambient'
      && beat?.district === district.id
      && !this._beatsFired.has(beat.id)
    ));
    if (remaining.length === 0) return;
    const firstForDistrict = !this._ambientShownDistricts.has(district.id);
    if (!firstForDistrict && this._random() >= 0.3) return;
    const pickIndex = Math.min(remaining.length - 1, Math.floor(this._random() * remaining.length));
    this._enqueueBeat(remaining[pickIndex].id);
    this._ambientShownDistricts.add(district.id);
    this._tickerShown = true;
  }

  _maybeShow(){
    if (this.active) return;
    if (this.queue.length === 0) { this._notifyQueueDrained(); return; }
    // If another modal (armory offer) is open, delay story until it's closed
    if (this._isOfferOpen()) { this._schedule(()=> this._maybeShow(), 150); return; }
    const now = performance.now ? performance.now() : Date.now();
    const waitMs = Math.max(0, this._minGapMs - (now - this._lastShownAt));
    const showNext = () => {
      const next = this.queue.shift();
      if (!next || typeof next.text !== 'string') { this._schedule(()=> this._maybeShow(), 0); return; }
      this._show(next);
    };
    if (waitMs > 16) { this._schedule(showNext, waitMs); } else { showNext(); }
  }

  _show(beat){
    if (!beat || typeof beat.text !== 'string') { return; }
    const text = visibleStoryText(beat.text);
    const mode = storyPresentationMode(beat);
    // Broadcast beats are prominent but never pause play or capture input.
    if (mode === 'broadcast') {
      const broadcast = this.broadcast || (typeof window !== 'undefined' && window._HUD && typeof window._HUD.storyBroadcast === 'function'
        ? window._HUD.storyBroadcast
        : null);
      const holdMs = Math.max(2500, Number(beat.duration) || 5600);
      if (broadcast) broadcast(text, holdMs);
      else if (this.toast) this.toast(text);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      const now = performance.now ? performance.now() : Date.now();
      this._lastShownAt = now + Math.max(0, holdMs - this._minGapMs);
      if (this.queue.length > 0) this._schedule(()=> this._maybeShow(), holdMs);
      else this._notifyQueueDrained();
      return;
    }
    // Toast-mode beats are non-blocking
    if (mode === 'toast'){
      const toast = this.toast || (typeof window !== 'undefined' && window._HUD && typeof window._HUD.toast === 'function' ? window._HUD.toast : null);
      if (toast) toast(text);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      this._lastShownAt = performance.now ? performance.now() : Date.now();
      // chain next if any
      if (this.queue.length > 0) this._schedule(()=> this._maybeShow(), 50);
      else this._notifyQueueDrained();
      return;
    }
    // Ticker-mode beats show in bottom news feed, also non-blocking
    if (mode === 'ticker'){
      const ticker = this.ticker || (typeof window !== 'undefined' && window._HUD && typeof window._HUD.ticker === 'function' ? window._HUD.ticker : null);
      const repeat = typeof beat.repeat === 'number' ? beat.repeat : 3;
      const interval = typeof beat.interval === 'number' ? beat.interval : 8000;
      if (ticker) ticker(text, repeat, interval);
      if (beat.id) this._markSeen(beat.id, beat.persistOnce);
      const now = performance.now ? performance.now() : Date.now();
      this._lastShownAt = (beat.id && beat.id.startsWith('boss_'))
        ? now
        : now + repeat * (interval + 240);
      if (this.queue.length > 0) this._schedule(()=> this._maybeShow(), 50);
      else this._notifyQueueDrained();
      return;
    }
    if (!this.container || !this.textEl) return;
    this.active = true;
    this._currentBeat = beat;
    this.textEl.textContent = text;
    this.container.style.display = '';
    this.onPause(true);
    // Release pointer lock for interaction
      try { this.controls?.unlock?.(); } catch (e) { logError(e); }
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
    } catch (e) { logError(e); }
    this._currentBeat = null;
    const nextBeat = this.queue[0];
    const nonBlockingModes = new Set(['toast', 'ticker', 'broadcast']);
    const nextIsModal = nextBeat && !nonBlockingModes.has(storyPresentationMode(nextBeat));
    // If an armory offer is up, keep game paused and do NOT relock pointer
    if (!this._isOfferOpen() && !nextIsModal) {
      this.onPause(false);
      // Attempt to re-lock pointer immediately after interaction
      // This is triggered from a click/keypress, so it's a valid user gesture
      try { this.controls?.lock?.(); } catch (e) { logError(e); }
    }
    this._lastShownAt = performance.now ? performance.now() : Date.now();
    // Show next queued beat if any
    if (this.queue.length > 0) {
      // Slight delay to avoid double-click skipping
      this._schedule(()=> this._maybeShow(), 50);
    } else this._notifyQueueDrained();
  }

  _loadSeen(){
    if (typeof localStorage === 'undefined') return {};
    try {
      const s = localStorage.getItem(this.SEEN_KEY);
      return s ? JSON.parse(s) : {};
    } catch (e) { logError(e); return {}; }
  }
  _saveSeen(){
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(this.SEEN_KEY, JSON.stringify(this._seen)); } catch (e) { logError(e); }
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
    } catch (e) { logError(e); return false; }
  }
}

