#!/usr/bin/env node
/**
 * WAM Skill Builder — build-time only (maintainer).
 *
 * Convierte repos upstream clonados localmente en el catálogo curado
 * skills/registry.json que WAM distribuye embebido. Sin red.
 *
 * Uso:
 *   node scripts/build-registry.cjs [upstream-dir]
 *
 * upstreap-dir (default: ./upstream) debe contener subcarpetas con los
 * repos clonados (khasky-awesome-agent-skills, whobat-ai-agent-skills,
 * antigravity-awesome-skills). El maintainer los clona/fetch manualmente.
 */

const fs = require("fs");
const path = require("path");

const REPO_DIR = path.resolve(process.argv[2] || "upstream");
const OUT = path.resolve(__dirname, "..", "skills", "registry.json");

const SOURCE_CONFIG = [
  { id: "khasky-awesome-agent-skills", repository: "https://github.com/khasky/awesome-agent-skills.git", trust: "curated" },
  { id: "whobat-ai-agent-skills", repository: "https://github.com/whobat/AI-Agent-skills.git", trust: "community" },
  { id: "antigravity-awesome-skills", repository: "https://github.com/sickn33/antigravity-awesome-skills.git", trust: "community" },
];

function readSafe(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function parseFrontmatter(content) {
  const meta = { name: "", description: "", keywords: [] };
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return meta;
  const b = m[1];
  const nm = b.match(/^name\s*:\s*(.+)$/im);
  if (nm) meta.name = nm[1].trim();
  const dm = b.match(/^description\s*:\s*(.+)$/im);
  if (dm) meta.description = dm[1].trim().replace(/^["']|["']$/g, "");
  const km = b.match(/keywords\s*:\s*([\s\S]*?)(?:\n\w|\n---|$)/i);
  if (km) {
    meta.keywords = km[1].split("\n").map((l) => l.trim().replace(/^-\s*/, "").replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return meta;
}

function gitCommit(dir) {
  const head = readSafe(path.join(dir, ".git", "HEAD")).trim().replace(/^ref:\s*/, "");
  if (!head) return null;
  const sha = readSafe(path.join(dir, ".git", head)).trim();
  return sha || head;
}

function scanSource(source, dir) {
  if (!exists(dir)) return [];
  const found = [];
  const walk = (d, relBase) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, relBase);
      else if (e.name === "SKILL.md") {
        const fm = parseFrontmatter(readSafe(full));
        const relPath = path.relative(relBase, full).replace(/\\/g, "/");
        const slug = fm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || path.basename(path.dirname(full)).toLowerCase();
        // Quality Gate: filtrar ruido
        if (slug.length < 2 || fm.description.length < 40) continue;
        found.push({
          id: `${source.id}-${slug}`,
          name: fm.name || slug,
          description: fm.description,
          keywords: fm.keywords,
          capabilities: [],
          domain: [],
          compatibility: ["opencode"],
          risk: "low",
          source: { id: source.id, repository: source.repository, path: relPath, ref: gitCommit(dir) || "unknown" },
          status: "APPROVED",
          trust: source.trust,
        });
      }
    }
  };
  walk(dir, dir);
  return found;
}

function dedup(registry) {
  const seen = new Map();
  const out = {};
  for (const s of registry) {
    const key = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (seen.has(key)) continue; // mantener el primero (orden: khasky > whobat > antigravity)
    seen.set(key, true);
    out[s.id] = s;
  }
  return out;
}

// Manual: skills mantenidas a mano con el plugin (no vienen de upstream)
const MANUAL = [
  { id: "security-review", name: "security-review", description: "Security audit and vulnerability review of code, dependencies and infrastructure", keywords: ["security", "seguridad", "vulnerability", "audit", "auth", "oauth"], risk: "high" },
  { id: "postgres-migration", name: "postgres-migration", description: "PostgreSQL database migrations planned and executed without data loss or downtime", keywords: ["migration", "migracion", "postgres", "database", "db", "schema"], risk: "high" },
  { id: "code-review", name: "code-review", description: "Code review focused on maintainability, correctness and future complexity", keywords: ["review", "code-review", "revision", "maintainability", "quality", "pull request"], risk: "medium" },
  { id: "debugging", name: "debugging", description: "Diagnosis of errors, bugs and regressions with root-cause analysis", keywords: ["debug", "bug", "error", "fallo", "regression", "trace"], risk: "medium" },
];

const all = [];
for (const source of SOURCE_CONFIG) {
  const skills = scanSource(source, path.join(REPO_DIR, source.id));
  console.log(`${source.id}: ${skills.length} skills`);
  all.push(...skills);
}
for (const m of MANUAL) {
  all.push({ ...m, capabilities: [], domain: [], compatibility: ["opencode"], source: { kind: "bundled", ref: "wam-v1" }, status: "APPROVED", trust: "curated" });
}

const deduped = dedup(all);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(Object.values(deduped), null, 2));
console.log(`-> ${OUT}`);
console.log(`Total curado: ${Object.keys(deduped).length} skills (dedup aplicado)`);