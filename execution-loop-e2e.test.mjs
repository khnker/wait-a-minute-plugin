import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteSuccess, noteFailure } from "./execution-engine.js";
import { classifyToolResult, EXECUTION_STATUS, OUTCOME_STATUS } from "./tool-result-classifier.js";
import { classifyExecutionIntent, EXECUTION_INTENT } from "./execution-intent.js";
import { linkEvidenceToRequirement, getAllEvidence } from "./evidence-lineage.js";
import { listObservations, listHypotheses, HYPOTHESIS_STATUS } from "./cognition-store.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-loop-"));
const taskId = "loop-task";

function setupState({ requirements, contract = "APPROVED", phase = "IMPLEMENTING" } = {}) {
  fs.mkdirSync(path.join(TMP, ".wam", "tasks", taskId), { recursive: true });
  fs.writeFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify({
    phase,
    contract: { status: contract, requirements: requirements.map(r => r.id) },
    requirements,
  }));
}

test("E2E happy-path: action success → outcome SATISFIED → requirement verified", async () => {
  try {
    setupState({ requirements: [{ id: "R1", title: "r1", status: "pending" }] });

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "R1: r1",
      tool: "bash",
      args: { command: "npm run scraper" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
      confidence: 0.8,
    });

    const intent = classifyExecutionIntent("bash", { command: "npm run scraper" }, "R1: r1");
    assert.equal(intent, EXECUTION_INTENT.DIRECT_REQUIREMENT_ACTION);

    const toolResult = classifyToolResult({
      result: "scraped 5 items",
      actual: { status: "success", exitCode: 0 },
      expected: { expected: { status: "success", exitCode: 0 } },
    });
    assert.equal(toolResult.execution, EXECUTION_STATUS.SUCCEEDED);
    assert.equal(toolResult.outcome, OUTCOME_STATUS.SATISFIED);

    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: toolResult.execution === "SUCCEEDED" ? "out" : null,
      actual: { status: "success", exitCode: 0 },
      requirementId: "R1",
    });

    const hyp = listHypotheses(TMP, taskId).find(h => h.id === hypothesis.id);
    assert.equal(hyp.status, HYPOTHESIS_STATUS.SUPPORTED);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("E2E false-success: tool OK but outcome NOT_SATISFIED → REJECTED, no done", async () => {
  try {
    setupState({ requirements: [{ id: "R1", title: "r1", status: "pending" }] });

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "R1: r1",
      tool: "bash",
      args: { command: "npm install playwright" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });

    const toolResult = classifyToolResult({
      result: "npm install OK",
      actual: { chromium: "missing" },
      unexpected: { error: "BROWSER_EXECUTABLE_MISSING" },
      expected: { expected: { status: "success", exitCode: 0 } },
    });
    assert.equal(toolResult.execution, EXECUTION_STATUS.SUCCEEDED);
    assert.equal(toolResult.outcome, OUTCOME_STATUS.NOT_SATISFIED);

    const noteResult = await noteFailure(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      reason: "Chromium runtime missing",
      actual: { chromium: "missing" },
      unexpected: { error: "BROWSER_EXECUTABLE_MISSING" },
      provenance: "tool-execution",
    });

    assert.notEqual(noteResult.hypothesisStatus, HYPOTHESIS_STATUS.SUPPORTED);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("E2E INCONCLUSIVE: tool returns OK but expected field missing", async () => {
  try {
    setupState({ requirements: [{ id: "R1", title: "r1", status: "pending" }] });

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "R1: r1",
      tool: "read",
      args: { path: "/foo.js" },
      expectedObservation: null,
    });

    const toolResult = classifyToolResult({ result: "file contents", expected: null });
    assert.equal(toolResult.execution, EXECUTION_STATUS.SUCCEEDED);
    assert.equal(toolResult.outcome, OUTCOME_STATUS.UNKNOWN);

    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "file contents",
      actual: "file contents",
      requirementId: "R1",
    });

    const hyp = listHypotheses(TMP, taskId).find(h => h.id === hypothesis.id);
    assert.equal(hyp.status, HYPOTHESIS_STATUS.TESTING);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
