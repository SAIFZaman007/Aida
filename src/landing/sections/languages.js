import { CONVERSATIONS } from '../data/content.js';
import { paintFace } from '../lib/avatar.js';
import { $, $$, isBengali, plain, whenVisible, withCode } from '../lib/dom.js';
const ORDER = ['en', 'bn', 'bl'];
const TYPE_MS = 38;
const WORD_MS = 110;
/** Interactive bilingual chat: pick a language and watch a live conversation play out. */
export function languages() {
    const toggle = $('#languages .lang-toggle');
    const chat = $('#chat');
    if (!toggle || !chat)
        return;
    const box = $('.msgs', chat);
    const footer = $('.speaking', chat);
    const liveLabel = $('.lv', chat);
    paintFace($('.who', chat), 'nonstop', 40);
    let gen = 0;
    let timers = [];
    let current = 'en';
    const status = (text, talking = false, listening = false) => {
        let bars = '';
        for (let i = 0; i < 22; i++)
            bars += `<i style="height:${4 + Math.abs(Math.sin(i * 1.3)) * 12}px"></i>`;
        footer.innerHTML = `<span class="bars">${bars}</span>${text}<span class="cc">CC ON</span>`;
        chat.classList.toggle('talking', talking);
        chat.classList.toggle('listening', listening);
        liveLabel.textContent = listening ? 'LISTENING' : 'VOICE ON';
    };
    const later = (fn, ms, g) => timers.push(window.setTimeout(() => { if (g === gen)
        fn(); }, ms));
    const trim = () => { while (box.children.length > 5)
        box.firstElementChild.remove(); };
    const run = (lang) => {
        const g = ++gen;
        timers.forEach(clearTimeout);
        timers = [];
        current = lang;
        $$('button', toggle).forEach((b) => {
            const on = b.dataset.l === lang;
            b.classList.toggle('on', on);
            b.setAttribute('aria-selected', String(on));
        });
        box.innerHTML = '';
        status('Waiting for you…');
        const conv = CONVERSATIONS[lang];
        const aiTotal = conv.filter((m) => m[0] === 'ai').length;
        let t = 300;
        let aiN = 0;
        conv.forEach(([who, text]) => {
            if (who === 'me') {
                const txt = plain(text);
                later(() => {
                    const d = document.createElement('div');
                    d.className = `msg me${isBengali(txt) ? ' bn' : ''}`;
                    d.innerHTML = '<span class="tx"></span><span class="cur"></span>';
                    box.append(d);
                    trim();
                    status('Listening…', false, true);
                    const tx = $('.tx', d);
                    let i = 0;
                    const typeNext = () => { if (g !== gen)
                        return; tx.textContent = txt.slice(0, ++i); if (i < txt.length)
                        timers.push(window.setTimeout(typeNext, TYPE_MS));
                    else
                        d.innerHTML = withCode(text); };
                    typeNext();
                }, t, g);
                t += txt.length * TYPE_MS + 500;
            }
            else {
                const n = ++aiN;
                const words = plain(text).split(' ');
                later(() => { box.insertAdjacentHTML('beforeend', '<div class="typing-dots"><i></i><i></i><i></i></div>'); trim(); status('Thinking…'); }, t, g);
                t += 900;
                later(() => {
                    box.querySelector('.typing-dots')?.remove();
                    const d = document.createElement('div');
                    d.className = `msg ai${isBengali(text) ? ' bn' : ''}`;
                    d.innerHTML = '<small style="font-family:var(--f-mono)">A.I.D.A</small><span class="tx"></span>';
                    box.append(d);
                    trim();
                    status(`Speaking · sentence ${n} of ${aiTotal}`, true);
                    const tx = $('.tx', d);
                    let i = 0;
                    const wordNext = () => { if (g !== gen)
                        return; tx.textContent = words.slice(0, ++i).join(' '); if (i < words.length)
                        timers.push(window.setTimeout(wordNext, WORD_MS));
                    else
                        tx.innerHTML = withCode(text); };
                    wordNext();
                }, t, g);
                t += words.length * WORD_MS + 700;
                later(() => status('Done · your turn'), t, g);
                t += 500;
            }
        });
        // Move on to the next language automatically.
        later(() => run(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]), t + 3500, g);
    };
    toggle.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b)
            run(b.dataset.l);
    });
    let started = false;
    whenVisible(chat, () => { if (!started) {
        started = true;
        run('en');
    } }, undefined, 0.3);
}
