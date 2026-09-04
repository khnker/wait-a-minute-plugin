import fs from "fs";
import path from "path";
import { cavemanify } from "./engine.js";

const StorageProvider = {
  read: (p) => fs.readFileSync(p, "utf-8"),
  write: (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data, "utf-8"); },
  exists: (p) => fs.existsSync(p),
  readdir: (p) => fs.readdirSync(p),
  rm: (p, opts) => fs.rmSync(p, opts)
};

// -- Operational Memory for Wait a Minute (WAM) ----------------------------
// Memoria operacional persistente, legible por humanos, en .wam/.
// Conocimiento DERIVADO: no es fuente de verdad (spec operational-memory).
// Task state canonical: .wam/tasks/<id>/state.yaml (engine.js) — este módulo
// deriva artifacts humanos (evidence.md/summary.md) sin reemplazarlo.

const CONTEXT_FILES = {
  project: "project.md",
  architecture: "architecture.md",
  recentChanges: "recent-changes.md",
  decisions: "decisions.md",
  constraints: "constraints.md",
};

const WAM_DIRS = ["context", "tasks", "skills", "cache", "history"];

const WAM_GITIGNORE = `# .wam — memoria operacional (spec §17, versionado configurable)
# Candidato a versionar (conocimiento operacional estable):
#   context/project.md
#   context/architecture.md
#   context/decisions.md
#   context/constraints.md
# Normalmente regenerable / runtime (ignorar):
cache/
tasks/
history/
skills/
.engram/
`;

const SECRET_PATTERNS = [
  /(api[_-]?key|apikey|token|secret|password|passwd|bearer|authorization|auth)\s*[:=]\s*["']?[A-Za-z0-9_\-./]{8,}["']?/gi,
  /\b(sk|pk|ghp|github_pat)_[A-Za-z0-9_\-]{12,}\b/g,
];

const VALID_SOURCES = new Set(["observed", "inferred", "user-decided"]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

// -- helpers -----------------------------------------------------------------

function rootDir(root) {
  return root || process.cwd();
}

function contextDir(root) {
  return path.join(rootDir(root), ".wam", "context");
}

function nowIso() {
  return new Date().toISOString();
}

export function redact(text = "") {
  if (!text) return text;
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m) => {
      const sep = m.search(/[:=]/);
      if (sep === -1) return "<redacted>";
      return m.slice(0, sep + 1) + " <redacted>";
    });
  }
  return out;
}

function splitFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content || "");
  if (!m) return { meta: {}, body: content || "" };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      v.length >= 2 &&
      ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    ) {
      v = v.slice(1, -1);
    }
    meta[k] = v;
  }
  return { meta, body: m[2] || "" };
}

