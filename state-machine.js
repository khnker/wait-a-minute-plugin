/**
 * State Machine — centralized transitions for hypothesis / experiment /
 * evidence events during the execution loop.
 *
 * Pure functions: given an assessment (and optional supporting context),
 * return the next status and any side-effect descriptors. No I/O.
 *
 * Decouples decision logic from execution-engine.js so status transitions
 * become testable in isolation and reusable across noteSuccess / noteFailure /
 * handleContradiction callers.
 */

import { AssessmentResult } from "./assessment-engine.js";
import { HYPOTHESIS_STATUS, EXPERIMENT_STATUS } from "./cognition-store.js";

export { HYPOTHESIS_STATUS, EXPERIMENT_STATUS };

/**
 * Contradiction severity classification. Higher severity → faster replan.
 */
export const SEVERITY = Object.freeze({
  HIGH: "high",
  LOW: "low",
  NONE: null,
});

/**
 * Derive the next hypothesis status from an assessment verdict.
 * Returns { status, severity } so callers can branch on both.
 *
 * Rules (M2 execution-loop contract):
 *   - SUPPORTED     → SUPPORTED, no severity
 *   - CONTRADICTED  → REJECTED (high) when contradicted > supported; else TESTING (low)
 *   - INCONCLUSIVE  → TESTING, no severity
 *
 * @param {object} assessment - { result, summary: { contradicted, supported } }
 * @returns {{status: string, severity: string|null}}
 */
export function deriveHypothesisStatus(assessment) {
  if (!assessment || typeof assessment !== "object") {
    return { status: HYPOTHESIS_STATUS.TESTING, severity: SEVERITY.NONE };
  }
  if (assessment.result === AssessmentResult.SUPPORTED) {
    return { status: HYPOTHESIS_STATUS.SUPPORTED, severity: SEVERITY.NONE };
  }
  if (assessment.result === AssessmentResult.CONTRADICTED) {
    const { summary = {} } = assessment;
    const contradicted = summary.contradicted || 0;
    const supported = summary.supported || 0;
    if (contradicted > supported && contradicted > 0) {
      return { status: HYPOTHESIS_STATUS.REJECTED, severity: SEVERITY.HIGH };
    }
    return { status: HYPOTHESIS_STATUS.TESTING, severity: SEVERITY.LOW };
  }
  return { status: HYPOTHESIS_STATUS.TESTING, severity: SEVERITY.NONE };
}

/**
 * Decide whether the current outcome should trigger a replan.
 * A replan is warranted when:
 *   - assessment is CONTRADICTED AND
 *   - hypothesis has moved to REJECTED (high severity contradiction), OR
 *   - hypothesis remains TESTING but contradicted (caller may want to re-explore)
 *
 * @param {object} args
 * @param {object} args.assessment
 * @param {string} args.hypothesisStatus
 * @returns {boolean}
 */
export function shouldReplan({ assessment, hypothesisStatus }) {
  if (!assessment || assessment.result !== AssessmentResult.CONTRADICTED) return false;
  if (hypothesisStatus === HYPOTHESIS_STATUS.REJECTED) return true;
  return false;
}

/**
 * Decide whether the contradiction should be noted as a learning event
 * (without forcing a full replan).
 *
 * @param {object} args
 * @param {object} args.assessment
 * @param {string} args.hypothesisStatus
 * @returns {boolean}
 */
export function shouldNoteContradiction({ assessment, hypothesisStatus }) {
  if (!assessment || assessment.result !== AssessmentResult.CONTRADICTED) return false;
  // When REJECTED, the caller may already replan; still useful to note it.
  return hypothesisStatus !== HYPOTHESIS_STATUS.SUPPORTED;
}

/**
 * Pick the experiment terminal status for an outcome.
 *
 * @param {string} outcome - "success" | "failure"
 * @returns {string}
 */
export function deriveExperimentStatus(outcome) {
  return outcome === "failure"
    ? EXPERIMENT_STATUS.FAILED
    : EXPERIMENT_STATUS.COMPLETED;
}

/**
 * Contradiction-handling transition: given a contradicted experiment,
 * compute the next hypothesis status + replan trigger descriptor.
 *
 * @param {object} args
 * @param {string} args.outcome - "success" | "failure" | "contradicted"
 * @param {object} args.assessment
 * @returns {{status: string, replan: boolean, severity: string|null}}
 */
export function transitionAfterOutcome({ outcome, assessment }) {
  const derived = deriveHypothesisStatus(assessment);
  const replan = shouldReplan({
    assessment,
    hypothesisStatus: derived.status,
  });
  return { ...derived, replan };
}
