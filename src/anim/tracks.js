// Keyframe tracks with per-segment easing or Catmull-Rom splines (numbers or arrays).
export const ease = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  inBack: (t) => { const c1 = 1.2, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3.2)) + 1),
  hold: () => 0,
};

const lerp = (a, b, t) => a + (b - a) * t;
const isArr = Array.isArray;

function mixVal(a, b, t) {
  if (isArr(a)) return a.map((v, i) => lerp(v, b[i], t));
  return lerp(a, b, t);
}
function crVal(p0, p1, p2, p3, t, t0, t1, t2, t3) {
  // non-uniform Catmull-Rom (cardinal) via Hermite with finite-difference tangents
  const h = (x0, x1, x2, x3) => {
    const m1 = ((x2 - x0) / Math.max(1e-6, t2 - t0)) * (t2 - t1);
    const m2 = ((x3 - x1) / Math.max(1e-6, t3 - t1)) * (t2 - t1);
    const tt = t * t, ttt = tt * t;
    return (2 * ttt - 3 * tt + 1) * x1 + (ttt - 2 * tt + t) * m1 + (-2 * ttt + 3 * tt) * x2 + (ttt - tt) * m2;
  };
  if (isArr(p1)) return p1.map((_, i) => h(p0[i], p1[i], p2[i], p3[i]));
  return h(p0, p1, p2, p3);
}

export class Track {
  // keys: [[time, value, easing?], ...]; easing describes how the motion ARRIVES at that key
  // (it applies to the segment ending at the key). 'cr' = Catmull-Rom spline through the keys.
  constructor(keys, defaultEase = 'cr') {
    const sorted = keys.map(([t, v, e], i) => ({ t, v, e: e || defaultEase, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    // keep the last key written for identical times
    this.keys = sorted.filter((k, i) => i === sorted.length - 1 || Math.abs(sorted[i + 1].t - k.t) > 1e-6);
  }
  sample(t) {
    const K = this.keys;
    if (t <= K[0].t) return K[0].v;
    if (t >= K[K.length - 1].t) return K[K.length - 1].v;
    let i = 0;
    while (i < K.length - 2 && t >= K[i + 1].t) i++;
    const a = K[i], b = K[i + 1];
    const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    if (b.e === 'cr') {
      const p0 = K[Math.max(0, i - 1)], p3 = K[Math.min(K.length - 1, i + 2)];
      return crVal(p0.v, a.v, b.v, p3.v, u, p0.t === a.t ? a.t - 1 : p0.t, a.t, b.t, p3.t === b.t ? b.t + 1 : p3.t);
    }
    return mixVal(a.v, b.v, (ease[b.e] || ease.smooth)(u));
  }
}

export class Choreo {
  constructor(def) {
    this.duration = def.duration;
    this.tracks = {};
    for (const [k, keys] of Object.entries(def.tracks)) this.tracks[k] = new Track(keys, def.defaultEase?.[k]);
    this.events = def.events || [];
  }
  sample(t) {
    const out = {};
    for (const [k, tr] of Object.entries(this.tracks)) out[k] = tr.sample(t);
    return out;
  }
}

// deterministic smooth noise (for handheld camera, micro motion)
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 101.7) * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * 2 ** i, seed + i * 13); n += a; a *= 0.5; }
  return s / n;
}
