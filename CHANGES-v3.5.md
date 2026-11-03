# A.I.D.A v3.5 — frontend

1. **Navbar**: as wide as the page container (1200px, aligned with the section edges) and blurrier (blur 22 → 38px, stronger saturation, a little more tint once scrolled). Subtitle tracking tightened so the brand never touches the links.
2. **Footer wordmark** "A.I.D.A" is measured to span its container exactly (`src/landing/lib/fit.js`): it re-fits when the container resizes and when the brand font finishes loading, so it also fits whichever font file is installed. The reveal no longer animates letter-spacing (that pushed it outside the container).
   **Footer "Launch A.I.D.A" link**: a generic footer rule (`.fgrid li span{display:inline-flex}`) was turning the brand wrapper into a flex box and removing the space ("LaunchA.I.D.A"). The rule now targets direct spans only, and the wrapper (`.aida-w`) is protected from generic span rules. Checked automatically: no brand name on the page has a lost space (desktop and 390px).
3. **Round avatars** (Problem orb, "Specialists online", How it works, chat header): each avatar now has its own square 192px head-and-shoulders crop, centred on the face, 4x the largest circle, so they stay sharp on retina (`public/landing/faces/`). The old method cut a hand-estimated region out of a 16:9 frame, which was off-centre and soft. Architect's crop uses a frame with open eyes.
4. **Favicon**: transparent background, tightly cropped, slightly more vivid with a thin dark rim so it reads on dark and light tab bars. 16/32/48 px PNG + multi-size ICO; the links carry `?v=35` so browsers fetch the new one.
5. **Writer image**: the wide still (`face-writer.jpg`) and the round crop are rebuilt from `Writer_model.jpeg`; the card image in /app was already this model. **The Writer's idle/talk videos and their first-frame poster still show the previous woman**: they must be re-rendered from the new image (see public/avatars/README.txt, `scripts/encode-avatar-clips.sh writer idle.mp4 talk.mp4`).
6. Light theme: footer subtitle contrast.

Tests: `node --test "tests/*.test.js"` → 253 pass (6 new in tests/v35.test.js). `vite build` OK.
