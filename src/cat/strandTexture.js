// Tileable 3D Worley texture: R = distance to nearest strand centre, G = per-strand random value.
import * as THREE from 'three';

export function createStrandTexture(size = 64, cellsPerAxis = 16, seed = 1337) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const C = cellsPerAxis;
  const pts = new Float32Array(C * C * C * 4);
  for (let i = 0; i < C * C * C; i++) { pts[i * 4] = rnd(); pts[i * 4 + 1] = rnd(); pts[i * 4 + 2] = rnd(); pts[i * 4 + 3] = rnd(); }
  const data = new Uint8Array(size * size * size * 2);
  const cs = size / C;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x + 0.5) / cs, fy = (y + 0.5) / cs, fz = (z + 0.5) / cs;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 1e9, bestR = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz;
      const wx = ((cx % C) + C) % C, wy = ((cy % C) + C) % C, wz = ((cz % C) + C) % C;
      const k = (wx + C * (wy + C * wz)) * 4;
      const px = cx + pts[k], py = cy + pts[k + 1], pz = cz + pts[k + 2];
      const d = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2;
      if (d < best) { best = d; bestR = pts[k + 3]; }
    }
    const o = (x + size * (y + size * z)) * 2;
    data[o] = Math.min(255, Math.round(Math.sqrt(best) * 255));
    data[o + 1] = Math.round(bestR * 255);
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
