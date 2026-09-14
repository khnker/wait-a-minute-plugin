/**
 * WAM Task Execution History — DEPRECATED compatibility layer.
 *
 * DEPRECATED: Use task-runs.js directly. This module is a thin wrapper
 * that delegates to task-runs.js for backward compatibility.
 *
 * Canonical model: task-runs.js (separate run files in .wam/tasks/<taskId>/runs/)
 * Legacy model: state.yaml executions[] array (deprecated, will be migrated)
 *
 * Migration: On first access, executions[] from state.yaml are migrated
 * to runs/ directory and the legacy field is removed.
 */

import fs from "node:fs";
import path from "node:path";
import { getTaskState, persistTaskState } from "./engine.js";
import {
  startRun,
  closeRun,
  addObservation as addRunObservation,
  addDecision as addRunDecision,
  addEvidence as addRunEvidence,
  getRuns,
  getRunsNormalized,
  getRun,
  getLastRun,
  getLastRunSummary,
  getUnresolvedRequirements as getUnresolvedReqs,
  getPreviousFailures as getPrevFailures,
  getPreviousDecisions as getPrevDecisions,
  getResumeContext as getResumeCtx,
  needsNewRun,
} from "./task-runs.js";

// -- Migration --

/**
 * Migrate legacy executions[] from state.yaml to runs/ directory.
 * This is idempotent — safe to call multiple times.
 */
export function migrateLegacyExecutions(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state?.executions || state.executions.length === 0) return 0;

  const existingRuns = getRuns(taskId, root);
  const existingRunIds = new Set(existingRuns.map((r) => r.id));

  let migrated = 0;

  for (const exec of state.executions) {
    // Skip if already migrated (by ID convention or content match)
    if (existingRunIds.has(exec.id)) continue;

    // Convert execution to run format
    const run = {
      id: exec.id,
      taskId: exec.taskId || taskId,
      startedAt: exec.startedAt,
      completedAt: exec.completedAt,
      status: exec.status || "active",
      phase: "IMPLEMENTING",
      observations: (exec.observations || []).map((text, i) => ({
        id: `obs-${i + 1}`,
        text: typeof text === "string" ? text : text.text || String(text),
        timestamp: exec.startedAt || Date.now(),
      })),
      decisions: (exec.decisions || []).map((text, i) => ({
        id: `dec-${i + 1}`,
        text: typeof text === "string" ? text : text.text || String(text),
        timestamp: exec.startedAt || Date.now(),
      })),
      evidence: (exec.evidence || []).map((text, i) => ({
        id: `ev-${i + 1}`,
        text: typeof text === "string" ? text : text.text || String(text),
        timestamp: exec.startedAt || Date.now(),
      })),
      actions: [],
      outcome: exec.outcome || null,
    };

    // Write to runs directory
    const runsDir = path.join(root || process.cwd(), ".wam", "tasks", taskId, "runs");
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(runsDir, `${run.id}.json`), JSON.stringify(run, null, 2));

    migrated++;
  }

  // Remove legacy executions[] from state
  delete state.executions;
  persistTaskState(taskId, state, root);

  return migrated;
}

/**
 * Check if a task has legacy executions that need migration.
 */
export function hasLegacyExecutions(taskId, root) {
  const state = getTaskState(taskId, root);
  return state?.executions && state.executions.length > 0;
}

// -- Delegated API (backward compatible) --

/**
 * Create a new execution for an existing task.
 * Delegates to startRun().
 */
export function createExecution(taskId, root) {
  const run = startRun(taskId, root);
  // Seed legacy state.executions[] (cross-session compat)
  syncExecToState(taskId, {
    id: run.id,
    taskId: run.taskId,
    startedAt: run.startedAt,
    status: run.status,
    outcome: run.outcome,
    observations: [],
    decisions: [],
    evidence: [],
  }, root);
  return run;
}

/**
 * Close an execution with a status and optional outcome.
 * Delegates to closeRun().
 */
export function closeExecution(taskId, execId, status, outcome, root) {
  const run = closeRun(taskId, execId, status, outcome, root);
  const state = getTaskState(taskId, root);
  if (state?.executions) {
    const legacy = {
      id: run.id,
      taskId: run.taskId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status,
      outcome: run.outcome,
      observations: (run.observations || []).map((o) =>
        typeof o === "string" ? o : o.text
      ),
      decisions: (run.decisions || []).map((d) =>
        typeof d === "string" ? d : d.text
      ),
      evidence: (run.evidence || []).map((e) =>
        typeof e === "string" ? e : e.text
      ),
    };
    syncExecToState(taskId, legacy, root);
  }
  return run;
}

