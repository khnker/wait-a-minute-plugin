import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { guardAction } from "./runtime-guards.js";
import {
  createHypothesis,
  createExperiment,
  failExperiment,
  DELETION_POLICY,
} from "./cognition-store.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-guard-"));
  const taskId = "guard-task";
  return { root, taskId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("U1: hard delete tools BLOCKED", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const rm = await guardAction("rm", { path: "src/a.js" }, root, taskId);
    assert.equal(rm.allowed, false);
    assert.equal(rm.level, "BLOCKED");

    const rf = await guardAction("bash", { command: "rm -rf src" }, root, taskId);
    assert.equal(rf.allowed, false);
    assert.equal(rf.level, "BLOCKED");
  } finally {
    cleanup();
  }
});

test("SAFE read allowed", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const r = await guardAction("read", { path: "parser.ts" }, root, taskId);
    assert.equal(r.allowed, true);
    assert.equal(r.level, "SAFE");
  } finally {
    cleanup();
  }
});

test("repeated failed experiment blocked", async () => {
  const { root, taskId, cleanup } = setup();
  try {
    const h = createHypothesis(root, taskId, { statement: "bug in parser" });
    const desc = `edit:${JSON.stringify({ path: "parser.ts" })}`;
    const exp = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: desc,
    });
    failExperiment(root, taskId, exp.id, "still broken");

    const g = await guardAction(
      "edit",
      { path: "parser.ts", hypothesisId: h.id },
      root,
      taskId,
    );
    assert.equal(g.allowed, false);
    assert.match(g.reason, /repetitive failure/);
  } finally {
    cleanup();
  }
});

test("deletion policy is soft-archive", () => {
  assert.equal(DELETION_POLICY, "soft-archive");
});
