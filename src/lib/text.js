/*
  text.js — bilingual (Bengali / English) text primitives for the voice UI.

  Mirrors backend/src/core/text.py and backend/src/voice/text_normalize.py.
  The two implementations MUST behave identically: tests/speech_vectors.json is
  executed by both the backend (pytest) and the frontend (node --test).

  Pure functions only (no DOM, no network) so they run under `node --test`.
*/

// ---- language ---------------------------------------------------------------
const BN_LO = 0x0980;
const BN_HI = 0x09ff;
const LETTER = /\p{L}/u;

/** [bengaliLetters, latinLetters]. Bengali digits/vowel signs are not counted
 *  (only letters, like Python's str.isalpha()). */
export function scriptCounts(text) {
  let bn = 0;
  let latin = 0;
  for (const ch of text || "") {
    const o = ch.codePointAt(0);
    if (o >= BN_LO && o <= BN_HI) {
      if (LETTER.test(ch)) bn++;
    } else if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
      latin++;
    }
  }
  return [bn, latin];
}

/** 'bn' | 'en' | 'mixed' | 'unknown' */
export function detectLanguage(text) {
  const [bn, latin] = scriptCounts(text);
  const total = bn + latin;
  if (total === 0) return "unknown";
  const ratio = bn / total;
  if (ratio >= 0.6) return "bn";
  if (ratio <= 0.1) return "en";
  return "mixed";
}

/** Always 'bn' or 'en' (ties and unknowns -> 'en'). */
export function dominantLanguage(text) {
  const [bn, latin] = scriptCounts(text);
  return bn > latin ? "bn" : "en";
}

/** Share of letters at or above which a transcript counts as noise in another language. */
export const FOREIGN_SCRIPT_LIMIT = 0.4;
const DEFAULT_SCRIPTS = ["Bengali", "Latin"];

/** Fraction (0..1) of the letters written in a script outside `allowed`
 *  (Unicode script names). Digits, punctuation and combining marks are ignored. */
export function foreignScriptShare(text, allowed = DEFAULT_SCRIPTS) {
  const res = allowed.filter(Boolean).map((a) => new RegExp(`\\p{Script=${a}}`, "u"));
  let total = 0;
  let foreign = 0;
  for (const ch of text || "") {
    if (!LETTER.test(ch)) continue;
    total++;
    if (!res.some((re) => re.test(ch))) foreign++;
  }
  return total ? foreign / total : 0;
}

/** True when the text is (mostly) in a script the assistant does not speak — speech
 *  models invent Chinese/Russian/... words from room noise. Mirrors the backend guard. */
export function isForeignScript(text, allowed = DEFAULT_SCRIPTS, limit = FOREIGN_SCRIPT_LIMIT) {
  if (!allowed.some(Boolean)) return false;
  return foreignScriptShare(text, allowed) >= limit;
}

// ---- "there was no speech" phrases -----------------------------------------------
// Speech models answer silence/noise with stock phrases ("Thanks for watching", "[silence]",
// or even the assistant's own "Didn't catch that. Please say it again."). Those are never
// something the person said, so they are dropped instead of being sent as a chat message.
// Only assistant-voiced / caption forms are listed: a person's own "I didn't catch that,
// can you say it again?" is a real request and is kept. Mirrors backend core/text.py
// is_noise_phrase; both sides pass the same `noise_phrase` vectors.
const NOISE_WORDS = new Set([
  "silence", "music", "noise", "static", "inaudible", "unintelligible", "applause",
  "laughter", "blank audio", "no audio", "background noise", "no speech",
  "no speech detected", "no speech detected in the audio",
]);
const NOISE_PATTERNS = [
  /^(sorry )?(didn't|did not|couldn't|could not) (quite )?(catch|hear|get|understand) (that|you|it)( (please )?(say|repeat|try)( that| it)?( again)?)?$/u,
  /^(thank you|thanks) for watching( this video)?$/u,
  /^(please )?subscribe( to my channel)?$/u,
  /^subtitles by .{0,40}$/u,
  /^(দুঃখিত )?(আমি )?(ঠিক )?(বুঝতে|শুনতে) (পারিনি|পাইনি)( (দয়া করে )?(আবার|আরেকবার) বলুন)?$/u,
];

