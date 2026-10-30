import test from "node:test";
import assert from "node:assert/strict";

import { TTS, speechBus, pickVoice, _resetVoiceCache } from "../src/lib/ttsEngine.js";
import { CircuitBreaker, Limiter } from "../src/lib/resilience.js";

// ---------------------------------------------------------------- fake browser
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let log = []; // what actually came out of the "speakers", in order (a fresh array per test: late timers of an earlier test must not leak in)

class FakeUtterance {
  constructor(text) { this.text = text; }
}
function installBrowser({ voices = [], utteranceMs = 5, neverStart = false } = {}) {
  const log = globalThis.__log;
  let current = null;
  const synth = {
    getVoices: () => voices,
    addEventListener() {},
    speak(u) {
      if (neverStart) { log.push({ kind: "browser-stuck", text: u.text }); return; }
      current = u;
      log.push({ kind: "browser", text: u.text, lang: u.lang, voice: u.voice?.name, pitch: u.pitch });
      u.onstart?.();
      u._t = setTimeout(() => { current = null; u.onend?.(); }, utteranceMs);
    },
    cancel() {
      if (current) { clearTimeout(current._t); const u = current; current = null; u.onerror?.(); }
    },
  };
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 4);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.AudioContext = class {
    constructor() { this.state = "running"; this.destination = {}; this.sampleRate = 24000; }
    get currentTime() { return performance.now() / 1000; }
    resume() { return Promise.resolve(); }
    createAnalyser() {
      return {
        fftSize: 512, frequencyBinCount: 256,
        getByteTimeDomainData(a) { a.fill(128); },
        getByteFrequencyData(a) { a.fill(0); },
        connect() {},
      };
    }
    createBuffer(ch, n, rate) {
      const data = new Float32Array(n);
      return { length: n, duration: n / rate, copyToChannel(s) { data.set(s); }, getChannelData() { return data; }, data };
    }
    createBufferSource() {
      const ctx = this;
      return {
        connect() {}, buffer: null,
        start(at) {
          const tag = Math.round(this.buffer.data[0] * 32768);
          const wait = Math.max(0, (at - ctx.currentTime) * 1000);
          this._t0 = setTimeout(() => log.push({ kind: "cloud", tag }), wait);
          this._t = setTimeout(() => this.onended?.(), wait + this.buffer.duration * 1000);
        },
        stop() { clearTimeout(this._t0); clearTimeout(this._t); this.onended?.(); },
      };
    }
  };
  return synth;
}

const settings = (over = {}) => ({ ttsEnabled: true, ttsProvider: "cloud", rate: 1, pitch: 1, voiceURI: "", ...over });
const avatar = { gender: "female", voiceHints: ["zira"] };
const voices = [
  { name: "Zira", lang: "en-US", voiceURI: "zira" },
  { name: "David", lang: "en-GB", voiceURI: "david" },
  { name: "Nabanita", lang: "bn-BD", voiceURI: "nabanita" },
  { name: "Tanishaa", lang: "bn-IN", voiceURI: "tanishaa" },
];

/** PCM of `samples` 16-bit samples whose value is the sentence number (so playback order is observable). */
const pcm = (n, samples = 4800) => {
  const a = new Int16Array(samples).fill(n);
  return new Uint8Array(a.buffer);
};
const codedError = (code) => Object.assign(new Error(code), { code });

/** Fake API: sentence "… N." streams PCM tagged N. */
function fakeApi({ delays = {}, fail = () => false, failWith = null, calls = [], samples = {}, hang = () => false, midFail = () => false } = {}) {
  return {
    calls,
    async speakStream(text, gender, { signal } = {}) {
      const n = Number(text.match(/\d+/)?.[0] ?? 0);
      const call = { text, gender, aborted: false };
      calls.push(call);
      signal?.addEventListener("abort", () => { call.aborted = true; });
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, hang(n) ? 10_000 : (delays[n] ?? 1));
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
      });
      if (fail(n)) throw failWith ? failWith() : codedError("unavailable");
      return {
        sampleRate: 24000,
        chunks: (async function* () {
          const total = samples[n] ?? 4800; // 0.2 s: longer than the player's 60 ms lead-out
          yield pcm(n, Math.ceil(total / 2));
          if (midFail(n)) throw codedError("unavailable");
          await sleep(1);
          yield pcm(n, Math.floor(total / 2));
        })(),
      };
    },
  };
}

