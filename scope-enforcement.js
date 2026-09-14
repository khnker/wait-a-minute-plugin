/**
 * Scope & Strategy Enforcement — scope drift detection.
 * Implements spec: scope-and-strategy-enforcement.
 *
 * Strategy = objective, scope, allowedActions, prohibitedActions
 * Current Execution = hypothesis, experiment, files touched, actions, evidence
 * Drift = deviation between strategy and current execution.
 *
 * Policy:
 *   none / small_safe → allow + record
 *   material          → require authorization
 *   prohibited        → block
 */

const DRIFT_LEVELS = {
  NONE: "none",
  SMALL_SAFE: "small_safe",
  MATERIAL: "material",
  PROHIBITED: "prohibited",
};

const SAFE_FAMILIES = new Set([
  "read", "search", "inspect", "test", "lint", "typecheck", "list", "glob", "grep",
]);

const MATERIAL_FAMILIES = new Set([
  "refactor", "rename", "migrate", "schema", "schema-change", "restructure", "rewrite",
  "scope expansion", "scope-expansion", "architectural change",
]);

const PROHIBITED_FAMILIES = new Set([
  "drop database", "drop schema", "production deploy", "delete production data",
  "credential modification", "destructive operation", "rm -rf", "git reset --hard",
  "wipe", "truncate", "shred",
]);

function familyOf(action = "", command = "") {
  const text = `${action} ${command}`.toLowerCase();
  for (const p of PROHIBITED_FAMILIES) {
    if (text.includes(p)) return { level: DRIFT_LEVELS.PROHIBITED, family: p };
  }
  for (const m of MATERIAL_FAMILIES) {
    if (text.includes(m)) return { level: DRIFT_LEVELS.MATERIAL, family: m };
  }
  for (const s of SAFE_FAMILIES) {
    if (text.includes(s)) return { level: DRIFT_LEVELS.SMALL_SAFE, family: s };
  }
  return { level: DRIFT_LEVELS.NONE, family: null };
}

function isInScope(action, strategy) {
  if (!strategy) return false;
  const allowed = strategy.allowedActions || [];
  const prohibited = strategy.prohibitedActions || [];
  const a = (action || "").toLowerCase();
  for (const p of prohibited) {
    if (a.includes(p.toLowerCase())) return { allowed: false, reason: `prohibited: ${p}` };
  }
  for (const allow of allowed) {
    if (a.includes(allow.toLowerCase())) return { allowed: true, reason: `matched: ${allow}` };
  }
  return { allowed: false, reason: "no allowed action matched" };
}

export function detectScopeDrift(strategy, execution) {
  const action = execution?.action || execution?.description || "";
  const command = execution?.command || execution?.args?.command || "";
  
  // Empty action = no drift
  if (!action && !command) {
    return {
      level: DRIFT_LEVELS.NONE,
      family: null,
      allowed: true,
      reason: "no action",
      action,
      command,
    };
  }
  
  const result = familyOf(action, command);
  const scopeCheck = isInScope(action, strategy);

  let drift = result.level;
  
  // If action is explicitly allowed by strategy, it's at most SMALL_SAFE
  if (scopeCheck.allowed === true) {
    // Allowed by strategy: if it's already a safe family, keep it; otherwise make it SMALL_SAFE
    if (result.level === DRIFT_LEVELS.NONE) {
      drift = DRIFT_LEVELS.SMALL_SAFE;
    }
  } else if (scopeCheck.allowed === false && result.level !== DRIFT_LEVELS.PROHIBITED) {
    // Not allowed by strategy
    if (result.level === DRIFT_LEVELS.SMALL_SAFE) {
      drift = DRIFT_LEVELS.SMALL_SAFE;
    } else if (result.level === DRIFT_LEVELS.NONE) {
      drift = DRIFT_LEVELS.MATERIAL;
    } else {
      drift = result.level;
    }
  }

  return {
    level: drift,
    family: result.family,
    allowed: scopeCheck.allowed,
    reason: scopeCheck.reason,
    action,
    command,
  };
}

export function policyFor(drift) {
  switch (drift.level) {
    case DRIFT_LEVELS.NONE:
    case DRIFT_LEVELS.SMALL_SAFE:
      return "allow+record";
    case DRIFT_LEVELS.MATERIAL:
      return "require-authorization";
    case DRIFT_LEVELS.PROHIBITED:
      return "block";
    default:
      return "block";
  }
}

export function recordDrift(taskState, drift) {
  if (!taskState) return taskState;
  if (!Array.isArray(taskState.driftLog)) taskState.driftLog = [];
  taskState.driftLog.push({
    at: Date.now(),
    level: drift.level,
    family: drift.family,
    action: drift.action,
    reason: drift.reason,
  });
  return taskState;
}

export const SCOPE_DRIFT = DRIFT_LEVELS;
