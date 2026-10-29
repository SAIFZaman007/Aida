import test from "node:test";
import assert from "node:assert/strict";

import { PcmClip, PcmPlayer } from "../src/lib/pcmPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeCtx() {
  const sched = [];
  const ctx = {
    state: "running",
    sampleRate: 24000,
    destination: {},
    get currentTime() { return performance.now() / 1000; },
    resume: () => Promise.resolve(),
    createAnalyser: () => ({ fftSize: 512, frequencyBinCount: 256, connect() {}, getByteTimeDomainData: (a) => a.fill(128), getByteFrequencyData: (a) => a.fill(0) }),
    createBuffer: (ch, n, rate) => {
      const data = new Float32Array(n);
      return { length: n, duration: n / rate, rate, data, copyToChannel(s) { data.set(s); }, getChannelData: () => data };
    },
    createBufferSource: () => ({
      connect() {}, buffer: null,
      start(at) {
        sched.push({ at, dur: this.buffer.duration, first: this.buffer.data[0], len: this.buffer.length });
        const wait = Math.max(0, (at - ctx.currentTime) * 1000) + this.buffer.duration * 1000;
        this._t = setTimeout(() => this.onended?.(), wait);
      },
      stop() { clearTimeout(this._t); this.onended?.(); },
    }),
  };
  return { ctx, sched };
}
const samples = (v, n) => new Uint8Array(new Int16Array(n).fill(v).buffer);

test("plays a complete clip as one buffer and resolves after it was heard", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  clip.push(samples(3000, 2400)); clip.push(samples(3000, 2400)); clip.finish();
  let started = null;
  const t0 = performance.now();
  await p.play(clip, { onStart: (s) => (started = s) });
  assert.deepEqual(started, { known: true });
  assert.equal(sched.length, 1);                       // chunks that were ready are merged
  assert.equal(sched[0].len, 4800);
  assert.ok(performance.now() - t0 >= 190, "returns only after the 0.2 s clip played");
});

test("streams: starts after the pre-buffer, then schedules later chunks back-to-back", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  const done = p.play(clip, {});
  clip.push(samples(1000, 2400));                      // 0.1 s: below the 0.3 s pre-buffer
  await sleep(10);
  assert.equal(sched.length, 0);
  clip.push(samples(2000, 6000));                      // now 0.35 s available
  await sleep(10);
  assert.equal(sched.length, 1);
  clip.push(samples(3000, 2400));
  await sleep(10);
  clip.finish();
  await done;
  assert.equal(sched.length, 2);
  assert.ok(Math.abs(sched[1].at - (sched[0].at + sched[0].dur)) < 0.02, "second chunk starts where the first ends");
});

test("a chunk that splits a 16-bit sample is stitched back together", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  const whole = samples(1234, 4);                      // 8 bytes
  clip.push(whole.slice(0, 3));                        // odd split
  clip.push(whole.slice(3));
  clip.finish();
  await p.play(clip, {});
  assert.equal(sched[0].len, 4);
  assert.equal(Math.round(sched[0].first * 32768), 1234);
});

test("no audio at all rejects (so the engine can use the browser voice)", async () => {
  const { ctx } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  clip.fail(Object.assign(new Error("down"), { code: "unavailable" }));
  await assert.rejects(p.play(clip, {}), /down/);
  const empty = new PcmClip(24000);
  empty.finish();
  await assert.rejects(p.play(empty, {}), (e) => e.code === "unavailable");
});

test("stop() silences immediately and resolves the pending play()", async () => {
  const { ctx } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  clip.push(samples(1000, 24000)); clip.finish();      // 1 s
  const done = p.play(clip, {});
  await sleep(20);
  p.stop();
  const t0 = performance.now();
  await done;
  assert.ok(performance.now() - t0 < 100);
  assert.equal(p.sources.size, 0);
});

test("level() and bands() are safe before any audio", () => {
  const p = new PcmPlayer({ getContext: () => fakeCtx().ctx });
  assert.equal(p.level(), 0);
  assert.deepEqual(p.bands(), [0, 0, 0]);
});
