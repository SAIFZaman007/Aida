/**
 * Sizes the big footer wordmark so it spans its container exactly: never wider (it used to spill
 * past the page column) and never a gap short of it. The brand typeface is a wide typewriter face
 * whose width depends on which file loaded (Prestige Elite M, or the free fallback), so the size is
 * measured, not guessed: it is recomputed when the container resizes and when fonts finish loading.
 */
const MAX_PX = 300;
const FINAL_SPACING = '.06em'; // the wordmark's letter-spacing (base.css)

function fit(el) {
  const box = el.parentElement;
  const cs = box ? getComputedStyle(box) : null;
  const target = box ? box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0;
  if (!target) return;
  const keep = { ls: el.style.letterSpacing, tr: el.style.transition, fs: el.style.fontSize };
  el.style.transition = 'none';
  el.style.letterSpacing = FINAL_SPACING;
  el.style.fontSize = '100px';
  const text = el.querySelector('.aida') || el;
  const w100 = text.getBoundingClientRect().width;
  // the last letter carries a trailing space of its own: it is not part of the visible word
  const trailing = 0.06 * 100;
  const visible = w100 - trailing;
  const size = visible > 0 ? Math.min(MAX_PX, (target / visible) * 100) : 100;
  el.style.fontSize = `${Math.floor(size * 10) / 10}px`;
  el.style.letterSpacing = keep.ls;
  el.style.transition = keep.tr;
  void el.offsetWidth; // commit before the transition is restored
  if (!keep.fs) el.dataset.fit = '1';
}

export function fitWordmark() {
  const el = document.querySelector('footer .ghost');
  if (!el) return;
  const run = () => fit(el);
  run();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  if (document.fonts) document.fonts.addEventListener?.('loadingdone', run);
  if ('ResizeObserver' in window) {
    let last = 0;
    new ResizeObserver(() => { const w = el.parentElement.clientWidth; if (w !== last) { last = w; run(); } }).observe(el.parentElement);
  }
  else addEventListener('resize', run);
}
