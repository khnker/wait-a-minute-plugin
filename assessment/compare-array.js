/**
 * Array comparison — element-wise with placeholder tolerance.
 *
 * Rules:
 *   - both empty           → SUPPORTED
 *   - expected empty, actual non-empty → INCONCLUSIVE (allowed extras)
 *   - actual shorter than expected → CONTRADICTED for every missing expected element
 *   - actual longer  than expected → INCONCLUSIVE for extras
 *   - element-wise:
 *       nested array  → recurse
 *       nested object → compareObject
 *       scalar        → compareValues
 */

import { AssessmentResult } from "./assessment-rules.js";
import { compareValues } from "./compare-values.js";
import { compareObject } from "./compare-object.js";

export function compareArray(expected, actual, path = "") {
  const findings = [];

  if (!Array.isArray(expected) || !Array.isArray(actual)) {
    findings.push({
      result: AssessmentResult.INCONCLUSIVE,
      path,
      expected,
      actual,
      reason: "expected/actual is not an array",
    });
    return findings;
  }

  if (expected.length === 0 && actual.length === 0) {
    findings.push({
      result: AssessmentResult.SUPPORTED,
      path,
      expected,
      actual,
      reason: "both arrays empty",
    });
    return findings;
  }

  if (expected.length === 0) {
    findings.push({
      result: AssessmentResult.INCONCLUSIVE,
      path,
      expected,
      actual,
      reason: "expected empty, actual has extras",
    });
    return findings;
  }

  for (let i = 0; i < expected.length; i++) {
    const childPath = `${path}[${i}]`;
    if (i >= actual.length) {
      findings.push({
        result: AssessmentResult.CONTRADICTED,
        path: childPath,
        expected: expected[i],
        actual: undefined,
        reason: "missing array element",
      });
      continue;
    }

    const expEl = expected[i];
    const actEl = actual[i];

    if (Array.isArray(expEl) && Array.isArray(actEl)) {
      findings.push(...compareArray(expEl, actEl, childPath));
    } else if (
      expEl !== null &&
      typeof expEl === "object" &&
      actEl !== null &&
      typeof actEl === "object" &&
      !Array.isArray(actEl)
    ) {
      findings.push(...compareObject(expEl, actEl, childPath));
    } else {
      findings.push(...compareValues(expEl, actEl, childPath));
    }
  }

  for (let i = expected.length; i < actual.length; i++) {
    const childPath = `${path}[${i}]`;
    findings.push({
      result: AssessmentResult.INCONCLUSIVE,
      path: childPath,
      expected: undefined,
      actual: actual[i],
      reason: "extra array element",
    });
  }

  return findings;
}