/**
 * Tests for context-scope.js
 * Ejecutar: node --test context-scope.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  scopeContextItem,
  normalizeScope,
  parentScope,
  scopeCovers,
} from "./context-scope.js";

// -- SCOPE: GLOBAL ----------------------------------------------------------

test("scopeContextItem: GLOBAL from system message", () => {
  const result = scopeContextItem({
    type: "system_message",
    content: "Global configuration: debug mode is enabled",
  });
  assert.equal(result.scope, "GLOBAL");
});

test("scopeContextItem: GLOBAL via metadata", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { scope: "GLOBAL" },
  });
  assert.equal(result.scope, "GLOBAL");
  assert.ok(result.confidence >= 0.9);
});

// -- SCOPE: PROJECT ---------------------------------------------------------

test("scopeContextItem: PROJECT from git_change type", () => {
  const result = scopeContextItem({
    type: "git_change",
    content: "Commit abc123 on main branch",
  });
  assert.equal(result.scope, "PROJECT");
});

test("scopeContextItem: PROJECT via metadata", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { projectId: "proj-123" },
  });
  assert.equal(result.scope, "PROJECT");
});

// -- SCOPE: TASK ------------------------------------------------------------

test("scopeContextItem: TASK from metadata taskId", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { taskId: "task-456" },
  });
  assert.equal(result.scope, "TASK");
});

// -- SCOPE: REQUIREMENT -----------------------------------------------------

test("scopeContextItem: REQUIREMENT from metadata requirementId", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { taskId: "task-456", requirementId: "req-789" },
  });
  assert.equal(result.scope, "REQUIREMENT");
});

test("scopeContextItem: REQUIREMENT from requirement_change type", () => {
  const result = scopeContextItem({
    type: "requirement_change",
    content: "New requirement added",
  });
  assert.equal(result.scope, "REQUIREMENT");
});

test("scopeContextItem: REQUIREMENT via metadata direct", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { requirementId: "req-123" },
  });
  assert.equal(result.scope, "REQUIREMENT");
});

// -- SCOPE: ACTION ----------------------------------------------------------

test("scopeContextItem: ACTION from tool_call type", () => {
  const result = scopeContextItem({
    type: "tool_call",
    content: { toolName: "read", params: {} },
  });
  assert.equal(result.scope, "ACTION");
});

test("scopeContextItem: ACTION from metadata actionId", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { taskId: "t-1", actionId: "a-1" },
  });
  assert.equal(result.scope, "ACTION");
});

// -- SCOPE: SESSION ---------------------------------------------------------

test("scopeContextItem: SESSION from agent_message type (default)", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "Hello, how are you?",
  });
  assert.equal(result.scope, "SESSION");
});

test("scopeContextItem: SESSION from metadata sessionId", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { sessionId: "sess-1" },
  });
  assert.equal(result.scope, "SESSION");
});

test("scopeContextItem: SESSION default for unknown item", () => {
  const result = scopeContextItem({ type: "unknown_type" });
  assert.equal(result.scope, "SESSION");
});

// -- SCOPE: TURN ------------------------------------------------------------

test("scopeContextItem: TURN from metadata turn", () => {
  const result = scopeContextItem({
    type: "agent_message",
    content: "test",
    metadata: { turn: 5 },
  });
  assert.equal(result.scope, "TURN");
});

// -- Utility: normalizeScope ------------------------------------------------

test("normalizeScope: valid scope returns uppercase", () => {
  assert.equal(normalizeScope("task"), "TASK");
  assert.equal(normalizeScope("TASK"), "TASK");
});

test("normalizeScope: invalid returns SESSION", () => {
  assert.equal(normalizeScope(""), "SESSION");
  assert.equal(normalizeScope("invalid"), "SESSION");
  assert.equal(normalizeScope(null), "SESSION");
});

test("normalizeScope: no argument returns SESSION", () => {
  assert.equal(normalizeScope(), "SESSION");
});

// -- Utility: parentScope ---------------------------------------------------

test("parentScope: GLOBAL returns GLOBAL", () => {
  assert.equal(parentScope("GLOBAL"), "GLOBAL");
});

test("parentScope: each scope returns parent", () => {
  assert.equal(parentScope("PROJECT"), "GLOBAL");
  assert.equal(parentScope("TASK"), "PROJECT");
  assert.equal(parentScope("REQUIREMENT"), "TASK");
  assert.equal(parentScope("ACTION"), "REQUIREMENT");
  assert.equal(parentScope("SESSION"), "ACTION");
  assert.equal(parentScope("TURN"), "SESSION");
});

test("parentScope: invalid returns same", () => {
  assert.equal(parentScope("INVALID"), "INVALID");
});

// -- Utility: scopeCovers ---------------------------------------------------

test("scopeCovers: exact match", () => {
  assert.ok(scopeCovers("SESSION", "SESSION"));
});

test("scopeCovers: broader covers narrower", () => {
  assert.ok(scopeCovers("GLOBAL", "TASK"));
  assert.ok(scopeCovers("PROJECT", "ACTION"));
  assert.ok(scopeCovers("TASK", "TURN"));
});

test("scopeCovers: narrower does not cover broader", () => {
  assert.ok(!scopeCovers("TASK", "GLOBAL"));
  assert.ok(!scopeCovers("ACTION", "PROJECT"));
});

test("scopeCovers: false for invalid inputs", () => {
  assert.ok(!scopeCovers("", "TASK"));
  assert.ok(!scopeCovers("TASK", ""));
});

// -- Edge: null item --------------------------------------------------------

test("scopeContextItem: null item returns SESSION fallback", () => {
  const result = scopeContextItem(null);
  assert.equal(result.scope, "SESSION");
  assert.ok(result.confidence < 0.5);
});

// -- Extra context metadata --------------------------------------------------

test("scopeContextItem: external metadata merges with item metadata", () => {
  const result = scopeContextItem(
    { type: "agent_message", content: "test" },
    { projectId: "proj-xyz" },
  );
  assert.equal(result.scope, "PROJECT");
});
