import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// api.js reads Vite's import.meta.env, which does not exist under plain Node.
// Test the REAL source: copy it to a temp dir with that one expression stubbed
// and its relative import made absolute.
const libDir = new URL("../src/lib/", import.meta.url);
const dir = mkdtempSync(join(tmpdir(), "aida-api-"));
const src = readFileSync(new URL("api.js", libDir), "utf8")
  .replace("import.meta.env.VITE_API_URL", "undefined")
  .replace('"./text.js"', JSON.stringify(new URL("text.js", libDir).href));
writeFileSync(join(dir, "api.js"), src);
const { api, ApiError, getUiLang, setUiLang } = await import(pathToFileURL(join(dir, "api.js")).href);

// ------------------------------------------------------------------ helpers
const enc = new TextEncoder();
function sse(event, id, payload) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
function streamOf(chunks) {
  return new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); },
  });
}
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  return calls;
}
const sseResponse = (chunks, headers = {}) =>
  new Response(streamOf(chunks), { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
const jsonResponse = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const REQ = { conversationId: "c1", content: "hello" };

// ------------------------------------------------------------------- streaming
test("streams tokens and sentence events, returns the full text", async () => {
  mockFetch(() => sseResponse([
    enc.encode(": ping\n\n"),
    enc.encode(sse("token", 1, { t: "আমি " })),
    enc.encode(sse("sentence", 2, { index: 0, text: "আমি ভালো।", code: false })),
    enc.encode(sse("token", 3, { t: "ভালো।" })),
    enc.encode(sse("done", 4, {})),
  ]));
  const tokens = [], sentences = [];
  const full = await api.streamChat(REQ, (t) => tokens.push(t), undefined, (s) => sentences.push(s));
  assert.equal(full, "আমি ভালো।");
  assert.deepEqual(tokens, ["আমি ", "ভালো।"]);
  assert.deepEqual(sentences, [{ index: 0, text: "আমি ভালো।", code: false }]);
});

test("Bengali (multi-byte) split across network chunks is decoded intact", async () => {
  const bytes = enc.encode(sse("token", 1, { t: "নমস্কার বাংলা" }) + sse("done", 2, {}));
  // Cut at every possible byte offset: the decoder must never produce U+FFFD.
  for (let cut = 1; cut < bytes.length; cut += 3) {
    mockFetch(() => sseResponse([bytes.slice(0, cut), bytes.slice(cut)]));
    const full = await api.streamChat(REQ);
    assert.equal(full, "নমস্কার বাংলা", `cut at ${cut}`);
  }
});

test("a stream cut off without `done` is reported, not silently accepted", async () => {
  mockFetch(() => sseResponse([enc.encode(sse("token", 1, { t: "partial" }))]));
  await assert.rejects(api.streamChat(REQ), (e) => e instanceof ApiError && e.code === "interrupted");
});

test("server error frame becomes an ApiError with code and request id", async () => {
  mockFetch(() => sseResponse([
    enc.encode(sse("error", 1, { error: "অনুগ্রহ করে পরে চেষ্টা করুন", code: "rate_limited", request_id: "abc123" })),
    enc.encode(sse("done", 2, {})),
  ]));
  await assert.rejects(api.streamChat(REQ), (e) =>
    e instanceof ApiError && e.code === "rate_limited" && e.requestId === "abc123" && e.message.includes("অনুগ্রহ"));
});

test("HTTP 429 body {detail:{code,message}} is surfaced with Retry-After", async () => {
  mockFetch(() => jsonResponse(429, { detail: { code: "rate_limited", message: "Too many requests." } }, { "retry-after": "12" }));
  await assert.rejects(api.streamChat(REQ), (e) =>
    e.code === "rate_limited" && e.message === "Too many requests." && e.status === 429 && e.retryAfter === 12);
});

test("FastAPI 422 validation array becomes a friendly message", async () => {
  mockFetch(() => jsonResponse(422, { detail: [{ loc: ["body", "content"], msg: "too long" }] }));
  await assert.rejects(api.streamChat(REQ), (e) => e.code === "invalid" && !/loc|body/.test(e.message));
});

test("network failure becomes a friendly, coded error (no raw TypeError)", async () => {
  mockFetch(() => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(api.streamChat(REQ), (e) => e instanceof ApiError && e.code === "network" && !/fetch/i.test(e.message));
});

test("AbortError passes through untouched (Stop button relies on it)", async () => {
  mockFetch(() => { throw new DOMException("aborted", "AbortError"); });
  await assert.rejects(api.streamChat(REQ), (e) => e.name === "AbortError");
});

test("non-JSON error body falls back to a generic message", async () => {
  mockFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));
  await assert.rejects(api.streamChat(REQ), (e) => e.status === 502 && !/html|Gateway/i.test(e.message));
});

// ------------------------------------------------------------------- language
test("X-Lang follows the language the user writes in; mixed/unknown keep the last", async () => {
  const calls = mockFetch(() => sseResponse([enc.encode(sse("done", 1, {}))]));
  await api.streamChat({ ...REQ, content: "আপনি কেমন আছেন?" });
  assert.equal(calls.at(-1).opts.headers["X-Lang"], "bn");
  await api.streamChat({ ...REQ, content: "Docker কী?" }); // mixed
  assert.equal(calls.at(-1).opts.headers["X-Lang"], "bn");
  await api.streamChat({ ...REQ, content: "How are you?" });
  assert.equal(calls.at(-1).opts.headers["X-Lang"], "en");
  setUiLang("xx");
  assert.equal(getUiLang(), "en");
});

test("friendly errors are localized to the user's language", async () => {
  setUiLang("bn");
  mockFetch(() => { throw new TypeError("x"); });
  await assert.rejects(api.speak("hi"), (e) => /সংযোগ/.test(e.message));
  setUiLang("en");
});

// ------------------------------------------------------------------- voice
test("transcribe returns the backend body (including soft errors)", async () => {
  mockFetch(() => jsonResponse(200, { text: "", language: "unknown", error: "unavailable", message: "m" }));
  const out = await api.transcribe(new Blob(["x"]));
  assert.equal(out.error, "unavailable");
});

test("transcribe does not force a Content-Type (the browser sets the multipart boundary)", async () => {
  const calls = mockFetch(() => jsonResponse(200, { text: "ok", language: "en" }));
  await api.transcribe(new Blob(["x"]));
  assert.equal(calls[0].opts.headers["Content-Type"], undefined);
});

test("speakMarks decodes base64 WAV into an ArrayBuffer and passes the abort signal", async () => {
  const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const calls = mockFetch(() => jsonResponse(200, {
    audio: Buffer.from(wav).toString("base64"), duration: 1, text: "hi", marks: [],
  }));
  const ctrl = new AbortController();
  const out = await api.speakMarks("hi", "male", { signal: ctrl.signal });
  assert.deepEqual([...new Uint8Array(out.audio)], [...wav]);
  assert.equal(calls[0].opts.signal, ctrl.signal);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { text: "hi", gender: "male" });
});

