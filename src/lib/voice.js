/*
  voice.js — hands-free microphone input with barge-in.

  Pipeline:
    mic -> AudioWorklet (PCM) -> 16 kHz frames -> VadSegmenter (lib/vad.js)
        -> one WAV per utterance -> POST /voice/transcribe (Gemini; Bengali +
        English) -> text -> onUtterance()

  Behaviour contract:
    • The user can interrupt the avatar: when speech is detected while the
      assistant is talking, onBargeIn() fires at once (the caller stops it).
    • The system never cuts the user off: an utterance is only finalised after
      ~0.8 s of silence.
    • A 0.5 s pre-roll is kept, so the first syllable is never lost.
    • Nothing fails silently: every problem is reported through onStatus()
      ({kind: "busy" | "info" | "error", text}; text "" clears), and the live
      input level through onLevel() so the UI can show that the mic is hearing.

  State (onState): idle -> listening <-> capturing
*/
import { api } from "./api.js";
import { Resampler, VadSegmenter, encodeWav } from "./vad.js";

const WORKLET_SRC = `
class AidaPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(Math.round(sampleRate * 0.02)); // 20 ms
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("aida-pcm-tap", AidaPcmTap);
`;

/** Turn a getUserMedia failure into a sentence a presenter can act on. */
export function describeMicError(err) {
  const name = err?.name || "";
  if (!navigator.mediaDevices?.getUserMedia)
    return "Voice input needs a secure (https) page and a browser with microphone support.";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone is blocked. Click the lock icon in the address bar, allow the microphone, then press the mic button again.";
  if (name === "NotSupportedError" || name === "TypeError")
    return "This page cannot use the microphone here (it needs https and a supported browser).";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found. Plug one in, or pick another input in Settings.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The microphone is busy in another app. Close it there and try again.";
  return `Microphone error${name ? ` (${name})` : ""}. Please try again.`;
}

export class VoiceController {
  constructor({
    deviceId = "",
    onState,
    onUtterance,
    onBargeIn,
    isSpeaking,
    onLevel,
    onStatus,
    onFatal,
  }) {
    this.deviceId = deviceId;
    this.onState = onState || (() => {});
    this.onUtterance = onUtterance || (() => {});
    this.onBargeIn = onBargeIn || (() => {});
    this.isSpeaking = isSpeaking || (() => false);
    this.onLevel = onLevel || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onFatal = onFatal || (() => {});

    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.sink = null;
    this.resampler = null;
    this.chain = Promise.resolve(); // keeps utterances in spoken order
    this.pending = 0;
    this.state = "idle";
    this.stopped = false;

    this.vad = new VadSegmenter({
      isSpeaking: () => this.isSpeaking(),
      onBargeIn: () => this.onBargeIn(),
      onLevel: (l) => {
        this.onLevel(l);
        this._syncState(l.state);
      },
      onSegment: (frames) => this._enqueue(encodeWav(frames)),
    });
  }

  async start() {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error(describeMicError(null)), { friendly: true });
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.deviceId ? { ideal: this.deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      throw Object.assign(new Error(describeMicError(err)), { friendly: true });
    }
    if (this.stopped) return this.stop();

    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    // A context created outside a user gesture starts "suspended" and would
    // deliver pure silence — the classic "mic is on but nothing happens" bug.
    await this._resume();
    this.ctx.onstatechange = () => {
      if (this.ctx?.state === "suspended") this._resume();
    };
    document.addEventListener("visibilitychange", this._onVisible);

    this.resampler = new Resampler(this.ctx.sampleRate);
    const source = this.ctx.createMediaStreamSource(this.stream);
    await this._attachTap(source);

    this.stream.getAudioTracks()[0]?.addEventListener("ended", () => {
      if (this.stopped) return;
      this.onStatus({ kind: "error", text: "The microphone was disconnected." });
      this.stop();
      this.onFatal();
    });

    this.vad.reset();
    this._syncState("calibrating");
  }

  _onVisible = () => {
    if (!document.hidden) this._resume();
  };

  async _resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
    } catch {
      /* needs a user gesture; retried on the next click/keypress below */
    }
    if (this.ctx && this.ctx.state !== "running") {
      this.onStatus({ kind: "info", text: "Audio is paused by the browser — click anywhere on the page." });
      const retry = () => {
        this._resume();
        window.removeEventListener("pointerdown", retry, true);
        window.removeEventListener("keydown", retry, true);
      };
      window.addEventListener("pointerdown", retry, true);
      window.addEventListener("keydown", retry, true);
    } else {
      this.onStatus({ kind: "info", text: "" });
    }
  }

  async _attachTap(source) {
    // Silent sink: some browsers only pull audio through nodes that reach the output.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(this.ctx.destination);

    const handle = (chunk) => {
      for (const f of this.resampler.push(chunk)) this.vad.push(f);
    };

    if (this.ctx.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
        await this.ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.node = new AudioWorkletNode(this.ctx, "aida-pcm-tap");
        this.node.port.onmessage = (e) => handle(e.data);
        source.connect(this.node);
        this.node.connect(this.sink);
        return;
      } catch {
        /* fall through to ScriptProcessor */
      }
    }
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    this.node.onaudioprocess = (e) => handle(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(this.node);
    this.node.connect(this.sink);
  }

  _syncState(vadState) {
    const s = vadState === "capturing" ? "capturing" : "listening";
    if (this.state !== s) {
      this.state = s;
      this.onState(s);
    }
  }

  _enqueue(blob) {
    this.pending++;
    this.onStatus({ kind: "busy", text: "transcribing…" });
    this.chain = this.chain.then(() => this._transcribe(blob)).catch(() => {});
  }

  async _transcribe(blob) {
    try {
      const res = await api.transcribe(blob);
      const text = (res.text || "").trim();
      if (res.error) {
        this.onStatus({ kind: "error", text: res.message || "Speech recognition is unavailable right now." });
      } else if (!text) {
        this.onStatus({ kind: "info", text: "Didn't catch that — please say it again." });
      } else {
        this.onStatus({ kind: "info", text: "" });
        this.onUtterance(text);
      }
    } catch (e) {
      this.onStatus({ kind: "error", text: e?.message || "Could not reach the server." });
    } finally {
      this.pending--;
      if (this.pending === 0) this.onStatus({ kind: "busy", text: "" });
    }
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this._onVisible);
    try {
      if (this.node) {
        this.node.onaudioprocess = null;
        if (this.node.port) this.node.port.onmessage = null;
        this.node.disconnect();
      }
      this.sink?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.node = null;
    this.sink = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) {
      this.ctx.onstatechange = null;
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.vad.reset();
    this.state = "idle";
    this.onState("idle");
    this.onLevel({ level: 0, threshold: 0, state: "idle" });
  }
}
