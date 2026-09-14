import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
} from "./task-execution.js";
import { persistTaskState } from "./engine.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-exec-test-"));
let taskCounter = 0;

function makeTaskId() {
  return `test-task-${++taskCounter}`;
}

function makeTaskState(overrides = {}) {
  return {
    phase: "IMPLEMENTING",
    lastAction: "Test task",
    contract: { objective: "Test objective" },
    requirements: [
      { id: "req-1", title: "Req 1", status: "pending", evidence: [] },
      { id: "req-2", title: "Req 2", status: "done", evidence: ["done"] },
    ],
    executions: [],
    ...overrides,
  };
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("createExecution", () => {
  it("creates an execution with correct fields", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    assert.ok(exec.id.startsWith(taskId));
    assert.equal(exec.taskId, taskId);
    assert.equal(exec.status, "active");
    assert.ok(exec.startedAt > 0);
    assert.deepEqual(exec.observations, []);
    assert.deepEqual(exec.decisions, []);
    assert.deepEqual(exec.evidence, []);
  });

  it("increments execution index", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const e1 = createExecution(taskId, TMP);
    const e2 = createExecution(taskId, TMP);
    assert.ok(e1.id.endsWith("001"));
    assert.ok(e2.id.endsWith("002"));
  });

  it("throws for missing task", () => {
    assert.throws(() => createExecution("nonexistent", TMP), /not found/);
  });
});

describe("closeExecution", () => {
  it("closes with status and outcome", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    const closed = closeExecution(taskId, exec.id, "completed", "All tests pass", TMP);
    assert.equal(closed.status, "completed");
    assert.equal(closed.outcome, "All tests pass");
    assert.ok(closed.completedAt > 0);
  });

  it("throws for missing execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.throws(() => closeExecution(taskId, "bad-id", "completed", null, TMP), /not found/);
  });
});

describe("addObservation", () => {
  it("appends observation to execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    addObservation(taskId, exec.id, "Found a bug in auth", TMP);
    addObservation(taskId, exec.id, "Tests pass now", TMP);
    const updated = getExecutions(taskId, TMP);
    assert.equal(updated[0].observations.length, 2);
    assert.equal(updated[0].observations[0], "Found a bug in auth");
  });
});

describe("addDecision", () => {
  it("appends decision to execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    addDecision(taskId, exec.id, "Use bcrypt for hashing", TMP);
    const updated = getExecutions(taskId, TMP);
    assert.equal(updated[0].decisions.length, 1);
  });
});

describe("addEvidence", () => {
  it("appends evidence to execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    addEvidence(taskId, exec.id, "Coverage at 85%", TMP);
    const updated = getExecutions(taskId, TMP);
    assert.equal(updated[0].evidence.length, 1);
  });
});

describe("getExecutions", () => {
  it("returns empty for task with no executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.deepEqual(getExecutions(taskId, TMP), []);
  });

  it("returns all executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    createExecution(taskId, TMP);
    createExecution(taskId, TMP);
    assert.equal(getExecutions(taskId, TMP).length, 2);
  });
});

describe("getLastExecution", () => {
  it("returns most recent execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    createExecution(taskId, TMP);
    const e2 = createExecution(taskId, TMP);
    const last = getLastExecution(taskId, TMP);
    assert.equal(last.id, e2.id);
  });

  it("returns null for no executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(getLastExecution(taskId, TMP), null);
  });
});

describe("getLastExecutionSummary", () => {
  it("returns summary of last execution", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const exec = createExecution(taskId, TMP);
    addObservation(taskId, exec.id, "obs1", TMP);
    addDecision(taskId, exec.id, "dec1", TMP);
    closeExecution(taskId, exec.id, "completed", "done", TMP);

    const summary = getLastExecutionSummary(taskId, TMP);
    assert.equal(summary.executionId, exec.id);
    assert.equal(summary.status, "completed");
    assert.equal(summary.outcome, "done");
    assert.equal(summary.observationsCount, 1);
    assert.equal(summary.decisionsCount, 1);
    assert.equal(summary.evidenceCount, 0);
  });
});

describe("getUnresolvedRequirements", () => {
  it("returns requirements not done", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const unresolved = getUnresolvedRequirements(taskId, TMP);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].id, "req-1");
  });
});

