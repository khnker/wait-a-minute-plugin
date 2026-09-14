/**
 * WAM Persistent Task Runs
 *
 * Task = identidad persistente.
 * Run = ejecución concreta, almacenada como archivo separado.
 *
 * Estructura:
 * .wam/tasks/<taskId>/
 * ├── state.yaml        (estado actual canónico)
 * └── runs/
 *     ├── <runId>.json
 *     └── <runId>.json
 *
 * Invariant: Task permanece en .wam/tasks/ aunque ejecución termine.
 * Runs terminados no se mueven a .wam/history/ - permanecen bajo runs/.
 */

import fs from "node:fs";
import path from "node:path";
import { getTaskState, persistTaskState } from "./engine.js";

function getRunsDir(taskId, root) {
  return path.join(root || process.cwd(), ".wam", "tasks", taskId, "runs");
}

function ensureRunsDir(taskId, root) {
  const dir = getRunsDir(taskId, root);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateRunId(taskId, index) {
  return `${taskId}-run-${String(index).padStart(3, "0")}`;
}

function now() {
  return Date.now();
}

function getRunFile(taskId, runId, root) {
  return path.join(getRunsDir(taskId, root), `${runId}.json`);
}

function readRunFile(taskId, runId, root) {
  const file = getRunFile(taskId, runId, root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeRunFile(taskId, runId, data, root) {
  const file = getRunFile(taskId, runId, root);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getNextRunIndex(taskId, root) {
  const dir = getRunsDir(taskId, root);
  if (!fs.existsSync(dir)) return 1;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.length + 1;
}

export function startRun(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  ensureRunsDir(taskId, root);
  const index = getNextRunIndex(taskId, root);
  const runId = generateRunId(taskId, index);

  const run = {
    id: runId,
    taskId,
    startedAt: now(),
    status: "active",
    phase: state.phase || "IMPLEMENTING",
    observations: [],
    decisions: [],
    evidence: [],
    actions: [],
    outcome: null,
  };

  writeRunFile(taskId, runId, run, root);

  state.currentRunId = runId;
  persistTaskState(taskId, state, root);

  return run;
}

export function closeRun(taskId, runId, status, outcome, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.completedAt = now();
  run.status = status;
  if (outcome) run.outcome = outcome;

  writeRunFile(taskId, runId, run, root);

  const state = getTaskState(taskId, root);
  if (state?.currentRunId === runId) {
    state.currentRunId = null;
    persistTaskState(taskId, state, root);
  }

  return run;
}

export function updateRun(taskId, runId, updates, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  Object.assign(run, updates);
  writeRunFile(taskId, runId, run, root);
  return run;
}

export function addObservation(taskId, runId, text, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (!run.observations) run.observations = [];
  run.observations.push({
    id: `obs-${run.observations.length + 1}`,
    text,
    timestamp: now(),
  });

  writeRunFile(taskId, runId, run, root);
  return run;
}

export function addDecision(taskId, runId, text, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (!run.decisions) run.decisions = [];
  run.decisions.push({
    id: `dec-${run.decisions.length + 1}`,
    text,
    timestamp: now(),
  });

  writeRunFile(taskId, runId, run, root);
  return run;
}

export function addEvidence(taskId, runId, text, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (!run.evidence) run.evidence = [];
  run.evidence.push({
    id: `ev-${run.evidence.length + 1}`,
    text,
    timestamp: now(),
  });

  writeRunFile(taskId, runId, run, root);
  return run;
}

export function addAction(taskId, runId, action, root) {
  const run = readRunFile(taskId, runId, root);
  if (!run) throw new Error(`Run ${runId} not found`);

  if (!run.actions) run.actions = [];
  run.actions.push({
    id: `act-${run.actions.length + 1}`,
    ...action,
    timestamp: now(),
  });

  writeRunFile(taskId, runId, run, root);
  return run;
}

export function getRun(taskId, runId, root) {
  return readRunFile(taskId, runId, root);
}

export function getRuns(taskId, root) {
  const dir = getRunsDir(taskId, root);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const runs = [];

  for (const file of files) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      runs.push(run);
    } catch {
      // Skip invalid files
    }
  }

  return runs.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

export function getLastRun(taskId, root) {
  const runs = getRuns(taskId, root);
  return runs.length > 0 ? runs[runs.length - 1] : null;
}

export function getCurrentRun(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state?.currentRunId) return null;
  return getRun(taskId, state.currentRunId, root);
}

export function getActiveRun(taskId, root) {
  const runs = getRuns(taskId, root);
  return runs.find((r) => r.status === "active") || null;
}

export function getLastRunSummary(taskId, root) {
  const last = getLastRun(taskId, root);
  if (!last) return null;

  return {
    runId: last.id,
    completedAt: last.completedAt,
    status: last.status,
    outcome: last.outcome,
    observationsCount: last.observations?.length || 0,
    decisionsCount: last.decisions?.length || 0,
    evidenceCount: last.evidence?.length || 0,
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
    for (const d of run.decisions || []) {
      allDecisions.push({
        runId: run.id,
        decision: d.text,
        timestamp: d.timestamp,
        completedAt: run.completedAt,
      });
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
    currentRunId: state.currentRunId,
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
    totalRuns: getRuns(taskId, root).length,
  };
}

export function needsNewRun(taskId, root) {
  const active = getActiveRun(taskId, root);
  if (active) return false;

  const current = getCurrentRun(taskId, root);
  if (current) return false;

  return true;
}

export function getRunCount(taskId, root) {
  return getRuns(taskId, root).length;
}

export function getRunsByStatus(taskId, root, status) {
  const runs = getRuns(taskId, root);
  return runs.filter((r) => r.status === status);
}
