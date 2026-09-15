
import {
  createHypothesis,
  listHypotheses,
  updateHypothesisStatus,
  archiveHypothesis,
  HYPOTHESIS_STATUS,
} from "./cognition-store.js";

/**
 * Cognitive State facade — delegates to cognition-store.js (single source of truth).
 *
 * Mantiene compatibilidad con la API previa (loadCognitiveState, saveCognitiveState,
 * addActiveHypothesis, rejectHypothesis, recordExperiment, recordObservation,
 * compactCognitiveState) pero toda persistencia se redirige a
 * `.wam/tasks/<taskId>/cognition/*.jsonl` vía cognition-store.
 *
 * Si el caller no provee taskId, se intenta derivar de la convención:
 * taskRoot/.wam/tasks/<taskId>/  →  primer taskId encontrado.
 */

const DEFAULT_STATE = {
  activeHypotheses: [],
  rejectedHypotheses: [],
  recentExperiments: [],
  criticalObservations: [],
  lastUpdated: null,
};

function resolveTaskId(taskRoot, explicitTaskId) {
  if (explicitTaskId) return explicitTaskId;
  // Convención: el primer directorio bajo .wam/tasks/
  const tasksRoot = `${taskRoot}/.wam/tasks`;
  try {
    const entries = require("node:fs").readdirSync(tasksRoot, { withFileTypes: true });
    const dir = entries.find((e) => e.isDirectory());
    return dir ? dir.name : "default";
  } catch {
    return "default";
  }
}

function buildStateFromStore(taskRoot, taskId) {
  const all = listHypotheses(taskRoot, taskId);
  const active = all.filter((h) =>
    h.status === HYPOTHESIS_STATUS.PROPOSED || h.status === HYPOTHESIS_STATUS.TESTING
  );
  const rejected = all.filter((h) => h.status === HYPOTHESIS_STATUS.REJECTED);
  const archived = all.filter((h) => h.status === HYPOTHESIS_STATUS.ARCHIVED);
  const rejectedHypotheses = [...rejected, ...archived];
  return {
    activeHypotheses: active,
    rejectedHypotheses,
    recentExperiments: [],
    criticalObservations: [],
    lastUpdated: Date.now(),
  };
}

export function loadCognitiveState(taskRoot, taskId) {
  const tid = resolveTaskId(taskRoot, taskId);
  return buildStateFromStore(taskRoot, tid);
}

/**
 * @deprecated La persistencia ahora vive en cognition-store.js.
 * Esta función queda como no-op para no romper callers que aún la invocan.
 */
export function saveCognitiveState(_taskRoot, _state) {
  // no-op: cognition-store es la única fuente de verdad.
}

export function addActiveHypothesis(taskRoot, hypothesis, taskId) {
  const tid = resolveTaskId(taskRoot, taskId);
  createHypothesis(taskRoot, tid, {
    statement: hypothesis.statement,
    confidence: hypothesis.confidence ?? 0.5,
  });
}

export function rejectHypothesis(taskRoot, hypothesisId, reason, taskId) {
  const tid = resolveTaskId(taskRoot, taskId);
  updateHypothesisStatus(taskRoot, tid, hypothesisId, HYPOTHESIS_STATUS.REJECTED);
  // reason se preserva como entrada archivada para trazabilidad.
  archiveHypothesis(taskRoot, tid, hypothesisId, reason || "rejected");
}

/**
 * @deprecated Los experimentos se persisten vía cognition-store.createExperiment().
 * Esta función queda como no-op.
 */
export function recordExperiment(_taskRoot, _experiment, _taskId) {
  // no-op
}

/**
 * @deprecated Las observaciones se persisten vía cognition-store.recordObservation().
 * Esta función queda como no-op.
 */
export function recordObservation(_taskRoot, _observation, _taskId) {
  // no-op
}

/**
 * Compact cognitive state for context injection.
 * Drops redundant observations, keeps actionable signal.
 */
export function compactCognitiveState(state, maxBytes = 1500) {
  const compact = {
    activeHypotheses: state.activeHypotheses.slice(0, 3),
    rejectedHypotheses: state.rejectedHypotheses.slice(-3),
    recentExperiments: state.recentExperiments.slice(-3),
    criticalObservations: state.criticalObservations.slice(-3),
  };
  const json = JSON.stringify(compact);
  if (json.length <= maxBytes) return compact;

  // Aggressive truncation: keep only counts
  return {
    activeHypotheses: compact.activeHypotheses.slice(0, 1),
    rejectedHypotheses: compact.rejectedHypotheses.length,
    recentExperiments: compact.recentExperiments.length,
    criticalObservations: compact.criticalObservations.length,
  };
}
