// Assembles renderer settings, room, cat, camera, reflections and post-processing.
import * as THREE from 'three';
import { Cat } from './cat/cat.js';
import { createRoom } from './scene/room.js';
import { PlanarReflection } from './scene/reflection.js';
import { createPost } from './scene/post.js';
import { captureEnvironment } from './scene/envcapture.js';
import { loadAll } from './scene/textures.js';
import { LAYER_DEFAULT, LAYER_DETAIL, LAYER_FLOOR } from './scene/layers.js';

export class World {
  static async create(renderer, opts = {}) {
    const w = new World(renderer, opts);
    await w.init();
    return w;
  }
  constructor(renderer, opts) {
    this.renderer = renderer;
    this.opts = { shells: 40, post: true, ...opts };
  }
  async init() {
    const r = this.renderer;
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = this.opts.exposure ?? 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101010);
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.02, 60);
    this.camera.layers.enable(LAYER_DETAIL);
    this.camera.layers.enable(LAYER_FLOOR);
    this.reflection = new PlanarReflection({ scale: 0.5 });
    this.room = await createRoom({ renderer: r, reflection: this.reflection });
    this.scene.add(this.room.group);
    this.cat = await Cat.create({ shells: this.opts.shells, debug: this.opts.debug || 0 });
    this.scene.add(this.cat.group);
    this.cat.fur.layers.set(LAYER_DETAIL);
    this.cat.whiskers.layers.set(LAYER_DETAIL);
    this.cat.fur.userData.noGBuffer = true;
    this.cat.whiskers.userData.noGBuffer = true;
    await loadAll();
    // bake IBL from the room (without the cat)
    this.scene.updateMatrixWorld(true);
    this.reflection.setSize(256, 256);
    captureEnvironment(r, this.scene, new THREE.Vector3(0, 0.45, 0.2), { size: 256, hide: [this.cat.group] });
    this.scene.environmentIntensity = this.opts.envIntensity ?? 1.0;
    this.resize(innerWidth, innerHeight);
  }
  resize(w, h) {
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    const W = Math.round(w * pr), H = Math.round(h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.reflection.setSize(W, H);
    if (this.opts.post) {
      if (!this.post) this.post = createPost(this.renderer, this.scene, this.camera, { width: W, height: H, samples: this.opts.samples ?? 4, ao: this.opts.ao !== false, dof: this.opts.dof !== false, bloom: true });
      else this.post.setSize(W, H);
    }
  }
  // Runtime quality switch (see QUALITY in player.js): fur shells, post passes, shadow maps, reflection resolution.
  applyQuality(q) {
    if (q.shells !== undefined) this.cat.setShellCount(q.shells);
    this.post?.setEnabled({ ao: q.ao, dof: q.dof, bloom: q.bloom });
    if (q.shadow) {
      const setMap = (light, n) => {
        if (!light || light.shadow.mapSize.x === n) return;
        light.shadow.mapSize.set(n, n);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      };
      setMap(this.room.sun, q.shadow);
      setMap(this.room.rim, Math.max(256, q.shadow / 4));
    }
    if (q.refl && q.refl !== this.reflection.scale) {
      this.reflection.scale = q.refl;
      const pr = this.renderer.getPixelRatio();
      this.reflection.setSize(Math.round(this.width * pr), Math.round(this.height * pr));
    }
  }
  render(time = 0) {
    this.scene.updateMatrixWorld(true);
    this.reflection.update(this.renderer, this.scene, this.camera);
    if (this.post) {
      this.post.finish.uniforms.time.value = time;
      this.post.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }
}
