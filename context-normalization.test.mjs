/**
 * Context Normalization — tests for normalizeContextItem / normalizeContextItems.
 * Ejecutar: node --test context-normalization.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContextItem, normalizeContextItems } from "./context-normalization.js";

// -- Basic normalization -------------------------------------------------

test("normalizeContextItem: basic fields", () => {
  const item = normalizeContextItem({
    id: "ctx_abc",
    type: "tool_call",
    content: { toolName: "read", params: {} },
    source: "tool",
    timestamp: 1700000000000,
    scope: "session",
  });
  assert.equal(item.id, "ctx_abc");
  assert.equal(item.type, "tool_call");
  assert.equal(item.source, "tool");
  assert.equal(item.timestamp, 1700000000000);
  assert.equal(item.scope, "session");
  assert.ok(Array.isArray(item.relatedRequirements));
  assert.deepEqual(item.relatedRequirements, []);
  assert.deepEqual(item.metadata, {});
});

test("normalizeContextItem: defaults missing timestamp/scope", () => {
  const item = normalizeContextItem({ id: "x1", type: "agent_message", content: "hi", source: "agent" });
  assert.ok(item.timestamp > 0);
  assert.equal(item.scope, "session");
});

test("normalizeContextItem: preserves metadata", () => {
  const item = normalizeContextItem({
    id: "x2",
    type: "tool_call",
    content: { toolName: "read" },
    source: "tool",
    metadata: { customKey: "value" },
  });
  assert.equal(item.metadata.customKey, "value");
});

test("normalizeContextItem: throws on null record", () => {
  assert.throws(() => normalizeContextItem(null), /non-null/);
});

test("normalizeContextItem: throws on missing id", () => {
  assert.throws(() => normalizeContextItem({ type: "x", content: "hi" }), /id and type/);
});

test("normalizeContextItem: throws on missing type", () => {
  assert.throws(() => normalizeContextItem({ id: "x", content: "hi" }), /id and type/);
});

// -- Content extraction per type ------------------------------------------

test("content: agent_message user", () => {
  const item = normalizeContextItem({
    id: "c1",
    type: "agent_message",
    content: { role: "user", content: "Hello world" },
    source: "agent",
  });
  assert.equal(item.content, "[user] Hello world");
});

test("content: agent_message assistant", () => {
  const item = normalizeContextItem({
    id: "c2",
    type: "agent_message",
    content: { role: "assistant", content: "I will help" },
    source: "agent",
  });
  assert.equal(item.content, "[assistant] I will help");
});

test("content: tool_call", () => {
  const item = normalizeContextItem({
    id: "c3",
    type: "tool_call",
    content: { toolName: "grep", params: { pattern: "foo" } },
    source: "tool",
  });
  assert.ok(item.content.startsWith("Tool call: grep"));
  assert.ok(item.content.includes("foo"), "includes params");
});

test("content: tool_result", () => {
  const item = normalizeContextItem({
    id: "c4",
    type: "tool_result",
    content: { toolName: "read", result: "abc" },
    source: "tool",
  });
  assert.ok(item.content.startsWith("Tool result: read"));
  assert.ok(item.content.includes("abc"), "includes result");
});

test("content: tool_result non-string", () => {
  const item = normalizeContextItem({
    id: "c5",
    type: "tool_result",
    content: { toolName: "run", result: { code: 0 } },
    source: "tool",
  });
  assert.ok(item.content.includes("[non-string result]"));
});

test("content: file_modification", () => {
  const item = normalizeContextItem({
    id: "c6",
    type: "file_modification",
    content: { filePath: "/src/a.ts", action: "modify", details: { lines: 5 } },
    source: "filesystem",
  });
  assert.ok(item.content.includes("File modify"), "has action prefix");
  assert.ok(item.content.includes("/src/a.ts"), "has filepath");
  assert.ok(item.content.includes("5"), "has details");
});

test("content: git_change commit", () => {
  const item = normalizeContextItem({
    id: "c7",
    type: "git_change",
    content: { action: "commit", details: { hash: "abc123def456789", message: "feat: x", branch: "main" } },
    source: "git",
  });
  assert.ok(item.content.includes("Git commit"), "prefix");
  assert.ok(item.content.includes("abc123de"), "hash truncated");
  assert.ok(item.content.includes("feat: x"), "message");
});

test("content: git_change no hash", () => {
  const item = normalizeContextItem({
    id: "c8",
    type: "git_change",
    content: { action: "branch", details: { message: "new branch" } },
    source: "git",
  });
  assert.ok(!item.content.includes("("), "no hash parens");
  assert.ok(item.content.includes("Git branch"), "prefix");
});

test("content: requirement_change", () => {
  const item = normalizeContextItem({
    id: "c9",
    type: "requirement_change",
    content: { action: "created", requirement: { id: "REQ-1", title: "Auth" } },
    source: "requirement",
  });
  assert.ok(item.content.includes("Requirement created"), "prefix");
  assert.ok(item.content.includes("REQ-1"), "requirement id");
  assert.ok(item.content.includes("Auth"), "title");
});

test("content: verification_result", () => {
  const item = normalizeContextItem({
    id: "c10",
    type: "verification_result",
    content: { status: "passed", details: { testName: "testAuth" } },
    source: "verification",
  });
  assert.ok(item.content.includes("Verification passed"), "prefix");
  assert.ok(item.content.includes("testAuth"), "test name");
});

test("content: verification_result with assertion", () => {
  const item = normalizeContextItem({
    id: "c11",
    type: "verification_result",
    content: { status: "failed", details: { assertion: "expect(1).toBe(2)" } },
    source: "verification",
  });
  assert.ok(item.content.includes("expect(1).toBe(2)"), "fallback to assertion");
});

test("content: unknown type fallback string", () => {
  const item = normalizeContextItem({
    id: "c12",
    type: "unknown_type",
    content: "plain text",
    source: "misc",
  });
  assert.equal(item.content, "plain text");
});

test("content: unknown type fallback object JSON", () => {
  const item = normalizeContextItem({
    id: "c13",
    type: "unknown_type",
    content: { foo: "bar" },
    source: "misc",
  });
  assert.ok(item.content.includes("bar"), "JSON fallback");
});

// -- Related requirements -------------------------------------------------

test("relatedRequirements: from metadata.requirementId", () => {
  const item = normalizeContextItem({
    id: "r1",
    type: "tool_call",
    content: { toolName: "read" },
    source: "tool",
    metadata: { requirementId: "REQ-42" },
  });
  assert.deepEqual(item.relatedRequirements, ["REQ-42"]);
});

test("relatedRequirements: from metadata.requirementIds array", () => {
  const item = normalizeContextItem({
    id: "r2",
    type: "tool_call",
    content: { toolName: "read" },
    source: "tool",
    metadata: { requirementIds: ["REQ-1", "REQ-2"] },
  });
  assert.deepEqual(item.relatedRequirements, ["REQ-1", "REQ-2"]);
});

test("relatedRequirements: from content.requirement.id", () => {
  const item = normalizeContextItem({
    id: "r3",
    type: "requirement_change",
    content: { action: "updated", requirement: { id: "REQ-99", title: "X" } },
    source: "req",
  });
  assert.deepEqual(item.relatedRequirements, ["REQ-99"]);
});

test("relatedRequirements: deduplicated", () => {
  const item = normalizeContextItem({
    id: "r4",
    type: "tool_call",
    content: { toolName: "read" },
    source: "tool",
    metadata: { requirementId: "REQ-1", requirementIds: ["REQ-1", "REQ-2"] },
  });
  assert.deepEqual(item.relatedRequirements, ["REQ-1", "REQ-2"]);
});

// -- Batch normalization --------------------------------------------------

test("normalizeContextItems: array", () => {
  const records = [
    { id: "n1", type: "tool_call", content: { toolName: "a" }, source: "tool", timestamp: 1000 },
    { id: "n2", type: "agent_message", content: { role: "user", content: "hi" }, source: "agent", timestamp: 2000 },
  ];
  const items = normalizeContextItems(records);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "n1");
  assert.equal(items[1].id, "n2");
});

test("normalizeContextItems: empty", () => {
  assert.deepEqual(normalizeContextItems([]), []);
});

test("normalizeContextItems: throws on non-array", () => {
  assert.throws(() => normalizeContextItems("not array"), /array/);
});

test("normalizeContextItems: preserves order", () => {
  const records = [
    { id: "z1", type: "x", content: {}, source: "s", timestamp: 1 },
    { id: "z2", type: "x", content: {}, source: "s", timestamp: 2 },
    { id: "z3", type: "x", content: {}, source: "s", timestamp: 3 },
  ];
  const items = normalizeContextItems(records);
  assert.equal(items[0].id, "z1");
  assert.equal(items[1].id, "z2");
  assert.equal(items[2].id, "z3");
});
