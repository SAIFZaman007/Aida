/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Command-console palette: ice-cyan primary, crimson status accent.
        void: { 900: "#04070a", 800: "#070d12", 700: "#0b141b", 600: "#10202b" },
        glass: "rgba(10,22,30,0.55)",
        line: "rgba(56,225,255,0.16)",
        cyan: { DEFAULT: "#38e1ff", dim: "#0e7490", deep: "#155e6e" },
        crimson: "#ff3b5c",
        frost: "#d6f3ff",
        steel: "#6b8a99",
      },
      fontFamily: {
        hud: ['"Chakra Petch"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(56,225,255,0.25)",
        glowsoft: "0 0 60px rgba(56,225,255,0.12)",
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
        rev: { to: { transform: "rotate(-360deg)" } },
        rise: { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
      },
      animation: {
        ringspin: "spin 24s linear infinite",
        ringrev: "rev 18s linear infinite",
        rise: "rise 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};