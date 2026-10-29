/*
  transcriber.js — turns utterances into text, preferring LIVE transcription.

  No browser APIs in here (so it is unit-tested): VoiceController feeds it the
  VAD's begin/audio/end events; it routes each utterance to
    1. the live WebSocket (captions while talking, text a moment after they stop), or
    2. one-shot HTTP (/voice/transcribe) when live is unavailable, drops mid-utterance,
       times out, or refuses — using the audio it kept, so nothing is lost.

  Order is preserved: text is delivered in the order people spoke, even if one
  utterance had to take the HTTP route.

  A live result that comes back EMPTY for what was clearly speech (≥ 0.6 s voiced)
  gets one second opinion over HTTP before we say "didn't catch that".
*/

import { isForeignScript, isNoisePhrase } from "./text.js";

const FINAL_TIMEOUT_MS = 7000; // server settles in < 1.5 s; this only catches a stalled socket
const SECOND_OPINION_FRAMES = 30; // 0.6 s of voiced audio

export class Transcriber {
  /**
   * @param createLive  (handlers) => live-client | null — builds the live client with
   *                    `onInterim/onFinal/onLost/onUtteranceError` wired to this object.
   * @param http        async (frames) => { text, error?, message? } — the one-shot path.
   */
  constructor({
    createLive,
    http,
    onInterim,
    onText,
    onNoSpeech,
    onError,
    onBusy,
    finalTimeoutMs = FINAL_TIMEOUT_MS,
  }) {
    this.http = http;
    this.onInterim = onInterim || (() => {});
    this.onText = onText || (() => {});
    this.onNoSpeech = onNoSpeech || (() => {});
    this.onError = onError || (() => {});
    this.onBusy = onBusy || (() => {});
    this.finalTimeoutMs = finalTimeoutMs;

    this.records = new Map(); // live id -> record
    this.rec = null; // the utterance being captured right now
    this.delivery = Promise.resolve(); // keeps results in spoken order
    this.pending = 0;
    this.disposed = false;
    this.live =
      createLive?.({
        onInterim: (id, t) => this._interim(id, t),
        onFinal: (id, t, _lang, reason) => this._final(id, t, reason),
        onLost: (ids) => this._lost(ids),
        onUtteranceError: (id, code, message) => this._refused(id, code, message),
      }) || null;
  }

  connect() {
    this.live?.connect();
  }

  // ------------------------------------------------------------------ VAD events
  begin(preroll) {
    const rec = { id: null, frames: null, valid: false, voiced: 0, timer: 0, tracked: false };
    this.rec = rec;
    const id = this.live?.usable ? this.live.begin() : null;
    if (id != null) {
      rec.id = id;
      this.records.set(id, rec);
      this.live.audio(preroll);
    }
  }

  audio(frame) {
    if (this.rec && this.rec.id != null) this.live.audio(frame);
  }

  end({ frames, voiced, valid }) {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.frames = frames;
    rec.voiced = voiced;
    rec.valid = valid;

    if (rec.id != null) {
      const accepted = this.live.end();
      if (!accepted) {
        // The connection died between the last audio and the end marker.
        this.records.delete(rec.id);
        rec.id = null;
      } else if (!valid) {
        // A click or cough: let the server finish it, but nobody waits for the answer.
        this.records.delete(rec.id);
        this.live.abandon(rec.id);
        return;
      } else {
        this._track(rec);
        rec.timer = setTimeout(() => this._timedOut(rec), this.finalTimeoutMs);
        return;
      }
    }
    if (valid) this._viaHttp(rec);
  }

  // ------------------------------------------------------------------ results
  _interim(id, text) {
    if (this.disposed) return;
    const rec = this.records.get(id);
    if (rec && text && !isForeignScript(text) && !isNoisePhrase(text)) this.onInterim(text); // no captions in a language we do not speak
  }

  _final(id, raw, reason = "") {
    const rec = this.records.get(id);
    if (!rec || this.disposed) return;
    this.records.delete(id);
    clearTimeout(rec.timer);
    let text = (raw || "").trim();
    // Noise heard as another language (Chinese, Russian…) or as a stock "no speech" phrase: that is
    // "no speech", and a second
    // opinion would only spend quota on the same noise.
    const noise = reason === "script" || reason === "noise" || isForeignScript(text) || isNoisePhrase(text);
    if (noise) text = "";
    if (!text && !noise && rec.voiced >= SECOND_OPINION_FRAMES && rec.frames) return this._viaHttp(rec);
    this._inOrder(() => this._deliver(rec, text));
  }

  /** Results are handed over in the order people spoke, whichever route they took. */
  _inOrder(fn) {
    this.delivery = this.delivery.then(() => {
      if (!this.disposed) fn();
    });
  }

  _timedOut(rec) {
    if (rec.id == null || !this.records.has(rec.id)) return;
    this.records.delete(rec.id);
    this.live?.abandon(rec.id);
    rec.id = null;
    this._viaHttp(rec);
  }

  _lost(ids) {
    for (const id of ids) {
      const rec = this.records.get(id);
      if (!rec) continue;
      this.records.delete(id);
      clearTimeout(rec.timer);
      rec.id = null;
      // Still being captured: `end()` will notice id == null and take the HTTP route.
      if (rec.frames && rec.valid) this._viaHttp(rec);
    }
  }

  _refused(id, code, message) {
    const rec = this.records.get(id);
    if (!rec) return;
    this.records.delete(id);
    clearTimeout(rec.timer);
    if (rec.id === id && !rec.frames) rec.id = null;
    this._settle(rec);
    this.onError(message || code);
  }

  // ------------------------------------------------------------------ HTTP route
  _viaHttp(rec) {
    this._track(rec); // no-op if this utterance is already counted as in progress
    // The request starts NOW; only the hand-over waits for earlier utterances.
    const answer = Promise.resolve()
      .then(() => this.http(rec.frames))
      .then(
        (res) => ({ res }),
        (err) => ({ err }),
      );
    this.delivery = this.delivery.then(async () => {
      const { res, err } = await answer;
      if (this.disposed) return;
      if (err) {
        this._settle(rec);
        return this.onError(err?.message || "Could not reach the server.");
      }
      if (res?.error) {
        this._settle(rec);
        return this.onError(res.message || "Speech recognition is unavailable right now.");
      }
      this._deliver(rec, (res?.text || "").trim());
    });
  }

  _deliver(rec, text) {
    this._settle(rec);
    this.onInterim("");
    if (text && isForeignScript(text)) text = "";
    if (text) this.onText(text);
    else this.onNoSpeech();
  }

  // ------------------------------------------------------------------ bookkeeping
  _track(rec) {
    if (rec.tracked) return;
    rec.tracked = true;
    this.pending++;
    this.onBusy(true);
  }

  _settle(rec) {
    if (!rec.tracked) return;
    rec.tracked = false;
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) this.onBusy(false);
  }

  dispose() {
    this.disposed = true;
    for (const rec of this.records.values()) clearTimeout(rec.timer);
    this.records.clear();
    this.rec = null;
    this.live?.close();
    this.live = null;
  }
}
