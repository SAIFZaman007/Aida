import test from "node:test";
import assert from "node:assert/strict";
import { AvatarLoadError, assertGlb, fetchGlb } from "../src/lib/avatarFetch.js";
import { _resetAvatarCache, loadAvatar, peekAvatar, preloadAvatars } from "../src/lib/avatarLoader.js";

/** A tiny but structurally valid GLB: header + one JSON chunk. */
function makeGlb(extra = 0) {
  const json = Buffer.from('{"asset":{"version":"2.0"}}'.padEnd(28 + extra, " "));
  const total = 12 + 8 + json.length;
  const b = Buffer.alloc(total);
  b.writeUInt32LE(0x46546c67, 0);
  b.writeUInt32LE(2, 4);
  b.writeUInt32LE(total, 8);
  b.writeUInt32LE(json.length, 12);
  b.writeUInt32LE(0x4e4f534a, 16);
  json.copy(b, 20);
  return new Uint8Array(b);
}

const headers = (o = {}) => ({ get: (k) => o[k.toLowerCase()] ?? null });
const bodyOf = (bytes, chunk = 5) => {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => (i >= bytes.length ? { done: true } : { done: false, value: bytes.slice(i, (i += chunk)) }),
    }),
  };
};
const okResponse = (bytes, chunk, h = {}) => ({ ok: true, status: 200, headers: headers(h), body: bodyOf(bytes, chunk) });
const noSleep = async () => {};

test("a GLB delivered in 1-byte pieces is reassembled and validated", async () => {
  const glb = makeGlb();
  const got = await fetchGlb("/a.glb", { fetchImpl: async () => okResponse(glb, 1), sleep: noSleep });
  assert.deepEqual([...got], [...glb]);
});

test("progress is reported and ends at 1", async () => {
  const glb = makeGlb(100);
  const seen = [];
  await fetchGlb("/a.glb", {
    fetchImpl: async () => okResponse(glb, 16, { "content-length": String(glb.length) }),
    onProgress: (p) => seen.push(p),
    sleep: noSleep,
  });
  assert.equal(seen.at(-1), 1);
  assert.ok(seen.length > 2 && seen.every((p, i) => i === 0 || p >= seen[i - 1]));
});

test("a web page in place of the file is reported as missing and NOT retried", async () => {
  let calls = 0;
  const html = new TextEncoder().encode("<!doctype html><html></html>".padEnd(40, " "));
  await assert.rejects(
    fetchGlb("/a.glb", { fetchImpl: async () => (calls++, okResponse(html, 8, { "content-type": "text/html" })), sleep: noSleep }),
    (e) => e.code === "missing" && /missing on the server/.test(e.message),
  );
  assert.equal(calls, 1);
});

test("404 is missing, 503 is retried and then succeeds", async () => {
  await assert.rejects(
    fetchGlb("/a.glb", { fetchImpl: async () => ({ ok: false, status: 404, headers: headers() }), sleep: noSleep }),
    (e) => e.code === "missing",
  );
  const glb = makeGlb();
  let n = 0;
  const bypass = [];
  const got = await fetchGlb("/a.glb", {
    fetchImpl: async (_u, init) => {
      bypass.push(init.cache);
      return ++n < 3 ? { ok: false, status: 503, headers: headers() } : okResponse(glb);
    },
    sleep: noSleep,
  });
  assert.equal(got.length, glb.length);
  assert.deepEqual(bypass, ["default", "reload", "reload"], "retries bypass the browser cache");
});

test("a truncated download is detected and retried", async () => {
  const glb = makeGlb();
  let n = 0;
  const got = await fetchGlb("/a.glb", {
    fetchImpl: async () => okResponse(++n === 1 ? glb.slice(0, glb.length - 6) : glb),
    sleep: noSleep,
  });
  assert.equal(got.length, glb.length);
  assert.equal(n, 2);
});

test("a network error is retried, then reported with a plain message", async () => {
  let n = 0;
  await assert.rejects(
    fetchGlb("/a.glb", { attempts: 3, fetchImpl: async () => (n++, Promise.reject(new TypeError("Failed to fetch"))), sleep: noSleep }),
    (e) => e instanceof AvatarLoadError && e.code === "network" && /network problem/.test(e.message),
  );
  assert.equal(n, 3);
});

test("a stalled body is aborted after stallMs and retried", async () => {
  const glb = makeGlb();
  let n = 0;
  const got = await fetchGlb("/a.glb", {
    stallMs: 30,
    fetchImpl: async (_u, init) => {
      if (++n === 1) {
        return {
          ok: true, status: 200, headers: headers(),
          body: { getReader: () => ({ read: () => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))) }) },
        };
      }
      return okResponse(glb);
    },
    sleep: noSleep,
  });
  assert.equal(got.length, glb.length);
  assert.equal(n, 2);
});

test("assertGlb rejects junk", () => {
  assert.throws(() => assertGlb(new Uint8Array(30)), /not a valid/);
  assert.throws(() => assertGlb(new Uint8Array(3)), /empty or incomplete/);
});

test("loader: concurrent requests share one download; a failure is not cached", async () => {
  _resetAvatarCache();
  const glb = makeGlb();
  let fetches = 0;
  let fail = true;
  const fetchImpl = async () => {
    fetches++;
    return fail ? { ok: false, status: 404, headers: headers() } : okResponse(glb);
  };
  const parse = async () => ({ scene: "S", animations: [] });
  const a = { id: "x", url: "/x.glb" };

  await assert.rejects(loadAvatar(a, { fetchImpl, parse, sleep: noSleep }));
  assert.equal(peekAvatar(a), undefined, "failure must not stay in the cache");

  fail = false;
  fetches = 0;
  const [r1, r2] = await Promise.all([loadAvatar(a, { fetchImpl, parse }), loadAvatar(a, { fetchImpl, parse })]);
  assert.equal(fetches, 1);
  assert.equal(r1, r2);
  assert.equal(peekAvatar(a).gltf.scene, "S");
  await loadAvatar(a, { fetchImpl, parse });
  assert.equal(fetches, 1, "second load comes from memory");
});

test("loader: a parse error is reported as such, and the caller can stop waiting", async () => {
  _resetAvatarCache();
  const glb = makeGlb();
  const fetchImpl = async () => okResponse(glb);
  const bad = { id: "p", url: "/p.glb" };
  await assert.rejects(loadAvatar(bad, { fetchImpl, parse: async () => { throw new Error("boom"); } }), (e) => e.code === "parse");

  const slow = { id: "s", url: "/s.glb" };
  const ctrl = new AbortController();
  const p = loadAvatar(slow, { fetchImpl, parse: () => new Promise((r) => setTimeout(() => r({ scene: 1 }), 40)), signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e) => e.code === "aborted");
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(peekAvatar(slow), "the download finished in the background and is kept for next time");
});

test("preloadAvatars never throws and skips what is already loaded", async () => {
  _resetAvatarCache();
  const seen = [];
  const load = async (a) => {
    seen.push(a.id);
    if (a.id === "b") throw new Error("nope");
  };
  await preloadAvatars([{ id: "a", url: "/a" }, { id: "b", url: "/b" }, { id: "c", url: "/c" }], { gap: 1, load });
  assert.deepEqual(seen, ["a", "b", "c"]);
});
