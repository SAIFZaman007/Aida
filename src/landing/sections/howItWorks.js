import { HISTORY, TYPE_PHRASES } from '../data/content.js';
import { byKey, ORDER } from '../data/specialists.js';
import { paintFace } from '../lib/avatar.js';
import { $, $$, whenVisible } from '../lib/dom.js';
/** Four-step cross: each panel animates in turn while its step lights up. */
export function howItWorks() {
    const cross = $('#cross');
    if (!cross)
        return;
    const faces = $('#pzFaces');
    ORDER.forEach((k) => { const s = document.createElement('span'); faces.appendChild(s); paintFace(s, k); });
    faces.children[0].classList.add('on');
    const wave = $('[data-wave]', cross);
    wave.innerHTML = Array.from({ length: Number(wave.dataset.wave) }, (_, i) => `<i style="animation-delay:-${(i * 0.11).toFixed(2)}s"></i>`).join('');
    const rows = $('#pzRows');
    let hi = 0;
    const addRow = () => {
        const [k, label, ago] = HISTORY[hi++ % HISTORY.length];
        const r = document.createElement('div');
        r.className = 'pz-row';
        const f = document.createElement('span');
        f.className = 'f';
        paintFace(f, k);
        r.append(f);
        r.insertAdjacentHTML('beforeend', `<span>${byKey(k).name} · ${label}</span><em>${ago}</em>`);
        rows.prepend(r);
        while (rows.children.length > 3)
            rows.lastElementChild.remove();
    };
    addRow();
    addRow();
    addRow();
    let ti = 0;
    let typeTimer = 0;
    const type = () => {
        const el = $('#pzType');
        const p = TYPE_PHRASES[ti++ % TYPE_PHRASES.length];
        let n = 0;
        clearInterval(typeTimer);
        el.textContent = '';
        typeTimer = window.setInterval(() => { el.textContent = p.slice(0, ++n); if (n >= p.length)
            clearInterval(typeTimer); }, 55);
    };
    type();
    const steps = $$('.step', cross);
    const panels = new Map($$('.panel', cross).map((p) => [Number(p.dataset.s), p]));
    const langs = $$('.pz-lang span', cross);
    let si = 0;
    let fi = 0;
    const tick = () => {
        steps.forEach((s, i) => s.classList.toggle('on', i === si));
        panels.forEach((p, k) => p.classList.toggle('on', k === si));
        if (si === 0) {
            fi = (fi + 1) % ORDER.length;
            Array.from(faces.children).forEach((s, i) => s.classList.toggle('on', i === fi));
            $('#pzPick').textContent = `${byKey(ORDER[fi]).name} selected`;
        }
        if (si === 1)
            type();
        if (si === 2)
            langs.forEach((l) => l.classList.toggle('on'));
        if (si === 3)
            addRow();
        si = (si + 1) % 4;
    };
    let cycle = 0;
    whenVisible(cross, () => { clearInterval(cycle); tick(); cycle = window.setInterval(tick, 2400); }, () => clearInterval(cycle));
}
