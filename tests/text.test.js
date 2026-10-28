import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  detectLanguage, dominantLanguage, normalizeForSpeech, stripMarkdown, hasSpeakable,
  rawWordSpans, mapSpokenIndexToRaw, mapMarksToRaw,
} from "../src/lib/text.js";
import { CircuitBreaker, Limiter } from "../src/lib/resilience.js";

const vectors = JSON.parse(readFileSync(new URL("./speech_vectors.json", import.meta.url), "utf8"));

// ---- parity with the backend (same JSON file runs in pytest) -----------------
for (const v of vectors.normalize) {
  test(`normalize: ${v.id}`, () => assert.equal(normalizeForSpeech(v.in), v.out));
}
for (const v of vectors.detect_language) {
  test(`detect_language: ${JSON.stringify(v.in)}`, () => assert.equal(detectLanguage(v.in), v.out));
}

test("dominantLanguage never returns mixed/unknown", () => {
  assert.equal(dominantLanguage("Docker কী"), "en");
  assert.equal(dominantLanguage("আমি Docker ব্যবহার করি"), "bn");
  assert.equal(dominantLanguage("১২৩"), "en");
});

// ---- the bugs the old frontend normalizer had --------------------------------
test("Bengali digits are never altered", () => {
  assert.equal(normalizeForSpeech("দাম ৫০০০০ টাকা"), "দাম ৫০০০০ টাকা");
});
test("Bengali text gets no English words injected", () => {
  assert.doesNotMatch(normalizeForSpeech("১০০% নিশ্চিত"), /[a-z]/);
});

// ---- stripMarkdown ------------------------------------------------------------
test("stripMarkdown handles formatting in both languages", () => {
  assert.equal(stripMarkdown("**মোটা** এবং _italic_ text"), "মোটা এবং italic text");
  assert.equal(stripMarkdown("## শিরোনাম"), "শিরোনাম");
  assert.equal(stripMarkdown("১. প্রথম ধাপ"), "প্রথম ধাপ");
  assert.equal(stripMarkdown("- item one"), "item one");
  assert.equal(stripMarkdown("see [docs](http://x.y/z) now"), "see docs now");
});
test("stripMarkdown ~~strike~~ keeps the text (old code inserted a literal $2)", () => {
  assert.equal(stripMarkdown("a ~~old~~ b"), "a old b");
});
test("stripMarkdown does not mangle snake_case", () => {
  assert.equal(stripMarkdown("use my_var_name here"), "use my var name here");
});
test("stripMarkdown keeps Bengali ZWJ/ZWNJ", () => {
  const s = "র‍্যাব";
  assert.equal(stripMarkdown(s), s);
});
test("hasSpeakable", () => {
  assert.equal(hasSpeakable("---"), false);
  assert.equal(hasSpeakable("..."), false);
  assert.equal(hasSpeakable("১"), true);
  assert.equal(hasSpeakable("আ"), true);
});

// ---- highlight mapping ----------------------------------------------------------
test("rawWordSpans", () => {
  assert.deepEqual(rawWordSpans("  ab cd"), [{ start: 2, end: 4 }, { start: 5, end: 7 }]);
});
test("mapSpokenIndexToRaw snaps to whole raw words", () => {
  const raw = "**Hello** big world";
  const span = mapSpokenIndexToRaw(0, 15, raw);
  assert.equal(raw.slice(span.start, span.end), "**Hello**");
  const last = mapSpokenIndexToRaw(14, 15, raw);
  assert.equal(raw.slice(last.start, last.end), "world");
});
test("mapMarksToRaw keeps timings and is monotonic", () => {
  const raw = "আমি ১০০% নিশ্চিত";
  const spoken = "আমি ১০০ শতাংশ নিশ্চিত";
  const marks = [];
  let pos = 0;
  spoken.split(" ").forEach((w, i) => {
    marks.push({ word: w, start: i, end: i + 1, char_start: pos, char_end: pos + w.length });
    pos += w.length + 1;
  });
  const mapped = mapMarksToRaw(marks, spoken.length, raw);
  assert.equal(mapped.length, marks.length);
  assert.deepEqual(mapped.map((m) => m.start), marks.map((m) => m.start));
  for (let i = 1; i < mapped.length; i++) assert.ok(mapped[i].char_start >= mapped[i - 1].char_start);
  for (const m of mapped) assert.ok(m.char_end <= raw.length && m.char_start < m.char_end);
  assert.equal(raw.slice(mapped.at(-1).char_start, mapped.at(-1).char_end), "নিশ্চিত");
});
test("mapMarksToRaw tolerates empty input", () => {
  assert.deepEqual(mapMarksToRaw([], 5, "abc"), []);
  assert.deepEqual(mapMarksToRaw([{ char_start: 0 }], 5, "   "), []);
});

// ---- resilience ----------------------------------------------------------------
test("CircuitBreaker opens after repeated failures and re-closes later", () => {
  let t = 0;
  const b = new CircuitBreaker({ failLimit: 3, openMs: 1000, now: () => t });
  assert.ok(b.available());
  b.failure(); b.failure();
  assert.ok(b.available());
  b.failure();
  assert.ok(!b.available());
  t = 1001;
  assert.ok(b.available());
});
test("CircuitBreaker: a success resets the failure count", () => {
  const b = new CircuitBreaker({ failLimit: 2 });
  b.failure(); b.success(); b.failure();
  assert.ok(b.available());
});
test("CircuitBreaker: not_configured stays open for a long time", () => {
  let t = 0;
  const b = new CircuitBreaker({ openMs: 1000, hardOpenMs: 100000, now: () => t });
  b.failure({ code: "not_configured" });
  t = 50000;
  assert.ok(!b.available());
});
test("Limiter never exceeds its concurrency and runs in FIFO order", async () => {
  const lim = new Limiter(2);
  let active = 0, peak = 0;
  const order = [];
  const job = (i) => lim.run(async () => {
    active++; peak = Math.max(peak, active); order.push(i);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  await Promise.all([0, 1, 2, 3, 4].map(job));
  assert.equal(peak, 2);
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
});
