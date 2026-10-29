/*
  lipSync.js — turns the voice's loudness and spectrum into a mouth that moves like a
  person's. Pure maths (no three.js, no browser), so every rule below is unit-tested.

  WHY IT EXISTS. The first version opened the mouth in proportion to the raw loudness of
  the current audio frame. That reads as a glitch for four reasons, each fixed here:

   1. LOUDNESS IS NOT A MOUTH. A quiet speaker barely moved their lips, a loud one stayed
      wide open, and room hiss made the mouth flutter. → ADAPTIVE LEVEL: the loudness is
      divided by a slowly adapting peak, so every voice uses the whole range, and a NOISE
      GATE WITH HYSTERESIS keeps the mouth shut below speech level (no flutter around the
      threshold).
   2. FRAME-BY-FRAME JITTER. The loudness changes faster than a jaw can. → An ASYMMETRIC
      CRITICALLY-DAMPED follower: the jaw opens quickly (a syllable starts) and closes a
      little slower, with no overshoot, at any frame rate.
   3. SHAPES THAT FLICKER. The spectrum flips every frame between "ee" and "oo".
      → The band shares are normalized, smoothed more slowly than the jaw, and made
      MUTUALLY EXCLUSIVE (one shape dominates at a time), and only show while the mouth is
      open.
   4. NO SOUND TO MEASURE. A browser voice cannot be analysed, so the old code fired random
      pulses. → A SYNTHETIC SPEECH RHYTHM: syllables at a natural 4–6 Hz with varied
      strength and short pauses between words, so the fallback voice looks like speech too.

  The mouth also LEADS the sound a little (the player delays the speakers, not the
  analyser — see pcmPlayer.js), the way a real face does.
*/

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

export const LIP_DEFAULTS = {
  attack: 26, // 1/s: how fast the jaw opens when a syllable starts
  release: 13, // 1/s: how fast it closes
  shape: 11, // 1/s: how fast the mouth SHAPE (wide / round) follows the spectrum
  gateOn: 0.17, // normalized level above which the mouth opens...
  gateOff: 0.09, // ...and below which it closes again (hysteresis)
  peakFloor: 0.14, // the adaptive peak never goes below this (silence/hiss must not be amplified; the real meter is RMS/40, so quiet speech peaks around 0.15-0.2)
  peakRelease: 0.35, // 1/s: how slowly the peak forgets a loud moment
  curve: 0.8, // < 1 lifts quiet syllables so they still show
  rhythmHz: [4.2, 5.6], // synthetic syllable rate
};

/** Small seedable random source (tests pass their own). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class LipSync {
  constructor(opts = {}, rng = Math.random) {
    this.o = { ...LIP_DEFAULTS, ...opts };
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.peak = this.o.peakFloor;
    this.gate = false;
    this.open = 0;
    this.wide = 0;
    this.round = 0;
    this.level = 0; // conditioned loudness 0..1 (what drives nods and the like)
    // synthetic rhythm state
    this.phase = 0;
    this.rate = 5;
    this.syllable = 0.7;
    this.untilPause = 4;
    this.pause = 0;
    this.shape = 0.5; // 0 = round ... 1 = wide, wandering
    this.shapeTarget = 0.5;
  }

  /**
   * @param dt     seconds since the previous frame (clamped to 0.1)
   * @param input  { speaking, amplitude 0..1, bands:[low,mid,high], synthetic }
   * @returns      { open, wide, round, level }  all 0..1
   */
  update(dt, input = {}) {
    dt = clamp(dt, 0, 0.1);
    const o = this.o;
    const speaking = !!input.speaking;

    let amp;
    let bands;
    if (!speaking) {
      amp = 0;
      bands = [0, 0, 0];
    } else if (input.synthetic) {
      ({ amp, bands } = this._rhythm(dt));
    } else {
      amp = clamp(input.amplitude ?? 0, 0, 1);
      bands = input.bands || [0, 0, 0];
    }

    // 1) adaptive level: rise at once, forget slowly; only while there is speech
    if (amp > this.peak) this.peak = amp;
    else if (speaking) this.peak = Math.max(o.peakFloor, damp(this.peak, o.peakFloor, o.peakRelease, dt));
    else this.peak = Math.max(o.peakFloor, damp(this.peak, o.peakFloor, 1.2, dt));
    const norm = clamp(amp / this.peak, 0, 1);

    // 2) noise gate with hysteresis
    if (!this.gate && norm >= o.gateOn) this.gate = true;
    else if (this.gate && norm <= o.gateOff) this.gate = false;
    const target = this.gate && speaking ? Math.pow(norm, o.curve) : 0;

    // 3) jaw: fast to open, slightly slower to close, no overshoot
    this.open = clamp(damp(this.open, target, target > this.open ? o.attack : o.release, dt), 0, 1);
    this.level = this.open;

    // 4) shape from the spectrum shares; smoothed slower, one shape at a time
    const [low, mid, high] = bands;
    const tot = low + mid + high;
    let wideT = 0;
    let roundT = 0;
    if (tot > 1e-4 && this.gate) {
      const fl = low / tot;
      const fm = mid / tot;
      const fh = high / tot;
      wideT = clamp((fh * 1.7 - fl * 0.55 - 0.12) * 1.6, 0, 1);
      roundT = clamp((fl * 1.5 - fh * 1.1 - fm * 0.25 - 0.18) * 1.6, 0, 1);
      if (wideT > roundT) roundT *= 1 - wideT;
      else wideT *= 1 - roundT;
    }
    this.wide = clamp(damp(this.wide, wideT, o.shape, dt), 0, 1);
    this.round = clamp(damp(this.round, roundT, o.shape, dt), 0, 1);

    return { open: this.open, wide: this.wide * this.open, round: this.round * this.open, level: this.level };
  }

  /** A believable stand-in for measured speech: syllable pulses, word gaps, wandering shape. */
  _rhythm(dt) {
    const o = this.o;
    const r = this.rng;
    if (this.pause > 0) {
      this.pause -= dt;
      return { amp: 0.02, bands: [0.2, 0.2, 0.2] };
    }
    const prev = this.phase;
    this.phase += this.rate * dt;
    if (Math.floor(this.phase) !== Math.floor(prev)) {
      // a new syllable: its own strength, rate and mouth shape
      this.syllable = 0.45 + r() * 0.55;
      this.rate = o.rhythmHz[0] + r() * (o.rhythmHz[1] - o.rhythmHz[0]);
      this.shapeTarget = r();
      if (--this.untilPause <= 0) {
        this.untilPause = 2 + Math.floor(r() * 5); // a word group of 2–6 syllables, then a breath
        this.pause = 0.07 + r() * 0.12;
      }
    }
    const x = this.phase - Math.floor(this.phase);
    const pulse = Math.pow(Math.sin(Math.PI * x), 1.3); // one syllable: up and down
    this.shape = damp(this.shape, this.shapeTarget, 9, dt);
    const amp = 0.62 * this.syllable * pulse;
    const w = this.shape;
    return { amp, bands: [0.2 + (1 - w) * 0.5, 0.25, 0.1 + w * 0.5] };
  }
}
