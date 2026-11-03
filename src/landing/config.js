/**
 * Landing page configuration. Change a URL here and the whole page follows.
 * (Page-relative asset base, like the rest of the app: works behind nginx and in Electron.)
 */
export const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';

/** The assistant itself lives at /app (same tab, like the previous landing page). */
export const APP_URL = '/app';
export const MAKTECH_URL = 'https://maktechgroup.com/';

export const ASSETS = {
  mark: `${BASE}brand/mark-96.png`, // small emblem: navbar, footer, preloader
  emblem: `${BASE}icon-512.png`, // large emblem: the floating bubble in the "one shared brain" orb
};

/** Respect the visitor's "reduce motion" OS setting everywhere. */
export const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
