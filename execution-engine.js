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
} from "./cognition-store.js";
import { guardAction } from "./runtime-guards.js";
import { rejectHypothesis } from "./cognitive-state.js";
import { createAssessment } from "./execution-assessment.js";
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

export function assessObservation(experiment, observation) {
  const expected = experiment.expectedObservation;
  if (!expected || typeof expected !== "object") {
    return {
      result: "INCONCLUSIVE",
      reasoning: "No expectedObservation defined for this experiment.",
      comparisons: [],
      summary: { supported: 0, contradicted: 0, inconclusive: 0, total: 0 },
      expected,
      actual: observation,
    };
  }
  return createAssessment(expected, observation);
}

export function noteFailure(taskRoot, taskId, { hypothesisId, experimentId, reason }) {
  failExperiment(taskRoot, taskId, experimentId, reason);
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, "rejected");
  rejectHypothesis(taskRoot, hypothesisId, reason);
  recordObservation(taskRoot, taskId, { hypothesisId, kind: "failure", text: reason });
  archiveHypothesis(taskRoot, taskId, hypothesisId, reason);
}

export function noteSuccess(taskRoot, taskId, { hypothesisId, experimentId, result }) {
  completeExperiment(taskRoot, taskId, experimentId, result);
  updateHypothesisStatus(taskRoot, taskId, hypothesisId, "confirmed");
  recordObservation(taskRoot, taskId, {
    hypothesisId,
    kind: "success",
    text: typeof result === "string" ? result : JSON.stringify(result ?? "ok"),
  });
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
