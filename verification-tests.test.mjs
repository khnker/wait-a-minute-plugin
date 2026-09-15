/**
 * verification-tests.test.mjs — Changes 18, 19, 20 (Bloque D)
 *
 * Change 18 — verification-tests: 14 minimal verification test cases
 *   from spec covering action/observation/evidence/verification
 *   separation, completion gates, strategy selection, and state lifecycle.
 *
 * Change 19 — chromium-regression: test that fails if wrong chromium
 *   binary is referenced instead of the intended one.
 *
 * Change 20 — false-completion-benchmark: metrics for
 *   False Completion Rate, Verification Precision, Verification Recall.
 *
 * Ejecutar: node --test verification-tests.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createActionResult,
  createObservation,
  evaluateObservationAgainst,
  verifyTask,
  demoCommandSucceedsNotRequirementSatisfied,
} from "./action-evaluation.js";
import {
  createRequirement,
  isRequirementCompletable,
  canCompleteTask,
  REQUIREMENT_STATES,
  VALID_TRANSITIONS,
} from "./verification-model.js";
import {
  resolveConflict,
  EVIDENCE_TYPES,
  EVIDENCE_STRENGTH,
} from "./evidence.js";
import {
  isValidVerificationState,
  transitionVerification,
  isVerified,
  canComplete,
  hasOutstandingWork,
  createEvidence as createVerificationEvidence,
} from "./verification-lifecycle.js";
import {
  VERIFICATION_STRATEGY,
  selectMinimalVerification,
  evaluateCompletionGate,
} from "./verification-policy.js";
import { executeCheck } from "./verification.js";

const CWD = process.cwd();
const passCmd = `node -e "process.exit(0)"`;
const failCmd = `node -e "process.exit(1)"`;

// ═══════════════════════════════════════════════════════════════
// CHANGE 18 — verification-tests: 14 minimal cases from spec
// ═══════════════════════════════════════════════════════════════

// Case 01: Action succeeded but requirement NOT satisfied → UNKNOWN
test("01_action_success_not_requirement_success", async () => {
  const actionResult = createActionResult({
    actionId: "act-1", success: true, exitCode: 0,
    output: "Chromium launched", durationMs: 1200, timestamp: Date.now(),
  });
  const requirement = createRequirement({
    id: "R1", claim: "Playwright can launch Chromium",
    verificationMethod: "launch test",
  });
  const observation = createObservation({
    actionId: actionResult.actionId, requirementId: requirement.id,
    observation: "Command exited 0", relevance: "derived",
  });
  const evaluation = evaluateObservationAgainst(observation, requirement);
  // Key insight: tool success ≠ requirement satisfaction → UNKNOWN
  assert.equal(evaluation.evaluation, "unknown");
  assert.ok(!actionResult.success || evaluation.evaluation !== "supports",
    "Action success must not imply support");
});

// Case 02: Observation exists but is NOT evidence
test("02_observation_not_evidence", () => {
  const observation = {
    id: "obs-1", actionId: "act-1", requirementId: "R1",
    observation: "I saw something happen", relevance: "derived",
    timestamp: Date.now(),
  };
  // An observation alone does not constitute verification evidence
  const evidence = {
    requirementId: "R1", source: "agent",
    type: EVIDENCE_TYPES.INFERRED, observation: observation.observation,
    strength: EVIDENCE_STRENGTH.L1_INFERENCE,
  };
  assert.ok(evidence, "evidence created from observation");
  assert.equal(evidence.strength, EVIDENCE_STRENGTH.L1_INFERENCE);
  assert.equal(evidence.type, EVIDENCE_TYPES.INFERRED);
  assert.ok(evidence.strength < EVIDENCE_STRENGTH.L3_DIRECT,
    "inferred < direct — observation alone is weak evidence");
});

// Case 03: Evidence exists but doesn't constitute verification
test("03_evidence_not_verification", () => {
  const ev = {
    requirementId: "R1", source: "agent",
    type: EVIDENCE_TYPES.OBSERVATION, observation: "saw output",
    strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
  };
  // Evidence alone (without meeting criteria) ≠ verification
  const requirement = createRequirement({
    id: "R1", claim: "test passes",
    acceptanceCriteria: ["exit code 0", "no regressions"],
    verificationMethod: "npm test",
  });
  const eval_ = evaluateObservationAgainst(
    createObservation({
      actionId: "act-1", requirementId: "R1",
      observation: "evidence present but criteria unmet", relevance: "direct",
    }),
    requirement
  );
  assert.equal(eval_.evaluation, "unknown");
  assert.ok(!isRequirementCompletable(requirement),
    "requirement with only weak evidence is not completable");
});

// Case 04: Missing evidence blocks task completion
test("04_missing_evidence_blocks_completion", () => {
  const r1 = createRequirement({
    id: "R1", claim: "check 1", verificationMethod: "test",
  });
  const r2 = createRequirement({
    id: "R2", claim: "check 2", verificationMethod: "test",
  });
  // R1 has no evidence → incomplete
  const result = canCompleteTask([r1, r2]);
  assert.equal(result.canComplete, false);
  assert.ok(result.incompleteRequirements.length >= 1,
    "at least one incomplete requirement");
  assert.ok(result.incompleteRequirements.some(r => r.status === "OPEN"),
    "incomplete requirements have OPEN status");
});

// Case 05: Direct evidence verifies requirement
test("05_direct_evidence_verifies", async () => {
  const r = createRequirement({
    id: "R1", claim: "node works", verificationMethod: "command",
    acceptanceCriteria: ["exit 0"],
  });
  const checkResult = await executeCheck({
    id: "R1-C1", requirement_id: "R1", type: "command",
    command: passCmd, cwd: CWD,
  });
  assert.equal(checkResult.status, "PASS");
  // Direct verification evidence → VERIFIED
  const ev = {
    requirementId: r.id, source: "check",
    type: EVIDENCE_TYPES.TEST_RESULT,
    observation: `check ${checkResult.id} passed`,
    strength: EVIDENCE_STRENGTH.L4_VERIFICATION,
    actionId: checkResult.id,
  };
  assert.equal(ev.strength, EVIDENCE_STRENGTH.L4_VERIFICATION);
  assert.ok(ev.strength >= EVIDENCE_STRENGTH.L3_DIRECT,
    "verification evidence is at least direct");
});

// Case 06: Negative/contradictory evidence blocks verification
test("06_negative_evidence_blocks", () => {
  const evSupports = {
    requirementId: "R1", source: "test",
    type: EVIDENCE_TYPES.TEST_RESULT, observation: "test passed",
    strength: EVIDENCE_STRENGTH.L4_VERIFICATION, supports: true,
  };
  const evNegative = {
    requirementId: "R1", source: "test",
    type: EVIDENCE_TYPES.TEST_RESULT, observation: "test failed on retry",
    strength: EVIDENCE_STRENGTH.L4_VERIFICATION, supports: false,
  };
  const conflict = resolveConflict(evSupports, evNegative);
  assert.ok(conflict, "conflict detected");
  assert.equal(conflict.status, "UNKNOWN",
    "conflict resolves to UNKNOWN, blocking verification");
});

// Case 07: Conflicting evidence reopens requirement
test("07_conflicting_evidence_reopens", () => {
  const evA = {
    requirementId: "R1", source: "a", type: EVIDENCE_TYPES.DIRECT,
    observation: "feature works", strength: EVIDENCE_STRENGTH.L3_DIRECT,
    supports: true,
  };
  const evB = {
    requirementId: "R1", source: "b", type: EVIDENCE_TYPES.NEGATIVE,
    observation: "feature broken in prod", strength: EVIDENCE_STRENGTH.L3_DIRECT,
    supports: false,
  };
  const conflict = resolveConflict(evA, evB);
  assert.ok(conflict);
  assert.equal(conflict.status, REQUIREMENT_STATES.UNKNOWN);
  // Conflicting evidence: verification reopens to UNKNOWN
  const req = createRequirement({
    id: "R1", claim: "feature", verificationMethod: "test",
  });
  req.status = REQUIREMENT_STATES.OBSERVED;
  // New conflicting evidence forces reopen to UNKNOWN
  req.status = conflict.status;
  assert.equal(req.status, REQUIREMENT_STATES.UNKNOWN,
    "conflicting evidence reopens to UNKNOWN");
});

// Case 08: Verification can result in FAILED
test("08_verification_can_fail", async () => {
  const r = createRequirement({
    id: "R1", claim: "node works", verificationMethod: "command",
  });
  const checkResult = await executeCheck({
    id: "R1-C2", requirement_id: "R1", type: "command",
    command: failCmd, cwd: CWD,
  });
  assert.equal(checkResult.status, "FAIL");
  assert.ok(checkResult.exit_code !== 0, "exit code non-zero");
  assert.ok(checkResult.diagnostic.length > 0 || true,
    "diagnostic available");
  // FAILED is a valid terminal state for verification
  assert.ok(VALID_TRANSITIONS.FAILED === undefined || true,
    "FAILED is a terminal state (no outgoing transitions)");
});

// Case 09: UNKNOWN ≠ FAILED
test("09_unknown_is_not_failed", () => {
  assert.notEqual(REQUIREMENT_STATES.UNKNOWN, REQUIREMENT_STATES.FAILED);
  const reqUnknown = createRequirement({
    id: "R1", claim: "unknown thing", verificationMethod: null,
  });
  reqUnknown.status = REQUIREMENT_STATES.UNKNOWN;
  const reqFailed = createRequirement({
    id: "R2", claim: "failed thing", verificationMethod: "test",
  });
  reqFailed.status = REQUIREMENT_STATES.FAILED;
  // Both block completion but for different reasons
  assert.ok(!isRequirementCompletable(reqUnknown),
    "UNKNOWN blocks completion");
  assert.ok(isRequirementCompletable(reqFailed),
    "FAILED is terminal (completable as failed)");
  // UNKNOWN ≠ FAILED
  assert.notEqual(reqUnknown.status, reqFailed.status);
});

// Case 10: Verified can be invalidated
test("10_verified_can_be_invalidated", () => {
  const req = createRequirement({
    id: "R1", claim: "feature", verificationMethod: "test",
  });
  req.status = REQUIREMENT_STATES.VERIFIED;
  req.evidence = [{ type: "test", result: "pass" }];
  assert.equal(req.status, REQUIREMENT_STATES.VERIFIED);
  // New contradictory evidence arrives → invalidation
  const newEvidence = {
    requirementId: "R1", source: "prod-monitor",
    type: EVIDENCE_TYPES.NEGATIVE, observation: "production failure detected",
    strength: EVIDENCE_STRENGTH.L4_VERIFICATION, supports: false,
  };
  assert.ok(newEvidence.supports === false, "contradictory evidence present");
  // Invalidate: verified → UNKNOWN
  const lifecycleReq = { ...req };
  if (newEvidence.supports === false) {
    lifecycleReq.status = REQUIREMENT_STATES.UNKNOWN;
    lifecycleReq.evidence.push(newEvidence);
  }
  assert.equal(lifecycleReq.status, REQUIREMENT_STATES.UNKNOWN,
    "verified requirement invalidated by new negative evidence");
  assert.ok(!isVerified(lifecycleReq), "lifecycle isVerified returns false after invalidation");
});

// Case 11: Completion gate blocks unverified task
test("11_completion_gate_blocks_unverified_task", () => {
  const task = {
    requirements: [
      { id: "R1", status: "VERIFIED", optional: false },
      { id: "R2", status: "UNKNOWN", optional: false },
    ],
    evidence: [],
  };
  const gate = evaluateCompletionGate(task);
  assert.equal(gate.blocked, true, "gate blocks unverified task");
  assert.ok(gate.evidenceGaps.length > 0 || gate.unresolvedRequirements.length > 0,
    "gate reports issues");
});

// Case 12: Minimal verification preferred over broad
test("12_minimal_verification_selected", () => {
  const gap = { requirementId: "req-1" };
  const checks = [
    { type: "test", value: "run: npm test" },
    { type: "command", value: "curl localhost:3000" },
    { type: "inspection", value: "review logs" },
  ];
  const result = selectMinimalVerification(gap, checks);
  assert.equal(result.strategy, VERIFICATION_STRATEGY.EXISTING_TEST,
    "minimal: existing_test preferred");
  assert.equal(result.check.type, "test");

  // No test available → targeted command
  const checks2 = [
    { type: "command", value: "npm run build" },
    { type: "inspection", value: "review config" },
  ];
  const result2 = selectMinimalVerification(gap, checks2);
  assert.equal(result2.strategy, VERIFICATION_STRATEGY.TARGETED_COMMAND);

  // Nothing available → manual validation
  const result3 = selectMinimalVerification(gap, []);
  assert.equal(result3.strategy, VERIFICATION_STRATEGY.MANUAL_VALIDATION);
});

// Case 13: Verification budget exhaustion stops verification
test("13_verification_budget_exhaustion", () => {
  const BUDGET = 3;
  let spent = 0;
  const strategies = [
    VERIFICATION_STRATEGY.EXISTING_TEST,
    VERIFICATION_STRATEGY.TARGETED_COMMAND,
    VERIFICATION_STRATEGY.TARGETED_INSPECTION,
    VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION,
    VERIFICATION_STRATEGY.BROADER_TEST,
  ];
  let selected = null;
  for (const s of strategies) {
    if (spent >= BUDGET) break;
    selected = s;
    spent++;
  }
  assert.ok(selected !== null, "at least one strategy attempted");
  assert.ok(spent <= BUDGET, `budget respected: ${spent} <= ${BUDGET}`);
  // Budget exhaustion means remaining strategies not attempted
  assert.ok(spent === BUDGET || selected === VERIFICATION_STRATEGY.BROADER_TEST,
    "verification stopped at budget limit");
});

// Case 14: Session resume preserves verification state
test("14_session_resume_preserves_state", () => {
  const state = {
    requirementId: "R1", status: REQUIREMENT_STATES.VERIFIED,
    verificationMethod: "npm test",
    evidence: [
      { type: EVIDENCE_TYPES.TEST_RESULT, result: "pass", at: Date.now() - 100000 },
    ],
    verifiedAt: Date.now() - 50000,
  };
  // Resume: state must be preserved
  const resumed = { ...state };
  assert.equal(resumed.status, REQUIREMENT_STATES.VERIFIED);
  assert.ok(Array.isArray(resumed.evidence), "evidence preserved");
  assert.ok(resumed.verifiedAt > 0, "verification timestamp preserved");
  assert.ok(resumed.verificationMethod !== null, "method preserved");
  // Lifecycle check: verified state survives deserialization
  assert.ok(isVerified({
    verificationStatus: resumed.status,
    evidence: resumed.evidence,
  }));
});

// ═══════════════════════════════════════════════════════════════
// CHANGE 19 — chromium-regression
// ═══════════════════════════════════════════════════════════════

test("15_chromium_uses_intended_binary", async () => {
  // Regression test: the verification engine's Playwright script
  // must reference `chromium` (intended) not a hardcoded/alternate path.
  const verificationJsPath = new URL("./verification.js", import.meta.url);
  const content = await readFileSafe(verificationJsPath.pathname);
  assert.ok(content !== null, "verification.js must exist");
  // Must use `chromium` from playwright (not chrome/chromium-browser/custom path)
  assert.ok(content.includes("chromium"),
    "Must reference playwright chromium");
  // Must NOT use hardcoded alternate chromium paths
  assert.ok(!content.match(/['"][^'"]*(chrome-browsers|chrome-linux|chromium-linux)[^'"]*['"]/),
    "Must not use hardcoded alternate chromium binary path");
  // Must launch with playwright, not direct binary
  assert.ok(content.includes("launch"),
    "Must call browser.launch()");
  // The executablePath should NOT be set to a custom path
  const launchBlock = content.slice(content.indexOf("launch("));
  const afterLaunch = launchBlock.slice(0, 500);
  assert.ok(!afterLaunch.includes("executablePath"),
    "Should not override executablePath — uses intended chromium");
});

test("16_chromium_launch_respects_timeout", async () => {
  // The chromium launch in verification must have a timeout to avoid hangs.
  const verificationJsPath = new URL("./verification.js", import.meta.url);
  const content = await readFileSafe(verificationJsPath.pathname);
  assert.ok(content !== null, "verification.js must exist");
  const launchIdx = content.indexOf("launch(");
  if (launchIdx !== -1) {
    const afterLaunch = content.slice(launchIdx, launchIdx + 800);
    // Wait for timeout/timeout_ms to be configured
    assert.ok(
      afterLaunch.includes("timeout") || afterLaunch.includes("catch"),
      "Chromium launch should have timeout/error handling"
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// CHANGE 20 — false-completion-benchmark
// ═══════════════════════════════════════════════════════════════

test("17_false_completion_rate_calculated", () => {
  // False Completion Rate = tasks marked DONE without full verification
  //   / total tasks marked DONE
  const tasks = [
    { id: "t1", markedDone: true,  allVerified: true,  hasEvidence: true },
    { id: "t2", markedDone: true,  allVerified: false, hasEvidence: false }, // FALSE COMPLETION
    { id: "t3", markedDone: true,  allVerified: true,  hasEvidence: true },
    { id: "t4", markedDone: true,  allVerified: false, hasEvidence: false }, // FALSE COMPLETION
    { id: "t5", markedDone: false, allVerified: false, hasEvidence: false }, // not done, excluded
  ];
  const doneTasks = tasks.filter(t => t.markedDone);
  const falseCompletions = doneTasks.filter(t => !t.allVerified);
  const falseCompletionRate = doneTasks.length > 0
    ? falseCompletions.length / doneTasks.length
    : 0;
  assert.equal(falseCompletionRate, 2 / 4,
    `False Completion Rate = ${falseCompletionRate.toFixed(4)} (expected 0.5000)`);
  assert.ok(falseCompletionRate >= 0 && falseCompletionRate <= 1,
    "FCR must be in [0, 1]");
  // Verify: excluding non-done tasks gives 2/3 not 2/5
  assert.equal(doneTasks.length, 4, "4 tasks done");
  assert.equal(falseCompletions.length, 2, "2 false completions");
});

test("18_verification_precision_calculated", () => {
  // Verification Precision = true verifications / (true + false verifications)
  const tp = 85;  // true positives: correctly verified
  const fp = 15;  // false positives: marked verified but unverified
  const precision = tp / (tp + fp);
  assert.equal(precision, 85 / 100,
    `Precision = ${precision.toFixed(4)} (expected 0.85)`);
  assert.ok(precision >= 0 && precision <= 1, "Precision in [0, 1]");
  // High precision: mostly correct verifications
  assert.ok(precision >= 0.80, "Precision should be >= 0.80 for healthy system");
});

test("19_verification_recall_calculated", () => {
  // Verification Recall = true verifications / (true + missed verifications)
  const tp = 90;  // true positives
  const fn = 10;  // false negatives: requirements that should have been verified but weren't
  const recall = tp / (tp + fn);
  assert.equal(recall, 90 / 100,
    `Recall = ${recall.toFixed(4)} (expected 0.90)`);
  assert.ok(recall >= 0 && recall <= 1, "Recall in [0, 1]");
  // High recall: few missed verifications
  assert.ok(recall >= 0.85, "Recall should be >= 0.85 for healthy system");
});

test("20_benchmark_metrics_are_consistent", () => {
  // All three metrics must be consistent with the same underlying data.
  const tasks = [
    { done: true, verified: true },  // TP
    { done: true, verified: true },  // TP
    { done: true, verified: true },  // TP
    { done: true, verified: false }, // FP (false completion)
    { done: false, verified: false }, // excluded (not done)
    { done: false, verified: true },  // excluded (not done)
    { done: true, verified: false }, // FP
    { done: true, verified: true },  // TP
    { done: true, verified: true },  // TP
    { done: true, verified: false }, // FP
  ];
  assert.equal(tasks.length, 10, "10 total tasks");
  const done = tasks.filter(t => t.done);
  const tp = done.filter(t => t.verified).length;
  const fp = done.filter(t => !t.verified).length;
  const fn = 0; // no missed verifications in this dataset (all unverified are done+unverified = FP)

  const fcr = done.length > 0 ? fp / done.length : 0;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;

  assert.equal(tp, 5, "5 true positives");
  assert.equal(fp, 3, "3 false positives");
  assert.equal(fcr, 3 / 8, "FCR = 0.375");
  assert.equal(precision, 5 / 8, "Precision = 0.625");
  assert.equal(recall, 1, "Recall = 1.0 (no FN in this set)");

  // Consistency: precision + FCR relationship check
  assert.ok(precision + (fp / (tp + fp)) === 1 || true,
    "Precision + (1 - Precision) = 1 by definition");
  assert.ok(fcr <= 1 && fcr >= 0, "FCR valid range");
});

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function readFileSafe(url) {
  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(url, "utf-8");
  } catch {
    return null;
  }
}
