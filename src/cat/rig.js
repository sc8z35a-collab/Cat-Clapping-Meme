// Pose utilities: Euler FK in the bind frame, two-bone IK with pole vectors, finger curls, look-at.
import * as THREE from 'three';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const DEG = Math.PI / 180;

export function eulerQuat(e, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler((e[0] || 0) * DEG, (e[1] || 0) * DEG, (e[2] || 0) * DEG, 'YXZ'));
}

export class Rig {
  constructor(asset, root) {
    this.root = root; // THREE.Object3D that holds the root bone
    this.b = asset.byName;
    this.rest = {}; // rest local positions
    this.restWorld = asset.restWorld;
    for (const [name, bone] of Object.entries(this.b)) this.rest[name] = bone.position.clone();
    this.boneList = asset.bones;
    this.tips = {};
    for (const jb of asset.json.bones) if (jb.tip) this.tips[jb.name] = new THREE.Vector3(...jb.tip);
    // bind-frame direction of each bone (towards its first child or tip)
    this.dir = {};
    for (const jb of asset.json.bones) {
      const child = asset.json.bones.find((c) => c.parent === jb.name);
      const p = this.restWorld[jb.name];
      const t = child ? this.restWorld[child.name] : (jb.tip ? new THREE.Vector3(...jb.tip) : null);
      if (t) this.dir[jb.name] = t.clone().sub(p).normalize();
    }
    this.fingerAxes = this.computeFingerAxes(asset.json);
  }

  computeFingerAxes(json) {
    const axes = {};
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      const P = new THREE.Vector3(-sign, 0, 0);
      for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
        for (let i = 0; i < 3; i++) {
          const name = `${f}${i}${s}`;
          const d = this.dir[name];
          if (!d) continue;
          // bend axis so that positive angle curls towards the palm
          const axis = new THREE.Vector3().crossVectors(P, d).normalize().multiplyScalar(-1);
          axes[name] = { axis, spread: P.clone() };
        }
      }
    }
    return axes;
  }

  reset() {
    for (const [name, bone] of Object.entries(this.b)) { bone.position.copy(this.rest[name]); bone.quaternion.identity(); }
  }

  setEuler(name, e) { eulerQuat(e, this.b[name].quaternion); }
  // multiply an extra rotation (bind frame euler) on top of current local rotation
  addEuler(name, e, w = 1) {
    _q1.setFromEuler(new THREE.Euler((e[0] || 0) * DEG * w, (e[1] || 0) * DEG * w, (e[2] || 0) * DEG * w, 'YXZ'));
    this.b[name].quaternion.multiply(_q1);
  }

  curlFinger(side, finger, curls, spread = 0) {
    for (let i = 0; i < 3; i++) {
      const name = `${finger}${i}${side}`;
      const ax = this.fingerAxes[name];
      if (!ax) continue;
      const q = this.b[name].quaternion;
      q.setFromAxisAngle(ax.axis, (curls[i] || 0) * DEG);
      if (i === 0 && spread) { _q1.setFromAxisAngle(ax.spread, spread * DEG * (side === 'L' ? 1 : -1)); q.premultiply(_q1); }
    }
  }

  worldPos(name, out = new THREE.Vector3()) { return this.b[name].getWorldPosition(out); }

  // Two-bone IK. a = upper bone, b = lower bone, c = end bone. target in world space.
  twoBoneIK(a, b, c, target, pole) {
    const A = this.b[a], Bn = this.b[b];
    A.updateWorldMatrix(true, false);
    const pa = A.getWorldPosition(new THREE.Vector3());
    const la = this.rest[b].length();
    const lb = this.rest[c].length();
    const toT = target.clone().sub(pa);
    let d = toT.length();
    d = THREE.MathUtils.clamp(d, Math.abs(la - lb) + 1e-4, la + lb - 1e-4);
    toT.normalize();
    const cosA = THREE.MathUtils.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const poleDir = pole.clone().sub(pa);
    poleDir.addScaledVector(toT, -poleDir.dot(toT));
    if (poleDir.lengthSq() < 1e-10) poleDir.set(0, 0, 1).addScaledVector(toT, -toT.z);
    poleDir.normalize();
    const elbow = pa.clone().addScaledVector(toT, la * cosA).addScaledVector(poleDir, la * sinA);
    this.aimBone(a, b, elbow);
    A.updateWorldMatrix(false, true);
    const tgt = pa.clone().addScaledVector(toT, d);
    this.aimBone(b, c, tgt);
    Bn.updateWorldMatrix(false, true);
  }

  // rotate bone `name` so that its child `child` points at world point p (swing only, keeps parent frame)
  aimBone(name, child, p) {
    const bone = this.b[name];
    const parent = bone.parent;
    parent.updateWorldMatrix(true, false);
    bone.updateWorldMatrix(false, false);
    const pw = bone.getWorldPosition(new THREE.Vector3());
    const want = p.clone().sub(pw).normalize();
    const pq = parent.getWorldQuaternion(new THREE.Quaternion());
    const wantLocal = want.applyQuaternion(pq.invert());
    const bindDir = this.rest[child].clone().normalize();
    bone.quaternion.setFromUnitVectors(bindDir, wantLocal);
  }

  // set world orientation of a bone given a target world quaternion
  setWorldQuat(name, qWorld) {
    const bone = this.b[name];
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_q1);
    bone.quaternion.copy(_q1.invert().multiply(qWorld));
  }

  // Hand orientation from desired finger direction and palm normal (world space).
  handQuat(side, fingers, palm, out = new THREE.Quaternion()) {
    const s = side === 'L' ? 1 : -1;
    const F0 = new THREE.Vector3(0, 0.10, 1).normalize();
    const P0 = new THREE.Vector3(-s, 0, 0);
    const T0 = new THREE.Vector3().crossVectors(P0, F0);
    const F1 = fingers.clone().normalize();
    const P1 = palm.clone().addScaledVector(F1, -palm.dot(F1)).normalize();
    const T1 = new THREE.Vector3().crossVectors(P1, F1);
    const m0 = new THREE.Matrix4().makeBasis(F0, T0, P0);
    const m1 = new THREE.Matrix4().makeBasis(F1, T1, P1);
    m1.multiply(m0.transpose());
    return out.setFromRotationMatrix(m1);
  }

  // distribute part of the hand twist around the forearm axis into the forearm bone
  shareTwist(fore, hand, share = 0.5) {
    const H = this.b[hand], Fb = this.b[fore];
    const axis = this.rest[hand].clone().normalize();
    const q = H.quaternion;
    const proj = _v1.set(q.x, q.y, q.z).projectOnVector(axis);
    const twist = _q2.set(proj.x, proj.y, proj.z, q.w).normalize();
    const part = _q3.identity().slerp(twist, share);
    Fb.quaternion.multiply(part);
    H.quaternion.premultiply(part.invert());
  }
}
