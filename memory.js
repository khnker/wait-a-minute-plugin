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
  const m = (s || "").split("\n").find((l) => l.trim());
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

// -- recuperación de contexto (espec §13) -----------------------------------

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
