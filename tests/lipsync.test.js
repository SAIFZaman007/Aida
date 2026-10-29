import test from "node:test";
import assert from "node:assert/strict";

import { LipSync, LIP_DEFAULTS, mulberry32 } from "../src/lib/lipSync.js";

/** Run `fn(t) -> input` through a LipSync at `fps` for `seconds`; returns the outputs. */
function run(lip, seconds, fps, fn) {
  const out = [];
  const dt = 1 / fps;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const t = i * dt;
    out.push({ t, ...lip.update(dt, fn(t)) });
  }
  return out;
}
const max = (a) => a.reduce((m, v) => Math.max(m, v), -Infinity);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const diffs = (a) => a.slice(1).map((v, i) => Math.abs(v - a[i]));

/** Speech-like loudness: 5 syllables a second with a 150 ms pause after every 4th. */
const speech = (gain = 1) => (t) => {
  const syl = t * 5;
  const inWord = Math.floor(syl) % 4 !== 3;
  const x = syl - Math.floor(syl);
  const amp = inWord ? gain * 0.45 * Math.pow(Math.sin(Math.PI * x), 1.2) : 0;
  return { speaking: true, amplitude: amp, bands: [0.3, 0.3, 0.2] };
};

test("a mouth stays shut for silence, for hiss, and when nobody is speaking", () => {
  const lip = new LipSync();
  assert.equal(max(run(lip, 1, 60, () => ({ speaking: true, amplitude: 0, bands: [0, 0, 0] })).map((o) => o.open)), 0);
  const hiss = run(new LipSync(), 2, 60, () => ({ speaking: true, amplitude: 0.02, bands: [0.1, 0.1, 0.3] }));
  assert.ok(max(hiss.map((o) => o.open)) < 0.02, "room hiss must not move the mouth");
  const loud = run(new LipSync(), 1, 60, () => ({ speaking: false, amplitude: 0.5, bands: [0.5, 0.3, 0.2] }));
  assert.equal(max(loud.map((o) => o.open)), 0, "not speaking → closed, whatever the meter says");
});

test("every voice uses the whole range: quiet and loud speakers open the mouth about as wide", () => {
  const quiet = run(new LipSync(), 4, 60, speech(0.36)); // a very quiet voice (meter peaks ~0.16)
  const loud = run(new LipSync(), 4, 60, speech(1.6)); //   and a very loud one
  const q = max(quiet.slice(120).map((o) => o.open));
  const l = max(loud.slice(120).map((o) => o.open));
  assert.ok(q > 0.7, `quiet speaker peaks at ${q.toFixed(2)}`);
  assert.ok(l > 0.7 && l <= 1, `loud speaker peaks at ${l.toFixed(2)}`);
  assert.ok(Math.abs(q - l) < 0.25, "similar mouth movement for very different volumes");
});

test("it opens quickly on a syllable and closes between words", () => {
  const lip = new LipSync();
  const out = run(lip, 3, 60, speech(1));
  // attack: after a syllable starts, 80% of its peak within ~100 ms
  const pulse = out.filter((o) => o.t > 1 && o.t < 1.2);
  assert.ok(max(pulse.map((o) => o.open)) > 0.6);
  // the pause after every 4th syllable (0.6..0.8 s into each 0.8 s word group) closes the mouth
  const gap = out.filter((o) => o.t > 2.35 && o.t < 2.4);
  assert.ok(mean(gap.map((o) => o.open)) < 0.2, `mouth open ${mean(gap.map((o) => o.open)).toFixed(2)} in the pause`);
});

test("smooth at any frame rate: no frame-to-frame jump a viewer could call a glitch", () => {
  for (const fps of [30, 60, 144]) {
    const out = run(new LipSync(), 4, fps, speech(1));
    const jump = max(diffs(out.map((o) => o.open)));
    assert.ok(jump < 0.45 * (60 / fps) + 0.15, `${fps} fps: biggest step ${jump.toFixed(2)}`);
    for (const o of out) assert.ok(o.open >= 0 && o.open <= 1 && o.wide >= 0 && o.round >= 0 && o.wide <= 1 && o.round <= 1);
  }
});

test("frame-rate independent: the same speech gives the same average mouth at 30 and 144 fps", () => {
  const a = mean(run(new LipSync(), 6, 30, speech(1)).slice(60).map((o) => o.open));
  const b = mean(run(new LipSync(), 6, 144, speech(1)).slice(288).map((o) => o.open));
  assert.ok(Math.abs(a - b) < 0.06, `${a.toFixed(3)} vs ${b.toFixed(3)}`);
});

test("noise around the threshold does not make the mouth flutter (hysteresis)", () => {
  const rng = mulberry32(5);
  const lip = new LipSync();
  // establish a peak with real speech first, then hover right at the gate with noise
  run(lip, 1, 60, speech(1));
  const hover = LIP_DEFAULTS.gateOn * lip.peak;
  let flips = 0;
  let prev = lip.gate;
  const out = run(lip, 4, 60, () => ({
    speaking: true,
    amplitude: hover * (1 + (rng() - 0.5) * 0.3),
    bands: [0.3, 0.3, 0.2],
  }));
  for (const _ of out) {
    if (lip.gate !== prev) flips++;
    prev = lip.gate;
  }
  assert.ok(flips <= 6, `${flips} gate flips in 4 s of threshold noise`);
});

