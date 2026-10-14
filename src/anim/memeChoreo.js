// The "Black Cat Clapping" sequence (after @merkurianin's viral clip, Sept 2026):
// treat -> stands up -> human grin -> slow claps -> covers mouth -> offers a handshake.
// Positions are in the cat's bind/root space (metres, +z towards the viewer, +x = cat's left).
import { Choreo } from './tracks.js';

export const T = {
  handIn: 0.35, treatAtMouth: 1.55, sniffEnd: 2.05, bite: 2.15, handOut: 2.35,
  chewEnd: 3.45, standStart: 3.55, standEnd: 4.45, grinStart: 4.35, grinFull: 5.0,
  claps: [5.35, 6.0, 6.65, 7.3, 7.95], clapEnd: 8.35,
  coverStart: 8.45, coverOn: 8.85, giggleEnd: 9.6, coverOff: 10.0,
  shakeStart: 10.2, shakeOut: 10.55, end: 13.4,
};

// --- poses
const SIT = {
  pelvisPos: [0, -0.050, -0.028], pelvisRot: [17, 0, 0], spine: [6, 0, 0],
  handL: [0.031, 0.015, 0.086], handR: [-0.031, 0.015, 0.086],
  handLDir: [0.04, -0.06, 1], handRDir: [-0.04, -0.06, 1], handLPalm: [0, -1, 0.05], handRPalm: [0, -1, 0.05],
  handLSpace: [1, 0, 0], handRSpace: [1, 0, 0],
  elbowL: [0.18, 0.05, -0.30], elbowR: [-0.18, 0.05, -0.30],
  curlL: [6, 6, 4], curlR: [6, 6, 4], spreadL: 4, spreadR: 4, thumbL: [5, 4, 4], thumbR: [5, 4, 4],
};
const STAND = {
  pelvisPos: [0, 0.0, 0.0], pelvisRot: [0, 0, 0], spine: [-4, 0, 0],
  handL: [0.030, 0.212, 0.088], handR: [-0.030, 0.212, 0.088],
  handLDir: [-0.15, -0.55, 0.82], handRDir: [0.15, -0.55, 0.82], handLPalm: [-0.75, -0.25, -0.6], handRPalm: [0.75, -0.25, -0.6],
  handLSpace: [0, 1, 0], handRSpace: [0, 1, 0],
  elbowL: [0.20, -0.15, -0.10], elbowR: [-0.20, -0.15, -0.10],
  curlL: [22, 30, 16], curlR: [22, 30, 16], spreadL: 0, spreadR: 0, thumbL: [12, 14, 10], thumbR: [12, 14, 10],
};
// clap hand placement (chest space)
const CLAP_Y = 0.236, CLAP_Z = 0.112;
const clapOpen = (w) => ({ L: [0.020 + w, CLAP_Y + 0.004, CLAP_Z - 0.004], R: [-0.020 - w, CLAP_Y + 0.004, CLAP_Z - 0.004] });
const CLAP_DIR_L = [-0.30, 0.78, 0.55], CLAP_DIR_R = [0.30, 0.78, 0.55];
const CLAP_PALM_L = [-1, 0.05, 0.12], CLAP_PALM_R = [1, 0.05, 0.12];

