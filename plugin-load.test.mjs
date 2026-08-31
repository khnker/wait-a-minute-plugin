/**
 * Regression test — opencode 1.18.25 plugin API.
 *
 * Bug corregido: el plugin usaba la API vieja (ctx.on, ctx.system, ctx.command)
 * y opencode 1.18.25 fallaba al cargarlo: `Plugin export is not a function`
 * primero y `ctx.on is not a function` tras apuntar al path correcto.
 * La API nueva exige: default export = función factory que RECIBE el plugin
 * input ({ client, project, directory, $ }) y RETORNA el objeto de hooks:
 *   { config, "chat.message", "command.execute.before", ... }
 *
 * Ejecutar: node --test plugin-load.test.mjs (Node 20+)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";

test("default export es una función (Plugin factory)", () => {
  assert.equal(typeof pluginDefault, "function");
});

test("factory retorna objeto de hooks (no usa ctx.on / ctx.system / ctx.command)", async () => {
  const hooks = await pluginDefault({
    directory: process.cwd(),
    client: {},
    project: {},
    $: {},
  });
  assert.equal(typeof hooks, "object");
  for (const key of ["config", "chat.message", "command.execute.before"]) {
    assert.equal(typeof hooks[key], "function", `hook ${key} debe ser función`);
  }
  const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf-8");
  assert.ok(!src.includes("ctx.on("), "no debe usar ctx.on (API vieja)");
  assert.ok(!src.includes("ctx.command &&"), "no debe usar ctx.command (API vieja)");
  assert.ok(!src.includes("ctx.experimental"), "no debe usar ctx.experimental (API vieja)");
});

test("config hook registra el comando /wam", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const opencodeConfig = {};
  await hooks.config(opencodeConfig);
  assert.ok(opencodeConfig.command?.wam, "debe registrar comando 'wam'");
  assert.ok(opencodeConfig.command.wam.template === "$ARGUMENTS");
  assert.ok(opencodeConfig.command.wam.description.startsWith("Wait-a-Minute CLI"));
});

test("command.execute.before atiende /wam y hace push a output.parts", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const output = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "skills explain rename variable x" }, output);
  assert.ok(output.parts.length > 0, "debe emitir al menos un part");
  assert.equal(output.parts[0].type, "text");
  assert.ok(output.parts[0].text.length > 0);
});

test("command.execute.before ignora comandos que no son /wam", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const output = { parts: [] };
  await hooks["command.execute.before"]({ command: "otro", arguments: "x" }, output);
  assert.equal(output.parts.length, 0);
});

test("chat.message 1.18.25: extrae prompt de message.parts e inyecta validación en output.parts", async () => {
  const attempt = async (dir) => {
    const hooks = await pluginDefault({ directory: dir, client: {}, project: {}, $: {} });
    const output = { message: {}, parts: [] };
    await hooks["chat.message"](
      { sessionID: "s1", messageID: "m1", message: { parts: [{ type: "text", text: "refactoriza el scraper" }] }, taskId: "test-task" },
      output
    );
    const p = path.join(dir, ".wam", "tasks", "test-task", "state.yaml");
    return { p, ok: fs.existsSync(p), output };
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-test-"));
  let res = await attempt(tmp);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}

  if (!res.ok) {
    // fallback sandboxes con quota en /tmp: usa el .wam gitignored del proyecto
    res = await attempt(process.cwd());
  }
  assert.ok(res.ok, `debe persistir estado en ${res.p}`);
  const visible = res.output.parts.find((p) => p.type === "text" && typeof p.text === "string" && p.text.includes("¿Proceder con esta estrategia?"));
  assert.ok(visible, "debe inyectar el checkpoint como part visible en output.parts");
  assert.ok(visible.text.includes("/wam contract approve"), "confirmación seleccionable via /wam");
  try {
    fs.rmSync(path.dirname(res.p), { recursive: true, force: true });
  } catch {}
});

test("chat.message compat legacy: shape {parts}/{system} sigue funcionando", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-legacy-"));
  const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
  const output = { system: [] };
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "refactoriza el scraper" }], taskId: "legacy-task" },
    output
  );
  assert.ok(output.system.length > 0, "debe inyectar en output.system (API vieja)");
  assert.ok(output.system.some((p) => p.text.includes("¿Proceder con esta estrategia?")), "legacy: checkpoint presente");
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

test("methods adjuntos al export siguen disponibles (analyze)", async () => {
  const r = await pluginDefault.analyze({ prompt: "rename variable x to y" });
  assert.ok(r.intent && r.strategy, "analyze debe retornar análisis");
  assert.ok(pluginDefault.isTrivial("rename x to y"), "isTrivial detecta rename");
});

test("Content Materialization: loadSkillOnDemand escribe SKILL.md real a disco", async () => {
  const registry = pluginDefault.loadBundledRegistry();
  const withContent = Object.values(registry).find((s) => s.content && s.content.length > 0);
  assert.ok(withContent, "debe existir skill con contenido embebido");
  const baseDir = path.join(process.cwd(), ".wam", "test-bundle");
  const dl = await pluginDefault.loadSkillOnDemand(withContent.id, registry, baseDir);
  assert.equal(dl.loaded, true, `debe cargar (${dl.reason || ""})`);
  assert.ok(dl.contentPath?.endsWith("SKILL.md"), "contentPath apunta a SKILL.md");
  assert.ok(fs.existsSync(dl.contentPath), "SKILL.md materializado en disco");
  assert.ok(fs.readFileSync(dl.contentPath, "utf-8").length > 40, "cuerpo real no vacío");
  fs.rmSync(baseDir, { recursive: true, force: true });
});

test("Task Resume: /wam task switch fija tarea activa; chat.message persiste bajo esa tarea", async () => {
  const taskId = `resume-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  const outSwitch = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: `task switch ${taskId}` }, outSwitch);
  assert.ok(outSwitch.parts[0].text.includes(`Tarea activa: ${taskId}`));
  assert.ok(fs.existsSync(path.join(process.cwd(), ".wam", "active-task")), "active-task persistido");

  await hooks["chat.message"](
    { sessionID: "s2", message: { parts: [{ type: "text", text: "continuar implementación" }] } },
    { message: {}, parts: [] }
  );
  const st = getTaskState(taskId);
  assert.ok(st, "estado persistido bajo la tarea activa, no default-task");

  const outList = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "task list" }, outList);
  assert.ok(outList.parts[0].text.includes(taskId), "task list muestra la tarea activa");
  assert.ok(outList.parts[0].text.includes("*activa"), "task list marca la tarea activa");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "active-task"), { force: true });
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("Hard Block: claim de DONE con requisitos pendientes inyecta directiva de bloqueo en output.parts", async () => {
  const taskId = `hb-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  await hooks["chat.message"](
    { sessionID: "s3", message: { parts: [{ type: "text", text: "implementar migración postgres con tests" }] }, taskId },
    { message: {}, parts: [] }
  );

  const output = { message: {}, parts: [] };
  await hooks["chat.message"](
    { sessionID: "s3", message: { parts: [{ type: "text", text: "terminé la tarea, está done" }] }, taskId },
    output
  );
  const gatePart = output.parts.find((p) => p.type === "text" && typeof p.text === "string" && p.text.startsWith("⛔"));
  assert.ok(gatePart, "el gate debe inyectarse como part visible en output.parts");
  assert.ok(gatePart.text.startsWith("⛔"), "el claim debe reescribirse a directiva de bloqueo");
  assert.ok(gatePart.text.includes("COMPLETION GATE"), "directiva menciona el gate");
  assert.ok(gatePart.text.includes("No declare DONE"), "directiva prohíbe DONE");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("Memory on DONE: tarea completada deriva summary.md + recent-changes.md (spec §12/§14)", async () => {
  const taskId = `done-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  await hooks["chat.message"](
    { sessionID: "s4", message: { parts: [{ type: "text", text: "implementar migración con tests" }] }, taskId },
    { message: {}, parts: [] }
  );
  assert.equal(pluginDefault.approveContract(taskId).status, "APPROVED");

  const st = getTaskState(taskId);
  assert.ok(st.requirements?.length > 0, "contrato con requisitos");
  for (const r of st.requirements) {
    pluginDefault.markRequirement(taskId, r.id, "done", "evidencia de test");
  }

  const output = { message: {}, parts: [] };
  await hooks["chat.message"](
    { sessionID: "s4", message: { parts: [{ type: "text", text: "tarea completada, está done" }] }, taskId },
    output
  );

  const sumFile = path.join(process.cwd(), ".wam", "tasks", taskId, "summary.md");
  assert.ok(fs.existsSync(sumFile), "summary.md derivado en disco");
  const summary = fs.readFileSync(sumFile, "utf8");
  assert.ok(summary.includes("## Status"), "summary incluye Status");
  assert.ok(summary.includes("COMPLETED"), "summary marca COMPLETED");

  const today = new Date().toISOString().slice(0, 10);
  const rc = fs.readFileSync(path.join(process.cwd(), ".wam", "context", "recent-changes.md"), "utf8");
  assert.ok(rc.includes(`## ${today} — ${taskId}`), "recent-changes registra la tarea completada");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});