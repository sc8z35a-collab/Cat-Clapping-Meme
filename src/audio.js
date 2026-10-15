// Procedural sound design (WebAudio): claps, the bite/chew crunches, soft room tone.
// The same event list is used by tools/render-video.mjs to synthesise the video's audio track.
export function soundEvents(T) {
  const ev = [];
  T.claps.forEach((t, i) => ev.push({ t, type: 'clap', gain: 0.95 - i * 0.03, seed: i }));
  ev.push({ t: T.bite, type: 'bite', gain: 0.5, seed: 11 });
  for (let i = 0; i < 6; i++) ev.push({ t: 2.42 + i * 0.18, type: 'chew', gain: 0.32, seed: 20 + i });
  ev.push({ t: T.shakeStart + 0.05, type: 'whoosh', gain: 0.18, seed: 40 });
  return ev;
}

function rng(seed) { let s = (seed * 7919 + 1) % 2147483647; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Renders one event into a Float32Array (mono) — shared by realtime and offline paths.
export function renderEvent(type, sr, seed = 0) {
  const r = rng(seed + 3);
  if (type === 'clap') {
    // a hand clap: several micro-impacts (palm air pocket) + band-passed noise body
    const n = Math.floor(sr * 0.24);
    const out = new Float32Array(n);
    const taps = [0, 0.0045 + r() * 0.002, 0.009 + r() * 0.003];
    let lp = 0, bp1 = 0, bp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 0;
      for (const tt of taps) if (t >= tt) env += Math.exp(-(t - tt) * 210) * (tt === 0 ? 1 : 0.55);
      env += Math.exp(-t * 32) * 0.12; // short room-ish tail
      const w = r() * 2 - 1;
      // simple resonant band-pass around 1.1–1.6 kHz
      const f = 2 * Math.sin(Math.PI * (1250 + seed * 37) / sr);
      bp1 += f * (w - bp1 - 0.35 * bp2); bp2 += f * bp1;
      lp += 0.5 * (w - lp);
      out[i] = (bp2 * 1.6 + lp * 0.35) * env;
    }
    return out;
  }
  if (type === 'bite' || type === 'chew') {
    const n = Math.floor(sr * (type === 'bite' ? 0.12 : 0.09));
    const out = new Float32Array(n);
    let hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // crunchy: sparse crackles
      const crack = r() < 0.06 ? (r() * 2 - 1) : 0;
      const w = (r() * 2 - 1) * 0.3 + crack * 1.4;
      hp = 0.82 * (hp + w - prev); prev = w;
      out[i] = hp * Math.exp(-t * (type === 'bite' ? 40 : 55));
    }
    return out;
  }
  if (type === 'whoosh') {
    const n = Math.floor(sr * 0.35);
    const out = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += 0.08 * ((r() * 2 - 1) - lp);
      out[i] = lp * Math.sin(Math.PI * t / 0.35) ** 2;
    }
    return out;
  }
  return new Float32Array(1);
}

// Small synthetic room impulse response (warm living room)
export function roomImpulse(sr, seconds = 0.55) {
  const n = Math.floor(sr * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  const r = rng(99);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 9.5) * (t < 0.004 ? t / 0.004 : 1);
    L[i] = (r() * 2 - 1) * env;
    R[i] = (r() * 2 - 1) * env;
  }
  // early reflections
  for (const [d, g] of [[0.011, 0.5], [0.017, 0.35], [0.023, 0.3], [0.031, 0.22]]) { const k = Math.floor(d * sr); L[k] += g; R[k + 7] += g * 0.9; }
  return [L, R];
}

