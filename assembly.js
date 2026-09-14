/**
 * Context Assembly Layer — Context Pack Builder.
 *
 * OpenSpec changes: context-assembly-layer, refactor-context-engine,
 * wam-context-budget-admission.
 *
 * Rol: decide qué nivel (N0/N1/N2/N3) entra al pack y emite N0/N1/N2.
 * Capsule selection dentro de N3 se delega a context.js (Context Selection Engine).
 *
 * Budget partitioning with admission policy:
 *   budget = reserved (MANDATORY) + flex (CONDITIONAL + OPTIONAL)
 *   MANDATORY items are preserved even if they exceed budget.
 *   OPTIONAL items are dropped first when budget is tight.
 *
 * Admission classes:
 *   MANDATORY  — N0, N2, required dependencies (never dropped)
 *   CONDITIONAL — cognition, relevant sections (dropped after OPTIONAL)
 *   OPTIONAL   — extra context, N4 skills (dropped first)
 *
 * 5 niveles con fuente canónica, obligación y prohibición:
 *   N0 Global/Policy  — obligatorio, tiny (MANDATORY)
 *   N1 Project        — selectivo por dominio (CONDITIONAL)
 *   N2 Task           — obligatorio (live task state) (MANDATORY)
 *   N3 Session        — capsules por utility (OPTIONAL)
 *   N4 Skills         — contenido de skills seleccionadas (OPTIONAL)
 *
 * Prohibido: L4 ephemeral, superseded, transcript, docs/dominios sin match.
 */

import fs from "node:fs";
import path from "node:path";
import { getOperationalContext, summarizeOperationalContext, normalizeConfidence, confidenceLabel } from "./memory.js";
import { selectContext, estimateCapsuleTokens, getSessionId } from "./context.js";
import { loadCognitiveState, compactCognitiveState } from "./cognitive-state.js";
import { routeAndAdapt, buildGraphFromTaskState } from "./router-adapter.js";
import { ADMISSION } from "./context-router.js";

/**
 * Admission classes are sourced from Context Router.
 * Assembly must not reinterpret or reclassify admission decisions.
 */

