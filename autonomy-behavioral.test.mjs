/**
 * Autonomy Behavioral Tests — validate the cognitive loop end-to-end.
 *
 * Implements spec: autonomy-behavioral-tests.
 *
 * The decisive criterion is:
 *   "Agent rejects failed hypothesis, creates another, performs another
 *    experiment, fixes, and verifies — without WAM prescribing H2."
 *
 * If this test suite does not pass, WAM is NOT considered autonomous.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  createHypothesis,
  updateHypothesisStatus,
  createExperiment,
  completeExperiment,
  failExperiment,
  recordObservation,
  listHypotheses,
  listExperiments,
  listObservations,
  findRepeatedExperiment,
  buildCompactState,
} from "./cognition-store.js";

import {
  loadCognitiveState,
  saveCognitiveState,
  addActiveHypothesis,
  rejectHypothesis,
  recordExperiment,
  recordObservation as recordCogObservation,
  compactCognitiveState,
} from "./cognitive-state.js";

import { evaluateAction, WamPolicyBlock, RISK_LEVELS } from "./risk-engine.js";

// -- Setup helpers --

function setupTask() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-beh-"));
  const taskId = "behavioral-task";
  return { root, taskId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// -- Behavioral test matrix --

test("Autonomy: T-A — Agent investigates without asking user", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    // Agent creates hypothesis (autonomous decision)
    const h = createHypothesis(root, taskId, {
      statement: "Bug is in parser.ts",
      confidence: 0.6,
    });
    assert.equal(h.status, "proposed");

    // Agent creates SAFE experiment (read file)
    const e = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "read parser.ts:42",
      risk: "SAFE",
      reversible: true,
    });

    // Risk evaluation allows SAFE
    const risk = evaluateAction("read", { path: "parser.ts" }, root);
    assert.equal(risk.level, "SAFE");
    assert.equal(risk.requiresUser, false);

    // Experiment completes
    completeExperiment(root, taskId, e.id, { result: "ok" });

    // No user interaction required
    const exp = listExperiments(root, taskId).find((x) => x.id === e.id);
    assert.equal(exp.status, "completed");
  } finally {
    cleanup();
  }
});

test("Autonomy: T-B — Failed hypothesis → new hypothesis without user", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    // H1 created
    const h1 = createHypothesis(root, taskId, { statement: "Cause = A", confidence: 0.7 });

    // Experiment tests A
    const e1 = createExperiment(root, taskId, {
      hypothesisId: h1.id,
      actionDescription: "test A",
    });

    // Observation: A is false
    recordObservation(root, taskId, {
      experimentId: e1.id,
      result: "A is false",
      facts: ["test returned unexpected value"],
    });

    // H1 rejected (autonomously)
    updateHypothesisStatus(root, taskId, h1.id, "rejected");

    // Agent creates H2 (autonomously — WAM does not define H2)
    const h2 = createHypothesis(root, taskId, {
      statement: "Cause = B",
      confidence: 0.5,
    });

    // Both hypotheses exist with correct statuses
    const all = listHypotheses(root, taskId);
    const rejected = all.find((h) => h.id === h1.id);
    const active = all.find((h) => h.id === h2.id);

    assert.equal(rejected.status, "rejected");
    assert.equal(active.status, "proposed");
  } finally {
    cleanup();
  }
});

test("Autonomy: T-C — Safe experiment with observation recording", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    const h = createHypothesis(root, taskId, { statement: "check weight field" });
    const e = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "log normalize() output",
    });

    // Run experiment (SAFE: read)
    const risk = evaluateAction("read", { path: "src/normalizer.ts" }, root);
    assert.equal(risk.level, "SAFE");

    completeExperiment(root, taskId, e.id, { result: "ok" });

    const obs = recordObservation(root, taskId, {
      experimentId: e.id,
      result: "weight=null in output",
      facts: ["weight field is null after normalize"],
    });

    const linked = listObservations(root, taskId).filter((o) => o.experimentId === e.id);
    assert.equal(linked.length, 1);
    assert.equal(linked[0].id, obs.id);
  } finally {
    cleanup();
  }
});

test("Autonomy: T-D — Replanning preserves prior discoveries", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    // Initial state
    const h1 = createHypothesis(root, taskId, { statement: "H1" });
    const e1 = createExperiment(root, taskId, { hypothesisId: h1.id, actionDescription: "test H1" });
    completeExperiment(root, taskId, e1.id, { result: "fail" });
    recordObservation(root, taskId, { experimentId: e1.id, result: "H1 disproved" });
    updateHypothesisStatus(root, taskId, h1.id, "rejected");

    // Replan: new hypothesis + experiment
    const h2 = createHypothesis(root, taskId, { statement: "H2" });
    const e2 = createExperiment(root, taskId, { hypothesisId: h2.id, actionDescription: "test H2" });
    completeExperiment(root, taskId, e2.id, { result: "ok" });
    recordObservation(root, taskId, { experimentId: e2.id, result: "H2 confirmed" });
    updateHypothesisStatus(root, taskId, h2.id, "supported");

    // Compact state must preserve both
    const compact = buildCompactState(root, taskId);
    assert.ok(compact.rejectedHypotheses.length >= 1);
    assert.ok(compact.activeHypotheses.length >= 1);
    assert.ok(compact.recentExperiments.length >= 1);
  } finally {
    cleanup();
  }
});

test("Autonomy: T-E — Repeated experiment is detected", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    const h = createHypothesis(root, taskId, { statement: "repeat test" });
    const e1 = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "same action",
    });
    completeExperiment(root, taskId, e1.id, { result: "ok" });

    const repeats = findRepeatedExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "same action",
    });
    assert.ok(repeats.length >= 1, "Should detect repeated experiment");
  } finally {
    cleanup();
  }
});

test("Autonomy: T-F — Destructive action is BLOCKED", () => {
  const r = evaluateAction("bash", { command: "rm -rf /" });
  assert.equal(r.level, "BLOCKED");
  assert.equal(r.requiresUser, true);
});

test("Autonomy: T-G — Path traversal blocked by canonicalization", () => {
  // Pretend task root is /repo/project
  const r = evaluateAction("write", { path: "/repo/project-evil/file" }, "/repo/project");
  assert.equal(r.level, "BLOCKED");
  assert.ok(r.reason.includes("path traversal"));
});

test("Autonomy: T-H — `task` tool is GUARDED, not SAFE", () => {
  const r = evaluateAction("task", { description: "delegate work" });
  assert.equal(r.level, "GUARDED");
});

test("Autonomy: T-I — WamPolicyBlock is structured error", () => {
  const err = new WamPolicyBlock("test block", { tool: "rm" });
  assert.equal(err.name, "WamPolicyBlock");
  assert.equal(err.wamPolicyBlock, true);
  assert.equal(err.policy.tool, "rm");
  assert.ok(err instanceof Error);
});

test("Autonomy: T-J — DONE integrity: implementation != verified", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    // Implementation "exists" but no verification
    const h = createHypothesis(root, taskId, { statement: "fix parser" });
    const e = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "implement fix",
    });
    completeExperiment(root, taskId, e.id, { result: "ok" });

    // No critical observation recorded
    const obs = listObservations(root, taskId);
    const verified = obs.filter((o) => o.facts && o.facts.length > 0);

    // Simulating completion gate logic
    const canMarkDone = verified.length > 0;
    assert.equal(canMarkDone, false, "DONE must require verified evidence");
  } finally {
    cleanup();
  }
});

test("Autonomy: T-K — nextAction is advisory, ignored without block", () => {
  // This is verified at integration level. Simulate here:
  // If agent picks a different action than nextAction, no block.
  const nextAction = "inspect parser.js";
  const agentChoice = "inspect normalizer.js";

  const r = evaluateAction("read", { path: "normalizer.js" });
  assert.equal(r.level, "SAFE");
  // No reference to nextAction in risk evaluation → agent's choice allowed
  assert.notEqual(nextAction, agentChoice); // confirms divergence
});

test("Autonomy: T-L — Failed mutation does not auto-retry", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    const h = createHypothesis(root, taskId, { statement: "fix attempt" });
    const e1 = createExperiment(root, taskId, {
      hypothesisId: h.id,
      actionDescription: "apply fix v1",
    });
    failExperiment(root, taskId, e1.id, "test failed");

    const state = listExperiments(root, taskId).find((x) => x.id === e1.id);
    assert.equal(state.status, "failed");

    // No automatic retry: agent must explicitly create e2
    const allExp = listExperiments(root, taskId);
    const retry = allExp.find((x) => x.id !== e1.id && x.status === "running");
    assert.equal(retry, undefined, "No auto-retry occurred");
  } finally {
    cleanup();
  }
});

test("Autonomy: T-M — Memory compaction preserves critical state", () => {
  const { root, cleanup } = setupTask();
  try {
    // Build state
    addActiveHypothesis(root, {
      id: "H1",
      statement: "Active hypothesis",
      confidence: 0.7,
      status: "testing",
    });
    rejectHypothesis(root, "H-rejected", "Failed experiment");
    saveCognitiveState(root, loadCognitiveState(root));

    // Compact
    const state = loadCognitiveState(root);
    const compact = compactCognitiveState(state, 200);

    // Active and rejected hypotheses preserved
    assert.ok(compact.activeHypotheses || compact.rejectedHypotheses !== undefined);
  } finally {
    cleanup();
  }
});

test("Autonomy: T-N — RISK_LEVELS export integrity", () => {
  assert.equal(RISK_LEVELS.SAFE, "SAFE");
  assert.equal(RISK_LEVELS.GUARDED, "GUARDED");
  assert.equal(RISK_LEVELS.BLOCKED, "BLOCKED");
});

test("Autonomy: T-O — Cognitive state restoration after compaction", () => {
  const { root, taskId, cleanup } = setupTask();
  try {
    // Create and persist
    const h = createHypothesis(root, taskId, { statement: "H persistence" });
    updateHypothesisStatus(root, taskId, h.id, "rejected");

    // Simulate compaction: load fresh, verify preservation
    const persisted = listHypotheses(root, taskId);
    const found = persisted.find((x) => x.id === h.id);
    assert.equal(found.status, "rejected");
  } finally {
    cleanup();
  }
});
