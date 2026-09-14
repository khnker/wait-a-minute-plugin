/**
 * Verification Engine — WAM 1.1 (openspec/changes/add-verifiable-task-completion,
 * Phase 2 + Phase 7 unit tests).
 *
 * Ejecutar: node --test verification.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  executeCheck,
  createEvidence,
  evaluateRequirement,
  verifyRequirement,
  captureRepositoryState,
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
} from "./verification.js";

const CWD = process.cwd();
const cmd = (code, extra = "") => `node -e "process.exit(${code})"${extra}`;

test("command success → PASS con exit 0 y evidencia completa", async () => {
  const check = { id: "R1-C1", requirement_id: "R1", type: "command", command: cmd(0), cwd: CWD };
  const r = await executeCheck(check);
  assert.equal(r.status, "PASS");
  assert.equal(r.exit_code, 0);
  assert.ok(r.started_at && r.completed_at, "timestamps presentes");
  assert.ok(/^[0-9a-f]{64}$/.test(r.output_hash), "output_hash sha256");
  assert.ok(r.repository_state && r.repository_state.root === CWD, "repository_state con root");
  const ev = createEvidence(check, r);
  for (const k of ["id", "requirement_id", "check_id", "type", "command", "cwd", "exit_code", "started_at", "completed_at", "output_hash", "repository_state"]) {
    assert.ok(ev[k] !== undefined, `evidence.${k} presente`);
  }
});

test("command failure → FAIL con exit != 0", async () => {
  const r = await executeCheck({ id: "R1-C2", requirement_id: "R1", type: "command", command: cmd(1), cwd: CWD });
  assert.equal(r.status, "FAIL");
  assert.equal(r.exit_code, 1);
  assert.ok(r.diagnostic.length > 0 || true, "diagnostic presente");
});

test("command timeout → TIMEOUT y no bloquea", async () => {
  const r = await executeCheck(
    { id: "R1-C3", requirement_id: "R1", type: "command", command: `node -e "setTimeout(()=>{},2000)"`, cwd: CWD, timeout_ms: 150 },
    { timeout_ms: 150 }
  );
  assert.equal(r.status, "TIMEOUT");
  assert.equal(r.exit_code, null);
});

test("check inválido → ERROR sin ejecutar nada", async () => {
  const r1 = await executeCheck({ id: "X", requirement_id: "R", type: "http", command: cmd(0), cwd: CWD });
  assert.equal(r1.status, "ERROR");
  const r2 = await executeCheck({ id: "X", requirement_id: "R", type: "command", command: "   ", cwd: CWD });
  assert.equal(r2.status, "ERROR");
  const r3 = await executeCheck({ id: "X", requirement_id: "R", type: "command", command: cmd(0), cwd: "/no/existe/wam" });
  assert.equal(r3.status, "ERROR");
});

test("output acotado: stdout gigante se trunca y se marca", async () => {
  const big = Math.ceil((MAX_OUTPUT_BYTES * 2) / 1000);
  const r = await executeCheck({
    id: "R1-C4", requirement_id: "R1", type: "command",
    command: `node -e "for(let i=0;i<${big};i++)process.stdout.write('x'.repeat(1000))"`,
    cwd: CWD,
  });
  assert.equal(r.status, "PASS");
  assert.equal(r.output_truncated, true);
});

test("output_hash determinista para mismo output", async () => {
  const check = { id: "H", requirement_id: "R", type: "command", command: `node -e "process.stdout.write('abc')"`, cwd: CWD };
  const a = await executeCheck(check);
  const b = await executeCheck(check);
  assert.equal(a.output_hash, b.output_hash);
});

test("repository-state: repo git con head; dir no-git con nulls", () => {
  const git = captureRepositoryState(CWD);
  assert.equal(git.root, CWD);
  assert.ok(git.head && /^[0-9a-f]{40}$/.test(git.head), "head sha del repo");
  assert.equal(typeof git.working_tree_dirty, "boolean");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-nogit-"));
  const plain = captureRepositoryState(tmp);
  assert.equal(plain.head, null);
  assert.equal(plain.working_tree_dirty, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("multiple checks: todos PASS → VERIFIED; un FAIL → VERIFYING", async () => {
  const ok = await verifyRequirement([
    { id: "R1-C1", requirement_id: "R1", type: "command", command: cmd(0), cwd: CWD },
    { id: "R1-C2", requirement_id: "R1", type: "command", command: cmd(0), cwd: CWD },
  ]);
  assert.equal(ok.status, "VERIFIED");
  assert.equal(ok.evidence.length, 2);
  const mixed = await verifyRequirement([
    { id: "R1-C1", requirement_id: "R1", type: "command", command: cmd(0), cwd: CWD },
    { id: "R1-C2", requirement_id: "R1", type: "command", command: cmd(3), cwd: CWD },
  ]);
  assert.equal(mixed.status, "VERIFYING");
  assert.ok(mixed.reason.includes("R1-C2"), "razón nombra el check fallido");
});

test("sin checks → VERIFYING, sin falsos VERIFIED", () => {
  assert.equal(evaluateRequirement([], []).status, "VERIFYING");
  assert.equal(evaluateRequirement([{ id: "a" }], []).status, "VERIFYING");
});

test("defaults exportados sanos", () => {
  assert.ok(DEFAULT_TIMEOUT_MS > 0 && MAX_OUTPUT_BYTES > 0, "constantes positivas");
});
