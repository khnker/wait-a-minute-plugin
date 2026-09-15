/**
 * Context Capture — tests for all 6 capture mechanisms.
 * Ejecutar: node --test context-capture.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  captureToolCall,
  captureToolResult,
  captureAgentMessage,
  captureSystemMessage,
  captureFileModification,
  captureGitChange,
  captureRequirementChange,
  captureVerificationResult,
  captureBatch,
} from "./context-capture.js";

// -- 1. Tool calls ---------------------------------------------------------

test("captureTool_call: basic record", () => {
  const record = captureToolCall("read", { filePath: "/foo/bar" });
  assert.ok(record.id, "has id");
  assert.equal(record.type, "tool_call");
  assert.equal(record.source, "tool");
  assert.ok(record.timestamp > 0, "has timestamp");
  assert.equal(record.scope, "session");
  assert.deepEqual(record.content, { toolName: "read", params: { filePath: "/foo/bar" } });
});

test("captureTool_call: custom scope and metadata", () => {
  const record = captureToolCall("grep", { pattern: "foo" }, { scope: "task:abc", metadata: { custom: true } });
  assert.equal(record.scope, "task:abc");
  assert.equal(record.metadata.custom, true);
  assert.ok(record.metadata.toolName === "grep");
});

test("captureTool_call: params serialized in metadata", () => {
  const record = captureToolCall("read", { filePath: "/foo/bar" });
  assert.ok(record.metadata.paramsSummary.includes("filePath"), "paramsSummary has content");
  assert.ok(record.metadata.paramsSummary.includes("/foo/bar"), "paramsSummary has value");
});

test("captureToolResult: basic record", () => {
  const record = captureToolResult("read", "file contents");
  assert.equal(record.type, "tool_result");
  assert.deepEqual(record.content, { toolName: "read", result: "file contents" });
  assert.equal(record.metadata.resultSize, "file contents".length);
});

test("captureToolResult: non-string result", () => {
  const record = captureToolResult("execute", { exitCode: 0 });
  assert.equal(record.metadata.resultSize, 0);
});

// -- 2. Agent messages -----------------------------------------------------

test("captureAgentMessage: user message", () => {
  const record = captureAgentMessage("user", "Hello, can you help?");
  assert.equal(record.type, "agent_message");
  assert.equal(record.content.role, "user");
  assert.equal(record.content.content, "Hello, can you help?");
  assert.equal(record.metadata.role, "user");
  assert.equal(record.metadata.contentLength, 20);
});

test("captureAgentMessage: assistant message", () => {
  const record = captureAgentMessage("assistant", "Sure, I'll do it.");
  assert.equal(record.content.role, "assistant");
  assert.equal(record.metadata.contentLength, 17);
});

test("captureAgentMessage: invalid role throws", () => {
  assert.throws(() => captureAgentMessage("unknown", "hi"), /Invalid role/);
});

test("captureSystemMessage: system record", () => {
  const record = captureSystemMessage("You are a helpful assistant.");
  assert.equal(record.content.role, "system");
  assert.equal(record.metadata.role, "system");
});

// -- 3. File modifications -------------------------------------------------

test("captureFileModification: create", () => {
  const record = captureFileModification("/src/app.ts", "create");
  assert.equal(record.type, "file_modification");
  assert.deepEqual(record.content, { filePath: "/src/app.ts", action: "create", details: {} });
  assert.equal(record.metadata.filePath, "/src/app.ts");
  assert.equal(record.metadata.action, "create");
});

test("captureFileModification: modify with details", () => {
  const record = captureFileModification("/src/app.ts", "modify", { addedLines: 10 });
  assert.equal(record.content.details.addedLines, 10);
});

test("captureFileModification: delete action", () => {
  const record = captureFileModification("/src/old.ts", "delete");
  assert.equal(record.content.action, "delete");
});

test("captureFileModification: invalid action throws", () => {
  assert.throws(() => captureFileModification("/x", "rename"), /Invalid action/);
});

// -- 4. Git changes --------------------------------------------------------

test("captureGitChange: commit", () => {
  const record = captureGitChange("commit", { hash: "abc123def456", message: "feat: init", branch: "main" });
  assert.equal(record.type, "git_change");
  assert.equal(record.metadata.commitHash, "abc123def456");
  assert.equal(record.content.action, "commit");
});

test("captureGitChange: branch", () => {
  const record = captureGitChange("branch", { hash: "", message: "new branch", branch: "feature/x" });
  assert.equal(record.metadata.commitHash, null);
});

test("captureGitChange: invalid action throws", () => {
  assert.throws(() => captureGitChange("push", {}), /Invalid git action/);
});

// -- 5. Requirement changes ------------------------------------------------

test("captureRequirementChange: created", () => {
  const req = { id: "REQ-001", title: "Add auth module", description: "JWT auth" };
  const record = captureRequirementChange("created", req);
  assert.equal(record.type, "requirement_change");
  assert.equal(record.metadata.requirementId, "REQ-001");
  assert.equal(record.metadata.requirementTitle, "Add auth module");
  assert.equal(record.content.action, "created");
  assert.deepEqual(record.content.requirement, req);
});

test("captureRequirementChange: invalid action throws", () => {
  assert.throws(() => captureRequirementChange("deleted", {}), /Invalid requirement action/);
});

// -- 6. Verification results ----------------------------------------------

test("captureVerificationResult: passed", () => {
  const record = captureVerificationResult("passed", { testName: "testAuth" });
  assert.equal(record.type, "verification_result");
  assert.equal(record.metadata.status, "passed");
  assert.equal(record.metadata.testName, "testAuth");
  assert.equal(record.content.status, "passed");
});

test("captureVerificationResult: failed", () => {
  const record = captureVerificationResult("failed", { testName: "testAuth", assertion: "expect(true).toBe(false)" });
  assert.equal(record.metadata.status, "failed");
  assert.equal(record.content.details.assertion, "expect(true).toBe(false)");
});

test("captureVerificationResult: invalid status throws", () => {
  assert.throws(() => captureVerificationResult("unknown", {}), /Invalid verification status/);
});

// -- Batch -----------------------------------------------------------------

test("captureBatch: multiple records", () => {
  const records = captureBatch([
    { type: "tool_call", content: { toolName: "a" }, source: "tool", scope: "s", metadata: {} },
    { type: "agent_message", content: { role: "user", content: "hi" }, source: "agent", scope: "s", metadata: {} },
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].type, "tool_call");
  assert.equal(records[1].type, "agent_message");
  assert.ok(records[0].id !== records[1].id, "unique ids");
});

test("captureBatch: empty array", () => {
  assert.deepEqual(captureBatch([]), []);
});

test("all records have required fields", () => {
  const records = captureBatch([
    { type: "tool_call", content: { toolName: "x" }, source: "tool", scope: "s", metadata: {} },
    { type: "agent_message", content: { role: "user", content: "hi" }, source: "agent", scope: "s", metadata: {} },
    { type: "file_modification", content: { filePath: "a", action: "create" }, source: "fs", scope: "s", metadata: {} },
    { type: "git_change", content: { action: "commit", details: {} }, source: "git", scope: "s", metadata: {} },
    { type: "requirement_change", content: { action: "created", requirement: {} }, source: "req", scope: "s", metadata: {} },
    { type: "verification_result", content: { status: "passed", details: {} }, source: "verif", scope: "s", metadata: {} },
  ]);
  for (const r of records) {
    assert.ok(r.id, `${r.type} has id`);
    assert.ok(r.type, `${r.type} has type`);
    assert.ok(r.content, `${r.type} has content`);
    assert.ok(r.source, `${r.type} has source`);
    assert.ok(r.timestamp > 0, `${r.type} has timestamp`);
    assert.ok(r.scope, `${r.type} has scope`);
    assert.ok(r.metadata !== undefined, `${r.type} has metadata`);
  }
});
