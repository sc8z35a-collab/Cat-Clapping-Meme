// Tiny vector helpers used by the offline generator (plain arrays [x,y,z]).
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const deg = (d) => (d * Math.PI) / 180;

// Rotation matrix (row-major 3x3) from Euler XYZ degrees.
export function rotXYZ(rx = 0, ry = 0, rz = 0) {
  const [a, b, c] = [deg(rx), deg(ry), deg(rz)];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rz * Ry * Rx  (applied to column vectors)
  return [
    cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc,
    cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc,
    -sb, sa * cb, ca * cb,
  ];
}
// Build an orthonormal basis whose local +Y axis points along dir (used for oriented ellipsoids).
export function basisFromY(dir, upHint = [0, 0, 1]) {
  const y = norm(dir);
  let x = cross(y, upHint);
  if (len(x) < 1e-5) x = cross(y, [1, 0, 0]);
  x = norm(x);
  const z = cross(x, y);
  // rows are local axes expressed in world -> world->local transform is M * p
  return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
}
export function transpose3(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
export function mulMat3Vec(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
