/*
  vad.js — pure (no browser APIs) voice-activity segmentation + WAV encoding.

  Kept separate from voice.js so it can be unit-tested with synthetic audio.

  Input : consecutive 20 ms frames of 16 kHz mono Float32 samples.
  Output (two views of the same utterance):
    • STREAMING — onStart(preroll) when speech begins, onFrame(frame) for every
      frame after that, onEnd({frames, voiced, valid}) when the person stops.
      Feeds live transcription, so audio leaves the browser WHILE they talk.
    • WHOLE — onSegment(frames) once per valid utterance, INCLUDING a short
      pre-roll (so the first syllable is never clipped) and a short trailing
      pad. Used for the one-shot HTTP fallback.

  Why not MediaRecorder-per-utterance (the old approach): the recorder only
  starts after speech is detected, so the first ~150-250 ms — often the whole
  of a short word such as "hi" — was lost; and webm is not produced by every
  browser. Raw PCM + WAV has neither problem and every Gemini endpoint takes it.
*/

export const RATE = 16000;
export const FRAME = 320; // 20 ms

const PREROLL_FRAMES = 25; // 500 ms kept from before the onset
const ONSET_FRAMES = 3; // 60 ms above threshold = speech started
const BARGE_FRAMES = 6; // 120 ms while the assistant talks = interruption
const END_SILENCE_FRAMES = 34; // ~680 ms quiet = the user finished (was 840)
const KEEP_TAIL_FRAMES = 12; // trailing silence kept (240 ms)
const MIN_VOICED_FRAMES = 8; // < 160 ms of voice = noise/click, ignored
const MAX_SEGMENT_FRAMES = 1250; // 25 s hard cap
const CALIBRATION_FRAMES = 25; // 500 ms of ambient noise at start

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / (frame.length || 1));
}

export class VadSegmenter {
  constructor({ isSpeaking, onBargeIn, onSegment, onLevel, onStart, onFrame, onEnd, endSilenceFrames } = {}) {
    this.isSpeaking = isSpeaking || (() => false);
    this.onBargeIn = onBargeIn || (() => {});
    this.onSegment = onSegment || (() => {});
    this.onLevel = onLevel || (() => {});
    this.onStart = onStart || (() => {});
    this.onFrame = onFrame || (() => {});
    this.onEnd = onEnd || (() => {});
    this.endSilenceFrames = endSilenceFrames || END_SILENCE_FRAMES;
    this.reset();
  }

  reset() {
    this.state = "calibrating"; // -> listening <-> capturing
    this.noise = 0.01;
    this.calSum = 0;
    this.calN = 0;
    this.preroll = [];
    this.seg = [];
    this.loudRun = 0;
    this.silenceRun = 0;
    this.voiced = 0;
    this.n = 0;
  }

  /** Detection threshold for the current moment (exposed for the UI meter). */
  threshold(speakingNow = this.isSpeaking()) {
    return speakingNow
      ? clamp(this.noise * 5 + 0.02, 0.04, 0.15) // anti-echo while the avatar talks
      : clamp(this.noise * 3 + 0.012, 0.018, 0.08);
  }

  push(frame) {
    const level = rms(frame);
    const speakingNow = this.isSpeaking();
    const th = this.threshold(speakingNow);
    if (++this.n % 3 === 0) this.onLevel({ level, threshold: th, state: this.state });

    if (this.state === "calibrating") {
      this.calSum += level;
      if (++this.calN >= CALIBRATION_FRAMES) {
        this.noise = clamp(this.calSum / this.calN, 0.002, 0.04);
        this.state = "listening";
      }
      return;
    }

    const loud = level > th;

    if (this.state === "listening") {
      this.preroll.push(frame);
      if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift();
      if (loud) {
        this.loudRun++;
      } else {
        this.loudRun = 0;
        // Slowly follow the room's noise level (only on quiet frames).
        this.noise = clamp(this.noise * 0.98 + level * 0.02, 0.002, 0.04);
      }
      if (this.loudRun >= (speakingNow ? BARGE_FRAMES : ONSET_FRAMES)) {
        if (speakingNow) this.onBargeIn(); // the user interrupts the avatar
        this.seg = this.preroll;
        this.preroll = [];
        this.voiced = this.loudRun;
        this.silenceRun = 0;
        this.state = "capturing";
        this.onStart(this.seg.slice()); // pre-roll + the frames that triggered detection
      }
      return;
    }

    // capturing
    this.seg.push(frame);
    this.onFrame(frame);
    // End-of-speech uses a lower bar than onset (hysteresis) but always above
    // the room's own noise, otherwise a noisy room never "goes quiet".
    const off = Math.max(th * 0.6, this.noise * 1.3);
    if (level > off) {
      this.silenceRun = 0;
      this.voiced++;
    } else {
      this.silenceRun++;
    }
    if (this.silenceRun >= this.endSilenceFrames || this.seg.length >= MAX_SEGMENT_FRAMES) {
      this._finish();
    }
  }

  _finish() {
    const drop = Math.max(0, this.silenceRun - KEEP_TAIL_FRAMES);
    const frames = drop ? this.seg.slice(0, this.seg.length - drop) : this.seg;
    const voiced = this.voiced;
    this.seg = [];
    this.preroll = [];
    this.loudRun = 0;
    this.silenceRun = 0;
    this.voiced = 0;
    this.state = "listening";
    const valid = voiced >= MIN_VOICED_FRAMES; // shorter = a click or cough, not speech
    this.onEnd({ frames, voiced, valid });
    if (valid) this.onSegment(frames);
  }
}

/** Float32 frames (16 kHz mono) -> 16-bit PCM WAV Blob. */
export function encodeWav(frames, rate = RATE) {
  let n = 0;
  for (const f of frames) n += f.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      const s = clamp(f[i], -1, 1);
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Box-filter downsampler: native-rate chunks -> 16 kHz, any ratio, stateful. */
export class Resampler {
  constructor(inRate, outRate = RATE) {
    this.ratio = inRate / outRate;
    this.pos = 0;
    this.acc = 0;
    this.accN = 0;
    this.carry = new Float32Array(0);
  }

  /** Feed native-rate samples; returns zero or more complete 20 ms frames. */
  push(input) {
    const out = [];
    const emit = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        emit.push(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
        this.pos -= this.ratio;
      }
    }
    const merged = new Float32Array(this.carry.length + emit.length);
    merged.set(this.carry, 0);
    merged.set(emit, this.carry.length);
    let i = 0;
    for (; i + FRAME <= merged.length; i += FRAME) out.push(merged.slice(i, i + FRAME));
    this.carry = merged.slice(i);
    return out;
  }
}
