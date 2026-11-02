import { useEffect, useRef } from "react";
import { speechBus, micBus } from "../lib/speech.js";

/*
  Waveform — the live sound bars above the mic.
    speaking   follows the voice (speechBus), like an equaliser
    listening  follows the microphone level (micBus)
    otherwise  a calm, slow breathing line
  One <canvas>, drawn once per animation frame, and stopped when the tab is hidden.
*/
const BARS = 61;

export default function Waveform({ mode = "idle", className = "" }) {
  const ref = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let level = 0; // smoothed 0..1
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (t) => {
      const m = modeRef.current;
      let target = 0.05;
      if (m === "speaking") target = speechBus.synthetic ? 0.45 + 0.25 * Math.sin(t / 140) : Math.min(1, 0.12 + speechBus.amplitude * 2.2);
      else if (m === "listening") target = Math.min(1, 0.08 + micBus.level * 0.9);
      else if (m === "thinking") target = 0.14 + 0.06 * Math.sin(t / 260);
      if (reduce) target = Math.min(target, 0.2);
      level += (target - level) * 0.18;

      ctx.clearRect(0, 0, w, h);
      const gap = w / BARS;
      const barW = Math.max(2, gap * 0.42);
      const mid = h / 2;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(56,225,255,0.95)");
      grad.addColorStop(0.5, "rgba(139,123,255,0.98)");
      grad.addColorStop(1, "rgba(56,225,255,0.95)");
      ctx.fillStyle = grad;
      for (let i = 0; i < BARS; i++) {
        const x = i * gap + gap / 2;
        const d = Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2); // 0 centre … 1 edge
        const env = Math.pow(1 - d, 1.4) * 0.85 + 0.15;
        const wobble = 0.55 + 0.45 * Math.sin(t / 120 + i * 0.9) * Math.cos(t / 210 + i * 0.37);
        const bh = Math.max(2.5, h * 0.92 * level * env * Math.abs(wobble) + 2.5);
        ctx.globalAlpha = 0.35 + 0.65 * env;
        ctx.beginPath();
        ctx.roundRect(x - barW / 2, mid - bh / 2, barW, bh, barW / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
