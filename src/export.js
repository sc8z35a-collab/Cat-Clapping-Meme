// In-browser video export. The sequence is rendered frame by frame (not in real time) at the chosen
// resolution with the highest quality settings, encoded with WebCodecs and muxed to MP4 with mediabunny.
// HDR = BT.2100 HLG (BT.2020 primaries), 10-bit 4:2:0, which is what phones record and play natively and
// still looks right on SDR screens.
import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacket } from 'mediabunny';
import { renderSoundtrack } from './audio.js';

export const RESOLUTIONS = [
  { id: '2160', label: '4K', w: 3840, h: 2160 },
  { id: '1440', label: '1440p', w: 2560, h: 1440 },
  { id: '1080', label: '1080p', w: 1920, h: 1080 },
  { id: '720', label: '720p', w: 1280, h: 720 },
];
const HDR_COLOR = { primaries: 'bt2020', transfer: 'hlg', matrix: 'bt2020-ncl', fullRange: false };
const FADE_IN = 0.3, FADE_OUT = 0.4;

// [mediabunny codec, WebCodecs codec string, label]; the first supported entry wins
function videoCandidates(w, h, fps, hdr) {
  const rate = w * h * fps;
  const hevcL = rate > 267e6 ? 'L153' : rate > 133e6 ? 'L150' : rate > 66e6 ? 'L123' : 'L93';
  const avcL = rate > 267e6 ? '34' : rate > 133e6 ? '33' : rate > 66e6 ? '2a' : '20';
  const vp9L = rate > 267e6 ? '51' : rate > 133e6 ? '50' : rate > 66e6 ? '41' : '31';
  const av1L = rate > 267e6 ? '13' : rate > 133e6 ? '12' : rate > 66e6 ? '09' : '05';
  return hdr ? [
    ['hevc', `hvc1.2.4.${hevcL}.B0`, 'HEVC 10-bit'],
    ['av1', `av01.0.${av1L}M.10`, 'AV1 10-bit'],
    ['vp9', `vp09.02.${vp9L}.10`, 'VP9 10-bit'],
  ] : [
    ['avc', `avc1.6400${avcL}`, 'H.264'],
    ['hevc', `hvc1.1.6.${hevcL}.B0`, 'HEVC'],
    ['av1', `av01.0.${av1L}M.08`, 'AV1'],
    ['vp9', `vp09.00.${vp9L}.08`, 'VP9'],
  ];
}
const bitrateFor = (w, h, fps, hdr) => Math.round(16e6 * Math.pow((w * h) / (1920 * 1080), 0.75) * (fps > 30 ? 1 : 0.62) * (hdr ? 1.25 : 1));

function encoderConfig(codecString, mb, w, h, fps, bitrate) {
  const c = { codec: codecString, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
  if (mb === 'avc') c.avc = { format: 'avc' };
  if (mb === 'hevc') c.hevc = { format: 'hevc' };
  return c;
}

let _p10;
function canMake10bitFrames() {
  if (_p10 !== undefined) return _p10;
  try {
    const f = new VideoFrame(new Uint16Array(16 * 16 * 1.5), { format: 'I420P10', codedWidth: 16, codedHeight: 16, timestamp: 0, colorSpace: HDR_COLOR });
    f.close();
    _p10 = true;
  } catch (e) { _p10 = false; }
  return _p10;
}

export function exportAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function maxRenderSize(renderer) {
  const gl = renderer.getContext();
  const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE), vp[0], vp[1]);
}

async function pickVideo(w, h, fps, hdr) {
  if (hdr && !canMake10bitFrames()) return null;
  const bitrate = bitrateFor(w, h, fps, hdr);
  for (const [mb, codec, label] of videoCandidates(w, h, fps, hdr)) {
    try {
      const cfg = encoderConfig(codec, mb, w, h, fps, bitrate);
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r.supported) return { mb, codec, label, bitrate, config: cfg };
    } catch (e) { /* unsupported string in this browser */ }
  }
  return null;
}

async function pickAudio() {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [mb, codec, label] of [['aac', 'mp4a.40.2', 'AAC'], ['opus', 'opus', 'Opus']]) {
    try {
      const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r.supported) return { mb, codec, label, config: cfg };
    } catch (e) { /* ignore */ }
  }
  return null;
}

