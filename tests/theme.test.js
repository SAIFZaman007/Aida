import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MARKUP } from "../src/landing/markup.js";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(here(rel), "utf8");
const walk = (dir, re) =>
  readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`, re) : re.test(e.name) ? [`${dir}/${e.name}`] : [],
  );

test("the brand palette is orange: #cc5500 and #ff7f24", () => {
  const css = read("../src/theme/theme.css");
  assert.match(css, /--accent:\s*#ff7f24/i);
  assert.match(css, /--accent-deep:\s*#cc5500/i);
});

test("no violet / purple is left in the UI source", () => {
  const bad = /violet|purple|#8b7cff|#8b7bff|#b3a8ff|#8d84ff|#4a4fc4|#2f3190|139,\s?123,\s?255/i;
  for (const f of [...walk("../src", /\.(css|js|jsx)$/), "../index.html", "../public/site.webmanifest"]) {
    const code = read(f);
    // two comments in premium.css only record that a state "was violet"
    const body = code.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!bad.test(body), `${f} still has a purple colour`);
  }
});

test("both themes exist, dark is the default, and the choice is applied before first paint", () => {
  const css = read("../src/theme/theme.css");
  assert.match(css, /:root\[data-theme='light'\]/);
  const html = read("../index.html");
  assert.match(html, /aida-theme/);
  assert.match(html, /data-theme/);
  const js = read("../src/theme/theme.js");
  assert.match(js, /aida-theme/);
  assert.match(js, /prefers-reduced-motion/);
});

test("the navbar has the theme switch (a real switch with a label) and the Launch button", () => {
  assert.match(MARKUP, /class="tt"[^>]*role="switch"[^>]*aria-label="Switch theme"/);
  assert.match(MARKUP, /class="tc"[^>]*href="\/app"/);
  assert.match(MARKUP, /class="tc-in"/);
});

test("the Launch button never moves, only its label does, so hover cannot flicker", () => {
  const css = read("../src/landing/styles/premium.css");
  const block = css.slice(css.indexOf(".topnav .tc{"));
  assert.ok(!/\.topnav \.tc:hover\{[^}]*transform/.test(block), "the button itself must not translate on hover");
  assert.match(css, /\.topnav \.tc::after/);
  assert.match(css, /\.tc-in\{[^}]*translate3d\(var\(--mx/);
  const nav = read("../src/landing/sections/nav.js");
  assert.match(nav, /pointermove/);
  assert.match(nav, /REDUCED_MOTION/);
});

test("the new logo files exist at every size the app uses", () => {
  for (const f of [
    "brand/aida-logo.webp", "brand/mark-96.png", "brand/mark-192.png", "icon-512.png", "icon-192.png",
    "icon-maskable-512.png", "apple-touch-icon.png", "favicon.ico", "og-image.png", "fonts/CourierPrime-Bold.woff2",
  ]) assert.ok(existsSync(here(`../public/${f}`)), `public/${f} is missing`);
});

test("the brand name is set in the brand typeface: Prestige Elite M first, a free fallback behind it", () => {
  const css = read("../src/theme/brand.css");
  assert.match(css, /'Prestige Elite M'/);
  assert.match(css, /PrestigeEliteM-Bold\.woff2/);
  assert.match(css, /'Courier Prime'/);
  assert.match(css, /\.aida\s*\{/);
  const boot = read("../src/landing/boot.js");
  assert.match(boot, /brandify\(/);
  const app = read("../src/App.jsx");
  assert.match(app, /<Aida/);
  assert.ok(!/>\s*A\.I\.D\.A\s*</.test(app), "App.jsx writes A.I.D.A as plain text somewhere");
});

test("brandify keeps a flex parent's layout (one wrapper per text node)", () => {
  const js = read("../src/theme/brandText.js");
  assert.match(js, /flex\|grid/);
});

test("/app: the logo is a link back to the landing page; the desktop app keeps it a plain mark", () => {
  const link = read("../src/components/BrandLink.jsx");
  assert.match(link, /href="\/"/);
  assert.match(link, /aria-label=/);
  assert.match(link, /if \(desktop\)/);
  assert.match(read("../src/App.jsx"), /<BrandLink desktop=\{desktop\}>/);
  assert.match(read("../src/App.jsx"), /<ThemeToggle \/>/);
});

test("the Problem caption sits above the tool cards and not under the floating UI", () => {
  const css = read("../src/landing/styles/flow.css");
  assert.match(css, /\.fl-cap\{[^}]*top:-44px[^}]*z-index:6/);
});

test("the feature card reads 'Talking avatars'", () => {
  assert.match(MARKUP, /<h3>Talking avatars<\/h3>/);
  assert.ok(!/Talking video avatars/.test(MARKUP));
});

test("nginx serves fonts as clean 404s, never index.html", () => {
  assert.match(read("../nginx.conf"), /woff2\?\)\$\s*\{[^}]*try_files \$uri =404/);
});
