import { APP_URL, ASSETS } from '../config.js';
import { FAQ, MARQUEE } from '../data/content.js';
import { $, $$ } from '../lib/dom.js';
import { atomSvg, icon } from '../lib/icons.js';
/** Logos, app links and brand images. */
export function brand() {
    $$('[data-logo]').forEach((el) => { el.innerHTML = `<img src="${ASSETS.mark}" alt="Aida">`; });
    $$('img[data-asset]').forEach((img) => { img.src = img.dataset.asset === 'emblem' ? ASSETS.emblem : ASSETS.mark; });
    $$('a[data-app]').forEach((a) => { a.href = APP_URL; });
    $$('[data-atom]').forEach((el) => { if (!el.firstChild) el.innerHTML = atomSvg(); });
}
export function marquee() {
    const spark = '<svg class="spark" viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z"/></svg>';
    const row = (arr) => { const h = arr.map((t) => `<span>${t}${spark}</span>`).join(''); return h + h + h; };
    $('#mq1').innerHTML = row(MARQUEE.specialists);
    $('#mq2').innerHTML = row(MARQUEE.features);
}
/** Maktech skill tags: duplicated rows for a seamless marquee. */
export function maktech() {
    $$('.mak-row').forEach((r) => {
        r.innerHTML = r.innerHTML.repeat(4);
        Array.from(r.children).forEach((s, i) => { s.querySelector('i').style.animationDelay = `${-(i % 6) * 0.4}s`; });
    });
}
export function faq() {
    const box = $('#faqlist');
    if (!box)
        return;
    box.innerHTML = FAQ.map(([q, a], i) => `
    <div class="qa ${i === 0 ? 'open' : ''}"><button id="q${i}" aria-expanded="${i === 0}">${q}<span class="pm">${icon(i === 0 ? 'minus' : 'plus')}</span></button>
    <div class="ans" ${i === 0 ? '' : 'hidden'}>${a}</div></div>`).join('');
    $$('.qa', box).forEach((qa) => {
        const btn = $('button', qa);
        btn.addEventListener('click', () => {
            const open = !qa.classList.contains('open');
            qa.classList.toggle('open', open);
            $('.ans', qa).hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            $('.pm', qa).innerHTML = icon(open ? 'minus' : 'plus');
        });
    });
}
