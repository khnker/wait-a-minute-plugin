/**
 * Runtime message handler — chat.message hook logic.
 *
 * Extracted from index.js to modularize the message processing pipeline.
 * Receives all dependencies via a `deps` object (inversion of control),
 * making it independently testable.
 *
 * Usage from index.js:
 *   "chat.message": (input, output) => handleMessage(input, output, deps),
 *
 * where `deps` contains everything the handler needs (see DEPENDENCIES
 * section in the typedef below for the full list).
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const RESUME_RE = /\b(en qué estábamos|en que estabamos|dónde íbamos|donde íbamos|sigamos|continuemos|retomar la tarea)\b/i;
const MAX_VISIBLE_REQS = 5;
const ASKING_CMD_RE = /^(answer|resolve|contract|progress|task|skills|assumptions|compress)\b/;

// ---------------------------------------------------------------------------
// DEPENDENCIES (provided by caller via deps parameter)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} MessageHandlerDeps
 * @property {boolean} bypassed
 * @property {Map}    sessionTasks
 * @property {Map}    sessionStore
 * @property {Object} cfg
 * @property {Function} resolveSessionBase
 * @property {Function} wamRootFor
 * @property {Function} ensureWamMemory
 * @property {Function} effectiveTaskId
 * @property {Function} genPartId
 * @property {Function} emitTextPart
 * @property {Function} readActiveTaskIdFresh
 * @property {Function} writeActiveTaskId
 * @property {Object}   waitAMinute
 * @property {Function} migrateLegacyCognition
 * @property {Function} noteSuccess
 * @property {Function} noteFailure
 * @property {Function} getTaskState
 * @property {Function} persistTaskState
 * @property {Function} findDuplicateTask
 * @property {Function} escalateAssumptions
 * @property {Function} buildAssumptions
 * @property {Function} initMemory
 * @property {Function} updateProjectMemo
 * @property {Function} updateLiveContext
 * @property {Function} readLiveContext
 * @property {Function} persistLiveContext
 * @property {Function} assembleContext
 * @property {Function} createSnapshot
 * @property {Function} checkContinuation
 * @property {Function} rebuildScope
 * @property {Function} getDecision
 * @property {Function} recordDecision
 * @property {Function} compactDecisions
 * @property {Function} writeCavemanSummary
 * @property {Function} truncate
 * @property {Function} delegationLines
 * @property {Function} updateTaskMemory
 * @property {Function} addRecentChange
 * @property {Function} closeSession
 * @property {Function} getSessionId
 * @property {Function} classifyAskingMessage
 */

/**
 * Handles the chat.message hook: pre-flight cognitive analysis of user messages.
 *
 * @param {Object} input  - OpenCode chat.message input
 * @param {Object} output - OpenCode chat.message output (mutated in place)
 * @param {MessageHandlerDeps} deps
 * @returns {Promise<void>}
 */
