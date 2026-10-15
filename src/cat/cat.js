// The Black Cat: skinned body + fur shells + human grin + eyes + whiskers, with a rig.
import * as THREE from 'three';
import { loadCatAsset } from './catAsset.js';
import { Rig } from './rig.js';
import { createStrandTexture } from './strandTexture.js';
import {
  createCatUniforms, createCatMaterial, createIrisTexture, createEyeMaterial,
  createTeethMaterial, createLipMaterial, createWhiskerMaterial, createLidMaterial,
} from './materials.js';

export class Cat {
  static async create(opts = {}) {
    const asset = await loadCatAsset(opts.base);
    return new Cat(asset, opts);
  }

  constructor(asset, { shells = 40, debug = 0 } = {}) {
    this.asset = asset;
    const json = asset.json;
    this.group = new THREE.Group();
    this.group.name = 'cat';
    const rootBone = asset.bones[0];
    this.group.add(rootBone);

    this.strandTex = createStrandTexture();
    this.uniforms = createCatUniforms(this.strandTex);
    this.uniforms.furScale.value = json.body.furScale;

    // base mesh
    this.baseMaterial = createCatMaterial({ uniforms: this.uniforms, shell: false, debug });
    this.body = new THREE.SkinnedMesh(asset.geo, this.baseMaterial);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    this.group.add(this.body);

    // fur shells (instanced)
    this.shellCount = shells;
    this.furGeo = this.buildShellGeometry(asset.furGeo, shells);
    this.furMaterial = createCatMaterial({ uniforms: this.uniforms, shell: true, debug });
    this.fur = new THREE.SkinnedMesh(this.furGeo, this.furMaterial);
    this.fur.frustumCulled = false;
    this.fur.receiveShadow = true;
    this.fur.castShadow = false;
    this.fur.renderOrder = 2;
    this.group.add(this.fur);

    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(asset.bones);
    this.body.bind(this.skeleton);
    this.fur.bind(this.skeleton);

    const attach = (obj, boneName) => {
      obj.position.copy(asset.restWorld[boneName]).negate();
      asset.byName[boneName].add(obj);
      return obj;
    };

    // grin: teeth + lips
    const grinInfo = json.head.grin;
    this.teethMaterial = createTeethMaterial(grinInfo, json.head);
    this.teethUpper = attach(new THREE.Mesh(asset.teethUpper, this.teethMaterial), 'head');
    this.teethLower = attach(new THREE.Mesh(asset.teethLower, this.teethMaterial), 'jaw');
    for (const t of [this.teethUpper, this.teethLower]) { t.castShadow = false; t.receiveShadow = true; }
    this.lips = attach(new THREE.Mesh(asset.lipsGeo, createLipMaterial()), 'head');
    this.lips.receiveShadow = true;
    this.lips.visible = false;

    // eyes + lids
    this.irisTex = createIrisTexture();
    this.eyeMaterial = createEyeMaterial(this.irisTex);
    this.lidMaterial = createLidMaterial();
    this.eyes = [];
    const R = json.head.eyeRadius;
    const eyeGeo = new THREE.SphereGeometry(R, 64, 48);
    eyeGeo.rotateX(Math.PI / 2); // poles along z so the cornea is well tessellated
    const upperLidGeo = new THREE.SphereGeometry(R + 0.00045, 48, 16, 0, Math.PI, 0, Math.PI / 2 + 0.2);
    const lowerLidGeo = new THREE.SphereGeometry(R + 0.00035, 48, 16, 0, Math.PI, Math.PI / 2 - 0.2, Math.PI / 2 + 0.2);
    for (const e of json.head.eyes) {
      const holder = new THREE.Group();
      holder.position.set(...e.center);
      const dir = new THREE.Vector3(...e.dir);
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      attach(holder, 'head').position.add(new THREE.Vector3(...e.center));
      const ball = new THREE.Mesh(eyeGeo, this.eyeMaterial);
      holder.add(ball);
      const upper = new THREE.Mesh(upperLidGeo, this.lidMaterial);
      const lower = new THREE.Mesh(lowerLidGeo, this.lidMaterial);
      holder.add(upper, lower);
      this.eyes.push({ side: e.side, holder, ball, upper, lower, rest: holder.quaternion.clone(), dir });
    }

    // whiskers
    this.whiskers = attach(this.buildWhiskers(json.whiskers), 'head');

    this.rig = new Rig(asset, this.group);
    this.state = { grin: 0, blink: 0, squint: 0, pupil: 0.42 };
  }

