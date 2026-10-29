/*
  ttsEngine.js — the voice output engine (Bengali + English), sentence by sentence.

  THE LOOP (what the user sees and hears)
      sentence 1 appears  →  it is read aloud  →  sentence 2 appears  →  …
  The backend streams `sentence` events as the model writes. Each one is queued;
  the queue is consumed strictly in order and `onSentenceStart(index)` fires at the
  moment a sentence begins to be read, which is when the UI reveals its text. A
  sentence arriving while nothing else is queued is revealed at once, so the first
  words are on screen without waiting for audio.

  SPEED
   - STREAMING audio: each sentence is requested as a raw PCM stream
     (/voice/speak_stream) and playback starts after the first ~0.3 s of audio
     exists (lib/pcmPlayer.js), not after the whole clip was synthesized.
   - LOOK-AHEAD: while sentence N is being read, sentences N+1…N+3 are already
     downloading, so there is no dead air between sentences.
   - FAST FAIL-OVER: no first audio within 11 s (or an error) → that sentence is
     spoken by the browser voice instead; two failures in a row open a circuit
     breaker that routes straight to the browser voice for a minute, then retries.

  CORRECTNESS
   - ORDERED: audio may arrive out of order; playback never does.
   - NEVER READ CODE ALOUD: `code` sentences are revealed but skipped by the voice.
   - LANGUAGE-AWARE: each sentence is classified by script; Bengali sentences use
     a Bengali voice, English ones an English voice.
   - GENDER FOLLOWS THE AVATAR: the cloud request carries the avatar's gender, and
     the browser voice is chosen from the avatar's voice hints.
   - STOPPABLE: cancel() silences playback, aborts in-flight requests and discards
     late results (epoch guard).
   - READING HIGHLIGHTER: word-by-word karaoke inside the sentence being read, timed
     from the clip's real duration (or an estimate while it is still streaming).

  Providers (settings.ttsProvider):
   - "cloud"     : natural Gemini voice via the backend.
   - "webspeech" : the browser's own voices; offline, but Bengali needs a Bengali
                   voice installed on the device.
*/
import { ReadingHighlighter } from "./highlighter.js";
import { PcmClip, PcmPlayer } from "./pcmPlayer.js";
import { CircuitBreaker, Limiter } from "./resilience.js";
import {
  dominantLanguage,
  estimateWordMarks,
  hasSpeakable,
  normalizeForSpeech,
  stripMarkdown,
} from "./text.js";

export { normalizeForSpeech };
// Shared with the avatar: loudness + three band energies (for mouth shapes).
export const speechBus = { amplitude: 0, low: 0, mid: 0, high: 0, speaking: false };

const FIRST_AUDIO_TIMEOUT_MS = 11_000; // the server itself fails over to the backup model in ~8 s
const IDLE_TIMEOUT_MS = 8_000; // silence in the middle of a clip
const LOOKAHEAD = 3; // sentences fetched ahead of the one being read
const SEC_PER_CHAR = { en: 0.062, bn: 0.075 }; // starting estimate; learned from real clips

/** Text for the browser voice: markup removed, then normalized per language. */
export function sanitizeForSpeech(text, lang) {
  const clean = stripMarkdown(text);
  return normalizeForSpeech(clean, lang || dominantLanguage(clean));
}

// ---- voice resolution (language- and gender-aware, pinnable) -----------------
let _voicesReady = null;
function voicesReady() {
  if (_voicesReady) return _voicesReady;
  _voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const have = synth?.getVoices() || [];
    if (have.length) return resolve(have);
    const handler = () => resolve(synth.getVoices());
    synth?.addEventListener("voiceschanged", handler, { once: true });
    setTimeout(() => resolve(synth?.getVoices() || []), 1500);
  }).then((voices) => {
    // Don't cache an empty list: voices can arrive late.
    if (!voices.length) _voicesReady = null;
    return voices;
  });
  return _voicesReady;
}

/** Test hook: forget the cached browser voice list. */
export function _resetVoiceCache() {
  _voicesReady = null;
}

/** Pick a browser voice for `lang` ('en' | 'bn'). Returns null if the device
 *  has no voice for that language. */
