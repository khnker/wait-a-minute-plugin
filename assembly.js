/**
 * Context Assembly Layer — ensamblado formal de contexto por tarea.
 *
 * OpenSpec change: context-assembly-layer.
 *
 * 4 niveles con fuente canónica, obligación y prohibición:
 *   N0 Global/Policy  — obligatorio, tiny
 *   N1 Project        — selectivo por dominio (secciones matcheadas)
 *   N2 Task           — obligatorio (live task state)
 *   N3 Session        — capsules por utility
 *
 * Prohibido: L4 ephemeral, superseded, transcript, docs/dominios sin match.
 * Presupuesto global con reporte por nivel.
 */

import fs from "node:fs";
import path from "node:path";
import { getOperationalContext, summarizeOperationalContext } from "./memory.js";
import { selectContext, estimateCapsuleTokens, getSessionId } from "./context.js";

const POLICIES = ["scope(ACTIVE)", "verify(ACTIVE)", "simplify(ACTIVE)"];

function tokenize(text = "") {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function overlap(aTokens, bTokens) {
  if (!aTokens.size || !bTokens.size) return 0;
  let hit = 0;
  for (const t of bTokens) if (aTokens.has(t)) hit++;
  return hit / Math.max(aTokens.size, 1);
}

function estTokens(text) {
  return Math.ceil((text || "").length / 4);
}

/**
 * Extrae secciones (## ...) de un doc que matchean la tarea.
 * Sin match y el doc es decisions/constraints → no entra (prohibido irrelevante).
 */
function extractRelevantSections(docName, body, taskTokens, { base = false } = {}) {
  const sections = (body || "").split(/^## /m).map((s) => s.trim()).filter(Boolean);
  if (base || !sections.length) return body || "";
  const hits = sections.filter((s) => overlap(taskTokens, tokenize(s.split("\n")[0] + " " + s.slice(0, 200))) > 0);
  if (!hits.length) return "";
  return "# " + hits.join("\n\n# ");
}

/**
 * Ensambla el Context Pack de la tarea.
 *
 * @returns { levels: {N0,N1,N2,N3}, lines, budget_used, budget, rationale }
 */
export function assembleContext({
  prompt = "",
  taskId = "",
  classification = "normal",
  mode = "NORMAL",
  continuation = false,
  projectPath = process.cwd(),
  budget = 4000,
  taskState = null,
} = {}) {
  const levels = { N0: [], N1: [], N2: [], N3: [] };
  const rationale = [];
  let used = 0;
  const spend = (level, text) => {
    const t = estTokens(text);
    if (used + t > budget) {
      rationale.push(`${level}: excede presupuesto (${t} tok, restante ${budget - used})`);
      return;
    }
    levels[level].push(text);
    used += t;
  };

  const taskTokens = tokenize(prompt);
  const isTrivial = classification === "trivial" || mode === "FAST";
  const isArch = classification === "architectural" || mode === "STRICT";

  // -- N0 Global/Policy (obligatorio, tiny) ---------------------------------
  spend("N0", `[wam N0 policy] ${POLICIES.join(" | ")}`);

  // -- Continuation: solo N2 (no reconstruir) -------------------------------
  if (!continuation) {
    // -- N1 Project (selectivo por dominio) ---------------------------------
    const ctx = getOperationalContext(projectPath);
    const recent = ctx.recentChanges?.body || "";
    const recentSummary = recent.split(/^## /m).slice(0, 3).map((s) => s.trim()).filter(Boolean).join("\n# ");
    if (!isTrivial) {
      // N1 solo si hay memoria operacional real — cero líneas vacías (rigor = ahorro de tokens)
      const n1summary = summarizeOperationalContext(projectPath);
      if (n1summary) spend("N1", `[wam N1 project] ${n1summary}`);
      if (recentSummary) spend("N1", `[wam N1 recent] ${recentSummary.slice(0, 500)}`);

      // Provenance: inferido ≠ hecho — marcar docs con source inferred / confianza baja
      for (const [key, label] of [["project", "project.md"], ["architecture", "architecture.md"], ["decisions", "decisions.md"], ["constraints", "constraints.md"]]) {
        const meta = ctx[key]?.meta || {};
        const conf = parseFloat(meta.confidence);
        if (meta.source === "inferred" || (Number.isFinite(conf) && conf < 0.7)) {
          spend("N1", `[wam N1 provenance] ${label} es INFERIDO (${meta.source}, conf ${meta.confidence}) — no es decisión confirmada; validar antes de asumir`);
        }
      }

      // L1 metadata provenance (inferido ≠ hecho)
      for (const key of ["decisions", "constraints"]) {
        const doc = ctx[key];
        if (doc?.meta?.confidence < 0.7 && doc?.meta?.source === "inferred") {
          spend("N1", `[wam N1 WARNING] ${doc.name} (confidence: ${doc.meta.confidence}) — inferencia, validar antes de usar`);
        }
      }
      const archDoc = ctx.architecture?.body || "";
      if (isArch && archDoc.trim()) {
        const arch = extractRelevantSections("architecture", archDoc, taskTokens, { base: true });
        if (arch.trim()) spend("N1", `[wam N1 architecture] ${arch.slice(0, 600)}`);
      }
      const decisions = extractRelevantSections("decisions", ctx.decisions?.body || "", taskTokens, { base: false });
      if (decisions.trim()) spend("N1", `[wam N1 decisions] ${decisions.slice(0, 600)}`);
      const constraints = extractRelevantSections("constraints", ctx.constraints?.body || "", taskTokens, { base: isArch });
      if (constraints.trim()) spend("N1", `[wam N1 constraints] ${constraints.slice(0, 400)}`);
    }

    // -- N3 Session (capsules por utility) ----------------------------------
    if (!isTrivial) {
      const pkg = selectContext(prompt, { budget: budget - used, root: projectPath, sessionId: getSessionId(projectPath) });
      for (const c of pkg.capsules) {
        const head = `[wam N3 ${c.level} ${c.provenance}] ${c.context_id} — ${(c.purpose || "").slice(0, 100)}`;
        const contentMax = 800;
        const truncated = (c.content || "").length > contentMax
          ? c.content.slice(0, contentMax) + `...[truncado: ver /wam ctx get ${c.context_id}]`
          : (c.content || "");
        const line = truncated ? `${head}\n  content: ${truncated.replace(/\n+/g, " ").slice(0, contentMax)}` : head;
        spend("N3", line);
      }
      if (pkg.sufficiency === "insufficient") {
        rationale.push(`N3: sufficiency insufficient — faltan ${pkg.missing.join(", ")}`);
        spend("N3", `[wam N3 warning] contexto insuficiente: ${pkg.missing.join(", ")} — /wam ctx get <q>`);
      }
    }
  }

  // -- N2 Task (obligatorio, live state) ------------------------------------
   const liveFile = path.join(projectPath, ".wam", "tasks", taskId, "context.md");
  let liveBody = "";
  try {
    if (fs.existsSync(liveFile)) liveBody = fs.readFileSync(liveFile, "utf-8").trim();
  } catch {}
  if (taskState) {
    const reqs = taskState.requirements || [];
    const pend = reqs.filter((r) => r.status !== "done" && r.status !== "verified").length;
    liveBody = [
      `task: ${taskId} — ${taskState.phase} / ${taskState.contract?.status || "?"}`,
      `req: ${pend}/${reqs.length} pend | next: ${taskState.nextAction || "—"}`,
    ].join("\n") || liveBody;
  }
  if (liveBody) spend("N2", `[wam N2 task]\n${liveBody}`);

  const lines = [...levels.N0, ...levels.N1, ...levels.N2, ...levels.N3];
  return {
    levels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v.length])),
    lines,
    budget_used: used,
    budget,
    rationale,
    continuation,
  };
}

export { estimateCapsuleTokens };
