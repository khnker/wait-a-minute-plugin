import { AssessmentResult } from "./assessment/assessment-rules.js";
import { compareValues } from "./assessment/compare-values.js";
import { compareObject } from "./assessment/compare-object.js";
import { compareArray } from "./assessment/compare-array.js";

export { AssessmentResult };

/**
 * Produce a structured assessment: { result, summary, findings }
 * - result:    aggregate verdict (worst-case across findings)
 * - summary:   counts of supported / contradicted / inconclusive / total
 * - findings:  per-field comparison details with `path`, `expected`, `actual`, `reason`
 */
export function createAssessment(expected, actual) {
  const findings = compareTopLevel(expected, actual);

  const summary = summarize(findings);
  const result = aggregate(summary);

  return { result, summary, findings, expected, actual };
}

function compareTopLevel(expected, actual) {
  if (expected === undefined || expected === null) {
    return [
      {
        result: AssessmentResult.INCONCLUSIVE,
        path: "",
        expected,
        actual,
        reason: "no expected value provided",
      },
    ];
  }

  if (actual === undefined || actual === null) {
    return [
      {
        result: AssessmentResult.CONTRADICTED,
        path: "",
        expected,
        actual,
        reason: "no actual value provided",
      },
    ];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return compareArray(expected, actual, "");
  }

  if (
    typeof expected === "object" &&
    typeof actual === "object" &&
    !Array.isArray(actual)
  ) {
    return compareObject(expected, actual, "");
  }

  return compareValues(expected, actual, "");
}

function summarize(findings) {
  const summary = { supported: 0, contradicted: 0, inconclusive: 0, total: 0 };
  for (const f of findings) {
    summary.total++;
    if (f.result === AssessmentResult.SUPPORTED) summary.supported++;
    else if (f.result === AssessmentResult.CONTRADICTED) summary.contradicted++;
    else summary.inconclusive++;
  }
  return summary;
}

/**
 * Aggregate verdict: a single CONTRADICTED makes the whole assessment CONTRADICTED;
 * otherwise any INCONCLUSIVE downgrades SUPPORTED to INCONCLUSIVE.
 */
function aggregate(summary) {
  if (summary.contradicted > 0) return AssessmentResult.CONTRADICTED;
  if (summary.inconclusive > 0) return AssessmentResult.INCONCLUSIVE;
  if (summary.supported > 0) return AssessmentResult.SUPPORTED;
  return AssessmentResult.INCONCLUSIVE;
}

export function assessObservation(experiment, observation) {
  const expectedObs = experiment.expectedObservation;
  if (!expectedObs || typeof expectedObs !== "object") {
    return {
      result: AssessmentResult.INCONCLUSIVE,
      summary: { supported: 0, contradicted: 0, inconclusive: 0, total: 0 },
      findings: [],
      reasoning: "No expectedObservation defined for this experiment.",
      expected: expectedObs,
      actual: observation,
    };
  }

  const actual = observation?.actual || observation;
  const target = expectedObs.expected && typeof expectedObs.expected === "object"
    ? expectedObs.expected
    : expectedObs;

  return createAssessment(target, actual);
}