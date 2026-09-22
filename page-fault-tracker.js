/**
 * Page-Fault Tracker (C06 — page-fault-measurement).
 *
 * Tracks context page-faults: when omitted context is later requested via
 * `retrieveContext()` (i.e. the system has to fetch what it had previously
 * chosen NOT to inject). Provides per-fault metrics: fetch count, tokens
 * fetched, latency, and reason classification.
 *
 * Design:
 *   - createPageFaultTracker() returns a tracker with:
 *       recordOmission({id, tokens, reason})  — log that context was dropped
 *       recordFetch({id, tokens, latencyMs, reason}) — log a subsequent fetch
 *       recordFault(id, ...)                    — record a fault (alias)
 *       snapshot()                              — current aggregate stats
 *       reset()                                 — clear all state
 *       faults()                                — list of recorded faults
 *   - measurePageFaults(tracker, fetchFn) — runs an async fetch closure
 *     against the tracker and returns the snapshot.
 *
 * Page fault definition: a fetch of an id that was previously omitted
 * (recorded via recordOmission). If the id was never omitted, it's a
 * regular fetch and is NOT counted as a fault.
 *
 * Reason taxonomy (extensible):
 *   - "scope-overflow" — was trimmed because budget overflowed
 *   - "relevance-threshold" — failed admission scoring threshold
 *   - "explicit-omission" — manually dropped by selector
 *   - "ttl-expired"     — context had aged out
 *   - "unknown"         — no omission reason recorded
 */

export const FAULT_REASONS = Object.freeze({
  SCOPE_OVERFLOW: "scope-overflow",
  RELEVANCE_THRESHOLD: "relevance-threshold",
  EXPLICIT_OMISSION: "explicit-omission",
  TTL_EXPIRED: "ttl-expired",
  UNKNOWN: "unknown",
});

/**
 * @typedef {Object} OmissionRecord
 * @property {string} id
 * @property {number} tokens
 * @property {string} reason
 * @property {number} timestamp
 */

/**
 * @typedef {Object} FaultRecord
 * @property {string} id
 * @property {number} tokens
 * @property {number} latencyMs
 * @property {string} reason
 * @property {number} timestamp
 * @property {string} omissionReason
 */

/**
 * @typedef {Object} PageFaultSnapshot
 * @property {number} omissionCount
 * @property {number} fetchCount
 * @property {number} faultCount
 * @property {number} tokensOmitted
 * @property {number} tokensFetched
 * @property {number} tokensRefetched   - tokens fetched that were faults
 * @property {number} totalLatencyMs
 * @property {number} faultLatencyMs
 * @property {Object} faultsByReason    - {reason: count}
 * @property {Object} omissionsByReason  - {reason: count}
 * @property {number} faultRate         - faultCount / fetchCount (0 if no fetches)
 */

/**
 * @typedef {Object} PageFaultTracker
 * @property {string[]} _ids
 * @property {(record: OmissionRecord) => void} recordOmission
 * @property {(record: {id: string, tokens?: number, latencyMs?: number, reason?: string}) => FaultRecord|null} recordFetch
 * @property {(id: string, opts?: object) => FaultRecord|null} recordFault
 * @property {() => OmissionRecord[]} omissions
 * @property {() => FaultRecord[]} faults
 * @property {() => PageFaultSnapshot} snapshot
 * @property {() => void} reset
 */

/**
 * Create a new page-fault tracker.
 *
 * @param {Object} [opts]
 * @param {number} [opts.clock=() => Date.now()] - injectable clock for tests
 * @returns {PageFaultTracker}
 */
