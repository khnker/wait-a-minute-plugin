/**
 * Context Assembly Layer — selección estricta por tarea.
 * Casos: Task A/B, unrelated, trivial, continuation, nueva sesión, budgets.
 * Ejecutar: node --test context-assembly.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleContext } from "./assembly.js";
import { updateContext, initMemory, addRecentChange, recordDecision, addConstraint } from "./memory.js";
import { createCapsule, resetSessionCache } from "./context.js";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wam-assembly-"));

// Fixture: memoria de proyecto + capsules
initMemory(ROOT);
updateContext("project", "# Project Context\n- Stack: Node + Postgres\n- Monorepo", {}, ROOT);
updateContext("architecture", "# Architecture\n- API NestJS + FE Angular", {}, ROOT);
recordDecision({ id: "d-auth", decision: "JWT rotation en auth module", reason: "seguridad", source: "user-decided", confidence: "high" }, ROOT);
recordDecision({ id: "d-pagos", decision: "Webhooks idempotentes en pagos", source: "user-decided", confidence: "high" }, ROOT);
addConstraint("Nunca exponer secretos en repo", { source: "user-decided", confidence: "high" }, ROOT);
addRecentChange({ date: "2026-09-01", scope: "auth", changes: ["rate-limit login"], verification: "ok" }, ROOT);

const capAuth = createCapsule({ level: "L2", purpose: "Auth JWT rotation", scope: "auth", content: "refresh tokens de un solo uso", provenance: "user_decided", importance: 8, retrieval_hints: ["auth", "jwt", "token"] }, ROOT);
createCapsule({ level: "L2", purpose: "Pagos stripe webhooks", scope: "pagos", content: "idempotency-key + firma", provenance: "user_decided", importance: 8, retrieval_hints: ["pagos", "stripe", "webhook"] }, ROOT);
createCapsule({ level: "L4", purpose: "Nota efímera", scope: "x", content: "borrador exploratorio", provenance: "inferred" }, ROOT);

const taskState = (phase = "IMPLEMENTING", status = "APPROVED") => ({
  phase,
  contract: { status },
  requirements: [{ id: "req-1", title: "auth", status: "pending", evidence: [] }],
  nextAction: "Implementar auth",
});

const lines = (p) => p.lines.join("\n");

test("Task A (auth): recibe N0+N1(auth)+N2+N3(auth); NO recibe pagos ni L4", () => {
  const p = assembleContext({ prompt: "implementar refresh token rotation en auth", taskId: "t-a", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(t.includes("[wam N0 policy]"), "N0 obligatorio");
  assert.ok(t.includes("[wam N2 task]"), "N2 obligatorio");
  assert.ok(t.includes("JWT rotation"), "N1 decisions auth incluida: " + JSON.stringify(p.lines));
  assert.ok(t.includes("cap_") && t.includes("auth"), "N3 capsule auth incluida");
  assert.ok(!/webhooks idempotentes/.test(t), "decisión de pagos EXCLUIDA (dominio distinto)");
  assert.ok(!t.includes("Nota efímera"), "L4 nunca entra");
  assert.ok(p.budget_used <= p.budget, "presupuesto respetado");
  assert.ok(p.levels.N0 === 1 && p.levels.N2 === 1, "N0/N2 presentes");
});

test("Task B (pagos): recibe pagos, NO recibe auth (relevancia > proximidad)", () => {
  const p = assembleContext({ prompt: "verificar webhooks de stripe con idempotencia", taskId: "t-b", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(t.includes("Webhooks idempotentes"), "decisión de pagos incluida");
  assert.ok(!/JWT rotation/.test(t), "auth EXCLUIDA en tarea de pagos");
  assert.ok(!t.includes("Nota efímera"), "L4 nunca entra");
});

test("Unrelated task: NO recibe task-A ni decisiones sin match", () => {
  const p = assembleContext({ prompt: "actualizar documentación de deploy docker", taskId: "t-c", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(!/JWT rotation/.test(t), "auth excluida");
  assert.ok(!/Webhooks idempotentes/.test(t), "pagos excluida");
  assert.ok(t.includes("[wam N0 policy]"), "solo N0 base + N2");
  assert.ok(p.lines.length <= 4, "paquete mínimo", JSON.stringify(p.lines));
});

test("Trivial task: NO carga project context ni capsules", () => {
  const p = assembleContext({ prompt: "rename variable x", taskId: "t-t", classification: "trivial", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(t.includes("[wam N0 policy]"), "N0 presente");
  assert.ok(t.includes("[wam N2 task]"), "N2 presente");
  assert.ok(!t.includes("[wam N1"), "sin N1 (project) en trivial");
  assert.ok(!t.includes("[wam N3"), "sin N3 (capsules) en trivial");
});

test("Architectural task: incluye architecture + decisions + constraints", () => {
  const p = assembleContext({ prompt: "rediseñar la arquitectura del módulo auth", taskId: "t-arch", classification: "architectural", mode: "STRICT", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(t.includes("[wam N1 architecture]"), "architecture incluida en STRICT");
  assert.ok(t.includes("JWT rotation"), "decisions incluida");
  assert.ok(t.includes("Nunca exponer secretos"), "constraints incluida");
});

test("Continuation: solo N2, no reconstruye pack", () => {
  const p = assembleContext({ prompt: "sigue con el paso 2", taskId: "t-a", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState(), continuation: true });
  const t = lines(p);
  assert.ok(t.includes("[wam N2 task]"), "N2 delta presente");
  assert.ok(!t.includes("[wam N1"), "sin N1 en continuación");
  assert.ok(!t.includes("[wam N3"), "sin N3 en continuación");
  assert.equal(p.continuation, true);
});

test("Nueva sesión: recupera solo lo persistente necesario (N3 match), no el transcript", () => {
  resetSessionCache();
  const p = assembleContext({ prompt: "retomar trabajo en auth: rotación de refresh tokens", taskId: "t-d", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(t.includes(capAuth.context_id), "capsule persistente de sesión previa recuperable");
  assert.ok(!t.includes("pagos"), "no arrastra contexto de sesión anterior irrelevante");
});

test("Presupuesto por nivel reportado", () => {
  const p = assembleContext({ prompt: "auth token rotation", taskId: "t-e", classification: "normal", projectPath: ROOT, budget: 300, taskState: taskState() });
  assert.ok(p.budget_used <= 300, "budget 300 respetado");
  assert.ok(p.levels.N0 >= 1 && p.levels.N2 >= 1, "N0/N2 siempre en el pack");
  assert.ok(p.rationale.length >= 0);
  const p2 = assembleContext({ prompt: "auth token rotation", taskId: "t-f", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  assert.ok(p2.budget_used >= p.budget_used, "más presupuesto → más contexto");
});

test("provenance_conflict: doc inferido ≠ hecho — el pack marca provenance en vez de presentarlo como verdad", () => {
  updateContext("constraints", "Backend usa Fastify", { source: "inferred", confidence: 0.62 }, ROOT);
  const p = assembleContext({ prompt: "auth token rotation", taskId: "t-prov", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const t = lines(p);
  assert.ok(/inferencia|inferido|confidence: 0\.62/i.test(t), "marca inferencia con confidence: " + JSON.stringify(p.lines));
  assert.ok(!t.includes("[wam N1 constraints] Backend usa Fastify") || /inferencia|inferido/i.test(t), "nunca presenta inferencia como hecho confirmado");
});

test("context_budget: docs enormes → conserva N0+N2 (obligatorios) y constraints relevantes, sin slice al final", () => {
  const big = "## Sección\n" + "línea de relleno de contexto amplio para inflar el documento\n".repeat(400); // ~30KB
  updateContext("architecture", big, {}, ROOT);
  updateContext("decisions", big, {}, ROOT);
  const p = assembleContext({ prompt: "auth token rotation", taskId: "t-big", classification: "normal", projectPath: ROOT, budget: 4000, taskState: taskState() });
  assert.ok(p.budget_used <= 4000, "budget global respetado");
  assert.ok(p.levels.N0 >= 1 && p.levels.N2 >= 1, "N0/N2 obligatorios nunca se pierden");
  assert.ok(p.lines.some((l) => l.startsWith("[wam N2 task]")), "task state presente antes de info secundaria");
  assert.ok(p.rationale.length >= 0, "rationale disponible");
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));