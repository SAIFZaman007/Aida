import { useState } from "react";
import Reveal from "./Reveal.jsx";
import {
  PROBLEM, SOLUTION, SCATTERED, SPECIALISTS, FEATURES, STEPS, MAKTECH_SERVICES, MAKTECH_TEXT, MAKTECH_URL,
} from "./content.js";
import { AVATARS } from "../lib/avatars.js";
import { MODE_ICON, FilmIcon, GlobeIcon, MicIcon, ChatIcon, DatabaseIcon, FolderIcon, ShieldIcon, MonitorIcon, CheckIcon, ArrowRightIcon, ExternalIcon, SparkleIcon } from "../components/icons.jsx";

const FEATURE_ICON = { film: FilmIcon, globe: GlobeIcon, mic: MicIcon, captions: ChatIcon, memory: DatabaseIcon, folder: FolderIcon, shield: ShieldIcon, monitor: MonitorIcon };

function SectionHead({ kicker, title, text, center = true }) {
  return (
    <Reveal className={center ? "mx-auto max-w-[720px] text-center" : "max-w-[640px]"}>
      <span className="label">{kicker}</span>
      <h2 className="mt-3 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-tight text-white">{title}</h2>
      {text && <p className="mt-4 text-[17px] leading-relaxed text-frost/75">{text}</p>}
    </Reveal>
  );
}

const Section = ({ id, children, className = "" }) => (
  <section id={id} className={"scroll-mt-28 px-6 py-20 md:px-8 md:py-28 " + className}>
    <div className="mx-auto max-w-[1240px]">{children}</div>
  </section>
);

