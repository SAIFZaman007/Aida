import { useEffect } from "react";
import "./styles/index.css";
import { GOLD_DEFS } from "./lib/icons.js";
import { MARKUP } from "./markup.js";
import { boot } from "./boot.js";

/*
  The landing page (served at "/"; the assistant itself is at "/app").

  Design: the reference landing (Demo_landing), ported 1:1 — its markup lives in markup.js and
  boot.js animates it. It is deliberately NOT Tailwind: this chunk loads only ./styles (the
  assistant's own stylesheet belongs to the /app chunk), so neither screen can restyle the other.
  Navigation inside the page never writes a "#section" into the address bar (see sections/nav.js).
*/

// The landing page's typefaces. Requested here, not in index.html, so /app does not download them.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Manrope:wght@400;500;600;700" +
  "&family=JetBrains+Mono:wght@400;500&family=Hind+Siliguri:wght@400;500;600&display=swap";
if (typeof document !== "undefined" && !document.querySelector('link[data-landing-fonts]')) {
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = FONTS;
  l.setAttribute("data-landing-fonts", "");
  document.head.appendChild(l);
}

const HTML = { __html: GOLD_DEFS + MARKUP };

export default function Landing() {
  useEffect(() => { boot(); }, []);
  return <div id="landing" dangerouslySetInnerHTML={HTML} />;
}