function syncExecToState(taskId, exec, root) {
  const state = getTaskState(taskId, root);
  if (!state) return;
  if (!Array.isArray(state.executions)) state.executions = [];
  const idx = state.executions.findIndex((e) => e.id === exec.id);
  if (idx >= 0) {
    state.executions[idx] = exec;
  } else {
    state.executions.push(exec);
  }
  persistTaskState(taskId, state, root);
}

function readExecFromRuns(taskId, execId, root) {
  // Lazy: read from runs/ directory via task-runs.js
  return getRun(taskId, execId, root);
}

/**
 * Add an observation to an execution.
 * Delegates to addObservation() in task-runs.js.
 */
export function addObservation(taskId, execId, text, root) {
  const updated = addRunObservation(taskId, execId, text, root);
  // Sync to legacy state.yaml executions[] for backward compat
  const state = getTaskState(taskId, root);
  if (state?.executions) {
    const legacy = {
      id: updated.id,
      taskId: updated.taskId,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
      status: updated.status,
      outcome: updated.outcome,
      observations: (updated.observations || []).map((o) =>
        typeof o === "string" ? o : o.text
      ),
      decisions: (updated.decisions || []).map((d) =>
        typeof d === "string" ? d : d.text
      ),
      evidence: (updated.evidence || []).map((e) =>
        typeof e === "string" ? e : e.text
      ),
    };
    syncExecToState(taskId, legacy, root);
  }
  return updated;
}

/**
 * Add a decision to an execution.
 * Delegates to addDecision() in task-runs.js.
 */
export function addDecision(taskId, execId, text, root) {
  const updated = addRunDecision(taskId, execId, text, root);
  const state = getTaskState(taskId, root);
  if (state?.executions) {
    const legacy = {
      id: updated.id,
      taskId: updated.taskId,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
      status: updated.status,
      outcome: updated.outcome,
      observations: (updated.observations || []).map((o) =>
        typeof o === "string" ? o : o.text
      ),
      decisions: (updated.decisions || []).map((d) =>
        typeof d === "string" ? d : d.text
      ),
      evidence: (updated.evidence || []).map((e) =>
        typeof e === "string" ? e : e.text
      ),
    };
    syncExecToState(taskId, legacy, root);
  }
  return updated;
}

/**
 * Add evidence to an execution.
 * Delegates to addEvidence() in task-runs.js.
 */
export function addEvidence(taskId, execId, text, root) {
  const updated = addRunEvidence(taskId, execId, text, root);
  const state = getTaskState(taskId, root);
  if (state?.executions) {
    const legacy = {
      id: updated.id,
      taskId: updated.taskId,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
      status: updated.status,
      outcome: updated.outcome,
      observations: (updated.observations || []).map((o) =>
        typeof o === "string" ? o : o.text
      ),
      decisions: (updated.decisions || []).map((d) =>
        typeof d === "string" ? d : d.text
      ),
      evidence: (updated.evidence || []).map((e) =>
        typeof e === "string" ? e : e.text
      ),
    };
    syncExecToState(taskId, legacy, root);
  }
  return updated;
}

// -- Query (delegated) --

/**
 * Get all executions for a task.
 * Delegates to getRuns().
 */
export function getExecutions(taskId, root) {
  return getRunsNormalized(taskId, root);
}

/**
 * Get the last (most recent) execution for a task.
 * Delegates to getLastRun().
 */
export function getLastExecution(taskId, root) {
  return getLastRun(taskId, root);
}

/**
 * Get the last known state of a task from its most recent execution.
 * Delegates to getLastRunSummary().
 */
export function getLastExecutionSummary(taskId, root) {
  return getLastRunSummary(taskId, root);
}

/**
 * Get unresolved requirements from task state.
 * Delegates to getUnresolvedRequirements() in task-runs.js.
 */
export function getUnresolvedRequirements(taskId, root) {
  return getUnresolvedReqs(taskId, root);
}

/**
 * Get relevant previous failures.
 * Delegates to getPreviousFailures() in task-runs.js.
 */
export function getPreviousFailures(taskId, root) {
  return getPrevFailures(taskId, root);
}

/**
 * Get relevant previous decisions from execution history.
 * Delegates to getPreviousDecisions() in task-runs.js.
 */
export function getPreviousDecisions(taskId, root, limit = 5) {
  return getPrevDecisions(taskId, root, limit);
}

/**
 * Resume context: aggregate what's needed to continue work.
 * Delegates to getResumeContext() in task-runs.js.
 */
export function getResumeContext(taskId, root) {
  return getResumeCtx(taskId, root);
}

/**
 * Check if task needs a new execution (no active one).
 * Delegates to needsNewRun().
 */
export function needsNewExecution(taskId, root) {
  return needsNewRun(taskId, root);
}
