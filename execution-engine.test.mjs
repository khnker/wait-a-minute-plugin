import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteFailure, noteSuccess } from "./execution-engine.js";
import { listHypotheses, listExperiments, DELETION_POLICY, HYPOTHESIS_STATUS } from "./cognition-store.js";
import { guardAction } from "./runtime-guards.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-exec-"));
  const taskId = "exec-task";
  return { root, taskId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("loop: SAFE experiment opens under hypothesis", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const r = await startExperiment(root, taskId, {
      statement: "bug is in parser.ts",
      tool: "read",
      args: { path: "parser.ts" },
    });
    assert.equal(r.ok, true);
    assert.ok(r.hypothesis.id);
    assert.ok(r.experiment.id);
    assert.equal(r.guard.level, "SAFE");
    noteSuccess(root, taskId, {
      hypothesisId: r.hypothesis.id,
      experimentId: r.experiment.id,
      result: "found",
    });
    const hyps = listHypotheses(root, taskId);
    assert.ok(hyps.length >= 1);
  } finally {
    cleanup();
  }
});

test("loop: failure archives hypothesis, repeat blocked, cognition file kept", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const r = await startExperiment(root, taskId, {
      statement: "edit parser fixes bug",
      tool: "edit",
      args: { path: "parser.ts" },
    });
    assert.equal(r.ok, true);
    noteFailure(root, taskId, {
      hypothesisId: r.hypothesis.id,
      experimentId: r.experiment.id,
      reason: "tests still fail",
    });

    const again = await guardAction(
      "edit",
      { path: "parser.ts", hypothesisId: r.hypothesis.id },
      root,
      taskId,
    );
    assert.equal(again.allowed, false);

    const cogDir = path.join(root, ".wam", "tasks", taskId, "cognition");
    assert.equal(fs.existsSync(path.join(cogDir, "hypotheses.jsonl")), true);
    assert.equal(fs.existsSync(path.join(cogDir, "experiments.jsonl")), true);
    assert.equal(DELETION_POLICY, "soft-archive");

    const hyps = listHypotheses(root, taskId);
    assert.ok(hyps.some((h) => h.status === HYPOTHESIS_STATUS.ARCHIVED || h.status === HYPOTHESIS_STATUS.REJECTED));
  } finally {
    cleanup();
  }
});

test("loop: hard delete never starts experiment", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const r = await startExperiment(root, taskId, {
      statement: "wipe dist",
      tool: "bash",
      args: { command: "rm -rf dist" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.guard.level, "BLOCKED");
    assert.equal(listExperiments(root, taskId).length, 0);
  } finally {
    cleanup();
  }
});
