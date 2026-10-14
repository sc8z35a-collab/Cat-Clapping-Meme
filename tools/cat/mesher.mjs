// Sparse-block Surface Nets mesher with Newton projection onto the exact iso-surface.
// field.evalSubset(x,y,z,subset) -> signed distance; field.cull(cx,cy,cz,r) -> subset of primitives
export function meshField(field, { min, max, voxel, block = 16, margin = 0.004, log = console.log }) {
  const h = voxel;
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const B = block;
  const nbx = Math.ceil((nx - 1) / B), nby = Math.ceil((ny - 1) / B), nbz = Math.ceil((nz - 1) / B);
  const halfDiag = (B * h * Math.sqrt(3)) / 2;
  const S = B + 1;
  const blocks = new Map();
  let active = 0;
  const t0 = Date.now();
  for (let bk = 0; bk < nbz; bk++) for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const cx = min[0] + (bi * B + B / 2) * h, cy = min[1] + (bj * B + B / 2) * h, cz = min[2] + (bk * B + B / 2) * h;
    const subset = field.cull(cx, cy, cz, halfDiag + margin);
    if (subset.length === 0) continue;
    const dc = field.evalSubset(cx, cy, cz, subset);
    if (Math.abs(dc) > halfDiag + margin) continue;
    const vals = new Float32Array(S * S * S);
    for (let k = 0; k < S; k++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = min[0] + (bi * B + i) * h, y = min[1] + (bj * B + j) * h, z = min[2] + (bk * B + k) * h;
      vals[i + S * (j + S * k)] = field.evalSubset(x, y, z, subset);
    }
    blocks.set(bi + nbx * (bj + nby * bk), { bi, bj, bk, vals, subset });
    active++;
  }
  log(`  blocks: ${active} active of ${nbx * nby * nbz} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // Surface Nets vertices
  const cellKey = (i, j, k) => i + nx * (j + ny * k);
  const vmap = new Map();
  const pos = [];
  const cellCorner = [];
  const cubeEdges = [];
  for (let i = 0; i < 8; i++) for (let j = 1; j <= 4; j <<= 1) { const p = i ^ j; if (i <= p) cubeEdges.push(i, p); }
  const corner = new Float32Array(8);
  for (const blk of blocks.values()) {
    const { bi, bj, bk, vals } = blk;
    for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const ci = i + (c & 1), cj = j + ((c >> 1) & 1), ck = k + ((c >> 2) & 1);
        const v = vals[ci + S * (cj + S * ck)];
        corner[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < cubeEdges.length; e += 2) {
        const a = cubeEdges[e], b = cubeEdges[e + 1];
        const va = corner[a], vb = corner[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
        const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
      }
      const gi = bi * B + i, gj = bj * B + j, gk = bk * B + k;
      vmap.set(cellKey(gi, gj, gk), pos.length / 3);
      pos.push(min[0] + (gi + sx / n) * h, min[1] + (gj + sy / n) * h, min[2] + (gk + sz / n) * h);
      cellCorner.push(gi, gj, gk, corner[0] < 0 ? 1 : 0, (corner[0] < 0) !== (corner[1] < 0) ? 1 : 0,
        (corner[0] < 0) !== (corner[2] < 0) ? 1 : 0, (corner[0] < 0) !== (corner[4] < 0) ? 1 : 0);
    }
  }
  const nv = pos.length / 3;
  log(`  vertices: ${nv}`);

  // Faces
  const tris = [];
  const P = (id) => [pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let v = 0; v < nv; v++) {
    const gi = cellCorner[v * 7], gj = cellCorner[v * 7 + 1], gk = cellCorner[v * 7 + 2];
    const inside0 = cellCorner[v * 7 + 3] === 1;
    for (let axis = 0; axis < 3; axis++) {
      if (!cellCorner[v * 7 + 4 + axis]) continue;
      // the edge along `axis` from the cell's min corner is shared by 4 cells
      const u = (axis + 1) % 3, w = (axis + 2) % 3;
      const off = (ax, du, dw) => { const o = [gi, gj, gk]; o[u] -= du; o[w] -= dw; return o; };
      const c1 = off(axis, 1, 0), c2 = off(axis, 1, 1), c3 = off(axis, 0, 1);
      const a = v, b = vmap.get(cellKey(...c1)), c = vmap.get(cellKey(...c2)), d = vmap.get(cellKey(...c3));
      if (b === undefined || c === undefined || d === undefined) continue;
      // quad a-b-c-d ; orientation depends on which side is inside
      let q = inside0 ? [a, b, c, d] : [a, d, c, b];
      // split along shorter diagonal
      if (d2(P(q[0]), P(q[2])) <= d2(P(q[1]), P(q[3]))) tris.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else tris.push(q[0], q[1], q[3], q[1], q[2], q[3]);
    }
  }
  log(`  triangles: ${tris.length / 3}`);
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) };
}

// Project vertices onto the zero set and compute gradient normals.
export function projectAndNormals(field, positions, { iterations = 3, eps = 0.0002, radius = 0.01 } = {}) {
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const subset = field.cull(x, y, z, radius);
    const f = (a, b, c) => field.evalSubset(a, b, c, subset);
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it <= iterations; it++) {
      const d = f(x, y, z);
      gx = (f(x + eps, y, z) - f(x - eps, y, z)) / (2 * eps);
      gy = (f(x, y + eps, z) - f(x, y - eps, z)) / (2 * eps);
      gz = (f(x, y, z + eps) - f(x, y, z - eps)) / (2 * eps);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (it === iterations || g2 < 1e-8) break;
      const step = Math.max(-0.0015, Math.min(0.0015, d / g2));
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    normals[v * 3] = gx / gl; normals[v * 3 + 1] = gy / gl; normals[v * 3 + 2] = gz / gl;
  }
  return normals;
}

// Remove unreferenced vertices and remap indices; returns mapping old->new.
export function compact(positions, indices, extra = []) {
  const n = positions.length / 3;
  const remap = new Int32Array(n).fill(-1);
  let count = 0;
  for (const i of indices) if (remap[i] < 0) remap[i] = count++;
  const P = new Float32Array(count * 3);
  for (let i = 0; i < n; i++) if (remap[i] >= 0) P.set(positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  const I = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) I[i] = remap[indices[i]];
  const E = extra.map(({ data, size }) => {
    const out = new Float32Array(count * size);
    for (let i = 0; i < n; i++) if (remap[i] >= 0) out.set(data.subarray(i * size, i * size + size), remap[i] * size);
    return out;
  });
  return { positions: P, indices: I, extra: E, remap };
}

// Keep only the largest connected component (removes floating specks).
export function largestComponents(indices, nVerts, keep = 1) {
  const parent = new Int32Array(nVerts);
  for (let i = 0; i < nVerts; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]), c = find(indices[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const size = new Map();
  for (let t = 0; t < indices.length; t += 3) { const r = find(indices[t]); size.set(r, (size.get(r) || 0) + 1); }
  const roots = [...size.entries()].sort((a, b) => b[1] - a[1]).slice(0, keep).map((e) => e[0]);
  const keepSet = new Set(roots);
  const out = [];
  for (let t = 0; t < indices.length; t += 3) if (keepSet.has(find(indices[t]))) out.push(indices[t], indices[t + 1], indices[t + 2]);
  return new Uint32Array(out);
}
