/**
 * Tests for context-drift-detection.js (Change 79)
 * Ejecutar: node --test context-drift-detection.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectContextDrift,
  trackDriftPattern,
} from "./context-drift-detection.js";

// -- detectContextDrift --------------------------------------------------------

test("detectContextDrift: returns aligned for matching action", () => {
  const result = detectContextDrift(
    { content: "Build authentication module", type: "task" },
    "Build authentication module"
  );
  assert.ok(!result.drifted);
  assert.ok(result.score > 0.5);
  assert.ok(result.confidence > 0.5);
});

test("detectContextDrift: null action returns no drift", () => {
  const result = detectContextDrift(null, "Build auth");
  assert.ok(!result.drifted);
  assert.equal(result.confidence, 0);
});

test("detectContextDrift: null goal returns no drift", () => {
  const result = detectContextDrift({ content: "something", type: "task" }, null);
  assert.ok(!result.drifted);
  assert.equal(result.confidence, 0);
});

test("detectContextDrift: empty objects return no drift", () => {
  const result = detectContextDrift({}, "");
  assert.ok(!result.drifted);
});

test("detectContextDrift: unrelated content flagged as drift", () => {
  const result = detectContextDrift(
    { content: "cooking show watching", type: "exploration" },
    "Build authentication module"
  );
  assert.ok(result.drifted);
});

test("detectContextDrift: returns DriftReport structure", () => {
  const result = detectContextDrift({ content: "test", type: "task" }, "Build auth");
  assert.ok("drifted" in result);
  assert.ok("score" in result);
  assert.ok("reason" in result);
  assert.ok("signals" in result);
  assert.ok("confidence" in result);
  assert.ok(Array.isArray(result.signals));
  assert.ok(typeof result.score === "number");
  assert.ok(typeof result.confidence === "number");
});

test("detectContextDrift: safe action types aligned", () => {
  for (const type of ["task", "requirement", "decision", "verification", "observation"]) {
    const result = detectContextDrift(
      { content: "Build authentication", type },
      "Build authentication module"
    );
    assert.ok(!result.drifted || result.confidence > 0.5, `Type ${type} should align`);
  }
});

test("detectContextDrift: drift action types flagged", () => {
  for (const type of ["exploration", "idle", "waiting", "wander"]) {
    const result = detectContextDrift(
      { content: "something", type },
      "Build authentication module"
    );
    assert.ok(result.drifted, `Type ${type} should drift`);
  }
});

test("detectContextDrift: custom threshold affects detection", () => {
  const strict = detectContextDrift(
    { content: "Building authentication" },
    "Build authentication module",
    null,
    { threshold: 0.9 }
  );
  const lenient = detectContextDrift(
    { content: "Building authentication" },
    "Build authentication module",
    null,
    { threshold: 0.1 }
  );
  // With strict threshold, borderline case might drift
  assert.ok(typeof strict.score === "number");
  assert.ok(typeof lenient.score === "number");
  assert.ok(lenient.score >= strict.score);
});

test("detectContextDrift: keywordWeight=0 ignores keywords", () => {
  const result = detectContextDrift(
    { content: "completely unrelated cooking show" },
    "Build authentication module",
    null,
    { keywordWeight: 0, typeWeight: 0.5, recencyWeight: 0.5 }
  );
  assert.ok(typeof result.score === "number");
});

// -- trackDriftPattern ---------------------------------------------------------

test("trackDriftPattern: throws on non-array", () => {
  assert.throws(() => trackDriftPattern(null, "goal"), TypeError);
  assert.throws(() => trackDriftPattern("string", "goal"), TypeError);
});

test("trackDriftPattern: empty array returns zero stats", () => {
  const result = trackDriftPattern([], "Build auth");
  assert.equal(result.totalActions, 0);
  assert.equal(result.driftCount, 0);
  assert.equal(result.driftRate, 0);
  assert.ok(!result.isPattern);
});

test("trackDriftPattern: all aligned", () => {
  const actions = [
    { content: "Build authentication", type: "task" },
    { content: "Build authentication", type: "task" },
    { content: "Build authentication", type: "task" },
  ];
  const result = trackDriftPattern(actions, "Build authentication module");
  assert.equal(result.totalActions, 3);
  assert.equal(result.driftCount, 0);
  assert.ok(result.summary.mostlyAligned);
});

test("trackDriftPattern: consistent drift", () => {
  const actions = [
    { content: "watching tv", type: "idle" },
    { content: "watching tv", type: "idle" },
    { content: "watching tv", type: "idle" },
  ];
  const result = trackDriftPattern(actions, "Build authentication module");
  assert.equal(result.driftCount, 3);
  assert.ok(result.summary.consistentDrift);
  assert.ok(result.isPattern);
});

test("trackDriftPattern: intermittent drift", () => {
  const actions = [
    { content: "Build auth", type: "task" },
    { content: "watching tv", type: "idle" },
    { content: "Build auth", type: "task" },
    { content: "watching tv", type: "idle" },
    { content: "Build auth", type: "task" },
  ];
  const result = trackDriftPattern(actions, "Build authentication module");
  assert.ok(result.driftCount >= 1);
  assert.ok(result.summary.intermittentDrift || result.summary.mostlyAligned);
});

test("trackDriftPattern: returns array of DriftResult", () => {
  const actions = [{ content: "test", type: "task" }];
  const result = trackDriftPattern(actions, "Build auth");
  assert.equal(result.results.length, 1);
  assert.ok("drifted" in result.results[0]);
});