function frontmatter(meta) {
  const keys = ["source", "confidence", "last_verified", "status"];
  const lines = ["---"];
  for (const k of keys) {
    const v = meta[k];
    if (v === undefined || v === null || v === "") continue;
    lines.push(`${k}: ${String(v).includes(" ") ? `"${v}"` : v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function resolveDoc(doc) {
  if (CONTEXT_FILES[doc]) return CONTEXT_FILES[doc];
  if (typeof doc === "string" && doc.endsWith(".md")) return doc;
  return `${doc}.md`;
}

function readDoc(doc, root) {
  const file = path.join(contextDir(root), resolveDoc(doc));
  if (!StorageProvider.exists(file)) return { file, meta: {}, body: "" };
  return { file, ...splitFrontmatter(StorageProvider.read(file)) };
}

function sectionsOf(body) {
  return (body || "")
    .split("\n## ")
    .map((p, i) => (i === 0 ? p : `## ${p}`))
    .filter((p) => p.trim());
}

function firstLine(s) {
  // primera línea INFORMATIVA: salta headings (#/##) y líneas vacías
  const m = (s || "").split("\n").find((l) => l.trim() && !/^#+\s/.test(l.trim()));
  return m ? m.trim() : "";
}

// -- init (espec §3: solo estructura, sin contenido ficticio, idempotente) ---

export function initMemory(root) {
  const wam = path.join(rootDir(root), ".wam");
  const created = !StorageProvider.exists(wam);
  if (created) {
    for (const d of WAM_DIRS) {
      if (d !== "context") {
        StorageProvider.write(path.join(wam, d, ".gitkeep"), "");
      } else {
        fs.mkdirSync(path.join(wam, d), { recursive: true });
      }
    }
    const gi = path.join(wam, ".gitignore");
    if (!StorageProvider.exists(gi)) StorageProvider.write(gi, WAM_GITIGNORE);
  }
  return created;
}

// -- context docs (espec §4-§8, §15) ----------------------------------------

export function updateContext(doc, body, metadata = {}, root) {
  const meta = {
    source: VALID_SOURCES.has(metadata.source) ? metadata.source : "observed",
    confidence: VALID_CONFIDENCE.has(metadata.confidence) ? metadata.confidence : "low",
    last_verified: metadata.last_verified || nowIso(),
    status: metadata.status || "current",
  };
  const file = path.join(contextDir(root), resolveDoc(doc));
  StorageProvider.write(file, frontmatter(meta) + "\n" + redact(String(body)).trim() + "\n");
  return { ok: true, file };
}

export function markStale(doc, { lastVerified } = {}, root) {
  const { file, meta, body } = readDoc(doc, root);
  if (!StorageProvider.exists(file)) return { ok: false, reason: "doc no existe" };
  meta.status = "stale";
  meta.last_verified = lastVerified || new Date(Date.now() - 30 * 86400000).toISOString();
  StorageProvider.write(file, frontmatter(meta) + "\n" + body.trim() + "\n");
  return { ok: true, file, status: "stale" };
}

export function addRecentChange({ date, scope, changes = [], verification = "" } = {}, root) {
  if (!date) return { ok: false, reason: "date requerido" };
  const { body } = readDoc("recentChanges", root);
  const heading = `## ${date}${scope ? ` — ${scope}` : ""}`;
  if ((body || "").includes(heading)) return { ok: true, skipped: true };
  const section = [
    heading,
    ...changes.map((c) => `- ${c}`),
    ...(verification ? ["", `Verification: ${verification}`] : []),
  ].join("\n");
  const sections = sectionsOf(body);
  const header =
    sections.length && sections[0].trim() === "# Recent Changes"
      ? sections[0].trim()
      : "# Recent Changes";
  const rest = sections.slice(1);
  const all = [header, section, ...rest];
  return updateContext(
    "recentChanges",
    all.join("\n\n"),
    {
      source: "observed",
      confidence: "high",
      last_verified: /^\d{4}-\d{2}-\d{2}/.test(date)
        ? `${date}T00:00:00.000Z`
        : nowIso(),
    },
    root
  );
}

function parseDecisionEntries(body) {
  const list = [];
  for (const p of sectionsOf(body)) {
    const idm = /^##\s+(.+)$/m.exec(p);
    if (!idm) continue;
    const srcm = /^- source:\s*(.+)$/m.exec(p);
    const id = idm[1].trim();
    list.push({ id, source: srcm ? srcm[1].trim() : "inferred", raw: p });
  }
  return list;
}

function renderDecisionEntry(d) {
  return [
    `## ${d.id}`,
    `- date: ${d.date}`,
    `- status: ${d.status}`,
    `- source: ${d.source}`,
    `- confidence: ${d.confidence}`,
    `- decision: ${d.decision}`,
    ...(d.reason ? [`- reason: ${d.reason}`] : []),
  ].join("\n");
}

// espe §7 + §10: preserva user-decided ante inferencias de menor autoridad
export function recordDecision(entry = {}, root) {
  const { id, decision } = entry;
  if (!id || !decision) return { ok: false, reason: "id y decision requeridos" };
  const source = VALID_SOURCES.has(entry.source) ? entry.source : "inferred";
  const { body } = readDoc("decisions", root);
  const entries = parseDecisionEntries(body);
  const prior = entries.find((e) => e.id === id);
  if (prior && prior.source === "user-decided" && source !== "user-decided") {
    return { ok: true, preserved: "user-decided", conflicting: true };
  }
  const cleaned = entries.filter((e) => e.id !== id).map((e) => e.raw);
  const rendered = renderDecisionEntry({
    id,
    date: entry.date || nowIso().slice(0, 10),
    status: entry.status || "accepted",
    source,
    confidence: VALID_CONFIDENCE.has(entry.confidence) ? entry.confidence : "medium",
    decision,
    reason: entry.reason || "",
  });
  const newBody = ["# Decisions", ...cleaned, rendered].join("\n\n");
  return updateContext(
    "decisions",
    newBody,
    { source, confidence: entry.confidence || "medium" },
    root
  );
}

export function addConstraint(text, { source = "inferred", confidence = "medium", lastVerified } = {}, root) {
  if (!text) return { ok: false, reason: "text requerido" };
  const safe = redact(String(text).trim());
  const { body } = readDoc("constraints", root);
  const lines = (body || "").split("\n").filter((l) => l.trim());
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const existing = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/^\-\s+/, ""));
  const dup = existing.find((l) => norm(l.replace(/\s*\[source:.*$/, "")) === norm(safe));
  if (dup) {
    if (/source:\s*user-decided/.test(dup) && source !== "user-decided") {
      return { ok: true, preserved: "user-decided", conflicting: true };
    }
    return { ok: true, skipped: true };
  }
  const entry = `- ${safe} [source: ${source} | confidence: ${confidence} | last_verified: ${lastVerified || nowIso()}]`;
  const newBody = ["# Constraints", ...lines, entry].join("\n");
  return updateContext("constraints", newBody, { source, confidence }, root);
}

// -- task memory (espec §14, derivado de state.yaml — no duplica la fuente) --

export function updateTaskMemory(taskId, { evidence = "", summary = "" } = {}, root) {
  if (!taskId) return { ok: false, reason: "taskId requerido" };
  const dir = path.join(rootDir(root), ".wam", "tasks", taskId);
  StorageProvider.write(path.join(dir, ".gitkeep"), "");
  if (evidence) StorageProvider.write(path.join(dir, "evidence.md"), redact(evidence).trim() + "\n");
  if (summary) {
    StorageProvider.write(path.join(dir, "summary.md"), redact(summary).trim() + "\n");
    StorageProvider.write(path.join(dir, "caveman-summary.md"), cavemanify(redact(summary)).trim() + "\n");
  }
  return { ok: true, dir };
}

// -- contexto vivo (auto-adaptativo a la tarea en ejecución) ----------------

/**
 * Snapshot vivo de la tarea activa en .wam/tasks/<taskId>/context.md.
 * Se actualiza en cada mensaje (chat.message) y se sobreescribe al cambiar
 * de tarea — el contexto siempre refleja lo que el agente está ejecutando.
 * Taxonomía WAM: artifacts de ejecución viven bajo tasks/<id>/, no bajo
 * context/. context/ se reserva para conocimiento operacional estable
 * (project/architecture/decisions/constraints).
 */
export function updateLiveContext(taskId, state = {}, root) {
  const dir = path.join(rootDir(root), ".wam", "tasks", taskId);
  const reqs = state.requirements || [];
  const pend = reqs.filter((r) => r.status !== "done" && r.status !== "verified").length;
  const unverified = reqs.filter((r) => r.status === "done").length;
  const unknowns = (state.unknowns || []).filter((u) => u.status === "blocking");
  const body = [
    "# Live Task Context",
    `task: ${taskId} — ${state.phase || "?"} / ${state.contract?.status || "?"}`,
    `req: ${pend} pend${unverified ? ` | ${unverified} sin verificar` : ""} de ${reqs.length}`,
    `next: ${state.nextAction || "—"}`,
    ...(unknowns.length ? [`blocking: ${unknowns.map((u) => `${u.id} ${u.question || u.statement}`).join(" | ")}`] : []),
  ].join("\n");
  StorageProvider.write(path.join(dir, "context.md"), body + "\n");
  return { ok: true };
}

// -- recuperación de contexto (espec §13) -----------------------------------

const SUBPROJ_SKIP = new Set(["node_modules", ".git", ".wam", "upstream", ".cache", "dist", "build", "coverage", ".next", "vendor"]);

/**
 * Detecta subproyectos (repos git hijos) con package.json bajo el root.
 * Útil cuando el root es multi-repo sin stack propio (ej. comparador-precios
 * con backend/frontend/scraper) — la raíz no tiene package.json pero los
 * repos hijos sí. Cada repo se reporta con su lenguaje dominante.
 */
function detectSubprojects(root, maxDepth = 2) {
  const out = [];
  const seen = new Set();
  const stackOf = (pkg) => {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const langs = [];
    if (deps.typescript) langs.push("typescript");
    if (deps.react || deps["react-dom"] || deps.next) langs.push("react");
    if (deps["@nestjs/core"] || deps.nestjs) langs.push("nestjs");
    if (deps.express) langs.push("express");
    if (deps.vue) langs.push("vue");
    if (deps.svelte) langs.push("svelte");
    if (deps.python || deps.flask || deps.django) langs.push("python");
    return langs;
  };
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SUBPROJ_SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (seen.has(p)) continue;
      seen.add(p);
      try {
        if (fs.existsSync(path.join(p, ".git"))) {
          const pkgPath = path.join(p, "package.json");
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
            const langs = stackOf(pkg);
            out.push(`Subproyecto ${path.basename(p)} (${pkg.name || path.basename(p)}${langs.length ? `: ${langs.join("+")}` : ""})`);
          } else {
            out.push(`Subproyecto ${path.basename(p)} (repo git sin package.json)`);
          }
          continue; // no descender dentro de repos hijos
        }
        walk(p, depth + 1);
      } catch {}
    }
  };
  // El propio root: si es repo git con package.json, reportarlo como Proyecto
  try {
    const pkgPath = path.join(root, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const langs = stackOf(pkg);
      out.push(`Proyecto ${path.basename(root)} (${pkg.name || path.basename(root)}${langs.length ? `: ${langs.join("+")}` : ""})`);
      seen.add(root);
    }
  } catch {}
  walk(root, 1);
  return out;
}

