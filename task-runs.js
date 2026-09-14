/**
 * WAM Task Runs
 *
 * Extends existing WAM task with explicit execution runs.
 * A task is a persistent unit of work. A run represents one concrete
 * execution/session of that task.
 *
 * The existing task state remains canonical.
 * Runs provide historical provenance for observations, decisions, failures,
 * verification and outcomes.
 *
 * Invariant: Historical run data is NOT current task state.
 * An observation from a previous run must not become a current fact
 * merely because it is recent.
 */

import { persistTaskState, getTaskState } from "./engine.js";

/**
 * @typedef {Object} TaskRun
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

function generateRunId(taskId, index) {
  return `${taskId}-run-${String(index).padStart(3, "0")}`;
}

function now() {
  return Date.now();
}

export function startRun(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  if (!state.runs) state.runs = [];

  const index = state.runs.length + 1;
  const run = {
    id: generateRunId(taskId, index),
    taskId,
    startedAt: now(),
    status: "active",
    observations: [],
    decisions: [],
    evidence: [],
  };

  state.runs.push(run);
  persistTaskState(taskId, state, root);
  return run;
}

export function closeRun(taskId, runId, status, outcome, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.completedAt = now();
  run.status = status;
  if (outcome) run.outcome = outcome;

  persistTaskState(taskId, state, root);
  return run;
}

export function addObservation(taskId, runId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.observations.push(text);
  persistTaskState(taskId, state, root);
  return run;
}

export function addDecision(taskId, runId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.decisions.push(text);
  persistTaskState(taskId, state, root);
  return run;
}

export function addEvidence(taskId, runId, text, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.evidence.push(text);
  persistTaskState(taskId, state, root);
  return run;
}

export function getRuns(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  return state.runs || [];
}

export function getLastRun(taskId, root) {
  const runs = getRuns(taskId, root);
  return runs.length > 0 ? runs[runs.length - 1] : null;
}

export function getLastRunSummary(taskId, root) {
  const last = getLastRun(taskId, root);
  if (!last) return null;

  return {
    runId: last.id,
    completedAt: last.completedAt,
    status: last.status,
    outcome: last.outcome,
    observationsCount: last.observations.length,
    decisionsCount: last.decisions.length,
    evidenceCount: last.evidence.length,
  };
}

export function getUnresolvedRequirements(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  return (state.requirements || []).filter((r) => r.status !== "done");
}

export function getPreviousFailures(taskId, root) {
  const runs = getRuns(taskId, root);
  return runs.filter((r) => r.status === "failed" || r.status === "abandoned");
}

export function getPreviousDecisions(taskId, root, limit = 5) {
  const runs = getRuns(taskId, root);
  const allDecisions = [];
  for (const run of runs) {
    for (const d of run.decisions) {
      allDecisions.push({ runId: run.id, decision: d, completedAt: run.completedAt });
    }
  }
  return allDecisions.slice(-limit);
}

export function getResumeContext(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return null;

  const lastRun = getLastRun(taskId, root);
  const unresolved = getUnresolvedRequirements(taskId, root);
  const failures = getPreviousFailures(taskId, root);
  const recentDecisions = getPreviousDecisions(taskId, root, 3);

  return {
    taskSummary: state.lastAction || state.contract?.objective || "",
    phase: state.phase,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          outcome: lastRun.outcome,
          completedAt: lastRun.completedAt,
        }
      : null,
    unresolvedRequirements: unresolved.map((r) => ({ id: r.id, title: r.title })),
    recentFailures: failures.map((f) => ({
      runId: f.id,
      outcome: f.outcome,
      completedAt: f.completedAt,
    })),
    recentDecisions,
    totalRuns: (state.runs || []).length,
  };
}

export function needsNewRun(taskId, root) {
  const runs = getRuns(taskId, root);
  if (runs.length === 0) return true;
  const last = runs[runs.length - 1];
  return last.status !== "active";
}
