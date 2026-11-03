# Aida v3.6 — frontend

1. **New avatar videos.** All 14 clips (idle + talk for the 7 characters) are replaced with the supplied `Videos.zip`
   (re-encoded with `scripts/encode-avatar-clips.sh <mode> <idle> <talk> 810`: 810x1440, 24 fps, H.264, no audio, seamless loop,
   0.2-1.3 MB each). Every clip is now 9:16 with the person centred, so `CLIPS` in `src/lib/avatars.js` is `tall`/focus 50 for all.
   Posters, the "Meet your AI specialists" card stills (`public/avatars/stills`), the round face crops (`public/landing/faces`,
   re-centred by eye on every face) and the landing thumbnails/hero cards all come from the new clips. The old 16:9 landing stills
   (`public/landing/face-*.jpg`) are removed. **Writer**: new clips + the supplied model picture (card still and round crop).
   Landing framing (`src/landing/lib/avatar.js`) now frames 9:16 pictures around the face from `geo` = [face x, head top y].
2. **"A.I.D.A" -> "Aida"** in every visible text of the landing page and the assistant (nav, buttons, headings, FAQ, legal lines,
   aria-labels, page title, meta/OG text, web manifest, Electron window title), still in the brand font (`brandify()` and `<Aida>` now
   set "Aida"). The only "A.I.D.A" left is the footer's big wordmark (unchanged, still in the brand font).
3. **"Non-stop" -> "Aida"** (the general avatar/mode) in the landing, the mode picker, hints, card labels, conversation titles and
   the header. The internal id stays `nonstop` (conversations, memory, API) and the files stay `non-stop-*.mp4`, so nothing stored breaks.
4. **/app**: the "Welcome to Aida" pill is removed; the heading is "I'm" + **Aida** in orange, in the brand font.
5. **Landing hero**: the "New - Seven specialists, one voice. Now in English and বাংলা" pill is removed; in dark mode the
   vertical line grid, light beams and star dots behind the hero are removed (the soft orange glow stays).

Tests: `node --test "tests/*.test.js"` -> 260 passing (new `tests/v36.test.js`). `vite build` OK.
Still needed from you: the licensed `PrestigeEliteM-Bold.woff2` (`public/fonts/`); until then Courier Prime Bold is used.
Note: `public/brand/aida-logo.webp` (the full logo lockup picture) still contains the letters "A.I.D.A" inside the image; it needs a new artwork file to change.
