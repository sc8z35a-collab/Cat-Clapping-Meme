// Materials for the cat: fur shells + base skin, eyes, teeth, lips, whiskers, eyelids.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y), u.z);
}
`;

// Shared uniforms (so one update drives every shell)
export function createCatUniforms(strandTex) {
  return {
    strandTex: { value: strandTex },
    strandFreq: { value: 60.0 },
    furScale: { value: 0.0102 },
    furLengthMul: { value: 1.3 },
    grin: { value: 0.0 },
    furSpec1: { value: new THREE.Color(0.0095, 0.0098, 0.0106) },
    furSpec2: { value: new THREE.Color(0.0072, 0.0050, 0.0034) },
    furExp1: { value: 110.0 },
    furExp2: { value: 28.0 },
    furShift1: { value: -0.10 },
    furShift2: { value: 0.12 },
    furTint: { value: new THREE.Color(0.0125, 0.0115, 0.011) },
    furTipTint: { value: new THREE.Color(1.18, 1.06, 0.96) },
    furTrans: { value: new THREE.Color(0.16, 0.10, 0.06) },
    strandStretch: { value: 1.0 }, // >1 elongates strand cells along the comb, but shears wherever the comb bends
    mouthColor: { value: new THREE.Color(0.018, 0.0045, 0.005) },
    furGravity: { value: 0.22 },
    catShadowOffset: { value: 0.0045 },
    furWind: { value: new THREE.Vector3() },
  };
}

function furVertexInjection(shell) {
  return /* glsl */`
#ifdef USE_SKINNING
  vec3 furCombO = (skinMatrix * vec4(comb, 0.0)).xyz;
#else
  vec3 furCombO = comb;
#endif
  vec3 furN = normalize(objectNormal);
  furCombO = normalize(furCombO - furN * dot(furCombO, furN) + vec3(1e-5));
  float furLenB = furp.x * furScale * furLengthMul;
  float furLen = furLenB * (1.0 - grin * furp.z);
  vFurLen = furLen;
  ${shell ? /* glsl */`
  float hh = shell;
  vec3 gObj = normalize((vec4(0.0, -1.0, 0.0, 0.0) * modelMatrix).xyz);
  vec3 windObj = (vec4(furWind, 0.0) * modelMatrix).xyz;
  vec3 furDisp = furN * (hh - 0.38 * hh * hh) * 0.92 + furCombO * (0.50 * hh + 0.38 * hh * hh) + gObj * hh * hh * furGravity + windObj * hh * hh;
  transformed += furDisp * furLen;
  vFurH = hh;
  vec3 hairDirO = normalize(furN * (0.92 - 0.70 * hh) + furCombO * (0.50 + 0.76 * hh) + gObj * 2.0 * hh * furGravity);
  ` : /* glsl */`
  float hh = 0.0;
  vFurH = 0.0;
  vec3 hairDirO = normalize(furN * 0.92 + furCombO * 0.5);
  `}
  vHairDir = normalize(normalMatrix * hairDirO);
#if FUR_DBG == 8
  vHairDir = normalize(normalMatrix * comb);
#endif
#if FUR_DBG == 9
  vHairDir = normalize(normalMatrix * furCombO);
#endif
  vStrand = (position + comb * (0.50 * hh + 0.38 * hh * hh) * furLenB) * strandFreq;
  vFurP = furp;
  vCol = col;
  vExtra = extra;
  vBindPos = position;
  vCombB = comb;
