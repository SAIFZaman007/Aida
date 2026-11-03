import { REDUCED_MOTION } from '../config.js';
import { SPECIALISTS } from '../data/specialists.js';
import { frame, frameAll, stillOf } from '../lib/avatar.js';
import { $, $$ } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { renderDetail } from './detail.js';
/** [translateX, translateY, rotate°, scale] per distance from the centre card. */
const POSE = [[0, 0, 0, 1], [238, 62, 4, 0.84], [432, 148, 8, 0.72], [600, 246, 12, 0.62]];
const DURATION = 7000;
let idx = 3; // Aida sits in the middle of SPECIALISTS
let timer = 0;
let paused = false;
function layout() {
    const arc = $('#harc');
    if (!arc)
        return;
    const w = innerWidth;
    const k = Math.max(0.36, Math.min(1, (w - 60) / 1440));
    const n = SPECIALISTS.length;
    $$('.hcard', arc).forEach((b) => {
        const i = Number(b.dataset.i);
        const d = (((i - idx) % n) + n + 3) % n - 3; // −3 … 3
        const ad = Math.abs(d);
        const [tx, ty, rot, sc] = POSE[ad];
        const sg = d < 0 ? -1 : 1;
        const hide = w < 900 && ad === 3;
        // Cards that wrap from one end to the other jump invisibly instead of sliding across.
        const prev = b.dataset.d === undefined ? d : Number(b.dataset.d);
        b.dataset.d = String(d);
        if (Math.abs(prev - d) > 3) {
            b.style.transition = 'none';
            b.style.opacity = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = ''; if (!hide)
                b.style.opacity = '1'; }));
        }
        else
            b.style.opacity = hide ? '0' : '1';
        b.style.transform = `translateX(calc(-50% + ${sg * tx * k}px)) translateY(${ty * k}px) rotate(${sg * rot}deg) scale(${sc})`;
        b.style.zIndex = String(10 - ad);
        b.style.pointerEvents = hide ? 'none' : '';
        b.classList.toggle('on', ad === 0);
        b.setAttribute('aria-pressed', String(ad === 0));
    });
    const cardH = $('.hcard', arc)?.offsetHeight || 330;
    arc.style.height = `${cardH + POSE[w < 900 ? 2 : 3][1] * k + 34}px`;
    requestAnimationFrame(frameAll);
}
function setTalking(card, on) {
    const v = card.querySelector('video.hv');
    if (!v)
        return;
    const m = SPECIALISTS[idx].media;
    const src = on ? m.talk : m.idle;
    if (v.dataset.cur === src)
        return;
    v.dataset.cur = src;
    v.dataset.shape = on ? m.talkShape : m.idleShape;
    frame(v, SPECIALISTS[idx].key);
    v.src = src;
    v.play().catch(() => { });
    card.querySelector('.hstate').textContent = on ? '● TALKING' : '● IDLE';
    card.classList.toggle('talk', on);
}
function go(i) {
    idx = i;
    const s = SPECIALISTS[i];
    $$('#harc video.hv').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); });
    layout();
    const card = $(`#harc .hcard[data-i="${i}"]`);
    if (card && !REDUCED_MOTION) {
        const v = document.createElement('video');
        Object.assign(v, { className: 'hv', muted: true, loop: true, playsInline: true, src: s.media.idle });
        v.setAttribute('playsinline', '');
        v.dataset.key = s.key;
        v.dataset.shape = s.media.idleShape;
        v.dataset.cur = s.media.idle;
        v.addEventListener('playing', () => { v.classList.add('ready'); frame(v, s.key); });
        card.insertBefore(v, card.querySelector('.hstate'));
        v.play().catch(() => { });
        requestAnimationFrame(() => frame(v, s.key));
    }
    const det = $('#detail');
    det.classList.remove('in');
    renderDetail(det, s);
    void det.offsetWidth;
    det.classList.add('in');
    schedule();
}
function schedule() {
    clearTimeout(timer);
    if (paused || REDUCED_MOTION)
        return;
    timer = window.setTimeout(() => go((idx + 1) % SPECIALISTS.length), DURATION);
}
/** Hero fan of specialist cards (Joya-style), auto-rotating, idle/talk video on the centre card. */
export function hero() {
    const arc = $('#harc');
    if (!arc)
        return;
    arc.innerHTML = SPECIALISTS.map((s, i) => `
    <button class="hcard" data-i="${i}" aria-label="${s.name}, ${s.role}">
      <img class="po" src="${stillOf(s.media)}" data-key="${s.key}" data-shape="${s.media.idleShape}" alt="" loading="${i === 3 ? 'eager' : 'lazy'}">
      <span class="hstate">● IDLE</span><span class="shade"></span>
      <span class="meta"><span class="ic">${icon(s.icon)}</span><span><b>${s.name}</b><small>${s.role}</small></span></span>
    </button>`).join('');
    $$('.hcard', arc).forEach((b) => {
        b.addEventListener('click', () => { if (Number(b.dataset.i) !== idx)
            go(Number(b.dataset.i)); });
        b.addEventListener('mouseenter', () => { if (Number(b.dataset.i) === idx)
            setTalking(b, true); });
        b.addEventListener('mouseleave', () => { if (Number(b.dataset.i) === idx)
            setTalking(b, false); });
    });
    [arc, $('#detail')].forEach((el) => {
        el.addEventListener('mouseenter', () => { paused = true; clearTimeout(timer); });
        el.addEventListener('mouseleave', () => { paused = false; schedule(); });
    });
    addEventListener('resize', layout);
    go(idx);
}
