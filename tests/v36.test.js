import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AVATARS } from "../src/lib/avatars.js";
import { MODES } from "../src/lib/modes.js";
import { SPECIALISTS } from "../src/landing/data/specialists.js";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), "utf8");
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = `${dir}/${f}`;
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test("every avatar video is a 9:16 portrait without an audio track", () => {
  for (const a of Object.values(AVATARS)) {
    for (const url of [a.video.idle, a.video.talk]) {
      const f = here(`../public/${url.replace(/^.*?avatars\//, "avatars/")}`);
      const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", f]).toString();
      assert.match(out, /video,810,1440/, `${a.id}: ${url}`);
      assert.ok(!/audio/.test(out), `${a.id} has audio`);
    }
  }
});

test("the avatar formerly called Non-stop is Aida everywhere the person can see it", () => {
  assert.equal(AVATARS.nonstop.label, "Aida");
  assert.ok(MODES.some(([id, name]) => id === "nonstop" && name === "Aida"));
  assert.equal(SPECIALISTS.find((s) => s.key === "nonstop").name, "Aida");
  for (const f of walk(here("../src"))) {
    if (!/\.(js|jsx)$/.test(f)) continue;
    assert.ok(!/Non-stop|NON-STOP/.test(readFileSync(f, "utf8")), `${f} still says Non-stop`);
  }
});

test("'A.I.D.A' survives only as the footer's big wordmark", () => {
  const m = read("../src/landing/markup.js");
  assert.equal((m.match(/A\.I\.D\.A/g) || []).length, 1);
  assert.match(m, /<div class="ghost" aria-hidden="true">A\.I\.D\.A<\/div>/);
  for (const f of walk(here("../src"))) {
    if (!/\.(js|jsx)$/.test(f) || f.endsWith("markup.js")) continue;
    const t = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    assert.ok(!/A\.I\.D\.A/.test(t.replace(/\\bA\\\.I\\\.D\\\.A[^\n]*/g, "")), `${f} still shows A.I.D.A`);
  }
  for (const f of ["../index.html", "../public/site.webmanifest"]) assert.ok(!/A\.I\.D\.A/.test(read(f)), f);
});

test("brandify and <Aida> set 'Aida' in the brand typeface", () => {
  assert.match(read("../src/theme/brandText.js"), /\\bAida\\b/);
  assert.match(read("../src/theme/Aida.jsx"), /children = "Aida"/);
});

test("/app: no welcome pill; the heading is \"I'm\" + an orange Aida in the brand font", () => {
  const app = read("../src/App.jsx");
  assert.ok(!/Welcome to/.test(app));
  assert.match(app, /I’m <Aida className="text-accent" \/>/);
});

test("landing hero: no 'New' pill; no vertical lines, beams or stars behind it", () => {
  const m = read("../src/landing/markup.js");
  assert.ok(!/Seven specialists, one voice\. Now in English/.test(m));
  assert.ok(!/class="pill"/.test(m));
  assert.ok(!/id="stars"/.test(m));
  const base = read("../src/landing/styles/base.css");
  const hero = base.match(/\.hero-bg\{[^}]*\}/)[0];
  assert.ok(!/linear-gradient\(90deg/.test(hero), "vertical grid lines are gone");
  assert.ok(!/\.star\{|\.beam\{/.test(base));
});

test("every avatar still, face crop and poster exists; Writer's card still is the supplied model", () => {
  for (const s of SPECIALISTS) {
    assert.ok(existsSync(here(`../public/landing/faces/${s.key}.webp`)), s.key);
    assert.ok(existsSync(here(`../public/avatars/stills/${s.key}.webp`)), s.key);
    assert.equal(s.media.face, s.media.poster);
    assert.equal(s.media.idleShape, "tall");
    const [gx, gy] = s.media.geo;
    assert.ok(gx > 0.4 && gx < 0.6 && gy > 0.1 && gy < 0.3, `${s.key} geo`);
  }
});
