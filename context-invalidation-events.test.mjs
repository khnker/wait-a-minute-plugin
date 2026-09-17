import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInvalidationEvent,
  applyInvalidation,
  createFileModifiedEvent,
  createRequirementChangedEvent,
  createStrategyChangedEvent,
  createHypothesisContradictedEvent,
  createDependencyChangedEvent,
  createConfigChangedEvent,
  createToolResultContradictsPremiseEvent,
  INVALIDATION_REASONS,
  CONTEXT_INVALIDATION_ACTIONS,
  determineInvalidationAction,
} from "./context-invalidation-events.js";
import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";

class MockContextManager {
  constructor() {
    this.items = new Map();
  }
  register(item) { this.items.set(item.id, item); }
  getSource(id) { return this.items.get(id); }
}

test("invalidation: createInvalidationEvent creates valid event", () => {
  const event = createInvalidationEvent("T1", INVALIDATION_REASONS.FILE_MODIFIED, {
    sessionId: "S1",
    invalidatedIds: ["item-1"],
  });
  assert.equal(event.type, CONTEXT_EVENT_TYPES.CONTEXT_INVALIDATED);
  assert.equal(event.taskId, "T1");
  assert.equal(event.payload.reason, INVALIDATION_REASONS.FILE_MODIFIED);
  assert.ok(event.payload.invalidatedAt > 0);
});

test("invalidation: createFileModifiedEvent", () => {
  const event = createFileModifiedEvent("T1", "/src/parser.ts", "S1");
  assert.equal(event.payload.reason, INVALIDATION_REASONS.FILE_MODIFIED);
  assert.equal(event.payload.path, "/src/parser.ts");
});

test("invalidation: createRequirementChangedEvent", () => {
  const event = createRequirementChangedEvent("T1", "R1", "S1");
  assert.equal(event.payload.reason, INVALIDATION_REASONS.REQUIREMENT_CHANGED);
  assert.equal(event.payload.requirementId, "R1");
  assert.equal(event.payload.invalidatedIds[0], "R1");
});

test("invalidation: createHypothesisContradictedEvent", () => {
  const event = createHypothesisContradictedEvent("T1", "H1", "S1", "E1");
  assert.equal(event.payload.reason, INVALIDATION_REASONS.HYPOTHESIS_CONTRADICTED);
  assert.equal(event.payload.hypothesisId, "H1");
  assert.equal(event.executionId, "E1");
});

test("invalidation: applyInvalidation marks items INVALIDATED", () => {
  const mgr = new MockContextManager();
  mgr.register({ id: "item-1", lifecycle: "ACTIVE" });
  mgr.register({ id: "item-2", lifecycle: "ACTIVE" });

  const event = createInvalidationEvent("T1", INVALIDATION_REASONS.FILE_MODIFIED, {
    invalidatedIds: ["item-1", "item-2"],
  });

  const affected = applyInvalidation(mgr, null, event);
  assert.equal(affected.length, 2);
  assert.equal(mgr.getSource("item-1").lifecycle, "INVALIDATED");
  assert.equal(mgr.getSource("item-2").lifecycle, "INVALIDATED");
});

test("invalidation: determineInvalidationAction for hypothesis contradicted", () => {
  const action = determineInvalidationAction({ lifecycle: "ACTIVE" }, INVALIDATION_REASONS.HYPOTHESIS_CONTRADICTED);
  assert.equal(action, CONTEXT_INVALIDATION_ACTIONS.INVALIDATE_ITEM);
});

test("invalidation: determineInvalidationAction for file modified", () => {
  const action = determineInvalidationAction({ lifecycle: "ACTIVE" }, INVALIDATION_REASONS.FILE_MODIFIED);
  assert.equal(action, CONTEXT_INVALIDATION_ACTIONS.STALE_ITEM);
});

test("invalidation: determineInvalidationAction respects terminal states", () => {
  const action1 = determineInvalidationAction({ lifecycle: "ARCHIVED" }, INVALIDATION_REASONS.FILE_MODIFIED);
  const action2 = determineInvalidationAction({ lifecycle: "INVALIDATED" }, INVALIDATION_REASONS.FILE_MODIFIED);
  assert.equal(action1, CONTEXT_INVALIDATION_ACTIONS.REEVALUATE_ITEM);
  assert.equal(action2, CONTEXT_INVALIDATION_ACTIONS.REEVALUATE_ITEM);
});

test("invalidation: createConfigChangedEvent", () => {
  const event = createConfigChangedEvent("T1", "chromium.path", "S1");
  assert.equal(event.payload.reason, INVALIDATION_REASONS.CONFIG_CHANGED);
  assert.equal(event.payload.configKey, "chromium.path");
});