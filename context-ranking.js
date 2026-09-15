/**
 * Context Ranking — Relevance Scoring & Ranking.
 *
 * Change 70: Implements multi-signal ranking for context retrieval.
 * Scores combine term matching, recency, importance, lifecycle state,
 * and provenance quality.
 *
 * Ranking formula (weighted sum):
 *   score = w1 * termMatch + w2 * recency + w3 * importance + w4 * lifecycleBoost
 *
 * Invariant: All scores normalized to [0, 1] range. Higher = more relevant.
 */

const WEIGHTS = Object.freeze({
  termMatch: 0.40,
  recency: 0.15,
  importance: 0.25,
  lifecycle: 0.10,
  provenance: 0.10,
});

const LIFECYCLE_BOOST = Object.freeze({
  ACTIVE: 1.0,
  CREATED: 0.8,
  COMPRESSED: 0.4,
  STALE: 0.2,
  INVALIDATED: 0.0,
  ARCHIVED: 0.1,
});

const PROVENANCE_BOOST = Object.freeze({
  user_decided: 1.0,
  observed: 0.7,
  inferred: 0.3,
});

/**
 * Tokenizes text into a set of lowercase terms.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text = "") {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

/**
 * Computes term overlap ratio between query and item text.
 * @param {string} query
 * @param {string} itemText
 * @returns {number} 0..1
 */
function computeTermMatch(query, itemText) {
  const queryTokens = tokenize(query);
  const itemTokens = tokenize(itemText);
  if (!queryTokens.size || !itemTokens.size) return 0;

  let hits = 0;
  for (const t of queryTokens) {
    if (itemTokens.has(t)) hits++;
  }
  return hits / queryTokens.size;
}

/**
 * Computes recency score based on item timestamp.
 * More recent = higher score. Decays over 30 days.
 * @param {number} [timestamp]
 * @param {number} [now]
 * @returns {number} 0..1
 */
function computeRecency(timestamp, now = Date.now()) {
  if (!timestamp) return 0.5;
  const ageMs = now - timestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential decay: 1.0 at 0 days, ~0.1 at 30 days
  return Math.exp(-ageDays / 30);
}

/**
 * Computes importance score from item metadata.
 * @param {number} [importance]
 * @returns {number} 0..1
 */
function computeImportance(importance) {
  if (typeof importance !== "number") return 0.5;
  return Math.min(1, Math.max(0, importance / 10));
}

/**
 * Computes lifecycle boost factor.
 * @param {string} lifecycle
 * @returns {number}
 */
function computeLifecycleBoost(lifecycle) {
  return LIFECYCLE_BOOST[lifecycle] ?? 0.3;
}

/**
 * Computes provenance quality factor.
 * @param {string} provenance
 * @returns {number}
 */
function computeProvenanceBoost(provenance) {
  return PROVENANCE_BOOST[provenance] ?? 0.3;
}

/**
 * Ranks context items by multi-signal relevance scoring.
 *
 * @param {Array} items - Context items to rank.
 * @param {string} query - Search query for term matching.
 * @param {Object} [options]
 * @param {string[]} [options.requiredTerms] - Terms that must appear (binary filter).
 * @param {Object} [options.weights] - Override default weights.
 * @returns {Array} Items sorted by relevanceScore descending, with score attached.
 */
export function rankContextItems(items, query, options = {}) {
  const { requiredTerms = [], weights = {} } = options;
  const w = { ...WEIGHTS, ...weights };

  // Validate weights sum ~1.0 (informational only)
  const weightSum = Object.values(w).reduce((a, b) => a + b, 0);

  return items
    .map((item) => {
      const text = item.content || item.label || item.text || item.summary || `${item.id}`;
      const termScore = computeTermMatch(query, text);
      const recencyScore = computeRecency(item.timestamp || item.updatedAt);
      const importanceScore = computeImportance(item.importance);
      const lifecycleScore = computeLifecycleBoost(item.lifecycle);
      const provenanceScore = computeProvenanceBoost(item.provenance);

      // Required terms binary filter (not a score component)
      if (requiredTerms.length > 0) {
        const itemTokens = tokenize(text);
        const allRequiredPresent = requiredTerms.every((t) => itemTokens.has(t.toLowerCase()));
        if (!allRequiredPresent) {
          return { ...item, relevanceScore: 0, relevanceReason: "required_terms_missing" };
        }
      }

      const compositeScore =
        w.termMatch * termScore +
        w.recency * recencyScore +
        w.importance * importanceScore +
        w.lifecycle * lifecycleScore +
        w.provenance * provenanceScore;

      return {
        ...item,
        relevanceScore: Math.round(compositeScore * 1000) / 1000,
        relevanceReason: `term:${termScore.toFixed(2)} recency:${recencyScore.toFixed(2)} importance:${importanceScore.toFixed(2)}`,
      };
    })
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}

export { WEIGHTS, LIFECYCLE_BOOST, PROVENANCE_BOOST };
