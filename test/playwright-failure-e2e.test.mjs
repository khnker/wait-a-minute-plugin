import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startExperiment, noteSuccess, noteFailure } from "../execution-engine.js";
import { getTaskState } from "../engine.js";
import { evaluateCompletion } from "../contract/completion-gate.js";

test("E2E: Fallo real en Playwright (Chromium missing) bloquea DONE", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-playwright-fail-"));
  const taskId = "playwright-fail-task";
  const taskDir = path.join(TMP, ".wam", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  
  // Setup: Mock task state
  const initialState = {
    requirements: [{ id: "req-1", title: "Playwright funciona", status: "pending", evidence: [] }],
    contract: { status: "APPROVED", requirements: ["Playwright funciona"], checks: [] }
  };
  fs.writeFileSync(path.join(taskDir, "state.yaml"), JSON.stringify(initialState));

  try {
    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Instalar Playwright",
      tool: "bash",
      args: { command: "npm install playwright" },
      expectedObservation: { status: "installed" }
    });

    // Simulated failure: Chromium missing
    await noteFailure(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      reason: "Chromium executable missing",
      actual: { status: "installed", chromium: "missing" },
      unexpected: { error: "binary not found" },
      provenance: "system-observation"
    });

    // Check gate
    const state = getTaskState(taskId, TMP);
    const gate = evaluateCompletion(state);
    
    assert.equal(gate.blocked, true, "Gate debe bloquear el DONE");
    assert.equal(state.requirements[0].status, "pending", "Requisito debe seguir pending");
    
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
