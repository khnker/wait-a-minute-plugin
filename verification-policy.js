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

// Change 28 — Verification-strategy: ordered strategy with cost estimation
export const VERIFICATION_STRATEGY_ORDER = [
  VERIFICATION_STRATEGY.EXISTING_TEST,
  VERIFICATION_STRATEGY.TARGETED_COMMAND,
  VERIFICATION_STRATEGY.TARGETED_INSPECTION,
  VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION,
  VERIFICATION_STRATEGY.BROADER_TEST,
  VERIFICATION_STRATEGY.MANUAL_VALIDATION
];

export function rankVerificationStrategies(strategies, context) {
  // Always prefer cheaper strategies first
  return strategies
    .filter(s => VERIFICATION_STRATEGY_ORDER.includes(s))
    .sort((a, b) => VERIFICATION_STRATEGY_ORDER.indexOf(a) - VERIFICATION_STRATEGY_ORDER.indexOf(b));
}

export function estimateStrategyCost(strategy) {
  const costs = {
    [VERIFICATION_STRATEGY.EXISTING_TEST]: 1,
    [VERIFICATION_STRATEGY.TARGETED_COMMAND]: 2,
    [VERIFICATION_STRATEGY.TARGETED_INSPECTION]: 3,
    [VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION]: 4,
    [VERIFICATION_STRATEGY.BROADER_TEST]: 5,
    [VERIFICATION_STRATEGY.MANUAL_VALIDATION]: 10
  };
  return costs[strategy] || 10;
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
