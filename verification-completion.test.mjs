/**
 * Verification Engine ↔ Completion Gate — WAM 1.1 (Phase 3 + 4 + 7 completion tests).
 *
 * Ejecutar: node --test verification-completion.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { evaluateRequirement as evaluateRequirementChecks } from "./verification.js";
import { persistTaskState } from "./engine.js";

const evaluateRequirement = evaluateRequirementChecks;

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
};

function makeState({ checks = [], reqStatus = "done", reqEvidence = ["manual"] } = {}) {
  return {
    contract: {
      status: "APPROVED",
      checks,
      requirements: [{ id: "R1", title: "demo" }],
      verification: ["R1"],
      unknowns: [],
      assumptions: [],
    },
    requirements: [{ id: "R1", title: "demo", status: reqStatus, evidence: reqEvidence }],
  };
}

test("markRequirement rechaza `verified` textual cuando hay checks pendientes", () => {
  const taskId = "test-verified-fail";
  const state = makeState({ checks: [{ reqId: "R1", type: "command", status: "FAIL" }] });
  persistTaskState(taskId, state, CWD);
  const r = pluginDefault.markRequirement(taskId, "R1", "verified", "lo hice", CWD, null);
  assert.equal(r.ok, false, "verify debería rechazar con checks FAIL");
  assert.match(r.reason, /verificación máquina bloqueada/i);
  cleanup(taskId);
});

test("markRequirement acepta `verified` cuando todos los checks están PASS", () => {
  const taskId = "test-verified-pass";
  const state = makeState({
    checks: [{ reqId: "R1", type: "command", status: "PASS" }],
  });
  persistTaskState(taskId, state, CWD);
  const r = pluginDefault.markRequirement(taskId, "R1", "verified", "ejecutado", CWD, null);
  assert.equal(r.ok, true, `markRequirement.ok esperado true, got: ${JSON.stringify(r)}`);
  cleanup(taskId);
});

test("markRequirement marca `done` cuando hay checks PASS pero ojo con credenciales", () => {
  const taskId = "test-done-pass";
  const state = makeState({
    checks: [{ reqId: "R1", type: "command", status: "PASS" }],
  });
  persistTaskState(taskId, state, CWD);
  const r = pluginDefault.markRequirement(taskId, "R1", "done", "ok", CWD, null);
  assert.equal(r.ok, true);
  cleanup(taskId);
});

test("evaluateCompletionGate bloquea DONE si hay checks FAIL", () => {
  const state = makeState({ checks: [{ reqId: "R1", type: "command", status: "FAIL" }], reqStatus: "verified" });
  const g = pluginDefault.evaluateCompletionGate(state, "task complete");
  assert.equal(g.blocked, true, "gate debe bloquear");
  assert.equal(g.verifying, true);
  assert.ok(Array.isArray(g.pending) && g.pending.length > 0);
});

test("evaluateCompletionGate permite DONE cuando todos los checks están PASS", () => {
  const state = makeState({
    checks: [{ reqId: "R1", type: "command", status: "PASS" }],
    reqStatus: "verified",
  });
  const g = pluginDefault.evaluateCompletionGate(state, "task complete");
  assert.equal(g.blocked, false, "gate debe permitir");
  assert.equal(g.allDone, true);
});

test("textual evidence NO produce VERIFIED si hay checks requeridos (sanity)", () => {
  const state = makeState({ checks: [{ reqId: "R1", type: "command", status: "PENDING" }], reqStatus: "verified" });
  const verdict = evaluateRequirementChecks(state.contract.checks, state.contract.checks);
  assert.equal(verdict.status, "VERIFYING", "PENDING debe mantenerse");
});
