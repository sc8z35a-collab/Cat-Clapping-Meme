// Anatomical description of the "Black Cat Clapping" character in its bind pose.
// Units: metres. +Y up, the cat faces +Z (towards the viewer), the cat's left side is +X.
import { sphere, ellipsoid, ellipsoidAlong, roundCone, custom, chain } from './sdf.mjs';
import { add, sub, mul, norm, cross, deg, rotXYZ } from './vec.mjs';

// Head origin (centre of the cranium). All head landmarks are expressed relative to it.
export const HO = [0, 0.3790, 0.0100];
export const HS = 1.08; // head scale (all head features scale about HO)
export const hp = (x, y, z) => [HO[0] + x * HS, HO[1] + y * HS, HO[2] + z * HS];
const hp0 = (x, y, z) => [HO[0] + x, HO[1] + y, HO[2] + z];
// wrap a primitive so it is uniformly scaled about HO
function scaleHead(p) {
  const d0 = p.d.bind(p);
  p.d = (x, y, z) => HS * d0(HO[0] + (x - HO[0]) / HS, HO[1] + (y - HO[1]) / HS, HO[2] + (z - HO[2]) / HS);
  p.bc = [HO[0] + (p.bc[0] - HO[0]) * HS, HO[1] + (p.bc[1] - HO[1]) * HS, HO[2] + (p.bc[2] - HO[2]) * HS];
  p.br *= HS;
  if (p.k) p.k *= HS;
  if (p.comb) { const c0 = p.comb; p.comb = (q) => c0([HO[0] + (q[0] - HO[0]) / HS, HO[1] + (q[1] - HO[1]) / HS, HO[2] + (q[2] - HO[2]) / HS]); }
  for (const key of ['earInner', 'earOuter']) if (p[key] && !p[key].__scaled) { scaleHead(p[key]); p[key].__scaled = true; }
  return p;
}

// ---------------------------------------------------------------- skeleton
export function buildSkeleton() {
  const B = [];
  const bone = (name, parent, pos, extra = {}) => { B.push({ name, parent, pos, ...extra }); return pos; };
  bone('root', null, [0, 0, 0]);
  bone('pelvis', 'root', [0, 0.112, -0.046]);
  bone('spine1', 'pelvis', [0, 0.160, -0.040]);
  bone('spine2', 'spine1', [0, 0.210, -0.030]);
  bone('chest', 'spine2', [0, 0.258, -0.018]);
  bone('neck', 'chest', [0, 0.300, -0.010]);
  bone('head', 'neck', hp(0, -0.0335, -0.0090));
  bone('jaw', 'head', hp(0, -0.0170, 0.0050));
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    bone('ear' + S, 'head', hp(0.0250 * s, 0.0270, -0.0040));
    bone('clav' + S, 'chest', [0.020 * s, 0.288, -0.014]);
    bone('upperArm' + S, 'clav' + S, [0.041 * s, 0.279, 0.008]);
    bone('foreArm' + S, 'upperArm' + S, [0.072 * s, 0.212, 0.088]);
    bone('hand' + S, 'foreArm' + S, [0.062 * s, 0.182, 0.180]);
    bone('thigh' + S, 'pelvis', [0.032 * s, 0.108, -0.044]);
    bone('shin' + S, 'thigh' + S, [0.043 * s, 0.080, 0.032]);
    bone('foot' + S, 'shin' + S, [0.038 * s, 0.0165, -0.050]);
    bone('toes' + S, 'foot' + S, [0.037 * s, 0.0125, 0.020]);
  }
  TAIL.forEach((p, i) => bone('tail' + i, i === 0 ? 'pelvis' : 'tail' + (i - 1), p));
  return B;
}

export const TAIL = [
  [0, 0.098, -0.092], [0, 0.079, -0.116], [0, 0.058, -0.140], [0, 0.039, -0.165],
  [0, 0.026, -0.195], [0, 0.0175, -0.228], [0, 0.0140, -0.262], [0, 0.0125, -0.296],
];
export const TAIL_TIP = [0, 0.0115, -0.326];
export const TAIL_R = [0.0128, 0.0120, 0.0112, 0.0104, 0.0096, 0.0088, 0.0080, 0.0071, 0.0056];

