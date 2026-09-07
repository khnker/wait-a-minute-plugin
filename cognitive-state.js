
import fs from "node:fs";
import path from "node:path";

/**
 * Cognitive State persistence — autoload/autosave for hypotheses,
 * rejected approaches, experiments and critical observations.
 */

const COGNITION_FILE = ".wam/task/cognition.json";

const DEFAULT_STATE = {
  activeHypotheses: [],
  rejectedHypotheses: [],
  recentExperiments: [],
  criticalObservations: [],
  lastUpdated: null,
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function loadCognitiveState(taskRoot) {
  const filePath = path.join(taskRoot, COGNITION_FILE);
  if (!fs.existsSync(filePath)) return { ...DEFAULT_STATE };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return { ...DEFAULT_STATE, ...data };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveCognitiveState(taskRoot, state) {
  const filePath = path.join(taskRoot, COGNITION_FILE);
  ensureDir(filePath);
  const payload = { ...state, lastUpdated: Date.now() };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

export function addActiveHypothesis(taskRoot, hypothesis) {
  const state = loadCognitiveState(taskRoot);
  state.activeHypotheses.push(hypothesis);
  saveCognitiveState(taskRoot, state);
}

export function rejectHypothesis(taskRoot, hypothesisId, reason) {
  const state = loadCognitiveState(taskRoot);
  const idx = state.activeHypotheses.findIndex((h) => h.id === hypothesisId);
  if (idx === -1) return;
  const [h] = state.activeHypotheses.splice(idx, 1);
  state.rejectedHypotheses.push({ ...h, reason, rejectedAt: Date.now() });
  saveCognitiveState(taskRoot, state);
}

export function recordExperiment(taskRoot, experiment) {
  const state = loadCognitiveState(taskRoot);
  state.recentExperiments.push(experiment);
  if (state.recentExperiments.length > 10) {
    state.recentExperiments = state.recentExperiments.slice(-10);
  }
  saveCognitiveState(taskRoot, state);
}

export function recordObservation(taskRoot, observation) {
  const state = loadCognitiveState(taskRoot);
  if (observation.relevance === "high") {
    state.criticalObservations.push(observation);
  }
  saveCognitiveState(taskRoot, state);
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
