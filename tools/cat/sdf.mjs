// Signed distance primitives & operators for the offline "SDF sculpting" generator.
// Every primitive exposes d(x,y,z) and a bounding sphere so evaluation can be culled spatially.
import { sub, len, mulMat3Vec, basisFromY, norm, cross, dot } from './vec.mjs';

const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

let _id = 0;
function prim(type, props) { return { id: _id++, type, ...props }; }

export function sphere(c, r, opt = {}) {
  return prim('sphere', {
    ...opt, c, r, bc: c, br: r,
    d(x, y, z) { return hypot3(x - c[0], y - c[1], z - c[2]) - r; },
  });
}

// Ellipsoid with optional orientation (rows of m = local axes in world space).
export function ellipsoid(c, rad, opt = {}) {
  const m = opt.m || null;
  const [rx, ry, rz] = rad;
  return prim('ellipsoid', {
    ...opt, c, rad, bc: c, br: Math.max(rx, ry, rz),
    d(x, y, z) {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (m) {
        const lx = m[0] * px + m[1] * py + m[2] * pz;
        const ly = m[3] * px + m[4] * py + m[5] * pz;
        const lz = m[6] * px + m[7] * py + m[8] * pz;
        px = lx; py = ly; pz = lz;
      }
      const k0 = hypot3(px / rx, py / ry, pz / rz);
      const k1 = hypot3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
      if (k1 < 1e-12) return -Math.min(rx, ry, rz);
      return (k0 * (k0 - 1)) / k1;
    },
  });
}

// Round cone (capsule with different radii) between a and b — exact SDF (Inigo Quilez).
export function roundCone(a, b, r1, r2, opt = {}) {
  const ba = sub(b, a);
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const L = Math.sqrt(l2);
  const bc = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return prim('roundCone', {
    ...opt, a, b, r1, r2, bc, br: L / 2 + Math.max(r1, r2),
    d(x, y, z) {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yy = pax * ba[0] + pay * ba[1] + paz * ba[2];
      const zz = yy - l2;
      const qx = pax * l2 - ba[0] * yy, qy = pay * l2 - ba[1] * yy, qz = paz * l2 - ba[2] * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  });
}

// Rounded box with orientation m (rows = local axes), half extents h, rounding r.
export function roundBox(c, h, r, opt = {}) {
  const m = opt.m || null;
  return prim('roundBox', {
    ...opt, c, h, r, bc: c, br: hypot3(h[0], h[1], h[2]) + r,
    d(x, y, z) {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (m) {
        const lx = m[0] * px + m[1] * py + m[2] * pz;
        const ly = m[3] * px + m[4] * py + m[5] * pz;
        const lz = m[6] * px + m[7] * py + m[8] * pz;
        px = lx; py = ly; pz = lz;
      }
      const qx = Math.abs(px) - h[0], qy = Math.abs(py) - h[1], qz = Math.abs(pz) - h[2];
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return hypot3(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
    },
  });
}

// Generic primitive from a custom distance function with explicit bounds.
export function custom(bc, br, fn, opt = {}) {
  return prim('custom', { ...opt, bc, br, d: fn });
}

// Ellipsoid oriented so local +Y follows dir.
export function ellipsoidAlong(c, dir, rad, opt = {}) {
  return ellipsoid(c, rad, { ...opt, m: basisFromY(dir, opt.up || [0, 0, 1]) });
}

export { norm, cross, dot, len, mulMat3Vec };

// Chain of primitives joined with a (nearly) hard union so joints don't bulge.
// The composite is used for the distance field, its parts keep their own bones for skin weights.
export function chain(parts, kInner = 0.0006, opt = {}) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of parts) { cx += p.bc[0]; cy += p.bc[1]; cz += p.bc[2]; }
  const c = [cx / parts.length, cy / parts.length, cz / parts.length];
  let br = 0;
  for (const p of parts) br = Math.max(br, Math.hypot(p.bc[0] - c[0], p.bc[1] - c[1], p.bc[2] - c[2]) + p.br);
  return prim('chain', {
    ...opt, bc: c, br, parts,
    d(x, y, z) {
      let acc = 1e9;
      for (const p of parts) acc = smin(acc, p.d(x, y, z), kInner);
      return acc;
    },
  });
}