describe("getPreviousFailures", () => {
  it("returns failed/abandoned executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const e1 = createExecution(taskId, TMP);
    closeExecution(taskId, e1.id, "failed", "Timeout", TMP);
    const e2 = createExecution(taskId, TMP);
    closeExecution(taskId, e2.id, "completed", "OK", TMP);
    const e3 = createExecution(taskId, TMP);
    closeExecution(taskId, e3.id, "abandoned", "Changed plan", TMP);

    const failures = getPreviousFailures(taskId, TMP);
    assert.equal(failures.length, 2);
  });
});

describe("getPreviousDecisions", () => {
  it("returns recent decisions with provenance", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const e1 = createExecution(taskId, TMP);
    addDecision(taskId, e1.id, "Decision 1", TMP);
    addDecision(taskId, e1.id, "Decision 2", TMP);
    closeExecution(taskId, e1.id, "completed", null, TMP);

    const decisions = getPreviousDecisions(taskId, TMP, 2);
    assert.equal(decisions.length, 2);
    assert.equal(decisions[0].executionId, e1.id);
    assert.equal(decisions[0].decision, "Decision 1");
  });

  it("respects limit", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const e1 = createExecution(taskId, TMP);
    for (let i = 0; i < 10; i++) addDecision(taskId, e1.id, `D${i}`, TMP);

    const decisions = getPreviousDecisions(taskId, TMP, 3);
    assert.equal(decisions.length, 3);
    assert.equal(decisions[0].decision, "D7");
  });
});

describe("getResumeContext", () => {
  it("aggregates resume info without loading all executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);

    const e1 = createExecution(taskId, TMP);
    addDecision(taskId, e1.id, "Use JWT", TMP);
    closeExecution(taskId, e1.id, "failed", "Auth broke", TMP);

    const e2 = createExecution(taskId, TMP);
    addObservation(taskId, e2.id, "Fixed auth", TMP);

    const ctx = getResumeContext(taskId, TMP);
    assert.equal(ctx.taskSummary, "Test task");
    assert.equal(ctx.phase, "IMPLEMENTING");
    assert.equal(ctx.lastExecution.id, e2.id);
    assert.equal(ctx.unresolvedRequirements.length, 1);
    assert.equal(ctx.recentFailures.length, 1);
    assert.equal(ctx.recentFailures[0].executionId, e1.id);
    assert.equal(ctx.recentDecisions.length, 1);
    assert.equal(ctx.totalExecutions, 2);
  });

  it("returns null for missing task", () => {
    assert.equal(getResumeContext("nonexistent", TMP), null);
  });
});

describe("needsNewExecution", () => {
  it("true when no executions", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(needsNewExecution(taskId, TMP), true);
  });

  it("true when last execution is not active", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const e1 = createExecution(taskId, TMP);
    closeExecution(taskId, e1.id, "completed", null, TMP);
    assert.equal(needsNewExecution(taskId, TMP), true);
  });

  it("false when last execution is active", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    createExecution(taskId, TMP);
    assert.equal(needsNewExecution(taskId, TMP), false);
  });
});

describe("cross-session persistence", () => {
  it("executions survive state reload", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);

    const e1 = createExecution(taskId, TMP);
    addObservation(taskId, e1.id, "First session", TMP);
    closeExecution(taskId, e1.id, "completed", "Session 1 done", TMP);

    // Simulate new session: re-read from disk
    const state = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    );
    assert.equal(state.executions.length, 1);
    assert.equal(state.executions[0].observations[0], "First session");
    assert.equal(state.executions[0].status, "completed");
  });

  it("historical executions not injected into current state", () => {
    const taskId = makeTaskId();
    const state = makeTaskState();
    persistTaskState(taskId, state, TMP);

    const e1 = createExecution(taskId, TMP);
    addObservation(taskId, e1.id, "Historical obs", TMP);
    closeExecution(taskId, e1.id, "completed", null, TMP);

    // Current state should have executions array but the task's
    // own fields (requirements, lastAction) are untouched
    const current = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    );
    assert.equal(current.lastAction, "Test task");
    assert.equal(current.requirements.length, 2);
    // Historical observations are only in executions, not promoted
    assert.equal(current.observations, undefined);
  });
});
