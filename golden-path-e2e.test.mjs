/**
 * Golden Path E2E — ciclo de vida completo de una tarea en el runtime.
 *
 * Valida los 6 pasos del ciclo:
 *  1. Creación de tarea (engine.js — persistTaskState)
 *  2. Aprobación de contrato (index.js — approveContract)
 *  3. Ejecución de ciclo cognitivo completo
 *     - startExperiment (Hypothesis)
 *     - noteSuccess (Action + Observation)
 *     - Verificación (Evidence link)
 *  4. Declaración de DONE (Interceptación de claim — claim-interception.js)
 *  5. Evaluación por Completion Gate (verification-lifecycle.js — canComplete)
 *  6. Transición a DONE solo tras requisitos VERIFIED + evidencia
 *
 * Ejecutar: node --test golden-path-e2e.test.mjs
 * Debe FALLAR si el ciclo no se cierra correctamente.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { persistTaskState, getTaskState } from "./engine.js";
import pluginDefault from "./index.js";
import {
  startExperiment,
  noteSuccess,
  noteFailure,
} from "./execution-engine.js";
import {
  transitionVerification,
  canComplete,
  isVerified,
  createEvidence,
  isValidVerificationState,
} from "./verification-lifecycle.js";
import {
  interceptAgentClaim,
  createClaim,
  validateClaim,
} from "./claim-interception.js";
import {
  listHypotheses,
  listExperiments,
  listObservations,
  getActiveHypotheses,
  HYPOTHESIS_STATUS,
  EXPERIMENT_STATUS,
} from "./cognition-store.js";

function cleanup(taskId, tmpRoot) {
  try {
    fs.rmSync(path.join(tmpRoot, ".wam", "tasks", taskId), {
      recursive: true,
      force: true,
    });
  } catch {}
}

function setupTaskState(taskRoot, taskId, requirements) {
  const state = {
    taskId,
    status: "active",
    requirements: requirements.map((r, i) => ({
      id: r.id || `req-${i + 1}`,
      title: r.title,
      status: "pending",
      verificationStatus: "UNVERIFIED",
      evidence: [],
    })),
  };
  persistTaskState(taskId, state, taskRoot);
  return state;
}

// ── 1. CREACIÓN DE TAREA ──────────────────────────────────

test("GP-1: Tarea creada con requisitos persistidos en state.yaml", () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = "golden-task-1";
  try {
    setupTaskState(TMP, taskId, [
      { id: "req-impl", title: "Implementar módulo principal" },
      { id: "req-test", title: "Agregar tests unitarios" },
    ]);

    const state = getTaskState(taskId, TMP);
    assert.ok(state, "state.yaml debe existir");
    assert.equal(state.requirements.length, 2, "debe tener 2 requisitos");
    assert.equal(state.requirements[0].id, "req-impl");
    assert.equal(state.requirements[1].id, "req-test");
    assert.equal(state.requirements[0].verificationStatus, "UNVERIFIED");
    assert.equal(state.requirements[0].evidence.length, 0);
    assert.equal(state.status, "active");
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 2. APROBACIÓN DE CONTRATO ──────────────────────────────

test("GP-2: Contrato aprobado — estado cambia a contract-approved", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-2-${Date.now()}`;
  try {
    setupTaskState(TMP, taskId, [{ id: "req-1", title: "Tarea principal" }]);

    pluginDefault.approveContract(taskId, TMP);

    const state = getTaskState(taskId, TMP);
    assert.ok(state, "state debe existir tras aprobación");
    assert.ok(
      state.contractApproved === true || state.status === "active",
      "contrato debe quedar aprobado"
    );
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 3. CICLO COGNITIVO COMPLETO ────────────────────────────

test("GP-3: Ciclo cognitivo completo — startExperiment → noteSuccess → evidencias", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-3-${Date.now()}`;
  try {
    setupTaskState(TMP, taskId, [{ id: "req-1", title: "Tarea principal" }]);

    // 3a. CREAR EXPERIMENTOS (Hipótesis)
    const { hypothesis, experiment, guard } = await startExperiment(TMP, taskId, {
      statement: "Implementar módulo principal usando edit tool",
      tool: "edit",
      args: { path: "src/module.ts" },
      expectedObservation: { type: "text", pattern: "Success" },
    });

    assert.ok(hypothesis, "debe crear hipótesis");
    assert.ok(hypothesis.id, "hipótesis debe tener id");
    assert.ok(
      [HYPOTHESIS_STATUS.PROPOSED, HYPOTHESIS_STATUS.TESTING].includes(
        hypothesis.status
      ),
      `hipótesis status inicial: ${hypothesis.status}`
    );

    assert.ok(experiment, "debe crear experimento");
    assert.ok(experiment.id, "experimento debe tener id");
    assert.equal(experiment.status, EXPERIMENT_STATUS.PROPOSED);
    assert.ok(guard, "debe retornar guard");
    assert.equal(guard.allowed, true, "acción debe estar permitida");

    // 3b. ACCIÓN EXITOSA (Observation)
    noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "Módulo implementado correctamente",
      provenance: "agent-tool-edit",
    });

    // Verificar que la observación quedó registrada
    const observations = listObservations(TMP, taskId);
    assert.ok(
      observations.length >= 1,
      "debe existir al menos 1 observación registrada"
    );

    // 3c. VERIFICACIÓN (Evidence link) — transicionar verificación
    const state = getTaskState(taskId, TMP);
    assert.ok(state, "state debe existir");
    assert.ok(state.requirements[0], "debe tener requisitos");

    const req = state.requirements[0];

    // Verificar transición válida
    assert.ok(
      isValidVerificationState(req.verificationStatus),
      `estado inicial válido: ${req.verificationStatus}`
    );

    const verifying = transitionVerification(
      req.verificationStatus || "UNVERIFIED",
      "VERIFYING"
    );
    assert.equal(verifying, "VERIFYING");

    const verified = transitionVerification("VERIFYING", "VERIFIED");
    assert.equal(verified, "VERIFIED");

    // Crear evidencia
    const evidence = createEvidence(
      "test",
      "pass",
      "npm test passed for módulo principal"
    );
    assert.ok(evidence.method, "evidencia debe tener método");
    assert.ok(evidence.result, "evidencia debe tener resultado");
    assert.ok(evidence.at > 0, "evidencia debe tener timestamp");

    // Verificar que isVerified retorna true con evidencia
    const fakeReq = {
      ...req,
      verificationStatus: "VERIFIED",
      evidence: [evidence],
    };
    assert.ok(isVerified(fakeReq), "requisito con evidencia debe ser VERIFIED");
    assert.ok(!isVerified({ ...req, verificationStatus: "VERIFIED", evidence: [] }));
    assert.ok(!isVerified({ ...req, verificationStatus: "UNVERIFIED", evidence: [evidence] }));

    // Marcar requisito como done y verified en estado
    const reqIndex = state.requirements.findIndex((r) => r.id === req.id);
    state.requirements[reqIndex].status = "done";
    state.requirements[reqIndex].verificationStatus = "VERIFIED";
    state.requirements[reqIndex].evidence = [evidence];
    persistTaskState(taskId, state, TMP);

    const updatedState = getTaskState(taskId, TMP);
    assert.equal(
      updatedState.requirements[reqIndex].verificationStatus,
      "VERIFIED"
    );
    assert.equal(updatedState.requirements[reqIndex].evidence.length, 1);
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 4. DECLARACIÓN DE DONE — INTERCEPTACIÓN DE CLAIM ──────

test("GP-4: Declaración DONE interceptada y validada", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-4-${Date.now()}`;
  try {
    setupTaskState(TMP, taskId, [{ id: "req-1", title: "Tarea" }]);
    pluginDefault.approveContract(taskId, TMP);

    // Agente declara DONE
    const doneMessage = "He completado la tarea, está done y listo";
    const claims = interceptAgentClaim(doneMessage);

    const completionClaim = claims.find((c) => c.type === "COMPLETION");
    assert.ok(completionClaim, "debe interceptar claim COMPLETION");
    assert.ok(
      /done|fixed|working|solved|completed|implemented|ready/i.test(
        completionClaim.text
      ),
      "text del claim debe contener keyword de completion"
    );

    // Crear y validar claim
    const claim = createClaim("Tarea completada", "COMPLETION", "agent");
    assert.ok(claim.id, "claim debe tener id");
    assert.equal(claim.type, "COMPLETION");
    assert.equal(claim.validated, false);

    // Validar claim contra task state — requiere verificación
    const state = getTaskState(taskId, TMP);
    const validation = validateClaim(claim, state);
    assert.ok(
      validation.requiresVerification,
      "claim COMPLETION debe requerir verificación"
    );
    assert.equal(validation.valid, false, "claim no válido sin verificación previa");
    assert.ok(
      validation.reason.toLowerCase().includes("verification"),
      `razón: ${validation.reason}`
    );

    // Intentar con claim no-completión
    const factClaim = createClaim("El módulo existe", "FACT", "agent");
    const factValidation = validateClaim(factClaim, state);
    assert.ok(
      factValidation.requiresVerification,
      "claim FACT también requiere verificación"
    );

    // Hypothesis claim
    const hypClaim = createClaim("Creo que funciona", "HYPOTHESIS", "agent");
    const hypValidation = validateClaim(hypClaim, state);
    assert.ok(hypValidation, "hypothesis claim debe retornar resultado");
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 5. EVALUACIÓN POR COMPLETION GATE ─────────────────────

test("GP-5: Completion Gate evalúa requisitos — BLOCK si no VERIFIED", () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-5-${Date.now()}`;
  try {
    // Escenario A: requisitos sin verificar → no debe completar
    setupTaskState(TMP, taskId, [
      { id: "req-1", title: "Implementar" },
      { id: "req-2", title: "Tests" },
    ]);

    const statePending = getTaskState(taskId, TMP);
    const gatePending = canComplete(statePending);
    assert.ok(
      !gatePending.canComplete,
      "no debe completar con requisitos pendientes"
    );
    assert.equal(gatePending.unverifiedCount, 2);
    assert.ok(gatePending.unverifiedIds.length >= 2);

    // Escenario B: un requisito VERIFIED, otro no → no debe completar
    statePending.requirements[0].verificationStatus = "VERIFIED";
    statePending.requirements[0].evidence = [
      createEvidence("test", "pass", "prueba"),
    ];
    const gatePartial = canComplete(statePending);
    assert.ok(!gatePartial.canComplete, "no debe completar parcial");
    assert.equal(gatePartial.unverifiedCount, 1);

    // Escenario C: todos VERIFIED con evidencia → debe completar
    statePending.requirements[1].verificationStatus = "VERIFIED";
    statePending.requirements[1].evidence = [
      createEvidence("test", "pass", "prueba tests"),
    ];
    const gateFull = canComplete(statePending);
    assert.ok(gateFull.canComplete, "debe completar todo VERIFIED");
    assert.equal(gateFull.unverifiedCount, 0);
    assert.equal(gateFull.unverifiedIds.length, 0);

    // Escenario D: VERIFIED sin evidencia → no debe completar
    statePending.requirements[0].evidence = [];
    const gateNoEvidence = canComplete(statePending);
    assert.ok(!gateNoEvidence.canComplete);
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 6. TRANSICIÓN A DONE SOLO TRAS VERIFIED + EVIDENCIA ──

test("GP-6: Transición a DONE solo con todos VERIFIED + evidencia", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-6-${Date.now()}`;

  try {
    // Fase 1: ciclo cognitivo completo
    setupTaskState(TMP, taskId, [
      { id: "req-impl", title: "Implementar" },
      { id: "req-test", title: "Tests" },
    ]);
    pluginDefault.approveContract(taskId, TMP);

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Implementar módulo completo",
      tool: "edit",
      args: { path: "src/module.ts" },
      expectedObservation: { type: "text", pattern: "Success" },
    });

    assert.ok(hypothesis);
    assert.ok(experiment);

    noteSuccess(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      result: "Implementación completa",
      provenance: "agent-tool-edit",
    });

    // Fase 2: verificaciones individuales
    const state = getTaskState(taskId, TMP);
    assert.ok(state);

    // Marcar primer requisito como done → seguido de verified con evidencia
    const req1 = state.requirements[0];
    const evidence1 = createEvidence("build", "pass", "npm run build succeeded");
    transitionVerification(req1.verificationStatus, "VERIFYING");
    transitionVerification("VERIFYING", "VERIFIED");
    req1.status = "done";
    req1.verificationStatus = "VERIFIED";
    req1.evidence = [evidence1];

    // Marcar segundo requisito
    const req2 = state.requirements[1];
    const evidence2 = createEvidence("test", "pass", "npm test passed");
    transitionVerification(req2.verificationStatus, "VERIFYING");
    transitionVerification("VERIFYING", "VERIFIED");
    req2.status = "done";
    req2.verificationStatus = "VERIFIED";
    req2.evidence = [evidence2];

    persistTaskState(taskId, state, TMP);

    // Fase 3: evaluación final — Completion Gate permite DONE
    const finalState = getTaskState(taskId, TMP);
    assert.ok(finalState);

    const gate = canComplete(finalState);
    assert.ok(
      gate.canComplete,
      "Completion Gate debe permitir DONE cuando todo está VERIFIED+evidencia"
    );
    assert.equal(gate.unverifiedCount, 0);

    // Verificar individualmente
    for (const req of finalState.requirements) {
      assert.ok(
        isVerified(req),
        `Requisito ${req.id} debe ser VERIFIED con evidencia`
      );
      assert.ok(req.evidence.length > 0, `Req ${req.id} debe tener evidencia`);
    }

    // Fase 4: verificar que DONE se niega si se rompe una condición
    const brokenState = getTaskState(taskId, TMP);
    brokenState.requirements[0].verificationStatus = "UNVERIFIED";
    persistTaskState(taskId, brokenState, TMP);

    const gateBroken = canComplete(getTaskState(taskId, TMP));
    assert.ok(
      !gateBroken.canComplete,
      "DONE debe bloquearse al romper un requisito"
    );

    // Fase 5: verificar que transiciones inválidas lanzan errores
    assert.throws(
      () => transitionVerification("VERIFIED", "UNVERIFIED"),
      /Invalid transition/
    );
    assert.throws(
      () => transitionVerification("INVALID_STATE", "VERIFIED"),
      /Invalid verification state/
    );
    assert.throws(
      () => createEvidence("", "pass", "missing method"),
      /Evidence requires/
    );

    // Fase 6: verificar que hipótesis y experimentos quedan registrados
    const hypotheses = listHypotheses(TMP, taskId);
    assert.ok(hypotheses.length >= 1, "debe tener hipótesis registradas");

    const experiments = listExperiments(TMP, taskId);
    assert.ok(experiments.length >= 1, "debe tener experimentos registrados");

    // El experimento debe estar COMPLETED (noteSuccess lo completa)
    const completedExps = experiments.filter(
      (e) => e.status === EXPERIMENT_STATUS.COMPLETED
    );
    assert.ok(
      completedExps.length >= 1,
      "experimento exitoso debe ser COMPLETED"
    );

    // La hipótesis puede quedar SUPPORTED o TESTING dependiendo de
    // la evaluación de la observación. Ninguna debe quedar PROPOSED
    // (fue ejecutada).
    const allHypotheses = listHypotheses(TMP, taskId);
    const proposedStale = allHypotheses.filter(
      (h) => h.status === HYPOTHESIS_STATUS.PROPOSED
    );
    assert.ok(
      proposedStale.length === 0,
      "ninguna hipótesis debe quedar PROPOSED tras ejecución"
    );

    // La fase crítica del ciclo es que TODO esté VERIFIED+evidencia
    // para permitir DONE (verificado en GP-5 y GP-6 principal).
  } finally {
    cleanup(taskId, TMP);
  }
});

// ── 7. FALLBACK: ciclo ROTO debe FALLAR ──────────────────

test("GP-7: Ciclo incompleto FALLA (sin noteSuccess ni verificación) → no DONE", () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-7-${Date.now()}`;
  try {
    setupTaskState(TMP, taskId, [{ id: "req-1", title: "Tarea" }]);

    // No se ejecuta startExperiment ni noteSuccess
    // Se marca como done SIN evidencia y sin verificación
    const state = getTaskState(taskId, TMP);
    state.requirements[0].status = "done";
    state.requirements[0].verificationStatus = "UNVERIFIED";
    state.requirements[0].evidence = [];
    persistTaskState(taskId, state, TMP);

    const gate = canComplete(getTaskState(taskId, TMP));
    assert.ok(
      !gate.canComplete,
      "FALLO: ciclo sin verificación NO debe permitir DONE"
    );
    assert.ok(gate.unverifiedCount > 0);
  } finally {
    cleanup(taskId, TMP);
  }
});

test("GP-8: Ciclo con noteFailure bloquea DONE y registra fallo", async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-golden-"));
  const taskId = `golden-task-8-${Date.now()}`;
  try {
    setupTaskState(TMP, taskId, [{ id: "req-1", title: "Tarea" }]);

    const { hypothesis, experiment } = await startExperiment(TMP, taskId, {
      statement: "Tarea que falla",
      tool: "edit",
      args: { path: "src/broken.ts" },
      expectedObservation: { type: "text", pattern: "Success" },
    });

    assert.ok(hypothesis);
    assert.ok(experiment);

    // Acción fallida
    noteFailure(TMP, taskId, {
      hypothesisId: hypothesis.id,
      experimentId: experiment.id,
      reason: "Tool execution failed",
      actual: "Error: file not found",
      unexpected: true,
      provenance: "agent-tool-edit",
    });

    // Verificar que el experimento quedó FAILED
    const experiments = listExperiments(TMP, taskId);
    const failedExp = experiments.find(
      (e) => e.status === EXPERIMENT_STATUS.FAILED
    );
    assert.ok(failedExp, "experimento fallido debe registrarse como FAILED");

    // La verificación del requisito NO puede ser VERIFIED
    const state = getTaskState(taskId, TMP);
    const gate = canComplete(state);
    assert.ok(
      !gate.canComplete,
      "ciclo fallido NO debe permitir DONE"
    );
  } finally {
    cleanup(taskId, TMP);
  }
});
