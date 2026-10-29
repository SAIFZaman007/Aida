import test from "node:test";
import assert from "node:assert/strict";

import { TTS, speechBus, pickVoice, _resetVoiceCache } from "../src/lib/ttsEngine.js";
import { CircuitBreaker, Limiter } from "../src/lib/resilience.js";

// ---------------------------------------------------------------- fake browser
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; // what actually came out of the "speakers", in order

class FakeUtterance {
  constructor(text) { this.text = text; }
}
function installBrowser({ voices = [], utteranceMs = 5 } = {}) {
  let current = null;
  const synth = {
    getVoices: () => voices,
    addEventListener() {},
    speak(u) {
      current = u;
      log.push({ kind: "browser", text: u.text, lang: u.lang, voice: u.voice?.name });
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
const pcm = (n, samples = 480) => {
  const a = new Int16Array(samples).fill(n);
  return new Uint8Array(a.buffer);
};
const codedError = (code) => Object.assign(new Error(code), { code });

/** Fake API: sentence "… N." streams PCM tagged N. */
function fakeApi({ delays = {}, fail = () => false, calls = [], samples = {}, hang = () => false, midFail = () => false } = {}) {
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
      if (fail(n)) throw codedError("unavailable");
      return {
        sampleRate: 24000,
        chunks: (async function* () {
          const total = samples[n] ?? 480;
          yield pcm(n, Math.ceil(total / 2));
          if (midFail(n)) throw codedError("unavailable");
          await sleep(1);
          yield pcm(n, Math.floor(total / 2));
        })(),
      };
    },
  };
}

async function build({ api = fakeApi(), cfg = settings(), v = voices, breaker, timeouts, av = avatar } = {}) {
  log.length = 0;
  _resetVoiceCache();
  installBrowser({ voices: v });
  const tts = new TTS({ api, breaker: breaker || new CircuitBreaker(), limiter: new Limiter(3), timeouts });
  tts.onSentenceStart = (i) => log.push({ kind: "reveal", i });
  await tts.configure(cfg, av);
  return tts;
}
const idle = async (tts, max = 3000) => {
  const t0 = Date.now();
  while (tts.busy && Date.now() - t0 < max) await sleep(5);
  await sleep(15);
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
  const tts = await build({ api, av: { gender: "male", voiceHints: ["david"] } });
  say(tts, 0, "Hello 1.");
  await idle(tts);
  assert.equal(api.calls[0].gender, "male");
  await tts.configure(settings(), { gender: "female", voiceHints: [] });
  say(tts, 1, "Hello 2.");
  await idle(tts);
  assert.equal(api.calls[1].gender, "female");
});

test("a mode (avatar) change in the middle of a reply never changes the voice of queued sentences", async () => {
  const api = fakeApi({ delays: { 1: 30, 2: 30, 3: 30 } });
  const tts = await build({ api, av: { gender: "male", voiceHints: ["david"] } });
  say(tts, 0, "Hello 1. ");
  say(tts, 1, "Hello 2. ");
  await tts.configure(settings(), { gender: "female", voiceHints: [] }); // the person switches to Writer
  say(tts, 2, "Hello 3.");
  await idle(tts);
  assert.deepEqual(api.calls.map((c) => c.gender), ["male", "male", "female"]);
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

test("Bengali with no Bengali voice installed still sets lang (never uses an English voice)", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), v: voices.slice(0, 2) });
  say(tts, 0, "আমি ভালো আছি।");
  await sleep(40);
  const b = log.find((l) => l.kind === "browser");
  assert.equal(b.voice, undefined);
  assert.equal(b.lang, "bn-BD");
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
