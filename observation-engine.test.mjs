import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buildObservationPayload,
  resolveExperimentContext,
  deriveDefaultFacts,
  recordRawObservation,
} from "./observation-engine.js";
import { AssessmentResult } from "./assessment-engine.js";
import { createExperiment, createHypothesis, listObservations } from "./cognition-store.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-obs-"));
  const taskId = "obs-task";
  return { root, taskId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("buildObservationPayload: shapes defaults and arrays", () => {
  const payload = buildObservationPayload({
    experimentId: "exp1",
    hypothesisId: "hyp1",
    result: AssessmentResult.SUPPORTED,
    facts: ["f1", "f2"],
    actual: 42,
    unexpected: ["u1"],
    provenance: { tool: "read" },
  });
  assert.equal(payload.experimentId, "exp1");
  assert.equal(payload.hypothesisId, "hyp1");
  assert.equal(payload.result, AssessmentResult.SUPPORTED);
  assert.deepEqual(payload.facts, ["f1", "f2"]);
  assert.equal(payload.actual, 42);
  assert.deepEqual(payload.unexpected, ["u1"]);
  assert.deepEqual(payload.provenance, { tool: "read" });
});

test("buildObservationPayload: handles missing optional arrays", () => {
  const payload = buildObservationPayload({
    experimentId: null,
    hypothesisId: "h",
    result: AssessmentResult.INCONCLUSIVE,
    facts: ["only"],
  });
  assert.equal(payload.experimentId, null);
  assert.deepEqual(payload.unexpected, []);
  assert.equal(payload.provenance, null);
});

test("resolveExperimentContext: returns null when no experimentId", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const ctx = resolveExperimentContext(root, taskId, {
      experimentId: null,
      hypothesisId: "h",
    });
    assert.equal(ctx, null);
  } finally {
    cleanup();
  }
});

test("resolveExperimentContext: returns fallback shell when id provided but unknown", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const ctx = resolveExperimentContext(root, taskId, {
      experimentId: "missing",
      hypothesisId: "h",
    });
    assert.deepEqual(ctx, { id: "missing", hypothesisId: "h" });
  } finally {
    cleanup();
  }
});

test("resolveExperimentContext: returns stored experiment when found", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const h = createHypothesis(root, taskId, { statement: "s", confidence: 0.5 });
    const e = createExperiment(root, taskId, {
      hypothesisId: h.id,
      tool: "read",
      args: {},
      actionDescription: "read:{}",
      expectedObservation: null,
    });
    const ctx = resolveExperimentContext(root, taskId, {
      experimentId: e.id,
      hypothesisId: h.id,
    });
    assert.ok(ctx);
    assert.equal(ctx.id, e.id);
    assert.equal(ctx.hypothesisId, h.id);
  } finally {
    cleanup();
  }
});

test("resolveExperimentContext: falls back when stored experiment missing (alias)", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const ctx = resolveExperimentContext(root, taskId, {
      experimentId: "phantom",
      hypothesisId: "h",
    });
    assert.deepEqual(ctx, { id: "phantom", hypothesisId: "h" });
  } finally {
    cleanup();
  }
});

test("deriveDefaultFacts: pre-built facts win", () => {
  const facts = deriveDefaultFacts({
    outcome: "success",
    result: "ignored",
    facts: ["ev-1", "ev-2"],
  });
  assert.deepEqual(facts, ["ev-1", "ev-2"]);
});

test("deriveDefaultFacts: failure outcome uses reason", () => {
  const facts = deriveDefaultFacts({
    outcome: "failure",
    reason: "boom",
  });
  assert.deepEqual(facts, ["boom"]);
});

test("deriveDefaultFacts: failure without reason returns generic", () => {
  const facts = deriveDefaultFacts({ outcome: "failure" });
  assert.deepEqual(facts, ["failure"]);
});

test("deriveDefaultFacts: success with string result", () => {
  const facts = deriveDefaultFacts({ outcome: "success", result: "ok" });
  assert.deepEqual(facts, ["ok"]);
});

test("deriveDefaultFacts: success with object result stringifies", () => {
  const facts = deriveDefaultFacts({ outcome: "success", result: { a: 1 } });
  assert.deepEqual(facts, ['{"a":1}']);
});

test("deriveDefaultFacts: success with null result returns ok", () => {
  const facts = deriveDefaultFacts({ outcome: "success", result: null });
  assert.deepEqual(facts, ["ok"]);
});

test("recordRawObservation: persists payload and returns record", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const h = createHypothesis(root, taskId, { statement: "s", confidence: 0.5 });
    const e = createExperiment(root, taskId, {
      hypothesisId: h.id,
      tool: "read",
      args: {},
      actionDescription: "read:{}",
      expectedObservation: null,
    });
    const { observation, experiment } = recordRawObservation(root, taskId, {
      experimentId: e.id,
      hypothesisId: h.id,
      result: AssessmentResult.SUPPORTED,
      actual: "data",
      facts: ["fact-A"],
      outcome: "success",
    });
    assert.ok(observation.id);
    assert.equal(experiment?.id, e.id);
    const all = listObservations(root, taskId);
    assert.equal(all.length, 1);
    assert.equal(all[0].result, AssessmentResult.SUPPORTED);
    assert.deepEqual(all[0].facts, ["fact-A"]);
  } finally {
    cleanup();
  }
});

test("recordRawObservation: survives missing experiment (no fallback record)", () => {
  const { root, taskId, cleanup } = setup();
  try {
    const h = createHypothesis(root, taskId, { statement: "s", confidence: 0.5 });
    const { observation, experiment } = recordRawObservation(root, taskId, {
      experimentId: null,
      hypothesisId: h.id,
      result: AssessmentResult.INCONCLUSIVE,
      outcome: "success",
      result_payload: null,
    });
    assert.ok(observation.id);
    assert.equal(experiment, null);
  } finally {
    cleanup();
  }
});
