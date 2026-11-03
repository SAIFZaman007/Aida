/**
 * Flat icons with a golden lining (24x24).
 *   f  the flat body: filled with a soft gold tint and outlined in the gold gradient
 *   l  fine detail drawn as a golden line only
 * The gold gradient (#aida-gold) lives once in the page (see GOLD_DEFS) and is shared by every icon.
 */
const ICONS = {
  mic: { f: '<rect x="9" y="2" width="6" height="12" rx="3"/>', l: '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>' },
  chat: { f: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>' },
  history: { f: '<circle cx="12" cy="12" r="9"/>', l: '<path d="M12 7v5l4 2"/>' },
  infinity: { f: '<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>' },
  chart: {
    f: '<rect x="6" y="12" width="3" height="6" rx="1"/><rect x="11" y="6" width="3" height="12" rx="1"/><rect x="16" y="9" width="3" height="9" rx="1"/>',
    l: '<path d="M3 3v18h18"/>',
  },
  code: { f: '<rect x="2" y="4" width="20" height="16" rx="3"/>', l: '<path d="m10 9-3 3 3 3"/><path d="m14 9 3 3-3 3"/>' },
  layers: { f: '<path d="m12 2 10 5-10 5L2 7Z"/>', l: '<path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>' },
  shield: { f: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>' },
  shieldcheck: { f: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>', l: '<path d="m9 12 2 2 4-4"/>' },
  search: { f: '<circle cx="11" cy="11" r="8"/>', l: '<path d="m21 21-4.3-4.3"/>' },
  pen: { f: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>' },
  globe: { f: '<circle cx="12" cy="12" r="10"/>', l: '<path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>' },
  video: { f: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>' },
  wave: {
    f: '<rect x="2.5" y="9" width="3" height="6" rx="1.5"/><rect x="7" y="5" width="3" height="14" rx="1.5"/><rect x="11.5" y="2" width="3" height="20" rx="1.5"/><rect x="16" y="7" width="3" height="10" rx="1.5"/>',
    l: '<path d="M21.5 10v4"/>',
  },
  cc: { f: '<rect x="3" y="5" width="18" height="14" rx="2"/>', l: '<path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>' },
  database: {
    f: '<path d="M3 5v14a9 3 0 0 0 18 0V5Z"/><ellipse cx="12" cy="5" rx="9" ry="3"/>',
    l: '<path d="M3 12a9 3 0 0 0 18 0"/>',
  },
  folder: { f: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>' },
  monitor: { f: '<rect x="2" y="3" width="20" height="14" rx="2"/>', l: '<path d="M8 21h8M12 17v4"/>' },
  arrow: { l: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' },
  check: { l: '<path d="M20 6 9 17l-5-5"/>' },
  x: { f: '<circle cx="12" cy="12" r="10"/>', l: '<path d="m15 9-6 6M9 9l6 6"/>' },
  plus: { l: '<path d="M12 5v14M5 12h14"/>' },
  minus: { l: '<path d="M5 12h14"/>' },
  users: { f: '<circle cx="9" cy="7" r="4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2Z"/>', l: '<path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
};
const body = (name) => {
  const i = ICONS[name] || {};
  return (i.f ? `<g class="f">${i.f}</g>` : '') + (i.l ? `<g class="l">${i.l}</g>` : '');
};
export const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${body(name)}</svg>`;
/** Fill every <svg data-i="name"> placeholder in the document. */
export function paintIcons(root = document) {
  root.querySelectorAll('svg[data-i]').forEach((s) => {
    const n = s.dataset.i;
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = body(n);
    s.removeAttribute('data-i');
  });
}
/**
 * One shared gold gradient for every icon outline. userSpaceOnUse on purpose: straight lines have
 * an empty bounding box, which would make a bounding-box gradient paint nothing.
 */
export const GOLD_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
  '<linearGradient id="aida-gold" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="22" y2="22">' +
  '<stop offset="0" stop-color="#FBEAB5"/><stop offset=".45" stop-color="#E2B25A"/><stop offset="1" stop-color="#A9761F"/></linearGradient></defs></svg>';
let atomId = 0;
/** Animated atom (orbits + electrons + pulsing nucleus). */
export function atomSvg() {
  const id = `at${atomId++}`;
  const orbits = [0, 60, 120]
    .map((a, i) => `<g transform="rotate(${a})"><ellipse rx="40" ry="14" fill="none" stroke="url(#${id}L)" stroke-width="1.8" opacity=".85"/>` +
      `<circle r="3.4" fill="#fff" class="at-e"><animateMotion dur="${(2.2 + i * 0.6).toFixed(1)}s" repeatCount="indefinite" path="M40,0 A40,14 0 1,1 -40,0 A40,14 0 1,1 40,0"/></circle></g>`)
    .join('');
  return `<svg viewBox="-50 -50 100 100" class="atom-svg" aria-hidden="true"><defs>` +
    `<radialGradient id="${id}N"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#F7E3A6"/><stop offset="1" stop-color="#B98A34"/></radialGradient>` +
    `<linearGradient id="${id}L" x1="0" x2="1"><stop offset="0" stop-color="#F7E3A6"/><stop offset="1" stop-color="#B3A8FF"/></linearGradient></defs>` +
    `<g class="at-spin">${orbits}</g><circle r="9" fill="url(#${id}N)" class="at-n"/></svg>`;
}
