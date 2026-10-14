// Polished porcelain tile floor with blurred planar reflections.
import * as THREE from 'three';
import { tex } from './textures.js';
import { LAYER_FLOOR } from './layers.js';

export function createFloor(reflection, { size = [6, 6], center = [0, 0] } = {}) {
  const rep = [size[0] / 2.4, size[1] / 2.4];
  const mat = new THREE.MeshStandardMaterial({
    map: tex('assets/tex/floor_diff.jpg', { srgb: true, repeat: rep }),
    roughnessMap: tex('assets/tex/floor_rough.jpg', { repeat: rep }),
    normalMap: tex('assets/tex/floor_nor.png', { repeat: rep }),
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1.0, metalness: 0.0, envMapIntensity: 1.0,
  });
  const uniforms = {
    tReflection: { value: reflection.rt.texture },
    reflTexMatrix: { value: reflection.textureMatrix },
    reflStrength: { value: 0.9 },
    reflLodScale: { value: 1.0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 reflTexMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vFloorWorld;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vec4 wpF = modelMatrix * vec4(transformed, 1.0);
  vReflUv = reflTexMatrix * wpF;
  vFloorWorld = wpF.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tReflection;
uniform float reflStrength;
uniform float reflLodScale;
varying vec4 vReflUv;
varying vec3 vFloorWorld;`)
      .replace('#include <lights_fragment_maps>', /* glsl */`#include <lights_fragment_maps>
  {
    // perturb by the normal map's tangent-plane deviation
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    vec2 duv = nW.xz * 0.06;
    vec2 ruv = vReflUv.xy / vReflUv.w + duv;
    float lod = clamp(material.roughness * 14.0 * reflLodScale, 0.0, 6.0);
    vec2 px = 1.0 / vec2(textureSize(tReflection, 0));
    float s = exp2(lod) * 0.75;
    vec3 refl = textureLod(tReflection, ruv, lod).rgb * 0.4;
    refl += textureLod(tReflection, ruv + vec2( s,  s) * px, lod).rgb * 0.15;
    refl += textureLod(tReflection, ruv + vec2(-s,  s) * px, lod).rgb * 0.15;
    refl += textureLod(tReflection, ruv + vec2( s, -s) * px, lod).rgb * 0.15;
    refl += textureLod(tReflection, ruv + vec2(-s, -s) * px, lod).rgb * 0.15;
    float edgeFade = smoothstep(0.0, 0.04, ruv.x) * smoothstep(1.0, 0.96, ruv.x) * smoothstep(0.0, 0.04, ruv.y) * smoothstep(1.0, 0.96, ruv.y);
    radiance = mix(radiance, refl, reflStrength * edgeFade);
  }`);
  };
  mat.customProgramCacheKey = () => 'floor-refl-v1';
  const geo = new THREE.PlaneGeometry(size[0], size[1], 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(center[0], 0, center[1]);
  mesh.receiveShadow = true;
  mesh.layers.set(LAYER_FLOOR);
  mesh.userData.uniforms = uniforms;
  return mesh;
}