test("mouth shapes: low-heavy sound rounds the lips, high-heavy sound stretches them", () => {
  const lowHeavy = run(new LipSync(), 1, 60, () => ({ speaking: true, amplitude: 0.5, bands: [0.7, 0.2, 0.05] })).at(-1);
  const highHeavy = run(new LipSync(), 1, 60, () => ({ speaking: true, amplitude: 0.5, bands: [0.05, 0.2, 0.7] })).at(-1);
  assert.ok(lowHeavy.round > 0.3 && lowHeavy.round > lowHeavy.wide * 3, JSON.stringify(lowHeavy));
  assert.ok(highHeavy.wide > 0.3 && highHeavy.wide > highHeavy.round * 3, JSON.stringify(highHeavy));
  // shapes only show while the mouth is open, and never both at once
  for (const o of [lowHeavy, highHeavy]) assert.ok(o.wide <= o.open + 1e-9 && o.round <= o.open + 1e-9);
});

test("the shape does not flicker when the spectrum jumps between frames", () => {
  const lip = new LipSync();
  let frame = 0;
  const out = run(lip, 2, 60, () => ({
    speaking: true,
    amplitude: 0.5,
    bands: frame++ % 2 ? [0.7, 0.2, 0.05] : [0.05, 0.2, 0.7], // alternates EVERY frame
  }));
  const tail = out.slice(60);
  // worst case (full-range flip EVERY frame): the shape's peak-to-peak ripple stays small
  const ripple = (k) => max(tail.map((o) => o[k])) - Math.min(...tail.map((o) => o[k]));
  assert.ok(ripple("wide") < 0.15, `wide ripple ${ripple("wide").toFixed(3)}`);
  assert.ok(ripple("round") < 0.15, `round ripple ${ripple("round").toFixed(3)}`);
  assert.ok(max(diffs(tail.map((o) => o.wide))) < 0.12, "wide step per frame");
});

test("the mouth closes at once when speech stops, and the peak is forgotten for the next voice", () => {
  const lip = new LipSync();
  run(lip, 2, 60, speech(1.6));
  const after = run(lip, 0.4, 60, () => ({ speaking: false }));
  assert.ok(after.at(-1).open < 0.01);
  assert.ok(after.at(-1).round < 0.01 && after.at(-1).wide < 0.01);
  run(lip, 6, 60, () => ({ speaking: false }));
  assert.ok(lip.peak < 0.25, `peak relaxed to ${lip.peak.toFixed(2)}`);
});

test("synthetic speech (a browser voice): natural rhythm, pauses, and it ends when speech ends", () => {
  const lip = new LipSync({}, mulberry32(11));
  const out = run(lip, 8, 60, () => ({ speaking: true, synthetic: true }));
  const opens = out.slice(30).map((o) => o.open);
  const m = mean(opens);
  assert.ok(m > 0.2 && m < 0.65, `mean opening ${m.toFixed(2)}`);
  // syllable rate: count local maxima that stand out by at least 0.12 from the last valley
  let peaks = 0;
  let valley = opens[0];
  let rising = false;
  let top = opens[0];
  for (let i = 1; i < opens.length; i++) {
    const v = opens[i];
    if (v > opens[i - 1]) {
      if (!rising) { valley = opens[i - 1]; rising = true; }
      top = v;
    } else if (v < opens[i - 1] && rising) {
      if (top - valley >= 0.12) peaks++;
      rising = false;
    }
  }
  const hz = peaks / (opens.length / 60);
  assert.ok(hz > 2.5 && hz < 7, `${hz.toFixed(1)} syllables per second`);
  // there are pauses (the mouth closes) and varied strength
  assert.ok(opens.filter((v) => v < 0.25).length > 10, "the jaw dips between word groups");
  assert.ok(max(opens) > 0.7 && new Set(opens.map((v) => Math.round(v * 5))).size >= 4);
  // and a changing mouth shape
  assert.ok(max(out.map((o) => o.wide)) > 0.1 && max(out.map((o) => o.round)) > 0.1);
  const stop = run(lip, 0.5, 60, () => ({ speaking: false, synthetic: true }));
  assert.ok(stop.at(-1).open < 0.01);
});

test("synthetic speech is smooth too (no random per-word pulses)", () => {
  const out = run(new LipSync({}, mulberry32(3)), 6, 60, () => ({ speaking: true, synthetic: true }));
  assert.ok(max(diffs(out.map((o) => o.open))) < 0.5);
});

test("a long frame (tab was in the background) cannot throw the mouth wide open", () => {
  const lip = new LipSync();
  const r = lip.update(5, { speaking: true, amplitude: 0.5, bands: [0.3, 0.3, 0.3] });
  assert.ok(r.open >= 0 && r.open <= 1 && Number.isFinite(r.wide) && Number.isFinite(r.round));
  assert.doesNotThrow(() => lip.update(0, {}));
  assert.doesNotThrow(() => lip.update(0.016, { speaking: true }));
});

test("missing or odd input is harmless", () => {
  const lip = new LipSync();
  for (const input of [undefined, {}, { speaking: true }, { speaking: true, amplitude: NaN }, { speaking: true, amplitude: 5, bands: [9, 9, 9] }]) {
    const r = lip.update(0.016, input);
    for (const k of ["open", "wide", "round", "level"]) assert.ok(Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1, `${k}: ${r[k]}`);
  }
});
