// Offline soundtrack for the MP4: the same procedural events the player uses (src/audio.js),
// mixed in stereo with a synthetic living-room reverb and a soft room tone.
// usage: node tools/render-audio.mjs [--out media/audio.wav] [--sr 48000] [--tail 0.6]
import fs from 'node:fs';
import path from 'node:path';
import { soundEvents, renderEvent, roomImpulse } from '../src/audio.js';
import { T } from '../src/anim/memeChoreo.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return acc;
}, []));
const SR = Number(args.sr || 48000);
const out = args.out || 'media/audio.wav';
const duration = T.end + Number(args.tail || 0.6);
const N = Math.ceil(duration * SR);
const dryL = new Float32Array(N), dryR = new Float32Array(N);

// events: claps sit slightly left of centre (the cat is a bit left in frame), chewing centred
for (const ev of soundEvents(T)) {
  const data = renderEvent(ev.type, SR, ev.seed);
  const pan = ev.type === 'clap' ? -0.06 : 0;
  const gl = ev.gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = ev.gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const i0 = Math.round(ev.t * SR);
  for (let i = 0; i < data.length && i0 + i < N; i++) { dryL[i0 + i] += data[i] * gl; dryR[i0 + i] += data[i] * gr; }
}

// convolution reverb (direct form is fine for a 14 s clip; the event list is sparse)
const [irL, irR] = roomImpulse(SR);
const wetL = new Float32Array(N), wetR = new Float32Array(N);
const nz = [];
for (let i = 0; i < N; i++) if (dryL[i] !== 0 || dryR[i] !== 0) nz.push(i);
for (const i of nz) {
  const a = dryL[i], b = dryR[i];
  const m = Math.min(irL.length, N - i);
  for (let k = 0; k < m; k++) { wetL[i + k] += a * irL[k]; wetR[i + k] += b * irR[k]; }
}

// room tone: very soft brown-ish noise with a slow drift, plus faint high air
let s = 12345;
const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
let lpL = 0, lpR = 0;
const mixL = new Float32Array(N), mixR = new Float32Array(N);
const WET = 0.22, TONE = 0.05;
for (let i = 0; i < N; i++) {
  lpL += 0.02 * (rnd() - lpL); lpR += 0.02 * (rnd() - lpR);
  const drift = 1 + 0.15 * Math.sin(i / SR * 0.7);
  mixL[i] = dryL[i] + wetL[i] * WET + lpL * 0.35 * TONE * drift;
  mixR[i] = dryR[i] + wetR[i] * WET + lpR * 0.35 * TONE * drift;
}

// fades + peak normalise to -1 dBFS
const fadeIn = 0.25 * SR, fadeOut = 0.5 * SR;
let peak = 0;
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn, (N - i) / fadeOut);
  mixL[i] *= g; mixR[i] *= g;
  peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
}
const norm = peak > 0 ? 0.89 / peak : 1;

// 16-bit PCM WAV
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixL[i] * norm)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixR[i] * norm)) * 32767), 46 + i * 4);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, pcm);
console.log(`wrote ${out}: ${duration.toFixed(2)} s, ${SR} Hz stereo, peak gain ${norm.toFixed(2)}`);