`;
}

const FUR_FRAG_PARS = /* glsl */`
uniform highp sampler3D strandTex;
uniform float grin;
uniform vec3 furSpec1;
uniform vec3 furSpec2;
uniform float furExp1;
uniform float furExp2;
uniform float furShift1;
uniform float furShift2;
uniform vec3 furTint;
uniform vec3 furTipTint;
uniform vec3 furTrans;
uniform vec3 mouthColor;
varying float vFurH;
varying float vFurLen;
varying vec3 vHairDir;
varying vec3 vStrand;
varying vec4 vFurP;
varying vec4 vCol;
varying vec4 vExtra;
varying vec3 vBindPos;
varying vec3 vCombB;
uniform float strandStretch;
vec3 gFurT;
float gFurMix;
float gFurOcc;
float gStrandRand;
${NOISE_GLSL}
vec3 srgbToLinear3(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const FUR_DIRECT = /* glsl */`
void RE_Direct_Fur(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  vec3 L = directLight.direction;
  vec3 V = geometryViewDir;
  vec3 N = geometryNormal;
  float NdotL = dot(N, L);
  // --- skin (GGX)
  vec3 skinDiffuse = saturate(NdotL) * directLight.color * BRDF_Lambert(material.diffuseColor);
  vec3 skinSpec = saturate(NdotL) * directLight.color * BRDF_GGX(L, V, N, material);
  // --- fur (Kajiya-Kay with two shifted lobes)
  vec3 T = gFurT;
  float TdotL = dot(T, L);
  T = normalize(T + N * (gStrandRand - 0.5) * 0.18);
  float sinTL = sqrt(max(0.0, 1.0 - TdotL * TdotL));
  float wrapNL = saturate((NdotL + 0.45) / 1.45);
  float diff = wrapNL * mix(1.0, sinTL, 0.35);
  vec3 H = normalize(L + V);
  vec3 T1 = normalize(T + N * furShift1);
  vec3 T2 = normalize(T + N * furShift2);
  float th1 = dot(T1, H), th2 = dot(T2, H);
  float s1 = pow(sqrt(max(0.0, 1.0 - th1 * th1)), furExp1);
  float s2 = pow(sqrt(max(0.0, 1.0 - th2 * th2)), furExp2);
  float specMask = smoothstep(-0.15, 0.3, NdotL) * gFurOcc * smoothstep(-1.0, 0.0, dot(T, H));
  float sparkle = mix(0.55, 1.4, gStrandRand);
  vec3 furSpec = (furSpec1 * s1 * (furExp1 + 2.0) / (2.0 * PI) * sparkle + furSpec2 * s2 * (furExp2 + 2.0) / (2.0 * PI)) * specMask;
  vec3 furDiffuse = diff * directLight.color * BRDF_Lambert(material.diffuseColor) * gFurOcc;
  // light passing through the hair towards the viewer (backlit halo)
  float back = saturate(-dot(L, V));
  float sil = pow(1.0 - saturate(abs(dot(N, V))), 2.5);
  vec3 trans = furTrans * pow(back, 3.0) * (0.06 + 0.94 * sil) * mix(0.35, 1.0, gFurOcc) * smoothstep(-0.6, 0.1, NdotL);
  furSpec += trans;
  reflectedLight.directDiffuse += mix(skinDiffuse, furDiffuse, gFurMix);
#if FUR_DBG != 1
  reflectedLight.directSpecular += mix(skinSpec, furSpec * directLight.color, gFurMix);
#endif
}
#undef RE_Direct
#define RE_Direct RE_Direct_Fur
#if NUM_RECT_AREA_LIGHTS > 0
void RE_Direct_RectArea_Fur(const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  vec3 toL = rectAreaLight.position - geometryPosition;
  vec3 L = normalize(toL);
  float d2 = max(dot(toL, toL), 0.25);
  float area = length(rectAreaLight.halfWidth) * length(rectAreaLight.halfHeight) * 4.0;
  vec3 lightN = normalize(cross(rectAreaLight.halfWidth, rectAreaLight.halfHeight));
  float facing = abs(dot(lightN, -L));
  float NdotL = dot(geometryNormal, L);
  float wrapNL = saturate((NdotL + 0.45) / 1.45);
  vec3 E = rectAreaLight.color * area * facing / d2 * 0.25;
  vec3 skinD = saturate(NdotL) * E * BRDF_Lambert(material.diffuseColor);
  vec3 furD = wrapNL * E * BRDF_Lambert(material.diffuseColor) * gFurOcc;
  reflectedLight.directDiffuse += mix(skinD, furD, gFurMix);
  vec3 H = normalize(L + geometryViewDir);
  float th = dot(normalize(gFurT + geometryNormal * furShift2), H);
  float s2 = pow(sqrt(max(0.0, 1.0 - th * th)), furExp2 * 0.5);
  reflectedLight.directSpecular += E * furSpec2 * s2 * gFurOcc * gFurMix * smoothstep(-0.1, 0.3, NdotL);
  reflectedLight.directSpecular += (1.0 - gFurMix) * saturate(NdotL) * E * BRDF_GGX(L, geometryViewDir, geometryNormal, material) * 0.6;
}
#undef RE_Direct_RectArea
#define RE_Direct_RectArea RE_Direct_RectArea_Fur
#endif
`;

export function createCatMaterial({ uniforms, shell = false, envMapIntensity = 1.0, debug = 0 }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.0, envMapIntensity });
  mat.defines = { FUR_DBG: debug };
  mat.name = shell ? 'furShell' : 'catBase';
  if (shell) mat.alphaToCoverage = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 comb;
