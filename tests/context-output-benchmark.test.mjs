import test from "node:test";
import assert from "node:assert/strict";
import { wamRouterSelector } from "../context-benchmark-router.mjs";
import { runScenario } from "../context-benchmark.mjs";

// TASK-08: requirement::output contract – nodes with type "output" and admission: "MANDATORY" are treated as required.
// This test ensures that the selector respects mandatory outputs in SPR / COR calculations.
test("mandatory output node is preserved for SPR/COR (TASK-08)", () => {
  const scenario = {
    name: "mandatory-output",
    kind: "A",
    taskId: "task-1",
    requiredIds: ["output-1"],
    criticalIds: ["output-1"],
    nodes: {
      "task-1": { type: "task", content: "Perform task" },
      "output-1": { type: "output", content: "Feature", admission: "MANDATORY" },
      "distractor-1": { type: "context", content: "Unrelated info", admission: "OPTIONAL" }
    },
    usedIds: ["output-1"], // Downstream actually consumes this output
  };

  const select = wamRouterSelector({ budget: 10000 });
  const result = runScenario(scenario, select);

  // SPR must be 1.0 – the mandatory output must be preserved
  assert.strictEqual(result.metrics.SPR, 1.0, "Mandatory output must be preserved (SPR)");
  // COR must be 0 – critical required id was not dropped
  assert.strictEqual(result.metrics.COR, 0, "Critical mandatory output must not be omitted (COR)");
  // CWR must be computed (usedIds available)
  assert.strictEqual(result.metrics.CWR, 0, "With usedIds matching selected, waste rate should be 0");
});