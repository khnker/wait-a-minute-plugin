/**
 * Cognition Store — persistent runtime support for hypothesis-driven problem solving.
 *
 * Implementa spec: hypothesis-experiment-loop.
 *
 * Almacena hipótesis, experimentos y observaciones como append-only JSONL
 * bajo `.wam/tasks/<taskId>/cognition/`. Permite continuar tras compaction
 * sin re-intentar estrategias fallidas.
 */

import fs from "node:fs";
import path from "node:path";

const COGNITION_DIR = "cognition";
const FILES = {
  hypotheses: "hypotheses.jsonl",
  experiments: "experiments.jsonl",
  observations: "observations.jsonl",
};

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
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

// -- Hypotheses --

export function createHypothesis(taskRoot, taskId, { statement, confidence = 0.5 }) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.hypotheses);
  const h = {
    id: genId("H"),
    statement,
    confidence,
    status: "proposed",
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
  target.status = status;
  target.updatedAt = Date.now();
  fs.writeFileSync(file, lines.map((h) => JSON.stringify(h)).join("\n") + "\n", "utf-8");
  return target;
}

export function getActiveHypotheses(taskRoot, taskId) {
  return listHypotheses(taskRoot, taskId)
    .filter((h) => h.status === "proposed" || h.status === "testing" || h.status === "supported");
}

// -- Experiments --

export function createExperiment(taskRoot, taskId, { hypothesisId, actionDescription, risk = "SAFE", reversible = true }) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.experiments);
  const e = {
    id: genId("E"),
    hypothesisId,
    actionDescription,
    risk,
    reversible,
    status: "proposed",
  };
  appendLine(file, e);
  return e;
}

export function listExperiments(taskRoot, taskId) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.experiments);
  return readAll(file);
}

export function completeExperiment(taskRoot, taskId, id, { result = "ok" } = {}) {
  return updateExperiment(taskRoot, taskId, id, { status: "completed", result });
}

export function failExperiment(taskRoot, taskId, id, reason = "") {
  return updateExperiment(taskRoot, taskId, id, { status: "failed", reason });
}

function updateExperiment(taskRoot, taskId, id, patch) {
  const file = path.join(cognitionRoot(taskRoot, taskId), FILES.experiments);
  if (!fs.existsSync(file)) return null;
  const lines = readAll(file);
  const target = lines.find((e) => e.id === id);
  if (!target) return null;
  Object.assign(target, patch, { updatedAt: Date.now() });
  fs.writeFileSync(file, lines.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  return target;
}

export function findRepeatedExperiment(taskRoot, taskId, { hypothesisId, actionDescription }) {
  const all = listExperiments(taskRoot, taskId);
  return all.filter((e) =>
    e.hypothesisId === hypothesisId &&
    e.actionDescription === actionDescription &&
    (e.status === "completed" || e.status === "failed")
  );
}

// -- Observations --

export function recordObservation(taskRoot, taskId, {
  experimentId,
  result,
  facts = [],
  unexpected = [],
  source = { type: "runtime", reference: "" },
}) {
  const dir = cognitionRoot(taskRoot, taskId);
  const file = path.join(dir, FILES.observations);
  // Enforce provenance: every observation must have a source.type.
  const provenance = source?.type
    ? source
    : { type: "runtime", reference: "" };
  const o = {
    id: genId("O"),
    experimentId,
    result,
    facts,
    unexpected,
    source: provenance,
    kind: "FACT", // FACT | INTERPRETATION | VERIFIED_EVIDENCE (runtime defaults to FACT)
  };
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

// -- Compact cognitive state for context --

export function buildCompactState(taskRoot, taskId) {
  const hypotheses = listHypotheses(taskRoot, taskId);
  const experiments = listExperiments(taskRoot, taskId);
  const observations = listObservations(taskRoot, taskId);

  return {
    activeHypotheses: hypotheses.filter((h) =>
      h.status === "proposed" || h.status === "testing" || h.status === "supported"
    ),
    supportedHypotheses: hypotheses.filter((h) => h.status === "supported"),
    rejectedHypotheses: hypotheses.filter((h) => h.status === "rejected"),
    recentExperiments: experiments.slice(-5),
    recentObservations: observations.slice(-5),
  };
}