export function createPageFaultTracker(opts = {}) {
  const clock = typeof opts.clock === "function" ? opts.clock : () => Date.now();

  /** @type {Map<string, OmissionRecord>} */
  const omissions = new Map();
  /** @type {FaultRecord[]} */
  const faults = [];

  /**
   * Record that context `id` was omitted (not injected into the prompt).
   * Calling recordOmission twice for the same id updates the prior record.
   *
   * @param {OmissionRecord} record
   */
  function recordOmission(record) {
    if (!record || typeof record.id !== "string") {
      throw new TypeError("recordOmission: record.id must be a string");
    }
    const entry = {
      id: record.id,
      tokens: typeof record.tokens === "number" ? record.tokens : 0,
      reason: typeof record.reason === "string" ? record.reason : FAULT_REASONS.UNKNOWN,
      timestamp: typeof record.timestamp === "number" ? record.timestamp : clock(),
    };
    omissions.set(entry.id, entry);
  }

  /**
   * Record a fetch of context `id`. If `id` was previously omitted, this
   * is a page fault and a FaultRecord is returned. Otherwise returns null.
   *
   * @param {{id: string, tokens?: number, latencyMs?: number, reason?: string, timestamp?: number}} record
   * @returns {FaultRecord|null}
   */
  function recordFetch(record) {
    if (!record || typeof record.id !== "string") {
      throw new TypeError("recordFetch: record.id must be a string");
    }
    const id = record.id;
    const omission = omissions.get(id);
    if (!omission) return null;

    const fault = {
      id,
      tokens: typeof record.tokens === "number" ? record.tokens : omission.tokens,
      latencyMs: typeof record.latencyMs === "number" ? record.latencyMs : 0,
      reason: typeof record.reason === "string" ? record.reason : FAULT_REASONS.UNKNOWN,
      timestamp: typeof record.timestamp === "number" ? record.timestamp : clock(),
      omissionReason: omission.reason,
    };
    faults.push(fault);
    return fault;
  }

  /**
   * Convenience alias for recordFetch.
   *
   * @param {string} id
   * @param {{tokens?: number, latencyMs?: number, reason?: string}} [opts]
   * @returns {FaultRecord|null}
   */
  function recordFault(id, opts = {}) {
    return recordFetch({ id, ...(opts || {}) });
  }

  function snapshot() {
    let tokensOmitted = 0;
    let tokensFetched = 0;
    let tokensRefetched = 0;
    let totalLatencyMs = 0;
    let faultLatencyMs = 0;
    /** @type {Object<string, number>} */
    const faultsByReason = {};
    /** @type {Object<string, number>} */
    const omissionsByReason = {};

    for (const o of omissions.values()) {
      tokensOmitted += o.tokens;
      omissionsByReason[o.reason] = (omissionsByReason[o.reason] || 0) + 1;
    }
    for (const f of faults) {
      tokensRefetched += f.tokens;
      faultLatencyMs += f.latencyMs;
      totalLatencyMs += f.latencyMs;
      faultsByReason[f.reason] = (faultsByReason[f.reason] || 0) + 1;
    }
    const fetchCount = faults.length; // only faults count as fetches in this metric
    const faultCount = faults.length;
    const faultRate = fetchCount === 0 ? 0 : faultCount / fetchCount;

    return {
      omissionCount: omissions.size,
      fetchCount,
      faultCount,
      tokensOmitted,
      tokensFetched, // alias for tokensRefetched under fault-only mode
      tokensRefetched,
      totalLatencyMs,
      faultLatencyMs,
      faultsByReason,
      omissionsByReason,
      faultRate,
    };
  }

  function reset() {
    omissions.clear();
    faults.length = 0;
  }

  return {
    recordOmission,
    recordFetch,
    recordFault,
    omissions: () => Array.from(omissions.values()),
    faults: () => faults.slice(),
    snapshot,
    reset,
  };
}

/**
 * Run `fetchFn` against the tracker and return the resulting snapshot.
 * Useful for instrumenting an existing retrieveContext() call.
 *
 * The fetchFn receives a wrapped retrieveContext that automatically calls
 * recordFetch on every retrieval, attributing tokens/latency to faults when
 * applicable.
 *
 * @param {PageFaultTracker} tracker
 * @param {(retrieve: (id: string, opts?: object) => any) => Promise<any>|any} fetchFn
 * @returns {Promise<PageFaultSnapshot>|PageFaultSnapshot}
 */
export function measurePageFaults(tracker, fetchFn) {
  if (!tracker || typeof tracker.recordFetch !== "function") {
    throw new TypeError("measurePageFaults: tracker required");
  }
  if (typeof fetchFn !== "function") {
    throw new TypeError("measurePageFaults: fetchFn must be a function");
  }
  const wrapped = (id, opts = {}) => {
    const start = (opts && typeof opts._start === "number") ? opts._start : Date.now();
    const result = (opts && typeof opts._result === "object") ? opts._result : null;
    const tokens = result && typeof result.tokens === "number"
      ? result.tokens
      : (opts && typeof opts.tokens === "number" ? opts.tokens : 0);
    const latencyMs = result && typeof result.latencyMs === "number"
      ? result.latencyMs
      : Math.max(0, Date.now() - start);
    return tracker.recordFetch({
      id,
      tokens,
      latencyMs,
      reason: (opts && opts.reason) || "unknown",
    });
  };
  // NOTE: deliberately not async — returns snapshot directly.
  // If fetchFn returns a Promise, the caller should await.
  const out = fetchFn(wrapped);
  if (out && typeof out.then === "function") {
    return out.catch(() => {}).then(() => tracker.snapshot());
  }
  return tracker.snapshot();
}

/**
 * Compute per-fault aggregates grouped by omission reason.
 *
 * @param {FaultRecord[]} records
 * @returns {Object<string, {count: number, tokens: number, latencyMs: number}>}
 */
export function aggregateByReason(records) {
  /** @type {Object<string, {count: number, tokens: number, latencyMs: number}>} */
  const out = {};
  if (!Array.isArray(records)) return out;
  for (const r of records) {
    const key = (r && r.omissionReason) || FAULT_REASONS.UNKNOWN;
    if (!out[key]) out[key] = { count: 0, tokens: 0, latencyMs: 0 };
    out[key].count += 1;
    out[key].tokens += typeof r.tokens === "number" ? r.tokens : 0;
    out[key].latencyMs += typeof r.latencyMs === "number" ? r.latencyMs : 0;
  }
  return out;
}
