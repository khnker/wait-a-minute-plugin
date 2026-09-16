import { analyze, routeSkillsV2, loadSkillOnDemand, cavemanify, estimateTokens, buildAssumptions, escalateAssumptions, formatBacklog, findDuplicateTask } from "./engine.js";
import { startExperiment, noteSuccess, noteFailure } from "./execution-engine.js";
import { migrateLegacyCognition } from "./cognition-store.js";
import { handleMessage } from "./runtime/message-handler.js";

import { initMemory, updateProjectMemo, summarizeOperationalContext, updateContext, getOperationalContext, updateTaskMemory, addRecentChange, recordDecision, getDecision, updateLiveContext, compactDecisions } from "./memory.js";
import { getSessionId, listCapsules, getCapsule, promoteCapsule, selectContext, retrieveContext, closeSession, resolveWamRoot, migrateLegacyCapsules } from "./context.js";
import { assembleContext } from "./assembly.js";
import { evaluateRequirement as evaluateRequirementChecks, verifyRequirement } from "./verification.js";
import { ContextDecisionTracer } from "./context-decision-audit.js";
import { guardAction } from "./runtime-guards.js";
import { WamPolicyBlock } from "./risk-engine.js";
import { getStatusReport } from "./execution-state.js";
import { createSnapshot, checkContinuation, rebuildScope } from "./context-snapshot.js";
import fs from "node:fs";
import path from "node:path";

const sessionExecutions = new Map();
export { sessionExecutions };

function isSafeReadTool(tool) {
  const normalized = String(tool || "").toLowerCase();
  if (SAFE_READ_TOOLS instanceof Set) return SAFE_READ_TOOLS.has(normalized);
  if (SAFE_READ_TOOLS?.length) return SAFE_READ_TOOLS.some((t) => t?.toLowerCase() === normalized);
  return ["read", "read_file", "list_directory", "list_files", "get_file"].includes(normalized);
}

function inferExpectedObservation(tool, args) {
  const operation = String(tool || "").toLowerCase();
  if (operation.includes("read") || operation.includes("list") || operation.includes("inspect")) {
    return null;
  }
  if (operation.includes("write") || operation.includes("edit") || operation.includes("apply") || operation.includes("run") || operation.includes("test")) {
    return `La herramienta ${tool} completa ${args ? "con los argumentos proporcionados" : "correctamente"}`;
  }
  return null;
}

async function bridgeExecution(input) {
  const taskId = input?.taskId || input?.taskID;
  const sessionID = input?.sessionID || input?.sessionId || getSessionId();
  const taskRoot = input?.taskRoot || input?.st?.root || input?.st?.taskRoot;
  const tool = input?.tool || input?.toolName || input?.action || input?.name;
  const args = input?.args || input?.parameters || {};
  const state = input?.st || {};
  const requirements = Array.isArray(state.requirements) ? state.requirements : [];
  const requirement = requirements.find((item) => item?.status !== "done" && item?.status !== "verified") || requirements[0] || null;
  const contractApproved = state.contract?.status === "APPROVED";
  const phase = state.phase;

  if (!taskId || !taskRoot || !tool || (!contractApproved && !["IMPLEMENTING", "VERIFYING"].includes(phase)) || isSafeReadTool(tool)) {
    return;
  }

  try {
    const result = await startExperiment(taskRoot, taskId, {
      statement: `${tool} ${JSON.stringify(args)}`,
      tool,
      args,
      expectedObservation: inferExpectedObservation(tool, args),
      confidence: 0.5,
    });

    if (!result?.ok || !result.hypothesis || !result.experiment) {
      console.log(`[wait-a-minute] No se pudo iniciar el experimento para ${tool}: ${result?.guard?.reason || "sin resultado"}`);
      return;
    }

    const key = input?.callID || `${sessionID}:${tool}`;
    const mapping = {
      hypothesisId: result.hypothesis.id,
      experimentId: result.experiment.id,
      requirementId: requirement?.id || null,
    };
    sessionExecutions.set(key, mapping);
    Object.assign(input, mapping);
  } catch (error) {
    console.log(`[wait-a-minute] Falló el puente de ejecución para ${tool}: ${error.message}`);
  }
}

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

function truncate(text, max = 80) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max - 3) + "...";
}

function nextActionFrom(state) {
  const pending = (state?.requirements || []).find((r) => !["done", "verified"].includes(r.status));
  if (pending) return `Implementar ${truncate(pending.title)} (${pending.id} ${pending.status})`;
  const unverified = (state?.requirements || []).find((r) => r.status === "done");
  if (unverified) return `Verificar ${truncate(unverified.title)} — /wam progress ${unverified.id} verified <evidencia>`;
  if (state?.requirements?.length) return "Verificar requisitos completos antes de DONE";
  return "Continuar tarea";
}

const BLOCKED_TOOLS = new Set(["write", "edit", "bash", "task", "todowrite", "pty_spawn", "pty_write", "pty_kill"]);

// git de solo lectura (status/diff/log/...) es investigación read-only:
// nunca requiere run-loop ni delegación — permitido aun en ASKING.
const READONLY_GIT_RE = /^\s*git\s+(status|diff|log|show|ls-files|branch|stash\s+list|remote\s+-v|rev-parse|ls-remote)\b/;

function bashCommandOf(input) {
  const c = input?.args?.command ?? input?.params?.command ?? input?.input?.command ?? "";
  if (typeof c === "string" && c.trim()) return c;
  try {
    for (const v of Object.values(input?.args ?? {})) {
      if (typeof v === "string" && /^\s*git\s+/m.test(v)) return v;
    }
  } catch {}
  return "";
}

const ACTIVE_FILE = (root) => path.join(root || process.cwd(), ".wam", "active-task");

function readActiveTaskId(root) {
  try {
    const v = fs.readFileSync(ACTIVE_FILE(root), "utf-8").trim();
    if (!v) return null;
    try {
      const j = JSON.parse(v);
      if (j && typeof j === "object" && j.id) return j.id;
    } catch {}
    return v;
  } catch {
    return null;
  }
}

function readActiveTaskRecord(root) {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE(root), "utf-8").trim();
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (j && j.id && typeof j.ts === "number") return j;
    } catch {}
    return { id: raw, ts: 0 };
  } catch {
    return null;
  }
}

