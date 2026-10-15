// Grin system: human smile (lips + teeth) for the cat face, plus head-mesh morph (mouth pocket + smile).
// Head-local coordinates = world - HO (bind pose has no head rotation).
import { HO, HS } from './anatomy.mjs';
import { roundBox, ellipsoid, sphere, custom } from './sdf.mjs';
import { makeField } from './field.mjs';
import { meshField, projectAndNormals, compact } from './mesher.mjs';
import { norm, cross, sub, add, mul, dot, smoothstep, clamp } from './vec.mjs';

export const GRIN = {
  W: 0.0186 * HS,
  Y0: -0.0154 * HS,
  S: HS,
  upper: (x) => { const u = Math.min(1, Math.abs(x) / GRIN.W); return GRIN.Y0 + HS * (0.0040 + 0.0020 * u * u); },
  lower: (x) => { const u = Math.min(1, Math.abs(x) / GRIN.W); return GRIN.Y0 + HS * (-0.0066 + 0.0126 * Math.pow(u, 2.3)); },
  bite: (x) => { const u = Math.min(1, Math.abs(x) / GRIN.W); return GRIN.Y0 + HS * (-0.0013 + 0.0062 * Math.pow(u, 2.2)); },
};

// Face surface height table z_s(x,y) (head-local), from ray casting the field along -z.
export function buildSurfaceTable(field) {
  const x0 = -0.030, x1 = 0.030, y0 = -0.032, y1 = 0.002, h = 0.00025;
  const nx = Math.round((x1 - x0) / h) + 1, ny = Math.round((y1 - y0) / h) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * h + HO[0], y = y0 + j * h + HO[1];
    let z = HO[2] + 0.09;
    for (let it = 0; it < 500; it++) {
      const d = field.evalAll(x, y, z);
      if (d < 2e-6) break;
      z -= Math.max(d * 0.9, 0.00003);
      if (z < HO[2] - 0.05) break;
    }
    v[i + nx * j] = z - HO[2];
  }
  const zs = (x, y) => {
    const fx = clamp((x - x0) / h, 0, nx - 1.001), fy = clamp((y - y0) / h, 0, ny - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const a = v[i + nx * j], b = v[i + 1 + nx * j], c = v[i + nx * (j + 1)], d = v[i + 1 + nx * (j + 1)];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  const normal = (x, y) => {
    const e = 0.0004;
    const dzdx = (zs(x + e, y) - zs(x - e, y)) / (2 * e);
    const dzdy = (zs(x, y + e) - zs(x, y - e)) / (2 * e);
    return norm([-dzdx, -dzdy, 1]);
  };
  return { zs, normal };
}

// Signed "inside crescent" measure in head-local x,y: >0 inside the open mouth, in metres (approx).
export function crescentDist(x, y) {
  const W = GRIN.W;
  const ax = Math.abs(x);
  const yu = GRIN.upper(x), yl = GRIN.lower(x);
  const dyIn = Math.min(yu - y, y - yl);
  const dxIn = W - ax;
  return Math.min(dyIn, dxIn * 0.6);
}

// Morph displacement for the head mesh when grinning.
// Returns [dx,dy,dz] in world space for a vertex at head-local position q with normal n.
export function grinDisplacement(qS, n, surf) {
  const out = [0, 0, 0];
  const r = grinDisplacement0([qS[0] / HS, qS[1] / HS, qS[2] / HS], n, surf, qS);
  return [r[0] * HS, r[1] * HS, r[2] * HS];
}
function grinDisplacement0(q, n, surf, qS) {
  const [x, y, z] = q;
  const out = [0, 0, 0];
  if (z < -0.005 || y > 0.012 || y < -0.040) return out;
  // 1) mouth pocket: push surface inwards inside the crescent (only front-facing skin of the muzzle)
  const cd = crescentDist(qS[0], qS[1]) / HS;
  const zsurf = surf.zs(qS[0], qS[1]) / HS;
  const nearFront = smoothstep(-0.006, -0.0015, z - zsurf); // only vertices close to the outer face surface
  if (cd > -0.0004 && nearFront > 0) {
    const t = smoothstep(-0.0004, 0.0012, cd);
    const depth = 0.0062 * t * nearFront;
    const fn = surf.normal(qS[0], qS[1]);
    out[0] -= fn[0] * depth * 0.6; out[1] -= fn[1] * depth * 0.2; out[2] -= depth;
  }
  // 2) smile: cheeks / whisker pads lifted, mouth corners pulled up and back, chin dropped
  const away = smoothstep(0.0005, 0.0045, -cd); // zero at the mouth, full a few mm away
  for (const s of [1, -1]) {
    const cx = 0.0135 * s, cy = -0.0060, cz = 0.044;
    const d2 = ((x - cx) / 0.016) ** 2 + ((y - cy) / 0.013) ** 2 + ((z - cz) / 0.02) ** 2;
    const w = Math.exp(-d2) * away;
    out[0] += 0.0010 * s * w; out[1] += 0.0022 * w; out[2] += 0.0004 * w;
    // lower eyelid / under-eye squint bulge
    const ex = 0.0172 * s, ey = -0.0035, ez = 0.036;
    const e2 = ((x - ex) / 0.008) ** 2 + ((y - ey) / 0.005) ** 2 + ((z - ez) / 0.01) ** 2;
    const we = Math.exp(-e2);
    out[1] += 0.0012 * we; out[2] += 0.0006 * we;
  }
  // chin follows the lower lip downwards
  {
    const d2 = (x / 0.016) ** 2 + ((y + 0.025) / 0.008) ** 2 + ((z - 0.03) / 0.02) ** 2;
    const w = Math.exp(-d2) * away;
    out[1] -= 0.0012 * w;
  }
  return out;
}

// ---------------------------------------------------------------- lips overlay mesh
export function buildLips(surf) {
  const W = GRIN.W, N = 96, M = 14;
  const pos = [], posOpen = [], uvs = [], idx = [], side = [];
  const lips = [
    { edge: GRIN.upper, dir: 1, r: 0.00105 * HS },
    { edge: GRIN.lower, dir: -1, r: 0.00135 * HS },
  ];
  for (const L of lips) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = -1 + (2 * i) / N; // -1..1
      const x = u * W;
      const taper = Math.pow(Math.max(0, 1 - Math.abs(u) ** 6), 0.5);
      const r = Math.max(0.00035 * HS, L.r * (0.35 + 0.65 * taper));
      for (const open of [false, true]) {
        const ye = open ? L.edge(x) : GRIN.bite(x);
        const ze = surf.zs(x, ye);
        const fn = surf.normal(x, ye);
        // in-surface direction pointing away from the opening
        const t = norm([1, (L.edge(x + 1e-4) - L.edge(x - 1e-4)) / 2e-4, 0]);
        let b = norm(cross(fn, t)); if (b[1] * L.dir < 0) b = mul(b, -1);
        const rr = open ? r : r * 0.35;
        const E = [x, ye, ze + 0.00015];
        const C = add(E, mul(b, rr));
        for (let j = 0; j <= M; j++) {
          const phi = (j / M) * Math.PI * 1.5;
          const p = add(C, add(mul(b, rr * Math.cos(phi)), mul(fn, rr * Math.sin(phi))));
          (open ? posOpen : pos).push(p[0] + HO[0], p[1] + HO[1], p[2] + HO[2]);
          if (!open) { uvs.push((u + 1) / 2, j / M); side.push(L.dir); }
        }
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = base + i * (M + 1) + j, b = base + (i + 1) * (M + 1) + j;
      if (L.dir > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { positions: new Float32Array(pos), openPositions: new Float32Array(posOpen), uvs: new Float32Array(uvs), side: new Float32Array(side), indices: new Uint32Array(idx) };
}

// ---------------------------------------------------------------- teeth
// widths (mm) from the centre outwards; heights of visible crown (mm)
const UPPER = [[3.9, 5.2, 2.5], [3.0, 4.5, 2.3], [3.45, 5.0, 3.0], [3.2, 4.2, 3.2], [3.0, 4.0, 3.2], [4.4, 3.6, 3.8]];
const LOWER = [[2.45, 4.6, 2.2], [2.65, 4.7, 2.3], [3.3, 5.0, 2.9], [3.3, 4.4, 3.1], [3.3, 4.2, 3.2], [4.6, 3.8, 3.8]];

function archPoint(surf, x, inset) {
  const y = GRIN.bite(x);
  const z = surf.zs(x, y);
  const fn = surf.normal(x, y);
  return { p: [x, y, z - inset], n: norm([fn[0], 0, fn[2]]) };
}

export function buildTeeth(surf, which, log = () => {}, simplifier = null) {
  const table = which === 'upper' ? UPPER : LOWER;
  const inset = (which === 'upper' ? 0.0015 : 0.0026) * HS;
  const prims = [];
  const info = [];
  // deterministic per-tooth irregularity (real teeth are never a perfect row of piano keys)
  let seed = which === 'upper' ? 0x9e3779b9 : 0x85ebca6b;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sdRoundBox = (px, py, pz, hx, hy, hz, r) => {
    const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
  };
  for (const s of [1, -1]) {
    let arc = 0.00008;
    for (let k = 0; k < table.length; k++) {
      const [wmm, hmm, tmm] = table[k];
      const w = wmm * 0.001 * HS, hgt = hmm * 0.001 * HS, thick = tmm * 0.001 * HS;
      // find x where arc length from centre equals arc + w/2 (march along the arch)
      const target = arc + w / 2;
      let x = 0, acc = 0, prev = archPoint(surf, 0, inset).p;
      while (acc < target && x < GRIN.W * 1.3) { x += 0.00005; const q = archPoint(surf, x * s, inset).p; acc += Math.hypot(q[0] - prev[0], q[2] - prev[2]); prev = q; }
      arc += w + 0.00016;
      const { p, n } = archPoint(surf, x * s, inset);
      const up = which === 'upper' ? 1 : -1;
      // small random tilt about the labial normal, vertical step and protrusion
      const tilt = (rnd() - 0.5) * (k < 2 ? 4.0 : 6.0) * Math.PI / 180;
      const dy = (rnd() - 0.5) * 0.00020 * HS, dz = (rnd() - 0.4) * 0.00022 * HS;
      const tdir0 = norm(cross([0, 1, 0], n));
      const tdir = norm(add(mul(tdir0, Math.cos(tilt)), mul([0, 1, 0], Math.sin(tilt))));
      const yax = norm(cross(n, tdir));
      // crown reaches from slightly past the bite line to just under the lip roll
      const edgeY = which === 'upper' ? GRIN.upper(p[0]) : GRIN.lower(p[0]);
      const reach = Math.abs(edgeY - p[1]) + 0.0014;
      const below = 0.00035 + (k === 2 ? 0.0002 : 0); // overbite overlap past the bite line
      const total = reach + below;
      const cy = p[1] + up * (reach - below) / 2 + dy;
      const c = [p[0] - n[0] * thick * 0.5 + n[0] * dz, cy, p[2] - n[2] * thick * 0.5 + n[2] * dz];
      const m = [tdir[0], tdir[1], tdir[2], yax[0], yax[1], yax[2], n[0], n[1], n[2]];
      const cw = [c[0] + HO[0], c[1] + HO[1], c[2] + HO[2]];
      const hx = w / 2 - 0.00085, hy = total / 2 - 0.0007, hz = thick / 2 - 0.0007;
      const taper = 0.16 + rnd() * 0.06; // crowns narrow towards the gum line
      const crown = custom(cw, Math.hypot(hx, hy, hz) + 0.001, (X, Y, Z) => {
        const dx = X - cw[0], dy_ = Y - cw[1], dz_ = Z - cw[2];
        const lx = m[0] * dx + m[1] * dy_ + m[2] * dz_, ly = m[3] * dx + m[4] * dy_ + m[5] * dz_, lz = m[6] * dx + m[7] * dy_ + m[8] * dz_;
        const tc = clamp((up * ly) / (hy + 0.0007) * 0.5 + 0.5, 0, 1); // 0 = incisal edge, 1 = cervical
        const sx = 1 - taper * tc * tc;
        return sdRoundBox(lx / sx, ly, lz, hx, hy, hz, 0.00068) * sx;
      });
      // labial bulge
      const bulge = ellipsoid([c[0] + n[0] * thick * 0.18 + HO[0], cy + HO[1], c[2] + n[2] * thick * 0.18 + HO[2]], [w * 0.40, total * 0.47, thick * 0.42], { m });
      const isCanine = k === 2;
      let tipPrim = null;
      if (isCanine) {
        const tipY = p[1] - up * (below + 0.0003);
        tipPrim = sphere([p[0] - n[0] * thick * 0.35 + HO[0], tipY + HO[1], p[2] - n[2] * thick * 0.35 + HO[2]], 0.0009);
      }
      const edgeJit = (rnd() - 0.5) * 0.00012;
      const tooth = custom(crown.bc, crown.br + 0.002, (X, Y, Z) => {
        let d = Math.min(crown.d(X, Y, Z), bulge.d(X, Y, Z) + 0.00005);
        if (tipPrim) {
          const t = tipPrim.d(X, Y, Z);
          const kk = 0.0016, hh = Math.max(kk - Math.abs(d - t), 0) / kk;
          d = Math.min(d, t) - hh * hh * kk * 0.25;
        }
        // flatten the incisal edge (slightly rounded, a little uneven from tooth to tooth)
        const edge = up * ((p[1] + HO[1] + dy) - Y) - below + edgeJit;
        const kk = 0.0004, hh = Math.max(kk - Math.abs(d - edge), 0) / kk;
        return Math.max(d, edge) + hh * hh * kk * 0.25;
      });
      prims.push(Object.assign(tooth, { k: 0 }));
      info.push({ x: p[0], y: p[1], z: p[2], w, h: hgt, k, c, tdir, rand: rnd() });
    }
  }
  const field = makeField(prims);
  const min = [HO[0] - 0.029, HO[1] - 0.040, HO[2] + 0.010], max = [HO[0] + 0.029, HO[1] + 0.003, HO[2] + 0.072];
  const raw = meshField(field, { min, max, voxel: 0.00011, block: 16, margin: 0.0006, log });
  let { positions, indices } = compact(raw.positions, raw.indices);
  let normals = projectAndNormals(field, positions, { iterations: 2, eps: 0.00003, radius: 0.004 });
  if (simplifier) {
    const target = Math.floor((indices.length * 0.05) / 3) * 3;
    const [simp] = simplifier.simplifyWithAttributes(indices, positions, 3, normals, 3, [0.0002, 0.0002, 0.0002], null, target, 0.000012, ['ErrorAbsolute']);
    const c = compact(positions, simp, [{ data: normals, size: 3 }]);
    positions = c.positions; indices = c.indices; normals = c.extra[0];
  }
  // per-vertex tooth data: (random tint, signed position across the tooth -1..1)
  const nv = positions.length / 3;
  const tdata = new Float32Array(nv * 2);
  for (let v = 0; v < nv; v++) {
    const q = [positions[v * 3] - HO[0], positions[v * 3 + 1] - HO[1], positions[v * 3 + 2] - HO[2]];
    let best = 0, bd = 1e9;
    for (let i = 0; i < info.length; i++) {
      const t = info[i];
      const d = Math.abs(dot(sub(q, t.c), t.tdir)) / (t.w / 2) + Math.abs(q[2] - t.c[2]) * 30;
      if (d < bd) { bd = d; best = i; }
    }
    const t = info[best];
    tdata[v * 2] = t.rand;
    tdata[v * 2 + 1] = clamp(dot(sub(q, t.c), t.tdir) / (t.w / 2), -1.2, 1.2);
  }
  return { positions, normals, indices, info, tdata };
}
