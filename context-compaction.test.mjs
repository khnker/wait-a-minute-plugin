/**
 * Context Compaction — Change 73 tests (preserveMandatoryProvenance + updated compactContext).
 * Ejecutar: node --test context-compaction.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  compactContext,
  computeContextDelta,
  pruneContext,
  reconstructContext,
  preserveMandatoryProvenance,
} from "./context-compaction.js";

// --- Existing Change 44 tests (compactContext still works) ---

test("compactContext — returns null for missing fields", () => {
  const result = compactContext({});
  assert.equal(result.currentGoal, null);
  assert.equal(result.currentState, undefined);
  assert.deepEqual(result.mandatoryRequirements, []);
  assert.deepEqual(result.verifiedFacts, []);
  assert.deepEqual(result.openQuestions, []);
  assert.deepEqual(result.evidenceGaps, []);
  assert.deepEqual(result.contextGaps, []);
  assert.deepEqual(result.recentActions, []);
  assert.equal(result.nextConstraint, null);
});

test("compactContext — extracts mandatory requirements (non-optional)", () => {
  const taskState = {
    requirements: [
      { id: "r1", optional: false, status: "VERIFIED" },
      { id: "r2", optional: true, status: "VERIFIED" },
      { id: "r3", optional: false, status: "OPEN" },
    ],
  };
  const result = compactContext(taskState);
  assert.equal(result.mandatoryRequirements.length, 2);
  assert.equal(result.mandatoryRequirements[0].id, "r1");
  assert.equal(result.mandatoryRequirements[1].id, "r3");
});

test("compactContext — verifiedFacts from VERIFIED requirements", () => {
  const taskState = {
    requirements: [
      { id: "r1", status: "VERIFIED" },
      { id: "r2", status: "INVALIDATED" },
      { id: "r3", status: "VERIFIED" },
    ],
  };
  const result = compactContext(taskState);
  assert.equal(result.verifiedFacts.length, 2);
});

test("compactContext — verifiedFacts includes provenance", () => {
  const taskState = {
    requirements: [
      { id: "r1", status: "VERIFIED", provenance: "user_decided" },
      { id: "r2", status: "VERIFIED", provenance: "observed" },
    ],
  };
  const result = compactContext(taskState);
  assert.equal(result.verifiedFacts[0].provenance, "user_decided");
  assert.equal(result.verifiedFacts[1].provenance, "observed");
});

test("compactContext — full extraction with all fields", () => {
  const taskState = {
    currentGoal: "Build feature X",
    requirements: [
      { id: "r1", optional: false, status: "VERIFIED" },
      { id: "r2", optional: true, status: "OPEN" },
    ],
    phase: "IN_PROGRESS",
    questions: [{ id: "q1", status: "OPEN" }],
    evidenceGaps: ["g1"],
    contextGaps: ["cg1"],
    actions: ["a1", "a2"],
    nextConstraint: "Must finish by Friday",
  };
  const result = compactContext(taskState);
  assert.equal(result.currentGoal, "Build feature X");
  assert.equal(result.mandatoryRequirements.length, 1);
  assert.equal(result.currentState, "IN_PROGRESS");
  assert.deepEqual(result.verifiedFacts, [{ id: "r1", provenance: null }]);
  assert.deepEqual(result.openQuestions, ["q1"]);
  assert.deepEqual(result.recentActions, ["a1", "a2"]);
  assert.equal(result.nextConstraint, "Must finish by Friday");
});

// --- Change 73: _provenance metadata ---

test("compactContext — includes _provenance metadata", () => {
  const taskState = {
    currentGoal: "Test feature",
    requirements: [{ id: "r1", optional: false, status: "OPEN" }],
    phase: "TESTING",
  };
  const result = compactContext(taskState);
  assert.ok(result._provenance, "Should include _provenance");
  assert.equal(result._provenance.source, "task_state");
  assert.equal(result._provenance.mandatoryCount, 1);
  assert.ok(typeof result._provenance.compressedAt === "number");
  assert.ok(Array.isArray(result._provenance.retainedFields));
  assert.ok(result._provenance.retainedFields.includes("currentGoal"));
  assert.ok(result._provenance.retainedFields.includes("mandatoryRequirements"));
});

test("compactContext — mandatoryRequirements include provenance and mandatory flag", () => {
  const taskState = {
    requirements: [
      { id: "r1", optional: false, status: "VERIFIED", provenance: "user_decided" },
      { id: "r2", optional: false, status: "OPEN" },
    ],
  };
  const result = compactContext(taskState);
  assert.equal(result.mandatoryRequirements.length, 2);
  for (const req of result.mandatoryRequirements) {
    assert.equal(req.mandatory, true, `Requirement ${req.id} should have mandatory=true`);
    assert.ok("provenance" in req, `Requirement ${req.id} should have provenance field`);
  }
  assert.equal(result.mandatoryRequirements[0].provenance, "user_decided");
  assert.equal(result.mandatoryRequirements[1].provenance, null);
});

// --- Change 73: preserveMandatoryProvenance ---

test("preserveMandatoryProvenance — marks mandatory fields", () => {
  const compacted = { currentGoal: "Test", mandatoryRequirements: [], currentState: "IDLE" };
  const preserved = preserveMandatoryProvenance(compacted);
  assert.deepEqual(preserved._mandatoryFields, [
    "currentGoal",
    "mandatoryRequirements",
    "currentState",
    "verifiedFacts",
  ]);
  assert.equal(preserved._provenance.preservationGuaranteed, true);
});

test("preserveMandatoryProvenance — preserves all original data", () => {
  const compacted = {
    currentGoal: "Test",
    mandatoryRequirements: [{ id: "r1", mandatory: true }],
    recentActions: ["a1"],
    _provenance: { source: "task_state" },
  };
  const preserved = preserveMandatoryProvenance(compacted);
  assert.equal(preserved.currentGoal, "Test");
  assert.deepEqual(preserved.mandatoryRequirements, [{ id: "r1", mandatory: true }]);
  assert.deepEqual(preserved.recentActions, ["a1"]);
  assert.equal(preserved._provenance.source, "task_state");
  assert.equal(preserved._provenance.preservationGuaranteed, true);
});

test("preserveMandatoryProvenance — works on empty compacted context", () => {
  const preserved = preserveMandatoryProvenance({});
  assert.deepEqual(preserved._mandatoryFields, [
    "currentGoal",
    "mandatoryRequirements",
    "currentState",
    "verifiedFacts",
  ]);
  assert.equal(preserved._provenance.preservationGuaranteed, true);
});
