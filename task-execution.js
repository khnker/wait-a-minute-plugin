/**
 * WAM Task Execution History
 *
 * Separates current task state from historical executions.
 * A task persists as the unit of identity.
 * An execution represents one concrete attempt/session against that objective.
 */

import { persistTaskState, getTaskState } from "./engine.js";

// -- Types --

/**
 * @typedef {Object} TaskExecution
 * @property {string} id
 * @property {string} taskId
 * @property {number} startedAt
 * @property {number} [completedAt]
 * @property {"active"|"completed"|"failed"|"blocked"|"abandoned"} status
 * @property {string[]} observations
 * @property {string[]} decisions
 * @property {string[]} evidence
 * @property {string} [outcome]
 */

// -- Helpers --

function generateExecId(taskId, index) {
  return `${taskId}-exec-${String(index).padStart(3, "0")}`;
}

function now() {
  return Date.now();
}

// -- Execution Management --

/**
 * Create a new execution for an existing task.
 * Returns the created execution.
 */
export function createExecution(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  if (!state.executions) state.executions = [];

  const index = state.executions.length + 1;
  const exec = {
    id: generateExecId(taskId, index),
    taskId,
    startedAt: now(),
    status: "active",
    observations: [],
    decisions: [],
    evidence: [],
  };

  state.executions.push(exec);
  persistTaskState(taskId, state, root);
  return exec;
}

/**
 * Close an execution with a status and optional outcome.
 */
export function closeExecution(taskId, execId, status, outcome, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const exec = (state.executions || []).find((e) => e.id === execId);
  if (!exec) throw new Error(`Execution ${execId} not found`);

  exec.completedAt = now();
  exec.status = status;
  if (outcome) exec.outcome = outcome;

  persistTaskState(taskId, state, root);
  return exec;
}

/**
 * Add an observation to an execution.
 */
export function addObservation(taskId, execId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const exec = (state.executions || []).find((e) => e.id === execId);
  if (!exec) throw new Error(`Execution ${execId} not found`);

  exec.observations.push(text);
  persistTaskState(taskId, state, root);
  return exec;
}

/**
 * Add a decision to an execution.
 */
export function addDecision(taskId, execId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const exec = (state.executions || []).find((e) => e.id === execId);
  if (!exec) throw new Error(`Execution ${execId} not found`);

  exec.decisions.push(text);
  persistTaskState(taskId, state, root);
  return exec;
}

/**
 * Add evidence to an execution.
 */
export function addEvidence(taskId, execId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const exec = (state.executions || []).find((e) => e.id === execId);
  if (!exec) throw new Error(`Execution ${execId} not found`);

  exec.evidence.push(text);
  persistTaskState(taskId, state, root);
  return exec;
}

// -- Query --

/**
 * Get all executions for a task.
 */
export function getExecutions(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  return state.executions || [];
}

/**
 * Get the last (most recent) execution for a task.
 */
export function getLastExecution(taskId, root) {
  const execs = getExecutions(taskId, root);
  return execs.length > 0 ? execs[execs.length - 1] : null;
}

/**
 * Get the last known state of a task from its most recent execution.
 * Returns only what the last execution observed/decided/evidenced.
 */
export function getLastExecutionSummary(taskId, root) {
  const last = getLastExecution(taskId, root);
  if (!last) return null;

  return {
    executionId: last.id,
    completedAt: last.completedAt,
    status: last.status,
    outcome: last.outcome,
    observationsCount: last.observations.length,
    decisionsCount: last.decisions.length,
    evidenceCount: last.evidence.length,
  };
}

/**
 * Get unresolved requirements from task state.
 */
export function getUnresolvedRequirements(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  return (state.requirements || []).filter((r) => r.status !== "done");
}

/**
 * Get relevant previous failures.
 */
export function getPreviousFailures(taskId, root) {
  const execs = getExecutions(taskId, root);
  return execs.filter((e) => e.status === "failed" || e.status === "abandoned");
}

/**
 * Get relevant previous decisions from execution history.
 */
export function getPreviousDecisions(taskId, root, limit = 5) {
  const execs = getExecutions(taskId, root);
  const allDecisions = [];
  for (const exec of execs) {
    for (const d of exec.decisions) {
      allDecisions.push({ executionId: exec.id, decision: d, completedAt: exec.completedAt });
    }
  }
  return allDecisions.slice(-limit);
}

/**
 * Resume context: aggregate what's needed to continue work.
 * Does NOT load all historical executions.
 */
export function getResumeContext(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return null;

  const lastExec = getLastExecution(taskId, root);
  const unresolved = getUnresolvedRequirements(taskId, root);
  const failures = getPreviousFailures(taskId, root);
  const recentDecisions = getPreviousDecisions(taskId, root, 3);

  return {
    taskSummary: state.lastAction || state.contract?.objective || "",
    phase: state.phase,
    lastExecution: lastExec
      ? {
          id: lastExec.id,
          status: lastExec.status,
          outcome: lastExec.outcome,
          completedAt: lastExec.completedAt,
        }
      : null,
    unresolvedRequirements: unresolved.map((r) => ({ id: r.id, title: r.title })),
    recentFailures: failures.map((f) => ({
      executionId: f.id,
      outcome: f.outcome,
      completedAt: f.completedAt,
    })),
    recentDecisions,
    totalExecutions: (state.executions || []).length,
  };
}

/**
 * Check if task needs a new execution (no active one).
 */
export function needsNewExecution(taskId, root) {
  const execs = getExecutions(taskId, root);
  if (execs.length === 0) return true;
  const last = execs[execs.length - 1];
  return last.status !== "active";
}
