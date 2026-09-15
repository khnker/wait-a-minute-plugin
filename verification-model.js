// Requirement states
export const REQUIREMENT_STATES = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  OBSERVED: "OBSERVED",
  SUPPORTED: "SUPPORTED",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN"
};

// Validation rules:
// - OBSERVED never implies VERIFIED
// - SUPPORTED requires relevant evidence
// - VERIFIED requires satisfying acceptanceCriteria
// - FAILED requires contradictory evidence
// - UNKNOWN means insufficient evidence
// - No VERIFIED allowed without verificationMethod
// - No task completion while any mandatory requirement is in OPEN, UNKNOWN, OBSERVED or SUPPORTED

export function createRequirement({ id, claim, intent, expectedOutcome, acceptanceCriteria = [], verificationMethod = null, optional = false }) {
  if (!id || !claim) throw new Error("id and claim are required");
  return {
    id,
    claim,
    intent: intent || "",
    expectedOutcome: expectedOutcome || "",
    acceptanceCriteria,
    verificationMethod,
    status: REQUIREMENT_STATES.OPEN,
    evidence: [],
    optional,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function isRequirementCompletable(requirement) {
  const terminalStates = [REQUIREMENT_STATES.VERIFIED, REQUIREMENT_STATES.FAILED];
  return terminalStates.includes(requirement.status);
}

export function canCompleteTask(requirements) {
  const mandatory = requirements.filter(r => !r.optional);
  const incomplete = mandatory.filter(r => !isRequirementCompletable(r));
  return {
    canComplete: incomplete.length === 0,
    incompleteRequirements: incomplete.map(r => ({ id: r.id, status: r.status }))
  };
}

// State transitions (per spec)
export const VALID_TRANSITIONS = {
  [REQUIREMENT_STATES.OPEN]: [REQUIREMENT_STATES.IN_PROGRESS],
  [REQUIREMENT_STATES.IN_PROGRESS]: [REQUIREMENT_STATES.OBSERVED, REQUIREMENT_STATES.FAILED, REQUIREMENT_STATES.UNKNOWN],
  [REQUIREMENT_STATES.OBSERVED]: [REQUIREMENT_STATES.SUPPORTED, REQUIREMENT_STATES.FAILED, REQUIREMENT_STATES.UNKNOWN],
  [REQUIREMENT_STATES.SUPPORTED]: [REQUIREMENT_STATES.VERIFIED, REQUIREMENT_STATES.FAILED, REQUIREMENT_STATES.UNKNOWN],
  [REQUIREMENT_STATES.UNKNOWN]: [REQUIREMENT_STATES.IN_PROGRESS],
  [REQUIREMENT_STATES.VERIFIED]: [REQUIREMENT_STATES.OPEN], // only if new evidence invalidates
  [REQUIREMENT_STATES.FAILED]: [], // terminal
};

export function canTransition(fromState, toState) {
  const allowed = VALID_TRANSITIONS[fromState];
  return allowed && allowed.includes(toState);
}

export function transitionRequirement(requirement, toState, evidence = null) {
  if (!canTransition(requirement.status, toState)) {
    throw new Error(`Invalid transition: ${requirement.status} → ${toState}. Allowed: ${VALID_TRANSITIONS[requirement.status]?.join(", ") || "none"}`);
  }

  const updated = {
    ...requirement,
    status: toState,
    updatedAt: Date.now()
  };

  if (evidence) {
    updated.evidence = [...requirement.evidence, evidence];
  }

  // If moving back to OPEN from VERIFIED, mark as stale
  if (requirement.status === REQUIREMENT_STATES.VERIFIED && toState === REQUIREMENT_STATES.OPEN) {
    updated.invalidatedAt = Date.now();
  }

  return updated;
}
