/*
  avatarLoader.js — load + parse avatars, with a cache that never keeps a failure.

    loadAvatar(avatar, { onProgress, signal })  -> { gltf, bytes, ms }
    peekAvatar(avatar)                           -> cached result or undefined
    preloadAvatars(list, { signal, gap })        -> quietly, one after the other
    clearAvatar(avatar)                          -> forget one entry

  • A request for a model that is already downloading shares that download.
  • A failed attempt is forgotten at once, so pressing "Retry" (or selecting the mode
    again) really tries again — the old loader remembered the error until a reload.
  • Everything it does is logged as one short line per avatar ("[avatar] writer ready
    in 640 ms") so a problem on a production page can be diagnosed from the console.
*/
import { AvatarLoadError, fetchGlb } from "./avatarFetch.js";

const ready = new Map(); // url -> { gltf, bytes, ms }
const pending = new Map(); // url -> { promise, listeners:Set }

const keyOf = (a) => (typeof a === "string" ? a : a.url);
const nameOf = (a) => (typeof a === "string" ? a.split("/").pop() : a.id || a.file);

async function defaultParse(bytes) {
  // imported on first use: tests inject their own parser and never load three's loaders
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return loader.parseAsync(buffer, "");
}

export function peekAvatar(avatar) {
  return ready.get(keyOf(avatar));
}

export function clearAvatar(avatar) {
  ready.delete(keyOf(avatar));
  pending.delete(keyOf(avatar));
}

/** Test hook. */
export function _resetAvatarCache() {
  ready.clear();
  pending.clear();
}

export function loadAvatar(avatar, { onProgress, signal, fetchImpl, parse = defaultParse, attempts, sleep } = {}) {
  const url = keyOf(avatar);
  const hit = ready.get(url);
  if (hit) {
    onProgress?.(1);
    return Promise.resolve(hit);
  }

  let entry = pending.get(url);
  if (!entry) {
    entry = { listeners: new Set(), promise: null };
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    entry.promise = (async () => {
      const bytes = await fetchGlb(url, {
        fetchImpl,
        attempts,
        sleep,
        onProgress: (p) => entry.listeners.forEach((fn) => fn(p)),
      });
      let gltf;
      try {
        gltf = await parse(bytes);
      } catch (e) {
        throw new AvatarLoadError(`The avatar file could not be read (${e?.message || e}).`, { code: "parse", url, cause: e });
      }
      const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
      const result = { gltf, bytes: bytes.length, ms };
      ready.set(url, result);
      console.info(`[avatar] ${nameOf(avatar)} ready in ${ms} ms (${(bytes.length / 1048576).toFixed(1)} MB)`);
      return result;
    })()
      .catch((e) => {
        console.warn(`[avatar] ${nameOf(avatar)} failed: ${e?.code || ""} ${e?.message || e}`);
        throw e;
      })
      .finally(() => {
        pending.delete(url); // a failure is never cached
      });
    pending.set(url, entry);
  }

  if (onProgress) entry.listeners.add(onProgress);
  const done = entry.promise.finally(() => onProgress && entry.listeners.delete(onProgress));
  if (!signal) return done;
  // The caller can stop waiting (mode changed); the download itself is kept for next time.
  return new Promise((resolve, reject) => {
    const abort = () => reject(new AvatarLoadError("Cancelled.", { code: "aborted", url }));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    done.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Fetch the rest in the background, one at a time, never raising. */
export async function preloadAvatars(list, { signal, gap = 1200, load = loadAvatar } = {}) {
  for (const a of list) {
    if (signal?.aborted) return;
    if (peekAvatar(a)) continue;
    try {
      await load(a, { signal });
    } catch {
      /* reported when that mode is actually selected */
    }
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, gap));
  }
}
