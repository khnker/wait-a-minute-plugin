/**
 * Feature Flags — in-memory key/value toggles with defaults.
 *
 * Supports: get/set/has/toggle, with optional per-user overrides.
 * Production hardening (M5-55).
 */

/**
 * @typedef {Object} FeatureFlags
 * @property {(key: string, fallback?: boolean) => boolean} isEnabled
 * @property {(key: string, value: boolean) => void} set
 * @property {(key: string) => boolean} has
 * @property {(key: string) => void} toggle
 * @property {() => string[]} list
 * @property {(ctx: {userId?: string}) => FeatureFlags} forContext
 */

/**
 * @param {Record<string, boolean>} initial
 * @returns {FeatureFlags}
 */
export function createFeatureFlags(initial = {}) {
  /** @type {Map<string, boolean>} */
  const store = new Map(Object.entries(initial));

  function isEnabled(key, fallback = false) {
    return store.has(key) ? store.get(key) : fallback;
  }

  function set(key, value) {
    store.set(key, Boolean(value));
  }

  function has(key) {
    return store.has(key);
  }

  function toggle(key) {
    const next = !isEnabled(key);
    store.set(key, next);
    return next;
  }

  function list() {
    return [...store.keys()];
  }

  function forContext(ctx) {
    const userId = ctx?.userId;
    return {
      isEnabled: (key, fallback = false) => {
        if (userId && store.has(`${key}:${userId}`)) {
          return store.get(`${key}:${userId}`);
        }
        return isEnabled(key, fallback);
      },
      set: (key, value) => {
        if (userId) store.set(`${key}:${userId}`, Boolean(value));
        else set(key, value);
      },
    };
  }

  return { isEnabled, set, has, toggle, list, forContext };
}