function readActiveTaskIdFresh(root, ttlMs = 60000) {
  const rec = readActiveTaskRecord(root);
  if (!rec) return null;
  if (!rec.ts) return null;
  if (Date.now() - rec.ts <= ttlMs) return rec.id;
  return null;
}

function writeActiveTaskId(id, root) {
  fs.mkdirSync(path.dirname(ACTIVE_FILE(root)), { recursive: true });
  fs.writeFileSync(ACTIVE_FILE(root), JSON.stringify({ id, ts: Date.now() }));
}

function listTaskIds(root) {
  const dir = path.join(root || process.cwd(), ".wam", "tasks");
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

// -- Persistencia por sesión: N sesiones pueden trabajar la MISMA carpeta sin
// colisionar en default-task / task-context.md / active-task. ----------------

const GENERIC_TASK = /^(default-task|task|general|)$/;

/**
 * taskId efectivo de WAM para un mensaje:
 * - input.taskId explícito y específico (conversación de opencode) → se usa tal cual
 * - taskId conocido en sessionTasks (cache de chat.message) → ese
 * - active-task reciente (<=60s, escrito por /wam task switch o /wam resume) →
 *   ese (intención explícita reciente del usuario)
 * - sin taskId ni sesión conocida → namespace por sesión: ses-<sessionID>
 *
 * active-task global NO se usa como fallback automático: solo /wam task switch
 * o /wam resume lo consultan vía readActiveTaskIdFresh() con TTL de 60s. Esto
 * evita que sesiones nuevas adopten estado de tareas previas en la misma
 * carpeta; tras 60s sin actividad el active-task se considera obsoleto.
 */
function effectiveTaskId(input, sessionTasks, wamRoot) {
  if (input?.taskId && !GENERIC_TASK.test(input.taskId)) return input.taskId;
  const cached = sessionTasks?.get?.(input?.sessionID);
  if (cached) return cached;
  const fresh = readActiveTaskIdFresh(wamRoot);
  if (fresh) return fresh;
  if (input?.sessionID) return `ses-${input.sessionID.slice(-10)}`;
  return "default-task";
}

function taskDir(root, taskId) {
  return path.join(root || process.cwd(), ".wam", "tasks", taskId);
}

function liveFileFor(root, taskId) {
  return path.join(taskDir(root, taskId), "context.md");
}

function readLiveContext(root, taskId) {
  const perSession = liveFileFor(root, taskId);
  try {
    if (fs.existsSync(perSession)) return fs.readFileSync(perSession, "utf-8").trim();
  } catch {}
  return "";
}

/**
 * Live context por sesión: live snapshot en .wam/tasks/<taskId>/context.md.
 * Aislado por task — dos sesiones sobre la misma carpeta NO se pisan el N2.
 */
function persistLiveContext(taskId, state, root) {
  updateLiveContext(taskId, state, root);
}

// -- operational memory (memory.js): contexto inicial acelerador (spec §13) --

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

function applyCompletionGate(state, promptText, taskId, waitAMinute, persistTaskState, nextActionFrom, root) {
  const gate = waitAMinute.evaluateCompletionGate(state, promptText);
  if (gate.blocked) {
    state.phase = gate.verifying ? "VERIFYING" : "IMPLEMENTING";
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state, root);
  } else if (gate.allDone) {
    state.phase = "DONE";
    state.nextAction = "Tarea completa — contrato verificado";
    persistTaskState(taskId, state, root);
  }
  return gate;
}

/**
 * Compresión automática de tarea (caveman-summary.md). Se genera en DONE
 * (memoria comprimida para continuidad) y manualmente via /wam compress.
 */
function writeCavemanSummary(taskId, state, root, extra = "") {
  const reqs = state?.requirements || [];
  const pend = reqs.filter((r) => r.status !== "done" && r.status !== "verified").length;
  const base = [
    `task ${taskId} — ${state?.phase || "?"} / ${state?.contract?.status || "?"}`,
    `req: ${pend}/${reqs.length} pend | next: ${state?.nextAction || "—"}`,
  ];
  const cav = cavemanify([...base, extra].filter(Boolean).join("\n"));
  try {
    const dir = path.join(root || process.cwd(), ".wam", "tasks", taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "caveman-summary.md"), cav + "\n");
  } catch {}
  return cav;
}

// -- Delegación dura: reqs pendientes → subagentes en paralelo --------------

const MUTATING_TOOLS = new Set(["write", "edit", "apply_patch", "patch", "todo_write", "todowrite"]);

function domainHint(text = "") {
  const t = text.toLowerCase();
  const hints = [];
  if (/\bfrontend\b|\bfe\b|front-?end|\bui\b|button|componente|vista|pantalla|react|web\b/.test(t)) hints.push("frontend");
  if (/backend|back-?end|\bapi\b|server|endpoint|base de datos|\bdb\b|database|nest|express|postgres|mongo/.test(t)) hints.push("backend");
  if (/scrap|crawl|parser|puppeteer|playwright/.test(t)) hints.push("scraper");
  if (/test|e2e|spec|coverage|unitario/.test(t)) hints.push("tests");
  if (/security|seguridad|auth|token|jwt|credencial/.test(t)) hints.push("security");
  return hints.length ? hints.join("+") : "";
}

/**
 * Directiva de delegación para reqs pendientes de un contrato APPROVED:
 * cada req → Task en paralelo con agente libre (el que el entorno tenga).
 */
function delegationLines(state) {
  const reqs = (state?.requirements || []).filter((r) => r.status !== "done" && r.status !== "verified");
  if (!reqs.length || state?.contract?.status !== "APPROVED") return [];
  const lines = [
    "[wam delegation] Reqs pendientes → delegar en PARALELO via Task (agente: el apropiado según config del entorno). Mutación directa de archivos desde la sesión principal está BLOQUEADA — solo un subagente ejecuta write/edit.",
  ];
  const visible = reqs.slice(0, MAX_VISIBLE_REQS);
  const overflow = reqs.length - MAX_VISIBLE_REQS;
  for (const r of visible) {
    const hint = domainHint(r.title);
    lines.push(`  ${r.id} → Task(parallel) "${truncate(r.title, 120)}"${hint ? ` [contexto: ${hint}]` : ""}`);
  }
  if (overflow > 0) {
    lines.push(`  ...(+${overflow} requisitos adicionales consolidados)`);
  }
  return lines;
}

const MAX_VISIBLE_REQS = 8;

