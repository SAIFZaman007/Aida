import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AVATARS, avatarForPersona, allAvatars } from "../src/lib/avatars.js";
import { MODES } from "../src/lib/modes.js";

test("every mode has its own avatar file that exists in public/avatars", () => {
  for (const [id] of MODES) {
    const a = avatarForPersona(id);
    assert.equal(a.persona, id);
    const path = fileURLToPath(new URL(`../public/avatars/${a.file}`, import.meta.url));
    assert.ok(existsSync(path), `${a.file} is missing`);
  }
  assert.equal(new Set(allAvatars().map((a) => a.file)).size, MODES.length);
});

test("the avatar carries the voice gender; writer is the female voice", () => {
  assert.equal(AVATARS.writer.gender, "female");
  for (const id of ["nonstop", "executive", "coder", "architect", "security", "researcher"]) {
    assert.equal(AVATARS[id].gender, "male");
  }
  for (const a of allAvatars()) assert.ok(a.voiceHints.length > 3);
});

test("legacy and unknown personas still get an avatar", () => {
  assert.equal(avatarForPersona("developer").persona, "coder");
  assert.equal(avatarForPersona("ccna_trainer").persona, "researcher");
  assert.equal(avatarForPersona("whatever").persona, "executive");
  assert.equal(avatarForPersona(undefined).persona, "executive");
});

test("urls are relative to the page so they work under nginx and Electron", () => {
  assert.match(AVATARS.coder.url, /^\.\/avatars\/coder\.glb$/);
});
