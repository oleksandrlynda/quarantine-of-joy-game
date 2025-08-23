// 8-bit drive music generator using Web Audio API
// Exports Music class with start/stop and mute/volume controls

import { logError } from './util/log.js';

export class Music {
  constructor(options = {}) {
    this.getAudioContext = options.audioContextProvider || (() => new (window.AudioContext || window.webkitAudioContext)());
    this.ctx = null;
    this.masterGain = null;
    this.reverb = null;
    this.reverbGain = null;
    this.reverbBus = null;
    this.busses = { drums: null, bass: null, lead: null, pad: null, fx: null };
    this.busVolumes = { drums: 1, bass: 1, lead: 1, pad: 1, fx: 1 };
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = options.volume != null ? options.volume : 0.4; // overall music volume
    this.originalVolume = this.volume;
    this.reverbAmount = options.reverb != null ? options.reverb : 0.25; // wet level

    // Tempo and scheduling
    this.bpm = options.bpm || 132; // up-tempo "drive"
    this.stepsPerBeat = 4; // 16th notes
    this.stepsPerBar = 16; // 4 beats * 4 steps
    this.lookaheadMs = 25; // scheduler tick
    this.scheduleAheadTime = 0.12; // seconds
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this._timerId = null;
    this.barCounter = 0;
    this.secondsPerStep = 0;
    this.onStep = null; // optional callback for playback progress
    this.swing = 0.12; // 0..0.5 of step; 0.12 = gentle swing
    this.energy = 0; // 0..3 from gameplay
    this.mode = 'normal'; // 'normal' | 'boss'
    this.bossProfile = {
      hatExtraDensity: 0.0,
      padBrightnessHz: 2000,
      toms: false,
      leadArpOverride: null,
      progressionOverride: null,
      baseFreqOverride: null,
      delayTimeOverride: null,
      motifSemis: null,
      stingerTone: 1.0,
    };
    this.bossIntensity = 0.0; // 0..1 dynamic during boss

    // Mood (environment-driven)
    this.hatCutoffHz = 6000; // dynamic with fog/rain
    this.padBaseBrightnessHz = 2000; // dynamic with weather
    this._mood = { rain: 0, snow: 0, fog: 0, sand: 0 };

    // Key/scale (default E minor)
    this.baseFreq = 164.81; // E3
    this.scaleSemis = [0, 2, 3, 5, 7, 8, 10, 12];

    // Base drum patterns (16-step)
    this.kickPattern = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]; // 4-on-the-floor
    this.snarePattern = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]; // 2 and 4
    this.hatPattern =   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]; // offbeat 8ths
    this.clapPattern =  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]; // no claps by default
    this.ridePattern =  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]; // no rides by default
    this.stabPattern =  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]; // simple chord stabs on 1 and 3

    // 8-bar chord progression (relative to root) default
    this.progression = [0, 8, 3, 10, 0, 8, 10, 0];
    this.leadArp = [0, 12, 7, 12];

    // Pattern variation
    this.variation = { kick: 0, snare: 0, hat: 0, clap: 0, ride: 0, stab: 0 };
    this.variationEnabled = true;
    this._varPatterns = {};
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = this.getAudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0.0001 : this.volume;
      // Create sub-busses
      this.busses.drums = this.ctx.createGain();
      this.busses.bass = this.ctx.createGain();
      this.busses.lead = this.ctx.createGain();
      this.busses.pad = this.ctx.createGain();
      this.busses.fx = this.ctx.createGain();
      this.busses.drums.gain.value = this.busVolumes.drums;
      this.busses.bass.gain.value = this.busVolumes.bass;
      this.busses.lead.gain.value = this.busVolumes.lead;
      this.busses.pad.gain.value = this.busVolumes.pad;
      this.busses.fx.gain.value = this.busVolumes.fx;

      // Simple reverb bus
      this.reverbBus = this.ctx.createGain();
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulseBuffer();
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = this.reverbAmount;
      this.reverbBus.connect(this.reverb).connect(this.reverbGain).connect(this.masterGain);

      // Subtle stereo motion for lead
      this.leadPanner = this.ctx.createStereoPanner();
      const panLfo = this.ctx.createOscillator();
      const panDepth = this.ctx.createGain();
      panLfo.frequency.value = 0.05; // very slow
      panDepth.gain.value = 0.4;
      panLfo.connect(panDepth).connect(this.leadPanner.pan);
      panLfo.start();

      // Shared delay for lead/hats (kept bright)
      this.delay = this.ctx.createDelay(0.5);
      this.delay.delayTime.value = 0.23; // tempo-ish
      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = 'highpass';
      this.delayFilter.frequency.value = 1200;
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.value = 0.16;
      // Feedback
      this.feedback = this.ctx.createGain();
      this.feedback.gain.value = 0.22;
      this.delay.connect(this.delayFilter).connect(this.delayGain).connect(this.masterGain);
      this.delayGain.connect(this.feedback).connect(this.delay);

      // Wire busses
      this.busses.drums.connect(this.masterGain);
      this.busses.bass.connect(this.masterGain);
      this.busses.lead.connect(this.leadPanner).connect(this.masterGain);
      this.busses.lead.connect(this.delay);
      this.busses.lead.connect(this.reverbBus);
      this.busses.pad.connect(this.masterGain);
      this.busses.pad.connect(this.delay);
      this.busses.pad.connect(this.reverbBus);
      this.busses.fx.connect(this.delay);
      this.busses.fx.connect(this.reverbBus);

      this.masterGain.connect(this.ctx.destination);
    }
  }

  makeImpulseBuffer(duration = 1.2) {
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
      const buf = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2);
        buf[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return impulse;
  }

  // Expose underlying AudioContext for sharing with SFX
  getContext() {
    this.ensureContext();
    return this.ctx;
  }

  // Provide a shared FX bus node (connected to the internal delay)
  getFxBus() {
    this.ensureContext();
    return this.busses?.fx || this.masterGain;
  }

  start() {
    if (this.isPlaying) return;
    this.ensureContext();
    // Resume if suspended due to autoplay policy
    if (this.ctx.state === 'suspended' && this.ctx.resume) {
      this.ctx.resume();
    }
    const secondsPerBeat = 60 / this.bpm;
    const secondsPerStep = secondsPerBeat / this.stepsPerBeat;
    this.secondsPerStep = secondsPerStep;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.currentStep = 0;
    this.barCounter = 0;
    this.isPlaying = true;

    const scheduler = () => {
      if (!this.isPlaying) return;
      while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        const stepForCallback = this.currentStep;
        this.scheduleStep(stepForCallback, this.nextNoteTime);
        this.nextNoteTime += secondsPerStep;
        this.currentStep = (this.currentStep + 1) % this.stepsPerBar;
        if (typeof this.onStep === 'function') {
          this.onStep(stepForCallback, this.stepsPerBar);
        }
        if (stepForCallback === this.stepsPerBar - 1) this.barCounter++;
      }
    };

    this._timerId = setInterval(scheduler, this.lookaheadMs);
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGain) {
      const target = this.isMuted ? 0.0001 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx?.currentTime || 0, 0.01);
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.isMuted && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  setReverb(amount) {
    this.reverbAmount = Math.max(0, Math.min(1, amount));
    if (this.reverbGain) {
      this.reverbGain.gain.setTargetAtTime(this.reverbAmount, this.ctx.currentTime, 0.01);
    }
  }

  setBusVolume(bus, volume) {
    const v = Math.max(0, Math.min(1, volume));
    this.busVolumes[bus] = v;
    if (this.busses[bus]) {
      this.busses[bus].gain.setTargetAtTime(v, this.ctx?.currentTime || 0, 0.01);
    }
  }

  getBusVolume(bus) {
    return this.busVolumes[bus];
  }

  setDrumsVolume(v) { this.setBusVolume('drums', v); }
  getDrumsVolume() { return this.getBusVolume('drums'); }

  setBassVolume(v) { this.setBusVolume('bass', v); }
  getBassVolume() { return this.getBusVolume('bass'); }

  setLeadVolume(v) { this.setBusVolume('lead', v); }
  getLeadVolume() { return this.getBusVolume('lead'); }

  setPadVolume(v) { this.setBusVolume('pad', v); }
  getPadVolume() { return this.getBusVolume('pad'); }

  setFxVolume(v) { this.setBusVolume('fx', v); }
  getFxVolume() { return this.getBusVolume('fx'); }

  setVariationEnabled(enabled) {
    this.variationEnabled = !!enabled;
  }

  randomizePattern(pattern, probability) {
    if (!probability) return pattern.slice();
    const out = pattern.slice();
    for (let i = 0; i < out.length; i++) {
      if (!out[i] && Math.random() < probability) out[i] = 1;
    }
    return out;
  }

  applyVariation() {
    if (!this.variationEnabled) {
      this._varPatterns = {
        kick: this.kickPattern,
        snare: this.snarePattern,
        hat: this.hatPattern,
        clap: this.clapPattern,
        ride: this.ridePattern,
        stab: this.stabPattern,
      };
      return;
    }
    this._varPatterns.kick = this.randomizePattern(this.kickPattern, this.variation.kick);
    this._varPatterns.snare = this.randomizePattern(this.snarePattern, this.variation.snare);
    this._varPatterns.hat = this.randomizePattern(this.hatPattern, this.variation.hat);
    this._varPatterns.clap = this.randomizePattern(this.clapPattern, this.variation.clap);
    this._varPatterns.ride = this.randomizePattern(this.ridePattern, this.variation.ride);
    this._varPatterns.stab = this.randomizePattern(this.stabPattern, this.variation.stab);
  }

  fadeOut(duration = 0.5) {
    return new Promise(resolve => {
      this.ensureContext();
      if (!this.masterGain) {
        this.stop();
        resolve();
        return;
      }
      const ctx = this.ctx;
      const gain = this.masterGain.gain;
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0.0001, now + duration);
      setTimeout(() => {
        this.stop();
        resolve();
      }, duration * 1000);
    });
  }

  fadeIn(duration = 0.5) {
    this.ensureContext();
    if (!this.masterGain) return;
    const ctx = this.ctx;
    const gain = this.masterGain.gain;
    const now = ctx.currentTime;
    const target = this.isMuted ? 0.0001 : this.volume;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0.0001, now);
    gain.linearRampToValueAtTime(target, now + duration);
  }

  async crossfadeTo(song, duration = 0.5) {
    await this.fadeOut(duration);
    this.loadSong(song);
    this.start();
    this.fadeIn(duration);
  }

  createRecorder() {
    this.ensureContext();
    const dest = this.ctx.createMediaStreamDestination();
    this.masterGain.connect(dest);
    const recorder = new MediaRecorder(dest.stream);
    recorder.addEventListener('stop', () => {
      try { this.masterGain.disconnect(dest); } catch (e) { logError(e); }
    });
    return recorder;
  }

  // Recompute internal timing when BPM changes
  recomputeTempo() {
    const secondsPerBeat = 60 / this.bpm;
    this.secondsPerStep = secondsPerBeat / this.stepsPerBeat;
  }

  // Temporarily duck main music for boss mode; restore later
  enterBossMode() {
    this.mode = 'boss';
    this.originalVolume = this.volume;
    // Lower base slightly to make room for boss cue, push rhythm up
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(Math.max(0.12, this.originalVolume * 0.65), this.ctx.currentTime, 0.15);
    if (this.busses && this.busses.drums) this.busses.drums.gain.setTargetAtTime(1.0 * this.busVolumes.drums, this.ctx.currentTime, 0.15);
    if (this.busses && this.busses.bass) this.busses.bass.gain.setTargetAtTime(0.95 * this.busVolumes.bass, this.ctx.currentTime, 0.15);
    if (this.busses && this.busses.lead) this.busses.lead.gain.setTargetAtTime(0.9 * this.busVolumes.lead, this.ctx.currentTime, 0.15);
  }

  exitBossMode() {
    this.mode = 'normal';
    if (!this.isMuted && this.masterGain) this.masterGain.gain.setTargetAtTime(this.originalVolume, this.ctx.currentTime, 0.2);
  }

  // Load a song preset (see musicLibrary)
  loadSong(song) {
    if (!song) return;
    if (song.bpm) this.bpm = song.bpm;
    if (song.swing != null) this.swing = song.swing;
    if (song.baseFreq) this.baseFreq = song.baseFreq;
    if (song.progression) this.progression = song.progression.slice();
    if (song.kickPattern) this.kickPattern = song.kickPattern.slice();
    if (song.snarePattern) this.snarePattern = song.snarePattern.slice();
    if (song.hatPattern) this.hatPattern = song.hatPattern.slice();
    if (song.clapPattern) this.clapPattern = song.clapPattern.slice();
    if (song.ridePattern) this.ridePattern = song.ridePattern.slice();
    if (song.stabPattern) this.stabPattern = song.stabPattern.slice();
    if (song.leadArp) this.leadArp = song.leadArp.slice();
    if (song.delayTime && this.delay) this.delay.delayTime.setTargetAtTime(song.delayTime, this.ctx?.currentTime || 0, 0.05);
    if (song.variations) this.variation = { ...this.variation, ...song.variations };
    // Reset position to bar start on song load
    this.currentStep = 0;
    this.barCounter = 0;
    this.recomputeTempo();
  }

  // Apply per-boss profile for identity and parameter tweaks
  applyBossProfile(profile = {}) {
    this.bossProfile = { ...this.bossProfile, ...profile };
    // Param overrides
    if (this.bossProfile.baseFreqOverride) this.baseFreq = this.bossProfile.baseFreqOverride;
    if (this.bossProfile.progressionOverride) this.progression = this.bossProfile.progressionOverride.slice();
    if (this.bossProfile.leadArpOverride) this.leadArp = this.bossProfile.leadArpOverride.slice();
    if (this.bossProfile.delayTimeOverride && this.delay) this.delay.delayTime.setTargetAtTime(this.bossProfile.delayTimeOverride, this.ctx?.currentTime || 0, 0.05);
  }

  // One-shot boss intro cue: riser + impact using FX bus
  playBossStinger(opts = {}) {
    this.ensureContext();
    const a = this.ctx;
    const now = a.currentTime + 0.01;
    const toneMul = typeof opts.tone === 'number' ? opts.tone : (this.bossProfile?.stingerTone || 1.0);
    // Riser noise (0.6s)
    const durRise = 0.6;
    const noiseBufLen = Math.floor(durRise * a.sampleRate);
    const buf = a.createBuffer(1, noiseBufLen, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < noiseBufLen; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = a.createBufferSource();
    noise.buffer = buf;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, now);
    bp.Q.value = 0.8;
    const gN = a.createGain();
    gN.gain.setValueAtTime(0.0001, now);
    gN.gain.exponentialRampToValueAtTime(0.6, now + durRise * 0.7);
    gN.gain.exponentialRampToValueAtTime(0.0001, now + durRise);
    // Sweep up
    bp.frequency.exponentialRampToValueAtTime(6500, now + durRise);
    noise.connect(bp).connect(gN).connect(this.busses.fx || this.masterGain);
    noise.start(now);
    noise.stop(now + durRise);

    // Impact (pitch drop + noise burst) at end of riser
    const tHit = now + durRise - 0.02;
    const osc = a.createOscillator();
    const gO = a.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320 * toneMul, tHit);
    osc.frequency.exponentialRampToValueAtTime(60 * toneMul, tHit + 0.35);
    gO.gain.setValueAtTime(0.0001, tHit);
    gO.gain.exponentialRampToValueAtTime(0.7, tHit + 0.02);
    gO.gain.exponentialRampToValueAtTime(0.0001, tHit + 0.4);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    osc.connect(lp).connect(gO).connect(this.busses.fx || this.masterGain);
    osc.start(tHit);
    osc.stop(tHit + 0.45);

    // Extra thump layer
    const k = a.createOscillator();
    const gK = a.createGain();
    k.type = 'sine';
    k.frequency.setValueAtTime(140 * toneMul, tHit);
    k.frequency.exponentialRampToValueAtTime(40 * toneMul, tHit + 0.2);
    gK.gain.setValueAtTime(0.0001, tHit);
    gK.gain.exponentialRampToValueAtTime(0.8, tHit + 0.01);
    gK.gain.exponentialRampToValueAtTime(0.0001, tHit + 0.24);
    k.connect(gK).connect(this.busses.fx || this.masterGain);
    k.start(tHit);
    k.stop(tHit + 0.26);
  }

  setEnergy(level) {
    // 0..3
    this.energy = Math.max(0, Math.min(3, level|0));
    if (!this.busses.drums) return;
    // Submix adjustments by energy
    const drum = 0.7 + this.energy * 0.1;
    const bass = 0.7 + this.energy * 0.1;
    const lead = 0.6 + this.energy * 0.13;
    const pad = 0.45 + this.energy * 0.08 + (this.mode === 'boss' ? this.bossIntensity * 0.15 : 0);
    this.busses.drums.gain.setTargetAtTime(drum * this.busVolumes.drums, this.ctx.currentTime, 0.05);
    this.busses.bass.gain.setTargetAtTime(bass * this.busVolumes.bass, this.ctx.currentTime, 0.05);
    this.busses.lead.gain.setTargetAtTime(lead * this.busVolumes.lead, this.ctx.currentTime, 0.05);
    this.busses.pad.gain.setTargetAtTime(pad * this.busVolumes.pad, this.ctx.currentTime, 0.08);
    this.delayGain.gain.setTargetAtTime(0.12 + this.energy * 0.05, this.ctx.currentTime, 0.2);
  }

  setBossIntensity(value) {
    this.bossIntensity = Math.max(0, Math.min(1, value));
    if (this.delayGain) this.delayGain.gain.setTargetAtTime(0.16 + this.bossIntensity * 0.12, this.ctx.currentTime, 0.25);
    if (this.busses?.drums) this.busses.drums.gain.setTargetAtTime((0.85 + this.bossIntensity * 0.2) * this.busVolumes.drums, this.ctx.currentTime, 0.1);
  }

  setMood(partial) {
    if (!partial) return;
    Object.assign(this._mood, partial);
  }

  scheduleStep(stepIndex, time) {
    const bar = this.barCounter % this.progression.length; // 0..7
    const rootSemi = this.progression[bar];

    // Swing offsets for micro-groove on certain parts
    const swingOffset = (stepIndex % 2 === 1) ? this.secondsPerStep * this.swing : 0;

    if (stepIndex === 0) this.applyVariation();

    const kickPat = this._varPatterns.kick || this.kickPattern;
    const snarePat = this._varPatterns.snare || this.snarePattern;
    const hatPat = this._varPatterns.hat || this.hatPattern;
    const clapPat = this._varPatterns.clap || this.clapPattern;
    const ridePat = this._varPatterns.ride || this.ridePattern;
    const stabPat = this._varPatterns.stab || this.stabPattern;

    // Drums with occasional fills
    if (kickPat[stepIndex]) this.playKick(time);
    if (snarePat[stepIndex]) this.playSnare(time);
    // Light extra ghost kick on step 12 when energy high
    if (this.energy >= 2 && stepIndex === 12) this.playKick(time + 0.001);

    // Hats density scales with energy and boss profile
    const extraHat = (this.mode === 'boss' && Math.random() < this.bossProfile.hatExtraDensity && (stepIndex % 2 === 0));
    const hatOn = hatPat[stepIndex] || (this.energy >= 2 && stepIndex % 4 === 2) || extraHat;
    if (hatOn) this.playHat(time + swingOffset * 0.8);
    if (ridePat && ridePat[stepIndex]) {
      this.playRide(time + swingOffset * 0.8);
    }
    if (clapPat && clapPat[stepIndex]) {
      this.playClap(time + swingOffset * 0.8);
    }

    // Short chord stabs for rhythmic accents
    if (stabPat && stabPat[stepIndex]) {
      const chord = this.makeMinorChord(rootSemi);
      this.playStab(time + swingOffset * 0.5, chord);
    }

    // Drum fill every 4th bar (last beat 12..15)
    if ((this.barCounter % 4) === 3 && stepIndex >= 12) {
      this.playSnare(time + 0.0005);
    }

    // Bass: emphasize root and fifth alternating
    if ((stepIndex % 2) === 0) {
      const isStrong = (stepIndex % 4) === 0;
      const fifthSemi = rootSemi + 7;
      const noteSemi = isStrong ? rootSemi : fifthSemi;
      const freq = this.noteToFreq(this.baseFreq, noteSemi);
      this.playBass(time, freq, isStrong ? 0.22 : 0.18);
    }

    // Lead: energy controls rate/ornament
    const leadEvery = this.energy >= 2 ? 1 : 2; // 16ths vs 8ths
    if ((stepIndex % leadEvery) === 0) {
      const arp = this.leadArp || [0, 12, 7, 12];
      const idx = (stepIndex / leadEvery) % arp.length | 0;
      let semi = rootSemi + arp[idx];
      if (this.mode === 'boss' && this.bossProfile.motifSemis && (stepIndex % 8 === 0)) {
        semi += this.bossProfile.motifSemis[(bar + idx) % this.bossProfile.motifSemis.length];
      }
      const octave = (this.mode === 'boss' && this.bossIntensity > 0.65) ? 2.0 : 1.0;
      const freq = this.noteToFreq(this.baseFreq * 2 * octave, semi);
      const t = time + swingOffset * 0.6;
      this.playLead(t, freq);
      // Grace note to neighbor scale degree when energy high
      if (this.energy >= 3 && (stepIndex % 4) === 0) {
        const graceSemi = semi + (Math.random() < 0.5 ? -2 : 2);
        const gf = this.noteToFreq(this.baseFreq * 2, graceSemi);
        this.playLead(t + 0.06, gf, 0.08);
      }
    }

    // Toms: signature per-boss low percussion pulses
    if (this.mode === 'boss' && this.bossProfile.toms) {
      if (stepIndex === 0 || stepIndex === 8) this.playTom(time, 120);
      if (this.bossIntensity > 0.35 && (stepIndex === 4 || stepIndex === 12)) this.playTom(time, 160);
      if (this.bossIntensity > 0.75 && stepIndex === 14) this.playTom(time + 0.02, 180);
    }

    // Pads: sustained minor chord on bars 0 and 4, faded
    if (stepIndex === 0) {
      const chord = this.makeMinorChord(rootSemi);
      this.playPadChord(time, chord, 0.9);
    }
  }

  noteToFreq(rootFreq, semitoneOffset) {
    return rootFreq * Math.pow(2, semitoneOffset / 12);
  }

  playKick(time) {
    const a = this.ctx;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    osc.connect(g).connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  playSnare(time) {
    const a = this.ctx;
    const bufferSize = 0.08 * a.sampleRate | 0;
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // short noise burst
    }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.6, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    noise.connect(bp).connect(g).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.1);
  }

  playClap(time) {
    const a = this.ctx;
    const bufferSize = 0.06 * a.sampleRate | 0;
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.5, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    noise.connect(bp).connect(g).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.13);
  }

  playHat(time) {
    const a = this.ctx;
    const bufferSize = 0.03 * a.sampleRate | 0;
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = this.hatCutoffHz || 6000;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.4, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    noise.connect(hp).connect(g).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  playRide(time) {
    const a = this.ctx;
    const bufferSize = 0.2 * a.sampleRate | 0;
    const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
    const noise = a.createBufferSource();
    noise.buffer = buffer;
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.25, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    noise.connect(hp).connect(g).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.31);
  }

  playBass(time, freq, length = 0.2) {
    const a = this.ctx;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    // quick clickless attack/decay
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.28, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + length);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    osc.connect(lp).connect(g).connect(this.busses.bass);
    osc.start(time);
    osc.stop(time + Math.min(0.28, length + 0.06));
  }

  playLead(time, freq, length = 0.14) {
    const a = this.ctx;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'square';
    // Subtle vibrato for chiptune feel
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 5.5; // Hz
    lfoGain.gain.value = 6; // semitone cents approx via frequency detune
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(g).connect(this.busses.lead);
    lfo.start(time);
    lfo.stop(time + length + 0.02);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }

  makeMinorChord(rootSemi) {
    return [rootSemi, rootSemi + 3, rootSemi + 7];
  }

  playStab(time, semis, length = 0.25) {
    const a = this.ctx;
    for (const s of semis) {
      const freq = this.noteToFreq(this.baseFreq, s);
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.3, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + length);
      osc.connect(g).connect(this.busses.pad);
      osc.start(time);
      osc.stop(time + length + 0.02);
    }
  }

  playPadChord(time, semis, length = 1.2) {
    const a = this.ctx;
    for (const s of semis) {
      const freq = this.noteToFreq(this.baseFreq, s);
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.22 + this.bossIntensity * 0.1, time + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, time + length);
      const baseBright = (this.bossProfile?.padBrightnessHz || this.padBaseBrightnessHz || 2000);
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = baseBright + this.bossIntensity * 600;
      osc.connect(lp).connect(g).connect(this.busses.pad);
      osc.start(time);
      osc.stop(time + length + 0.05);
    }
  }

  playTom(time, baseFreq = 140) {
    const a = this.ctx;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(baseFreq, time);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, baseFreq * 0.5), time + 0.2);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.7, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    o.connect(g).connect(this.busses.drums);
    o.start(time);
    o.stop(time + 0.26);
  }
}