/**
 * Strategy Continuity: classify whether an action is covered by an active
 * approved strategy. Used by tool.execute.before to avoid asking for
 * per-step approval for actions that are ordinary execution of an
 * already-approved strategy.
 *
 * Returns:
 *   { covered: true,  reason }       → action proceeds without re-approval
 *   { covered: false, reason }       → action requires explicit user decision
 *   { covered: null,  reason }       → no active strategy, fall through to default logic
 */
function classifyActionAgainstStrategy(action, tool, args, approvedStrategy) {
  if (!approvedStrategy || approvedStrategy.status !== "ACTIVE") {
    return { covered: null, reason: "No active approved strategy" };
  }

  const actionLower = String(action || "").toLowerCase();
  const toolLower = String(tool || "").toLowerCase();
  const cmdLower = String(args?.command || args?.cmd || args?.script || "").toLowerCase();

  // 1. Prohibited actions: ALWAYS require explicit user authorization,
  //    even if strategy is approved. Strategy continuity is not blanket.
  for (const prohibited of approvedStrategy.prohibitedActions || []) {
    if (actionLower.includes(prohibited.toLowerCase())) {
      return {
        covered: false,
        reason: `Acción prohibida explícitamente en strategy: ${prohibited}`,
      };
    }
    if (cmdLower.includes(prohibited.toLowerCase())) {
      return {
        covered: false,
        reason: `Comando prohibido explícitamente en strategy: ${prohibited}`,
      };
    }
  }

  // 2. Allowed actions: cover SAFE and TACTICAL execution of the strategy.
  //    Examples: read, search, inspect, test, lint, install dependency,
  //    install browser binary, run validation, modify source, retry.
  for (const allowed of approvedStrategy.allowedActions || []) {
    if (actionLower.includes(allowed.toLowerCase())) return { covered: true, reason: `allowed: ${allowed}` };
    if (toolLower.includes(allowed.toLowerCase())) return { covered: true, reason: `tool: ${allowed}` };
    if (cmdLower.includes(allowed.toLowerCase())) return { covered: true, reason: `cmd: ${allowed}` };
  }

  // 3. Heuristic fallback: SAFE/inspector tools are always covered when
  //    strategy is active (they cannot break it).
  const safeTools = ["read", "grep", "glob", "ls", "fetch", "webfetch", "test", "lint"];
  if (safeTools.includes(toolLower)) return { covered: true, reason: "SAFE tool under active strategy" };

  return { covered: false, reason: "Acción no cubierta explícitamente por la estrategia aprobada" };
}

/**
 * Evidence-Guided Recovery: classify a failure so the agent must diagnose
 * before proposing a strategic change.
 *
 * Returns a category hint. Provisional, MUST NOT be treated as fact.
 */
function classifyFailure(result, expected, observed) {
  const obs = String(observed || "").toLowerCase();
  const res = String(result || "").toLowerCase();

  if (/timeout|timed out/.test(obs)) return { category: "TIMING", priority: 2 };
  if (/403|401|307|blocked|captcha|perimeterx|big-ip/.test(obs)) return { category: "ANTI_BOT", priority: 8 };
  if (/enotfound|econnrefused|network/.test(obs)) return { category: "NETWORK", priority: 1 };
  if (/0 products|empty|no results|not found/.test(obs)) return { category: "ZERO_RESULT", priority: 3 };
  if (/selector|element not found|null/.test(obs)) return { category: "SELECTOR", priority: 4 };
  if (/chromium|browser|executable/.test(obs)) return { category: "BROWSER_RUNTIME", priority: 5 };
  if (/dependency|module not found|cannot find/.test(obs)) return { category: "DEPENDENCY", priority: 1 };
  if (/permission denied|eacces/.test(obs)) return { category: "ENVIRONMENT", priority: 2 };
  if (/parse|json|syntax/.test(obs)) return { category: "PARSER", priority: 4 };

  return { category: "UNKNOWN", priority: 10 };
}

/**
 * Reference Evidence Priority: load known-good references for the current
 * task domain. Used in context assembly to anchor the agent to proven
 * implementations instead of letting it invent alternatives.
 */
function loadReferenceEvidence(taskRoot, intent) {
  const refsFile = path.join(taskRoot || "", ".wam", "references.json");
  if (!fs.existsSync(refsFile)) return [];
  try {
    const refs = JSON.parse(fs.readFileSync(refsFile, "utf-8"));
    const goal = String(intent?.goal || intent?.classification || "").toLowerCase();
    return (refs.references || []).filter((r) => {
      const targets = (r.targets || []).map((t) => t.toLowerCase());
      return targets.some((t) => goal.includes(t)) || goal.length === 0;
    });
  } catch {
    return [];
  }
}