/* ── The problem → our solution ── */
export function Problem() {
  return (
    <Section id="problem">
      <SectionHead kicker="The problem" title="Too many AI tools. Not enough focus." />
      <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Reveal className="border border-white/10 bg-void-800/60 p-8">
          <h3 className="text-[15px] font-semibold uppercase tracking-[0.14em] text-crimson">Today</h3>
          <p className="mt-4 text-[16px] leading-relaxed text-frost/80">{PROBLEM}</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {SCATTERED.map((t) => (
              <li key={t} className="border border-dashed border-white/15 px-3 py-1.5 text-[13px] text-steel">{t}</li>
            ))}
          </ul>
        </Reveal>
        <div aria-hidden="true" className="hidden items-center lg:flex">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-violet/50 bg-violet/20 text-white"><ArrowRightIcon size={22} /></span>
        </div>
        <Reveal delay={120} className="relative overflow-hidden border border-violet/40 bg-gradient-to-br from-violet-deep/40 via-void-700 to-void-800 p-8 shadow-glowsoft">
          <h3 className="text-[15px] font-semibold uppercase tracking-[0.14em] text-violet-soft">Our solution</h3>
          <p className="mt-4 text-[16px] leading-relaxed text-white/90">{SOLUTION}</p>
          <div className="mt-6 flex items-center gap-3 border border-violet/40 bg-void-900/50 px-4 py-3">
            <SparkleIcon size={20} className="text-violet-soft" />
            <span className="text-[14px] font-medium text-white">One assistant · seven specialists · English &amp; Bengali voice</span>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── Meet the specialists ── */
export function Specialists() {
  const [sel, setSel] = useState("nonstop");
  const s = SPECIALISTS.find((x) => x.id === sel);
  const Icon = MODE_ICON[sel];
  return (
    <Section id="specialists" className="bg-void-800/40">
      <SectionHead
        kicker="Meet your AI specialists"
        title="Seven experts. Each with its own face, voice and focus."
        text="Every mode has dedicated intent, its own knowledge and its own memory. Choose the right expert for the task — or just stay with Non-stop."
      />
      <div className="mt-14 grid gap-8 lg:grid-cols-[320px_1fr]">
        <Reveal>
          <div role="tablist" aria-label="Specialists" className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {SPECIALISTS.map((x) => {
              const I = MODE_ICON[x.id];
              const on = x.id === sel;
              return (
                <button
                  key={x.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSel(x.id)}
                  className={"flex items-center gap-3 border px-4 py-3 text-left transition " + (on ? "border-violet bg-violet/20 text-white shadow-glowsoft" : "border-white/10 bg-void-800/60 text-frost/80 hover:border-violet/50 hover:text-white")}
                >
                  <I size={20} className={on ? "text-white" : "text-violet-soft"} />
                  <span>
                    <span className="block text-[15px] font-semibold leading-tight">{x.name}</span>
                    <span className="hidden text-[12px] text-steel sm:block">{x.role}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div key={sel} className="grid animate-rise overflow-hidden border border-violet/30 bg-void-800/70 shadow-glowsoft md:grid-cols-[300px_1fr]">
            <div className="relative min-h-[360px] bg-void-900">
              <img src={AVATARS[sel].still} alt={`${s.name} avatar`} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} />
              <div className="absolute inset-0 bg-gradient-to-t from-void-900/85 via-transparent to-transparent" />
              <span className="absolute bottom-3 left-3 border border-white/15 bg-void-900/60 px-3 py-1 text-[12px] text-frost backdrop-blur-md">{s.voice}</span>
            </div>
            <div className="p-8">
              <span className="flex h-11 w-11 items-center justify-center border border-violet/50 bg-violet/20 text-white"><Icon size={22} /></span>
              <h3 className="mt-5 text-[28px] font-bold text-white">{s.name}</h3>
              <p className="text-[14px] font-medium text-violet-soft">{s.role}</p>
              <p className="mt-4 text-[16px] leading-relaxed text-frost/80">{s.blurb}</p>
              <ul className="mt-6 space-y-2.5">
                {s.can.map((c) => (
                  <li key={c} className="flex items-center gap-3 text-[15px] text-frost">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/30 text-violet-soft"><CheckIcon size={12} /></span>
                    {c}
                  </li>
                ))}
              </ul>
              {sel !== "nonstop" && (
                <p className="mt-6 text-[13px] text-steel">Stays inside its field — and points you to the right specialist when a question belongs elsewhere.</p>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── Features ── */
export function Features() {
  return (
    <Section id="features">
      <SectionHead kicker="Everything in one place" title="Built for real work, designed to feel human." />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => {
          const I = FEATURE_ICON[f.icon];
          return (
            <Reveal key={f.title} delay={(i % 4) * 70} className="group border border-white/10 bg-void-800/60 p-6 transition hover:-translate-y-1 hover:border-violet/50 hover:bg-void-700/70">
              <span className="flex h-11 w-11 items-center justify-center border border-violet/40 bg-violet/15 text-violet-soft transition group-hover:bg-violet/30 group-hover:text-white"><I size={22} /></span>
              <h3 className="mt-5 text-[17px] font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-frost/70">{f.text}</p>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

/* ── How it works ── */
export function HowItWorks() {
  return (
    <Section id="how" className="bg-void-800/40">
      <SectionHead kicker="How it works" title="From question to answer in four steps." />
      <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([t, d], i) => (
          <Reveal as="li" key={t} delay={i * 90} className="relative border border-white/10 bg-void-800/60 p-6">
            <span className="text-[44px] font-bold leading-none text-violet/60">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-4 text-[18px] font-semibold text-white">{t}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-frost/70">{d}</p>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ── Bilingual ── */
export function Languages() {
  return (
    <Section id="languages">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <span className="label">English &amp; Bengali</span>
          <h2 className="mt-3 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-tight text-white">Speak the way you think.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-frost/75">
            A.I.D.A. is fluent in English and Bengali, in writing and in speech. Write in Bengali script, in English, or even Bengali in English letters —
            it understands, and replies in the language you used. Code, commands and technical terms stay in English, exactly as they should.
          </p>
          <ul className="mt-6 space-y-3 text-[15px] text-frost">
            {["Replies in the language of your latest message", "Natural, standard Bengali in Bengali script", "Voice in both languages, read aloud sentence by sentence"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet/30 text-violet-soft"><CheckIcon size={12} /></span>{t}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="space-y-3 border border-white/10 bg-void-800/60 p-6 md:p-8" aria-label="Example conversation">
          <p className="label">Example</p>
          <Bubble who="you" text="Plan my day: a client call at 11, then the report." />
          <Bubble who="aida" text="Happy to. Let's block 9 to 10:30 for the report draft, take the 11 o'clock call, then finish and review the report after lunch." />
          <Bubble who="you" bn text="আজকের কাজের একটি পরিকল্পনা বানিয়ে দাও।" />
          <Bubble who="aida" bn text="অবশ্যই। প্রথমে বলুন, আজ আপনার সবচেয়ে জরুরি কাজটি কোনটি?" />
        </Reveal>
      </div>
    </Section>
  );
}

function Bubble({ who, text, bn }) {
  const you = who === "you";
  return (
    <div className={"flex " + (you ? "justify-end" : "justify-start")}>
      <div lang={bn ? "bn" : undefined} className={"max-w-[85%] px-4 py-2.5 text-[14.5px] leading-relaxed " + (you ? "border border-violet/40 bg-violet/15 text-white" : "border border-white/10 bg-void-700/80 text-frost")}>
        {!you && <span className="label mb-1 block !text-[9px]">A.I.D.A</span>}
        {text}
      </div>
    </div>
  );
}

/* ── Maktech ── */
export function MaktechSection() {
  return (
    <Section id="maktech" className="bg-void-800/40">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <Reveal>
          <span className="label">Built by</span>
          <h2 className="mt-3 text-[clamp(32px,4.6vw,58px)] font-bold leading-[1.05] tracking-tight text-white">
            Engineered by <span className="bg-gradient-to-r from-violet-soft to-cyan bg-clip-text text-transparent">Maktech</span>.
          </h2>
          <p className="mt-5 max-w-[600px] text-[17px] leading-relaxed text-frost/75">{MAKTECH_TEXT}</p>
          <p className="mt-4 max-w-[600px] text-[15px] leading-relaxed text-steel">
            Ask any A.I.D.A. specialist who developed it — it will tell you: Maktech.
          </p>
          <a href={MAKTECH_URL} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 border border-white/25 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-violet hover:bg-violet/20">
            Visit maktechgroup.com <ExternalIcon size={17} />
          </a>
        </Reveal>
        <Reveal delay={120} className="border border-white/10 bg-void-800/60 p-8">
          <p className="label">What Maktech builds</p>
          <ul className="mt-5 flex flex-wrap gap-2.5">
            {MAKTECH_SERVICES.map((t) => (
              <li key={t} className="border border-violet/30 bg-violet/10 px-3.5 py-2 text-[13.5px] text-frost">{t}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}
