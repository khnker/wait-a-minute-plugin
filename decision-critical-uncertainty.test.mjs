/**
 * Change: decision-critical-uncertainty
 * Classification RESOLVABLE/NON_BLOCKING/DECISION_CRITICAL + contract blocking.
 *
 * Ejecutar: node --test decision-critical-uncertainty.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { classifyUncertainty, buildUncertainties } from "./engine.js";
import pluginDefault from "./index.js";

test("R1: tres clasificaciones", () => {
  assert.equal(classifyUncertainty("Should existing records be migrated or deleted?"), "DECISION_CRITICAL");
  assert.equal(classifyUncertainty("cómo se maneja el refresh token actualmente?"), "DECISION_CRITICAL");
  assert.equal(classifyUncertainty("qué versión de NestJS usa el proyecto?"), "RESOLVABLE");
  assert.equal(classifyUncertainty("existe algún endpoint de health check?"), "RESOLVABLE");
  assert.equal(classifyUncertainty("preferencia de naming del módulo"), "NON_BLOCKING");
});

test("buildUncertainties: dedupe, ids, kind preservado", () => {
  const u = buildUncertainties(
    ["el endpoint debe preservar la forma de respuesta"],
    ["Contexto del proyecto limitado - inspección recomendada"]
  );
  assert.ok(u.length >= 2);
  assert.ok(u.every((x) => x.id.startsWith("U")));
  assert.equal(u.find((x) => x.question.includes("respuesta")).kind, "ASSUMED");
  assert.equal(u[0].status, "active");
});

test("R5: incertidumbre destructiva → DECISION_CRITICAL → bloquea aprobación y DONE", async () => {
  const taskId = `dcu-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "migra los registros existentes al nuevo esquema o elimínalos" }], taskId },
    { parts: [], system: [] }
  );
  const state = JSON.parse(requireState(taskId));
  assert.ok(state.contract.unknowns?.length > 0, "contrato expone unknowns");
  assert.equal(state.contract.unknowns[0].status, "blocking");

  const approved = pluginDefault.approveContract(taskId);
  assert.equal(approved.ok, false, "aprobación bloqueada");
  assert.ok(approved.reason.includes("DECISION_CRITICAL"), "razón indica decision-critical");

  const inp = { parts: [{ type: "text", text: "terminé, done" }], taskId };
  await hooks["chat.message"](inp, { parts: [], system: [] });
  assert.ok(inp.parts[0].text.includes("COMPLETION GATE"), "DONE bloqueado por unknown sin responder");

  // resolución: se marca la unknown como respondida en el contrato persistido
  state.contract.unknowns.forEach((u) => (u.status = "answered"));
  persistState(taskId, state);
  const approved2 = pluginDefault.approveContract(taskId);
  assert.equal(approved2.ok, true, "aprobación permitida tras resolver unknowns");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("regresión: tarea sin incertidumbre mantiene flujo actual", async () => {
  const taskId = `dcu-nu-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "refactoriza el módulo de pagos" }], taskId },
    { parts: [], system: [] }
  );
  const approved = pluginDefault.approveContract(taskId);
  assert.equal(approved.ok, true, "sin unknowns → aprobación normal");
  const state = JSON.parse(requireState(taskId));
  assert.ok(!state.contract.unknowns?.length, "contract sin unknowns");
  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

function stateFile(taskId) {
  return path.join(process.cwd(), ".wam", "tasks", taskId, "state.yaml");
}
function requireState(taskId) {
  return fs.readFileSync(stateFile(taskId), "utf-8");
}
function persistState(taskId, state) {
  fs.writeFileSync(stateFile(taskId), JSON.stringify(state, null, 2));
}
