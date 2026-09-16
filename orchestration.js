/**
 * Orchestration — funciones puras de decisión/estado extraídas de index.js.
 *
 * Este módulo contiene Toda la lógica de decisión del ciclo de vida:
 *   - Gestión de fases (PROPOSED→APPROVED→IMPLEMENTING→VERIFYING→DONE)
 *   - Transiciones de estado (approve/reject/edit contract, mark requirement)
 *   - Completion gate (evaluate, apply phase transition)
 *
 * Las funciones aquí son PURAS: toman estado como entrada, retornan
 * decisión como salida. Sin side effects (no persisten, no leen, no escriben).
 *
 * index.js (OpenCode Adapter) importa estas funciones y se encarga de
 * los side effects: getTaskState, persistTaskState, updateLiveContext, etc.
 */

import { evaluateRequirement as evaluateRequirementChecks } from "./verification.js";
import { truncate } from "./formatting.js";

// ═══════════════════════════════════════════════════════════════
// Constantes de fase
// ═══════════════════════════════════════════════════════════════

export const PHASE_PROPOSED = "PROPOSED";
export const PHASE_APPROVED = "APPROVED";
export const PHASE_IMPLEMENTING = "IMPLEMENTING";
export const PHASE_VERIFYING = "VERIFYING";
export const PHASE_DONE = "DONE";
export const PHASE_ASKING = "ASKING";
export const PHASE_WAITING = "WAITING";

/**
 * Transiciones válidas de fase.
 * Cada clave es una fase origen, el array fases destino permitidas.
 */
export const PHASE_TRANSITIONS = Object.freeze({
  [PHASE_PROPOSED]: [PHASE_IMPLEMENTING, PHASE_WAITING, PHASE_ASKING],
  [PHASE_IMPLEMENTING]: [PHASE_VERIFYING, PHASE_DONE, PHASE_ASKING],
  [PHASE_VERIFYING]: [PHASE_IMPLEMENTING, PHASE_DONE],
  [PHASE_DONE]: [],
  [PHASE_ASKING]: [PHASE_PROPOSED, PHASE_IMPLEMENTING],
  [PHASE_WAITING]: [PHASE_PROPOSED, PHASE_IMPLEMENTING],
});

/**
 * Valida si una transición de fase es permitida.
 * @param {string} from - Fase origen
 * @param {string} to - Fase destino
 * @returns {boolean}
 */
export function canTransitionPhase(from, to) {
  return (PHASE_TRANSITIONS[from] || []).includes(to);
}

// ═══════════════════════════════════════════════════════════════
// nextActionFrom — cálculo puro del próximo action
// ═══════════════════════════════════════════════════════════════

// Eliminada definición local de truncate, usando import de formatting.js

/**
 * Determina la próxima acción sugerida según el estado de requirements.
 * @param {Object} state - Estado de la tarea
 * @returns {string}
 */
export function nextActionFrom(state) {
  const pending = (state?.requirements || []).find(
    (r) => !["done", "verified"].includes(r.status)
  );
  if (pending)
    return `Implementar ${truncate(pending.title)} (${pending.id} ${pending.status})`;
  const unverified = (state?.requirements || []).find((r) => r.status === "done");
  if (unverified)
    return `Verificar ${truncate(unverified.title)} — /wam progress ${unverified.id} verified <evidencia>`;
  if (state?.requirements?.length) return "Verificar requisitos completos antes de DONE";
  return "Continuar tarea";
}

// ═══════════════════════════════════════════════════════════════
// Completion Gate — evaluación pura
// ═══════════════════════════════════════════════════════════════

/**
 * Evalúa si una tarea puede completarse.
 * PURE: toma state + promptText, retorna gate result sin side effects.
 * @param {Object} state - Estado de la tarea
 * @param {string} promptText - Texto del prompt del usuario
 * @returns {{ blocked: boolean, allDone?: boolean, verifying?: boolean, pending?: string[], autoApprove?: boolean }}
 */
