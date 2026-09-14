/**
 * WAM Context History Relevance
 *
 * Extends context selection to include historical task information
 * based on relevance to the current task.
 *
 * Historical information is selected when related to:
 * - current task
 * - current requirement
 * - current workflow stage
 * - current artifact
 * - active dependency
 * - previous failure
 * - previous decision
 * - unresolved issue
 * - verification state
 *
 * Ranking priority:
 * 1. Explicit dependency
 * 2. Active requirement
 * 3. Same task/stage
 * 4. Same artifact
 * 5. Related failure
 * 6. Related decision
 * 7. Recency
 *
 * Invariant: Historical information retains provenance (current, historical,
 * superseded, stale, invalidated, unresolved). Router must never silently
 * convert historical information into current knowledge.
 */

import { ContextGraph } from "./context-graph.js";
import { getRuns, getPreviousFailures, getPreviousDecisions, getUnresolvedRequirements } from "./task-runs.js";
import { getDependencies, detectContextGaps } from "./task-dependencies.js";
import { getTaskState } from "./engine.js";

/**
 * @typedef {Object} HistoricalCandidate
 * @property {string} id
 * @property {string} type - "run", "failure", "decision", "evidence"
 * @property {string} content
 * @property {number} relevanceScore
 * @property {string} relevanceReason
 * @property {string} status - "current", "historical", "superseded", "stale", "invalidated", "unresolved"
 * @property {number} timestamp
 * @property {string} runId
 */

function estimateTokens(text = "") {
  return Math.ceil((text || "").length / 4);
}

