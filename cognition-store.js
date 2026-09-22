/**
 * Cognition Store — persistent runtime support for hypothesis-driven problem solving.
 *
 * Implementa spec: hypothesis-experiment-loop.
 *
 * Almacena hipótesis, experimentos y observaciones como append-only JSONL
 * bajo `.wam/tasks/<taskId>/cognition/`. Permite continuar tras compaction
 * sin re-intentar estrategias fallidas.
 *
 * Source of truth para datos cognitivos del task. Cualquier lectura/escritura
 * de hipótesis, experimentos u observaciones debe pasar por este módulo.
 */

import fs from "node:fs";
import path from "node:path";

const COGNITION_DIR = "cognition";
const FILES = {
  hypotheses: "hypotheses.jsonl",
  experiments: "experiments.jsonl",
  observations: "observations.jsonl",
};

/** U1: never unlink cognition records. Archive via status append. */
export const DELETION_POLICY = "soft-archive";

// -- Status constants (single source of truth) --
// Hypotheses lifecycle: PROPOSED → TESTING → SUPPORTED | REJECTED → ARCHIVED
export const HYPOTHESIS_STATUS = Object.freeze({
  PROPOSED: "PROPOSED",
  TESTING: "TESTING",
  SUPPORTED: "SUPPORTED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
});

// Experiment lifecycle: PROPOSED → COMPLETED | FAILED
export const EXPERIMENT_STATUS = Object.freeze({
  PROPOSED: "PROPOSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

export function migrateLegacyCognition(taskRoot, taskId) {
  const legacyFile = path.join(taskRoot, ".wam", "tasks", taskId, "cognition.json");
  if (!fs.existsSync(legacyFile)) return false;

  const data = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
  const dir = cognitionRoot(taskRoot, taskId);
  ensureDir(dir);

  if (data.hypotheses) {
    data.hypotheses.forEach(h => appendLine(path.join(dir, FILES.hypotheses), h));
  }
  if (data.experiments) {
    data.experiments.forEach(e => appendLine(path.join(dir, FILES.experiments), e));
  }
  if (data.observations) {
    data.observations.forEach(o => appendLine(path.join(dir, FILES.observations), o));
  }

  fs.renameSync(legacyFile, legacyFile + ".migrated");
  return true;
}

export function archiveHypothesis(taskRoot, taskId, hypothesisId, reason = "archived") {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.hypotheses);
  appendLine(file, {
    id: hypothesisId,
    status: HYPOTHESIS_STATUS.ARCHIVED,
    reason,
    archivedAt: Date.now(),
  });
}

export function hasRepetitiveFailure(taskRoot, taskId, { hypothesisId, actionDescription } = {}) {
  const experiments = listExperiments(taskRoot, taskId);
  return experiments.some(
    (e) =>
      e.hypothesisId === hypothesisId &&
      e.actionDescription === actionDescription &&
      (e.status === EXPERIMENT_STATUS.FAILED),
  );
}

function cognitionRoot(taskRoot, taskId) {
  return path.join(taskRoot, ".wam", "tasks", taskId, COGNITION_DIR);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function genId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function appendLine(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const line = JSON.stringify({ ...obj, createdAt: obj.createdAt || Date.now() }) + "\n";
  fs.appendFileSync(filePath, line, "utf-8");
}

function readAll(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const seen = new Map();
  fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .forEach((obj) => { if (obj.id) seen.set(obj.id, obj); });
  return Array.from(seen.values());
}

// -- Hypotheses --

export function createHypothesis(taskRoot, taskId, { statement, confidence = 0.5 }) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.hypotheses);
  const h = {
    id: genId("H"),
    statement,
    confidence,
    status: HYPOTHESIS_STATUS.PROPOSED,
  };
  appendLine(file, h);
  return h;
}

export function listHypotheses(taskRoot, taskId) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.hypotheses);
  return readAll(file);
}

export function updateHypothesisStatus(taskRoot, taskId, id, status) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.hypotheses);
  if (!fs.existsSync(file)) return null;
  const lines = readAll(file);
  const target = lines.find((h) => h.id === id);
  if (!target) return null;
  appendLine(file, { ...target, status, updatedAt: Date.now() });
  return { ...target, status, updatedAt: Date.now() };
}

