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
}