export function pickVoice(voices, settings, avatar, lang = "en") {
  const group = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (!group.length) return null;
  if (settings?.voiceURI) {
    const pinned = group.find((v) => v.voiceURI === settings.voiceURI);
    if (pinned) return pinned;
  }
  if (lang === "bn") {
    return group.find((v) => /bn[-_]bd/i.test(v.lang)) || group[0];
  }
  for (const hint of avatar?.voiceHints || []) {
    const hit = group.find((v) => v.name.toLowerCase().includes(hint));
    if (hit) return hit;
  }
  return group[0];
}

export async function resolveVoice(settings, avatar, lang = "en") {
  return pickVoice(await voicesReady(), settings, avatar, lang);
}

// ---- the engine ----------------------------------------------------------------
const abortError = () => new DOMException("cancelled", "AbortError");

export class TTS {
  /** `api` must provide speakStream(text, gender, {signal}) -> {sampleRate, chunks}.
   *  Injected so the engine is testable without a network or a bundler. */
  constructor({ api, breaker = new CircuitBreaker(), limiter = new Limiter(3), player, timeouts } = {}) {
    this._api = api;
    this._timeouts = { first: FIRST_AUDIO_TIMEOUT_MS, idle: IDLE_TIMEOUT_MS, ...(timeouts || {}) };
    this._breaker = breaker; // cloud-voice health
    this._limiter = limiter; // at most 3 TTS requests in flight
    this._player = player || new PcmPlayer({ getContext: () => this._context() });
    this._settings = null;
    this._avatar = null;
    this._voices = { en: null, bn: null };
    this._queue = []; // items waiting or playing, in reading order
    this._loop = null; // the consumer, while there is anything to read
    this._epoch = 0; // bumped on cancel() to invalidate in-flight work
    this._aborts = new Set(); // in-flight network requests
    this._pending = 0; // queued + playing items (silent ones too)
    this._revealed = -1; // highest sentence index already shown
    this._audioCtx = null;
    this._speaking = false;
    this._meter = 0;
    this._secPerChar = { ...SEC_PER_CHAR };
    this._current = null;
    this.onSpeakingChange = null; // avatar mouth: true while sound is playing
    this.onBusyChange = null; // true from the first queued sentence until all are read
    this.onSentenceStart = null; // (index) a sentence begins to be read → reveal its text

    // Real-Time Reading Progress Highlighter.
    this.highlighter = new ReadingHighlighter();
  }

  /** Anything queued or being read? (The UI waits for this before it files a reply away.) */
  get busy() {
    return this._pending > 0;
  }

  _context() {
    if (!this._audioCtx) {
      try {
        // 24 kHz = the voice's own rate: no resampling at chunk boundaries.
        this._audioCtx = new AudioContext({ sampleRate: 24000, latencyHint: "interactive" });
      } catch {
        this._audioCtx = new AudioContext();
      }
    }
    return this._audioCtx;
  }

  async configure(settings, avatar) {
    this._settings = settings;
    this._avatar = avatar;
    const voices = await voicesReady();
    this._voices = {
      en: pickVoice(voices, settings, avatar, "en"),
      bn: pickVoice(voices, settings, avatar, "bn"),
    };
  }

  _voiceFor(lang) {
    return (
      this._voices[lang] ||
      pickVoice(window.speechSynthesis?.getVoices() || [], this._settings, this._avatar, lang)
    );
  }

  resetStream() {
    this.highlighter.reset();
    this._revealed = -1;
  }

  /** Called for every SSE `sentence` event: { index, text, code }.
   *  ALWAYS registers the sentence with the highlighter (offsets must stay
   *  contiguous). With speech on, it is queued — code and bare punctuation as
   *  silent items so reveal order is kept. */
  speakSentence({ index, text, code }) {
    this.highlighter.pushSentence({ index, text });
    if (!this._settings?.ttsEnabled) {
      this._reveal(index);
      return;
    }
    const clean = stripMarkdown(text);
    const silent = !!code || !hasSpeakable(clean); // e.g. a code fence, "---" or "..."
    // Nothing ahead of it → show it right away; its audio follows within a moment.
    if (this._pending === 0) this._reveal(index);
    // The voice gender is pinned to the sentence when it is queued: changing the mode
    // (and so the avatar) in the middle of a reply must not change the voice halfway.
    const gender = this._avatar?.gender || "female";
    const item = { index, raw: text, clean, lang: dominantLanguage(clean), silent, clip: null, gender };
    this._queue.push(item);
    this._pending++;
    if (this._pending === 1) this.onBusyChange?.(true);
    this._prefetch();
    if (!this._loop) {
      const epoch = this._epoch;
      this._loop = this._run(epoch);
    }
  }