attribute vec4 furp;
attribute vec4 col;
attribute vec4 extra;
${shell ? 'attribute float shell;' : ''}
uniform float furScale;
uniform float furLengthMul;
uniform float grin;
uniform float strandFreq;
uniform float furGravity;
uniform vec3 furWind;
uniform float catShadowOffset;
varying float vFurH;
varying float vFurLen;
varying vec3 vHairDir;
varying vec3 vStrand;
varying vec4 vFurP;
varying vec4 vCol;
varying vec4 vExtra;
varying vec3 vBindPos;
varying vec3 vCombB;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${furVertexInjection(shell)}`)
      .replace('#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.replaceAll('.shadowNormalBias', '.shadowNormalBias + catShadowOffset'));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FUR_FRAG_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${FUR_DIRECT}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  float furMix = smoothstep(0.03, 0.12, vFurP.x);
  vec3 baseCol = srgbToLinear3(vCol.rgb);
  vec4 sn = texture(strandTex, vStrand);
  gStrandRand = 0.5;
  ${shell ? /* glsl */`
  float hrel = vFurH;
  // hairs lie along the comb: stretch strand cells along it
  vec3 sq = vStrand;
  if (strandStretch > 1.001) { vec3 cB = normalize(vCombB + vec3(1e-5)); sq -= cB * dot(vStrand, cB) * (1.0 - 1.0 / strandStretch); }
  vec2 sx = textureLod(strandTex, sq, 0.0).rg;
  gStrandRand = sx.g;
  float cellsPerPx = length(fwidth(sq)) * 16.0;
  float sLen = mix(0.55, 1.0, sx.g);
  float rad0 = mix(0.50, 0.24, sqrt(hrel));
  float rad = rad0 * (1.0 - pow(clamp(hrel / sLen, 0.0, 1.0), 2.2));
  float fw = max(fwidth(sx.r) * 0.85, 0.03);
  float sharp = smoothstep(rad + fw, rad - fw, sx.r) * step(hrel, sLen);
  float radE = rad0 * (1.0 - pow(clamp(hrel / 0.85, 0.0, 1.0), 2.2));
  float expected = clamp((1.0 - hrel) / 0.45, 0.0, 1.0) * (1.0 - exp(-3.14159 * radE * radE));
  // silhouettes: many layers seen edge-on -> keep the fuzz visible
  float silV = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
  expected *= 1.0 + 1.4 * silV * silV;
  float cover = mix(sharp, min(expected, 1.0), smoothstep(0.35, 1.3, cellsPerPx));
  cover *= smoothstep(0.00012, 0.0004, vFurLen);
  if (cover < 0.03) discard;
  diffuseColor.a = cover;
  gFurOcc = mix(0.14, 1.0, pow(hrel, 1.15)) * mix(0.6, 1.0, vFurP.y);
  vec3 fc = furTint * mix(0.78, 1.22, sx.g) * mix(vec3(1.0), furTipTint, hrel * hrel);
  diffuseColor.rgb = fc;
  gFurMix = 1.0;
  ` : /* glsl */`
  gFurOcc = 0.22 * mix(0.45, 1.0, vFurP.y);
  vec3 fc = furTint * 0.8;
  diffuseColor.rgb = mix(baseCol, fc, furMix);
  gFurMix = furMix;
  // mouth pocket darkening when grinning
  float pocket = grin * vFurP.w;
  diffuseColor.rgb = mix(diffuseColor.rgb, mouthColor, pocket);
  `}
`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
  ${shell ? 'roughnessFactor = 0.62;' : 'roughnessFactor = mix(vCol.a, 0.7, furMix); roughnessFactor = mix(roughnessFactor, 0.55, grin * vFurP.w);'}
