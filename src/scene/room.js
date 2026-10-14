// The living room: shell, window with daylight, furniture (Poly Haven CC0), lights.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { tex } from './textures.js';
import { createFloor } from './floor.js';
import { createPouf } from './pouf.js';

export const ROOM = { x0: -2.0, x1: 2.1, z0: -2.25, z1: 2.4, h: 2.6, wall: 0.12 };
const WIN = { z0: -1.95, z1: -0.40, y0: 0.42, y1: 2.28 };

const gltf = new GLTFLoader();
function loadModel(id) {
  return new Promise((res, rej) => gltf.load(`assets/ph/${id}/${id}_1k.gltf`, (g) => res(g.scene), undefined, rej));
}

function place(obj, { x = 0, z = 0, y = null, rotY = 0, scale = 1 } = {}) {
  obj.scale.setScalar(scale);
  obj.rotation.y = rotY;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.set(x, y ?? -box.min.y, z);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

export async function createRoom({ renderer, reflection }) {
  RectAreaLightUniformsLib.init();
  const group = new THREE.Group();
  group.name = 'room';
  const { x0, x1, z0, z1, h, wall } = ROOM;

  // ---------------------------------------------------------------- floor
  const floor = createFloor(reflection, { size: [x1 - x0, z1 - z0], center: [(x0 + x1) / 2, (z0 + z1) / 2] });
  group.add(floor);

  // ---------------------------------------------------------------- walls (boxes so they block the sun)
  const wallBase = 'assets/ph/beige_wall_002/beige_wall_002_';
  const wallMat = (w, hh) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.86, 0.83, 0.78),
    normalMap: tex(wallBase + 'nor_gl_1k.jpg', { repeat: [w / 1.5, hh / 1.5] }),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.88,
  });
  const box = (sx, sy, sz, px, py, pz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(px, py, pz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const W = x1 - x0, D = z1 - z0;
  box(W + 2 * wall, h, wall, (x0 + x1) / 2, h / 2, z0 - wall / 2, wallMat(W, h)); // back
  box(W + 2 * wall, h, wall, (x0 + x1) / 2, h / 2, z1 + wall / 2, wallMat(W, h)); // front (behind camera)
  box(wall, h, D, x1 + wall / 2, h / 2, (z0 + z1) / 2, wallMat(D, h)); // right
  // left wall with window opening
  const lx = x0 - wall / 2;
  const lm = wallMat(D, h);
  box(wall, WIN.y0, D, lx, WIN.y0 / 2, (z0 + z1) / 2, lm);
  box(wall, h - WIN.y1, D, lx, (h + WIN.y1) / 2, (z0 + z1) / 2, lm);
  box(wall, WIN.y1 - WIN.y0, WIN.z0 - z0, lx, (WIN.y0 + WIN.y1) / 2, (z0 + WIN.z0) / 2, lm);
  box(wall, WIN.y1 - WIN.y0, z1 - WIN.z1, lx, (WIN.y0 + WIN.y1) / 2, (WIN.z1 + z1) / 2, lm);
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.92 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2); ceil.receiveShadow = true;
  group.add(ceil);
  // baseboards
  const bbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.90, 0.89, 0.86), roughness: 0.42 });
  const bh = 0.085, bt = 0.014;
  box(W, bh, bt, (x0 + x1) / 2, bh / 2, z0 + bt / 2, bbMat);
  box(bt, bh, D, x1 - bt / 2, bh / 2, (z0 + z1) / 2, bbMat);
  box(bt, bh, WIN.z0 - z0, x0 + bt / 2, bh / 2, (z0 + WIN.z0) / 2, bbMat);
  box(bt, bh, z1 - WIN.z1, x0 + bt / 2, bh / 2, (WIN.z1 + z1) / 2, bbMat);
  box(bt, bh, WIN.z1 - WIN.z0, x0 + bt / 2, bh / 2, (WIN.z0 + WIN.z1) / 2, bbMat);

  // ---------------------------------------------------------------- window frame, glass, sill
  const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.92, 0.92, 0.90), roughness: 0.35 });
  const fw = 0.05, fd = 0.07;
  const fx = x0 - 0.02;
  box(fd, fw, WIN.z1 - WIN.z0, fx, WIN.y0 + fw / 2, (WIN.z0 + WIN.z1) / 2, frameMat);
  box(fd, fw, WIN.z1 - WIN.z0, fx, WIN.y1 - fw / 2, (WIN.z0 + WIN.z1) / 2, frameMat);
  box(fd, WIN.y1 - WIN.y0, fw, fx, (WIN.y0 + WIN.y1) / 2, WIN.z0 + fw / 2, frameMat);
  box(fd, WIN.y1 - WIN.y0, fw, fx, (WIN.y0 + WIN.y1) / 2, WIN.z1 - fw / 2, frameMat);
  box(fd, WIN.y1 - WIN.y0, 0.035, fx, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2, frameMat);
  box(fd * 0.8, 0.03, WIN.z1 - WIN.z0, fx, 1.55, (WIN.z0 + WIN.z1) / 2, frameMat);
  box(0.16, 0.025, WIN.z1 - WIN.z0 + 0.12, x0 + 0.04, WIN.y0 - 0.0125, (WIN.z0 + WIN.z1) / 2, frameMat); // sill
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.z1 - WIN.z0, WIN.y1 - WIN.y0), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 0.6, depthWrite: false,
  }));
  glass.rotation.y = Math.PI / 2; glass.position.set(x0 - 0.02, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  group.add(glass);

  // sheer curtains (folded planes)
  const curtainMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.95, 0.93, 0.89), map: tex('assets/ph/terlenka/terlenka_diff_1k.jpg', { srgb: true, repeat: [3, 6] }),
    roughness: 0.9, transparent: true, opacity: 0.62, side: THREE.DoubleSide, emissive: new THREE.Color(0.55, 0.52, 0.46), emissiveIntensity: 0.9,
    depthWrite: false,
  });
  for (const [za, zb] of [[WIN.z0 - 0.22, WIN.z0 + 0.42], [WIN.z1 - 0.38, WIN.z1 + 0.22]]) {
    const cg = new THREE.PlaneGeometry(zb - za, 2.42, 90, 1);
    const p = cg.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i);
      p.setZ(i, Math.sin(u * 55) * 0.028 + Math.sin(u * 23 + 1.3) * 0.012);
    }
    cg.computeVertexNormals();
    const c = new THREE.Mesh(cg, curtainMat);
    c.rotation.y = Math.PI / 2;
    c.position.set(x0 + 0.13, 2.42 / 2 + 0.06, (za + zb) / 2);
    c.renderOrder = 5;
    group.add(c);
  }
  // curtain rod
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, WIN.z1 - WIN.z0 + 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x8a8580, metalness: 0.8, roughness: 0.35 }));
  rod.rotation.x = Math.PI / 2; rod.position.set(x0 + 0.13, 2.47, (WIN.z0 + WIN.z1) / 2); group.add(rod);

  // ---------------------------------------------------------------- outside (HDRI backdrop)
  const hdr = await new RGBELoader().loadAsync('assets/ph/balcony/balcony_1k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const outside = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide, color: new THREE.Color(1.0, 1.0, 1.0) }));
  outside.rotation.y = Math.PI * 0.35;
  outside.position.set(0, 1.0, 0);
  group.add(outside);

  // ---------------------------------------------------------------- rug
  const rugBase = 'assets/ph/poly_wool_herringbone/poly_wool_herringbone_';
  const rugGeo = new THREE.BoxGeometry(2.3, 0.014, 1.55, 1, 1, 1);
  const rug = new THREE.Mesh(rugGeo, new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1.25, 1.08, 0.86), map: tex(rugBase + 'diff_1k.jpg', { srgb: true, repeat: [9, 6] }),
    normalMap: tex(rugBase + 'nor_gl_1k.jpg', { repeat: [9, 6] }), normalScale: new THREE.Vector2(1.6, 1.6), roughness: 1.0,
    roughnessMap: tex(rugBase + 'arm_1k.jpg', { repeat: [9, 6] }),
    sheen: 1.0, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.75, 0.66, 0.55), envMapIntensity: 0.5,
  }));
  rug.position.set(0.25, 0.006, -1.38); rug.receiveShadow = true; group.add(rug);

  // ---------------------------------------------------------------- furniture
  const [sofa, frame, sideTable, vase, plant, plant2, cabinet, basket, lamp, standFrame] = await Promise.all([
    'Sofa_01', 'hanging_picture_frame_02', 'side_table_01', 'ceramic_vase_01', 'potted_plant_02', 'potted_plant_04',
    'modern_wooden_cabinet', 'wicker_basket_01', 'modern_ceiling_lamp_01', 'standing_picture_frame_01',
  ].map(loadModel));
  group.add(place(sofa, { x: 0.25, z: z0 + 0.40 }));
  group.add(place(frame, { x: 0.25, y: 1.42, z: z0 + 0.002 }));
  group.add(place(sideTable, { x: -0.95, z: z0 + 0.36 }));
  group.add(place(vase, { x: -0.95, z: z0 + 0.36, y: 0.548, scale: 0.75 }));
  group.add(place(plant, { x: -1.62, z: z0 + 0.42, rotY: 0.6, scale: 1.25 }));
  group.add(place(cabinet, { x: x1 - 0.3, z: -0.55, rotY: -Math.PI / 2 }));
  {
    cabinet.updateMatrixWorld(true);
    const cb = new THREE.Box3().setFromObject(cabinet);
    group.add(place(plant2, { x: x1 - 0.28, z: cb.min.z + 0.25, y: cb.max.y }));
    group.add(place(standFrame, { x: x1 - 0.30, z: cb.max.z - 0.3, y: cb.max.y, rotY: -Math.PI / 2 }));
  }
  group.add(place(basket, { x: 1.45, z: z0 + 0.45, rotY: 0.3 }));
  group.add(place(lamp, { x: 0.25, y: h - 1.173, z: -1.15 }));

  // pink teddy pouf behind-left of the cat (as in the video)
  const pouf = createPouf();
  pouf.position.set(-0.52, 0, -0.62);
  group.add(pouf);

  // ---------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.82, 0.62), 3.0);
  sun.position.set(-11.0, 6.6, -6.8);
  sun.target.position.set(0.15, 0.0, 0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -2.6; sc.right = 2.6; sc.top = 2.4; sc.bottom = -2.4; sc.near = 6; sc.far = 22;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.012;
  group.add(sun, sun.target);

  const sky = new THREE.RectAreaLight(new THREE.Color(0.82, 0.88, 1.0), 2.6, WIN.z1 - WIN.z0, WIN.y1 - WIN.y0);
  sky.position.set(x0 + 0.05, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  sky.lookAt(0, (WIN.y0 + WIN.y1) / 2 - 0.4, (WIN.z0 + WIN.z1) / 2);
  group.add(sky);

  const pendant = new THREE.PointLight(new THREE.Color(1.0, 0.78, 0.52), 0.0, 0, 2); // daytime: lamp off
  pendant.position.set(0.25, h - 1.173 + 0.15, -1.15);
  group.add(pendant);

  // soft front fill (bounce light) as a narrow, very soft spot aimed at the cat only,
  // so the glossy floor shows no hot reflection of it
  const fill = new THREE.SpotLight(new THREE.Color(1.0, 0.93, 0.85), 2.2, 8, 0.2, 1.0, 2);
  fill.position.set(-0.95, 1.05, 1.15);
  fill.target.position.set(0, 0.30, 0);
  group.add(fill, fill.target);
  // warm practical lamp behind-right of the cat: second rim for the black fur
  const rim = new THREE.SpotLight(new THREE.Color(1.0, 0.78, 0.55), 3.5, 6, 0.6, 0.85, 2);
  rim.position.set(1.05, 0.95, -1.45);
  rim.target.position.set(0, 0.28, 0.0);
  rim.castShadow = true;
  rim.shadow.mapSize.set(1024, 1024);
  rim.shadow.bias = -0.0005; rim.shadow.normalBias = 0.01;
  group.add(rim, rim.target);

  const bounce = new THREE.HemisphereLight(new THREE.Color(0.95, 0.93, 0.9), new THREE.Color(0.55, 0.45, 0.35), 0.15);
  group.add(bounce);

  return { group, floor, pouf, sun, sky, pendant, rim, fill, bounce, outside, hdr, window: WIN };
}
