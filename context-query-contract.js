import { LIFECYCLE_STATES } from "./context-lifecycle.js";
import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";

export const CONTEXT_PURPOSE = Object.freeze({
  PLANNING: "PLANNING",
  IMPLEMENTATION: "IMPLEMENTATION",
  INVESTIGATION: "INVESTIGATION",
  DEBUGGING: "DEBUGGING",
  VALIDATION: "VALIDATION",
  REVIEW: "REVIEW",
  RESUME: "RESUME",
});

const PURPOSE_LAYER_REQUIREMENT = Object.freeze({
  [CONTEXT_PURPOSE.PLANNING]: ["R0", "R1", "R2"],
  [CONTEXT_PURPOSE.IMPLEMENTATION]: ["R0", "R1"],
  [CONTEXT_PURPOSE.INVESTIGATION]: ["H0", "H1"],
  [CONTEXT_PURPOSE.DEBUGGING]: ["OBS", "EVID"],
  [CONTEXT_PURPOSE.VALIDATION]: ["VER"],
  [CONTEXT_PURPOSE.REVIEW]: ["ALL"],
  [CONTEXT_PURPOSE.RESUME]: ["ALL"],
});

export function buildContextQuery({
  taskId,
  subtaskId = null,
  requirementId = null,
  hypothesisId = null,
  experimentId = null,
  executionId = null,
  taskType = null,
  phase = null,
  activeFiles = [],
  activeTools = [],
  knownFailures = [],
  unresolvedQuestions = [],
  budget = null,
  purpose = CONTEXT_PURPOSE.PLANNING,
} = {}) {
  if (!taskId) throw new TypeError("contextQuery requires taskId");

  return {
    taskId,
    subtaskId,
    requirementId,
    hypothesisId,
    experimentId,
    executionId,
    taskType,
    phase,
    activeFiles,
    activeTools,
    knownFailures,
    unresolvedQuestions,
    budget,
    purpose,
    _layerRequirement: PURPOSE_LAYER_REQUIREMENT[purpose] || PURPOSE_LAYER_REQUIREMENT[CONTEXT_PURPOSE.PLANNING],
    _timestamp: Date.now(),
  };
}

export function matchesQuery(item, query) {
  if (query.requirementId && item.requirementId !== query.requirementId) return false;
  if (query.hypothesisId && item.hypothesisId !== query.hypothesisId) return false;
  if (query.experimentId && item.experimentId !== query.experimentId) return false;
  if (query.executionId && item.executionId !== query.executionId) return false;
  if (query.taskType && item.taskType && item.taskType !== query.taskType) return false;
  if (query.phase && item.phase && item.phase !== query.phase) return false;
  if (query.activeFiles && query.activeFiles.length > 0 && item.scope === "FILE") {
    if (!query.activeFiles.some((f) => (item.content?.path || "").includes(f))) return false;
  }
  if (query.activeTools && query.activeTools.length > 0 && item.scope === "TOOL") {
    if (!query.activeTools.some((t) => (item.content?.tool || "").includes(t))) return false;
  }
  return true;
}

export function scoreRelevance(item, query) {
  let score = 0;
  if (item.mandatoryIncluded === true) score += 10;
  if (item.lifecycle === LIFECYCLE_STATES.ACTIVE) score += 5;
  if (item.lifecycle === LIFECYCLE_STATES.CREATED) score += 3;
  if (item.importance === "HIGH") score += 5;
  if (item.importance === "MEDIUM") score += 3;
  if (item.unresolvedCriticalUnknowns?.length > 0) score += 8;
  if (query.requirementId && item.requirementId === query.requirementId) score += 10;
  if (query.hypothesisId && item.hypothesisId === query.hypothesisId) score += 10;
  if (query.experimentId && item.experimentId === query.experimentId) score += 10;
  if (query.executionId && item.executionId === query.executionId) score += 10;
  const recency = (query._timestamp || Date.now()) - item.timestamp;
  if (recency < 60000) score += 5;
  else if (recency < 300000) score += 3;
  return score;
}

export function retrieveRelevantContext(items, query) {
  const filtered = items.filter((item) => matchesQuery(item, query));
  const scored = filtered.map((item) => ({ item, score: scoreRelevance(item, query) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
