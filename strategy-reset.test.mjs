// /wam strategy set — surgical update of approvedStrategy.strategy and scope.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
};

const seedApproved = (taskId, objective = "Original strategy") => {
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: "APPROVED", objective, rigor: "NORMAL", requirements: [] },
    requirements: [],
    lastAction: "",
    phase: "IMPLEMENTING",
    approvedStrategy: {
      strategy: objective,
      approvedAt: Date.now(),
      scope: objective,
      status: "ACTIVE",
      allowedActions: ["read", "write", "edit", "bash"],
      prohibitedActions: ["drop database", "scope expansion"],
      invalidationConditions: ["explicit user retraction"],
    },
  }, null, 2));
  fs.writeFileSync(path.join(CWD, ".wam", "active-task"), JSON.stringify({ id: taskId, ts: Date.now() }));
};

const wam = async (hooks, args) => {
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: args }, out);
  return out.parts[0]?.text ?? "";
};

test("/wam strategy set updates strategy and scope", async () => {
  const taskId = `srs-set-${Date.now()}`;
  seedApproved(taskId, "Original strategy");
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const result = await wam(hooks, `strategy set modernizar scrapper-eltarro con OpenSpec`);
  assert.match(result, /Estrategia actualizada/);
  const st = getTaskState(taskId, CWD);
  assert.equal(st.approvedStrategy.strategy, "modernizar scrapper-eltarro con OpenSpec");
  assert.equal(st.approvedStrategy.scope, "modernizar scrapper-eltarro con OpenSpec");
  cleanup(taskId);
});

test("/wam strategy set preserves status, allowedActions, prohibitedActions", async () => {
  const taskId = `srs-preserve-${Date.now()}`;
  seedApproved(taskId, "Original");
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  await wam(hooks, `strategy set new scope`);
  const st = getTaskState(taskId, CWD);
  assert.equal(st.approvedStrategy.status, "ACTIVE");
  assert.deepEqual(st.approvedStrategy.allowedActions, ["read", "write", "edit", "bash"]);
  assert.ok(st.approvedStrategy.prohibitedActions.includes("drop database"));
  cleanup(taskId);
});

test("/wam strategy set rejects when contract not approved", async () => {
  const taskId = `srs-rej-${Date.now()}`;
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: "PROPOSED", rigor: "NORMAL", requirements: [] },
    requirements: [],
    phase: "PROPOSED",
  }, null, 2));
  fs.writeFileSync(path.join(CWD, ".wam", "active-task"), JSON.stringify({ id: taskId, ts: Date.now() }));
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const result = await wam(hooks, `strategy set anything`);
  assert.match(result, /Contrato no aprobado/);
  cleanup(taskId);
});

test("/wam strategy set with no scope shows usage", async () => {
  const taskId = `srs-usage-${Date.now()}`;
  seedApproved(taskId, "x");
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const result = await wam(hooks, `strategy set`);
  assert.match(result, /Uso: \/wam strategy set/);
  cleanup(taskId);
});
