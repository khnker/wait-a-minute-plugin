import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createEvidence,
  getEvidence,
  getAllEvidence,
  getEvidenceForRequirement,
  getValidEvidence,
  verifyEvidence,
  supersedeEvidence,
  invalidateEvidence,
  detectOrphanedEvidence,
  detectInvalidatedEvidence,
  getLineageForRequirement,
  isRequirementSatisfied,
  getSatisfiedRequirements,
  getUnsatisfiedRequirements,
  getCompletionStatus,
  getEvidenceSummary,
  linkEvidenceToRequirement,
  getLineage,
  invalidateDependentEvidence,
  hasStaleEvidence,
} from "./evidence-lineage.js"; // Re-added for lineage tests
import { persistTaskState, getTaskState } from "./engine.js";
import { noteContradiction } from "./hypothesis-manager.js";
import { checkEvidenceFreshness, prepareRequirementVerification } from "./verification-context.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-ev-lineage-test-"));
let taskCounter = 0;

function makeTaskId() {
  return `ev-test-${++taskCounter}`;
}

function makeTaskState(overrides = {}) {
  return {
    phase: "IMPLEMENTING",
    contract: { objective: "Test" },
    requirements: [
      { id: "req-1", title: "Req 1", status: "pending", evidence: [] },
      { id: "req-2", title: "Req 2", status: "pending", evidence: [] },
    ],
    currentRunId: null,
    ...overrides,
  };
}

function setupTask() {
  const taskId = makeTaskId();
  persistTaskState(taskId, makeTaskState(), TMP);
  return taskId;
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("createEvidence", () => {
  it("creates evidence with lineage data", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      content: "Tests pass",
      type: "test",
      source: "tool",
    }, TMP);

    assert.ok(ev.id.startsWith("ev-"));
    assert.equal(ev.requirementId, "req-1");
    assert.equal(ev.content, "Tests pass");
    assert.equal(ev.status, "unverified");
  });

  it("stores evidence as separate file", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      content: "Another evidence",
    }, TMP);

    const file = path.join(TMP, ".wam", "tasks", taskId, "lineage", `${ev.id}.json`);
    assert.ok(fs.existsSync(file));
  });
});

describe("getEvidence", () => {
  it("retrieves evidence by id", () => {
    const taskId = setupTask();
    const created = createEvidence(taskId, {
      requirementId: "req-1",
      content: "Get test",
    }, TMP);

    const retrieved = getEvidence(taskId, created.id, TMP);
    assert.equal(retrieved.id, created.id);
    assert.equal(retrieved.content, "Get test");
  });

  it("returns null for missing evidence", () => {
    const taskId = setupTask();
    assert.equal(getEvidence(taskId, "ev-999", TMP), null);
  });
});

describe("getAllEvidence", () => {
  it("returns all evidence sorted by createdAt", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-1", content: "First" }, TMP);
    createEvidence(taskId, { requirementId: "req-1", content: "Second" }, TMP);

    const all = getAllEvidence(taskId, TMP);
    assert.equal(all.length, 2);
    assert.equal(all[0].content, "Second");
  });
});

describe("getEvidenceForRequirement", () => {
  it("filters by requirementId", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-1", content: "For req-1" }, TMP);
    createEvidence(taskId, { requirementId: "req-2", content: "For req-2" }, TMP);

    const forReq1 = getEvidenceForRequirement(taskId, "req-1", TMP);
    assert.equal(forReq1.length, 1);
    assert.equal(forReq1[0].content, "For req-1");
  });
});

describe("getValidEvidence", () => {
  it("returns only valid evidence", () => {
    const taskId = setupTask();
    const ev1 = createEvidence(taskId, { requirementId: "req-1", content: "Ev1" }, TMP);
    const ev2 = createEvidence(taskId, { requirementId: "req-1", content: "Ev2" }, TMP);

    verifyEvidence(taskId, ev1.id, "criterion", "PASS", TMP);

    const valid = getValidEvidence(taskId, "req-1", TMP);
    assert.equal(valid.length, 1);
    assert.equal(valid[0].id, ev1.id);
  });
});

describe("verifyEvidence", () => {
  it("sets status to valid on PASS", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    verifyEvidence(taskId, ev.id, "All tests pass", "PASS", TMP);

    const updated = getEvidence(taskId, ev.id, TMP);
    assert.equal(updated.status, "valid");
    assert.equal(updated.verifications.length, 1);
    assert.equal(updated.verifications[0].result, "PASS");
  });

  it("sets status to insufficient on PARTIAL", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    verifyEvidence(taskId, ev.id, "Some tests pass", "PARTIAL", TMP);

    const updated = getEvidence(taskId, ev.id, TMP);
    assert.equal(updated.status, "insufficient");
  });
});

describe("supersedeEvidence", () => {
  it("marks evidence as superseded", () => {
    const taskId = setupTask();
    const ev1 = createEvidence(taskId, { requirementId: "req-1", content: "Old" }, TMP);
    const ev2 = createEvidence(taskId, { requirementId: "req-1", content: "New" }, TMP);

    supersedeEvidence(taskId, ev1.id, ev2.id, TMP);

    const updated = getEvidence(taskId, ev1.id, TMP);
    assert.equal(updated.status, "superseded");
    assert.equal(updated.supersededBy, ev2.id);
  });
});

