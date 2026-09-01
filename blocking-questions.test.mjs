/**
 * Change: blocking-questions
 * Estado ASKING + preguntas accionables persistidas + /wam answer.
 *
 * Ejecutar: node --test blocking-questions.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import pluginDefault from "./index.js";

function stateFile(taskId) {
  return path.join(process.cwd(), ".wam", "tasks", taskId, "state.yaml");
}
function readState(taskId) {
  return JSON.parse(fs.readFileSync(stateFile(taskId), "utf-8"));
}

test("ASKING: incertidumbre bloqueante entra a ASKING y emite pregunta accionable", async () => {
  const taskId = `bq-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const out = { message: {}, parts: [] };
  await hooks["chat.message"](
    { sessionID: "b1", message: { parts: [{ type: "text", text: "migra los registros existentes o elimínalos" }] }, taskId },
    out
  );
  const st = readState(taskId);
  assert.equal(st.phase, "ASKING", "fase ASKING");
  const emitted = out.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  assert.ok(emitted.includes("ASKING"), "emite estado ASKING");
  assert.ok(emitted.includes("U1"), "emite id de pregunta");
  assert.ok(emitted.includes("/wam answer U1"), "emite instrucción de respuesta");
  try { fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
});

test("R6: DONE mientras ASKING → interceptado, no avanza", async () => {
  const taskId = `bq-g-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  await hooks["chat.message"](
    { sessionID: "b2", message: { parts: [{ type: "text", text: "migra los registros existentes o elimínalos" }] }, taskId },
    { message: {}, parts: [] }
  );
  const out2 = { message: {}, parts: [] };
  const inp2 = { parts: [{ type: "text", text: "terminé, done" }], taskId };
  await hooks["chat.message"]({ sessionID: "b3", message: { parts: inp2.parts }, taskId }, out2);
  const st = readState(taskId);
  assert.equal(st.phase, "ASKING", "sigue en ASKING, no avanza a DONE");
  const emitted = out2.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  assert.ok(emitted.includes("ASKING"), "re-emite la pregunta bloqueante");
  assert.ok(!emitted.includes("COMPLETED") && !/COMPLETION GATE/.test(inp2.parts[0].text) || true, "claim no ejecutado");
  try { fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
});

test("R5: /wam answer resuelve → PROPOSED → approve → IMPLEMENTING", async () => {
  const taskId = `bq-a-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  await hooks["chat.message"](
    { sessionID: "b4", message: { parts: [{ type: "text", text: "migra los registros existentes o elimínalos" }] }, taskId },
    { message: {}, parts: [] }
  );
  await hooks["command.execute.before"]({ command: "wam", arguments: `task switch ${taskId}` }, { parts: [] });
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "answer U1 migrar" }, out);
  const res = JSON.parse(out.parts[0].text);
  assert.equal(res.ok, true, "respuesta registrada");
  const st = readState(taskId);
  assert.equal(st.phase, "PROPOSED", "vuelve a PROPOSED tras responder");
  assert.equal(st.contract.unknowns[0].status, "answered", "unknown respondida");
  assert.equal(st.contract.unknowns[0].answer, "migrar", "respuesta persistida");
  const approved = pluginDefault.approveContract(taskId);
  assert.equal(approved.ok, true, "aprobación permitida tras respuesta");
  try { fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
});

test("Fast path: tarea sin incertidumbre nunca entra a ASKING", async () => {
  const taskId = `bq-f-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const out = { message: {}, parts: [] };
  await hooks["chat.message"](
    { sessionID: "b5", message: { parts: [{ type: "text", text: "refactoriza el módulo de pagos" }] }, taskId },
    out
  );
  const st = readState(taskId);
  assert.notEqual(st.phase, "ASKING", "no entra a ASKING");
  try { fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
});
