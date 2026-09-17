import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteSuccess } from "./execution-engine.js";
import { listObservations, listHypotheses, listExperiments, HYPOTHESIS_STATUS } from "./cognition-store.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-resume-"));
const taskId = "resume-task";

function setupState() {
  fs.mkdirSync(path.join(TMP, ".wam", "tasks", taskId), { recursive: true });
  fs.writeFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify({
    phase: "IMPLEMENTING",
    contract: { status: "APPROVED", requirements: ["R1"] },
    requirements: [{ id: "R1", title: "obtain Lider products", status: "pending" }],
  }));
}

test("resume: H1/E1/O1 persist across simulated kill", async () => {
  try {
    setupState();

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "R1: explore scraper API",
      tool: "bash",
      args: { command: "grep -r scraper /src" },
      expectedObservation: null,
    });

    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "found scraper.ts",
      actual: "found scraper.ts",
      requirementId: "R1",
    });

    const original = {
      hypotheses: listHypotheses(TMP, taskId),
      experiments: listExperiments(TMP, taskId),
      observations: listObservations(TMP, taskId),
    };
    assert.equal(original.hypotheses.length, 1);
    assert.equal(original.experiments.length, 1);
    assert.equal(original.observations.length, 1);

    const restored = {
      hypotheses: listHypotheses(TMP, taskId),
      experiments: listExperiments(TMP, taskId),
      observations: listObservations(TMP, taskId),
    };
    assert.equal(restored.hypotheses[0].id, original.hypotheses[0].id);
    assert.equal(restored.experiments[0].id, original.experiments[0].id);
    assert.equal(restored.observations[0].id, original.observations[0].id);
    assert.equal(restored.hypotheses[0].status, HYPOTHESIS_STATUS.TESTING);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("resume: hypothesis can be retrieved after process restart (filesystem persistence)", async () => {
  try {
    setupState();

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "R1: step1",
      tool: "bash",
      args: { command: "ls" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });

    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "ls ok",
      actual: { status: "success", exitCode: 0 },
    });

    const dir = path.join(TMP, ".wam", "tasks", taskId, "cognition");
    assert.ok(fs.existsSync(path.join(dir, "hypotheses.jsonl")), "hypotheses.jsonl exists");
    assert.ok(fs.existsSync(path.join(dir, "experiments.jsonl")), "experiments.jsonl exists");
    assert.ok(fs.existsSync(path.join(dir, "observations.jsonl")), "observations.jsonl exists");

    const persisted = fs.readFileSync(path.join(dir, "hypotheses.jsonl"), "utf-8");
    assert.ok(persisted.includes(hypothesis.id), "hypothesis ID persisted to JSONL");

    const obs = listObservations(TMP, taskId);
    assert.equal(obs.length, 1);
    assert.equal(obs[0].experimentId, experiment.id, "observation linked to experiment");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
