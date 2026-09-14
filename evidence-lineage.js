/**
 * WAM Evidence Lineage
 *
 * Formaliza la relación causal:
 * Requirement → Action → Observation → Evidence → Verification
 *
 * Cada evidencia indica:
 * - qué requisito soporta
 * - qué acción la produjo
 * - qué observación supports
 * - qué verification criterion satisface
 *
 * Estados de evidencia:
 * - valid: vigente y satisface el requisito
 * - superseded: hay evidencia más reciente
 * - invalidated: condición de entorno cambió
 * - insufficient: no basta por sí sola
 * - unverified: sin verificación
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

function generateEvidenceId(taskId) {
  const dir = getLineageDir(taskId, process.cwd());
  if (!fs.existsSync(dir)) return "ev-001";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  return `ev-${String(files.length + 1).padStart(3, "0")}`;
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
 * @property {string} runId
 * @property {string} [actionId]
 * @property {string} [observationId]
 * @property {string} content
 * @property {string} type - "test", "output", "verification", "inspection", "manual"
 * @property {string} source - "tool", "user", "system"
 * @property {number} createdAt
 * @property {"valid"|"superseded"|"invalidated"|"insufficient"|"unverified"} status
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

export function createEvidence(taskId, data, root) {
  const state = getTaskState(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);

  const evidenceId = generateEvidenceId(taskId);
  const evidence = {
    id: evidenceId,
    requirementId: data.requirementId,
    runId: data.runId || state.currentRunId || null,
    actionId: data.actionId || null,
    observationId: data.observationId || null,
    content: data.content,
    type: data.type || "verification",
    source: data.source || "tool",
    createdAt: Date.now(),
    status: "unverified",
    verifications: [],
    environment: data.environment || null,
    supersededBy: null,
    invalidationReason: null,
  };

  ensureLineageDir(taskId, root);
  writeEvidenceFile(taskId, evidenceId, evidence, root);

  return evidence;
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
  const allEvidence = getAllEvidence(taskId, root);
  const invalidated = [];

  for (const ev of allEvidence) {
    if (ev.status !== "valid") continue;
    if (!ev.environment) continue;

    if (hasEnvironmentChanged(ev.environment, currentEnvironment)) {
      invalidated.push({
        evidence: ev,
        reason: "Environment changed",
        previousEnvironment: ev.environment,
        currentEnvironment,
      });
    }
  }

  return invalidated;
}

function hasEnvironmentChanged(oldEnv, newEnv) {
  if (!oldEnv || !newEnv) return false;
  if (oldEnv.os !== newEnv.os) return true;
  if (oldEnv.nodeVersion !== newEnv.nodeVersion) return true;
  if (oldEnv.executable !== newEnv.executable) return true;
  if (oldEnv.version !== newEnv.version) return true;
  if (oldEnv.repositoryRevision !== newEnv.repositoryRevision) return true;
  return false;
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

  return {
    taskId,
    phase: state.phase,
    totalRequirements: allRequirements.length,
    satisfiedCount: satisfied.length,
    satisfied: satisfied,
    unsatisfied: allRequirements.filter((r) => !satisfied.includes(r.id)).map((r) => r.id),
    orphanedEvidenceCount: orphaned.length,
    canComplete: satisfied.length === allRequirements.length && orphaned.length === 0,
  };
}

export function getEvidenceSummary(taskId, root) {
  const all = getAllEvidence(taskId, root);
  const byStatus = {
    valid: 0,
    superseded: 0,
    invalidated: 0,
    insufficient: 0,
    unverified: 0,
  };

  for (const ev of all) {
    byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
  }

  return {
    total: all.length,
    byStatus,
    byRequirement: all.reduce((acc, ev) => {
      acc[ev.requirementId] = (acc[ev.requirementId] || 0) + 1;
      return acc;
    }, {}),
  };
}
