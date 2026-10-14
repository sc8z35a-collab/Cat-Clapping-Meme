// Generates the human's right hand (pinch pose, holding a treat), forearm and knit sleeve,
// plus the treat itself: a niboshi (Japanese dried sardine). Output: assets/human/human.bin/json
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { sphere, ellipsoid, ellipsoidAlong, roundCone, roundBox, custom, chain } from './cat/sdf.mjs';
import { makeField } from './cat/field.mjs';
import { meshField, projectAndNormals, compact, largestComponents } from './cat/mesher.mjs';
import { add, sub, mul, norm, cross, dot, deg } from './cat/vec.mjs';

const log = (...a) => console.log(...a);
await MeshoptSimplifier.ready;

// ---------------------------------------------------------------- hand frame (right hand, palm down)
const F = [0, 0, 1];          // fingers
const T = [1, 0, 0];          // thumb side
const P = [0, -1, 0];         // palm normal (down)
const W = [0, 0, 0];
const S = 2.45;               // scale relative to the cat-hand anatomy tables
const H = (f, t, p) => add(add(add(W, mul(F, f * S)), mul(T, t * S)), mul(P, p * S));
const rotTowards = (dir, target, ang) => norm(add(mul(dir, Math.cos(ang)), mul(norm(target), Math.sin(ang))));

const FINGERS = [
  { name: 'index', f: 0.0400, t: 0.0116, spread: 6, seg: [0.0162, 0.0100, 0.0080], r: [0.0037, 0.0034, 0.0031, 0.0027], curl: [38, 42, 22] },
  { name: 'middle', f: 0.0420, t: 0.0039, spread: 1, seg: [0.0184, 0.0117, 0.0088], r: [0.0038, 0.0035, 0.0032, 0.0028], curl: [34, 48, 30] },
  { name: 'ring', f: 0.0405, t: -0.0039, spread: -4, seg: [0.0170, 0.0112, 0.0084], r: [0.0036, 0.0033, 0.0030, 0.0026], curl: [40, 55, 34] },
  { name: 'pinky', f: 0.0365, t: -0.0112, spread: -10, seg: [0.0134, 0.0078, 0.0072], r: [0.0032, 0.0029, 0.0027, 0.0023], curl: [46, 60, 36] },
];
const prims = [];
const add_ = (p, o) => { Object.assign(p, o); prims.push(p); return p; };
const skin = { mat: 'skin' };
const joints = {};
for (const fd of FINGERS) {
  let dir = norm(add(mul(F, Math.cos(deg(fd.spread))), mul(T, Math.sin(deg(fd.spread)))));
  let p = H(fd.f, fd.t, 0.0004);
  const pts = [p];
  for (let i = 0; i < 3; i++) {
    dir = rotTowards(dir, P, deg(fd.curl[i]));
    p = add(p, mul(dir, fd.seg[i] * S));
    pts.push(p);
  }
  joints[fd.name] = pts;
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push(Object.assign(roundCone(pts[i], pts[i + 1], fd.r[i] * S, fd.r[i + 1] * S), { ...skin, nail: i === 2 }));
  add_(chain(parts, 0.0015), { k: 0.008, ...skin });
}
// thumb: opposed, tip meeting the index fingertip (pinch)
{
  const idxTip = joints.index[3];
  const base = H(0.0085, 0.0078, 0.0032);
  const mid1 = add(base, mul(norm([0.55, -0.35, 0.75]), 0.0170 * S));
  const mid2 = add(mid1, mul(norm(sub(idxTip, mid1)), 0.0118 * S));
  const tip = add(idxTip, mul(norm(sub(mid2, idxTip)), 0.0035));
  const tr = [0.0050, 0.0045, 0.0041, 0.0034].map((r) => r * S);
  const pts = [base, mid1, mid2, tip];
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push(Object.assign(roundCone(pts[i], pts[i + 1], tr[i], tr[i + 1]), { ...skin, nail: i === 2 }));
  add_(chain(parts, 0.002), { k: 0.010, ...skin });
  joints.thumb = pts;
}
// palm: metacarpal fan + pads
const wristT = [0.0040, 0.0013, -0.0013, -0.0040];
FINGERS.forEach((fd, i) => add_(roundCone(H(0.006, wristT[i], 0.0008), joints[fd.name][0], 0.0052 * S, fd.r[0] * 1.08 * S), { k: 0.012, ...skin }));
add_(ellipsoidAlong(H(0.0145, 0.0082, 0.0040), add(add(mul(F, 0.62), mul(T, 0.48)), mul(P, 0.2)), [0.0068 * S, 0.0112 * S, 0.0054 * S], { up: P }), { k: 0.010, ...skin });
add_(ellipsoidAlong(H(0.0210, -0.0098, 0.0028), F, [0.0050 * S, 0.0125 * S, 0.0042 * S], { up: P }), { k: 0.010, ...skin });
// wrist + forearm
add_(roundCone(H(-0.012, 0, 0), H(0.007, 0, 0.0006), 0.0098 * S, 0.0088 * S), { k: 0.012, ...skin });
add_(roundCone(H(-0.012, 0, 0), [0, 0.006, -0.25], 0.0098 * S, 0.034), { k: 0.012, ...skin });
// knit sleeve (ribbed cuff), from 6 cm behind the wrist
const sleeveA = [0, 0.004, -0.060], sleeveB = [0, 0.010, -0.34];
const sleeve = custom([0, 0.007, -0.2], 0.2, (x, y, z) => {
  // capsule distance with ribbing on the radius
  const ba = sub(sleeveB, sleeveA);
  const pa = [x - sleeveA[0], y - sleeveA[1], z - sleeveA[2]];
  const h = Math.max(0, Math.min(1, dot(pa, ba) / dot(ba, ba)));
  const q = sub(pa, mul(ba, h));
  const ang = Math.atan2(q[1], q[0]);
  const cuff = h * Math.hypot(ba[0], ba[1], ba[2]) < 0.055;
  const rib = cuff ? 0.0011 * Math.cos(ang * 34) : 0.0004 * Math.cos(ang * 60 + h * 400);
  const fold = cuff ? 0 : 0.0025 * Math.sin(h * 40 + ang * 2) * Math.max(0, 1 - h * 3);
  return Math.hypot(q[0], q[1], q[2]) - (0.046 + h * 0.012 + rib + fold);
});
add_(sleeve, { k: 0.002, mat: 'sleeve' });

