import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createHypothesis,
  listHypotheses,
  updateHypothesisStatus,
  getActiveHypotheses,
  createExperiment,
  listExperiments,
  completeExperiment,
  failExperiment,
  findRepeatedExperiment,
  recordObservation,
  listObservations,
  getObservationsForExperiment,
  buildCompactState,
} from "./cognition-store.js";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wam-cog-"));
const taskId = "test-task";

test("Cognition: createHypothesis persists", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H1: parser bug" });
  assert.ok(h.id.startsWith("H"));
  assert.equal(h.status, "proposed");

  const all = listHypotheses(tmpRoot, taskId);
  assert.equal(all.length, 1);
  assert.equal(all[0].statement, "H1: parser bug");
});

test("Cognition: updateHypothesisStatus to rejected", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H2: cache issue" });
  const updated = updateHypothesisStatus(tmpRoot, taskId, h.id, "rejected");
  assert.equal(updated.status, "rejected");

  const active = getActiveHypotheses(tmpRoot, taskId);
  assert.ok(!active.find((x) => x.id === h.id));
});

test("Cognition: rejected hypothesis preserved (no silent reuse)", () => {
  const rejected = listHypotheses(tmpRoot, taskId).filter((h) => h.status === "rejected");
  assert.ok(rejected.length >= 1);
});

test("Cognition: createExperiment and complete", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H3: input parsing" });
  const e = createExperiment(tmpRoot, taskId, {
    hypothesisId: h.id,
    actionDescription: "log input value",
  });
  assert.equal(e.status, "proposed");

  const completed = completeExperiment(tmpRoot, taskId, e.id, { result: "ok" });
  assert.equal(completed.status, "completed");
});

test("Cognition: failExperiment", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H4: network timeout" });
  const e = createExperiment(tmpRoot, taskId, {
    hypothesisId: h.id,
    actionDescription: "ping server",
  });
  const failed = failExperiment(tmpRoot, taskId, e.id, "timeout");
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "timeout");
});

test("Cognition: recordObservation linked to experiment", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H5: obs test" });
  const e = createExperiment(tmpRoot, taskId, {
    hypothesisId: h.id,
    actionDescription: "inspect output",
  });
  const obs = recordObservation(tmpRoot, taskId, {
    experimentId: e.id,
    result: "saw error X",
    facts: ["X is thrown when Y is null"],
  });
  assert.equal(obs.experimentId, e.id);

  const linked = getObservationsForExperiment(tmpRoot, taskId, e.id);
  assert.equal(linked.length, 1);
});

test("Cognition: findRepeatedExperiment detects duplication", () => {
  const h = createHypothesis(tmpRoot, taskId, { statement: "H6: repeat test" });
  const e1 = createExperiment(tmpRoot, taskId, {
    hypothesisId: h.id,
    actionDescription: "identical action",
  });
  completeExperiment(tmpRoot, taskId, e1.id, { result: "ok" });

  const repeats = findRepeatedExperiment(tmpRoot, taskId, {
    hypothesisId: h.id,
    actionDescription: "identical action",
  });
  assert.ok(repeats.length >= 1);
});

test("Cognition: buildCompactState returns active/rejected/recent", () => {
  const state = buildCompactState(tmpRoot, taskId);
  assert.ok(Array.isArray(state.activeHypotheses));
  assert.ok(Array.isArray(state.rejectedHypotheses));
  assert.ok(Array.isArray(state.recentExperiments));
  assert.ok(Array.isArray(state.recentObservations));
});

// Cleanup
test("Cognition: cleanup", () => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  assert.ok(!fs.existsSync(tmpRoot));
});
