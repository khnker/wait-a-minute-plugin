/**
 * Context Loop Prevention — Detect repetitive query/source/decision loops.
 *
 * Change 80: Loop detection based on identical query/sources/decision sequences.
 *
 * When an agent repeatedly asks for the same context, makes the same
 * decisions, or follows identical reasoning chains, this module detects
 * the loop and signals that intervention is needed.
 *
 * Detection strategies:
 *   1. Exact query repetition
 *   2. Source set repetition (same sources used N times)
 *   3. Decision sequence repetition (same decisions in same order)
 *   4. Action hash cycle detection
 */

/**
 * @typedef {Object} LoopEvent
 * @property {string} id - Event identifier
 * @property {string} type - "query" | "source" | "decision" | "action"
 * @property {string} fingerprint - Hash/key for deduplication
 * @property {number} timestamp - Unix ms
 * @property {Object} [data] - Additional context
 */

/**
 * @typedef {Object} LoopDetection
 * @property {boolean} loopDetected
 * @property {string} type - Type of loop detected
 * @property {number} occurrences - How many times the pattern repeated
 * @property {number} windowStart - First occurrence timestamp
 * @property {number} windowEnd - Last occurrence timestamp
 * @property {string[]} items - The repeated items
 * @property {number} confidence - 0-1 confidence of loop
 */

/**
 * @typedef {Object} LoopConfig
 * @property {number} [maxEvents=1000] - Max events to track
 * @property {number} [minOccurrences=3] - Min repetitions to flag loop
 * @property {number} [windowMs=300000] - Time window for loop detection (5min default)
 * @property {number} [maxUniqueItems=100] - Max unique fingerprints to track
 */

const DEFAULT_CONFIG = {
  maxEvents: 1000,
  minOccurrences: 3,
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxUniqueItems: 100,
};

/**
 * Simple deterministic hash for strings.
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create a fingerprint for a query.
 * @param {Object} query
 * @returns {string}
 */
function queryFingerprint(query) {
  if (typeof query === "string") return simpleHash(query);
  if (query && query.text) return simpleHash(query.text);
  if (query && query.q) return simpleHash(query.q);
  return simpleHash(JSON.stringify(query || ""));
}

class ContextLoopDetector {
  /**
   * @param {LoopConfig} [config={}]
   */
  constructor(config = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    /** @type {LoopEvent[]} */
    this._events = [];
    /** @type {Map<string, number[]>} */
    this._occurrenceIndex = new Map(); // fingerprint -> timestamps
  }

  /**
   * Record a query/action/decision event.
   * @param {"query"|"source"|"decision"|"action"} type
   * @param {Object|string} item - The item or query string
   * @param {Object} [data] - Additional data
   * @returns {LoopEvent}
   */
  record(type, item, data = {}) {
    if (!type || !item) {
      throw new TypeError("type and item are required");
    }

    const fingerprint = this._fingerprint(type, item);
    const timestamp = Date.now();

    const event = {
      id: `loop_${simpleHash(fingerprint + timestamp)}`,
      type,
      fingerprint,
      timestamp,
      data,
    };

    this._events.push(event);

    // Track occurrences
    if (!this._occurrenceIndex.has(fingerprint)) {
      this._occurrenceIndex.set(fingerprint, []);
    }
    const timestamps = this._occurrenceIndex.get(fingerprint);
    timestamps.push(timestamp);

    // Cleanup: prune old events beyond max
    if (this._events.length > this._config.maxEvents) {
      this._events = this._events.slice(-this._config.maxEvents);
    }
    if (this._occurrenceIndex.size > this._config.maxUniqueItems) {
      // Remove oldest entries
      const entries = [...this._occurrenceIndex.entries()].sort(
        (a, b) => Math.min(...a[1]) - Math.min(...b[1])
      );
      for (let i = 0; i < Math.floor(this._config.maxUniqueItems / 2); i++) {
        this._occurrenceIndex.delete(entries[i][0]);
      }
    }

    return event;
  }

