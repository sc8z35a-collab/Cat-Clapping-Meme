// Applies choreography + procedural secondary motion to the cat rig every frame.
import * as THREE from 'three';
import { fbm1 } from './tracks.js';

const DEG = Math.PI / 180;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const eq = (e, out = new THREE.Quaternion()) => out.setFromEuler(new THREE.Euler(e[0] * DEG, e[1] * DEG, e[2] * DEG, 'YXZ'));

export class CatController {
  constructor(cat, choreo) {
    this.cat = cat;
    this.rig = cat.rig;
    this.choreo = choreo;
    this.B = cat.rig.b;
    this.restWorld = cat.rig.restWorld;
    // rest (bind) world matrices in cat-root space for space conversions
    this.restMat = {};
    for (const n of ['chest', 'head']) this.restMat[n] = new THREE.Matrix4().makeTranslation(this.restWorld[n]);
    this.footRest = { L: this.restWorld.footL.clone(), R: this.restWorld.footR.clone() };
    this.blinkTimes = [0.9, 3.9, 6.25, 9.95, 11.6, 12.9];
  }

  spaceMatrix(name, out) {
    // maps bind-space points to current world, following bone `name`
    const bone = this.B[name];
    bone.updateWorldMatrix(true, false);
    return out.copy(bone.matrixWorld).multiply(_m2.copy(this.restMat[name]).invert());
  }

  update(t, camera) {
    const cat = this.cat, B = this.B, rig = this.rig;
    const c = this.choreo.sample(t);
    rig.reset();
    const root = cat.group;
    root.updateMatrixWorld(true);

    // ---------------------------------------------------------------- breathing & micro motion
    const breath = Math.sin(t * 2 * Math.PI * 0.42);
    const micro = (s) => fbm1(t * 0.6, s) * 1.0;

    // pelvis
    const pp = c.pelvisPos;
    B.pelvis.position.add(_v.set(pp[0], pp[1], pp[2]));
    eq(c.pelvisRot, B.pelvis.quaternion);
    // spine distributed
    const sp = c.spine;
    const sw = [0.28, 0.34, 0.38];
    ['spine1', 'spine2', 'chest'].forEach((n, i) => {
      eq([sp[0] * sw[i] + (i === 2 ? breath * 0.8 : 0), sp[1] * sw[i] + micro(i) * 0.6, sp[2] * sw[i] + micro(i + 5) * 0.4], B[n].quaternion);
    });
    eq([c.neck[0] + micro(11) * 0.8, c.neck[1] + micro(12), c.neck[2]], B.neck.quaternion);
    eq([c.head[0] + micro(13), c.head[1] + micro(14) * 1.5, c.head[2] + micro(15)], B.head.quaternion);
    root.updateMatrixWorld(true);

    // look at camera (blend), split across neck/head
    if (camera && c.look > 0.001) {
      for (const [bn, share] of [['neck', 0.35], ['head', 0.65]]) {
        const bone = B[bn];
        bone.updateWorldMatrix(true, false);
        const hp = B.head.getWorldPosition(_v);
        const want = _v2.copy(camera.position).sub(hp).normalize();
        const headQ = B.head.getWorldQuaternion(_q);
        const fwd = new THREE.Vector3(0, 0.05, 1).normalize().applyQuaternion(headQ);
        const delta = new THREE.Quaternion().setFromUnitVectors(fwd, want);
        const part = new THREE.Quaternion().slerp(delta, c.look * share);
        const bw = bone.getWorldQuaternion(new THREE.Quaternion());
        const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
        bone.quaternion.copy(pw.invert().multiply(part.multiply(bw)));
        bone.updateWorldMatrix(false, true);
      }
    }

    // jaw
    eq([c.jaw, 0, 0], B.jaw.quaternion);

    // ---------------------------------------------------------------- legs (feet planted)
    root.updateMatrixWorld(true);
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      const target = root.localToWorld(this.footRest[s].clone());
      const kneeHint = root.localToWorld(this.restWorld['shin' + s].clone().add(new THREE.Vector3(0.05 * sign, 0.10, 0.25)));
      rig.twoBoneIK('thigh' + s, 'shin' + s, 'foot' + s, target, kneeHint);
      // keep the foot flat (bind orientation in world)
      rig.setWorldQuat('foot' + s, root.getWorldQuaternion(_q));
    }

