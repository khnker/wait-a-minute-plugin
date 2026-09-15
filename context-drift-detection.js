/**
 * Context Drift Detection — Detect when agent actions diverge from goals.
 *
 * Change 79: detectContextDrift(agentAction, goal)
 *
 * Compares an agent action against the stated goal using the
 * current context as reference. Determines if the agent is
 * drifting off-course.
 *
 * Detection methods:
 *   1. Content similarity (keyword overlap)
 *   2. Action type mismatch
 *   3. Temporal patterns (repeated off-topic actions)
 *   4. Goal achievement progress stagnation
 */

/**
 * @typedef {Object} DriftResult
 * @property {boolean} drifted - Whether drift was detected
 * @property {number} score - Drift score (0=aligned, 1=fully drifted)
 * @property {string} reason - Human-readable explanation
 * @property {string[]} signals - Specific signals that triggered detection
 * @property {number} confidence - 0-1 confidence level
 */

/**
 * @typedef {Object} DriftConfig
 * @property {number} [threshold=0.4] - Score above which drift is flagged
 * @property {number} [keywordWeight=0.4] - Weight of keyword overlap
 * @property {number} [typeWeight=0.3] - Weight of type alignment
 * @property {number} [recencyWeight=0.3] - Weight of recency factor
 */

const DEFAULT_CONFIG = {
  threshold: 0.4,
  keywordWeight: 0.4,
  typeWeight: 0.3,
  recencyWeight: 0.3,
};

/**
 * Tokenize text into meaningful words (ignore stop words).
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "because", "but", "and", "or", "nor", "if", "while", "about", "up",
  ]);
  return String(text)
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Compute Jaccard-like similarity between two word sets.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0-1
 */
function wordOverlap(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// Known action types that are generally safe (goal-aligned)
const SAFE_ACTION_TYPES = new Set([
  "task", "requirement", "decision", "verification", "observation",
  "evidence", "clarification", "plan", "implementation", "analysis",
]);

// Known action types that may indicate drift
const DRIFT_ACTION_TYPES = new Set([
  "exploration", "idle", "waiting", "redundant", "wander", "miscategorize",
]);

/**
 * Change 79 — detectContextDrift
 *
 * Determines whether an agent action represents drift from the stated goal,
 * considering the current context.
 *
 * @param {Object} agentAction - The action taken by the agent
 * @param {string} goal - The original goal/objective
 * @param {Object} [context] - Current context (optional, improves accuracy)
 * @param {DriftConfig} [config={}] - Detection configuration
 * @returns {DriftResult}
 */
export function detectContextDrift(agentAction, goal, context = null, config = {}) {
  if (!agentAction || typeof agentAction !== "object") {
    return {
      drifted: false,
      score: 0,
      reason: "No action provided",
      signals: [],
      confidence: 0,
    };
  }
  if (!goal || typeof goal !== "string") {
    return {
      drifted: false,
      score: 0,
      reason: "No goal provided",
      signals: [],
      confidence: 0,
    };
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const content = String(agentAction.content || agentAction.description || agentAction.name || "");
  const actionType = String(agentAction.type || agentAction.category || "");
  const signals = [];
  let totalScore = 0;
  let totalWeight = 0;

  // Method 1: Keyword/semantic overlap
  const goalWords = tokenize(goal);
  const actionWords = tokenize(content);
  const overlap = wordOverlap(goalWords, actionWords);
  totalScore += cfg.keywordWeight * overlap;
  totalWeight += cfg.keywordWeight;
  if (overlap < 0.2 && content.length > 5) {
    signals.push(`low_keyword_overlap:${Math.round(overlap * 100)}%`);
  }

  // Method 2: Action type alignment
  let typeScore = 0.5; // neutral default
  if (actionType) {
    if (SAFE_ACTION_TYPES.has(actionType.toLowerCase())) {
      typeScore = 0.9;
    } else if (DRIFT_ACTION_TYPES.has(actionType.toLowerCase())) {
      typeScore = 0.1;
      signals.push(`drift_action_type:${actionType}`);
    } else {
      // Unknown type: check if it contains goal-related words
      const typeWords = tokenize(actionType);
      typeScore = 0.5 + wordOverlap(goalWords, typeWords) * 0.5;
    }
  } else {
    signals.push("no_action_type");
    typeScore = 0.4;
  }
  totalScore += cfg.typeWeight * typeScore;
  totalWeight += cfg.typeWeight;

  // Method 3: Recency (if context has timestamps)
  if (context && context.timestamp) {
    const age = Date.now() - context.timestamp;
    const hoursOld = age / (1000 * 60 * 60);
    const recencyScore = Math.max(0.1, 1 - hoursOld * 0.05);
    totalScore += cfg.recencyWeight * recencyScore;
    totalWeight += cfg.recencyWeight;
  } else {
    // No context timestamp = moderate confidence assumption
    totalScore += cfg.recencyWeight * 0.5;
    totalWeight += cfg.recencyWeight;
  }

  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const drifted = finalScore < cfg.threshold;

  // Confidence: higher when signals are consistent
  const confidence = drifted
    ? Math.min(1, 0.5 + signals.length * 0.15)
    : Math.min(1, 0.6 + (1 - finalScore) * 0.4);

  return {
    drifted,
    score: Math.round(finalScore * 1000) / 1000,
    reason: drifted
      ? `Drift detected (score: ${finalScore.toFixed(3)}): ${signals.join(", ") || "low similarity"}`
      : `No drift (score: ${finalScore.toFixed(3)}): action aligned with goal`,
    signals,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

/**
 * Track drift over multiple actions and detect patterns.
 *
 * @param {Object[]} actions - Array of agent actions
 * @param {string} goal - The original goal
 * @param {DriftConfig} [config] - Detection configuration
 * @returns {Object}
 */
export function trackDriftPattern(actions, goal, config = {}) {
  if (!Array.isArray(actions)) {
    throw new TypeError("actions must be an array");
  }

  const results = actions.map((action) => detectContextDrift(action, goal, null, config));
  const driftCount = results.filter((r) => r.drifted).length;
  const totalActions = results.length;
  const driftRate = totalActions > 0 ? driftCount / totalActions : 0;

  return {
    totalActions,
    driftCount,
    driftRate: Math.round(driftRate * 1000) / 1000,
    isPattern: driftRate >= 0.5 && totalActions >= 3,
    results,
    summary: {
      consistentDrift: driftRate >= 0.7,
      intermittentDrift: driftRate >= 0.3 && driftRate < 0.7,
      mostlyAligned: driftRate < 0.3,
    },
  };
}
