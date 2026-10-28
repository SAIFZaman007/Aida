import test from "node:test";
import assert from "node:assert/strict";
import { VadSegmenter, Resampler, encodeWav, rms, FRAME } from "../src/lib/vad.js";

// 20 ms frame of a 200 Hz tone with the given peak amplitude (rms = amp/sqrt2).
const tone = (amp) => Float32Array.from({ length: FRAME }, (_, i) => amp * Math.sin((2 * Math.PI * 200 * i) / 16000));
const quiet = () => tone(0.002);
const speech = () => tone(0.3);
const feed = (v, make, n) => { for (let i = 0; i < n; i++) v.push(make()); };

function make(opts = {}) {
  const out = { segments: [], barge: 0, levels: 0 };
  const v = new VadSegmenter({
    isSpeaking: opts.isSpeaking,
    onBargeIn: () => out.barge++,
    onSegment: (f) => out.segments.push(f),
    onLevel: () => out.levels++,
  });
  feed(v, quiet, 25); // calibration
  return { v, out };
}

test("one utterance -> one segment with pre-roll and a short tail", () => {
  const { v, out } = make();
  feed(v, quiet, 10);
  feed(v, speech, 30); // 600 ms of speech
  feed(v, quiet, 60);
  assert.equal(out.segments.length, 1);
  const n = out.segments[0].length;
  assert.ok(n >= 30 + 12, `segment too short: ${n}`); // speech + kept tail
  assert.ok(n <= 25 + 30 + 42, `segment too long: ${n}`);
  // pre-roll: the segment starts with quiet frames, i.e. the onset was not clipped
  assert.ok(rms(out.segments[0][0]) < 0.01);
  assert.ok(out.segments[0].slice(0, 30).some((f) => rms(f) > 0.1));
});

test("a short click is ignored", () => {
  const { v, out } = make();
  feed(v, speech, 4);
  feed(v, quiet, 80);
  assert.equal(out.segments.length, 0);
});

test("a pause inside a sentence does not split it", () => {
  const { v, out } = make();
  feed(v, speech, 20);
  feed(v, quiet, 25); // 500 ms thinking pause < 840 ms
  feed(v, speech, 20);
  feed(v, quiet, 60);
  assert.equal(out.segments.length, 1);
});

test("two utterances -> two segments", () => {
  const { v, out } = make();
  feed(v, speech, 20); feed(v, quiet, 60);
  feed(v, speech, 20); feed(v, quiet, 60);
  assert.equal(out.segments.length, 2);
});

test("barge-in needs 120 ms of speech while the assistant is talking", () => {
  let speaking = true;
  const { v, out } = make({ isSpeaking: () => speaking });
  feed(v, speech, 5);
  assert.equal(out.barge, 0);
  feed(v, speech, 1);
  assert.equal(out.barge, 1);
  feed(v, speech, 20);
  speaking = false;
  feed(v, quiet, 60);
  assert.equal(out.barge, 1, "fires once per utterance");
  assert.equal(out.segments.length, 1);
});

test("quiet echo of the avatar does not trigger barge-in", () => {
  const { v, out } = make({ isSpeaking: () => true });
  feed(v, () => tone(0.05), 100); // rms ~0.035 < speaking threshold
  assert.equal(out.barge, 0);
});

test("a never-ending noise is cut at 25 s", () => {
  const { v, out } = make();
  feed(v, speech, 1300);
  assert.equal(out.segments.length, 1);
  assert.ok(out.segments[0].length <= 1250);
});

test("noisy room: threshold is capped so normal speech is still detected", () => {
  const out = { segments: [] };
  const v = new VadSegmenter({ onSegment: (f) => out.segments.push(f) });
  feed(v, () => tone(0.07), 25); // loud ambient noise during calibration
  assert.ok(v.threshold(false) <= 0.08 + 1e-9);
  feed(v, speech, 20); feed(v, () => tone(0.07), 60);
  assert.equal(out.segments.length, 1);
});

test("level callback fires while running", () => {
  const { v, out } = make();
  feed(v, quiet, 30);
  assert.ok(out.levels > 10);
});

test("encodeWav writes a valid 16 kHz mono PCM header", async () => {
  const frames = [speech(), speech()];
  const blob = encodeWav(frames);
  assert.equal(blob.type, "audio/wav");
  assert.equal(blob.size, 44 + 2 * FRAME * 2);
  const dv = new DataView(await blob.arrayBuffer());
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  assert.equal(tag(0), "RIFF"); assert.equal(tag(8), "WAVE"); assert.equal(tag(36), "data");
  assert.equal(dv.getUint16(22, true), 1);
  assert.equal(dv.getUint32(24, true), 16000);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getUint32(40, true), 2 * FRAME * 2);
  assert.ok(Math.abs(dv.getInt16(44 + 2 * 5, true)) > 0);
});

for (const rate of [48000, 44100, 16000]) {
  test(`resampler ${rate} -> 16000 keeps timing and DC level`, () => {
    const r = new Resampler(rate);
    const chunk = new Float32Array(Math.round(rate * 0.02)).fill(0.5);
    let frames = 0, ok = true;
    for (let i = 0; i < 50; i++) for (const f of r.push(chunk)) { frames++; ok &&= f.every((x) => Math.abs(x - 0.5) < 1e-5); }
    assert.ok(Math.abs(frames - 50) <= 1, `${frames} frames for 1 s`);
    assert.ok(ok);
  });
}
