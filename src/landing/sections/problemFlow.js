import { BENEFITS, CHAOS } from '../data/content.js';
import { ORDER } from '../data/specialists.js';
import { paintFace } from '../lib/avatar.js';
import { $, $$, paintBars, whenVisible } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
/** Snake-like animated wire with travelling light dots. */
function wire(id, dir) {
    const d = 'M0 70 C 70 70, 90 32, 150 32 S 230 108, 300 70';
    const [a, b] = dir === 'in' ? ['.15', '1'] : ['1', '.15'];
    return `<svg class="fl-wire ${dir}" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#8B7CFF" stop-opacity="${a}"/><stop offset="1" stop-color="#B3A8FF" stop-opacity="${b}"/></linearGradient></defs>
    <path id="${id}" d="${d}" fill="none" stroke="rgba(170,170,255,.12)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <path class="flow-dash" d="${d}" fill="none" stroke="url(#${id}g)" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle r="4" fill="#fff" class="fl-dot"><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>
    <circle r="3" fill="#B3A8FF" class="fl-dot"><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>
  </svg>`;
}
/** Problem section: scattered tools → animated A.I.D.A brain → benefits checklist. */
export function problemFlow() {
    const f = $('#flow');
    if (!f)
        return;
    f.innerHTML = `
    <div class="fl-col fl-left" aria-label="Juggling separate AI tools">
      <div class="fl-cap">Juggling separate AI tools</div>
      ${CHAOS.map((c, i) => `<div class="fl-chaos c${i + 1}" style="--i:${i}"><div class="fl-top"><span class="fl-x">${icon('x')}</span><b>${c[0]}</b><em>${c[2]}</em></div><p>${c[1]}</p></div>`).join('')}
    </div>
    <div class="fl-mid">
      ${wire('flwA', 'in')}
      <div class="fl-core">
        <span class="orb-glow"></span><span class="orb-pulse"></span><span class="orb-pulse p2"></span>
        <div class="orb-orbit" id="orbOrbit"></div>
        <span class="orb-ring"></span>
        <div class="orb-bubble"><img data-asset="emblem" alt="A.I.D.A" width="150" height="150"><span class="ob-shine"></span></div>
        <span class="orb-cap">A.I.D.A · One shared brain</span>
      </div>
      ${wire('flwB', 'out')}
    </div>
    <div class="fl-col fl-right" aria-label="With A.I.D.A">
      <div class="fl-panel">
        <div class="fl-ph"><span class="mark" data-logo style="width:28px;height:28px;border-radius:8px"></span><b>A.I.D.A</b><span class="fl-count" id="flCount">0/5</span></div>
        ${BENEFITS.map((t) => `<div class="fl-item"><span class="fl-box">${icon('check')}</span><span>${t}</span></div>`).join('')}
      </div>
      <div class="fl-team"><div class="fl-th"><small>SPECIALISTS ONLINE</small><span class="fl-live"><span class="dot"></span>Shared context</span></div><div class="fl-faces" id="flFaces"></div></div>
      <div class="fl-speak"><small>NON-STOP · SPEAKING</small><span class="bn">আপনাকে কীভাবে সাহায্য করতে পারি?</span><span class="bars" data-bars="16"></span></div>
    </div>`;
    const orbit = $('#orbOrbit');
    ORDER.forEach((k, i) => {
        const sp = document.createElement('span');
        sp.className = 'orb-face';
        sp.style.setProperty('--a', `${(i * 360) / 7}deg`);
        const inner = document.createElement('i');
        sp.appendChild(inner);
        orbit.appendChild(sp);
        paintFace(inner, k, 46);
    });
    const faces = $('#flFaces');
    ORDER.forEach((k) => { const s = document.createElement('span'); faces.appendChild(s); paintFace(s, k, 40); });
    paintBars(f);
    // Benefits tick off one by one, then loop.
    const items = $$('.fl-item', f);
    const count = $('#flCount');
    let n = 0;
    let t = 0;
    const step = () => {
        items.forEach((it, i) => { it.classList.toggle('done', i < n); it.classList.toggle('now', i === n - 1); });
        count.textContent = `${n}/5`;
        if (n < items.length) {
            n++;
            t = window.setTimeout(step, 900);
        }
        else
            t = window.setTimeout(() => { n = 0; step(); }, 3200);
    };
    whenVisible(f, () => { f.classList.add('seen', 'play'); if (!t)
        step(); }, () => { clearTimeout(t); t = 0; f.classList.remove('play'); }, 0.25);
}
