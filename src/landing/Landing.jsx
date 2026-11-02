import { useEffect, useState } from "react";
import Reveal from "./Reveal.jsx";
import { Problem, Specialists, Features, HowItWorks, Languages, MaktechSection } from "./sections.jsx";
import { NAV, MAKTECH_URL } from "./content.js";
import { BRAND } from "../lib/brand.js";
import { AVATARS } from "../lib/avatars.js";
import { ArrowRightIcon, CloseIcon, ExternalIcon, GlobeIcon, UsersIcon, MicIcon } from "../components/icons.jsx";

/*
  Landing page (served at "/"; the app itself is at "/app").
  Floating square-cornered navbar · hero with the live Non-stop video avatar · the problem and the
  solution · the seven specialists · features · how it works · languages · Maktech · call to action.
*/
const APP_URL = "/app";

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="fixed inset-x-4 top-4 z-50 md:inset-x-8">
      {/* Square corners on purpose: a flat, translucent bar floating above the page. */}
      <nav
        aria-label="Main"
        className={
          "flex items-center justify-between rounded-none border border-white/10 px-4 py-2.5 backdrop-blur-xl transition-colors duration-300 md:px-5 " +
          (scrolled ? "bg-void-800/80" : "bg-void-800/45")
        }
      >
        <a href="#top" className="flex items-center gap-3" aria-label="A.I.D.A home">
          <img src={BRAND.mark} alt="" width={34} height={34} className="h-[34px] w-[34px] object-cover" draggable={false} />
          <span className="text-[19px] font-bold tracking-[0.22em] text-white">A.I.D.A</span>
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map(([label, href]) => (
            <li key={href}>
              <a href={href} className="text-[14px] font-medium text-frost/80 transition hover:text-white">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a
            href={APP_URL}
            className="hidden rounded-none bg-white px-5 py-2.5 text-[14px] font-semibold text-void-900 transition hover:bg-violet-soft sm:inline-block"
          >
            Launch A.I.D.A
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center text-white md:hidden"
          >
            {open ? <CloseIcon size={22} /> : <span className="space-y-1.5"><i className="block h-0.5 w-5 bg-white" /><i className="block h-0.5 w-5 bg-white" /><i className="block h-0.5 w-5 bg-white" /></span>}
          </button>
        </div>
      </nav>
      {open && (
        <div className="mt-1 border border-white/10 bg-void-800/90 p-4 backdrop-blur-xl md:hidden">
          <ul className="space-y-1">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <a href={href} onClick={() => setOpen(false)} className="block px-2 py-3 text-[15px] text-frost">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <a href={APP_URL} className="mt-2 block bg-white px-5 py-3 text-center text-[15px] font-semibold text-void-900">
            Launch A.I.D.A
          </a>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const v = AVATARS.nonstop.video;
  return (
    <section id="top" className="relative pt-28 md:pt-32">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-20 h-[520px] w-[520px] rounded-full bg-violet/20 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-40 h-[460px] w-[460px] rounded-full bg-cyan/10 blur-[120px]" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-6 pb-20 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:pb-28">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 border border-violet/50 bg-violet/15 px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white">
              Artificial Intelligence Desktop Assistant
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-[clamp(44px,7vw,88px)] font-bold leading-[0.98] tracking-tight text-white">
              Your Virtual
              <br />
              <span className="bg-gradient-to-r from-violet-soft via-violet to-cyan bg-clip-text text-transparent">AI Team.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-[560px] text-[18px] leading-relaxed text-frost/80">
              One unified AI platform with seven specialized experts to help you plan, build, analyze, create and protect — all in one place.
              Talk to them in English or Bengali; they talk back.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href={APP_URL}
              className="group inline-flex items-center gap-2 bg-white px-7 py-4 text-[15px] font-semibold text-void-900 transition hover:bg-violet-soft"
            >
              Launch A.I.D.A <ArrowRightIcon size={18} className="transition group-hover:translate-x-1" />
            </a>
            <a href="#specialists" className="px-2 py-4 text-[15px] font-medium text-frost/85 underline-offset-8 transition hover:text-white hover:underline">
              Meet the specialists
            </a>
          </Reveal>
          <Reveal delay={320} className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[13px] text-steel">
            <span className="flex items-center gap-2"><UsersIcon size={17} className="text-violet-soft" /> 7 specialist modes</span>
            <span className="flex items-center gap-2"><GlobeIcon size={17} className="text-violet-soft" /> English &amp; বাংলা</span>
            <span className="flex items-center gap-2"><MicIcon size={17} className="text-violet-soft" /> Voice-first</span>
          </Reveal>
        </div>

        <Reveal delay={140} className="relative mx-auto w-full max-w-[420px]">
          <div aria-hidden="true" className="absolute -inset-6 bg-gradient-to-b from-violet/30 to-cyan/10 blur-3xl" />
          <div className="relative aspect-[9/16] overflow-hidden rounded-3xl border border-violet/30 bg-void-800 shadow-glow">
            <video
              src={v.idle}
              poster={v.poster}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label="A.I.D.A's Non-stop avatar, smiling and waiting for you to speak"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-void-900/90 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
              <span className="border border-white/15 bg-void-900/60 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-md">Non-stop · General AI Assistant</span>
              <span className="flex items-center gap-1.5 border border-white/15 bg-void-900/60 px-3 py-1.5 text-[12px] text-frost backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> Listening
              </span>
            </div>
          </div>
          <div className="absolute -left-4 top-24 hidden animate-floaty border border-white/10 bg-void-800/70 px-4 py-3 text-[13px] text-frost shadow-glowsoft backdrop-blur-xl lg:block">
            <span className="text-violet-soft">“</span>How can I help you today?<span className="text-violet-soft">”</span>
          </div>
          <div className="absolute -right-4 bottom-40 hidden animate-floaty border border-white/10 bg-void-800/70 px-4 py-3 text-[13px] text-frost shadow-glowsoft backdrop-blur-xl [animation-delay:-3s] lg:block" lang="bn">
            আপনাকে কীভাবে সাহায্য করতে পারি?
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 pb-24 md:px-8">
      <Reveal className="relative mx-auto max-w-[1100px] overflow-hidden border border-violet/30 bg-gradient-to-br from-violet-deep/50 via-void-700 to-void-800 px-8 py-16 text-center md:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-violet/30 blur-[100px]" />
        <h2 className="relative text-[clamp(30px,4.4vw,52px)] font-bold leading-tight text-white">Meet your virtual AI team.</h2>
        <p className="relative mx-auto mt-4 max-w-[560px] text-[17px] text-frost/80">
          Plan, build, analyze, create and protect — one assistant, seven specialists, your language.
        </p>
        <a href={APP_URL} className="relative mt-8 inline-flex items-center gap-2 bg-white px-8 py-4 text-[15px] font-semibold text-void-900 transition hover:bg-violet-soft">
          Launch A.I.D.A <ArrowRightIcon size={18} />
        </a>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-12 md:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 md:flex-row md:justify-between">
        <div className="max-w-[360px]">
          <div className="flex items-center gap-3">
            <img src={BRAND.mark} alt="" width={36} height={36} className="h-9 w-9 object-cover" draggable={false} />
            <span className="text-[20px] font-bold tracking-[0.22em] text-white">A.I.D.A</span>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-steel">
            Artificial Intelligence Desktop Assistant — your virtual AI team, in English and Bengali.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-3 text-[14px]">
          {[...NAV, ["Launch A.I.D.A", APP_URL]].map(([label, href]) => (
            <a key={href} href={href} className="text-frost/75 transition hover:text-white">{label}</a>
          ))}
          <a href={MAKTECH_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-frost/75 transition hover:text-white">
            maktechgroup.com <ExternalIcon size={14} />
          </a>
        </nav>
      </div>
      <div className="mx-auto mt-10 max-w-[1240px] border-t border-white/10 pt-6 text-[12.5px] leading-relaxed text-steel">
        <p>© 2026 Maktech. A.I.D.A is a Maktech product.</p>
        <p className="mt-2 max-w-[760px]">
          A.I.D.A is an AI assistant. It can make mistakes, so check important information before you rely on it.
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = "A.I.D.A — Your Virtual AI Team | Maktech";
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content");
    meta?.setAttribute(
      "content",
      "A.I.D.A is an all-in-one desktop AI assistant by Maktech: seven specialized modes — Non-stop, Executive, Coder, Architect, Security, Researcher and Writer — with talking video avatars and bilingual voice in English and Bengali.",
    );
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.title = prev;
      if (meta && prevDesc != null) meta.setAttribute("content", prevDesc);
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-frost">
      <a href="#problem" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:text-void-900">
        Skip to content
      </a>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Specialists />
        <Features />
        <HowItWorks />
        <Languages />
        <MaktechSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
