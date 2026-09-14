/**
 * Observation Provenance — unified observation format with provenance tracking.
 *
 * Unifies observation format across task-runs, cognitive-state, and cognition-store.
 * Adds provenance tracking with source, confidence, and session binding.
 *
 * Provenance types:
 *   - user_decided: explicitly decided by user (highest confidence)
 *   - observed: directly observed from execution (medium confidence)
 *   - inferred: inferred from other observations (lower confidence)
 */

import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {"user_decided" | "observed" | "inferred"} ProvenanceType
 */

/**
 * @typedef {Object} Provenance
 * @property {ProvenanceType} source - How this observation was obtained
 * @property {number} confidence - 0-1 confidence level
 * @property {string} sessionId - Session that created this observation
 * @property {string} taskId - Task this observation belongs to
 * @property {string} parentId - Parent observation (for inferred chains)
 */

/**
 * @typedef {Object} Observation
 * @property {string} id
 * @property {string} text
 * @property {number} timestamp
 * @property {Provenance} provenance
 */

/** Default confidence by provenance type */
const DEFAULT_CONFIDENCE = {
  user_decided: 1.0,
  observed: 0.8,
  inferred: 0.5,
};

/** Valid provenance types */
const VALID_PROVENANCE = new Set(["user_decided", "observed", "inferred"]);

/**
 * Create a new observation with provenance.
 *
 * @param {string} text - Observation text
 * @param {ProvenanceType} source - Provenance type
 * @param {Object} options - Additional options
 * @returns {Observation}
 */
export function createObservation(text, source = "observed", options = {}) {
  const provenanceType = VALID_PROVENANCE.has(source) ? source : "observed";

  return {
    id: options.id || `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    timestamp: options.timestamp || Date.now(),
    provenance: {
      source: provenanceType,
      confidence: options.confidence ?? DEFAULT_CONFIDENCE[provenanceType],
      sessionId: options.sessionId || null,
      taskId: options.taskId || null,
      parentId: options.parentId || null,
    },
  };
}

/**
 * Validate observation provenance.
 *
 * @param {Observation} observation
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateObservation(observation) {
  const errors = [];

  if (!observation.id) {
    errors.push("Missing observation id");
  }

  if (!observation.text || typeof observation.text !== "string") {
    errors.push("Missing or invalid observation text");
  }

  if (typeof observation.timestamp !== "number") {
    errors.push("Missing or invalid timestamp");
  }

  if (!observation.provenance) {
    errors.push("Missing provenance");
  } else {
    if (!VALID_PROVENANCE.has(observation.provenance.source)) {
      errors.push(`Invalid provenance source: ${observation.provenance.source}`);
    }

    if (
      typeof observation.provenance.confidence !== "number" ||
      observation.provenance.confidence < 0 ||
      observation.provenance.confidence > 1
    ) {
      errors.push(`Invalid confidence: ${observation.provenance.confidence}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if an observation can be promoted to a higher level.
 *
 * @param {Observation} observation
 * @param {string} targetLevel - Target level (L1, L2, L3, L4)
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canPromoteObservation(observation, targetLevel) {
  if (!observation.provenance) {
    return { allowed: false, reason: "Missing provenance" };
  }

  const { source, confidence } = observation.provenance;

  // Inferred observations cannot promote to L1
  if (source === "inferred" && targetLevel === "L1") {
    return {
      allowed: false,
      reason: "Inferred observations cannot promote to L1 (user_decided required)",
    };
  }

  // Low confidence observations cannot promote to L1
  if (confidence < 0.6 && targetLevel === "L1") {
    return {
      allowed: false,
      reason: `Confidence ${confidence} too low for L1 promotion (requires >= 0.6)`,
    };
  }

  // Observed observations can promote to L2-L4
  if (source === "observed" && confidence >= 0.6) {
    return { allowed: true, reason: "Observed with sufficient confidence" };
  }

  // User decided can promote anywhere
  if (source === "user_decided") {
    return { allowed: true, reason: "User decided observations can promote anywhere" };
  }

  return { allowed: false, reason: "Insufficient provenance for promotion" };
}

/**
 * Create a derived observation from an existing one.
 * Preserves the observation chain for auditability.
 *
 * @param {Observation} parent - Parent observation
 * @param {string} text - Derived observation text
 * @param {ProvenanceType} source - How this was derived
 * @returns {Observation}
 */
export function deriveObservation(parent, text, source = "inferred") {
  return createObservation(text, source, {
    sessionId: parent.provenance.sessionId,
    taskId: parent.provenance.taskId,
    parentId: parent.id,
    confidence: Math.min(parent.provenance.confidence, DEFAULT_CONFIDENCE[source]),
  });
}

/**
 * Load observations from a JSONL file.
 *
 * @param {string} filePath
 * @returns {Observation[]}
 */
export function loadObservations(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const observations = [];

    for (const line of lines) {
      try {
        const obs = JSON.parse(line);
        if (obs.provenance) {
          observations.push(obs);
        }
      } catch {}
    }

    return observations;
  } catch {
    return [];
  }
}

/**
 * Save observations to a JSONL file.
 *
 * @param {string} filePath
 * @param {Observation[]} observations
 */
export function saveObservations(filePath, observations) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = observations.map((obs) => JSON.stringify(obs)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Append an observation to a JSONL file.
 *
 * @param {string} filePath
 * @param {Observation} observation
 */
export function appendObservation(filePath, observation) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  fs.appendFileSync(filePath, JSON.stringify(observation) + "\n", "utf-8");
}

/**
 * Get provenance summary for a set of observations.
 *
 * @param {Observation[]} observations
 * @returns {Object} Summary statistics
 */
export function getProvenanceSummary(observations) {
  const bySource = {
    user_decided: 0,
    observed: 0,
    inferred: 0,
  };

  let totalConfidence = 0;

  for (const obs of observations) {
    if (obs.provenance) {
      bySource[obs.provenance.source] = (bySource[obs.provenance.source] || 0) + 1;
      totalConfidence += obs.provenance.confidence;
    }
  }

  const total = observations.length;
  const avgConfidence = total > 0 ? totalConfidence / total : 0;

  return {
    total,
    bySource,
    avgConfidence,
    highConfidence: observations.filter((o) => o.provenance?.confidence >= 0.8).length,
    lowConfidence: observations.filter((o) => o.provenance?.confidence < 0.5).length,
  };
}

export { VALID_PROVENANCE, DEFAULT_CONFIDENCE };
