// Change 37 — Policy-state-machine
// Policy state machine with states, transitions, decisions, and preconditions.

export const POLICY_STATES = {
  SCOPE: "Scope",
  INVESTIGATE: "Investigate",
  ACTION: "Action",
  DEBUG: "Debug",
  OBSERVE: "Observe",
  VERIFY: "Verify",
  REVIEW: "Review",
  COMPLETION: "Completion"
};

export const POLICY_TRANSITIONS = {
  [POLICY_STATES.SCOPE]: [POLICY_STATES.INVESTIGATE],
  [POLICY_STATES.INVESTIGATE]: [POLICY_STATES.ACTION, POLICY_STATES.DEBUG],
  [POLICY_STATES.ACTION]: [POLICY_STATES.OBSERVE, POLICY_STATES.VERIFY],
  [POLICY_STATES.DEBUG]: [POLICY_STATES.OBSERVE, POLICY_STATES.VERIFY],
  [POLICY_STATES.OBSERVE]: [POLICY_STATES.VERIFY, POLICY_STATES.REVIEW],
  [POLICY_STATES.VERIFY]: [POLICY_STATES.REVIEW, POLICY_STATES.COMPLETION],
  [POLICY_STATES.REVIEW]: [POLICY_STATES.COMPLETION, POLICY_STATES.INVESTIGATE],
  [POLICY_STATES.COMPLETION]: []
};

// Change 36 — Policy-coordination (validatePolicyFlow, getNextPolicy)
export const POLICY_CHAIN = [
  POLICY_STATES.SCOPE,
  POLICY_STATES.INVESTIGATE,
  POLICY_STATES.ACTION,
  POLICY_STATES.DEBUG,
  POLICY_STATES.OBSERVE,
  POLICY_STATES.VERIFY,
  POLICY_STATES.REVIEW,
  POLICY_STATES.COMPLETION
];

export function validatePolicyFlow(currentPolicy, nextPolicy) {
  if (currentPolicy === nextPolicy) return { valid: false, reason: "same-policy" };
  const allowed = POLICY_TRANSITIONS[currentPolicy] || [];
  if (!allowed.includes(nextPolicy)) return { valid: false, reason: "invalid-transition" };
  return { valid: true };
}

export function getNextPolicy(currentPolicy) {
  const idx = POLICY_CHAIN.indexOf(currentPolicy);
  if (idx === -1 || idx >= POLICY_CHAIN.length - 1) return null;
  return POLICY_CHAIN[idx + 1];
}

export function createPolicyDecision(policy, action, reason, requirementsAffected = [], expectedObservation = null) {
  return {
    policy,
    action,
    reason,
    requirementsAffected,
    expectedObservation,
    timestamp: Date.now()
  };
}

export function isValidPolicyTransition(fromPolicy, toPolicy) {
  const allowed = POLICY_TRANSITIONS[fromPolicy];
  return allowed ? allowed.includes(toPolicy) : false;
}

// Change 38 — Policy-preconditions
export const POLICY_PRECONDITIONS = {
  [POLICY_STATES.INVESTIGATE]: { contextSufficient: true },
  [POLICY_STATES.ACTION]: { requirementKnown: true },
  [POLICY_STATES.DEBUG]: { requirementKnown: true },
  [POLICY_STATES.VERIFY]: { evidenceAvailable: true },
  [POLICY_STATES.REVIEW]: { allVerified: false } // can review even if not all verified
};

export function checkPolicyPreconditions(policy, taskState) {
  const required = POLICY_PRECONDITIONS[policy];
  if (!required) return { satisfied: true, failures: [] };

  const failures = [];

  if (required.contextSufficient === true && !taskState.contextSufficient) {
    failures.push("context not sufficient");
  }
  if (required.requirementKnown === true && !taskState.currentRequirement) {
    failures.push("no current requirement");
  }
  if (required.evidenceAvailable === true && (!taskState.evidence || taskState.evidence.length === 0)) {
    failures.push("no evidence available");
  }
  if (required.allVerified === true) {
    const unverified = (taskState.requirements || []).filter(r => r.status !== "VERIFIED");
    if (unverified.length > 0) failures.push("requirements not verified");
  }

  return { satisfied: failures.length === 0, failures };
}