export function getHistoricalCandidates(taskId, root, graph = null) {
  const candidates = [];
  const runs = getRuns(taskId, root);
  const failures = getPreviousFailures(taskId, root);
  const decisions = getPreviousDecisions(taskId, root, 10);
  const unresolved = getUnresolvedRequirements(taskId, root);

  // Get current task context for relevance scoring
  const taskNode = graph ? graph.getNode(taskId) : null;
  const taskContent = taskNode?.content || "";
  
  // Get keywords from task state if no graph content
  const taskState = getTaskState(taskId, root);
  const stateObjective = taskState?.contract?.objective || "";
  const combinedContent = taskContent + " " + stateObjective;
  const taskKeywords = new Set(combinedContent.toLowerCase().split(/\s+/).filter(Boolean));

  // Score candidates based on relevance
  for (const run of runs) {
    // Determine status based on run outcome
    let status = "historical";
    if (run.status === "active") {
      status = "current";
    } else if (run.outcome?.toLowerCase().includes("superseded")) {
      status = "superseded";
    } else if (run.status === "abandoned") {
      status = "stale";
    }

    // Score observations from this run
    for (const obs of run.observations || []) {
      const obsKeywords = new Set(obs.toLowerCase().split(/\s+/).filter(Boolean));
      const overlap = [...taskKeywords].filter((k) => obsKeywords.has(k)).length;
      const score = computeRelevanceScore({
        hasExplicitDependency: false,
        matchesActiveRequirement: unresolved.some((r) => obs.toLowerCase().includes(r.title.toLowerCase())),
        sameTask: true,
        sameArtifact: obs.toLowerCase().includes("artifact") || obs.toLowerCase().includes("build"),
        relatedFailure: failures.some((f) => f.outcome && obs.toLowerCase().includes(f.outcome.toLowerCase())),
        relatedDecision: decisions.some((d) => obs.toLowerCase().includes(d.decision.toLowerCase())),
        keywordOverlap: overlap,
        isRecent: run.startedAt > Date.now() - 86400000 * 7, // last 7 days
      });

      if (score > 0.15) {
        candidates.push({
          id: `obs-${run.id}-${candidates.length}`,
          type: "observation",
          content: obs,
          relevanceScore: score,
          relevanceReason: getRelevanceReason({ sameTask: true, keywordOverlap: overlap }),
          status,
          timestamp: run.startedAt,
          runId: run.id,
        });
      }
    }

    // Score decisions from this run
    for (const decision of run.decisions || []) {
      const decisionKeywords = new Set(decision.toLowerCase().split(/\s+/).filter(Boolean));
      const overlap = [...taskKeywords].filter((k) => decisionKeywords.has(k)).length;
      const score = computeRelevanceScore({
        hasExplicitDependency: graph ? graph.getDependencies(taskId).some((d) => d.content?.toLowerCase().includes(decision.toLowerCase())) : false,
        matchesActiveRequirement: unresolved.some((r) => decision.toLowerCase().includes(r.title.toLowerCase())),
        sameTask: true,
        sameArtifact: decision.toLowerCase().includes("artifact") || decision.toLowerCase().includes("build"),
        relatedFailure: false,
        relatedDecision: false,
        keywordOverlap: overlap,
        isRecent: run.startedAt > Date.now() - 86400000 * 7,
      });

      if (score > 0.15) {
        candidates.push({
          id: `decision-${run.id}-${candidates.length}`,
          type: "decision",
          content: decision,
          relevanceScore: score,
          relevanceReason: getRelevanceReason({ hasExplicitDependency: score > 0.8, sameTask: true, keywordOverlap: overlap }),
          status,
          timestamp: run.startedAt,
          runId: run.id,
        });
      }
    }

    // Score evidence from this run
    for (const evidence of run.evidence || []) {
      const score = computeRelevanceScore({
        hasExplicitDependency: false,
        matchesActiveRequirement: unresolved.some((r) => evidence.toLowerCase().includes(r.title.toLowerCase())),
        sameTask: true,
        sameArtifact: false,
        relatedFailure: false,
        relatedDecision: false,
        keywordOverlap: 0,
        isRecent: run.startedAt > Date.now() - 86400000 * 7,
      });

      if (score > 0.15) {
        candidates.push({
          id: `evidence-${run.id}-${candidates.length}`,
          type: "evidence",
          content: evidence,
          relevanceScore: score,
          relevanceReason: getRelevanceReason({ sameTask: true }),
          status,
          timestamp: run.startedAt,
          runId: run.id,
        });
      }
    }
  }

  // Add previous failures as candidates
  for (const failure of failures) {
    const score = computeRelevanceScore({
      hasExplicitDependency: false,
      matchesActiveRequirement: false,
      sameTask: true,
      sameArtifact: failure.outcome?.toLowerCase().includes("artifact") || failure.outcome?.toLowerCase().includes("build"),
      relatedFailure: true,
      relatedDecision: false,
      keywordOverlap: 0,
      isRecent: false,
    });

    if (score > 0.1) {
      candidates.push({
        id: `failure-${failure.id}`,
        type: "failure",
        content: failure.outcome || "Failed run",
        relevanceScore: score,
        relevanceReason: getRelevanceReason({ relatedFailure: true }),
        status: "historical",
        timestamp: failure.completedAt || failure.startedAt,
        runId: failure.id,
      });
    }
  }

  // Add unresolved requirements as candidates
  for (const req of unresolved) {
    const reqKeywords = new Set(req.title.toLowerCase().split(/\s+/).filter(Boolean));
    const overlap = [...taskKeywords].filter((k) => reqKeywords.has(k)).length;

    if (overlap > 0) {
      candidates.push({
        id: `req-${req.id}`,
        type: "requirement",
        content: req.title,
        relevanceScore: 0.9,
        relevanceReason: "active requirement",
        status: "unresolved",
        timestamp: Date.now(),
        runId: null,
      });
    }
  }

  return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function computeRelevanceScore({
  hasExplicitDependency,
  matchesActiveRequirement,
  sameTask,
  sameArtifact,
  relatedFailure,
  relatedDecision,
  keywordOverlap,
  isRecent,
}) {
  let score = 0;

  if (hasExplicitDependency) score += 0.5;
  if (matchesActiveRequirement) score += 0.4;
  if (sameTask) score += 0.2;
  if (sameArtifact) score += 0.15;
  if (relatedFailure) score += 0.12;
  if (relatedDecision) score += 0.1;
  score += Math.min(keywordOverlap * 0.05, 0.2);
  if (isRecent) score += 0.05;

  return Math.min(score, 1.0);
}

function getRelevanceReason(props) {
  if (props.hasExplicitDependency) return "explicit dependency";
  if (props.matchesActiveRequirement) return "matches active requirement";
  if (props.relatedFailure) return "related to previous failure";
  if (props.relatedDecision) return "related to previous decision";
  if (props.sameArtifact) return "same artifact context";
  if (props.sameTask) return "same task";
  if (props.keywordOverlap > 0) return `keyword overlap (${props.keywordOverlap})`;
  return "recent";
}

export function selectHistoricalContext(taskId, root, graph, maxTokens = 1000) {
  const candidates = getHistoricalCandidates(taskId, root, graph);

  const selected = [];
  let tokenCount = 0;

  for (const candidate of candidates) {
    const candidateTokens = estimateTokens(candidate.content) + 30;
    if (tokenCount + candidateTokens > maxTokens) break;

    selected.push(candidate);
    tokenCount += candidateTokens;
  }

  return {
    candidates: selected,
    totalTokens: tokenCount,
    tokenBudget: maxTokens,
    includesCurrent: selected.some((s) => s.status === "current"),
    includesHistorical: selected.some((s) => s.status === "historical"),
    includesUnresolved: selected.some((s) => s.status === "unresolved"),
  };
}

export function getRelevanceRankingExplanation(candidates, limit = 5) {
  return candidates.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    id: c.id,
    type: c.type,
    relevanceScore: c.relevanceScore,
    reason: c.relevanceReason,
    status: c.status,
  }));
}
