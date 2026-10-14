// Post-processing: MSAA scene render -> GTAO -> DOF -> bloom -> tone map -> film finish.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

class CleanGTAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => { if (o.userData.noGBuffer) o.visible = false; });
  }
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.035 },
    vignette: { value: 0.28 },
    ca: { value: 0.0012 },
    fade: { value: 1.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform float vignette; uniform float ca; uniform vec2 resolution; uniform float fade;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * ca * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float v = smoothstep(0.85, 0.15, r2 * (1.0 + vignette));
      col *= mix(1.0 - vignette, 1.0, v);
      // grade: subtle S-curve, warm highlights, cool-neutral shadows
      col = clamp(col, 0.0, 1.0);
      vec3 sc = col * col * (3.0 - 2.0 * col);
      col = mix(col, sc, 0.22);
      float l0 = dot(col, vec3(0.299, 0.587, 0.114));
      col *= mix(vec3(0.985, 0.99, 1.01), vec3(1.025, 1.0, 0.965), smoothstep(0.2, 0.9, l0));
      col = mix(vec3(l0), col, 1.06);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float n = h(vUv * resolution + fract(time * 13.37) * 97.0) - 0.5;
      col += n * grain * (0.35 + 0.65 * (1.0 - lum)) * 0.6;
      gl_FragColor = vec4(col * fade, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { width, height, samples = 4, ao = true, dof = true, bloom = true }) {
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let gtao = null;
  if (ao) {
    gtao = new CleanGTAOPass(scene, camera, width, height);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    composer.addPass(gtao);
  }
  let bokeh = null;
  if (dof) {
    bokeh = new BokehPass(scene, camera, { focus: 1.0, aperture: 0.0025, maxblur: 0.006 });
    composer.addPass(bokeh);
  }
  let bloomPass = null;
  if (bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.55, 0.92);
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.resolution.value.set(width, height);
  composer.addPass(finish);
  return {
    composer, gtao, bokeh, bloom: bloomPass, finish,
    setSize(w, h) { composer.setSize(w, h); finish.uniforms.resolution.value.set(w, h); },
  };
}
