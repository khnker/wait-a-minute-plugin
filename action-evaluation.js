/**
 * Action Evaluation — Separation of action results, observations,
 * requirement evaluation, and task verification.
 *
 * Core insight: ActionResult ≠ Observation ≠ RequirementEvaluation ≠ TaskVerification
 * A tool succeeding does NOT mean its requirement is satisfied.
 */

// -- ActionResult: directly from tool execution --

/**
 * @typedef {Object} ActionResult
 * @property {string} actionId
 * @property {boolean} success
 * @property {number} exitCode
 * @property {string} output
 * @property {number} durationMs
 * @property {number} timestamp
 */

/**
 * Creates an ActionResult directly from tool execution metadata.
 */
export function createActionResult({
  actionId,
  success,
  exitCode,
  output,
  durationMs,
  timestamp = Date.now(),
}) {
  return { actionId, success, exitCode, output, durationMs, timestamp };
}

// -- Observation: interpretation of action result --

/**
 * @typedef {Object} Observation
 * @property {string} id
 * @property {string} actionId
 * @property {string} requirementId
 * @property {string} observation
 * @property {"direct" | "derived" | "inferred"} relevance
 * @property {number} timestamp
 */

/**
 * Creates an Observation — an interpretation of what happened during execution.
 */
export function createObservation({
  actionId,
  requirementId,
  observation,
  relevance = "direct",
}) {
  return {
    id: `obs-${actionId}-${Date.now().toString(36)}`,
    actionId,
    requirementId,
    observation,
    relevance,
    timestamp: Date.now(),
  };
}

// -- Requirement evaluation: mapping observation to requirement --

/**
 * @typedef {Object} RequirementEvaluation
 * @property {string} requirementId
 * @property {string} observationId
 * @property {"unknown" | "supports" | "contradicts" | "neutral"} evaluation
 * @property {string} reason
 * @property {number} timestamp
 */

/**
 * Evaluates an observation against a requirement.
 * Returns an evaluation, NOT a status change.
 */
export function evaluateObservationAgainst(observation, requirement) {
  return {
    requirementId: observation.requirementId,
    observationId: observation.id,
    evaluation: "unknown",
    reason: "",
    timestamp: Date.now(),
  };
}

// -- Task verification: final result --

/**
 * @typedef {Object} TaskVerification
 * @property {string} taskId
 * @property {boolean} verified
 * @property {RequirementEvaluation[]} evaluations
 * @property {string} summary
 * @property {number} timestamp
 */

/**
 * Verifies a task by aggregating all requirement evaluations.
 */
export function verifyTask({ taskId, evaluations, summary }) {
  const verified =
    evaluations.length > 0 &&
    evaluations.every((e) => e.evaluation === "supports");
  return {
    taskId,
    verified,
    evaluations,
    summary,
    timestamp: Date.now(),
  };
}

// -- Classic bug demonstrations --

/**
 * Bug demo #1: Command succeeded ≠ Requirement satisfied.
 * A command exiting with 0 does not prove the underlying requirement is met.
 */
export function demoCommandSucceedsNotRequirementSatisfied() {
  const actionResult = createActionResult({
    actionId: "act-1",
    success: true,
    exitCode: 0,
    output: "Chromium executable exists at /usr/bin/chromium",
    durationMs: 12,
  });

  const observation = createObservation({
    actionId: actionResult.actionId,
    requirementId: "req-playwright-chromium",
    observation: "Chromium executable exists",
    relevance: "direct",
  });

  const requirement = {
    id: "req-playwright-chromium",
    description: "Playwright can launch required Chromium",
  };

  const evaluation = evaluateObservationAgainst(observation, requirement);

  return { actionResult, observation, requirement, evaluation };
}

/**
 * Bug demo #2: Tool output exists ≠ Requirement verified.
 * Having output does not mean the requirement is actually satisfied.
 */
export function demoToolOutputExistsNotRequirementVerified() {
  const actionResult = createActionResult({
    actionId: "act-2",
    success: true,
    exitCode: 0,
    output: "npm install completed with 0 warnings",
    durationMs: 4500,
  });

  const observation = createObservation({
    actionId: actionResult.actionId,
    requirementId: "req-deps-installed",
    observation: "npm install completed",
    relevance: "derived",
  });

  const requirement = {
    id: "req-deps-installed",
    description: "All runtime dependencies are installed and importable",
  };

  const evaluation = evaluateObservationAgainst(observation, requirement);

  return { actionResult, observation, requirement, evaluation };
}
