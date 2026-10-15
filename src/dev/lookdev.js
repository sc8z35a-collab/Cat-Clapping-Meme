// Look-dev scene: the cat under a simple interior-like light rig.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Cat } from '../cat/cat.js';

export async function startLookdev(renderer, params) {
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = Number(params.get('exp') || 1.0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5b5650);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = Number(params.get('env') || 0.6);
  const cat = await Cat.create({ shells: Number(params.get('shells') || 40), debug: Number(params.get('dbg') || 0) });
  if (params.get('noshell')) cat.fur.visible = false;
  scene.add(cat.group);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: 0xcdbfa9, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const sun = new THREE.DirectionalLight(0xfff1dc, Number(params.get('sun') || 3.0));
  sun.position.set(0.9, 1.4, 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -0.5; sun.shadow.camera.right = 0.5; sun.shadow.camera.top = 0.6; sun.shadow.camera.bottom = -0.3;
  sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 4;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.002; sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6); fill.position.set(-1, 0.6, 0.8); scene.add(fill);

  const grin = Number(params.get('grin') || 0);
  cat.setGrin(grin);
  cat.state.squint = grin;
  cat.updateLids();
  cat.setPupil(Number(params.get('pupil') || 0.5));
  const rig = cat.rig;
  if (params.get('pose') === 'clap') {
    cat.group.updateMatrixWorld(true);
    const tL = new THREE.Vector3(0.006, 0.255, 0.115), tR = new THREE.Vector3(-0.006, 0.255, 0.115);
    rig.twoBoneIK('upperArmL', 'foreArmL', 'handL', tL, new THREE.Vector3(0.25, 0.0, -0.05));
    rig.twoBoneIK('upperArmR', 'foreArmR', 'handR', tR, new THREE.Vector3(-0.25, 0.0, -0.05));
    rig.setWorldQuat('handL', rig.handQuat('L', new THREE.Vector3(0.1, 1, 0.9), new THREE.Vector3(-1, 0, 0.1)));
    rig.setWorldQuat('handR', rig.handQuat('R', new THREE.Vector3(-0.1, 1, 0.9), new THREE.Vector3(1, 0, 0.1)));
    rig.shareTwist('foreArmL', 'handL', 0.5); rig.shareTwist('foreArmR', 'handR', 0.5);
  }
  cat.group.updateMatrixWorld(true);
  const camTarget = new THREE.Vector3(0, 0.30, 0);
  const views = {
    pov: { pos: [0.05, 0.95, 0.75], target: [0, 0.24, 0], fov: 40 },
    front: { pos: [0, 0.30, 0.95], target: [0, 0.25, 0], fov: 30 },
    q34: { pos: [0.55, 0.40, 0.70], target: [0, 0.24, -0.02], fov: 32 },
    face: { pos: [0.0, 0.39, 0.30], target: [0, 0.375, 0.03], fov: 26 },
    face34: { pos: [0.15, 0.40, 0.26], target: [0, 0.375, 0.03], fov: 26 },
    back: { pos: [0.4, 0.40, -0.75], target: [0, 0.22, -0.05], fov: 32 },
  };
  const v = views[params.get('view') || 'front'];
  const camera = new THREE.PerspectiveCamera(v.fov, innerWidth / innerHeight, 0.01, 20);
  camera.position.set(...v.pos);
  camera.lookAt(...v.target);
  cat.lookEyesAt(camera.position);
  return {
    render() { renderer.render(scene, camera); },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
  };
}
