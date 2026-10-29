/*
  liveStt.js — real-time speech-to-text client (WebSocket to /api/voice/stream).

  While the person is still talking, 16 kHz PCM goes to the backend, which relays
  it to Gemini Live transcription. Back come LIVE CAPTIONS (`interim`) and, a
  moment after they stop, the FINAL text — so there is no "upload the whole clip,
  then wait" dead air.

  Protocol (see backend src/voice/live_stt.py)
    → binary PCM16 LE mono 16 kHz   → {"type":"start"|"end"|"ping"}
    ← {"type":"ready"} {"type":"interim","id","text"} {"type":"final","id","text","language"}
      {"type":"error","code","recoverable","id"?} {"type":"recycle"} {"type":"pong"}

  Design rules
    • Utterances are tracked by id (the Nth `start` on a connection is id N on both
      sides), so a late or lost answer can never be attached to the wrong utterance.
    • Anything that goes wrong — no connection, a drop mid-utterance, an error — is
      reported through `onLost(ids)` and the caller re-sends that audio over plain
      HTTP (/voice/transcribe). Nothing is ever silently dropped.
    • Audio produced while (re)connecting is queued, never lost, up to a small cap.
    • After repeated connection failures the client reports `failed` and stays out of
      the way for a cool-down; callers use HTTP meanwhile and the next try is automatic.
*/

const PING_MS = 20_000;
const BATCH_FRAMES = 3; // 3 × 20 ms = 60 ms per WebSocket message
const QUEUE_CAP_BYTES = 16000 * 2 * 20; // 20 s of audio while (re)connecting
const RETRY_DELAYS_MS = [250, 1000];
const FAILED_COOLDOWN_MS = 60_000;

/** Float32 [-1,1] -> Int16 little-endian PCM bytes. */
export function floatToPcm16(frames) {
  let n = 0;
  for (const f of frames) n += f.length;
  const buf = new ArrayBuffer(n * 2);
  const view = new DataView(buf);
  let o = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i];
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return buf;
}

export class LiveStt {
  constructor({
    url,
    WebSocketImpl,
    onInterim,
    onFinal,
    onUtteranceError,
    onLost,
    onStatus,
    connectTimeoutMs = 4000,
    now = () => Date.now(),
  } = {}) {
    this.url = url;
    this.WS = WebSocketImpl || globalThis.WebSocket;
    this.onInterim = onInterim || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onUtteranceError = onUtteranceError || (() => {});
    this.onLost = onLost || (() => {});
    this.onStatus = onStatus || (() => {});
    this.connectTimeoutMs = connectTimeoutMs;
    this.now = now;

    this.state = "idle"; // idle | connecting | open | failed | closed
    this.ws = null;
    this.failures = 0;
    this.failedUntil = 0;
    this.seq = 0; // ids on the CURRENT connection
    this.open = new Set(); // begun, not yet answered
    this.cur = null; // id being captured right now
    this.batch = [];
    this.queue = [];
    this.queueBytes = 0;
    this._timers = { connect: 0, ping: 0, retry: 0 };
  }

  /** True when begin() will hand out an id (connected, connecting, or ready to retry). */
  get usable() {
    if (!this.WS || !this.url) return false;
    if (this.state === "closed") return false;
    if (this.state === "failed") return this.now() >= this.failedUntil;
    return true;
  }

