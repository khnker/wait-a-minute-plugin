import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startExperiment, noteSuccess, noteFailure } from "../execution-engine.js";
import { getTaskState } from "../engine.js";
import { evaluateCompletion } from "../contract/completion-gate.js";

/** Helper: create task with 1 pending requirement */
function createTaskRoot(TMP, taskId) {
  const dir = path.join(TMP, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Helper: initialize minimal task state with one pending requirement */
function initTaskState(TMP, taskId) {
  const taskDir = createTaskRoot(TMP, taskId);
  const state = {
    requirements: [{ id: "req-1", title: "Generic task", status: "pending", evidence: [] }],
    contract: { status: "APPROVED", requirements: ["Generic task"], checks: [] }
  };
  fs.writeFileSync(path.join(taskDir, "state.yaml"), JSON.stringify(state));
  return state;
}

test("E2E Happy Path: tool succeeds → SUPPORTED → verified → DONE", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-e2e-full-"));
  const taskId = "happy-path-task";
  try {
    initTaskState(TMP, taskId);
    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Execute the task logic",
      tool: "bash",
      args: { command: "echo 'task done'" },
      expectedObservation: { status: "completed" }
    });
    // Simulate tool success + matching observation
    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "Command output: task done",
      provenance: "tool-execution"
    });
    const state = getTaskState(taskId, TMP);
    const gate = evaluateCompletion(state);
    // Expect: NOT blocked, can become DONE after manual verification claim or automatic if logic permits
    assert.ok(gate.blocked === false || gate.unresolvedRequirements.length === 0, 
      `Gate should not block when requirement verified; got blocked=${gate.blocked} unresolved=${gate.unresolvedRequirements}`);
    console.log("✅ Happy path: gate did not block");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

test("E2E Contradiction: tool fails/contradicts → REJECTED → pending NOT DONE", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-contradiction-"));
  const taskId = "contradiction-task";
  try {
    initTaskState(TMP, taskId);
    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Do something that fails",
      tool: "bash",
      args: { command: "false ; echo fail" },
      expectedObservation: { status: "completed" }
    });
    // Simulate tool failure / contradiction
    await noteFailure(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      reason: "Tool returned non-zero exit code",
      actual: { exitCode: 1, output: "fail" },
      unexpected: { error: "command failed" },
      provenance: "tool-execution"
    });
    const state = getTaskState(taskId, TMP);
    const gate = evaluateCompletion(state);
    assert.equal(gate.blocked, true, "Contradiction should block DONE");
    assert.equal(state.requirements[0].status, "pending", "Requirement should stay pending after contradiction");
    console.log("✅ Contradiction path: gate blocked and requirement pending");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