    // ---------------------------------------------------------------- arms
    const chestM = this.spaceMatrix('chest', new THREE.Matrix4());
    const headM = this.spaceMatrix('head', new THREE.Matrix4());
    const rootM = root.matrixWorld;
    const toWorld = (p, w) => {
      const a = V(p).applyMatrix4(rootM).multiplyScalar(w[0]);
      const b = V(p).applyMatrix4(chestM).multiplyScalar(w[1]);
      const d = V(p).applyMatrix4(headM).multiplyScalar(w[2]);
      return a.add(b).add(d).divideScalar(Math.max(1e-6, w[0] + w[1] + w[2]));
    };
    const dirToWorld = (d, w) => {
      const r = new THREE.Matrix3();
      const a = V(d).applyMatrix3(r.setFromMatrix4(rootM)).multiplyScalar(w[0]);
      const b = V(d).applyMatrix3(r.setFromMatrix4(chestM)).multiplyScalar(w[1]);
      const e = V(d).applyMatrix3(r.setFromMatrix4(headM)).multiplyScalar(w[2]);
      return a.add(b).add(e).normalize();
    };
    for (const s of ['L', 'R']) {
      const w = c['hand' + s + 'Space'];
      const target = toWorld(c['hand' + s], w);
      const sh = rig.worldPos('upperArm' + s, new THREE.Vector3());
      const pole = sh.clone().add(V(c['elbow' + s]).applyMatrix3(new THREE.Matrix3().setFromMatrix4(rootM)));
      rig.twoBoneIK('upperArm' + s, 'foreArm' + s, 'hand' + s, target, pole);
      const q = rig.handQuat(s, dirToWorld(c['hand' + s + 'Dir'], w), dirToWorld(c['hand' + s + 'Palm'], w));
      rig.setWorldQuat('hand' + s, q);
      rig.shareTwist('foreArm' + s, 'hand' + s, 0.55);
      // fingers
      const cu = c['curl' + s], spr = c['spread' + s];
      const fing = ['index', 'middle', 'ring', 'pinky'];
      fing.forEach((f, i) => {
        const var_ = 1 + (i - 1.5) * 0.08;
        rig.curlFinger(s, f, [cu[0] * var_ + i * 1.5, cu[1] * var_ + i, cu[2] * var_], spr * (1.5 - i));
      });
      rig.curlFinger(s, 'thumb', c['thumb' + s]);
    }

    // ---------------------------------------------------------------- tail
    const N = 8;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const wave = Math.sin(t * 2.3 - i * 0.65) * c.tailWag * (0.3 + u);
      const curl = c.tailCurl * (u * u) * 0.5 + (i > 2 ? 4 : 0);
      const lift = (i < 2 ? c.tailLift : -c.tailLift * 0.3);
      eq([lift + fbm1(t * 0.5, 40 + i) * 2, curl / 4 + wave, 0], B['tail' + i].quaternion);
    }
    // ears (plus occasional flicks)
    const flick = (t0) => Math.exp(-(((t - t0) / 0.06) ** 2)) * 18;
    const fl = flick(2.9) + flick(7.0) + flick(11.2);
    const fr = flick(3.0) + flick(6.4) + flick(12.0);
    eq([c.ears[0] - fl * 0.3, c.ears[1], -c.ears[2] - fl], B.earL.quaternion);
    eq([c.ears[0] - fr * 0.3, -c.ears[1], c.ears[2] + fr], B.earR.quaternion);

    // ---------------------------------------------------------------- face
    cat.setGrin(c.grin);
    let blink = 0;
    for (const bt of this.blinkTimes) { const d = (t - bt) / 0.075; if (d > -1 && d < 2.2) blink = Math.max(blink, d < 0 ? 1 + d : Math.max(0, 1 - d / 2.2)); }
    cat.state.blink = Math.min(1, blink * 1.05);
    cat.state.squint = c.squint;
    cat.updateLids();
    cat.setPupil(c.pupil);
    root.updateMatrixWorld(true);
    if (camera) cat.lookEyesAt(camera.position, 1);
    return c;
  }
}
