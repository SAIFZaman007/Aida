import { REDUCED_MOTION } from '../config.js';
import { $$ } from '../lib/dom.js';
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
export function nav() {
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