  _reveal(index) {
    if (index > this._revealed) {
      this._revealed = index;
      this.onSentenceStart?.(index);
    }
  }

  _setSpeaking(v) {
    if (this._speaking === v && speechBus.speaking === v) return;
    this._speaking = v;
    speechBus.speaking = v;
    this.onSpeakingChange?.(v);
  }

  // ---- the consumer: one sentence at a time, in order -----------------------------
  async _run(epoch) {
    try {
      while (epoch === this._epoch && this._queue.length) {
        const item = this._queue[0];
        this._prefetch();
        await this._playItem(item, epoch);
        if (epoch !== this._epoch) return;
        this._queue.shift();
        this._pending = Math.max(0, this._pending - 1);
        this._prefetch();
      }
    } finally {
      if (epoch === this._epoch) {
        this._loop = null;
        this._current = null;
        this._setSpeaking(false);
        if (this._pending === 0) {
          this.highlighter.finish();
          this.onBusyChange?.(false);
        }
      }
    }
  }

  async _playItem(item, epoch) {
    this._current = item;
    this._reveal(item.index);
    if (item.silent) return;
    this._setSpeaking(true);
    if (item.clip) {
      try {
        await this._playClip(item, epoch);
        if (epoch !== this._epoch) return;
        if (item.clip.error) this._breaker.failure(item.clip.error); // cut mid-clip: heard part of it
        else this._breaker.success();
        return;
      } catch (err) {
        if (epoch !== this._epoch) return;
        this._breaker.failure(err); // nothing playable: fall through to the browser voice
      }
    }
    await this._speakBrowser(item, epoch);
  }

  // ---- cloud voice ----------------------------------------------------------------
  /** Start downloading audio for the next few sentences (never more than LOOKAHEAD ahead). */
  _prefetch() {
    if (this._settings?.ttsProvider !== "cloud" || !this._breaker.available()) return;
    const window_ = Math.min(this._queue.length, LOOKAHEAD + 1);
    for (let i = 0; i < window_; i++) {
      const item = this._queue[i];
      if (!item.silent && !item.clip) item.clip = this._startFetch(item, this._epoch);
    }
  }

