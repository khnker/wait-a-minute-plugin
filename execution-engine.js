// Fixed version of execution-engine.js

/**
 * Autonomous execution loop — hypothesis → classify → experiment → observe → replan.
 * Non-destructive: never hard-deletes. Failed approaches are archived/rejected.
 */

import {
  createHypothesis,
  createExperiment,
  recordObservation,
  updateHypothesisStatus,
  completeExperiment,
  failExperiment,
  hasRepetitiveFailure,
  archiveHypothesis,
  getExperiment,
  HYPOTHESIS_STATUS,
  EXPERIMENT_STATUS,
} from "./cognition-store.js";
import { guardAction } from "./runtime-guards.js";
import { rejectHypothesis } from "./cognitive-state.js";
import { assessObservation, createAssessment, AssessmentResult } from "./assessment-engine.js";
import { noteContradiction } from "./hypothesis-manager.js";

function describe(tool, args = {}) {
  const { hypothesisId: _h, ...rest } = args;
  return `${tool}:${JSON.stringify(rest)}`;
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
    actionDescription,
    risk: guard.level,
    expectedObservation,
  });
  return { ok: true, hypothesis, experiment, guard };
}

export { createAssessment, assessObservation, AssessmentResult };

/**
 * Determine hypothesis lifecycle status from an assessment.
 * - CONTRADICTED → REJECTED (hard contradiction) or TESTING (partial / ambiguous)
 * - INCONCLUSIVE → TESTING (keep probing)
 * - SUPPORTED → SUPPORTED
 */
function deriveHypothesisStatus(assessment) {
  if (assessment.result === AssessmentResult.SUPPORTED) return { status: HYPOTHESIS_STATUS.SUPPORTED, severity: null };
  if (assessment.result === AssessmentResult.CONTRADICTED) {
    const { summary = {} } = assessment;
    const contradicted = summary.contradicted || 0;
    const supported = summary.supported || 0;
    if (contradicted > supported && contradicted > 0) return { status: HYPOTHESIS_STATUS.REJECTED, severity: "high" };
    return { status: HYPOTHESIS_STATUS.TESTING, severity: "low" };
  }
  return { status: HYPOTHESIS_STATUS.TESTING, severity: null };
}

function processObservation(taskRoot, taskId, { hypothesisId, experimentId, result, actual, unexpected, provenance, reason, outcome, facts }) {
  const stored = experimentId ? getExperiment(taskRoot, taskId, experimentId) : null;
  const experiment = stored || { hypothesisId, id: experimentId };
  const observation = { actual, unexpected, provenance, experimentId };
  const assessment = assessObservation(experiment, observation);
  const derived = deriveHypothesisStatus(assessment);

  const persistedObs = recordObservation(taskRoot, taskId, {
    experimentId,
    hypothesisId,
    result: assessment.result,
    facts: facts || (outcome === "failure" ? [reason] : [result || "ok"]),
    actual,
    unexpected,
    provenance,
  });

  let status;
  if (assessment.result === AssessmentResult.SUPPORTED) {
    status = HYPOTHESIS_STATUS.SUPPORTED;
  } else if (assessment.result === AssessmentResult.CONTRADICTED) {
    const { summary = {} } = assessment;
    const contradicted = summary.contradicted || 0;
    const supported = summary.supported || 0;
    if (contradicted > supported && contradicted > 0) status = HYPOTHESIS_STATUS.REJECTED;
    else status = HYPOTHESIS_STATUS.TESTING;
  } else {
    status = HYPOTHESIS_STATUS.TESTING;
  }
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, status);

  return { assessment, hypothesisStatus: status, severity: derived.severity, observation: persistedObs };
}

export function noteFailure(taskRoot, taskId, { hypothesisId, experimentId, reason, actual, unexpected, provenance }) {
  failExperiment(taskRoot, taskId, experimentId, reason);
  const { assessment, hypothesisStatus, severity } = processObservation(taskRoot, taskId, {
    hypothesisId,
    experimentId,
    reason,
    actual,
    unexpected,
    provenance,
    outcome: "failure",
  });
  return { assessment, hypothesisStatus, severity, replan: assessment.result === AssessmentResult.CONTRADICTED && hypothesisStatus === HYPOTHESIS_STATUS.REJECTED };
}

import { createEvidence, linkEvidenceToRequirement } from "./evidence-lineage.js";

export function noteSuccess(taskRoot, taskId, { hypothesisId, experimentId, result, actual, unexpected, provenance, requirementId }) {
  // 1. Crear evidencia formal primero para obtener evidenceId
  const evidence = createEvidence(taskId, {
    requirementId,
    content: typeof result === "string" ? result : JSON.stringify(result ?? "ok"),
    type: "TOOL_OUTPUT",
    source: "execution-engine",
    hypothesisId,
  }, taskRoot);

  // 2. Procesar observación con evidenceId en facts
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

  // 3. Vincular en la cadena causal con el ID real de observación
  const observationId = observation?.id;
  if (observationId && requirementId) {
    linkEvidenceToRequirement(evidence.id, requirementId, hypothesisId, experimentId, observationId, taskId, taskRoot);
  }

  if (assessment.result === AssessmentResult.CONTRADICTED) {
    noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);
    return { assessment, hypothesisStatus, severity: null, replan: hypothesisStatus !== HYPOTHESIS_STATUS.REJECTED };
  }
  return { assessment, hypothesisStatus };
}

export function handleContradiction(taskRoot, taskId, { experiment, observation, assessment }) {
  const { hypothesisId, id: experimentId } = experiment;
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, "contradicted");
  rejectHypothesis(taskRoot, hypothesisId, "contradicted by observation");
  const contradiction = noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);
  recordObservation(taskRoot, taskId, {
    experimentId,
    result: assessment.result,
    facts: [contradiction.detail],
    source: { type: "execution-assessment" },
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