export function evaluateCompletionGate(state, promptText) {
  const lower = (promptText || "").toLowerCase().trim();

  if (lower.includes("aprobar contrato") || lower.includes("continuar")) {
    return { blocked: false, allDone: false, autoApprove: true };
  }

  const doneClaims =
    /(^|\s)(done|finish|finished|complete|completed|terminate|terminated|listo|termin[eé]|complet[ao]|finalizad[oa])\b|(task|tarea)\s+(complete|complet(a|ada|o)|terminad(a|o))|declare.*done/i;
  if (!doneClaims.test(lower)) return { blocked: false };

  // 1. Blocking unknowns
  const blockingUnknowns = (state?.contract?.unknowns || []).filter(
    (u) => u.status === "blocking"
  );
  if (blockingUnknowns.length > 0) {
    return {
      blocked: true,
      pending: blockingUnknowns.map(
        (u) => `${u.id} — ${u.question} (DECISION_CRITICAL sin responder)`
      ),
    };
  }

  // 2. Blocking assumptions
  const blockingAssumptions = (state?.contract?.assumptions || []).filter(
    (a) =>
      a.classification === "DECISION_CRITICAL" && a.status !== "resolved"
  );
  if (blockingAssumptions.length > 0) {
    return {
      blocked: true,
      pending: blockingAssumptions.map(
        (a) => `${a.id} — ${a.statement} (DECISION_CRITICAL sin resolver)`
      ),
    };
  }

  // 3. Pending requirements (not done/verified, or done without evidence)
  const pending = (state?.requirements || []).filter(
    (r) =>
      (r.status !== "done" && r.status !== "verified") ||
      (r.status === "done" && !(r.evidence || []).length)
  );
  if (pending.length > 0) {
    return {
      blocked: true,
      pending: pending.map((r) => {
        const missingEvidence =
          r.status === "done" && !(r.evidence || []).length;
        return `${r.id} — ${r.title}${missingEvidence ? " (sin evidencia)" : ""}`;
      }),
    };
  }

  // 4. Failing criteria
  const failingCriteria = (state?.completionContract?.criteria || []).filter(
    (c) => c.status === "FAIL" || c.status === "UNKNOWN"
  );
  if (failingCriteria.length > 0) {
    return {
      blocked: true,
      pending: failingCriteria.map(
        (c) => `${c.id} — ${c.criterion} (${c.status})`
      ),
    };
  }

  // 5. Contract must be APPROVED
  if (state?.contract?.status !== "APPROVED") {
    return {
      blocked: true,
      pending: [
        `contrato ${state.contract?.status || "PROPOSED"} — aprobar con /wam contract approve antes de DONE`,
      ],
    };
  }

  // 6. All requirements must be verified
  const unverified = (state?.requirements || []).filter(
    (r) => r.status !== "verified"
  );
  if (unverified.length > 0) {
    return {
      blocked: true,
      verifying: true,
      pending: unverified.map(
        (r) => `${r.id} — ${r.title} (verificar: /wam progress ${r.id} verified <evidencia>)`
      ),
    };
  }

  // 7. Contract checks must pass
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
      if (verdict.status !== "VERIFIED")
        checkFailures.push(`${reqId}: ${verdict.reason || "checks pendientes"}`);
    }
    if (checkFailures.length > 0) {
      return { blocked: true, verifying: true, pending: checkFailures };
    }
  }

  return { blocked: false, allDone: true };
}

/**
 * Determina la transición de fase resultante de un completion gate evaluation.
 * PURE: retorna la nueva fase y nextAction sin persistir.
 * @param {Object} state - Estado actual
 * @param {{ blocked: boolean, allDone?: boolean, verifying?: boolean }} gate - Resultado del gate
 * @returns {{ phase: string, nextAction: string }}
 */
export function applyPhaseTransition(state, gate) {
  if (gate.blocked) {
    return {
      phase: gate.verifying ? PHASE_VERIFYING : PHASE_IMPLEMENTING,
      nextAction: nextActionFrom(state),
    };
  }
  if (gate.allDone) {
    return {
      phase: PHASE_DONE,
      nextAction: "Tarea completa — contrato verificado",
    };
  }
  return {
    phase: state?.phase || PHASE_PROPOSED,
    nextAction: nextActionFrom(state),
  };
}

// ═══════════════════════════════════════════════════════════════
// Contract transitions — decision logic (pure)
// ═══════════════════════════════════════════════════════════════

/**
 * Lógica para aprobar un contrato (PROPOSED → APPROVED, phase → IMPLEMENTING).
 * PURE: retorna los cambios a aplicar sobre el estado.
 * @param {Object} state - Estado actual
 * @returns {{ ok: boolean, reason?: string, status?: string, phase?: string, nextAction?: string, approvedStrategy?: Object }}
 */
