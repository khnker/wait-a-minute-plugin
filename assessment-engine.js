import { createAssessment as baseCreateAssessment, AssessmentResult } from "./execution-assessment.js";

export { AssessmentResult };

export function createAssessment(expected, actual) {
  return baseCreateAssessment(expected, actual);
}

export function assessObservation(experiment, observation) {
  const expectedObs = experiment.expectedObservation;
  if (!expectedObs || typeof expectedObs !== "object") {
    return {
      result: AssessmentResult.INCONCLUSIVE,
      reasoning: "No expectedObservation defined for this experiment.",
      comparisons: [],
      summary: { supported: 0, contradicted: 0, inconclusive: 0, total: 0 },
      expected: expectedObs,
      actual: observation,
    };
  }

  const actual = observation?.actual || observation;

  if (expectedObs.expected && typeof expectedObs.expected === "object") {
    return createAssessment(expectedObs.expected, actual);
  }

  return createAssessment(expectedObs, actual);
}