function prepareSystemInject(analysis, state, cfg, projectDirectory, waitAMinute, taskId) {
  // WAM injects objective + remaining requirements as advisory state.
  // The agent implements EXACTLY what the user asked — no strategy deviation,
  // no "decide your own approach". Only ambiguity triggers clarification.
  const inject = [];
  const reqs = state.requirements || [];
  const pend = reqs.filter((r) => r.status !== "done");
  const objective = state.contract?.objective || analysis.intent?.goal || null;

  // Silence for trivial/fast: no inject noise.
  if (analysis.intent?.classification === "trivial" || analysis.strategy === "FAST") {
    return inject;
  }

  // Once: contract display, then contractDisplayed flips. After that the agent
  // already has the objective in working memory — no need to repeat.
  if (state.phase === "PROPOSED" && !state.contractDisplayed) {
    const visible = reqs.slice(0, MAX_VISIBLE_REQS);
    const overflow = reqs.length - MAX_VISIBLE_REQS;
    inject.push(
      `Objective: ${objective || "pending"}`,
      `Remaining (${pend.length}/${reqs.length}):`,
      ...visible.map((r) => `  - ${truncate(r.title, 120)}`),
      ...(overflow > 0 ? [`  ...(+${overflow} more)`] : [])
    );
    state.contractDisplayed = true;
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

  // Multi-repo: root real de cada sesión. La factory del plugin V1 es GLOBAL
  // al server (pluginInput.directory = cwd donde se lanzó opencode), pero cada
  // sesión tiene su propio directorio de trabajo (location.directory) — lo
  // consultamos vía client.session.get para no depender del cwd del proceso.
  const sessionRoots = new Map();
  const sessionParents = new Map(); // sessionID → parentID (subagentes Task tienen parent)
  const sessionTasks = new Map(); // sessionID → taskId activo visto en chat.message
  const client = pluginInput?.client;

  async function resolveSessionBase(sessionID) {
    if (sessionRoots.has(sessionID)) return sessionRoots.get(sessionID);
    let base = projectDirectory;
    try {
      const info = client?.session?.get && sessionID ? await client.session.get({ sessionID }) : null;
      if (info?.location?.directory) base = info.location.directory;
      if (info?.parentID) sessionParents.set(sessionID, info.parentID);
    } catch {
      // fallback: cwd del server
    }
    sessionRoots.set(sessionID, base);
    return base;
  }

  // .wam root para esta sesión+mensaje: repo git objetivo de la sesión real.
  const wamRootFor = async (sessionID, promptText) => {
    const base = await resolveSessionBase(sessionID);
    return resolveWamRoot(promptText, base);
  };

  // Al iniciar/retomar cualquier sesión la memoria .wam debe existir.
  // initMemory es idempotente: crea .wam/context si falta, no fabrica nada.
  const ensureWamMemory = async (sessionID, promptText) => {
    const root = await wamRootFor(sessionID, promptText);
    try {
      initMemory(root);
    } catch {}
    return root;
  };

  // -------------------------------------------------------------------------
  // opencode 1.18.25 plugin API: factory RETURNS the hooks object
  // -------------------------------------------------------------------------
  return {
    // /wam commands are registered via opencode.jsonc "command" entries on startup,
    // NOT via a plugin config hook (removed: plugin config hook mutated config and
    // is incompatible with opencode 1.18.26+, causing `N.config` TypeError).

    // Chat message hook — Persistence & Progress Gate.
    // Slim adapter: delegates message processing to runtime/message-handler.js.
    "chat.message": (input, output) =>
      handleMessage(input, output, {
        bypassed,
        sessionTasks,
        sessionStore,
        cfg,
        resolveSessionBase,
        wamRootFor,
        ensureWamMemory,
        effectiveTaskId,
        genPartId,
        emitTextPart,
        readActiveTaskIdFresh,
        writeActiveTaskId,
        waitAMinute,
        migrateLegacyCognition,
        noteSuccess,
        noteFailure,
        getTaskState,
        persistTaskState,
        findDuplicateTask,
        escalateAssumptions,
        buildAssumptions,
        initMemory,
        updateProjectMemo,
        updateLiveContext,
        readLiveContext,
        persistLiveContext,
        assembleContext,
        createSnapshot,
        checkContinuation,
        rebuildScope,
        getDecision,
        recordDecision,
        compactDecisions,
        writeCavemanSummary,
        truncate,
        delegationLines,
        updateTaskMemory,
        addRecentChange,
        closeSession,
        getSessionId,
        classifyAskingMessage,
      }),

    // Handle /wam CLI (opencode 1.18.25: commands arrive via command.execute.before)
    "command.execute.before": async (input, output) => {
      if (input.command !== "wam") return;
      output.parts = output.parts || [];
      const sid = input.sessionID;
      const root = await resolveSessionBase(sid);
      const taskKey = sessionTasks.get(sid) || readActiveTaskIdFresh(root) || (sid ? `ses-${sid.slice(-10)}` : "default-task");
      output.parts.push({
        id: genPartId(),
        type: "text",
        text: wamCli((input.arguments || "").split(/\s+/), cfg, root, taskKey),
      });
    },

    // Enforce Clarification Gate (spec change 4): en ASKING se bloquean las
    // herramientas mutantes — la investigación read-only sigue permitida.
    // Además captura el root real de la sesión desde los args de los tools
    // (openmode web multi-proyecto: el cwd de la sesión llega por aquí, no
    // por pluginInput.directory que es el cwd del proceso server).
    "tool.execute.before": async (input, output) => {
      try {
        if (bypassed) return;
        const sid = input?.sessionID;
        const taskRoot = await resolveSessionBase(sid);
        let taskId = sessionTasks.get(sid) || readActiveTaskIdFresh(taskRoot) || (sid ? `ses-${sid.slice(-10)}` : "default-task");
        let st = getTaskState(taskId, taskRoot);
        // Fallback: try the active task from disk if first lookup failed
        if (!st && !sid) {
          const activeId = readActiveTaskIdFresh(taskRoot);
          if (activeId && activeId !== taskId) {
            taskId = activeId;
            st = getTaskState(taskId, taskRoot);
          }
        }
        const tool = input?.tool || "";
        if (process.env.WAM_DEBUG_TE) {
          console.log(`[WAM-DEBUG-TE] sid=${sid} taskId=${taskId} phase=${st?.phase} tool=${tool}`);
        }
        if (process.env.WAM_DEBUG_TE) {
          console.log(`[WAM-DEBUG-TE-CHECK] phase=${st?.phase} tool=${tool} inBlocked=${BLOCKED_TOOLS.has(tool)} riskCheckWillPass`);
        }

        // Delegación dura: DESACTIVADA PARA DESARROLLO — la sesión principal
        // puede mutar archivos directamente (flujo sin fricción).
        // if (st?.contract?.status === "APPROVED" && !sessionParents.has(sid)) {
        //   const pend = (st.requirements || []).some((r) => r.status !== "done" && r.status !== "verified");
        //   if (pend && MUTATING_TOOLS.has(tool)) {
        //     const n = (st.requirements || []).filter((r) => r.status !== "done" && r.status !== "verified").length;
        //     const directive = `[wait-a-minute] ENFORCED BLOCK — ${n} req(s) pendiente(s) del contrato APPROVED: la sesión principal NO muta archivos. Delegar via Task en paralelo (ver [wam delegation]). Herramienta ${tool} bloqueada aquí.`;
        //     throw new Error(directive);
        //   }
        // }

        // Strategy Continuity: si hay estrategia aprobada, verificar si la acción
        // está cubierta antes de proceder con la lógica de ASKING.
        if (st?.approvedStrategy && st.approvedStrategy.status === "ACTIVE") {
          const stratCheck = classifyActionAgainstStrategy(
            input?.description || "",
            tool,
            input.args || input.parameters || {},
            st.approvedStrategy
          );
          if (stratCheck.covered === true) {
            // La acción está explícitamente cubierta por la estrategia aprobada.
            // Loggear para observabilidad pero NO bloquear.
            try {
              sessionStore.set(`wam-strategy-hit-${tool}`, { reason: stratCheck.reason, at: Date.now() });
            } catch {}
          } else if (stratCheck.covered === false) {
            // Acción prohibida explícitamente por la estrategia → bloquear.
            const directive = `[wait-a-minute] STRATEGY VIOLATION: ${stratCheck.reason}. La estrategia aprobada "${st.approvedStrategy.strategy}" no autoriza esta acción.`;
            input.output = directive;
            throw new WamPolicyBlock(directive, {
              tool,
              reason: stratCheck.reason,
              level: "BLOCKED",
              source: "approved-strategy-continuity",
            });
          }
          // covered === null → no decidir aquí; fall through to risk/asking logic
        }

        // Action Risk Envelope: evaluar riesgo de la herramienta antes de cualquier
        // otra lógica. Bloquea BLOCKED con WamPolicyBlock (no genérico Error) para
        // evitar que catch genérico lo trague.
        const risk = evaluateAction(tool, input.args || input.parameters || {}, taskRoot);
        if (risk.level === "BLOCKED") {
          const directive = `[wait-a-minute] RISK BLOCK (${tool}): ${risk.reason || "acción fuera del envelope de riesgo"}. Requiere autorización explícita del usuario.`;
          input.output = directive;
          throw new WamPolicyBlock(directive, { tool, reason: risk.reason, level: risk.level });
        }

        // Governance Enforcement: block mutating tools when contract is not APPROVED.
        // This prevents user-explicit-execute bypass without proper contract approval.
        if (MUTATING_TOOLS.has(tool) && st?.contract?.status !== "APPROVED" && st?.phase !== "DONE") {
          const reqs = (st?.requirements || []).filter((r) => r.status !== "done" && r.status !== "verified");
          const pendCount = reqs.length;
          const phase = st?.phase || "PROPOSED";
          const directive = `[wait-a-minute] GOVERNANCE BLOCK (${tool}): contrato no aprobado (fase ${phase}). ${pendCount} requisito(s) pendiente(s). Aprobar contrato primero: /wam contract approve o继续 con implementación legítima.`;
          input.output = directive;
          throw new WamPolicyBlock(directive, { tool, reason: "contract not approved", level: "BLOCKED", source: "governance-enforcement" });
        }

        if (st?.phase !== "ASKING") return;
        // git read-only (status/diff/log) es investigación: permitido aun en ASKING.
        // git mutante (commit/push) sigue bloqueado hasta responder la pregunta.
        if (tool === "bash" && READONLY_GIT_RE.test(bashCommandOf(input))) return;
        if (BLOCKED_TOOLS.has(tool)) {
          if (process.env.WAM_DEBUG_TE) console.log(`[WAM-DEBUG-TE] BLOCKING ${tool} in ASKING`);
          const u = (st.contract?.unknowns || []).find((x) => x.status === "blocking");
          const question = u ? `${u.id}: ${u.question}` : "pregunta bloqueante pendiente";
          const directive = `[wait-a-minute] ENFORCED BLOCK — tarea en ASKING (${question}). Herramienta ${tool} bloqueada. Responder: /wam answer ${u?.id || "U1"} <respuesta>`;
          input.output = directive;
          throw new Error(directive);
        }
      } catch (err) {
        // WamPolicyBlock MUST be re-thrown — never swallowed by generic catch.
        if (err?.wamPolicyBlock === true) throw err;
        if (typeof err?.message === "string" && err.message.includes("ENFORCED BLOCK")) throw err;
      }

      try {
        await bridgeExecution(input);
      } catch (bridgeError) {
        console.log("[wait-a-minute] Bridge execution non-blocking error:", bridgeError.message);
      }
    },
  };
};

/**
 * Runs after tool.execute.before — persists success/failure to the
 * cognition store via noteSuccess/noteFailure, reading experiment IDs
 * from the sessionExecutions map (or input._wam* overrides) instead of
 * input.hypothesisId which is never set by tool.execute.before.
 */
async function postToolExecution(input, output) {
  try {
    if (bypassed) return;
    const sid = input?.sessionID;
    const taskRoot = await resolveSessionBase(sid);
    const taskId = sessionTasks.get(sid) || readActiveTaskIdFresh(taskRoot) || "default-task";
    const wamRoot = taskRoot;
    const toolName = input?.tool || "";
    const key = input?.callID || `${sid}:${toolName}`;
    const mapping = sessionExecutions.get(key) || {};

    if (input?.tool && output?.error) {
      try {
        await noteFailure(wamRoot, taskId, {
          hypothesisId: input._wamHypothesisId || mapping.hypothesisId || input.hypothesisId,
          experimentId: input._wamExperimentId || mapping.experimentId || input.experimentId,
          requirementId: input._wamRequirementId || mapping.requirementId || input.requirementId,
          reason: output.error || "tool execution failed",
          actual: output.actual,
          unexpected: output.unexpected,
          provenance: `agent-tool-${toolName}-failure`,
        });
      } catch (e) {
        console.log(`[wait-a-minute] postToolExecution noteFailure error:`, e.message);
      }
    } else if (input?.tool) {
      try {
        await noteSuccess(wamRoot, taskId, {
          hypothesisId: input._wamHypothesisId || mapping.hypothesisId || input.hypothesisId,
          experimentId: input._wamExperimentId || mapping.experimentId || input.experimentId,
          requirementId: input._wamRequirementId || mapping.requirementId || input.requirementId,
          result: output.result,
          actual: output.actual,
          unexpected: output.unexpected,
          provenance: `agent-tool-${toolName}-success`,
        });
      } catch (e) {
        console.log(`[wait-a-minute] postToolExecution noteSuccess error:`, e.message);
      }
    }
  } catch (err) {
    console.error("[wait-a-minute] postToolExecution error:", err);
  }
}


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
function wamCli(args, cfg = {}, root = process.cwd(), taskId = readActiveTaskId(root) || "default-task") {
  const [sub, action, ...rest] = args || [];
  // taskId de la sesión del comando (namespaced ses-<id> si genérico)

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
    if (action === "approve") return JSON.stringify(waitAMinute.approveContract(taskId, root));
    if (action === "reject") return JSON.stringify(waitAMinute.rejectContract(taskId, root));
    if (action === "edit") {
      try {
        return JSON.stringify(waitAMinute.editContract(taskId, JSON.parse(rest.join(" ")), root));
      } catch {
        return "Error: JSON inválido para /wam contract edit";
      }
    }
    return "Uso: /wam contract <approve|reject|edit <json>>";
  }

  if (sub === "resume") {
    return JSON.stringify(waitAMinute.resumeTask(action || taskId, root));
  }

  if (sub === "strategy") {
    if (action === "set") {
      const scope = rest.join(" ").trim();
      if (!scope) return "Uso: /wam strategy set <scope...>";
      const st = getTaskState(taskId, root);
      if (!st) return "Sin tarea activa";
      if (st.contract?.status !== "APPROVED") {
        return `Contrato no aprobado (status=${st.contract?.status || "?"})`;
      }
      if (!st.approvedStrategy || st.approvedStrategy.status !== "ACTIVE") {
        return "Sin estrategia aprobada activa";
      }
      st.approvedStrategy = {
        ...st.approvedStrategy,
        strategy: scope.slice(0, 100),
        scope: scope.slice(0, 100),
      };
      persistTaskState(taskId, st, root);
      return `Estrategia actualizada: "${st.approvedStrategy.strategy}"`;
    }
    return "Uso: /wam strategy set <scope...>";
  }

  if (sub === "progress") {
    const [reqId, op, ...evidence] = [action, ...rest];
    if (!reqId) {
      const st = getTaskState(taskId, root);
      if (!st) return "Sin estado de tarea (persiste tras el primer mensaje)";
      return st.requirements
        .map(r => `${r.id} [${r.status}] ${r.title}${r.evidence?.length ? " | evidence: " + r.evidence.join("; ") : ""}`)
        .join("\n");
    }
    if (op === "done") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "done", evidence.join(" "), root));
    if (op === "verified") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "verified", evidence.join(" "), root));
    if (op === "pending") return JSON.stringify(waitAMinute.markRequirement(taskId, reqId, "pending", "", root));
    return "Uso: /wam progress | /wam progress <id> done <evidencia> | /wam progress <id> verified <evidencia> | /wam progress <id> pending";
  }

  if (sub === "answer") {
    const qid = action;
    const answer = rest.join(" ").trim();
    if (!qid || !answer) return "Uso: /wam answer <questionId> <respuesta>";
    return JSON.stringify(waitAMinute.answerQuestion(taskId, qid, answer, root));
  }

  if (sub === "assumptions") {
    const st = getTaskState(taskId, root);
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
    return JSON.stringify(waitAMinute.resolveAssumption(taskId, aid, evidence, root));
  }

  if (sub === "status") {
    const st = getTaskState(taskId, root);
    if (!st) return "Sin estado de tarea";
    const experiments = st.experiments || [];
    const failures = experiments.filter(e => e.status === "failed");
    const pendingUnknowns = (st.contract?.unknowns || []).filter(u => u.status === "blocking");
    const pendingAuth = pendingUnknowns.length > 0 ? pendingUnknowns[0] : null;
    const verifiedReqs = (st.requirements || []).filter(r => r.status === "verified");
    const totalReqs = (st.requirements || []).length;
    const verification = { status: `${verifiedReqs.length}/${totalReqs} verified` };
    const completionEvidence = (st.requirements || [])
      .filter(r => r.evidence && r.evidence.length > 0)
      .map(r => ({ req: r.id, evidence: r.evidence.join("; ") }));
    return getStatusReport(st, { experiments, failures, pendingAuth, verification, completionEvidence });
  }

  if (sub === "backlog") {
    const st = getTaskState(taskId, root);
    if (!st) return "Sin estado de tarea";
    const formatted = formatBacklog(st);
    if (!formatted) return "Sin requerimientos en backlog (todos están en el contract activo)";
    return formatted;
  }

  if (sub === "compress") {
    const id = rest.join(" ") || action || taskId;
    const st = getTaskState(id, root);
    if (!st) return "Sin estado de tarea";
    const budget = cfg.budgetTokens || DEFAULT_CONFIG.budgetTokens;
    const cav = writeCavemanSummary(id, st, root);
    const tokens = estimateTokens(cav);
    const headroom = Math.max(0, budget - tokens);
    return `${cav}\n[tokens ${tokens} | headroom ${headroom}/${budget}]`;
  }

  if (sub === "task") {
    if (action === "list") {
      const ids = listTaskIds(root);
      if (!ids.length) return "Sin tareas persistidas (.wam/tasks)";
      const active = readActiveTaskId(root);
      return ids
        .map((id) => {
          const st = getTaskState(id, root);
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
      const caps = listCapsules(root);
      if (!caps.length) return "Sin cápsulas (usa /wam ctx add o extracción en DONE)";
      return caps.map((c) => `${c.context_id} [${c.level} ${c.lifecycle}] ${c.provenance} ${(c.purpose || "").slice(0, 60)}`).join("\n");
    }
    if (action === "get") {
      const q = rest.join(" ");
      if (!q) return "Uso: /wam ctx get <query>";
      const r = retrieveContext(q, { root });
      if (!r.ok) return r.message;
      return r.capsules.map((h) => `[${h.capsule.level}] ${h.capsule.context_id} (rel ${h.relevance.toFixed(2)}) ${(h.capsule.purpose || "").slice(0, 80)}`).join("\n");
    }
    if (action === "show") {
      const id = rest.join(" ");
      const c = getCapsule(id, root);
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
      const r = promoteCapsule(id, target, { approvedBy: approved === "approved" ? "user" : "", root });
      if (!r.ok) return `Promoción rechazada: ${r.reason}`;
      return `Promovida ${id} → ${target} [${r.capsule.provenance}]`;
    }
    if (action === "session") {
      const sid = getSessionId(root);
      const caps = listCapsules(process.cwd(), { sessionId: sid });
      return `session: ${sid}\ncapsules de esta sesión: ${caps.length}\nL1 base: ${listCapsules(process.cwd(), { level: "L1", lifecycle: "active" }).length} cápsula(s)`;
    }
    if (action === "migrate") {
      const dryRun = rest.includes("--dry-run");
      const r = migrateLegacyCapsules(root, { dryRun });
      if (!r.migrated.length) return "Sin cápsulas legacy (todas tienen session_id)";
      const tag = r.dryRun ? "[DRY-RUN] " : "";
      return `${tag}migradas ${r.migrated.length} cápsula(s) a session_id="legacy":\n${r.migrated.map((m) => `  ${m.context_id || m.file}`).join("\n")}`;
    }
    if (sub === "decision") {
      const decisionPoint = action;
      if (!decisionPoint) {
        return "Error: decision point required. Usage: /wam decision <point> rationale=\"...\" alternatives=\"...\" evidence=\"...\"";
      }

      // Parse key-value pairs from rest
      const params = {};
      for (const item of rest) {
        const match = item.match(/^([^=]+)=(.*)$/);
        if (match) {
          let key = match[1].trim();
          let value = match[2].trim();
          
          // Remove surrounding quotes if present
          if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
            value = value.slice(1, -1);
          } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
            value = value.slice(1, -1);
          }
          
          params[key] = value;
        }
      }

      const rationale = params.rationale;
      const alternativesStr = params.alternatives;
      const evidenceStr = params.evidence;

      if (!rationale || !alternativesStr || !evidenceStr) {
        return "Error: rationale, alternatives, and evidence are required. Usage: /wam decision <point> rationale=\"...\" alternatives=\"...\" evidence=\"...\"";
      }

      let alternatives, evidence;
      try {
        alternatives = JSON.parse(alternativesStr);
        evidence = JSON.parse(evidenceStr);
        
        // Validate that they are arrays
        if (!Array.isArray(alternatives) || !Array.isArray(evidence)) {
          return "Error: alternatives and evidence must be JSON arrays.";
        }
      } catch (e) {
        return `Error: Invalid JSON in alternatives or evidence: ${e.message}`;
      }

      // Create tracer and log the decision
      const tracer = new ContextDecisionTracer(`decision-${Date.now()}`, root);
      tracer.logTechnicalDecision(decisionPoint, rationale, alternatives, evidence);
      
      return `Decision "${decisionPoint}" logged successfully.`;
    }
    return "Uso: /wam ctx <list|get <q>|show <id>|promote <id> <L2|L1> [approved]|session|migrate [--dry-run]>";
  }

  return "Uso: /wam <skills|contract|progress|task|compress|ctx|answer|assumptions|resolve|decision>";
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
  buildPersistedState: function(taskId, analysis, root) {
    const existing = getTaskState(taskId, root);
    if (existing && existing.requirements && existing.requirements.length) {
      // Preservar contrato/requisitos existentes (PROPOSED/APPROVED/REJECTED):
      // el contrato se sintetiza UNA vez (primer mensaje); los mensajes
      // siguientes no re-sintetizan del texto actual (claims incluidos).
      const merged = {
        ...existing,
        lastAction: existing.lastAction,
        nextAction: nextActionFrom(existing),
      };
      persistTaskState(taskId, merged, root);
      return merged;
    }
    const fresh = {
      ...projectState(analysis),
      phase: "PROPOSED",
      nextAction: "Revisar contrato — /wam contract approve o edit",
      lastAction: "",
      projectPath: root,
    };
    // Safety: consolidar si synthesizeContract generó demasiados requisitos
    const MAX = 15;
    if (fresh.requirements && fresh.requirements.length > MAX) {
      const kept = fresh.requirements.slice(0, MAX);
      const overflow = fresh.requirements.length - MAX;
      kept.push({ id: `req-overflow`, title: `(+${overflow} requisitos consolidados de la especificación)`, status: "pending", evidence: [] });
      fresh.requirements = kept;
      if (fresh.contract) fresh.contract.requirements = kept.map((r) => r.title);
    }
    persistTaskState(taskId, fresh, root);
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
    const pending = (state?.requirements || []).filter(
      (r) =>
        (r.status !== "done" && r.status !== "verified") ||
        (r.status === "done" && !(r.evidence || []).length)
    );
    if (pending.length > 0) {
      return {
        blocked: true,
        pending: pending.map((r) => {
          const missingEvidence = r.status === "done" && !(r.evidence || []).length;
          return `${r.id} — ${r.title}${missingEvidence ? " (sin evidencia)" : ""}`;
        }),
      };
    }

    const failingCriteria = (state?.completionContract?.criteria || []).filter(
      (c) => c.status === "FAIL" || c.status === "UNKNOWN"
    );
    if (failingCriteria.length > 0) {
      return {
        blocked: true,
        pending: failingCriteria.map((c) => `${c.id} — ${c.criterion} (${c.status})`),
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
    const checks = state?.contract?.checks || [];
    if (checks.length > 0) {
      const byReq = new Map();
      for (const c of checks) {
        if (!byReq.has(c.reqId)) byReq.set(c.reqId, []);
        byReq.get(c.reqId).push(c);
      }
      const checkFailures = [];
      for (const [reqId, list] of byReq) {
        const verdict = evaluateRequirementChecks(list, list);
        if (verdict.status !== "VERIFIED") checkFailures.push(`${reqId}: ${verdict.reason || "checks pendientes"}`);
      }
      if (checkFailures.length > 0) {
        return { blocked: true, verifying: true, pending: checkFailures };
      }
    }
    return { blocked: false, allDone: true };
  },

  /** Transición de fase basada en el resultado del Completion Gate. */
  applyPhaseTransition: function(state, gate) {
    const phase = gate?.allDone ? "DONE" : state?.phase || "IMPLEMENTING";
    const nextAction = gate?.blocked ? "Continuar con requisitos pendientes" : state?.nextAction;
    return { phase, nextAction };
  },

  /** Aprueba el contrato: PROPOSED → APPROVED, fase → IMPLEMENTING. */
  resumeTask: function(taskId, root) {
    const state = getTaskState(taskId, root);
    if (!state) return { ok: false, reason: "Sin estado de tarea para: " + taskId };
    if (state.phase === "DONE") return { ok: false, reason: "Tarea DONE — no se reabre automáticamente. Crea una nueva." };
    if (!String(taskId).startsWith("ses-")) writeActiveTaskId(taskId, root);
    try {
      updateLiveContext(taskId, state, root);
    } catch {}
    return { ok: true, taskId, phase: state.phase, contract: state.contract?.status || "?" };
  },

  approveContract: function(taskId, root) {
    const state = getTaskState(taskId, root);
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
    // Strategy Continuity: persist approved strategy so tool.execute.before
    // knows which actions are covered without requiring per-step approval.
    // Approved scope = the strategy itself + all safe execution steps required
    // to execute it (install deps, run tests, configure browser, retry).
    const inferredStrategy = (
      state.contract?.objective ||
      state.intent?.goal ||
      state.requirements?.[0]?.title ||
      state.lastAction?.split("\n")[0] ||
      "task execution"
    ).slice(0, 100);
    state.approvedStrategy = {
      strategy: inferredStrategy,
      approvedAt: Date.now(),
      scope: inferredStrategy,
      allowedActions: [
        "read", "search", "inspect", "test", "lint", "typecheck",
        "install dependency", "install browser binary", "run validation",
        "modify source", "create fixture", "diagnose", "retry",
        "write", "edit", "bash", "sh",
        "task", "todowrite", "pty_spawn",
        "openspec", "openspec new change", "openspec instructions",
        "openspec validate", "openspec archive",
        "git commit", "npm test", "pnpm test", "pnpm install",
        "crear change OpenSpec", "ejecutar test suite",
        "instalar dependencia", "delegar via Task",
      ],
      prohibitedActions: [
        "delete production data", "drop database", "production deploy",
        "credential modification", "scope expansion", "destructive operation",
      ],
      invalidationConditions: [
        "environment cannot satisfy required runtime",
        "required dependency unavailable and unfixable",
        "explicit user retraction",
        "verified evidence contradicts strategy at architectural level",
      ],
      status: "ACTIVE",
    };
    persistTaskState(taskId, state, root);
    try {
      updateLiveContext(taskId, state, root);
    } catch {}
    return { ok: true, status: "APPROVED", phase: state.phase };
  },

  /** Rechaza el contrato: REJECTED, fase WAITING. */
  rejectContract: function(taskId, root) {
    const state = getTaskState(taskId, root);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    state.contract = { ...(state.contract || {}), status: "REJECTED" };
    state.phase = "WAITING";
    state.nextAction = "Revisar contrato con el usuario";
    persistTaskState(taskId, state, root);
    return { ok: true, status: "REJECTED", phase: state.phase };
  },

  /** Edita el contrato (JSON patch), vuelve a PROPOSED. */
  editContract: function(taskId, patch, root) {
    const state = getTaskState(taskId, root);
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
    persistTaskState(taskId, state, root);
    return { ok: true, status: "PROPOSED", requirements: contract.requirements.length };
  },

  /** Marca requisito done/pending con evidencia. DONE exige evidencia (no "parece funcionar"). */
  markRequirement: async function(taskId, reqId, status, evidence, root) {
    const state = getTaskState(taskId, root);
    if (!state) return { ok: false, reason: "Sin estado de tarea" };
    const req = (state.requirements || []).find((r) => r.id === reqId);
    if (!req) return { ok: false, reason: `Requisito ${reqId} no existe` };
    if ((status === "done" || status === "verified") && !(evidence && evidence.trim())) {
      return { ok: false, reason: `Requisito ${reqId}: evidencia requerida para marcar ${status}` };
    }
    if (status === "verified" && req.status !== "done") {
      return { ok: false, reason: `Requisito ${reqId}: marcar done antes de verified` };
    }
    const checksForReq = (state.contract?.checks || []).filter((c) => c.reqId === reqId);
    if (status === "verified" && checksForReq.length > 0) {
      const verdictResult = await verifyRequirement(checksForReq, { timeout_ms: 60000 });
      if (verdictResult.status !== "VERIFIED") {
        const failedChecks = verdictResult.results?.filter(r => r.status !== "PASS").map(r => `${r.check_id}: ${r.status}`).join(", ") || "unknown";
        return { ok: false, reason: `Requisito ${reqId}: verificación falló (${failedChecks}).` };
      }
      req.evidence.push(...verdictResult.evidence.map(e => `${e.check_type}:${e.check_id}`));
    }
    if (status === "done" && req.status === "verified" && checksForReq.length > 0) {
      return { ok: false, reason: `Requisito ${reqId}: ya está verificado, no se puede retroceder a done.` };
    }
    req.status = status;
    if (status === "done" || status === "verified") req.evidence.push(evidence.trim());
    if (status === "pending") req.evidence = [];
    state.nextAction = nextActionFrom(state);
    persistTaskState(taskId, state, root);
    return { ok: true, phase: state.phase, nextAction: state.nextAction };
  },

  /** Responde una pregunta bloqueante: unknown → answered, fase ASKING → ANSWERED → PROPOSED. */
  answerQuestion: function(taskId, qid, answer, root) {
    const state = getTaskState(taskId, root);
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
    persistTaskState(taskId, state, root);
    state.phase = "PROPOSED";
    state.nextAction = "Revisar contrato — /wam contract approve";
    persistTaskState(taskId, state, root);
    return { ok: true, phase: "PROPOSED", unknown: u };
  },

  /** Reconocimiento de respuesta natural (spec enforce-clarification-gate): en ASKING,
   *  un mensaje normal resuelve TODAS las preguntas bloqueantes con ese texto y
   *  re-evalúa el estado (assumption asociada → resolved). */
  answerFromMessage: function(taskId, text, root) {
    const state = getTaskState(taskId, root);
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
    persistTaskState(taskId, state, root);
    return { ok: true, u: first, phase: state.phase, nextAction: state.nextAction };
  },
  /** Resuelve una asunción con evidencia del repo (spec change 3 R4): → RESOLVED sin preguntar al usuario. */
  resolveAssumption: function(taskId, aid, evidence, root) {
    const state = getTaskState(taskId, root);
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
    persistTaskState(taskId, state, root);
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
      `req: ${(analysis.completionContract?.requirements || []).join("; ") || "—"}`,
      ...(blockingUnknowns.length
        ? [`blocking: ${blockingUnknowns.map((u) => `${u.id} ${u.question}`).join(" | ")}`]
        : []),
      ...(blockingAssumptions.length
        ? [`assumptions blocking: ${blockingAssumptions.map((a) => `${a.id} ${a.statement}`).join(" | ")}`]
        : []),
      "",
      "Ejecutar lo pedido. Si la instrucción es ambigua, preguntar.",
      "/wam contract approve → aprobar | /wam compress → resumen terse",
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
          id: genPartId(),
          type: "text",
          text: `\n[wam: fase ${analysis.phase || "IMPLEMENTING"} → ${analysis.nextAction || "continuar"}]`,
          synthetic: true,
          ...(meta.sessionID ? { sessionID: meta.sessionID } : {}),
          ...(meta.messageID ? { messageID: meta.messageID } : {}),
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
          : "Proceder con la implementación",
    };
  },
};

Object.keys(waitAMinute).forEach((k) => {
  if (k === "name") return;
  WaitAMinutePlugin[k] = waitAMinute[k];
});

export default WaitAMinutePlugin;