async function build({ api = fakeApi(), cfg = settings(), v = voices, breaker, timeouts, av = avatar, neverStart = false } = {}) {
  log = [];
  globalThis.__log = log;
  _resetVoiceCache();
  installBrowser({ voices: v, neverStart });
  const tts = new TTS({ api, breaker: breaker || new CircuitBreaker(), limiter: new Limiter(3), timeouts, log: false });
  tts.notices = [];
  tts.onNotice = (n) => tts.notices.push(n);
  const mine = log;
  tts.onSentenceStart = (i) => mine.push({ kind: "reveal", i });
  await tts.configure(cfg, av);
  return tts;
}
const idle = async (tts, max = 3000) => {
  const t0 = Date.now();
  while (tts.busy && Date.now() - t0 < max) await sleep(5);
  await sleep(160); // the last clip is still being heard for a moment after the queue empties
};
const say = (tts, index, text, code = false) => tts.speakSentence({ index, text, code });
const seq = () => log.map((l) => (l.kind === "reveal" ? `r${l.i}` : l.kind === "cloud" ? `c${l.tag}` : "b"));

// ------------------------------------------------------------------------ order + reveal
test("sentences are PLAYED in order even when their audio arrives out of order", async () => {
  const tts = await build({ api: fakeApi({ delays: { 1: 60, 2: 1, 3: 1 } }) });
  say(tts, 0, "Sentence 1. ");
  say(tts, 1, "Sentence 2. ");
  say(tts, 2, "Sentence 3.");
  await idle(tts);
  assert.deepEqual(log.filter((l) => l.kind === "cloud").map((l) => l.tag), [1, 2, 3]);
});

test("the loop: sentence 1 shows at once, every next one only when the previous was read", async () => {
  const tts = await build();
  say(tts, 0, "One 1. ");
  assert.deepEqual(seq(), ["r0"], "first sentence is revealed on arrival, before any audio");
  say(tts, 1, "Two 2. ");
  say(tts, 2, "Three 3.");
  assert.deepEqual(seq(), ["r0"], "later sentences wait for their turn");
  await idle(tts);
  assert.deepEqual(seq(), ["r0", "c1", "r1", "c2", "r2", "c3"]);
});

test("a sentence arriving after the queue emptied is revealed at once", async () => {
  const tts = await build();
  say(tts, 0, "One 1. ");
  await idle(tts);
  log.length = 0;
  say(tts, 1, "Two 2.");
  assert.deepEqual(seq(), ["r1"]);
  await idle(tts);
});

test("code sentences are revealed in order but never spoken; still registered with the highlighter", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "Intro 1. ");
  say(tts, 1, "```py\nx = 1\n```\n", true);
  say(tts, 2, "Outro 3.");
  await idle(tts);
  assert.equal(api.calls.length, 2);
  assert.deepEqual(seq(), ["r0", "c1", "r1", "r2", "c3"]);
  assert.equal(tts.highlighter.sentences.length, 3);
  assert.equal(tts.highlighter.sentences[2].charStart, "Intro 1. ".length + "```py\nx = 1\n```\n".length);
});

test("speech disabled: nothing is spoken, text is revealed immediately, highlighter still fed", async () => {
  const api = fakeApi();
  const tts = await build({ api, cfg: settings({ ttsEnabled: false }) });
  say(tts, 0, "Hello 1."); say(tts, 1, "Again 2.");
  assert.equal(api.calls.length, 0);
  assert.deepEqual(seq(), ["r0", "r1"]);
  assert.equal(tts.highlighter.sentences.length, 2);
  assert.equal(tts.busy, false);
});

test("pure punctuation / markup is revealed but not sent to the voice", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "---\n"); say(tts, 1, "... ");
  await idle(tts);
  assert.equal(api.calls.length, 0);
  assert.deepEqual(seq(), ["r0", "r1"]);
});

