/*
  speech.js — the voice output engine (Bengali + English).

  Responsibilities:
   - SIMULTANEOUS voice: the backend streams `sentence` events (chat/service.py
     using core/text.py: understands the Bengali danda "।", decimals, times,
     URLs and code fences). speakSentence() is called for each one, so speaking
     starts the moment the first sentence completes. The frontend no longer
     splits text itself — the SAME boundaries drive voice AND highlighter.
   - ORDERED playback: sentences are synthesized in parallel (small cap) but
     always PLAYED in order. (The old code played whichever download finished
     first, so sentences could come out shuffled.)
   - NEVER READ CODE ALOUD: sentences flagged `code` are skipped.
   - LANGUAGE-AWARE: each sentence is classified by script; Bengali sentences
     use a Bengali voice, English ones an English voice, so mixed replies are
     spoken correctly sentence by sentence.
   - RESILIENT: the cloud voice (Gemini) is primary. If it fails, that sentence
     is spoken by the browser voice IN ORDER; after repeated failures a circuit
     breaker routes straight to the browser voice for a minute, then retries.
   - STOPPABLE: cancel() halts the browser voice, any playing audio AND any
     in-flight network requests; an epoch guard discards late results.
   - READING HIGHLIGHTER: each sentence's `index` links it to the highlighter,
     driven by word marks (cloud) or onboundary events (browser). Spoken text
     is cleaned/normalized, so positions are mapped back onto the DISPLAYED
     sentence proportionally (lib/text.js) and snapped to whole words.

  Providers (settings.ttsProvider):
   - "cloud"     : natural Gemini voice via the backend; real audio amplitude
                   drives lip-sync, word marks drive the highlighter.
   - "webspeech" : the browser's own voices; offline, but Bengali requires a
                   Bengali voice installed on the device.
*/
import { ReadingHighlighter } from "./highlighter.js";
import { CircuitBreaker, Limiter } from "./resilience.js";
import {
  dominantLanguage,
  hasSpeakable,
  mapMarksToRaw,
  normalizeForSpeech,
  stripMarkdown,
} from "./text.js";

export { normalizeForSpeech };
export const speechBus = { amplitude: 0, speaking: false };

const CLOUD_TIMEOUT_MS = 30_000;

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
export class TTS {
  /** `api` must provide speakMarks(text, gender, {signal}). It is injected so
   *  the engine can be tested without a network or a bundler. */
  constructor({ api, breaker = new CircuitBreaker(), limiter = new Limiter(3) }) {
    this._api = api;
    this._breaker = breaker; // cloud-voice health
    this._limiter = limiter; // at most 3 TTS requests in flight
    this._settings = null;
    this._avatar = null;
    this._voices = { en: null, bn: null };
    this._pending = 0; // sentences queued or playing in the current epoch
    this._chain = Promise.resolve(); // playback order
    this._epoch = 0; // bumped on cancel() to invalidate in-flight work
    this._aborts = new Set(); // in-flight network requests
    this._audioCtx = null;
    this._currentSource = null;
    this.onSpeakingChange = null;

    // Real-Time Reading Progress Highlighter.
    this.highlighter = new ReadingHighlighter();
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
  }

  /** Called for every SSE `sentence` event: { index, text, code }.
   *  ALWAYS registers the sentence with the highlighter (offsets must stay
   *  contiguous), then speaks it unless it is code / speech is off. */
  speakSentence({ index, text, code }) {
    this.highlighter.pushSentence({ index, text });
    if (code || !this._settings?.ttsEnabled) return;
    const clean = stripMarkdown(text);
    if (!hasSpeakable(clean)) return; // e.g. "---" or "..."
    this._enqueue({ index, raw: text, clean, lang: dominantLanguage(clean) });
  }

  _setSpeaking(v) {
    if (speechBus.speaking !== v) {
      speechBus.speaking = v;
      this.onSpeakingChange?.(v);
    }
    if (!v) this.highlighter.finish();
  }

  _enqueue(item) {
    const epoch = this._epoch;
    this._pending++;
    this._setSpeaking(true);

    const useCloud = this._settings.ttsProvider === "cloud" && this._breaker.available();
    const prefetch = useCloud ? this._fetchCloud(item, epoch) : null;
    prefetch?.catch(() => {}); // the failure is handled when its turn comes

    this._chain = this._chain
      .then(() => this._play(item, prefetch, epoch))
      .catch(() => {});
  }

  async _play(item, prefetch, epoch) {
    if (epoch !== this._epoch) return; // cancelled while waiting
    try {
      if (prefetch) {
        try {
          const clip = await prefetch;
          if (epoch !== this._epoch) return;
          this._breaker.success();
          await this._playClip(clip, item, epoch);
          return;
        } catch (err) {
          if (epoch !== this._epoch) return;
          this._breaker.failure(err); // fall through to the browser voice
        }
      }
      await this._speakBrowser(item, epoch);
    } finally {
      if (epoch === this._epoch) {
        this._pending = Math.max(0, this._pending - 1);
        if (this._pending === 0) this._setSpeaking(false);
      }
    }
  }

  // ---- cloud voice ---------------------------------------------------------------
  _fetchCloud(item, epoch) {
    return this._limiter.run(async () => {
      if (epoch !== this._epoch) throw new DOMException("cancelled", "AbortError");
      const ctrl = new AbortController();
      this._aborts.add(ctrl);
      const timer = setTimeout(() => ctrl.abort(), CLOUD_TIMEOUT_MS);
      try {
        // The backend normalizes numbers/symbols itself (language-aware), so we
        // send markup-free but otherwise untouched text.
        const gender = this._avatar?.gender || "female";
        const { audio, marks, text } = await this._api.speakMarks(item.clean, gender, {
          signal: ctrl.signal,
        });
        this._audioCtx = this._audioCtx || new AudioContext();
        const decoded = await this._audioCtx.decodeAudioData(audio);
        const spokenLen = Array.from(text || "").length;
        return { decoded, marks: mapMarksToRaw(marks, spokenLen, item.raw) };
      } finally {
        clearTimeout(timer);
        this._aborts.delete(ctrl);
      }
    });
  }

  _playClip({ decoded, marks }, item, epoch) {
    return new Promise((resolve) => {
      const ctx = this._audioCtx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      this._currentSource = src;

      if (marks.length) this.highlighter.driveWithMarks(item.index, marks, performance.now());
      else this.highlighter.driveWholeSentence(item.index);

      let raf;
      let guard;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        clearTimeout(guard);
        speechBus.amplitude = 0;
        if (this._currentSource === src) this._currentSource = null;
        resolve();
      };
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) * (v - 128);
        speechBus.amplitude = Math.min(1, Math.sqrt(sum / data.length) / 40);
        raf = requestAnimationFrame(tick);
      };
      src.onended = finish;
      // A suspended AudioContext (autoplay policy) never fires `ended`; don't
      // let it stall every sentence behind this one.
      guard = setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        finish();
      }, decoded.duration * 1000 + 3000);
      if (epoch !== this._epoch) return finish();
      tick();
      src.start();
    });
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
    try {
      this._currentSource?.stop();
    } catch {
      /* ignore */
    }
    this._currentSource = null;
    this._chain = Promise.resolve();
    this._pending = 0;
    speechBus.amplitude = 0;
    this._setSpeaking(false);
  }

  stop() {
    this.cancel();
  }
}
