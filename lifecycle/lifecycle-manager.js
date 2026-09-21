/**
 * Lifecycle Manager — start/stop coordination with event listeners.
 *
 * Provides a tiny state machine coordinating ordered startup and shutdown
 * of subsystems, emitting events for observability.
 *
 * States: "stopped" | "starting" | "running" | "stopping".
 * Listeners can be attached per event.
 *
 * Designed for production hardening (M5-49): lets plugins register hooks
 * that fire when the system transitions states.
 */

/**
 * @typedef {"stopped"|"starting"|"running"|"stopping"} LifecycleState
 */

/**
 * @typedef {Object} LifecycleListener
 * @property {(event: {type: string, payload?: unknown}) => void} handler
 */

/**
 * @typedef {Object} LifecycleManager
 * @property {() => LifecycleState} getState
 * @property {() => Promise<void>} start
 * @property {() => Promise<void>} stop
 * @property {(event: string, handler: Function) => () => void} on
 * @property {(event: string, handler: Function) => void} off
 * @property {() => boolean} isRunning
 */

/**
 * Create a lifecycle manager.
 * @param {Object} [opts]
 * @param {Array<{name: string, onStart?: Function, onStop?: Function}>} [opts.components]
 * @returns {LifecycleManager}
 */
export function createLifecycleManager(opts = {}) {
  const components = opts.components ?? [];
  /** @type {LifecycleState} */
  let state = "stopped";
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn({ type, payload });
      } catch (_err) {
        // listeners must not break lifecycle
      }
    }
  }

  function on(event, handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be function");
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) listeners.delete(event);
  }

  async function start() {
    if (state === "running" || state === "starting") return;
    state = "starting";
    emit("state", { from: "stopped", to: "starting" });
    for (const comp of components) {
      emit("start:component", { name: comp.name });
      if (typeof comp.onStart === "function") {
        await comp.onStart();
      }
    }
    state = "running";
    emit("state", { from: "starting", to: "running" });
  }

  async function stop() {
    if (state === "stopped" || state === "stopping") return;
    state = "stopping";
    emit("state", { from: "running", to: "stopping" });
    // stop in reverse order
    for (const comp of [...components].reverse()) {
      emit("stop:component", { name: comp.name });
      if (typeof comp.onStop === "function") {
        await comp.onStop();
      }
    }
    state = "stopped";
    emit("state", { from: "stopping", to: "stopped" });
  }

  return {
    getState: () => state,
    isRunning: () => state === "running",
    start,
    stop,
    on,
    off,
  };
}