test("speaking flag follows the sound; busy covers the whole reply", async () => {
  const states = [], busy = [];
  const tts = await build();
  tts.onSpeakingChange = (v) => states.push(v);
  tts.onBusyChange = (v) => busy.push(v);
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2.");
  assert.equal(tts.busy, true);
  await idle(tts);
  assert.equal(states.at(-1), false);
  assert.ok(states.includes(true));
  assert.deepEqual(busy, [true, false]);
  assert.equal(speechBus.speaking, false);
});

// ------------------------------------------------------------------------ speed
test("look-ahead: only the next few sentences are fetched; more as reading progresses", async () => {
  const api = fakeApi({ samples: { 1: 4800, 2: 4800, 3: 4800, 4: 4800, 5: 4800, 6: 4800 } });
  const tts = await build({ api });
  for (let i = 0; i < 6; i++) say(tts, i, `S ${i + 1}. `);
  await sleep(5);
  assert.ok(api.calls.length <= 4, `fetched ${api.calls.length} up front`);
  await idle(tts);
  assert.equal(api.calls.length, 6);
});

test("the next sentence is already downloaded while the current one is playing (no gap)", async () => {
  const api = fakeApi({ samples: { 1: 7200, 2: 480 } });
  const tts = await build({ api });
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2.");
  await sleep(40);
  assert.equal(api.calls.length, 2, "sentence 2 was requested before sentence 1 finished playing");
  await idle(tts);
});

// ------------------------------------------------------------------------ resilience
test("cloud failure: that sentence is spoken by the browser voice, in order", async () => {
  const tts = await build({ api: fakeApi({ fail: (n) => n === 2 }) });
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2. "); say(tts, 2, "Three 3.");
  await idle(tts);
  assert.deepEqual(seq().filter((x) => x !== "r0" && !x.startsWith("r")), ["c1", "b", "c3"]);
});

test("no first audio in time: browser voice takes over for that sentence", async () => {
  const api = fakeApi({ hang: (n) => n === 1 });
  const tts = await build({ api, timeouts: { first: 40, idle: 40 } });
  say(tts, 0, "One 1.");
  await idle(tts);
  assert.equal(log.filter((l) => l.kind === "browser").length, 1);
  assert.equal(api.calls[0].aborted, true, "the stalled request was aborted");
});

test("audio cut off mid-clip: what was heard stays, no second voice is started", async () => {
  const tts = await build({ api: fakeApi({ midFail: (n) => n === 1, samples: { 1: 960 } }) });
  say(tts, 0, "One 1.");
  await idle(tts);
  assert.equal(log.filter((l) => l.kind === "browser").length, 0);
  assert.ok(log.some((l) => l.kind === "cloud"));
});

test("circuit breaker: after repeated failures the cloud is not even called", async () => {
  const api = fakeApi({ fail: () => true });
  const breaker = new CircuitBreaker({ failLimit: 2, openMs: 60_000 });
  const tts = await build({ api, breaker });
  for (let i = 0; i < 2; i++) say(tts, i, `S ${i + 1}. `);
  await idle(tts);
  const before = api.calls.length;
  assert.equal(before, 2);
  say(tts, 2, "Late 3.");
  await idle(tts);
  assert.equal(api.calls.length, before, "cloud must not be called while the breaker is open");
  assert.equal(log.filter((l) => l.kind === "browser").length, 3, "every sentence still got spoken");
});

test("quota (429): the first refusal switches to the device voice at once; later sentences never wait for the cloud", async () => {
  const api = fakeApi({ fail: () => true, failWith: () => Object.assign(codedError("rate_limited"), { retryAfter: 20, status: 429 }) });
  const breaker = new CircuitBreaker();
  const tts = await build({ api, breaker });
  say(tts, 0, "First 1.");
  await idle(tts);
  assert.equal(api.calls.length, 1);
  assert.ok(!breaker.available(), "one quota answer is enough to open the breaker");
  for (let i = 1; i < 4; i++) say(tts, i, `Next ${i + 1}. `);
  await idle(tts);
  assert.equal(api.calls.length, 1, "no further cloud call while the quota pause lasts");
  assert.equal(log.filter((l) => l.kind === "browser").length, 4, "every sentence was still spoken, by the device voice");
  assert.equal(tts.notices.filter((n) => n.kind === "fallback").length, 1, "the person is told once");
});

