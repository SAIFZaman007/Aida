/*
  speech.js — the voice output engine.

  Responsibilities:
   - SIMULTANEOUS voice: feed() is called with the growing reply as it streams;
     complete sentences are spoken the instant they finish.
   - CLEAN speech: sanitizeForSpeech() strips markdown/symbols, and
     normalizeForSpeech() (mirrors backend/src/voice/text_normalize.py) fixes
     robotic reading of repeated characters/digits and spoken-out abbreviations
     (e.g. "11111111", "e.g.") for the browser (webspeech) voice.
   - STABLE, GENDER-CORRECT voice: a matching voice is resolved for the active
     avatar and used for BOTH the Piper path and the browser fallback.
   - STOPPABLE: cancel() halts the browser voice AND any in-flight Piper audio,
     using an epoch guard so audio that finishes downloading after a stop is
     discarded instead of playing.
   - REAL-TIME READING HIGHLIGHTER: each spoken sentence is tagged with the
     sentence `index` assigned by the backend (chat/service.py). As that
     sentence plays, via Piper word-marks or webspeech onboundary events,
     speech.js drives a ReadingHighlighter so the UI can highlight exactly
     what's being spoken, teleprompter-style.

  Providers:
   - "piper"     : natural neural voice via the backend; real audio amplitude
                   AND word-level timing marks (speak_marks) drive both the
                   avatar's lip-sync and the highlighter.
   - "webspeech" : instant, offline, zero setup; onboundary events drive the
                   highlighter at word granularity.
*/
import { api } from "./api.js";
import { ReadingHighlighter } from "./highlighter.js";

export const speechBus = { amplitude: 0, speaking: false };

// Once Piper answers 503 (not configured), stop calling it for the session.
let _piperDown = false;

// ---- text cleanup -----------------------------------------------------------
export function sanitizeForSpeech(text) {
  if (!text) return "";
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, ". (code block) .");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");
  t = t.replace(/~~(.*?)~~/g, "$2");
  t = t.replace(/\|/g, " ");
  t = t.replace(/[#*_`>~]+/g, "");
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "");
  t = t.replace(/\s+/g, " ").trim();
  return normalizeForSpeech(t);
}

// ---- speech normalization (mirrors backend/src/voice/text_normalize.py) -----
const ABBREV_MAP = [
  [/\be\.g\.,?\s*/gi, "for example, "],
  [/\bi\.e\.,?\s*/gi, "that is, "],
  [/\betc\./gi, "et cetera"],
  [/\bvs\./gi, "versus"],
  [/\bw\/o\b/gi, "without"],
  [/\bw\/\b/gi, "with"],
  [/\bapprox\./gi, "approximately"],
  [/\bno\.\s*(?=\d)/gi, "number "],
  [/\bDr\./g, "Doctor"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miss"],
];

const ACRONYM_WORDS = {
  ASAP: "as soon as possible",
  FAQ: "F A Q",
  URL: "U R L",
  API: "A P I",
  SQL: "sequel",
  JSON: "jay-son",
  HTML: "H T M L",
  CSS: "C S S",
  CPU: "C P U",
  GPU: "G P U",
  RAM: "ram",
  AI: "A I",
};

const SYMBOL_MAP = [
  [/\s*&\s*/g, " and "],
  [/\s*%\s*/g, " percent "],
  [/\s*=\s*/g, " equals "],
  [/\s*\+\s*/g, " plus "],
  [/#(\d+)/g, "number $1"],
  [/@/g, " at "],
];

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function cardinal(n) {
  if (n === 0) return "zero";
  if (n < 0) return "negative " + cardinal(-n);

  const threeDigit = (num) => {
    const parts = [];
    const hundreds = Math.floor(num / 100);
    const rem = num % 100;
    if (hundreds) parts.push(ONES[hundreds] + " hundred");
    if (rem) {
      if (rem < 20) parts.push(ONES[rem]);
      else {
        const tens = Math.floor(rem / 10);
        const ones = rem % 10;
        parts.push(TENS[tens] + (ones ? `-${ONES[ones]}` : ""));
      }
    }
    return parts.join(" ");
  };

  const groups = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    let chunk = threeDigit(groups[i]);
    if (SCALES[i]) chunk += " " + SCALES[i];
    words.push(chunk);
  }
  return words.join(" ");
}

// Repeated character runs ("soooo", "!!!", "----") -> single character.
const REPEATED_CHAR_RE = /([^\d\s])\1{2,}/g;
// Repeated word/token runs ("go go go go") -> single occurrence.
const REPEATED_WORD_RE = /\b(\w+)(?:\s+\1\b){2,}/gi;
// Digit runs of 4+ -> spoken cardinal number.
const DIGIT_RUN_RE = /\b\d{4,}\b/g;

export function normalizeForSpeech(text) {
  if (!text) return "";
  let t = text;

  t = t.replace(REPEATED_CHAR_RE, (_, ch) => ch);
  t = t.replace(REPEATED_WORD_RE, (_, w) => w);
  t = t.replace(DIGIT_RUN_RE, (m) => {
    const n = parseInt(m, 10);
    return Number.isFinite(n) ? cardinal(n) : m;
  });

  for (const [re, repl] of ABBREV_MAP) t = t.replace(re, repl);

  t = t.replace(/\b[A-Z]{2,6}\b/g, (m) => ACRONYM_WORDS[m] ?? m);

  for (const [re, repl] of SYMBOL_MAP) t = t.replace(re, repl);

  return t.replace(/\s+/g, " ").trim();
}

function splitCompleteSentences(buffer) {
  const re = /[^.!?:\n]*[.!?:\n]+/g;
  const sentences = [];
  let consumed = 0;
  let m;
  while ((m = re.exec(buffer))) {
    const s = m[0].trim();
    if (s) sentences.push(s);
    consumed = re.lastIndex;
  }
  return { sentences, consumed };
}

// ---- voice resolution (gender-correct, pinnable) ----------------------------
let _voicesReady = null;
function voicesReady() {
  if (_voicesReady) return _voicesReady;
  _voicesReady = new Promise((resolve) => {
    const have = window.speechSynthesis?.getVoices() || [];
    if (have.length) return resolve(have);
    const handler = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis?.addEventListener("voiceschanged", handler, { once: true });
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1500);
  });
  return _voicesReady;
}

