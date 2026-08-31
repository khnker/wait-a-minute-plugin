import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initMemory,
  updateContext,
  getOperationalContext,
  summarizeOperationalContext,
  addRecentChange,
  recordDecision,
  addConstraint,
  markStale,
  updateTaskMemory,
  redact,
} from "./memory.js";

function makeRoot() {
  const base = path.join(os.homedir(), ".cache", "wam-tests");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, "mem-"));
}

// -- Initialization (spec §20) -----------------------------------------------

test("Initialization: crea estructura .wam/ cuando no existe, sin memoria ficticia", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = initMemory(root);
  assert.equal(created, true);
  for (const d of ["context", "tasks", "skills", "cache", "history"]) {
    assert.ok(fs.existsSync(path.join(root, ".wam", d)), `falta .wam/${d}`);
  }
  assert.ok(fs.existsSync(path.join(root, ".wam", ".gitignore")));
  const contextFiles = fs.readdirSync(path.join(root, ".wam", "context"));
  assert.equal(contextFiles.length, 0, "init no debe crear conocimiento ficticio");
});

test("Initialization: idempotente", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(initMemory(root), true);
  assert.equal(initMemory(root), false);
  assert.equal(initMemory(root), false);
});

// -- Provenance (spec §2, §5) -------------------------------------------------

test("Provenance: distingue observed / inferred / user-decided", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateContext("project", "# Project Context\n\n- stack: js", { source: "observed", confidence: "high" }, root);
  updateContext("architecture", "# Architecture\n\n- layer A", { source: "inferred", confidence: "medium" }, root);
  updateContext("decisions", "# Decisions\n\n- regla", { source: "user-decided", confidence: "high" }, root);
  const c = getOperationalContext(root);
  assert.equal(c.project.meta.source, "observed");
  assert.equal(c.architecture.meta.source, "inferred");
  assert.equal(c.decisions.meta.source, "user-decided");
});

// -- Updates (spec §9, §19) ---------------------------------------------------

test("Updates: actualiza solo el doc afectado", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateContext("project", "# Project Context\n\n- stack: js", { source: "observed", confidence: "high" }, root);
  addRecentChange({ date: "2026-08-31", scope: "Auth", changes: ["added refresh rotation"], verification: "tests: passed" }, root);
  const c = getOperationalContext(root);
  assert.ok(c.recentChanges.body.includes("2026-08-31"));
  assert.equal(c.project.body.trim(), "# Project Context\n\n- stack: js");
});

test("Updates: recent-changes sin duplicados", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  const a = addRecentChange({ date: "2026-08-31", scope: "Auth", changes: ["x"], verification: "ok" }, root);
  const b = addRecentChange({ date: "2026-08-31", scope: "Auth", changes: ["x"], verification: "ok" }, root);
  assert.equal(a.skipped, undefined);
  assert.equal(b.skipped, true);
  const c = getOperationalContext(root);
  assert.equal((c.recentChanges.body.match(/2026-08-31/g) || []).length, 1);
});

// -- Decisiones y autoridad (spec §7, §10) ------------------------------------

test("Decisiones: preserva user-decided ante inferencia de menor autoridad", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  recordDecision({ id: "ADR-001", decision: "PostgreSQL", status: "accepted", source: "user-decided", confidence: "high" }, root);
  const r = recordDecision({ id: "ADR-001", decision: "MySQL en vez de PostgreSQL", source: "inferred", confidence: "low" }, root);
  assert.equal(r.preserved, "user-decided");
  assert.equal(r.conflicting, true);
  const c = getOperationalContext(root);
  assert.ok(c.decisions.body.includes("PostgreSQL"));
  assert.ok(!c.decisions.body.includes("MySQL"));
});

