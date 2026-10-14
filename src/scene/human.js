// The human's hand (POV) offering a niboshi (dried sardine) to the cat.
import * as THREE from 'three';

function skinMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.9, 0.6, 0.5), clearcoat: 0.08, clearcoatRoughness: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rough;\nvarying float vRough;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = rough;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;')
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_Skin(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  float nl = dot(geometryNormal, directLight.direction);
  // wrapped, red-shifted diffuse = cheap subsurface scattering
  vec3 wrap = vec3(saturate((nl + 0.45) / 1.45), saturate((nl + 0.22) / 1.22), saturate((nl + 0.12) / 1.12));
  vec3 diff = mix(vec3(saturate(nl)), wrap, 0.75);
  reflectedLight.directDiffuse += diff * directLight.color * BRDF_Lambert(material.diffuseColor);
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  reflectedLight.directDiffuse -= saturate(nl) * directLight.color * BRDF_Lambert(material.diffuseColor);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin`);
  };
  mat.customProgramCacheKey = () => 'human-skin-v1';
  return mat;
}

export async function createHumanHand(base = 'assets/human/') {
  const [json, buf] = await Promise.all([fetch(base + 'human.json').then((r) => r.json()), fetch(base + 'human.bin').then((r) => r.arrayBuffer())]);
  const geo = (m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, m.position, m.vertexCount * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, m.normal, m.vertexCount * 3), 3));
    const c4 = new Float32Array(buf, m.color, m.vertexCount * 4);
    const c3 = new Float32Array(m.vertexCount * 3), r1 = new Float32Array(m.vertexCount);
    for (let i = 0; i < m.vertexCount; i++) { c3[i * 3] = c4[i * 4]; c3[i * 3 + 1] = c4[i * 4 + 1]; c3[i * 3 + 2] = c4[i * 4 + 2]; r1[i] = c4[i * 4 + 3]; }
    g.setAttribute('color', new THREE.BufferAttribute(c3, 3));
    g.setAttribute('rough', new THREE.BufferAttribute(r1, 1));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.index, m.indexCount), 1));
    g.computeBoundingSphere();
    return g;
  };
  const hand = new THREE.Mesh(geo(json.hand), skinMaterial());
  hand.castShadow = true; hand.receiveShadow = true;
  const fishMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  fishMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float rough;\nvarying float vRough;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = rough;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRough;').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRough;');
  };
  fishMat.customProgramCacheKey = () => 'niboshi-v1';
  const fish = new THREE.Mesh(geo(json.fish), fishMat);
  fish.castShadow = true; fish.receiveShadow = true;
  const group = new THREE.Group();
  group.add(hand);
  // fish held in the pinch, head pointing along the fingers (towards the cat)
  const fishHolder = new THREE.Group();
  const pinch = new THREE.Vector3(...json.hand.pinch);
  const FS = 1.25; // niboshi scale
  fish.scale.setScalar(FS);
  fishHolder.position.copy(pinch).add(new THREE.Vector3(0, 0.002, 0.046 * FS));
  fishHolder.rotation.y = Math.PI;
  fishHolder.add(fish);
  group.add(fishHolder);
  return { group, hand, fish, fishHolder, fishHeadLocal: pinch.clone().add(new THREE.Vector3(0, 0.002, 0.046 * FS)) };
}

// Orientation of the reaching hand: fingers F towards the cat, palm facing mostly down.
export function handBasis(F) {
  const f = F.clone().normalize();
  const p = new THREE.Vector3(0, -1, 0).addScaledVector(f, f.y).normalize(); // down, orthogonal to f
  const t = new THREE.Vector3().crossVectors(f, p); // thumb side
  const m = new THREE.Matrix4().makeBasis(t, p.clone().negate(), f);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