/** Lower-case words only: punctuation, brackets and symbols become spaces. */
function plainWords(text) {
  const t = String(text || "").toLowerCase().replace(/[\u2019\u2018]/g, "'");
  return t.replace(/[^\p{L}\p{M}\p{N}']+/gu, " ").trim().replace(/\s+/g, " ");
}

/** True when the whole transcript is a known "there was no speech" phrase. */
export function isNoisePhrase(text) {
  const t = plainWords(text);
  if (!t || t.split(" ").length > 12) return false;
  return NOISE_WORDS.has(t) || NOISE_PATTERNS.some((re) => re.test(t));
}

// ---- markdown -> plain speech text ------------------------------------------
/** Remove markdown/markup so only speakable prose remains. Never touches
 *  Bengali characters (ZWJ/ZWNJ are part of Bengali spelling and are kept). */
export function stripMarkdown(text) {
  if (!text) return "";
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^\s*[-*+•]\s+/gm, "");
  t = t.replace(/^\s*\p{Nd}+[.)]\s+/gmu, "");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*)(.*?)\1/g, "$2");
  // _italic_ only at word edges, so snake_case identifiers are not mangled.
  t = t.replace(/(^|[^A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g, "$1$2");
  t = t.replace(/~~(.*?)~~/g, "$1");
  t = t.replace(/\|/g, " ");
  t = t.replace(/_/g, " ");
  t = t.replace(/[#*`>~]+/g, "");
  t = t.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, "");
  return t.replace(/\s+/g, " ").trim();
}

/** True if there is anything pronounceable (a letter or digit of any script). */
export function hasSpeakable(text) {
  return /[\p{L}\p{N}]/u.test(text || "");
}

// ---- speech normalization (parity with backend text_normalize.py) ----------
const WS = "[ \\t\\n\\r\\f\\v]"; // ASCII whitespace, like Python's re.ASCII \s
const rx = (src, flags) => new RegExp(src.replaceAll("<WS>", WS), flags);

const ABBREV_MAP = [
  [rx("\\be\\.g\\.,?<WS>*", "gi"), "for example, "],
  [rx("\\bi\\.e\\.,?<WS>*", "gi"), "that is, "],
  [/\betc\./gi, "et cetera"],
  [/\bvs\./gi, "versus"],
  [/\bw\/o\b/gi, "without"],
  [/\bw\/\b/gi, "with"],
  [/\bapprox\./gi, "approximately"],
  [rx("\\bno\\.<WS>*(?=[0-9])", "gi"), "number "],
  [/\bDr\./g, "Doctor"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miss"],
  [/\bSt\./g, "Street"],
];

const ACRONYM_WORDS = new Map(
  Object.entries({
    ASAP: "as soon as possible",
    FAQ: "F A Q",
    URL: "U R L",
    API: "A P I",
    SQL: "sequel",
    JSON: "jay-son",
    HTML: "H T M L",
    CSS: "C S S",
    CPU: "C P U",
    GPU: "G P U",
    RAM: "ram",
    AI: "A I",
  }),
);

const SYMBOLS = {
  en: { "&": "and", "%": "percent", "=": "equals", "+": "plus", num: "number", "@": "at" },
  bn: { "&": "এবং", "%": "শতাংশ", "=": "সমান", "+": "প্লাস", num: "নম্বর", "@": "অ্যাট" },
};

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function cardinal(n) {
  if (n === 0) return "zero";
  if (n < 0) return "negative " + cardinal(-n);

  const threeDigit = (num) => {
    const parts = [];
    const hundreds = Math.floor(num / 100);
    const rem = num % 100;
    if (hundreds) parts.push(ONES[hundreds] + " hundred");
    if (rem) {
      if (rem < 20) parts.push(ONES[rem]);
      else {
        const tens = Math.floor(rem / 10);
        const ones = rem % 10;
        parts.push(TENS[tens] + (ones ? `-${ONES[ones]}` : ""));
      }
    }
    return parts.join(" ");
  };

  const groups = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const words = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    let chunk = threeDigit(groups[i]);
    if (SCALES[i]) chunk += " " + SCALES[i];
    words.push(chunk);
  }
  return words.join(" ");
}

const ASCII_DIGIT_RUN_RE = /\b[0-9]{4,}\b/g;
// 3+ identical non-digit, non-space chars. \p{Nd} = digits of ALL scripts, so
// Bengali "৫০০০" is never collapsed.
const REPEATED_CHAR_RE = /([^\p{Nd}\s])\1{2,}/gu;
// ASCII words only: deliberate Bengali repetition ("ধীরে ধীরে ধীরে") is kept.
const REPEATED_WORD_RE = rx("\\b([A-Za-z0-9_]+)(?:<WS>+\\1\\b){2,}", "gi");
const ACRONYM_RE = /\b[A-Z]{2,6}\b/g;

function spellNumber(digits) {
  // Identifiers (phone numbers, IDs): leading zero or very long -> digit by digit.
  if (digits[0] === "0" || digits.length >= 11) return digits.split("").join(" ");
  return cardinal(parseInt(digits, 10));
}

/** Make text read naturally by a TTS voice. `lang` ('bn'|'en') is detected
 *  from the text when omitted. */
export function normalizeForSpeech(text, lang) {
  if (!text) return "";
  const language = lang || dominantLanguage(text);
  let t = text;

  t = t.replace(REPEATED_CHAR_RE, (_, ch) => ch);
  t = t.replace(REPEATED_WORD_RE, (_, w) => w);

  if (language === "en") {
    t = t.replace(ASCII_DIGIT_RUN_RE, (m) => spellNumber(m));
    for (const [re, repl] of ABBREV_MAP) t = t.replace(re, () => repl);
    t = t.replace(ACRONYM_RE, (m) => ACRONYM_WORDS.get(m) ?? m);
  }

  const sym = SYMBOLS[language];
  t = t.replace(/\s*&\s*/g, () => ` ${sym["&"]} `);
  t = t.replace(/\s*%\s*/g, () => ` ${sym["%"]} `);
  t = t.replace(/\s*=\s*/g, () => ` ${sym["="]} `);
  t = t.replace(/\s*\+\s*/g, () => ` ${sym["+"]} `);
  t = t.replace(/#(\p{Nd}+)/gu, (_, d) => `${sym.num} ${d}`);
  t = t.replaceAll("@", ` ${sym["@"]} `);

  return t.replace(/\s+/g, " ").trim();
}

// ---- mapping spoken positions back onto the DISPLAYED sentence ---------------
// Speech text is cleaned/normalized, so its character offsets do not index the
// raw sentence shown on screen. These helpers map proportionally and snap to
// whole words so the highlighter never lands mid-word.

/** [{start, end}] for each whitespace-separated word of `raw`. */
export function rawWordSpans(raw) {
  const spans = [];
  const re = /\S+/gu;
  let m;
  while ((m = re.exec(raw || ""))) spans.push({ start: m.index, end: m.index + m[0].length });
  return spans;
}

/** Word span of `raw` that corresponds to character `idx` of a spoken text
 *  that is `spokenLen` characters long. Returns null if `raw` has no words. */
export function mapSpokenIndexToRaw(idx, spokenLen, raw) {
  const spans = rawWordSpans(raw);
  if (!spans.length) return null;
  const frac = spokenLen > 0 ? Math.min(Math.max(idx / spokenLen, 0), 1) : 0;
  const target = Math.min(Math.floor(frac * raw.length), raw.length - 1);
  return spans.find((s) => s.end > target) || spans[spans.length - 1];
}

/** Re-express backend word marks (offsets into the spoken text) as offsets
 *  into the raw sentence. Timings are untouched. */
export function mapMarksToRaw(marks, spokenLen, raw) {
  if (!Array.isArray(marks) || !marks.length) return [];
  const out = [];
  for (const m of marks) {
    const span = mapSpokenIndexToRaw(m.char_start, spokenLen, raw);
    if (span) out.push({ ...m, char_start: span.start, char_end: span.end });
  }
  return out;
}

// ---- word timing estimated on the DISPLAYED sentence --------------------------
// The streaming voice endpoint sends audio only (no word marks), so karaoke
// timing is estimated straight from the text being shown: each word gets time in
// proportion to its length, punctuation adds a natural pause, and the whole is
// stretched over the clip's duration. Offsets index into `raw` itself, so no
// spoken-vs-displayed mapping is needed.
const PAUSE_WEIGHT = [
  [/[.!?।॥…]+["')\]”’]*$/u, 4],
  [/[,;:—–]+["')\]”’]*$/u, 2],
];

/** [{word, start, end, char_start, char_end}] — seconds relative to the audio start. */
export function estimateWordMarks(raw, duration) {
  const spans = rawWordSpans(raw);
  if (!spans.length || !(duration > 0)) return [];
  const weights = spans.map(({ start, end }) => {
    const word = raw.slice(start, end);
    let w = hasSpeakable(word) ? Array.from(word).length : 0.5; // bare markup ("-", "###") is nearly silent
    for (const [re, extra] of PAUSE_WEIGHT) {
      if (re.test(word)) {
        w += extra;
        break;
      }
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const marks = [];
  let t = 0;
  spans.forEach((s, i) => {
    const span = duration * (weights[i] / total);
    marks.push({
      word: raw.slice(s.start, s.end),
      start: t,
      end: t + span,
      char_start: s.start,
      char_end: s.end,
    });
    t += span;
  });
  return marks;
}
