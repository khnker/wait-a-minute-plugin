import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeContextItem } from "./context-event-normalization.js";
import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";

test("normalization: tool_started event has required fields", () => {
  const item = normalizeContextItem({
    id: "evt-1",
    type: CONTEXT_EVENT_TYPES.TOOL_STARTED,
    taskId: "T1",
    sessionId: "S1",
    executionId: "c1",
    payload: { tool: "bash", args: { command: "ls" } },
    provenance: "agent-tool",
    timestamp: 1234567890,
  });
  assert.equal(item.id, "evt-1");
  assert.equal(item.taskId, "T1");
  assert.equal(item.executionId, "c1");
  assert.equal(item.eventType, CONTEXT_EVENT_TYPES.TOOL_STARTED);
  assert.equal(item.content.tool, "bash");
  assert.equal(item.lifecycle, "STARTED");
  assert.equal(item.classification, "ACTION");
  assert.equal(item.scope, "LOCAL");
  assert.equal(item.importance, "MEDIUM");
  assert.ok(Array.isArray(item.requirementIds));
  assert.ok(Array.isArray(item.hypothesisIds));
  assert.ok(Array.isArray(item.experimentIds));
});

test("normalization: assessment_completed has mandatoryIncluded", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.ASSESSMENT_COMPLETED,
    taskId: "T1",
    payload: { experimentId: "E1", status: "SUPPORTED" },
  });
  assert.equal(item.classification, "ASSESSMENT");
  assert.equal(item.lifecycle, "COMPLETED");
  assert.equal(item.mandatoryIncluded, true);
});

test("normalization: requirement_updated has LOW importance", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.REQUIREMENT_UPDATED,
    taskId: "T1",
    payload: { requirementId: "R1", status: "VERIFIED" },
  });
  assert.equal(item.importance, "LOW");
  assert.equal(item.requirementIds[0], "R1");
});

test("normalization: hypothesis_proposed", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.HYPOTHESIS_PROPOSED,
    taskId: "T1",
    payload: { hypothesisId: "H1", statement: "H1: parser bug", confidence: 0.8 },
  });
  assert.equal(item.content.hypothesisId, "H1");
  assert.equal(item.content.statement, "H1: parser bug");
});

test("normalization: context_invalidated has unresolvedCriticalUnknowns", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.CONTEXT_INVALIDATED,
    taskId: "T1",
    payload: { reason: "browser missing", unresolvedCriticalUnknowns: [{ type: "runtime", reason: "chromium unavailable" }] },
  });
  assert.equal(item.unresolvedCriticalUnknowns.length, 1);
  assert.equal(item.lifecycle, "INVALIDATED");
});

test("normalization: file_changed", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.FILE_CHANGED,
    taskId: "T1",
    payload: { path: "/src/parser.ts", changeType: "modify" },
  });
  assert.equal(item.content.path, "/src/parser.ts");
});

test("normalization: evidence_created", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.EVIDENCE_CREATED,
    taskId: "T1",
    payload: { evidenceId: "ev-1", type: "TOOL_OUTPUT", content: "scraped 5 items" },
  });
  assert.equal(item.content.evidenceId, "ev-1");
});

test("normalization: missing id generates one", () => {
  const item = normalizeContextItem({
    type: CONTEXT_EVENT_TYPES.TASK_CREATED,
    taskId: "T1",
    payload: {},
  });
  assert.ok(item.id.startsWith("evt-"));
});