`)
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
  gFurT = normalize(vHairDir);
  ${shell ? '' : /* glsl */`
  // micro detail on bare skin (pores / fine wrinkles)
  float skinMask = 1.0 - furMix;
  if (skinMask > 0.01) {
    vec3 q = vBindPos * 3200.0;
    float e = 0.35;
    float n0 = vnoise(q);
    vec3 g = vec3(vnoise(q + vec3(e,0,0)) - n0, vnoise(q + vec3(0,e,0)) - n0, vnoise(q + vec3(0,0,e)) - n0);
    vec3 q2 = vBindPos * 900.0;
    float m0 = vnoise(q2);
    vec3 g2 = vec3(vnoise(q2 + vec3(e,0,0)) - m0, vnoise(q2 + vec3(0,e,0)) - m0, vnoise(q2 + vec3(0,0,e)) - m0);
    vec3 gv = normalize((viewMatrix * vec4(g * 0.6 + g2 * 0.35, 0.0)).xyz + vec3(1e-6));
    normal = normalize(normal - (gv - normal * dot(gv, normal)) * 0.09 * skinMask);
  }
  `}
`)
      .replace('#include <aomap_fragment>', /* glsl */`#include <aomap_fragment>
#if FUR_DBG == 4 || FUR_DBG == 8 || FUR_DBG == 9
  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0);
  reflectedLight.indirectDiffuse = (inverseTransformDirection(normalize(vHairDir), viewMatrix) * 0.5 + 0.5) * 0.6;
#endif
#if FUR_DBG == 6
  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(vFurH, vFurLen * 100.0, gStrandRand);
#endif
#if FUR_DBG == 7
  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0); reflectedLight.indirectDiffuse = vec3(0.0);
#endif
#if FUR_DBG == 5
  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0); reflectedLight.indirectSpecular = vec3(0.0);
  reflectedLight.indirectDiffuse = (inverseTransformDirection(normalize(vNormal), viewMatrix) * 0.5 + 0.5) * 0.6;
#endif
  float occ = ${shell ? 'gFurOcc' : 'mix(mix(0.55, 1.0, vFurP.y), gFurOcc, gFurMix)'};
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ * ${shell ? '0.10' : 'mix(1.0, 0.12, gFurMix)'};
#if FUR_DBG == 2
  reflectedLight.indirectSpecular *= 0.0;
#endif
#if FUR_DBG == 3
  reflectedLight.indirectSpecular *= 0.0; reflectedLight.indirectDiffuse *= 0.0; reflectedLight.directDiffuse *= 0.0;
#endif
`);
  };
  mat.customProgramCacheKey = () => (shell ? 'cat-fur-shell-v1' : 'cat-base-v1') + debug;
  return mat;
}

