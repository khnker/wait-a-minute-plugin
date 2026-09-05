/**
 * Context Assembly Layer — Context Pack Builder.
 *
 * OpenSpec changes: context-assembly-layer, refactor-context-engine.
 *
 * Rol: decide qué nivel (N0/N1/N2/N3) entra al pack y emite N0/N1/N2.
 * Capsule selection dentro de N3 se delega a context.js (Context Selection Engine).
 *
 * Budget partitioning (refactor-context-engine):
 *   budget = reserved (N0 + N2) + flex (N1 + N3)
 *   N0 y N2 se reservan primero; violation si reserved > budget (N0 igual se emite).
 *
 * 4 niveles con fuente canónica, obligación y prohibición:
 *   N0 Global/Policy  — obligatorio, tiny (reservado)
 *   N1 Project        — selectivo por dominio (secciones matcheadas) (flex)
 *   N2 Task           — obligatorio (live task state) (reservado)
 *   N3 Session        — capsules por utility (delegado a context.js) (flex)
 *
 * Prohibido: L4 ephemeral, superseded, transcript, docs/dominios sin match.
 */

import fs from "node:fs";
import path from "node:path";
import { getOperationalContext, summarizeOperationalContext, normalizeConfidence, confidenceLabel } from "./memory.js";
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
 * @returns { levels, lines, budget_used, budget, budget_violation, reserved, flex, rationale, continuation }
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
  const n0Line = `[wam N0 policy] ${POLICIES.join(" | ")}`;
  const n0Cost = estTokens(n0Line);
  let flex = budget - n0Cost;
  const reserve = (level, text) => {
    const t = estTokens(text);
    levels[level].push(text);
    return t;
  };
  const spend = (level, text) => {
    const t = estTokens(text);
    if (t > flex) {
      rationale.push(`${level}: excede presupuesto (${t} tok, restante ${flex})`);
      return;
    }
    levels[level].push(text);
    flex -= t;
  };

  const taskTokens = tokenize(prompt);
  const isTrivial = classification === "trivial" || mode === "FAST";
  const isArch = classification === "architectural" || mode === "STRICT";

  // -- N0 Global/Policy (reservado, obligatorio) ----------------------------
  const n0Spent = reserve("N0", n0Line);

  // -- Continuation: solo N2 (no reconstruir) -------------------------------
  if (!continuation) {
    // -- N1 Project (selectivo por dominio, consume flex) -------------------
    const ctx = getOperationalContext(projectPath);
    const recent = ctx.recentChanges?.body || "";
    const recentSummary = recent.split(/^## /m).slice(0, 3).map((s) => s.trim()).filter(Boolean).join("\n# ");
    if (!isTrivial) {
      // N1 solo si hay memoria operacional real — cero líneas vacías (rigor = ahorro de tokens)
      const n1summary = summarizeOperationalContext(projectPath);
      if (n1summary) spend("N1", `[wam N1 project] ${n1summary}`);
      if (recentSummary) spend("N1", `[wam N1 recent] ${recentSummary.slice(0, 500)}`);

      // Provenance: inferido ≠ hecho — marcar docs con source inferred + confianza baja
      for (const [key, label] of [["project", "project.md"], ["architecture", "architecture.md"], ["decisions", "decisions.md"], ["constraints", "constraints.md"]]) {
        const meta = ctx[key]?.meta || {};
        const conf = normalizeConfidence(meta.confidence);
        const inferredLow = meta.source === "inferred" && conf < 0.7;
        const severeLow = conf < 0.4;
        if (inferredLow || severeLow) {
          spend("N1", `[wam N1 provenance] ${label} es INFERIDO (${meta.source}, conf ${meta.confidence} ${confidenceLabel(conf)}) — no es decisión confirmada; validar antes de asumir`);
        }
      }

      // L1 metadata provenance (inferido ≠ hecho)
      for (const key of ["decisions", "constraints"]) {
        const doc = ctx[key];
        const conf = normalizeConfidence(doc?.meta?.confidence);
        if (conf < 0.7 && doc?.meta?.source === "inferred") {
          spend("N1", `[wam N1 WARNING] ${doc.name} (confidence: ${doc.meta.confidence} ${confidenceLabel(conf)}) — inferencia, validar antes de usar`);
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
      const pkg = selectContext(prompt, { budget: flex, root: projectPath, sessionId: getSessionId(projectPath) });
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

  // -- N2 Task (reservado, obligatorio) --------------------------------------
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
  const n2Reserved = liveBody ? estTokens(`[wam N2 task]\n${liveBody}`) : 0;
  const reserved = n0Spent + n2Reserved;
  const budget_violation = reserved > budget;
  if (liveBody) reserve("N2", `[wam N2 task]\n${liveBody}`);

  const lines = [...levels.N0, ...levels.N1, ...levels.N2, ...levels.N3];
  const used = budget - flex;
  return {
    levels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v.length])),
    lines,
    budget_used: used,
    budget,
    budget_violation,
    reserved,
    flex,
    rationale,
    continuation,
  };
}

export { estimateCapsuleTokens };
