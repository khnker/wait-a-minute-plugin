/**
 * Event Bus — minimal pub/sub.
 *
 * Synchronous event delivery with off() to detach handlers. Designed for
 * production hardening (M5-50) — inter-module decoupling.
 */

/**
 * @typedef {Object} EventBus
 * @property {(event: string, handler: Function) => () => void} on
 * @property {(event: string, handler: Function) => void} off
 * @property {(event: string, payload?: unknown) => void} emit
 * @property {(event: string) => number} listenerCount
 * @property {() => void} removeAllListeners
 */

/**
 * Create a new event bus.
 * @returns {EventBus}
 */
export function createEventBus() {
  /** @type {Map<string, Set<Function>>} */
  const map = new Map();

  function on(event, handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be function");
    let set = map.get(event);
    if (!set) {
      set = new Set();
      map.set(event, set);
    }
    set.add(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    const set = map.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) map.delete(event);
  }

  function emit(event, payload) {
    const set = map.get(event);
    if (!set) return;
    // copy to allow off() during iteration
    for (const fn of [...set]) {
      try {
        fn(payload, { event });
      } catch (_err) {
        // swallow listener errors — pub/sub isolation
      }
    }
  }

  function listenerCount(event) {
    const set = map.get(event);
    return set ? set.size : 0;
  }

  function removeAllListeners() {
    map.clear();
  }

  return { on, off, emit, listenerCount, removeAllListeners };
}
