// Planar reflection for the polished floor (mirror camera + oblique near plane), blurred via mips.
import * as THREE from 'three';
import { LAYER_DEFAULT } from './layers.js';

export class PlanarReflection {
  constructor({ scale = 0.5 } = {}) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: 0,
    });
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(LAYER_DEFAULT);
    this.textureMatrix = new THREE.Matrix4();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.point = new THREE.Vector3(0, 0, 0);
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._l = new THREE.Vector3();
    this._r = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
  }
  setSize(w, h) { this.rt.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale))); }

  update(renderer, scene, camera) {
    const { normal, point } = this;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    const view = this._t.subVectors(point, camPos);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate().add(point);
    this._r.extractRotation(camera.matrixWorld);
    const look = this._l.set(0, 0, -1).applyMatrix4(this._r).add(camPos);
    const target = new THREE.Vector3().subVectors(point, look).reflect(normal).negate().add(point);
    const vc = this.camera;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(this._r).reflect(normal);
    vc.lookAt(target);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique clipping at the floor plane
    this._plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(vc.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix, e = pm.elements, q = this._q;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1.0;
    q.w = (1.0 + e[10]) / e[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1.0 - 0.0005; e[14] = clip.w;
    vc.projectionMatrixInverse.copy(pm).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
  }
}
