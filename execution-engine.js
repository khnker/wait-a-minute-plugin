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
 * - CONTRADICTED → REJECTED (hard contradiction) or INVESTIGATING (partial / ambiguous)
 * - INCONCLUSIVE → TESTING (keep probing)
 * - SUPPORTED → SUPPORTED
 */
function deriveHypothesisStatus(assessment) {
  if (assessment.result === AssessmentResult.SUPPORTED) {
    return { status: HYPOTHESIS_STATUS.SUPPORTED, severity: null };
  }
  if (assessment.result === AssessmentResult.CONTRADICTED) {
    const { summary = {} } = assessment;
    const contradicted = summary.contradicted || 0;
    const supported = summary.supported || 0;
    if (contradicted > supported && contradicted > 0) {
      return { status: HYPOTHESIS_STATUS.REJECTED, severity: "high" };
    }
    return { status: "INVESTIGATING", severity: "low" };
  }
  return { status: "TESTING", severity: null };
}

export function noteFailure(taskRoot, taskId, { hypothesisId, experimentId, reason, actual, unexpected, provenance }) {
  failExperiment(taskRoot, taskId, experimentId, reason);

  // Tool execution itself failed — treat this as a CONTRADICTED signal against the
  // experiment's expected observation. A failing tool cannot produce the expected
  // result, so the hypothesis is refuted and must be REJECTED with replan.
  const experiment = { hypothesisId, id: experimentId };
  const observation = { actual, unexpected, provenance, experimentId };
  const assessment = assessObservation(experiment, observation);

  recordObservation(taskRoot, taskId, {
    experimentId,
    hypothesisId,
    result: AssessmentResult.CONTRADICTED,
    facts: [reason],
    actual,
    unexpected,
    provenance,
  });

  // Tool failure drives CONTRADICTED → REJECTED + replan signal.
  noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);

  updateHypothesisStatus(taskRoot, taskId, hypothesisId, HYPOTHESIS_STATUS.REJECTED);
  rejectHypothesis(taskRoot, hypothesisId, reason);
  archiveHypothesis(taskRoot, taskId, hypothesisId, reason);

  return {
    assessment: { ...assessment, result: AssessmentResult.CONTRADICTED },
    hypothesisStatus: HYPOTHESIS_STATUS.REJECTED,
    replan: true,
  };
}

import { createEvidence, linkEvidenceToRequirement } from "./evidence-lineage.js";

// ... (existing imports)

export function noteSuccess(taskRoot, taskId, { hypothesisId, experimentId, result, actual, unexpected, provenance, requirementId }) {
  // ... (existing assessment logic)
  const experiment = { hypothesisId, id: experimentId };
  const observation = { actual, unexpected, provenance, experimentId };
  const assessment = assessObservation(experiment, observation);

  completeExperiment(taskRoot, taskId, experimentId, { result, assessment });

  // 1. Crear evidencia formal
  const evidence = createEvidence(taskId, {
    requirementId,
    content: typeof result === "string" ? result : JSON.stringify(result ?? "ok"),
    type: "TOOL_OUTPUT", // Ajustar según constante apropiada
    source: "execution-engine",
    hypothesisId,
  }, taskRoot);

  // 2. Vincular en la cadena causal
  if (requirementId) {
    linkEvidenceToRequirement(evidence.id, requirementId, hypothesisId, experimentId, "obs-id-stub", taskId, taskRoot);
  }

  recordObservation(taskRoot, taskId, {
    experimentId,
    hypothesisId,
    result: assessment.result,
    facts: [evidence.id], // Referenciar evidencia creada
    actual,
    unexpected,
    provenance,
  });
  // ... (existing assessment/status logic)
}

  if (assessment.result === AssessmentResult.CONTRADICTED) {
    // Do NOT confirm the hypothesis. Trigger noteContradiction and move to
    // INVESTIGATING or REJECTED depending on severity.
    noteContradiction(taskId, hypothesisId, observation, assessment, taskRoot);
    const { status, severity } = deriveHypothesisStatus(assessment);
    updateHypothesisStatus(taskRoot, taskId, hypothesisId, status);
    if (status === HYPOTHESIS_STATUS.REJECTED) {
      rejectHypothesis(taskRoot, hypothesisId, "contradicted by observation");
      archiveHypothesis(taskRoot, taskId, hypothesisId, "contradicted by observation");
    }
    return { assessment, hypothesisStatus: status, severity, replan: status !== HYPOTHESIS_STATUS.REJECTED };
  }

  if (assessment.result === AssessmentResult.SUPPORTED) {
    updateHypothesisStatus(taskRoot, taskId, hypothesisId, HYPOTHESIS_STATUS.SUPPORTED);
    return { assessment, hypothesisStatus: HYPOTHESIS_STATUS.SUPPORTED };
  }

  // INCONCLUSIVE: tool succeeded but evidence insufficient — leave hypothesis in TESTING.
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, "TESTING");
  return { assessment, hypothesisStatus: "TESTING" };
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
    contradiction,
    newHypothesis,
    replanState: "INVESTIGATING",
  };
}
