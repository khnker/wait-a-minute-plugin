/**
 * Context Capsules — contexto persistente, jerárquico y recuperable.
 *
 * Cambios OpenSpec: context-memory-model, context-selection-budget,
 * session-context-continuity.
 *
 * Unidades: Context Capsules (.wam/capsules/<id>.json), identidad de sesión
 * (.wam/session.json), selector determinístico bajo presupuesto y paquete de
 * contexto por tarea. Sin vector DB ni embeddings.
 */

import fs from "node:fs";
import path from "node:path";

const LEVELS = ["L1", "L2", "L3", "L4"];
const LIFECYCLE = ["candidate", "active", "superseded", "stale", "invalidated"];
const PROVENANCE = ["user_decided", "observed", "inferred"];

let _sessionCache = null;

function capsulesDir(root) {
  return path.join(root || process.cwd(), ".wam", "capsules");
}

function sessionFile(root) {
  return path.join(root || process.cwd(), ".wam", "session.json");
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// -- Change 1: session identity -------------------------------------------------

export function getSessionId(root) {
  if (_sessionCache) return _sessionCache;
  const file = sessionFile(root);
  try {
    if (fileExists(file)) {
      const s = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (s.session_id) {
        _sessionCache = s.session_id;
        return s.session_id;
      }
    }
  } catch {}
  const sid = genId("ses");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ session_id: sid, created_at: nowIso() }, null, 2));
  } catch {}
  _sessionCache = sid;
  return sid;
}

export function resetSessionCache() {
  _sessionCache = null;
}

// -- Change 1: capsule CRUD ------------------------------------------------------

function capsuleFile(root, contextId) {
  return path.join(capsulesDir(root), `${contextId}.json`);
}

