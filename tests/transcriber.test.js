import test from "node:test";
import assert from "node:assert/strict";

import { Transcriber } from "../src/lib/transcriber.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 40) => Array.from({ length: n }, () => new Float32Array(320));

/** A stand-in for LiveStt that the test drives by hand. */
class FakeLive {
  constructor(h) {
    this.h = h;
    this.usable = true;
    this.seq = 0;
    this.log = [];
    this.accept = true;
    this.open = new Set();
  }
  connect() { this.log.push("connect"); }
  begin() { const id = ++this.seq; this.open.add(id); this.log.push(`begin${id}`); return id; }
  audio(f) { this.log.push(`audio${Array.isArray(f) ? f.length : 1}`); }
  end() { this.log.push("end"); return this.accept; }
  abandon(id) { this.open.delete(id); this.log.push(`abandon${id}`); }
  close() { this.log.push("close"); }
}

function make({ http, finalTimeoutMs = 60 } = {}) {
  const ev = { interim: [], text: [], none: 0, err: [], busy: [], http: [] };
  let live;
  const tr = new Transcriber({
    createLive: (h) => (live = new FakeLive(h)),
    http: http || (async (f) => { ev.http.push(f.length); return { text: "via http" }; }),
    onInterim: (t) => ev.interim.push(t),
    onText: (t) => ev.text.push(t),
    onNoSpeech: () => ev.none++,
    onError: (m) => ev.err.push(m),
    onBusy: (b) => ev.busy.push(b),
    finalTimeoutMs,
  });
  return { tr, live, ev };
}
const speak = (tr, { voiced = 40, valid = true, n = 40 } = {}) => {
  tr.begin(frames(5));
  for (let i = 0; i < 5; i++) tr.audio(new Float32Array(320));
  tr.end({ frames: frames(n), voiced, valid });
};

test("live path: captions while talking, final text delivered once", async () => {
  const { tr, live, ev } = make();
  speak(tr);
  live.h.onInterim(1, "hel");
  live.h.onInterim(1, "hello wor");
  live.h.onFinal(1, "hello world");
  await sleep(5);
  assert.deepEqual(ev.interim, ["hel", "hello wor", ""]); // cleared when the text arrives
  assert.deepEqual(ev.text, ["hello world"]);
  assert.equal(ev.http.length, 0);
  assert.deepEqual(ev.busy, [true, false]);
  tr.dispose();
});

test("a click is sent but nobody waits for its answer", async () => {
  const { tr, live, ev } = make();
  speak(tr, { voiced: 3, valid: false });
  assert.ok(live.log.includes("abandon1"));
  live.h.onFinal(1, "");
  await sleep(5);
  assert.equal(ev.text.length, 0);
  assert.equal(ev.none, 0); // silent: not "didn't catch that" for a cough
  assert.deepEqual(ev.busy, []);
  tr.dispose();
});

test("connection lost after the end marker: the kept audio is transcribed over HTTP", async () => {
  const { tr, live, ev } = make();
  speak(tr);
  live.h.onLost([1]);
  await sleep(10);
  assert.deepEqual(ev.text, ["via http"]);
  assert.deepEqual(ev.http, [40]);
  tr.dispose();
});

test("connection lost mid-utterance: the end of the utterance takes the HTTP route", async () => {
  const { tr, live, ev } = make();
  tr.begin(frames(5));
  live.h.onLost([1]);
  tr.end({ frames: frames(30), voiced: 25, valid: true });
  await sleep(10);
  assert.deepEqual(ev.text, ["via http"]);
  tr.dispose();
});

test("end marker rejected (socket died): HTTP route", async () => {
  const { tr, live, ev } = make();
  tr.begin(frames(3));
  live.accept = false;
  tr.end({ frames: frames(30), voiced: 25, valid: true });
  await sleep(10);
  assert.deepEqual(ev.text, ["via http"]);
  tr.dispose();
});

test("a stalled final times out and falls back; the late live final is ignored", async () => {
  const { tr, live, ev } = make({ finalTimeoutMs: 30 });
  speak(tr);
  await sleep(80);
  assert.deepEqual(ev.text, ["via http"]);
  live.h.onFinal(1, "late");
  await sleep(5);
  assert.deepEqual(ev.text, ["via http"]);
  tr.dispose();
});

test("live returns empty for clear speech: one second opinion over HTTP", async () => {
  const { tr, live, ev } = make();
  speak(tr, { voiced: 50 });
  live.h.onFinal(1, "  ");
  await sleep(10);
  assert.deepEqual(ev.text, ["via http"]);
  tr.dispose();
});

test("live empty AND short voiced stretch: just 'didn't catch that'", async () => {
  const { tr, live, ev } = make();
  speak(tr, { voiced: 12 });
  live.h.onFinal(1, "");
  await sleep(10);
  assert.equal(ev.none, 1);
  assert.equal(ev.http.length, 0);
  tr.dispose();
});

test("second opinion that is also empty -> didn't catch that", async () => {
  const { tr, live, ev } = make({ http: async () => ({ text: "" }) });
  speak(tr, { voiced: 50 });
  live.h.onFinal(1, "");
  await sleep(10);
  assert.equal(ev.none, 1);
  assert.equal(ev.text.length, 0);
  tr.dispose();
});

test("live unavailable: plain HTTP, and results keep spoken order", async () => {
  const order = [];
  let n = 0;
  const { tr, live, ev } = make({
    http: async () => {
      const me = ++n;
      await sleep(me === 1 ? 40 : 1); // the first answer is the slow one
      order.push(me);
      return { text: `u${me}` };
    },
  });
  live.usable = false;
  speak(tr);
  speak(tr);
  await sleep(90);
  assert.deepEqual(order, [2, 1]);       // second finished first…
  assert.deepEqual(ev.text, ["u1", "u2"]); // …but was delivered second
  tr.dispose();
});

test("a refused utterance (rate limit) is reported, not retried", async () => {
  const { tr, live, ev } = make();
  speak(tr);
  live.h.onUtteranceError(1, "rate_limited", "Too many requests");
  await sleep(5);
  assert.deepEqual(ev.err, ["Too many requests"]);
  assert.equal(ev.http.length, 0);
  assert.deepEqual(ev.busy, [true, false]);
  tr.dispose();
});

test("HTTP provider error is reported with its message", async () => {
  const { tr, live, ev } = make({ http: async () => ({ text: "", error: "unavailable", message: "Try again" }) });
  live.usable = false;
  speak(tr);
  await sleep(10);
  assert.deepEqual(ev.err, ["Try again"]);
  assert.deepEqual(ev.busy, [true, false]);
  tr.dispose();
});

test("dispose stops everything: later results are ignored", async () => {
  const { tr, live, ev } = make();
  speak(tr);
  tr.dispose();
  live.h.onFinal(1, "ghost");
  await sleep(5);
  assert.equal(ev.text.length, 0);
  assert.ok(live.log.includes("close"));
});