function pickVoice(voices, settings, avatar) {
  const en = voices.filter((v) => v.lang && v.lang.startsWith("en"));
  if (!en.length) return null;
  if (settings?.voiceURI) {
    const pinned = en.find((v) => v.voiceURI === settings.voiceURI);
    if (pinned) return pinned;
  }
  for (const hint of avatar?.voiceHints || []) {
    const hit = en.find((v) => v.name.toLowerCase().includes(hint));
    if (hit) return hit;
  }
  return en[0];
}

export async function resolveVoice(settings, avatar) {
  return pickVoice(await voicesReady(), settings, avatar);
}

// ---- the engine -------------------------------------------------------------
class TTS {
  constructor() {
    this._settings = null;
    this._avatar = null;
    this._voice = null;
    this._fedLen = 0;
    this._lastFull = "";
    this._active = 0;
    this._audioCtx = null;
    this._currentSource = null;
    this._playHead = Promise.resolve();
    this._epoch = 0; // bumped on cancel() to invalidate in-flight audio
    this.onSpeakingChange = null;

    // Real-Time Reading Progress Highlighter.
    this.highlighter = new ReadingHighlighter();
    this._nextSentenceIndex = 0;
  }

  async configure(settings, avatar) {
    this._settings = settings;
    this._avatar = avatar;
    // ALWAYS resolve a browser voice — used directly for the webspeech engine
    // and as the gender-correct fallback when Piper is unavailable.
    this._voice = await resolveVoice(settings, avatar);
  }

  _voiceSync() {
    return (
      this._voice ||
      pickVoice(window.speechSynthesis?.getVoices() || [], this._settings, this._avatar)
    );
  }

  resetStream() {
    this._fedLen = 0;
    this._lastFull = "";
    this._nextSentenceIndex = 0;
    this.highlighter.reset();
  }

  /** Called from chat/service's SSE "sentence" events — registers the
   *  sentence's position so spoken progress can be mapped onto the full
   *  reply text for the highlighter. */
  registerSentence(sentence) {
    this.highlighter.pushSentence(sentence);
  }

  feed(fullText) {
    if (!this._settings?.ttsEnabled) return;
    this._lastFull = fullText;
    const buffer = fullText.slice(this._fedLen);
    const { sentences, consumed } = splitCompleteSentences(buffer);
    if (consumed > 0) {
      this._fedLen += consumed;
      for (const s of sentences) this._enqueue(s);
    }
  }

