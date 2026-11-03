import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MARKUP } from "../src/landing/markup.js";
import { SPECIALISTS, ORDER } from "../src/landing/data/specialists.js";
import { icon, GOLD_DEFS } from "../src/landing/lib/icons.js";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), "utf8");
const srcFiles = (dir) =>
  readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(`${dir}/${e.name}`) : /\.(js|jsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

test("no link on the page points at a #hash, and nothing writes one to the address bar", () => {
  assert.deepEqual(MARKUP.match(/href="#[^"]*"/g) || [], []);
  for (const f of srcFiles("../src/landing")) {
    const code = read(f);
    assert.ok(!/location\.hash|history\.(push|replace)State|\.hash\s*=/.test(code), `${f} touches the URL`);
  }
});

test("every in-page link (data-go) targets a real section, or the top", () => {
  const ids = new Set([...MARKUP.matchAll(/<(?:section|div|header)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]));
  const goes = [...MARKUP.matchAll(/data-go="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(goes.length >= 10);
  for (const g of goes) assert.ok(g === "top" || ids.has(g), `data-go="${g}" has no section`);
  // anything that navigates in the page still has a plain href for no-JS / new tab
  for (const m of MARKUP.matchAll(/<a[^>]*data-go="[^"]+"[^>]*>/g)) assert.match(m[0], /href="\/"/);
});

test("Launch buttons open the assistant at /app; Maktech links open maktechgroup.com", () => {
  for (const m of MARKUP.matchAll(/<a[^>]*data-app[^>]*>/g)) assert.match(m[0], /href="\/app"/);
  assert.match(read("../src/landing/config.js"), /APP_URL = '\/app'/);
  for (const m of MARKUP.matchAll(/<a[^>]*href="https:\/\/maktechgroup\.com\/"[^>]*>/g)) assert.match(m[0], /rel="noopener"/);
});

test("navbar carries the full name; the Maktech badge is gone and the word Maktech is the link", () => {
  const nav = MARKUP.slice(MARKUP.indexOf('<header class="topnav">'), MARKUP.indexOf("</header>"));
  assert.match(nav, /Artificial Intelligence Desktop Assistant/);
  assert.ok(!/mak-badge/.test(MARKUP), "badge removed");
  assert.match(MARKUP, /Engineered by <a class="o mak-link" href="https:\/\/maktechgroup\.com\/"[^>]*>Maktech<\/a>\./);
  assert.match(MARKUP, /Visit maktechgroup\.com/); // the separate button is untouched
});

test("the orb shows the emblem as a bubble (no blob, no text inside the circle)", () => {
  const f = read("../src/landing/sections/problemFlow.js");
  assert.match(f, /orb-bubble/);
  assert.match(f, /data-asset="emblem"/);
  assert.ok(!/orb-blob|orb-label/.test(f));
});

test("icons: flat body + golden line, one shared gold gradient, every name used exists", () => {
  assert.match(GOLD_DEFS, /id="aida-gold"/);
  assert.match(GOLD_DEFS, /gradientUnits="userSpaceOnUse"/); // straight lines have no bounding box
  const used = new Set([...MARKUP.matchAll(/data-i="(\w+)"/g)].map((m) => m[1]));
  for (const f of srcFiles("../src/landing/sections")) {
    for (const m of read(f).matchAll(/icon\('(\w+)'\)/g)) used.add(m[1]);
  }
  for (const s of SPECIALISTS) used.add(s.icon);
  assert.ok(used.size >= 15);
  for (const n of used) {
    const svg = icon(n);
    assert.match(svg, /<g class="[fl]">/, `icon ${n} is missing`);
  }
  assert.match(icon("mic"), /class="f"/); // flat body
  assert.match(icon("mic"), /class="l"/); // fine golden line
});

test("the premium layer exists and the gold hover / lining rules are in it", () => {
  const css = read("../src/landing/styles/premium.css");
  assert.match(css, /--gold-line:/);
  assert.match(css, /\.btn::before[^{]*\{[^}]*conic-gradient/); // gold ring on buttons
  assert.match(css, /\.btn:hover/);
  assert.match(css, /\.topnav::before/); // solid strip above the floating bar
  assert.match(css, /footer\.pf/);
  assert.match(css, /\.fgrid li a:hover/);
  assert.ok(read("../src/landing/styles/index.css").includes("premium.css"));
});

test("landing and assistant styles are isolated: each screen loads its own stylesheet", () => {
  const main = read("../src/main.jsx");
  assert.ok(!/import "\.\/index\.css"/.test(main), "Tailwind must not load on the landing page");
  assert.match(main, /AppScreen\.jsx/);
  assert.match(read("../src/AppScreen.jsx"), /import "\.\/index\.css"/);
  assert.match(read("../src/landing/Landing.jsx"), /import "\.\/styles\/index\.css"/);
  assert.ok(!/tailwind/i.test(read("../src/landing/styles/index.css")));
});

test("landing media: the stills and the clips it plays all exist", () => {
  const pub = (u) => here(`../public/${u.replace(/^\.\//, "")}`);
  assert.equal(SPECIALISTS.length, 7);
  assert.equal(ORDER.length, 7);
  for (const s of SPECIALISTS) {
    for (const k of ["face", "poster", "idle", "talk"]) assert.ok(existsSync(pub(s.media[k])), `${s.key} ${k}: ${s.media[k]}`);
    assert.ok(["wide", "tall"].includes(s.media.idleShape) && ["wide", "tall"].includes(s.media.talkShape), s.key);
    const [gx, gy] = s.media.geo;
    assert.ok(gx > 0 && gx < 1 && gy >= 0 && gy < 0.5, `${s.key} geo`);
  }
  // the page makes no request to the reference design's remote WordPress media
  for (const f of srcFiles("../src/landing")) assert.ok(!/rovexen|wp-content/.test(read(f)), f);
});
