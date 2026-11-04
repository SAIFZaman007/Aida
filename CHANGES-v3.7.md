# Aida v3.7 — frontend: the talk video and the voice start at the same moment

**Cause.** The avatar's "speaking" flag (which starts the talk video) was switched on when a sentence's turn began
(`ttsEngine._playItem`), BEFORE its audio had been fetched. The video therefore started as soon as the reply began,
and the voice followed whenever the cloud voice answered (hundreds of milliseconds, sometimes seconds). Two smaller
effects added to it: a short silent lead-in at the start of the synthesized audio, and the audio being scheduled
slightly after the picture.

**Fix (same moment, bounded, no new dependency).**
1. `src/lib/ttsEngine.js` — the avatar is switched on only when the first sound of a reply is ready (cloud voice: right
   before the first sample is scheduled; device voice: in the utterance's `onstart`). It stays on until the reply ends,
   exactly as before, so later sentences of the same reply do not stop/restart the video.
2. `src/lib/avatarSync.js` (new, 45 lines) + `VideoStage.jsx` — a small hand-shake: the engine starts the talk video, the
   sound waits for the video's FIRST FRAME on screen (`requestVideoFrameCallback`; `play()` where unavailable) and is then
   released. The wait is capped at 250 ms (`AVATAR_START_MS`), skipped when no talk video is on screen, the tab is hidden
   or `play()` is refused, and applies only to the START of a reply — a stalled video can never delay or silence the voice.
3. `src/lib/pcmPlayer.js` — `play(clip, { beforeStart })` hook (called once, only when sound starts from silence), and the
   silent lead-in (< -60 dBFS, inaudible) of a reply that starts from silence is skipped (15 ms pre-roll keeps soft
   attacks). Sentences chained onto a previous one keep their natural pause.
4. `src/components/ChatPanel.jsx` — until the first sound is heard the avatar is in the "thinking" state (the voice is queued),
   so it never looks idle while the answer is on its way.

**Measured** (real Chromium, mocked backend, voice answering after 700 ms): v3.6 — talk video starts at 109 ms, first
sound at 880 ms (video ~750 ms early, plus the audio's silent lead-in). v3.7 — video first frame 831 ms, sound scheduled
837 ms; the sound is audible ~136 ms after the first frame (40 ms scheduling margin + 60 ms output delay + ~30 ms device
latency), while the talk layer fades in (25 % visible at ~200 ms) — mouth and voice emerge together. Talk clips move from
their first frame (checked on all seven), so there is no hidden dead time in the clips.

Unchanged: voices, fallbacks, circuit breaker, text reveal, highlighter, barge-in, all visuals and the video files.
Tests: `node --test "tests/*.test.js"` -> 281 passing (new: tests/v37.test.js + 17 tests in tts/pcmplayer). Backend: untouched (383 passing).
Known physical limit: Bluetooth headphones add 100-300 ms of their own audio delay that no web page can read exactly
(`AudioContext.outputLatency` is only an estimate); the picture then leads by that amount.
