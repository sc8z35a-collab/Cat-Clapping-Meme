// Full-screen landscape player: start screen, playback, controls, quality, camera modes, sound, video export.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sequence } from './app/sequence.js';
import { Sound, soundEvents } from './audio.js';
import { prepareAssets } from './assets.js';
import { exportAvailable, planExport, runExport, saveVideo, RESOLUTIONS } from './export.js';

// Quality presets. LOW is the default (smooth on phones); heavier levels add resolution, fur layers,
// ambient occlusion, depth of field, bloom, sharper shadows and a sharper floor reflection.
const QUALITY = {
  low: { label: 'LOW', name: '軽量', dpr: 1, shells: 16, ao: false, dof: false, bloom: false, shadow: 1024, refl: 0.3 },
  mid: { label: 'MID', name: '標準', dpr: 1.5, shells: 32, ao: false, dof: true, bloom: true, shadow: 2048, refl: 0.4 },
  high: { label: 'HIGH', name: '高画質', dpr: 2, shells: 48, ao: true, dof: true, bloom: true, shadow: 4096, refl: 0.5 },
  max: { label: 'MAX', name: '最高', dpr: 3, shells: 64, ao: true, dof: true, bloom: true, shadow: 4096, refl: 0.5 },
};
const ORDER = ['low', 'mid', 'high', 'max'];
const EXPORT_QUALITY = QUALITY.max;
const CAMS = [['pov', 'POV'], ['cinema', 'シネマ'], ['free', 'フリー']];
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
};