  flush() {
    if (!this._settings?.ttsEnabled) return;
    const tail = this._lastFull.slice(this._fedLen).trim();
    this._fedLen = this._lastFull.length;
    if (tail) this._enqueue(tail);
  }

  _setSpeaking(v) {
    if (speechBus.speaking !== v) {
      speechBus.speaking = v;
      this.onSpeakingChange?.(v);
    }
    if (!v) this.highlighter.finish();
  }

  _enqueue(rawSentence) {
    const sentenceIndex = this._nextSentenceIndex++;
    const text = sanitizeForSpeech(rawSentence);
    if (!text) return;
    if (this._settings.ttsProvider === "piper") this._speakPiper(text, sentenceIndex);
    else this._speakWebSpeech(text, sentenceIndex);
  }

  _speakWebSpeech(text, sentenceIndex) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const voice = this._voiceSync();
    if (voice) u.voice = voice;
    u.rate = this._settings?.rate ?? 1;
    u.pitch = this._settings?.pitch ?? 1;
    u.onstart = () => {
      this._active++;
      this._setSpeaking(true);
      this.highlighter.driveWholeSentence(sentenceIndex);
    };
    u.onboundary = (e) => {
      speechBus.amplitude = 0.55 + Math.random() * 0.4;
      if (typeof e.charIndex === "number") {
        this.highlighter.driveWithBoundary(sentenceIndex, e.charIndex);
      }
    };
    u.onend = u.onerror = () => {
      this._active = Math.max(0, this._active - 1);
      if (this._active === 0) this._setSpeaking(false);
    };
    window.speechSynthesis.speak(u);
  }

  async _speakPiper(text, sentenceIndex) {
    if (_piperDown) return this._speakWebSpeech(text, sentenceIndex);
    const epoch = this._epoch;
    this._active++;
    this._setSpeaking(true);
    try {
      // Fetch audio + word-level timing marks together so the highlighter
      // can be driven from the SAME audio the user hears (no drift).
      const { audio, marks } = await api.speakMarks(text, this._avatar?.gender || "female");
      if (epoch !== this._epoch) {
        this._active = Math.max(0, this._active - 1);
        return; // cancelled while downloading -> discard
      }
      this._audioCtx = this._audioCtx || new AudioContext();
      const decoded = await this._audioCtx.decodeAudioData(audio);
      this._playHead = this._playHead.then(() =>
        epoch !== this._epoch
          ? Promise.resolve()
          : this._playBuffer(decoded, epoch, sentenceIndex, marks),
      );
      await this._playHead;
    } catch {
      _piperDown = true; // don't hammer the 503 endpoint again
      this._active = Math.max(0, this._active - 1);
      this._speakWebSpeech(text, sentenceIndex); // gender-correct fallback
      return;
    }
    this._active = Math.max(0, this._active - 1);
    if (this._active === 0) this._setSpeaking(false);
  }

  _playBuffer(audioBuffer, epoch, sentenceIndex, marks) {
    return new Promise((resolve) => {
      const ctx = this._audioCtx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      this._currentSource = src;

      const startedAt = performance.now();
      if (marks?.length) this.highlighter.driveWithMarks(sentenceIndex, marks, startedAt);
      else this.highlighter.driveWholeSentence(sentenceIndex);

      let raf;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) * (v - 128);
        speechBus.amplitude = Math.min(1, Math.sqrt(sum / data.length) / 40);
        raf = requestAnimationFrame(tick);
      };
      src.onended = () => {
        cancelAnimationFrame(raf);
        speechBus.amplitude = 0;
        if (this._currentSource === src) this._currentSource = null;
        resolve();
      };
      tick();
      src.start();
    });
  }

  // Stop EVERYTHING immediately (Stop button + barge-in).
  cancel() {
    this._epoch++; // invalidate any in-flight Piper audio
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    try {
      this._currentSource?.stop();
    } catch {
      /* ignore */
    }
    this._currentSource = null;
    this._playHead = Promise.resolve();
    this._active = 0;
    speechBus.amplitude = 0;
    this._setSpeaking(false);
  }

  stop() {
    this.cancel();
  }
}

export const tts = new TTS();
