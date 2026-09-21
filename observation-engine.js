/**
 * Observation Engine — records raw observations for the hypothesis→experiment loop.
 *
 * Pure extraction of observation persistence from execution-engine.js.
 * Owns: the contract of what an observation IS and how it gets persisted.
 * Does NOT own: assessment, evidence creation, or hypothesis status transitions
 * (those live in evidence-engine.js and state-machine.js).
 *
 * A raw observation captures: what actually happened (actual), anything that
 * diverged from the plan (unexpected), provenance (which experiment), and
 * the assessment result + facts that led to recording it.
 *
 * Source of truth for the observation record shape and JSONL append path.
 */

import {
  recordObservation,
  getExperiment,
} from "./cognition-store.js";
import { AssessmentResult } from "./assessment-engine.js";

/**
 * Build a raw observation payload from inputs (pure, no I/O).
 * @param {object} args
 * @param {string|null} args.experimentId
 * @param {string} args.hypothesisId
 * @param {string} args.result - AssessmentResult enum value
 * @param {string[]} args.facts - List of fact strings (e.g. evidence ids, error messages)
 * @param {*} [args.actual]
 * @param {string[]} [args.unexpected]
 * @param {object} [args.provenance]
 * @returns {object} observation payload
 */
export function buildObservationPayload({
  experimentId,
  hypothesisId,
  result,
  facts,
  actual,
  unexpected,
  provenance,
}) {
  return {
    experimentId: experimentId ?? null,
    hypothesisId,
    result,
    facts: Array.isArray(facts) ? facts : [],
    actual: actual ?? null,
    unexpected: Array.isArray(unexpected) ? unexpected : [],
    provenance: provenance ?? null,
  };
}

/**
 * Resolve the experiment record (if known) for the observation context.
 * Returns null when no experimentId is provided or the experiment cannot be found.
 *
 * @param {string} taskRoot
 * @param {string} taskId
 * @param {object} args
 * @param {string|null} args.experimentId
 * @param {string} args.hypothesisId
 * @returns {object|null}
 */
export function resolveExperimentContext(taskRoot, taskId, { experimentId, hypothesisId }) {
  if (!experimentId) return null;
  const stored = getExperiment(taskRoot, taskId, experimentId);
  return stored ?? { id: experimentId, hypothesisId };
}

/**
 * Default fact-derivation strategy used by noteFailure / noteSuccess.
 * Pure: given inputs, returns facts list. Centralized here so observation
 * contracts stay consistent across callers.
 *
 * @param {object} args
 * @param {string} args.outcome - "success" | "failure"
 * @param {string} [args.reason]
 * @param {*} [args.result]
 * @param {string[]} [args.facts] - pre-built facts (e.g. [evidenceId]); wins if present
 * @returns {string[]}
 */
export function deriveDefaultFacts({ outcome, reason, result, facts }) {
  if (Array.isArray(facts) && facts.length > 0) return facts;
  if (outcome === "failure") return reason ? [reason] : ["failure"];
  if (typeof result === "string") return [result];
  if (result === undefined || result === null) return ["ok"];
  return [JSON.stringify(result)];
}

/**
 * Record a raw observation. Wraps the cognition-store append with the
 * observation-engine contract: payload shape, fact derivation, and
 * experiment-context resolution.
 *
 * @param {string} taskRoot
 * @param {string} taskId
 * @param {object} args - see buildObservationPayload + deriveDefaultFacts
 * @returns {object} persisted observation record
 */
export function recordRawObservation(taskRoot, taskId, args) {
  const experiment = resolveExperimentContext(taskRoot, taskId, args);
  const facts = deriveDefaultFacts(args);
  const payload = buildObservationPayload({ ...args, facts });
  const persisted = recordObservation(taskRoot, taskId, {
    ...payload,
    experimentId: experiment?.id ?? payload.experimentId,
  });
  return { observation: persisted, experiment };
}

export { AssessmentResult };
