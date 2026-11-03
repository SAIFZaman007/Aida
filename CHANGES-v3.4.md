# A.I.D.A v3.4 — orange theme, light/dark, new logo, brand font (frontend)

## What changed
1. **Premium matte orange** (#cc5500 / #ff7f24) replaces purple everywhere: landing, assistant (/app), waveform, avatar backdrop, icons, favicon/PWA manifest. Surfaces moved from navy to a warm charcoal to match the new logo. All colours live in `src/theme/theme.css`.
2. **Light / Dark switch** in the landing navbar and the /app top bar (`src/theme/`). Dark is the default; the choice is remembered (`aida-theme`), applied before first paint (no flash), synced across tabs, and switches with a circular reveal (skipped for reduced-motion).
3. **Launch A.I.D.A button**: the hover blink is gone (the button no longer moves or repaints on hover; only its label follows the cursor). Magnetic pull, matte orange fill and golden lining on hover. The same invisible-halo fix is applied to the other `.btn` buttons.
4. **New logo** (head-in-ring) in navbar, footer, /app, favicons, PWA icons, social image and Electron build icons. **Brand font**: every "A.I.D.A" / "AIDA" on the landing page and in the assistant uses `Prestige Elite M Bold` (`.aida` class / `<Aida/>`).
5. **/app logo = button** to the landing hero (`/`). In the desktop app there is no landing page, so it stays a plain mark.
6. **Problem section**: the "Juggling separate AI tools" caption sits above the cards, clear of the floating UI.
7. **Backend**: every avatar answers in its own specialty and then points software / web / IT-service questions to Maktech (see backend CHANGES).
8. Feature card title: "Talking video avatars" → "Talking avatars".

## Needs your action
- **Prestige Elite M Bold is a licensed font (URW)** and cannot be bundled from here. Put your licensed file at `public/fonts/PrestigeEliteM-Bold.woff2` (see `public/fonts/README.txt`). Until then, **Courier Prime Bold (open licence)** is used, which has the same typewriter look.
- Rebuild the image on Coolify so nginx picks up the new font rule.

## Tests
`node --test "tests/*.test.js"` → 247 pass (12 new in `tests/theme.test.js`). `vite build` OK.
