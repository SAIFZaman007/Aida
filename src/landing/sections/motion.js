import { REDUCED_MOTION } from '../config.js';
import { $$ } from '../lib/dom.js';
/** [selector, extra class, base delay (s), stagger per item (s)] */
const REVEALS = [
    ['.sec-head .eyebrow', '', 0], ['.sec-head h2', 'rv-h', 0.1], ['.sec-head p', '', 0.25],
    ['#specialists .sp-tab', '', 0, 0.06], ['#spstage', 'rv-s', 0.15],
    ['.cross .step', '', 0, 0.1], ['.cross .panel', 'rv-s', 0.1, 0.08], ['.cross .core', 'rv-s', 0],
    ['#languages .split > div:first-child > *', 'rv-l', 0, 0.08], ['#languages .chat', 'rv-r', 0.15],
    ['.mak .split > div:first-child > *', 'rv-l', 0, 0.08], ['.mak-rows', 'rv-r', 0.15],
    ['.faq .qa', '', 0, 0.07],
    ['.cta .cta-orb', 'rv-s', 0], ['.cta h2', 'rv-h', 0.1], ['.cta .wrap > p', '', 0.25], ['.cta .hero-cta', '', 0.35],
    ['footer .fgrid > div', '', 0, 0.08], ['footer .ghost', '', 0.1], ['footer .legal', '', 0.2],
];
/** Scroll reveals (fade/slide/blur in and out), parallax layers and a top progress bar. */
export function motion() {
    if (REDUCED_MOTION)
        return;
    const bar = document.createElement('div');
    bar.id = 'scrollProg';
    document.body.append(bar);
    const els = [];
    REVEALS.forEach(([sel, cls, base, stagger = 0]) => {
        $$(sel).forEach((el, i) => {
            if (el.closest('.flow, .bento'))
                return; // those sections animate themselves
            el.classList.add('rv');
            if (cls)
                el.classList.add(cls);
            el.style.setProperty('--rd', `${(base + stagger * i).toFixed(2)}s`);
            els.push(el);
        });
    });
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting)
            e.target.classList.add('in');
        else if (e.boundingClientRect.top > 0)
            e.target.classList.remove('in'); // replay when scrolling back down
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    const layers = [];
    const add = (sel, fn) => $$(sel).forEach((el, i) => layers.push([el, fn, i]));
    add('#stars', (el, y) => (el.style.translate = `0 ${y * 0.45}px`));
    add('.hero-bg', (el, y) => (el.style.translate = `0 ${y * 0.18}px`));
    add('.ft-bg i', (el, _y, r, i) => (el.style.translate = `0 ${r * (i % 2 ? 0.18 : -0.14)}px`));
    add('.orb-glow', (el, _y, r) => (el.style.translate = `0 ${r * 0.06}px`));
    add('.mak-row', (el, _y, r, i) => (el.style.translate = `${r * (i % 2 ? -0.25 : 0.25)}px 0`));
    add('.cta-orb', (el, _y, r) => (el.style.translate = `0 ${r * -0.12}px`));
    let ticking = false;
    const run = () => {
        ticking = false;
        const y = scrollY;
        const vh = innerHeight;
        const max = document.documentElement.scrollHeight - vh;
        bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
        layers.forEach(([el, fn, i]) => {
            const b = el.getBoundingClientRect();
            if (b.bottom < -200 || b.top > vh + 200)
                return;
            fn(el, y, b.top + b.height / 2 - vh / 2, i);
        });
    };
    addEventListener('scroll', () => { if (!ticking) {
        ticking = true;
        requestAnimationFrame(run);
    } }, { passive: true });
    addEventListener('resize', run);
    run();
}