const field = makeField(prims);
const raw = meshField(field, { min: [-0.07, -0.10, -0.36], max: [0.11, 0.07, 0.22], voxel: 0.0009, block: 16, margin: 0.006, log });
let { positions, indices } = compact(raw.positions, largestComponents(raw.indices, raw.positions.length / 3, 1));
let normals = projectAndNormals(field, positions, { iterations: 3, eps: 0.0003, radius: 0.03 });
{
  const target = Math.floor((indices.length * 0.06) / 3) * 3;
  const [simp] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.0008, 0.0008, 0.0008], null, target, 0.00016, ['ErrorAbsolute']);
  const c = compact(positions, simp, [{ data: normals, size: 3 }]);
  positions = c.positions; indices = c.indices; normals = c.extra[0];
}
// per-vertex material: skin colour variation, nails, sleeve
const n = positions.length / 3;
const color = new Float32Array(n * 4);
for (let v = 0; v < n; v++) {
  const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
  const ds = sleeve.d(x, y, z);
  let col = [0.62, 0.36, 0.25, 0.52]; // linear skin + roughness
  // knuckles slightly redder, palm lighter
  if (normals[v * 3 + 1] < -0.4) col = [0.66, 0.40, 0.29, 0.55];
  // nails: dorsal side of distal phalanges
  for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const j = joints[name];
    const a = j[2], b = j[3];
    const ab = sub(b, a); const ap = sub([x, y, z], a);
    const h = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
    const d = Math.hypot(...sub(ap, mul(ab, h)));
    const dorsal = name === 'thumb' ? normals[v * 3] > 0.2 || normals[v * 3 + 1] > 0.3 : normals[v * 3 + 1] > 0.35;
    if (h > 0.35 && d < 0.012 && dorsal) col = [0.78, 0.55, 0.50, 0.28];
  }
  if (ds < 0.0015) col = [0.42, 0.40, 0.36, 0.92]; // oatmeal knit
  color.set(col, v * 4);
}
log(`hand: ${n} verts, ${indices.length / 3} tris`);

