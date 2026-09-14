/**
 * execution-state tests — formal-execution-state change.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";
import {
  isValidState,
  migrateLegacyPhase,
  validateState,
  transition,
  getStatusReport,
} from "./execution-state.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
};

const seedTask = (taskId, opts = {}) => {
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: opts.contractStatus || "APPROVED", rigor: "NORMAL", requirements: [] },
    requirements: opts.requirements || [],
    lastAction: opts.lastAction || "",
    phase: opts.phase || "PROPOSED",
    state: opts.state,
    approvedStrategy: { strategy: opts.strategy || "test strategy", status: "ACTIVE", scope: "test" },
    experiments: opts.experiments || [],
    currentHypothesis: opts.currentHypothesis || null,
  }, null, 2));
  if (opts.activeTask) {
    fs.writeFileSync(path.join(CWD, ".wam", "active-task"), JSON.stringify({ id: taskId, ts: Date.now() }));
  }
};

// execution-state.js unit tests

test("isValidState accepts all valid states", () => {
  for (const s of ["INITIALIZING", "INVESTIGATING", "EXECUTING", "VERIFYING", "COMPLETED", "BLOCKED", "WAITING_AUTHORIZATION", "FAILED"]) {
    assert.ok(isValidState(s), `${s} should be valid`);
  }
  assert.ok(!isValidState("ASKING"));
  assert.ok(!isValidState("DONE"));
  assert.ok(!isValidState(null));
});

test("migrateLegacyPhase maps legacy phases", () => {
  assert.equal(migrateLegacyPhase("ASKING"), "WAITING_AUTHORIZATION");
  assert.equal(migrateLegacyPhase("PROPOSED"), "INVESTIGATING");
  assert.equal(migrateLegacyPhase("IMPLEMENTING"), "EXECUTING");
  assert.equal(migrateLegacyPhase("VERIFYING"), "VERIFYING");
  assert.equal(migrateLegacyPhase("DONE"), "COMPLETED");
  assert.equal(migrateLegacyPhase("UNKNOWN"), "INITIALIZING");
  assert.equal(migrateLegacyPhase(null), "INITIALIZING");
});

test("transition allows valid transitions", () => {
  assert.equal(transition("INITIALIZING", "INVESTIGATING"), "INVESTIGATING");
  assert.equal(transition("INVESTIGATING", "EXECUTING"), "EXECUTING");
  assert.equal(transition("EXECUTING", "VERIFYING"), "VERIFYING");
  assert.equal(transition("VERIFYING", "COMPLETED"), "COMPLETED");
  assert.equal(transition("INVESTIGATING", "BLOCKED"), "BLOCKED");
  assert.equal(transition("BLOCKED", "INVESTIGATING"), "INVESTIGATING");
  assert.equal(transition("EXECUTING", "FAILED"), "FAILED");
  assert.equal(transition("FAILED", "INVESTIGATING"), "INVESTIGATING");
});

test("transition rejects invalid transitions", () => {
  assert.throws(() => transition("INITIALIZING", "COMPLETED"), /Invalid transition/);
  assert.throws(() => transition("COMPLETED", "EXECUTING"), /Invalid transition/);
});

test("getStatusReport returns structured report", () => {
  const report = getStatusReport(
    { state: "EXECUTING", approvedStrategy: { strategy: "fix parser" }, currentHypothesis: "H1" },
    {
      experiments: [{ id: "E1", status: "running" }],
      failures: [{ id: "E0", status: "failed" }],
      pendingAuth: { id: "U1", question: "delete?" },
      verification: { status: "3/5 verified" },
      completionEvidence: [{ req: "req-1", evidence: "test passed" }],
    }
  );
  assert.match(report, /state: EXECUTING/);
  assert.match(report, /strategy: fix parser/);
  assert.match(report, /current hypothesis: H1/);
  assert.match(report, /experiments: 1/);
  assert.match(report, /failures: 1/);
  assert.match(report, /pending authorization: U1/);
  assert.match(report, /verification status: 3\/5 verified/);
  assert.match(report, /completion evidence: 1 item/);
});

// Integration: /wam status command

test("/wam status shows formal state and all fields", async () => {
  const taskId = `fes-${Date.now()}`;
  seedTask(taskId, {
    state: "EXECUTING",
    strategy: "modernizar escrapper",
    currentHypothesis: "H1",
    experiments: [{ id: "E1", status: "running" }],
    activeTask: true,
  });
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "status" }, out);
  const text = out.parts[0]?.text || "";
  assert.match(text, /state: EXECUTING/);
  assert.match(text, /strategy: modernizar escrapper/);
  assert.match(text, /experiments: 1/);
  cleanup(taskId);
});

test("/wam status shows evidence for verified requirements", async () => {
  const taskId = `fes-ev-${Date.now()}`;
  seedTask(taskId, {
    state: "VERIFYING",
    strategy: "test",
    requirements: [
      { id: "req-1", title: "Fix parser", status: "verified", evidence: ["unit test passed"] },
      { id: "req-2", title: "Add tests", status: "pending", evidence: [] },
    ],
    activeTask: true,
  });
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "status" }, out);
  const text = out.parts[0]?.text || "";
  assert.match(text, /state: VERIFYING/);
  assert.match(text, /verification status: 1\/2 verified/);
  assert.match(text, /req-1: unit test passed/);
  cleanup(taskId);
});
