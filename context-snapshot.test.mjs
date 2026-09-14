/**
 * context-snapshot tests — continuation invalidation.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSnapshot, loadSnapshot, checkContinuation, rebuildScope } from "./context-snapshot.js";

const CWD = process.cwd();
const TEST_TASK = `snap-test-${Date.now()}`;

const cleanup = () => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", TEST_TASK), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(CWD, ".wam", "snapshots", `${TEST_TASK}.json`), { force: true }); } catch {}
};

const seedTask = (overrides = {}) => {
  const dir = path.join(CWD, ".wam", "tasks", TEST_TASK);
  fs.mkdirSync(dir, { recursive: true });
  const state = {
    contract: { status: "APPROVED", rigor: "NORMAL", requirements: [] },
    requirements: [],
    lastAction: "test action",
    phase: "IMPLEMENTING",
    approvedStrategy: { strategy: "test", status: "ACTIVE", scope: "test" },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "state.yaml"), JSON.stringify(state, null, 2));
  return state;
};

describe("context-snapshot", () => {
  beforeEach(cleanup);
  after(cleanup);

  it("createSnapshot persists a snapshot", () => {
    const state = seedTask();
    const snap = createSnapshot(TEST_TASK, state, CWD);
    assert.ok(snap.taskId);
    assert.ok(snap.createdAt);
    assert.ok(fs.existsSync(path.join(CWD, ".wam", "snapshots", `${TEST_TASK}.json`)));
  });

  it("loadSnapshot returns null when no snapshot exists", () => {
    const snap = loadSnapshot("nonexistent", CWD);
    assert.equal(snap, null);
  });

  it("loadSnapshot returns saved snapshot", () => {
    const state = seedTask();
    createSnapshot(TEST_TASK, state, CWD);
    const loaded = loadSnapshot(TEST_TASK, CWD);
    assert.equal(loaded.taskId, TEST_TASK);
  });

  it("checkContinuation returns STALE when no previous snapshot", () => {
    const state = seedTask();
    const check = checkContinuation(TEST_TASK, state, CWD);
    assert.equal(check.status, "STALE");
    assert.ok(check.changedSignals.includes("no-snapshot"));
  });

  it("checkContinuation returns VALID when nothing changed", () => {
    const state = seedTask();
    createSnapshot(TEST_TASK, state, CWD);
    const check = checkContinuation(TEST_TASK, state, CWD);
    assert.equal(check.status, "VALID");
    assert.equal(check.changedSignals.length, 0);
  });

  it("checkContinuation returns STALE when relevant files change", () => {
    const state = seedTask();
    createSnapshot(TEST_TASK, state, CWD);
    // Modify package.json to simulate change
    const pkgPath = path.join(CWD, "package.json");
    const original = fs.readFileSync(pkgPath, "utf-8");
    fs.writeFileSync(pkgPath, original + "\n// test change");
    try {
      const check = checkContinuation(TEST_TASK, state, CWD);
      assert.equal(check.status, "STALE");
      assert.ok(check.changedSignals.includes("relevant-files"));
    } finally {
      fs.writeFileSync(pkgPath, original);
    }
  });

  it("checkContinuation returns INVALID when task state changes", () => {
    const state1 = seedTask({ phase: "IMPLEMENTING" });
    createSnapshot(TEST_TASK, state1, CWD);
    const state2 = { ...state1, phase: "VERIFYING" };
    const check = checkContinuation(TEST_TASK, state2, CWD);
    assert.equal(check.status, "INVALID");
    assert.ok(check.changedSignals.includes("task-state"));
  });

  it("rebuildScope returns correct scope for relevant-files", () => {
    const scope = rebuildScope(["relevant-files"]);
    assert.equal(scope.rebuildN1, true);
    assert.equal(scope.rebuildN2, false);
    assert.equal(scope.rebuildN3, true);
  });

  it("rebuildScope returns full scope for task-state", () => {
    const scope = rebuildScope(["task-state"]);
    assert.equal(scope.rebuildN1, true);
    assert.equal(scope.rebuildN2, true);
    assert.equal(scope.rebuildN3, true);
  });

  it("rebuildScope returns full scope for no-snapshot", () => {
    const scope = rebuildScope(["no-snapshot"]);
    assert.equal(scope.rebuildN1, true);
    assert.equal(scope.rebuildN2, true);
    assert.equal(scope.rebuildN3, true);
  });

  it("rebuildScope aggregates multiple signals", () => {
    const scope = rebuildScope(["relevant-files", "task-state"]);
    assert.equal(scope.rebuildN1, true);
    assert.equal(scope.rebuildN2, true);
    assert.equal(scope.rebuildN3, true);
  });
});