  // ------------------------------------------------------------------ connection
  connect() {
    if (!this.WS || !this.url || this.state === "closed") return;
    if (this.state === "connecting" || this.state === "open") return;
    this.state = "connecting";
    this._clear("retry");
    let ws;
    try {
      ws = new this.WS(this.url);
    } catch {
      this._dropped(false);
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this._timers.connect = setTimeout(() => {
      if (this.ws === ws && this.state === "connecting") this._dropped(false, ws);
    }, this.connectTimeoutMs);
    ws.onmessage = (e) => this._message(ws, e.data);
    ws.onclose = () => this._dropped(this.state === "open", ws);
    ws.onerror = () => {
      /* onclose follows; handled there */
    };
  }

  close() {
    this.state = "closed";
    this._clear("connect");
    this._clear("ping");
    this._clear("retry");
    const ws = this.ws;
    this.ws = null;
    this.open.clear();
    this.cur = null;
    this.batch = [];
    this.queue = [];
    this.queueBytes = 0;
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  }

  _clear(name) {
    clearTimeout(this._timers[name]);
    this._timers[name] = 0;
    if (name === "ping") clearInterval(this._timers.ping);
  }

  _ready(ws) {
    if (this.ws !== ws) return;
    this._clear("connect");
    this.state = "open";
    this.failures = 0;
    this.onStatus("open");
    this._timers.ping = setInterval(() => this._sendJson({ type: "ping" }), PING_MS);
    const queued = this.queue;
    this.queue = [];
    this.queueBytes = 0;
    for (const m of queued) this._raw(m);
  }

  /** The socket ended (or never opened). Everything not yet answered is lost. */
  _dropped(wasReady, ws = this.ws) {
    if (ws && this.ws !== ws) return; // an old socket we already replaced
    if (this.state === "closed") return;
    this._clear("connect");
    this._clear("ping");
    const lost = [...this.open];
    this.open.clear();
    this.cur = null;
    this.batch = [];
    this.queue = [];
    this.queueBytes = 0;
    this.seq = 0;
    const dead = this.ws;
    this.ws = null;
    try {
      dead?.close();
    } catch {
      /* already closed */
    }
    if (wasReady) this.failures = 0;
    else this.failures++;

    if (this.failures >= RETRY_DELAYS_MS.length + 1) {
      this.state = "failed";
      this.failedUntil = this.now() + FAILED_COOLDOWN_MS;
      this.failures = 0;
      this.onStatus("failed");
    } else {
      this.state = "connecting"; // "connecting" also covers the wait before a retry
      const delay = wasReady ? 0 : RETRY_DELAYS_MS[Math.min(this.failures - 1, RETRY_DELAYS_MS.length - 1)];
      this._timers.retry = setTimeout(() => {
        this.state = "idle";
        this.connect();
      }, delay);
      this.onStatus("reconnecting");
    }
    if (lost.length) this.onLost(lost);
  }

  _message(ws, data) {
    if (this.ws !== ws || typeof data !== "string") return;
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    switch (m.type) {
      case "ready":
        this._ready(ws);
        break;
      case "interim":
        if (this.open.has(m.id)) this.onInterim(m.id, String(m.text || ""));
        break;
      case "final":
        if (this.open.delete(m.id)) this.onFinal(m.id, String(m.text || ""), m.language || "unknown");
        break;
      case "error":
        if (m.recoverable && m.id != null) {
          // Only that utterance was refused (e.g. rate limit); the socket stays up.
          this.open.delete(m.id);
          this.onUtteranceError(m.id, m.code || "error", m.message || "");
        } else {
          this.lastError = { code: m.code || "error", message: m.message || "" };
          // The server closes right after; onclose will report what was lost.
        }
        break;
      case "recycle":
        // Google's 10-minute cap: reconnect between utterances (server waits for silence).
        if (this.open.size === 0 && this.cur == null) {
          this.state = "idle";
          this.seq = 0;
          const old = this.ws;
          this.ws = null;
          this._clear("ping");
          try {
            old?.close();
          } catch {
            /* ignore */
          }
          this.connect();
        }
        break;
      default:
    }
  }

  // ------------------------------------------------------------------ sending
  _raw(item) {
    try {
      this.ws.send(item);
    } catch {
      this._dropped(this.state === "open", this.ws);
    }
  }

  _enqueueOrSend(item, bytes) {
    if (this.state === "open" && this.ws) return this._raw(item);
    this.queue.push(item);
    this.queueBytes += bytes;
    if (this.queueBytes > QUEUE_CAP_BYTES) this._dropped(false, this.ws);
  }

  _sendJson(obj) {
    if (this.state === "open" && this.ws) this._raw(JSON.stringify(obj));
  }

  /** Start an utterance. Returns its id, or null if live transcription is unavailable
   *  (the caller then uses the HTTP path for this utterance). */
  begin() {
    if (!this.usable) return null;
    if (this.state === "failed" || this.state === "idle") this.connect();
    if (this.state === "failed" || this.state === "closed") return null;
    const id = ++this.seq;
    this.open.add(id);
    this.cur = id;
    this.batch = [];
    this._enqueueOrSend(JSON.stringify({ type: "start" }), 16);
    return id;
  }

  /** Feed 20 ms Float32 frames of the CURRENT utterance. */
  audio(frames) {
    if (this.cur == null) return;
    const list = Array.isArray(frames) ? frames : [frames];
    for (const f of list) this.batch.push(f);
    if (this.batch.length >= BATCH_FRAMES) this._flush();
  }

  _flush() {
    if (!this.batch.length) return;
    const pcm = floatToPcm16(this.batch);
    this.batch = [];
    this._enqueueOrSend(pcm, pcm.byteLength);
  }

  /** The person stopped talking. Returns false when the connection died in the
   *  meantime (the id was already reported through onLost). */
  end() {
    const id = this.cur;
    if (id == null) return false;
    this._flush();
    this.cur = null;
    this._enqueueOrSend(JSON.stringify({ type: "end" }), 16);
    return this.open.has(id);
  }

  /** Stop waiting for this utterance (the caller moved it to HTTP). */
  abandon(id) {
    this.open.delete(id);
  }
}
