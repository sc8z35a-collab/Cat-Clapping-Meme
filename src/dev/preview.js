// Clay preview of generated meshes (development aid).
import * as THREE from 'three';

export async function startPreview(renderer, params) {
  const json = await (await fetch('assets/cat/preview.json')).json();
  const buf = await (await fetch('assets/cat/preview.bin')).arrayBuffer();
  const n = json.vertexCount;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, n * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, n * 12, n * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, n * 24, json.indexCount), 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a8f96);
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9b1a8, roughness: 0.55, flatShading: params.get('flat') === '1' });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403830, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 1.0, 0.9); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(-0.8, 0.5, -0.8); scene.add(rim);
  const views = {
    front: { pos: [0, 0.26, 1.0], target: [0, 0.24, 0], fov: 32 },
    side: { pos: [1.0, 0.26, 0], target: [0, 0.24, -0.05], fov: 34 },
    back: { pos: [0.3, 0.3, -1.0], target: [0, 0.22, -0.05], fov: 34 },
    q34: { pos: [0.6, 0.38, 0.75], target: [0, 0.24, -0.02], fov: 34 },
    face: { pos: [0.0, 0.40, 0.30], target: [0, 0.38, 0.03], fov: 30 },
    face34: { pos: [0.18, 0.41, 0.25], target: [0, 0.385, 0.03], fov: 30 },
    faceside: { pos: [0.30, 0.39, 0.04], target: [0, 0.385, 0.03], fov: 30 },
    hand: { pos: [0.25, 0.30, 0.35], target: [0.05, 0.215, 0.14], fov: 28 },
    handin: { pos: [-0.12, 0.25, 0.30], target: [0.05, 0.215, 0.15], fov: 26 },
    feet: { pos: [0.35, 0.12, 0.45], target: [0, 0.03, 0], fov: 30 },
    top: { pos: [0, 1.0, 0.05], target: [0, 0, -0.05], fov: 34 },
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
