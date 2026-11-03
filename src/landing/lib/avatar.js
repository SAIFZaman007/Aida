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
    const m = byKey(key).media;
    const [gx, gy] = m.geo;
    // Every clip and still is a 9:16 portrait (a 16:9 one is still supported): `ratio` = width ÷ height.
    const ratio = (el.dataset.shape || m.idleShape) === 'tall' ? 9 / 16 : 16 / 9;
    const [zoom, margin] = contextFor(el);
    let Hd = H * zoom;
    let Wd = Hd * ratio;
    if (Wd < W) {
        Wd = W;
        Hd = W / ratio;
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
/** The still to show for a specialist in a card or stage: the first frame of its idle clip. */
export const stillOf = (m) => m.poster;
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
