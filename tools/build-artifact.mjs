// Packages the player as a self-contained web page folder for hosts that only serve web media types
// (e.g. a claude.ai artifact): binary assets become base64 text + a manifest that src/assets.js decodes.
// usage: node tools/build-artifact.mjs [--out build/artifact]
// Output: <out>/index.html (page body, no <html>/<head> wrapper), dist/app.js, assets/**, assets/b64.json
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'build/artifact';
const BINARY = new Set(['.bin', '.hdr']);
const SKIP = (p) => /preview\.(bin|json)$/.test(p) || p.endsWith('.md');

fs.rmSync(OUT, { recursive: true, force: true });
const files = [];
const copy = (src, dst = src) => { fs.mkdirSync(path.dirname(path.join(OUT, dst)), { recursive: true }); fs.copyFileSync(src, path.join(OUT, dst)); files.push(dst); };

// ---------------------------------------------------------------- page
const html = fs.readFileSync('index.html', 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + '</style>'.length);
let body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>')).trim();
body = body.replace('<script type="module" src="dist/app.js"></script>',
  '<script>window.ASSET_B64_MANIFEST = "assets/b64.json";</script>\n<script type="module" src="dist/app.js"></script>');
const head = [
  '<title>Black Cat Clapping 3D</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  html.match(/<meta name="description"[^>]*>/)[0],
].join('\n');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), `${head}\n${style}\n${body}\n`);

// ---------------------------------------------------------------- code + assets
copy('dist/app.js');
const manifest = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (SKIP(p)) continue;
    if (BINARY.has(path.extname(p).toLowerCase())) {
      const dst = `${p}.b64.txt`;
      fs.mkdirSync(path.dirname(path.join(OUT, dst)), { recursive: true });
      const buf = fs.readFileSync(p);
      fs.writeFileSync(path.join(OUT, dst), buf.toString('base64'));
      files.push(dst);
      manifest.push({ path: p, bytes: buf.length });
    } else copy(p);
  }
};
walk('assets');
fs.writeFileSync(path.join(OUT, 'assets/b64.json'), JSON.stringify(manifest));
files.push('assets/b64.json');

let total = 0;
for (const f of files) total += fs.statSync(path.join(OUT, f)).size;
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [f, f]))));
console.log(`${OUT}: index.html + ${files.length} files, ${(total / 1e6).toFixed(1)} MB (${manifest.length} binaries as base64)`);
