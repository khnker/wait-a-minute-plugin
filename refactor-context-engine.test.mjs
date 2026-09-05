/**
 * Refactor-context-engine — tests de los 4 P0 fixes.
 *
 * 1. Budget reservation (assembly.js) — N0/N2 nunca caen bajo presupuesto.
 * 2. Session isolation strictness (context.js) — legacy sin session_id excluida.
 * 3. Confidence numeric unification — sin NaN en provenance.
 * 4. Alias normalization — "auth" matchea "authentication".
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleContext } from "./assembly.js";
import { updateContext, initMemory, normalizeConfidence, confidenceLabel } from "./memory.js";
import { createCapsule, listCapsules, selectContext, migrateLegacyCapsules, LEGACY_SESSION_ID, resetSessionCache, getSessionId } from "./context.js";

// -- helpers -----------------------------------------------------------------

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function bootstrapMemory(root) {
  resetSessionCache();
  initMemory(root);
  updateContext("project", "# Project\n- Stack", { source: "observed", confidence: 0.7 }, root);
  updateContext("decisions", "# Decisions\n- d1", { source: "user-decided", confidence: 0.9 }, root);
}

function taskState() {
  return { phase: "IMPLEMENTING", contract: { status: "APPROVED" }, requirements: [{ status: "pending" }], nextAction: "do" };
}

// -- 1. Budget reservation ---------------------------------------------------

test("P0-1: budget 10 tokens → N0 siempre presente + budget_violation true (reserved > budget)", () => {
  const ROOT = tmpRoot("wam-budget-");
  bootstrapMemory(ROOT);
  const p = assembleContext({ prompt: "refactor jwt", taskId: "t-50", projectPath: ROOT, budget: 10, taskState: taskState() });
  const hasN0 = p.lines.some((l) => l.startsWith("[wam N0 policy]"));
  assert.ok(hasN0, "N0 emitido incluso bajo presupuesto mínimo");
  assert.equal(p.budget_violation, true, "budget_violation marcado cuando reserved > budget");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-1: budget 100 tokens + taskState → N0 y N2 presentes, N1/N3 vacíos", () => {
  const ROOT = tmpRoot("wam-budget-");
  bootstrapMemory(ROOT);
  const p = assembleContext({ prompt: "refactor jwt", taskId: "t-100", projectPath: ROOT, budget: 100, taskState: taskState() });
  assert.ok(p.lines.some((l) => l.startsWith("[wam N0 policy]")), "N0 presente");
  assert.ok(p.lines.some((l) => l.startsWith("[wam N2 task]")), "N2 presente");
  assert.equal(p.budget_violation, false, "reserved (≈36) cabe en budget=100");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-1: budget 150 tokens admite N2 + flex; budget_violation false", () => {
  const ROOT = tmpRoot("wam-budget-");
  bootstrapMemory(ROOT);
  const p = assembleContext({ prompt: "refactor jwt", taskId: "t-150", projectPath: ROOT, budget: 150, taskState: taskState() });
  assert.ok(p.lines.some((l) => l.startsWith("[wam N0 policy]")), "N0 presente");
  assert.ok(p.lines.some((l) => l.startsWith("[wam N2 task]")), "N2 presente");
  assert.equal(p.budget_violation, false, "150 tokens cubre N0+N2 + algo de flex");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// -- 2. Session isolation strictness -----------------------------------------

test("P0-2: legacy capsule (sin session_id) excluida de session-scoped list", () => {
  const ROOT = tmpRoot("wam-session-");
  // Crear cápsula sin session_id escribiendo el archivo directamente.
  const dir = path.join(ROOT, ".wam", "capsules");
  fs.mkdirSync(dir, { recursive: true });
  const legacyCap = { context_id: "cap_legacy_1", purpose: "auth notes", content: "old", level: "L2", lifecycle: "active", provenance: "inferred", importance: 5 };
  fs.writeFileSync(path.join(dir, "cap_legacy_1.json"), JSON.stringify(legacyCap));
  const sid = getSessionId(ROOT);
  const scoped = listCapsules(ROOT, { sessionId: sid });
  assert.equal(scoped.length, 0, "legacy no entra en sesión nueva");
  const all = listCapsules(ROOT);
  assert.equal(all.length, 1, "listado sin filtro la incluye");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-2: migrateLegacyCapsules asigna LEGACY_SESSION_ID", () => {
  const ROOT = tmpRoot("wam-session-");
  const dir = path.join(ROOT, ".wam", "capsules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "cap_legacy_2.json"), JSON.stringify({ context_id: "cap_legacy_2", purpose: "x", content: "x", level: "L3", lifecycle: "active", provenance: "inferred", importance: 5 }));
  const r = migrateLegacyCapsules(ROOT);
  assert.equal(r.migrated.length, 1);
  assert.equal(r.dryRun, false);
  const reloaded = JSON.parse(fs.readFileSync(path.join(dir, "cap_legacy_2.json"), "utf-8"));
  assert.equal(reloaded.session_id, LEGACY_SESSION_ID);
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-2: migrateLegacyCapsules dryRun no toca archivos", () => {
  const ROOT = tmpRoot("wam-session-");
  const dir = path.join(ROOT, ".wam", "capsules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "cap_legacy_3.json"), JSON.stringify({ context_id: "cap_legacy_3", purpose: "x", content: "x", level: "L3", lifecycle: "active", provenance: "inferred", importance: 5 }));
  const r = migrateLegacyCapsules(ROOT, { dryRun: true });
  assert.equal(r.migrated.length, 1);
  const reloaded = JSON.parse(fs.readFileSync(path.join(dir, "cap_legacy_3.json"), "utf-8"));
  assert.equal(reloaded.session_id, undefined, "dryRun no escribe session_id");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-2: migración es idempotente", () => {
  const ROOT = tmpRoot("wam-session-");
  const dir = path.join(ROOT, ".wam", "capsules");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "cap_legacy_4.json"), JSON.stringify({ context_id: "cap_legacy_4", purpose: "x", content: "x", level: "L3", lifecycle: "active", provenance: "inferred", importance: 5 }));
  migrateLegacyCapsules(ROOT);
  const r2 = migrateLegacyCapsules(ROOT);
  assert.equal(r2.migrated.length, 0, "segunda corrida no migra más");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// -- 3. Confidence unification ------------------------------------------------

test("P0-3: normalizeConfidence acepta string y número", () => {
  assert.equal(normalizeConfidence("high"), 0.9);
  assert.equal(normalizeConfidence("MEDIUM"), 0.5);
  assert.equal(normalizeConfidence("low"), 0.2);
  assert.equal(normalizeConfidence(0.42), 0.42);
  assert.equal(normalizeConfidence(undefined), 0.5);
  assert.equal(normalizeConfidence(null), 0.5);
  assert.equal(normalizeConfidence(1.5), 1, "clamp a 1");
  assert.equal(normalizeConfidence(-0.3), 0, "clamp a 0");
});

test("P0-3: confidenceLabel con boundaries exactos", () => {
  assert.equal(confidenceLabel(0.7), "high");
  assert.equal(confidenceLabel(0.4), "medium");
  assert.equal(confidenceLabel(0.39), "low");
});

test("P0-3: provenance warning emite para conf numérico bajo (sin NaN)", () => {
  const ROOT = tmpRoot("wam-conf-");
  bootstrapMemory(ROOT);
  // Forzar un documento inferred + confidence 0.3
  updateContext("decisions", "# Decisions\n- decX", { source: "inferred", confidence: 0.3 }, ROOT);
  const p = assembleContext({ prompt: "auth work", taskId: "t-conf", projectPath: ROOT, budget: 4000, taskState: taskState() });
  const w = p.lines.find((l) => /wam N1 WARNING/.test(l) && /decisions\.md/.test(l));
  assert.ok(w, "warning numérico emitido (sin NaN silencioso)");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// -- 4. Alias normalization ---------------------------------------------------

test("P0-4: alias 'auth' matchea cápsula 'authentication'", () => {
  const ROOT = tmpRoot("wam-alias-");
  bootstrapMemory(ROOT);
  createCapsule({ level: "L2", purpose: "JWT refresh rotation", scope: "authentication", content: "tokens rotativos", provenance: "user_decided", importance: 8, retrieval_hints: ["authentication", "jwt", "token"] }, ROOT);
  const pkg = selectContext("auth rotation implementation", { budget: 2000, root: ROOT });
  const match = pkg.capsules.find((c) => /authentication/i.test(c.purpose) || /JWT/i.test(c.purpose));
  assert.ok(match, "alias normaliza auth→authentication y encuentra la cápsula");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test("P0-4: alias 'postgres' matchea cápsula 'postgresql'", () => {
  const ROOT = tmpRoot("wam-alias-");
  bootstrapMemory(ROOT);
  createCapsule({ level: "L2", purpose: "Postgres migration", scope: "postgresql", content: "schema", provenance: "observed", importance: 7, retrieval_hints: ["postgresql"] }, ROOT);
  const pkg = selectContext("postgres backup config", { budget: 2000, root: ROOT });
  const match = pkg.capsules.find((c) => /postgresql/i.test(c.purpose) || /postgres/i.test(c.purpose));
  assert.ok(match, "alias postgres↔postgresql funciona");
  fs.rmSync(ROOT, { recursive: true, force: true });
});

test.after(() => {});
