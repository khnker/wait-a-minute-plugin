import { analyze, getTaskState, persistTaskState, routeSkillsV2, loadSkillOnDemand } from "./engine.js";
import { initMemory, summarizeOperationalContext, updateContext, getOperationalContext, updateTaskMemory, addRecentChange } from "./memory.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Wait a Minute plugin for OpenCode — Pre-Flight Cognitive Layer.
 *
 * Intercepts the prompt via chat.message hook before skill resolution and
 * agent execution. Runs pre-flight cognitive analysis classifying the request,
 * inspecting the project, detecting assumptions, and selecting relevant skills.
 *
 * The analysis results are stored in the session and can be accessed by the
 * main agent before proceeding with implementation.
 */

const DEFAULT_CONFIG = {
  tierCaps: { fast: 8, medium: 5, heavy: 3 },
  activePreset: "omni",
  activeMode: "normal",
  tierPrompts: {},
};

// opencode 1.18.25: chat.message output = { message, parts } (sin .system).
// Inyecta texto visible al frente del mensaje de usuario; fallback a .system (API vieja).
function emitTextPart(output, text, meta = {}) {
  if (!output) return;
  const part = {
    type: "text",
    text,
    synthetic: true,
    ...(meta.sessionID ? { sessionID: meta.sessionID } : {}),
    ...(meta.messageID ? { messageID: meta.messageID } : {}),
  };
  if (Array.isArray(output.parts)) {
    output.parts.unshift(part);
    console.error("[wait-a-minute DEBUG] emitTextPart pushed to output.parts, count=" + output.parts.length);
  } else if (output.system) {
    output.system.unshift(part);
  } else {
    console.error("[wait-a-minute DEBUG] emitTextPart NO TARGET, outKeys=" + Object.keys(output));
  }
}

// -- v1-enforcement: estado durable, contrato y progreso --------

function nextActionFrom(state) {
  const pending = (state?.requirements || []).find((r) => r.status !== "done");
  if (pending) return `Implementar ${pending.title} (${pending.id} pendiente)`;
  if (state?.requirements?.length) return "Verificar requisitos completos antes de DONE";
  return "Continuar tarea";
}

const ACTIVE_FILE = () => path.join(process.cwd(), ".wam", "active-task");

