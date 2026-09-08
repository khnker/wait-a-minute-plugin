// Default allowedActions — verify approveContract persists comprehensive list.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
};

const makeTask = (taskId) => {
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: "PROPOSED", objective: "Test", rigor: "NORMAL", requirements: [] },
    requirements: [],
    lastAction: "",
    phase: "PROPOSED",
  }, null, 2));
};

test("approveContract persists comprehensive allowedActions", async () => {
  const taskId = `ada-${Date.now()}`;
  makeTask(taskId);
  pluginDefault.approveContract(taskId, CWD);
  const st = getTaskState(taskId, CWD);
  const a = st.approvedStrategy.allowedActions;
  for (const expected of [
    "write", "edit", "bash", "sh", "task", "todowrite",
    "openspec", "openspec new change", "openspec instructions",
    "openspec validate", "openspec archive",
    "git commit", "npm test", "pnpm test",
    "crear change OpenSpec", "delegar via Task",
  ]) {
    assert.ok(a.includes(expected), `allowedActions must include ${expected}`);
  }
  cleanup(taskId);
});

test("approveContract preserves prohibitedActions (destructive guardrails)", async () => {
  const taskId = `ada-proh-${Date.now()}`;
  makeTask(taskId);
  pluginDefault.approveContract(taskId, CWD);
  const st = getTaskState(taskId, CWD);
  const p = st.approvedStrategy.prohibitedActions;
  assert.ok(p.includes("drop database"));
  assert.ok(p.includes("delete production data"));
  assert.ok(p.includes("destructive operation"));
  cleanup(taskId);
});
