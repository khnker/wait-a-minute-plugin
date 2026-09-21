/**
 * Evidence Lineage Invalidation
 *
 * Formaliza la relación causal:
 * Requirement → Hypothesis → Experiment → Observation → Evidence
 *
 * Cada evidencia indica:
 * - qué requisito soporta
 * - qué hipótesis la produjo
 * - qué experimento la generó
 * - qué observación la originó
 *
 * Estados de evidencia:
 * - valid: vigente y satisface el requisito
 * - superseded: hay evidencia más reciente
 * - invalidated: condición de entorno cambió
 * - stale: hipótesis rechazada
 * - insufficient: no basta por sí sola
 * - unverified: sin verificación
 * - stale: evidencia dependiente de hipótesis rechazada
 */

import { getRun } from "./task-runs.js";
import { getTaskState } from "./engine.js";

function getLineageDir(taskId, root) {
  return path.join(root || process.cwd(), ".wam", "tasks", taskId, "lineage");
}

function ensureLineageDir(taskId, root) {
  const dir = getLineageDir(taskId, root);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Generate a unique evidence ID.
 * Uses timestamp + random suffix to avoid collisions.
 * Never depends on file count (safe after deletions and concurrent access).
 *
 * @param {string} taskId
 * @param {string} root - Project root (required, not process.cwd())
 * @returns {string} Evidence ID like "ev-1789395644381-a1b2c3d4"
 */
function generateEvidenceId(taskId, root) {
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `ev-${timestamp}-${random}`;
}

function getEvidenceFile(taskId, evidenceId, root) {
  return path.join(getLineageDir(taskId, root), `${evidenceId}.json`);
}

function readEvidenceFile(taskId, evidenceId, root) {
  const file = getEvidenceFile(taskId, evidenceId, root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeEvidenceFile(taskId, evidenceId, data, root) {
  const file = getEvidenceFile(taskId, evidenceId, root);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * @typedef {Object} Evidence
 * @property {string} id
 * @property {string} requirementId
 * @property {string} hypothesisId
 * @property {string} experimentId
 * @property {string} observationId
 * @property {string} content
 * @property {string} type - "test", "output", "verification", "inspection", "manual"
 * @property {string} source - "tool", "user", "system"
 * @property {number} createdAt
 * @property {"valid"|"superseded"|"invalidated"|"insufficient"|"unverified"|"stale"} status
 * @property {Verification[]} [verifications]
 * @property {EnvironmentFingerprint} [environment]
 * @property {string} [supersededBy]
 * @property {string} [invalidationReason]
 */

/**
 * @typedef {Object} Verification
 * @property {string} criterion
 * @property {string} result - "PASS" | "FAIL" | "PARTIAL"
 * @property {number} verifiedAt
 * @property {string} [verifiedBy]
 */

/**
 * @typedef {Object} EnvironmentFingerprint
 * @property {string} os
 * @property {string} nodeVersion
 * @property {string} [executable]
 * @property {string} [version]
 * @property {string} [repositoryRevision]
 */

export function createEvidence(taskId, evidence, root) {
  ensureLineageDir(taskId, root);
  const dir = getLineageDir(taskId, root);
  const id = evidence.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullEvidence = {
    ...evidence,
    id,
    status: evidence.status || "unverified",
    createdAt: evidence.createdAt || new Date().toISOString(),
  };
  writeEvidenceFile(taskId, id, fullEvidence, root);
  return fullEvidence;
}

export function linkEvidenceToRequirement(evidenceId, requirementId, hypothesisId, experimentId, observationId, taskId, root) {
  // Link evidence to the causal chain: Requirement → Hypothesis → Experiment → Observation → Evidence
  if (!taskId) {
    return {
      evidenceId,
      requirementId,
      hypothesisId,
      experimentId,
      observationId,
      chain: ["requirement", "hypothesis", "experiment", "observation", "evidence"],
    };
  }

  const evidence = readEvidenceFile(taskId, evidenceId, root);
  if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);

  evidence.requirementId = requirementId;
  evidence.hypothesisId = hypothesisId;
  evidence.experimentId = experimentId;
  evidence.observationId = observationId;

  writeEvidenceFile(taskId, evidenceId, evidence, root);
  return evidence;
}

export function invalidateDependentEvidence(taskId, hypothesisId, reason, root) {
  const allEvidence = getAllEvidence(taskId, root);
  const dependent = allEvidence.filter(ev => ev.hypothesisId === hypothesisId && ev.status !== "stale");
  for (const ev of dependent) {
    ev.status = "stale";
    ev.invalidationReason = reason;
    writeEvidenceFile(taskId, ev.id, ev, root);
  }
  return dependent;
}

export function getEvidence(taskId, evidenceId, root) {
  return readEvidenceFile(taskId, evidenceId, root);
}

export function getAllEvidence(taskId, root) {
  const dir = getLineageDir(taskId, root);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const evidenceList = [];

  for (const file of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      evidenceList.push(ev);
    } catch {
      // Skip invalid files
    }
  }

  return evidenceList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getEvidenceForRequirement(taskId, requirementId, root) {
  const all = getAllEvidence(taskId, root);
  return all.filter((ev) => ev.requirementId === requirementId);
}

export function getValidEvidence(taskId, requirementId, root) {
  const forReq = getEvidenceForRequirement(taskId, requirementId, root);
  return forReq.filter((ev) => ev.status === "valid");
}

export function verifyEvidence(taskId, evidenceId, criterion, result, root) {
  const evidence = readEvidenceFile(taskId, evidenceId, root);
  if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);
  if (!evidence.verifications) evidence.verifications = [];
  evidence.verifications.push({
    criterion,
    result,
    verifiedAt: Date.now(),
  });
  if (result === "PASS") {
    evidence.status = "valid";
  } else if (result === "PARTIAL") {
    evidence.status = "insufficient";
  }
  writeEvidenceFile(taskId, evidenceId, evidence, root);
  return evidence;
}

export function supersedeEvidence(taskId, evidenceId, newEvidenceId, root) {
  const evidence = readEvidenceFile(taskId, evidenceId, root);
  if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);
  evidence.status = "superseded";
  evidence.supersededBy = newEvidenceId;
  writeEvidenceFile(taskId, evidenceId, evidence, root);
  return evidence;
}

export function invalidateEvidence(taskId, evidenceId, reason, root) {
  const evidence = readEvidenceFile(taskId, evidenceId, root);
  if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);
  evidence.status = "invalidated";
  evidence.invalidationReason = reason;
  writeEvidenceFile(taskId, evidenceId, evidence, root);
  return evidence;
}