  _startFetch(item, epoch) {
    const clip = new PcmClip();
    const gender = item.gender || this._avatar?.gender || "female";
    this._limiter
      .run(async () => {
        if (epoch !== this._epoch) throw abortError();
        const ctrl = new AbortController();
        this._aborts.add(ctrl);
        let timedOut = false;
        let timer = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, this._timeouts.first);
        const rearm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            timedOut = true;
            ctrl.abort();
          }, this._timeouts.idle);
        };
        try {
          // The backend normalizes numbers/symbols itself (language-aware), so we
          // send markup-free but otherwise untouched text.
          const stream = await this._api.speakStream(item.clean, gender, { signal: ctrl.signal });
          clip.sampleRate = stream.sampleRate || clip.sampleRate;
          for await (const chunk of stream.chunks) {
            rearm();
            clip.push(chunk);
          }
          clip.finish();
        } catch (err) {
          if (epoch !== this._epoch) return; // cancelled: nobody is listening
          if (timedOut) {
            const e = new Error("The voice took too long to respond.");
            e.code = "timeout";
            clip.fail(e);
          } else {
            clip.fail(err);
          }
        } finally {
          clearTimeout(timer);
          this._aborts.delete(ctrl);
        }
      })
      .catch(() => {});
    return clip;
  }

  async _playClip(item, epoch) {
    const clip = item.clip;
    this._startMeter();
    try {
      await this._player.play(clip, {
        onStart: ({ known }) => {
          if (epoch === this._epoch) this._driveHighlight(item, clip, known, epoch);
        },
      });
    } finally {
      this._stopMeter();
    }
    if (epoch === this._epoch && clip.done && !clip.error && clip.seconds > 0) {
      // Learn this voice's real speed so the next estimate is closer.
      const per = clip.seconds / Math.max(1, Array.from(item.clean).length);
      const prev = this._secPerChar[item.lang] ?? SEC_PER_CHAR.en;
      this._secPerChar[item.lang] = Math.min(0.15, Math.max(0.03, prev * 0.6 + per * 0.4));
    }
  }

  /** Karaoke inside the sentence: exact once the clip is complete, estimated until then. */
  _driveHighlight(item, clip, known, epoch) {
    const t0 = performance.now();
    const guess = Array.from(item.clean).length * (this._secPerChar[item.lang] ?? SEC_PER_CHAR.en);
    const duration = known ? clip.seconds : Math.max(0.6, guess);
    const marks = estimateWordMarks(item.raw, duration);
    if (marks.length) this.highlighter.driveWithMarks(item.index, marks, t0);
    else this.highlighter.driveWholeSentence(item.index);
    if (!known) {
      clip.finished.then(() => {
        if (epoch !== this._epoch || this._current !== item || clip.error) return;
        const elapsed = (performance.now() - t0) / 1000;
        const fixed = estimateWordMarks(item.raw, clip.seconds).filter((m) => m.end > elapsed);
        if (fixed.length) this.highlighter.driveWithMarks(item.index, fixed, t0);
      });
    }
  }

  _startMeter() {
    if (this._meter) return;
    const tick = () => {
      speechBus.amplitude = this._player.level();
      const [low, mid, high] = this._player.bands();
      speechBus.low = low;
      speechBus.mid = mid;
      speechBus.high = high;
      this._meter = requestAnimationFrame(tick);
    };
    this._meter = requestAnimationFrame(tick);
  }

  _stopMeter() {
    if (this._meter) cancelAnimationFrame(this._meter);
    this._meter = 0;
    speechBus.amplitude = 0;
    speechBus.low = speechBus.mid = speechBus.high = 0;
  }

  // ---- browser voice -------------------------------------------------------------
  _speakBrowser(item, epoch) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || epoch !== this._epoch) return resolve();
      const text = normalizeForSpeech(item.clean, item.lang);
      if (!text) return resolve();

      const u = new SpeechSynthesisUtterance(text);
      const voice = this._voiceFor(item.lang);
      if (voice) u.voice = voice;
      // Setting lang even without a matching voice lets the browser choose
      // the right engine/pronunciation where it can.
      u.lang = voice?.lang || (item.lang === "bn" ? "bn-BD" : "en-US");
      const rate = this._settings?.rate ?? 1;
      u.rate = rate;
      u.pitch = this._settings?.pitch ?? 1;

      let done = false;
      let guard;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        speechBus.amplitude = 0;
        resolve();
      };
      u.onstart = () => this.highlighter.driveWholeSentence(item.index);
      u.onboundary = (e) => {
        speechBus.amplitude = 0.55 + Math.random() * 0.4;
        if (typeof e.charIndex === "number") {
          this.highlighter.driveWithBoundary(item.index, e.charIndex, text.length);
        }
      };
      u.onend = u.onerror = finish;
      // Some browsers never fire onend (long utterances, voice failures).
      guard = setTimeout(() => {
        try {
          synth.cancel();
        } catch {
          /* ignore */
        }
        finish();
      }, Math.max(4000, (text.length * 120) / Math.max(rate, 0.5) + 3000));
      synth.speak(u);
    });
  }

  // Stop EVERYTHING immediately (Stop button, barge-in, new message).
  cancel() {
    this._epoch++; // invalidate queued/in-flight work
    for (const ctrl of this._aborts) ctrl.abort(); // stop paying for audio nobody hears
    this._aborts.clear();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    this._player.stop();
    this._stopMeter();
    this._queue = [];
    this._loop = null;
    this._current = null;
    const wasBusy = this._pending > 0;
    this._pending = 0;
    this._revealed = -1;
    this._setSpeaking(false);
    this.highlighter.finish();
    if (wasBusy) this.onBusyChange?.(false);
  }

  stop() {
    this.cancel();
  }
}
