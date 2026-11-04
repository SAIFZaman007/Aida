import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("the engine switches the avatar on with the SOUND, never at the start of a sentence's turn", () => {
  const src = read("../src/lib/ttsEngine.js");
  const playItem = src.slice(src.indexOf("async _playItem("), src.indexOf("// ---- cloud voice"));
  assert.ok(!/_setSpeaking\(true\)/.test(playItem), "_playItem must not flag speaking before audio exists");
  assert.match(src, /beforeStart: \(\) => this\._startAvatar\(\)/);
  assert.match(src, /u\.onstart = \(\) => \{[^}]*_setSpeaking\(true\)/s, "device voice: on its onstart");
  assert.match(src, /avatarSync\.whenMoving\(this\._timeouts\.avatarStart\)/);
  assert.match(src, /AVATAR_START_MS = 250/);
});

test("VideoStage reports the talk video's first frame to the voice engine and registers itself", () => {
  const src = read("../src/components/VideoStage.jsx");
  assert.match(src, /avatarSync\.videoMoving\(\)/);
  assert.match(src, /requestVideoFrameCallback/);
  assert.match(src, /avatarSync\.attach\(hasVideo\)/);
  assert.match(src, /el\.play\(\)\.then\(show, refused\)/, "a refused play() never makes the voice wait");
});

test("until the first sound is heard the avatar is 'thinking' (the voice is queued, not yet speaking)", () => {
  const src = read("../src/components/ChatPanel.jsx");
  assert.match(src, /setVoiceQueued\(isBusy\)/);
  assert.match(src, /\(busy \|\| voiceQueued\) && !speaking/);
});

test("the player exposes the hook the engine uses, and skips a silent lead-in only when starting from silence", () => {
  const src = read("../src/lib/pcmPlayer.js");
  assert.match(src, /async play\(clip, \{ onStart, beforeStart \}/);
  assert.match(src, /fromSilence/);
  assert.match(src, /SILENCE_LEVEL = 0\.001/);
});
