import { REDUCED_MOTION } from '../config.js';
import { $, $$ } from '../lib/dom.js';
import { onTheme, syncToggle, toggleTheme } from '../../theme/theme.js';
/**
 * Scrolls to a section WITHOUT touching the address bar: no "#problem", no history entry.
 * Anything marked data-go="<section id>" (or "top") navigates this way; its href is just "/"
 * so it still works without JavaScript.
 */
export function goTo(id) {
    const behavior = REDUCED_MOTION ? 'auto' : 'smooth';
    if (id === 'top') return scrollTo({ top: 0, behavior });
    document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
}
/** Sticky glass nav: darkens on scroll, highlights the current section, and keeps the URL clean. */
/**
 * Light / dark switch in the navbar. The look follows <html data-theme> (CSS); this only flips the
 * theme on click and keeps the button's accessible state in step.
 */
function themeToggle() {
    const b = $('[data-theme-toggle]');
    if (!b) return;
    syncToggle(b);
    b.addEventListener('click', () => toggleTheme(b));
    onTheme((t) => syncToggle(b, t));
}
/**
 * Magnetic "Launch" button. The button itself never moves: only its label layer is pulled toward
 * the cursor, so the hover area stays put (a moving hit area is what made the old button blink).
 * The pull starts a little outside the button (its ::before reaches 14px past the edge).
 */
function magnetic(a) {
    if (!a || REDUCED_MOTION || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const inner = $('.tc-in', a);
    if (!inner) return;
    const PULL = 0.32;
    const MAX = 9;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    const apply = () => { raf = 0; a.style.setProperty('--mx', tx.toFixed(2) + 'px'); a.style.setProperty('--my', ty.toFixed(2) + 'px'); };
    const set = (x, y) => { tx = x; ty = y; if (!raf) raf = requestAnimationFrame(apply); };
    a.addEventListener('pointermove', (e) => {
        const r = a.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        set(Math.max(-MAX, Math.min(MAX, dx * PULL)), Math.max(-MAX, Math.min(MAX, dy * PULL * 1.3)));
    });
    a.addEventListener('pointerleave', () => { a.classList.remove('mag'); set(0, 0); });
    a.addEventListener('pointerenter', () => a.classList.add('mag'));
}
export function nav() {
    themeToggle();
    magnetic($('.topnav .tc'));
    $$('a[data-go]').forEach((a) => {
        a.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // keep "open in new tab"
            e.preventDefault();
            goTo(a.dataset.go);
            a.blur();
        });
    });
    const n = document.querySelector('.topnav');
    if (!n) return;
    const links = $$('.tl a', n);
    const update = () => {
        n.classList.toggle('scrolled', scrollY > 20);
        let current = null;
        links.forEach((a) => {
            const s = document.getElementById(a.dataset.go);
            if (s && s.getBoundingClientRect().top < 160) current = a;
        });
        links.forEach((a) => a.classList.toggle('on', a === current));
    };
    addEventListener('scroll', update, { passive: true });
    update();
}