export async function handleMessage(input, output, deps) {
  const {
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
  } = deps;

  try {
    if (bypassed) return;
    const promptText = extractPrompt(input, output);
    if (!promptText.trim()) return;

    // --- Tool execution integration (passive state preservation) ---
    if (input?.tool && output?.result !== undefined) {
      const toolName = input.tool;
      const wamRoot = await ensureWamMemory(input.sessionID, promptText);
      const taskId = effectiveTaskId(input, sessionTasks, wamRoot);

      try { migrateLegacyCognition(wamRoot, taskId); } catch (e) { console.log(`[wait-a-minute] migration error:`, e.message); }

      try {
        await noteSuccess(wamRoot, taskId, {
          hypothesisId: input._wamHypothesisId || input.hypothesisId,
          experimentId: input._wamExperimentId || input.experimentId,
          result: output.result,
          actual: output.actual,
          unexpected: output.unexpected,
          provenance: `agent-tool-${toolName}-success`,
          requirementId: input._wamRequirementId || input.requirementId,
        });
      } catch (e) {
        console.log(`[wait-a-minute] noteSuccess integration error:`, e.message);
      }
    }

    if (input?.tool && output?.error) {
      const toolName = input.tool;
      const wamRoot = await ensureWamMemory(input.sessionID, promptText);
      const taskId = effectiveTaskId(input, sessionTasks, wamRoot);

      try { migrateLegacyCognition(wamRoot, taskId); } catch (e) { console.log(`[wait-a-minute] migration error:`, e.message); }

      try {
        await noteFailure(wamRoot, taskId, {
          hypothesisId: input._wamHypothesisId || input.hypothesisId,
          experimentId: input._wamExperimentId || input.experimentId,
          reason: output.error || "tool execution failed",
          actual: output.actual,
          unexpected: output.unexpected,
          provenance: `agent-tool-${toolName}-failure`,
        });
      } catch (e) {
        console.log(`[wait-a-minute] noteFailure integration error:`, e.message);
      }
    }

    if (!promptText.trim()) return;

    // Ensure WAM memory for this session
    const wamRoot = await ensureWamMemory(input.sessionID, promptText);

    // No-task-assumption: resume intent without active task → ask, don't assume
    if (!input.taskId && RESUME_RE.test(promptText)) {
      const active = sessionTasks.get(input.sessionID) || readActiveTaskIdFresh(wamRoot);
      const st = active ? getTaskState(active, wamRoot) : null;
      if (st && st.phase !== "DONE") {
        emitTextPart(output, `[wait-a-minute] Hay una tarea pendiente: ${active} (fase ${st.phase}). ¿Quieres continuarla? Responde /wam resume ${active} o define una tarea nueva — no asumo intención.`, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
      } else {
        emitTextPart(output, "[wait-a-minute] No hay tarea activa. Dime qué tarea nueva quieres — no asumo intención previa.", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
      }
      return;
    }

    // Effective taskId with session persistence
    let taskId = effectiveTaskId(input, sessionTasks, wamRoot);
    if (input.sessionID) sessionTasks.set(input.sessionID, taskId);

    // Clarification Gate: in ASKING classify the message
    const askingState = getTaskState(taskId, wamRoot);
    if (askingState?.phase === "ASKING") {
      const trimmed = promptText.trim();
      if (ASKING_CMD_RE.test(trimmed)) return; // handled by command.execute.before
      const kind = classifyAskingMessage(trimmed);
      if (kind === "blocked-message") {
        const u = (askingState.contract?.unknowns || []).find((x) => x.status === "blocking");
        const directive = u
          ? `⛔ [wait-a-minute] BLOQUEADO: Pregunta pendiente — ${u.id}: ${u.question}\nResponder: /wam answer ${u.id} <respuesta>`
          : "⛔ [wait-a-minute] BLOQUEADO: Tienes preguntas sin responder.";
        emitTextPart(output, directive, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        return;
      }
      if (kind === "new-intent") {
        emitTextPart(output, "[wait-a-minute] Nueva intención detectada. Abriendo tarea nueva.", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
        return;
      }
      // answer: continue to normal analysis below
    }

    // Project scope change → backlog + new task
    const existingState = getTaskState(taskId, wamRoot);
    if (existingState?.projectPath && existingState.projectPath !== wamRoot) {
      waitAMinute.addToBacklog(
        existingState,
        `Task ${taskId}: ${existingState.contract?.requirements?.map((r) => r.title).join("; ") || "sin reqs"}`,
        "project-switch",
      );
      persistTaskState(taskId, existingState, wamRoot);
      try { fs.rmSync(path.join(wamRoot, ".wam", "active-task"), { force: true }); } catch {}
      taskId = `task-${Date.now()}`;
      input.taskId = taskId;
    }

    // Continuation fast-path: approved contract + no DONE claim
    if (existingState?.contract?.status === "APPROVED") {
      const claim = waitAMinute.evaluateCompletionGate(existingState, promptText);
      if (!claim.blocked && !claim.allDone) {
        const snapshotCheck = checkContinuation(taskId, existingState, wamRoot);

        if (snapshotCheck.status === "VALID") {
          input.waitAnalysis = sessionStore.get("waitAnalysis") || null;
          try { updateProjectMemo({}, wamRoot); } catch {}
          try {
            persistLiveContext(taskId, existingState, wamRoot);
            const live = readLiveContext(wamRoot, taskId);
            if (live) {
              const parts = [`[wam N2 task]\n${live}\n`];
              parts.push(...delegationLines(existingState).map((l) => l + "\n"));
              emitTextPart(output, parts.join("\n"), { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
            }
          } catch {}
          return;
        }

        const scope = rebuildScope(snapshotCheck.changedSignals);
        if (scope.rebuildN1 || scope.rebuildN3) {
          input.waitAnalysis = sessionStore.get("waitAnalysis") || null;
          try { updateProjectMemo({}, wamRoot); } catch {}
          try {
            persistLiveContext(taskId, existingState, wamRoot);
            const live = readLiveContext(wamRoot, taskId);
            if (live) {
              const parts = [
                `[wam continuation] Contexto reconstruido (${snapshotCheck.changedSignals.join(", ")})`,
                `[wam N2 task]\n${live}\n`,
              ];
              parts.push(...delegationLines(existingState).map((l) => l + "\n"));
              emitTextPart(output, parts.join("\n"), { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
            }
          } catch {}
          return;
        }
        // INVALID: full rebuild → fall through to normal analyze()
      }
    }

    // ---- Normal analysis flow ----
    const analysis = await waitAMinute.analyze({
      prompt: promptText,
      projectPath: wamRoot,
      config: cfg,
      tierCaps: cfg.tierCaps,
      activePreset: cfg.activePreset,
      activeMode: cfg.activeMode,
    });

    const state = waitAMinute.buildPersistedState(taskId, analysis, wamRoot);
    state.lastAction = promptText;

    // Task Dedup - only if taskId was not explicitly provided or initialized as generic/new
    if (!input?.taskId || GENERIC_TASK.test(input.taskId)) {
      const existingTaskId = findDuplicateTask(promptText, wamRoot);
      if (existingTaskId && existingTaskId !== taskId) {
        console.log(`[wait-a-minute] Duplicate task detected: "${existingTaskId}" matches current prompt. Reusing existing task.`);
        taskId = existingTaskId;
        if (input.sessionID) sessionTasks.set(input.sessionID, taskId);
        const existingState2 = getTaskState(taskId, wamRoot);
        if (existingState2) {
          emitTextPart(output, `[wait-a-minute] Tarea existente detectada: ${taskId} (fase ${existingState2.phase}). Continuando con la tarea existente.`, { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
          return;
        }
      }
    }

    // Assumption Gate
    try {
      const { changed } = escalateAssumptions(state, promptText);
      if (changed) persistTaskState(taskId, state, wamRoot);
    } catch (err) {
      console.error("[wait-a-minute] escalate assumptions failed:", err);
    }

    // Store analysis in session
    sessionStore.set("waitAnalysis", analysis);
    sessionStore.set("completionContract", state.contract);
    sessionStore.set("persistentPolicies", analysis.persistentPolicies || []);
    sessionStore.set("skillRegistry", analysis.skillRegistry || {});

    // Blocking questions → ASKING
    const blockingUnknowns = (state.contract?.unknowns || []).filter((u) => u.status === "blocking");
    const finalQuestions = blockingUnknowns.filter((u) => {
      const decision = getDecision(u.id, wamRoot);
      if (decision) { console.log(`[wait-a-minute] Found existing decision for ${u.id}: ${decision.decision}`); return false; }
      return true;
    });

    if (finalQuestions.length > 0 && state.phase !== "ANSWERED") {
      state.phase = "ASKING";
      state.nextAction = "Responder pregunta bloqueante antes de ejecutar";
      persistTaskState(taskId, state, wamRoot);
      const questions = [];
      for (const u of finalQuestions) {
        questions.push(`⛔ [wait-a-minute] ASKING — ${u.id}: ${u.question}\nNo implementar hasta responder. Responder: /wam answer ${u.id} <respuesta>`);
      }
      emitTextPart(output, questions.join("\n\n"), { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
      return;
    }

    // Approval gate
    const intentConf = Number(analysis.intent?.confidence ?? analysis.intent?.conf ?? 100);
    const openUnknowns = (state.contract?.unknowns || []).filter((u) => u.status !== "answered" && u.status !== "blocking");
    const highUncertainty =
      (analysis.ambiguity || "low") === "high" ||
      intentConf < 60 ||
      openUnknowns.length > 0;
    const trimmed = promptText.trim();
    const userConfirms =
      !highUncertainty ||
      /^(s[ií]|ok|okey|dale|hazlo|adelante|continuar|continua|aprobar|confirmo|correcto|perfecto|bueno|va|listo|sigue)\b/i.test(trimmed) ||
      trimmed.includes("aprobar contrato");

    if (state.contract?.status === "PROPOSED" && state.phase === "PROPOSED" && userConfirms) {
      waitAMinute.approveContract(taskId, wamRoot);
      try {
        recordDecision({
          id: `strategy-${taskId}-${Date.now()}`,
          decision: `Aprobar estrategia ${analysis.strategy || "NORMAL"} para ${taskId}`,
          reason: promptText.slice(0, 120),
          source: highUncertainty ? "user-decided" : "observed",
          confidence: "high",
        }, wamRoot);
        try { compactDecisions(wamRoot); } catch {}
      } catch {}
      const fresh = getTaskState(taskId, wamRoot);
      if (fresh) {
        state.contract = fresh.contract;
        state.phase = fresh.phase;
        state.nextAction = fresh.nextAction;
      }
    }

    const gate = waitAMinute.evaluateCompletionGate(state, promptText);
    const { phase, nextAction } = waitAMinute.applyPhaseTransition(state, gate);
    if (gate.blocked || gate.allDone) {
      state.phase = phase;
      state.nextAction = nextAction;
      persistTaskState(taskId, state, wamRoot);
    }

    const updatedState = getTaskState(taskId, wamRoot);

    // Live context snapshot
    try { persistLiveContext(taskId, updatedState, wamRoot); } catch {}

    // ---- Context Assembly ----
    const inject = [];

    const reqs = updatedState.requirements || [];
    const pend = reqs.filter((r) => r.status !== "done");
    const objective = updatedState.contract?.objective || analysis.intent?.goal || null;
    if (!(analysis.intent?.classification === "trivial" || analysis.strategy === "FAST")) {
      if (updatedState.phase === "PROPOSED" && !updatedState.contractDisplayed) {
        const visible = reqs.slice(0, MAX_VISIBLE_REQS);
        const overflow = reqs.length - MAX_VISIBLE_REQS;
        inject.push(
          `Objective: ${objective || "pending"}`,
          `Remaining (${pend.length}/${reqs.length}):`,
          ...visible.map((r) => `  - ${truncate(r.title, 120)}`),
          ...(overflow > 0 ? [`  ... y ${overflow} más`] : []),
        );
        updatedState.contractDisplayed = true;
        persistTaskState(taskId, updatedState, wamRoot);
      }
    }

    try { initMemory(wamRoot); } catch {}
    try { updateProjectMemo(analysis, wamRoot); } catch {}
    try {
      const pack = assembleContext({
        prompt: promptText,
        taskId,
        classification: analysis.intent?.classification,
        mode: analysis.strategy,
        projectPath: wamRoot,
        budget: cfg.contextBudget || 4000,
        taskState: updatedState,
        skillRegistry: waitAMinute.loadBundledRegistry(),
        selectedSkills: analysis.skills?.selected || [],
      });
      if (pack.lines.length) {
        inject.push(pack.lines.join("\n") + `\n[wam pack ${pack.budget_used}/${pack.budget} tok ${pack.levels.N0 ? "N0" : ""}${pack.levels.N1 ? "+N1" : ""}${pack.levels.N2 ? "+N2" : ""}${pack.levels.N3 ? "+N3" : ""}${pack.levels.N4 ? "+N4" : ""}]`);
      }
      try { createSnapshot(taskId, updatedState, wamRoot); } catch {}
    } catch {}

    if (gate.blocked) {
      const maxGateReqs = 5;
      const pendingItems = gate.pending || [];
      const visiblePending = pendingItems.slice(0, maxGateReqs);
      const overflowPending = pendingItems.length - maxGateReqs;
      const pendingList = visiblePending.length > 0
        ? "\n  Requisitos pendientes:\n    " + visiblePending.map((p) => `- ${truncate(p, 150)}`).join("\n    ") + (overflowPending > 0 ? `\n    ...(+${overflowPending} más)` : "") + "\n"
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
          "# Task Summary", "", "## Objective",
          `- ${taskId} (${analysis.intent?.classification || "task"})`, "", "## Completed",
          ...(updatedState.contract?.requirements || []).map((r) => `- ${r}`), "", "## Verification",
          ...(updatedState.requirements || []).map((r) => `- ${r.id}: ${r.status}`), "", "## Status", "COMPLETED",
        ].join("\n"),
      }, wamRoot);
      addRecentChange({
        date: new Date().toISOString().slice(0, 10),
        scope: taskId,
        changes: updatedState.contract?.requirements || [],
        verification: `requisitos completos: ${(updatedState.requirements || []).length}`,
      }, wamRoot);
      try {
        writeCavemanSummary(taskId, updatedState, wamRoot, [
          "date:", new Date().toISOString().slice(0, 10),
          "scope:", taskId,
          "status:", "COMPLETED",
          "completed:",
          ...(updatedState.contract?.requirements || []).map((r) => `- ${r}`),
          "verification:",
          ...(updatedState.requirements || []).map((r) => `- ${r.id}: ${r.status}`),
        ].join("\n"));
      } catch {}
      try {
        closeSession({
          sessionId: getSessionId(wamRoot),
          taskId,
          summary: (updatedState.contract?.requirements || []).join("; "),
          candidates: (updatedState.requirements || []).map((r) => ({ id: r.id, title: r.title, evidence: r.evidence || [] })),
        }, wamRoot);
      } catch {}
    }

    if (updatedState.contract?.status === "APPROVED") {
      inject.push(...delegationLines(updatedState));
    }
    if (inject.length > 0) {
      emitTextPart(output, inject.join("\n") + "\n", { sessionID: input.sessionID, messageID: output.message?.id || input.messageID });
    }

    if (updatedState.contract?.status !== "APPROVED" && updatedState.phase !== "DONE") {
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
    }

    input.waitAnalysis = analysis;
  } catch (err) {
    console.error("[wait-a-minute] Pre-flight analysis failed:", err);
  }
}

/**
 * Extracts the prompt text from a chat.message input/output pair.
 * Extracted as a utility so it can be tested independently.
 *
 * @param {Object} input  - chat.message input
 * @param {Object} output - chat.message output
 * @returns {string}
 */
export function extractPrompt(input, output) {
  const srcParts = output?.parts?.length
    ? output.parts
    : input?.message?.parts || output?.message?.parts || input?.parts;
  if (srcParts && srcParts.length > 0) {
    const textPart = srcParts.find(
      (p) => p.type === "text" && typeof p.text === "string",
    );
    return textPart?.text || "";
  }
  if (input?.text && typeof input.text === "string") return input.text;
  return "";
}
