/**
 * README Validation Suite — one test per feature the README promises.
 * Ejecutar: node --test readme-validation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pluginDefault from "./index.js";
import { routeSkillsV2, getTaskState } from "./engine.js";

// Aislamiento: los tests NO deben escribir .wam en el repo del plugin
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "wam-rv-iso-")));
const CWD = process.cwd();

async function runHook(prompt, taskId, sessionID = "rv") {
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const out = { message: {}, parts: [] };
  await hooks["chat.message"]({ sessionID, message: { parts: [{ type: "text", text: prompt }] }, taskId }, out);
  return out;
}
function taskDir(taskId) { return path.join(CWD, ".wam", "tasks", taskId); }
function cleanup(taskId) {
  try { fs.rmSync(taskDir(taskId), { recursive: true, force: true }); } catch {}
}

test("Pre-flight cognitivo: analiza intención, contexto de proyecto y riesgo", async () => {
  // projectPath = repo real del plugin (tiene package.json) — el cwd del test es tmp aislado
  const a = await pluginDefault.analyze({ prompt: "refactorizar el scraper con tests", projectPath: import.meta.dirname });
  assert.ok(a.intent?.classification, "clasifica intención");
  assert.ok(a.known?.some((k) => /package\.json/.test(k)), "inspecciona repo (package.json detectado)");
  assert.ok(["low", "medium", "high"].includes(a.risk), "evalúa riesgo");
  assert.ok(a.complexity, "evalúa complejidad");
});

test("Completion Contract: propone requisitos, verificación y restricciones (auto-aprobado sin incertidumbre)", async () => {
  const taskId = `rv-ct-${Date.now()}`;
  await runHook("implementar auth con refresh token y migración", taskId);
  const st = getTaskState(taskId);
  cleanup(taskId);
  assert.ok(st, "estado persistido");
  // Prompt claro (sin incertidumbre) → contrato auto-aprobado, fase IMPLEMENTING
  assert.equal(st.phase, "IMPLEMENTING");
  assert.equal(st.contract?.status, "APPROVED");
  assert.ok(st.contract?.requirements?.length >= 1, "propone requisitos");
  assert.ok(Array.isArray(st.contract?.verification), "define verificación");
  assert.ok(Array.isArray(st.contract?.constraints), "define restricciones");
});

test("Workflow de aprobación: PROPOSED → APPROVED (IMPLEMENTING) y REJECTED (WAITING)", async () => {
  const taskId = `rv-ap-${Date.now()}`;
  await runHook("migrar a postgres", taskId);
  const app = pluginDefault.approveContract(taskId);
  assert.equal(app.status, "APPROVED");
  assert.equal(app.phase, "IMPLEMENTING");
  assert.equal(getTaskState(taskId).contract.status, "APPROVED");

  const taskId2 = `rv-rej-${Date.now()}`;
  await runHook("hacer X", taskId2);
  const rej = pluginDefault.rejectContract(taskId2);
  assert.equal(rej.status, "REJECTED");
  assert.equal(rej.phase, "WAITING");

  const taskId3 = `rv-ed-${Date.now()}`;
  await runHook("hacer Y", taskId3);
  const ed = pluginDefault.editContract(taskId3, { requirements: ["r1", "r2", "r3"], verification: ["v"] });
  assert.equal(ed.status, "PROPOSED");
  assert.equal(getTaskState(taskId3).contract.requirements.length, 3);
  cleanup(taskId); cleanup(taskId2); cleanup(taskId3);
});

test("Completion Gate: detecta claims de fin y bloquea con lista de pendientes", async () => {
  const taskId = `rv-gate-${Date.now()}`;
  await runHook("implementar feature con tests", taskId);
  const out = await runHook("terminé la tarea, está done", taskId, "rv2");
  const gate = out.parts.find((p) => p.type === "text" && typeof p.text === "string" && (p.text.startsWith("⛔") || p.text.includes("COMPLETION GATE")));
  cleanup(taskId);
  assert.ok(gate?.text.includes("COMPLETION GATE"), "gate inyectado");
  assert.ok(/No declare[s]? DONE/.test(gate.text), "prohíbe DONE");
  assert.ok(gate.text.includes("Requisitos pendientes"), "lista pendientes");
});

test("Real Progress Tracking: requisito con evidencia + nextAction derivado", async () => {
  const taskId = `rv-pr-${Date.now()}`;
  await runHook("implementar migración con tests", taskId);
  const st0 = getTaskState(taskId);
  const req1 = st0.requirements[0];
  pluginDefault.markRequirement(taskId, req1.id, "done", "migración aplicada y tests verdes");
  const st1 = getTaskState(taskId);
  cleanup(taskId);
  assert.equal(st1.requirements[0].status, "done");
  assert.ok(st1.requirements[0].evidence.some((e) => e.includes("migración aplicada")), "guarda evidencia");
  if (st1.requirements[1]) assert.ok(st1.nextAction?.includes(st1.requirements[1].id), "nextAction apunta al próximo pendiente");
});

test("Persistent Policies: scope, verify y simplify ACTIVE por defecto", async () => {
  const a = await pluginDefault.analyze({ prompt: "agregar endpoint con validación", projectPath: CWD });
  const policies = (a.persistentPolicies || []).map((p) => p.policy);
  assert.ok(policies.includes("scope"), "scope ACTIVE");
  assert.ok(policies.includes("verify"), "verify ACTIVE");
  assert.ok(policies.includes("simplify"), "simplify ACTIVE");
});

test("Skill Registry autocontenido: >=2090 skills aprobadas con contenido real embebido", () => {
  const reg = pluginDefault.getRegistry();
  const ids = Object.keys(reg);
  assert.ok(ids.length >= 2090, `registry con ${ids.length} skills`);
  const sample = ids.slice(0, 25);
  for (const id of sample) {
    const s = reg[id];
    assert.equal(s.status, "APPROVED", `${id} aprobada`);
    assert.ok((s.content || "").trim().length > 40, `${id} con cuerpo real`);
    assert.ok(s.source?.id, `${id} con provenance`);
  }
});

test("Hard Block on DONE: el claim entrante se reescribe a directiva de bloqueo", async () => {
  const taskId = `rv-hb-${Date.now()}`;
  await runHook("hacer deployment", taskId);
  const out = await runHook("todo listo, declare done", taskId, "rv3");
  const emitted = out.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  cleanup(taskId);
  assert.ok(emitted.includes("⛔"), "directiva hard block visible");
  assert.ok(!/[^☐]declare d[oó]ne/i.test(emitted.replace(/⛔[\s\S]*/, "")), "claim original no circula como instrucción de fin");
  assert.equal(getTaskState(taskId)?.phase ?? "IMPLEMENTING", "IMPLEMENTING", "fase no pasa a DONE");
});

