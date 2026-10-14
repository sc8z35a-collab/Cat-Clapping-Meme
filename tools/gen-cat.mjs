// Offline generator: SDF anatomy -> high-res mesh -> decimated skinned mesh with fur/morph attributes.
// Output: assets/cat/cat.bin + assets/cat/cat.json
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { buildSkeleton, addHandBones, buildPrimitives, HEAD, HO, hp } from './cat/anatomy.mjs';
import { makeField } from './cat/field.mjs';
import { meshField, projectAndNormals, compact, largestComponents } from './cat/mesher.mjs';
import { computeAttributes } from './cat/attributes.mjs';
import { GRIN, buildSurfaceTable, grinDisplacement, crescentDist, buildLips, buildTeeth } from './cat/face.mjs';
import { smoothstep, norm } from './cat/vec.mjs';

const args = process.argv.slice(2);
const VOXEL = Number(args.find((a) => a.startsWith('--voxel='))?.slice(8) || 0.00055);
const ERR = Number(args.find((a) => a.startsWith('--err='))?.slice(6) || 0.00005);
const PREVIEW = args.includes('--preview');
const FUR_TRIS = Number(args.find((a) => a.startsWith('--furtris='))?.slice(10) || 42000);
const log = (...a) => console.log(...a);
const T0 = Date.now();
const lap = (msg) => log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);

const bones = buildSkeleton();
addHandBones(bones);
const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
lap(`skeleton: ${bones.length} bones`);

const prims = buildPrimitives();
const field = makeField(prims);
lap(`primitives: ${prims.length}`);

// ---------------------------------------------------------------- mesh
const bbMin = [-0.125, -0.002, -0.345], bbMax = [0.125, 0.475, 0.205];
const raw = meshField(field, { min: bbMin, max: bbMax, voxel: VOXEL, log });
let { positions, indices } = compact(raw.positions, largestComponents(raw.indices, raw.positions.length / 3, 1));
lap(`surface nets: ${positions.length / 3} verts, ${indices.length / 3} tris`);
let normals = projectAndNormals(field, positions, { iterations: 3, eps: VOXEL * 0.3 });
lap('projected');
fixWinding(positions, normals, indices);

if (PREVIEW) {
  writePreview(positions, normals, indices);
  process.exit(0);
}

// ---------------------------------------------------------------- decimate
await MeshoptSimplifier.ready;
{
  const n = positions.length / 3;
  const lock = new Uint8Array(n);
  let locked = 0;
  for (let v = 0; v < n; v++) {
    const q = [positions[v * 3] - HO[0], positions[v * 3 + 1] - HO[1], positions[v * 3 + 2] - HO[2]];
    if (q[2] > 0.015 && q[1] < 0.004 && q[1] > -0.034 && Math.abs(q[0]) < 0.030 && crescentDist(q[0], q[1]) > -0.006) { lock[v] = 1; locked++; }
  }
  const target = Math.floor((indices.length * 0.02) / 3) * 3;
  const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.0006, 0.0006, 0.0006], lock, target, ERR, ['ErrorAbsolute']);
  lap(`decimated ${indices.length / 3} -> ${simp.length / 3} tris (err ${(err * 1000).toFixed(3)} mm, ${locked} locked)`);
  const c = compact(positions, simp, [{ data: normals, size: 3 }]);
  positions = c.positions; indices = c.indices; normals = c.extra[0];
}

// ---------------------------------------------------------------- attributes
const attr = computeAttributes({ positions, normals, indices, prims, field, boneIndex, log });
lap('attributes');

// ---------------------------------------------------------------- fur LOD index (shells use a lighter mesh)
let furIndex;
{
  const fi = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (attr.fur[a] > 0.00012 || attr.fur[b] > 0.00012 || attr.fur[c] > 0.00012) fi.push(a, b, c);
  }
  const full = new Uint32Array(fi);
  const target = Math.floor(Math.min(full.length, FUR_TRIS * 3) / 3) * 3;
  const [simp, err] = MeshoptSimplifier.simplify(full, positions, 3, target, 0.0005, ['ErrorAbsolute', 'LockBorder']);
  furIndex = simp;
  lap(`fur LOD: ${full.length / 3} -> ${simp.length / 3} tris (err ${(err * 1000).toFixed(3)} mm)`);
}

