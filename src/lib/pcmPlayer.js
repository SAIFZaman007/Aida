/*
  pcmPlayer.js — plays speech WHILE it is still being generated.

  The backend streams raw 16-bit mono PCM (POST /voice/speak_stream). A PcmClip
  collects the chunks of one sentence as they arrive; PcmPlayer schedules them
  back-to-back on the Web Audio clock, so the first words come out after the
  first ~0.3 s of audio exists rather than after the whole sentence was
  synthesized and downloaded.

  Both classes use only the standard Web Audio surface (createBuffer,
  createBufferSource, currentTime), so they run under a small fake in tests.
*/

const PREBUFFER_SECONDS = 0.3; // enough head-start to ride out network jitter
const START_LEAD_SECONDS = 0.04; // scheduling margin for the very first chunk
// play() returns this long BEFORE the last sample is heard, so the engine can hand over
// the next sentence while the tail is still playing. The next clip is chained to the end
// of the previous one on the audio clock (see `playhead`), so the join is sample-exact
// whatever the timers do.
const LEAD_OUT_SECONDS = 0.06;
const OUTPUT_DELAY_SECONDS = 0.06; // the mouth LEADS the sound by this much (see _ctx)

/** One sentence's audio, filled by the network while the player drains it. */
export class PcmClip {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.chunks = [];
    this.bytes = 0;
    this.done = false;
    this.error = null;
    this._waiters = [];
    this._firstSettled = false;
    this.firstAudio = new Promise((resolve, reject) => {
      this._first = { resolve, reject };
    });
    this.firstAudio.catch(() => {}); // the player/engine handles it; never an "unhandled rejection"
    this.finished = new Promise((resolve) => {
      this._finished = resolve;
    });
  }

  get seconds() {
    return this.bytes / 2 / this.sampleRate;
  }

  push(u8) {
    if (this.done || !u8?.length) return;
    this.chunks.push(u8);
    this.bytes += u8.length;
    if (!this._firstSettled) {
      this._firstSettled = true;
      this._first.resolve();
    }
    this._wake();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (!this._firstSettled) {
      this._firstSettled = true;
      const err = new Error("The voice returned no audio.");
      err.code = "unavailable";
      this._first.reject(err);
      this.error = err;
    }
    this._finished();
    this._wake();
  }

  fail(err) {
    if (this.done) return;
    this.error = err;
    this.done = true;
    if (!this._firstSettled) {
      this._firstSettled = true;
      this._first.reject(err);
    }
    this._finished();
    this._wake();
  }

  /** Resolves on the next push/finish/fail. */
  more() {
    return new Promise((resolve) => this._waiters.push(resolve));
  }

  _wake() {
    const w = this._waiters;
    this._waiters = [];
    for (const r of w) r();
  }
}

