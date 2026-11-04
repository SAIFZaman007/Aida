import test from "node:test";
import assert from "node:assert/strict";

import { PcmClip, PcmPlayer } from "../src/lib/pcmPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeCtx({ delay = false } = {}) {
  const sched = [];
  const graph = []; // connections made: [from, to]
  const ctx = {
    state: "running",
    sampleRate: 24000,
    destination: {},
    get currentTime() { return performance.now() / 1000; },
    resume: () => Promise.resolve(),
    createAnalyser: () => ({ name: "analyser", fftSize: 512, frequencyBinCount: 256, connect(to) { graph.push(["analyser", to?.name || "destination"]); }, getByteTimeDomainData: (a) => a.fill(128), getByteFrequencyData: (a) => a.fill(0) }),
    ...(delay ? { createDelay: () => ({ name: "delay", delayTime: { value: 0 }, connect(to) { graph.push(["delay", to === ctx.destination ? "destination" : to?.name]); } }) } : {}),
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
  return { ctx, sched, graph };
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
  const took = performance.now() - t0;
  // returns ~60 ms before the last sample is heard (the lead-out that makes the next
  // sentence join seamlessly), never earlier and never later than the end
  assert.ok(took >= 120 && took < 215, `returned after ${took | 0} ms for a 0.2 s clip`);
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

test("the next clip is chained onto the end of the previous one (gapless)", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(1000, 4800)); a.finish();   // 0.2 s
  const b = new PcmClip(24000); b.push(samples(2000, 4800)); b.finish();
  await p.play(a, {});
  const secondStartedAfter = performance.now();
  await p.play(b, {});
  assert.equal(sched.length, 2);
  const gap = sched[1].at - (sched[0].at + sched[0].dur);
  assert.ok(Math.abs(gap) < 0.002, `sample-exact join, got ${(gap * 1000).toFixed(2)} ms`);
  assert.ok(secondStartedAfter > 0);
});

test("after a pause the next clip starts a moment from now, not in the past", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(1000, 2400)); a.finish();
  await p.play(a, {});
  await sleep(250);                                            // everything has been heard
  const now = ctx.currentTime;
  const b = new PcmClip(24000); b.push(samples(2000, 2400)); b.finish();
  await p.play(b, {});
  assert.ok(sched[1].at >= now, "never scheduled in the past");
  assert.ok(sched[1].at - now < 0.1);
});

test("stop() forgets the playhead so the next clip does not wait for audio that was cut", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(1000, 48000)); a.finish(); // 2 s
  const first = p.play(a, {});
  await sleep(20);
  p.stop();
  await first;
  const b = new PcmClip(24000); b.push(samples(2000, 2400)); b.finish();
  const now = ctx.currentTime;
  await p.play(b, {});
  assert.ok(sched[1].at - now < 0.1, "starts at once, not after the 2 s that were cut");
});

test("lip-sync leads the sound: the analyser hears the signal before the speakers do", async () => {
  const { ctx, graph } = fakeCtx({ delay: true });
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(1000, 2400)); a.finish();
  await p.play(a, {});
  assert.deepEqual(graph, [["analyser", "delay"], ["delay", "destination"]]);
  assert.ok(p.delay.delayTime.value > 0.03 && p.delay.delayTime.value < 0.1);
});

test("without a delay node (old browsers) audio still reaches the speakers", async () => {
  const { ctx, graph } = fakeCtx({ delay: false });
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(1000, 2400)); a.finish();
  await p.play(a, {});
  assert.deepEqual(graph, [["analyser", "destination"]]);
});

// ---- the sound starts when the avatar does (v3.7) ------------------------------------
const mixed = (silent, loud, v = 3000) => {          // `silent` zero samples, then `loud` samples of level v
  const a = new Int16Array(silent + loud);
  a.fill(v, silent);
  return new Uint8Array(a.buffer);
};

test("beforeStart is awaited once, BEFORE the first sample is scheduled", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000); clip.push(samples(3000, 4800)); clip.finish();
  let calls = 0, scheduledWhenCalled = -1;
  await p.play(clip, { beforeStart: async () => { calls++; scheduledWhenCalled = sched.length; await sleep(30); } });
  assert.equal(calls, 1);
  assert.equal(scheduledWhenCalled, 0, "nothing was scheduled yet when the caller was asked to get ready");
  assert.equal(sched.length, 1);
});

test("beforeStart is skipped when the clip chains onto the previous sentence (the avatar is already talking)", async () => {
  const { ctx } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(3000, 4800)); a.finish();   // 0.2 s
  const b = new PcmClip(24000); b.push(samples(2000, 4800)); b.finish();
  let calls = 0;
  const hook = async () => { calls++; };
  await p.play(a, { beforeStart: hook });
  await p.play(b, { beforeStart: hook });               // still inside a's tail: chained
  assert.equal(calls, 1);
});

test("a stop() during beforeStart means no sound at all", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000); clip.push(samples(3000, 4800)); clip.finish();
  let started = false;
  const done = p.play(clip, { beforeStart: () => sleep(40), onStart: () => (started = true) });
  await sleep(10);
  p.stop();
  await done;
  assert.equal(sched.length, 0);
  assert.equal(started, false);
});

test("a failing beforeStart never silences the voice", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000); clip.push(samples(3000, 4800)); clip.finish();
  await p.play(clip, { beforeStart: () => Promise.reject(new Error("no video")) });
  assert.equal(sched.length, 1);
});

test("a reply that starts from silence skips the silent lead-in: the first thing heard is the first word", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000); clip.push(mixed(4800, 4800)); clip.finish();   // 0.2 s of silence, then 0.2 s of speech
  await p.play(clip, {});
  const kept = sched[0].len;
  const preroll = Math.round(24000 * 0.015);
  assert.equal(kept, 4800 + preroll, "speech plus a 15 ms pre-roll, nothing of the silence");
  assert.equal(sched[0].first, 0, "the pre-roll is silence, so a soft attack is never clipped");
});

test("a lead-in that is all silence in the first chunk is skipped; the sound starts with the first audible chunk", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000);
  const done = p.play(clip, {});
  clip.push(new Uint8Array(new Int16Array(9000).buffer));   // 0.375 s of nothing
  await sleep(10);
  assert.equal(sched.length, 0, "silence alone does not start the sound");
  clip.push(samples(3000, 4800));
  await sleep(10);
  clip.finish();
  await done;
  assert.equal(sched.length, 1);
  assert.equal(sched[0].len, 4800);
});

test("a sentence chained onto the previous one keeps its own natural pause", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const a = new PcmClip(24000); a.push(samples(3000, 4800)); a.finish();
  const b = new PcmClip(24000); b.push(mixed(2400, 2400)); b.finish();
  await p.play(a, {});
  await p.play(b, {});
  assert.equal(sched[1].len, 4800, "nothing trimmed from a chained sentence");
});

test("quiet speech is never mistaken for silence", async () => {
  const { ctx, sched } = fakeCtx();
  const p = new PcmPlayer({ getContext: () => ctx });
  const clip = new PcmClip(24000); clip.push(mixed(2400, 4800, 120)); clip.finish();   // level 120/32768 = -48 dBFS
  await p.play(clip, {});
  assert.equal(sched[0].len, 4800 + Math.round(24000 * 0.015));
});