  /**
   * Generate fingerprint based on event type.
   */
  _fingerprint(type, item) {
    if (type === "query") return queryFingerprint(item);
    if (type === "source") {
      const src = typeof item === "string" ? item : item.id || item.name || JSON.stringify(item);
      return `src:${simpleHash(src)}`;
    }
    if (type === "decision") {
      return `dec:${simpleHash(JSON.stringify(item))}`;
    }
    if (type === "action") {
      const act = typeof item === "string" ? item : item.type || item.name || JSON.stringify(item);
      return `act:${simpleHash(act)}`;
    }
    return simpleHash(JSON.stringify(item));
  }

  /**
   * Check if a fingerprint has been seen within the time window.
   * @param {string} fingerprint
   * @returns {LoopDetection | null}
   */
  check(fingerprint) {
    const timestamps = this._occurrenceIndex.get(fingerprint);
    if (!timestamps || timestamps.length < this._config.minOccurrences) {
      return null;
    }

    const now = Date.now();
    const windowStart = now - this._config.windowMs;
    const recent = timestamps.filter((t) => t >= windowStart);

    if (recent.length < this._config.minOccurrences) {
      return null;
    }

    return {
      loopDetected: true,
      type: "repetition",
      occurrences: recent.length,
      windowStart: recent[0],
      windowEnd: recent[recent.length - 1],
      items: [fingerprint],
      confidence: Math.min(1, recent.length / (this._config.minOccurrences + 2)),
    };
  }

  /**
   * Check for loops across all tracked fingerprints.
   * @returns {LoopDetection[]}
   */
  checkAll() {
    const loops = [];
    for (const [fingerprint] of this._occurrenceIndex) {
      const result = this.check(fingerprint);
      if (result) {
        loops.push(result);
      }
    }
    return loops.sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Record a query and immediately check for loops.
   * @param {Object|string} query
   * @param {Object} [data]
   * @returns {LoopDetection | null}
   */
  recordQuery(query, data = {}) {
    this.record("query", query, data);
    return this.check(queryFingerprint(query));
  }

  /**
   * Record a decision sequence and check if the same sequence repeats.
   * @param {string[]} decisions - Ordered list of decision IDs
   * @returns {LoopDetection | null}
   */
  recordDecisionSequence(decisions) {
    if (!Array.isArray(decisions)) {
      throw new TypeError("decisions must be an array");
    }
    const fingerprint = `seq:${simpleHash(decisions.join("|"))}`;
    this.record("decision", decisions);
    return this.check(fingerprint);
  }

  /**
   * Get statistics about recorded events.
   * @returns {Object}
   */
  stats() {
    let mostCommon = null;
    let maxCount = 0;
    for (const [fp, timestamps] of this._occurrenceIndex) {
      if (timestamps.length > maxCount) {
        maxCount = timestamps.length;
        mostCommon = fp;
      }
    }
    return {
      totalEvents: this._events.length,
      uniqueFingerprints: this._occurrenceIndex.size,
      mostRepeated: mostCommon ? { fingerprint: mostCommon, count: maxCount } : null,
      config: this._config,
    };
  }

  /**
   * Clear all recorded data.
   */
  reset() {
    this._events = [];
    this._occurrenceIndex.clear();
  }
}

/**
 * Factory function for creating a loop detector (convenience).
 * @param {LoopConfig} [config={}]
 * @returns {ContextLoopDetector}
 */
export function createLoopDetector(config = {}) {
  return new ContextLoopDetector(config);
}

/**
 * Quick one-shot loop check: given an array of recent items (strings),
 * detect if any item appears too frequently.
 * @param {string[]} items
 * @param {number} [threshold=3]
 * @returns {string[]} Items that repeat too often
 */
export function quickLoopCheck(items, threshold = 3) {
  const counts = new Map();
  for (const item of items) {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const loops = [];
  for (const [item, count] of counts) {
    if (count >= threshold) {
      loops.push(item);
    }
  }
  return loops;
}

export { ContextLoopDetector };
