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

function describe(tool, args = {}) {
  const { hypothesisId: _h, ...rest } = args;
  return `${tool}:${JSON.stringify(rest)}`;
}

export async function startExperiment(taskRoot, taskId, { statement, tool, args = {}, confidence = 0.5 }) {
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
  });
  return { ok: true, hypothesis, experiment, guard };
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
