import { createAssessment as baseCreateAssessment, AssessmentResult } from "./execution-assessment.js";

export { AssessmentResult };

export function createAssessment(expected, actual) {
  return baseCreateAssessment(expected, actual);
}

export function assessObservation(experiment, observation) {
  const expected = experiment.expectedObservation;
  if (!expected || typeof expected !== "object") {
    return {
      result: AssessmentResult.INCONCLUSIVE,
      reasoning: "No expectedObservation defined for this experiment.",
      comparisons: [],
      summary: { supported: 0, contradicted: 0, inconclusive: 0, total: 0 },
      expected,
      actual: observation,
    };
  }
  const actual = observation?.actual || observation;
  return createAssessment(expected, actual);
}