// ---------------------------------------------------------------- eyes
export function createIrisTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, R = size / 2;
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // base radial gradient: green-gold centre -> amber -> deep orange-brown edge
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, R);
  grad.addColorStop(0.00, '#2f3a12');
  grad.addColorStop(0.20, '#7a8a22');
  grad.addColorStop(0.38, '#c9a326');
  grad.addColorStop(0.62, '#e0a21c');
  grad.addColorStop(0.82, '#c27412');
  grad.addColorStop(0.93, '#7a3e0a');
  grad.addColorStop(1.00, '#2a1406');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // radial fibres
  for (let i = 0; i < 1400; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = R * (0.12 + rnd() * 0.25), r1 = R * (0.55 + rnd() * 0.42);
    const light = rnd() > 0.5;
    g.strokeStyle = light ? `rgba(255,${200 + rnd() * 50 | 0},${90 + rnd() * 60 | 0},${0.05 + rnd() * 0.10})` : `rgba(${60 + rnd() * 40 | 0},${30 + rnd() * 20 | 0},0,${0.06 + rnd() * 0.12})`;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    const wob = (rnd() - 0.5) * 0.08;
    g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    g.quadraticCurveTo(cx + Math.cos(a + wob) * (r0 + r1) / 2, cx + Math.sin(a + wob) * (r0 + r1) / 2, cx + Math.cos(a + wob * 2) * r1, cx + Math.sin(a + wob * 2) * r1);
    g.stroke();
  }
  // crypts / flecks
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, r = R * (0.25 + rnd() * 0.6);
    g.fillStyle = `rgba(${40 + rnd() * 30 | 0},${20 + rnd() * 15 | 0},0,${0.12 + rnd() * 0.18})`;
    g.beginPath(); g.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 1 + rnd() * 3, 2 + rnd() * 6, a, 0, Math.PI * 2); g.fill();
  }
  // collarette ring
  g.strokeStyle = 'rgba(230,200,90,0.35)'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cx, R * 0.33, 0, Math.PI * 2); g.stroke();
  // limbal ring
  const lg = g.createRadialGradient(cx, cx, R * 0.86, cx, cx, R);
  lg.addColorStop(0, 'rgba(20,8,0,0)'); lg.addColorStop(0.6, 'rgba(20,8,0,0.55)'); lg.addColorStop(1, 'rgba(10,4,0,0.95)');
  g.fillStyle = lg; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createEyeMaterial(irisTex) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 1.0, clearcoatRoughness: 0.035, envMapIntensity: 1.0 });
  mat.userData.uniforms = { irisTex: { value: irisTex }, pupil: { value: new THREE.Vector2(0.20, 0.42) }, irisRadius: { value: 0.0101 * 1.08 * 1.10 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeLocal;\nvarying vec3 vEyeViewLocal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vEyeLocal = position;
  vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vEyeViewLocal = camLocal - position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D irisTex;
uniform vec2 pupil;
uniform float irisRadius;
varying vec3 vEyeLocal;
varying vec3 vEyeViewLocal;`)
      .replace('#include <map_fragment>', /* glsl */`
  vec3 pL = vEyeLocal;
  float R = length(pL);
  vec3 nL = pL / R;
  vec3 vL = normalize(vEyeViewLocal);
  // refraction through the cornea onto the iris plane
  vec3 rd = refract(-vL, nL, 1.0 / 1.336);
  float irisZ = R * 0.55;
  float t = (irisZ - pL.z) / min(rd.z, -0.05);
  vec3 hit = pL + rd * max(t, 0.0);
  if (pL.z < irisZ) hit = pL;
  vec2 iuv = hit.xy / irisRadius;
  float ir = length(iuv);
  vec3 irisCol = texture2D(irisTex, iuv * 0.5 + 0.5).rgb;
  // elliptical (vertical) pupil
  vec2 pq = iuv / pupil;
  float pd = length(pq);
  float pupilMask = 1.0 - smoothstep(0.86, 1.06, pd);
  vec3 col = mix(irisCol, vec3(0.004, 0.0035, 0.003), pupilMask);
  // sclera beyond the iris
  float irisMask = 1.0 - smoothstep(0.96, 1.04, ir);
  col = mix(vec3(0.05, 0.035, 0.02), col, irisMask);
  // subtle caustic: brighten iris on the side away from the key light handled by lighting; add depth shading
  col *= mix(0.55, 1.0, smoothstep(1.0, 0.2, ir));
  diffuseColor.rgb = col;
`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.5, 0.3, pupilMask);');
  };
  mat.customProgramCacheKey = () => 'cat-eye-v1';
  return mat;
}

// ---------------------------------------------------------------- teeth & lips
export function createTeethMaterial(grinInfo, head) {
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.90, 0.865, 0.78), roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.14, sheen: 0.3, sheenColor: new THREE.Color(0.9, 0.85, 0.75), envMapIntensity: 1.0 });
  mat.userData.uniforms = {
    mouthOpen: { value: 0 },
    headOrigin: { value: new THREE.Vector3(...head.origin) },
    grinW: { value: grinInfo.W }, grinY0: { value: grinInfo.Y0 }, grinS: { value: grinInfo.S || 1 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vToothPos;\nattribute vec2 tdata;\nvarying vec2 vTD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToothPos = position;\nvTD = tdata;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vToothPos;
varying vec2 vTD;
uniform float mouthOpen;
uniform vec3 headOrigin;
uniform float grinW;
uniform float grinY0;
uniform float grinS;`)
      .replace('#include <clipping_planes_fragment>', /* glsl */`#include <clipping_planes_fragment>
  vec3 hq = vToothPos - headOrigin;
  float uu = min(1.0, abs(hq.x) / grinW);
  float yUp = grinY0 + grinS * (0.0040 + 0.0020 * uu * uu);
  float yLo = grinY0 + grinS * (-0.0066 + 0.0126 * pow(uu, 2.3));
  float yBi = grinY0 + grinS * (-0.0013 + 0.0062 * pow(uu, 2.2));
  float eU = yBi + mouthOpen * (yUp - yBi) + 0.0005;
  float eL = yBi + mouthOpen * (yLo - yBi) - 0.0005;
  if (mouthOpen < 0.01 || hq.y > eU || hq.y < eL || abs(hq.x) > grinW + 0.0004) discard;
`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  // per-tooth tint (ivory .. slightly warmer), translucent grey-blue incisal edge
  diffuseColor.rgb *= mix(vec3(0.94, 0.92, 0.88), vec3(1.04, 1.03, 1.0), vTD.x);
  float edge = smoothstep(0.0022, 0.0, abs(hq.y - yBi));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.60, 0.63, 0.67), edge * 0.38);
  // embrasures between neighbouring crowns + shadow under the lips (towards the gum line)
  float side = smoothstep(0.62, 1.05, abs(vTD.y));
  diffuseColor.rgb *= mix(1.0, 0.45, side);
  float toLip = clamp((hq.y - yBi) / max(1e-5, (hq.y > yBi ? yUp : yLo) - yBi), 0.0, 1.0);
  diffuseColor.rgb *= mix(1.0, 0.62, smoothstep(0.45, 1.0, toLip * mouthOpen));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.95, 0.84), smoothstep(0.3, 1.0, toLip) * 0.6);
  float cornerShade = mix(1.0, 0.18, smoothstep(0.35, 1.0, uu));
  diffuseColor.rgb *= cornerShade;
`);
  };
  mat.customProgramCacheKey = () => 'cat-teeth-v2';
  return mat;
}

export function createLipMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.012, 0.010, 0.010), roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.22, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.08, 0.06, 0.06) });
}

export function createWhiskerMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.0 });
}

export function createLidMaterial() {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(0.010, 0.0095, 0.0092), roughness: 0.55 });
}
