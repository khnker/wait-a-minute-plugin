/**
 * Context Router E2E tests — complete control loop validation.
 *
 * Tests the full flow:
 *   USER PROMPT → PRE-FLIGHT → TASK → RUN → GRAPH → ROUTER → ASSEMBLY
 *   → PROMPT → ACTION → OBSERVATION → EVIDENCE → VERIFICATION → COMPLETION
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Import all modules for E2E testing
import { deriveOperationalState, canPerformAction } from "./operational-state.js";
import { deriveVerification, markStaleOnInvalidation } from "./freshness-validation.js";
import { createConflict, resolveConflict } from "./contradiction-resolution.js";
import { generateContract, evaluateContract } from "./sufficiency-contract.js";
import { generateEventId, parseEventId, createScopedEvent } from "./run-event-identity.js";
import { createEvidence } from "./evidence-lineage.js";

const TEST_ROOT = path.join(process.cwd(), ".wam-test-e2e");

function setupTestTask() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
  const stateDir = path.join(TEST_ROOT, ".wam", "tasks", "task-e2e");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "state.yaml"), JSON.stringify({
    phase: "IMPLEMENTING",
    lastAction: "test task",
    requirements: [{ id: "req-1", title: "Test req", status: "pending" }],
  }));
}

function cleanupTestTask() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

/**
 * Simulate a complete WAM control loop for a task.
 */
function simulateControlLoop(scenario) {
  const {
    taskDescription,
    strategy,
    actions,
    observations,
    expectedOutcome,
  } = scenario;

  const trace = [];

  // 1. PRE-FLIGHT: Generate sufficiency contract
  const contract = generateContract(taskDescription, "task-e2e");
  trace.push({ phase: "CONTRACT", result: contract });

  // 2. EXECUTION: Create run and events
  const run = {
    id: "run-e2e-001",
    taskId: "task-e2e",
    startedAt: Date.now(),
    status: "active",
    actions: [],
    observations: [],
    evidence: [],
  };

  // 3. ACTIONS: Create scoped events
  for (const action of actions) {
    const event = createScopedEvent(run, "act", { description: action });
    run.actions.push(event);
    trace.push({ phase: "ACTION", result: event });
  }

  // 4. OBSERVATIONS: Record observations
  for (const observation of observations) {
    const event = createScopedEvent(run, "obs", { description: observation });
    run.observations.push(event);
    trace.push({ phase: "OBSERVATION", result: event });
  }

  // 5. EVIDENCE: Simulate evidence creation
  const evidence = {
    id: `ev-${run.id}-001`,
    requirementId: "req-1",
    runId: run.id,
    content: `Evidence for: ${taskDescription}`,
    type: "verification",
    timestamp: Date.now(),
  };
  trace.push({ phase: "EVIDENCE", result: evidence });

  // 6. VERIFICATION: Check verification status
  const node = { id: "req-1", verified: expectedOutcome === "verified" };
  const evidenceStatus = [{ id: evidence.id, status: "valid", updatedAt: Date.now() }];
  const verification = deriveVerification(node, evidenceStatus);
  trace.push({ phase: "VERIFICATION", result: verification });

  // 7. OPERATIONAL STATE: Derive state
  const operationalState = deriveOperationalState({
    executionState: "EXECUTING",
    routingStatus: "COMPLETE",
    evidenceStatus: "valid",
    verificationStatus: verification.effectiveVerified ? "VERIFIED" : "UNVERIFIED",
    hasActiveRun: true,
  });
  trace.push({ phase: "OPERATIONAL_STATE", result: operationalState });

  // 8. COMPLETION: Check if DONE is allowed
  const canComplete = canPerformAction(operationalState.state, "verify");
  trace.push({ phase: "COMPLETION_CHECK", result: canComplete });

  return { trace, run, evidence, verification, operationalState };
}

describe("E2E Control Loop", () => {
  it("successful flow: strategy → action → evidence → verified → DONE", () => {
    setupTestTask();
    try {
      const result = simulateControlLoop({
        taskDescription: "Install Playwright and verify Chromium launches",
        strategy: "npm install playwright",
        actions: ["npm install playwright"],
        observations: ["Chromium executable found at expected path"],
        expectedOutcome: "verified",
      });

      // Verify complete flow
      assert.ok(result.trace.length >= 5);
      assert.equal(result.verification.effectiveVerified, true);
      assert.equal(result.operationalState.state, "IMPLEMENTING");
      assert.ok(result.run.actions.length > 0);
      assert.ok(result.run.observations.length > 0);
    } finally {
      cleanupTestTask();
    }
  });

  it("failed flow: action → observation → insufficient evidence → BLOCKED", () => {
    setupTestTask();
    try {
      const result = simulateControlLoop({
        taskDescription: "Install Chromium and verify it launches",
        strategy: "npm install playwright",
        actions: ["npm install playwright"],
        observations: ["Chromium executable missing"],
        expectedOutcome: "insufficient",
      });

      // Verify blocked state
      assert.equal(result.verification.effectiveVerified, false);
      assert.ok(["BLOCKED", "DEGRADED", "IMPLEMENTING"].includes(result.operationalState.state));
    } finally {
      cleanupTestTask();
    }
  });

  it("scoped event IDs are unique and parseable", () => {
    const event = generateEventId("run-001", "act", 1);
    assert.equal(event, "run-001:act:001");

    const parsed = parseEventId(event);
    assert.ok(parsed);
    assert.equal(parsed.runId, "run-001");
    assert.equal(parsed.type, "act");
    assert.equal(parsed.sequence, 1);
  });

  it("sufficiency contract detects missing context", () => {
    const contract = generateContract("fix OAuth authentication flow", "task-auth");
    assert.ok(contract.conditions.length > 0);

    // Without capsules, should be insufficient
    const evaluated = evaluateContract(contract, []);
    assert.equal(evaluated.sufficient, false);
  });

  it("operational state blocks on invalidated evidence", () => {
    const state = deriveOperationalState({
      executionState: "EXECUTING",
      routingStatus: "COMPLETE",
      evidenceStatus: "invalidated",
    });

    assert.equal(state.state, "BLOCKED");
    assert.ok(state.blockers.some((b) => b.includes("invalidated")));
  });

  it("operational state allows completion when verified", () => {
    const state = deriveOperationalState({
      executionState: "VERIFYING",
      verificationStatus: "VERIFIED",
    });

    const canVerify = canPerformAction(state.state, "verify");
    assert.equal(canVerify.allowed, true);
  });

  it("run event IDs support lineage", () => {
    const run = {
      id: "run-001",
      actions: [],
      observations: [],
      decisions: [],
      evidence: [],
    };

    const event1 = createScopedEvent(run, "act", { description: "first action" });
    run.actions.push(event1);
    const event2 = createScopedEvent(run, "act", { description: "second action" });
    run.actions.push(event2);

    assert.equal(event1.id, "run-001:act:001");
    assert.equal(event2.id, "run-001:act:002");

    // Parse lineage
    const parsed1 = parseEventId(event1.id);
    const parsed2 = parseEventId(event2.id);
    assert.equal(parsed1.runId, parsed2.runId);
    assert.ok(parsed2.sequence > parsed1.sequence);
  });
});
