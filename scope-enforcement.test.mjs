/**
 * scope-enforcement tests — scope-and-strategy-enforcement change.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { detectScopeDrift, policyFor, recordDrift, SCOPE_DRIFT } from "./scope-enforcement.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
};

const seedTask = (taskId, driftLog = []) => {
  const dir = path.join(CWD, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify({
    contract: { status: "APPROVED", rigor: "NORMAL", requirements: [] },
    requirements: [],
    lastAction: "",
    phase: "PROPOSED",
    approvedStrategy: { strategy: "test", status: "ACTIVE", scope: "test", allowedActions: ["read", "test", "write"], prohibitedActions: ["drop database"] },
    driftLog,
  }, null, 2));
};

test("detectScopeDrift detects small_safe drift for read operations", () => {
  const strategy = { allowedActions: ["read", "test"], prohibitedActions: [] };
  const drift = detectScopeDrift(strategy, { action: "read file.ts", command: "" });
  assert.equal(drift.level, SCOPE_DRIFT.SMALL_SAFE);
  assert.equal(policyFor(drift), "allow+record");
});

test("detectScopeDrift detects material drift for refactoring", () => {
  const strategy = { allowedActions: ["read", "test"], prohibitedActions: [] };
  const drift = detectScopeDrift(strategy, { action: "refactor parser", command: "" });
  assert.equal(drift.level, SCOPE_DRIFT.MATERIAL);
  assert.equal(policyFor(drift), "require-authorization");
});

test("detectScopeDrift detects prohibited drift for destructive operations", () => {
  const strategy = { allowedActions: ["read"], prohibitedActions: ["drop database"] };
  const drift = detectScopeDrift(strategy, { action: "drop database users", command: "" });
  assert.equal(drift.level, SCOPE_DRIFT.PROHIBITED);
  assert.equal(policyFor(drift), "block");
});

test("detectScopeDrift returns none for empty action", () => {
  const drift = detectScopeDrift({}, {});
  assert.equal(drift.level, SCOPE_DRIFT.NONE);
});

test("detectScopeDrift respects strategy scope", () => {
  const strategy = { allowedActions: ["write", "edit"], prohibitedActions: [] };
  const drift = detectScopeDrift(strategy, { action: "write new.ts", command: "" });
  assert.equal(drift.level, SCOPE_DRIFT.SMALL_SAFE);
});

test("detectScopeDrift detects material when out of scope but safe family", () => {
  const strategy = { allowedActions: ["read"], prohibitedActions: [] };
  const drift = detectScopeDrift(strategy, { action: "read file.ts", command: "" });
  assert.equal(drift.level, SCOPE_DRIFT.SMALL_SAFE);
});

test("recordDrift appends to driftLog", () => {
  const state = { driftLog: [] };
  recordDrift(state, { level: SCOPE_DRIFT.MATERIAL, family: "refactor", action: "refactor parser", reason: "out of scope" });
  assert.equal(state.driftLog.length, 1);
  assert.equal(state.driftLog[0].level, SCOPE_DRIFT.MATERIAL);
});

test("recordDrift creates driftLog if missing", () => {
  const state = {};
  recordDrift(state, { level: SCOPE_DRIFT.NONE, family: null, action: "", reason: "" });
  assert.ok(Array.isArray(state.driftLog));
  assert.equal(state.driftLog.length, 1);
});
