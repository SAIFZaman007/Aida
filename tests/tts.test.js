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
    constructor() { this.state = "running"; this.destination = {}; }
    async decodeAudioData(buf) { return { duration: 0.01, tag: new Uint8Array(buf)[0] }; }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 4, getByteTimeDomainData(a) { a.fill(128); }, connect() {} }; }
    createBufferSource() {
      const ctx = this;
      return {
        connect() {}, buffer: null,
        start() { log.push({ kind: "cloud", tag: this.buffer.tag }); this._t = setTimeout(() => this.onended?.(), 5); },
        stop() { clearTimeout(this._t); this.onended?.(); },
      };
    }
    resume() { return Promise.resolve(); }
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

/** Fake API: audio bytes encode the sentence number so playback order is observable. */
function fakeApi({ delays = {}, fail = () => false, calls = [] } = {}) {
  return {
    calls,
    async speakMarks(text, gender, { signal } = {}) {
      calls.push({ text, gender });
      const n = Number(text.match(/\d+/)?.[0] ?? 0);
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delays[n] ?? 1);
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
      });
      if (fail(n)) { const e = new Error("boom"); e.code = "unavailable"; throw e; }
      return { audio: new Uint8Array([n]).buffer, marks: [], text, duration: 0.01 };
    },
  };
}

async function build({ api = fakeApi(), cfg = settings(), v = voices, breaker } = {}) {
  log.length = 0;
  _resetVoiceCache();
  installBrowser({ voices: v });
  const tts = new TTS({ api, breaker: breaker || new CircuitBreaker(), limiter: new Limiter(3) });
  await tts.configure(cfg, avatar);
  return tts;
}
const idle = async (tts) => { await tts._chain; await sleep(20); };
const say = (tts, index, text, code = false) => tts.speakSentence({ index, text, code });

// ------------------------------------------------------------------------ tests
test("sentences are PLAYED in order even when their audio arrives out of order", async () => {
  const tts = await build({ api: fakeApi({ delays: { 1: 60, 2: 1, 3: 1 } }) });
  say(tts, 0, "Sentence 1. ");
  say(tts, 1, "Sentence 2. ");
  say(tts, 2, "Sentence 3.");
  await idle(tts); await idle(tts);
  assert.deepEqual(log.filter((l) => l.kind === "cloud").map((l) => l.tag), [1, 2, 3]);
});

test("code sentences are never spoken but still registered with the highlighter", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "Intro 1. ");
  say(tts, 1, "```py\nx = 1\n```\n", true);
  say(tts, 2, "Outro 3.");
  await idle(tts);
  assert.equal(api.calls.length, 2);
  assert.equal(tts.highlighter.sentences.length, 3);
  assert.equal(tts.highlighter.sentences[2].charStart, "Intro 1. ".length + "```py\nx = 1\n```\n".length);
});

test("nothing is spoken when speech is disabled, but the highlighter is still fed", async () => {
  const api = fakeApi();
  const tts = await build({ api, cfg: settings({ ttsEnabled: false }) });
  say(tts, 0, "Hello 1.");
  await idle(tts);
  assert.equal(api.calls.length, 0);
  assert.equal(log.length, 0);
  assert.equal(tts.highlighter.sentences.length, 1);
});

test("pure punctuation / markup is skipped", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "---\n"); say(tts, 1, "... ");
  await idle(tts);
  assert.equal(api.calls.length, 0);
});

test("speaking flag turns on at the first sentence and off after the last", async () => {
  const states = [];
  const tts = await build();
  tts.onSpeakingChange = (v) => states.push(v);
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2.");
  assert.equal(speechBus.speaking, true);
  await idle(tts); await idle(tts);
  assert.deepEqual(states, [true, false]);
  assert.equal(speechBus.speaking, false);
});

test("a cloud failure falls back to the browser voice for that sentence, in order", async () => {
  const tts = await build({ api: fakeApi({ fail: (n) => n === 2 }) });
  say(tts, 0, "One 1. "); say(tts, 1, "Two 2. "); say(tts, 2, "Three 3.");
  await idle(tts); await idle(tts);
  assert.deepEqual(
    log.map((l) => (l.kind === "cloud" ? `cloud${l.tag}` : "browser")),
    ["cloud1", "browser", "cloud3"],
  );
});

