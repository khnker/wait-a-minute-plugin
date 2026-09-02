import { analyze, getTaskState, persistTaskState, routeSkillsV2, loadSkillOnDemand, cavemanify, estimateTokens, buildAssumptions, escalateAssumptions } from "./engine.js";
import { initMemory, summarizeOperationalContext, updateContext, getOperationalContext, updateTaskMemory, addRecentChange, recordDecision, updateLiveContext } from "./memory.js";
import { getSessionId, listCapsules, getCapsule, promoteCapsule, selectContext, retrieveContext, closeSession } from "./context.js";
import { assembleContext } from "./assembly.js";
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
  silent: false,
  budgetTokens: 32000,
  contextBudget: 4000,
  tierPrompts: {},
};

// opencode 1.18.25: chat.message output = { message, parts } (sin .system).
// Cada part debe incluir un id único (formato prt_...) o el mensaje falla al guardar
// (SchemaError: Missing key at ["part"]["id"]), bloqueando la sesión.
function genPartId() {
  let s = "prt_";
  while (s.length < 16) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// Inyecta texto visible al frente del mensaje de usuario; fallback a .system (API vieja).
function emitTextPart(output, text, meta = {}) {
  if (!output) return;
  const part = {
    id: genPartId(),
    type: "text",
    text,
    synthetic: true,
    ...(meta.sessionID ? { sessionID: meta.sessionID } : {}),
    ...(meta.messageID ? { messageID: meta.messageID } : {}),
  };
  if (Array.isArray(output.parts)) {
    output.parts.unshift(part);
  } else if (output.system) {
    output.system.unshift(part);
  }
}

// -- v1-enforcement: estado durable, contrato y progreso --------

function nextActionFrom(state) {
  const pending = (state?.requirements || []).find((r) => !["done", "verified"].includes(r.status));
  if (pending) return `Implementar ${pending.title} (${pending.id} ${pending.status})`;
  const unverified = (state?.requirements || []).find((r) => r.status === "done");
  if (unverified) return `Verificar ${unverified.title} — /wam progress ${unverified.id} verified <evidencia>`;
  if (state?.requirements?.length) return "Verificar requisitos completos antes de DONE";
  return "Continuar tarea";
}

const BLOCKED_TOOLS = new Set(["write", "edit", "bash", "task", "todowrite", "pty_spawn", "pty_write", "pty_kill"]);

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
  const pi = analysis?.project || analysis?.projectInfo;
  if (!pi) return;
  const known = [];
  if (pi.detected_stack && pi.detected_stack !== "unknown") known.push(`Stack: ${pi.detected_stack}`);
  if (pi.architecture && pi.architecture !== "unknown") known.push(`Arquitectura: ${pi.architecture}`);
  for (const f of pi.relevant_files || []) known.push(`Artefacto: ${f}`);
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

function projectState(analysis) {
  return {
    contract: {
      status: "PROPOSED",
      rigor: analysis.completionContract?.rigor || "NORMAL",
      requirements: analysis.completionContract?.requirements || [],
      verification: analysis.completionContract?.verification || [],
      constraints: analysis.completionContract?.constraints || [],
      unknowns: analysis.completionContract?.unknowns || [],
      assumptions: Array.isArray(analysis.assumptions)
        ? analysis.assumptions
        : buildAssumptions(analysis.assumed || []),
    },
    questions: [],
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

function extractPrompt(input, output) {
  const srcParts = output?.parts?.length
    ? output.parts
    : input?.message?.parts || output?.message?.parts || input?.parts;
  if (srcParts && srcParts.length > 0) {
    const textPart = srcParts.find(
      (p) => p.type === "text" && typeof p.text === "string"
    );
    return textPart?.text || "";
  }
  if (input?.text && typeof input.text === "string") return input.text;
  return "";
}

function applyCompletionGate(state, promptText, taskId, waitAMinute, persistTaskState, nextActionFrom) {
  const gate = waitAMinute.evaluateCompletionGate(state, promptText);
  if (gate.blocked) {
    state.phase = gate.verifying ? "VERIFYING" : "IMPLEMENTING";
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state);
  } else if (gate.allDone) {
    state.phase = "DONE";
    state.nextAction = "Tarea completa — contrato verificado";
    persistTaskState(taskId, state);
  }
  return gate;
}

function prepareSystemInject(analysis, state, cfg, projectDirectory, waitAMinute, taskId) {
  const inject = [];

  if (state.phase === "PROPOSED") {
    inject.push(
      "──────────────────────────────────────────────",
      "📋 CONTRATO DE TAREA (PROPOSED)",
      `Objetivo: ${state.contract.objective || "Pendiente definir"}`,
      "Etapas:",
      ...state.requirements.map((r, i) => `  ${i+1}. ${r.title}`),
      "Verificación:",
      ...state.contract.verification.map((v) => `  - ${v}`),
      "──────────────────────────────────────────────"
    );
  }

  if (state.requirements?.length) {
    const pend = state.requirements.filter((r) => r.status !== "done").length;
    inject.push(`[wait-a-minute: task ${taskId} — fase ${state.phase}, ${pend}/${state.requirements.length} requisitos pendientes]`);
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

  return inject;
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
    // /wam commands are registered via opencode.jsonc "command" entries on startup,
    // NOT via a plugin config hook (removed: plugin config hook mutated config and
    // is incompatible with opencode 1.18.26+, causing `N.config` TypeError).

    // Chat message hook — Persistence & Progress Gate
    "chat.message": async (input, output) => {
      try {
      if (bypassed) return;

      const promptText = extractPrompt(input, output);
      if (!promptText.trim()) return;

      // No-task-assumption: intención de resume sin tarea activa → preguntar, no asumir
      const RESUME_RE = /\b(en qué estábamos|en que estabamos|dónde íbamos|donde íbamos|sigamos|continuemos|retomar la tarea)\b/i;
      if (!input.taskId && RESUME_RE.test(promptText)) {
        const active = readActiveTaskId();
        const st = active ? getTaskState(active) : null;
        if (st && st.phase !== "DONE") {
          emitTextPart(output, `[wait-a-minute] Hay una tarea pendiente: ${active} (fase ${st.phase}). ¿Quieres continuarla? Responde /wam resume ${active} o define una tarea nueva — no asumo intención.`, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        } else {
          emitTextPart(output, "[wait-a-minute] No hay tarea activa. Dime qué tarea nueva quieres — no asumo intención previa.", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        }
        return;
      }

      let taskId = input.taskId || readActiveTaskId() || "default-task";

      // Clarification Gate (spec clarification-gate): en ASKING el mensaje se
      // clasifica — respuesta natural, intento de implementación o cambio de tarea.
      const askingState = getTaskState(taskId);
      if (askingState?.phase === "ASKING") {
        const trimmed = promptText.trim();
        if (/^(answer|resolve|contract|progress|task|skills|assumptions|compress)\b/.test(trimmed)) return; // lo maneja command.execute.before
        const kind = classifyAskingMessage(promptText);
        if (kind === "blocked-message") {
          // AC5 + AC11: un intento de implementar o un claim de DONE NO se consume
          // como respuesta — se intercepta y se re-emite la pregunta bloqueante.
          const u = (askingState.contract?.unknowns || []).find((x) => x.status === "blocking");
          const directive = `⛔ [wait-a-minute] BLOQUEADO: Pregunta pendiente ${u?.id || "U1"}: ${u?.question || "decisión crítica sin resolver"}\nNo implementar. Responder: /wam answer ${u?.id || "U1"} <respuesta>`;
          const srcParts = input?.message?.parts || input?.parts;
          if (srcParts && srcParts.length > 0) {
            const tp = srcParts.find((p) => p.type === "text" && typeof p.text === "string");
            if (tp) tp.text = directive;
          } else if (input && typeof input.text === "string") {
            input.text = directive;
          }
          emitTextPart(output, directive, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
          return;
        }
        if (kind === "new-intent") {
          // E2E-06: el usuario cambia de tarea → la anterior queda persistida sin
          // contaminar; el mensaje corre como nuevo pre-flight (nueva tarea).
          try { fs.rmSync(path.join(process.cwd(), ".wam", "active-task"), { force: true }); } catch {}
          taskId = `task-${Date.now()}`;
          input.taskId = taskId;
        } else {
          const resolved = waitAMinute.answerFromMessage(taskId, promptText);
          if (resolved.ok) {
            emitTextPart(
              output,
              `✓ [wait-a-minute] question answered — ${resolved.u.id}: "${resolved.u.answer}"\n✓ assumption resolved\n✓ contract updated — fase ${resolved.phase}\nReady → Proceed.`,
              { sessionID: input.sessionID, messageID: output.message?.id || input.messageID }
            );
          } else {
            const u = (askingState.contract?.unknowns || []).find((x) => x.status === "blocking");
            emitTextPart(
              output,
              `⛔ [wait-a-minute] ASKING — ${u?.id || "U1"}: ${u?.question || "pregunta pendiente"}\nNo implementar hasta responder. Responder: /wam answer ${u?.id || "U1"} <respuesta>`,
              { sessionID: input.sessionID, messageID: output.message?.id || input.messageID }
            );
          }
          return;
        }
      }

      // Continuation fast-path: contrato aprobado + sin claim de DONE → no inyectar nada,
      // el agente fluye sin interrupción (ni contrato ni línea de progreso).
      const existingState = getTaskState(taskId);
      if (existingState?.contract?.status === "APPROVED") {
        const claim = waitAMinute.evaluateCompletionGate(existingState, promptText);
        if (!claim.blocked && !claim.allDone) {
          input.waitAnalysis = sessionStore.get("waitAnalysis") || null;
          // Continuation: solo N2 (live task delta) — no reconstruir el pack
          try {
            updateLiveContext(taskId, existingState);
            const liveFile = path.join(projectDirectory, ".wam", "context", "task-context.md");
            if (fs.existsSync(liveFile)) {
              const live = fs.readFileSync(liveFile, "utf-8").trim();
              if (live) emitTextPart(output, `[wam N2 task]\n${live}\n`, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
            }
          } catch {}
          return;
        }
      }

      const analysis = await waitAMinute.analyze({
        prompt: promptText,
        projectPath: projectDirectory,
        config: cfg,
        tierCaps: cfg.tierCaps,
        activePreset: cfg.activePreset,
        activeMode: cfg.activeMode,
      });

      const state = waitAMinute.buildPersistedState(taskId, analysis);
      state.lastAction = promptText;

      // Assumption Gate (spec change 3): escalar asunciones con impacto material
      // → DECISION_CRITICAL/blocking + mirror a unknowns → ASKING (sin ejecución).
      try {
        const { changed } = escalateAssumptions(state, promptText);
        if (changed) persistTaskState(taskId, state);
      } catch (err) {
        console.error("[wait-a-minute] escalate assumptions failed:", err);
      }

      sessionStore.set("waitAnalysis", analysis);
      sessionStore.set("completionContract", state.contract);
      sessionStore.set("persistentPolicies", analysis.persistentPolicies || []);
      sessionStore.set("skillRegistry", analysis.skillRegistry || {});
      persistTaskState(taskId, state);

      // Blocking Questions: DECISION_CRITICAL sin responder → ASKING, preguntar, no ejecutar.
      const blockingUnknowns = (state.contract?.unknowns || []).filter((u) => u.status === "blocking");
      if (blockingUnknowns.length > 0 && state.phase !== "ANSWERED") {
        state.phase = "ASKING";
        state.nextAction = "Responder pregunta bloqueante antes de ejecutar";
        persistTaskState(taskId, state);
        const questions = [];
        for (const u of blockingUnknowns) {
          questions.push(`⛔ [wait-a-minute] ASKING — ${u.id}: ${u.question}\nNo implementar hasta responder. Responder: /wam answer ${u.id} <respuesta>`);
        }
        emitTextPart(output, questions.join("\n\n"), { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        return;
      }

      const gate = applyCompletionGate(state, promptText, taskId, waitAMinute, persistTaskState, nextActionFrom);
      const updatedState = getTaskState(taskId);

      // Contexto vivo: snapshot de la tarea activa, actualizado en cada mensaje
      try {
        updateLiveContext(taskId, updatedState);
      } catch {}

      const inject = prepareSystemInject(analysis, updatedState, cfg, projectDirectory, waitAMinute, taskId, emitTextPart, input, output);

      // Context Assembly Layer: paquete formal N0-N3 por tarea (ni más ni menos)
      try {
        initMemory();
        updateProjectMemo(analysis);
        const pack = assembleContext({
          prompt: promptText,
          taskId,
          classification: analysis.intent?.classification,
          mode: analysis.strategy,
          projectPath: projectDirectory,
          budget: cfg.contextBudget || 4000,
          taskState: updatedState,
        });
        if (pack.lines.length) {
          inject.push(pack.lines.join("\n") + `\n[wam pack ${pack.budget_used}/${pack.budget} tok ${pack.levels.N0 ? "N0" : ""}${pack.levels.N1 ? "+N1" : ""}${pack.levels.N2 ? "+N2" : ""}${pack.levels.N3 ? "+N3" : ""}]`);
        }
      } catch {}

      if (gate.blocked) {
        const pendingList = gate.pending.length > 0
          ? "\n  Requisitos pendientes:\n    " + gate.pending.map((p) => `- ${p}`).join("\n    ") + "\n"
          : "";
        const gateHold = `⛔ [wait-a-minute] COMPLETION GATE: faltan ${gate.pending.length} requisito(s). No declare DONE.${pendingList} Continuar con: ${updatedState.nextAction}`;
        emitTextPart(output, gateHold, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        if (input?.parts && input.parts.length > 0) {
          const tp = input.parts.find((p) => p.type === "text" && typeof p.text === "string");
          if (tp) tp.text = gateHold;
        }
      } else if (gate.allDone) {
        updateTaskMemory(taskId, {
          summary: [
            "# Task Summary",
            "",
            "## Objective",
            `- ${taskId} (${analysis.intent?.classification || "task"})`,
            "",
            "## Completed",
            ...(updatedState.contract?.requirements || []).map((r) => `- ${r}`),
            "",
            "## Verification",
            ...(updatedState.requirements || []).map((r) => `- ${r.id}: ${r.status}`),
            "",
            "## Status",
            "COMPLETED",
          ].join("\n"),
        });
        addRecentChange({
          date: new Date().toISOString().slice(0, 10),
          scope: taskId,
          changes: updatedState.contract?.requirements || [],
          verification: `requisitos completos: ${(updatedState.requirements || []).length}`,
        });
        try {
          closeSession({
            sessionId: getSessionId(projectDirectory),
            taskId,
            summary: (updatedState.contract?.requirements || []).join("; "),
            candidates: (updatedState.requirements || []).map((r) => ({ id: r.id, title: r.title, evidence: r.evidence || [] })),
          });
        } catch {}
      }

      if (inject.length > 0) {
        emitTextPart(output, inject.join("\n") + "\n", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
      }

      // Detectar confirmación implícita de continuación
      const lower = (input.message?.parts?.[0]?.text || "").toLowerCase();
      
      // Auto-aprobación para tareas que no requieren contrato explícito o son triviale
      const isApproved = updatedState.contract?.status === "APPROVED";
      const needsApproval = updatedState.phase === "PROPOSED" && !isApproved;

      if (!needsApproval || lower.includes("continuar") || lower.includes("aprobar contrato")) {
        if (needsApproval) {
          waitAMinute.approveContract(taskId);
          try {
            recordDecision({
              id: `strategy-${taskId}-${Date.now()}`,
              decision: `Aprobar estrategia ${analysis.strategy || "NORMAL"} para ${taskId}`,
              reason: promptText.slice(0, 120),
              source: "user-decided",
              confidence: "high",
            });
          } catch {}
        }
      } else {
        // Bloquear ejecución si no está aprobado
        updatedState.phase = "PROPOSED";
      }

      if (updatedState.contract.status !== "APPROVED") {
        waitAMinute.presentValidation({
          analysis: {
            ...analysis,
            contractStatus: updatedState.contract.status,
            phase: updatedState.phase,
            completionContract: updatedState.contract,
          },
          ctx: output,
          meta: { sessionID: input.sessionID, messageID: output.message?.id || input.messageID },
        });
      } else {
        // En IMPLEMENTING o APPROVED, inyectar solo progreso corto
        const pend = (updatedState.requirements || []).filter((r) => r.status !== "done").length;
        if (pend > 0) {
          emitTextPart(output, `[wait-a-minute: fase ${updatedState.phase}, ${pend}/${updatedState.requirements.length} requisitos pendientes]\n`, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        }
      }

      input.waitAnalysis = analysis;
    } catch (err) {
      console.error("[wait-a-minute] Pre-flight analysis failed:", err);
    }
  },

    // Handle /wam CLI (opencode 1.18.25: commands arrive via command.execute.before)
    "command.execute.before": async (input, output) => {
      if (input.command !== "wam") return;
      output.parts = output.parts || [];
      output.parts.push({
        id: genPartId(),
        type: "text",
        text: wamCli((input.arguments || "").split(/\s+/), cfg),
      });
    },

    // Enforce Clarification Gate (spec change 4): en ASKING se bloquean las
    // herramientas mutantes — la investigación read-only sigue permitida.
    "tool.execute.before": async (input) => {
      try {
        if (bypassed) return;
        const taskId = readActiveTaskId() || "default-task";
        const st = getTaskState(taskId);
        if (st?.phase !== "ASKING") return;
        const tool = input?.tool || "";
        if (BLOCKED_TOOLS.has(tool)) {
          const u = (st.contract?.unknowns || []).find((x) => x.status === "blocking");
          const question = u ? `${u.id}: ${u.question}` : "pregunta bloqueante pendiente";
          const directive = `[wait-a-minute] ENFORCED BLOCK — tarea en ASKING (${question}). Herramienta ${tool} bloqueada. Responder: /wam answer ${u?.id || "U1"} <respuesta>`;
          input.output = directive;
          throw new Error(directive);
        }
      } catch (err) {
        if (typeof err?.message === "string" && err.message.includes("ENFORCED BLOCK")) throw err;
      }
    },
  };
};


/**
 * Clasifica un mensaje recibido durante ASKING (spec clarification-gate):
 * "answer" (respuesta natural), "implementation" (intento de implementar →
 * interceptar, no consumir) o "new-intent" (cambio de tarea → nuevo pre-flight).
 */
function classifyAskingMessage(text = "") {
  const lower = (text || "").toLowerCase().trim();
  const doneClaims =
    /(^|\s)(done|finish|finished|complete|completed|terminate|terminated|listo|termin[eé]|complet[ao]|finalizad[oa])\b|(task|tarea)\s+(complete|complet(a|ada|o)|terminad(a|o))|declare.*done/i;
  if (doneClaims.test(lower)) return "blocked-message";
  if (/\b(olvida|olvídate|no quiero|mejor no|en realidad|nada que ver|cambia.*idea|descartar)\b/.test(lower)) return "new-intent";
  if (/\b(implementa|implementar|agrega|agregar|haz|hacer|refactoriza|refactorizar|migra|migrar|crea|crear|elimina|eliminar|arregla|arreglar|fix|configura|configurar|escribe|instala|instalar|construye|build)\b/.test(lower)) return "blocked-message";
  return "answer";
}

/**
 * /wam CLI — opencode 1.18.25 entrega comandos vía command.execute.before,
 * no vía ctx.command. Lógica extraída del handler antiguo.
 */
function wamCli(args, cfg = {}) {
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

  if (sub === "resume") {
    return JSON.stringify(waitAMinute.resumeTask(action || taskId));
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
    if (op === "verified") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "verified", evidence.join(" ")));
    if (op === "pending") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "pending", ""));
    return "Uso: /wam progress | /wam progress <id> done <evidencia> | /wam progress <id> verified <evidencia> | /wam progress <id> pending";
  }

  if (sub === "answer") {
    const qid = action;
    const answer = rest.join(" ").trim();
    if (!qid || !answer) return "Uso: /wam answer <questionId> <respuesta>";
    return JSON.stringify(waitAMinute.answerQuestion(taskId, qid, answer));
  }

  if (sub === "assumptions") {
    const st = getTaskState(taskId);
    if (!st) return "Sin estado de tarea";
    const list = st.contract?.assumptions || [];
    if (!list.length) return "Sin asunciones registradas";
    return list
      .map((a) => `${a.id} [${a.classification}/${a.status}] ${a.statement}${a.resolvedBy ? ` (resuelta: ${a.resolvedBy})` : ""}`)
      .join("\n");
  }

  if (sub === "resolve") {
    const aid = action;
    const evidence = rest.join(" ").trim();
    if (!aid || !evidence) return "Uso: /wam resolve <assumptionId> <evidencia>";
    return JSON.stringify(waitAMinute.resolveAssumption(taskId, aid, evidence));
  }

  if (sub === "compress") {
    const id = rest.join(" ") || action || taskId;
    const st = getTaskState(id);
    if (!st) return "Sin estado de tarea";
    const pend = (st.requirements || []).filter((r) => r.status !== "done").length;
    const budget = cfg.budgetTokens || DEFAULT_CONFIG.budgetTokens;
    const cav = cavemanify([
      `task ${id} — ${st.phase} / ${st.contract?.status || "?"}`,
      `req: ${pend}/${(st.requirements || []).length} pend | next: ${st.nextAction || "—"}`,
    ].join("\n"));
    const tokens = estimateTokens(cav);
    const headroom = Math.max(0, budget - tokens);
    try {
      const dir = path.join(process.cwd(), ".wam", "tasks", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "caveman-summary.md"), cav + "\n");
    } catch {}
    return `${cav}\n[tokens ${tokens} | headroom ${headroom}/${budget}]`;
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

  if (sub === "ctx") {
    if (action === "list") {
      const caps = listCapsules(process.cwd());
      if (!caps.length) return "Sin cápsulas (usa /wam ctx add o extracción en DONE)";
      return caps.map((c) => `${c.context_id} [${c.level} ${c.lifecycle}] ${c.provenance} ${(c.purpose || "").slice(0, 60)}`).join("\n");
    }
    if (action === "get") {
      const q = rest.join(" ");
      if (!q) return "Uso: /wam ctx get <query>";
      const r = retrieveContext(q, { root: process.cwd() });
      if (!r.ok) return r.message;
      return r.capsules.map((h) => `[${h.capsule.level}] ${h.capsule.context_id} (rel ${h.relevance.toFixed(2)}) ${(h.capsule.purpose || "").slice(0, 80)}`).join("\n");
    }
    if (action === "show") {
      const id = rest.join(" ");
      const c = getCapsule(id, process.cwd());
      if (!c) return `Cápsula ${id} no existe`;
      return [
        `${c.context_id} [${c.level} ${c.lifecycle}]`,
        `provenance: ${c.provenance} | importance: ${c.importance}/10 | confidence: ${c.confidence}`,
        `purpose: ${c.purpose}`,
        `scope: ${c.scope}`,
        `deps: ${(c.dependencies || []).join(", ") || "—"} | supersedes: ${c.supersedes || "—"}`,
        `--- content (max 600 chars) ---`,
        `${(c.content || "(sin contenido)").slice(0, 600)}`,
      ].join("\n");
    }
    if (action === "promote") {
      const [id, target, approved] = rest;
      if (!id || !target) return "Uso: /wam ctx promote <id> <L2|L1> [approved]";
      const r = promoteCapsule(id, target, { approvedBy: approved === "approved" ? "user" : "", root: process.cwd() });
      if (!r.ok) return `Promoción rechazada: ${r.reason}`;
      return `Promovida ${id} → ${target} [${r.capsule.provenance}]`;
    }
    if (action === "session") {
      const sid = getSessionId(process.cwd());
      const caps = listCapsules(process.cwd(), { sessionId: sid });
      return `session: ${sid}\ncapsules de esta sesión: ${caps.length}\nL1 base: ${listCapsules(process.cwd(), { level: "L1", lifecycle: "active" }).length} cápsula(s)`;
    }
    return "Uso: /wam ctx <list|get <q>|show <id>|promote <id> <L2|L1> [approved]|session>";
  }

  return "Uso: /wam <skills|contract|progress|task|compress|ctx|answer|assumptions|resolve>";
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
    if (existing && existing.requirements && existing.requirements.length) {
      // Preservar contrato/requisitos existentes (PROPOSED/APPROVED/REJECTED):
      // el contrato se sintetiza UNA vez (primer mensaje); los mensajes
      // siguientes no re-sintetizan del texto actual (claims incluidos).
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
    if (lower.includes("aprobar contrato") || lower.includes("continuar")) {
      return { blocked: false, allDone: false, autoApprove: true };
    }
    const doneClaims =
      /(^|\s)(done|finish|finished|complete|completed|terminate|terminated|listo|termin[eé]|complet[ao]|finalizad[oa])\b|(task|tarea)\s+(complete|complet(a|ada|o)|terminad(a|o))|declare.*done/i;
    if (!doneClaims.test(lower)) return { blocked: false };
    const blockingUnknowns = (state?.contract?.unknowns || []).filter((u) => u.status === "blocking");
    if (blockingUnknowns.length > 0) {
      return {
        blocked: true,
        pending: blockingUnknowns.map((u) => `${u.id} — ${u.question} (DECISION_CRITICAL sin responder)`),
      };
    }
    const blockingAssumptions = (state?.contract?.assumptions || []).filter(
      (a) => a.classification === "DECISION_CRITICAL" && a.status !== "resolved"
    );
    if (blockingAssumptions.length > 0) {
      return {
        blocked: true,
        pending: blockingAssumptions.map((a) => `${a.id} — ${a.statement} (DECISION_CRITICAL sin resolver)`),
      };
    }
    const pending = (state?.requirements || []).filter((r) => r.status !== "done" && r.status !== "verified");
    if (pending.length > 0) {
      return {
        blocked: true,
        pending: pending.map((r) => {
          const missingEvidence = r.status === "done" && !(r.evidence || []).length;
          return `${r.id} — ${r.title}${missingEvidence ? " (sin evidencia)" : ""}`;
        }),
      };
    }
    if (state?.contract?.status !== "APPROVED") {
      return {
        blocked: true,
        pending: [`contrato ${state.contract?.status || "PROPOSED"} — aprobar con /wam contract approve antes de DONE`],
      };
    }
    const unverified = (state?.requirements || []).filter((r) => r.status !== "verified");
    if (unverified.length > 0) {
      return {
        blocked: true,
        verifying: true,
        pending: unverified.map((r) => `${r.id} — ${r.title} (verificar: /wam progress ${r.id} verified <evidencia>)`),
      };
    }
    return { blocked: false, allDone: true };
  },

  /** Aprueba el contrato: PROPOSED → APPROVED, fase → IMPLEMENTING. */
  resumeTask: function(taskId) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea para: " + taskId };
    if (state.phase === "DONE") return { ok: false, reason: "Tarea DONE — no se reabre automáticamente. Crea una nueva." };
    writeActiveTaskId(taskId);
    try {
      updateLiveContext(taskId, state);
    } catch {}
    return { ok: true, taskId, phase: state.phase, contract: state.contract?.status || "?" };
  },

  approveContract: function(taskId) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const blocking = (state.contract?.unknowns || []).filter((u) => u.status === "blocking");
    if (blocking.length > 0) {
      return { ok: false, reason: `${blocking[0].id} DECISION_CRITICAL sin responder (bloquea aprobación): ${blocking[0].question}` };
    }
    const blockingAssumptions = (state.contract?.assumptions || []).filter(
      (a) => a.classification === "DECISION_CRITICAL" && a.status !== "resolved"
    );
    if (blockingAssumptions.length > 0) {
      return {
        ok: false,
        reason: `${blockingAssumptions[0].id} DECISION_CRITICAL sin resolver (bloquea aprobación): ${blockingAssumptions[0].statement} — /wam resolve ${blockingAssumptions[0].id} <evidencia>`,
      };
    }
    state.contract = { ...(state.contract || {}), status: "APPROVED" };
    if (state.phase !== "DONE") state.phase = "IMPLEMENTING";
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state);
    try {
      updateLiveContext(taskId, state);
    } catch {}
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
    if ((status === "done" || status === "verified") && !(evidence && evidence.trim())) {
      return { ok: false, reason: `Requisito ${reqId}: evidencia requerida para marcar ${status}` };
    }
    if (status === "verified" && req.status !== "done") {
      return { ok: false, reason: `Requisito ${reqId}: marcar done antes de verified` };
    }
    req.status = status;
    if (status === "done" || status === "verified") req.evidence.push(evidence.trim());
    if (status === "pending") req.evidence = [];
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state);
    return { ok: true, phase: state.phase, nextAction: state.nextAction };
  },

  /** Responde una pregunta bloqueante: unknown → answered, fase ASKING → ANSWERED → PROPOSED. */
  answerQuestion: function(taskId, qid, answer) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const u = (state.contract?.unknowns || []).find((x) => x.id === qid);
    if (!u) return { ok: false, reason: `Pregunta ${qid} no existe` };
    if (!(answer && answer.trim())) return { ok: false, reason: `Respuesta requerida para ${qid}` };
    u.status = "answered";
    u.answer = answer.trim();
    if (u.assumptionId) {
      const a = (state.contract?.assumptions || []).find((x) => x.id === u.assumptionId);
      if (a) {
        a.status = "resolved";
        a.classification = "RESOLVED";
        a.resolvedBy = "answer";
      }
    }
    state.phase = "ANSWERED";
    persistTaskState(taskId, state);
    state.phase = "PROPOSED";
    state.nextAction = "Revisar contrato — /wam contract approve";
    persistTaskState(taskId, state);
    return { ok: true, phase: "PROPOSED", unknown: u };
  },

  /** Reconocimiento de respuesta natural (spec enforce-clarification-gate): en ASKING,
   *  un mensaje normal resuelve TODAS las preguntas bloqueantes con ese texto y
   *  re-evalúa el estado (assumption asociada → resolved). */
  answerFromMessage: function(taskId, text) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const blocking = (state.contract?.unknowns || []).filter((u) => u.status === "blocking");
    if (!blocking.length) return { ok: false, reason: "Sin preguntas bloqueantes" };
    const answer = (text || "").trim();
    if (!answer) return { ok: false, reason: "Respuesta vacía" };
    let first = null;
    for (const u of blocking) {
      u.status = "answered";
      u.answer = answer;
      if (u.assumptionId) {
        const a = (state.contract?.assumptions || []).find((x) => x.id === u.assumptionId);
        if (a) {
          a.status = "resolved";
          a.classification = "RESOLVED";
          a.resolvedBy = "answer";
        }
      }
      first = first || u;
    }
    state.phase = "PROPOSED";
    state.nextAction = "Revisar contrato — /wam contract approve";
    persistTaskState(taskId, state);
    return { ok: true, u: first, phase: state.phase, nextAction: state.nextAction };
  },
  /** Resuelve una asunción con evidencia del repo (spec change 3 R4): → RESOLVED sin preguntar al usuario. */
  resolveAssumption: function(taskId, aid, evidence) {
    const state = getTaskState(taskId);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const a = (state.contract?.assumptions || []).find((x) => x.id === aid);
    if (!a) return { ok: false, reason: `Asunción ${aid} no existe` };
    if (!(evidence && evidence.trim())) return { ok: false, reason: `Evidencia requerida para resolver ${aid}` };
    a.status = "resolved";
    a.classification = "RESOLVED";
    a.resolvedBy = "evidence";
    a.evidence = evidence.trim();
    const u = (state.contract?.unknowns || []).find((x) => x.assumptionId === aid && x.status === "blocking");
    if (u) {
      u.status = "answered";
      u.answer = evidence.trim();
    }
    const stillBlocking = (state.contract?.unknowns || []).some((x) => x.status === "blocking");
    if (state.phase === "ASKING" && !stillBlocking) {
      state.phase = "PROPOSED";
      state.nextAction = "Revisar contrato — /wam contract approve";
    }
    persistTaskState(taskId, state);
    return { ok: true, assumption: a };
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

    const skillsLine = analysis.skills?.selected?.length
      ? analysis.skills.selected.map((s) => s.name).join(",")
      : "ninguna";
    const blockingUnknowns = (analysis.completionContract?.unknowns || []).filter((u) => u.status === "blocking");
    const blockingAssumptions = (analysis.completionContract?.assumptions || []).filter(
      (a) => a.classification === "DECISION_CRITICAL" && a.status !== "resolved"
    );
    const validationLines = [
      `wait-a-minute: contrato ${contractStatus}${analysis.phase ? ` (fase ${analysis.phase})` : ""}`,
      `rigor ${analysis.completionContract?.rigor || "NORMAL"} | req: ${(analysis.completionContract?.requirements || []).join("; ") || "—"}`,
      `ver: ${(analysis.completionContract?.verification || []).join("; ") || "—"}`,
      `riesgo ${analysis.risk} | compl ${analysis.complexity} | amb ${analysis.ambiguity}`,
      `skills: ${skillsLine}`,
      ...(blockingUnknowns.length
        ? [`blocking: ${blockingUnknowns.map((u) => `${u.id} ${u.question}`).join(" | ")}`]
        : []),
      ...(blockingAssumptions.length
        ? [`assumptions blocking: ${blockingAssumptions.map((a) => `${a.id} ${a.statement}`).join(" | ")}`]
        : []),
      "",
      "continuar → ejecutar | /wam contract approve → aprobar | /wam compress → resumen terse",
    ];

    if (ctx) {
      const text = validationLines.filter((l) => l !== false).join("\n") + "\n";
      if (Array.isArray(ctx.parts)) {
        ctx.parts.unshift({
          id: genPartId(),
          type: "text",
          text,
          synthetic: true,
          ...(meta.sessionID ? { sessionID: meta.sessionID } : {}),
          ...(meta.messageID ? { messageID: meta.messageID } : {}),
        });
        
        // Agregar directiva clara de ejecución
        ctx.parts.push({
          type: "text",
          text: `\n[wam: fase ${analysis.phase || "IMPLEMENTING"} → ${analysis.nextAction || "continuar"}]`,
          synthetic: true
        });
      } else if (ctx.system) {
        ctx.system.unshift({ id: genPartId(), type: "text", text, synthetic: true });
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
export { updateProjectMemo };