test("provider 'webspeech' never touches the network", async () => {
  const api = fakeApi();
  const tts = await build({ api, cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "Hello there.");
  await idle(tts);
  assert.equal(api.calls.length, 0);
  assert.ok(log.some((l) => l.kind === "browser"));
});

test("cancel() stops playback, aborts in-flight requests and discards late audio", async () => {
  const api = fakeApi({ delays: { 1: 80 } });
  const tts = await build({ api });
  say(tts, 0, "Slow 1.");
  await sleep(10);
  tts.cancel();
  assert.equal(speechBus.speaking, false);
  assert.equal(tts.busy, false);
  assert.equal(api.calls[0].aborted, true);
  await sleep(120);
  assert.equal(log.filter((l) => l.kind === "cloud").length, 0, "late audio must be discarded");
  log.length = 0;
  tts.resetStream();
  say(tts, 0, "Fresh 2.");
  await idle(tts);
  assert.deepEqual(log.filter((l) => l.kind === "cloud").map((l) => l.tag), [2]);
  assert.deepEqual(seq()[0], "r0", "a new reply reveals from its first sentence again");
});

test("cancel() mid-playback of a browser sentence does not leave the queue stuck", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "One."); say(tts, 1, "Two.");
  await sleep(2);
  tts.cancel();
  say(tts, 0, "Three.");
  await sleep(40);
  assert.ok(log.some((l) => l.text === "Three."));
  assert.equal(speechBus.speaking, false);
});

// ------------------------------------------------------------------------ voices / languages
test("the avatar's gender is sent with every cloud request", async () => {
  const api = fakeApi();
  const male = { gender: "male", voiceHints: ["david"] };
  const female = { gender: "female", voiceHints: [] };
  const tts = await build({ api, av: male });
  tts.beginReply(male);
  say(tts, 0, "Hello 1.");
  await idle(tts);
  assert.equal(api.calls[0].gender, "male");
  await tts.configure(settings(), female);
  tts.beginReply(female);
  say(tts, 0, "Hello 2.");
  await idle(tts);
  assert.equal(api.calls[1].gender, "female");
});

test("the voice is pinned for the WHOLE reply: a mode change in the middle cannot switch it", async () => {
  const api = fakeApi({ delays: { 1: 30, 2: 30, 3: 30 } });
  const male = { gender: "male", voiceHints: ["david"] };
  const female = { gender: "female", voiceHints: ["zira"] };
  const tts = await build({ api, av: male });
  tts.beginReply(male);
  say(tts, 0, "Hello 1. ");
  say(tts, 1, "Hello 2. ");
  await tts.configure(settings(), female); // the avatar on screen changes while the reply is queued
  say(tts, 2, "Hello 3.");
  await idle(tts);
  assert.deepEqual(api.calls.map((c) => c.gender), ["male", "male", "male"]);
  // the next reply starts with the new avatar
  tts.beginReply(female);
  say(tts, 0, "Hello 4.");
  await idle(tts);
  assert.equal(api.calls[3].gender, "female");
});

test("the browser fallback of a reply also keeps that reply's voice after a mode change", async () => {
  const male = { gender: "male", voiceHints: ["david"] };
  const female = { gender: "female", voiceHints: ["zira"] };
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), av: male });
  tts.beginReply(male);
  say(tts, 0, "I am fine. ");
  await tts.configure(settings({ ttsProvider: "webspeech" }), female); // switched mid-reply
  say(tts, 1, "Still fine.");
  await idle(tts);
  assert.deepEqual(log.filter((l) => l.kind === "browser").map((l) => l.voice), ["David", "David"]);
});

test("a browser voice whose gender is unknown gets a pitch nudge towards the avatar's gender", async () => {
  const noHints = [{ name: "Generic", lang: "en-US", voiceURI: "g" }];
  for (const [gender, expected] of [["female", 1.12], ["male", 0.88]]) {
    const av = { gender, voiceHints: gender === "female" ? ["zira"] : ["david"] };
    const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), v: noHints, av });
    tts.beginReply(av);
    say(tts, 0, "Hello there.");
    await idle(tts);
    assert.equal(log.find((l) => l.kind === "browser").pitch, expected);
  }
  // a voice that matches the hints is left alone
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), av: { gender: "female", voiceHints: ["zira"] } });
  say(tts, 0, "Hello there.");
  await idle(tts);
  assert.equal(log.find((l) => l.kind === "browser").pitch, 1);
});

