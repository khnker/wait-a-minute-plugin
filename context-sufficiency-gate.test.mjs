import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSufficiency, SufficiencyGate, SUFFICIENCY_LEVEL } from "./context-sufficiency-gate.js";
import { CONTEXT_PURPOSE } from "./context-query-contract.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";
import { MEMORY_LAYERS } from "./context-memory-layers.js";

function makeItem(overrides = {}) {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    lifecycle: LIFECYCLE_STATES.ACTIVE,
    timestamp: Date.now(),
    memoryLayer: MEMORY_LAYERS.LOCAL,
    importance: "MEDIUM",
    mandatoryIncluded: false,
    unresolvedCriticalUnknowns: [],
    requirementId: null,
    hypothesisId: null,
    experimentId: null,
    executionId: null,
    scope: "LOCAL",
    content: {},
    ...overrides,
  };
}

test("sufficiency: SUFFICIENCY_LEVEL has expected values", () => {
  assert.ok(SUFFICIENCY_LEVEL.INSUFFICIENT);
  assert.ok(SUFFICIENCY_LEVEL.PARTIAL);
  assert.ok(SUFFICIENCY_LEVEL.SUFFICIENT);
  assert.ok(SUFFICIENCY_LEVEL.COMPLETE);
});

test("sufficiency: checkSufficiency returns INSUFFICIENT when no items", () => {
  const result = checkSufficiency([], CONTEXT_PURPOSE.PLANNING);
  assert.equal(result.level, SUFFICIENCY_LEVEL.INSUFFICIENT);
  assert.ok(result.missing.length > 0);
});

test("sufficiency: checkSufficiency returns INSUFFICIENT when only INVALIDATED", () => {
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.INVALIDATED })];
  const result = checkSufficiency(items, CONTEXT_PURPOSE.PLANNING);
  assert.equal(result.level, SUFFICIENCY_LEVEL.INSUFFICIENT);
});

test("sufficiency: checkSufficiency returns PARTIAL when critical unknowns", () => {
  const items = [makeItem({ unresolvedCriticalUnknowns: [{ reason: "missing runtime" }] })];
  const result = checkSufficiency(items, CONTEXT_PURPOSE.PLANNING);
  assert.equal(result.level, SUFFICIENCY_LEVEL.PARTIAL);
  assert.ok(result.unresolvedCriticalUnknowns.length > 0);
});

test("sufficiency: checkSufficiency returns SUFFICIENT for 1 active item", () => {
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.ACTIVE })];
  const result = checkSufficiency(items, CONTEXT_PURPOSE.PLANNING);
  assert.equal(result.level, SUFFICIENCY_LEVEL.SUFFICIENT);
});

test("sufficiency: checkSufficiency returns COMPLETE when sufficient active + mandatory", () => {
  // Need 3 active + mandatory for PLANNING minimum
  const items = Array(3).fill(0).map(() => makeItem({ mandatoryIncluded: true }));
  const result = checkSufficiency(items, CONTEXT_PURPOSE.PLANNING);
  assert.equal(result.level, SUFFICIENCY_LEVEL.COMPLETE);
});

test("sufficiency: checkSufficiency DEBUGGING with INVALIDATED includes history", () => {
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.INVALIDATED })];
  const result = checkSufficiency(items, CONTEXT_PURPOSE.DEBUGGING);
  assert.notEqual(result.level, SUFFICIENCY_LEVEL.INSUFFICIENT);
  // In DEBUGGING, INVALIDATED is included, so activeItems > 0
});

test("sufficiency: SufficiencyGate constructor with defaults", () => {
  const gate = new SufficiencyGate({ purpose: CONTEXT_PURPOSE.PLANNING });
  assert.equal(gate.purpose, CONTEXT_PURPOSE.PLANNING);
  assert.equal(gate.minLevel, SUFFICIENCY_LEVEL.SUFFICIENT);
});

test("sufficiency: SufficiencyGate evaluate returns PROCEED", () => {
  const gate = new SufficiencyGate({ purpose: CONTEXT_PURPOSE.PLANNING });
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.ACTIVE })];
  const result = gate.evaluate(items);
  assert.equal(result.decision, "PROCEED");
});

test("sufficiency: SufficiencyGate evaluate returns REQUEST_MORE when INSUFFICIENT", () => {
  const gate = new SufficiencyGate({ purpose: CONTEXT_PURPOSE.PLANNING });
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.INVALIDATED })];
  const result = gate.evaluate(items);
  assert.equal(result.decision, "REQUEST_MORE");
});

test("sufficiency: SufficiencyGate respects minLevel option", () => {
  const gate = new SufficiencyGate({ purpose: CONTEXT_PURPOSE.PLANNING, minLevel: SUFFICIENCY_LEVEL.COMPLETE });
  const items = [makeItem({ lifecycle: LIFECYCLE_STATES.ACTIVE })];
  const result = gate.evaluate(items);
  assert.equal(result.decision, "REQUEST_MORE");
});