export function updateProjectMemo(analysis, root) {
  const pi = analysis?.project || analysis?.projectInfo;
  const known = [];
  if (pi) {
    if (pi.detected_stack && pi.detected_stack !== "unknown") known.push(`Stack: ${pi.detected_stack}`);
    if (pi.architecture && pi.architecture !== "unknown") known.push(`Arquitectura: ${pi.architecture}`);
    for (const f of pi.relevant_files || []) known.push(`Artefacto: ${f}`);
  }
  const inferred = pi?.inferred || [];
  const assumed = pi?.assumed || [];
  // Raíz multi-repo sin stack propio → detectar subproyectos observados
  if (!known.length && root) {
    known.push(...detectSubprojects(root));
  }
  if (!known.length && !inferred.length && !assumed.length) return;
  const body = [
    "# Project Context",
    "",
    ...(known.length ? ["## Stack (observed)", ...known.map((k) => `- ${k}`)] : []),
    ...(inferred.length ? ["", "## Inferred", ...inferred.map((i) => `- ${i}`)] : []),
    ...(assumed.length ? ["", "## Assumed", ...assumed.map((a) => `- ${a}`)] : []),
  ].join("\n");
  const { project } = getOperationalContext(root);
  if (project.body.trim() === body.trim()) return;
  updateContext("project", body, { source: "observed", confidence: inferred.length ? "medium" : "high" }, root);
}

export function getOperationalContext(root) {
  const ctx = {};
  for (const [key, name] of Object.entries(CONTEXT_FILES)) {
    const { meta, body } = readDoc(key, root);
    ctx[key] = { name, meta, body };
  }
  return ctx;
}

export function summarizeOperationalContext(root) {
  const ctx = getOperationalContext(root);
  const lines = [];
  const projectFirst = firstLine(ctx.project.body);
  if (projectFirst) lines.push(`Proyecto: ${projectFirst.slice(0, 100)}`);
  const rc = (ctx.recentChanges.body.match(/^##\s/gm) || []).length;
  if (rc) lines.push(`Cambios recientes: ${rc} sección(es)`);
  const dec = (ctx.decisions.body.match(/^##\s/gm) || []).length;
  if (dec) lines.push(`Decisiones: ${dec}`);
  const cons = (ctx.constraints.body.match(/^- /gm) || []).length;
  if (cons) lines.push(`Restricciones: ${cons}`);
  return lines.length ? lines.join(" | ") : "";
}
