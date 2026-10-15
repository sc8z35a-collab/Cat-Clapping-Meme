// Bundles src/main.js -> dist/app.js with esbuild.
import * as esbuild from 'esbuild';
import { startServer } from './serve.mjs';

const watch = process.argv.includes('--watch') || process.argv.includes('--serve');
const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  outfile: 'dist/app.js',
  minify: !process.argv.includes('--dev'),
  sourcemap: false,
  legalComments: 'none',
  loader: { '.glsl': 'text' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (process.argv.includes('--serve')) {
    const port = Number(process.env.PORT || 5173);
    await startServer(port);
    console.log(`dev server: http://127.0.0.1:${port}/`);
  }
} else {
  await esbuild.build(options);
}
