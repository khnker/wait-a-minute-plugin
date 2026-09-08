// Strategy fallback inference — verifies that approveContract() NEVER persists
// strategy: "unspecified" and instead infers from requirements/lastAction.

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

const makeTask = async (taskId, lastAction, requirements = []) => {
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  const state = {
    contract: { status: "PROPOSED", rigor: "NORMAL", requirements: requirements.map(t => `Implementar: ${t}`) },
    requirements: requirements.map((t, i) => ({ id: `req-${i + 1}`, title: `Implementar: ${t}`, status: "pending", evidence: [] })),
    lastAction: lastAction || "",
    phase: "PROPOSED",
  };
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify(state, null, 2));
};

test("approveContract infers strategy from requirements[0].title when objective empty", async () => {
  const taskId = `sfi-req-${Date.now()}`;
  await makeTask(taskId, "", ["Modernizar escrapper con OpenSpec"]);
  const r = pluginDefault.approveContract(taskId, CWD);
  assert.equal(r.ok, true);
  const st = getTaskState(taskId, CWD);
  assert.notEqual(st.approvedStrategy.strategy, "unspecified");
  assert.notEqual(st.approvedStrategy.strategy, "");
  assert.match(st.approvedStrategy.strategy, /Modernizar escrapper con OpenSpec/);
  cleanup(taskId);
});

test("approveContract infers strategy from lastAction when objective and requirements empty", async () => {
  const taskId = `sfi-lastact-${Date.now()}`;
  await makeTask(taskId, "fix parser bug in src/normalize.ts\nsecond line", []);
  const r = pluginDefault.approveContract(taskId, CWD);
  assert.equal(r.ok, true);
  const st = getTaskState(taskId, CWD);
  assert.notEqual(st.approvedStrategy.strategy, "unspecified");
  assert.match(st.approvedStrategy.strategy, /fix parser bug/);
  cleanup(taskId);
});

test("approveContract uses objective when present", async () => {
  const taskId = `sfi-obj-${Date.now()}`;
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: "PROPOSED", objective: "Refactor: state machine", rigor: "NORMAL", requirements: ["other"] },
    requirements: [{ id: "req-1", title: "other", status: "pending", evidence: [] }],
    lastAction: "fix parser bug",
    phase: "PROPOSED",
  }, null, 2));
  pluginDefault.approveContract(taskId, CWD);
  const st = getTaskState(taskId, CWD);
  assert.equal(st.approvedStrategy.strategy, "Refactor: state machine");
  cleanup(taskId);
});
