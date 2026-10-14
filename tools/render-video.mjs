// Offline renderer: deterministic frame stepping in headless Chromium -> PNG frames -> MP4 (+ audio).
// usage: node tools/render-video.mjs --w 1920 --h 1080 --fps 60 --shells 64 --ss 1 --out media/black-cat-clapping.mp4
//        [--from 0 --to 13.4] [--frames-dir frames] [--sub 1] [--encode] [--crf 15]
//        (resumable: existing frames are skipped; --encode muxes the procedural soundtrack with ffmpeg)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return acc;
}, []));
const W = Number(args.w || 1920), H = Number(args.h || 1080), FPS = Number(args.fps || 60);
const SS = Number(args.ss || 1); // supersampling factor (render at W*SS x H*SS, downscale in ffmpeg)
const SHELLS = Number(args.shells || 64);
const SUB = Number(args.sub || 1); // temporal sub-frames for motion blur
const dir = args['frames-dir'] || 'frames';
const out = args.out || 'media/black-cat-clapping.mp4';
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
console.log(`rendering frames ${n0}..${n1 - 1} at ${W * SS}x${H * SS}, ${SHELLS} shells, sub=${SUB}`);
const t0 = Date.now();
for (let i = n0; i < n1; i++) {
  const file = `${dir}/f_${String(i).padStart(5, '0')}.png`;
  if (fs.existsSync(file)) continue;
  const ts = [];
  for (let s = 0; s < SUB; s++) ts.push((i + (s + 0.5) / SUB - 0.5 * (SUB > 1 ? 0.5 : 0)) / FPS);
  if (SUB === 1) {
    await page.evaluate(async (t) => { await window.__app.renderAt(t); }, i / FPS);
    fs.writeFileSync(file + '.tmp', await page.screenshot({ type: 'png', timeout: 0 }));
  } else {
    // shutter 180deg: average SUB sub-frames spread over half a frame
    const bufs = [];
    for (let s = 0; s < SUB; s++) {
      const t = (i + (s / SUB) * 0.5) / FPS;
      await page.evaluate(async (t) => { await window.__app.renderAt(t); }, t);
      bufs.push(await page.screenshot({ type: 'png', timeout: 0 }));
    }
    const tmp = bufs.map((b, k) => { const f = `${dir}/sub_${k}.png`; fs.writeFileSync(f, b); return f; });
    execFileSync('python3', ['-c', `
import sys
from PIL import Image
import numpy as np
ims=[np.asarray(Image.open(f).convert('RGB'), np.float32) for f in sys.argv[2:]]
Image.fromarray(np.clip(sum(ims)/len(ims)+0.5,0,255).astype(np.uint8)).save(sys.argv[1])
`, file + '.tmp', ...tmp]);
  }
  fs.renameSync(file + '.tmp', file);
  const done = i - n0 + 1, el = (Date.now() - t0) / 1000;
  if (done % 10 === 0 || done === 1) console.log(`frame ${i} (${done}/${n1 - n0}) ${(el / done).toFixed(1)}s/frame, eta ${((n1 - n0 - done) * el / done / 60).toFixed(1)} min`);
}
await browser.close();
server.close();
console.log('frames done');

// ---------------------------------------------------------------- encode (+ procedural soundtrack)
if (args.encode) {
  const wav = path.join(dir, 'audio.wav');
  execFileSync('node', ['tools/render-audio.mjs', '--out', wav], { stdio: 'inherit' });
  const fadeOut = Math.max(0, to - from - 0.4).toFixed(2);
  const vf = [`fade=t=in:st=0:d=0.3`, `fade=t=out:st=${fadeOut}:d=0.4`];
  if (SS > 1) vf.unshift(`scale=${W}:${H}:flags=lanczos`);
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-start_number', String(n0), '-i', `${dir}/f_%05d.png`,
    '-ss', from.toFixed(3), '-i', wav, '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 15),
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${fadeOut}:d=0.4`,
    '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(`wrote ${out}`);
}
