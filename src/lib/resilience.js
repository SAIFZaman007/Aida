/*
  resilience.js — two tiny, dependency-free helpers used by the speech engine.

  CircuitBreaker: after repeated failures of the cloud voice, stop calling it
  for a while and speak with the browser voice instead, then try again. (The
  old code disabled the cloud voice for the whole session after ONE failure.)

  Limiter: caps concurrent requests (FIFO) so a long reply doesn't fire dozens
  of simultaneous TTS calls at the paid API / the per-IP rate limit.
*/
export class CircuitBreaker {
  constructor({
    failLimit = 2,
    openMs = 60_000,
    hardOpenMs = 600_000,
    quotaMinMs = 15_000,
    quotaMaxMs = 120_000,
    now = () => Date.now(),
  } = {}) {
    this.failLimit = failLimit;
    this.openMs = openMs;
    this.hardOpenMs = hardOpenMs;
    this.quotaMinMs = quotaMinMs;
    this.quotaMaxMs = quotaMaxMs;
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

  /** `err.code === "not_configured"` means retrying soon is pointless. A quota answer
   *  (`rate_limited`, with the server's `Retry-After`) opens the breaker AT ONCE for that
   *  long: the server already knows the quota is spent, and asking again for the next
   *  sentences only delays the device voice that is ready to speak. */
  failure(err) {
    if (err?.code === "not_configured") {
      this.openUntil = this.now() + this.hardOpenMs;
      return;
    }
    if (err?.code === "rate_limited") {
      const wait = Math.min(Math.max((err.retryAfter || 0) * 1000, this.quotaMinMs), this.quotaMaxMs);
      this.openUntil = Math.max(this.openUntil, this.now() + wait);
      this.fails = 0;
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
