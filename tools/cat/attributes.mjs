// Per-vertex attributes: skin weights, fur length/direction, material colour, ambient occlusion.
import { smoothstep, clamp, norm } from './vec.mjs';
import { HEAD, HO } from './anatomy.mjs';

export const MAT = {
  fur: { col: [0.0105, 0.0098, 0.0096], rough: 0.55 },
  nose: { col: [0.020, 0.0172, 0.0170], rough: 0.30 },
  lip: { col: [0.0085, 0.0078, 0.0076], rough: 0.36 },
  earIn: { col: [0.030, 0.0235, 0.0235], rough: 0.62 },
  skin: { col: [0.0115, 0.0106, 0.0102], rough: 0.40 },
  lid: { col: [0.0070, 0.0066, 0.0064], rough: 0.30 },
};

// Flatten primitives into weight carriers (chains expand to their parts).
export function weightCarriers(prims) {
  const out = [];
  for (const p of prims) {
    if (p.op === 'sub') continue;
    if (p.parts) for (const q of p.parts) out.push(Object.assign(q, { sigma: q.sigma ?? Math.max(0.0012, Math.min(0.006, (q.r1 ?? 0.004) * 0.45)) }));
    else out.push(Object.assign(p, { sigma: p.sigma ?? clamp(p.k * 0.38, 0.0011, 0.0085) }));
  }
  return out;
}

