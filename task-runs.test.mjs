import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  startRun,
  closeRun,
  updateRun,
  addObservation,
  addDecision,
  addEvidence,
  addAction,
  getRun,
  getRuns,
  getLastRun,
  getCurrentRun,
  getActiveRun,
  getLastRunSummary,
  getUnresolvedRequirements,
  getPreviousFailures,
  getPreviousDecisions,
  getResumeContext,
  needsNewRun,
  getRunCount,
  getRunsByStatus,
} from "./task-runs.js";
import { persistTaskState } from "./engine.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-persistent-runs-test-"));
let taskCounter = 0;

function makeTaskId() {
  return `persistent-task-${++taskCounter}`;
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
    currentRunId: null,
    ...overrides,
  };
}

before(() => {
  fs.mkdirSync(path.join(TMP, ".wam", "tasks"), { recursive: true });
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("startRun", () => {
  it("creates run as separate file", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);

    assert.ok(run.id.startsWith(taskId));
    assert.equal(run.taskId, taskId);
    assert.equal(run.status, "active");

    const runFile = path.join(TMP, ".wam", "tasks", taskId, "runs", `${run.id}.json`);
    assert.ok(fs.existsSync(runFile), "Run file should exist");

    const state = JSON.parse(fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8"));
    assert.equal(state.currentRunId, run.id, "Task state should reference current run");
  });

  it("increments run index", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    const r2 = startRun(taskId, TMP);
    assert.ok(r1.id.endsWith("001"));
    assert.ok(r2.id.endsWith("002"));
  });
});

describe("closeRun", () => {
  it("closes run and clears currentRunId", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    closeRun(taskId, run.id, "completed", "All done", TMP);

    const closed = getRun(taskId, run.id, TMP);
    assert.equal(closed.status, "completed");
    assert.equal(closed.outcome, "All done");

    const state = JSON.parse(fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8"));
    assert.equal(state.currentRunId, null);
  });
});

describe("getRuns", () => {
  it("reads all run files", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    startRun(taskId, TMP);
    startRun(taskId, TMP);

    const runs = getRuns(taskId, TMP);
    assert.equal(runs.length, 2);
  });

  it("returns empty array for task with no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.deepEqual(getRuns(taskId, TMP), []);
  });
});

describe("getLastRun", () => {
  it("returns most recent run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    const r2 = startRun(taskId, TMP);
    const last = getLastRun(taskId, TMP);
    assert.equal(last.id, r2.id);
  });
});

describe("getCurrentRun", () => {
  it("returns run referenced in task state", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    const current = getCurrentRun(taskId, TMP);
    assert.equal(current.id, run.id);
  });

  it("returns null when no current run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(getCurrentRun(taskId, TMP), null);
  });
});

describe("getActiveRun", () => {
  it("finds active run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    const active = getActiveRun(taskId, TMP);
    assert.equal(active.id, run.id);
  });

  it("returns null when no active run", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    closeRun(taskId, run.id, "completed", null, TMP);
    assert.equal(getActiveRun(taskId, TMP), null);
  });
});

describe("addObservation", () => {
  it("appends observation to run file", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Found a bug", TMP);

    const updated = getRun(taskId, run.id, TMP);
    assert.equal(updated.observations.length, 1);
    assert.equal(updated.observations[0].text, "Found a bug");
  });
});

describe("addDecision", () => {
  it("appends decision to run file", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addDecision(taskId, run.id, "Use bcrypt", TMP);

    const updated = getRun(taskId, run.id, TMP);
    assert.equal(updated.decisions.length, 1);
  });
});

describe("addEvidence", () => {
  it("appends evidence to run file", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addEvidence(taskId, run.id, "Tests pass", TMP);

    const updated = getRun(taskId, run.id, TMP);
    assert.equal(updated.evidence.length, 1);
  });
});

