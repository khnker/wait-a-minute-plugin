/**
 * Assumption Gate — spec change 3 (openspec/changes/assumption-gate).
 *
 * R1: asunciones explícitas persisten en estado {id, statement, classification, status}.
 * R2: escalamiento — NON_BLOCKING que toca impacto → DECISION_CRITICAL.
 * R3: asunción crítica bloquea ejecución → ASKING.
 * R4: evidencia del repo resuelve la asunción → RESOLVED sin preguntar al usuario.
 * R5: asunción crítica sin resolver bloquea aprobación/completion/DONE.
 *
 * Ejecutar: node --test assumption-gate.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState, buildAssumptions, classifyAssumption, escalateAssumptions } from "./engine.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
};

const freshHooks = async () => pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
const send = async (hooks, text, taskId, sid = "ag") => {
  const out = { message: {}, parts: [] };
  await hooks["chat.message"](
    { sessionID: sid, messageID: `${sid}-1`, message: { parts: [{ type: "text", text }] }, taskId },
    out
  );
  return out.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
};
const wam = async (hooks, args) => {
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: args }, out);
  return out.parts[0]?.text ?? "";
};

test("R1: asunción persistida en estado con {id, statement, classification, status}", async () => {
  const hooks = await freshHooks();
  const taskId = `ag-r1-${Date.now()}`;
  await send(hooks, "agrega cache para mejorar el rendimiento", taskId);
  const st = getTaskState(taskId);
  assert.ok(Array.isArray(st.contract?.assumptions), "contract.assumptions existe");
  assert.ok(st.contract.assumptions.length > 0, "al menos una asunción");
  for (const a of st.contract.assumptions) {
    assert.ok(a.id && a.statement && a.classification && a.status, `shape {id, statement, classification, status} (${JSON.stringify(a)})`);
    assert.ok(["NON_BLOCKING", "DECISION_CRITICAL"].includes(a.classification));
  }
  cleanup(taskId);
});

test("classifyAssumption: impacto material → DECISION_CRITICAL, resto NON_BLOCKING", () => {
  assert.equal(classifyAssumption("la eliminación de cuentas usa soft delete"), "DECISION_CRITICAL");
  assert.equal(classifyAssumption("el endpoint responde 204"), "DECISION_CRITICAL");
  assert.equal(classifyAssumption("el esquema de BD es el mismo"), "DECISION_CRITICAL");
  assert.equal(classifyAssumption("se agrega un helper de formato"), "NON_BLOCKING");
});

test("R2+R3: asunción activa que toca impacto se reclassifica, mirroriza a unknowns y bloquea → ASKING", async () => {
  // E2E: prompt con impacto material ("deleting accounts") → A1 NON_BLOCKING
  // se escala a DECISION_CRITICAL por relevancia de la tarea → ASKING.
  const hooks = await freshHooks();
  const taskId = `ag-r23-${Date.now()}`;
  const emitted = await send(hooks, "Add support for deleting accounts", taskId);

  const st = getTaskState(taskId);
  const a1 = st.contract.assumptions.find((a) => a.id === "A1");
  assert.ok(a1, "A1 persistida");
  assert.equal(a1.classification, "DECISION_CRITICAL", "escalada por impacto de la tarea");
  assert.equal(a1.status, "blocking");
  assert.equal(st.phase, "ASKING", "tarea entra en ASKING (R3)");
  assert.ok(emitted.includes("ASKING"), "part ASKING emitido");
  const u1 = st.contract.unknowns.find((u) => u.assumptionId === "A1");
  assert.ok(u1 && u1.status === "blocking", "unknown mirror con assumptionId");

  // /wam answer resuelve el unknown Y la asunción asociada (tarea activa primero)
  await wam(hooks, `task switch ${taskId}`);
  const out = await wam(hooks, `answer ${u1.id} soft delete`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  const st2 = getTaskState(taskId);
  assert.equal(st2.phase, "PROPOSED", "answer → PROPOSED");
  assert.equal(st2.contract.assumptions.find((a) => a.id === "A1").status, "resolved", "asunción resuelta por answer");
  assert.equal(pluginDefault.approveContract(taskId).ok, true, "aprobación permitida tras resolver");
  cleanup(taskId);
});

test("R4: evidencia del repo resuelve la asunción sin interacción de usuario", async () => {
  const hooks = await freshHooks();
  const taskId = `ag-r4-${Date.now()}`;
  await send(hooks, "Add support for deleting accounts", taskId);
  const st = getTaskState(taskId);
  assert.equal(st.phase, "ASKING", "bloqueada por asunción crítica");

  await wam(hooks, `task switch ${taskId}`);
  const out = await wam(hooks, `resolve A1 docs/delete-policy.md: soft delete por defecto`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true, "resolución por evidencia");
  const a1 = getTaskState(taskId).contract.assumptions.find((a) => a.id === "A1");
  assert.equal(a1.classification, "RESOLVED");
  assert.equal(a1.status, "resolved");
  assert.equal(a1.resolvedBy, "evidence", "resuelta por evidencia del repo, no pregunta");
  assert.ok(pluginDefault.approveContract(taskId).ok, "aprobación permitida");
  cleanup(taskId);
});

test("R5: asunción crítica sin resolver bloquea aprobación y claim de DONE", async () => {
  const hooks = await freshHooks();
  const taskId = `ag-r5-${Date.now()}`;
  await send(hooks, "Add support for deleting accounts", taskId);
  const st = getTaskState(taskId);
  assert.equal(st.phase, "ASKING");

  const rejected = pluginDefault.approveContract(taskId);
  assert.equal(rejected.ok, false, "aprobación bloqueada");
  assert.ok(rejected.reason.includes("DECISION_CRITICAL"), `reason indica asunción crítica (${rejected.reason})`);

  // Resolver solo el unknown NO basta si la asunción quedó sin resolver → pero
  // answerQuestion resuelve ambas. Para R5 puro: asunción sin unknown → guard de asunciones.
  const st2 = getTaskState(taskId);
  assert.equal(st2.contract.assumptions.find((a) => a.id === "A1").status, "blocking");
  assert.ok(!pluginDefault.approveContract(taskId).ok, "sigue bloqueada");

  // claim de DONE interceptado (ASKING) → no llega al gate
  const inp = { message: { parts: [{ type: "text", text: "terminé, done" }] }, taskId };
  const out = { message: {}, parts: [] };
  await hooks["chat.message"]({ sessionID: "ag5", messageID: "ag5-1", message: { parts: [{ type: "text", text: "terminé, done" }] }, taskId }, out);
  const emitted = out.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  assert.ok(emitted.includes("ASKING"), "DONE interceptado por ASKING");
  assert.equal(getTaskState(taskId).phase, "ASKING", "fase no avanza");
  cleanup(taskId);
});

test("regresión: sin asunciones de impacto no se bloquea nada", async () => {
  const hooks = await freshHooks();
  const taskId = `ag-reg-${Date.now()}`;
  await send(hooks, "refactoriza el scraper", taskId);
  const st = getTaskState(taskId);
  assert.notEqual(st.phase, "ASKING", "sin asunción crítica no entra en ASKING");
  assert.ok(pluginDefault.approveContract(taskId).ok, "aprobación normal");
  cleanup(taskId);
});

test("escalateAssumptions unit: mirror a unknowns con assumptionId y dedupe", () => {
  const state = {
    contract: {
      assumptions: [
        { id: "A1", statement: "la API es estable", classification: "NON_BLOCKING", status: "active" },
        { id: "A2", statement: "helper de formato", classification: "NON_BLOCKING", status: "active" },
      ],
      unknowns: [],
    },
  };
  const { escalated, changed } = escalateAssumptions(state, "agregar endpoint de delete");
  assert.equal(changed, true);
  assert.equal(escalated.length, 1, "solo A1 escala (API + tarea delete)");
  assert.equal(state.contract.assumptions[0].classification, "DECISION_CRITICAL");
  assert.equal(state.contract.assumptions[0].status, "blocking");
  assert.equal(state.contract.unknowns.length, 1);
  assert.equal(state.contract.unknowns[0].assumptionId, "A1");
  const again = escalateAssumptions(state, "delete más");
  assert.equal(again.changed, false, "dedupe: no re-escala ni duplica unknowns");
});