describe("invalidateEvidence", () => {
  it("marks evidence as invalidated with reason", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);

    invalidateEvidence(taskId, ev.id, "Environment changed", TMP);

    const updated = getEvidence(taskId, ev.id, TMP);
    assert.equal(updated.status, "invalidated");
    assert.equal(updated.invalidationReason, "Environment changed");
  });
});

describe("detectOrphanedEvidence", () => {
  it("finds evidence for non-existent requirements", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-nonexistent", content: "Orphan" }, TMP);

    const orphans = detectOrphanedEvidence(taskId, TMP);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].requirementId, "req-nonexistent");
  });

  it("returns empty when all evidence is valid", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-1", content: "Valid" }, TMP);

    const orphans = detectOrphanedEvidence(taskId, TMP);
    assert.equal(orphans.length, 0);
  });
});

describe("detectInvalidatedEvidence", () => {
  it("detects when environment changes", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      content: "Chromium works",
      environment: { os: "linux", nodeVersion: "v20", executable: "chromium", version: "1.0" },
    }, TMP);
    verifyEvidence(taskId, ev.id, "Chromium launches", "PASS", TMP);

    const invalidated = detectInvalidatedEvidence(taskId, {
      os: "linux",
      nodeVersion: "v20",
      executable: "chromium",
      version: "REMOVED",
    }, TMP);

    assert.equal(invalidated.length, 1);
    assert.equal(invalidated[0].evidence.id, ev.id);
  });

  it("returns empty when environment unchanged", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      content: "Test",
      environment: { os: "linux", nodeVersion: "v20" },
    }, TMP);
    verifyEvidence(taskId, ev.id, "Test", "PASS", TMP);

    const invalidated = detectInvalidatedEvidence(taskId, {
      os: "linux",
      nodeVersion: "v20",
    }, TMP);

    assert.equal(invalidated.length, 0);
  });
});

describe("isRequirementSatisfied", () => {
  it("true when valid evidence exists", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    verifyEvidence(taskId, ev.id, "Test", "PASS", TMP);

    assert.equal(isRequirementSatisfied(taskId, "req-1", TMP), true);
  });

  it("false when no valid evidence", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    assert.equal(isRequirementSatisfied(taskId, "req-1", TMP), false);
  });
});

describe("getCompletionStatus", () => {
  it("reports completion status correctly", () => {
    const taskId = setupTask();
    const ev1 = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    verifyEvidence(taskId, ev1.id, "Test", "PASS", TMP);

    const status = getCompletionStatus(taskId, TMP);
    assert.equal(status.totalRequirements, 2);
    assert.equal(status.satisfiedCount, 1);
    assert.equal(status.canComplete, false);
  });

  it("canComplete true when all satisfied and no orphans", () => {
    const taskId = setupTask();
    const ev1 = createEvidence(taskId, { requirementId: "req-1", content: "Test" }, TMP);
    const ev2 = createEvidence(taskId, { requirementId: "req-2", content: "Test" }, TMP);
    verifyEvidence(taskId, ev1.id, "Test", "PASS", TMP);
    verifyEvidence(taskId, ev2.id, "Test", "PASS", TMP);

    const status = getCompletionStatus(taskId, TMP);
    assert.equal(status.canComplete, true);
  });
});

describe("getEvidenceSummary", () => {
  it("aggregates evidence counts", () => {
    const taskId = setupTask();
    createEvidence(taskId, { requirementId: "req-1", content: "Test1" }, TMP);
    const ev2 = createEvidence(taskId, { requirementId: "req-1", content: "Test2" }, TMP);
    verifyEvidence(taskId, ev2.id, "Test", "PASS", TMP);

    const summary = getEvidenceSummary(taskId, TMP);
    assert.equal(summary.total, 2);
    assert.equal(summary.byStatus.valid, 1);
    assert.equal(summary.byStatus.unverified, 1);
  });
});

describe("linkEvidenceToRequirement", () => {
  it("links evidence to requirement, hypothesis, experiment, observation", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, { requirementId: "req-1", content: "obs" }, TMP);
    const linked = linkEvidenceToRequirement(
      ev.id, "req-1", "hyp-1", "exp-1", "obs-1", taskId, TMP
    );
    assert.equal(linked.requirementId, "req-1");
    assert.equal(linked.hypothesisId, "hyp-1");
    assert.equal(linked.experimentId, "exp-1");
    assert.equal(linked.observationId, "obs-1");

    const stored = getEvidence(taskId, ev.id, TMP);
    assert.equal(stored.hypothesisId, "hyp-1");
    assert.equal(stored.experimentId, "exp-1");
    assert.equal(stored.observationId, "obs-1");
  });

  it("returns in-memory chain when taskId is omitted", () => {
    const linked = linkEvidenceToRequirement("ev-x", "req-1", "hyp-1", "exp-1", "obs-1");
    assert.equal(linked.requirementId, "req-1");
    assert.equal(linked.hypothesisId, "hyp-1");
    assert.deepEqual(linked.chain, ["requirement", "hypothesis", "experiment", "observation", "evidence"]);
  });
});

