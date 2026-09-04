/**
 * Clarification Gate — spec openspec/changes/clarification-gate.
 *
 * AC5  : prompt de implementación en ASKING → interceptado, no consumido como respuesta.
 * AC10 : Fast-Path no aplica en ASKING.
 * AC11 : Completion Gate intacto (pregunta pendiente bloquea DONE).
 * AC15 : comandos /wam usables en ASKING.
 * E2E-04: respuesta natural → re-análisis → PROPOSED.
 * E2E-06: cambio de tarea → nueva tarea sin contaminación.
 * options: preguntas con opciones enumerables (hard/soft/anonymize).
 *
 * Ejecutar: node --test clarification-gate.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";

const CWD = process.cwd();
const cleanup = (taskId) => {
  try { fs.rmSync(path.join(CWD, ".wam", "tasks", taskId), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
};

const freshHooks = async () => pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
const send = async (hooks, text, taskId, sid = "cg") => {
  const input = { sessionID: sid, messageID: `${sid}-${Date.now()}`, message: { parts: [{ type: "text", text }] }, taskId };
  const out = { message: {}, parts: [] };
  await hooks["chat.message"](input, out);
  return { emitted: out.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n"), input };
};
const wam = async (hooks, args) => {
  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: args }, out);
  return out.parts[0]?.text ?? "";
};

const enterAsking = async (hooks, taskId) => {
  const { emitted } = await send(hooks, "Add support for deleting accounts", taskId);
  const st = getTaskState(taskId);
  assert.equal(st.phase, "ASKING", "entra en ASKING");
  return { emitted, st };
};

test("AC5: prompt de implementación en ASKING se intercepta y NO se consume como respuesta", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-ac5-${Date.now()}`;
  await enterAsking(hooks, taskId);

  const { emitted, input } = await send(hooks, "implementa el borrado ahora", taskId);
  assert.ok(emitted.includes("BLOQUEADO"), "directiva de bloqueo emitida");
  assert.ok(emitted.includes("Pregunta pendiente"), "nombra la pregunta");
  const st = getTaskState(taskId);
  assert.equal(st.phase, "ASKING", "sigue en ASKING");
  assert.ok(st.contract.unknowns.some((u) => u.status === "blocking"), "pregunta sigue bloqueando");
  assert.ok(!input.message.parts[0].text.startsWith("implementa"), "prompt reescrito (sin el original como instrucción)");
  cleanup(taskId);
});

test("E2E-04: respuesta natural resuelve la pregunta → re-análisis → PROPOSED", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-e2e4-${Date.now()}`;
  await enterAsking(hooks, taskId);

  const { emitted } = await send(hooks, "soft delete", taskId);
  assert.ok(emitted.includes("question answered"), "confirmación de respuesta");
  assert.ok(emitted.includes("Ready → Proceed"), "ready");
  const st = getTaskState(taskId);
  assert.equal(st.phase, "PROPOSED", "fase PROPOSED (nunca APPROVED directo)");
  assert.ok(st.contract.unknowns.every((u) => u.status === "answered"), "preguntas resueltas");
  assert.ok(!st.contract.unknowns.some((u) => u.status === "blocking"), "nada bloquea");
  cleanup(taskId);
});

test("E2E-06: cambio de tarea → nueva tarea sin contaminación", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-e2e6-${Date.now()}`;
  await enterAsking(hooks, taskId);

  const { emitted } = await send(hooks, "olvida la autenticación, mejor agrega rate limiting", taskId);
  assert.ok(!emitted.includes("BLOQUEADO"), "no se bloquea como implementación");
  const oldTask = getTaskState(taskId);
  assert.equal(oldTask.phase, "ASKING", "tarea anterior persistida intacta");
  assert.ok(oldTask.contract.unknowns.some((u) => u.status === "blocking"), "pregunta anterior conservada");

  // El nuevo pre-flight creó una tarea task-<ts>; verificamos que exista al menos una
  // tarea nueva distinta de la anterior con unknowns no contaminados.
  const tasksDir = path.join(CWD, ".wam", "tasks");
  const all = fs.readdirSync(tasksDir).filter((d) => d.startsWith("task-"));
  const fresh = all.find((d) => d !== taskId);
  assert.ok(fresh, "nueva tarea creada");
  const st = getTaskState(fresh);
  assert.ok(st, "nuevo estado existe");
  assert.ok(!st.contract?.unknowns?.some((u) => u.question.includes("eliminación")), "sin contaminación de la pregunta anterior");
  cleanup(taskId);
  if (fresh) cleanup(fresh);
});

test("options: preguntas bloqueantes con opciones enumerables", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-opt-${Date.now()}`;
  await enterAsking(hooks, taskId);
  const u = getTaskState(taskId).contract.unknowns.find((x) => x.status === "blocking");
  assert.ok(Array.isArray(u.options) && u.options.length > 0, `options presentes (${JSON.stringify(u.options)})`);
  assert.ok(u.options.includes("soft delete"), "incluye opción soft delete");
  cleanup(taskId);
});

test("AC15: comandos /wam usables en ASKING (no gate trap)", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-ac15-${Date.now()}`;
  await enterAsking(hooks, taskId);
  await wam(hooks, `task switch ${taskId}`);

  const progress = await wam(hooks, "progress");
  assert.ok(progress.includes("Sin estado de tarea") || progress.includes("req-"), "progress responde");
  const assumptions = await wam(hooks, "assumptions");
  assert.ok(assumptions.length > 0, "assumptions lista algo");
  const list = await wam(hooks, "task list");
  assert.ok(list.includes(taskId), "task list funciona en ASKING");
  cleanup(taskId);
});

test("tool.execute.before: mutantes bloqueadas en ASKING, read-only permitidas", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-teb-${Date.now()}`;
  await enterAsking(hooks, taskId);
  await wam(hooks, `task switch ${taskId}`);

  await assert.rejects(
    () => hooks["tool.execute.before"]({ tool: "bash", output: {} }),
    /ENFORCED BLOCK/,
    "bash bloqueada en ASKING"
  );
  await assert.rejects(
    () => hooks["tool.execute.before"]({ tool: "write", output: {} }),
    /ENFORCED BLOCK/,
    "write bloqueada"
  );
  await hooks["tool.execute.before"]({ tool: "read", output: {} });
  await hooks["tool.execute.before"]({ tool: "grep", output: {} });
  // resuelta la pregunta → fuera de ASKING → ya no bloquea
  await send(hooks, "soft delete", taskId);
  assert.equal(getTaskState(taskId).phase, "PROPOSED", "resuelta");
  const done = await hooks["tool.execute.before"]({ tool: "bash", output: {} });
  assert.equal(done, undefined, "sin ASKING activo no bloquea");
  cleanup(taskId);
});

test("git read-only permitido en ASKING; git mutante sigue bloqueado", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-git-${Date.now()}`;
  await enterAsking(hooks, taskId);
  await wam(hooks, `task switch ${taskId}`);

  await hooks["tool.execute.before"]({ tool: "bash", args: { command: "git status --short" }, output: {} });
  await hooks["tool.execute.before"]({ tool: "bash", args: { command: "git diff --stat" }, output: {} });
  await assert.rejects(
    () => hooks["tool.execute.before"]({ tool: "bash", args: { command: "git push origin main" }, output: {} }),
    /ENFORCED BLOCK/,
    "git push sigue bloqueado en ASKING hasta responder"
  );
  await assert.rejects(
    () => hooks["tool.execute.before"]({ tool: "bash", output: {} }),
    /ENFORCED BLOCK/,
    "bash sin comando sigue bloqueado"
  );
  cleanup(taskId);
});

test("AC10+AC11: fast-path no aplica en ASKING y DONE queda bloqueado", async () => {
  const hooks = await freshHooks();
  const taskId = `cg-ac1011-${Date.now()}`;
  await enterAsking(hooks, taskId);
  await wam(hooks, `task switch ${taskId}`);

  // claim de DONE mientras ASKING → interceptado (no llega al gate)
  const { emitted } = await send(hooks, "terminé, done", taskId);
  assert.ok(!emitted.includes("COMPLETION GATE"), "no pasa al completion gate");
  assert.equal(getTaskState(taskId).phase, "ASKING", "sigue en ASKING");
  cleanup(taskId);
});