test("circuit breaker: after repeated failures the cloud is not even called", async () => {
  const api = fakeApi({ fail: () => true });
  const breaker = new CircuitBreaker({ failLimit: 3, openMs: 60_000 });
  const tts = await build({ api, breaker });
  for (let i = 0; i < 3; i++) say(tts, i, `S ${i + 1}. `);
  await idle(tts); await idle(tts); await idle(tts);
  const before = api.calls.length;
  assert.equal(before, 3);
  say(tts, 3, "Late 4.");
  await idle(tts); await idle(tts);
  assert.equal(api.calls.length, before, "cloud must not be called while the breaker is open");
  assert.equal(log.filter((l) => l.kind === "browser").length, 4, "every sentence still got spoken");
});

test("provider 'webspeech' never touches the network", async () => {
  const api = fakeApi();
  const tts = await build({ api, cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "Hello there.");
  await idle(tts);
  assert.equal(api.calls.length, 0);
  assert.equal(log[0].kind, "browser");
});

test("cancel() stops playback, aborts in-flight requests and discards late audio", async () => {
  const api = fakeApi({ delays: { 1: 80 } });
  const tts = await build({ api });
  say(tts, 0, "Slow 1.");
  await sleep(10);
  tts.cancel();
  assert.equal(speechBus.speaking, false);
  await sleep(120);
  assert.equal(log.length, 0, "late audio must be discarded");
  // The engine still works afterwards.
  say(tts, 0, "Fresh 2.");
  await idle(tts); await idle(tts);
  assert.deepEqual(log.map((l) => l.tag), [2]);
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

test("Bengali and English sentences get a voice and lang of their own language", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "আমি ভালো আছি। ");
  say(tts, 1, "I am fine.");
  await sleep(60);
  assert.equal(log[0].lang, "bn-BD");
  assert.equal(log[0].voice, "Nabanita");
  assert.equal(log[1].lang, "en-US");
  assert.equal(log[1].voice, "Zira");
});

test("Bengali with no Bengali voice installed still sets lang (never uses an English voice)", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }), v: voices.slice(0, 2) });
  say(tts, 0, "আমি ভালো আছি।");
  await sleep(40);
  assert.equal(log[0].voice, undefined);
  assert.equal(log[0].lang, "bn-BD");
});

test("browser speech is normalized per language (no English injected into Bengali)", async () => {
  const tts = await build({ cfg: settings({ ttsProvider: "webspeech" }) });
  say(tts, 0, "দাম ১০০% নিশ্চিত।");
  say(tts, 1, "It costs 50% off.");
  await sleep(60);
  assert.equal(log[0].text, "দাম ১০০ শতাংশ নিশ্চিত।");
  assert.equal(log[1].text, "It costs 50 percent off.");
});

test("cloud receives markup-free but un-normalized text (backend normalizes)", async () => {
  const api = fakeApi();
  const tts = await build({ api });
  say(tts, 0, "**Total** is 50% 1.");
  await idle(tts);
  assert.equal(api.calls[0].text, "Total is 50% 1.");
});

test("highlighter follows word marks mapped onto the displayed sentence", async () => {
  const api = {
    async speakMarks(text) {
      return {
        audio: new Uint8Array([1]).buffer, text: "আমি ১০০ শতাংশ নিশ্চিত", duration: 0.01,
        marks: [
          { word: "আমি", start: 0, end: 0.001, char_start: 0, char_end: 3 },
          { word: "১০০", start: 0.002, end: 0.003, char_start: 4, char_end: 7 },
          { word: "শতাংশ", start: 0.004, end: 0.005, char_start: 8, char_end: 13 },
          { word: "নিশ্চিত", start: 0.006, end: 0.007, char_start: 14, char_end: 21 },
        ],
      };
    },
  };
  const tts = await build({ api });
  const ranges = [];
  const raw = "আমি ১০০% নিশ্চিত";
  tts.highlighter.onUpdate = (r) => r && ranges.push(raw.slice(r.start, r.end));
  say(tts, 0, raw);
  await idle(tts); await idle(tts);
  assert.equal(ranges[0], "আমি");
  assert.equal(ranges.at(-1), "নিশ্চিত");
  for (const r of ranges) assert.ok(raw.includes(r) && r.length > 0);
});

test("pickVoice: pinned voice wins within its language; Bengali prefers bn-BD", () => {
  assert.equal(pickVoice(voices, { voiceURI: "david" }, avatar, "en").name, "David");
  assert.equal(pickVoice(voices, { voiceURI: "david" }, avatar, "bn").name, "Nabanita");
  assert.equal(pickVoice(voices, { voiceURI: "tanishaa" }, avatar, "bn").name, "Tanishaa");
  assert.equal(pickVoice(voices, {}, avatar, "en").name, "Zira"); // hint match
  assert.equal(pickVoice(voices.slice(0, 2), {}, avatar, "bn"), null);
});
