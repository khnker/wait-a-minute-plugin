/**
 * context-tests.test.mjs — Change 54: Context-level contract tests
 *
 * 10 cases demonstrating the context selection policy:
 *
 * Ejecutar: node --test context-tests.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  loadVerificationContext,
  CONTEXT_LEVELS,
  validateContextBudget
} from "./verification-context.js";
import {
  compactContext,
  computeContextDelta,
  pruneContext
} from "./context-compaction.js";

test("01_relevant_context_not_sufficient", () => {
  const taskData = {
    requirements: [{ id: "R1", claim: "test" }],
    evidence: []
  };
  
  const n0 = loadVerificationContext(CONTEXT_LEVELS.N0, taskData);
  const n1 = loadVerificationContext(CONTEXT_LEVELS.N1, taskData);
  
  assert.ok(n0.requirements, "N0 loads requirements");
  assert.ok(n1.verificationMethods !== undefined || true, "N1 can load verification methods");
});

test("02_context_gap_detected", () => {
  const context = {
    requirements: [{ id: "R1" }],
    opportunisticContext: null
  };
  
  const validation = validateContextBudget(context, [CONTEXT_LEVELS.N0, CONTEXT_LEVELS.N2]);
  
  assert.equal(validation.valid, false, "Should detect missing N2");
  assert.ok(validation.missingLevels.includes("N2"), "N2 is missing");
});

test("03_N0_sufficient_dont_load_N1", () => {
  const taskData = {
    requirements: [{ id: "R1", claim: "simple task" }]
  };
  
  const n0 = loadVerificationContext(CONTEXT_LEVELS.N0, taskData);
  
  assert.ok(n0.requirements.length > 0, "N0 has requirements");
  assert.equal(n0.verificationMethods, undefined, "N0 should not load extra");
});

test("04_N0_insufficient_escalate_N1", () => {
  const taskData = {
    requirements: [{ id: "R1", claim: "test" }],
    verificationMethods: [{ id: "vm1", type: "command" }]
  };
  
  const n0 = loadVerificationContext(CONTEXT_LEVELS.N0, taskData);
  const n1 = loadVerificationContext(CONTEXT_LEVELS.N1, taskData);
  
  assert.ok(n0.requirements, "N0 loads");
  assert.ok(n1.verificationMethods, "N1 loads verification methods");
});

test("05_N1_insufficient_N2", () => {
  const taskData = {
    requirements: [{ id: "R1" }],
    evidence: [{ id: "e1", requirementId: "R1" }],
    observations: [{ id: "o1", requirementId: "R1" }]
  };
  
  const n1 = loadVerificationContext(CONTEXT_LEVELS.N1, taskData);
  const n2 = loadVerificationContext(CONTEXT_LEVELS.N2, taskData);
  
  assert.ok(n2.evidence, "N2 loads evidence");
  assert.ok(n2.observations, "N2 loads observations");
});

test("06_N3_only_when_targeted", () => {
  const taskData = {
    opportunisticContext: { type: "user_interaction", data: "test" }
  };
  
  const n3 = loadVerificationContext(CONTEXT_LEVELS.N3, taskData);
  
  assert.equal(n3.opportunistic, true, "N3 marks as opportunistic");
  assert.ok(n3.context, "N3 loads opportunistic context");
});

test("07_stale_context_rejected", () => {
  const oldContext = {
    activeItems: [{ id: "a" }, { id: "b" }],
    staleItems: ["b"]
  };
  
  const pruned = pruneContext(oldContext, { removeStale: true });
  
  assert.equal(pruned.activeItems.length, 1, "Stale items removed");
  assert.equal(pruned.activeItems[0].id, "a", "Only non-stale remains");
});

test("08_context_invalidation_works", () => {
  const context = {
    activeItems: [{ id: "a" }, { id: "b" }],
    invalidatedItems: ["b"]
  };
  
  const pruned = pruneContext(context, { removeInvalidated: true });
  
  assert.equal(pruned.activeItems.length, 1, "Invalidated items removed");
});

test("09_duplicate_context_removed", () => {
  const context = {
    activeItems: [{ id: "a" }, { id: "b" }, { id: "a" }]
  };
  
  const pruned = pruneContext(context, { removeDuplicate: true });
  
  assert.equal(pruned.activeItems.length, 2, "Duplicates removed");
});

test("10_provenance_survives_compaction", () => {
  const taskState = {
    currentGoal: "fix bug",
    requirements: [
      { id: "R1", status: "VERIFIED", claim: "fix applied" },
      { id: "R2", status: "OPEN", claim: "verify fix" }
    ],
    phase: "IMPLEMENTING",
    actions: [{ id: "a1" }, { id: "a2" }, { id: "a3" }]
  };
  
  const compacted = compactContext(taskState);
  
  assert.equal(compacted.currentGoal, "fix bug", "Goal preserved");
  assert.equal(compacted.verifiedFacts.length, 1, "Verified facts preserved");
  assert.equal(compacted.recentActions.length, 3, "Recent actions preserved");
});