export class Sound {
  constructor() { this.ctx = null; this.enabled = true; this.buffers = {}; this.lastT = -1; }
  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const sr = this.ctx.sampleRate;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    const conv = this.ctx.createConvolver();
    const [L, R] = roomImpulse(sr);
    const ir = this.ctx.createBuffer(2, L.length, sr);
    ir.copyToChannel(L, 0); ir.copyToChannel(R, 1);
    conv.buffer = ir;
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.22;
    conv.connect(this.wet); this.wet.connect(this.master);
    this.reverb = conv;
    // room tone
    const tone = this.ctx.createBuffer(1, sr * 2, sr);
    const d = tone.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += 0.02 * ((Math.random() * 2 - 1) - lp); d[i] = lp * 0.35; }
    const src = this.ctx.createBufferSource(); src.buffer = tone; src.loop = true;
    const tg = this.ctx.createGain(); tg.gain.value = 0.05; src.connect(tg); tg.connect(this.master); src.start();
  }
  resume() { this.ctx?.resume?.(); }
  play(ev, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const key = ev.type + ev.seed;
    if (!this.buffers[key]) {
      const data = renderEvent(ev.type, this.ctx.sampleRate, ev.seed);
      const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.copyToChannel(data, 0);
      this.buffers[key] = b;
    }
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[key];
    const g = this.ctx.createGain(); g.gain.value = ev.gain;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = ev.type === 'clap' ? -0.03 : 0.0; s.connect(g); g.connect(pan); pan.connect(this.master); pan.connect(this.reverb); }
    else { s.connect(g); g.connect(this.master); g.connect(this.reverb); }
    s.start(this.ctx.currentTime + when);
  }
  // fire events crossed between lastT and t (handles loops and scrubbing)
  update(t, events, rate = 1) {
    if (this.lastT < 0 || t < this.lastT || t - this.lastT > 0.5) { this.lastT = t; return; }
    for (const ev of events) if (ev.t > this.lastT && ev.t <= t) this.play(ev);
    this.lastT = t;
  }
}

// Offline mix for video export in the browser: the same events, panning, room reverb and room tone as
// tools/render-audio.mjs, rendered with OfflineAudioContext (native FFT convolution). Returns an AudioBuffer.
export async function renderSoundtrack(T, { sampleRate = 48000, duration = T.end, fadeIn = 0.3, fadeOut = 0.4 } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return null;
  const n = Math.ceil(duration * sampleRate);
  const ctx = new OAC(2, n, sampleRate);
  const bus = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.normalize = false;
  const [L, R] = roomImpulse(sampleRate);
  const ir = ctx.createBuffer(2, L.length, sampleRate);
  ir.copyToChannel(L, 0); ir.copyToChannel(R, 1);
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  bus.connect(ctx.destination);
  conv.connect(wet); wet.connect(ctx.destination);
  for (const ev of soundEvents(T)) {
    if (ev.t >= duration) continue;
    const data = renderEvent(ev.type, sampleRate, ev.seed);
    const b = ctx.createBuffer(1, data.length, sampleRate);
    b.copyToChannel(data, 0);
    const src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain(); g.gain.value = ev.gain;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = ev.type === 'clap' ? -0.06 : 0; src.connect(g); g.connect(pan); pan.connect(bus); pan.connect(conv); }
    else { src.connect(g); g.connect(bus); g.connect(conv); }
    src.start(ev.t);
  }
  // soft room tone (brownish noise with a slow drift)
  const tone = ctx.createBuffer(2, n, sampleRate);
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = tone.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += 0.02 * (rnd() - lp); d[i] = lp * 0.35 * 0.05 * (1 + 0.15 * Math.sin(i / sampleRate * 0.7)); }
  }
  const toneSrc = ctx.createBufferSource(); toneSrc.buffer = tone; toneSrc.connect(ctx.destination); toneSrc.start(0);
  const out = await ctx.startRendering();
  // fades (matching the video) + peak normalisation to -1 dBFS
  let peak = 0;
  const chans = [out.getChannelData(0), out.getChannelData(1)];
  for (const d of chans) for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    d[i] *= Math.min(1, t / fadeIn, Math.max(0, (duration - t) / fadeOut));
    peak = Math.max(peak, Math.abs(d[i]));
  }
  const k = peak > 0 ? 0.89 / peak : 1;
  for (const d of chans) for (let i = 0; i < n; i++) d[i] *= k;
  return out;
}
