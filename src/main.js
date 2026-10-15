import * as THREE from 'three';
import { startPreview } from './dev/preview.js';
import { startRigTest } from './dev/rigtest.js';
import { startLookdev } from './dev/lookdev.js';
import { startSceneTest } from './dev/scenetest.js';
import { Sequence } from './app/sequence.js';
import { startPlayer } from './player.js';

const params = new URLSearchParams(location.search);
const offline = params.has('offline');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: offline });
renderer.setPixelRatio(offline ? 1 : Math.min(devicePixelRatio, 2));
// player: the canvas is sized by CSS (it fills #stage); offline/dev views size it explicitly
renderer.setSize(innerWidth, innerHeight, !!(offline || params.get('mode')));
if (offline || params.get('mode')) {
  document.body.appendChild(renderer.domElement);
  for (const id of ['start', 'ui', 'rotate', 'toast', 'exportPanel']) document.getElementById(id)?.remove();
}

const app = { ready: false };
window.__app = app;

async function main() {
  let view;
  if (params.get('mode') === 'preview') view = await startPreview(renderer, params);
  else if (params.get('mode') === 'rig') view = await startRigTest(renderer, params);
  else if (params.get('mode') === 'lookdev') view = await startLookdev(renderer, params);
  else if (params.get('mode') === 'scene') view = await startSceneTest(renderer, params);
  else if (!offline) {
    await startPlayer(renderer, params);
    app.ready = true;
    return;
  } else {
    const seq = await Sequence.create(renderer, {
      shells: Number(params.get('shells') || 40), post: params.get('post') !== '0', exposure: Number(params.get('exp') || 0.78),
      ao: params.get('ao') !== '0', dof: params.get('dof') !== '0', cam: params.get('cam') || 'pov',
      clay: params.get('clay') === '1', side: params.get('side') ? params.get('side').split(',').map(Number) : null,
      look: params.get('look') ? params.get('look').split(',').map(Number) : null, fov: Number(params.get('fov') || 0) || null,
      debug: Number(params.get('dbg') || 0),
      overrides: params.get('ov') ? Object.fromEntries(params.get('ov').split(';').map((kv) => { const [k, v] = kv.split(':'); return [k, v.includes(',') ? v.split(',').map(Number) : Number(v)]; })) : null,
    });
    app.seq = seq;
    // debug: override shared cat uniforms, e.g. ?u=strandStretch:1.5;furGravity:0.3
    if (params.get('u')) for (const kv of params.get('u').split(';')) { const [k, v] = kv.split(':'); const u = seq.world.cat.uniforms[k]; if (u) u.value = Number(v); }
    view = {
      render: (t) => seq.render(t ?? ((performance.now() / 1000) % seq.duration)),
      resize: (w, h) => seq.resize(w, h),
    };
  }
  app.renderAt = async (t) => {
    view.render(t);
    if (offline) { const gl = renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  };
  // HDR (BT.2100 HLG) frame for tools/render-video.mjs --hdr: I420P10 planes (Y, U, V; little-endian uint16) as base64
  app.hdrFrame = async (t, fade = 1) => {
    const post = app.seq.world.post;
    post.setHDR(true);
    post.hdrFinish.uniforms.fade.value = fade;
    view.render(t);
    const u8 = new Uint8Array(post.readHDRFrame().buffer);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); view.resize(innerWidth, innerHeight); });
  app.ready = true;
  if (!params.has('offline')) renderer.setAnimationLoop(() => view.render());
}
main().catch((e) => {
  console.error(e);
  const label = document.getElementById('playLabel');
  if (label) label.textContent = `読み込みに失敗しました（${e.message}）。ページを再読み込みしてください。`;
});