function int16ToFloat32(u8, carryByte) {
  // Network chunks can split a 16-bit sample; `carryByte` is the odd byte from before.
  let bytes = u8;
  if (carryByte != null) {
    bytes = new Uint8Array(u8.length + 1);
    bytes[0] = carryByte;
    bytes.set(u8, 1);
  }
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  const out = new Float32Array(usable / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return { samples: out, carry: usable < bytes.length ? bytes[bytes.length - 1] : null };
}

export class PcmPlayer {
  /** @param getContext  () => AudioContext (created lazily, after a user gesture) */
  constructor({ getContext }) {
    this.getContext = getContext;
    this.sources = new Set();
    this.playhead = 0;
    this.analyser = null;
    this._token = 0;
    this._stopWaiters = new Set(); // play() calls waiting for their tail; stop() releases them
  }

  _ctx() {
    const ctx = this.getContext();
    if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
    if (!this.analyser && ctx.createAnalyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      // Real lip-sync leads the sound: people see a mouth move a moment BEFORE they hear
      // the syllable. The analyser listens to the un-delayed signal while the speakers get
      // it OUTPUT_DELAY_SECONDS later, so the face anticipates the voice instead of lagging.
      if (ctx.createDelay) {
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = OUTPUT_DELAY_SECONDS;
        this.analyser.connect(delay);
        delay.connect(ctx.destination);
        this.delay = delay;
      } else {
        this.analyser.connect(ctx.destination);
      }
    }
    return ctx;
  }

  /** Energy in three speech bands (0..1): [low ≈ 100–800 Hz, mid ≈ 0.8–2.5 kHz,
   *  high ≈ 2.5–6 kHz]. Open vowels are low-heavy, "ee"/"s" high-heavy, so the avatar
   *  can vary its mouth shape instead of only opening and closing. */
  bands() {
    const a = this.analyser;
    const ctx = a && this.getContext();
    if (!a || !a.getByteFrequencyData || !ctx) return [0, 0, 0];
    const data = (this._freqBuf ||= new Uint8Array(a.frequencyBinCount));
    a.getByteFrequencyData(data);
    const hz = ctx.sampleRate / a.fftSize;
    const avg = (lo, hi) => {
      const from = Math.max(1, Math.floor(lo / hz));
      const to = Math.min(data.length, Math.ceil(hi / hz));
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i];
      return to > from ? sum / (to - from) / 255 : 0;
    };
    return [avg(100, 800), avg(800, 2500), avg(2500, 6000)];
  }

  /** Current output level 0..1, for lip-sync. */
  level() {
    const a = this.analyser;
    if (!a) return 0;
    const data = (this._levelBuf ||= new Uint8Array(a.frequencyBinCount));
    a.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += (v - 128) * (v - 128);
    return Math.min(1, Math.sqrt(sum / data.length) / 40);
  }

  /**
   * Play `clip` from its first sample. Resolves when the last sample has been
   * played (or `stop()` was called). Rejects only if nothing could be played at
   * all (the engine then falls back to the browser voice).
   *
   *   onStart({ known })  fired when sound begins; `known` = clip already complete
   */
  async play(clip, { onStart } = {}) {
    const token = ++this._token;
    const alive = () => token === this._token;

    await clip.firstAudio; // throws if the very first audio never comes
    // Small head-start so a slow link does not stutter, unless the clip is short/complete.
    while (alive() && !clip.done && clip.seconds < PREBUFFER_SECONDS) await clip.more();
    if (!alive()) return;

    const ctx = this._ctx();
    let carry = null;
    let index = 0;
    let started = false;
    let lastSource = null;

    while (alive()) {
      if (index < clip.chunks.length) {
        // Take everything that has arrived so far as ONE buffer (fewer, larger buffers).
        const parts = clip.chunks.slice(index);
        index = clip.chunks.length;
        let total = 0;
        for (const p of parts) total += p.length;
        const merged = new Uint8Array(total);
        let o = 0;
        for (const p of parts) {
          merged.set(p, o);
          o += p.length;
        }
        const { samples, carry: next } = int16ToFloat32(merged, carry);
        carry = next;
        if (samples.length) {
          const buffer = ctx.createBuffer(1, samples.length, clip.sampleRate);
          if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
          else buffer.getChannelData(0).set(samples);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(this.analyser || ctx.destination);
          const now = ctx.currentTime;
          // The first chunk of a clip starts where the previous clip ends when that is still
          // ahead (gapless), otherwise a moment from now.
          if (!started) this.playhead = Math.max(this.playhead, now + START_LEAD_SECONDS);
          const at = Math.max(this.playhead, now + 0.005);
          this.playhead = at + buffer.duration;
          this.sources.add(src);
          lastSource = src;
          src.onended = () => this.sources.delete(src);
          src.start(at);
          if (!started) {
            started = true;
            onStart?.({ known: clip.done });
          }
        }
        continue;
      }
      if (clip.done) break;
      await clip.more();
    }
    if (!alive()) return;

    if (!started) {
      if (clip.error) throw clip.error;
      return;
    }
    // Everything is scheduled; wait until the tail is nearly heard, then hand over.
    const remaining = Math.max(0, this.playhead - ctx.currentTime - LEAD_OUT_SECONDS) * 1000;
    if (remaining > 0) {
      let guard;
      let release;
      const stopped = new Promise((resolve) => {
        release = resolve;
        this._stopWaiters.add(resolve);
      });
      await Promise.race([
        stopped,
        new Promise((resolve) => {
          guard = setTimeout(resolve, remaining);
        }),
      ]);
      clearTimeout(guard);
      this._stopWaiters.delete(release);
    }
  }

  /** Silence everything immediately (Stop, barge-in, new message). */
  stop() {
    this._token++;
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.playhead = 0;
    for (const release of this._stopWaiters) release();
    this._stopWaiters.clear();
  }
}
