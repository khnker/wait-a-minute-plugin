/**
 * Context State Machine — derives operational state from isolated states.
 *
 * Connects Task lifecycle, Run lifecycle, Evidence lifecycle,
 * Context routing, and Verification into a single derived state.
 *
 * The operational state is DERIVED, not persisted.
 * It answers: "What can the agent do right now?"
 */

/**
 * @typedef {"PROPOSED" | "ASKING" | "IMPLEMENTING" | "VERIFYING" | "COMPLETE" | "BLOCKED" | "CONFLICTED" | "DEGRADED"} OperationalState
 */

/**
 * @typedef {Object} StateInputs
 * @property {string} executionState - Current task execution state
 * @property {string} routingStatus - Context router status
 * @property {string} evidenceStatus - Evidence validity status
 * @property {string} verificationStatus - Verification lifecycle status
 * @property {boolean} hasActiveRun - Whether there's an active run
 * @property {boolean} hasUnresolvedAssumptions - Whether there are blocking assumptions
 */

/** All valid operational states */
export const OPERATIONAL_STATES = new Set([
  "PROPOSED",
  "ASKING",
  "IMPLEMENTING",
  "VERIFYING",
  "COMPLETE",
  "BLOCKED",
  "CONFLICTED",
  "DEGRADED",
]);

/**
 * Derive operational state from multiple state inputs.
 *
 * @param {StateInputs} inputs
 * @returns {{ state: OperationalState, reason: string, blockers: string[] }}
 */
export function deriveOperationalState(inputs) {
  const {
    executionState = "INITIALIZING",
    routingStatus = "COMPLETE",
    evidenceStatus = "valid",
    verificationStatus = "UNVERIFIED",
    hasActiveRun = false,
    hasUnresolvedAssumptions = false,
  } = inputs;

  const blockers = [];

  // Terminal: COMPLETED → DONE
  if (executionState === "COMPLETED") {
    return {
      state: "COMPLETE",
      reason: "task completed",
      blockers: [],
    };
  }

  // CONFLICTED: routing has conflicts (check before BLOCKED)
  if (routingStatus === "CONFLICTED") {
    return {
      state: "CONFLICTED",
      reason: "context conflicts detected",
      blockers: ["context conflicts unresolved"],
    };
  }

  // ASKING: waiting for authorization
  if (executionState === "WAITING_AUTHORIZATION") {
    return {
      state: "ASKING",
      reason: "waiting for authorization",
      blockers: [],
    };
  }

  // BLOCKED: multiple conditions
  if (executionState === "FAILED") {
    blockers.push("execution failed");
  }
  if (evidenceStatus === "invalidated") {
    blockers.push("evidence invalidated");
  }
  if (hasUnresolvedAssumptions) {
    blockers.push("unresolved decision-critical assumptions");
  }
  if (executionState === "BLOCKED") {
    blockers.push("execution blocked");
  }

  if (blockers.length > 0) {
    return {
      state: "BLOCKED",
      reason: blockers.join("; "),
      blockers,
    };
  }

  // VERIFYING: in verification phase
  if (executionState === "VERIFYING" || verificationStatus === "VERIFYING") {
    return {
      state: "VERIFYING",
      reason: "verification in progress",
      blockers: [],
    };
  }

  // DEGRADED: working but with issues
  if (routingStatus === "PARTIAL") {
    return {
      state: "DEGRADED",
      reason: "partial context available",
      blockers: [],
    };
  }
  if (evidenceStatus === "superseded") {
    return {
      state: "DEGRADED",
      reason: "evidence superseded",
      blockers: [],
    };
  }

  // IMPLEMENTING: actively executing
  if (executionState === "EXECUTING" || hasActiveRun) {
    return {
      state: "IMPLEMENTING",
      reason: "execution in progress",
      blockers: [],
    };
  }

  // PROPOSED: initial state
  return {
    state: "PROPOSED",
    reason: "task proposed, not yet started",
    blockers: [],
  };
}

/**
 * Check if an action is allowed in the current operational state.
 *
 * @param {OperationalState} state
 * @param {string} action
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canPerformAction(state, action) {
  const allowed = {
    PROPOSED: ["start", "plan", "ask"],
    ASKING: ["respond", "cancel"],
    IMPLEMENTING: ["execute", "observe", "evidence", "pause"],
    VERIFYING: ["verify", "evidence", "fail"],
    COMPLETE: [],
    BLOCKED: ["resolve", "cancel"],
    CONFLICTED: ["resolve", "cancel"],
    DEGRADED: ["execute", "observe", "evidence", "pause"],
  };

  const actions = allowed[state] || [];
  if (actions.includes(action)) {
    return { allowed: true, reason: `${action} allowed in ${state}` };
  }

  return {
    allowed: false,
    reason: `${action} not allowed in ${state}. Allowed: ${actions.join(", ") || "none"}`,
  };
}

/**
 * Generate operational state report.
 *
 * @param {StateInputs} inputs
 * @returns {Object} Report with state, reason, blockers, allowed actions
 */
export function generateOperationalReport(inputs) {
  const { state, reason, blockers } = deriveOperationalState(inputs);

  const allActions = ["start", "plan", "ask", "respond", "cancel", "execute", "observe", "evidence", "pause", "verify", "fail", "resolve"];
  const allowedActions = allActions.filter((a) => canPerformAction(state, a).allowed);

  return {
    state,
    reason,
    blockers,
    allowedActions,
    inputs,
    derivedAt: Date.now(),
  };
}

export default deriveOperationalState;
