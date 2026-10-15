// Bakes the lit room into a prefiltered environment map (IBL) from the cat's position.
import * as THREE from 'three';

export function captureEnvironment(renderer, scene, position, { size = 256, hide = [] } = {}) {
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.05, 50, cubeRT);
  cam.position.copy(position);
  cam.layers.enableAll();
  const vis = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  const prevEnv = scene.environment;
  cam.update(renderer, scene);
  hide.forEach((o, i) => { o.visible = vis[i]; });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(cubeRT.texture).texture;
  pmrem.dispose();
  cubeRT.dispose();
  scene.environment = env;
  return env;
}
