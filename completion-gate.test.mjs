import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { canComplete, isCompletionAllowed } from "./completion-gate.js";
import { REQUIREMENT_STATES } from "./requirement-state.js";
import {
  persistTaskState,
} from "./engine.js";
import {
  createEvidence,
  linkEvidenceToRequirement,
} from "./evidence-lineage.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-completion-gate-"));
let counter = 0;
const newTaskId = () => `cg-test-${++counter}`;

function setupTask(requirements) {
  const taskId = newTaskId();
  persistTaskState(
    taskId,
    {
      phase: "IMPLEMENTING",
      contract: { objective: "Completion gate test" },
      requirements,
      currentRunId: null,
    },
    TMP
  );
  return taskId;
}

function seedVerifiedEvidence(taskId, requirementId) {
  const evidence = createEvidence(
    taskId,
    {
      requirementId,
      hypothesisId: "hyp-x",
      experimentId: "exp-x",
      observationId: "obs-x",
      type: "test",
      source: "unit-test",
      status: "valid",
    },
    TMP
  );
  linkEvidenceToRequirement(
    evidence.id,
    requirementId,
    "hyp-x",
    "exp-x",
    "obs-x",
    taskId,
    TMP
  );
  return evidence;
}

describe("canComplete()", () => {
  it("blocks when task has no requirements", () => {
    const taskId = setupTask([]);
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /no requirements/);
    assert.deepEqual(result.blockers, []);
  });

  it("blocks when requirements have no evidence", () => {
    const taskId = setupTask([
      { id: "req-a", title: "A", status: REQUIREMENT_STATES.PENDING, evidence: [] },
    ]);
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, false);
    assert.equal(result.blockers.length, 1);
    assert.equal(result.blockers[0].requirementId, "req-a");
    assert.match(result.blockers[0].reason, /no evidence/);
  });

  it("blocks when evidence is inconclusive", () => {
    const taskId = setupTask([
      { id: "req-i", title: "I", status: REQUIREMENT_STATES.IN_PROGRESS, evidence: [] },
    ]);
    createEvidence(
      taskId,
      {
        requirementId: "req-i",
        hypothesisId: "hyp-i",
        experimentId: "exp-i",
        observationId: "obs-i",
        status: "inconclusive",
      },
      TMP
    );
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, false);
    const blocker = result.blockers.find((b) => b.requirementId === "req-i");
    assert.ok(blocker);
    assert.match(blocker.reason, /inconclusive/);
  });

  it("blocks when evidence is contradictory or invalidated", () => {
    const taskId = setupTask([
      { id: "req-c", title: "C", status: REQUIREMENT_STATES.IN_PROGRESS, evidence: [] },
    ]);
    createEvidence(
      taskId,
      {
        requirementId: "req-c",
        hypothesisId: "hyp-c",
        experimentId: "exp-c",
        observationId: "obs-c",
        status: "contradictory",
      },
      TMP
    );
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, false);
    const blocker = result.blockers.find((b) => b.requirementId === "req-c");
    assert.ok(blocker);
    assert.match(blocker.reason, /contradictory|invalidated/);
  });

  it("allows when all requirements are verified with valid evidence", () => {
    const taskId = setupTask([
      { id: "req-v", title: "V", status: REQUIREMENT_STATES.VERIFIED, evidence: [] },
    ]);
    seedVerifiedEvidence(taskId, "req-v");
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "all requirements verified");
    assert.deepEqual(result.blockers, []);
  });

  it("blocks when some requirements are still pending even if others verified", () => {
    const taskId = setupTask([
      { id: "req-done", title: "Done", status: REQUIREMENT_STATES.VERIFIED, evidence: [] },
      { id: "req-todo", title: "Todo", status: REQUIREMENT_STATES.PENDING, evidence: [] },
    ]);
    seedVerifiedEvidence(taskId, "req-done");
    const result = canComplete(TMP, taskId);
    assert.equal(result.allowed, false);
    assert.equal(result.blockers.length, 1);
    assert.equal(result.blockers[0].requirementId, "req-todo");
  });

  it("returns false from isCompletionAllowed when blocked", () => {
    const taskId = setupTask([
      { id: "req-x", title: "X", status: REQUIREMENT_STATES.PENDING, evidence: [] },
    ]);
    assert.equal(isCompletionAllowed(TMP, taskId), false);
  });

  it("rejects when taskId is missing", () => {
    const result = canComplete(TMP, "");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /required/);
  });

  it("rejects when taskRoot does not exist", () => {
    const result = canComplete("/this/does/not/exist/__nope__", "any");
    assert.equal(result.allowed, false);
    assert.match(result.reason, /does not exist/);
  });
});

describe("canComplete() summary", () => {
  it("includes correct totals", () => {
    const taskId = setupTask([
      { id: "req-1", title: "1", status: REQUIREMENT_STATES.VERIFIED, evidence: [] },
      { id: "req-2", title: "2", status: REQUIREMENT_STATES.PENDING, evidence: [] },
      { id: "req-3", title: "3", status: REQUIREMENT_STATES.PENDING, evidence: [] },
    ]);
    seedVerifiedEvidence(taskId, "req-1");
    const result = canComplete(TMP, taskId);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.complete, 1);
    assert.equal(result.summary.incomplete, 2);
  });
});
