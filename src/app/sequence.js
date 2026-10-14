// The meme sequence: world + choreography + POV camera + props.
import * as THREE from 'three';
import { World } from '../world.js';
import { CatController } from '../anim/controller.js';
import { createMemeChoreo } from '../anim/memeChoreo.js';
import { fbm1 } from '../anim/tracks.js';

export class Sequence {
  static async create(renderer, opts = {}) {
    const s = new Sequence();
    await s.init(renderer, opts);
    return s;
  }
  async init(renderer, opts) {
    this.opts = opts;
    this.world = await World.create(renderer, opts);
    this.choreo = createMemeChoreo();
    this.duration = this.choreo.duration;
    this.ctrl = new CatController(this.world.cat, this.choreo);
    this.camera = this.world.camera;
    // simple treat placeholder (replaced by the human hand + niboshi later)
    this.treat = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.5, roughness: 0.4 }));
    this.treat.rotation.z = Math.PI / 2;
    this.world.scene.add(this.treat);
    this.camMode = opts.cam || 'pov';
  }
  setTime(t) {
    const cam = this.camera;
    const c = this.choreo.sample(t);
    // camera first (the cat looks at it)
    if (this.camMode === 'pov') {
      const s = c.shake;
      const n = (k, f) => fbm1(t * f, k);
      cam.position.set(c.camPos[0] + n(1, 0.35) * 0.006 * s, c.camPos[1] + n(2, 0.3) * 0.005 * s, c.camPos[2] + n(3, 0.33) * 0.006 * s);
      const tgt = new THREE.Vector3(...c.camTarget);
      cam.lookAt(tgt);
      cam.rotateZ(n(4, 0.25) * 0.012 * s);
      cam.rotateX(n(5, 0.9) * 0.0035 * s);
      cam.rotateY(n(6, 0.8) * 0.0035 * s);
      cam.fov = c.camFov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      if (this.world.post?.bokeh) this.world.post.bokeh.uniforms.focus.value = cam.position.distanceTo(tgt) * 1.0;
    }
    const cc = this.ctrl.update(t, cam);
    // treat
    const mouth = this.world.cat.rig.b.head.localToWorld(new THREE.Vector3(0, 0.0, 0.0).add(new THREE.Vector3(0, -0.019, 0.075)));
    const handPos = new THREE.Vector3(0.0, 0.30, 0.16);
    const k = Math.min(1, cc.human);
    this.treat.visible = cc.treatVis > 0.5 && k > 0.02;
    this.treat.position.lerpVectors(new THREE.Vector3(0.25, 0.55, 0.7), t > 1.9 ? mouth : handPos, t > 1.9 ? 1 : k);
  }
  render(t) { this.setTime(t); this.world.render(t); }
  debug(t) {
    this.setTime(t);
    const r = this.world.cat.rig;
    const p = (n) => r.worldPos(n).toArray().map((v) => +v.toFixed(4));
    const c = this.choreo.sample(t);
    return { handL: c.handL, handLSpace: c.handLSpace, wL: p('handL'), eL: p('foreArmL'), sL: p('upperArmL'), chest: p('chest'), pelvis: p('pelvis') };
  }
  resize(w, h) { this.world.resize(w, h); }
}
