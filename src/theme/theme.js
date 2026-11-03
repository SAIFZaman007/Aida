/*
  Light / dark theme controller, shared by the landing page and the assistant.

  - The choice lives on <html data-theme="dark|light"> and in localStorage ("aida-theme").
  - index.html applies the saved choice before the first paint, so there is no flash.
  - Dark is the default (the brand is dark-first); the system setting is not used.
  - Switching uses the View Transitions API when available: a circular reveal growing from the
    toggle. Without it (or with "reduce motion") the change is instant.
*/
const KEY = "aida-theme";
const root = typeof document !== "undefined" ? document.documentElement : null;
const META_COLOR = { dark: "#0b0907", light: "#f7f1e9" };

export const getTheme = () => (root && root.getAttribute("data-theme") === "light" ? "light" : "dark");

function paint(theme) {
  root.setAttribute("data-theme", theme);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", META_COLOR[theme]);
  const c = document.querySelector('meta[name="color-scheme"]');
  if (c) c.setAttribute("content", theme);
  window.dispatchEvent(new CustomEvent("aida:theme", { detail: theme }));
}

/** Applies a theme (and remembers it). `from` = the element the reveal grows from. */
export function setTheme(theme, from) {
  if (!root) return;
  const next = theme === "light" ? "light" : "dark";
  if (next === getTheme()) return;
  try { localStorage.setItem(KEY, next); } catch { /* private mode: the choice just isn't remembered */ }
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduce) return paint(next);
  const r = from?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : innerWidth - 80;
  const y = r ? r.top + r.height / 2 : 40;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(() => paint(next));
  t.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.22,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
}

export const toggleTheme = (from) => setTheme(getTheme() === "light" ? "dark" : "light", from);

/** Calls fn(theme) on every change, including changes made in another tab. Returns an unsubscribe. */
export function onTheme(fn) {
  const a = (e) => fn(e.detail);
  const b = (e) => { if (e.key === KEY && (e.newValue === "light" || e.newValue === "dark")) paint(e.newValue); };
  window.addEventListener("aida:theme", a);
  window.addEventListener("storage", b);
  return () => { window.removeEventListener("aida:theme", a); window.removeEventListener("storage", b); };
}

/** The toggle's markup (one source for the landing's string markup and the React component). */
export const TOGGLE_HTML =
  '<span class="tt-track" aria-hidden="true">' +
  '<span class="tt-stars"><i></i><i></i><i></i><i></i><i></i></span>' +
  '<span class="tt-glow"></span>' +
  '<svg class="tt-ico tt-ico-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>' +
  '<svg class="tt-ico tt-ico-moon" viewBox="0 0 24 24"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z"/></svg>' +
  '<span class="tt-knob"><span class="tt-orbit"></span><span class="tt-core">' +
  '<svg class="tt-k tt-k-moon" viewBox="0 0 24 24"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z"/></svg>' +
  '<svg class="tt-k tt-k-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>' +
  "</span></span></span>";

/** Keeps a toggle button's accessible state in step with the theme. */
export function syncToggle(btn, theme = getTheme()) {
  const light = theme === "light";
  btn.setAttribute("aria-checked", String(light));
  btn.setAttribute("aria-label", light ? "Light mode on. Switch to dark mode" : "Dark mode on. Switch to light mode");
  btn.title = light ? "Switch to dark mode" : "Switch to light mode";
}
