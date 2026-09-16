import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startExperiment, noteSuccess, noteFailure } from "../execution-engine.js";
import { getTaskState } from "../engine.js";
import { listHypotheses } from "../cognition-store.js";

test("E2E: Hipótesis incorrecta rechazada → H2 nueva generada", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-hypo-fail-"));
  const taskId = "hypo-fail-task";
  const taskDir = path.join(TMP, ".wam", "tasks", taskId);
  fs.mkdirSync(taskDir, { recursive: true });

  try {
    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Usar Playwright nativo",
      tool: "bash",
      args: { command: "playwright test" },
      expectedObservation: { status: "passed" }
    });

    // Observación contradice la hipótesis (browser missing)
    await noteFailure(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      reason: "Chromium no está",
      actual: { status: "failed", chromium: "missing" },
      unexpected: { error: "binary not found" },
      provenance: "system-observation"
    });

    // Verificar que la hipótesis quedó rechazada en el store
    const hyps = listHypotheses(TMP, taskId);
    const h1 = hyps.find(h => h.id === hypothesis.id);
    assert.ok(h1.status === "REJECTED" || h1.status === "ARCHIVED", "H1 debe estar rechazada/archivada");

    // Crear H2
    const { hypothesis: h2 } = await startExperiment(TMP, taskId, {
      statement: "Instalar chromium-browser primero",
      tool: "bash",
      args: { command: "apt-get install -y chromium-browser" },
      expectedObservation: { status: "installed" }
    });
    assert.equal(h2.status, "PROPOSED", "H2 debe estar propuesta");
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});
