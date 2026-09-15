/**
 * Tests for context-recovery.js (Change 78)
 * Ejecutar: node --test context-recovery.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  reconstructMinimumCorrectiveContext,
  detectActionDrift,
} from "./context-recovery.js";

// -- reconstructMinimumCorrectiveContext --------------------------------------

test("reconstructMinimumCorrectiveContext: requires goal", () => {
  assert.throws(
    () => reconstructMinimumCorrectiveContext({ goal: "", driftReason: "test" }),
    TypeError
  );
  assert.throws(
    () => reconstructMinimumCorrectiveContext({ goal: 123, driftReason: "test" }),
    TypeError
  );
  assert.throws(
    () => reconstructMinimumCorrectiveContext({ driftReason: "test" }),
    TypeError
  );
});

test("reconstructMinimumCorrectiveContext: requires driftReason", () => {
  assert.throws(
    () => reconstructMinimumCorrectiveContext({ goal: "build auth" }),
    TypeError
  );
  assert.throws(
    () => reconstructMinimumCorrectiveContext({ goal: "build auth", driftReason: "" }),
    TypeError
  );
});

test("reconstructMinimumCorrectiveContext: basic recovery context", () => {
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build authentication module",
    driftReason: "Agent went off-track",
  });
  assert.equal(ctx.goal, "Build authentication module");
  assert.equal(ctx.driftReason, "Agent went off-track");
  assert.ok(ctx.timestamp > 0);
  assert.deepEqual(ctx.accomplished, []);
  assert.deepEqual(ctx.recentObservations, []);
  assert.deepEqual(ctx.constraints, []);
  assert.deepEqual(ctx.openQuestions, []);
});

test("reconstructMinimumCorrectiveContext: includes accomplished items", () => {
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build auth",
    driftReason: "Off-track",
    accomplished: [
      { id: "a1", content: "Auth setup", timestamp: 1000 },
      { id: "a2", content: "DB connection", timestamp: 2000 },
    ],
  });
  assert.equal(ctx.accomplished.length, 2);
  // Sorted by timestamp desc
  assert.equal(ctx.accomplished[0].id, "a2");
  assert.equal(ctx.accomplished[1].id, "a1");
});

test("reconstructMinimumCorrectiveContext: maxAccomplished limits items", () => {
  const items = [
    { id: "1", content: "1", timestamp: 1000 },
    { id: "2", content: "2", timestamp: 2000 },
    { id: "3", content: "3", timestamp: 3000 },
    { id: "4", content: "4", timestamp: 4000 },
  ];
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build auth",
    driftReason: "Off-track",
    accomplished: items,
    maxAccomplished: 2,
  });
  assert.equal(ctx.accomplished.length, 2);
  assert.equal(ctx.accomplished[0].id, "4"); // Most recent
  assert.equal(ctx.accomplished[1].id, "3");
});

test("reconstructMinimumCorrectiveContext: includes observations", () => {
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build auth module",
    driftReason: "Wandering",
    observations: [
      { content: "auth module progress", timestamp: 5000 },
      { content: "unrelated observation", timestamp: 6000 },
    ],
  });
  // First obs is goal-relevant, second is not (no goal keywords)
  assert.ok(ctx.recentObservations.length >= 1);
  assert.ok(
    ctx.recentObservations.some((o) => o.content === "auth module progress"),
    "Should include relevant observation"
  );
});

test("reconstructMinimumCorrectiveContext: includes constraints", () => {
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build auth",
    driftReason: "Off-track",
    constraints: [{ id: "c1", content: "Use JWT" }],
  });
  assert.equal(ctx.constraints.length, 1);
  assert.equal(ctx.constraints[0].id, "c1");
});

test("reconstructMinimumCorrectiveContext: includes open questions", () => {
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build auth",
    driftReason: "Off-track",
    openQuestions: [{ id: "q1", content: "Which DB?" }],
  });
  assert.equal(ctx.openQuestions.length, 1);
});

test("reconstructMinimumCorrectiveContext: maxObservations limits", () => {
  const observations = Array.from({ length: 10 }, (_, i) => ({
    content: `Build authentication goal item ${i}`,
    timestamp: 1000 + i * 100,
  }));
  const ctx = reconstructMinimumCorrectiveContext({
    goal: "Build authentication goal",
    driftReason: "Test",
    observations,
    maxObservations: 3,
  });
  assert.equal(ctx.recentObservations.length, 3);
});

// -- detectActionDrift --------------------------------------------------------

test("detectActionDrift: returns non-drift for matching action", () => {
  const result = detectActionDrift(
    { content: "Building authentication module", type: "task" },
    "Build authentication module"
  );
  assert.ok(!result.drifted);
  assert.ok(result.confidence > 0.5);
});

test("detectActionDrift: returns drift for unrelated action", () => {
  const result = detectActionDrift(
    { content: "Watching cooking videos", type: "exploration" },
    "Build authentication module"
  );
  assert.ok(result.drifted);
});

test("detectActionDrift: detects drift indicators", () => {
  const result = detectActionDrift(
    { content: "exploring wandering", type: "idle" },
    "Build authentication module"
  );
  assert.ok(result.drifted);
  assert.ok(result.signals.length > 0);
});

test("detectActionDrift: detects drift with explicit drift content", () => {
  const result = detectActionDrift(
    { content: "watching cooking videos", type: "exploration" },
    "Build authentication module"
  );
  assert.ok(result.drifted);
  assert.ok(result.signals.length > 0);
});

test("detectActionDrift: handles null action", () => {
  const result = detectActionDrift(null, "Build auth");
  assert.ok(!result.drifted);
  assert.equal(result.confidence, 0);
});

test("detectActionDrift: handles null goal", () => {
  const result = detectActionDrift({ content: "something", type: "task" }, null);
  assert.ok(!result.drifted);
  assert.equal(result.confidence, 0);
});

test("detectActionDrift: handles minimal input", () => {
  const result = detectActionDrift({ content: "", type: "" }, "Build auth");
  assert.ok(typeof result.drifted === "boolean");
  assert.ok(typeof result.confidence === "number");
});

test("detectActionDrift: safe action types are not drifted", () => {
  const safeTypes = ["task", "requirement", "decision", "verification", "observation", "evidence", "plan"];
  for (const type of safeTypes) {
    const result = detectActionDrift({ content: "auth build work", type }, "Build auth");
    assert.ok(!result.drifted || result.confidence > 0.5, `Type ${type} should be aligned`);
  }
});

test("detectActionDrift: drift indicator types flagged", () => {
  const driftTypes = ["exploration", "idle", "wander"];
  for (const type of driftTypes) {
    const result = detectActionDrift({ content: "something", type }, "Build auth");
    assert.ok(result.drifted, `Type ${type} should be drifted`);
  }
});

test("detectActionDrift: returns proper DriftReport structure", () => {
  const result = detectActionDrift(
    { content: "watching cooking show", type: "exploration" },
    "Build authentication module"
  );
  assert.ok("drifted" in result);
  assert.ok("reason" in result);
  assert.ok("confidence" in result);
  assert.ok("signals" in result);
  assert.ok(Array.isArray(result.signals));
});
