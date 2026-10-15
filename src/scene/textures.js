import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex(url, { srgb = false, repeat = [1, 1], anisotropy = 8, flipY = true } = {}) {
  const key = `${url}|${srgb}|${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.flipY = flipY;
  cache.set(key, t);
  return t;
}

export function loadAll() {
  // wait until every texture created through tex() has an image
  return Promise.all([...cache.values()].map((t) => new Promise((res) => {
    if (t.image) return res();
    const check = () => (t.image ? res() : setTimeout(check, 30));
    check();
  })));
}
