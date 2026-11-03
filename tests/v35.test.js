import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPECIALISTS, ORDER } from "../src/landing/data/specialists.js";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), "utf8");
const pngInfo = (f) => {
  const b = readFileSync(here(f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
};

test("navbar: as wide as the page container (1200px), and blurrier than before", () => {
  const nav = read("../src/landing/styles/nav.css");
  assert.match(nav, /\.topnav \.bar\{[^}]*max-width:1200px/);
  assert.equal(read("../src/landing/styles/base.css").match(/\.wrap\{max-width:(\d+)px/)[1], "1200");
  const blur = Number(nav.match(/backdrop-filter:blur\((\d+)px\)/)[1]);
  assert.ok(blur >= 32, `blur is ${blur}px`);
});

test("footer wordmark is measured to span its container, not sized by viewport width", () => {
  const fit = read("../src/landing/lib/fit.js");
  assert.match(fit, /getBoundingClientRect/);
  assert.match(fit, /paddingLeft/);
  assert.match(fit, /fonts\.ready/);
  assert.match(fit, /ResizeObserver/);
  assert.match(read("../src/landing/boot.js"), /fitWordmark\(\)/);
  // the reveal no longer animates letter-spacing (that pushed it past the container)
  assert.ok(!/footer \.ghost\.rv\{[^}]*letter-spacing/.test(read("../src/landing/styles/motion.css")));
});

test("footer 'Launch A.I.D.A' keeps its space: the brand wrapper is immune to generic span rules", () => {
  assert.match(read("../src/theme/brand.css"), /\.aida-w\s*\{\s*display:\s*inline\s*!important/);
  assert.match(read("../src/theme/brandText.js"), /className = "aida-w"/);
  const css = read("../src/landing/styles/premium.css");
  assert.ok(!/\.fgrid li span\b/.test(css), "footer list rule must only target direct spans");
});

test("round avatars use a dedicated, centred square crop per specialist", () => {
  assert.equal(ORDER.length, 7);
  for (const s of SPECIALISTS) {
    assert.match(s.media.crop, /landing\/faces\/[a-z]+\.webp$/);
    assert.ok(existsSync(here(`../public/landing/faces/${s.key}.webp`)), `${s.key} crop missing`);
  }
  const av = read("../src/landing/lib/avatar.js");
  assert.match(av, /backgroundSize = 'cover'/);
  assert.match(av, /backgroundPosition = '50% 50%'/);
});

test("Writer: the card still and the round crop are the new model (white studio picture)", () => {
  assert.ok(existsSync(here("../public/avatars/stills/writer.webp")));
  assert.ok(existsSync(here("../public/landing/faces/writer.webp")));
});

test("favicons are transparent PNGs/ICO in 16, 32 and 48 px, and the page links them", () => {
  for (const n of [16, 32, 48]) {
    const i = pngInfo(`../public/favicon-${n}x${n}.png`);
    assert.equal(i.w, n); assert.equal(i.h, n);
    assert.equal(i.colorType, 6, `favicon-${n} must be RGBA`);
  }
  assert.ok(existsSync(here("../public/favicon.ico")));
  const html = read("../index.html");
  assert.match(html, /favicon-48x48\.png\?v=35/);
  assert.match(html, /favicon\.ico\?v=35/);
});
