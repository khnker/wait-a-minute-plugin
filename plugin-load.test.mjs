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
import { updateProjectMemo } from "./memory.js";
import { getTaskState } from "./engine.js";
import { routeSkillsV2 } from "./engine.js";

// Aislamiento: los tests NO deben escribir .wam en el repo del plugin
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "wam-pl-iso-")));

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
  for (const key of ["chat.message", "command.execute.before"]) {
    assert.equal(typeof hooks[key], "function", `hook ${key} debe ser función`);
  }
  assert.equal(typeof hooks.config, "undefined", "config hook removido (rompe opencode 1.18.26+)");
  const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf-8");
  assert.ok(!src.includes("ctx.on("), "no debe usar ctx.on (API vieja)");
  assert.ok(!src.includes("ctx.command &&"), "no debe usar ctx.command (API vieja)");
  assert.ok(!src.includes("ctx.experimental"), "no debe usar ctx.experimental (API vieja)");
});

test("plugin NO expone config hook (comando /wam registrado vía opencode.jsonc)", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  assert.equal(typeof hooks.config, "undefined", "config hook removido — mutaba config y rompe opencode 1.18.26+ (N.config TypeError)");
  const src = fs.readFileSync(path.join(import.meta.dirname, "index.js"), "utf-8");
  assert.ok(!/opencodeConfig\.command\["wam"\]/.test(src), "el plugin no registra el comando en runtime");
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
  const visible = res.output.parts.find((p) => p.type === "text" && typeof p.text === "string" && p.text.includes("wait-a-minute: contrato"));
  assert.ok(visible, "debe inyectar el checkpoint como part visible en output.parts");
  assert.ok(visible.text.includes("/wam contract approve"), "confirmación seleccionable via /wam");
try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("Routing: selección reporta hasContent/loaded real del catálogo (nunca fake)", () => {
  const registry = pluginDefault.getRegistry();
  const sel = routeSkillsV2("angular", {}, registry, "STANDARD").selected;
  assert.ok(sel.length > 0, "debe seleccionar skills");
  for (const s of sel) {
    assert.equal(typeof s.hasContent, "boolean");
    assert.equal(typeof s.loaded, "boolean");
    assert.equal(s.loaded, s.hasContent, "loaded nunca fake: refleja hasContent");
    assert.equal(s.hasContent, !!(registry[s.id]?.content || "").trim(), `hasContent = contenido real en registry para ${s.id}`);
  }
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
  assert.ok(output.system.some((p) => p.text.includes("wait-a-minute: contrato")), "legacy: checkpoint presente");
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

test("Contract Synthesizer: requisitos específicos del prompt, no genéricos", async () => {
  const r = await pluginDefault.analyze({
    prompt: "implementa refresh-token rotation y agrega tests de integración",
  });
  const reqs = r.completionContract?.requirements || [];
  assert.ok(reqs.length >= 3, `requisitos específicos (got ${reqs.length}: ${reqs.join(" | ")})`);
  assert.ok(!reqs.includes("Tarea completada según intención"), "no genéricos");
  assert.ok(reqs.some((x) => /refresh.?token/i.test(x)), "requisito de rotation");
  assert.ok(reqs.some((x) => /tests/i.test(x)), "requisito de tests");
});

test("VERIFYING: done sin verificar bloquea DONE → fase VERIFYING; verified permite DONE", async () => {
  const taskId = `ver-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  await hooks["chat.message"](
    { parts: [{ type: "text", text: "implementa refresh-token rotation y agrega tests de integración" }], taskId },
    { parts: [], system: [] }
  );
  assert.equal(pluginDefault.approveContract(taskId).ok, true);

  const st1 = getTaskState(taskId);
  const reqs = st1.requirements;
  assert.ok(reqs.length >= 3, "contrato específico");
  for (const req of reqs) {
    const done = pluginDefault.markRequirement(taskId, req.id, "done", `implementado ${req.title}`);
    assert.equal(done.ok, true);
  }

  const inp = { parts: [{ type: "text", text: "terminé, done" }], taskId };
  await hooks["chat.message"](inp, { parts: [], system: [] });
  assert.ok(inp.parts[0].text.includes("COMPLETION GATE"), "DONE bloqueado con reqs sin verificar");
  const st2 = getTaskState(taskId);
  assert.equal(st2.phase, "VERIFYING", "fase pasa a VERIFYING");

  for (const req of getTaskState(taskId).requirements) {
    const ver = pluginDefault.markRequirement(taskId, req.id, "verified", "npm test pasa");
    assert.equal(ver.ok, true);
  }
  const inp2 = { parts: [{ type: "text", text: "listo, done" }], taskId };
  await hooks["chat.message"](inp2, { parts: [], system: [] });
  const st3 = getTaskState(taskId);
  assert.equal(st3.phase, "DONE", "DONE permitido tras verificar todos");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("Operational Memory: updateProjectMemo mapea analysis.project → project.md", async () => {
  updateProjectMemo({
    project: { detected_stack: "nodejs", architecture: "unknown", relevant_files: ["package.json"] },
  });
  const projectMd = path.join(process.cwd(), ".wam", "context", "project.md");
  assert.ok(fs.existsSync(projectMd), "project.md generado desde analysis.project");
  const body = fs.readFileSync(projectMd, "utf-8");
  assert.ok(/nodejs|package\.json/.test(body), `project.md poblado (${body.slice(0, 80)})`);
  fs.rmSync(projectMd, { force: true });
});

test("Live Context: task-context.md refleja la tarea activa, cierre y sobreescritura", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const liveFileFor = (id) => path.join(process.cwd(), ".wam", "tasks", id, "context.md");

  const t1 = `live-${Date.now()}`;
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "implementa refresh-token rotation y agrega tests" }], taskId: t1 },
    { parts: [], system: [] }
  );
  let body = fs.readFileSync(liveFileFor(t1), "utf-8");
  assert.ok(body.includes(t1), "contexto vivo apunta a la tarea activa");
  assert.ok(/PROPOSED/.test(body), "fase reflejada");

  assert.equal(pluginDefault.approveContract(t1).ok, true);
  for (const r of getTaskState(t1).requirements) {
    pluginDefault.markRequirement(t1, r.id, "done", "evidencia");
    pluginDefault.markRequirement(t1, r.id, "verified", "npm test pasa");
  }
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "tarea completa, done" }], taskId: t1 },
    { parts: [], system: [] }
  );
  body = fs.readFileSync(liveFileFor(t1), "utf-8");
  assert.ok(/DONE/.test(body), "contexto vivo refleja el cierre de tarea");

  const t2 = `live2-${Date.now()}`;
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "agrega cache redis" }], taskId: t2 },
    { parts: [], system: [] }
  );
  body = fs.readFileSync(liveFileFor(t2), "utf-8");
  assert.ok(body.includes(t2), "contexto vivo aislado por tarea");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", t1), { recursive: true, force: true });
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", t2), { recursive: true, force: true });
  } catch {}
});

test("cavemanify + /wam compress: resumen terse y headroom reportado", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const taskId = `cav-${Date.now()}`;
  await hooks["chat.message"](
    { parts: [{ type: "text", text: "implementar migración postgres con tests" }], taskId },
    { parts: [], system: [] }
  );

  const out = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: `compress ${taskId}` }, out);
  const text = out.parts[0].text;
  assert.ok(text.includes(taskId), "resumen incluye taskId");
  assert.ok(/headroom \d+\/32000/.test(text), "headroom reportado con presupuesto");
  assert.ok(!text.includes(" the "), "estilo caveman: sin artículos");

  const file = path.join(process.cwd(), ".wam", "tasks", taskId, "caveman-summary.md");
  assert.ok(fs.existsSync(file), "caveman-summary.md persistido");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("Continuation fast-path: contrato aprobado + continuación inyecta SOLO N2 (live task delta) y el gate de DONE sigue activo", async () => {
  const taskId = `flow-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  await hooks["chat.message"](
    { parts: [{ type: "text", text: "implementar migración postgres con tests" }], taskId },
    { parts: [], system: [] }
  );
  const approved = pluginDefault.approveContract(taskId);
  assert.equal(approved.ok, true, "contrato aprobado");

  const inp = { parts: [{ type: "text", text: "sigue con el paso 2" }], taskId };
  const out = { parts: [], system: [] };
  await hooks["chat.message"](inp, out);
  assert.ok(out.parts.length > 0, "emite N2 delta en continuación");
  const emitted = out.parts.map((p) => p.text || "").join("\n");
  assert.ok(emitted.includes("[wam N2 task]"), "solo N2 (live task delta)");
  assert.ok(!emitted.includes("[wam N1"), "no reconstruye N1");
  assert.ok(!emitted.includes("[wam N3"), "no reconstruye N3");
  assert.ok(!emitted.includes("PROPOSED"), "no re-emite contrato");
  assert.equal(inp.parts[0].text, "sigue con el paso 2", "no reescribe el prompt de continuación");

  const inp2 = { parts: [{ type: "text", text: "listo, terminé la tarea" }], taskId };
  await hooks["chat.message"](inp2, { parts: [], system: [] });
  assert.ok(inp2.parts[0].text.startsWith("⛔"), "hard block sigue activo en claims de DONE con pendientes");

  try {
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
  for (const r of getTaskState(taskId).requirements) {
    pluginDefault.markRequirement(taskId, r.id, "verified", "npm test pasa");
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

  // Compresión automática en DONE: caveman-summary.md persistido sin /wam compress
  const cavFile = path.join(process.cwd(), ".wam", "tasks", taskId, "caveman-summary.md");
  assert.ok(fs.existsSync(cavFile), "caveman-summary.md generado automáticamente en DONE");
  const cav = fs.readFileSync(cavFile, "utf8");
  assert.ok(cav.includes(taskId), "resumen terse identifica la tarea");
  assert.ok(cav.length < 600, "resumen comprimido (terse, no el transcript)");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});
test("no_task_assumption: '¿en qué estábamos?' sin tarea activa → pregunta, no crea tarea", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const out = { parts: [], system: [] };
  await hooks["chat.message"]({ parts: [{ type: "text", text: "¿en qué estábamos?" }] }, out);
  const t = out.parts.map((p) => p.text || "").join("\n");
  assert.ok(/no hay tarea activa|No hay tarea activa/i.test(t), "informa no-active-task sin asumir");
  assert.ok(!t.includes("[wam N1 project]"), "no inyecta contexto de proyecto");  assert.ok(!t.includes("[wam N2 task]"), "no inyecta contexto de tarea inexistente");
});

test("no_task_assumption: con tarea pendiente → ofrece continuar, NO inyecta su contexto", async () => {
  const taskId = `resume-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  await hooks["chat.message"]({ parts: [{ type: "text", text: "implementar migración postgres con tests" }], taskId }, { parts: [], system: [] });
  pluginDefault.approveContract(taskId);
  pluginDefault.resumeTask(taskId);
  const out = { parts: [], system: [] };
  await hooks["chat.message"]({ parts: [{ type: "text", text: "¿en qué estábamos?" }] }, out);
  const t = out.parts.map((p) => p.text || "").join("\n");
  assert.ok(t.includes(`tarea pendiente: ${taskId}`), "ofrece la tarea pendiente: " + t);
  assert.ok(!t.includes("[wam N2 task]"), "NO asume la continuación (no inyecta su contexto)");
  assert.ok(!t.includes("migración postgres"), "no re-emite contenido de la tarea");
  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskId), { recursive: true, force: true });
  } catch {}
});

test("task_isolation live: A→B→A — el live context alterna sin contaminación", async () => {
  const taskA = `iso-a-${Date.now()}`;
  const taskB = `iso-b-${Date.now()}`;
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });

  await hooks["chat.message"]({ parts: [{ type: "text", text: "implementar autenticación JWT" }], taskId: taskA }, { parts: [], system: [] });
  pluginDefault.approveContract(taskA);

  await hooks["chat.message"]({ parts: [{ type: "text", text: "documentar la API rest" }], taskId: taskB }, { parts: [], system: [] });
  pluginDefault.approveContract(taskB);

  const outA = { parts: [], system: [] };
  await hooks["chat.message"]({ parts: [{ type: "text", text: "sigue con la implementación" }], taskId: taskA }, outA);
  const tA = outA.parts.map((p) => p.text || "").join("\n");
  assert.ok(tA.includes(`task: ${taskA}`), "live de A recuperado al volver: " + tA);
  assert.ok(!tA.includes(`task: ${taskB}`), "A no contamina con B");
  assert.ok(!/documentar la API/.test(tA), "contenido de B fuera del pack de A");

  try {
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskA), { recursive: true, force: true });
    fs.rmSync(path.join(process.cwd(), ".wam", "tasks", taskB), { recursive: true, force: true });
  } catch {}
});

test("session root real: client.session.get resuelve el directorio de la sesión (server multi-proyecto)", async () => {
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "wam-real-"));
  const hooks = await pluginDefault({
    directory: process.cwd(), // cwd del server (proyecto A)
    client: {
      session: { get: async () => ({ location: { directory: realDir } }) }, // sesión en proyecto B
    },
    project: {},
    $: {},
  });
  const taskId = `real-${Date.now()}`;
  const out = { parts: [], system: [] };
  await hooks["chat.message"](
    { sessionID: "s-multi", parts: [{ type: "text", text: "implementa el fix en scraper" }], taskId },
    out
  );
  assert.ok(
    fs.existsSync(path.join(realDir, ".wam", "tasks", taskId, "state.yaml")),
    ".wam creado en el directorio real de la sesión (initMemory al iniciar sesión)"
  );
  assert.ok(
    !fs.existsSync(path.join(process.cwd(), ".wam", "tasks", taskId)),
    "NO contamina el cwd del server"
  );
  try {
    fs.rmSync(realDir, { recursive: true, force: true });
  } catch {}
});

test("client.session.get ausente → fallback al directory del plugin (compat)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-fb-"));
  const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
  const taskId = `fb-${Date.now()}`;
  await hooks["chat.message"]({ parts: [{ type: "text", text: "tarea de compat" }], taskId }, { parts: [], system: [] });
  assert.ok(fs.existsSync(path.join(tmp, ".wam", "tasks", taskId, "state.yaml")), "fallback usa pluginInput.directory");
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

test("delegación dura: contrato APPROVED con reqs pendientes genera directivas paralelas con dominio", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-del-"));
  const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
  const taskId = `del-${Date.now()}`;
  await hooks["chat.message"](
    { sessionID: "sd1", parts: [{ type: "text", text: "arregla el bug del frontend y agrega tests e2e" }], taskId },
    { parts: [], system: [] }
  );
  pluginDefault.approveContract(taskId, tmp);
  const st = getTaskState(taskId, tmp);
  assert.ok(st.contract.status === "APPROVED", "contrato aprobado");

  const out = { parts: [], system: [] };
  await hooks["chat.message"]({ sessionID: "sd1", parts: [{ type: "text", text: "tarea terminada, done" }], taskId }, out);
  const t = out.parts.map((p) => p.text || "").join("\n");
  assert.ok(t.includes("[wam delegation]"), "directiva de delegación visible");
  assert.ok(/Task\(parallel\)/.test(t), "reqs → Task paralelo");
  assert.ok(/contexto: frontend/.test(t), "req con hint de dominio frontend");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test("flujo sin fricción: sesión principal SÍ muta con reqs pendientes (bloqueo duro desactivado)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-hard-"));
  // sesión principal: session.get sin parentID
  const hooks = await pluginDefault({
    directory: tmp,
    client: { session: { get: async ({ sessionID }) => ({ location: { directory: tmp }, parentID: sessionID === "sub-1" ? "parent" : undefined }) } },
    project: {}, $: {},
  });
  const taskId = `hard-${Date.now()}`;
  await hooks["chat.message"](
    { sessionID: "main-1", parts: [{ type: "text", text: "implementar migración de base de datos con tests" }], taskId },
    { parts: [], system: [] }
  );
  pluginDefault.approveContract(taskId, tmp);

  // principal intenta write → permitido (flujo sin fricción: bloqueo duro desactivado)
  const err = await hooks["tool.execute.before"]({ sessionID: "main-1", tool: "write", callID: "c1" }, { args: {} }).then(() => null).catch((e) => e.message);
  assert.equal(err, null, "write permitido en sesión principal (sin fricción): " + err);

  // principal con read → permitido
  const okRead = await hooks["tool.execute.before"]({ sessionID: "main-1", tool: "read", callID: "c2" }, { args: {} }).then(() => true).catch((e) => e.message);
  assert.equal(okRead, true, "read permitido (investigación)");

  // subagente (parentID) → write permitido
  const okSub = await hooks["tool.execute.before"]({ sessionID: "sub-1", tool: "write", callID: "c3" }, { args: {} }).then(() => true).catch((e) => e.message);
  assert.equal(okSub, true, "subagente ejecutor puede mutar: " + okSub);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test("incertidumbre: prompt ambiguo pide aprobación; confirmación natural 'sí' aprueba (sin /wam)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-unc-"));
  const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });
  const taskId = `unc-${Date.now()}`;

  // primer mensaje ambiguo → contrato PROPOSED (pide aprobación)
  const out1 = { parts: [], system: [] };
  await hooks["chat.message"]({ sessionID: "su1", parts: [{ type: "text", text: "haz algo con eso" }], taskId }, out1);
  let st = getTaskState(taskId, tmp);
  assert.equal(st.contract?.status, "PROPOSED", "ambiguo → espera aprobación (no auto-aprueba)");
  const t1 = out1.parts.map((p) => p.text || "").join("\n");
  assert.ok(/Continuar → ejecutar|contrato PROPOSED/i.test(t1), "contrato presentado pidiendo confirmación");

  // confirmación natural → aprueba sin comando /wam
  const out2 = { parts: [], system: [] };
  await hooks["chat.message"]({ sessionID: "su1", parts: [{ type: "text", text: "si hazlo" }], taskId }, out2);
  st = getTaskState(taskId, tmp);
  assert.equal(st.contract?.status, "APPROVED", "confirmación 'si' aprueba el contrato");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test("multi-sesión: 2 sesiones sobre la MISMA carpeta tienen tareas aisladas (namespace ses-<id>)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-2sess-"));
  const hooks = await pluginDefault({ directory: tmp, client: {}, project: {}, $: {} });

  // sesión A (taskId genérico → namespace ses-A)
  await hooks["chat.message"]({ sessionID: "sesA-aaaaaaaaaa", parts: [{ type: "text", text: "refactoriza el scraper con tests" }] }, { parts: [], system: [] });
  // sesión B (misma carpeta, taskId genérico → namespace ses-B)
  await hooks["chat.message"]({ sessionID: "sesB-bbbbbbbbbb", parts: [{ type: "text", text: "arregla el bug del frontend" }] }, { parts: [], system: [] });

  const taskA = getTaskState("ses-" + "sesA-aaaaaaaaaa".slice(-10), tmp);
  const taskB = getTaskState("ses-" + "sesB-bbbbbbbbbb".slice(-10), tmp);
  assert.ok(taskA, "sesión A con su propia tarea");
  assert.ok(taskB, "sesión B con su propia tarea");
  assert.notEqual(taskA.taskId ?? JSON.stringify(taskA.contract?.requirements), JSON.stringify(taskB.contract?.requirements), "contratos distintos");
  assert.ok(taskA.contract?.requirements?.some((r) => /scrap/i.test(r)), "A conserva su dominio (scraper)");
  assert.ok(taskB.contract?.requirements?.some((r) => /front/i.test(r)), "B conserva su dominio (frontend)");

  // live context aislado por sesión
  const liveA = fs.existsSync(path.join(tmp, ".wam", "tasks", "ses-" + "sesA-aaaaaaaaaa".slice(-10), "context.md"));
  const liveB = fs.existsSync(path.join(tmp, ".wam", "tasks", "ses-" + "sesB-bbbbbbbbbb".slice(-10), "context.md"));
  assert.ok(liveA, "live context aislado para sesión A");
  assert.ok(liveB, "live context aislado para sesión B");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});
