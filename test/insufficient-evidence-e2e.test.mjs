import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startExperiment, noteSuccess } from "../execution-engine.js";
import { evaluateCompletion } from "../contract/completion-gate.js";
import { getTaskState } from "../engine.js";

test("E2E: Evidencia insuficiente bloquea DONE en VERIFYING", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-evidence-fail-"));
  const taskId = "evidence-fail-task";
  const taskDir = path.join(TMP, ".wam", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  
  const initialState = {
    requirements: [{ id: "req-1", title: "Test genérico", status: "done", evidence: [] }],
    contract: { status: "APPROVED", requirements: ["Test genérico"], checks: [] }
  };
  fs.writeFileSync(path.join(taskDir, "state.yaml"), JSON.stringify(initialState));

  try {
    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Generar reporte",
      tool: "write",
      args: { path: "report.md", content: "# OK" },
      expectedObservation: { status: "written" }
    });
    // Note: Sin evidenceID válido, el requisito queda en "done" pero no "verified"
    await noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "report.md written",
      actual: { path: "report.md" },
      unexpected: {},
      provenance: "agent-tool-write"
    });
    // El completion gate debe exigir "verified"
    const state = getTaskState(taskId, TMP);
    const gate = evaluateCompletion(state);
    assert.equal(gate.blocked, true, "Gate debe bloquear si no hay verified");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
