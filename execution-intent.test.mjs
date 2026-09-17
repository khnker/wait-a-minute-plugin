import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyExecutionIntent, isDirectRequirementAction, isSupportingAction, EXECUTION_INTENT } from "./execution-intent.js";

test("execution-intent: npm install playwright is SUPPORTING", () => {
  const intent = classifyExecutionIntent("bash", { command: "npm install playwright" }, "R1: scraper obtains Lider products");
  assert.equal(intent, EXECUTION_INTENT.SUPPORTING_ACTION);
  assert.equal(isSupportingAction(intent), true);
  assert.equal(isDirectRequirementAction(intent), false);
});

test("execution-intent: npm run scraper is DIRECT_REQUIREMENT_ACTION", () => {
  const intent = classifyExecutionIntent("bash", { command: "npm run scraper" }, "R1: obtain Lider products");
  assert.equal(intent, EXECUTION_INTENT.DIRECT_REQUIREMENT_ACTION);
});

test("execution-intent: npx playwright install chromium is SUPPORTING", () => {
  const intent = classifyExecutionIntent("bash", { command: "npx playwright install chromium" }, "R1: scraper runs");
  assert.equal(intent, EXECUTION_INTENT.SUPPORTING_ACTION);
});

test("execution-intent: npm test is VALIDATION", () => {
  const intent = classifyExecutionIntent("bash", { command: "npm test -- scraper.spec.ts" }, "R1: verify scraper works");
  assert.equal(intent, EXECUTION_INTENT.VALIDATION);
});

test("execution-intent: read tool is INVESTIGATION", () => {
  const intent = classifyExecutionIntent("read", { filePath: "/foo.js" }, "R1: understand parser");
  assert.equal(intent, EXECUTION_INTENT.INVESTIGATION);
});

test("execution-intent: unknown tool returns UNKNOWN", () => {
  const intent = classifyExecutionIntent("unknown_tool", {}, "");
  assert.equal(intent, EXECUTION_INTENT.UNKNOWN);
});

test("execution-intent: edit can be SUPPORTING if deps/setup", () => {
  const intent = classifyExecutionIntent("edit", { path: "config.json" }, "setup playwright");
  assert.equal(intent, EXECUTION_INTENT.SUPPORTING_ACTION);
});

test("execution-intent: revert is RECOVERY", () => {
  const intent = classifyExecutionIntent("revert", {}, "");
  assert.equal(intent, EXECUTION_INTENT.RECOVERY);
});
