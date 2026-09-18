import { test } from "node:test";
import assert from "node:assert/strict";
import { integrateRetrieval, retrieveForContext, CONTEXT_PURPOSE } from "./context-retrieval-integration.js";
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

function makeManager(items) {
  return { registry: { list: () => items } };
}

test("integration: integrateRetrieval returns valid structure", () => {
  const manager = makeManager([makeItem({ id: "a" }), makeItem({ id: "b", lifecycle: LIFECYCLE_STATES.ARCHIVED })]);
  const query = { taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING };
  const result = integrateRetrieval(manager, query);
  assert.ok(Array.isArray(result.relevantItems));
  assert.ok(result.sufficiencyCheck);
  assert.ok(result.metadata);
  assert.equal(result.metadata.totalItems, 2);
});

test("integration: integrateRetrieval requires manager", () => {
  assert.throws(() => integrateRetrieval(null, { taskId: "T1" }), /manager/);
  assert.throws(() => integrateRetrieval({}, { taskId: "T1" }), /manager/);
});

test("integration: integrateRetrieval excludes INVALIDATED/ARCHIVED by default", () => {
  const manager = makeManager([
    makeItem({ id: "a" }),
    makeItem({ id: "b", lifecycle: LIFECYCLE_STATES.ARCHIVED }),
    makeItem({ id: "c", lifecycle: LIFECYCLE_STATES.INVALIDATED }),
  ]);
  const query = { taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING };
  const result = integrateRetrieval(manager, query);
  assert.equal(result.relevantItems.length, 1);
  assert.equal(result.relevantItems[0].id, "a");
});

test("integration: integrateRetrieval includes history when includeHistory=true", () => {
  const manager = makeManager([
    makeItem({ id: "a" }),
    makeItem({ id: "b", lifecycle: LIFECYCLE_STATES.ARCHIVED }),
    makeItem({ id: "c", lifecycle: LIFECYCLE_STATES.INVALIDATED }),
  ]);
  const query = { taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING };
  const result = integrateRetrieval(manager, query, { includeHistory: true });
  assert.equal(result.relevantItems.length, 3);
});

test("integration: integrateRetrieval respects maxResults", () => {
  const items = [makeItem({ id: "a" }), makeItem({ id: "b" }), makeItem({ id: "c" })];
  const manager = makeManager(items);
  const query = { taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING };
  const result = integrateRetrieval(manager, query, { maxResults: 2 });
  assert.equal(result.relevantItems.length, 2);
});

test("integration: integrateRetrieval sufficiencyCheck reflects active items", () => {
  const manager = makeManager([makeItem({ id: "a", lifecycle: LIFECYCLE_STATES.ACTIVE })]);
  const query = { taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING };
  const result = integrateRetrieval(manager, query);
  assert.equal(result.sufficiencyCheck.sufficient, true);
});

test("integration: retrieveForContext builds query and retrieves", () => {
  const manager = makeManager([makeItem({ id: "a" })]);
  const result = retrieveForContext(manager, { taskId: "T1", purpose: CONTEXT_PURPOSE.DEBUGGING });
  assert.ok(Array.isArray(result.relevantItems));
  assert.ok(result.metadata.purpose, CONTEXT_PURPOSE.DEBUGGING);
});

test("integration: retrieveForContext with all params", () => {
  const manager = makeManager([makeItem({ id: "a" })]);
  const result = retrieveForContext(manager, {
    taskId: "T1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    requirementId: "R1",
    activeFiles: ["/src/app.ts"],
  });
  assert.ok(result.metadata.totalItems >= 1);
});