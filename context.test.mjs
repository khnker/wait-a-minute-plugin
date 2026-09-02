/**
 * Context Capsules — tests de los 3 changes:
 * context-memory-model, context-selection-budget, session-context-continuity.
 * Ejecutar: node --test context.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getSessionId,
  resetSessionCache,
  createCapsule,
  getCapsule,
  listCapsules,
  updateCapsule,
  markStale,
  invalidateCapsule,
  supersedeCapsule,
  promoteCapsule,
  selectContext,
  retrieveContext,
  closeSession,
  getSessionLog,
  resolveWamRoot,
  extractPaths,
  clearRepoCache,
} from "./context.js";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "wam-ctx-"));
const cleanup = () => fs.rmSync(ROOT, { recursive: true, force: true });

// -- Change 1: context-memory-model -----------------------------------------

test("session_id único y estable", () => {
  const sid = getSessionId(ROOT);
  assert.ok(sid.startsWith("ses_"), "prefijo ses_");
  assert.equal(getSessionId(ROOT), sid, "estable dentro de la sesión");
  resetSessionCache();
  const sid2 = getSessionId(ROOT);
  assert.equal(sid2, sid, "persistido: no se crea segunda identidad");
});

test("capsule: identidad, metadata obligatoria, nivel default L3", () => {
  const c = createCapsule({
    purpose: "Decisión de arquitectura de auth",
    scope: "auth module",
    content: "Usar JWT rotativo con refresh tokens",
    provenance: "user_decided",
    importance: 8,
  }, ROOT);
  assert.ok(c.context_id.startsWith("cap_"), "context_id único");
  assert.equal(c.level, "L3", "default conservador L3");
  assert.equal(c.lifecycle, "active", "lifecycle inicial active (conocimiento persistido)");
  assert.ok(c.session_id, "referencia session_id");
  assert.ok(c.created_at && c.updated_at, "timestamps");
  const loaded = getCapsule(c.context_id, ROOT);
  assert.equal(loaded.purpose, "Decisión de arquitectura de auth");
});

test("promoción: inferred no sube a L1 silenciosamente; con aprobación sí", () => {
  const c = createCapsule({ purpose: "Inferencia de stack", content: "stack probable node", provenance: "inferred" }, ROOT);
  const r1 = promoteCapsule(c.context_id, "L1", { root: ROOT });
  assert.equal(r1.ok, false, "inferred→L1 sin aprobación rechazada");
  assert.match(r1.reason, /aprobación/i);
  const r2 = promoteCapsule(c.context_id, "L2", { root: ROOT });
  assert.equal(r2.ok, true, "inferred→L2 permitida");
  const r3 = promoteCapsule(c.context_id, "L1", { approvedBy: "user", evidence: "confirmado en review", root: ROOT });
  assert.equal(r3.ok, true, "con aprobación explícita L1 permitida");
  assert.equal(r3.capsule.promotion.approved_by, "user");
});

test("supersession: cápsula anterior preservada pero no current", () => {
  const a = createCapsule({ purpose: "Decisión antigua", content: "SQLite", provenance: "user_decided", importance: 7 }, ROOT);
  const b = createCapsule({ purpose: "Decisión nueva", content: "Postgres", provenance: "user_decided", supersedes: a.context_id }, ROOT);
  const old = getCapsule(a.context_id, ROOT);
  assert.equal(old.lifecycle, "superseded", "anterior marcada superseded");
  assert.equal(old.superseded_by, b.context_id, "referencia a la nueva");
  const current = listCapsules(ROOT, { lifecycle: "active" });
  assert.ok(!current.some((c) => c.context_id === a.context_id), "no es current");
  assert.ok(getCapsule(a.context_id, ROOT), "sigue addressable");
});

test("stale/invalidated y niveles", () => {
  const c = createCapsule({ purpose: "Contexto temporal", content: "exploración", provenance: "inferred" }, ROOT);
  markStale(c.context_id, ROOT);
  assert.equal(getCapsule(c.context_id, ROOT).lifecycle, "stale");
  const l4 = createCapsule({ purpose: "efímero", content: "nota", level: "L4" }, ROOT);
  assert.equal(l4.level, "L4");
  const r = promoteCapsule(l4.context_id, "L2", { root: ROOT });
  assert.equal(r.ok, false, "L4 no promovible");
});

// -- Change 2: context-selection-budget -------------------------------------

test("selector: paquete específico de tarea, L1 base, relevancia > proximidad", () => {
  createCapsule({ purpose: "Auth JWT rotation", scope: "auth", content: "refresh tokens rotativos", provenance: "user_decided", importance: 8, level: "L1" }, ROOT);
  createCapsule({ purpose: "Migración Postgres", scope: "db", content: "schema migrations", provenance: "observed", importance: 6, level: "L2" }, ROOT);
  createCapsule({ purpose: "Deploy docker compose", scope: "ops", content: "orquestación", provenance: "observed", importance: 4, level: "L3" }, ROOT);

  const pkg = selectContext("implementar refresh token rotation en auth", { budget: 2000, root: ROOT });
  assert.ok(pkg.selected_ids.some((id) => /auth/i.test(getCapsule(id, ROOT).purpose)), "incluye cápsula relevante");
  assert.ok(pkg.selected_ids.length <= 3, "no incluye todo el contexto");
  const irrelevant = pkg.capsules.filter((c) => /deploy/i.test(c.purpose));
  assert.equal(irrelevant.length, 0, "contexto irrelevante excluido");
  assert.ok(pkg.budget_used <= 2000, "respeto de presupuesto");
  assert.ok(pkg.rationale.length > 0, "rationale registrado");
});

test("selector: sufficiency detecta falta de contexto crítico", () => {
  const pkg = selectContext("agregar cache redis para el scraper", { budget: 1000, root: ROOT });
  assert.equal(pkg.sufficiency, "insufficient", "cache sin cápsula → insuficiente");
  assert.ok(pkg.missing.includes("cache"), "missing declarado");
});

test("retrieveContext: no fabrica contexto", () => {
  const r = retrieveContext("fotocopiadora cuántica", { root: ROOT });
  assert.equal(r.ok, false);
  assert.match(r.message, /no se fabrica/);
});

test("selection observability: log registrado", () => {
  selectContext("token rotation", { budget: 500, root: ROOT });
  const logFile = path.join(ROOT, ".wam", "context", "selection-log.jsonl");
  assert.ok(fs.existsSync(logFile), "selection-log.jsonl existe");
  const lines = fs.readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
  assert.ok(lines.length >= 1, "al menos una entrada");
  const e = JSON.parse(lines[lines.length - 1]);
  assert.ok(e.selected_ids && e.budget_used >= 0, "ids + presupuesto registrados");
});

// -- Change 3: session-context-continuity -----------------------------------

test("session isolation: nueva sesión no hereda transcript; cápsulas L3 referencian origen", () => {
  resetSessionCache();
  const sidA = getSessionId(ROOT);
  const cap = createCapsule({ purpose: "hallazgo de sesión A", content: "exploración", provenance: "observed" }, ROOT);
  assert.equal(cap.session_id, sidA, "L3 referencian su sesión de origen");
  resetSessionCache();
  fs.rmSync(path.join(ROOT, ".wam", "session.json"), { force: true });
  const sidB = getSessionId(ROOT);
  assert.notEqual(sidB, sidA, "sesión nueva con id distinto");
  const inB = listCapsules(ROOT, { sessionId: sidB });
  assert.equal(inB.length, 0, "no hereda cápsulas de A");
});

test("closeSession: log de progreso + candidatos, sin auto-promoción", () => {
  const entry = closeSession({ sessionId: getSessionId(ROOT), taskId: "t-1", summary: "migración completa", candidates: [{ id: "req-1", title: "migrar" }] }, ROOT);
  assert.ok(entry.timestamp);
  const log = getSessionLog(ROOT);
  assert.ok(log.some((l) => l.task_id === "t-1"), "sesión registrada");
  assert.ok(!entry.auto_promoted.length, "sin auto-promoción");
});

test("cross-session retrieval: cápsula de otra sesión elegible por relevancia", () => {
  // cap L2 (de sesión A) debe entrar al paquete de una tarea en la sesión nueva
  const pkg = selectContext("cómo manejamos refresh token rotation", { budget: 2000, root: ROOT });
  const auth = pkg.capsules.find((c) => /auth/i.test(c.purpose));
  assert.ok(auth, "L2 de sesión previa recuperable por relevancia");
});

// -- Change 4: multi-repo root resolution -----------------------------------

test("resolveWamRoot: proyecto multi-repo → repo git objetivo del mensaje", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "wam-multi-"));
  const repoA = path.join(proj, "scraper");
  const repoB = path.join(proj, "frontend");
  for (const r of [repoA, repoB]) {
    fs.mkdirSync(path.join(r, "src"), { recursive: true });
    fs.writeFileSync(path.join(r, ".git"), "");
    fs.writeFileSync(path.join(r, "package.json"), JSON.stringify({ name: path.basename(r) }));
  }
  clearRepoCache();
  // term-match: prompt menciona frontend → root frontend
  assert.equal(resolveWamRoot("arregla el bug del frontend", proj), repoB);
  // path explícito → repo contenedor
  assert.equal(resolveWamRoot("revisa /frontend/src/app.tsx", proj), repoB);
  // sin match → fallback al root del proyecto
  assert.equal(resolveWamRoot("hola, ¿cómo estás?", proj), proj);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("extractPaths: rutas absolutas con extensión de código", () => {
  const paths = extractPaths('mira /home/user/app/src/index.ts y también /app/config.json:42');
  assert.deepEqual(paths, ["/home/user/app/src/index.ts", "/app/config.json"]);
});

cleanup();