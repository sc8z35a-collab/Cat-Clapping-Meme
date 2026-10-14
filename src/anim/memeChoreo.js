// The "Black Cat Clapping" sequence (after @merkurianin's viral clip, Sept 2026):
// treat -> stands up -> human grin -> slow claps -> covers mouth -> offers a handshake.
// Positions are in the cat's bind/root space (metres, +z towards the viewer, +x = cat's left).
// Key easing = how the motion ARRIVES at that key ('cr' = smooth spline through keys).
import { Choreo } from './tracks.js';

export const T = {
  handIn: 0.35, treatReady: 1.35, sniffEnd: 2.02, bite: 2.12, handOut: 2.3,
  chewEnd: 3.45, standStart: 3.6, standEnd: 4.45, grinStart: 4.3, grinFull: 4.95,
  claps: [5.35, 6.0, 6.65, 7.3, 7.95], clapEnd: 8.35,
  coverOn: 8.85, giggleEnd: 9.6, coverOff: 10.0,
  shakeStart: 10.2, shakeOut: 10.55, end: 13.4,
};

const SIT = {
  pelvisPos: [0, -0.064, -0.020], pelvisRot: [14, 0, 0], spine: [4, 0, 0], neck: [0, 0, 0], head: [-4, 0, 0],
  handL: [0.029, 0.014, 0.070], handR: [-0.029, 0.014, 0.070],
  handLDir: [0.05, -0.08, 1], handRDir: [-0.05, -0.08, 1], handLPalm: [0, -1, 0.05], handRPalm: [0, -1, 0.05],
  handLSpace: [1, 0, 0], handRSpace: [1, 0, 0],
  elbowL: [0.10, 0.05, -0.30], elbowR: [-0.10, 0.05, -0.30],
  curlL: [6, 6, 4], curlR: [6, 6, 4], spreadL: 4, spreadR: 4, thumbL: [5, 4, 4], thumbR: [5, 4, 4],
};
const STAND = {
  pelvisPos: [0, 0.0, 0.0], pelvisRot: [0, 0, 0], spine: [2, 0, 0],
  handL: [0.030, 0.212, 0.090], handR: [-0.030, 0.212, 0.090],
  handLDir: [-0.15, -0.55, 0.82], handRDir: [0.15, -0.55, 0.82], handLPalm: [-0.75, -0.25, -0.6], handRPalm: [0.75, -0.25, -0.6],
  handLSpace: [0, 1, 0], handRSpace: [0, 1, 0],
  elbowL: [0.14, -0.22, -0.06], elbowR: [-0.14, -0.22, -0.06],
  curlL: [22, 30, 16], curlR: [22, 30, 16], spreadL: 0, spreadR: 0, thumbL: [12, 14, 10], thumbR: [12, 14, 10],
};
const CLAP_Y = 0.262, CLAP_Z = 0.128;
// open pose: the hands swing apart on an arc around the shoulders (a little up and back)
const clapOpen = (w) => ({ L: [0.0105 + w, CLAP_Y + 0.002 + w * 0.12, CLAP_Z - 0.004 - w * 0.16], R: [-0.0105 - w, CLAP_Y + 0.002 + w * 0.12, CLAP_Z - 0.004 - w * 0.16] });
const CLAP_DIR_L = [-0.10, 0.84, 0.53], CLAP_DIR_R = [0.14, 0.82, 0.55];
const CLAP_PALM_L = [-1, 0.05, 0.12], CLAP_PALM_R = [1, 0.05, 0.12];