test("browser fallback voice follows the avatar's voice hints", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), av: { gender: "male", voiceHints: ["david"] } });
  say(tts, 0, "I am fine.");
  await sleep(40);
  assert.equal(log.find((l) => l.kind === "browser").voice, "David");
});

test("Bengali and English sentences get a voice and lang of their own language", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "আমি ভালো আছি। ");
  say(tts, 1, "I am fine.");
  await sleep(60);
  const b = log.filter((l) => l.kind === "browser");
  assert.equal(b[0].lang, "bn-BD");
  assert.equal(b[0].voice, "Nabanita");
  assert.equal(b[1].lang, "en-US");
  assert.equal(b[1].voice, "Zira");
});

test("Bengali with no Bengali voice anywhere: no waiting, the text flows, the person is told why", async () => {
  const api = fakeApi({ fail: () => true });
  const tts = await build({ api, v: voices.slice(0, 2) }); // cloud voice failing, no bn voice on the device
  const t0 = Date.now();
  say(tts, 0, "আমি ভালো আছি। ");
  say(tts, 1, "আপনি কেমন আছেন? ");
  say(tts, 2, "ধন্যবাদ।");
  await idle(tts);
  assert.ok(Date.now() - t0 < 1500, "must not sit through speech that will never be heard");
  assert.equal(log.filter((l) => l.kind === "browser").length, 0, "never an English voice reading Bengali");
  assert.deepEqual(seq().filter((x) => x.startsWith("r")), ["r0", "r1", "r2"], "all text revealed");
  assert.equal(tts.notices.filter((n) => n.kind === "novoice").length, 1, "told once per reply, not per sentence");
  assert.match(tts.notices.find((n) => n.kind === "novoice").text, /বাংলা/);
});

test("Bengali with a failing cloud voice but a device voice: the device voice speaks it, with a notice", async () => {
  const tts = await build({ api: fakeApi({ fail: () => true }) });
  say(tts, 0, "আমি ভালো আছি।");
  await idle(tts);
  const b = log.find((l) => l.kind === "browser");
  assert.equal(b.voice, "Nabanita");
  assert.equal(tts.notices.filter((n) => n.kind === "fallback").length, 1);
});

test("the circuit breaker never silences Bengali on a device without a Bengali voice: the cloud is still tried", async () => {
  const api = fakeApi();
  const breaker = new CircuitBreaker({ failLimit: 1, openMs: 60_000 });
  breaker.failure(new Error("x")); // open
  assert.equal(breaker.available(), false);
  const tts = await build({ api, breaker, v: voices.slice(0, 2) });
  say(tts, 0, "আমি ভালো আছি 1।");
  say(tts, 1, "I am fine 2.");
  await idle(tts);
  assert.ok(api.calls.length >= 1, "Bengali goes to the cloud even though the breaker is open");
  assert.equal(api.calls[0].text.includes("আমি"), true);
  assert.equal(log.filter((l) => l.kind === "cloud").length >= 1, true, "and it was heard");
  assert.equal(log.filter((l) => l.kind === "browser" && l.lang === "bn-BD").length, 0);
});

test("a slow voice is reported once, and the text is not held back by it", async () => {
  const api = fakeApi({ delays: { 2: 600 } });
  const tts = await build({ api, timeouts: { slow: 40, grace: 30, first: 3000 } });
  say(tts, 0, "One 1. ");
  say(tts, 1, "Two 2. ");
  await sleep(400);
  // sentence 2's voice is still on its way, but its text is already shown (grace period)
  assert.ok(seq().includes("r1"), "text revealed after the grace period even though the audio is late");
  assert.ok(!seq().includes("c2"));
  await idle(tts, 4000);
  assert.equal(tts.notices.filter((n) => n.kind === "slow").length, 1);
});