export function listCapsules(root, { level, lifecycle, sessionId } = {}) {
  const dir = capsulesDir(root);
  let ids = [];
  try {
    ids = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
  return ids
    .map((id) => getCapsule(id, root))
    .filter(Boolean)
    .filter((c) => !level || c.level === level)
    .filter((c) => !lifecycle || c.lifecycle === lifecycle)
    .filter((c) => !sessionId || c.session_id === sessionId)
    .sort((a, b) => (a.importance || 0) - (b.importance || 0));
}

export function getCapsule(contextId, root) {
  try {
    return JSON.parse(fs.readFileSync(capsuleFile(root, contextId), "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Crea una Context Capsule. `level` por defecto L3 Session (lo más conservador).
 * Provenance inferred NO puede promoverse a L1 silenciosamente (ver promoteCapsule).
 */
export function createCapsule(entry, root) {
  const contextId = entry.context_id || genId("cap");
  const level = LEVELS.includes(entry.level) ? entry.level : "L3";
  const provenance = PROVENANCE.includes(entry.provenance) ? entry.provenance : "inferred";
  const capsule = {
    context_id: contextId,
    session_id: entry.session_id || getSessionId(root),
    level,
    lifecycle: LIFECYCLE.includes(entry.lifecycle) ? entry.lifecycle : "active",
    purpose: entry.purpose || "",
    scope: entry.scope || "",
    importance: clampNum(entry.importance, 1, 10, 5),
    confidence: clampNum(entry.confidence, 0, 1, 0.5),
    provenance,
    created_at: nowIso(),
    updated_at: nowIso(),
    mutation_rate: ["low", "medium", "high"].includes(entry.mutation_rate) ? entry.mutation_rate : "medium",
    reuse_probability: ["low", "medium", "high"].includes(entry.reuse_probability)
      ? entry.reuse_probability
      : "medium",
    dependencies: Array.isArray(entry.dependencies) ? entry.dependencies : [],
    supersedes: entry.supersedes || null,
    superseded_by: null,
    retrieval_hints: Array.isArray(entry.retrieval_hints) ? entry.retrieval_hints : [],
    content: entry.content || "",
    evidence: entry.evidence || "",
  };
  persistCapsule(root, capsule);
  // supersession: la anterior deja de ser current
  if (capsule.supersedes) {
    const prior = getCapsule(capsule.supersedes, root);
    if (prior && prior.lifecycle !== "invalidated") {
      prior.lifecycle = "superseded";
      prior.superseded_by = contextId;
      prior.updated_at = nowIso();
      persistCapsule(root, prior);
    }
  }
  return capsule;
}

export function updateCapsule(contextId, patch, root) {
  const c = getCapsule(contextId, root);
  if (!c) return { ok: false, reason: `Cápsula ${contextId} no existe` };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "context_id" || k === "session_id") continue;
    if (k === "level" && !LEVELS.includes(v)) continue;
    if (k === "lifecycle" && !LIFECYCLE.includes(v)) continue;
    if (k === "provenance" && !PROVENANCE.includes(v)) continue;
    c[k] = v;
  }
  c.updated_at = nowIso();
  persistCapsule(root, c);
  return { ok: true, capsule: c };
}

export function markStale(contextId, root) {
  return updateCapsule(contextId, { lifecycle: "stale" }, root);
}

export function invalidateCapsule(contextId, root) {
  return updateCapsule(contextId, { lifecycle: "invalidated" }, root);
}

export function supersedeCapsule(oldId, newId, root) {
  const c = getCapsule(oldId, root);
  if (!c) return { ok: false, reason: `Cápsula ${oldId} no existe` };
  c.lifecycle = "superseded";
  c.superseded_by = newId;
  c.updated_at = nowIso();
  persistCapsule(root, c);
  return { ok: true };
}

/**
 * Promoción conservadora entre niveles.
 * - inferred → L1 exige aprobación explícita (approvedBy) — nunca silenciosa.
 * - L4 → descartable (no promovible).
 */
export function promoteCapsule(contextId, targetLevel, { approvedBy = "", evidence = "", root } = {}) {
  const c = getCapsule(contextId, root);
  if (!c) return { ok: false, reason: `Cápsula ${contextId} no existe` };
  if (!LEVELS.includes(targetLevel)) return { ok: false, reason: `Nivel inválido ${targetLevel}` };
  if (c.level === "L4") return { ok: false, reason: "L4 es descartable — no promovible" };
  const cur = LEVELS.indexOf(c.level);
  const tgt = LEVELS.indexOf(targetLevel);
  if (tgt >= cur) {
    return { ok: false, reason: `Promoción debe subir hacia L1 (${c.level} → ${targetLevel} es descenso o igual)` };
  }
  if (targetLevel === "L1" && c.provenance === "inferred" && !approvedBy) {
    return { ok: false, reason: "inferred no puede promoverse a L1 silenciosamente — requiere aprobación" };
  }
  c.level = targetLevel;
  c.lifecycle = "active";
  if (evidence) c.evidence = evidence;
  if (approvedBy) c.promotion = { approved_by: approvedBy, at: nowIso(), from: LEVELS[cur] };
  c.updated_at = nowIso();
  persistCapsule(root, c);
  return { ok: true, capsule: c };
}

function persistCapsule(root, capsule) {
  try {
    const dir = capsulesDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(capsuleFile(root, capsule.context_id), JSON.stringify(capsule, null, 2));
  } catch {}
}

function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// -- Change 2: context selection bajo presupuesto --------------------------------

function tokenize(text = "") {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function overlapScore(aTokens, bTokens) {
  if (!aTokens.size || !bTokens.size) return 0;
  let hit = 0;
  for (const t of bTokens) if (aTokens.has(t)) hit++;
  return hit / Math.max(aTokens.size, 1);
}

function freshness(capsule, now = Date.now()) {
  const days = Math.max(0, (now - new Date(capsule.updated_at).getTime()) / 86400000);
  return Math.max(0.1, 1 - days / 30);
}

function capsuleTokens(c) {
  return tokenize([c.purpose, c.scope, ...(c.retrieval_hints || []), c.content].join(" "));
}

function utility(capsule, taskTokens, now) {
  const relevance = overlapScore(taskTokens, capsuleTokens(capsule));
  const importance = (capsule.importance || 5) / 10;
  const fresh = freshness(capsule, now);
  const confidence = capsule.confidence || 0.5;
  const tokenCost = Math.max(1, estimateCapsuleTokens(capsule));
  return { relevance, importance, fresh, confidence, tokenCost, value: relevance * importance * fresh * confidence / tokenCost };
}

export function estimateCapsuleTokens(capsule) {
  const text = [capsule.purpose, capsule.scope, ...(capsule.retrieval_hints || []), capsule.content].join(" ");
  return Math.ceil(text.length / 4);
}

/**
 * Construye el Context Package de la tarea bajo presupuesto.
 * L1 activa = base siempre; L2/L3 por utility; dependencias resueltas;
 * redundancia eliminada; observabilidad en selection-log.jsonl.
 */
export function selectContext(task, { budget = 8000, root, sessionId, log = true } = {}) {
  const now = Date.now();
  const taskTokens = tokenize(task);
  const capsules = listCapsules(root)
    .filter((c) => c.lifecycle === "active" && c.level !== "L4");

  const selected = [];
  const rationale = [];
  let used = 0;

  // 1. L1 base (siempre)
  const l1 = capsules.filter((c) => c.level === "L1").sort((a, b) => (b.importance || 0) - (a.importance || 0));
  for (const c of l1) {
    const t = estimateCapsuleTokens(c);
    if (used + t > budget) {
      rationale.push(`${c.context_id}: L1 excede presupuesto restante (omitido)`);
      continue;
    }
    selected.push(c);
    used += t;
    rationale.push(`${c.context_id}: L1 foundation (importance ${c.importance})`);
  }

  // 2. L2/L3 por utility
  const candidates = capsules
    .filter((c) => c.level === "L2" || c.level === "L3")
    .map((c) => ({ c, ...utility(c, taskTokens, now) }))
    .filter((u) => u.relevance > 0)
    .sort((a, b) => b.value - a.value);

  const seenScopes = new Set();
  for (const u of candidates) {
    const c = u.c;
    if (c.superseded_by) {
      rationale.push(`${c.context_id}: superseded por ${c.superseded_by} (omitido)`);
      continue;
    }
    // redundancia: mismo scope normalizado ya incluido
    const scopeKey = (c.scope || c.purpose).toLowerCase().trim().slice(0, 60);
    if (seenScopes.has(scopeKey)) {
      rationale.push(`${c.context_id}: duplica scope de ${[...seenScopes].pop()} (omitido)`);
      continue;
    }
    const t = estimateCapsuleTokens(c);
    if (used + t > budget) {
      rationale.push(`${c.context_id}: excede presupuesto (utility ${u.value.toFixed(4)})`);
      continue;
    }
    selected.push(c);
    used += t;
    seenScopes.add(scopeKey);
    rationale.push(`${c.context_id}: utility ${u.value.toFixed(4)} (rel ${u.relevance.toFixed(2)} × imp ${u.importance.toFixed(2)} × fresh ${u.fresh.toFixed(2)} × conf ${u.confidence.toFixed(2)})`);
  }

  // 3. dependencias (transitivas, dedupe)
  const byId = new Map(capsules.map((c) => [c.context_id, c]));
  const seen = new Set(selected.map((c) => c.context_id));
  const queue = selected.flatMap((c) => c.dependencies || []);
  while (queue.length) {
    const depId = queue.shift();
    if (seen.has(depId)) continue;
    const dep = byId.get(depId);
    if (!dep || dep.lifecycle !== "active") continue;
    const t = estimateCapsuleTokens(dep);
    if (used + t > budget) {
      rationale.push(`${depId}: dependencia excede presupuesto (omitida)`);
      continue;
    }
    selected.push(dep);
    seen.add(depId);
    used += t;
    rationale.push(`${depId}: dependencia requerida`);
    queue.push(...(dep.dependencies || []));
  }

  // 4. sufficiency
  const critical = ["test", "migra", "auth", "token", "security", "cache", "architect", "scrap"];
  const missing = critical.filter((k) => new RegExp(k).test(task.toLowerCase()) && !selected.some((c) => new RegExp(k).test([c.purpose, c.scope, c.content].join(" "))));
  const sufficiency = missing.length === 0 ? "ok" : "insufficient";

  const pkg = {
    task,
    selected_ids: selected.map((c) => c.context_id),
    capsules: selected,
    rationale,
    budget_used: used,
    budget,
    sufficiency,
    missing,
  };

  if (log) {
    try {
      const logFile = path.join(root || process.cwd(), ".wam", "context", "selection-log.jsonl");
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify({ timestamp: nowIso(), task, selected_ids: pkg.selected_ids, budget_used: used, budget, sufficiency }) + "\n");
    } catch {}
  }
  return pkg;
}

/**
 * Recuperación bajo demanda. Distingue "no cargado" de "no existe":
 * retorna { ok, capsules, message } sin fabricar resultados.
 */
export function retrieveContext(query, { limit = 5, root } = {}) {
  const qTokens = tokenize(query);
  const hits = listCapsules(root)
    .filter((c) => c.lifecycle === "active" || c.lifecycle === "candidate")
    .map((c) => ({ c, rel: overlapScore(qTokens, capsuleTokens(c)) }))
    .filter((h) => h.rel > 0)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, limit)
    .map((h) => ({ capsule: h.c, relevance: h.rel }));
  if (!hits.length) {
    return { ok: false, capsules: [], message: `Sin cápsulas para "${query}" — contexto no disponible (no se fabrica)` };
  }
  return { ok: true, capsules: hits, message: `${hits.length} cápsula(s) encontrada(s)` };
}

// -- Change 3: session continuity -------------------------------------------------

/**
 * Cierre de sesión: registra progreso + candidatos (sin auto-promoción).
 * Retorna el log; L3 de la sesión permanece salvo promoción explícita.
 */
export function closeSession({ sessionId, taskId, summary = "", candidates = [] } = {}, root) {
  const logFile = path.join(root || process.cwd(), ".wam", "context", "sessions.log.jsonl");
  const entry = {
    timestamp: nowIso(),
    session_id: sessionId || getSessionId(root),
    task_id: taskId || null,
    summary: summary.slice(0, 2000),
    candidates,
    auto_promoted: [],
  };
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {}
  return entry;
}

export function getSessionLog(root) {
  const logFile = path.join(root || process.cwd(), ".wam", "context", "sessions.log.jsonl");
  try {
    return fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
