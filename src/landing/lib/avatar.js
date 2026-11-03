import { byKey } from '../data/specialists.js';
/**
 * Framing helpers so faces are never cut off, whatever the box size.
 * Every source frame is 16:9 (1280×720 still / 1920×1080 video). Each
 * specialist has `geo` = [faceCentreX, headTopY] as fractions of the frame.
 */
/** Zoom/offset per context: [zoom (frame height ÷ box height), head-top margin as fraction of box]. */
function contextFor(el) {
    const p = el.parentElement;
    if (p.closest('.hcard'))
        return [1.6, 0.09];
    if (p.classList.contains('sp-scene'))
        return [1.12, 0.07];
    if (p.closest('.sp-tab'))
        return [2.2, 0.08];
    if (p.closest('.trio'))
        return [2, 0.08];
    return [1.4, 0.08];
}
/** Absolutely positions an <img>/<video> so the face sits centred with headroom. */
export function frame(el, key) {
    const box = el.parentElement;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (!W || !H)
        return;
    // A portrait (9:16) clip needs no maths: it fills the box, anchored near the top so the head keeps its room.
    if (el.dataset.shape === 'tall') {
        Object.assign(el.style, {
            position: 'absolute', width: `${W}px`, height: `${H}px`, left: '0px', top: '0px',
            maxWidth: 'none', objectFit: 'cover', objectPosition: '50% 10%', transform: 'none',
        });
        el.style.setProperty('-webkit-mask-image', 'none');
        el.style.setProperty('mask-image', 'none');
        box.classList.add('avbox');
        return;
    }
    const [gx, gy] = byKey(key).media.geo;
    const [zoom, margin] = contextFor(el);
    let Hd = H * zoom;
    let Wd = (Hd * 16) / 9;
    if (Wd < W) {
        Wd = W;
        Hd = (W * 9) / 16;
    }
    let left = W / 2 - gx * Wd;
    left = Math.min(0, Math.max(W - Wd, left));
    let top = margin * H - gy * Hd;
    top = Math.min(top, H * 0.12);
    top = Math.max(H - Hd, top);
    Object.assign(el.style, {
        position: 'absolute', width: `${Wd}px`, height: `${Hd}px`, left: `${left}px`, top: `${top}px`,
        maxWidth: 'none', objectFit: 'cover', objectPosition: '50% 50%', transform: 'none',
    });
    // Soft fade above the head when the frame starts below the box top.
    const fade = top > 0 ? top + H * 0.08 : 0;
    const mask = fade ? `linear-gradient(180deg,transparent ${top - 2}px,#000 ${fade}px)` : 'none';
    el.style.setProperty('-webkit-mask-image', mask);
    el.style.setProperty('mask-image', mask);
    box.classList.add('avbox');
}
/** The still to show for a specialist in a card or stage: the portrait poster when its idle clip is portrait. */
export const stillOf = (m) => (m.idleShape === 'tall' ? m.poster : m.face);
/** Re-frame every element marked with data-key. */
export function frameAll() {
    document.querySelectorAll('[data-key]').forEach((el) => {
        frame(el, el.dataset.key);
    });
}
/**
 * Round avatar: a square crop made for it (public/landing/faces/<key>.webp, 192 px, face centred,
 * about 4x the largest circle, so it stays sharp on retina). `cover` + centre never cuts a face
 * whatever the circle size.
 */
export function paintFace(el, key) {
    el.style.backgroundImage = `url("${byKey(key).media.crop}")`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = '50% 50%';
    el.style.backgroundRepeat = 'no-repeat';
    el.title = byKey(key).name;
}