// ---------------------------------------------------------------- face: grin morph, lips, teeth
const surf = buildSurfaceTable(field);
lap('surface table');
const nV = positions.length / 3;
const grinPos = new Float32Array(nV * 3);
const mouthMask = new Float32Array(nV), mouthInner = new Float32Array(nV);
for (let v = 0; v < nV; v++) {
  const q = [positions[v * 3] - HO[0], positions[v * 3 + 1] - HO[1], positions[v * 3 + 2] - HO[2]];
  const nrm = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
  const d = grinDisplacement(q, nrm, surf);
  grinPos.set(d, v * 3);
  if (q[2] > 0.0 && Math.abs(q[0]) < 0.03 && q[1] < 0.006 && q[1] > -0.036) {
    const zs = surf.zs(q[0], q[1]);
    const front = smoothstep(-0.006, -0.0015, q[2] - zs) * (nrm[2] > -0.2 ? 1 : 0);
    const cd = crescentDist(q[0], q[1]);
    mouthMask[v] = smoothstep(-0.0036, -0.0013, cd) * front;
    mouthInner[v] = smoothstep(-0.0003, 0.0011, cd) * front;
  }
}
const grinNrm = morphNormalDelta(positions, normals, indices, grinPos);
lap('grin morph');
const lips = buildLips(surf);
lap(`lips: ${lips.positions.length / 3} verts`);
const teethU = buildTeeth(surf, 'upper', () => {}, MeshoptSimplifier);
const teethL = buildTeeth(surf, 'lower', () => {}, MeshoptSimplifier);
lap(`teeth: upper ${teethU.indices.length / 3} tris, lower ${teethL.indices.length / 3} tris`);

// ---------------------------------------------------------------- whiskers
const whiskers = buildWhiskers(field);

// ---------------------------------------------------------------- write
const chunks = [];
let offset = 0;
const put = (arr) => {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const o = offset;
  chunks.push(buf);
  offset += buf.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  return o;
};
const toI16 = (f, comps = 3) => {
  const n = f.length / comps;
  const o = new Int16Array(n * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < comps; c++) o[i * 4 + c] = Math.round(Math.max(-1, Math.min(1, f[i * comps + c])) * 32767);
  return o;
};
const toI8x4 = (f) => { const n = f.length / 3; const o = new Int8Array(n * 4); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(Math.max(-1, Math.min(1, f[i * 3 + c])) * 127); return o; };
const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const colU8 = new Uint8Array(nV * 4), parU8 = new Uint8Array(nV * 4);
for (let v = 0; v < nV; v++) {
  for (let c = 0; c < 3; c++) colU8[v * 4 + c] = Math.round(srgb(attr.col[v * 4 + c]) * 255);
  colU8[v * 4 + 3] = Math.round(attr.col[v * 4 + 3] * 255);
  parU8[v * 4] = Math.round(Math.min(1, attr.fur[v] / 0.0102) * 255);
  parU8[v * 4 + 1] = Math.round(attr.ao[v] * 255);
  parU8[v * 4 + 2] = Math.round(mouthMask[v] * 255);
  parU8[v * 4 + 3] = Math.round(mouthInner[v] * 255);
}
const extraU8 = new Uint8Array(nV * 4);
for (let v = 0; v < nV; v++) { extraU8[v * 4] = Math.round(attr.flags[v * 2] * 255); extraU8[v * 4 + 1] = Math.round(attr.flags[v * 2 + 1] * 255); }

const body = {
  vertexCount: nV, indexCount: indices.length,
  position: put(positions), normal: put(toI16(normals)), comb: put(toI8x4(attr.comb)),
  skinIndex: put(attr.skinIndex), skinWeight: put(attr.skinWeight), color: put(colU8), params: put(parU8), extra: put(extraU8),
  grinPosition: put(grinPos), grinNormal: put(grinNrm), index: put(indices),
  furIndex: put(furIndex), furIndexCount: furIndex.length,
  furScale: 0.0102,
};
const rigid = (m, bone) => ({ vertexCount: m.positions.length / 3, indexCount: m.indices.length, position: put(m.positions), normal: put(toI16(m.normals)), index: put(m.indices), bone });
const teeth = { upper: rigid(teethU, 'head'), lower: rigid(teethL, 'jaw') };
const lipsOut = {
  vertexCount: lips.positions.length / 3, indexCount: lips.indices.length, bone: 'head',
  position: put(lips.positions), openPosition: put(lips.openPositions), uv: put(lips.uvs), side: put(lips.side), index: put(lips.indices),
};
const json = {
  version: 1,
  generated: new Date().toISOString(),
  bones: bones.map((b) => ({ name: b.name, parent: b.parent, pos: b.pos, tip: b.tip })),
  body, teeth, lips: lipsOut,
  head: { origin: HO, eyeRadius: HEAD.eyeR, eyes: [1, -1].map((s) => ({ side: s, center: HEAD.eye(s), dir: HEAD.eyeDir(s) })), nose: HEAD.nose, grin: { W: GRIN.W, Y0: GRIN.Y0, S: GRIN.S } },
  whiskers,
};
fs.mkdirSync('assets/cat', { recursive: true });
const bin = Buffer.concat(chunks);
fs.writeFileSync('assets/cat/cat.bin', bin);
fs.writeFileSync('assets/cat/cat.json', JSON.stringify(json));
lap(`wrote assets/cat/cat.bin (${(bin.length / 1e6).toFixed(2)} MB), ${nV} verts, ${indices.length / 3} tris`);