export function detectOrphanedEvidence(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  const allEvidence = getAllEvidence(taskId, root);
  const requirementIds = new Set((state.requirements || []).map((r) => r.id));
  return allEvidence.filter((ev) => !requirementIds.has(ev.requirementId));
}

export function detectInvalidatedEvidence(taskId, currentEnvironment, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];
  const allEvidence = getAllEvidence(taskId, root);
  if (!state.currentEnvironment) return [];
  const oldEnv = state.currentEnvironment;
  const newEnv = currentEnvironment;
  if (oldEnv.os !== newEnv.os || oldEnv.nodeVersion !== newEnv.nodeVersion ||
      oldEnv.executable !== newEnv.executable || oldEnv.version !== newEnv.version ||
      (oldEnv.repositoryRevision || "") !== (newEnv.repositoryRevision || "")) {
    return allEvidence.filter((ev) => ev.status === "valid" || ev.status === "superseded");
  }
  return [];
}

export function getLineageForRequirement(taskId, requirementId, root) {
  const evidence = getEvidenceForRequirement(taskId, requirementId, root);

  const lineage = {
    requirement: requirementId,
    evidence: [],
  };

  for (const ev of evidence) {
    const entry = {
      evidence: ev,
      actions: [],
      observations: [],
    };

    if (ev.runId) {
      const run = getRun(taskId, ev.runId, root);
      if (run) {
        const action = (run.actions || []).find((a) => a.id === ev.actionId);
        if (action) entry.actions.push(action);

        const obs = (run.observations || []).find((o) => o.id === ev.observationId);
        if (obs) entry.observations.push(obs);
      }
    }

    lineage.evidence.push(entry);
  }

  return lineage;
}

export function isRequirementSatisfied(taskId, requirementId, root) {
  const validEvidence = getValidEvidence(taskId, requirementId, root);
  return validEvidence.length > 0;
}

export function getSatisfiedRequirements(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];

  const satisfied = [];
  for (const req of state.requirements || []) {
    if (isRequirementSatisfied(taskId, req.id, root)) {
      satisfied.push(req.id);
    }
  }
  return satisfied;
}

export function getUnsatisfiedRequirements(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return [];

  return (state.requirements || []).filter((req) => !isRequirementSatisfied(taskId, req.id, root));
}

export function getCompletionStatus(taskId, root) {
  const state = getTaskState(taskId, root);
  if (!state) return null;
  const allRequirements = state.requirements || [];
  const satisfied = getSatisfiedRequirements(taskId, root);
  const orphaned = detectOrphanedEvidence(taskId, root);
  const unsatisfied = allRequirements.filter((r) => !satisfied.includes(r.id));
  return {
    taskId,
    phase: state.phase,
    totalRequirements: allRequirements.length,
    satisfiedCount: satisfied.length,
    satisfied,
    unsatisfied,
    orphanedEvidence: orphaned,
    canComplete: unsatisfied.length === 0 && orphaned.length === 0,
    timestamp: Date.now(),
  };
}

export function getEvidenceSummary(taskId, root) {
  const evidenceList = getAllEvidence(taskId, root);
  const byStatus = {};
  for (const ev of evidenceList) {
    byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
  }
  const valid = evidenceList.filter((ev) => ev.status === "valid");
  return {
    total: evidenceList.length,
    byStatus: byStatus,
    validCount: valid.length,
    lineageIntegrity: !detectOrphanedEvidence(taskId, root).length,
  };
}



/**
 * Get complete lineage chain for a requirement.
 * Requirement → Hypothesis → Experiment → Observation → Evidence
 *
 * @param {string} requirementIdOrTaskId
 * @param {string} [requirementId]
 * @param {string} [root]
 * @returns {Object} Complete lineage chain
 */
