/**
 * Verification Lifecycle — requirement verification state machine.
 * Implements spec: verification-lifecycle.
 *
 * States: UNVERIFIED → VERIFYING → VERIFIED (or → FAILED → new hypothesis)
 * Evidence: method (test/lint/build/other), result (pass/fail), details
 */

const VERIFICATION_STATES = new Set(["UNVERIFIED", "VERIFYING", "VERIFIED", "FAILED"]);

const VALID_TRANSITIONS = {
  UNVERIFIED: new Set(["VERIFYING"]),
  VERIFYING: new Set(["VERIFIED", "FAILED"]),
  FAILED: new Set(["VERIFYING"]),
  VERIFIED: new Set(),
};

export function isValidVerificationState(state) {
  return VERIFICATION_STATES.has(state);
}

export function transitionVerification(from, to) {
  if (!isValidVerificationState(from)) throw new Error(`Invalid verification state: ${from}`);
  if (!VALID_TRANSITIONS[from].has(to)) throw new Error(`Invalid transition: ${from} → ${to}. Allowed: ${[...VALID_TRANSITIONS[from]].join(", ") || "(none)"}`);
  return to;
}

export function createEvidence(method, result, details) {
  if (!method || !result) throw new Error("Evidence requires method and result");
  return { method, result, details: details || "", at: Date.now() };
}

export function isVerified(requirement) {
  return requirement?.verificationStatus === "VERIFIED" && Array.isArray(requirement.evidence) && requirement.evidence.length > 0;
}

export function canComplete(taskState) {
  const reqs = taskState?.requirements || [];
  const unverified = reqs.filter((r) => !isVerified(r));
  return { canComplete: unverified.length === 0, unverifiedCount: unverified.length, unverifiedIds: unverified.map((r) => r.id) };
}

export function hasOutstandingWork(taskState) {
  const reqs = taskState?.requirements || [];
  const unverified = reqs.filter((r) => !isVerified(r));
  const backlogPending = (taskState?.backlog || []).filter((b) => b.status === "pending");
  return unverified.length > 0 || backlogPending.length > 0;
}

export function verifyRequirement(requirement, evidenceItems = []) {
  if (evidenceItems.length === 0) throw new Error(`Cannot verify ${requirement.id}: no evidence provided`);
  return {
    ...requirement,
    verificationStatus: "VERIFIED",
    evidence: evidenceItems,
  };
}

export function failRequirement(requirement, reason = "") {
  return {
    ...requirement,
    verificationStatus: "FAILED",
    failureReason: reason,
  };
}