// ---------------------------------------------------------------- hands
export const HAND_S = 1.16; // human-like hands, a bit larger than life on the cat (as in the clip)
export function handFrame(s) {
  const W = [0.062 * s, 0.182, 0.180];
  const F = norm([0, 0.10, 1]);
  const T = norm([0, 1, -0.10]);
  const P = [-s, 0, 0]; // palm normal (medial)
  const H = (f, t, p) => add(add(add(W, mul(F, f * HAND_S)), mul(T, t * HAND_S)), mul(P, p * HAND_S));
  return { W, F, T, P, H };
}
export const FINGERS = [
  { name: 'index', f: 0.0400, t: 0.0116, spread: 5, seg: [0.0162, 0.0100, 0.0080], r: [0.0041, 0.0038, 0.0035, 0.0031] },
  { name: 'middle', f: 0.0420, t: 0.0039, spread: 0.5, seg: [0.0184, 0.0117, 0.0088], r: [0.0042, 0.0039, 0.0036, 0.0032] },
  { name: 'ring', f: 0.0405, t: -0.0039, spread: -4, seg: [0.0170, 0.0112, 0.0084], r: [0.0040, 0.0037, 0.0034, 0.0030] },
  { name: 'pinky', f: 0.0365, t: -0.0112, spread: -10, seg: [0.0134, 0.0078, 0.0072], r: [0.0035, 0.0032, 0.0030, 0.0026] },
];
const CURL = [deg(6), deg(10), deg(8)];

export function fingerJoints(s) {
  const { F, T, P, H } = handFrame(s);
  const out = {};
  for (const fd of FINGERS) {
    let dir = norm(add(mul(F, Math.cos(deg(fd.spread))), mul(T, Math.sin(deg(fd.spread)))));
    let p = H(fd.f, fd.t, 0.0004);
    const pts = [p];
    for (let i = 0; i < 3; i++) {
      const bent = norm(add(mul(dir, Math.cos(CURL[i])), mul(P, Math.sin(CURL[i]))));
      p = add(p, mul(bent, fd.seg[i] * HAND_S));
      dir = bent;
      pts.push(p);
    }
    out[fd.name] = pts; // [mcp, pip, dip, tip]
  }
  let tdir = norm(add(add(mul(F, 0.80), mul(T, 0.42)), mul(P, 0.42)));
  const tseg = [0.0170, 0.0126, 0.0100].map((v) => v * HAND_S);
  let tp = H(0.0080, 0.0078, 0.0032);
  const tpts = [tp];
  for (let i = 0; i < 3; i++) {
    const bent = i === 0 ? tdir : norm(add(mul(tdir, Math.cos(deg(9))), mul(P, Math.sin(deg(9)))));
    tp = add(tp, mul(bent, tseg[i]));
    tdir = bent;
    tpts.push(tp);
  }
  out.thumb = tpts;
  return out;
}

export function addHandBones(B) {
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const J = fingerJoints(s);
    for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const pts = J[name];
      for (let i = 0; i < 3; i++) B.push({ name: `${name}${i}${S}`, parent: i === 0 ? 'hand' + S : `${name}${i - 1}${S}`, pos: pts[i], tip: i === 2 ? pts[3] : undefined });
    }
  }
}

// ---------------------------------------------------------------- head landmarks
export const HEAD0 = {
  eye: (s) => hp0(0.0172 * s, 0.0060, 0.0300),
  nose: hp0(0, -0.0060, 0.0560),
};
export const EYE_S = 1.10;
export const HEAD = {
  eyeR: 0.0105 * HS * EYE_S,
  eye: (s) => hp(0.0172 * s, 0.0060, 0.0300),
  eyeDir: (s) => norm([0.20 * s, 0.03, 1]),
  nose: hp(0, -0.0060, 0.0560),
  noseTip: hp(0, -0.0055, 0.0602),
  mouthHalfW: 0.0182,
};

