/**
 * Tests for context-classification.js
 * Ejecutar: node --test context-classification.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { classifyContextItem, classifyContextItems } from "./context-classification.js";

// -- FACT tests -------------------------------------------------------------

test("classifyContextItem: FACT from explicit metadata", () => {
  const result = classifyContextItem({
    type: "system_message",
    content: "The server runs on port 3000",
    metadata: { category: "FACT" },
  });
  assert.equal(result.category, "FACT");
  assert.ok(result.confidence >= 0.9, "high confidence");
});

test("classifyContextItem: FACT detected by content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "The project has 15 files in the src directory and version 2.1.0",
  });
  assert.equal(result.category, "FACT");
});

// -- OBSERVATION tests ------------------------------------------------------

test("classifyContextItem: OBSERVATION from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "I observed that the build fails when running the integration tests",
  });
  assert.equal(result.category, "OBSERVATION");
});

test("classifyContextItem: OBSERVATION from type hint", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "Some random text without strong signals",
  });
  assert.equal(result.category, "OBSERVATION");
});

// -- CLAIM tests ------------------------------------------------------------

test("classifyContextItem: CLAIM from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "I claim that the performance improved by 30% after the refactor",
  });
  assert.equal(result.category, "CLAIM");
});

// -- ASSUMPTION tests -------------------------------------------------------

test("classifyContextItem: ASSUMPTION from content signals", () => {
  const result = classifyContextItem({
    type: "reasoning",
    content: "I assume the database connection will be available within 5 seconds",
  });
  assert.equal(result.category, "ASSUMPTION");
});

test("classifyContextItem: ASSUMPTION from explicit metadata", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "test",
    metadata: { category: "ASSUMPTION" },
  });
  assert.equal(result.category, "ASSUMPTION");
});

// -- DECISION tests ---------------------------------------------------------

test("classifyContextItem: DECISION from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "We decided to use PostgreSQL as the primary database for this project",
  });
  assert.equal(result.category, "DECISION");
});

// -- REQUIREMENT tests ------------------------------------------------------

test("classifyContextItem: REQUIREMENT from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "The system must support 1000 concurrent users and should fail gracefully",
  });
  assert.equal(result.category, "REQUIREMENT");
});

test("classifyContextItem: REQUIREMENT from type hint", () => {
  const result = classifyContextItem({
    type: "requirement_change",
    content: "Requirement updated",
  });
  assert.equal(result.category, "REQUIREMENT");
});

// -- EVIDENCE tests ---------------------------------------------------------

test("classifyContextItem: EVIDENCE from content signals", () => {
  const result = classifyContextItem({
    type: "verification_result",
    content: "Evidence shows the benchmark improved: 150ms average, 99th percentile 300ms, sample size 1000",
  });
  assert.equal(result.category, "EVIDENCE");
});

// -- ERROR tests ------------------------------------------------------------

test("classifyContextItem: ERROR from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "Error: Connection refused. The server failed to start and crashed on port 8080",
  });
  assert.ok(["ERROR", "OBSERVATION"].includes(result.category), `got ${result.category}`);
});

test("classifyContextItem: ERROR from type hint", () => {
  const result = classifyContextItem({
    type: "tool_result",
    content: "Connection refused error",
  });
  assert.ok(["ERROR", "ACTION"].includes(result.category), `got ${result.category}`);
});

// -- ACTION tests -----------------------------------------------------------

test("classifyContextItem: ACTION from type hint", () => {
  const result = classifyContextItem({
    type: "tool_call",
    content: "Executing grep on /home/user",
  });
  assert.equal(result.category, "ACTION");
});

test("classifyContextItem: ACTION from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "Next step: run the test suite and create a new branch for the fix",
  });
  assert.equal(result.category, "ACTION");
});

// -- RESULT tests -----------------------------------------------------------

test("classifyContextItem: RESULT from type hint", () => {
  const result = classifyContextItem({
    type: "tool_result",
    content: "Operation completed",
  });
  assert.equal(result.category, "RESULT");
});

test("classifyContextItem: RESULT from content signals", () => {
  const result = classifyContextItem({
    type: "agent_message",
    content: "The verification passed successfully, all tests finished and the deployment is done",
  });
  assert.equal(result.category, "RESULT");
});

// -- Edge cases -------------------------------------------------------------

test("classifyContextItem: null item returns default FACT", () => {
  const result = classifyContextItem(null);
  assert.equal(result.category, "FACT");
  assert.ok(result.confidence < 0.5);
});

test("classifyContextItem: empty object returns default", () => {
  const result = classifyContextItem({});
  assert.ok(["FACT", "ACTION", "OBSERVATION"].includes(result.category));
});

test("classifyContextItem: explicit classification overrides content", () => {
  const result = classifyContextItem({
    type: "tool_call",
    content: "This is definitely an error and a failure",
    classification: "DECISION",
  });
  assert.equal(result.category, "DECISION");
});

test("classifyContextItem: explicit category in metadata takes highest priority", () => {
  const result = classifyContextItem({
    type: "tool_call",
    content: "This is definitely an error",
    metadata: { category: "RESULT" },
  });
  assert.equal(result.category, "RESULT");
});

// -- Batch ------------------------------------------------------------------

test("classifyContextItems: batch classification", () => {
  const items = [
    { type: "agent_message", content: "Error: something failed" },
    { type: "tool_call", content: "Run tests" },
  ];
  const results = classifyContextItems(items);
  assert.equal(results.length, 2);
  assert.ok(["ERROR", "OBSERVATION"].includes(results[0].category), `got ${results[0].category}`);
  assert.equal(results[1].category, "ACTION");
});

test("classifyContextItems: empty array returns empty", () => {
  const results = classifyContextItems([]);
  assert.deepEqual(results, []);
});

test("classifyContextItems: non-array returns empty", () => {
  const results = classifyContextItems(null);
  assert.deepEqual(results, []);
});
