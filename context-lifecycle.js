/**
 * Context Lifecycle — state machine for context items.
 *
 * States: CREATED, ACTIVE, COMPRESSED, STALE, INVALIDATED, ARCHIVED.
 *
 * Each ContextItem progresses through these states as the working
 * session evolves. The lifecycle module provides:
 *   - state constants and transition table
 *   - transition() with validation against the table
 *   - validity checks (isUsable, isTerminal)
 *   - time-based staleness helper
 *
 * Designed to operate on top of ContextItem produced by
 * context-normalization.js without coupling to specific source payloads.
 */

/**
 * @typedef {"CREATED"|"ACTIVE"|"COMPRESSED"|"STALE"|"INVALIDATED"|"ARCHIVED"} LifecycleState
 */

/** @type {Record<LifecycleState, LifecycleState>} */
export const LIFECYCLE_STATES = Object.freeze({
  CREATED: "CREATED",
  ACTIVE: "ACTIVE",
  COMPRESSED: "COMPRESSED",
  STALE: "STALE",
  INVALIDATED: "INVALIDATED",
  ARCHIVED: "ARCHIVED",
});

/**
 * Allowed transitions. Terminal states (INVALIDATED, ARCHIVED) have no
 * outgoing edges — once archived/invalidated, the item is read-only.
 * @type {Record<LifecycleState, LifecycleState[]>}
 */
export const TRANSITIONS = Object.freeze({
  CREATED: ["ACTIVE", "STALE", "INVALIDATED", "ARCHIVED"],
  ACTIVE: ["COMPRESSED", "STALE", "INVALIDATED", "ARCHIVED"],
  COMPRESSED: ["ACTIVE", "STALE", "INVALIDATED", "ARCHIVED"],
  STALE: ["ACTIVE", "INVALIDATED", "ARCHIVED", "COMPRESSED"],
  INVALIDATED: [],
  ARCHIVED: [],
});

/** @type {LifecycleState[]} */
export const TERMINAL_STATES = Object.freeze(["INVALIDATED", "ARCHIVED"]);

/**
 * Validate that a state value is a known lifecycle state.
 * @param {unknown} state
 * @returns {boolean}
 */
export function isLifecycleState(state) {
  return typeof state === "string" && state in LIFECYCLE_STATES;
}

/**
 * Check whether `from -> to` is a permitted transition.
 * @param {LifecycleState} from
 * @param {LifecycleState} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
  if (!isLifecycleState(from) || !isLifecycleState(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/**
 * Transition a context item from its current state to `next`.
 * Returns a NEW item with updated lifecycle metadata; the original is
 * not mutated. Throws if the transition is not allowed.
 *
 * @param {Object} item - ContextItem with `lifecycle` field
 * @param {LifecycleState} next
 * @param {Object} [meta] - Optional metadata to record on the transition
 *                           (e.g. { reason, ts, actor })
 * @returns {Object} Updated item
 */
export function transition(item, next, meta = {}) {
  if (!item || typeof item !== "object") {
    throw new TypeError("item must be a non-null object");
  }
  if (!isLifecycleState(next)) {
    throw new TypeError(`Unknown lifecycle state: ${String(next)}`);
  }
  const current = item.lifecycle || LIFECYCLE_STATES.CREATED;
  if (!isLifecycleState(current)) {
    throw new TypeError(`Item has invalid lifecycle: ${String(current)}`);
  }
  if (!canTransition(current, next)) {
    throw new Error(`Illegal transition: ${current} -> ${next}`);
  }

  const history = Array.isArray(item.lifecycleHistory)
    ? [...item.lifecycleHistory, { from: current, to: next, ts: Date.now(), ...meta }]
    : [{ from: current, to: next, ts: Date.now(), ...meta }];

  return {
    ...item,
    lifecycle: next,
    lifecycleHistory: history,
    updatedAt: Date.now(),
  };
}

/**
 * Decide whether `item` is in a state usable for assembly/retrieval.
 * Items in COMPRESSED, STALE, INVALIDATED or ARCHIVED are excluded.
 * @param {Object} item
 * @returns {boolean}
 */
export function isUsable(item) {
  if (!item || typeof item !== "object") return false;
  const state = item.lifecycle || LIFECYCLE_STATES.CREATED;
  return state === LIFECYCLE_STATES.CREATED || state === LIFECYCLE_STATES.ACTIVE;
}

/**
 * Check whether the state is terminal (no further transitions possible).
 * @param {LifecycleState} state
 * @returns {boolean}
 */
export function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * Default staleness threshold per state, in milliseconds. Items older than
 * (now - timestamp) > threshold are candidates for transition to STALE.
 * @type {Record<LifecycleState, number>}
 */
export const STALE_THRESHOLD_MS = Object.freeze({
  CREATED: 60 * 60 * 1000,        // 1h
  ACTIVE: 24 * 60 * 60 * 1000,    // 24h
  COMPRESSED: 7 * 24 * 60 * 60 * 1000, // 7d
  STALE: Infinity,
  INVALIDATED: Infinity,
  ARCHIVED: Infinity,
});

/**
 * Compute the recommended next state based on age. Returns the current
 * state if it is still fresh, or STALE if it has aged past threshold.
 * @param {Object} item
 * @param {number} [now]
 * @returns {LifecycleState}
 */
export function stalenessCheck(item, now = Date.now()) {
  if (!item || typeof item !== "object") {
    throw new TypeError("item must be a non-null object");
  }
  const state = item.lifecycle || LIFECYCLE_STATES.CREATED;
  const ts = typeof item.timestamp === "number" ? item.timestamp : now;
  const threshold = STALE_THRESHOLD_MS[state];
  if (threshold === Infinity) return state;
  return now - ts > threshold ? LIFECYCLE_STATES.STALE : state;
}

export default {
  LIFECYCLE_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  STALE_THRESHOLD_MS,
  isLifecycleState,
  canTransition,
  transition,
  isUsable,
  isTerminal,
  stalenessCheck,
};