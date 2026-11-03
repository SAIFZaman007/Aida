import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AVATARS, VIDEO_READY, DEFAULT_PERSONA, avatarForPersona, allAvatars, figureX } from "../src/lib/avatars.js";
import { MODES } from "../src/lib/modes.js";

const pub = (rel) => fileURLToPath(new URL(`../public/${rel}`, import.meta.url));
// "./avatars/x" (page-relative url) -> public/avatars/x
const fileOf = (url) => pub(url.replace(/^\.\//, ""));

test("every mode has its own avatar with a still image that exists", () => {
  for (const [id] of MODES) {
    const a = avatarForPersona(id);
    assert.equal(a.persona, id);
    assert.ok(existsSync(fileOf(a.still)), `${a.still} is missing`);
  }
  assert.equal(new Set(allAvatars().map((a) => a.still)).size, MODES.length);
});

test("the voice gender matches the person on screen", () => {
  for (const id of ["nonstop", "executive", "researcher", "writer"]) assert.equal(AVATARS[id].gender, "female", id);
  for (const id of ["coder", "architect", "security"]) assert.equal(AVATARS[id].gender, "male", id);
  for (const a of allAvatars()) assert.ok(a.voiceHints.length > 3);
});

test("Aida (id nonstop) is the default avatar and has its idle + talk videos", () => {
  assert.equal(DEFAULT_PERSONA, "nonstop");
  assert.ok(VIDEO_READY.includes("nonstop"));
  const v = AVATARS.nonstop.video;
  assert.ok(v, "Aida has video");
  for (const url of [v.idle, v.talk, v.poster]) assert.ok(existsSync(fileOf(url)), `${url} is missing`);
  assert.notEqual(v.idle, v.talk);
});

test("a mode is marked video-ready only when its files exist; the others keep the still", () => {
  for (const a of allAvatars()) {
    if (VIDEO_READY.includes(a.id)) {
      for (const url of [a.video.idle, a.video.talk, a.video.poster]) assert.ok(existsSync(fileOf(url)), url);
    } else {
      assert.equal(a.video, null, `${a.id} has no video yet`);
    }
  }
});

test("every mode now has its idle + talk clips, all 9:16 portraits (tall, person centred)", () => {
  assert.deepEqual([...VIDEO_READY].sort(), MODES.map(([id]) => id).sort());
  for (const a of allAvatars()) {
    assert.ok(a.video, `${a.id} has video`);
    assert.equal(a.video.shape, "tall", a.id);
    assert.ok(a.video.focus >= 0 && a.video.focus <= 100, `${a.id} focus`);
    for (const url of [a.video.idle, a.video.talk, a.video.poster]) assert.ok(existsSync(fileOf(url)), url);
  }
});

test("every avatar's idle and talk clips share one 9:16 framing, centred", () => {
  for (const a of allAvatars()) {
    assert.equal(a.video.talkShape, "tall", a.id);
    assert.equal(a.video.talkFocus, a.video.focus, a.id);
    assert.equal(a.video.focus, 50, a.id);
  }
});

test("clips follow the <mode>-idle / -talk / -poster naming the encode script writes", () => {
  for (const a of allAvatars()) {
    const name = a.id === "nonstop" ? "non-stop" : a.id;
    assert.match(a.video.idle, new RegExp(`/${name}-idle\\.mp4$`));
    assert.match(a.video.talk, new RegExp(`/${name}-talk\\.mp4$`));
    assert.match(a.video.poster, new RegExp(`/${name}-poster\\.jpg$`));
  }
});

test("legacy and unknown personas still get an avatar", () => {
  assert.equal(avatarForPersona("developer").persona, "coder");
  assert.equal(avatarForPersona("ccna_trainer").persona, "researcher");
  assert.equal(avatarForPersona("whatever").persona, "nonstop");
  assert.equal(avatarForPersona(undefined).persona, "nonstop");
});

test("urls are relative to the page so they work under nginx and Electron", () => {
  assert.match(AVATARS.coder.still, /^\.\/avatars\/stills\/coder\.webp$/);
  assert.match(AVATARS.nonstop.video.idle, /^\.\/avatars\/video\/non-stop-idle\.mp4$/);
});

// ── One 9:16 frame for every avatar ───────────────────────────────────────────────
test("figureX centres the person: a 9:16 frame cropped from a 16:9 picture", () => {
  // The 16:9 picture scaled to the frame's height is 256/81 frames wide. With the CSS
  // object-position p, the point at fraction f of the picture lands at frame x = (C-I)p + f*I
  // (C = frame width, I = picture width); it must be the frame's middle for every avatar.
  const I = 256 / 81; // in frame widths
  for (const a of allAvatars()) {
    for (const [shape, focus] of [[a.video.shape, a.video.focus], [a.video.talkShape, a.video.talkFocus]]) {
      if (shape !== "wide") continue;
      const p = figureX(focus, shape) / 100;
      const where = (1 - I) * p + (focus / 100) * I;
      assert.ok(Math.abs(where - 0.5) < 0.005, `${a.id}: person at ${where} of the frame, expected 0.5`);
    }
  }
});

test("figureX: a 9:16 clip needs no cropping; bad input stays inside 0-100", () => {
  assert.equal(figureX(30, "tall"), 50);
  assert.equal(figureX(undefined, "tall"), 50);
  assert.equal(figureX(50, "wide"), 50);
  assert.equal(figureX(0, "wide"), 0);
  assert.equal(figureX(100, "wide"), 100);
  assert.equal(figureX(NaN, "wide"), 50);
  assert.equal(figureX(undefined), 50);
});

test("the stage shows EVERY clip, idle and talk, in the one centred 9:16 frame", () => {
  const stage = readFileSync(fileURLToPath(new URL("../src/components/VideoStage.jsx", import.meta.url)), "utf8");
  const css = readFileSync(fileURLToPath(new URL("../src/index.css", import.meta.url)), "utf8");
  assert.ok(!/stage-wide/.test(stage + css), "no full-bleed 16:9 mode any more");
  assert.equal((stage.match(/className="stage-figure"/g) || []).length, 1, "one frame holds both clips");
  assert.match(css, /\.stage-figure \{[^}]*aspect-ratio: 9 \/ 16;/);
  assert.match(css, /\.stage-figure \{[^}]*left: 50%;[^}]*height: 100%;/);
  // 9:16 at a 954 px tall window is 536 px wide (the 534 x 954 frame asked for)
  assert.ok(Math.abs(954 * 9 / 16 - 534) <= 3);
  // the blurred picture behind it is always the avatar's own poster
  assert.match(stage, /src=\{video\.poster\}/);
});
