import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  startRun,
  closeRun,
  addObservation,
  addDecision,
  addEvidence,
  getRuns,
  getLastRun,
  getLastRunSummary,
  getUnresolvedRequirements,
  getPreviousFailures,
  getPreviousDecisions,
  getResumeContext,
  needsNewRun,
} from "./task-runs.js";
import { persistTaskState } from "./engine.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-runs-test-"));
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
    runs: [],
    ...overrides,
  };
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("startRun", () => {
  it("creates a run with correct fields", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    assert.ok(run.id.startsWith(taskId));
    assert.equal(run.taskId, taskId);
    assert.equal(run.status, "active");
    assert.ok(run.startedAt > 0);
    assert.deepEqual(run.observations, []);
    assert.deepEqual(run.decisions, []);
    assert.deepEqual(run.evidence, []);
  });

  it("increments run index", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    const r2 = startRun(taskId, TMP);
    assert.ok(r1.id.endsWith("001"));
    assert.ok(r2.id.endsWith("002"));
  });

  it("throws for missing task", () => {
    assert.throws(() => startRun("nonexistent", TMP), /not found/);
  });
});

describe("closeRun", () => {
  it("closes with status and outcome", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    const closed = closeRun(taskId, run.id, "completed", "All tests pass", TMP);
    assert.equal(closed.status, "completed");
    assert.equal(closed.outcome, "All tests pass");
    assert.ok(closed.completedAt > 0);
  });

  it("throws for missing run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.throws(() => closeRun(taskId, "bad-id", "completed", null, TMP), /not found/);
  });
});

describe("addObservation", () => {
  it("appends observation to run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Found a bug in auth", TMP);
    addObservation(taskId, run.id, "Tests pass now", TMP);
    const updated = getRuns(taskId, TMP);
    assert.equal(updated[0].observations.length, 2);
    assert.equal(updated[0].observations[0], "Found a bug in auth");
  });
});

describe("addDecision", () => {
  it("appends decision to run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addDecision(taskId, run.id, "Use bcrypt for hashing", TMP);
    const updated = getRuns(taskId, TMP);
    assert.equal(updated[0].decisions.length, 1);
  });
});

describe("addEvidence", () => {
  it("appends evidence to run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addEvidence(taskId, run.id, "Coverage at 85%", TMP);
    const updated = getRuns(taskId, TMP);
    assert.equal(updated[0].evidence.length, 1);
  });
});

describe("getRuns", () => {
  it("returns empty for task with no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.deepEqual(getRuns(taskId, TMP), []);
  });

  it("returns all runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    startRun(taskId, TMP);
    startRun(taskId, TMP);
    assert.equal(getRuns(taskId, TMP).length, 2);
  });
});

describe("getLastRun", () => {
  it("returns most recent run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    startRun(taskId, TMP);
    const r2 = startRun(taskId, TMP);
    const last = getLastRun(taskId, TMP);
    assert.equal(last.id, r2.id);
  });

  it("returns null for no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(getLastRun(taskId, TMP), null);
  });
});

describe("getLastRunSummary", () => {
  it("returns summary of last run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "obs1", TMP);
    addDecision(taskId, run.id, "dec1", TMP);
    closeRun(taskId, run.id, "completed", "done", TMP);

    const summary = getLastRunSummary(taskId, TMP);
    assert.equal(summary.runId, run.id);
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
  it("returns failed/abandoned runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "failed", "Timeout", TMP);
    const r2 = startRun(taskId, TMP);
    closeRun(taskId, r2.id, "completed", "OK", TMP);
    const r3 = startRun(taskId, TMP);
    closeRun(taskId, r3.id, "abandoned", "Changed plan", TMP);

    const failures = getPreviousFailures(taskId, TMP);
    assert.equal(failures.length, 2);
  });
});

describe("getPreviousDecisions", () => {
  it("returns recent decisions with provenance", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    addDecision(taskId, r1.id, "Decision 1", TMP);
    addDecision(taskId, r1.id, "Decision 2", TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);

    const decisions = getPreviousDecisions(taskId, TMP, 2);
    assert.equal(decisions.length, 2);
    assert.equal(decisions[0].runId, r1.id);
    assert.equal(decisions[0].decision, "Decision 1");
  });

  it("respects limit", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    for (let i = 0; i < 10; i++) addDecision(taskId, r1.id, `D${i}`, TMP);

    const decisions = getPreviousDecisions(taskId, TMP, 3);
    assert.equal(decisions.length, 3);
    assert.equal(decisions[0].decision, "D7");
  });
});

describe("getResumeContext", () => {
  it("aggregates resume info without loading all runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);

    const r1 = startRun(taskId, TMP);
    addDecision(taskId, r1.id, "Use JWT", TMP);
    closeRun(taskId, r1.id, "failed", "Auth broke", TMP);

    const r2 = startRun(taskId, TMP);
    addObservation(taskId, r2.id, "Fixed auth", TMP);

    const ctx = getResumeContext(taskId, TMP);
    assert.equal(ctx.taskSummary, "Test task");
    assert.equal(ctx.phase, "IMPLEMENTING");
    assert.equal(ctx.lastRun.id, r2.id);
    assert.equal(ctx.unresolvedRequirements.length, 1);
    assert.equal(ctx.recentFailures.length, 1);
    assert.equal(ctx.recentFailures[0].runId, r1.id);
    assert.equal(ctx.recentDecisions.length, 1);
    assert.equal(ctx.totalRuns, 2);
  });

  it("returns null for missing task", () => {
    assert.equal(getResumeContext("nonexistent", TMP), null);
  });
});

describe("needsNewRun", () => {
  it("true when no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(needsNewRun(taskId, TMP), true);
  });

  it("true when last run is not active", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);
    assert.equal(needsNewRun(taskId, TMP), true);
  });

  it("false when last run is active", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    startRun(taskId, TMP);
    assert.equal(needsNewRun(taskId, TMP), false);
  });
});

describe("cross-session persistence", () => {
  it("runs survive state reload", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);

    const r1 = startRun(taskId, TMP);
    addObservation(taskId, r1.id, "First session", TMP);
    closeRun(taskId, r1.id, "completed", "Session 1 done", TMP);

    const state = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    );
    assert.equal(state.runs.length, 1);
    assert.equal(state.runs[0].observations[0], "First session");
    assert.equal(state.runs[0].status, "completed");
  });

  it("historical runs not injected into current state", () => {
    const taskId = makeTaskId();
    const state = makeTaskState();
    persistTaskState(taskId, state, TMP);

    const r1 = startRun(taskId, TMP);
    addObservation(taskId, r1.id, "Historical obs", TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);

    const current = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    );
    assert.equal(current.lastAction, "Test task");
    assert.equal(current.requirements.length, 2);
    assert.equal(current.observations, undefined);
  });
});
