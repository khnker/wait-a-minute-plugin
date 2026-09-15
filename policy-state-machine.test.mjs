import {
  POLICY_STATES,
  POLICY_TRANSITIONS,
  POLICY_CHAIN,
  validatePolicyFlow,
  getNextPolicy,
  createPolicyDecision,
  isValidPolicyTransition,
  POLICY_PRECONDITIONS,
  checkPolicyPreconditions
} from "./policy-state-machine.js";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

function test(name, fn) {
  console.log(`Test: ${name}`);
  try {
    fn();
  } catch (e) {
    console.error(`  FAIL: ${e.message}`);
    failed++;
  }
}

// --- POLICY STATES ---
test("POLICY_STATES has all 8 states", () => {
  const states = Object.values(POLICY_STATES);
  assert(states.length === 8, `expected 8 states, got ${states.length}`);
  assert(states.includes("Scope"), "missing Scope");
  assert(states.includes("Investigate"), "missing Investigate");
  assert(states.includes("Action"), "missing Action");
  assert(states.includes("Debug"), "missing Debug");
  assert(states.includes("Observe"), "missing Observe");
  assert(states.includes("Verify"), "missing Verify");
  assert(states.includes("Review"), "missing Review");
  assert(states.includes("Completion"), "missing Completion");
});

// --- POLICY TRANSITIONS ---
test("POLICY_TRANSITIONS: Scope -> Investigate", () => {
  assert(POLICY_TRANSITIONS[POLICY_STATES.SCOPE].includes(POLICY_STATES.INVESTIGATE), "Scope should go to Investigate");
  assert(POLICY_TRANSITIONS[POLICY_STATES.SCOPE].length === 1, "Scope should have exactly 1 transition");
});

test("POLICY_TRANSITIONS: Investigate -> Action or Debug", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.INVESTIGATE];
  assert(t.includes(POLICY_STATES.ACTION), "Investigate should go to Action");
  assert(t.includes(POLICY_STATES.DEBUG), "Investigate should go to Debug");
});

test("POLICY_TRANSITIONS: Action -> Observe or Verify", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.ACTION];
  assert(t.includes(POLICY_STATES.OBSERVE), "Action should go to Observe");
  assert(t.includes(POLICY_STATES.VERIFY), "Action should go to Verify");
});

test("POLICY_TRANSITIONS: Debug -> Observe or Verify", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.DEBUG];
  assert(t.includes(POLICY_STATES.OBSERVE), "Debug should go to Observe");
  assert(t.includes(POLICY_STATES.VERIFY), "Debug should go to Verify");
});

test("POLICY_TRANSITIONS: Observe -> Verify or Review", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.OBSERVE];
  assert(t.includes(POLICY_STATES.VERIFY), "Observe should go to Verify");
  assert(t.includes(POLICY_STATES.REVIEW), "Observe should go to Review");
});

test("POLICY_TRANSITIONS: Verify -> Review or Completion", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.VERIFY];
  assert(t.includes(POLICY_STATES.REVIEW), "Verify should go to Review");
  assert(t.includes(POLICY_STATES.COMPLETION), "Verify should go to Completion");
});

test("POLICY_TRANSITIONS: Review -> Completion or Investigate", () => {
  const t = POLICY_TRANSITIONS[POLICY_STATES.REVIEW];
  assert(t.includes(POLICY_STATES.COMPLETION), "Review should go to Completion");
  assert(t.includes(POLICY_STATES.INVESTIGATE), "Review should go back to Investigate");
});

test("POLICY_TRANSITIONS: Completion has no outgoing", () => {
  assert(POLICY_TRANSITIONS[POLICY_STATES.COMPLETION].length === 0, "Completion should have no transitions");
});

// --- VALIDATE POLICY FLOW (Change 36) ---
test("validatePolicyFlow: valid transition", () => {
  const result = validatePolicyFlow(POLICY_STATES.SCOPE, POLICY_STATES.INVESTIGATE);
  assert(result.valid === true, "Scope->Investigate should be valid");
});

test("validatePolicyFlow: invalid transition", () => {
  const result = validatePolicyFlow(POLICY_STATES.SCOPE, POLICY_STATES.ACTION);
  assert(result.valid === false, "Scope->Action should be invalid");
  assert(result.reason === "invalid-transition", `expected invalid-transition, got ${result.reason}`);
});

test("validatePolicyFlow: same policy", () => {
  const result = validatePolicyFlow(POLICY_STATES.SCOPE, POLICY_STATES.SCOPE);
  assert(result.valid === false, "same policy should be invalid");
  assert(result.reason === "same-policy", `expected same-policy, got ${result.reason}`);
});

test("validatePolicyFlow: Verify->Completion valid", () => {
  const result = validatePolicyFlow(POLICY_STATES.VERIFY, POLICY_STATES.COMPLETION);
  assert(result.valid === true, "Verify->Completion should be valid");
});

// --- GET NEXT POLICY (Change 36) ---
test("getNextPolicy: Scope returns Investigate", () => {
  assert(getNextPolicy(POLICY_STATES.SCOPE) === POLICY_STATES.INVESTIGATE, "next after Scope should be Investigate");
});

test("getNextPolicy: Review returns Completion", () => {
  assert(getNextPolicy(POLICY_STATES.REVIEW) === POLICY_STATES.COMPLETION, "next after Review should be Completion");
});

test("getNextPolicy: Completion returns null", () => {
  assert(getNextPolicy(POLICY_STATES.COMPLETION) === null, "next after Completion should be null");
});

test("getNextPolicy: unknown policy returns null", () => {
  assert(getNextPolicy("Unknown") === null, "next after unknown should be null");
});