describe("addAction", () => {
  it("appends action to run file", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addAction(taskId, run.id, { tool: "write", path: "test.js" }, TMP);

    const updated = getRun(taskId, run.id, TMP);
    assert.equal(updated.actions.length, 1);
    assert.equal(updated.actions[0].tool, "write");
  });
});

describe("getPreviousFailures", () => {
  it("returns failed and abandoned runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "failed", "Timeout", TMP);
    const r2 = startRun(taskId, TMP);
    closeRun(taskId, r2.id, "abandoned", "Changed plan", TMP);

    const failures = getPreviousFailures(taskId, TMP);
    assert.equal(failures.length, 2);
  });
});

describe("getPreviousDecisions", () => {
  it("collects decisions from all runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    addDecision(taskId, r1.id, "Decision 1", TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);

    const decisions = getPreviousDecisions(taskId, TMP, 5);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decision, "Decision 1");
  });
});

describe("getResumeContext", () => {
  it("aggregates context without loading all history", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);

    const r1 = startRun(taskId, TMP);
    addDecision(taskId, r1.id, "Use JWT", TMP);
    closeRun(taskId, r1.id, "failed", "Auth broke", TMP);

    const r2 = startRun(taskId, TMP);
    addObservation(taskId, r2.id, "Fixed auth", TMP);

    const ctx = getResumeContext(taskId, TMP);
    assert.equal(ctx.lastRun.id, r2.id);
    assert.equal(ctx.totalRuns, 2);
    assert.equal(ctx.recentFailures.length, 1);
  });
});

describe("needsNewRun", () => {
  it("true when no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(needsNewRun(taskId, TMP), true);
  });

  it("true when last run completed", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);
    assert.equal(needsNewRun(taskId, TMP), true);
  });

  it("false when run is active", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    startRun(taskId, TMP);
    assert.equal(needsNewRun(taskId, TMP), false);
  });
});

describe("task persistence", () => {
  it("task remains in .wam/tasks/ after run completes", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    closeRun(taskId, run.id, "completed", null, TMP);

    const taskDir = path.join(TMP, ".wam", "tasks", taskId);
    assert.ok(fs.existsSync(taskDir), "Task directory should still exist");
    assert.ok(fs.existsSync(path.join(taskDir, "state.yaml")), "state.yaml should exist");
    assert.ok(fs.existsSync(path.join(taskDir, "runs", `${run.id}.json`)), "Run file should exist");
  });

  it("multiple runs persist independently", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    addObservation(taskId, r1.id, "Run 1 obs", TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);

    const r2 = startRun(taskId, TMP);
    addObservation(taskId, r2.id, "Run 2 obs", TMP);
    closeRun(taskId, r2.id, "completed", null, TMP);

    const runs = getRuns(taskId, TMP);
    assert.equal(runs.length, 2);
    assert.equal(runs[0].observations[0].text, "Run 1 obs");
    assert.equal(runs[1].observations[0].text, "Run 2 obs");
  });
});

describe("getRunCount", () => {
  it("returns correct count", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    assert.equal(getRunCount(taskId, TMP), 0);
    startRun(taskId, TMP);
    assert.equal(getRunCount(taskId, TMP), 1);
    startRun(taskId, TMP);
    assert.equal(getRunCount(taskId, TMP), 2);
  });
});

describe("getRunsByStatus", () => {
  it("filters by status", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);
    const r2 = startRun(taskId, TMP);
    closeRun(taskId, r2.id, "failed", null, TMP);

    const completed = getRunsByStatus(taskId, TMP, "completed");
    const failed = getRunsByStatus(taskId, TMP, "failed");
    assert.equal(completed.length, 1);
    assert.equal(failed.length, 1);
  });
});

describe("updateRun", () => {
  it("updates arbitrary fields", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    updateRun(taskId, run.id, { phase: "VERIFYING" }, TMP);

    const updated = getRun(taskId, run.id, TMP);
    assert.equal(updated.phase, "VERIFYING");
  });
});
