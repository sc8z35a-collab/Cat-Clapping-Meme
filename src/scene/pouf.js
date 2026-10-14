// Dusty-pink teddy (curly sherpa) pouf, like the one in the meme video.
import * as THREE from 'three';
import { tex } from './textures.js';

export function createPouf({ radius = 0.215, height = 0.43, rTop = 0.075, rBot = 0.035 } = {}) {
  // profile (r, y) from bottom centre to top centre with rounded edges, arc-length parametrised
  const pts = [];
  const push = (r, y) => pts.push(new THREE.Vector2(r, y));
  const N = 40;
  push(0.0001, 0.0);
  for (let i = 0; i <= 8; i++) push((radius - rBot) * (i / 8), 0);
  for (let i = 1; i <= N / 2; i++) { const a = -Math.PI / 2 + (i / (N / 2)) * Math.PI / 2; push(radius - rBot + Math.cos(a) * rBot, rBot + Math.sin(a) * rBot); }
  for (let i = 1; i <= 24; i++) push(radius + 0.004 * Math.sin((i / 24) * Math.PI), rBot + (height - rTop - rBot) * (i / 24));
  for (let i = 1; i <= N; i++) { const a = (i / N) * Math.PI / 2; push(radius - rTop + Math.cos(a) * rTop, height - rTop + Math.sin(a) * rTop); }
  for (let i = 1; i <= 10; i++) push((radius - rTop) * (1 - i / 10) + 0.0001, height + 0.006 * Math.sin((1 - i / 10) * Math.PI) * 0.5);
  const geo = new THREE.LatheGeometry(pts, 220);
  // physical UVs: u around (circumference), v along profile arc length; one texture tile = 0.18 m
  const tile = 0.18;
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const uv = geo.getAttribute('uv');
  const segs = 220;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < pts.length; j++) {
    const k = i * pts.length + j;
    uv.setXY(k, ((i / segs) * 2 * Math.PI * Math.max(pts[j].x, 0.05)) / tile, arc[j] / tile);
  }
  geo.computeVertexNormals();
  const base = 'assets/ph/curly_teddy_natural/curly_teddy_natural_';
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.80, 0.56, 0.60),
    map: tex(base + 'diff_1k.jpg', { srgb: true }),
    normalMap: tex(base + 'nor_gl_1k.jpg'),
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughnessMap: tex(base + 'arm_1k.jpg'),
    aoMap: tex(base + 'arm_1k.jpg'),
    aoMapIntensity: 1.0,
    displacementMap: tex(base + 'disp_1k.jpg'),
    displacementScale: 0.009,
    displacementBias: -0.0045,
    roughness: 1.0,
    sheen: 1.0,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0.95, 0.72, 0.74),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'pouf';
  return mesh;
}
