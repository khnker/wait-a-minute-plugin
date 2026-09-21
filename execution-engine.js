/**
 * Autonomous execution loop — hypothesis → classify → experiment → observe → replan.
 * Non-destructive: never hard-deletes. Failed approaches are archived/rejected.
 *
 * Decoupled into:
 *   - observation-engine.js — raw observation recording
 *   - evidence-engine.js    — evidence creation + lineage linking
 *   - state-machine.js      — hypothesis / experiment status transitions
 *
 * This module orchestrates the three engines and remains the entry point
 * for startExperiment / noteFailure / noteSuccess / handleContradiction.
 */

import {
  createHypothesis,
  createExperiment,
  failExperiment,
  updateHypothesisStatus,
  hasRepetitiveFailure,
  archiveHypothesis,
  HYPOTHESIS_STATUS,
} from "./cognition-store.js";
import { guardAction } from "./runtime-guards.js";
import { rejectHypothesis } from "./cognitive-state.js";
import { assessObservation, AssessmentResult } from "./assessment-engine.js";
import { noteContradiction } from "./hypothesis-manager.js";

import {
  recordRawObservation,
  resolveExperimentContext,
} from "./observation-engine.js";
import {
  produceExecutionEvidence,
  linkEvidenceIfBound,
} from "./evidence-engine.js";
import {
  deriveHypothesisStatus,
  shouldReplan,
  shouldNoteContradiction,
} from "./state-machine.js";

function describe(tool, args = {}) {
  const { hypothesisId: _h, ...rest } = args;
  return `${tool}:${JSON.stringify(rest)}`;
}

/**
 * Pure orchestrator: turn an observation + assessment into the next
 * hypothesis status and the persisted observation record. Delegates
 * persistence to observation-engine and status derivation to state-machine.
 */
function processObservation(taskRoot, taskId, args) {
  // Resolve experiment context first so the assessment has the right input shape
  // (it needs experiment.expectedObservation to compare against args.actual).
  const experiment = resolveExperimentContext(taskRoot, taskId, args);
  const assessment = assessObservation(experiment ?? { id: null }, {
    actual: args.actual,
    unexpected: args.unexpected,
    provenance: args.provenance,
    experimentId: args.experimentId,
  });
  // Now persist with the *assessment* result, not the raw tool result.
  const { observation } = recordRawObservation(taskRoot, taskId, {
    ...args,
    result: assessment.result,
  });
  const { status, severity } = deriveHypothesisStatus(assessment);
  updateHypothesisStatus(taskRoot, taskId, args.hypothesisId, status);

  return { assessment, hypothesisStatus: status, severity, observation };
}

export async function startExperiment(taskRoot, taskId, { statement, tool, args = {}, confidence = 0.5, expectedObservation }) {
  const hypothesis = createHypothesis(taskRoot, taskId, { statement, confidence });
  const input = { ...args, hypothesisId: hypothesis.id };
  const guard = await guardAction(tool, input, taskRoot, taskId);
  if (!guard.allowed) {
    archiveHypothesis(taskRoot, taskId, hypothesis.id, guard.reason || "blocked by policy");
    return { ok: false, hypothesis, guard };
  }

  const actionDescription = describe(tool, args);
  if (hasRepetitiveFailure(taskRoot, taskId, { hypothesisId: hypothesis.id, actionDescription })) {
    archiveHypothesis(taskRoot, taskId, hypothesis.id, "repetitive failure");
    return { ok: false, hypothesis, guard: { allowed: false, reason: "repetitive failure" } };
  }

  const experiment = createExperiment(taskRoot, taskId, {
    hypothesisId: hypothesis.id,
    tool,
    args,
    actionDescription,
    expectedObservation,
  });
  updateHypothesisStatus(taskRoot, taskId, hypothesis.id, HYPOTHESIS_STATUS.TESTING);
  return { ok: true, hypothesis, experiment, guard };
}

export function noteFailure(taskRoot, taskId, { hypothesisId, experimentId, reason, actual, unexpected, provenance }) {
  if (experimentId) failExperiment(taskRoot, taskId, experimentId, reason);
  const { assessment, hypothesisStatus, severity } = processObservation(taskRoot, taskId, {
    hypothesisId,
    experimentId,
    reason,
    actual,
    unexpected,
    provenance,
    outcome: "failure",
  });
  return {
    assessment,
    hypothesisStatus,
    severity,
    replan: shouldReplan({ assessment, hypothesisStatus }),
  };
}

export function noteSuccess(taskRoot, taskId, { hypothesisId, experimentId, result, actual, unexpected, provenance, requirementId }) {
  // 1. Create evidence first so we can carry its id into the observation facts.
  const { evidence } = produceExecutionEvidence(taskId, taskRoot, {
    requirementId,
    result,
    hypothesisId,
  });

  // 2. Persist observation with the evidence id as the primary fact.
  const { assessment, hypothesisStatus, observation } = processObservation(taskRoot, taskId, {
    hypothesisId,
    experimentId,
    result,
    actual,
    unexpected,
    provenance,
    outcome: "success",
    facts: [evidence.id],
  });

  // 3. Bind evidence to the requirement lineage when both sides are known.
  linkEvidenceIfBound({
    evidenceId: evidence.id,
    requirementId,
    hypothesisId,
    experimentId,
    observationId: observation?.id,
    taskId,
    taskRoot,
  });

  if (assessment.result === AssessmentResult.CONTRADICTED) {
    if (shouldNoteContradiction({ assessment, hypothesisStatus })) {
      noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);
    }
    return {
      assessment,
      hypothesisStatus,
      severity: null,
      replan: shouldReplan({ assessment, hypothesisStatus }),
    };
  }
  return { assessment, hypothesisStatus };
}

export function handleContradiction(taskRoot, taskId, { experiment, observation, assessment }) {
  const { hypothesisId, id: experimentId } = experiment;
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, "contradicted");
  rejectHypothesis(taskRoot, hypothesisId, "contradicted by observation");
  const contradiction = noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);
  recordRawObservation(taskRoot, taskId, {
    experimentId,
    hypothesisId,
    result: assessment.result,
    facts: [contradiction.detail],
    provenance: { type: "execution-assessment" },
  });
  const newHypothesis = createHypothesis(taskRoot, taskId, {
    statement: `[REPLAN] New hypothesis after contradicting ${hypothesisId}: reassess strategy`,
    confidence: 0.3,
  });
  return {
    status: "CONTRADICTED",
    previousHypothesisId: hypothesisId,
    previousExperimentId: experimentId,
    assessment,
    newHypothesis,
  };
}
