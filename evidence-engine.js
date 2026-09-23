/**
 * Evidence Engine — produces validated evidence from observation + assessment.
 *
 * Decoupled from execution-engine: builds evidence records via the
 * evidence-lineage store, then routes them to the lineage graph when
 * the observation carries a requirement binding.
 *
 * Evidence is what proves a hypothesis. An evidence record must:
 *   1. Be created from a concrete observation (or explicit content).
 *   2. Carry provenance (hypothesisId, source).
 *   3. Optionally link to a requirement when the execution was targeted.
 *
 * Does NOT own: hypothesis status transitions (state-machine.js) or
 * observation persistence (observation-engine.js).
 */

import { createEvidence, linkEvidenceToRequirement } from "./evidence-lineage.js";

/**
 * Default evidence type for execution-engine outputs.
 */
export const EVIDENCE_TYPE_TOOL_OUTPUT = "TOOL_OUTPUT";
export const EVIDENCE_SOURCE_EXECUTION = "execution-engine";

/**
 * Pure content serializer — turns a tool result into a stable string content.
 * Centralized so evidence content shape stays consistent.
 *
 * @param {*} result
 * @returns {string}
 */
export function serializeEvidenceContent(result) {
  if (result === undefined || result === null) return "ok";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * Resolve a requirementId from a possibly-incomplete requirement object
 * or a pre-resolved id. Returns the id only when it is a non-empty string;
 * otherwise returns undefined (evidence stays unbound).
 *
 * @param {object} [args]
 * @param {object} [args.requirement] - requirement object; may be incomplete
 * @param {string} [args.requirementId] - pre-resolved id (may be undefined)
 * @returns {string|undefined}
 */
export function resolveRequirementId({ requirement, requirementId } = {}) {
  if (requirement && typeof requirement === "object" && typeof requirement.id === "string" && requirement.id.length > 0) {
    return requirement.id;
  }
  if (typeof requirementId === "string" && requirementId.length > 0) {
    return requirementId;
  }
  return undefined;
}

/**
 * Build the evidence payload from a successful observation.
 * Pure: no I/O, no lineage graph mutation.
 *
 * @param {object} args
 * @param {string} [args.requirementId] - pre-resolved id; ignored if invalid
 * @param {object} [args.requirement] - requirement object; only used when .id is a non-empty string
 * @param {*} args.result - tool output (string|object|primitive)
 * @param {string} [args.type] - evidence type (default TOOL_OUTPUT)
 * @param {string} [args.source] - source identifier (default execution-engine)
 * @param {string} args.hypothesisId
 * @returns {object} payload ready for createEvidence
 */
export function buildEvidencePayload({
  requirement,
  requirementId,
  result,
  type = EVIDENCE_TYPE_TOOL_OUTPUT,
  source = EVIDENCE_SOURCE_EXECUTION,
  hypothesisId,
}) {
  const resolvedId = resolveRequirementId({ requirement, requirementId });
  return {
    requirementId: resolvedId,
    content: serializeEvidenceContent(result),
    type,
    source,
    hypothesisId,
  };
}

/**
 * Create evidence from a successful tool observation.
 * Pure wrapper around evidence-lineage: returns the evidence record.
 *
 * @param {string} taskId
 * @param {object} payload - see buildEvidencePayload
 * @param {string} root
 * @returns {object} created evidence record
 */
export function createExecutionEvidence(taskId, payload, root) {
  return createEvidence(taskId, payload, root);
}

/**
 * Link evidence into the lineage graph once the observation has been recorded.
 * Requires both observationId and requirementId; otherwise this is a no-op
 * (unbound evidence — the hypothesis chain still references it via facts).
 *
 * @param {object} args
 * @param {string} args.evidenceId
 * @param {string} args.requirementId
 * @param {string} args.hypothesisId
 * @param {string|null} args.experimentId
 * @param {string|null} args.observationId
 * @param {string} args.taskId
 * @param {string} args.taskRoot
 * @returns {boolean} true when the lineage was linked; false when skipped.
 */
export function linkEvidenceIfBound({
  evidenceId,
  requirementId,
  hypothesisId,
  experimentId,
  observationId,
  taskId,
  taskRoot,
}) {
  if (!evidenceId || !requirementId || !observationId) return false;
  linkEvidenceToRequirement(
    evidenceId,
    requirementId,
    hypothesisId,
    experimentId ?? null,
    observationId,
    taskId,
    taskRoot,
  );
  return true;
}

/**
 * Full success-path: build → create → (later) link.
 * Returns the evidence record so the caller can carry its id into the
 * observation's facts list.
 *
 * Safely resolves requirement binding: when args.requirement is incomplete
 * or args.requirementId is not a non-empty string, the produced evidence
 * stays unbound (no requirement.id access, no lineage link).
 *
 * @param {string} taskId
 * @param {string} taskRoot
 * @param {object} args - see buildEvidencePayload
 * @returns {{evidence: object, payload: object}}
 */
export function produceExecutionEvidence(taskId, taskRoot, args) {
  const payload = buildEvidencePayload(args);
  const evidence = createExecutionEvidence(taskId, payload, taskRoot);
  return { evidence, payload };
}
