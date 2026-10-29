import test from "node:test";
import assert from "node:assert/strict";

import { LiveStt, floatToPcm16 } from "../src/lib/liveStt.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A scriptable WebSocket: the test plays the server. */
class FakeWS {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeWS.instances.push(this);
  }
  send(d) {
    if (this.closed) throw new Error("closed");
    this.sent.push(d);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.onclose?.());
  }
  // server -> client
  say(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop() {
    this.closed = true;
    this.onclose?.();
  }
}
const last = () => FakeWS.instances[FakeWS.instances.length - 1];
const frame = (v = 0.1) => new Float32Array(320).fill(v);
const kinds = (ws) => ws.sent.map((m) => (typeof m === "string" ? JSON.parse(m).type : `pcm${m.byteLength}`));

function make(over = {}) {
  FakeWS.instances = [];
  const ev = { interim: [], final: [], lost: [], uerr: [], status: [] };
  const live = new LiveStt({
    url: "ws://x/api/voice/stream",
    WebSocketImpl: FakeWS,
    connectTimeoutMs: 40,
    onInterim: (id, t) => ev.interim.push([id, t]),
    onFinal: (id, t, l) => ev.final.push([id, t, l]),
    onLost: (ids) => ev.lost.push(ids),
    onUtteranceError: (id, code) => ev.uerr.push([id, code]),
    onStatus: (s) => ev.status.push(s),
    ...over,
  });
  return { live, ev };
}

test("floatToPcm16 clips and encodes little-endian", () => {
  const b = new DataView(floatToPcm16([Float32Array.of(0, 1, -1, 2, -2)]));
  assert.equal(b.getInt16(0, true), 0);
  assert.equal(b.getInt16(2, true), 32767);
  assert.equal(b.getInt16(4, true), -32768);
  assert.equal(b.getInt16(6, true), 32767); // clipped
  assert.equal(b.getInt16(8, true), -32768);
});

test("one utterance: start, batched PCM, end; interim then final by id", async () => {
  const { live, ev } = make();
  live.connect();
  last().say({ type: "ready" });
  const id = live.begin();
  assert.equal(id, 1);
  for (let i = 0; i < 7; i++) live.audio(frame());
  assert.equal(live.end(), true);
  // 7 frames -> two batches of 3 + the remaining 1 flushed on end
  assert.deepEqual(kinds(last()), ["start", "pcm1920", "pcm1920", "pcm640", "end"]);
  last().say({ type: "interim", id: 1, text: "hel" });
  last().say({ type: "final", id: 1, text: "hello", language: "en" });
  assert.deepEqual(ev.interim, [[1, "hel"]]);
  assert.deepEqual(ev.final, [[1, "hello", "en"]]);
  live.close();
});

test("audio produced while connecting is queued and delivered in order after ready", async () => {
  const { live } = make();
  live.connect();
  const id = live.begin();
  live.audio([frame(), frame(), frame()]);
  live.end();
  assert.equal(last().sent.length, 0); // nothing can be sent yet
  last().say({ type: "ready" });
  assert.deepEqual(kinds(last()), ["start", "pcm1920", "end"]);
  assert.equal(id, 1);
  live.close();
});

test("a drop mid-utterance reports the utterance as lost (caller falls back to HTTP)", () => {
  const { live, ev } = make();
  live.connect();
  last().say({ type: "ready" });
  const a = live.begin();
  live.audio(frame());
  last().drop();
  assert.deepEqual(ev.lost, [[a]]);
  assert.equal(live.end(), false); // the utterance died with the connection
  live.close();
});

test("an utterance whose final never came can be abandoned; its late final is ignored", () => {
  const { live, ev } = make();
  live.connect();
  last().say({ type: "ready" });
  const id = live.begin();
  live.end();
  live.abandon(id);
  last().say({ type: "final", id, text: "late", language: "en" });
  assert.equal(ev.final.length, 0);
  live.close();
});

test("ids stay aligned across utterances; a refused one is reported by id and the socket stays up", () => {
  const { live, ev } = make();
  live.connect();
  last().say({ type: "ready" });
  const a = live.begin(); live.end();
  last().say({ type: "final", id: a, text: "one", language: "en" });
  const b = live.begin(); live.end();
  last().say({ type: "error", code: "rate_limited", recoverable: true, id: b });
  const c = live.begin(); live.end();
  last().say({ type: "final", id: c, text: "three", language: "en" });
  assert.deepEqual([a, b, c], [1, 2, 3]);
  assert.deepEqual(ev.uerr, [[2, "rate_limited"]]);
  assert.deepEqual(ev.final.map((f) => f[1]), ["one", "three"]);
  assert.equal(live.state, "open");
  live.close();
});

test("never connects: retries, then reports failed and begin() returns null during cool-down", async () => {
  let t = 1_000_000;
  const { live, ev } = make({ now: () => t });
  live.connect();
  await sleep(60);            // 1st attempt times out
  await sleep(300);           // retry after 250 ms times out too
  await sleep(1100);          // retry after 1 s
  await sleep(80);
  assert.equal(live.state, "failed");
  assert.ok(ev.status.includes("failed"));
  assert.equal(live.begin(), null);
  t += 61_000;                // cool-down over: usable again
  assert.equal(live.usable, true);
  live.close();
});

test("recycle between utterances reconnects transparently", () => {
  const { live } = make();
  live.connect();
  const first = last();
  first.say({ type: "ready" });
  first.say({ type: "recycle" });
  assert.notEqual(last(), first);
  last().say({ type: "ready" });
  const id = live.begin();
  assert.equal(id, 1);
  live.end();
  assert.deepEqual(kinds(last()), ["start", "end"]);
  live.close();
});

test("messages from a replaced socket are ignored", () => {
  const { live, ev } = make();
  live.connect();
  const first = last();
  first.say({ type: "ready" });
  live.begin();
  first.say({ type: "recycle" }); // refused: an utterance is open
  first.drop();
  assert.equal(ev.lost.length, 1);
  first.say({ type: "final", id: 1, text: "ghost", language: "en" });
  assert.equal(ev.final.length, 0);
  live.close();
});