function readActiveTaskId() {
  try {
    const v = fs.readFileSync(ACTIVE_FILE(), "utf-8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function writeActiveTaskId(id) {
  fs.mkdirSync(path.dirname(ACTIVE_FILE()), { recursive: true });
  fs.writeFileSync(ACTIVE_FILE(), id);
}

function listTaskIds() {
  const dir = path.join(process.cwd(), ".wam", "tasks");
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

// -- operational memory (memory.js): contexto inicial acelerador (spec §13) --

function updateProjectMemo(analysis) {
  const pi = analysis?.projectInfo;
  if (!pi) return;
  const known = (pi.known || []).filter((k) => /package\.json|Dependencias|framework|AGENTS\.md|openspec/i.test(k));
  const inferred = pi.inferred || [];
  const assumed = pi.assumed || [];
  if (!known.length && !inferred.length && !assumed.length) return;
  const body = [
    "# Project Context",
    "",
    ...(known.length ? ["## Stack (observed)", ...known.map((k) => `- ${k}`)] : []),
    ...(inferred.length ? ["", "## Inferred", ...inferred.map((i) => `- ${i}`)] : []),
    ...(assumed.length ? ["", "## Assumed", ...assumed.map((a) => `- ${a}`)] : []),
  ].join("\n");
  const { project } = getOperationalContext();
  if (project.body.trim() === body.trim()) return;
  updateContext("project", body, { source: "observed", confidence: inferred.length ? "medium" : "high" });
}

function injectOperationalMemory(inject, analysis) {
  try {
    initMemory();
    updateProjectMemo(analysis);
    const note = summarizeOperationalContext();
    if (note) inject.push(`[wait-a-minute: memoria operacional] ${note}`);
  } catch (err) {
    console.error("[wait-a-minute] operational memory load failed:", err);
  }
}

function projectState(analysis) {
  return {
    contract: {
      status: "PROPOSED",
      rigor: analysis.completionContract?.rigor || "NORMAL",
      requirements: analysis.completionContract?.requirements || [],
      verification: analysis.completionContract?.verification || [],
      constraints: analysis.completionContract?.constraints || [],
    },
    requirements: (analysis.completionContract?.requirements || []).map((title, i) => ({
      id: `req-${i + 1}`,
      title,
      status: "pending",
      evidence: [],
    })),
    persistentPolicies: (analysis.persistentPolicies || []).map((p) => p.policy),
    activeGates: (analysis.persistentPolicies || []).flatMap((p) => p.gates || []),
  };
}

/**
 * Plugin factory — loaded by OpenCode when registered in opencode.jsonc.
 * Autocontained: no external deps beyond ./engine.js.
 */
const WaitAMinutePlugin = async (pluginInput) => {
  let cfg = { ...DEFAULT_CONFIG };

  // Per-plugin-instance session store
  const sessionStore = new Map();

  // Project directory (opencode 1.18.25: plugin input, not ctx)
  const projectDirectory = pluginInput?.directory || process.cwd();

  // Track if plugin is bypassed
  let bypassed = false;

  // -------------------------------------------------------------------------
  // opencode 1.18.25 plugin API: factory RETURNS the hooks object
  // -------------------------------------------------------------------------
  return {
    // Register /wam command at load time (config hook)
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command["wam"] = {
        template: "$ARGUMENTS",
        description:
          "Wait-a-Minute CLI: /wam skills <list|search|inspect|explain> | /wam contract <approve|reject|edit <json>> | /wam progress [<id> <done <evidencia>|pending>] | /wam task <list|switch <id>>",
      };
    },

    // Chat message hook — Persistence & Progress Gate
    "chat.message": async (input, output) => {
      try {
      if (bypassed) return;

      // Extract user prompt text (1.18.25: texto vive en output.parts = resolvedParts;
      // input NO trae message/parts y output.message.parts no está poblado al trigger)
      let promptText = "";
      const srcParts = output?.parts?.length
        ? output.parts
        : input?.message?.parts || output?.message?.parts || input?.parts;
      if (srcParts && srcParts.length > 0) {
        const textPart = srcParts.find(
          (p) => p.type === "text" && typeof p.text === "string"
        );
        promptText = textPart?.text || "";
      } else if (input?.text && typeof input.text === "string") {
        promptText = input.text;
      }

      if (!promptText.trim()) return;

      console.error("[wait-a-minute DEBUG] hook fired", { promptText, inKeys: Object.keys(input || {}), outKeys: Object.keys(output || {}) });

      // 1. Detectar tarea activa o iniciar nueva
      const taskId = input.taskId || readActiveTaskId() || "default-task";

      // 2. Ejecutar análisis (pre-flight existente)
      const analysis = await waitAMinute.analyze({
        prompt: promptText,
        projectPath: projectDirectory,
        config: cfg,
        tierCaps: cfg.tierCaps,
        activePreset: cfg.activePreset,
        activeMode: cfg.activeMode,
      });

      // 3. Estado durable: contrato PROPOSED (primera vez) o preservar APPROVED
      const state = waitAMinute.buildPersistedState(taskId, analysis);
      state.lastAction = promptText;

      // Store analysis results + persistent policies + skill registry in session
      sessionStore.set("waitAnalysis", analysis);
      sessionStore.set("completionContract", state.contract);
      sessionStore.set("persistentPolicies", analysis.persistentPolicies || []);
      sessionStore.set("skillRegistry", analysis.skillRegistry || {});
      persistTaskState(taskId, state);

      // 4. Completion Gate: bloquea DONE prematuro (ENFORCE)
      const gate = waitAMinute.evaluateCompletionGate(state, promptText);

      // 6. Inyectar estado + gate + badge + skills (path) al system prompt
      const inject = [];
      injectOperationalMemory(inject, analysis);
      if (state.requirements?.length) {
        const pend = state.requirements.filter((r) => r.status !== "done").length;
        inject.push(`[wait-a-minute: task ${taskId} — fase ${state.phase}, ${pend}/${state.requirements.length} requisitos pendientes]`);
      }
      if (gate.blocked) {
        inject.push(
          "──────────────────────────────────────────────",
          "⛔ WAIT A MINUTE — COMPLETION GATE BLOQUEADO",
          "La tarea NO está completa. No declares DONE ni fin de tarea.",
          "Requisitos pendientes:",
          ...gate.pending.map((p) => `  - ${p}`),
          `Fase actual: ${state.phase}. Continúa con el próximo requisito.`,
          "──────────────────────────────────────────────"
        );
        state.phase = "IMPLEMENTING";
        state.nextAction = nextActionFrom(state);
        persistTaskState(taskId, state);
        const gateHold = `⛔ [wait-a-minute] COMPLETION GATE: faltan ${gate.pending.length} requisitos. No declare DONE. Continuar con: ${state.nextAction}`;
        emitTextPart(output, gateHold, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        if (input?.parts && input.parts.length > 0) {
          const tp = input.parts.find((p) => p.type === "text" && typeof p.text === "string");
          if (tp) tp.text = gateHold;
        }
      } else if (gate.allDone) {
        state.phase = "DONE";
        state.nextAction = "Tarea completa — contrato verificado";
        persistTaskState(taskId, state);
        updateTaskMemory(taskId, {
          summary: [
            "# Task Summary",
            "",
            "## Objective",
            `- ${taskId} (${analysis.intent?.classification || "task"})`,
            "",
            "## Completed",
            ...(state.contract?.requirements || []).map((r) => `- ${r}`),
            "",
            "## Verification",
            ...(state.requirements || []).map((r) => `- ${r.id}: ${r.status}`),
            "",
            "## Status",
            "COMPLETED",
          ].join("\n"),
        });
        addRecentChange({
          date: new Date().toISOString().slice(0, 10),
          scope: taskId,
          changes: state.contract?.requirements || [],
          verification: `requisitos completos: ${(state.requirements || []).length}`,
        });
      }

      if (cfg.experimental?.waitAMinuteInject === true) {
        inject.push(`[wait-a-minute: ${analysis.intent.classification}@${analysis.risk}@${analysis.complexity}]`);
        const registry = waitAMinute.getRegistry();
        for (const s of analysis.skills?.selected || []) {
          const entry = Object.values(registry).find((r) => r.id === s.id);
          if (!entry || !s.hasContent) continue;
          const dl = waitAMinute.loadSkillOnDemand(entry.id, registry, projectDirectory);
          if (!dl.loaded) continue;
          inject.push(`[wait-a-minute: skill "${s.name}" — SKILL.md materializado en ${dl.contentPath}. Cargar via runtime nativo si se ejecuta.]`);
        }
      }

      if (inject.length > 0) {
        emitTextPart(output, inject.join("\n") + "\n", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
      }

      // 5. Presentar validación con estado de contrato real (GUIDE)
      // (unshift último => queda al tope del mensaje, primero visible)
      waitAMinute.presentValidation({
        analysis: { ...analysis, contractStatus: state.contract.status, phase: state.phase },
        ctx: output,
        meta: { sessionID: input.sessionID, messageID: output.message?.id || input.messageID },
      });

      // Store for later access by the orchestrator
      input.waitAnalysis = analysis;
    } catch (err) {
      // Best-effort: never crash the session on wait-a-minute error
      console.error("[wait-a-minute] Pre-flight analysis failed:", err);
    }
  },

    // Handle /wam CLI (opencode 1.18.25: commands arrive via command.execute.before)
    "command.execute.before": async (input, output) => {
      if (input.command !== "wam") return;
      output.parts = output.parts || [];
      output.parts.push({
        type: "text",
        text: wamCli((input.arguments || "").split(/\s+/)),
      });
    },
  };
};


/**
 * /wam CLI — opencode 1.18.25 entrega comandos vía command.execute.before,
 * no vía ctx.command. Lógica extraída del handler antiguo.
 */
function wamCli(args) {
  const [sub, action, ...rest] = args || [];
  const taskId = readActiveTaskId() || "default-task";

  if (sub === "skills") {
    const skills = waitAMinute.getRegistry();
    const list = Object.values(skills);
    if (action === "list") {
      return list.map(s => `${s.id} [${s.status}]`).join("\n");
    }
    if (action === "search") {
      const q = rest.join(" ").toLowerCase();
      return list
        .filter(s => (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q))
        .slice(0, 20)
        .map(s => s.id)
        .join("\n");
    }
    if (action === "inspect") {
      const id = rest.join(" ");
      const s = skills[id];
      if (!s) return `Skill ${id} no encontrada`;
      return [
        `${s.id} [${s.status}]`,
        `name: ${s.name}`,
        `description: ${s.description}`,
        `risk: ${s.risk}`,
        `source: ${s.source?.repository || s.source?.kind || "local"} (${s.source?.path || "—"})`,
        `--- content (max 1500 chars) ---`,
        `${(s.content || "(sin contenido)").slice(0, 1500)}`,
      ].join("\n");
    }
    if (action === "explain") {
      const prompt = rest.join(" ");
      if (!prompt) return "Uso: /wam skills explain <prompt>";
      const sel = routeSkillsV2(prompt, {}, waitAMinute.getRegistry(), "STANDARD");
      return sel.selected.length
        ? sel.selected.map(s => `${s.name}: ${s.reason}`).join("\n")
        : "Ninguna skill seleccionada para ese prompt";
    }
    return "Uso: /wam skills <list|search|inspect|explain> [args]";
  }

  if (sub === "contract") {
    if (action === "approve") return JSON.stringify(waitAMinute.approveContract(taskId));
    if (action === "reject") return JSON.stringify(waitAMinute.rejectContract(taskId));
    if (action === "edit") {
      try {
        return JSON.stringify(waitAMinute.editContract(taskId, JSON.parse(rest.join(" "))));
      } catch {
        return "Error: JSON inválido para /wam contract edit";
      }
    }
    return "Uso: /wam contract <approve|reject|edit <json>>";
  }

  if (sub === "progress") {
    const [reqId, op, ...evidence] = [action, ...rest];
    if (!reqId) {
      const st = getTaskState(taskId);
      if (!st) return "Sin estado de tarea (persiste tras el primer mensaje)";
      return st.requirements
        .map(r => `${r.id} [${r.status}] ${r.title}${r.evidence?.length ? " | evidence: " + r.evidence.join("; ") : ""}`)
        .join("\n");
    }
    if (op === "done") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "done", evidence.join(" ")));
    if (op === "pending") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "pending", ""));
    return "Uso: /wam progress | /wam progress <id> done <evidencia> | /wam progress <id> pending";
  }

  if (sub === "task") {
    if (action === "list") {
      const ids = listTaskIds();
      if (!ids.length) return "Sin tareas persistidas (.wam/tasks)";
      const active = readActiveTaskId();
      return ids
        .map((id) => {
          const st = getTaskState(id);
          return `${id}${id === active ? " *activa" : ""} [${st?.phase || "?"}] ${st?.contract?.status || ""}`;
        })
        .join("\n");
    }
    if (action === "switch") {
      const id = rest.join(" ");
      if (!id) return "Uso: /wam task switch <taskId>";
      writeActiveTaskId(id);
      const st = getTaskState(id);
      return st
        ? `Tarea activa: ${id} [${st.phase}] — ${st.nextAction || ""}`
        : `Tarea activa: ${id} (sin estado persistido — enviar primer mensaje)`;
    }
    return "Uso: /wam task <list|switch <id>>";
  }

  return "Uso: /wam <skills|contract|progress|task>";
}

