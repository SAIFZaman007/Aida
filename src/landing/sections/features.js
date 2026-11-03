import { byKey } from '../data/specialists.js';
import { frame } from '../lib/avatar.js';
import { $, $$, whenVisible } from '../lib/dom.js';
/** Feature bento: avatars trio, animated waveform, mouse-follow glow, staggered reveal. */
export function features() {
    const bento = $('.bento');
    if (!bento)
        return;
    // Trio: two idle stills + one talking video (lazy, only plays on screen).
    $$('.trio .ph', bento).forEach((ph) => {
        const k = ph.dataset.face;
        const m = byKey(k).media;
        const el = ph.hasAttribute('data-talk') ? document.createElement('video') : document.createElement('img');
        if (el instanceof HTMLVideoElement) {
            Object.assign(el, { muted: true, loop: true, playsInline: true, preload: 'none', poster: m.face });
            whenVisible(ph, () => { if (!el.src)
                el.src = m.talk; el.play().catch(() => { }); }, () => el.pause());
        }
        else {
            el.src = m.face;
            el.alt = `${byKey(k).name} avatar`;
            el.loading = 'lazy';
        }
        el.dataset.key = k;
        ph.prepend(el);
        frame(el, k);
    });
    // Big waveform
    const wb = $('#wavebig');
    if (wb) {
        let h = '';
        for (let i = 0; i < 72; i++) {
            const you = i > 45;
            const v = 18 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)) * 80;
            h += `<i class="${you ? 'you' : ''}" style="height:${you ? v * 0.8 : v}%;opacity:${you ? 1 : i > 40 ? 0.35 : 1};animation-delay:${-(i % 9) * 0.17}s"></i>`;
        }
        wb.insertAdjacentHTML('afterbegin', h);
    }
    whenVisible(bento, () => bento.classList.add('seen'), undefined, 0.1);
    $$('.tile', bento).forEach((t, i) => {
        t.style.transitionDelay = `${i * 0.07}s, ${i * 0.07}s, 0s, 0s`;
        t.addEventListener('mousemove', (ev) => {
            const r = t.getBoundingClientRect();
            t.style.setProperty('--mx', `${ev.clientX - r.left}px`);
            t.style.setProperty('--my', `${ev.clientY - r.top}px`);
        });
    });
}
