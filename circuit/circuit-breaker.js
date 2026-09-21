/**
 * Circuit Breaker — fail-fast pattern for unreliable calls.
 *
 * States: "closed" (allow), "open" (reject fast), "half-open" (probe).
 * After `threshold` consecutive failures the breaker opens; after
 * `timeout` ms it transitions to half-open to allow one probe.
 *
 * Production hardening (M5-53).
 */

/**
 * @typedef {"closed"|"open"|"half-open"} BreakerState
 */

/**
 * @typedef {Object} CircuitBreaker
 * @property {() => BreakerState} getState
 * @property {<T>(fn: () => Promise<T>) => Promise<T>} execute
 * @property {() => void} reset
 * @property {() => number} failures
 */

/**
 * @param {{threshold?: number, timeout?: number}} opts
 * @returns {CircuitBreaker}
 */
export function createCircuitBreaker(opts = {}) {
  const threshold = opts.threshold ?? 3;
  const timeout = opts.timeout ?? 1000;
  /** @type {BreakerState} */
  let state = "closed";
  let failures = 0;
  let openedAt = 0;

  function getState() {
    if (state === "open" && Date.now() - openedAt >= timeout) {
      state = "half-open";
    }
    return state;
  }

  async function execute(fn) {
    const cur = getState();
    if (cur === "open") {
      throw new Error("circuit breaker is OPEN");
    }
    try {
      const result = await fn();
      // success: close if half-open, reset counter
      state = "closed";
      failures = 0;
      return result;
    } catch (err) {
      failures++;
      if (failures >= threshold || state === "half-open") {
        state = "open";
        openedAt = Date.now();
      }
      throw err;
    }
  }

  function reset() {
    state = "closed";
    failures = 0;
    openedAt = 0;
  }

  return { getState, execute, reset, failures: () => failures };
}