/**
 * Wait a Minute — Pre-Flight Cognitive Layer public API.
 */
const waitAMinute = {
  name: "wait-a-minute",

  /**
   * Obtiene el registry actual.
   */
  getRegistry: function() {
    return this.loadBundledRegistry();
  },

  /**
   * Analiza el prompt del usuario y retorna el contexto de pre-flight.
   *
   * @param {Object} options
   * @param {string} options.prompt - El prompt del usuario
   * @param {string} [options.projectPath] - Ruta del proyecto (usa cwd por defecto)
   * @param {Object} [options.config] - Configuración
   * @param {Object} [options.tierCaps] - Caps por tier
   * @returns {Object} - Resultado del análisis de pre-flight
   */
  analyze: async function({
    prompt,
    projectPath,
    config,
    tierCaps,
    activePreset,
    activeMode,
  } = {}) {
    if (!prompt || typeof prompt !== "string") {
      return {
        intent: { classification: "trivial", ambiguity: "low", confidence: 100 },
        project: { detected_stack: "unknown", architecture: "unknown", relevant_files: [] },
        known: [],
        inferred: [],
        assumed: [],
        unknown: ["No hay prompt para analizar"],
        skills: { candidates: [], selected: [], rejected: [] },
        risk: "low",
        complexity: "trivial",
        ambiguity: "low",
        strategy: "FAST",
        ready: true,
        advice: "Sin prompt - sin análisis necesario",
      };
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return {
        intent: { classification: "trivial", ambiguity: "low", confidence: 100 },
        project: { detected_stack: "unknown", architecture: "unknown", relevant_files: [] },
        known: ["Prompt vacío o nulo"],
        inferred: [],
        assumed: [],
        unknown: ["No hay prompt para analizar"],
        skills: { candidates: [], selected: [], rejected: [] },
        risk: "low",
        complexity: "trivial",
        ambiguity: "low",
        strategy: "FAST",
        ready: true,
        advice: "Sin prompt - sin análisis necesario",
      };
    }

    const result = await analyze({
      prompt: trimmedPrompt,
      projectPath: projectPath || process.cwd(),
      config,
      tierCaps: tierCaps || DEFAULT_CONFIG.tierCaps,
      activePreset: activePreset || DEFAULT_CONFIG.activePreset,
      activeMode: activeMode || DEFAULT_CONFIG.activeMode,
    });

    const summary = this.generateSummary(result);

    return {
      ...result,
      _summary: summary,
    };
  },

  /**
   * Genera un resumen humano-readable del análisis de pre-flight.
   */
  generateSummary: function(result) {
    const lines = [];

    lines.push(
      `Intención: ${result.intent.classification} (confianza: ${result.intent.confidence}%)`
    );
    lines.push(`Stack: ${result.project.detected_stack}`);
    if (result.project.architecture !== "unknown") {
      lines.push(`Arquitectura: ${result.project.architecture}`);
    }

    if (result.known.length > 0) {
      lines.push(`\nConocido(s): ${result.known.slice(0, 5).join("; ")}`);
    }
    if (result.inferred.length > 0) {
      lines.push(`Inferido(s): ${result.inferred.slice(0, 5).join("; ")}`);
    }
    if (result.assumed.length > 0) {
      lines.push(`Asumido(s): ${result.assumed.slice(0, 3).join("; ")}`);
    }
    if (result.unknown.length > 0) {
      lines.push(`Desconocido(s): ${result.unknown.slice(0, 3).join("; ")}`);
    }

    lines.push(
      `\nSkills candidatas: ${result.skills.candidates
        .slice(0, 5)
        .map((c) => c.name)
        .join(", ")}`
    );
    lines.push(`Skills seleccionadas: ${result.skills.selected.join(", ")}`);
    if (result.skills.rejected.length > 0) {
      lines.push(`Skills rechazadas: ${result.skills.rejected.join(", ")}`);
    }

    lines.push(`\nRiesgo: ${result.risk}`);
    lines.push(`Complejidad: ${result.complexity}`);
    lines.push(`Ambigüedad: ${result.ambiguity}`);
    lines.push(`\nEstrategia: ${result.strategy}`);
    lines.push(`\n¿Listo para proceder?: ${result.ready ? "SÍ" : "NO"}`);
    lines.push(`\nConsejo: ${result.advice || ""}`);

    return lines.join("\n");
  },

  /**
   * Carga el catálogo embebido (skills/registry.json) del plugin.
   * El corpus es distribuido con WAM — sin red en runtime.
   */
  loadBundledRegistry: function() {
    try {
      const registryPath = path.join(import.meta.dirname, "skills", "registry.json");
      if (!fs.existsSync(registryPath)) return {};
      const entries = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
      const reg = {};
      for (const s of entries) reg[s.id] = s;
      return reg;
    } catch {
      return {};
    }
  },

  /**
   * Estado durable de tarea: contrato + requisitos por evidencia.
   * PROPOSED la primera vez; preserva contrato APPROVED y progreso existente.
   */
  buildPersistedState: function(taskId, analysis) {
    const existing = getTaskState(taskId);
    if (existing && existing.requirements && existing.contract?.status === "APPROVED") {
      const merged = {
        ...existing,
        lastAction: existing.lastAction,
        nextAction: nextActionFrom(existing),
      };
      persistTaskState(taskId, merged);
      return merged;
    }
    const fresh = {
      ...projectState(analysis),
      phase: "PROPOSED",
      nextAction: "Revisar contrato — /wam contract approve o edit",
      lastAction: "",
    };
    persistTaskState(taskId, fresh);
    return fresh;
  },

  /**
   * Completion Gate: detecta claims de fin de tarea y bloquea si hay requisitos pendientes.
   */
  evaluateCompletionGate: function(state, prompt) {
    const lower = (prompt || "").toLowerCase().trim();
    const doneClaims =
      /(^|\s)(done|finish|finished|complete|completed|terminate|terminated|listo|termin[eé]|complet[ao]|finalizad[oa])\b|(task|tarea)\s+(complete|complet(a|ada|o)|terminad(a|o))|declare.*done/i;
    if (!doneClaims.test(lower)) return { blocked: false };
    const pending = (state?.requirements || []).filter((r) => r.status !== "done" || !(r.evidence || []).length);
    if (pending.length === 0) {
      if (state?.contract?.status !== "APPROVED") {
        return {
          blocked: true,
          pending: [`contrato ${state.contract?.status || "PROPOSED"} — aprobar con /wam contract approve antes de DONE`],
        };
      }
      return { blocked: false, allDone: true };
    }
    return {
      blocked: true,
      pending: pending.map((r) => {
        const missingEvidence = r.status === "done" && !(r.evidence || []).length;
        return `${r.id} — ${r.title}${missingEvidence ? " (sin evidencia)" : ""}`;
      }),
    };
  },

  /** Aprueba el contrato: PROPOSED → APPROVED, fase → IMPLEMENTING. */
  approveContract: function(taskId) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    state.contract = { ...(state.contract || {}), status: "APPROVED" };
    if (state.phase !== "DONE") state.phase = "IMPLEMENTING";
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state);
    return { ok: true, status: "APPROVED", phase: state.phase };
  },

  /** Rechaza el contrato: REJECTED, fase WAITING. */
  rejectContract: function(taskId) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    state.contract = { ...(state.contract || {}), status: "REJECTED" };
    state.phase = "WAITING";
    state.nextAction = "Revisar contrato con el usuario";
    persistTaskState(taskId, state);
    return { ok: true, status: "REJECTED", phase: state.phase };
  },

  /** Edita el contrato (JSON patch), vuelve a PROPOSED. */
  editContract: function(taskId, patch) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const contract = state.contract || { status: "PROPOSED", requirements: [], verification: [], constraints: [] };
    if (Array.isArray(patch?.requirements)) {
      contract.requirements = patch.requirements;
      state.requirements = patch.requirements.map((title, i) => ({
        id: `req-${i + 1}`,
        title,
        status: "pending",
        evidence: [],
      }));
    }
    if (Array.isArray(patch?.verification)) contract.verification = patch.verification;
    if (Array.isArray(patch?.constraints)) contract.constraints = patch.constraints;
    contract.status = "PROPOSED";
    state.contract = contract;
    state.phase = "PROPOSED";
    state.nextAction = "Revisar contrato — /wam contract approve o edit";
    persistTaskState(taskId, state);
    return { ok: true, status: "PROPOSED", requirements: contract.requirements.length };
  },

  /** Marca requisito done/pending con evidencia. DONE exige evidencia (no "parece funcionar"). */
  markRequirement: function(taskId, reqId, status, evidence) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const req = (state.requirements || []).find((r) => r.id === reqId);
    if (!req) return { ok: false, reason: `Requisito ${reqId} no existe` };
    if (status === "done" && !(evidence && evidence.trim())) {
      return { ok: false, reason: `Requisito ${reqId}: evidencia requerida para marcar done` };
    }
    req.status = status;
    if (status === "done") req.evidence.push(evidence.trim());
    if (status === "pending") req.evidence = [];
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state);
    return { ok: true, phase: state.phase, nextAction: state.nextAction };
  },

  /** Carga contenido real de una skill del catálogo bajo demanda. */
  loadSkillOnDemand: function(skillId, registry, baseDir) {
    return loadSkillOnDemand(skillId, registry, baseDir);
  },

  /**
   * Verifica si el prompt puede ser procesado en modo FAST (trivial).
   * Basado en el CONTENIDO del prompt, no en el origen (usuario/agente).
   */
  isTrivial: function(prompt) {
    const lower = prompt.toLowerCase().trim();
    const fastPatterns = [
      /^\s*rename\s+/i,
      /^\s*change\s+\w+/i,
      /^\s*what(is|are)\s+/i,
      /^\s*explain\s+/i,
      /^\s*how\s+to\s+/i,
      /^\s*list\s+/i,
      /^\s*show\s+\w+/i,
      /^\s*get\s+\w+/i,
      /^\s*error\s+line/i,
      /^\s*fix\s+this/i,
    ];

    for (const pattern of fastPatterns) {
      if (pattern.test(lower)) return true;
    }
    return false;
  },

  /**
   * Verifica si el prompt requiere modo STRICT (arquitectura, seguridad, etc.)
   */
  requiresStrict: function(prompt) {
    const lower = prompt.toLowerCase();
    const strictPatterns = [
      /migra|migrate/i,
      /seguridad|security/i,
      /arquitectura|architecture/i,
      /alto impacto|high impact/i,
      /producción|production/i,
      /destructivo|destructive/i,
    ];

    return strictPatterns.some((p) => p.test(lower));
  },

  /**
   * Presentar validación de pre-flight al agente/usuario.
   *
   * Checkpoint estratégico: muestra el resumen y solicita confirmación
   * sobre la estrategia a seguir. Se muestra para todo mensaje, incluido
   * modo FAST — el análisis nunca se omite.
   *
   * @param {Object} opts
   * @param {Object} opts.analysis - Resultado de analyze()
   * @returns {Object} - { mode: 'continue'|'validation-pending', ... }
   */
  presentValidation: async function({ analysis, ctx, meta = {} } = {}) {
    if (!analysis) {
      return { mode: "continue", advice: "No hay análisis previo" };
    }

    const summary = this.generateSummary(analysis);
    const mode = analysis.strategy || "NORMAL";

    const contractStatus = analysis.contractStatus || analysis.completionContract?.status || "PROPOSED";
    const statusLine =
      contractStatus === "APPROVED"
        ? `✅ Contrato aprobado (fase: ${analysis.phase || "IMPLEMENTING"})`
        : `⚠ Contrato ${contractStatus} NO aprobado — /wam contract approve`;

    const validationLines = [
      "Wait a minute — Completion Contract",
      "",
      statusLine,
      `Contract Status: ${contractStatus} | Rigor: ${analysis.completionContract?.rigor || "NORMAL"}`,
      `Requirements: ${(analysis.completionContract?.requirements || []).join(", ")}`,
      `Verification: ${(analysis.completionContract?.verification || []).join(", ")}`,
      "",
      `Intención: ${analysis.intent.classification} (confianza: ${analysis.intent.confidence}%) | Modo: ${mode}`,
      `Stack: ${analysis.project.detected_stack}`,
      analysis.project.architecture !== "unknown" &&
        `Arquitectura: ${analysis.project.architecture}`,
      "",
      "Conocido(s): " +
        (analysis.known.length > 0 ? analysis.known.slice(0, 3).join(", ") : "ninguno"),
      "Inferido(s): " +
        (analysis.inferred.length > 0 ? analysis.inferred.slice(0, 3).join(", ") : "ninguno"),
      "Asumido(s): " +
        (analysis.assumed.length > 0 ? analysis.assumed.slice(0, 3).join(", ") : "ninguno"),
      "Desconocido(s): " +
        (analysis.unknown.length > 0 ? analysis.unknown.slice(0, 3).join(", ") : "ninguno"),
      "",
      "Skills seleccionadas: " +
        (analysis.skills?.selected?.length > 0
          ? analysis.skills.selected.map((s) => s.name).join(", ")
          : "ninguna (bajo demanda)"),
      analysis.skills?.rejected?.length > 0 &&
        `Skills rechazadas: ${analysis.skills.rejected.join(", ")}`,
      analysis.skillRegistry &&
        `Skill Registry: ${analysis.skillRegistry.total} total | ${analysis.skillRegistry.approved} aprobadas | límite routing: ${analysis.skills.limit}`,
      analysis.skillRegistry?.sources?.length > 0 &&
        `Fuentes: ${analysis.skillRegistry.sources.join(", ")}`,
      "",
      "Políticas persistentes: " +
        (analysis.persistentPolicies?.length > 0
          ? analysis.persistentPolicies.map((p) => `${p.policy}(${p.status})`).join(", ")
          : "ninguna"),
      // Gates activos de políticas persistentes
      analysis.persistentPolicies?.length > 0 &&
        `Gates activos: ${analysis.persistentPolicies.flatMap((p) => p.gates).join(", ")}`,
      "",
      `Riesgo: ${analysis.risk} | Complejidad: ${analysis.complexity} | Ambigüedad: ${analysis.ambiguity}`,
      `Estrategia recomendada: ${analysis.strategy}`,
      "",
      "¿Proceder con esta estrategia?",
      "  [continuar]   → Ejecutar implementación con estrategia " + mode,
      "  [corregir]    → Ver detalles y hacer ajustes",
      "  [más información] → Expandir análisis completo",
      "",
      "Respuesta esperada: continuar / corregir / más información",
      "Confirmación seleccionable: /wam contract approve (aprobar contrato)",
    ];

    if (ctx) {
      const text = validationLines.filter((l) => l !== false).join("\n") + "\n";
      if (Array.isArray(ctx.parts)) {
        ctx.parts.unshift({
          type: "text",
          text,
          synthetic: true,
          ...(meta.sessionID ? { sessionID: meta.sessionID } : {}),
          ...(meta.messageID ? { messageID: meta.messageID } : {}),
        });
        console.error("[wait-a-minute DEBUG] presentValidation unshift a output.parts, count=" + ctx.parts.length);
      } else if (ctx.system) {
        ctx.system.unshift({ type: "text", text });
      } else {
        console.error("[wait-a-minute DEBUG] presentValidation NO TARGET, outKeys=" + Object.keys(ctx));
      }
    }

    return {
      mode: mode === "FAST" ? "continue" : "validation-pending",
      summary,
      validationLines,
      advice:
        mode === "FAST"
          ? "Tarea trivial - análisis mostrado, proceder directamente"
          : "Esperando respuesta del agente/usuario",
    };
  },
};

Object.keys(waitAMinute).forEach((k) => {
  if (k === "name") return;
  WaitAMinutePlugin[k] = waitAMinute[k];
});

export default WaitAMinutePlugin;
