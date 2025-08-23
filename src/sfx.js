// Lightweight SFX synthesizer using Web Audio API
// - Shares AudioContext with Music (via provider)
// - Optional FX send to a shared delay/reverb bus (via provider)
// - Layered one-shots with small randomization and stereo panning

export class SFX {
  constructor(options = {}) {
    this.getAudioContext = options.audioContextProvider || (() => new (window.AudioContext || window.webkitAudioContext)());
    this.getFxBus = options.fxBusProvider || null; // () => AudioNode
    this.ctx = null;
    this.master = null;
    this.fxSend = null; // gain node to shared FX bus
    this.pan = null; // default pan reused per call as fallback
    this.isMuted = false;
    this.volume = options.volume != null ? options.volume : 0.65;

    // Rate-limiters
    this._lastVocalAt = new Map(); // key: type -> time
    this._vocalInterval = { base: 2.5, jitter: 2.0 }; // seconds
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = this.getAudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.isMuted ? 0.0001 : this.volume;
      // default panner reused when no per-voice pan is provided
      this.pan = this.ctx.createStereoPanner();
      this.master.connect(this.ctx.destination);
      // optional shared FX send
      if (this.getFxBus) {
        this.fxSend = this.ctx.createGain();
        this.fxSend.gain.value = 0.18; // subtle tail by default
        try {
          const bus = this.getFxBus();
          if (bus && bus.connect) this.fxSend.connect(bus);
        } catch (_) {}
      }
    }
  }

  setMuted(m) {
    this.isMuted = !!m;
    if (this.master) {
      const a = this.ctx;
      const target = this.isMuted ? 0.0001 : this.volume;
      this.master.gain.setTargetAtTime(target, a?.currentTime || 0, 0.01);
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.isMuted && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
  }

  // Ambient weather loops (rain, wind, snow)
  _ensureWeatherLoops(){
    this.ensure();
    if (this._weatherLoops) return;
    const a = this.ctx;
    // base noise buffer reused for loops
    const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const makeLoop = (setup) => {
      const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
      let node = src;
      if (setup) node = setup(src);
      const g = a.createGain(); g.gain.value = 0;
      node.connect(g).connect(this.master);
      try { src.start(); } catch(_) {}
      return g;
    };
    this._weatherLoops = {
      rain: makeLoop((src) => {
        const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 0.8;
        src.connect(bp); return bp;
      }),
      wind: makeLoop((src) => {
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80;
        const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        src.connect(hp).connect(lp); return lp;
      }),
      snow: makeLoop((src) => {
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
        const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;
        src.connect(hp).connect(lp); return lp;
      }),
    };
  }

  setWeatherMix({ rain = 0, wind = 0, snow = 0 } = {}){
    this._ensureWeatherLoops();
    const t = this.ctx.currentTime;
    const clamp01 = (v)=> Math.max(0, Math.min(1, v));
    this._weatherLoops.rain.gain.setTargetAtTime(clamp01(rain) * 0.6, t, 0.5);
    this._weatherLoops.wind.gain.setTargetAtTime(clamp01(wind) * 0.5, t, 0.5);
    this._weatherLoops.snow.gain.setTargetAtTime(clamp01(snow) * 0.5, t, 0.5);
  }

  // Utility: make a gain with AR envelope
  _env({ a = 0.005, d = 0.12, g = 1.0, t0 }) {
    const aCtx = this.ctx;
    const gain = aCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    if (a > 0) gain.gain.linearRampToValueAtTime(g, t0 + a);
    else gain.gain.setValueAtTime(g, t0);
    const end = t0 + Math.max(0.01, d);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    return { node: gain, endTime: end };
  }

  // Utility: connect chain nodes safely
  _connect(nodes) {
    for (let i = 0; i < nodes.length - 1; i++) {
      if (nodes[i] && nodes[i + 1]) nodes[i].connect(nodes[i + 1]);
    }
  }

  // Soft clipper for warmer, less clicky transients
  _makeSoftClip(amount = 0.6) {
    const shaper = this.ctx.createWaveShaper();
    const k = Math.max(0.0001, amount) * 2.0;
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1; // -1..1
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    return shaper;
  }

  // Utility: small random helpers
  _rv(min, max) { return min + Math.random() * (max - min); }
  _pick(list) { return list[(Math.random() * list.length) | 0]; }

  // Optional pan per event (-1..1). If undefined, keep center with tiny random drift
  _makePan(pan) {
    const a = this.ctx;
    const p = this.ctx.createStereoPanner();
    const v = (typeof pan === 'number') ? Math.max(-1, Math.min(1, pan)) : (Math.random() * 0.3 - 0.15);
    p.pan.setValueAtTime(v, a.currentTime);
    return p;
  }

  // Optional FX send tap
  _tapFx(source, level = 0.15) {
    if (!this.fxSend) return;
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, level);
    source.connect(g).connect(this.fxSend);
  }

  // ==== Public one-shots ====

  // Generic weapon shot with per-weapon voicing
  shot(type = 'rifle', opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    const pan = this._makePan(opts.pan);

    // Mix node then soft-clip for warmth
    const mix = a.createGain(); mix.gain.value = 1.0;
    const clip = this._makeSoftClip(0.65);

    // Layer A: puff noise (lowpassed)
    const noiseDur = 0.05;
    const noiseBuf = a.createBuffer(1, Math.max(1, (noiseDur * a.sampleRate) | 0), a.sampleRate);
    const d0 = noiseBuf.getChannelData(0); for (let i = 0; i < d0.length; i++) d0[i] = Math.random() * 2 - 1;
    const n1 = a.createBufferSource(); n1.buffer = noiseBuf; n1.playbackRate.value = this._rv(0.96, 1.04);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = ({ pistol: 1200, smg: 1100, rifle: 1400, dmr: 1200, shotgun: 900 }[type] || 1200) * this._rv(0.95, 1.05);
    const envN = this._env({ a: 0.003, d: ({ pistol: 0.08, smg: 0.07, rifle: 0.1, dmr: 0.12, shotgun: 0.16 }[type] || 0.1), g: ({ pistol: 0.5, smg: 0.45, rifle: 0.55, dmr: 0.6, shotgun: 0.7 }[type] || 0.55), t0 });
    n1.connect(lp).connect(envN.node).connect(mix);

    // Layer B: tiny presence tick (quiet bandpass) to keep definition but avoid clicky pencil
    const n2 = a.createBufferSource(); n2.buffer = noiseBuf; n2.playbackRate.value = this._rv(0.98, 1.02);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = ({ pistol: 1600, smg: 1500, rifle: 1700, dmr: 1600, shotgun: 1300 }[type] || 1600);
    bp.Q.value = 0.7;
    const envT = this._env({ a: 0.002, d: 0.04, g: ({ pistol: 0.12, smg: 0.1, rifle: 0.14, dmr: 0.14, shotgun: 0.12 }[type] || 0.12), t0 });
    n2.connect(bp).connect(envT.node).connect(mix);

    // Layer C: body thump (sine drop)
    const body = a.createOscillator(); body.type = 'sine';
    const f0 = ({ pistol: 160, smg: 140, rifle: 160, dmr: 150, shotgun: 110 }[type] || 160) * this._rv(0.95, 1.05);
    body.frequency.setValueAtTime(f0, t0);
    body.frequency.exponentialRampToValueAtTime(Math.max(60, f0 * 0.55), t0 + ({ pistol: 0.1, smg: 0.09, rifle: 0.12, dmr: 0.14, shotgun: 0.22 }[type] || 0.12));
    const envB = this._env({ a: 0.004, d: ({ pistol: 0.14, smg: 0.1, rifle: 0.18, dmr: 0.22, shotgun: 0.3 }[type] || 0.18), g: ({ pistol: 0.5, smg: 0.42, rifle: 0.5, dmr: 0.55, shotgun: 0.68 }[type] || 0.5), t0 });
    body.connect(envB.node).connect(mix);

    // Tail send level
    const tailTap = a.createGain(); tailTap.gain.value = ({ pistol: 0.12, smg: 0.1, rifle: 0.14, dmr: 0.18, shotgun: 0.22 }[type] || 0.14);
    mix.connect(clip);
    clip.connect(pan).connect(this.master);
    // FX tap for space
    this._tapFx(mix, tailTap.gain.value);

    n1.start(t0); n1.stop(envN.endTime + 0.01);
    n2.start(t0); n2.stop(envT.endTime + 0.01);
    body.start(t0); body.stop(envB.endTime + 0.02);
  }

  saberSwing(opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    const pan = this._makePan(opts.pan);
    const vol = opts.volume != null ? opts.volume : 1;
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(280, t0);
    o.frequency.exponentialRampToValueAtTime(160, t0 + 0.25);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 1.8;
    const e = this._env({ a: 0.02, d: 0.25, g: 0.35 * vol, t0 });
    o.connect(bp).connect(e.node).connect(pan).connect(this.master);
    this._tapFx(e.node, 0.08);
    o.start(t0); o.stop(e.endTime + 0.02);
  }

  saberHit(opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    const pan = this._makePan(opts.pan);
    const vol = opts.volume != null ? opts.volume : 1;
    const nd = 0.04; const nb = a.createBuffer(1, (nd * a.sampleRate) | 0, a.sampleRate);
    const ch = nb.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const n = a.createBufferSource(); n.buffer = nb; n.playbackRate.value = this._rv(0.98, 1.02);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.9;
    const envN = this._env({ a: 0.001, d: 0.12, g: 0.6 * vol, t0 });
    n.connect(bp).connect(envN.node).connect(pan).connect(this.master);
    this._tapFx(envN.node, 0.12);
    const o = a.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(620, t0); o.frequency.exponentialRampToValueAtTime(200, t0 + 0.1);
    const envO = this._env({ a: 0.001, d: 0.08, g: 0.24 * vol, t0 });
    o.connect(envO.node).connect(pan).connect(this.master);
    this._tapFx(envO.node, 0.05);
    n.start(t0); n.stop(envN.endTime + 0.01);
    o.start(t0); o.stop(envO.endTime + 0.02);
  }

  saberCharge(){
    if (this.isMuted) return null; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t0);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t0);
    o.connect(g).connect(this.master); this._tapFx(g, 0.05);
    g.gain.linearRampToValueAtTime(0.25, t0 + 0.1);
    o.start(t0);
    return {
      stop: ()=>{
        const now = a.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.05);
        try { o.stop(now + 0.06); } catch(_) {}
      }
    };
  }

  reload() {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    const pan = this._makePan();
    // Two short clicks with tiny offset
    const click = (t, f) => {
      const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
      const e = this._env({ a: 0.001, d: 0.09, g: 0.25, t0: t });
      o.connect(e.node).connect(pan).connect(this.master);
      this._tapFx(e.node, 0.08);
      o.start(t); o.stop(e.endTime + 0.01);
    };
    click(t0, 720 * this._rv(0.95, 1.05));
    click(t0 + 0.09, 540 * this._rv(0.95, 1.05));
  }

  hurt() {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan();
    // Low mid thud + noise slap
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t0);
    const e = this._env({ a: 0.002, d: 0.18, g: 0.32, t0 });
    o.connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.12);
    const nd = 0.03; const nb = a.createBuffer(1, (nd * a.sampleRate) | 0, a.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const n = a.createBufferSource(); n.buffer = nb; const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const e2 = this._env({ a: 0.001, d: 0.08, g: 0.22, t0 }); n.connect(hp).connect(e2.node).connect(pan).connect(this.master);
    o.start(t0); o.stop(e.endTime + 0.01); n.start(t0); n.stop(e2.endTime + 0.01);
  }

  // Back-compat alias
  kill() { this.enemyDeath('generic'); }

  impactWorld(opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan(opts.pan);
    // softer puff on surfaces: lowpassed noise + very quiet dull ping
    const dur = 0.05; const nb = a.createBuffer(1, (dur * a.sampleRate) | 0, a.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const n = a.createBufferSource(); n.buffer = nb; const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1000;
    const e = this._env({ a: 0.002, d: 0.08, g: 0.36, t0 });
    n.connect(lp).connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.1);
    const ping = a.createOscillator(); ping.type = 'triangle'; ping.frequency.setValueAtTime(this._rv(800, 1200), t0);
    const e2 = this._env({ a: 0.001, d: 0.06, g: 0.06, t0 }); ping.connect(e2.node).connect(pan).connect(this.master);
    n.start(t0); n.stop(e.endTime + 0.01); ping.start(t0 + 0.002); ping.stop(e2.endTime + 0.01);
  }

  impactFlesh(opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan(opts.pan);
    // soft body thud: lowpassed noise + sine thump
    const dur = 0.06; const nb = a.createBuffer(1, (dur * a.sampleRate) | 0, a.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const n = a.createBufferSource(); n.buffer = nb; const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const e = this._env({ a: 0.001, d: 0.1, g: 0.42, t0 });
    n.connect(lp).connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.10);
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(80, t0 + 0.12);
    const e2 = this._env({ a: 0.002, d: 0.14, g: 0.28, t0 }); o.connect(e2.node).connect(pan).connect(this.master);
    n.start(t0); n.stop(e.endTime + 0.01); o.start(t0); o.stop(e2.endTime + 0.01);
  }

  // For player getting hit (keep name for back-compat with previous S.hit())
  hit() { this.impactFlesh({}); }

  enemyPain(type = 'grunt', opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan(opts.pan);
    // Noise-based grunt to avoid tonal piano feel
    const nd = 0.08; const nb = a.createBuffer(1, (nd * a.sampleRate) | 0, a.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = nb; src.playbackRate.value = this._rv(0.96, 1.04);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = ({ grunt: 320, rusher: 380, tank: 220, shooter: 340, flyer: 520, healer: 300, sniper: 260 }[type] || 320);
    bp.Q.value = 0.8;
    const e = this._env({ a: 0.004, d: ({ tank: 0.14, grunt: 0.12, shooter: 0.12, rusher: 0.12, sniper: 0.12, flyer: 0.1, healer: 0.12 }[type] || 0.12), g: ({ tank: 0.34, grunt: 0.3, shooter: 0.28, rusher: 0.28, sniper: 0.26, flyer: 0.22, healer: 0.26 }[type] || 0.28), t0 });
    src.connect(bp).connect(e.node).connect(pan).connect(this.master);
    this._tapFx(e.node, 0.05);
    src.start(t0); src.stop(e.endTime + 0.01);
  }

  enemyDeath(type = 'generic', opts = {}) {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan(opts.pan);
    // Use puffed noise body with very low tone component
    const ndur = 0.18; const nb = a.createBuffer(1, (ndur * a.sampleRate) | 0, a.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = nb; src.playbackRate.value = this._rv(0.95, 1.02);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const e = this._env({ a: 0.004, d: ({ tank: 0.7, grunt: 0.55, shooter: 0.5, rusher: 0.5, sniper: 0.45, flyer: 0.38, healer: 0.45 }[type] || 0.5), g: ({ tank: 0.6, grunt: 0.48, shooter: 0.46, rusher: 0.46, sniper: 0.4, flyer: 0.34, healer: 0.4 }[type] || 0.46), t0 });
    src.connect(lp).connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.22);
    // Sub layer for weight
    const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(({ tank: 90, grunt: 110, shooter: 100, rusher: 110, sniper: 100, flyer: 140, healer: 100 }[type] || 110), t0);
    const eSub = this._env({ a: 0.002, d: 0.28, g: 0.2, t0 }); o.connect(eSub.node).connect(pan).connect(this.master);
    src.start(t0); src.stop(e.endTime + 0.02); o.start(t0); o.stop(eSub.endTime + 0.02);
  }

  enemyVocal(type = 'grunt') {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const now = a.currentTime; const last = this._lastVocalAt.get(type) || -Infinity;
    const interval = this._vocalInterval.base + Math.random() * this._vocalInterval.jitter;
    if ((now - last) < interval) return;
    this._lastVocalAt.set(type, now);
    // Breath/rasp for melee; chirp for flyers; bark for shooter
    const pan = this._makePan(); const t0 = now + 0.001;
    const o = a.createOscillator();
    o.type = (type === 'flyer') ? 'triangle' : 'square';
    const base = ({ grunt: 200, rusher: 260, tank: 120, shooter: 240, flyer: 500, healer: 220, sniper: 200 }[type] || 220) * this._rv(0.95, 1.05);
    o.frequency.setValueAtTime(base, t0);
    const e = this._env({ a: 0.012, d: 0.2, g: 0.12, t0 });
    o.connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.08);
    o.start(t0); o.stop(e.endTime + 0.02);
  }

  // Optional UI cues
  ui(kind = 'pickup') {
    if (this.isMuted) return; this.ensure();
    const a = this.ctx; const t0 = a.currentTime + 0.001; const pan = this._makePan();
    if (kind === 'pickup') {
      const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(880, t0);
      const e = this._env({ a: 0.001, d: 0.08, g: 0.22, t0 });
      o.connect(e.node).connect(pan).connect(this.master); this._tapFx(e.node, 0.06);
      o.start(t0); o.stop(e.endTime + 0.01);
    }
  }

  // Subtle breathing loop for exhaustion; brown noise with smooth inhale/exhale and de-fizzed highs
  startBreath(){
    if (this.isMuted) return; this.ensure();
    if (this._breath && this._breath.active) return; // already running
    const a = this.ctx; const t0 = a.currentTime + 0.001;
    // Output (master fade)
    const out = a.createGain(); out.gain.value = 0.0; out.connect(this.master);
    // Brown(ish) noise buffer to avoid gritty hiss
    const dur = 2.0; const nb = a.createBuffer(1, Math.max(1, (dur * a.sampleRate)|0), a.sampleRate);
    const ch = nb.getChannelData(0);
    let last = 0; for(let i=0;i<ch.length;i++){ const white = Math.random()*2-1; last = (last + 0.02*white) / 1.02; ch[i] = last * 3.5; }
    const noise = a.createBufferSource(); noise.buffer = nb; noise.loop = true; noise.playbackRate.value = 1.0;
    // Tone shaping: remove rumble, keep soft mids, shave fizz
    const hp = a.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 80; hp.Q.value = 0.5;
    const lp = a.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6;
    const hs = a.createBiquadFilter(); hs.type='highshelf'; hs.frequency.value = 2500; hs.gain.value = -18;
    // Breath amplitude stage
    const amp = a.createGain(); amp.gain.value = 0.04; // very quiet base
    // LFO for inhale/exhale amplitude
    const lfo = a.createOscillator(); lfo.type='sine'; lfo.frequency.setValueAtTime(0.7, t0);
    const lfoGain = a.createGain(); lfoGain.gain.value = 0.03; // subtle depth
    lfo.connect(lfoGain).connect(amp.gain);
    // Chain
    noise.connect(hp).connect(lp).connect(hs).connect(amp).connect(out);
    // No FX tail to avoid shimmer artifacts
    // Fade in master
    out.gain.linearRampToValueAtTime(0.10, t0 + 0.35);
    // Control object
    this._breath = {
      active: true,
      stop: ()=>{
        const now = a.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        try { noise.stop(now + 0.26); } catch(_){ }
        try { lfo.stop(now + 0.26); } catch(_){ }
        this._breath.active = false;
      },
      setExhausted: (x)=>{
        const now = a.currentTime;
        const k = Math.max(0, Math.min(1, x||0));
        // Gently increase rate/depth/openess with exhaustion; keep conservative to avoid artifacts
        const rate = 0.6 + 0.6 * k; // 0.6..1.2 Hz
        const base = 0.02 + 0.06 * k; // 0.02..0.08
        const depth = 0.02 + 0.04 * k; // 0.02..0.06
        const cutoff = 800 + 300 * k; // 800..1100 Hz
        try { lfo.frequency.setTargetAtTime(rate, now, 0.2); } catch(_){ lfo.frequency.value = rate; }
        amp.gain.setTargetAtTime(base, now, 0.2);
        lfoGain.gain.setTargetAtTime(depth, now, 0.2);
        lp.frequency.setTargetAtTime(cutoff, now, 0.25);
        try { hs.gain.setTargetAtTime(-18, now, 0.2); } catch(_) { hs.gain.value = -18; }
      }
    };
    // start
    noise.start(t0); lfo.start(t0);
  }

  stopBreath(){
    if (!this._breath || !this._breath.active) return;
    this._breath.stop();
  }
}