test("speakStream yields PCM chunks and reads the sample rate header", async () => {
  mockFetch(() => new Response(streamOf([Uint8Array.of(1, 2, 3, 4), Uint8Array.of(5, 6)]), { status: 200, headers: { "x-sample-rate": "24000" } }));
  const s = await api.speakStream("hi", "male");
  assert.equal(s.sampleRate, 24000);
  const got = [];
  for await (const c of s.chunks) got.push([...c]);
  assert.deepEqual(got, [[1, 2, 3, 4], [5, 6]]);
});

test("speakStream sends the gender and rejects BEFORE any audio when the voice is down", async () => {
  const calls = mockFetch(() => jsonResponse(503, { detail: { code: "unavailable", message: "Voice down" } }));
  await assert.rejects(api.speakStream("hi", "male"), (e) => e instanceof ApiError && e.code === "unavailable");
  assert.equal(JSON.parse(calls[0].opts.body).gender, "male");
  assert.ok(calls[0].url.endsWith("/voice/speak_stream"));
});

test("liveSttUrl is the API base on ws(s)", () => {
  assert.equal(api.liveSttUrl(), "ws://127.0.0.1:8000/api/voice/stream");
});

test("speakMarks surfaces the backend's coded 503", async () => {
  mockFetch(() => jsonResponse(503, { detail: { code: "not_configured", message: "not set up" } }));
  await assert.rejects(api.speakMarks("hi"), (e) => e.code === "not_configured");
});

// ------------------------------------------------------------------- REST
test("CRUD helpers send JSON and parse errors the same way", async () => {
  const calls = mockFetch(() => jsonResponse(200, { id: "p1" }));
  assert.deepEqual(await api.createProject("n", "d"), { id: "p1" });
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  mockFetch(() => new Response(null, { status: 204 }));
  assert.equal(await api.deleteProject("p1"), null);
  mockFetch(() => jsonResponse(404, { detail: { code: "not_found", message: "gone" } }));
  await assert.rejects(api.listMessages("x"), (e) => e.code === "not_found");
});
