/**
 * Context Interception — filter and prioritize raw context before it reaches the LLM.
 *
 * Change 75: interceptContext(raw)
 *
 * Provides a gate through which all raw context must pass before being
 * sent to the LLM. Filters noise, deduplicates, and re-sorts by
 * relevance/priority. Deterministic, no side effects.
 *
 * Pipeline stages:
 *   1. Deduplicate (by id or content hash)
 *   2. Filter (by type, scope, relevance score, custom predicates)
 *   3. Prioritize (sort by score, then by recency)
 *   4. Cap (limit to maxItems)
 */

/**
 * @typedef {Object} InterceptedItem
 * @property {string} id
 * @property {string} content
 * @property {string} source
 * @property {string} type
 * @property {number} timestamp
 * @property {string} scope
 * @property {number} relevanceScore
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} InterceptOptions
 * @property {number} [maxItems=50] - Maximum items after interception
 * @property {string[]} [allowedTypes] - Only include these types
 * @property {string[]} [allowedScopes] - Only include these scopes
 * @property {number} [minRelevance=0] - Minimum relevance score 0-1
 * @property {Function} [predicate] - Custom filter predicate (item => boolean)
 * @property {string[]} [priorityTypes] - Types sorted first (higher priority)
 * @property {boolean} [deduplicate=true] - Deduplicate by id
 */

/**
 * Compute a simple relevance score for an item.
 * Higher = more relevant. Based on presence of keywords and recency.
 * @param {Object} item
 * @param {string[]} [keywords]
 * @returns {number}
 */
export function relevanceScore(item, keywords = []) {
  if (!item || !item.content) return 0.5;
  const content = String(item.content).toLowerCase();
  let score = 0.5;
  if (keywords.length > 0) {
    const matches = keywords.filter((kw) => content.includes(kw.toLowerCase()));
    score = 0.5 + (matches.length / keywords.length) * 0.5;
  }
  // Recency bonus: newer items slightly boosted
  const age = Date.now() - (item.timestamp || 0);
  const hoursOld = age / (1000 * 60 * 60);
  const recencyBonus = Math.max(0, 0.1 - hoursOld * 0.001);
  return Math.min(1, Math.max(0, score + recencyBonus));
}

/**
 * Change 75 — interceptContext
 *
 * Filters, deduplicates, prioritizes, and caps raw context items
 * before they reach the LLM.
 *
 * @param {Object[]} raw - Array of raw context items
 * @param {InterceptOptions} [options={}]
 * @returns {InterceptedItem[]} Filtered and ordered items
 */
export function interceptContext(raw, options = {}) {
  if (!Array.isArray(raw)) {
    throw new TypeError("raw must be an array");
  }

  const {
    maxItems = 50,
    allowedTypes = null,
    allowedScopes = null,
    minRelevance = 0,
    predicate = null,
    priorityTypes = [],
    deduplicate = true,
  } = options;

  // Stage 1: Deduplicate by id
  let items = raw;
  if (deduplicate) {
    const seen = new Set();
    items = raw.filter((item) => {
      if (!item || !item.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  // Stage 2: Filter
  items = items.filter((item) => {
    if (!item || !item.id) return false;
    if (allowedTypes && !allowedTypes.includes(item.type)) return false;
    if (allowedScopes && !allowedScopes.includes(item.scope)) return false;
    if (predicate && !predicate(item)) return false;
    return true;
  });

  // Stage 3: Score and sort
  items = items.map((item) => ({
    ...item,
    relevanceScore: relevanceScore(item, options.keywords || []),
  }));

  // Sort by: priority type first, then relevance score desc, then timestamp desc
  items.sort((a, b) => {
    const aPriority = priorityTypes.indexOf(a.type);
    const bPriority = priorityTypes.indexOf(b.type);
    const aRank = aPriority === -1 ? Infinity : aPriority;
    const bRank = bPriority === -1 ? Infinity : bPriority;
    if (aRank !== bRank) return aRank - bRank;
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  // Stage 4: Apply min relevance and cap
  items = items.filter((item) => item.relevanceScore >= minRelevance);
  items = items.slice(0, maxItems);

  return items;
}

/**
 * Build a quick filter that only keeps items matching a set of requirement IDs.
 * Useful when only context related to specific requirements should reach the LLM.
 * @param {string[]} requirementIds
 * @returns {InterceptOptions}
 */
export function requirementFilter(requirementIds) {
  return {
    predicate: (item) => {
      const reqs = item.relatedRequirements || [];
      return reqs.some((r) => requirementIds.includes(r));
    },
  };
}