export function getActiveHypotheses(taskRoot, taskId) {
  return listHypotheses(taskRoot, taskId)
    .filter((h) =>
      h.status === HYPOTHESIS_STATUS.PROPOSED ||
      h.status === HYPOTHESIS_STATUS.TESTING
    );
}

// -- Experiments --

export function createExperiment(taskRoot, taskId, { hypothesisId, actionDescription, risk = "SAFE", reversible = true, expectedObservation }) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.experiments);
  const e = {
    id: genId("E"),
    hypothesisId,
    actionDescription,
    risk,
    reversible,
    expectedObservation,
    status: EXPERIMENT_STATUS.PROPOSED,
  };
  appendLine(file, e);
  return e;
}

export function listExperiments(taskRoot, taskId) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.experiments);
  return readAll(file);
}
export function getExperiment(taskRoot, taskId, id) {
  return listExperiments(taskRoot, taskId).find((e) => e.id === id) || null;
}
export function getHypothesis(taskRoot, taskId, id) {
  return listHypotheses(taskRoot, taskId).find((h) => h.id === id) || null;
}
export function getObservation(taskRoot, taskId, id) {
  return listObservations(taskRoot, taskId).find((o) => o.id === id) || null;
}

export function completeExperiment(taskRoot, taskId, id, { result = "ok" } = {}) {
  return updateExperiment(taskRoot, taskId, id, { status: EXPERIMENT_STATUS.COMPLETED, result });
}

export function failExperiment(taskRoot, taskId, id, reason = "") {
  return updateExperiment(taskRoot, taskId, id, { status: EXPERIMENT_STATUS.FAILED, reason });
}

function updateExperiment(taskRoot, taskId, id, patch) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.experiments);
  if (!fs.existsSync(file)) return null;
  const lines = readAll(file);
  const target = lines.find((e) => e.id === id);
  if (!target) return null;
  appendLine(file, { ...target, ...patch, updatedAt: Date.now() });
  return { ...target, ...patch, updatedAt: Date.now() };
}

export function findRepeatedExperiment(taskRoot, taskId, { hypothesisId, actionDescription }) {
  const all = listExperiments(taskRoot, taskId);
  return all.filter((e) =>
    e.hypothesisId === hypothesisId &&
    e.actionDescription === actionDescription &&
    (e.status === EXPERIMENT_STATUS.COMPLETED || e.status === EXPERIMENT_STATUS.FAILED)
  );
}

// -- Observations --

export function recordObservation(taskRoot, taskId, { experimentId, hypothesisId, result, facts = [], actual, unexpected, provenance }) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.observations);
  const o = { id: genId("O"), experimentId, hypothesisId, result, facts };
  if (actual !== undefined) o.actual = actual;
  if (unexpected !== undefined) o.unexpected = unexpected;
  if (provenance !== undefined) o.provenance = provenance;
  appendLine(file, o);
  return o;
}

export function listObservations(taskRoot, taskId) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.observations);
  return readAll(file);
}

export function getObservationsForExperiment(taskRoot, taskId, experimentId) {
  return listObservations(taskRoot, taskId).filter((o) => o.experimentId === experimentId);
}

// -- Compact state (for context packs) --

export function buildCompactState(taskRoot, taskId) {
  const hypotheses = listHypotheses(taskRoot, taskId);
  return {
    activeHypotheses: hypotheses.filter((h) =>
      h.status === HYPOTHESIS_STATUS.PROPOSED ||
      h.status === HYPOTHESIS_STATUS.TESTING
    ),
    supportedHypotheses: hypotheses.filter((h) => h.status === HYPOTHESIS_STATUS.SUPPORTED),
    rejectedHypotheses: hypotheses.filter((h) => h.status === HYPOTHESIS_STATUS.REJECTED),
    archivedHypotheses: hypotheses.filter((h) => h.status === HYPOTHESIS_STATUS.ARCHIVED),
    recentExperiments: listExperiments(taskRoot, taskId).slice(-5),
    recentObservations: listObservations(taskRoot, taskId).slice(-5),
  };
}
