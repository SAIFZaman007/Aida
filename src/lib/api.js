import { detectLanguage } from "./text.js";

const API =
  (typeof window !== "undefined" && window.avatar?.apiBase) ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000/api";

/* ---- language the user is currently writing/speaking in --------------------
   Sent as `X-Lang` so the backend answers errors in the same language.
   Updated from the user's own messages; "mixed"/"unknown" keep the last value. */
let _lang = "en";
export function setUiLang(lang) {
  if (lang === "bn" || lang === "en") _lang = lang;
}
export function getUiLang() {
  return _lang;
}

const MSG = {
  network: {
    en: "Can't reach the server. Please check your connection and try again.",
    bn: "সার্ভারের সাথে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
  },
  interrupted: {
    en: "The connection was interrupted before the reply finished.",
    bn: "উত্তর শেষ হওয়ার আগেই সংযোগ বিচ্ছিন্ন হয়ে গেছে।",
  },
  invalid: {
    en: "That input isn't valid. Please check it and try again.",
    bn: "ইনপুটটি সঠিক নয়। অনুগ্রহ করে যাচাই করে আবার চেষ্টা করুন।",
  },
  generic: {
    en: "Something went wrong. Please try again.",
    bn: "কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
  },
};
const msg = (key) => MSG[key][_lang] || MSG[key].en;

/** Every failure surfaces as one of these. `message` is safe to show to the
 *  user (already localized); `code` is for logic; `requestId` is for support. */
export class ApiError extends Error {
  constructor(message, { code = "error", status = 0, requestId = "", retryAfter = 0 } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

/** Build an ApiError from a non-2xx Response. Handles the backend's
 *  {detail:{code,message,request_id}} shape, FastAPI's 422 array, and plain text. */
async function errorFromResponse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const detail = body?.detail ?? body;
  const requestId = res.headers.get("x-request-id") || detail?.request_id || "";
  const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10) || 0;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
    return new ApiError(detail.message, { code: detail.code, status: res.status, requestId, retryAfter });
  }
  if (Array.isArray(detail)) {
    return new ApiError(msg("invalid"), { code: "invalid", status: res.status, requestId });
  }
  if (typeof detail === "string" && detail) {
    return new ApiError(detail, { status: res.status, requestId });
  }
  return new ApiError(msg("generic"), { status: res.status, requestId });
}

/** fetch() that adds X-Lang and turns network failures into ApiError.
 *  AbortError is passed through untouched (callers rely on it). */
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { "X-Lang": _lang, ...(options.headers || {}) },
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError(msg("network"), { code: "network" });
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res;
}

async function json(path, options = {}) {
  const res = await request(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  return res.status === 204 ? null : res.json();
}

/** WebSocket URL of the live-transcription endpoint (same host and path prefix as the REST API). */
export function liveSttUrl() {
  return `${API.replace(/^http/i, "ws").replace(/\/+$/, "")}/voice/stream`;
}

export const api = {
  health: () => json("/health"),
  liveSttUrl,

  // Projects
  listProjects: () => json("/projects"),
  createProject: (name, description = "") =>
    json("/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  updateProject: (id, patch) =>
    json(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id) => json(`/projects/${id}`, { method: "DELETE" }),

  // Conversations
  listConversations: (projectId) => json(`/projects/${projectId}/conversations`),
  createConversation: (projectId, title, persona = "executive") =>
    json("/conversations", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, title, persona }),
    }),
  updateConversation: (id, patch) =>
    json(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteConversation: (id) => json(`/conversations/${id}`, { method: "DELETE" }),
  listMessages: (conversationId) => json(`/conversations/${conversationId}/messages`),

  // Streaming chat — named SSE events: token / sentence / done / error.
  //   sentence payload: { index, text, code }  (`code` = fenced code, never spoken)
  async streamChat({ conversationId, content, remember = true }, onToken, signal, onSentence) {
    setUiLang(detectLanguage(content));
    const res = await request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, content, remember }),
      signal,
    });
    if (!res.body) throw new ApiError(msg("generic"), { status: res.status });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let sawDone = false;

    const handle = (frame) => {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return; // heartbeat comment or empty frame
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (event === "error" || parsed.error) {
        throw new ApiError(parsed.error || msg("generic"), {
          code: parsed.code || "error",
          requestId: parsed.request_id || "",
        });
      }
      if (event === "token" && parsed.t) {
        full += parsed.t;
        onToken?.(parsed.t, full);
      } else if (event === "sentence") {
        onSentence?.(parsed);
      } else if (event === "done") {
        sawDone = true;
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) handle(frame);
      }
      if (buffer.trim()) handle(buffer);
    } catch (e) {
      if (e?.name === "AbortError" || e instanceof ApiError) throw e;
      throw new ApiError(msg("interrupted"), { code: "interrupted" });
    }
    // A stream that ends without `done` was cut off (proxy timeout, network).
    if (!sawDone) throw new ApiError(msg("interrupted"), { code: "interrupted" });
    return full;
  },

  /** Returns { text, language } — or { text:"", error, message } when the
   *  provider is unavailable (HTTP 200 by design so the mic loop keeps going). */
  async transcribe(blob, { signal } = {}) {
    const form = new FormData();
    form.append("file", blob, "speech.wav");
    const res = await request("/voice/transcribe", { method: "POST", body: form, signal });
    return res.json();
  },

  async speak(text, gender = "female", { signal } = {}) {
    const res = await request("/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
      signal,
    });
    return res.blob();
  },

  /** Streamed speech: raw 16-bit mono PCM, delivered as Google generates it.
   *  -> { sampleRate, chunks: AsyncIterable<Uint8Array> }. Rejects (ApiError, code
   *  "unavailable"/"rate_limited"/…) BEFORE any audio when synthesis is unavailable —
   *  the backend awaits the first chunk before answering — so callers can switch to a
   *  fallback voice immediately. */
  async speakStream(text, gender = "female", { signal } = {}) {
    const res = await request("/voice/speak_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
      signal,
    });
    const sampleRate = parseInt(res.headers.get("x-sample-rate") || "24000", 10) || 24000;
    if (!res.body) {
      const all = new Uint8Array(await res.arrayBuffer());
      return {
        sampleRate,
        chunks: (async function* () {
          if (all.length) yield all;
        })(),
      };
    }
    const reader = res.body.getReader();
    return {
      sampleRate,
      chunks: (async function* () {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) return;
            if (value?.length) yield value;
          }
        } finally {
          reader.cancel().catch(() => {});
        }
      })(),
    };
  },

  /** -> { audio: ArrayBuffer(WAV), marks, text, duration } */
  async speakMarks(text, gender = "female", { signal } = {}) {
    const res = await request("/voice/speak_marks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
      signal,
    });
    const data = await res.json();
    const binary = atob(data.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ...data, audio: bytes.buffer };
  },
};
