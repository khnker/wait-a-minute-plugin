/**
 * Context Retrieval — retrieveContext(query, constraints).
 *
 * Change 69: Retrieves context items from a ContextManager/registry
 * based on requirement relevance. Uses ranking from context-ranking.js
 * and respects constraint filters (layer, lifecycle, admission).
 *
 * Invariant: Returns results ordered by relevance score (descending).
 * Items that don't satisfy mandatory constraints are excluded.
 */

import { rankContextItems } from "./context-ranking.js";

/**
 * @typedef {Object} RetrievalConstraints
 * @property {string[]} [layers] - Filter by memory layers (N0..N3, ARCHIVE).
 * @property {string[]} [lifecycle] - Filter by lifecycle states.
 * @property {string[]} [admission] - Filter by admission class.
 * @property {number} [maxResults] - Max items to return.
 * @property {number} [minScore] - Minimum relevance score threshold.
 * @property {string[]} [requiredTerms] - Terms that must appear.
 * @property {string[]} [excludedIds] - Item IDs to exclude.
 */

/**
 * @typedef {Object} RetrievalResult
 * @property {Array} items - Ranked context items.
 * @property {number} total - Total items before limiting.
 * @property {number} returned - Number of items returned.
 * @property {number} elapsedMs - Query execution time.
 */

/**
 * Retrieves and ranks context items based on query relevance and constraints.
 *
 * @param {string} query - Search query / requirement text.
 * @param {RetrievalConstraints} [constraints={}] - Filter and limit options.
 * @returns {RetrievalResult}
 */
export function retrieveContext(query, constraints = {}) {
  const startTime = Date.now();
  const {
    layers,
    lifecycle,
    admission,
    maxResults = 50,
    minScore = 0,
    requiredTerms = [],
    excludedIds = [],
  } = constraints;

  // Admission class filter (MANDATORY/CONDITIONAL/OPTIONAL)
  const admissionFilter = (item) => {
    if (!admission || !admission.length) return true;
    const itemAdmission = item.admission || item.admissionClass || "OPTIONAL";
    return admission.includes(itemAdmission);
  };

  // Retrieve from ContextManager if provided, or use registry directly.
  // Note: `manager` is used for API compatibility (not a standard property).
  const registry = constraints.registry || constraints.manager;
  let items = [];

  if (registry) {
    const allItems = registry.list ? registry.list() : Object.values(registry);
    items = allItems.filter((item) => {
      if (layers && !layers.includes(item.memoryLayer)) return false;
      if (lifecycle && !lifecycle.includes(item.lifecycle)) return false;
      if (excludedIds.includes(item.id)) return false;
      if (!admissionFilter(item)) return false;
      return true;
    });
  }

  // Rank by relevance to query
  const ranked = rankContextItems(items, query, { requiredTerms });

  // Apply min score filter
  const filtered = ranked.filter((item) => {
    const score = item.relevanceScore ?? 0;
    return score >= minScore;
  });

  const total = filtered.length;
  const result = filtered.slice(0, maxResults);

  return {
    items: result,
    total,
    returned: result.length,
    elapsedMs: Date.now() - startTime,
  };
}
