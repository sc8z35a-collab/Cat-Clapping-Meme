// Asset URL indirection.
// The published web page (a claude.ai artifact) only serves web media types, so its binary files
// (.bin geometry buffers, .hdr) ship next to the page as base64 text (`<path>.b64.txt`).
// When the page declares `window.ASSET_B64_MANIFEST`, they are decoded once into blob: URLs and
// every loader (three.js loaders through the default LoadingManager, plain fetch through assetURL)
// is pointed at them transparently. Without the manifest nothing changes.
import * as THREE from 'three';

const map = new Map();

export function assetURL(url) {
  return map.get(url) || url;
}

function decodeBase64(text) {
  const s = atob(text.replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function prepareAssets(onProgress = () => {}) {
  const manifestUrl = globalThis.ASSET_B64_MANIFEST;
  if (!manifestUrl) return;
  const list = await (await fetch(manifestUrl)).json(); // [{ path, bytes }]
  const total = list.reduce((a, e) => a + e.bytes, 0) || 1;
  let done = 0;
  await Promise.all(list.map(async (e) => {
    const res = await fetch(`${e.path}.b64.txt`);
    if (!res.ok) throw new Error(`asset ${e.path}: HTTP ${res.status}`);
    const bin = decodeBase64(await res.text());
    map.set(e.path, URL.createObjectURL(new Blob([bin])));
    done += e.bytes;
    onProgress(done / total);
  }));
  THREE.DefaultLoadingManager.setURLModifier((url) => assetURL(url));
}
