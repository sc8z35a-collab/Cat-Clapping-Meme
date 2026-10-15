// Combines primitives into one signed distance field (smooth unions, then smooth subtractions).
import { smin, smax } from './sdf.mjs';

export function makeField(prims) {
  const adds = prims.filter((p) => p.op !== 'sub');
  const subs = prims.filter((p) => p.op === 'sub');
  const all = [...adds, ...subs];
  for (const p of all) p.k = p.k ?? 0.004;
  // smooth unions are order dependent: a far primitive can still lower the running value when it
  // blends with another far one, and that shift propagates through later blends -> cull with 3x the
  // largest blend radius so neighbouring blocks always agree (otherwise the mesh cracks at block seams).
  const kMax = Math.max(...all.map((p) => p.k));
  function cull(cx, cy, cz, r) {
    const out = [];
    for (const p of all) {
      const dx = cx - p.bc[0], dy = cy - p.bc[1], dz = cz - p.bc[2];
      const rr = r + p.br + 3 * kMax;
      if (dx * dx + dy * dy + dz * dz <= rr * rr) out.push(p);
    }
    return out;
  }
  function evalSubset(x, y, z, subset) {
    let acc = 1e9;
    let i = 0;
    for (; i < subset.length; i++) {
      const p = subset[i];
      if (p.op === 'sub') break;
      acc = smin(acc, p.d(x, y, z), p.k);
    }
    for (; i < subset.length; i++) {
      const p = subset[i];
      acc = smax(acc, -p.d(x, y, z), p.k);
    }
    return acc;
  }
  const evalAll = (x, y, z) => evalSubset(x, y, z, all);
  return { cull, evalSubset, evalAll, adds, subs, all };
}