const smoothstepJS = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ---------------------------------------------------------------- primitives
const DOWN_BACK = () => norm([0, -1, -0.35]);
export function buildPrimitives() {
  const P = [];
  const add_ = (p, o) => { Object.assign(p, o); P.push(p); return p; };
  const headStart = P.length;
  const nosePt = hp0(0, -0.0080, 0.0650);
  // facial fur radiates from the nose within the face plane, then flows back over the skull
  const awayFromNose = (p) => {
    const d = sub(p, nosePt);
    const r = Math.hypot(d[0], d[1]);
    const back = smoothstepJS(0.0, 0.05, -d[2]);
    return norm([d[0] / (r + 1e-4), (d[1] + 0.006) / (r + 1e-4) * 0.9 + back * 0.6, -0.35 - back]);
  };
  const awayFromNoseDown = (p) => { const d = awayFromNose(p); return norm([d[0] * 1.2, d[1] - 0.9, d[2] - 0.3]); };

  // ---- torso
  // pear-shaped when upright: narrow ribcage, round belly ("primordial pouch"), wide haunches
  add_(ellipsoid([0, 0.110, -0.046], [0.060, 0.050, 0.058]), { bone: 'pelvis', k: 0.024, fur: 0.0072, comb: DOWN_BACK });
  add_(ellipsoid([0, 0.158, -0.026], [0.059, 0.052, 0.061]), { bone: 'spine1', k: 0.026, fur: 0.0072, comb: DOWN_BACK });
  add_(ellipsoid([0, 0.132, 0.012], [0.050, 0.044, 0.040]), { bone: 'spine1', k: 0.030, fur: 0.0078, comb: DOWN_BACK });
  add_(ellipsoid([0, 0.208, -0.022], [0.052, 0.050, 0.056]), { bone: 'spine2', k: 0.026, fur: 0.0068, comb: DOWN_BACK });
  add_(ellipsoid([0, 0.255, -0.010], [0.047, 0.058, 0.053]), { bone: 'chest', k: 0.026, fur: 0.0066, comb: DOWN_BACK });
  // chest ruff (longer fur) and the thick nape
  add_(ellipsoid([0, 0.262, 0.022], [0.040, 0.050, 0.032]), { bone: 'chest', k: 0.018, fur: 0.0105, comb: () => norm([0, -1, 0.15]) });
  add_(roundCone([0, 0.288, -0.010], [0, 0.340, 0.002], 0.0470, 0.0410), { bone: 'neck', k: 0.024, fur: 0.0100, comb: () => norm([0, -1, -0.1]) });
  add_(ellipsoid([0, 0.320, -0.030], [0.036, 0.030, 0.030]), { bone: 'neck', k: 0.020, fur: 0.0095, comb: () => norm([0, -0.6, -1]) });

  // ---- head (relative to HO)
  add_(ellipsoid(hp0(0, 0, -0.003), [0.0350, 0.0310, 0.0352]), { bone: 'head', k: 0.012, fur: 0.0036, comb: awayFromNose });
  add_(ellipsoid(hp0(0, 0.0095, 0.0170), [0.0285, 0.0195, 0.0215]), { bone: 'head', k: 0.010, fur: 0.0028, comb: awayFromNose });
  for (const s of [1, -1]) {
    add_(ellipsoid(hp0(0.0228 * s, -0.0080, 0.0170), [0.0212, 0.0182, 0.0210]), { bone: 'head', k: 0.013, fur: 0.0056, comb: awayFromNoseDown });
    add_(ellipsoid(hp0(0.0270 * s, -0.0140, 0.0030), [0.0150, 0.0150, 0.0170]), { bone: 'head', k: 0.012, fur: 0.0064, comb: awayFromNoseDown });
    add_(sphere(hp0(0.0090 * s, -0.0105, 0.0478), 0.0098), { bone: 'head', k: 0.0055, fur: 0.0021, comb: awayFromNose });
    add_(ellipsoid(hp0(0.0178 * s, 0.0150, 0.0300), [0.0108, 0.0050, 0.0080]), { bone: 'head', k: 0.006, fur: 0.0024, comb: awayFromNose });
  }
  add_(ellipsoid(hp0(0, -0.0085, 0.0385), [0.0180, 0.0130, 0.0142]), { bone: 'head', k: 0.008, fur: 0.0024, comb: awayFromNose });
  add_(roundCone(hp0(0, 0.0165, 0.0345), hp0(0, -0.0010, 0.0520), 0.0081, 0.0062), { bone: 'head', k: 0.009, fur: 0.0016, comb: () => norm([0, 0.55, -1]) });
  add_(ellipsoid(HEAD0.nose, [0.0064, 0.0043, 0.0041]), { bone: 'head', k: 0.0026, fur: 0, mat: 'nose', comb: awayFromNose });
  // jaw / chin
  add_(ellipsoid(hp0(0, -0.0205, 0.0215), [0.0182, 0.0082, 0.0210]), { bone: 'jaw', k: 0.010, fur: 0.0032, comb: () => norm([0, -0.3, -1]) });
  add_(ellipsoid(hp0(0, -0.0240, 0.0392), [0.0092, 0.0058, 0.0084]), { bone: 'jaw', k: 0.006, fur: 0.0020, comb: () => norm([0, -1, -0.6]) });

  // ---- ears (hollow cones, open towards the front)
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const base = hp0(0.0252 * s, 0.0255, -0.0050);
    const tip = add(base, [0.0150 * s, 0.0395, -0.0080]);
    const open = norm([0.36 * s, -0.08, 0.93]);
    const outer = roundCone(base, tip, 0.0178, 0.0030);
    const inner = roundCone(add(add(base, mul(open, 0.0050)), [0, 0.0028, 0]), add(tip, mul(open, 0.0016)), 0.0156, 0.0016);
    const ear = custom(outer.bc, outer.br, (x, y, z) => {
      const a = outer.d(x, y, z), b = inner.d(x, y, z);
      const k = 0.0014, h = Math.max(k - Math.abs(-a - b), 0) / k;
      return Math.max(a, -b) + h * h * k * 0.25;
    });
    add_(ear, { bone: 'ear' + S, k: 0.0075, fur: 0.0019, earInner: inner, earOuter: outer, comb: () => norm(sub(tip, base)) });
  }

  for (let i = headStart; i < P.length; i++) scaleHead(P[i]);

  // ---- arms
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    add_(ellipsoid([0.026 * s, 0.284, -0.012], [0.019, 0.030, 0.028]), { bone: 'clav' + S, k: 0.018, sigma: 0.004, fur: 0.0058, comb: DOWN_BACK });
    const sh = [0.041 * s, 0.279, 0.008], el = [0.072 * s, 0.212, 0.088], wr = [0.062 * s, 0.182, 0.180];
    add_(roundCone(sh, el, 0.0198, 0.0146), { bone: 'upperArm' + S, k: 0.010, sigma: 0.0022, fur: 0.0050, comb: () => norm(sub(el, sh)) });
    add_(roundCone(el, sub(wr, mul(norm(sub(wr, el)), 0.002)), 0.0142, 0.0104), { bone: 'foreArm' + S, k: 0.004, sigma: 0.0022, fur: 0.0042, comb: () => norm(sub(wr, el)) });
    buildHand(s, add_);
  }

  // ---- legs
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const hip = [0.032 * s, 0.108, -0.044], knee = [0.043 * s, 0.080, 0.032], hock = [0.038 * s, 0.0165, -0.050], ball = [0.037 * s, 0.0125, 0.020];
    add_(ellipsoidAlong([0.040 * s, 0.092, -0.012], sub(knee, hip), [0.029, 0.054, 0.036], { up: [s, 0, 0] }), { bone: 'thigh' + S, k: 0.022, fur: 0.0072, comb: () => norm([0, -1, -0.5]) });
    add_(roundCone(knee, hock, 0.0128, 0.0088), { bone: 'shin' + S, k: 0.004, fur: 0.0048, comb: () => norm(sub(hock, knee)) });
    add_(sphere([0.038 * s, 0.0145, -0.0535], 0.0094), { bone: 'foot' + S, k: 0.007, fur: 0.0040, comb: () => norm([0, -0.3, 1]) });
    add_(roundCone(hock, ball, 0.0088, 0.0098), { bone: 'foot' + S, k: 0.007, fur: 0.0040, comb: () => norm(sub(ball, hock)) });
    add_(ellipsoid([0.037 * s, 0.0118, 0.028], [0.0138, 0.0108, 0.0170]), { bone: 'toes' + S, k: 0.006, fur: 0.0034, comb: () => [0, 0, 1] });
    const tx = [-0.0086, -0.0030, 0.0030, 0.0086], tz = [-0.0030, 0.0018, 0.0018, -0.0030];
    for (let i = 0; i < 4; i++) add_(sphere([0.037 * s + tx[i], 0.0102, 0.0412 + tz[i]], 0.0052), { bone: 'toes' + S, k: 0.0035, fur: 0.0030, comb: () => [0, 0, 1] });
  }

  // ---- tail (one smooth chain; parts keep per-bone attributes)
  const pts = [...TAIL, TAIL_TIP];
  const tparts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    tparts.push(Object.assign(roundCone(a, b, TAIL_R[i], TAIL_R[i + 1]), { bone: 'tail' + i, k: 0.004, fur: 0.0076, comb: () => norm(sub(b, a)) }));
  }
  add_(chain(tparts, 0.0010), { bone: 'tail0', k: 0.018, fur: 0.0076, comb: () => [0, 0, -1] });

  // ---- carving: eye sockets (almond), nostrils, lip line
  const carveStart = P.length;
  for (const s of [1, -1]) {
    add_(ellipsoid(HEAD0.eye(s), [0.0114 * EYE_S, 0.0098 * EYE_S, 0.0112 * EYE_S], { m: rotXYZ(0, 0, -11 * s) }), { op: 'sub', bone: 'head', k: 0.0018, mat: 'lid' });
    add_(sphere(hp0(0.0029 * s, -0.0072, 0.0602), 0.00115), { op: 'sub', bone: 'head', k: 0.0007, mat: 'nose' });
  }
  // Cat lip line: philtrum + two curved strokes (shallow groove)
  const groove = [];
  groove.push(roundCone(hp0(0, -0.0098, 0.0590), hp0(0, -0.0150, 0.0560), 0.0005, 0.0006));
  for (const s of [1, -1]) {
    groove.push(roundCone(hp0(0, -0.0150, 0.0560), hp0(0.0060 * s, -0.0162, 0.0545), 0.0006, 0.0006));
    groove.push(roundCone(hp0(0.0060 * s, -0.0162, 0.0545), hp0(0.0130 * s, -0.0150, 0.0470), 0.0006, 0.0004));
  }
  for (const g of groove) add_(g, { op: 'sub', bone: 'head', k: 0.0012, mat: 'lip' });
  for (let i = carveStart; i < P.length; i++) scaleHead(P[i]);
  return P;
}

