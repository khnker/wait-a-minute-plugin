/**
 * Requirement State Machine
 *
 * Formalizes the lifecycle states of a requirement and the legal transitions
 * between them. Used by completion-gate to determine whether a requirement can
 * be considered complete.
 *
 * States:
 *  - PENDING      : requirement identified but not started
 *  - IN_PROGRESS  : work is being done; some evidence may exist
 *  - VERIFIED     : sufficient verified evidence exists; gates can pass
 *  - INVALIDATED  : existing evidence was invalidated (stale, contradicted, etc.)
 *  - BLOCKED      : cannot proceed (dependency, missing info, external blocker)
 *  - NEEDS_REPLAN : current approach cannot satisfy the requirement
 *
 * Transition table is the source of truth. Any transition not listed is
 * considered illegal and will return { allowed: false } from canTransition().
 */

export const REQUIREMENT_STATES = Object.freeze({
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  VERIFIED: "VERIFIED",
  INVALIDATED: "INVALIDATED",
  BLOCKED: "BLOCKED",
  NEEDS_REPLAN: "NEEDS_REPLAN",
});

export const TERMINAL_STATES = new Set([
  REQUIREMENT_STATES.VERIFIED,
]);

/**
 * Allowed transitions: from -> Set(to).
 * VERIFIED is intentionally reachable from a small set of states to avoid
 * silently promoting blocked/needs-replan requirements.
 */
export const TRANSITIONS = Object.freeze({
  [REQUIREMENT_STATES.PENDING]: new Set([
    REQUIREMENT_STATES.IN_PROGRESS,
    REQUIREMENT_STATES.BLOCKED,
  ]),
  [REQUIREMENT_STATES.IN_PROGRESS]: new Set([
    REQUIREMENT_STATES.VERIFIED,
    REQUIREMENT_STATES.INVALIDATED,
    REQUIREMENT_STATES.BLOCKED,
    REQUIREMENT_STATES.NEEDS_REPLAN,
    REQUIREMENT_STATES.PENDING,
  ]),
  [REQUIREMENT_STATES.VERIFIED]: new Set([
    // Once verified, it can be invalidated if evidence is later contradicted.
    REQUIREMENT_STATES.INVALIDATED,
  ]),
  [REQUIREMENT_STATES.INVALIDATED]: new Set([
    REQUIREMENT_STATES.IN_PROGRESS,
    REQUIREMENT_STATES.NEEDS_REPLAN,
    REQUIREMENT_STATES.PENDING,
  ]),
  [REQUIREMENT_STATES.BLOCKED]: new Set([
    REQUIREMENT_STATES.IN_PROGRESS,
    REQUIREMENT_STATES.PENDING,
    REQUIREMENT_STATES.NEEDS_REPLAN,
  ]),
  [REQUIREMENT_STATES.NEEDS_REPLAN]: new Set([
    REQUIREMENT_STATES.PENDING,
    REQUIREMENT_STATES.IN_PROGRESS,
  ]),
});

/**
 * Returns whether `to` is a legal next state from `from`.
 */
export function canTransition(from, to) {
  if (!Object.values(REQUIREMENT_STATES).includes(to)) {
    return { allowed: false, reason: `unknown target state: ${to}` };
  }
  const allowed = TRANSITIONS[from];
  if (!allowed) {
    return { allowed: false, reason: `unknown source state: ${from}` };
  }
  if (!allowed.has(to)) {
    return {
      allowed: false,
      reason: `illegal transition ${from} -> ${to}`,
    };
  }
  return { allowed: true };
}

/**
 * Executes a transition. Returns a new state object (immutable update) or
 * an { error } object if the transition is illegal.
 */
export function transition(requirement, to) {
  if (!requirement || typeof requirement !== "object") {
    return { error: "requirement must be an object" };
  }
  const from = requirement.status || REQUIREMENT_STATES.PENDING;
  const check = canTransition(from, to);
  if (!check.allowed) {
    return { error: check.reason, from, to };
  }
  return {
    ...requirement,
    status: to,
    lastTransitionAt: new Date().toISOString(),
    lastTransitionFrom: from,
  };
}

/**
 * Pure decision: is this requirement eligible for completion?
 * Only VERIFIED requirements are complete.
 */
export function isRequirementComplete(requirement) {
  return Boolean(
    requirement &&
    typeof requirement === "object" &&
    requirement.status === REQUIREMENT_STATES.VERIFIED
  );
}

/**
 * Aggregates a list of requirements into an overall verdict.
 * Returns { allComplete, blocked, incomplete, summary }.
 */
export function summarizeRequirements(requirements = []) {
  const incomplete = [];
  const blocked = [];
  for (const req of requirements) {
    if (!isRequirementComplete(req)) {
      incomplete.push(req);
      if (
        req.status === REQUIREMENT_STATES.BLOCKED ||
        req.status === REQUIREMENT_STATES.NEEDS_REPLAN
      ) {
        blocked.push(req);
      }
    }
  }
  return {
    allComplete: incomplete.length === 0,
    incomplete,
    blocked,
    summary: {
      total: requirements.length,
      complete: requirements.length - incomplete.length,
      incomplete: incomplete.length,
      blocked: blocked.length,
    },
  };
}
