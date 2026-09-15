/**
 * Hypothesis contradiction tracking.
 * Called when an observation contradicts the active hypothesis.
 * Triggers strategy replanning (INVESTIGATING → new hypothesis).
 *
 * Signature (backward compatible):
 *   noteContradiction(hypothesisId, observation, assessment)
 *   noteContradiction(taskId, hypothesisId, observation, assessment, root)
 *
 * When a hypothesis is rejected, dependent evidence is marked STALE
 * so the linked requirement returns to PENDING and must be replanned.
 */

import { invalidateDependentEvidence, getAllEvidence } from "./evidence-lineage.js";
import { persistTaskState, getTaskState } from "./engine.js";

function isAssessment(value) {
  return value && typeof value === "object" && Array.isArray(value.comparisons);
}

/**
 * Reject a hypothesis after a contradicting observation and stale any
 * evidence that was produced under that hypothesis.
 *
 * @returns {{ type: string, hypothesisId: string, detail: string, staleEvidence: Array, pendingRequirements: string[] }}
 */
export function noteContradiction(hypothesisIdOrTaskId, observationOrHypothesisId, assessmentOrObservation, maybeAssessment, maybeRoot) {
  let taskId = null;
  let hypothesisId;
  let observation;
  let assessment;
  let root;

  if (isAssessment(assessmentOrObservation) && maybeAssessment === undefined) {
    // noteContradiction(hypothesisId, observation, assessment)
    hypothesisId = hypothesisIdOrTaskId;
    observation = observationOrHypothesisId;
    assessment = assessmentOrObservation;
  } else {
    // noteContradiction(taskId, hypothesisId, observation, assessment, root)
    taskId = hypothesisIdOrTaskId;
    hypothesisId = observationOrHypothesisId;
    observation = assessmentOrObservation;
    assessment = maybeAssessment;
    root = maybeRoot;
  }

  const comparisons = assessment?.comparisons || [];
  const conflictFields = comparisons
    .filter((c) => c.status === "CONTRADICTED")
    .map((c) => `${c.field}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`);

  const detail = conflictFields.length > 0
    ? `Contradicted fields: ${conflictFields.join("; ")}.`
    : `Observation contradicted hypothesis "${hypothesisId}".`;

  let staleEvidence = [];
  const pendingRequirements = [];

  if (taskId) {
    staleEvidence = invalidateDependentEvidence(taskId, hypothesisId, detail, root) || [];
    const requirementIds = [...new Set(staleEvidence.map((e) => e.requirementId).filter(Boolean))];
    if (requirementIds.length > 0) {
      const state = getTaskState(taskId, root);
      if (state?.requirements) {
        for (const req of state.requirements) {
          if (requirementIds.includes(req.id)) {
            req.status = "pending";
            req.replan = true;
            pendingRequirements.push(req.id);
          }
        }
        persistTaskState(taskId, state, root);
      }
    }
  } else {
    // In-memory form used by unit tests / execution-engine (no persistence).
    staleEvidence = [];
  }

  return {
    type: "CONTRADICTION",
    hypothesisId,
    assessmentResult: assessment?.result,
    reasoning: assessment?.reasoning,
    detail,
    observed: observation,
    timestamp: Date.now(),
    hypothesisStatus: "rejected",
    staleEvidence,
    pendingRequirements,
    replan: true,
  };
}

/**
 * After a contradiction, mark every requirement that depended on the
 * rejected hypothesis as PENDING so the planner must replan.
 */
export function revertRequirementsToPending(taskId, hypothesisId, root) {
  const evidence = getAllEvidence(taskId, root).filter((e) => e.hypothesisId === hypothesisId);
  const requirementIds = [...new Set(evidence.map((e) => e.requirementId).filter(Boolean))];
  const state = getTaskState(taskId, root);
  if (!state?.requirements) return requirementIds;
  for (const req of state.requirements) {
    if (requirementIds.includes(req.id)) {
      req.status = "pending";
      req.replan = true;
    }
  }
  persistTaskState(taskId, state, root);
  return requirementIds;
}
