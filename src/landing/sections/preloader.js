import { ASSETS } from '../config.js';
const MESSAGES = ['Waking up your AI team', 'Loading specialists', 'Tuning voices', 'Ready'];
/**
 * Compact preloader: logo with spinning ring, slim progress line, rotating status.
 * Resolves when the page is ready (min ~1.1 s, max 3.2 s).
 */
export function preloader() {
    return new Promise((resolve) => {
        const el = document.getElementById('aida-pre');
        if (!el)
            return resolve();
        const root = document.documentElement;
        root.classList.add('ap-lock');
        el.querySelector('img').src = ASSETS.mark;
        const fill = document.getElementById('apFill');
        const txt = document.getElementById('apTxt');
        const t0 = Date.now();
        let p = 0, target = 35, lastMsg = -1, done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            setTimeout(() => {
                el.classList.add('done');
                root.classList.remove('ap-lock');
                resolve();
                setTimeout(() => el.remove(), 900);
            }, 300);
        };
        const step = () => {
            p = Math.min(target, p + Math.max(0.4, (target - p) * 0.07));
            fill.style.transform = `scaleX(${p / 100})`;
            const m = Math.min(3, Math.floor(p / 30));
            if (m !== lastMsg) {
                lastMsg = m;
                txt.style.opacity = '0';
                setTimeout(() => { txt.textContent = MESSAGES[m]; txt.style.opacity = '1'; }, 200);
            }
            if (p >= 99.5)
                return finish();
            setTimeout(step, 30);
        };
        if (document.readyState !== 'loading')
            target = 75;
        else
            document.addEventListener('DOMContentLoaded', () => (target = 75));
        const onLoad = () => setTimeout(() => (target = 100), Math.max(0, 1100 - (Date.now() - t0)));
        if (document.readyState === 'complete')
            onLoad();
        else
            addEventListener('load', onLoad);
        setTimeout(() => (target = 100), 3200);
        step();
    });
}
