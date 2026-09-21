/**
 * Assessment rules — shared classification primitives.
 * Single source of truth for SUPPORTED / INCONCLUSIVE / CONTRADICTED verdicts.
 */

export const AssessmentResult = {
  SUPPORTED: "SUPPORTED",
  INCONCLUSIVE: "INCONCLUSIVE",
  CONTRADICTED: "CONTRADICTED",
};

export function isMissing(value) {
  return value === undefined || value === null;
}

export function classifyScalar(expected, actual) {
  if (isMissing(expected) || isMissing(actual)) {
    return AssessmentResult.INCONCLUSIVE;
  }

  if (expected === actual) {
    return AssessmentResult.SUPPORTED;
  }

  const tExp = typeof expected;
  const tAct = typeof actual;

  if (tExp !== tAct) {
    return AssessmentResult.CONTRADICTED;
  }

  if (tExp === "boolean") {
    return AssessmentResult.CONTRADICTED;
  }

  if (tExp === "number") {
    const tolerance = Math.abs(expected) * 0.1 + 0.01;
    return Math.abs(expected - actual) <= tolerance
      ? AssessmentResult.SUPPORTED
      : AssessmentResult.CONTRADICTED;
  }

  if (tExp === "string") {
    const placeholderValues = new Set(["pending", "unknown", "not applicable"]);
    if (placeholderValues.has(actual)) {
      return AssessmentResult.INCONCLUSIVE;
    }
    if (actual.includes(expected) || expected.includes(actual)) {
      return AssessmentResult.SUPPORTED;
    }
    return AssessmentResult.CONTRADICTED;
  }

  return AssessmentResult.CONTRADICTED;
}