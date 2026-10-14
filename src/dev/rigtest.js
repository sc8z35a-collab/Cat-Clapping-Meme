// Development view: skinned cat with clay material to test weights and poses.
import * as THREE from 'three';
import { loadCatAsset } from '../cat/catAsset.js';
import { Rig } from '../cat/rig.js';

export async function startRigTest(renderer, params) {
  const asset = await loadCatAsset();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a8f96);
  const group = new THREE.Group();
  scene.add(group);
  group.add(asset.bones[0]);
  let mat = new THREE.MeshStandardMaterial({ color: 0xb9b1a8, roughness: 0.55 });
  const wbone = params.get('wbone');
  if (wbone) {
    const bi = asset.bones.findIndex((b) => b.name === wbone);
    const si = asset.geo.getAttribute('skinIndex'), sw = asset.geo.getAttribute('skinWeight');
    const col = new Float32Array(si.count * 3);
    for (let v = 0; v < si.count; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.array[v * 4 + k] === bi) w += sw.array[v * 4 + k] / 255;
      col[v * 3] = w; col[v * 3 + 1] = 0.15; col[v * 3 + 2] = 1 - w;
    }
    asset.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  }
  const mesh = new THREE.SkinnedMesh(asset.geo, mat);
  group.add(mesh);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(asset.bones);
  mesh.bind(skeleton);
  mesh.morphTargetInfluences[0] = Number(params.get('grin') || 0);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const attach = (geo, boneName, material) => {
    const m = new THREE.Mesh(geo, material);
    m.position.copy(asset.restWorld[boneName]).negate();
    asset.byName[boneName].add(m);
    return m;
  };
  if (params.get('teeth') !== '0') { attach(asset.teethUpper, 'head', white); attach(asset.teethLower, 'jaw', white); }
  const lips = attach(asset.lipsGeo, 'head', new THREE.MeshStandardMaterial({ color: 0x553333, roughness: 0.4 }));
  lips.morphTargetInfluences[0] = Number(params.get('grin') || 0);
  lips.visible = Number(params.get('grin') || 0) > 0.01;
  // eyes
  for (const e of asset.json.head.eyes) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(asset.json.head.eyeRadius, 32, 16), new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.1 }));
    attach(eye.geometry, 'head', eye.material).position.add(new THREE.Vector3(...e.center));
  }
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403830, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 1.0, 0.9); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(-0.8, 0.5, -0.8); scene.add(rim);

  const rig = new Rig(asset, group);
  const pose = params.get('pose') || 'bind';
  if (pose === 'test') {
    rig.setEuler('spine1', [8, 0, 0]);
    rig.setEuler('chest', [-6, 10, 0]);
    rig.setEuler('head', [-12, 15, 8]);
    rig.setEuler('jaw', [10, 0, 0]);
    rig.setEuler('earL', [0, 0, -20]);
    rig.setEuler('tail1', [0, 30, 0]); rig.setEuler('tail3', [0, 30, 0]); rig.setEuler('tail5', [0, 35, 0]);
    group.updateMatrixWorld(true);
    // clap pose with IK
    const tL = new THREE.Vector3(0.008, 0.25, 0.13), tR = new THREE.Vector3(-0.008, 0.25, 0.13);
    rig.twoBoneIK('upperArmL', 'foreArmL', 'handL', tL, new THREE.Vector3(0.2, 0.1, -0.1));
    rig.twoBoneIK('upperArmR', 'foreArmR', 'handR', tR, new THREE.Vector3(-0.2, 0.1, -0.1));
    rig.setWorldQuat('handL', rig.handQuat('L', new THREE.Vector3(0, 1, 0.8), new THREE.Vector3(-1, 0, 0)));
    rig.setWorldQuat('handR', rig.handQuat('R', new THREE.Vector3(0, 1, 0.8), new THREE.Vector3(1, 0, 0)));
    rig.shareTwist('foreArmL', 'handL', 0.5); rig.shareTwist('foreArmR', 'handR', 0.5);
    for (const f of ['index', 'middle', 'ring', 'pinky']) { rig.curlFinger('L', f, [10, 15, 8]); rig.curlFinger('R', f, [60, 80, 40]); }
    rig.curlFinger('R', 'thumb', [20, 30, 20]);
    // sitting-ish legs
    rig.b.pelvis.position.y -= 0.03;
    group.updateMatrixWorld(true);
    for (const s of ['L', 'R']) {
      const foot = rig.restWorld['foot' + s].clone();
      const knee = rig.restWorld['shin' + s].clone().add(new THREE.Vector3(0, 0.05, 0.3));
      rig.twoBoneIK('thigh' + s, 'shin' + s, 'foot' + s, foot, knee);
    }
  }
  group.updateMatrixWorld(true);

  const views = {
    front: { pos: [0, 0.26, 1.0], target: [0, 0.24, 0], fov: 32 },
    q34: { pos: [0.6, 0.38, 0.75], target: [0, 0.22, -0.02], fov: 34 },
    side: { pos: [1.0, 0.26, 0], target: [0, 0.24, -0.05], fov: 34 },
    face: { pos: [0.0, 0.39, 0.30], target: [0, 0.375, 0.03], fov: 26 },
    face34: { pos: [0.16, 0.40, 0.26], target: [0, 0.375, 0.03], fov: 26 },
    faceside: { pos: [0.30, 0.385, 0.06], target: [0, 0.375, 0.03], fov: 28 },
    hands: { pos: [0.15, 0.32, 0.45], target: [0, 0.24, 0.12], fov: 28 },
  };
  const v = views[params.get('view') || 'q34'];
  const camera = new THREE.PerspectiveCamera(v.fov, innerWidth / innerHeight, 0.01, 10);
  camera.position.set(...v.pos);
  camera.lookAt(...v.target);
  return {
    render() { renderer.render(scene, camera); },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
  };
}
