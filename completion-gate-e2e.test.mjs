/**
 * G5 — Completion Gate end-to-end (checklist §33 "La prueba definitiva").
 *
 * Escenario: task "implementa X y agrega tests"; el agente implementa X,
 * omite tests y dice DONE. WAM debe bloquear + indicar qué falta + próxima
 * acción. Tras agregar tests con evidencia y verificar, WAM permite DONE.
 *
 * Ejecutar: node --test completion-gate-e2e.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState, persistTaskState } from "./engine.js";

const CWD = process.cwd();

async function runHook(prompt, taskId, sessionID = "g5") {
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const out = { message: {}, parts: [] };
  await hooks["chat.message"]({ sessionID, message: { parts: [{ type: "text", text: prompt }] }, taskId }, out);
  return out;
}
function cleanup(taskId) {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
}
function gateText(out) {
  const p = out.parts.find((x) => x.type === "text" && typeof x.text === "string" && x.text.includes("COMPLETION GATE"));
  return p?.text || "";
}

test("G5: DONE con requisito pendiente -> BLOCK, indica qué falta y próxima acción", async () => {
  const taskId = `g5-a-${Date.now()}`;
  await runHook("implementar X y agregar tests", taskId);
  pluginDefault.approveContract(taskId);
  const st0 = getTaskState(taskId);
  const implReq = st0.requirements[0];
  const testsReq = st0.requirements.find((r) => /test/i.test(r.title)) || st0.requirements[1];

  pluginDefault.markRequirement(taskId, implReq.id, "done", "X implementado, git diff confirmado");
  assert.equal(getTaskState(taskId).requirements[0].status, "done", "implementación marcada done");

  const out = await runHook("tarea terminada, declare done", taskId, "g5a2");
  const gate = gateText(out);
  cleanup(taskId);

  assert.ok(gate.includes("COMPLETION GATE BLOQUEADO") || gate.includes("COMPLETION GATE:"), "gate bloquea");
  assert.ok(/No declare[s]? DONE/.test(gate), "prohíbe DONE");
  assert.ok(gate.includes(testsReq.title), "indica exactamente qué falta (tests)");
  assert.ok(/req-\d/.test(gate), "identifica el requisito pendiente por ID");
  assert.ok(/Continuar con:|Continúa con el próximo requisito/.test(gate), "produce próxima acción concreta");
  assert.ok(gate.toLowerCase().includes("requisito"), "explica qué falta");
});

test("G5: DONE sin evidencia -> BLOCK (markRequirement lo rechaza y gate lo detecta)", async () => {
  const taskId = `g5-b-${Date.now()}`;
  await runHook("implementar X y agregar tests", taskId);
  pluginDefault.approveContract(taskId);
  const r1 = getTaskState(taskId).requirements[0];

  const refused = pluginDefault.markRequirement(taskId, r1.id, "done", "");
  assert.equal(refused.ok, false, "markRequirement rechaza done sin evidencia");
  assert.ok(refused.reason.includes("evidencia"), "razón menciona evidencia");
  assert.equal(getTaskState(taskId).requirements[0].status, "pending", "no marca done sin evidencia");

  const st = getTaskState(taskId);
  st.requirements[0] = { ...st.requirements[0], status: "done", evidence: [] };
  persistTaskState(taskId, st);
  const out = await runHook("terminado, done", taskId, "g5b2");
  const gate = gateText(out);
  cleanup(taskId);
  assert.ok(gate.includes("sin evidencia"), "gate lista requisito done-sin-evidencia como pendiente");
});

test("G5: DONE sin contrato aprobado -> BLOCK (aprobar antes)", async () => {
  const taskId = `g5-d-${Date.now()}`;
  await runHook("implementar X y agregar tests", taskId);
  const st = getTaskState(taskId);
  for (const r of st.requirements) {
    r.status = "done";
    r.evidence.push("evidencia: tests passed");
  }
  const gate = pluginDefault.evaluateCompletionGate(st, "todo listo, done");
  cleanup(taskId);
  assert.equal(st.contract.status, "PROPOSED");
  assert.ok(gate.blocked, "bloquea aunque todos los reqs estén done");
  assert.ok(gate.pending.some((p) => /aprobar/.test(p)), "indica que falta aprobar el contrato");
});

test("G5: DONE con todo verificado y evidencia -> ALLOW, fase DONE, summary.md, recent-changes", async () => {
  const taskId = `g5-c-${Date.now()}`;
  await runHook("implementar X y agregar tests", taskId);
  pluginDefault.approveContract(taskId);
  const reqs = getTaskState(taskId).requirements;
  for (const r of reqs) {
    const rMark = pluginDefault.markRequirement(taskId, r.id, "done", `evidencia: ${r.title} -> npm test passed, typecheck passed`);
    assert.equal(rMark.ok, true, `${r.id} marcado done con evidencia`);
  }
  const out = await runHook("todo verificado, tarea completa done", taskId, "g5c2");
  const gate = gateText(out);
  const st = getTaskState(taskId);
  const sumFile = path.join(CWD, ".wam", "tasks", taskId, "summary.md");
  const summary = fs.existsSync(sumFile) ? fs.readFileSync(sumFile, "utf8") : "";
  const hasRecentChange = fs.existsSync(path.join(CWD, ".wam", "context", "recent-changes.md"))
    && fs.readFileSync(path.join(CWD, ".wam", "context", "recent-changes.md"), "utf8").includes(taskId);
  cleanup(taskId);

  assert.equal(gate, "", "gate NO bloquea (sin ⛔ ni COMPLETION GATE de bloqueo)");
  assert.equal(st.phase, "DONE", "fase DONE");
  assert.equal(st.nextAction, "Tarea completa — contrato verificado");
  assert.ok(st.requirements.every((r) => r.status === "done" && r.evidence.length > 0), "todos con evidencia");
  assert.ok(summary.includes("## Status") && summary.includes("COMPLETED"), "summary.md COMPLETED");
  assert.ok(hasRecentChange, "recent-changes.md registra la tarea");
});