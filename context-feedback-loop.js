/**
 * Context Feedback Loop — Telemetry for learning from useful/useless retrievals.
 *
 * Change 77: Records retrieval outcomes (useful/useless) and adapts
 * future context selection based on historical effectiveness.
 *
 * Metrics tracked:
 *   - Retrieval success rate per source/type
 *   - Per-item usefulness score
 *   - Drift indicators (repeated useless retrievals)
 *
 * All data in-memory, deterministic. No external dependencies.
 */

/**
 * @typedef {Object} RetrievalEvent
 * @property {string} queryId - Identifier for the query/request
 * @property {string} itemId - The context item retrieved
 * @property {string} source - Source of the item
 * @property {string} type - Type of the item
 * @property {boolean} useful - Whether the item was actually useful
 * @property {number} timestamp - Unix ms
 * @property {string} [reason] - Optional reason for the rating
 */

/**
 * @typedef {Object} SourceStats
 * @property {number} total - Total retrievals from this source
 * @property {number} useful - How many were rated useful
 * @property {number} useless - How many were rated useless
 * @property {number} score - useful / total (0-1)
 */

/**
 * @typedef {Object} ItemStats
 * @property {number} total - Times retrieved
 * @property {number} useful - Times rated useful
 * @property {number} lastUsed - Last timestamp
 * @property {number} score - useful / total
 */

class FeedbackLoop {
  constructor() {
    /** @type {RetrievalEvent[]} */
    this._events = [];
    /** @type {Map<string, ItemStats>} */
    this._itemStats = new Map();
    /** @type {Map<string, SourceStats>} */
    this._sourceStats = new Map();
  }

  /**
   * Record a retrieval outcome.
   * @param {RetrievalEvent} event
   */
  record(event) {
    if (!event || !event.itemId || !event.queryId) {
      throw new TypeError("Event must have itemId and queryId");
    }
    if (typeof event.useful !== "boolean") {
      throw new TypeError("Event must have boolean useful field");
    }

    const timestamp = event.timestamp || Date.now();
    const enriched = { ...event, timestamp };
    this._events.push(enriched);

    // Update item stats
    const itemKey = event.itemId;
    const itemStats = this._itemStats.get(itemKey) || {
      total: 0, useful: 0, useless: 0, lastUsed: 0, score: 0,
    };
    itemStats.total++;
    if (event.useful) {
      itemStats.useful++;
    } else {
      itemStats.useless++;
    }
    itemStats.lastUsed = timestamp;
    itemStats.score = itemStats.useful / itemStats.total;
    this._itemStats.set(itemKey, itemStats);

    // Update source stats
    const srcKey = event.source || "unknown";
    const srcStats = this._sourceStats.get(srcKey) || {
      total: 0, useful: 0, useless: 0, score: 0,
    };
    srcStats.total++;
    if (event.useful) {
      srcStats.useful++;
    } else {
      srcStats.useless++;
    }
    srcStats.score = srcStats.total > 0 ? srcStats.useful / srcStats.total : 0;
    this._sourceStats.set(srcKey, srcStats);
  }

  /**
   * Get stats for a specific item.
   * @param {string} itemId
   * @returns {ItemStats | undefined}
   */
  getItemStats(itemId) {
    return this._itemStats.get(itemId);
  }

  /**
   * Get stats for a specific source.
   * @param {string} source
   * @returns {SourceStats | undefined}
   */
  getSourceStats(source) {
    return this._sourceStats.get(source);
  }

  /**
   * Get all recorded events.
   * @returns {RetrievalEvent[]}
   */
  getEvents() {
    return [...this._events];
  }

  /**
   * Get items that were rated useless more than threshold times.
   * These should be deprioritized or excluded in future retrievals.
   * @param {number} [minUseless=3] - Minimum useless count to flag
   * @returns {string[]} Item IDs
   */
  getUselessItems(minUseless = 3) {
    const result = [];
    for (const [id, stats] of this._itemStats) {
      if (stats.useless >= minUseless) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Get sources with a success rate below threshold.
   * @param {number} [minScore=0.2] - Minimum useful ratio
   * @returns {string[]} Source names
   */
  getLowPerformSources(minScore = 0.2) {
    const result = [];
    for (const [name, stats] of this._sourceStats) {
      if (stats.total >= 2 && stats.score < minScore) {
        result.push(name);
      }
    }
    return result;
  }

  /**
   * Get overall effectiveness score across all retrievals.
   * @returns {number} 0-1
   */
  overallScore() {
    if (this._events.length === 0) return 0;
    const useful = this._events.filter((e) => e.useful).length;
    return useful / this._events.length;
  }

  /**
   * Get the most useful items (score = 1.0), sorted by lastUsed desc.
   * @param {number} [limit=10]
   * @returns {string[]}
   */
  getTopItems(limit = 10) {
    const top = [];
    for (const [id, stats] of this._itemStats) {
      if (stats.score === 1.0) {
        top.push({ id, lastUsed: stats.lastUsed });
      }
    }
    top.sort((a, b) => b.lastUsed - a.lastUsed);
    return top.slice(0, limit).map((i) => i.id);
  }

  /**
   * Clear all telemetry data.
   */
  reset() {
    this._events = [];
    this._itemStats.clear();
    this._sourceStats.clear();
  }

  /**
   * Get summary statistics for the feedback loop.
   * @returns {Object}
   */
  summary() {
    return {
      totalEvents: this._events.length,
      overallScore: this.overallScore(),
      uniqueItems: this._itemStats.size,
      uniqueSources: this._sourceStats.size,
      topSources: [...this._sourceStats.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 5)
        .map(([name, stats]) => ({ name, score: stats.score, total: stats.total })),
    };
  }
}

/**
 * Factory function for creating a feedback loop (convenience).
 * @returns {FeedbackLoop}
 */
export function createFeedbackLoop() {
  return new FeedbackLoop();
}

export { FeedbackLoop };
