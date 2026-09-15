/**
 * Observation assessment — compares expected vs actual observations.
 * Returns: SUPPORTED | INCONCLUSIVE | CONTRADICTED
 */

export const AssessmentResult = {
  SUPPORTED: "SUPPORTED",
  INCONCLUSIVE: "INCONCLUSIVE",
  CONTRADICTED: "CONTRADICTED",
};

function classifyComparison(expected, actual) {
  if (expected === actual) {
    return "SUPPORTED";
  }

  if (expected === undefined || expected === null || actual === undefined || actual === null) {
    return "INCONCLUSIVE";
  }

  if (typeof expected === "boolean" && typeof actual === "boolean") {
    return expected === actual ? "SUPPORTED" : "CONTRADICTED";
  }

  if (typeof expected === "number" && typeof actual === "number") {
    if (expected === actual) return "SUPPORTED";
    if (Math.abs(expected - actual) <= (Math.abs(expected) * 0.1 + 0.01)) return "SUPPORTED";
    return "CONTRADICTED";
  }

  if (typeof expected === "string" && typeof actual === "string") {
    if (expected === actual) return "SUPPORTED";
    if (actual.includes(expected) || expected.includes(actual)) return "SUPPORTED";
    if (actual === "pending" || actual === "unknown" || actual === "not applicable") {
      return "INCONCLUSIVE";
    }
    return "CONTRADICTED";
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length === 0 && actual.length === 0) return "SUPPORTED";
    if (expected.length === 0) return "INCONCLUSIVE";
    const allPresent = expected.every((e) => actual.includes(e));
    const anyPresent = expected.some((e) => actual.includes(e));
    if (allPresent) return "SUPPORTED";
    if (anyPresent) return "INCONCLUSIVE";
    return "CONTRADICTED";
  }

  if (typeof expected === "object" && typeof actual === "object" && expected !== null && actual !== null) {
    return "INCONCLUSIVE";
  }

  if (actual === "pending" || actual === "unknown" || actual === "not applicable") {
    return "INCONCLUSIVE";
  }

  return "CONTRADICTED";
}

export function createAssessment(expected, actual) {
  const comparisons = [];
  let supported = 0;
  let contradicted = 0;
  let inconclusive = 0;

  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual || {});

  for (const key of expectedKeys) {
    const expectedValue = expected[key];
    const actualValue = actualKeys.includes(key) ? actual[key] : undefined;
    const status = classifyComparison(expectedValue, actualValue);

    comparisons.push({
      field: key,
      expected: expectedValue,
      actual: actualValue,
      status,
    });

    if (status === "SUPPORTED") supported++;
    else if (status === "CONTRADICTED") contradicted++;
    else inconclusive++;
  }

  const missingFields = expectedKeys.filter((k) => !actualKeys.includes(k));

  // Missing fields count as contradicted
  for (const field of missingFields) {
    comparisons.push({
      field,
      expected: expected[field],
      actual: undefined,
      status: "CONTRADICTED",
    });
    contradicted++;
  }

  let result;
  if (contradicted > 0) {
    result = "CONTRADICTED";
  } else if (inconclusive > 0 || (supported === 0 && expectedKeys.length > 0)) {
    result = "INCONCLUSIVE";
  } else {
    result = "SUPPORTED";
  }

  const reasoning = generateReasoning(result, comparisons, missingFields);

  return {
    result,
    reasoning,
    comparisons,
    summary: { supported, contradicted, inconclusive, total: expectedKeys.length },
    expected,
    actual,
  };
}

function generateReasoning(result, comparisons, missingFields) {
  const parts = [];

  if (result === "SUPPORTED") {
    parts.push(`All ${comparisons.length} expected fields match observations.`);
  } else if (result === "CONTRADICTED") {
    const conflicts = comparisons.filter((c) => c.status === "CONTRADICTED");
    parts.push(
      `${conflicts.length} of ${comparisons.length} expected fields conflict with observations: ${conflicts.map((c) => c.field).join(", ")}.`
    );
  } else {
    if (missingFields.length > 0) {
      parts.push(`Missing data for: ${missingFields.join(", ")}. `);
    }
    const unclear = comparisons.filter((c) => c.status === "INCONCLUSIVE");
    parts.push(
      `${unclear.length} of ${comparisons.length} fields are inconclusive: ${unclear.map((c) => c.field).join(", ")}.`
    );
  }

  return parts.join(" ");
}
