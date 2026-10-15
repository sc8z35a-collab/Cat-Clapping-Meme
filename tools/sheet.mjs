// Renders several times of the sequence into one contact sheet (for reviewing animation).
// usage: node tools/sheet.mjs --times 0,1,2 --w 270 --h 480 --cols 6 --out sheet.jpg --q "ao=0"
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return acc;
}, []));
const W = Number(args.w || 270), H = Number(args.h || 480);
const times = String(args.times || '0').split(',').map(Number);
const out = args.out || 'sheet.jpg';
const server = await startServer(0);
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(0);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html?offline=1&${args.q || ''}`);
await page.waitForFunction(() => window.__app && window.__app.ready, null, { timeout: 600000, polling: 250 });
const tmp = fs.mkdtempSync('/tmp/claude-0/sheet-');
const files = [];
for (const t of times) {
  await page.evaluate(async (t) => { await window.__app.renderAt(t); }, t);
  const f = `${tmp}/f_${String(files.length).padStart(3, '0')}.png`;
  fs.writeFileSync(f, await page.screenshot({ type: 'png' }));
  files.push([f, t]);
}
await browser.close();
server.close();
const cols = Number(args.cols || Math.min(6, times.length));
execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
files = ${JSON.stringify(files)}
W, H, cols = ${W}, ${H}, ${cols}
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), 'black')
d = ImageDraw.Draw(sheet)
for i, (f, t) in enumerate(files):
    im = Image.open(f).convert('RGB')
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 52, y + 16], fill=(0, 0, 0))
    d.text((x + 3, y + 2), 't=%.2f' % t, fill=(255, 255, 0))
sheet.save('${out}', quality=88)
`]);
console.log('wrote', out);
