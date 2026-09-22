/**
    * Tests for Ground Truth Cleanup (Change 04)
    */

import test from "node:test";
import assert from "node:assert";
import { buildBenchmarkGraph } from "./context-benchmark-router.mjs";

test("buildBenchmarkGraph does not derive edges from requiredIds when explicit requires graph is present", () => {
  const scenario = {
    taskId: "task",
    requiredIds: ["A", "B"],
    nodes: {
      task: { type: "task", content: "Do work" },
      A: { type: "requirement", content: "Req A" },
      B: { type: "requirement", content: "Req B" }
    },
    requires: [
      { from: "task", to: "A", type: "requires_completion" }
    ]
  };

  const graph = buildBenchmarkGraph(scenario);

  const edgesFromTask = graph.getEdgesFrom("task");
  assert.strictEqual(edgesFromTask.length, 1, "Only explicit edges should be present");
  assert.strictEqual(edgesFromTask[0].to, "A");
  assert.strictEqual(graph.metadata.syntheticGroundTruth, false);
});
