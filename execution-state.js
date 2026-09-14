/**
 * Formal execution state — single source of truth for task lifecycle.
 * Implements spec: formal-execution-state.
 *
 * States:
 *   INITIALIZING | INVESTIGATING | EXECUTING | VERIFYING | COMPLETED
 *   BLOCKED | WAITING_AUTHORIZATION | FAILED
 *
 * Transition table is strict: only documented transitions are allowed.
 */

const VALID_STATES = new Set([
  "INITIALIZING",
  "INVESTIGATING",
  "EXECUTING",
  "VERIFYING",
  "COMPLETED",
  "BLOCKED",
  "WAITING_AUTHORIZATION",
  "FAILED",
]);

const ALLOWED_TRANSITIONS = {
  INITIALIZING: new Set(["INVESTIGATING", "BLOCKED"]),
  INVESTIGATING: new Set(["EXECUTING", "WAITING_AUTHORIZATION", "BLOCKED"]),
  EXECUTING: new Set(["VERIFYING", "BLOCKED", "FAILED"]),
  VERIFYING: new Set(["COMPLETED", "EXECUTING", "FAILED"]),
  WAITING_AUTHORIZATION: new Set(["EXECUTING", "BLOCKED"]),
  BLOCKED: new Set(["INVESTIGATING", "EXECUTING"]),
  FAILED: new Set(["INVESTIGATING"]),
  COMPLETED: new Set(),
};

const LEGACY_PHASE_TO_STATE = {
  ASKING: "WAITING_AUTHORIZATION",
  PROPOSED: "INVESTIGATING",
  IMPLEMENTING: "EXECUTING",
  VERIFYING: "VERIFYING",
  DONE: "COMPLETED",
};

export function isValidState(s) {
  return typeof s === "string" && VALID_STATES.has(s);
}

export function migrateLegacyPhase(phase) {
  return LEGACY_PHASE_TO_STATE[phase] || "INITIALIZING";
}

export function validateState(s) {
  if (!isValidState(s)) {
    throw new Error(`Invalid execution state: ${JSON.stringify(s)}. Must be one of: ${[...VALID_STATES].join(", ")}`);
  }
}

import { hasOutstandingWork } from "./verification-lifecycle.js";

export function transition(from, to, taskState = null) {
  validateState(from);
  validateState(to);
  // Guard: block transition to COMPLETED if there is outstanding work
  if (to === "COMPLETED" && hasOutstandingWork(taskState)) {
    throw new Error("Cannot transition to COMPLETED while there is outstanding work (unverified requirements or pending backlog)");
  }
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}. Allowed from ${from}: ${[...allowed].join(", ") || "(none, terminal)"}`);
  }
  return to;
}

export function getStatusReport(taskState, { experiments = [], failures = [], pendingAuth = null, verification = null, completionEvidence = [] } = {}) {
  if (!taskState) return "Sin estado de tarea";
  const lines = [
    `state: ${taskState.state || migrateLegacyPhase(taskState.phase)}`,
    `strategy: ${taskState.approvedStrategy?.strategy || "—"}`,
    `current hypothesis: ${taskState.currentHypothesis || "—"}`,
    `experiments: ${experiments.length}`,
    `failures: ${failures.length}`,
    `pending authorization: ${pendingAuth ? pendingAuth.id || pendingAuth.question || "yes" : "none"}`,
    `verification status: ${verification?.status || "pending"}`,
    `completion evidence: ${completionEvidence.length} item(s)`,
  ];
  // Add each piece of completion evidence with req id and evidence
  for (const item of completionEvidence) {
    lines.push(`${item.req}: ${item.evidence}`);
  }
  return lines.join("\n");
}