export function computeAttributes({ positions, normals, indices, prims, field, boneIndex, log = console.log }) {
  const n = positions.length / 3;
  const carriers = weightCarriers(prims);
  const subs = prims.filter((p) => p.op === 'sub');
  const K = 6;
  const wb = new Int16Array(n * K).fill(-1);
  const ww = new Float32Array(n * K);
  const fur = new Float32Array(n);
  const comb = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const flags = new Float32Array(n * 2); // [earInner, nail]
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const p = [x, y, z];
    let dmin = 1e9;
    const ds = [];
    for (const c of carriers) {
      const dx = x - c.bc[0], dy = y - c.bc[1], dz = z - c.bc[2];
      const rr = c.br + 0.03;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const d = c.d(x, y, z);
      ds.push([c, d]);
      if (d < dmin) dmin = d;
    }
    const acc = new Map();
    let wsum = 0, fsum = 0, cx = 0, cy = 0, cz = 0, r = 0, g = 0, b = 0, ro = 0;
    let earInner = 0, nail = 0;
    for (const [c, d] of ds) {
      const w = Math.exp(-Math.max(d - dmin, 0) / c.sigma);
      if (w < 1e-4) continue;
      acc.set(c.bone, (acc.get(c.bone) || 0) + w);
      wsum += w;
      fsum += w * (c.fur ?? 0);
      const cd = c.comb ? c.comb(p) : [0, -1, 0];
      cx += w * cd[0]; cy += w * cd[1]; cz += w * cd[2];
      let m = MAT[c.mat || 'fur'];
      if (c.earInner) {
        const di = c.earInner.d(x, y, z), dout = c.earOuter.d(x, y, z);
        if (Math.abs(di) < Math.abs(dout) + 0.0004) { m = MAT.earIn; earInner += w; }
      }
      if (c.nail) nail += w;
      r += w * m.col[0]; g += w * m.col[1]; b += w * m.col[2]; ro += w * m.rough;
    }
    // carving surfaces (eye sockets, nostrils, lip line) override material
    for (const s of subs) {
      const d = -s.d(x, y, z);
      const wsub = 1 - smoothstep(0.0, 0.0011, Math.abs(d));
      if (wsub > 0 && s.mat) {
        const m = MAT[s.mat];
        const k = wsub * 3;
        r = (r + k * m.col[0] * wsum) / (1 + k) ; g = (g + k * m.col[1] * wsum) / (1 + k); b = (b + k * m.col[2] * wsum) / (1 + k); ro = (ro + k * m.rough * wsum) / (1 + k);
        fsum *= 1 - wsub;
      }
    }
    // top-K bones
    const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
    sorted.forEach(([bn, w], i) => { wb[v * K + i] = boneIndex[bn]; ww[v * K + i] = w / wsum; });
    let f = fsum / wsum;
    // fur fades around the eyes, ear interiors are almost bare
    for (const s of [1, -1]) {
      const E = HEAD.eye(s);
      const de = Math.hypot(x - E[0], y - E[1], z - E[2]) - HEAD.eyeR;
      f *= smoothstep(0.0009, 0.0045, de);
    }
    earInner /= wsum;
    f *= 1 - 0.8 * earInner;
    fur[v] = f;
    // comb projected to tangent plane
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    let cl = Math.hypot(cx, cy, cz) || 1;
    cx /= cl; cy /= cl; cz /= cl;
    let dp = cx * nx + cy * ny + cz * nz;
    let tx = cx - dp * nx, ty = cy - dp * ny, tz = cz - dp * nz;
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 0.35) {
      // comb nearly parallel to the normal: blend towards "downwards along the surface"
      const fb = [0, -1, -0.3];
      const fd = fb[0] * nx + fb[1] * ny + fb[2] * nz;
      const ux = fb[0] - fd * nx, uy = fb[1] - fd * ny, uz = fb[2] - fd * nz;
      const ul = Math.hypot(ux, uy, uz) || 1;
      const k = 1 - tl / 0.35;
      tx = tx * (1 - k) + (ux / ul) * k * 0.6; ty = ty * (1 - k) + (uy / ul) * k * 0.6; tz = tz * (1 - k) + (uz / ul) * k * 0.6;
      tl = Math.hypot(tx, ty, tz);
    }
    let t = [tx / tl, ty / tl, tz / tl];
    comb.set(t, v * 3);
    col.set([r / wsum, g / wsum, b / wsum, ro / wsum], v * 4);
    flags[v * 2] = earInner; flags[v * 2 + 1] = nail / wsum;
  }
  log('  raw weights done');

  // adjacency
  const adj = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  // smooth weights (keeps sparsity at K)
  for (let it = 0; it < 3; it++) {
    const nwB = new Int16Array(n * K).fill(-1), nwW = new Float32Array(n * K);
    for (let v = 0; v < n; v++) {
      const m = new Map();
      const addW = (u, s) => { for (let i = 0; i < K; i++) { const bn = wb[u * K + i]; if (bn < 0) break; m.set(bn, (m.get(bn) || 0) + ww[u * K + i] * s); } };
      addW(v, 1);
      const nb = adj[v];
      const s = 1 / nb.size;
      for (const u of nb) addW(u, s);
      const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
      let tot = 0; for (const e of sorted) tot += e[1];
      sorted.forEach(([bn, w], i) => { nwB[v * K + i] = bn; nwW[v * K + i] = w / tot; });
    }
    wb.set(nwB); ww.set(nwW);
  }
  // smooth comb directions across neighbours (removes noisy flips)
  for (let it = 0; it < 4; it++) {
    const nc = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      let x = comb[v * 3] * 2, y = comb[v * 3 + 1] * 2, z = comb[v * 3 + 2] * 2;
      for (const u of adj[v]) { x += comb[u * 3]; y += comb[u * 3 + 1]; z += comb[u * 3 + 2]; }
      const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
      const d = x * nx + y * ny + z * nz;
      x -= d * nx; y -= d * ny; z -= d * nz;
      const l = Math.hypot(x, y, z) || 1;
      nc[v * 3] = x / l; nc[v * 3 + 1] = y / l; nc[v * 3 + 2] = z / l;
    }
    comb.set(nc);
  }
  // smooth fur length slightly
  for (let it = 0; it < 2; it++) {
    const nf = new Float32Array(n);
    for (let v = 0; v < n; v++) { let s = fur[v], c = 1; for (const u of adj[v]) { s += fur[u]; c++; } nf[v] = 0.5 * fur[v] + 0.5 * (s / c); }
    fur.set(nf);
  }
  log('  smoothed');

  // pack to 4 influences
  const skinIndex = new Uint8Array(n * 4), skinWeight = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    const ent = [];
    for (let i = 0; i < K; i++) if (wb[v * K + i] >= 0) ent.push([wb[v * K + i], ww[v * K + i]]);
    ent.sort((a, b) => b[1] - a[1]);
    const top = ent.slice(0, 4);
    let tot = top.reduce((s, e) => s + e[1], 0);
    let q = top.map((e) => Math.round((e[1] / tot) * 255));
    let diff = 255 - q.reduce((s, e) => s + e, 0);
    q[0] += diff;
    for (let i = 0; i < 4; i++) { skinIndex[v * 4 + i] = top[i] ? top[i][0] : 0; skinWeight[v * 4 + i] = top[i] ? q[i] : 0; }
  }

  // ambient occlusion from the distance field
  const ao = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    const subset = field.cull(x, y, z, 0.03);
    let occ = 0, sca = 1;
    for (let i = 1; i <= 6; i++) {
      const h = 0.0008 + 0.0042 * (i / 6) ** 1.5 * 3;
      const d = field.evalSubset(x + nx * h, y + ny * h, z + nz * h, subset);
      occ += Math.max(0, h - d) * sca;
      sca *= 0.75;
    }
    ao[v] = clamp(1 - 42 * occ, 0, 1);
  }
  for (let it = 0; it < 2; it++) {
    const na = new Float32Array(n);
    for (let v = 0; v < n; v++) { let s = ao[v], c = 1; for (const u of adj[v]) { s += ao[u]; c++; } na[v] = s / c; }
    ao.set(na);
  }
  log('  ao done');
  return { skinIndex, skinWeight, fur, comb, col, ao, flags, adj };
}