test("the text of a sentence appears when its voice starts, not before (inside the grace period)", async () => {
  const api = fakeApi({ delays: { 2: 80 } });
  const tts = await build({ api, timeouts: { grace: 5000 } });
  say(tts, 0, "One 1. ");
  say(tts, 1, "Two 2. ");
  await idle(tts);
  const order = seq();
  assert.ok(order.indexOf("c2") < order.indexOf("r1") + 3);          // r1 and c2 are adjacent: shown with the sound
  assert.ok(order.indexOf("r1") > order.indexOf("c1"), "sentence 2 is not shown while sentence 1 is being read");
});

test("a browser voice that never starts does not hold up the reply", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), neverStart: true, timeouts: { browserStart: 60 } });
  const t0 = Date.now();
  say(tts, 0, "Stuck one.");
  say(tts, 1, "Stuck two.");
  await idle(tts);
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(tts.busy, false);
  assert.deepEqual(seq().filter((x) => x.startsWith("r")), ["r0", "r1"]);
});

test("beginReply() clears the previous reply's highlighting and sentence offsets", async () => {
  const tts = await build();
  tts.beginReply(avatar);
  say(tts, 0, "First 1.");
  await idle(tts);
  tts.beginReply(avatar);
  assert.equal(tts.highlighter.sentences.length, 0);
  say(tts, 0, "Second 2.");
  assert.equal(tts.highlighter.sentences[0].charStart, 0);
  await idle(tts);
});

test("every sentence leaves a timing record for support", async () => {
  const tts = await build({ api: fakeApi({ fail: (n) => n === 2 }) });
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2.");
  await idle(tts);
  assert.equal(tts.diagnostics.length, 2);
  assert.equal(tts.diagnostics[0].via, "cloud");
  assert.ok(Number.isFinite(tts.diagnostics[0].firstAudioMs));
  assert.equal(tts.diagnostics[1].via, "browser");
});

test("the meter keeps running between sentences so the mouth does not snap shut", async () => {
  const tts = await build({ api: fakeApi({ delays: { 1: 1, 2: 1 } }) });
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2.");
  await sleep(100);
  assert.ok(tts._meter, "meter active while the reply is being read");
  await idle(tts);
  assert.equal(tts._meter, 0, "and stopped when the reply has been read");
});

test("browser speech is normalized per language (no English injected into Bengali)", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "দাম ১০০% নিশ্চিত।");
  say(tts, 1, "It costs 50% off.");
  await sleep(60);
  const b = log.filter((l) => l.kind === "browser");
  assert.equal(b[0].text, "দাম ১০০ শতাংশ নিশ্চিত।");
  assert.equal(b[1].text, "It costs 50 percent off.");
});

test("cloud receives markup-free but un-normalized text (backend normalizes)", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "**Total** is 50% 1.");
  await idle(tts);
  assert.equal(api.calls[0].text, "Total is 50% 1.");
});

// ------------------------------------------------------------------------ highlighter
test("highlighter walks the words of the sentence being read, on the DISPLAYED text", async () => {
  const tts = await build({ api: fakeApi({ samples: { 1: 4800 } }) });
  const raw = "**Bold** আমি ভালো 1.";
  const ranges = [];
  tts.highlighter.onUpdate = (r) => r && ranges.push(raw.slice(r.start, r.end));
  say(tts, 0, raw);
  await idle(tts);
  assert.equal(ranges[0], "**Bold**");
  assert.equal(ranges.at(-1), "1.");
  for (const r of ranges) assert.ok(raw.includes(r) && r.length > 0);
  assert.equal(tts.highlighter.activeRange, null, "highlight is cleared once everything was read");
});

test("pickVoice: pinned voice wins within its language; Bengali prefers bn-BD", () => {
  assert.equal(pickVoice(voices, { voiceURI: "david" }, avatar, "en").name, "David");
  assert.equal(pickVoice(voices, { voiceURI: "david" }, avatar, "bn").name, "Nabanita");
  assert.equal(pickVoice(voices, { voiceURI: "tanishaa" }, avatar, "bn").name, "Tanishaa");
  assert.equal(pickVoice(voices, {}, avatar, "en").name, "Zira"); // hint match
  assert.equal(pickVoice(voices.slice(0, 2), {}, avatar, "bn"), null);
});
