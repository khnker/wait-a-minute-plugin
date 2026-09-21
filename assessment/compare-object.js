/**
 * Object comparison — recurses into nested keys, classifies missing/partial/extra.
 *
 * Findings classification:
 *   - missing key (in expected, not in actual)  → CONTRADICTED
 *   - extra key (in actual, not in expected)    → INCONCLUSIVE (allowed extras)
 *   - nested object → recurse via compareObject
 *   - nested array  → delegate to compareArray
 *   - scalar        → compareValues
 */

import { AssessmentResult } from "./assessment-rules.js";
import { compareValues } from "./compare-values.js";
import { compareArray } from "./compare-array.js";

export function compareObject(expected, actual, path = "") {
  const findings = [];

  if (expected === null || typeof expected !== "object" || Array.isArray(expected)) {
    findings.push({
      result: AssessmentResult.INCONCLUSIVE,
      path,
      expected,
      actual,
      reason: "expected is not an object",
    });
    return findings;
  }

  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    findings.push({
      result: AssessmentResult.CONTRADICTED,
      path,
      expected,
      actual,
      reason: "actual is not an object",
    });
    return findings;
  }

  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);

  for (const key of expectedKeys) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in actual)) {
      findings.push({
        result: AssessmentResult.CONTRADICTED,
        path: childPath,
        expected: expected[key],
        actual: undefined,
        reason: "missing key",
      });
      continue;
    }

    const expVal = expected[key];
    const actVal = actual[key];

    if (Array.isArray(expVal) && Array.isArray(actVal)) {
      findings.push(...compareArray(expVal, actVal, childPath));
    } else if (
      expVal !== null &&
      typeof expVal === "object" &&
      actVal !== null &&
      typeof actVal === "object" &&
      !Array.isArray(actVal)
    ) {
      findings.push(...compareObject(expVal, actVal, childPath));
    } else {
      findings.push(...compareValues(expVal, actVal, childPath));
    }
  }

  for (const key of actualKeys) {
    if (!(key in expected)) {
      const childPath = path ? `${path}.${key}` : key;
      findings.push({
        result: AssessmentResult.INCONCLUSIVE,
        path: childPath,
        expected: undefined,
        actual: actual[key],
        reason: "extra key",
      });
    }
  }

  return findings;
}