function build() {
  const tr = {};
  const k = (name, t, v, e) => { (tr[name] ||= []).push([t, v, e]); };
  const pose = (t, P, e) => { for (const [n, v] of Object.entries(P)) k(n, t, v, e); };

  // ---------------------------------------------------------------- sit, sniff, eat
  pose(0, SIT, 'smooth');
  pose(1.25, SIT, 'smooth');
  // lean towards the treat
  k('spine', 1.65, [14, 0, 0]); k('spine', 2.2, [12, 0, 0]); k('spine', 2.6, [6, 0, 0], 'smooth');
  k('neck', 0, [0, 0, 0]); k('neck', 1.3, [0, 0, 0]); k('neck', 1.7, [18, 0, 0]); k('neck', 2.2, [14, 0, 0]); k('neck', 2.7, [0, 0, 0], 'smooth');
  k('head', 0, [-4, 0, 0]); k('head', 1.0, [-6, -6, 4]); k('head', 1.4, [-2, 0, 0]);
  // sniff jitter
  for (let i = 0; i < 6; i++) k('head', 1.5 + i * 0.09, [4 + (i % 2) * 3, (i % 3 - 1) * 2, 0], 'smooth');
  k('head', 2.15, [10, 0, 0], 'outBack'); k('head', 2.5, [0, 0, -2]);
  // chewing: head bobs, then content
  for (let i = 0; i < 5; i++) { k('head', 2.6 + i * 0.2, [2 + (i % 2) * 3, 0, -2 + (i % 2) * 2], 'smooth'); }
  k('head', 3.6, [-2, 0, 0], 'smooth');
  k('look', 0, 0.85); k('look', 1.3, 0.85); k('look', 1.45, 0.0); k('look', 2.6, 0.0); k('look', 3.2, 0.7); k('look', 4.4, 0.9);
  k('jaw', 0, 0); k('jaw', 2.05, 0, 'smooth'); k('jaw', 2.15, 14, 'smooth'); k('jaw', 2.3, 2, 'smooth');
  for (let i = 0; i < 6; i++) { k('jaw', 2.42 + i * 0.18, 9, 'smooth'); k('jaw', 2.51 + i * 0.18, 1, 'smooth'); }
  k('jaw', 3.6, 0, 'smooth');
  k('squint', 0, 0); k('squint', 2.4, 0, 'smooth'); k('squint', 2.7, 0.55, 'smooth'); k('squint', 3.4, 0.5, 'smooth'); k('squint', 3.7, 0, 'smooth');
  k('pupil', 0, 0.56); k('pupil', 1.4, 0.70, 'smooth'); k('pupil', 2.4, 0.62, 'smooth'); k('pupil', 4.4, 0.52, 'smooth');

  // ---------------------------------------------------------------- stand up
  pose(T.standStart, SIT, 'inOutCubic');
  // anticipation: dip slightly before rising
  k('pelvisPos', T.standStart + 0.18, [0, -0.056, -0.034], 'smooth');
  k('pelvisRot', T.standStart + 0.18, [21, 0, 0], 'smooth');
  pose(T.standEnd, STAND, 'outBack');
  k('pelvisPos', T.standEnd + 0.25, [0, 0.002, 0.002], 'smooth');
  // hands come up with a little delay
  k('handL', T.standStart + 0.35, [0.033, 0.075, 0.105], 'smooth'); k('handR', T.standStart + 0.35, [-0.033, 0.075, 0.105], 'smooth');
  k('handLSpace', T.standStart + 0.35, [0.5, 0.5, 0]); k('handRSpace', T.standStart + 0.35, [0.5, 0.5, 0]);
  k('spine', T.standEnd + 0.3, [-5, 0, 0], 'smooth');
  k('neck', T.standEnd, [-4, 0, 0]);
  k('head', T.standEnd - 0.1, [6, 0, 0], 'smooth'); k('head', T.standEnd + 0.35, [-2, 0, 3], 'smooth');

  // ---------------------------------------------------------------- grin
  k('grin', 0, 0); k('grin', T.grinStart, 0, 'inOutCubic'); k('grin', T.grinFull, 1.0, 'smooth');
  k('squint', T.grinStart, 0, 'smooth'); k('squint', T.grinFull, 0.85, 'smooth');
  k('head', T.grinFull, [-4, 0, 5], 'smooth');

  // ---------------------------------------------------------------- slow claps
  const c0 = T.claps[0];
  // raise hands into clap-ready position
  k('handL', c0 - 0.55, clapOpen(0.032).L, 'smooth'); k('handR', c0 - 0.55, clapOpen(0.032).R, 'smooth');
  k('handLSpace', c0 - 0.55, [0, 1, 0]); k('handRSpace', c0 - 0.55, [0, 1, 0]);
  k('handLDir', c0 - 0.55, CLAP_DIR_L); k('handRDir', c0 - 0.55, CLAP_DIR_R);
  k('handLPalm', c0 - 0.55, CLAP_PALM_L); k('handRPalm', c0 - 0.55, CLAP_PALM_R);
  k('elbowL', c0 - 0.55, [0.12, -0.22, -0.02]); k('elbowR', c0 - 0.55, [-0.12, -0.22, -0.02]);
  k('curlL', c0 - 0.55, [6, 8, 5]); k('curlR', c0 - 0.55, [6, 8, 5]);
  k('spreadL', c0 - 0.55, -2); k('spreadR', c0 - 0.55, -2);
  k('thumbL', c0 - 0.55, [6, 6, 4]); k('thumbR', c0 - 0.55, [6, 6, 4]);
  T.claps.forEach((tc, i) => {
    const wide = 0.034 - i * 0.002;
    // open -> accelerate in -> contact -> rebound -> open
    k('handL', tc - 0.30, clapOpen(wide).L, 'inCubic'); k('handR', tc - 0.30, clapOpen(wide).R, 'inCubic');
    k('handL', tc, [0.0105, CLAP_Y, CLAP_Z], 'outQuad'); k('handR', tc, [-0.0105, CLAP_Y, CLAP_Z], 'outQuad');
    k('handL', tc + 0.07, [0.0125, CLAP_Y - 0.001, CLAP_Z + 0.001], 'smooth'); k('handR', tc + 0.07, [-0.0125, CLAP_Y - 0.001, CLAP_Z + 0.001], 'smooth');
    k('handL', tc + 0.16, [0.0115, CLAP_Y, CLAP_Z], 'outCubic'); k('handR', tc + 0.16, [-0.0115, CLAP_Y, CLAP_Z], 'outCubic');
    // body / head bob synced with impact
    k('spine', tc - 0.05, [-5, 0, 0], 'smooth'); k('spine', tc + 0.08, [-2.5, 0, 0], 'smooth'); k('spine', tc + 0.3, [-5, 0, 0], 'smooth');
    k('head', tc - 0.04, [-5, i % 2 ? -3 : 3, 5], 'smooth'); k('head', tc + 0.1, [1, i % 2 ? -2 : 2, 4], 'smooth');
    k('curlL', tc + 0.02, [10, 14, 8], 'smooth'); k('curlR', tc + 0.02, [10, 14, 8], 'smooth');
    k('curlL', tc + 0.2, [6, 8, 5], 'smooth'); k('curlR', tc + 0.2, [6, 8, 5], 'smooth');
  });

  // ---------------------------------------------------------------- cover mouth & giggle
  const ce = T.clapEnd;
  k('handL', ce, clapOpen(0.012).L, 'smooth'); k('handR', ce, clapOpen(0.012).R, 'smooth');
  // right hand to the mouth (head space), left hand to the belly
  k('handR', T.coverOn, [-0.004, 0.330, 0.089], 'outBack');
  k('handRSpace', ce, [0, 1, 0]); k('handRSpace', T.coverOn, [0, 0, 1], 'smooth');
  k('handRDir', T.coverOn, [0.62, 0.78, 0.05]); k('handRPalm', T.coverOn, [0.05, -0.1, -1]);
  k('elbowR', T.coverOn, [-0.18, -0.2, 0.05]);
  k('curlR', T.coverOn, [10, 12, 8]); k('spreadR', T.coverOn, -3); k('thumbR', T.coverOn, [14, 12, 10]);
  k('handL', T.coverOn, [0.024, 0.205, 0.084], 'smooth');
  k('handLDir', T.coverOn, [-0.85, -0.2, 0.45]); k('handLPalm', T.coverOn, [0.1, -0.1, -1]);
  k('elbowL', T.coverOn, [0.22, -0.1, -0.02]); k('curlL', T.coverOn, [18, 22, 12]);
  k('grin', T.coverOn - 0.05, 1.0, 'smooth'); k('grin', T.coverOn + 0.35, 0.0, 'smooth');
  k('squint', T.coverOn, 0.85, 'smooth'); k('squint', T.giggleEnd, 0.75, 'smooth'); k('squint', T.coverOff, 0.0, 'smooth');
  // giggle: little shoulder/head shakes
  for (let i = 0; i < 4; i++) {
    const t = T.coverOn + 0.08 + i * 0.17;
    k('spine', t, [-1, 0, 0], 'smooth'); k('spine', t + 0.085, [-6, 0, 0], 'smooth');
    k('head', t, [4, 0, 6], 'smooth'); k('head', t + 0.085, [-3, 0, 4], 'smooth');
  }
  k('head', T.giggleEnd, [0, 0, 2], 'smooth');
  // lower the hand, neutral face
  k('handR', T.coverOff, [-0.030, 0.212, 0.090], 'smooth');
  k('handRSpace', T.coverOff - 0.15, [0, 0.3, 0.7], 'smooth'); k('handRSpace', T.coverOff, [0, 1, 0], 'smooth');
  k('handRDir', T.coverOff, [0.15, -0.55, 0.82]); k('handRPalm', T.coverOff, [0.75, -0.25, -0.6]);
  k('curlR', T.coverOff, [18, 24, 14]); k('elbowR', T.coverOff, [-0.20, -0.15, -0.10]);
  k('handL', T.coverOff + 0.1, [0.031, 0.210, 0.090], 'smooth');
  k('handLDir', T.coverOff + 0.1, [-0.15, -0.55, 0.82]); k('handLPalm', T.coverOff + 0.1, [-0.75, -0.25, -0.6]);

  // ---------------------------------------------------------------- handshake offer
  k('handR', T.shakeStart, [-0.030, 0.214, 0.092], 'outCubic');
  k('handR', T.shakeOut, [-0.026, 0.262, 0.262], 'outBack');
  k('handRSpace', T.shakeStart, [0, 1, 0]); k('handRSpace', T.shakeOut, [0.6, 0.4, 0]);
  k('handRDir', T.shakeStart, [0.15, -0.55, 0.82]); k('handRDir', T.shakeOut, [0.10, 0.12, 1]);
  k('handRPalm', T.shakeStart, [0.75, -0.25, -0.6]); k('handRPalm', T.shakeOut, [1, -0.08, 0]);
  k('elbowR', T.shakeOut, [-0.16, -0.20, 0.0]);
  k('curlR', T.shakeOut, [16, 22, 12]); k('thumbR', T.shakeOut, [-8, 6, 6]); k('spreadR', T.shakeOut, -1);
  k('spine', T.shakeOut, [3, -6, 0], 'smooth'); k('spine', T.end, [3, -5, 0]);
  k('head', T.shakeStart, [0, 0, 0], 'smooth'); k('head', T.shakeOut + 0.2, [-3, 4, -8], 'smooth');
  // expectant little hand bobs ("well? shake it")
  k('handR', 11.5, [-0.026, 0.262, 0.262], 'smooth'); k('handR', 11.7, [-0.026, 0.250, 0.258], 'smooth');
  k('handR', 11.9, [-0.026, 0.262, 0.262], 'smooth'); k('handR', 12.1, [-0.026, 0.252, 0.259], 'smooth');
  k('handR', 12.3, [-0.026, 0.262, 0.262], 'smooth'); k('handR', T.end, [-0.026, 0.262, 0.262]);
  k('head', 12.0, [-2, 6, -12], 'smooth'); k('head', T.end, [-2, 6, -12]);
  k('pupil', 10.4, 0.7, 'smooth'); k('pupil', T.end, 0.72);

  // ---------------------------------------------------------------- tail & ears
  k('tailCurl', 0, 55); k('tailCurl', 3.5, 55, 'smooth'); k('tailCurl', 4.5, 35); k('tailCurl', T.end, 40);
  k('tailLift', 0, 0); k('tailLift', T.standEnd, 6);
  k('tailWag', 0, 3); k('tailWag', 1.5, 7); k('tailWag', 2.5, 3); k('tailWag', 5, 4); k('tailWag', 8.5, 9); k('tailWag', 10.2, 4); k('tailWag', T.end, 6);
  k('ears', 0, [0, 0, 0]); k('ears', 1.3, [-8, 0, -6]); k('ears', 2.3, [0, 0, 0]); k('ears', 3.0, [6, 0, 8], 'smooth');
  k('ears', 4.0, [-6, 0, -4], 'smooth'); k('ears', 5.0, [4, 0, 10], 'smooth'); k('ears', 8.6, [8, 0, 14], 'smooth'); k('ears', 10.0, [-4, 0, -2], 'smooth'); k('ears', 10.6, [-10, 0, -8], 'smooth');

  // ---------------------------------------------------------------- props: treat + human hand
  // treat position in cat root space; vis 1 while held / in mouth until swallowed
  k('treatVis', 0, 1, 'hold'); k('treatVis', T.bite + 0.12, 0, 'hold');
  k('human', 0, 0); k('human', T.handIn, 0, 'smooth'); k('human', 1.35, 1, 'smooth'); k('human', T.bite, 1, 'smooth'); k('human', T.handOut + 0.75, 0, 'inOutCubic');

  // ---------------------------------------------------------------- camera (handheld POV)
  k('camPos', 0, [0.07, 0.96, 0.70]); k('camPos', 3.0, [0.06, 0.95, 0.66]); k('camPos', 5.0, [0.05, 0.93, 0.60], 'smooth'); k('camPos', 9.0, [0.04, 0.92, 0.58]);
  k('camPos', 10.6, [0.05, 0.94, 0.62], 'smooth'); k('camPos', T.end, [0.05, 0.94, 0.63]);
  k('camTarget', 0, [0.0, 0.20, 0.02]); k('camTarget', 2.0, [0.0, 0.21, 0.04]); k('camTarget', T.standEnd, [0.0, 0.27, 0.0], 'smooth');
  k('camTarget', 9.0, [0.0, 0.28, 0.0]); k('camTarget', 10.7, [0.0, 0.27, 0.06], 'smooth'); k('camTarget', T.end, [0.0, 0.27, 0.06]);
  k('camFov', 0, 52); k('camFov', 4.6, 52); k('camFov', 6.0, 49, 'smooth'); k('camFov', 9.5, 49); k('camFov', 10.5, 51, 'smooth');
  k('shake', 0, 1.0); k('shake', 10.4, 1.0); k('shake', 10.55, 2.2, 'smooth'); k('shake', 10.9, 1.0, 'smooth');
  return tr;
}

export function createMemeChoreo() {
  const c = new Choreo({ duration: T.end, tracks: build() });
  c.T = T;
  return c;
}
