// Brand images (files live in public/brand/). BASE_URL is "./" in this build, so the
// same URLs work behind nginx and inside Electron.
const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "./";

export const BRAND = {
  logo: `${BASE}brand/aida-logo.webp`, // full lockup: emblem + A.I.D.A + tagline
  mark: `${BASE}brand/mark-96.png`, // emblem only, for the header
};