// ---------------------------------------------------------------- niboshi (dried sardine)
const fishPrims = [];
const spine = (u) => [0.0012 * Math.sin(u * Math.PI), 0.0016 * Math.sin(u * Math.PI * 1.3), u * 0.052];
const prof = (u) => 0.0018 + 0.0050 * Math.sin(Math.min(1, u * 1.25) * Math.PI) ** 0.7 * (1 - 0.65 * u);
for (let i = 0; i < 12; i++) {
  const u0 = i / 12, u1 = (i + 1) / 12;
  const a = spine(u0), b = spine(u1);
  const e = ellipsoidAlong(mul(add(a, b), 0.5), sub(b, a), [prof((u0 + u1) / 2) * 0.62, 0.0058, prof((u0 + u1) / 2)], { up: [1, 0, 0] });
  fishPrims.push(Object.assign(e, { k: 0.003 }));
}
const tail = spine(0.98);
fishPrims.push(Object.assign(roundBox(add(tail, [0, 0.0005, 0.004]), [0.0004, 0.0038, 0.0035], 0.0006), { k: 0.002 }));
fishPrims.push(Object.assign(sphere(add(spine(0.08), [0.0018, 0.0012, 0]), 0.0008), { k: 0.0008, op: 'sub' }));
fishPrims.push(Object.assign(sphere(add(spine(0.08), [-0.0018, 0.0012, 0]), 0.0008), { k: 0.0008, op: 'sub' }));
const ff = makeField(fishPrims);
const fr = meshField(ff, { min: [-0.01, -0.012, -0.008], max: [0.01, 0.012, 0.062], voxel: 0.00018, block: 16, margin: 0.001, log: () => {} });
let fish = compact(fr.positions, fr.indices);
let fishN = projectAndNormals(ff, fish.positions, { iterations: 2, eps: 0.00005, radius: 0.01 });
{
  const target = Math.floor((fish.indices.length * 0.15) / 3) * 3;
  const [simp] = MeshoptSimplifier.simplifyWithAttributes(fish.indices, fish.positions, 3, fishN, 3, [0.0005, 0.0005, 0.0005], null, target, 0.00002, ['ErrorAbsolute']);
  const c = compact(fish.positions, simp, [{ data: fishN, size: 3 }]);
  fish = { positions: c.positions, indices: c.indices }; fishN = c.extra[0];
}
const fn = fish.positions.length / 3;
const fishCol = new Float32Array(fn * 4);
for (let v = 0; v < fn; v++) {
  const y = fish.positions[v * 3 + 1], z = fish.positions[v * 3 + 2];
  const back = Math.max(0, Math.min(1, (y - 0.0005) / 0.004));
  const eye = Math.hypot(Math.abs(fish.positions[v * 3]) - 0.0018, y - 0.0012, z - 0.0042) < 0.0011;
  const c = eye ? [0.02, 0.02, 0.02, 0.2] : [0.55 - 0.35 * back, 0.55 - 0.32 * back, 0.50 - 0.22 * back, 0.35];
  fishCol.set(c, v * 4);
}
log(`niboshi: ${fn} verts, ${fish.indices.length / 3} tris`);

// ---------------------------------------------------------------- write
const chunks = []; let off = 0;
const put = (arr) => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const o = off; chunks.push(b); off += b.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } return o; };
const json = {
  hand: { vertexCount: n, indexCount: indices.length, position: put(positions), normal: put(normals), color: put(color), index: put(indices),
    pinch: mul(add(joints.index[3], joints.thumb[3]), 0.5) },
  fish: { vertexCount: fn, indexCount: fish.indices.length, position: put(fish.positions), normal: put(fishN), color: put(fishCol), index: put(fish.indices) },
};
fs.mkdirSync('assets/human', { recursive: true });
fs.writeFileSync('assets/human/human.bin', Buffer.concat(chunks));
fs.writeFileSync('assets/human/human.json', JSON.stringify(json));
log(`wrote assets/human (${(off / 1e6).toFixed(2)} MB), pinch point ${json.hand.pinch.map((v) => v.toFixed(4))}`);
