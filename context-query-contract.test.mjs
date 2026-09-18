import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContextQuery,
  matchesQuery,
  scoreRelevance,
  retrieveRelevantContext,
  CONTEXT_PURPOSE,
} from "./context-query-contract.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";

function makeItem(overrides = {}) {
  return {
    id: "item-1",
    lifecycle: LIFECYCLE_STATES.ACTIVE,
    timestamp: Date.now(),
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

test("query: buildContextQuery requires taskId", () => {
  assert.throws(() => buildContextQuery({}), /taskId/);
});

test("query: buildContextQuery sets defaults", () => {
  const q = buildContextQuery({ taskId: "T1" });
  assert.equal(q.taskId, "T1");
  assert.equal(q.purpose, CONTEXT_PURPOSE.PLANNING);
  assert.ok(Array.isArray(q.activeFiles));
  assert.ok(q._timestamp > 0);
});

test("query: buildContextQuery with all fields", () => {
  const q = buildContextQuery({
    taskId: "T1",
    requirementId: "R1",
    hypothesisId: "H1",
    experimentId: "E1",
    executionId: "c1",
    purpose: CONTEXT_PURPOSE.DEBUGGING,
    activeFiles: ["/src/parser.ts"],
    activeTools: ["bash"],
  });
  assert.equal(q.requirementId, "R1");
  assert.equal(q.hypothesisId, "H1");
  assert.equal(q.experimentId, "E1");
  assert.equal(q.executionId, "c1");
  assert.equal(q.purpose, CONTEXT_PURPOSE.DEBUGGING);
  assert.deepEqual(q.activeFiles, ["/src/parser.ts"]);
});

test("query: PURPOSE_LAYER_REQUIREMENT differs by purpose", () => {
  const planning = buildContextQuery({ taskId: "T1", purpose: CONTEXT_PURPOSE.PLANNING });
  const debugging = buildContextQuery({ taskId: "T1", purpose: CONTEXT_PURPOSE.DEBUGGING });
  assert.notDeepEqual(planning._layerRequirement, debugging._layerRequirement);
});

test("query: matchesQuery filters by requirementId", () => {
  const q = buildContextQuery({ taskId: "T1", requirementId: "R1" });
  assert.ok(matchesQuery(makeItem({ requirementId: "R1" }), q));
  assert.ok(!matchesQuery(makeItem({ requirementId: "R2" }), q));
});

test("query: matchesQuery filters by executionId", () => {
  const q = buildContextQuery({ taskId: "T1", executionId: "c1" });
  assert.ok(matchesQuery(makeItem({ executionId: "c1" }), q));
  assert.ok(!matchesQuery(makeItem({ executionId: "c2" }), q));
});

test("query: matchesQuery with no filters returns true", () => {
  const q = buildContextQuery({ taskId: "T1" });
  assert.ok(matchesQuery(makeItem(), q));
});

test("query: scoreRelevance boosts mandatory items", () => {
  const q = buildContextQuery({ taskId: "T1" });
  const mandatory = scoreRelevance(makeItem({ mandatoryIncluded: true }), q);
  const normal = scoreRelevance(makeItem({ mandatoryIncluded: false }), q);
  assert.ok(mandatory > normal);
});

test("query: scoreRelevance boosts exact requirement match", () => {
  const q = buildContextQuery({ taskId: "T1", requirementId: "R1" });
  const match = scoreRelevance(makeItem({ requirementId: "R1" }), q);
  const noMatch = scoreRelevance(makeItem({ requirementId: "R2" }), q);
  assert.ok(match > noMatch);
});

test("query: scoreRelevance boosts critical unknowns", () => {
  const q = buildContextQuery({ taskId: "T1" });
  const withUnknown = scoreRelevance(makeItem({ unresolvedCriticalUnknowns: [{ type: "runtime" }] }), q);
  const without = scoreRelevance(makeItem({ unresolvedCriticalUnknowns: [] }), q);
  assert.ok(withUnknown > without);
});

test("query: retrieveRelevantContext returns sorted by relevance", () => {
  const q = buildContextQuery({ taskId: "T1", requirementId: "R1" });
  const items = [
    makeItem({ id: "low", requirementId: "R2" }),
    makeItem({ id: "high", requirementId: "R1", mandatoryIncluded: true }),
    makeItem({ id: "mid", requirementId: "R1" }),
  ];
  const result = retrieveRelevantContext(items, q);
  assert.equal(result[0].id, "high");
  assert.equal(result.length, 2);
});

test("query: retrieveRelevantContext filters out non-matching", () => {
  const q = buildContextQuery({ taskId: "T1", requirementId: "R1" });
  const items = [
    makeItem({ id: "match", requirementId: "R1" }),
    makeItem({ id: "no-match", requirementId: "R2" }),
  ];
  const result = retrieveRelevantContext(items, q);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "match");
});