/**
 * Tests for Real Used Context (Change 05)
 */

import test from "node:test";
import assert from "node:assert";
import { wamRouterSelector } from "./context-benchmark-router.mjs";

test("wamRouterSelector leaves usedIds undefined instead of inferring from selection", () => {
  const scenario = {
    taskId: "task-1",
    nodes: {
      "task-1": { type: "task", content: "Task" },
      "req-1": { type: "requirement", content: "Req" }
    },
    requires: [
      { from: "task-1", to: "req-1", type: "requires_completion" }
    ]
  };

  const select = wamRouterSelector();
  const result = select(scenario);

  assert.strictEqual(result.usedIds, undefined, "usedIds must remain undefined to prevent false CWR calculations");
});