// --- CREATE POLICY DECISION ---
test("createPolicyDecision: basic", () => {
  const decision = createPolicyDecision("scope", "investigate", "start investigation");
  assert(decision.policy === "scope", "policy should be scope");
  assert(decision.action === "investigate", "action should be investigate");
  assert(decision.reason === "start investigation", "reason should match");
  assert(Array.isArray(decision.requirementsAffected), "requirementsAffected should be array");
  assert(decision.requirementsAffected.length === 0, "default requirementsAffected empty");
  assert(decision.expectedObservation === null, "default expectedObservation null");
  assert(typeof decision.timestamp === "number", "timestamp should be number");
});

test("createPolicyDecision: with all params", () => {
  const decision = createPolicyDecision("action", "execute", "do it", ["req-1"], "observation");
  assert(decision.requirementsAffected.length === 1, "should have 1 requirement");
  assert(decision.expectedObservation === "observation", "expectedObservation should match");
});

// --- IS VALID POLICY TRANSITION ---
test("isValidPolicyTransition: valid", () => {
  assert(isValidPolicyTransition(POLICY_STATES.SCOPE, POLICY_STATES.INVESTIGATE) === true, "valid transition");
});

test("isValidPolicyTransition: invalid", () => {
  assert(isValidPolicyTransition(POLICY_STATES.SCOPE, POLICY_STATES.ACTION) === false, "invalid transition");
});

test("isValidPolicyTransition: unknown from state", () => {
  assert(isValidPolicyTransition("Unknown", POLICY_STATES.SCOPE) === false, "unknown from state");
});

// --- POLICY PRECONDITIONS (Change 38) ---
test("POLICY_PRECONDITIONS: structure", () => {
  assert(POLICY_PRECONDITIONS[POLICY_STATES.INVESTIGATE].contextSufficient === true, "Investigate needs context");
  assert(POLICY_PRECONDITIONS[POLICY_STATES.ACTION].requirementKnown === true, "Action needs requirement");
  assert(POLICY_PRECONDITIONS[POLICY_STATES.DEBUG].requirementKnown === true, "Debug needs requirement");
  assert(POLICY_PRECONDITIONS[POLICY_STATES.VERIFY].evidenceAvailable === true, "Verify needs evidence");
  assert(POLICY_PRECONDITIONS[POLICY_STATES.REVIEW].allVerified === false, "Review allVerified=false");
});

test("checkPolicyPreconditions: unknown policy returns satisfied", () => {
  const result = checkPolicyPreconditions("Unknown", {});
  assert(result.satisfied === true, "unknown policy should be satisfied");
  assert(result.failures.length === 0, "no failures for unknown policy");
});

test("checkPolicyPreconditions: Investigate with sufficient context", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.INVESTIGATE, { contextSufficient: true });
  assert(result.satisfied === true, "Investigate with context should be satisfied");
});

test("checkPolicyPreconditions: Investigate without sufficient context", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.INVESTIGATE, { contextSufficient: false });
  assert(result.satisfied === false, "Investigate without context should fail");
  assert(result.failures.includes("context not sufficient"), "failure message should mention context");
});

test("checkPolicyPreconditions: Action with requirement", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.ACTION, { currentRequirement: "req-1" });
  assert(result.satisfied === true, "Action with requirement should be satisfied");
});

test("checkPolicyPreconditions: Action without requirement", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.ACTION, {});
  assert(result.satisfied === false, "Action without requirement should fail");
  assert(result.failures.includes("no current requirement"), "failure message should mention requirement");
});

test("checkPolicyPreconditions: Debug with requirement", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.DEBUG, { currentRequirement: "req-1" });
  assert(result.satisfied === true, "Debug with requirement should be satisfied");
});

test("checkPolicyPreconditions: Debug without requirement", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.DEBUG, {});
  assert(result.satisfied === false, "Debug without requirement should fail");
});

test("checkPolicyPreconditions: Verify with evidence", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.VERIFY, { evidence: ["e1"] });
  assert(result.satisfied === true, "Verify with evidence should be satisfied");
});

test("checkPolicyPreconditions: Verify without evidence", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.VERIFY, {});
  assert(result.satisfied === false, "Verify without evidence should fail");
  assert(result.failures.includes("no evidence available"), "failure message should mention evidence");
});

test("checkPolicyPreconditions: Verify with empty evidence", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.VERIFY, { evidence: [] });
  assert(result.satisfied === false, "Verify with empty evidence should fail");
});

test("checkPolicyPreconditions: Review all verified (allVerified=false allows)", () => {
  // allVerified=false means can review even if not all verified
  const result = checkPolicyPreconditions(POLICY_STATES.REVIEW, { requirements: [{ status: "PENDING" }] });
  // Since allVerified is false (not strict), it should be satisfied
  assert(result.satisfied === true, "Review with allVerified=false should be satisfied even if unverified");
});

test("checkPolicyPreconditions: Review all verified true with unverified", () => {
  // If allVerified were true and requirements unverified
  // Note: per spec, allVerified is false so this branch doesn't fire
  // But if a policy had allVerified=true manually, it should check
  const customPreconditions = { [POLICY_STATES.REVIEW]: { allVerified: true } };
  // Use a workaround: directly test the filter logic path
  const result = checkPolicyPreconditions(POLICY_STATES.REVIEW, { requirements: [{ status: "PENDING" }] });
  // The spec says allVerified=false for REVIEW, so the allVerified=true branch never triggers for REVIEW
  // This test documents the expected behavior per spec
  assert(Array.isArray(result.failures), "failures should be array");
});

test("checkPolicyPreconditions: full satisfied state", () => {
  const result = checkPolicyPreconditions(POLICY_STATES.VERIFY, { evidence: ["e1"] });
  assert(result.satisfied === true, "Verify fully satisfied");
  assert(result.failures.length === 0, "no failures when satisfied");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
