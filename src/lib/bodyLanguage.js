/*
  bodyLanguage.js — how each avatar MOVES (and emotes), as plain data + tiny pure helpers.

  Why a separate file: the rig (avatarRig.js) knows HOW to move a skeleton; this file
  says WHO moves how. One entry per avatar — add a character by adding an entry, no
  rig code changes. Everything here is pure (the random source is injected), so the
  variety rules are unit-tested.

  A style is deep-merged over DEFAULT_STYLE, so an entry lists only what is different.

    gestures   when and what the hands do while the avatar speaks
      rate        [min, max] seconds between gestures
      dur         [min, max] seconds one gesture lasts
      amp         [min, max] how big (1 = the pose as defined)
      repertoire  [{ kind, w, hands }]  weighted; hands: right | left | either | both
      emphasis    a loud syllable may trigger a gesture early ("beat")
      minGap      shortest time between two gestures
      idle        chance of a small hand movement while NOT speaking (per check)
    thinkPose / listenPose   an arm pose held while thinking / listening (null = none)
    head       multipliers for the head's yaw / pitch / roll / nod; `scan` sweeps the head
               (radians) while idle; `tilt` is a head tilt when listening/thinking
    body       `sway` (weight shift) multiplier, `lean` forward while speaking
    face       smile base + variation, brow multiplier (0 = none), blink multiplier
    signature  { every:[min,max], first:[min,max] } — the model's own embedded
               gesture clip, played only now and then (the Executive)
*/

export const DEFAULT_STYLE = {
  gestures: {
    rate: [1.6, 3.2],
    dur: [1.3, 2.4],
    amp: [0.8, 1.05],
    repertoire: [
      { kind: "explain", w: 3, hands: "right" },
      { kind: "open", w: 2, hands: "both" },
      { kind: "palm", w: 1.5, hands: "either" },
      { kind: "point", w: 1, hands: "right" },
      { kind: "beat", w: 2, hands: "either" },
    ],
    emphasis: true,
    minGap: 0.9,
    firstDelay: [0.8, 1.6],
    idle: 0,
  },
  thinkPose: null,
  listenPose: null,
  head: { yaw: 1, pitch: 1, roll: 1, nod: 1, scan: 0, tilt: 0 },
  body: { sway: 1, lean: 0 },
  face: { smile: 0.1, smileVar: 0.1, brow: 1, blink: 1 },
  signature: null,
};

export const STYLES = {
  // friendly host: wide, welcoming, a little forward
  nonstop: {
    gestures: {
      rate: [2, 3.6],
      amp: [0.9, 1.15],
      repertoire: [
        { kind: "open", w: 4, hands: "both" },
        { kind: "explain", w: 3, hands: "either" },
        { kind: "palm", w: 2, hands: "both" },
        { kind: "beat", w: 2, hands: "either" },
        { kind: "shrug", w: 0.8, hands: "both" },
        { kind: "point", w: 0.8, hands: "right" },
      ],
    },
    head: { yaw: 1.15, pitch: 1.1, roll: 1.1, nod: 1.15 },
    body: { sway: 1.1, lean: 0.5 },
    face: { smile: 0.18, smileVar: 0.1, brow: 1.15 },
  },

  // calm authority: few, deliberate gestures; hands folded when listening
  executive: {
    gestures: {
      rate: [3.2, 6.5],
      dur: [1.6, 2.6],
      amp: [0.7, 0.95],
      repertoire: [
        { kind: "explain", w: 4, hands: "right" },
        { kind: "beat", w: 2, hands: "right" },
        { kind: "palm", w: 2, hands: "either" },
        { kind: "open", w: 1.5, hands: "both" },
        { kind: "clasp", w: 1.2, hands: "both" },
        { kind: "point", w: 0.6, hands: "right" },
      ],
      firstDelay: [1.5, 3],
    },
    listenPose: "clasp",
    head: { yaw: 0.8, pitch: 0.9, roll: 0.7, nod: 1 },
    body: { sway: 0.8, lean: 0 },
    face: { smile: 0.07, smileVar: 0.06, brow: 1 },
    signature: { first: [3, 6], every: [11, 20] },
  },

  // minimal: small, precise movements, a neutral face
  coder: {
    gestures: {
      rate: [5, 9],
      dur: [1.1, 1.8],
      amp: [0.5, 0.8],
      repertoire: [
        { kind: "beat", w: 4, hands: "right" },
        { kind: "explain", w: 3, hands: "right" },
        { kind: "point", w: 1.2, hands: "right" },
        { kind: "palm", w: 0.6, hands: "right" },
      ],
      firstDelay: [2, 4],
    },
    head: { yaw: 0.65, pitch: 0.8, roll: 0.6, nod: 0.7 },
    body: { sway: 0.7 },
    face: { smile: 0.03, smileVar: 0.04, brow: 0.7, blink: 0.9 },
  },

  // alert and still: rare "hold / stop" hands, slow scans of the room
  security: {
    gestures: {
      rate: [7, 13],
      dur: [1.2, 2],
      amp: [0.5, 0.75],
      repertoire: [
        { kind: "palm", w: 3, hands: "right" },
        { kind: "point", w: 2, hands: "right" },
        { kind: "explain", w: 1, hands: "right" },
        { kind: "clasp", w: 1, hands: "both" },
      ],
      emphasis: false,
      firstDelay: [3, 6],
    },
    head: { yaw: 0.55, pitch: 0.7, roll: 0.4, nod: 0.6, scan: 0.17 },
    body: { sway: 0.5 },
    face: { smile: 0, smileVar: 0.02, brow: 0.6, blink: 0.8 },
  },

  // thoughtful: counts on fingers, hand to the chin while thinking, a curious head tilt
  researcher: {
    gestures: {
      rate: [2.6, 5],
      amp: [0.75, 1],
      repertoire: [
        { kind: "explain", w: 3, hands: "either" },
        { kind: "count", w: 2.5, hands: "right" },
        { kind: "open", w: 1.5, hands: "both" },
        { kind: "palm", w: 1, hands: "either" },
        { kind: "chin", w: 0.8, hands: "right" },
      ],
    },
    thinkPose: "chin",
    head: { yaw: 0.9, pitch: 1, roll: 1.3, nod: 0.9, tilt: 0.05 },
    face: { smile: 0.1, smileVar: 0.08, brow: 1.35 },
  },

  // expressive storyteller: big arcs, shrugs, a lively face
  writer: {
    gestures: {
      rate: [1.9, 3.4],
      dur: [1.4, 2.4],
      amp: [0.95, 1.25],
      repertoire: [
        { kind: "flourish", w: 3, hands: "either" },
        { kind: "open", w: 3, hands: "both" },
        { kind: "explain", w: 2, hands: "either" },
        { kind: "palm", w: 1.5, hands: "either" },
        { kind: "shrug", w: 1, hands: "both" },
        { kind: "clasp", w: 0.7, hands: "both" },
      ],
    },
    head: { yaw: 1.2, pitch: 1.1, roll: 1.4, nod: 1.1 },
    body: { sway: 1.2, lean: 0.25 },
    face: { smile: 0.2, smileVar: 0.12, brow: 1.3 },
  },

  // a static statue-like model: no skeleton, so only the face and a slight sway
  architect: {
    face: { smile: 0.08, smileVar: 0.06, brow: 0 },
  },
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function merge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base?.[k]) ? merge(base[k], v) : v;
  return out;
}

