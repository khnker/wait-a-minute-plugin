/**
 * Rate Limiter — fixed-window counter.
 *
 * Limits calls to N per windowMs milliseconds. Returns a function that
 * records a call and indicates if it's allowed. Production hardening (M5-54).
 */

/**
 * @typedef {Object} RateLimiter
 * @property {() => boolean} tryAcquire
 * @property {() => number} remaining
 * @property {() => number} used
 * @property {() => void} reset
 */

/**
 * @param {{limit?: number, windowMs?: number}} opts
 * @returns {RateLimiter}
 */
export function createRateLimiter(opts = {}) {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 1000;
  let windowStart = Date.now();
  let count = 0;

  function tryAcquire() {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count >= limit) return false;
    count++;
    return true;
  }

  function remaining() {
    const now = Date.now();
    if (now - windowStart >= windowMs) return limit;
    return Math.max(0, limit - count);
  }

  function used() {
    const now = Date.now();
    if (now - windowStart >= windowMs) return 0;
    return count;
  }

  function reset() {
    windowStart = Date.now();
    count = 0;
  }

  return { tryAcquire, remaining, used, reset };
}
