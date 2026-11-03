export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
/** Run `cb` while `el` is on screen; `off` when it leaves. */
export function whenVisible(el, on, off, threshold = 0.2) {
    new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? on() : off?.())), { threshold }).observe(el);
}
export const isBengali = (s) => /[ঀ-৿]/.test(s);
/** Renders `{code}` placeholders as <code>. */
export const withCode = (s) => s.replace(/\{([^}]+)\}/g, '<code>$1</code>');
export const plain = (s) => s.replace(/\{([^}]+)\}/g, '$1');
/** Small equaliser bars for any [data-bars="N"] element. */
export function paintBars(root = document) {
    $$('[data-bars]', root).forEach((el) => {
        const n = Number(el.dataset.bars);
        let h = '';
        for (let i = 0; i < n; i++)
            h += `<i style="height:${4 + Math.abs(Math.sin(i * 1.3)) * 12}px"></i>`;
        el.innerHTML = h;
    });
}
