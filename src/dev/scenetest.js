// Full scene view for look development.
import * as THREE from 'three';
import { World } from '../world.js';

export async function startSceneTest(renderer, params) {
  const world = await World.create(renderer, {
    shells: Number(params.get('shells') || 40), post: params.get('post') !== '0',
    exposure: Number(params.get('exp') || 0.85), ao: params.get('ao') !== '0', dof: params.get('dof') !== '0',
  });
  const cat = world.cat;
  cat.setPupil(Number(params.get('pupil') || 0.5));
  cat.setGrin(Number(params.get('grin') || 0));
  cat.state.squint = Number(params.get('grin') || 0);
  cat.updateLids();
  const cams = {
    pov: { pos: [0.05, 0.94, 0.66], target: [0, 0.25, -0.02], fov: 54 },
    close: { pos: [0.03, 0.52, 0.42], target: [0, 0.33, 0.0], fov: 45 },
    face: { pos: [0.02, 0.42, 0.25], target: [0, 0.38, 0.03], fov: 30 },
    wide: { pos: [1.2, 1.5, 2.2], target: [-0.2, 0.5, -0.8], fov: 60 },
    low: { pos: [0.35, 0.32, 0.95], target: [0, 0.28, 0], fov: 40 },
    room: { pos: [0.0, 1.6, 2.3], target: [0, 0.8, -1.5], fov: 70 },
  };
  const c = cams[params.get('cam') || 'pov'];
  world.camera.fov = c.fov;
  world.camera.position.set(...c.pos);
  world.camera.lookAt(...c.target);
  world.camera.updateProjectionMatrix();
  if (world.post?.bokeh) world.post.bokeh.uniforms.focus.value = world.camera.position.distanceTo(new THREE.Vector3(...c.target));
  cat.lookEyesAt(world.camera.position);
  return {
    render(t) { world.render(t || 0); },
    resize(w, h) { world.resize(w, h); },
  };
}