test("Decisiones: actualiza en lugar de duplicar", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  recordDecision({ id: "ADR-002", decision: "X v1", source: "observed", confidence: "high" }, root);
  recordDecision({ id: "ADR-002", decision: "X v2", source: "observed", confidence: "high" }, root);
  const c = getOperationalContext(root);
  assert.equal((c.decisions.body.match(/## ADR-002/g) || []).length, 1);
  assert.ok(c.decisions.body.includes("X v2"));
});

test("Constraints: sin duplicados y preserva user-decided", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  addConstraint("no introducir nuevas dependencias", { source: "user-decided", confidence: "high" }, root);
  const r = addConstraint("no introducir nuevas dependencias", { source: "inferred", confidence: "low" }, root);
  assert.equal(r.preserved, "user-decided");
  const c = getOperationalContext(root);
  assert.equal((c.constraints.body.match(/no introducir nuevas dependencias/g) || []).length, 1);
});

// -- Staleness (spec §11) ------------------------------------------------------

test("Staleness: marca obsoleto sin sobrescribir decisión explícita", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  recordDecision({ id: "ADR-003", decision: "Sin redis", source: "user-decided", confidence: "high" }, root);
  const r = markStale("decisions", { lastVerified: "2026-08-01T00:00:00.000Z" }, root);
  assert.equal(r.status, "stale");
  const c = getOperationalContext(root);
  assert.equal(c.decisions.meta.status, "stale");
  assert.ok(c.decisions.body.includes("Sin redis"));
  assert.ok(c.decisions.body.includes("user-decided"));
});

// -- Task isolation (spec §14) -------------------------------------------------

test("Task isolation: una tarea no contamina otra", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateTaskMemory("task-a", { summary: "sum a", evidence: "ev a" }, root);
  updateTaskMemory("task-b", { summary: "sum b" }, root);
  const sa = fs.readFileSync(path.join(root, ".wam", "tasks", "task-a", "summary.md"), "utf8");
  const sb = fs.readFileSync(path.join(root, ".wam", "tasks", "task-b", "summary.md"), "utf8");
  assert.ok(sa.includes("sum a"));
  assert.ok(sb.includes("sum b"));
  assert.ok(!sb.includes("sum a"));
  assert.ok(fs.existsSync(path.join(root, ".wam", "tasks", "task-a", "evidence.md")));
  assert.ok(!fs.existsSync(path.join(root, ".wam", "tasks", "task-b", "evidence.md")));
});

// -- Recovery (spec §13, §20) --------------------------------------------------

test("Recovery: recupera contexto operacional de ejecución anterior", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateContext("project", "# Project Context\n\n- stack: node", { source: "observed", confidence: "high" }, root);
  addRecentChange({ date: "2026-08-31", scope: "Auth", changes: ["nuevo"], verification: "ok" }, root);
  recordDecision({ id: "ADR-004", decision: "Y", source: "user-decided", confidence: "high" }, root);
  const c = getOperationalContext(root);
  assert.ok(c.project.body.includes("stack: node"));
  assert.ok(c.recentChanges.body.includes("2026-08-31"));
  assert.ok(c.decisions.body.includes("ADR-004"));
  assert.ok(summarizeOperationalContext(root).length > 0);
});

// -- Security (spec §19, §20) --------------------------------------------------

test("Security: secretos redactados en redact()", () => {
  assert.equal(redact("api_key=supersecretvalue123"), "api_key= <redacted>");
  assert.equal(redact("token = abcdefgh12345678"), "token = <redacted>");
  assert.equal(redact("ghp_abcdefghijklmnopqrstuvwxyz"), "<redacted>");
  assert.equal(redact("texto normal sin secretos"), "texto normal sin secretos");
});

test("Security: secretos no persistidos en context docs ni task memory", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateContext(
    "project",
    "# Project Context\n\napi_key=abcdefgh123456\npassword=xyz12345",
    { source: "observed", confidence: "high" },
    root
  );
  const c = getOperationalContext(root);
  assert.ok(!c.project.body.includes("abcdefgh123456"));
  assert.ok(!c.project.body.includes("xyz12345"));
  assert.ok(c.project.body.includes("<redacted>"));
  updateTaskMemory("task-sec", { summary: "token=abc123456789\nok" }, root);
  const s = fs.readFileSync(path.join(root, ".wam", "tasks", "task-sec", "summary.md"), "utf8");
  assert.ok(!s.includes("abc123456789"));
});

// -- Human-readable / exports (spec §15) ---------------------------------------

test("Formato: docs legibles y frontmatter YAML parseable", (t) => {
  const root = makeRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initMemory(root);
  updateContext("architecture", "# Architecture\n\n- capa", { source: "observed", confidence: "high" }, root);
  const raw = fs.readFileSync(path.join(root, ".wam", "context", "architecture.md"), "utf8");
  assert.ok(raw.startsWith("---"));
  assert.ok(raw.includes("source: observed"));
  assert.ok(raw.includes("last_verified:"));
});
