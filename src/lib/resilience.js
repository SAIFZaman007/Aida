/*
  resilience.js — two tiny, dependency-free helpers used by the speech engine.

  CircuitBreaker: after repeated failures of the cloud voice, stop calling it
  for a while and speak with the browser voice instead, then try again. (The
  old code disabled the cloud voice for the whole session after ONE failure.)

  Limiter: caps concurrent requests (FIFO) so a long reply doesn't fire dozens
  of simultaneous TTS calls at the paid API / the per-IP rate limit.
*/
export class CircuitBreaker {
  constructor({ failLimit = 2, openMs = 60_000, hardOpenMs = 600_000, now = () => Date.now() } = {}) {
    this.failLimit = failLimit;
    this.openMs = openMs;
    this.hardOpenMs = hardOpenMs;
    this.now = now;
    this.fails = 0;
    this.openUntil = 0;
  }

  available() {
    return this.now() >= this.openUntil;
  }

  success() {
    this.fails = 0;
    this.openUntil = 0;
  }

  /** `err.code === "not_configured"` means retrying soon is pointless. */
  failure(err) {
    if (err?.code === "not_configured") {
      this.openUntil = this.now() + this.hardOpenMs;
      return;
    }
    if (++this.fails >= this.failLimit) {
      this.openUntil = this.now() + this.openMs;
      this.fails = 0;
    }
  }
}

export class Limiter {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  async run(fn) {
    if (this.active >= this.max) await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
