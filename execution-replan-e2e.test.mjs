import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteSuccess, noteFailure } from "./execution-engine.js";
import { classifyToolResult, EXECUTION_STATUS, OUTCOME_STATUS } from "./tool-result-classifier.js";
import { listObservations, listHypotheses, listExperiments, HYPOTHESIS_STATUS } from "./cognition-store.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-replan-"));
const taskId = "replan-task";

function setupState() {
  fs.mkdirSync(path.join(TMP, ".wam", "tasks", taskId), { recursive: true });
  fs.writeFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify({
    phase: "IMPLEMENTING",
    contract: { status: "APPROVED", requirements: ["R1"] },
    requirements: [{ id: "R1", title: "obtain Lider products", status: "pending" }],
  }));
}

test("replan: H1 contradicted → REJECTED → H2 SUPPORTED → chain visible", async () => {
  try {
    setupState();

    const h1 = await startExperiment(TMP, taskId, {
      statement: "R1: Playwright + native Chromium works",
      tool: "bash",
      args: { command: "npm install playwright" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });

    const h1ToolResult = classifyToolResult({
      result: "npm install OK",
      unexpected: { error: "BROWSER_EXECUTABLE_MISSING" },
      expected: { expected: { status: "success", exitCode: 0 } },
    });
    assert.equal(h1ToolResult.outcome, OUTCOME_STATUS.NOT_SATISFIED);

    const h1NoteResult = await noteFailure(TMP, taskId, {
      hypothesisId: h1.hypothesis.id,
      experimentId: h1.experiment.id,
      reason: "Chromium executable missing",
      actual: { chromium: "missing" },
      unexpected: { error: "BROWSER_EXECUTABLE_MISSING" },
      provenance: "tool-execution",
    });
    assert.notEqual(h1NoteResult.hypothesisStatus, HYPOTHESIS_STATUS.SUPPORTED);

    const h2 = await startExperiment(TMP, taskId, {
      statement: "R1: install chromium-browser first",
      tool: "bash",
      args: { command: "apt-get install chromium-browser" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });

    const h2ToolResult = classifyToolResult({
      result: "chromium-browser installed",
      actual: { status: "success", exitCode: 0 },
      unexpected: {},
      expected: { expected: { status: "success", exitCode: 0 } },
    });
    assert.equal(h2ToolResult.outcome, OUTCOME_STATUS.SATISFIED);

    const h2NoteResult = await noteSuccess(TMP, taskId, {
      hypothesisId: h2.hypothesis.id,
      experimentId: h2.experiment.id,
      result: "ok",
      actual: { status: "success", exitCode: 0 },
      requirementId: "R1",
    });

    const hypotheses = listHypotheses(TMP, taskId);
    assert.equal(hypotheses.length, 2, "both hypotheses preserved (append-only)");

    const h1After = hypotheses.find(h => h.id === h1.hypothesis.id);
    assert.ok(!["SUPPORTED"].includes(h1After.status), `H1 should not be SUPPORTED (got ${h1After.status})`);

    const h2After = hypotheses.find(h => h.id === h2.hypothesis.id);
    assert.equal(h2After.status, HYPOTHESIS_STATUS.SUPPORTED);

    const exps = listExperiments(TMP, taskId);
    assert.equal(exps.length, 2);
    assert.notEqual(exps[0].hypothesisId, exps[1].hypothesisId);

    const obs = listObservations(TMP, taskId);
    assert.equal(obs.length, 2);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("replan: traceability R1 → H1 → E1 → O1 → H2 → E2 → O2 chain", async () => {
  try {
    setupState();

    const hypothesisIds = [];
    const experimentIds = [];

    for (let cycle = 0; cycle < 2; cycle++) {
      const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
        statement: `R1: attempt ${cycle + 1}`,
        tool: "bash",
        args: { command: `attempt ${cycle + 1}` },
        expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
      });
      hypothesisIds.push(hypothesis.id);
      experimentIds.push(experiment.id);

      if (cycle === 0) {
        await noteFailure(TMP, taskId, {
          hypothesisId: hypothesis.id,
          experimentId: experiment.id,
          reason: "first attempt failed",
          actual: { fail: true },
          unexpected: { error: "BROWSER_NOT_FOUND" },
        });
      } else {
        await noteSuccess(TMP, taskId, {
          hypothesisId: hypothesis.id,
          experimentId: experiment.id,
          result: "success",
          actual: { status: "success", exitCode: 0 },
          requirementId: "R1",
        });
      }
    }

    const obs = listObservations(TMP, taskId);
    assert.equal(obs.length, 2, "2 observations across replan");

    const exps = listExperiments(TMP, taskId);
    assert.equal(exps.length, 2);
    assert.equal(exps[0].hypothesisId, hypothesisIds[0]);
    assert.equal(exps[1].hypothesisId, hypothesisIds[1]);
    assert.notEqual(exps[0].hypothesisId, exps[1].hypothesisId, "different hypotheses");

    for (let i = 0; i < 2; i++) {
      const expObs = obs.filter(o => o.experimentId === experimentIds[i]);
      assert.equal(expObs.length, 1, `experiment ${i} has exactly 1 observation`);
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
