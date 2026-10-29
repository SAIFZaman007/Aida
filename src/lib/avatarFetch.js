/*
  avatarFetch.js — download one .glb reliably.

  Why this exists (v2.4): the 3D stage used to
    1. "sniff" the file first with a Range request and trust the first chunk of the
       answer, then
    2. hand the URL to a loader whose cache remembers a FAILED download for as long as
       the page stays open.
  A single odd response (a proxy that answers a range request differently, a
  connection cut during the background preload, a cached partial file) therefore left
  that avatar broken until the page was reloaded — exactly "only one avatar shows".

  Now: ONE plain request per attempt, the whole body is read, validated, and only then
  parsed. Network trouble is retried (with a fresh, cache-bypassing request on the
  later attempts); a missing file or a web page in its place is reported at once with a
  message a person can act on. Nothing here touches three.js, so it is unit-tested.
*/

export class AvatarLoadError extends Error {
  /** @param code  missing | invalid | network | timeout | server | parse | aborted */
  constructor(message, { code = "network", url = "", status = 0, retryable = false, cause } = {}) {
    super(message);
    this.name = "AvatarLoadError";
    this.code = code;
    this.url = url;
    this.status = status;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

const GLB_MAGIC = 0x46546c67; // "glTF", little-endian

/** Throws unless `bytes` is a complete binary glTF. */
export function assertGlb(bytes, url = "") {
  if (!bytes || bytes.length < 20) {
    throw new AvatarLoadError("The avatar file is empty or incomplete.", { code: "invalid", url, retryable: true });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    const looksHtml = bytes[0] === 0x3c; // "<"
    throw new AvatarLoadError(
      looksHtml
        ? "The server returned a web page instead of the avatar file — the .glb is missing on the server."
        : "The avatar file is not a valid .glb model.",
      { code: looksHtml ? "missing" : "invalid", url, retryable: !looksHtml },
    );
  }
  const declared = view.getUint32(8, true);
  if (declared !== bytes.byteLength) {
    throw new AvatarLoadError(
      `The avatar download was cut short (${bytes.byteLength} of ${declared} bytes).`,
      { code: "invalid", url, retryable: true },
    );
  }
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Download `url` and return its bytes (a validated GLB).
 *
 * opts: { signal, onProgress(0..1), fetchImpl, attempts = 3, stallMs = 20000,
 *         backoffMs = 500, sleep }
 */
export async function fetchGlb(url, opts = {}) {
  const {
    signal,
    onProgress,
    fetchImpl = (...a) => fetch(...a),
    attempts = 3,
    stallMs = 20_000,
    backoffMs = 500,
    sleep = sleepReal,
  } = opts;

  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw new AvatarLoadError("Cancelled.", { code: "aborted", url });
    try {
      // Later attempts bypass the browser cache so a bad cached copy cannot repeat itself.
      return await once(url, { signal, onProgress, fetchImpl, stallMs, cacheMode: attempt === 0 ? "default" : "reload" });
    } catch (err) {
      lastError = err instanceof AvatarLoadError ? err : classify(err, url);
      if (lastError.code === "aborted" || !lastError.retryable || attempt === attempts - 1) throw lastError;
      await sleep(backoffMs * 2 ** attempt + Math.floor(Math.random() * 120));
    }
  }
  throw lastError;
}

function classify(err, url) {
  if (err?.name === "AbortError") return new AvatarLoadError("Cancelled.", { code: "aborted", url, cause: err });
  return new AvatarLoadError("Could not download the avatar (network problem).", { code: "network", url, retryable: true, cause: err });
}

async function once(url, { signal, onProgress, fetchImpl, stallMs, cacheMode }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });
  let stalled = false;
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      ctrl.abort();
    }, stallMs);
  };

  try {
    arm();
    let res;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, cache: cacheMode });
    } catch (e) {
      if (stalled) throw new AvatarLoadError("The avatar download stalled.", { code: "timeout", url, retryable: true, cause: e });
      throw classify(e, url);
    }

    if (!res.ok) {
      const missing = res.status === 404 || res.status === 403 || res.status === 410;
      throw new AvatarLoadError(
        missing ? `The avatar file was not found on the server (HTTP ${res.status}).` : `The server could not send the avatar (HTTP ${res.status}).`,
        { code: missing ? "missing" : "server", url, status: res.status, retryable: !missing },
      );
    }
    const type = (res.headers?.get?.("content-type") || "").toLowerCase();
    if (type.includes("text/html")) {
      throw new AvatarLoadError(
        "The server returned a web page instead of the avatar file — the .glb is missing on the server.",
        { code: "missing", url, status: res.status },
      );
    }

    const total = Number(res.headers?.get?.("content-length")) || 0;
    let bytes;
    try {
      if (res.body?.getReader) {
        const reader = res.body.getReader();
        const parts = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm(); // data is flowing: restart the stall clock
          parts.push(value);
          got += value.length;
          if (total && onProgress) onProgress(Math.min(0.99, got / total));
        }
        bytes = new Uint8Array(got);
        let o = 0;
        for (const p of parts) {
          bytes.set(p, o);
          o += p.length;
        }
      } else {
        bytes = new Uint8Array(await res.arrayBuffer());
      }
    } catch (e) {
      if (stalled) throw new AvatarLoadError("The avatar download stalled.", { code: "timeout", url, retryable: true, cause: e });
      throw classify(e, url);
    }
    assertGlb(bytes, url);
    onProgress?.(1);
    return bytes;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}