describe("getLineage", () => {
  it("returns the full Requirement → Hypothesis → Experiment → Observation → Evidence chain", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      hypothesisId: "hyp-1",
      experimentId: "exp-1",
      observationId: "obs-1",
      content: "pass",
    }, TMP);
    const lineage = getLineage(taskId, "req-1", TMP);
    assert.equal(lineage.requirementId, "req-1");
    assert.deepEqual(lineage.chain, ["requirement", "hypothesis", "experiment", "observation", "evidence"]);
    assert.ok(lineage.hypotheses.includes("hyp-1"));
    assert.ok(lineage.experiments.includes("exp-1"));
    assert.ok(lineage.observations.includes("obs-1"));
    assert.equal(lineage.evidence.length, 1);
    assert.equal(lineage.evidence[0].id, ev.id);
  });
});

describe("invalidateDependentEvidence", () => {
  it("marks dependent evidence STALE by hypothesisId", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      hypothesisId: "hyp-1",
      experimentId: "exp-1",
      observationId: "obs-1",
      content: "pass",
    }, TMP);
    verifyEvidence(taskId, ev.id, "ok", "PASS", TMP);

    const stale = invalidateDependentEvidence(taskId, "hyp-1", "hypothesis rejected", TMP);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].status, "stale");
    assert.equal(stale[0].invalidationReason, "hypothesis rejected");

    const stored = getEvidence(taskId, ev.id, TMP);
    assert.equal(stored.status, "stale");
    assert.equal(hasStaleEvidence(taskId, "req-1", TMP), true);
  });

  it("marks dependent evidence STALE by requirementId", () => {
    const taskId = setupTask();
    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      hypothesisId: "hyp-2",
      content: "pass",
    }, TMP);
    verifyEvidence(taskId, ev.id, "ok", "PASS", TMP);

    const stale = invalidateDependentEvidence(taskId, "req-1", "requirement invalidated", TMP);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].status, "stale");
  });
});

describe("noteContradiction → STALE evidence → requirement PENDING", () => {
  it("rejects hypothesis, stales dependent evidence, returns requirement to pending", () => {
    const taskId = setupTask();
    persistTaskState(taskId, makeTaskState({
      requirements: [
        { id: "req-1", title: "Req 1", status: "verified", evidence: [] },
        { id: "req-2", title: "Req 2", status: "pending", evidence: [] },
      ],
    }), TMP);

    const ev = createEvidence(taskId, {
      requirementId: "req-1",
      hypothesisId: "hyp-1",
      experimentId: "exp-1",
      observationId: "obs-1",
      content: "pass",
    }, TMP);
    verifyEvidence(taskId, ev.id, "ok", "PASS", TMP);

    const assessment = {
      result: "CONTRADICTED",
      reasoning: "observation does not match expected",
      comparisons: [
        { field: "output", status: "CONTRADICTED", expected: "green", actual: "red" },
      ],
    };

    const contradiction = noteContradiction(
      taskId, "hyp-1", { output: "red" }, assessment, TMP
    );

    assert.equal(contradiction.type, "CONTRADICTION");
    assert.equal(contradiction.hypothesisStatus, "rejected");
    assert.equal(contradiction.replan, true);
    assert.ok(contradiction.staleEvidence.length >= 1);
    assert.ok(contradiction.pendingRequirements.includes("req-1"));

    const stored = getEvidence(taskId, ev.id, TMP);
    assert.equal(stored.status, "stale");

    const state = getTaskState(taskId, TMP);
    const req = state.requirements.find((r) => r.id === "req-1");
    assert.equal(req.status, "pending");
    assert.equal(req.replan, true);
  });

  it("keeps the 3-arg signature used by execution-engine callers", () => {
    const assessment = {
      result: "CONTRADICTED",
      reasoning: "mismatch",
      comparisons: [],
    };
    const contradiction = noteContradiction("hyp-x", { foo: 1 }, assessment);
    assert.equal(contradiction.type, "CONTRADICTION");
    assert.equal(contradiction.hypothesisId, "hyp-x");
    assert.equal(contradiction.replan, true);
  });
});

describe("verification freshness gate", () => {
  it("blocks verification and returns requirement to PENDING when evidence is STALE", () => {
    const requirement = { id: "req-1", status: "verified" };
    const evidence = [{ id: "ev-1", status: "stale" }];
    const result = checkEvidenceFreshness(requirement, evidence);
    assert.equal(result.canVerify, false);
    assert.equal(result.requirement.status, "pending");
    assert.equal(result.requirement.replan, true);
    assert.ok(result.reason.includes("STALE"));
  });

  it("allows verification when evidence is fresh", () => {
    const requirement = { id: "req-1", status: "verified" };
    const result = prepareRequirementVerification(requirement, [{ id: "ev-1", status: "valid" }]);
    assert.equal(result.canVerify, true);
    assert.equal(result.requirement.status, "verified");
  });
});
