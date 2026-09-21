/**
 * Event Sourcing — append-only event store with reduce.
 *
 * Stores immutable events keyed by stream. Reduces them into a derived
 * state via a user-provided reducer. Production hardening (M5-51).
 */

/**
 * @typedef {Object} StoredEvent
 * @property {number} seq
 * @property {string} streamId
 * @property {string} type
 * @property {*} payload
 * @property {number} timestamp
 */

/**
 * @typedef {Object} EventStore
 * @property {(streamId: string, type: string, payload?: unknown) => StoredEvent} append
 * @property {(streamId: string) => StoredEvent[]} query
 * @property {(streamId: string, reducer: Function, initial: unknown) => unknown} reduce
 * @property {() => number} totalEvents
 * @property {() => string[]} streams
 */

/**
 * Create an event store.
 * @returns {EventStore}
 */
export function createEventStore() {
  /** @type {Map<string, StoredEvent[]>} */
  const byStream = new Map();
  let seq = 0;

  function append(streamId, type, payload) {
    if (!streamId || typeof streamId !== "string") throw new TypeError("streamId required");
    if (!type || typeof type !== "string") throw new TypeError("type required");
    const event = {
      seq: ++seq,
      streamId,
      type,
      payload,
      timestamp: Date.now(),
    };
    let list = byStream.get(streamId);
    if (!list) {
      list = [];
      byStream.set(streamId, list);
    }
    list.push(event);
    return event;
  }

  function query(streamId) {
    const list = byStream.get(streamId);
    return list ? [...list] : [];
  }

  function reduce(streamId, reducer, initial) {
    const list = byStream.get(streamId) ?? [];
    return list.reduce((state, ev) => reducer(state, ev), initial);
  }

  function totalEvents() {
    let n = 0;
    for (const list of byStream.values()) n += list.length;
    return n;
  }

  function streams() {
    return [...byStream.keys()];
  }

  return { append, query, reduce, totalEvents, streams };
}
