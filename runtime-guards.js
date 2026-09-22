import { findRepeatedExperiment, hasRepetitiveFailure } from "./cognition-store.js";
import { evaluateAction } from "./risk-engine.js";
import { getCapability, CAPABILITY_LEVELS } from "./policy/action-capabilities.js";

const HARD_DELETE_RE =
  /\b(rmdir|unlink|shred|truncate)\b|\brm\s+(-[a-zA-Z]*f|--force)|\bgit\s+reset\s+--hard\b|\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i;

const HARD_DELETE_TOOLS = new Set(["rm", "rmdir"]);

function isHardDelete(tool, args = {}) {
  const t = String(tool || "").toLowerCase();
  if (HARD_DELETE_TOOLS.has(t)) return true;
  const cmd = String(args.command || args.cmd || "");
  return HARD_DELETE_RE.test(cmd);
}

function actionDescription(tool, args = {}) {
  const { hypothesisId: _h, ...rest } = args;
  return `${tool}:${JSON.stringify(rest)}`;
}

/**
 * Autonomy Runtime Guards
 *
 * Intercepta ejecución para evaluar:
 * 1. Riesgo de la acción (Risk Envelope)
 * 2. Stagnation/Repetition (cognition-store)
 * 3. Hard-delete ban (U1: soft-archive only)
 * 4. Scope enforcement
 */
export async function guardAction(tool, args, taskRoot, taskId) {
  // 0. Fail-closed (C01): herramientas no catalogadas se bloquean aquí,
  //    ANTES de cualquier otra evaluación. Esto crea una segunda línea
  //    de defensa independiente del risk-engine: aunque la evaluación
  //    contextual cambie, una herramienta desconocida nunca llega a
  //    ejecutarse.
  const capability = getCapability(tool);
  if (capability === CAPABILITY_LEVELS.UNKNOWN) {
    return {
      allowed: false,
      level: "BLOCKED",
      reason: `fail-closed: herramienta no catalogada (${tool})`,
    };
  }

  if (isHardDelete(tool, args)) {
    return {
      allowed: false,
      level: "BLOCKED",
      reason: "hard delete forbidden (U1: soft-archive only)",
    };
  }

  let risk;
  try {
    risk = evaluateAction(tool, args, taskRoot);
  } catch (err) {
    const name = err?.name || err?.constructor?.name;
    if (name === "WamPolicyBlock") {
      return { allowed: false, level: "BLOCKED", reason: err.message };
    }
    throw err;
  }

  if (risk.level === "BLOCKED") {
    return {
      allowed: false,
      level: "BLOCKED",
      reason: risk.reason || "destructive or irreversible action blocked",
    };
  }

  const desc = actionDescription(tool, args);
  const probe = {
    hypothesisId: args?.hypothesisId || "unknown",
    actionDescription: desc,
  };

  if (hasRepetitiveFailure(taskRoot, taskId, probe)) {
    return {
      allowed: false,
      level: risk.level,
      reason: "repetitive failure: same hypothesis+action already failed. Replan with a new hypothesis.",
    };
  }

  const repeated = findRepeatedExperiment(taskRoot, taskId, probe);

  if (risk.level === "GUARDED" && !args?.hypothesisId) {
    return {
      allowed: true,
      level: risk.level,
      warning: "GUARDED action without hypothesisId — attach hypothesis before mutating.",
    };
  }

  if (repeated) {
    return {
      allowed: true,
      level: risk.level,
      warning: `Repetición detectada: ya se intentó ${repeated.status}. Considera replanificar.`,
    };
  }

  return { allowed: true, level: risk.level };
}