function build() {
  const tr = {};
  const k = (name, t, v, e) => { (tr[name] ||= []).push([t, v, e]); };
  const pose = (t, P, e) => { for (const [n, v] of Object.entries(P)) k(n, t, v, e); };
  const hold = (name, t0, t1, v, e) => { k(name, t0, v, e); k(name, t1, v, 'smooth'); };

  // ================================================================ sit, sniff, eat
  pose(0, SIT);
  pose(1.2, SIT, 'smooth');
  // lean towards the treat, sniff, bite, sit back
  k('spine', 1.75, [12, 0, 0], 'smooth'); k('spine', 2.15, [14, 0, 0], 'smooth'); k('spine', 2.7, [5, 0, 0], 'smooth');
  k('neck', 1.75, [14, 0, 0], 'smooth'); k('neck', 2.15, [10, 0, 0], 'smooth'); k('neck', 2.7, [0, 0, 0], 'smooth');
  k('head', 0.9, [-6, -6, 5], 'smooth'); k('head', 1.4, [-2, 0, 0], 'smooth');
  for (let i = 0; i < 6; i++) k('head', 1.5 + i * 0.085, [3 + (i % 2) * 3, (i % 3 - 1) * 2, 0], 'smooth');
  k('head', T.bite, [9, 0, 0], 'outQuad'); k('head', 2.45, [-1, 0, -2], 'smooth');
  for (let i = 0; i < 5; i++) k('head', 2.62 + i * 0.19, [1 + (i % 2) * 3, 0, -2 + (i % 2) * 3], 'smooth');
  k('head', 3.55, [-3, 0, 0], 'smooth');
  k('look', 0, 0.9); k('look', 3.0, 0.9, 'smooth'); k('look', 3.6, 0.95, 'smooth');
  k('lookTreat', 0, 0); k('lookTreat', 0.45, 0, 'smooth'); k('lookTreat', 0.95, 1, 'smooth'); k('lookTreat', T.bite, 1, 'smooth'); k('lookTreat', 2.5, 0.3, 'smooth'); k('lookTreat', 3.1, 0, 'smooth');
  k('jaw', 0, 0); k('jaw', 2.02, 0, 'smooth'); k('jaw', T.bite, 15, 'outQuad'); k('jaw', 2.24, 2, 'smooth');
  for (let i = 0; i < 6; i++) { k('jaw', 2.36 + i * 0.18, 9, 'smooth'); k('jaw', 2.45 + i * 0.18, 1, 'smooth'); }
  k('jaw', 3.5, 0, 'smooth');
  k('squint', 0, 0); k('squint', 2.35, 0, 'smooth'); k('squint', 2.65, 0.55, 'smooth'); k('squint', 3.35, 0.5, 'smooth'); k('squint', 3.6, 0, 'smooth');
  k('pupil', 0, 0.56); k('pupil', 1.2, 0.72, 'smooth'); k('pupil', 2.4, 0.62, 'smooth'); k('pupil', 4.4, 0.52, 'smooth');

  // ================================================================ stand up
  pose(T.standStart, SIT, 'smooth');
  k('pelvisPos', T.standStart + 0.18, [0, -0.069, -0.026], 'smooth');
  k('pelvisRot', T.standStart + 0.18, [18, 0, 0], 'smooth');
  pose(T.standEnd, STAND, 'outBack');
  k('pelvisPos', T.standEnd + 0.3, [0, 0.0015, 0.001], 'smooth');
  // hands lift off the floor slightly later than the body
  k('handL', T.standStart + 0.35, [0.032, 0.080, 0.100], 'smooth'); k('handR', T.standStart + 0.35, [-0.032, 0.080, 0.100], 'smooth');
  k('handLSpace', T.standStart + 0.35, [0.5, 0.5, 0], 'smooth'); k('handRSpace', T.standStart + 0.35, [0.5, 0.5, 0], 'smooth');
  k('spine', T.standEnd + 0.3, [1, 0, 0], 'smooth');
  k('neck', T.standEnd, [-3, 0, 0], 'smooth');
  k('head', T.standEnd - 0.1, [6, 0, 0], 'smooth'); k('head', T.standEnd + 0.35, [-2, 0, 3], 'smooth');

  // ================================================================ grin
  k('grin', 0, 0); k('grin', T.grinStart, 0, 'smooth'); k('grin', T.grinFull, 1.0, 'inOutCubic');
  k('squint', T.grinStart, 0, 'smooth'); k('squint', T.grinFull, 0.42, 'smooth');
  k('head', T.grinFull, [-4, 0, 5], 'smooth');

  // ================================================================ slow claps
  const c0 = T.claps[0];
  const ready = c0 - 0.5;
  k('handL', ready, clapOpen(0.040).L, 'smooth'); k('handR', ready, clapOpen(0.040).R, 'smooth');
  hold('handLSpace', ready, T.clapEnd, [0, 1, 0], 'smooth'); hold('handRSpace', ready, T.clapEnd, [0, 1, 0], 'smooth');
  hold('handLDir', ready, T.clapEnd, CLAP_DIR_L, 'smooth'); hold('handRDir', ready, T.clapEnd, CLAP_DIR_R, 'smooth');
  hold('handLPalm', ready, T.clapEnd, CLAP_PALM_L, 'smooth'); hold('handRPalm', ready, T.clapEnd, CLAP_PALM_R, 'smooth');
  hold('elbowL', ready, T.clapEnd, [0.04, -0.26, -0.06], 'smooth'); hold('elbowR', ready, T.clapEnd, [-0.04, -0.26, -0.06], 'smooth');
  k('curlL', ready, [6, 8, 5], 'smooth'); k('curlR', ready, [6, 8, 5], 'smooth');
  hold('spreadL', ready, T.clapEnd, -2, 'smooth'); hold('spreadR', ready, T.clapEnd, -2, 'smooth');
  hold('thumbL', ready, T.clapEnd, [6, 6, 4], 'smooth'); hold('thumbR', ready, T.clapEnd, [6, 6, 4], 'smooth');
  T.claps.forEach((tc, i) => {
    const wide = 0.047 - i * 0.002; // big, slow, deliberate claps
    k('handL', tc - 0.30, clapOpen(wide).L, 'outCubic'); k('handR', tc - 0.30, clapOpen(wide).R, 'outCubic');
    k('handL', tc, [0.0118, CLAP_Y, CLAP_Z - 0.004], 'inCubic'); k('handR', tc, [-0.0118, CLAP_Y + 0.002, CLAP_Z + 0.004], 'inCubic');
    k('handL', tc + 0.06, [0.0134, CLAP_Y - 0.0012, CLAP_Z - 0.003], 'outQuad'); k('handR', tc + 0.06, [-0.0134, CLAP_Y + 0.001, CLAP_Z + 0.005], 'outQuad');
    k('handL', tc + 0.15, [0.0122, CLAP_Y, CLAP_Z - 0.004], 'smooth'); k('handR', tc + 0.15, [-0.0122, CLAP_Y + 0.002, CLAP_Z + 0.004], 'smooth');
    k('spine', tc - 0.05, [1, 0, 0], 'smooth'); k('spine', tc + 0.07, [3.5, 0, 0], 'outQuad'); k('spine', tc + 0.32, [1, 0, 0], 'smooth');
    k('head', tc - 0.04, [-5, i % 2 ? -3 : 3, 5], 'smooth'); k('head', tc + 0.09, [1.5, i % 2 ? -2 : 2, 4], 'outQuad');
    k('curlL', tc + 0.02, [11, 15, 9], 'outQuad'); k('curlR', tc + 0.02, [11, 15, 9], 'outQuad');
    k('curlL', tc + 0.22, [6, 8, 5], 'smooth'); k('curlR', tc + 0.22, [6, 8, 5], 'smooth');
  });

  // ================================================================ cover mouth & giggle
  const ce = T.clapEnd;
  k('handL', ce, clapOpen(0.014).L, 'smooth'); k('handR', ce, clapOpen(0.014).R, 'smooth');
  // right hand to the mouth (head space), left hand to the belly
  const MOUTH_WRIST = [-0.010, 0.318, 0.104];
  hold('handR', T.coverOn, T.giggleEnd, MOUTH_WRIST, 'outBack');
  k('handRSpace', T.coverOn, [0, 0, 1], 'smooth'); k('handRSpace', T.giggleEnd, [0, 0, 1], 'smooth');
  hold('handRDir', T.coverOn, T.giggleEnd, [0.72, 0.68, 0.05], 'smooth');
  hold('handRPalm', T.coverOn, T.giggleEnd, [0.05, -0.08, -1], 'smooth');
  hold('elbowR', T.coverOn, T.giggleEnd, [-0.16, -0.22, 0.04], 'smooth');
  hold('curlR', T.coverOn, T.giggleEnd, [10, 12, 8], 'smooth'); hold('spreadR', T.coverOn, T.giggleEnd, -3, 'smooth');
  hold('thumbR', T.coverOn, T.giggleEnd, [14, 12, 10], 'smooth');
  hold('handL', T.coverOn, T.coverOff, [0.022, 0.208, 0.086], 'smooth');
  k('handLSpace', T.coverOn, [0, 1, 0], 'smooth');
  hold('handLDir', T.coverOn, T.coverOff, [-0.85, -0.2, 0.45], 'smooth'); hold('handLPalm', T.coverOn, T.coverOff, [0.1, -0.1, -1], 'smooth');
  hold('elbowL', T.coverOn, T.coverOff, [0.18, -0.12, -0.02], 'smooth'); hold('curlL', T.coverOn, T.coverOff, [18, 22, 12], 'smooth');
  k('grin', T.coverOn, 1.0, 'smooth'); k('grin', T.coverOn + 0.5, 0.0, 'smooth');
  k('squint', T.coverOn, 0.62, 'smooth'); k('squint', T.giggleEnd, 0.55, 'smooth'); k('squint', T.coverOff, 0.0, 'smooth');
  for (let i = 0; i < 4; i++) {
    const t = T.coverOn + 0.06 + i * 0.17;
    k('spine', t, [5, 0, 0], 'smooth'); k('spine', t + 0.085, [-1, 0, 0], 'smooth');
    k('head', t, [5, 0, 7], 'smooth'); k('head', t + 0.085, [-2, 0, 4], 'smooth');
  }
  k('spine', T.giggleEnd, [2, 0, 0], 'smooth');
  k('head', T.giggleEnd, [0, 0, 2], 'smooth');
  // lower the hand back to rest, neutral cat face
  k('handR', T.coverOff, [-0.030, 0.212, 0.090], 'smooth');
  k('handRSpace', T.coverOff, [0, 1, 0], 'smooth');
  k('handRDir', T.coverOff, [0.15, -0.55, 0.82], 'smooth'); k('handRPalm', T.coverOff, [0.75, -0.25, -0.6], 'smooth');
  k('curlR', T.coverOff, [18, 24, 14], 'smooth'); k('elbowR', T.coverOff, [-0.14, -0.22, -0.06], 'smooth');
  k('handL', T.coverOff + 0.15, [0.031, 0.210, 0.090], 'smooth');
  k('handL', T.shakeOut + 0.1, [0.024, 0.236, 0.092], 'smooth'); k('handL', T.end, [0.024, 0.236, 0.092], 'smooth');
  k('handLDir', T.shakeOut + 0.1, [-0.55, 0.35, 0.75], 'smooth'); k('handLPalm', T.shakeOut + 0.1, [0.2, -0.2, -1], 'smooth');
  k('curlL', T.shakeOut + 0.1, [26, 34, 18], 'smooth');
  k('handLDir', T.coverOff + 0.15, [-0.15, -0.55, 0.82], 'smooth'); k('handLPalm', T.coverOff + 0.15, [-0.75, -0.25, -0.6], 'smooth');
  k('curlL', T.coverOff + 0.15, [22, 30, 16], 'smooth'); k('elbowL', T.coverOff + 0.15, [0.14, -0.22, -0.06], 'smooth');

  // ================================================================ handshake offer
  hold('handR', T.coverOff, T.shakeStart, [-0.030, 0.212, 0.090], 'smooth');
  const SHAKE = [-0.062, 0.372, 0.232];
  k('handR', T.shakeOut, SHAKE, 'outBack');
  k('handRSpace', T.shakeStart, [0, 1, 0], 'smooth'); k('handRSpace', T.shakeOut, [0.6, 0.4, 0], 'outCubic');
  k('handRDir', T.shakeStart, [0.15, -0.55, 0.82], 'smooth'); k('handRDir', T.shakeOut, [0.12, 0.34, 1], 'outCubic');
  k('handRPalm', T.shakeStart, [0.75, -0.25, -0.6], 'smooth'); k('handRPalm', T.shakeOut, [1, -0.12, -0.08], 'outCubic');
  k('elbowR', T.shakeOut, [-0.16, -0.22, -0.02], 'outCubic');
  k('curlR', T.shakeOut, [16, 22, 12], 'outCubic'); k('thumbR', T.shakeOut, [-8, 6, 6], 'outCubic'); k('spreadR', T.shakeOut, -1, 'outCubic');
  k('spine', T.shakeStart, [2, 0, 0], 'smooth'); k('spine', T.shakeOut, [12, -9, 0], 'outCubic'); k('spine', 12.0, [10, -8, 0], 'smooth'); k('spine', T.end, [11, -8, 0], 'smooth');
  k('pelvisRot', T.shakeStart, [0, 0, 0], 'smooth'); k('pelvisRot', T.shakeOut, [4, 0, 0], 'outCubic'); k('pelvisRot', T.end, [4, 0, 0], 'smooth');
  k('head', T.shakeStart, [0, 0, 0], 'smooth'); k('head', T.shakeOut + 0.25, [-3, 4, -8], 'smooth');
  // expectant little bobs ("well? shake it")
  const bob = (t, dy) => k('handR', t, [SHAKE[0], SHAKE[1] + dy, SHAKE[2] - Math.abs(dy) * 0.3], 'smooth');
  bob(11.3, 0); bob(11.5, -0.012); bob(11.7, 0); bob(11.9, -0.010); bob(12.1, 0); bob(T.end, 0);
  k('head', 12.0, [-2, 6, -12], 'smooth'); k('head', T.end, [-2, 6, -12], 'smooth');
  k('pupil', 10.4, 0.7, 'smooth'); k('pupil', T.end, 0.72, 'smooth');

  // ================================================================ tail & ears
  k('tailCurl', 0, 55); k('tailCurl', 3.5, 55, 'smooth'); k('tailCurl', 4.5, 35, 'smooth'); k('tailCurl', T.end, 40, 'smooth');
  k('tailLift', 0, 0); k('tailLift', T.standEnd, 6, 'smooth');
  k('tailWag', 0, 3); k('tailWag', 1.5, 7, 'smooth'); k('tailWag', 2.5, 3, 'smooth'); k('tailWag', 5, 4, 'smooth'); k('tailWag', 8.5, 9, 'smooth'); k('tailWag', 10.2, 4, 'smooth'); k('tailWag', T.end, 6, 'smooth');
  k('ears', 0, [0, 0, 0]); k('ears', 1.3, [-8, 0, -6], 'smooth'); k('ears', 2.3, [0, 0, 0], 'smooth'); k('ears', 3.0, [6, 0, 8], 'smooth');
  k('ears', 4.0, [-6, 0, -4], 'smooth'); k('ears', 5.0, [4, 0, 10], 'smooth'); k('ears', 8.6, [8, 0, 14], 'smooth'); k('ears', 10.0, [-4, 0, -2], 'smooth'); k('ears', 10.6, [-10, 0, -8], 'smooth');

  // ================================================================ props: treat + human hand
  k('treatVis', 0, 1, 'hold'); k('treatVis', 2.42, 1, 'hold'); k('treatVis', 2.43, 0, 'hold');
  k('human', 0, 0); k('human', T.handIn, 0, 'smooth'); k('human', T.treatReady, 1, 'outCubic'); k('human', T.bite + 0.05, 1, 'smooth'); k('human', T.handOut + 0.75, 0, 'inOutCubic');

  // ================================================================ camera (handheld phone, landscape)
  const HI_POS = [0.07, 0.90, 0.64], HI_TGT = [0.0, 0.215, 0.035];
  const LO_POS = [0.03, 0.52, 0.66], LO_TGT = [0.0, 0.300, 0.0];
  k('camPos', 0, HI_POS); k('camPos', 3.6, [0.065, 0.89, 0.62], 'smooth');
  k('camPos', 5.3, LO_POS, 'inOutCubic'); k('camPos', 8.1, [0.028, 0.515, 0.62], 'smooth');
  k('camPos', 10.3, [0.03, 0.52, 0.62], 'smooth'); k('camPos', 10.62, [0.035, 0.53, 0.66], 'outQuad'); k('camPos', 11.6, [0.02, 0.50, 0.55], 'smooth'); k('camPos', T.end, [0.015, 0.49, 0.53], 'smooth');
  k('camTarget', 0, HI_TGT); k('camTarget', 3.6, [0.0, 0.22, 0.035], 'smooth');
  k('camTarget', 5.3, LO_TGT, 'inOutCubic'); k('camTarget', 10.3, [0.0, 0.305, 0.0], 'smooth'); k('camTarget', 11.6, [-0.01, 0.31, 0.08], 'smooth'); k('camTarget', T.end, [-0.012, 0.31, 0.09], 'smooth');
  k('camFov', 0, 44); k('camFov', 3.6, 44, 'smooth'); k('camFov', 5.3, 40, 'inOutCubic'); k('camFov', 9.5, 38.5, 'smooth'); k('camFov', 10.5, 41, 'smooth'); k('camFov', T.end, 40, 'smooth');
  k('shake', 0, 1.0); k('shake', 3.6, 1.0, 'smooth'); k('shake', 4.4, 1.6, 'smooth'); k('shake', 5.4, 1.0, 'smooth'); k('shake', 10.4, 1.0, 'smooth'); k('shake', 10.6, 2.2, 'outQuad'); k('shake', 11.0, 1.0, 'smooth');
  return tr;
}

export function createMemeChoreo() {
  const c = new Choreo({ duration: T.end, tracks: build() });
  c.T = T;
  return c;
}
