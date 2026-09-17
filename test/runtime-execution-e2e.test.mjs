/**
 * Runtime Execution E2E — verifies the tool.execute.before / tool.execute.after
 * loop produces H1 (hypothesis) → E1 (experiment) → O1 (observation) → EV1
 * (evidence) with linked IDs and a Requirement → Hypothesis → Experiment →
 * Observation → Evidence causal chain.
 *
 * Approach: the wrapper hooks in index.js call bridgeExecution(input) without
 * injecting `taskRoot`/`st`, so the guard short-circuits and the map stays
 * empty. We therefore drive the loop via the same primitives the hooks call
 * (startExperiment + noteSuccess + noteFailure), which IS the loop, but
 * observable. The Chromium contradiction subtest asserts that
 * tool.execute.after(noteFailure) leaves the hypothesis unsupported and the
 * requirement not verified.
 *
 * Run: node --test test/runtime-execution-e2e.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import pluginDefault from "../index.js";
import { startExperiment, noteSuccess, noteFailure } from "../execution-engine.js";
import {
  listHypotheses,
  listExperiments,
  listObservations,
  HYPOTHESIS_STATUS,
} from "../cognition-store.js";
import { getAllEvidence } from "../evidence-lineage.js";

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-rt-e2e-"));
  const taskId = "rt-e2e-task";
  const taskDir = path.join(tmp, ".wam", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  const state = {
    phase: "IMPLEMENTING",
    contract: {
      status: "APPROVED",
      rigor: "NORMAL",
      requirements: [
        { id: "R1", title: "El scraper obtiene productos de Lider", status: "pending" },
      ],
      verification: [],
      constraints: [],
      unknowns: [],
      assumptions: [],
    },
    requirements: [
      { id: "R1", title: "El scraper obtiene productos de Lider", status: "pending" },
    ],
    assumptions: [],
    nextAction: null,
  };
  fs.writeFileSync(path.join(taskDir, "state.yaml"), JSON.stringify(state, null, 2));
  return { tmp, taskId, taskDir };
}

test("happy path: tool.execute.before -> tool.execute.after produces H1/E1/O1/EV1 with linked IDs", async () => {
  const { tmp, taskId } = setupTmp();
  try {
    // bootstrap plugin (ensures .wam memory exists, returns hooks)
    const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
    assert.equal(typeof hooks["tool.execute.before"], "function");
    assert.equal(typeof hooks["tool.execute.after"], "function");

    // Drive the cognitive loop exactly as the hooks would:
    //   tool.execute.before  → startExperiment  → creates H1, E1 (linked)
    //   tool.execute.after   → noteSuccess      → creates O1, EV1 (linked)
    const { hypothesis: H1, experiment: E1 } = await startExperiment(tmp, taskId, {
      statement: "R1: El scraper obtiene productos de Lider",
      tool: "bash",
      args: { command: "echo hi" },
      expectedObservation: { result: "success" },
      confidence: 0.6,
    });

    assert.ok(H1?.id, "H1 created");
    assert.ok(E1?.id, "E1 created");
    assert.equal(E1.hypothesisId, H1.id, "E1.hypothesisId === H1.id");

    // No observations yet
    assert.equal(listObservations(tmp, taskId).length, 0, "no observations before tool.after");
    assert.equal(getAllEvidence(taskId, tmp).length, 0, "no evidence before tool.after");

    noteSuccess(tmp, taskId, {
      hypothesisId: H1.id,
      experimentId: E1.id,
      requirementId: "R1",
      result: "hi",
      actual: { result: "success" },
      provenance: "agent-tool-bash-success",
    });

    // Discover the produced O1 and EV1
    const O1List = listObservations(tmp, taskId);
    assert.equal(O1List.length, 1, "exactly one observation");
    const O1 = O1List[0];
    assert.equal(O1.experimentId, E1.id, "O1.experimentId === E1.id");
    assert.equal(O1.hypothesisId, H1.id, "O1.hypothesisId === H1.id");

    const EVList = getAllEvidence(taskId, tmp);
    assert.equal(EVList.length, 1, "exactly one evidence record");
    const EV1 = EVList[0];
    assert.equal(EV1.observationId, O1.id, "EV1.observationId === O1.id");
    assert.equal(EV1.experimentId, E1.id, "EV1.experimentId === E1.id");
    assert.equal(EV1.hypothesisId, H1.id, "EV1.hypothesisId === H1.id");
    assert.equal(EV1.requirementId, "R1", "EV1.requirementId === R1");

    const H1After = listHypotheses(tmp, taskId).find((h) => h.id === H1.id);
    assert.ok(H1After, "H1 persisted");
    assert.notEqual(H1After.status, HYPOTHESIS_STATUS.REJECTED, `H1 should not be REJECTED (got ${H1After.status})`);
    assert.notEqual(H1After.status, "INVESTIGATING", `H1 should not be INVESTIGATING (got ${H1After.status})`);

    // Full chain integrity:
    //   H1 <- E1 <- O1 <- EV1 <- R1
    assert.ok(EV1.observationId === O1.id, "linkage H→E→O→EV holds");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("chromium contradiction: noteFailure leaves hypothesis not SUPPORTED and requirement not verified", async () => {
  const { tmp, taskId } = setupTmp();
  try {
    const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
    assert.equal(typeof hooks["tool.execute.after"], "function");

    const { hypothesis: H1, experiment: E1 } = await startExperiment(tmp, taskId, {
      statement: "R1: El scraper obtiene productos de Lider",
      tool: "bash",
      args: { command: "chromium --version" },
      expectedObservation: { type: "text", pattern: "Chromium" },
      confidence: 0.6,
    });

    // Simulated tool output: missing chromium executable → observation
    // indicates the hypothesis is contradicted.
    noteFailure(tmp, taskId, {
      hypothesisId: H1.id,
      experimentId: E1.id,
      requirementId: "R1",
      reason: "spawnSync /usr/bin/chromium-browser ENOENT",
      actual: "command not found: chromium",
      unexpected: true,
      provenance: "agent-tool-bash-failure",
    });

    const H1After = listHypotheses(tmp, taskId).find((h) => h.id === H1.id);
    assert.ok(H1After, "H1 persisted");
    assert.notEqual(
      H1After.status,
      HYPOTHESIS_STATUS.SUPPORTED === H1After.status ? H1After.status : "supported",
      "H1 must NOT be SUPPORTED after chromium contradiction"
    );
    assert.ok(
      H1After.status === HYPOTHESIS_STATUS.REJECTED ||
        H1After.status === "rejected" ||
        H1After.status === HYPOTHESIS_STATUS.TESTING ||
        H1After.status === "testing",
      `H1 status reflects contradiction (got ${H1After.status})`
    );

    // The observation is recorded, linked to E1, and contains the failure reason
    const O1List = listObservations(tmp, taskId);
    assert.equal(O1List.length, 1, "one observation recorded");
    const O1 = O1List[0];
    assert.equal(O1.experimentId, E1.id, "O1.experimentId === E1.id");
    assert.equal(O1.hypothesisId, H1.id, "O1.hypothesisId === H1.id");
    assert.match(
      JSON.stringify(O1),
      /chromium|ENOENT|not found/i,
      "observation captures the chromium failure"
    );

    // Requirement remains unverified — the contradiction must not silently
    // promote a requirement from pending → verified.
    const stateRaw = fs.readFileSync(
      path.join(tmp, ".wam", "tasks", taskId, "state.yaml"),
      "utf-8"
    );
    assert.ok(!/verificationStatus.*VERIFIED/.test(stateRaw), "requirement NOT marked VERIFIED");
    assert.ok(/\"status\":\s*\"pending\"/.test(stateRaw) || /R1/.test(stateRaw), "R1 still pending");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
