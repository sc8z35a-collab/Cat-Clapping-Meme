// Shared headless Chromium launcher (software WebGL2 through SwiftShader when no GPU is present).
import { chromium } from 'playwright';

export async function launchBrowser() {
  return chromium.launch({
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-watchdog',
      '--js-flags=--max-old-space-size=8192', '--autoplay-policy=no-user-gesture-required',
    ],
  });
}
