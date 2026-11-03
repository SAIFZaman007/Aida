import { useCallback, useEffect, useRef, useState } from "react";
import { MODES, MODE_TAGLINE, MODE_HINT } from "../lib/modes.js";
import { avatarForPersona } from "../lib/avatars.js";
import { MODE_ICON, CheckIcon, ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "./icons.jsx";

/*
  SpecialistCarousel — "Meet your AI specialists": one card per mode, with the avatar's
  still portrait. Picking a card picks the mode (and so the avatar and its voice).
  It scrolls sideways (arrows, dots, swipe, mouse wheel); when the window is wide enough
  for all seven cards the arrows and dots simply hide.
*/
export default function SpecialistCarousel({ active, onSelect, note }) {
  const scroller = useRef(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const count = max <= 2 ? 1 : Math.ceil(el.scrollWidth / el.clientWidth);
    setPages(count);
    setPage(count <= 1 ? 0 : Math.min(count - 1, Math.round((el.scrollLeft / Math.max(max, 1)) * (count - 1))));
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Keep the selected card in view (e.g. the mode was changed from elsewhere).
  useEffect(() => {
    const el = scroller.current?.querySelector('[aria-pressed="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  const go = (dir) => {
    const el = scroller.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };
  const toPage = (i) => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: (max * i) / Math.max(pages - 1, 1), behavior: "smooth" });
  };

  const scrollable = pages > 1;

  return (
    <section aria-labelledby="specialists-title" className="relative w-full">
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-void-700/60 text-accent-soft">
            <UsersIcon size={22} />
          </span>
          <div>
            <h2 id="specialists-title" className="text-[17px] font-semibold leading-tight text-frost">
              Meet Your AI Specialists
            </h2>
            <p role="status" className={"text-[12.5px] " + (note ? "text-crimson" : "text-steel")}>
              {note || "Slide to explore and choose the right expert for your task"}
            </p>
          </div>
        </div>
        {scrollable && (
          <div className="flex gap-2">
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => go(d)}
                disabled={d < 0 ? edge.start : edge.end}
                aria-label={d < 0 ? "Previous specialists" : "Next specialists"}
                className="glass flex h-9 w-9 items-center justify-center rounded-full text-frost transition hover:border-accent/60 hover:text-frost disabled:opacity-35 disabled:hover:border-line"
              >
                {d < 0 ? <ChevronLeftIcon size={18} /> : <ChevronRightIcon size={18} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={measure}
        className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
      >
        {MODES.map(([id, label]) => {
          const avatar = avatarForPersona(id);
          const Icon = MODE_ICON[id];
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              title={MODE_HINT[id]}
              className={
                "group relative h-[188px] min-w-[150px] flex-1 basis-0 snap-start overflow-hidden rounded-2xl border text-left transition duration-300 " +
                (selected
                  ? "border-accent bg-void-700/80 shadow-glow"
                  : "border-line bg-void-800/70 hover:-translate-y-0.5 hover:border-accent/50")
              }
            >
              <img
                src={avatar.still}
                alt=""
                loading="lazy"
                draggable={false}
                className={
                  "absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.04] " +
                  (selected ? "brightness-100" : "brightness-[0.82] saturate-[1.05]")
                }
              />
              <span className="absolute inset-0 bg-gradient-to-t from-void-900 via-void-900/70 to-void-900/0" />
              {selected && (
                <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-void-900 shadow-glow">
                  <CheckIcon size={14} />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-end gap-2.5 p-3">
                <span
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border backdrop-blur-sm " +
                    (selected ? "border-accent/70 bg-accent/25 text-frost" : "border-line bg-void-900/60 text-accent-soft")
                  }
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold leading-tight text-frost">{label}</span>
                  <span className="block text-[11px] leading-snug text-frost/70">{MODE_TAGLINE[id]}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {scrollable && (
        <div className="absolute inset-x-0 -bottom-[15px] flex justify-center gap-2" role="tablist" aria-label="Specialist pages">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={`Page ${i + 1}`}
              onClick={() => toPage(i)}
              className={"h-1.5 rounded-full transition-all " + (i === page ? "w-7 bg-accent" : "w-1.5 bg-steel/40 hover:bg-steel/70")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
