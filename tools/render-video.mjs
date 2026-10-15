// Offline renderer: deterministic frame stepping in headless Chromium -> MP4 with the procedural soundtrack.
//
// SDR (default): PNG frames -> H.264.   HDR (--hdr): BT.2100 HLG, 10-bit 4:2:0 -> HEVC Main10 (x265).
// Both are resumable: re-run the same command and finished frames / segments are skipped.
//
// usage: node tools/render-video.mjs [--preset max] [--res 4k|1440|1080|720] [--fps 60] [--hdr]
//          [--shells 64] [--from 0 --to 13.4] [--frames-dir frames] [--out media/x.mp4] [--encode] [--crf N]
//        --preset max  = --res 4k --fps 60 --hdr --encode (the maximum: 3840x2160, 60 fps, HDR)
//        SDR extras: [--w 1920 --h 1080] [--ss 2] (supersampling) [--sub 2] (motion blur sub-frames)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { startServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return acc;
}, []));
if (args.preset === 'max') Object.assign(args, { res: args.res || '4k', fps: args.fps || '60', hdr: args.hdr || '1', encode: '1' });
const RES = { '4k': [3840, 2160], 2160: [3840, 2160], 1440: [2560, 1440], 1080: [1920, 1080], 720: [1280, 720] };
const [W, H] = RES[args.res] || [Number(args.w || 1920), Number(args.h || 1080)];
const FPS = Number(args.fps || 60);
const HDR = !!args.hdr;
const SS = HDR ? 1 : Number(args.ss || 1); // supersampling factor (render at W*SS x H*SS, downscale in ffmpeg)
const SHELLS = Number(args.shells || 64);
const SUB = HDR ? 1 : Number(args.sub || 1); // temporal sub-frames for motion blur
const dir = args['frames-dir'] || (HDR ? `frames/hdr_${H}p${FPS}` : 'frames');
const out = args.out || `media/black-cat-clapping_${H >= 2160 ? '4K' : `${H}p`}${FPS}${HDR ? '_HDR' : ''}.mp4`;
const CRF = Number(args.crf || (HDR ? 14 : 15));
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });

const server = await startServer(0);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: W * SS, height: H * SS }, deviceScaleFactor: 1 });
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?offline=1&shells=${SHELLS}&${args.q || ''}`);
await page.waitForFunction(() => window.__app && window.__app.ready, null, { timeout: 900000, polling: 500 });
const duration = await page.evaluate(() => window.__app.seq.duration);
const from = Number(args.from || 0), to = Number(args.to || duration);
const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
console.log(`rendering frames ${n0}..${n1 - 1} at ${W * SS}x${H * SS} ${FPS} fps ${HDR ? 'HDR (HLG, 10-bit)' : 'SDR'}, ${SHELLS} shells, sub=${SUB}`);
const t0 = Date.now();
let rendered = 0;
const report = (i) => {
  rendered++;
  const el = (Date.now() - t0) / 1000;
  if (rendered % 10 === 0 || rendered === 1) console.log(`frame ${i} (${i - n0 + 1}/${n1 - n0}) ${(el / rendered).toFixed(1)}s/frame, eta ${((n1 - i - 1) * el / rendered / 60).toFixed(1)} min`);
};

if (HDR) {
  // ---------------------------------------------------------------- HDR: 2-second HEVC Main10 segments
  const SEG = FPS * 2;
  const x265 = [`colorprim=bt2020`, `transfer=arib-std-b67`, `colormatrix=bt2020nc`, `range=limited`, `keyint=${SEG}`, `min-keyint=1`, `no-open-gop=1`, `repeat-headers=1`].join(':');
  const fadeAt = (t) => Math.min(1, t / 0.3, Math.max(0, (duration - t) / 0.4));
  for (let s0 = n0; s0 < n1; s0 += SEG) {
    const s1 = Math.min(n1, s0 + SEG);
    const seg = `${dir}/seg_${String(s0).padStart(5, '0')}.mp4`;
    if (fs.existsSync(seg)) continue;
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p10le', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libx265', '-preset', args.x265 || 'slow', '-crf', String(CRF), '-pix_fmt', 'yuv420p10le', '-x265-params', x265,
      '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-color_range', 'tv', '-tag:v', 'hvc1', '-f', 'mp4', `${seg}.tmp`],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))));
    for (let i = s0; i < s1; i++) {
      const t = i / FPS;
      const b64 = await page.evaluate(({ t, f }) => window.__app.hdrFrame(t, f), { t, f: fadeAt(t) });
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      report(i);
    }
    ff.stdin.end();
    await done;
    fs.renameSync(`${seg}.tmp`, seg);
  }
} else {
  // ---------------------------------------------------------------- SDR: PNG frames
  for (let i = n0; i < n1; i++) {
    const file = `${dir}/f_${String(i).padStart(5, '0')}.png`;
    if (fs.existsSync(file)) continue;
    if (SUB === 1) {
      await page.evaluate(async (t) => { await window.__app.renderAt(t); }, i / FPS);
      fs.writeFileSync(file + '.tmp', await page.screenshot({ type: 'png', timeout: 0 }));
    } else {
      // shutter 180deg: average SUB sub-frames spread over half a frame
      const tmp = [];
      for (let s = 0; s < SUB; s++) {
        await page.evaluate(async (t) => { await window.__app.renderAt(t); }, (i + (s / SUB) * 0.5) / FPS);
        const f = `${dir}/sub_${s}.png`;
        fs.writeFileSync(f, await page.screenshot({ type: 'png', timeout: 0 }));
        tmp.push(f);
      }
      execFileSync('python3', ['-c', `
import sys
from PIL import Image
import numpy as np
ims=[np.asarray(Image.open(f).convert('RGB'), np.float32) for f in sys.argv[2:]]
Image.fromarray(np.clip(sum(ims)/len(ims)+0.5,0,255).astype(np.uint8)).save(sys.argv[1])
`, file + '.tmp', ...tmp]);
    }
    fs.renameSync(file + '.tmp', file);
    report(i);
  }
}
await browser.close();
server.close();
console.log('frames done');

// ---------------------------------------------------------------- encode (+ procedural soundtrack)
if (args.encode) {
  const wav = path.join(dir, 'audio.wav');
  execFileSync('node', ['tools/render-audio.mjs', '--out', wav], { stdio: 'inherit' });
  const fadeOut = Math.max(0, to - from - 0.4).toFixed(2);
  if (HDR) {
    const list = path.join(dir, 'segments.txt');
    const segs = fs.readdirSync(dir).filter((f) => /^seg_\d+\.mp4$/.test(f)).sort();
    fs.writeFileSync(list, segs.map((f) => `file '${path.resolve(dir, f)}'`).join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ss', from.toFixed(3), '-i', wav,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${fadeOut}:d=0.4`,
      '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  } else {
    const vf = [`fade=t=in:st=0:d=0.3`, `fade=t=out:st=${fadeOut}:d=0.4`];
    if (SS > 1) vf.unshift(`scale=${W}:${H}:flags=lanczos`);
    execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-start_number', String(n0), '-i', `${dir}/f_%05d.png`,
      '-ss', from.toFixed(3), '-i', wav, '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${fadeOut}:d=0.4`,
      '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  }
  console.log(`wrote ${out}`);
}