// ================================================================= helpers
function fixWinding(P, N, I) {
  let agree = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]) > 0) agree++;
  }
  log(`  winding agreement ${(100 * agree / (I.length / 3)).toFixed(2)}%`);
  if (agree < I.length / 6) for (let t = 0; t < I.length; t += 3) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
}

function faceNormals(P, I) {
  const n = P.length / 3;
  const N = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  return N;
}

function morphNormalDelta(P, N, I, D) {
  const Pm = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) Pm[i] = P[i] + D[i];
  const a = faceNormals(P, I), b = faceNormals(Pm, I);
  const out = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    if (D[i] === 0 && D[i + 1] === 0 && D[i + 2] === 0) continue;
    const m = norm([N[i] + b[i] - a[i], N[i + 1] + b[i + 1] - a[i + 1], N[i + 2] + b[i + 2] - a[i + 2]]);
    out[i] = m[0] - N[i]; out[i + 1] = m[1] - N[i + 1]; out[i + 2] = m[2] - N[i + 2];
  }
  return out;
}

function surfacePoint(fieldRef, start, dir) {
  // march from start along dir until the surface
  let p = [...start];
  for (let i = 0; i < 300; i++) {
    const d = fieldRef.evalAll(p[0], p[1], p[2]);
    if (Math.abs(d) < 2e-6) break;
    p = [p[0] + dir[0] * d, p[1] + dir[1] * d, p[2] + dir[2] * d];
  }
  return p;
}

function buildWhiskers(fieldRef) {
  const W = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const s of [1, -1]) {
    const rows = [0.0034, 0.0010, -0.0016, -0.0042];
    rows.forEach((ry, r) => {
      const cols = r === 0 ? [0.0040, 0.0072] : r === 3 ? [0.0030, 0.0062] : [0.0028, 0.0058, 0.0088];
      cols.forEach((cx, c) => {
        const start = hp(s * (0.0060 + cx), -0.0100 + ry, 0.075);
        const root = surfacePoint(fieldRef, start, [0, 0, -1]);
        const len = 0.050 + 0.020 * (1 - r / 3) * (0.6 + 0.4 * c / 2) + 0.006 * rnd();
        const dir = norm([s * (1.0 + 0.1 * c), 0.16 - 0.13 * r + 0.04 * (rnd() - 0.5), 0.62 - 0.08 * c]);
        W.push({ root, dir, len, thick: 0.00034 + 0.00010 * (1 - r / 3), droop: 0.10 + 0.08 * r + 0.04 * rnd(), white: rnd() > 0.18 ? 1 : 0, side: s });
      });
    });
    // eyebrow whiskers
    for (let i = 0; i < 3; i++) {
      const start = hp(s * (0.0105 + 0.0045 * i), 0.0175 + 0.001 * i, 0.07);
      const root = surfacePoint(fieldRef, start, norm([0, -0.25, -1]));
      W.push({ root, dir: norm([s * (0.45 + 0.25 * i), 1.0, 0.55]), len: 0.030 + 0.006 * i, thick: 0.00024, droop: 0.06, white: 1, side: s });
    }
    // cheek (genal) whiskers
    for (let i = 0; i < 2; i++) {
      const start = hp(s * 0.06, -0.0080 - 0.004 * i, 0.010 + 0.004 * i);
      const root = surfacePoint(fieldRef, start, [-s, 0, 0]);
      W.push({ root, dir: norm([s * 1.0, 0.2, -0.25]), len: 0.032, thick: 0.00024, droop: 0.12, white: 1, side: s });
    }
  }
  return W;
}

function writePreview(P, N, I) {
  fs.mkdirSync('assets/cat', { recursive: true });
  const buf = Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), Buffer.from(I.buffer)]);
  fs.writeFileSync('assets/cat/preview.bin', buf);
  fs.writeFileSync('assets/cat/preview.json', JSON.stringify({ vertexCount: P.length / 3, indexCount: I.length }));
  lap(`wrote preview (${(buf.length / 1e6).toFixed(1)} MB)`);
}
