import { brandify } from '../theme/brandText.js';
import { frameAll } from './lib/avatar.js';
import { paintBars } from './lib/dom.js';
import { paintIcons } from './lib/icons.js';
import { features } from './sections/features.js';
import { hero } from './sections/hero.js';
import { howItWorks } from './sections/howItWorks.js';
import { languages } from './sections/languages.js';
import { brand, faq, maktech, marquee, stars } from './sections/misc.js';
import { motion } from './sections/motion.js';
import { nav } from './sections/nav.js';
import { preloader } from './sections/preloader.js';
import { problemFlow } from './sections/problemFlow.js';
import { specialists } from './sections/specialists.js';

let booted = false;

/**
 * Brings the landing markup to life. The page is never unmounted (opening the assistant is a
 * normal page load), so there is nothing to tear down; the guard only makes React's
 * development double-effect harmless.
 */
export function boot() {
  if (booted) return;
  booted = true;
  const ready = preloader();
  brand();
  nav();
  stars();
  hero();
  marquee();
  problemFlow();
  specialists();
  howItWorks();
  features();
  languages();
  maktech();
  faq();
  paintIcons();
  paintBars();
  brand(); // logos injected by the sections above
  brandify(document.getElementById('landing')); // every "A.I.D.A" in the brand typeface
  // Re-frame faces once images/fonts settle and on resize.
  setTimeout(frameAll, 300);
  setTimeout(frameAll, 1500);
  addEventListener('load', frameAll);
  addEventListener('resize', frameAll);
  // Start scroll animations after the preloader has gone.
  ready.then(() => setTimeout(motion, 150));
}