export function getLineage(requirementIdOrTaskId, requirementId, root) {
  // Overload: getLineage(requirementId) for in-memory chain description,
  // or getLineage(taskId, requirementId, root) for persisted lineage.
  if (requirementId === undefined) {
    const reqId = requirementIdOrTaskId;
    return {
      requirementId: reqId,
      chain: ["requirement", "hypothesis", "experiment", "observation", "evidence"],
      hypotheses: [],
      experiments: [],
      observations: [],
      evidence: [],
    };
  }
  const taskId = requirementIdOrTaskId;
  const lineage = getLineageForRequirement(taskId, requirementId, root);
  const evidence = getEvidenceForRequirement(taskId, requirementId, root);
  return {
    requirementId,
    chain: ["requirement", "hypothesis", "experiment", "observation", "evidence"],
    hypotheses: [...new Set(evidence.map((e) => e.hypothesisId).filter(Boolean))],
    experiments: [...new Set(evidence.map((e) => e.experimentId).filter(Boolean))],
    observations: [...new Set(evidence.map((e) => e.observationId).filter(Boolean))],
    evidence,
    ...lineage,
  };
}



/**
 * True when a requirement has any STALE evidence that would block verification.
 */
export function hasStaleEvidence(taskId, requirementId, root) {
  const evidence = getEvidenceForRequirement(taskId, requirementId, root);
  return evidence.some((ev) => ev.status === "stale" || ev.status === "STALE");
}

/**
 * Structural ID enforcement (Completion Integrity / Change 03).
 *
 * Evidence generated from execution (tests, linters, experiments, observations)
 * must carry the full causal chain of identifiers:
 *
 *   requirementId  -> hypothesisId -> experimentId -> observationId
 *
 * This module enforces:
 *  - each ID is a non-empty string
 *  - IDs follow the structural prefixes req- / hyp- / exp- / obs-
 *    (warning only, not rejection)
 *  - execution-produced evidence cannot be marked `valid` until all four
 *    identifiers are present
 *
 * The functions below are pure and side-effect-free.
 */

export const STRUCTURAL_ID_PATTERNS = Object.freeze({
  requirementId: /^req-[a-zA-Z0-9_-]+$/,
  hypothesisId: /^hyp-[a-zA-Z0-9_-]+$/,
  experimentId: /^exp-[a-zA-Z0-9_-]+$/,
  observationId: /^obs-[a-zA-Z0-9_-]+$/,
});

export const REQUIRED_LINEAGE_FIELDS = Object.freeze([
  "requirementId",
  "hypothesisId",
  "experimentId",
  "observationId",
]);

/**
 * Returns the list of lineage fields that are missing or empty on the evidence.
 */
export function findMissingLineageFields(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return [...REQUIRED_LINEAGE_FIELDS];
  }
  return REQUIRED_LINEAGE_FIELDS.filter(
    (field) => typeof evidence[field] !== "string" || evidence[field].trim() === ""
  );
}

/**
 * Validates an evidence object for structural integrity.
 * Returns { valid, missing, warnings }.
 */
export function validateEvidenceStructure(evidence) {
  const missing = findMissingLineageFields(evidence);
  const warnings = [];
  if (evidence && typeof evidence === "object") {
    for (const field of REQUIRED_LINEAGE_FIELDS) {
      const value = evidence[field];
      if (typeof value === "string" && value.trim() !== "") {
        const pattern = STRUCTURAL_ID_PATTERNS[field];
        if (pattern && !pattern.test(value)) {
          warnings.push(`${field} "${value}" does not match expected pattern`);
        }
      }
    }
  }
  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * True iff evidence is structurally complete (all four lineage IDs present).
 */
export function hasCompleteLineage(evidence) {
  return validateEvidenceStructure(evidence).valid;
}

/**
 * Validate a batch of evidence entries (e.g., those attached to a requirement).
 * Returns { complete, incomplete } lists.
 */
export function partitionEvidenceByLineage(evidenceList) {
  const complete = [];
  const incomplete = [];
  if (!Array.isArray(evidenceList)) {
    return { complete, incomplete };
  }
  for (const ev of evidenceList) {
    if (hasCompleteLineage(ev)) complete.push(ev);
    else incomplete.push(ev);
  }
  return { complete, incomplete };
}

/**
 * Decorates an existing evidence object with execution-lineage metadata.
 * Returns a new object (does not mutate). Throws if any required field is
 * missing — callers that want a non-throwing variant should call
 * validateEvidenceStructure first.
 */
export function stampExecutionLineage(evidence, lineage) {
  if (!lineage || typeof lineage !== "object") {
    throw new Error("lineage must be an object with requirementId, hypothesisId, experimentId, observationId");
  }
  const stamped = { ...(evidence || {}) };
  for (const field of REQUIRED_LINEAGE_FIELDS) {
    const value = lineage[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`missing or empty lineage field: ${field}`);
    }
    stamped[field] = value;
  }
  stamped.lineageStampedAt = new Date().toISOString();
  return stamped;
}