/**
 * @typedef {Object} AdmissionItem
 * @property {string} level - Context level (N0, N1, N2, N3, N4)
 * @property {string} admission - Admission class
 * @property {string} reason - Why this item has this admission class
 * @property {number} tokenCost - Estimated token cost
 * @property {string} text - The actual content
 */


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
  skillRegistry = null,
  selectedSkills = [],
} = {}) {
  const levels = { N0: [], N1: [], N2: [], N3: [], N4: [] };
  const rationale = [];
  const taskTokens = tokenize(prompt);
  let routerSufficiency = null;
  let selectionSource = "legacy";
  const isTrivial = classification === "trivial" || mode === "FAST";
  const isArch = classification === "architectural" || mode === "STRICT";

  /** @type {AdmissionItem[]} */
  const admissionItems = [];

  const reserve = (level, text, admission = ADMISSION.MANDATORY, reason = "required") => {
    const t = estTokens(text);
    levels[level].push(text);
    admissionItems.push({ level, admission, reason, tokenCost: t, text });
    if (typeof globalThis.__wamReserveLines !== "undefined") {
      globalThis.__wamReserveLines.push({ level, text });
    }
    return t;
  };

  const spend = (level, text, admission = ADMISSION.OPTIONAL, reason = "context") => {
    const t = estTokens(text);
    admissionItems.push({ level, admission, reason, tokenCost: t, text });
    if (t > flex) {
      rationale.push(`${level}: excede presupuesto (${t} tok, restante ${flex})`);
      return 0;
    }
    levels[level].push(text);
    flex -= t;
    return t;
  };

  /** Drop OPTIONAL items first, then CONDITIONAL, to free budget for MANDATORY. */
  const dropByAdmission = (minAdmission) => {
    const order = [ADMISSION.OPTIONAL, ADMISSION.CONDITIONAL];
    const minIdx = order.indexOf(minAdmission);
    const droppable = order.slice(minIdx);

    let freed = 0;
    for (const admission of droppable) {
      const items = admissionItems.filter((i) => i.admission === admission && levels[i.level].includes(i.text));
      for (const item of items) {
        const idx = levels[item.level].indexOf(item.text);
        if (idx !== -1) {
          levels[item.level].splice(idx, 1);
          flex += item.tokenCost;
          freed += item.tokenCost;
          rationale.push(`admission: dropped ${item.level} (${admission}) — ${item.reason}`);
        }
      }
    }
    return freed;
  };

  // -- N0 Global/Policy (MANDATORY) -----------------------------------------
  const n0Text = "[wam N0 policy] autonomy loop | soft-archive only (U1)";
  const n0Spent = reserve("N0", n0Text, ADMISSION.MANDATORY, "global policy");

  // -- N2 Task (reservado, obligatorio) -------------------------------------
  const liveFile = path.join(projectPath, ".wam", "tasks", taskId, "context.md");
  let liveBody = "";
  try {
    if (fs.existsSync(liveFile)) liveBody = fs.readFileSync(liveFile, "utf-8").trim();
  } catch {}
  if (taskState) {
    const reqs = taskState.requirements || [];
    const pend = reqs.filter((r) => r.status !== "done" && r.status !== "verified").length;
    const nextActionTruncated = (taskState.nextAction || "—").slice(0, 80);
    liveBody = [
      `task: ${taskId} — ${taskState.phase} / ${taskState.contract?.status || "?"}`,
      `req: ${pend}/${reqs.length} pend | next: ${nextActionTruncated}`,
    ].join("\n") || liveBody;
  }
  const n2TaskSpent = liveBody ? reserve("N2", liveBody, ADMISSION.MANDATORY, "live task state") : 0;
  let reserved = n0Spent + n2TaskSpent;

  // Cognitive state injection (compact, only if cognition exists) - also conditional, but handled by router
  const cognitionRaw = loadCognitiveState(projectPath);
  const hasCognition =
    cognitionRaw.activeHypotheses.length > 0 ||
    cognitionRaw.rejectedHypotheses.length > 0 ||
    cognitionRaw.recentExperiments.length > 0 ||
    cognitionRaw.criticalObservations.length > 0;
  if (hasCognition) {
    const compact = compactCognitiveState(cognitionRaw);
    const cogText = `[wam N2 cognition] ${JSON.stringify(compact)}`;
    const cogTokens = estTokens(cogText);
    // Cognition is CONDITIONAL — can be dropped if budget is tight, but router should have accounted for this
    admissionItems.push({ level: "N2", admission: ADMISSION.CONDITIONAL, reason: "cognitive state", tokenCost: cogTokens, text: cogText });
    reserved += cogTokens;
    levels.N2.push(cogText);
  }
  const budget_violation = reserved > budget;
  let flex = Math.max(0, budget - reserved);
  if (budget_violation) {
    rationale.push(`VIOLACIÓN: Reserva N0+N2 (${reserved}) excede budget (${budget})`);
    // Admission policy: try to drop OPTIONAL and CONDITIONAL items to make room
    const freed = dropByAdmission(ADMISSION.MANDATORY);
    if (freed > 0) {
      rationale.push(`admission: freed ${freed} tokens by dropping non-MANDATORY items`);
    }
    // Recalculate flex after dropping items
    flex = Math.max(0, budget - reserved);
  }

  // -- Continuation: solo N2 (ya reservado y emitido) -----------------------
  if (!continuation) {
    // -- N1 Project (selectivo por dominio, consume flex) -------------------
    const ctx = getOperationalContext(projectPath);
    const recent = ctx.recentChanges?.body || "";
    const recentSummary = recent.split(/^## /m).slice(0, 3).map((s) => s.trim()).filter(Boolean).join("\n# ");
    if (!isTrivial) {
      // N1 solo si hay memoria operacional real — cero líneas vacías (rigor = ahorro de tokens)
      const n1summary = summarizeOperationalContext(projectPath);
      if (n1summary) spend("N1", `[wam N1 project] ${n1summary}`, ADMISSION.CONDITIONAL, "project context");
      if (recentSummary) spend("N1", `[wam N1 recent] ${recentSummary.slice(0, 500)}`, ADMISSION.CONDITIONAL, "recent changes");

      // Provenance: inferido ≠ hecho
      for (const [key, label] of [["project", "project.md"], ["architecture", "architecture.md"], ["decisions", "decisions.md"], ["constraints", "constraints.md"]]) {
        const meta = ctx[key]?.meta || {};
        const conf = normalizeConfidence(meta.confidence);
        if (meta.source === "inferred" && conf < 0.4) {
          spend("N1", `[wam N1 WARNING] ${label} es INFERIDO (conf ${meta.confidence} ${confidenceLabel(conf)}) — no es decisión confirmada; validar antes de asumir`, ADMISSION.CONDITIONAL, "provenance warning");
        }
      }      
      const archDoc = ctx.architecture?.body || "";
      if (isArch && archDoc.trim()) {
        const arch = extractRelevantSections("architecture", archDoc, taskTokens, { base: true });
        if (arch.trim()) spend("N1", `[wam N1 architecture] ${arch.slice(0, 600)}`, ADMISSION.CONDITIONAL, "architecture context");
      }
      const decisions = extractRelevantSections("decisions", ctx.decisions?.body || "", taskTokens, { base: false });
      if (decisions.trim()) spend("N1", `[wam N1 decisions] ${decisions.slice(0, 600)}`, ADMISSION.CONDITIONAL, "decisions context");
      const constraints = extractRelevantSections("constraints", ctx.constraints?.body || "", taskTokens, { base: isArch });
      if (constraints.trim()) spend("N1", `[wam N1 constraints] ${constraints.slice(0, 400)}`, ADMISSION.CONDITIONAL, "constraints context");
    }

    // -- N3 Session (router-based selection, fallback to legacy) -------------
    if (!isTrivial) {
      // Try router-based selection first
      const graph = buildGraphFromTaskState(taskState, projectPath);
      const routerPkg = routeAndAdapt(graph, {
        taskId: taskState?.taskId,
        budget: flex,
        root: projectPath,
      });

      // Use router result if available, otherwise fallback to legacy selector.
      // Router is canonical authority for admission/sufficiency; Assembly respects it.
      let pkg;
      if (routerPkg.source === "router" && routerPkg.capsules.length > 0) {
        pkg = routerPkg;
        selectionSource = "router";
        routerSufficiency = pkg.sufficiency || null;
        rationale.push("N3: using Context Router for selection");
      } else {
        pkg = selectContext(prompt, { budget: flex, root: projectPath, sessionId: getSessionId(projectPath) });
        selectionSource = "legacy";
        routerSufficiency = "insufficient";
        rationale.push("N3: using legacy selector (router fallback)");
      }

      for (const c of pkg.capsules) {
        const head = `[wam N3 ${c.level || "N3"} ${c.provenance}] ${c.context_id} — ${(c.purpose || "").slice(0, 100)}`;
        const contentMax = 800;
        const truncated = (c.content || "").length > contentMax
          ? c.content.slice(0, contentMax) + `...[truncado: ver /wam ctx get ${c.context_id}]`
          : (c.content || "");
        const line = truncated ? `${head}\n  content: ${truncated.replace(/\n+/g, " ").slice(0, contentMax)}` : head;
        spend("N3", line, ADMISSION.OPTIONAL, `capsule ${c.context_id} (${selectionSource})`);
      }

      // Router mandatory omissions: explicitly report as admission failures, never silently drop
      for (const omitted of pkg.omitted || []) {
        if (omitted.admission === ADMISSION.MANDATORY) {
          rationale.push(`admission: MANDATORY omitted by router — ${omitted.id}: ${omitted.reason}`);
        }
      }

      if (pkg.sufficiency === "insufficient") {
        rationale.push(`N3: sufficiency insufficient — faltan ${pkg.missing.join(", ")}`);
        const conditions = pkg.contract?.conditions || [];
        const contractReport = conditions
          .filter((c) => c.status !== "SATISFIED" && c.severity === "MANDATORY")
          .map((c) => `  - [${c.id}] ${c.type}: ${c.description} (${c.status})`)
          .join("\n");
        spend("N3", `[wam N3 warning] contexto insuficiente:\n${contractReport}\n/wam ctx get <q>`, ADMISSION.MANDATORY, "sufficiency warning");
      }
    }

    // -- N4 Skills (contenido de skills seleccionadas, consume flex) ---------
    // Inyecta el contenido real de las skills seleccionadas para que el agente
    // respete las restricciones y patrones de cada skill (layer responsibility).
    // Lee directamente del registry sin importar engine.js (evita circular import).
    if (!isTrivial && skillRegistry && selectedSkills.length > 0) {
      const skillBudget = Math.floor(flex * 0.4); // 40% del flex restante para skills
      let skillSpent = 0;
      const skillContentMax = 1200; // max chars por skill
      
      for (const skill of selectedSkills) {
        if (skillSpent >= skillBudget) {
          rationale.push(`N4: budget agotado para skills (${skillSpent}/${skillBudget})`);
          break;
        }
        
        const skillData = skillRegistry[skill.id];
        if (!skillData) {
          rationale.push(`N4: ${skill.id} no encontrada en registry`);
          continue;
        }
        
        const content = skillData.content || "";
        if (!content.trim()) {
          rationale.push(`N4: ${skill.id} sin contenido embebido`);
          continue;
        }
        
        const truncated = content.length > skillContentMax
          ? content.slice(0, skillContentMax) + `...[truncado]`
          : content;
        
        const head = `[wam N4 skill] ${skill.id} — ${(skill.reason || "").slice(0, 100)}`;
        const line = `${head}\n  content: ${truncated.replace(/\n+/g, " ").slice(0, skillContentMax)}`;
        const cost = spend("N4", line, ADMISSION.OPTIONAL, `skill ${skill.id}`);
        skillSpent += cost;
        rationale.push(`N4: ${skill.id} inyectada (${cost} tok, reason: ${skill.reason})`);
      }
    }
  }

  const lines = [...levels.N0, ...levels.N1, ...levels.N2, ...levels.N3, ...levels.N4];

  // Admission report — Router is canonical authority for sufficiency when available.
  const mandatoryItems = admissionItems.filter((i) => i.admission === ADMISSION.MANDATORY);
  const mandatoryTokens = mandatoryItems.reduce((sum, i) => sum + i.tokenCost, 0);

  let sufficiency;
  if (routerSufficiency) {
    sufficiency = routerSufficiency === "ok" ? "sufficient" : "insufficient";
  } else if (budget_violation && mandatoryTokens > budget) {
    sufficiency = "insufficient";
  } else {
    sufficiency = "sufficient";
  }

  return {
    levels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, v.length])),
    lines,
    budget_used: budget - flex,
    budget,
    budget_violation,
    reserved,
    flex,
    rationale,
    continuation,
    source: selectionSource || "legacy",
    admission: {
      sufficiency,
      mandatoryCount: mandatoryItems.length,
      mandatoryTokens,
      droppedItems: rationale.filter((r) => r.startsWith("admission: dropped")),
    },
  };
}

export { estimateCapsuleTokens, ADMISSION };