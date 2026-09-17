import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { startExperiment, noteSuccess } from "./execution-engine.js";
import { listObservations, listHypotheses, listExperiments } from "./cognition-store.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-concurrency-"));
const taskId = "concurrency-task";

function setupState(reqs = 4) {
  const requirements = Array.from({ length: reqs }, (_, i) => ({
    id: `R${i + 1}`,
    title: `req${i + 1}`,
    status: "pending",
  }));
  fs.mkdirSync(path.join(TMP, ".wam", "tasks", taskId), { recursive: true });
  fs.writeFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), JSON.stringify({
    phase: "IMPLEMENTING",
    contract: { status: "APPROVED" },
    requirements,
  }));
}

test("concurrency: parallel tool calls do not mix H1↔E2", async () => {
  try {
    setupState(2);
    const reqs = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    ).requirements;

    const r1 = await startExperiment(TMP, taskId, {
      statement: "R1: site A",
      tool: "bash",
      args: { command: "scraping A" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });
    const r2 = await startExperiment(TMP, taskId, {
      statement: "R2: site B",
      tool: "bash",
      args: { command: "scraping B" },
      expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
    });

    const { hypothesis: h1a, experiment: e1a } = r1;
    const { hypothesis: h2a, experiment: e2a } = r2;

    assert.notEqual(h1a.id, h2a.id);
    assert.notEqual(e1a.id, e2a.id);

    const [obsA, obsB] = await Promise.all([
      noteSuccess(TMP, taskId, {
        hypothesisId: h1a.id,
        experimentId: e1a.id,
        result: "A done",
        actual: { status: "success", exitCode: 0 },
        requirementId: "R1",
      }),
      noteSuccess(TMP, taskId, {
        hypothesisId: h2a.id,
        experimentId: e2a.id,
        result: "B done",
        actual: { status: "success", exitCode: 0 },
        requirementId: "R2",
      }),
    ]);

    const observations = listObservations(TMP, taskId);
    assert.equal(observations.length, 2, "2 observations from parallel calls");

    const obsForR1 = observations.filter(o => o.experimentId === e1a.id);
    const obsForR2 = observations.filter(o => o.experimentId === e2a.id);
    assert.equal(obsForR1.length, 1);
    assert.equal(obsForR2.length, 1);
    assert.equal(obsForR1[0].hypothesisId, h1a.id, "R1's observation belongs to H1");
    assert.equal(obsForR2[0].hypothesisId, h2a.id, "R2's observation belongs to H2");

    const exps = listExperiments(TMP, taskId);
    assert.equal(exps.length, 2);
    const exp1 = exps.find(e => e.id === e1a.id);
    const exp2 = exps.find(e => e.id === e2a.id);
    assert.equal(exp1.hypothesisId, h1a.id);
    assert.equal(exp2.hypothesisId, h2a.id);

    const hyps = listHypotheses(TMP, taskId);
    assert.equal(hyps.length, 2);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("concurrency: callID keyed correlation prevents cross-contamination", async () => {
  try {
    setupState(4);
    const reqs = JSON.parse(
      fs.readFileSync(path.join(TMP, ".wam", "tasks", taskId, "state.yaml"), "utf-8")
    ).requirements;

    const results = await Promise.all([0, 1, 2, 3].map(i => (async () => {
      const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
        statement: `${reqs[i].id}: call ${i}`,
        tool: "bash",
        args: { command: `cmd${i}` },
        expectedObservation: { outcomeType: "command_execution", expected: { status: "success", exitCode: 0 } },
      });
      const result = await noteSuccess(TMP, taskId, {
        hypothesisId: hypothesis.id,
        experimentId: experiment.id,
        result: `result${i}`,
        actual: { status: "success", exitCode: 0 },
        requirementId: reqs[i].id,
      });
      return { i, hypothesis, experiment, result };
    })()));

    assert.equal(results.length, 4);

    const observations = listObservations(TMP, taskId);
    assert.equal(observations.length, 4, "4 observations, no duplicates from parallel calls");

    for (const r of results) {
      const obs = observations.filter(o => o.experimentId === r.experiment.id);
      assert.equal(obs.length, 1, `result ${r.i} has 1 observation`);
      assert.equal(obs[0].result, "SUPPORTED");
      assert.equal(obs[0].hypothesisId, r.hypothesis.id, `result ${r.i} observation → ${r.i} hypothesis`);
    }

    const exps = listExperiments(TMP, taskId);
    assert.equal(exps.length, 4);
    const expByH = {};
    for (const e of exps) expByH[e.hypothesisId] = e;
    for (const r of results) {
      assert.ok(expByH[r.hypothesis.id], `experiment for ${r.i} exists`);
    }
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
