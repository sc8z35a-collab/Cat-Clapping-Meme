// Post-processing: MSAA scene render -> GTAO -> DOF -> bloom -> tone map -> film finish.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

class CleanGTAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => { if (o.userData.noGBuffer) o.visible = false; });
  }
}

// Scene render into its own MSAA target, resolved into the composer's (non-MSAA) buffer.
// Only this pass needs multisampling (alpha-to-coverage fur); keeping the ping-pong buffers single-sampled and
// depth-less roughly halves video memory, which matters for 4K video export on phones.
class MSAASceneRenderPass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene; this.camera = camera;
    this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false }));
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  setSamples(n) { if (this.rt.samples !== n) { this.rt.dispose(); this.rt.samples = n; } }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copy.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.copy.render(renderer);
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

// HDR finish for video export: scene-linear (Rec.709) -> graded -> BT.2020 -> HLG (BT.2100) signal.
// Mid-tones are matched to the SDR AgX look (AgX lifts middle grey ~1.75x); diffuse white lands near
// HLG 0.75 (~203 nits), highlights roll off softly towards the 1000-nit peak instead of clipping.
const HDRFinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.0 },
    time: { value: 0 },
    grain: { value: 0.035 },
    vignette: { value: 0.28 },
    ca: { value: 0.0012 },
    fade: { value: 1.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: FinishShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float exposure; uniform float time; uniform float grain; uniform float vignette; uniform float ca; uniform vec2 resolution; uniform float fade;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float hlg(float e){
      const float a = 0.17883277, b = 0.28466892, c = 0.55991073;
      return e <= 1.0 / 12.0 ? sqrt(3.0 * e) : a * log(12.0 * e - b) + c;
    }
    void main(){
      vec2 cc = vUv - 0.5;
      float r2 = dot(cc, cc);
      vec2 off = cc * ca * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = max(col, vec3(0.0)) * exposure * 1.75;
      float v = smoothstep(0.85, 0.15, r2 * (1.0 + vignette));
      col *= mix(1.0 - vignette, 1.0, v);
      float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.985, 0.99, 1.01), vec3(1.025, 1.0, 0.965), smoothstep(0.05, 0.8, l0));
      col *= fade;
      // linear Rec.709 -> linear Rec.2020
      col = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0114, 0.8956) * col;
      // relative scene light: diffuse white (1.0) -> HLG E = 0.265 (signal 0.75); hue-preserving soft clip at 1.0
      vec3 e = col * 0.265;
      float m = max(max(e.r, e.g), e.b);
      float k = 0.62;
      float mc = m <= k ? m : k + (1.0 - k) * (1.0 - exp(-(m - k) / (1.0 - k)));
      e *= m > 1e-6 ? mc / m : 1.0;
      vec3 sig = vec3(hlg(e.r), hlg(e.g), hlg(e.b));
      float n = h(vUv * resolution + fract(time * 13.37) * 97.0) - 0.5;
      sig += n * grain * 0.35 * (1.0 - 0.5 * sig.g);
      gl_FragColor = vec4(clamp(sig, 0.0, 1.0), 1.0);
    }`,
};

// 10-bit 4:2:0 BT.2020 (narrow range) packed into RGBA8 so it can be read back exactly:
// luma plane W x H (R = top 8 bits, G = low 2 bits), chroma W/2 x H/2 (RG = Cb, BA = Cr). Rows are flipped so
// readPixels returns them top-down, as video frames expect.
const PACK_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const PACK_COMMON = /* glsl */`
  uniform sampler2D tSignal; uniform vec2 srcSize; varying vec2 vUv;
  vec2 split10(float x){ float q = floor(clamp(x, 0.0, 1023.0) + 0.5); float hi = floor(q / 4.0); return vec2(hi, q - hi * 4.0) / 255.0; }
  float luma(vec3 c){ return dot(c, vec3(0.2627, 0.6780, 0.0593)); }`;
const packY = () => new THREE.ShaderMaterial({
  uniforms: { tSignal: { value: null }, srcSize: { value: new THREE.Vector2(1, 1) } },
  vertexShader: PACK_VERT,
  fragmentShader: PACK_COMMON + /* glsl */`
    void main(){
      vec3 c = texture2D(tSignal, vec2(vUv.x, 1.0 - vUv.y)).rgb;
      gl_FragColor = vec4(split10(64.0 + 876.0 * luma(c)), 0.0, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const packUV = () => new THREE.ShaderMaterial({
  uniforms: { tSignal: { value: null }, srcSize: { value: new THREE.Vector2(1, 1) } },
  vertexShader: PACK_VERT,
  fragmentShader: PACK_COMMON + /* glsl */`
    void main(){
      vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
      vec2 t = 0.5 / srcSize;
      vec3 c = 0.25 * (texture2D(tSignal, uv + vec2(-t.x, -t.y)).rgb + texture2D(tSignal, uv + vec2(t.x, -t.y)).rgb
                     + texture2D(tSignal, uv + vec2(-t.x, t.y)).rgb + texture2D(tSignal, uv + vec2(t.x, t.y)).rgb);
      float y = luma(c);
      float cb = (c.b - y) / 1.8814, cr = (c.r - y) / 1.4746;
      gl_FragColor = vec4(split10(512.0 + 896.0 * cb), split10(512.0 + 896.0 * cr));
    }`,
  depthTest: false, depthWrite: false,
});

export function createPost(renderer, scene, camera, { width, height, samples = 4, ao = true, dof = true, bloom = true }) {
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 0, depthBuffer: false });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  const renderPass = new MSAASceneRenderPass(scene, camera, samples);
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
  const output = new OutputPass();
  composer.addPass(output);
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.resolution.value.set(width, height);
  composer.addPass(finish);
  // HDR video export: replaces tone mapping + SDR finish, stays in the (half float) composer buffers
  const hdrFinish = new ShaderPass(HDRFinishShader);
  hdrFinish.enabled = false;
  composer.addPass(hdrFinish);

  let size = { w: width, h: height };
  let pack = null;
  const ensurePack = () => {
    const { w, h } = size;
    if (pack && pack.w === w && pack.h === h) return pack;
    if (pack) { pack.y.dispose(); pack.uv.dispose(); }
    const opt = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    pack = {
      w, h,
      y: new THREE.WebGLRenderTarget(w, h, opt), uv: new THREE.WebGLRenderTarget(w / 2, h / 2, opt),
      yBuf: new Uint8Array(w * h * 4), uvBuf: new Uint8Array((w / 2) * (h / 2) * 4),
      quadY: pack?.quadY || new FullScreenQuad(packY()), quadUV: pack?.quadUV || new FullScreenQuad(packUV()),
    };
    return pack;
  };

  return {
    composer, gtao, bokeh, bloom: bloomPass, finish, output, hdrFinish,
    setSize(w, h) {
      size = { w, h };
      composer.setSize(w, h);
      finish.uniforms.resolution.value.set(w, h);
      hdrFinish.uniforms.resolution.value.set(w, h);
    },
    // runtime quality switches (passes stay allocated, disabled passes are skipped)
    setEnabled({ ao, dof, bloom }) {
      if (gtao && ao !== undefined) gtao.enabled = ao;
      if (bokeh && dof !== undefined) bokeh.enabled = dof;
      if (bloomPass && bloom !== undefined) bloomPass.enabled = bloom;
    },
    setSamples(n) { renderPass.setSamples(n); },
    setHDR(on) {
      output.enabled = !on;
      finish.enabled = !on;
      hdrFinish.enabled = on;
      composer.renderToScreen = !on;
      if (on) hdrFinish.uniforms.exposure.value = renderer.toneMappingExposure;
    },
    // after composer.render() in HDR mode: read the frame back as I420P10 planes (Uint16Array: Y, then U, then V)
    readHDRFrame(out) {
      const p = ensurePack();
      const { w, h } = p;
      const src = composer.readBuffer.texture;
      const gl = renderer.getContext();
      gl.disable(gl.DITHER);
      const prev = renderer.getRenderTarget();
      p.quadY.material.uniforms.tSignal.value = src; p.quadY.material.uniforms.srcSize.value.set(w, h);
      renderer.setRenderTarget(p.y); p.quadY.render(renderer);
      p.quadUV.material.uniforms.tSignal.value = src; p.quadUV.material.uniforms.srcSize.value.set(w, h);
      renderer.setRenderTarget(p.uv); p.quadUV.render(renderer);
      renderer.setRenderTarget(prev);
      renderer.readRenderTargetPixels(p.y, 0, 0, w, h, p.yBuf);
      renderer.readRenderTargetPixels(p.uv, 0, 0, w / 2, h / 2, p.uvBuf);
      const nY = w * h, nC = nY / 4;
      const planes = out && out.length === nY + 2 * nC ? out : new Uint16Array(nY + 2 * nC);
      const yb = p.yBuf, cb = p.uvBuf;
      for (let i = 0, j = 0; i < nY; i++, j += 4) planes[i] = (yb[j] << 2) | yb[j + 1];
      for (let i = 0, j = 0; i < nC; i++, j += 4) { planes[nY + i] = (cb[j] << 2) | cb[j + 1]; planes[nY + nC + i] = (cb[j + 2] << 2) | cb[j + 3]; }
      return planes;
    },
  };
}