  buildShellGeometry(src, count) {
    const g = new THREE.InstancedBufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
    g.morphAttributes = src.morphAttributes;
    g.morphTargetsRelative = src.morphTargetsRelative;
    g.setIndex(src.index);
    const sh = new Float32Array(count);
    for (let i = 0; i < count; i++) sh[i] = (i + 1) / count;
    g.setAttribute('shell', new THREE.InstancedBufferAttribute(sh, 1));
    g.instanceCount = count;
    g.boundingSphere = src.boundingSphere.clone();
    return g;
  }

  setShellCount(n) {
    if (n === this.shellCount) return;
    const sh = new Float32Array(n);
    for (let i = 0; i < n; i++) sh[i] = (i + 1) / n;
    this.furGeo.setAttribute('shell', new THREE.InstancedBufferAttribute(sh, 1));
    this.furGeo.instanceCount = n;
    this.shellCount = n;
  }

  buildWhiskers(list) {
    const pos = [], col = [], nrm = [], idx = [];
    const SEG = 14, RAD = 5;
    const up = new THREE.Vector3(0, 1, 0);
    for (const w of list) {
      const root = new THREE.Vector3(...w.root);
      const dir = new THREE.Vector3(...w.dir).normalize();
      const pts = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const p = root.clone().addScaledVector(dir, w.len * t);
        p.y -= w.droop * w.len * t * t;
        p.z += 0.08 * w.len * t * t;
        pts.push(p);
      }
      const base = pos.length / 3;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const p = pts[i];
        const tan = (i < SEG ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
        const n1 = new THREE.Vector3().crossVectors(tan, up).normalize();
        if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
        const n2 = new THREE.Vector3().crossVectors(tan, n1).normalize();
        const r = w.thick * 0.62 * (1 - t) ** 1.1 + 0.000012;
        const c = w.white ? [0.42, 0.41, 0.39] : [0.012, 0.011, 0.011];
        const tipFade = w.white ? 1 - 0.25 * t : 1;
        for (let k = 0; k < RAD; k++) {
          const a = (k / RAD) * Math.PI * 2;
          const n = n1.clone().multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a));
          pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
          nrm.push(n.x, n.y, n.z);
          col.push(c[0] * tipFade, c[1] * tipFade, c[2] * tipFade);
        }
      }
      for (let i = 0; i < SEG; i++) for (let k = 0; k < RAD; k++) {
        const a = base + i * RAD + k, b = base + i * RAD + ((k + 1) % RAD);
        const c2 = a + RAD, d = b + RAD;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, createWhiskerMaterial());
    m.castShadow = false;
    return m;
  }

  setGrin(v) {
    this.state.grin = v;
    this.uniforms.grin.value = v;
    this.body.morphTargetInfluences[0] = v;
    this.fur.morphTargetInfluences[0] = v;
    const open = THREE.MathUtils.smoothstep(v, 0.0, 1.0);
    this.lips.morphTargetInfluences[0] = open;
    this.lips.visible = v > 0.012;
    this.teethMaterial.userData.uniforms.mouthOpen.value = open;
    this.teethUpper.visible = this.teethLower.visible = v > 0.012;
    this.whiskers.position.y = this.whiskerBaseY + 0.0016 * v;
  }

  get whiskerBaseY() { return -this.asset.restWorld.head.y; }

  // blink: 0 open .. 1 closed ; squint narrows lids (used when grinning)
  updateLids() {
    const { blink, squint } = this.state;
    for (const e of this.eyes) {
      // lid edge polar angle = base edge + rotation; rest keeps lids hidden behind the socket rim
      const up = THREE.MathUtils.lerp(-0.98, 0.26, blink);
      const lo = THREE.MathUtils.lerp(0.88, 0.58, Math.max(blink, squint * 0.9));
      e.upper.rotation.x = THREE.MathUtils.lerp(up, Math.max(up, -0.72), squint);
      e.lower.rotation.x = lo;
    }
  }

  setPupil(v) { this.state.pupil = v; this.eyeMaterial.userData.uniforms.pupil.value.set(v * 0.78, v); }

  // aim eyeballs at a world target
  lookEyesAt(target, amount = 1) {
    for (const e of this.eyes) {
      const holder = e.holder;
      holder.parent.updateWorldMatrix(true, false);
      const wp = holder.getWorldPosition(new THREE.Vector3());
      const dirW = target.clone().sub(wp).normalize();
      const pq = holder.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const dirL = dirW.applyQuaternion(pq);
      const restDir = e.dir.clone();
      // limit rotation
      const q = new THREE.Quaternion().setFromUnitVectors(restDir, dirL);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      const maxA = 0.45;
      const s = ang > maxA ? maxA / ang : 1;
      const qq = new THREE.Quaternion().slerp(q, s * amount);
      e.ball.quaternion.copy(e.rest.clone().invert().multiply(qq).multiply(e.rest));
    }
  }
}