function buildHand(s, add_) {
  const S = s > 0 ? 'L' : 'R';
  const { F, T, P, H } = handFrame(s);
  const J = fingerJoints(s);
  const skin = { fur: 0, mat: 'skin', comb: () => F };
  // wrist
  add_(roundCone(H(-0.012, 0, 0), H(0.006, 0, 0.0006), 0.0100 * HAND_S, 0.0088 * HAND_S), { bone: 'hand' + S, k: 0.006, ...skin });
  // metacarpals fanning out to the knuckles -> organic palm
  const wristT = [0.0040, 0.0013, -0.0013, -0.0040];
  FINGERS.forEach((fd, i) => {
    const a = H(0.006, wristT[i], 0.0008);
    const b = J[fd.name][0];
    add_(roundCone(a, b, 0.0050 * HAND_S, fd.r[0] * 1.08 * HAND_S), { bone: 'hand' + S, k: 0.0060 * HAND_S, ...skin });
  });
  // palm pads
  add_(ellipsoidAlong(H(0.0145, 0.0082, 0.0040), add(add(mul(F, 0.62), mul(T, 0.48)), mul(P, 0.2)), [0.0066 * HAND_S, 0.0110 * HAND_S, 0.0052 * HAND_S], { up: P }), { bone: 'thumb0' + S, k: 0.0045, ...skin });
  add_(ellipsoidAlong(H(0.0210, -0.0098, 0.0028), F, [0.0050 * HAND_S, 0.0125 * HAND_S, 0.0042 * HAND_S], { up: P }), { bone: 'hand' + S, k: 0.0045, ...skin });
  add_(ellipsoidAlong(H(0.0362, 0.0004, 0.0030), T, [0.0040 * HAND_S, 0.0138 * HAND_S, 0.0036 * HAND_S], { up: P }), { bone: 'hand' + S, k: 0.0045, ...skin });
  for (const fd of FINGERS) {
    const pts = J[fd.name];
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push(Object.assign(roundCone(pts[i], pts[i + 1], fd.r[i] * HAND_S, fd.r[i + 1] * HAND_S), { bone: `${fd.name}${i}${S}`, ...skin, nail: i === 2 }));
    add_(chain(parts, 0.0007), { bone: `${fd.name}0${S}`, k: 0.0034, ...skin });
  }
  const tp = J.thumb;
  const tr = [0.0050, 0.0045, 0.0041, 0.0034].map((v) => v * HAND_S);
  const tparts = [];
  for (let i = 0; i < 3; i++) tparts.push(Object.assign(roundCone(tp[i], tp[i + 1], tr[i], tr[i + 1]), { bone: `thumb${i}${S}`, ...skin, nail: i === 2 }));
  add_(chain(tparts, 0.0008), { bone: `thumb0${S}`, k: 0.0045, ...skin });
}