export async function startPlayer(renderer, params) {
  const stage = $('stage');
  stage.appendChild(renderer.domElement);
  // the canvas always fills the stage; only its drawing buffer follows the quality setting
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  const bar = $('bar').firstElementChild;
  const setProgress = (p) => { bar.style.width = `${Math.round(p * 100)}%`; };
  setProgress(0.05);
  await prepareAssets((p) => setProgress(0.05 + 0.6 * p));
  setProgress(0.65);
  const fromUrl = params.get('q');
  let quality = QUALITY[fromUrl] ? fromUrl : QUALITY[store.get('bcc.quality')] ? store.get('bcc.quality') : 'low';
  const dprFor = (q) => Math.min(devicePixelRatio || 1, QUALITY[q].dpr);
  renderer.setPixelRatio(dprFor(quality));
  const seq = await Sequence.create(renderer, { shells: QUALITY[quality].shells, post: true, exposure: 0.78 });
  seq.world.applyQuality(QUALITY[quality]);
  setProgress(0.85);
  // compile shaders up front so playback starts smoothly
  seq.render(0);
  setProgress(1);
  const sound = new Sound();
  const events = soundEvents(seq.choreo.T);

  // ---------------------------------------------------------------- state
  const st = { t: 0, playing: false, speed: 1, cam: 0, lastNow: 0, uiTimer: 0, fps: [], perfCheckAt: 1.0, exporting: false };
  seq.camMode = 'pov';
  const controls = new OrbitControls(seq.camera, renderer.domElement);
  controls.enabled = false;
  controls.target.set(0, 0.28, 0);
  controls.minDistance = 0.3; controls.maxDistance = 3.2;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.enableDamping = true; controls.dampingFactor = 0.08;

  const toast = (msg) => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); };
  const ui = $('ui');
  const showUI = () => { ui.classList.remove('hide'); clearTimeout(st.uiTimer); st.uiTimer = setTimeout(() => { if (st.playing) ui.classList.add('hide'); }, 2600); };

  // ---------------------------------------------------------------- sizing
  // Measure the stage (not window.inner*): after a rotation or entering full screen, mobile browsers can
  // report stale window sizes for a moment, so re-measure on the next frames as well.
  let lastW = 0, lastH = 0;
  const resize = (force = false) => {
    if (st.exporting) return;
    const w = Math.max(1, stage.clientWidth || innerWidth), h = Math.max(1, stage.clientHeight || innerHeight);
    if (!force && w === lastW && h === lastH && renderer.getPixelRatio() === dprFor(quality)) return;
    lastW = w; lastH = h;
    renderer.setPixelRatio(dprFor(quality));
    seq.resize(w, h);
  };
  const settle = () => { resize(); requestAnimationFrame(() => resize()); setTimeout(resize, 250); setTimeout(resize, 700); };
  addEventListener('resize', settle);
  addEventListener('orientationchange', settle);
  document.addEventListener('fullscreenchange', settle);
  document.addEventListener('webkitfullscreenchange', settle);
  if (window.visualViewport) visualViewport.addEventListener('resize', settle);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(settle).observe(stage);
  resize(true);

  const setQuality = (q, note = '') => {
    quality = q;
    seq.world.applyQuality(QUALITY[q]);
    resize(true);
    $('bQuality').textContent = QUALITY[q].label;
    store.set('bcc.quality', q);
    st.fps = []; st.perfCheckAt = st.t + 1.0;
    toast(`画質: ${QUALITY[q].label}（${QUALITY[q].name}）${note}`);
  };
  $('bQuality').textContent = QUALITY[quality].label;

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
    settle();
    showUI();
  };

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
  $('bQuality').onclick = () => { setQuality(ORDER[(ORDER.indexOf(quality) + 1) % ORDER.length]); showUI(); };
  $('bSound').onclick = () => { sound.enabled = !sound.enabled; $('bSound').textContent = sound.enabled ? '🔊' : '🔇'; showUI(); };
  $('bFull').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (e) { /* ignore */ }
    settle(); showUI();
  };
  const seek = $('seek');
  seek.addEventListener('input', () => { st.t = (seek.value / 1000) * seq.duration; sound.lastT = -1; showUI(); });
  stage.addEventListener('pointerdown', showUI);

  // ---------------------------------------------------------------- video export
  setupExport({ seq, renderer, st, getQuality: () => quality, applyQuality: (q) => { seq.world.applyQuality(QUALITY[q]); resize(true); }, showUI, toast });

  // ---------------------------------------------------------------- loop
  const FADE = 0.45;
  const maxFrames = Number(params.get('frames') || 0); // test hook: stop after N frames
  let frames = 0;
  const loop = (now) => {
    if (maxFrames && ++frames > maxFrames) { renderer.setAnimationLoop(null); return; }
    if (st.exporting) return;
    const dt = Math.max(0, Math.min(0.1, (now - st.lastNow) / 1000));
    st.lastNow = now;
    if (st.playing) {
      st.t += dt * st.speed;
      if (st.t >= seq.duration + FADE) { st.t = 0; sound.lastT = -1; st.perfCheckAt = 1.0; }
      // safety net: if the chosen level cannot hold ~24 fps on this device, step down one level
      if (quality !== 'low' && st.t > st.perfCheckAt) {
        st.fps.push(dt);
        if (st.fps.length > 90) {
          const avg = st.fps.reduce((a, b) => a + b, 0) / st.fps.length;
          st.fps = [];
          if (avg > 1 / 24) setQuality(ORDER[ORDER.indexOf(quality) - 1], '— 重いので自動で下げました');
          else st.perfCheckAt = Infinity;
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
  playBtn.addEventListener('click', async () => { await start(); st.lastNow = performance.now(); renderer.setAnimationLoop(loop); });
  return seq;
}

// Export panel: choose resolution / frame rate / HDR ("自動" = the best this device supports, up to 4K 60 fps HDR),
// render every frame at MAX quality, then save or share the MP4.
function setupExport({ seq, renderer, st, getQuality, applyQuality, showUI, toast }) {
  const panel = $('exportPanel');
  const choice = { res: 'auto', fps: 60, hdr: 'auto' };
  let result = null, ctrl = null;
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const testDur = Number(new URLSearchParams(location.search).get('exportDur')) || 0; // test hook: short exports

  const segs = [['exRes', 'res'], ['exFps', 'fps'], ['exHdr', 'hdr']];
  const syncSegs = () => {
    for (const [id, key] of segs) for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(String(choice[key]) === b.dataset.v));
  };
  for (const [id, key] of segs) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || st.exporting) return;
      choice[key] = key === 'fps' ? Number(b.dataset.v) : b.dataset.v;
      syncSegs(); describe();
    });
  }
  const setStatus = (html) => { $('exStatus').innerHTML = html; };
  const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, '0')}秒` : `${Math.max(1, Math.round(s))}秒`);
  let describeToken = 0;
  const describe = async () => {
    const token = ++describeToken;
    $('exSave').hidden = true; result = null;
    if (!exportAvailable()) { setStatus('このブラウザは動画書き出しに対応していません（最新の Chrome / Safari で開いてください）。'); $('exStart').disabled = true; return; }
    setStatus('この端末で使える形式を確認中…');
    try {
      const plan = await planExport(renderer, choice);
      if (token !== describeToken) return;
      $('exStart').disabled = false;
      setStatus(`<b>${plan.label} ${plan.fps}fps ${plan.hdr ? 'HDR（HLG・10bit）' : 'SDR'}</b> · ${plan.video.label}${plan.audio ? ` · 音声 ${plan.audio.label}` : ' · 音声なし（この端末は音声の書き出しに非対応）'}`);
    } catch (e) {
      if (token !== describeToken) return;
      $('exStart').disabled = true;
      setStatus(e.message);
    }
  };

  const open = () => {
    st.playing = false;
    panel.hidden = false;
    syncSegs();
    $('exProg').hidden = true;
    $('exNote').hidden = !inFrame;
    describe();
  };
  const close = () => {
    if (st.exporting) { ctrl?.abort(); return; }
    panel.hidden = true;
    st.lastNow = performance.now();
    showUI();
  };
  $('bExport').onclick = open;
  $('exClose').onclick = close;

  $('exStart').onclick = async () => {
    if (st.exporting) return;
    let plan;
    try { plan = await planExport(renderer, choice); } catch (e) { setStatus(e.message); return; }
    await doExport(plan);
  };
  // one export run; in 自動 mode a GPU-memory failure retries one resolution step lower
  const doExport = async (plan) => {
    st.exporting = true;
    ctrl = new AbortController();
    panel.classList.add('busy');
    $('exStart').disabled = true; $('exSave').hidden = true; $('exClose').textContent = '中止';
    $('exProg').hidden = false;
    const fill = $('exProg').querySelector('i');
    const ptext = $('exProgText');
    const q = getQuality();
    let failed = null;
    let wake = null;
    try { wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* not allowed here; keep the screen on manually */ }
    const savedPR = renderer.getPixelRatio();
    const savedW = seq.world.width, savedH = seq.world.height;
    try {
      // full quality, exact export resolution (the canvas keeps its on-screen size and shows a live preview);
      // 2x MSAA at 4K keeps video memory in check on phones (pixels are tiny there anyway)
      renderer.setPixelRatio(1);
      seq.world.applyQuality(EXPORT_QUALITY);
      seq.world.post.setSamples(plan.h >= 2160 ? 2 : 4);
      seq.resize(plan.w, plan.h);
      result = await runExport(plan, {
        seq, renderer, signal: ctrl.signal, duration: testDur || seq.duration,
        onProgress: ({ phase, done, total, elapsed }) => {
          fill.style.width = `${(done / total) * 100}%`;
          if (phase === 'audio') ptext.textContent = '音声を作成中…';
          else if (phase === 'finish') ptext.textContent = 'ファイルを仕上げ中…';
          else ptext.textContent = `${done} / ${total} フレーム · 残り約 ${fmtTime((elapsed / done) * (total - done))}`;
        },
      });
      ptext.textContent = `完成: ${(result.blob.size / 1e6).toFixed(1)} MB（${fmtTime(result.seconds)}）`;
      window.__lastExport = result;
      $('exSave').hidden = false;
      toast('書き出しが完了しました');
    } catch (e) {
      failed = e;
      ptext.textContent = e.name === 'AbortError' ? '書き出しを中止しました' : `失敗しました: ${e.message}（解像度を下げてもう一度お試しください）`;
    } finally {
      st.exporting = false;
      panel.classList.remove('busy');
      $('exStart').disabled = false; $('exClose').textContent = '閉じる';
      try { await wake?.release(); } catch (e) { /* ignore */ }
      seq.world.post.setSamples(4);
      renderer.setPixelRatio(savedPR);
      seq.resize(savedW, savedH);
      applyQuality(q);
    }
    if (failed?.name === 'GPUMemoryError' && choice.res === 'auto') {
      const lower = RESOLUTIONS.filter((r) => r.h < plan.h).map((r) => r.id);
      for (const id of lower) {
        let next;
        try { next = await planExport(renderer, { ...choice, res: id }); } catch (e) { continue; }
        toast(`${plan.label} はメモリ不足のため ${next.label} で書き出します`);
        return doExport(next);
      }
    }
  };
  $('exSave').onclick = async () => {
    if (!result) return;
    try {
      const how = await saveVideo(result.blob, result.name);
      if (how === 'downloaded') toast(inFrame ? 'このページでは保存できない場合があります（GitHub Pages 版をお使いください）' : 'ダウンロードを開始しました');
    } catch (e) { toast(`保存できませんでした: ${e.message}`); }
  };
}
