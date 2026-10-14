// The meme sequence: world + choreography + POV camera + props.
import * as THREE from 'three';
import { World } from '../world.js';
import { CatController } from '../anim/controller.js';
import { createMemeChoreo } from '../anim/memeChoreo.js';
import { fbm1, ease } from '../anim/tracks.js';
import { createHumanHand, handBasis } from '../scene/human.js';

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
    // the human's hand offering a niboshi
    this.human = await createHumanHand();
    this.world.scene.add(this.human.group);
    this.handQ = handBasis(new THREE.Vector3(-0.86, -0.30, -0.42));
    this.treatTarget = new THREE.Vector3(0.006, 0.300, 0.122); // fish head when offered
    const off = this.human.fishHeadLocal.clone().applyQuaternion(this.handQ);
    this.handReady = this.treatTarget.clone().sub(off);
    this.handAway = this.handReady.clone().add(new THREE.Vector3(0.42, 0.22, 0.30));
    this.fishInMouth = new THREE.Object3D();
    this.camMode = opts.cam || 'pov';
    if (opts.clay) {
      const cat = this.world.cat;
      cat.body.material = new THREE.MeshStandardMaterial({ color: 0xb9b1a8, roughness: 0.6 });
      cat.fur.visible = false;
      cat.whiskers.visible = false;
    }
    this.side = opts.side ? new THREE.Vector3(...opts.side) : null;
  }
  setTime(t) {
    const cam = this.camera;
    const c = this.choreo.sample(t);
    // camera first (the cat looks at it)
    const headPos = this.world.cat.rig.b.head.getWorldPosition(new THREE.Vector3());
    if (this.camMode === 'cinema') {
      // slow cinematic orbit: wide establishing -> low hero angle
      const u = t / this.duration;
      const az = THREE.MathUtils.degToRad(-38 + 70 * (0.5 - 0.5 * Math.cos(Math.PI * u)));
      const dist = 1.15 - 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      const h = 0.62 - 0.24 * Math.sin(Math.PI * Math.min(1, u * 1.1));
      cam.position.set(Math.sin(az) * dist, h + fbm1(t * 0.3, 9) * 0.01, Math.cos(az) * dist);
      const tgt = new THREE.Vector3(0, 0.25 + 0.06 * Math.min(1, t / 4.5), 0.02);
      cam.lookAt(tgt);
      cam.fov = 36; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      if (this.world.post?.bokeh) this.world.post.bokeh.uniforms.focus.value = cam.position.distanceTo(headPos);
    } else if (this.camMode === 'free') {
      cam.updateMatrixWorld();
      if (this.world.post?.bokeh) this.world.post.bokeh.uniforms.focus.value = cam.position.distanceTo(headPos);
    } else if (this.side) {
      cam.position.copy(this.side);
      cam.lookAt(...(this.opts.look || [0, 0.25, 0.05]));
      cam.fov = this.opts.fov || 34; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    } else if (this.camMode === 'pov') {
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
    // human hand along a curved path (comes from below-right of the phone)
    const c0 = this.choreo.sample(t);
    const k = Math.max(0, Math.min(1, c0.human));
    const g = this.human.group;
    g.visible = k > 0.001;
    const p = new THREE.Vector3().lerpVectors(this.handAway, this.handReady, k);
    p.y += Math.sin(k * Math.PI) * 0.03;
    p.x += fbm1(t * 1.3, 77) * 0.003 * k; p.y += fbm1(t * 1.1, 78) * 0.003 * k;
    g.position.copy(p);
    g.quaternion.copy(this.handQ);
    g.rotateY((1 - k) * 0.35);
    g.updateMatrixWorld(true);
    const T = this.choreo.T;
    const fish = this.human.fishHolder;
    // the cat bites: fish moves from the fingers into the cat's mouth, then is eaten
    const head = this.world.cat.rig.b.head;
    let lookTreat = this.treatTarget;
    if (t < T.bite) {
      if (fish.parent !== g) g.add(fish);
      fish.position.copy(this.human.fishHeadLocal); fish.rotation.set(0, Math.PI, 0); fish.scale.setScalar(1);
    }
    const cc = this.ctrl.update(t, cam, { lookAt: lookTreat, overrides: this.opts.overrides });
    if (t >= T.bite) {
      if (fish.parent !== head) head.add(fish);
      const rest = this.world.cat.asset.restWorld.head;
      const mouth = new THREE.Vector3(0, 0.3618 - rest.y, 0.067 - rest.z);
      const eat = Math.min(1, Math.max(0, (t - T.bite) / (2.42 - T.bite)));
      fish.position.copy(mouth).add(new THREE.Vector3(0.002, -0.002, 0.004 - 0.02 * ease.inQuad(eat)));
      fish.rotation.set(0.15, Math.PI + 0.25, 0);
      fish.scale.set(1, 1, Math.max(0.001, 1 - ease.inCubic(eat)));
    }
    fish.visible = cc.treatVis > 0.5;
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
