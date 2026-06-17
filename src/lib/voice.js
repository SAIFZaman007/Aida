/*
  voice.js — hands-free microphone input with barge-in.

  Pipeline (all local, all free):
    mic -> Web Audio AnalyserNode -> energy VAD -> MediaRecorder per utterance
        -> backend faster-whisper (/voice/transcribe) -> text -> onUtterance()

  Behavior contract (matches the spec):
    • The user can interrupt the avatar: when speech is detected while the
      assistant is talking, onBargeIn() fires immediately (the caller stops TTS).
    • The system never interrupts the user: we only finalize and transcribe
      AFTER a sustained silence, so the user always finishes their thought.
    • Echo from the avatar's own voice is suppressed with browser AEC plus a
      higher detection threshold while the assistant is speaking.

  State machine:  idle -> listening -> capturing -> (silence) -> listening ...
*/
import { api } from "./api.js";

export class VoiceController {
  constructor({ deviceId = "", onState, onUtterance, onBargeIn, isSpeaking }) {
    this.deviceId = deviceId;
    this.onState = onState || (() => {});
    this.onUtterance = onUtterance || (() => {});
    this.onBargeIn = onBargeIn || (() => {});
    this.isSpeaking = isSpeaking || (() => false);

    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.raf = null;
    this.recorder = null;
    this.chunks = [];

    this.state = "idle";
    this.noiseFloor = 0.01;
    this.speechSince = 0; // timestamp speech started (onset debouncing)
    this.silenceSince = 0; // timestamp last went quiet
    this.calibrating = true;
    this.calibrationSamples = [];
    this.calibrationUntil = 0;
  }

  async start() {
    const constraints = {
      audio: {
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);

    this._setState("listening");
    this.calibrating = true;
    this.calibrationSamples = [];
    this.calibrationUntil = performance.now() + 500; // 0.5s noise calibration
    this._loop();
  }

  _setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.onState(s);
    }
  }

  _rms() {
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  _loop = () => {
    if (!this.analyser) return;
    const now = performance.now();
    const level = this._rms();

    // Calibrate the ambient noise floor for the first half-second.
    if (this.calibrating) {
      this.calibrationSamples.push(level);
      if (now >= this.calibrationUntil) {
        const avg =
          this.calibrationSamples.reduce((a, b) => a + b, 0) /
          this.calibrationSamples.length;
        this.noiseFloor = avg || 0.01;
        this.calibrating = false;
      }
      this.raf = requestAnimationFrame(this._loop);
      return;
    }

    // Require louder input while the assistant is speaking (anti-echo).
    const speakingNow = this.isSpeaking();
    const threshold = this.noiseFloor * (speakingNow ? 6 : 3) + 0.012;
    const isSpeech = level > threshold;

    if (this.state === "listening") {
      if (isSpeech) {
        if (!this.speechSince) this.speechSince = now;
        // Sustained ~120ms of speech = a real onset (debounce transients).
        if (now - this.speechSince > 120) {
          if (speakingNow) this.onBargeIn(); // user interrupts the avatar
          this._beginCapture();
        }
      } else {
        this.speechSince = 0;
      }
    } else if (this.state === "capturing") {
      if (isSpeech) {
        this.silenceSince = 0;
      } else {
        if (!this.silenceSince) this.silenceSince = now;
        // ~800ms of silence = the user finished their turn.
        if (now - this.silenceSince > 800) this._endCapture();
      }
    }

    this.raf = requestAnimationFrame(this._loop);
  };

  _beginCapture() {
    this.speechSince = 0;
    this.silenceSince = 0;
    this.chunks = [];
    // Fresh recorder per utterance -> a self-contained, valid webm blob.
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.onstop = () => this._finalize();
    this.recorder.start();
    this._setState("capturing");
  }

  _endCapture() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this._setState("listening");
  }

  async _finalize() {
    const blob = new Blob(this.chunks, { type: "audio/webm" });
    this.chunks = [];
    if (blob.size < 1500) return; // too short -> ignore stray noise
    try {
      const { text } = await api.transcribe(blob);
      const clean = (text || "").trim();
      if (clean) this.onUtterance(clean);
    } catch {
      /* transcription unavailable -> stay listening */
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this._setState("idle");
  }
}