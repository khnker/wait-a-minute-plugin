import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyToolResult,
  EXECUTION_STATUS,
  OUTCOME_STATUS,
  isSatisfied,
  isRuntimeFailure,
} from "./tool-result-classifier.js";

test("tool-result: npm install OK but chromium missing → execution SUCCEEDED, outcome NOT_SATISFIED", () => {
  const r = classifyToolResult({
    result: "npm install OK",
    actual: { chromium: "missing" },
    unexpected: { error: "BROWSER_EXECUTABLE_MISSING" },
    expected: { expected: { status: "success", exitCode: 0 } },
  });
  assert.equal(r.execution, EXECUTION_STATUS.SUCCEEDED);
  assert.equal(r.outcome, OUTCOME_STATUS.NOT_SATISFIED);
  assert.equal(isSatisfied(r), false);
  assert.equal(isRuntimeFailure(r), false);
});

test("tool-result: tool exit 1 → execution FAILED", () => {
  const r = classifyToolResult({
    result: undefined,
    output: { error: "command failed" },
    expected: { expected: { status: "success", exitCode: 0 } },
  });
  assert.equal(r.execution, EXECUTION_STATUS.FAILED);
});

test("tool-result: success matches expected → SATISFIED", () => {
  const r = classifyToolResult({
    result: "scraped 5 items",
    actual: { status: "success", exitCode: 0 },
    expected: { expected: { status: "success", exitCode: 0 } },
  });
  assert.equal(r.execution, EXECUTION_STATUS.SUCCEEDED);
  assert.equal(r.outcome, OUTCOME_STATUS.SATISFIED);
  assert.equal(isSatisfied(r), true);
});

test("tool-result: no expected → outcome UNKNOWN", () => {
  const r = classifyToolResult({ result: "ok" });
  assert.equal(r.execution, EXECUTION_STATUS.SUCCEEDED);
  assert.equal(r.outcome, OUTCOME_STATUS.UNKNOWN);
});

test("tool-result: detects BROWSER_NOT_FOUND in unexpected.error", () => {
  const r = classifyToolResult({
    result: "ran",
    unexpected: { error: "BROWSER_NOT_FOUND" },
    expected: { expected: { status: "success" } },
  });
  assert.equal(r.execution, EXECUTION_STATUS.SUCCEEDED);
  assert.equal(r.outcome, OUTCOME_STATUS.NOT_SATISFIED);
});

test("tool-result: actual status=failure → NOT_SATISFIED", () => {
  const r = classifyToolResult({
    result: "ran",
    actual: { status: "failure" },
    expected: { expected: { status: "success" } },
  });
  assert.equal(r.outcome, OUTCOME_STATUS.NOT_SATISFIED);
});

test("tool-result: isRuntimeFailure true only when both fail", () => {
  const r1 = classifyToolResult({ result: "x", output: { error: "fail" }, expected: { expected: { status: "success" } } });
  const r2 = classifyToolResult({ result: "x", unexpected: { error: "BROWSER_NOT_FOUND" }, expected: { expected: { status: "success" } } });
  assert.equal(isRuntimeFailure(r1), true);
  assert.equal(isRuntimeFailure(r2), false);
});