/** A style by avatar id (or a partial style object), merged over the defaults. */
export function resolveStyle(style) {
  if (!style) return DEFAULT_STYLE;
  if (typeof style === "string") return merge(DEFAULT_STYLE, STYLES[style] || {});
  return merge(DEFAULT_STYLE, style);
}

/**
 * What each gesture kind is made of: which arm pose, how the hand rhythm moves
 * (`sway` size, `freq` speed) and how far the shoulders lift (`lift`).
 */
export const KINDS = {
  rest: { pose: "rest", sway: 0, freq: 0 },
  explain: { pose: "explain", sway: 1, freq: 5.2 },
  open: { pose: "open", sway: 0.8, freq: 4.4 },
  palm: { pose: "palm", sway: 0.6, freq: 3.6 },
  point: { pose: "point", sway: 0.6, freq: 4 },
  beat: { pose: "explain", sway: 1.7, freq: 8.2, short: true }, // quick small rhythmic strokes
  count: { pose: "point", sway: 1.3, freq: 6.4 }, // ticking off points
  flourish: { pose: "flourish", sway: 0.8, freq: 3.4 },
  shrug: { pose: "shrug", sway: 0.5, freq: 3, lift: 0.3 },
  clasp: { pose: "clasp", sway: 0.25, freq: 2.4 },
  chin: { pose: "chin", sway: 0.15, freq: 2 },
};

export const kindInfo = (kind) => KINDS[kind] || { pose: kind, sway: 1, freq: 5 };

const between = ([lo, hi], r) => lo + (hi - lo) * r;

/** Seconds until the next gesture. */
export function gestureDelay(style, rng = Math.random) {
  return between(style.gestures.rate, rng());
}

/**
 * Pick the next gesture. `recent` is the list of the last kinds, newest first: the
 * previous kind is never repeated, the one before it is rarely repeated, so the same
 * movement never plays twice in a row.
 */
export function pickGesture(style, recent = [], rng = Math.random) {
  const rep = style.gestures.repertoire;
  const weights = rep.map((g) => {
    if (g.kind === recent[0]) return 0;
    if (g.kind === recent[1]) return g.w * 0.3;
    return g.w;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    // a one-entry repertoire: nothing else to choose
    return { kind: rep[0].kind, hands: rep[0].hands };
  }
  let r = rng() * total;
  for (let i = 0; i < rep.length; i++) {
    r -= weights[i];
    if (r <= 0) return { kind: rep[i].kind, hands: rep[i].hands };
  }
  const last = rep[rep.length - 1];
  return { kind: last.kind, hands: last.hands };
}

/** Per-gesture randomness: size, length and a small offset of the forearm direction. */
export function gestureVariation(style, kind, rng = Math.random) {
  const g = style.gestures;
  const info = kindInfo(kind);
  const dur = between(g.dur, rng()) * (info.short ? 0.6 : 1);
  return {
    amp: between(g.amp, rng()),
    dur,
    jit: [(rng() - 0.5) * 0.18, (rng() - 0.5) * 0.18, (rng() - 0.5) * 0.12],
    phase: rng() * 6.283,
  };
}

/** Which arms take part. `free` = the arm names that are available ("left"/"right"). */
export function chooseArms(hands, free, rng = Math.random) {
  if (!free.length) return [];
  if (hands === "both") return free.length === 2 ? free.slice() : [free[0]];
  if (hands === "left" || hands === "right") return [free.includes(hands) ? hands : free[0]];
  // either: the right (dominant) hand more often
  if (free.length === 1) return [free[0]];
  return [rng() < 0.65 ? "right" : "left"];
}
