import { APP_URL, REDUCED_MOTION } from '../config.js';
import { byKey, ORDER } from '../data/specialists.js';
import { frame, stillOf } from '../lib/avatar.js';
import { $, $$, isBengali, whenVisible } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
const DURATION = 9000;
let idx = 0;
let timer = 0;
let paused = false;
let msgTimers = [];
let current = 'nonstop';
function setTalking(on) {
    const v = $('#spvid');
    const st = $('#spstate');
    if (!v || !st)
        return;
    const m = byKey(current).media;
    v.dataset.shape = on ? m.talkShape : m.idleShape;
    frame(v, current);
    v.src = on ? m.talk : m.idle;
    v.play().catch(() => { });
    st.textContent = on ? '● TALKING' : '● IDLE';
    st.classList.toggle('talk', on);
}
function scene(k) {
    current = k;
    const s = byKey(k);
    const img = $('#spimg');
    const v = $('#spvid');
    img.classList.add('out');
    v.classList.remove('ready');
    setTimeout(() => {
        const m = s.media;
        img.dataset.shape = m.idleShape;
        img.src = stillOf(m);
        img.alt = `${s.name} avatar`;
        img.dataset.key = k;
        frame(img, k);
        img.classList.remove('out');
        v.dataset.key = k;
        v.dataset.shape = m.idleShape;
        frame(v, k);
        v.src = m.idle;
        v.play().then(() => v.classList.add('ready')).catch(() => { });
        $('#spstate').textContent = '● IDLE';
    }, 220);
}
function schedule() {
    clearTimeout(timer);
    if (paused || REDUCED_MOTION)
        return;
    timer = window.setTimeout(() => show((idx + 1) % ORDER.length), DURATION);
}
function show(i, user = false) {
    idx = i;
    const s = byKey(ORDER[i]);
    const tabs = $('#sptabs');
    $$('.sp-tab', tabs).forEach((b, j) => {
        b.classList.toggle('on', j === i);
        b.setAttribute('aria-selected', String(j === i));
        const p = $('.prog', b);
        p.style.animation = 'none';
        void p.offsetWidth;
        p.style.animation = '';
    });
    const on = tabs.children[i];
    if (user || tabs.scrollWidth > tabs.clientWidth)
        tabs.scrollTo({ left: on.offsetLeft - tabs.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' });
    scene(s.key);
    $('#splabel').innerHTML = `<span class="ic">${icon(s.icon)}</span><div><b>${s.name}</b><small>${s.role}</small></div>`;
    $('#spcopy').innerHTML = `
    <p class="hl">${s.headline}</p>
    <div class="sp-k">What ${s.name} takes care of</div>
    <div class="sp-chips">${s.chips.map((c, j) => `<span style="animation-delay:${0.1 + j * 0.08}s">${c}</span>`).join('')}</div>
    <div class="sp-k">The experience <span class="ex">Example chat</span></div>
    <div class="sp-chat" id="spchat"></div>
    <div class="sp-foot"><span class="tag">${icon('database')}Own memory</span><span class="tag">${icon('globe')}EN · বাংলা</span>
      <a class="btn btn-primary btn-sm" href="${APP_URL}">Talk to ${s.name} ${icon('arrow')}</a></div>`;
    // Play the example chat, switching the avatar to its talking clip while it "speaks".
    msgTimers.forEach(clearTimeout);
    msgTimers = [];
    const chat = $('#spchat');
    const name = s.name.toUpperCase();
    let d = 500;
    s.chat.forEach((m) => {
        if (m.from === 'ai') {
            msgTimers.push(window.setTimeout(() => { chat.insertAdjacentHTML('beforeend', '<div class="sp-typing"><i></i><i></i><i></i></div>'); setTalking(true); }, d));
            msgTimers.push(window.setTimeout(() => setTalking(false), d + 4600));
            d += 900;
        }
        msgTimers.push(window.setTimeout(() => {
            chat.querySelector('.sp-typing')?.remove();
            chat.insertAdjacentHTML('beforeend', `<div class="sp-msg ${m.from}"><small>${m.from === 'ai' ? name : 'You'}</small><span class="${isBengali(m.text) ? 'bn' : ''}">${m.text}</span>${m.tr ? `<span class="tr">${m.tr}</span>` : ''}</div>`);
        }, d));
        d += m.from === 'ai' ? 1700 : 1100;
    });
    schedule();
}
/** Joya-style specialists showcase: tabs + stage with live avatar and example chat. */
export function specialists() {
    const tabs = $('#sptabs');
    if (!tabs)
        return;
    tabs.innerHTML = ORDER.map((k, i) => {
        const s = byKey(k);
        return `<button class="sp-tab" role="tab" data-i="${i}" aria-selected="false">
      <div class="th"><img src="${s.media.face}" data-key="${k}" alt="${s.name} avatar" loading="lazy"></div>
      <div class="tm"><span class="ic">${icon(s.icon)}</span><div><b>${s.name}</b><small>${s.role}</small></div></div>
      <span class="prog"></span></button>`;
    }).join('');
    tabs.style.setProperty('--dur', `${DURATION}ms`);
    $$('.sp-tab', tabs).forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i), true)));
    const stage = $('#spstage');
    [tabs, stage].forEach((el) => {
        el.addEventListener('mouseenter', () => { paused = true; tabs.classList.add('paused'); clearTimeout(timer); });
        el.addEventListener('mouseleave', () => { paused = false; tabs.classList.remove('paused'); schedule(); });
    });
    show(0);
    whenVisible(stage, () => { if (!paused)
        schedule(); }, () => clearTimeout(timer));
}
