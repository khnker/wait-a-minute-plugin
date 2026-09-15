/**
 * Context Classification — categorize context items into semantic types.
 *
 * Categories: FACT, OBSERVATION, CLAIM, ASSUMPTION, DECISION,
 * REQUIREMENT, EVIDENCE, ERROR, ACTION, RESULT.
 *
 * Each raw context record is classified by examining its type, content
 * signals, and metadata flags. The classifier is rule-based and deterministic.
 */

/** @typedef {"FACT"|"OBSERVATION"|"CLAIM"|"ASSUMPTION"|"DECISION"|"REQUIREMENT"|"EVIDENCE"|"ERROR"|"ACTION"|"RESULT"} ContextCategory */

/**
 * @typedef {Object} ClassificationResult
 * @property {ContextCategory} category
 * @property {number} confidence 0-1
 * @property {string[]} signals
 */

// Signal keywords mapped to categories (lowercase matching)
const CATEGORY_SIGNALS = {
  FACT: ["is", "are", "was", "were", "has", "have", "contains", "version", "file", "path", "directory", "exists", "size", "hash"],
  OBSERVATION: ["observed", "noticed", "detected", "saw", "watched", "monitor", "check", "scan", "logged", "found"],
  CLAIM: ["claim", "assert", "state", "alleged", "purported", "reported"],
  ASSUMPTION: ["assume", "presume", "hypothesis", "suppose", "likely", "probably", "might", "may", "could"],
  DECISION: ["decide", "decision", "chose", "choose", "selected", "approved", "rejected", "resolve", "concluded"],
  REQUIREMENT: ["must", "should", "required", "requirement", "need to", "necessary", "mandatory", "shall", "must not"],
  EVIDENCE: ["evidence", "proof", "data", "result", "test", "benchmark", "measure", "metric", "sample"],
  ERROR: ["error", "fail", "exception", "throw", "crash", "fault", "exception", "bug", "broken", "stack"],
  ACTION: ["action", "run", "execute", "perform", "task", "step", "do", "implement", "create", "delete", "update"],
  RESULT: ["result", "outcome", "concluded", "finished", "complete", "success", "passed", "failed", "done"],
};

// Type-to-category hints (when content signals are ambiguous)
const TYPE_HINTS = {
  fact: "FACT",
  observation: "OBSERVATION",
  claim: "CLAIM",
  assumption: "ASSUMPTION",
  decision: "DECISION",
  requirement: "REQUIREMENT",
  evidence: "EVIDENCE",
  error: "ERROR",
  action: "ACTION",
  result: "RESULT",
  tool_call: "ACTION",
  tool_result: "RESULT",
  agent_message: "OBSERVATION",
  system_message: "FACT",
  file_modification: "ACTION",
  git_change: "ACTION",
  requirement_change: "REQUIREMENT",
  verification_result: "RESULT",
  clarification_request: "ACTION",
  reasoning: "ASSUMPTION",
  assumption: "ASSUMPTION",
  plan: "ACTION",
  rationale: "CLAIM",
};

/**
 * Extract text to analyze from a context item.
 * @param {Object} item
 * @returns {string}
 */
function extractText(item) {
  if (!item || typeof item !== "object") return "";
  if (typeof item.content === "string") return item.content;
  if (typeof item.summary === "string") return item.summary;
  if (typeof item.description === "string") return item.description;
  if (item.metadata && typeof item.metadata === "object") {
    const parts = [
      item.metadata.summary,
      item.metadata.description,
      item.metadata.content,
    ];
    return parts.filter(Boolean).join(" ");
  }
  return JSON.stringify(item.content || "");
}

/**
 * Score a category by counting matching signals in text.
 * Uses word boundary matching to avoid false positives from substrings.
 * @param {string} text
 * @param {string} category
 * @returns {number}
 */
function scoreCategory(text, category) {
  const signals = CATEGORY_SIGNALS[category] || [];
  let score = 0;
  for (const signal of signals) {
    const s = typeof signal === "string" ? signal : String(signal);
    const sl = s.toLowerCase();
    // Word boundary match: either start of string/non-word char before, or end of string/non-word char after
    const regex = new RegExp(`(?:^|[^a-z0-9_])(${sl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?:[^a-z0-9_]|$)`, "i");
    if (regex.test(text)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Classify a context item into a category.
 * @param {Object} item - Context item with type, content, metadata
 * @returns {ClassificationResult}
 */
export function classifyContextItem(item) {
  if (!item || typeof item !== "object") {
    return { category: "FACT", confidence: 0.3, signals: ["default"] };
  }

  const text = extractText(item);
  const type = (item.type || "").toLowerCase();
  const metadata = item.metadata || {};

  // Check explicit category in metadata first
  if (metadata.category && typeof metadata.category === "string") {
    const cat = metadata.category.toUpperCase();
    if (Object.keys(CATEGORY_SIGNALS).includes(cat)) {
      return { category: cat, confidence: 0.95, signals: ["metadata_explicit"] };
    }
  }

  // Check explicit classification field
  if (item.classification && typeof item.classification === "string") {
    const cat = item.classification.toUpperCase();
    if (Object.keys(CATEGORY_SIGNALS).includes(cat)) {
      return { category: cat, confidence: 0.9, signals: ["explicit_classification"] };
    }
  }

  // Score by signal keywords (word-boundary matched)
  const scores = {};
  for (const [category, signals] of Object.entries(CATEGORY_SIGNALS)) {
    scores[category] = scoreCategory(text, category);
  }

  // ERROR gets forced priority when signals present
  if (scores.ERROR >= 1) {
    return { category: "ERROR", confidence: 0.9, signals: ["error_signal"] };
  }

  // Type-based classification (primary)
  const typeHint = TYPE_HINTS[type] || "FACT";

  let bestCategory = typeHint;
  let bestScore = scores[typeHint] || 0;
  let bestIsTypeHint = typeHint !== "FACT";

  // Override with stronger signal matches
  for (const [category, score] of Object.entries(scores)) {
    if (category !== "ERROR" && score > bestScore) {
      bestScore = score;
      bestCategory = category;
      bestIsTypeHint = false;
    }
  }

  // Determine confidence
  let confidence;
  if (bestIsTypeHint && bestScore === 0) {
    confidence = 0.6;
  } else if (bestScore >= 3) {
    confidence = 0.9;
  } else if (bestScore >= 1) {
    confidence = 0.75;
  } else if (typeHint) {
    confidence = 0.65;
  } else {
    confidence = 0.5;
  }

  const signals = [];
  if (metadata.category) signals.push("metadata");
  if (item.classification) signals.push("explicit");
  if (typeHint) signals.push(`type:${type}`);
  if (bestScore > 0) signals.push(`${bestScore}_signals`);

  return { category: bestCategory, confidence, signals };
}

/**
 * Batch-classify multiple items.
 * @param {Object[]} items
 * @returns {ClassificationResult[]}
 */
export function classifyContextItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(classifyContextItem);
}
