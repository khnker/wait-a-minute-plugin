import { detectEvidenceGaps } from "./evidence-gap.js";
import { EVIDENCE_STRENGTH } from "./evidence.js";

export const VERIFICATION_STRATEGY = {
  EXISTING_TEST: "existing_test",
  TARGETED_COMMAND: "targeted_command",
  TARGETED_INSPECTION: "targeted_inspection",
  MINIMAL_REPRODUCTION: "minimal_reproduction",
  BROADER_TEST: "broader_test",
  MANUAL_VALIDATION: "manual_validation"
};

export function selectMinimalVerification(gap, availableChecks = []) {
  // Prefer existing tests
  const existingTest = availableChecks.find(c => c.type === "test");
  if (existingTest) return { strategy: VERIFICATION_STRATEGY.EXISTING_TEST, check: existingTest };

  // Then targeted command
  const targetedCmd = availableChecks.find(c => c.type === "command");
  if (targetedCmd) return { strategy: VERIFICATION_STRATEGY.TARGETED_COMMAND, check: targetedCmd };

  // Then targeted inspection
  const inspection = availableChecks.find(c => c.type === "inspection");
  if (inspection) return { strategy: VERIFICATION_STRATEGY.TARGETED_INSPECTION, check: inspection };

  // Fallback to broader test
  const broader = availableChecks.find(c => c.type === "broader_test");
  if (broader) return { strategy: VERIFICATION_STRATEGY.BROADER_TEST, check: broader };

  return { strategy: VERIFICATION_STRATEGY.MANUAL_VALIDATION, check: null };
}

// Policy coordination: validate that policy transitions are legal
export function validatePolicyFlow(currentPolicy, nextPolicy) {
  const validTransitions = {
    [VERIFICATION_STRATEGY.EXISTING_TEST]: [VERIFICATION_STRATEGY.TARGETED_COMMAND],
    [VERIFICATION_STRATEGY.TARGETED_COMMAND]: [VERIFICATION_STRATEGY.TARGETED_INSPECTION],
    [VERIFICATION_STRATEGY.TARGETED_INSPECTION]: [VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION],
    [VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION]: [VERIFICATION_STRATEGY.BROADER_TEST],
    [VERIFICATION_STRATEGY.BROADER_TEST]: [VERIFICATION_STRATEGY.MANUAL_VALIDATION],
  };
  if (currentPolicy === nextPolicy) return { valid: false, reason: "same-policy" };
  const allowed = validTransitions[currentPolicy] || [];
  if (!allowed.includes(nextPolicy)) return { valid: false, reason: "invalid-transition" };
  return { valid: true };
}

// Policy coordination: get next policy in escalation chain
export function getNextPolicy(currentPolicy) {
  const chain = [
    VERIFICATION_STRATEGY.EXISTING_TEST,
    VERIFICATION_STRATEGY.TARGETED_COMMAND,
    VERIFICATION_STRATEGY.TARGETED_INSPECTION,
    VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION,
    VERIFICATION_STRATEGY.BROADER_TEST,
    VERIFICATION_STRATEGY.MANUAL_VALIDATION,
  ];
  const idx = chain.indexOf(currentPolicy);
  if (idx === -1 || idx === chain.length - 1) return null;
  return chain[idx + 1];
}

export function evaluateCompletionGate(task) {
  const { requirements = [], evidence = [] } = task;

  const gaps = detectEvidenceGaps(requirements, evidence);
  const mandatory = requirements.filter(r => !r.optional);
  const verified = mandatory.filter(r => r.status === "VERIFIED");

  const blocked = verified.length !== mandatory.length || gaps.length > 0;

  return {
    blocked,
    completedRequirements: verified.length,
    totalRequirements: mandatory.length,
    evidenceGaps: gaps,
    unresolvedRequirements: gaps.map(g => g.requirementId)
  };
}