export function approveContractLogic(state) {
  if (!state) return { ok: false, reason: "Sin estado de tarea" };

  const blocking = (state.contract?.unknowns || []).filter(
    (u) => u.status === "blocking"
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      reason: `${blocking[0].id} DECISION_CRITICAL sin responder (bloquea aprobación): ${blocking[0].question}`,
    };
  }

  const blockingAssumptions = (state.contract?.assumptions || []).filter(
    (a) =>
      a.classification === "DECISION_CRITICAL" && a.status !== "resolved"
  );
  if (blockingAssumptions.length > 0) {
    return {
      ok: false,
      reason: `${blockingAssumptions[0].id} DECISION_CRITICAL sin resolver (bloquea aprobación): ${blockingAssumptions[0].statement} — /wam resolve ${blockingAssumptions[0].id} <evidencia>`,
    };
  }

  const inferredStrategy =
    (state.contract?.objective ||
      state.intent?.goal ||
      state.requirements?.[0]?.title ||
      state.lastAction?.split("\n")[0] ||
      "task execution"
    ).slice(0, 100);

  const allowedActions = [
    "write",
    "edit",
    "bash",
    "sh",
    "task",
    "todowrite",
    "pty_spawn",
    "pty_write",
    "pty_kill",
    "openspec",
    "openspec new change",
    "openspec instructions",
    "openspec validate",
    "openspec archive",
    "git status",
    "git diff",
    "git log",
    "git commit",
    "npm test",
    "pnpm test",
    "pnpm install",
    "crear change OpenSpec",
    "delegar via Task",
  ];

  const prohibitedActions = [
    "delete production data",
    "drop database",
    "production deploy",
    "credential modification",
    "scope expansion",
    "destructive operation",
  ];

  const invalidationConditions = [
    "environment cannot satisfy required runtime",
    "required dependency unavailable and unfixable",
    "explicit user retraction",
    "verified evidence contradicts strategy at architectural level",
  ];

  return {
    ok: true,
    status: "APPROVED",
    phase: state.phase === PHASE_DONE ? state.phase : PHASE_IMPLEMENTING,
    nextAction: nextActionFrom(state),
    approvedStrategy: {
      strategy: inferredStrategy,
      approvedAt: Date.now(),
      scope:
        state.requirements?.map((r) => r.title).join(", ") || inferredStrategy,
      allowedActions,
      prohibitedActions,
      invalidationConditions,
      status: "ACTIVE",
    },
  };
}

/**
 * Lógica para rechazar un contrato (→ REJECTED, phase → WAITING).
 * PURE.
 * @param {Object} state
 * @returns {{ ok: boolean, status: string, phase: string, nextAction: string }}
 */
export function rejectContractLogic(state) {
  return {
    ok: true,
    status: "REJECTED",
    phase: PHASE_WAITING,
    nextAction: "Revisar contrato con el usuario",
  };
}

/**
 * Lógica para editar un contrato (→ vuelve a PROPOSED).
 * PURE.
 * @param {Object} state
 * @returns {{ ok: boolean, status: string, phase: string, nextAction: string }}
 */
export function editContractLogic(state) {
  return {
    ok: true,
    status: "PROPOSED",
    phase: PHASE_PROPOSED,
    nextAction: "Revisar contrato — /wam contract approve o edit",
  };
}

// ═══════════════════════════════════════════════════════════════
// markRequirement — decision logic (pure)
// ═══════════════════════════════════════════════════════════════

/**
 * Lógica para marcar un requisito como done/pending/verified.
 * PURE: valida y retorna cambios al estado. No persiste.
 * @param {Object} state - Estado actual
 * @param {string} reqId - ID del requisito
 * @param {"done"|"pending"|"verified"} status - Nuevo estado
 * @param {string} evidence - Evidencia
 * @returns {{ ok: boolean, reason?: string, phase?: string, nextAction?: string }}
 */
export function markRequirementLogic(state, reqId, status, evidence) {
  if (!state) return { ok: false, reason: "Sin estado de tarea" };

  const req = (state.requirements || []).find((r) => r.id === reqId);
  if (!req) return { ok: false, reason: `Requisito ${reqId} no existe` };

  if (
    (status === "done" || status === "verified") &&
    !(evidence && evidence.trim())
  ) {
    return {
      ok: false,
      reason: `Requisito ${reqId}: evidencia requerida para marcar ${status}`,
    };
  }

  if (status === "verified" && req.status !== "done") {
    return {
      ok: false,
      reason: `Requisito ${reqId}: marcar done antes de verified`,
    };
  }

  // Aplicar cambios al estado (retornar nuevo estado, no mutar)
  let newPhase = state.phase;
  let newNextAction = nextActionFrom(state);

  // Si todos los requirements están verified → auto-advance a VERIFYING
  if (status === "verified") {
    const allVerified = (state.requirements || []).every(
      (r) => r.status === "verified"
    );
    if (allVerified && state.phase !== PHASE_DONE) {
      newPhase = PHASE_VERIFYING;
    }
  }

  return { ok: true, phase: newPhase, nextAction: newNextAction };
}
