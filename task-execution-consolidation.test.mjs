/**
 * Task Execution Consolidation tests — verifies delegation to task-runs.js.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createExecution,
  closeExecution,
  addObservation,
  addDecision,
  addEvidence,
  getExecutions,
  getLastExecution,
  getLastExecutionSummary,
  getUnresolvedRequirements,
  getPreviousFailures,
  getPreviousDecisions,
  getResumeContext,
  needsNewExecution,
  migrateLegacyExecutions,
  hasLegacyExecutions,
} from "./task-execution.js";
import { startRun, closeRun, getRuns } from "./task-runs.js";

const TEST_ROOT = path.join(process.cwd(), ".wam-test-execution-consolidation");

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function createTestTask(taskId) {
  const stateDir = path.join(TEST_ROOT, ".wam", "tasks", taskId);
  fs.mkdirSync(stateDir, { recursive: true });

  const state = {
    phase: "IMPLEMENTING",
    lastAction: "test task",
    contract: { objective: "test objective" },
    requirements: [{ id: "req-1", title: "Test req", status: "pending" }],
  };
  fs.writeFileSync(path.join(stateDir, "state.yaml"), JSON.stringify(state));
  return state;
}

describe("Task Execution Consolidation", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("createExecution delegates to startRun", () => {
    createTestTask("task-1");
    const exec = createExecution("task-1", TEST_ROOT);
    assert.ok(exec.id);
    assert.equal(exec.status, "active");
    assert.ok(exec.startedAt);

    // Verify it's stored in runs/ not state.yaml
    const runs = getRuns("task-1", TEST_ROOT);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, exec.id);
  });

  it("closeExecution delegates to closeRun", () => {
    createTestTask("task-2");
    const exec = createExecution("task-2", TEST_ROOT);
    const closed = closeExecution("task-2", exec.id, "completed", "success", TEST_ROOT);
    assert.equal(closed.status, "completed");
    assert.equal(closed.outcome, "success");
    assert.ok(closed.completedAt);
  });

  it("addObservation delegates to task-runs", () => {
    createTestTask("task-3");
    const exec = createExecution("task-3", TEST_ROOT);
    const updated = addObservation("task-3", exec.id, "test observation", TEST_ROOT);
    assert.equal(updated.observations.length, 1);
    assert.equal(updated.observations[0].text, "test observation");
    assert.ok(updated.observations[0].id);
  });

  it("addDecision delegates to task-runs", () => {
    createTestTask("task-4");
    const exec = createExecution("task-4", TEST_ROOT);
    const updated = addDecision("task-4", exec.id, "test decision", TEST_ROOT);
    assert.equal(updated.decisions.length, 1);
    assert.equal(updated.decisions[0].text, "test decision");
  });

  it("addEvidence delegates to task-runs", () => {
    createTestTask("task-5");
    const exec = createExecution("task-5", TEST_ROOT);
    const updated = addEvidence("task-5", exec.id, "test evidence", TEST_ROOT);
    assert.equal(updated.evidence.length, 1);
    assert.equal(updated.evidence[0].text, "test evidence");
  });

  it("getExecutions returns all runs", () => {
    createTestTask("task-6");
    createExecution("task-6", TEST_ROOT);
    createExecution("task-6", TEST_ROOT);
    const execs = getExecutions("task-6", TEST_ROOT);
    assert.equal(execs.length, 2);
  });

  it("getLastExecution returns most recent run", () => {
    createTestTask("task-7");
    const first = createExecution("task-7", TEST_ROOT);
    const second = createExecution("task-7", TEST_ROOT);
    const last = getLastExecution("task-7", TEST_ROOT);
    assert.equal(last.id, second.id);
  });

  it("needsNewExecution delegates to needsNewRun", () => {
    createTestTask("task-8");
    assert.equal(needsNewExecution("task-8", TEST_ROOT), true);
    createExecution("task-8", TEST_ROOT);
    assert.equal(needsNewExecution("task-8", TEST_ROOT), false);
  });

  it("single source of truth: executions are stored in runs/ not state.yaml", () => {
    createTestTask("task-9");
    createExecution("task-9", TEST_ROOT);
    createExecution("task-9", TEST_ROOT);

    // State.yaml should NOT have executions[]
    const statePath = path.join(TEST_ROOT, ".wam", "tasks", "task-9", "state.yaml");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.ok(!state.executions, "state.yaml should not have executions[]");

    // Runs should exist in runs/
    const runs = getRuns("task-9", TEST_ROOT);
    assert.equal(runs.length, 2);
  });
});

describe("Legacy Migration", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("migrates legacy executions[] to runs/", () => {
    createTestTask("task-mig-1");

    // Manually add legacy executions to state
    const statePath = path.join(TEST_ROOT, ".wam", "tasks", "task-mig-1", "state.yaml");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.executions = [
      {
        id: "task-mig-1-exec-001",
        taskId: "task-mig-1",
        startedAt: Date.now() - 10000,
        completedAt: Date.now() - 5000,
        status: "completed",
        observations: ["obs1", "obs2"],
        decisions: ["dec1"],
        evidence: ["ev1"],
        outcome: "success",
      },
    ];
    fs.writeFileSync(statePath, JSON.stringify(state));

    assert.equal(hasLegacyExecutions("task-mig-1", TEST_ROOT), true);

    const migrated = migrateLegacyExecutions("task-mig-1", TEST_ROOT);
    assert.equal(migrated, 1);

    // Verify migration
    const runs = getRuns("task-mig-1", TEST_ROOT);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, "task-mig-1-exec-001");
    assert.equal(runs[0].observations.length, 2);
    assert.equal(runs[0].observations[0].text, "obs1");

    // Verify legacy field removed
    assert.ok(!hasLegacyExecutions("task-mig-1", TEST_ROOT));
  });

  it("migration is idempotent", () => {
    createTestTask("task-mig-2");

    const statePath = path.join(TEST_ROOT, ".wam", "tasks", "task-mig-2", "state.yaml");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.executions = [
      {
        id: "task-mig-2-exec-001",
        taskId: "task-mig-2",
        startedAt: Date.now(),
        status: "completed",
        observations: [],
        decisions: [],
        evidence: [],
      },
    ];
    fs.writeFileSync(statePath, JSON.stringify(state));

    migrateLegacyExecutions("task-mig-2", TEST_ROOT);
    migrateLegacyExecutions("task-mig-2", TEST_ROOT);

    const runs = getRuns("task-mig-2", TEST_ROOT);
    assert.equal(runs.length, 1);
  });

  it("returns 0 when no legacy executions", () => {
    createTestTask("task-mig-3");
    const migrated = migrateLegacyExecutions("task-mig-3", TEST_ROOT);
    assert.equal(migrated, 0);
  });
});