// Resolve the user's choice ('auto' = best this device can do, up to 4K / 60 fps / HDR) into a concrete plan.
export async function planExport(renderer, { res = 'auto', fps = 60, hdr = 'auto' } = {}) {
  if (!exportAvailable()) throw new Error('このブラウザは動画の書き出し（WebCodecs）に対応していません。最新の Chrome か Safari で開いてください。');
  const maxSize = maxRenderSize(renderer);
  const sizes = (res === 'auto' ? RESOLUTIONS : RESOLUTIONS.filter((r) => r.id === res)).filter((r) => r.w <= maxSize);
  const hdrModes = hdr === 'on' ? [true] : hdr === 'off' ? [false] : [true, false];
  for (const r of sizes) {
    for (const wantHdr of hdrModes) {
      const video = await pickVideo(r.w, r.h, fps, wantHdr);
      if (video) return { ...r, fps, hdr: wantHdr, video, audio: await pickAudio() };
    }
  }
  if (hdr === 'on') throw new Error('この端末のブラウザは HDR（10-bit）の動画書き出しに対応していません。HDR をオフにしてください。');
  throw new Error('この端末で使える動画形式が見つかりませんでした。解像度を下げてください。');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Render + encode. `seq` is the running Sequence; the caller restores its own quality/size afterwards.
export async function runExport(plan, { seq, renderer, onProgress = () => {}, signal, duration = seq.duration } = {}) {
  const { w, h, fps, hdr } = plan;
  const post = seq.world.post;
  const n = Math.round(duration * fps);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new EncodedVideoPacketSource(plan.video.mb);
  output.addVideoTrack(videoSource, { frameRate: fps });
  let audioSource = null;
  if (plan.audio) { audioSource = new EncodedAudioPacketSource(plan.audio.mb); output.addAudioTrack(audioSource); }
  output.setMetadataTags({ title: 'Black Cat Clapping 3D' });
  await output.start();

  let failure = null;
  let chain = Promise.resolve();
  const push = (src, chunk, meta) => { chain = chain.then(() => src.add(EncodedPacket.fromEncodedChunk(chunk), meta)).catch((e) => { failure ||= e; }); };
  const aborted = () => signal?.aborted;

  // ---------------------------------------------------------------- audio (fast, done first)
  if (audioSource) {
    onProgress({ phase: 'audio', done: 0, total: n });
    const buf = await renderSoundtrack(seq.choreo.T, { sampleRate: 48000, duration: n / fps, fadeIn: FADE_IN, fadeOut: FADE_OUT });
    if (buf) {
      const enc = new AudioEncoder({ output: (c, m) => push(audioSource, c, m), error: (e) => { failure ||= e; } });
      enc.configure(plan.audio.config);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const block = 4800;
      for (let i = 0; i < L.length; i += block) {
        const m = Math.min(block, L.length - i);
        const data = new Float32Array(m * 2);
        data.set(L.subarray(i, i + m), 0);
        data.set(R.subarray(i, i + m), m);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data });
        enc.encode(ad);
        ad.close();
      }
      await enc.flush();
      enc.close();
    }
  }

  // ---------------------------------------------------------------- video
  const venc = new VideoEncoder({ output: (c, m) => push(videoSource, c, m), error: (e) => { failure ||= e; } });
  venc.configure(plan.video.config);
  if (hdr) post.setHDR(true);
  const planes = hdr ? new Uint16Array(w * h * 1.5) : null;
  const gl = renderer.getContext();
  for (let k = 0; k < 16 && gl.getError() !== gl.NO_ERROR; k++); // clear stale error flags
  const dt = 1e6 / fps;
  const t0 = performance.now();
  try {
    for (let i = 0; i < n; i++) {
      if (aborted()) throw new DOMException('書き出しを中止しました', 'AbortError');
      if (failure) throw failure;
      const t = i / fps;
      const fade = Math.min(1, t / FADE_IN, Math.max(0, (duration - t) / FADE_OUT));
      post.finish.uniforms.fade.value = fade;
      post.hdrFinish.uniforms.fade.value = fade;
      seq.render(t);
      let frame;
      if (hdr) {
        post.readHDRFrame(planes);
        frame = new VideoFrame(planes, { format: 'I420P10', codedWidth: w, codedHeight: h, timestamp: Math.round(i * dt), duration: Math.round(dt), colorSpace: HDR_COLOR });
      } else {
        frame = new VideoFrame(renderer.domElement, { timestamp: Math.round(i * dt), duration: Math.round(dt) });
      }
      if (i === 0 && (gl.isContextLost() || gl.getError() === gl.OUT_OF_MEMORY)) {
        frame.close();
        throw Object.assign(new Error(`${plan.label} はこの端末の GPU メモリが足りません`), { name: 'GPUMemoryError' });
      }
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 2 && !failure) await sleep(2);
      onProgress({ phase: 'video', done: i + 1, total: n, elapsed: (performance.now() - t0) / 1000 });
      await sleep(0); // let the page breathe (progress UI, cancel button)
    }
    onProgress({ phase: 'finish', done: n, total: n });
    await venc.flush();
    venc.close();
    await chain;
    if (failure) throw failure;
    await output.finalize();
  } catch (e) {
    try { venc.close(); } catch (e2) { /* already closed */ }
    try { await output.cancel(); } catch (e2) { /* ignore */ }
    throw e;
  } finally {
    if (hdr) post.setHDR(false);
    post.finish.uniforms.fade.value = 1;
  }
  const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
  const name = `black-cat-clapping_${plan.label}${fps}${hdr ? '_HDR' : ''}.mp4`;
  return { blob, name, seconds: (performance.now() - t0) / 1000 };
}

// Hand the finished file to the user: the share sheet where available (save to Photos/Files), else a download.
export async function saveVideo(blob, name) {
  const file = new File([blob], name, { type: 'video/mp4' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return 'downloaded';
}
