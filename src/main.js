import * as THREE from 'three';
import { startPreview } from './dev/preview.js';
import { startRigTest } from './dev/rigtest.js';
import { startLookdev } from './dev/lookdev.js';
import { startSceneTest } from './dev/scenetest.js';
import { Sequence } from './app/sequence.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('offline') });
renderer.setPixelRatio(params.has('offline') ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const app = { ready: false };
window.__app = app;

async function main() {
  let view;
  if (params.get('mode') === 'preview') view = await startPreview(renderer, params);
  else if (params.get('mode') === 'rig') view = await startRigTest(renderer, params);
  else if (params.get('mode') === 'lookdev') view = await startLookdev(renderer, params);
  else if (params.get('mode') === 'scene') view = await startSceneTest(renderer, params);
  else {
    const seq = await Sequence.create(renderer, {
      shells: Number(params.get('shells') || 40), post: params.get('post') !== '0', exposure: Number(params.get('exp') || 0.85),
      ao: params.get('ao') !== '0', dof: params.get('dof') !== '0', cam: params.get('cam') || 'pov',
    });
    app.seq = seq;
    view = {
      render: (t) => seq.render(t ?? ((performance.now() / 1000) % seq.duration)),
      resize: (w, h) => seq.resize(w, h),
    };
  }
  app.renderAt = async (t) => { view.render(t); };
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); view.resize(innerWidth, innerHeight); });
  app.ready = true;
  if (!params.has('offline')) renderer.setAnimationLoop(() => view.render());
}
main();
