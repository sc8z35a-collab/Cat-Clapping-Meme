// Full-screen landscape player: start screen, playback, controls, quality, camera modes, sound.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sequence } from './app/sequence.js';
import { Sound, soundEvents } from './audio.js';

const QUALITY = {
  ultra: { label: 'ULTRA', dpr: () => Math.min(devicePixelRatio || 1, 2), shells: 48 },
  max: { label: 'MAX', dpr: () => Math.min(devicePixelRatio || 1, 3), shells: 64 },
};
const CAMS = [['pov', 'POV'], ['cinema', 'シネマ'], ['free', 'フリー']];
const $ = (id) => document.getElementById(id);

export async function startPlayer(renderer, params) {
  const stage = $('stage');
  stage.appendChild(renderer.domElement);
  const bar = $('bar').firstElementChild;
  const setProgress = (p) => { bar.style.width = `${Math.round(p * 100)}%`; };
  setProgress(0.1);
  let quality = params.get('q') === 'ultra' ? 'ultra' : 'max';
  renderer.setPixelRatio(QUALITY[quality].dpr());
  const seq = await Sequence.create(renderer, { shells: QUALITY[quality].shells, post: true, exposure: 0.78 });
  setProgress(0.85);
  // compile shaders up front so playback starts smoothly
  seq.render(0);
  setProgress(1);
  const sound = new Sound();
  const events = soundEvents(seq.choreo.T);

  // ---------------------------------------------------------------- state
  const st = { t: 0, playing: false, speed: 1, cam: 0, lastNow: 0, uiTimer: 0, fpsAcc: [], autoChecked: false };
  seq.camMode = 'pov';
  const controls = new OrbitControls(seq.camera, renderer.domElement);
  controls.enabled = false;
  controls.target.set(0, 0.28, 0);
  controls.minDistance = 0.3; controls.maxDistance = 3.2;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.enableDamping = true; controls.dampingFactor = 0.08;

  const toast = (msg) => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); };
  const ui = $('ui');
  const showUI = () => { ui.classList.remove('hide'); clearTimeout(st.uiTimer); st.uiTimer = setTimeout(() => { if (st.playing) ui.classList.add('hide'); }, 2600); };

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(QUALITY[quality].dpr());
    seq.resize(w, h);
  };
  addEventListener('resize', resize);
  resize();

  const setQuality = (q) => {
    quality = q;
    seq.world.cat.setShellCount(QUALITY[q].shells);
    resize();
    $('bQuality').textContent = QUALITY[q].label;
  };

  // ---------------------------------------------------------------- start
  const playBtn = $('play');
  playBtn.disabled = false;
  $('playLabel').textContent = 'タップして再生';
  const start = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* not available (e.g. iPhone Safari) */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* unsupported */ }
    await sound.init();
    sound.resume();
    $('start').classList.add('hidden');
    document.body.classList.add('playing');
    st.playing = true; st.t = 0; st.lastNow = performance.now();
    sound.lastT = -1;
    showUI();
  };
  playBtn.addEventListener('click', start);

  // ---------------------------------------------------------------- controls
  $('bReplay').onclick = () => { st.t = 0; sound.lastT = -1; st.playing = true; showUI(); };
  $('bPause').onclick = () => { st.playing = !st.playing; st.lastNow = performance.now(); showUI(); };
  $('bSpeed').onclick = () => {
    st.speed = st.speed === 1 ? 0.5 : st.speed === 0.5 ? 0.25 : 1;
    $('bSpeed').textContent = `${st.speed}×`; showUI();
  };
  $('bCam').onclick = () => {
    st.cam = (st.cam + 1) % CAMS.length;
    const [mode, label] = CAMS[st.cam];
    seq.camMode = mode;
    controls.enabled = mode === 'free';
    if (mode === 'free') { controls.target.set(0, 0.28, 0); controls.update(); toast('ドラッグで回転・ピンチでズーム'); }
    $('bCam').textContent = label; showUI();
  };
  $('bQuality').onclick = () => { setQuality(quality === 'max' ? 'ultra' : 'max'); toast(`画質: ${QUALITY[quality].label}`); showUI(); };
  $('bSound').onclick = () => { sound.enabled = !sound.enabled; $('bSound').textContent = sound.enabled ? '🔊' : '🔇'; showUI(); };
  $('bFull').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ }
    showUI();
  };
  const seek = $('seek');
  seek.addEventListener('input', () => { st.t = (seek.value / 1000) * seq.duration; sound.lastT = -1; showUI(); });
  stage.addEventListener('pointerdown', showUI);
  $('bQuality').textContent = QUALITY[quality].label;

  // ---------------------------------------------------------------- loop
  const FADE = 0.45;
  const maxFrames = Number(params.get('frames') || 0); // test hook: stop after N frames
  let frames = 0;
  const loop = (now) => {
    if (maxFrames && ++frames > maxFrames) { renderer.setAnimationLoop(null); return; }
    const dt = Math.max(0, Math.min(0.1, (now - st.lastNow) / 1000));
    st.lastNow = now;
    if (st.playing) {
      st.t += dt * st.speed;
      if (st.t >= seq.duration + FADE) { st.t = 0; sound.lastT = -1; }
      // adaptive safety net: keep the animation smooth if MAX is too heavy for this device
      if (!st.autoChecked && quality === 'max' && st.t > 1.0) {
        st.fpsAcc.push(dt);
        if (st.fpsAcc.length > 150) {
          const avg = st.fpsAcc.reduce((a, b) => a + b, 0) / st.fpsAcc.length;
          st.autoChecked = true;
          if (avg > 1 / 26) { setQuality('ultra'); toast('画質: ULTRA（滑らかさ優先に自動調整）'); }
        }
      }
    }
    const tt = Math.min(st.t, seq.duration);
    const fadeIn = Math.min(1, st.t / 0.35);
    const fadeOut = st.t > seq.duration ? Math.max(0, 1 - (st.t - seq.duration) / FADE) : 1;
    if (seq.world.post) seq.world.post.finish.uniforms.fade.value = fadeIn * fadeOut;
    if (controls.enabled) controls.update();
    seq.render(tt);
    if (st.playing) sound.update(tt, events);
    if (!seek.matches(':active')) seek.value = String(Math.round((tt / seq.duration) * 1000));
    $('time').textContent = `${tt.toFixed(1)} / ${seq.duration.toFixed(1)}`;
  };
  // the heavy render loop only runs once the viewer pressed play
  const origStart = start;
  playBtn.removeEventListener('click', start);
  playBtn.addEventListener('click', async () => { await origStart(); st.lastNow = performance.now(); renderer.setAnimationLoop(loop); });
  return seq;
}
