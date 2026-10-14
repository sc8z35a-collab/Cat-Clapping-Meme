// Renders one still frame of the app in headless Chromium and saves it as PNG.
// usage: node tools/shot.mjs --out shot.png --w 720 --h 1280 --t 5.0 --q "cam=pov&debug=1"
import fs from 'node:fs';
import { startServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return acc;
}, []));
const W = Number(args.w || 720), H = Number(args.h || 1280);
const times = String(args.t ?? '4').split(',').map(Number);
const out = args.out || 'shot.png';
const server = await startServer(0);
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || args.verbose) console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html?offline=1&${args.q || ''}`);
await page.waitForFunction(() => window.__app && window.__app.ready, null, { timeout: 600000, polling: 250 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const t of times) {
  const t1 = Date.now();
  await page.evaluate(async (t) => { await window.__app.renderAt(t); }, t);
  const file = times.length > 1 ? out.replace(/(\.\w+)$/, `_${t.toFixed(2)}$1`) : out;
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(file, buf);
  console.log(`t=${t} -> ${file} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
}
await browser.close();
server.close();
