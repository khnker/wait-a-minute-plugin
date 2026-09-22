/**
 * Tests for WAM Router Benchmark Integration
 */

import test from "node:test";
import assert from "node:assert";
import { wamRouterSelector, buildBenchmarkGraph } from "./context-benchmark-router.mjs";

test("wamRouterSelector selects required nodes correctly", () => {
  const scenario = {
    taskId: "task-1",
    nodes: {
      "task-1": { type: "task", content: "Do something" },
      "req-1": { type: "context", content: "Required context item one" },
      "distractor-1": { type: "context", content: "Unrelated distractor info" }
    },
    requiredIds: ["req-1"]
  };

  const select = wamRouterSelector({ budget: 4000 });
  const result = select(scenario);

  assert.ok(result.selectedIds.includes("req-1"), "Should include required ID");
  assert.strictEqual(result.pageFaults, 0, "Should be sufficient without page faults");
});

test("wamRouterSelector respects token budget and omits optional nodes", () => {
  const scenario = {
    taskId: "task-1",
    nodes: {
      "task-1": { type: "task", content: "Task content" },
      "req-1": { type: "context", content: "A".repeat(2000), admission: "MANDATORY" },
      "opt-1": { type: "context", content: "B".repeat(2000), admission: "OPTIONAL" }
    },
    requiredIds: ["req-1"]
  };

  const select = wamRouterSelector({ budget: 600 }); // strict budget
  const result = select(scenario);

  assert.ok(result.selectedIds.includes("req-1"), "Should keep mandatory required node");
  assert.ok(!result.selectedIds.includes("opt-1"), "Should omit optional node due to budget overflow");
});
