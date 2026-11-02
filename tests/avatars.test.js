import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AVATARS, VIDEO_READY, DEFAULT_PERSONA, avatarForPersona, allAvatars } from "../src/lib/avatars.js";
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

test("Non-stop is the default avatar and has its idle + talk videos", () => {
  assert.equal(DEFAULT_PERSONA, "nonstop");
  assert.ok(VIDEO_READY.includes("nonstop"));
  const v = AVATARS.nonstop.video;
  assert.ok(v, "Non-stop has video");
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

test("every mode now has its idle + talk clips, framed as 16:9 (wide) except Non-stop (9:16, tall)", () => {
  assert.deepEqual([...VIDEO_READY].sort(), MODES.map(([id]) => id).sort());
  for (const a of allAvatars()) {
    assert.ok(a.video, `${a.id} has video`);
    assert.equal(a.video.shape, a.id === "nonstop" ? "tall" : "wide", a.id);
    assert.ok(a.video.focus >= 0 && a.video.focus <= 100, `${a.id} focus`);
    for (const url of [a.video.idle, a.video.talk, a.video.poster]) assert.ok(existsSync(fileOf(url)), url);
  }
});

test("Non-stop: tall idle clip, wide talk clip, each framed on its own; the others use one shape for both", () => {
  const n = AVATARS.nonstop.video;
  assert.equal(n.shape, "tall");
  assert.equal(n.talkShape, "wide");
  for (const a of allAvatars().filter((x) => x.id !== "nonstop")) {
    assert.equal(a.video.talkShape, a.video.shape, a.id);
    assert.equal(a.video.talkFocus, a.video.focus, a.id);
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