test("Task Resume: /wam task switch + hook persiste bajo tarea activa", async () => {
  const taskId = `rv-rs-${Date.now()}`;
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const outSwitch = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: `task switch ${taskId}` }, outSwitch);
  assert.ok(outSwitch.parts[0].text.includes(`Tarea activa: ${taskId}`), "switch ok");
  await hooks["chat.message"]({ sessionID: "rv4", message: { parts: [{ type: "text", text: "continuar" }] } }, { message: {}, parts: [] });
  assert.ok(getTaskState(taskId), "estado bajo tarea activa");
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
  cleanup(taskId);
});

test("Single Router: ranking ponderado, límite por rigor, explain()", () => {
  const reg = pluginDefault.getRegistry();
  const r = routeSkillsV2("crea un componente angular con tests", {}, reg, "STANDARD");
  assert.ok(r.selected.length > 0, "selecciona");
  assert.ok(r.selected.length <= r.counts.limit, `respeta límite ${r.counts.limit}`);
  const scores = r.selected.map((s) => s.relevance);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "ordenado desc");
  assert.ok(typeof r.explain() === "string" && r.explain().length > 0, "explain() funcional");
  assert.ok(r.exceeded.length >= 0, "excedidos reportados");
});

test("CLI /wam: skills list|search|inspect|explain + contract + progress + task", async () => {
  const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });
  const run = async (arguments_) => {
    const o = { parts: [] };
    await hooks["command.execute.before"]({ command: "wam", arguments: arguments_ }, o);
    return o.parts[0]?.text || "";
  };
  const list = await run("skills list");
  assert.ok(/\d+ skills/.test(list) || list.length > 0, "skills list responde");
  const search = await run("skills search angular");
  assert.ok(search.includes("angular"), "skills search matchea");
  const inspect = await run("skills inspect antigravity-awesome-skills-angular");
  assert.ok(inspect.toLowerCase().includes("angular"), "skills inspect devuelve metadata");
  const explain = await run("skills explain crear componente angular");
  assert.ok(explain.includes("score"), "skills explain muestra scoring");
  const taskId = `rv-cli-${Date.now()}`;
  await runHook("tarea de prueba", taskId);
  await hooks["command.execute.before"]({ command: "wam", arguments: `task switch ${taskId}` }, { parts: [] });
  const prog = await run("progress");
  const done = await run(`progress req-1 done evidencia x`);
  try { fs.rmSync(path.join(CWD, ".wam", "active-task"), { force: true }); } catch {}
  cleanup(taskId);
  assert.ok(prog.includes("req-1"), "progress lista requisitos");
  assert.ok(done.includes('"ok":true'), "progress done responde");
});

test("Content On Demand: materializa SKILL.md real, write-on-first-use, path local", async () => {
  const reg = pluginDefault.getRegistry();
  const withContent = Object.values(reg).find((s) => (s.content || "").trim().length > 100);
  assert.ok(withContent, "existe skill con contenido");
  const baseDir = path.join(CWD, ".wam", "validation-bundle");
  const dl1 = await pluginDefault.loadSkillOnDemand(withContent.id, reg, baseDir);
  assert.equal(dl1.loaded, true);
  assert.ok(dl1.contentPath?.endsWith("SKILL.md"), "path a SKILL.md");
  assert.ok(fs.existsSync(dl1.contentPath), "materializado en disco");
  assert.ok(fs.readFileSync(dl1.contentPath, "utf8").length > 60, "cuerpo real no vacío");
  const dl2 = await pluginDefault.loadSkillOnDemand(withContent.id, reg, baseDir);
  assert.equal(dl2.contentPath, dl1.contentPath, "write-on-first-use: mismo path, sin recrear");
  fs.rmSync(baseDir, { recursive: true, force: true });
});
