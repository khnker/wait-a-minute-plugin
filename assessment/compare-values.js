/**
 * Scalar comparison — atomic value vs atomic value.
 * Produces a finding: { result, path, expected, actual }
 */

import { AssessmentResult, classifyScalar, isMissing } from "./assessment-rules.js";

export function compareValues(expected, actual, path = "") {
  if (isMissing(expected)) {
    return [
      {
        result: AssessmentResult.INCONCLUSIVE,
        path,
        expected,
        actual,
        reason: "expected value missing",
      },
    ];
  }

  if (isMissing(actual)) {
    return [
      {
        result: AssessmentResult.CONTRADICTED,
        path,
        expected,
        actual,
        reason: "actual value missing",
      },
    ];
  }

  return [
    {
      result: classifyScalar(expected, actual),
      path,
      expected,
      actual,
      reason: null,
    },
  ];
}