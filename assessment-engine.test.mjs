import { test } from "node:test";
import assert from "node:assert/strict";
import { assessObservation, AssessmentResult } from "./assessment-engine.js";

test("AssessmentEngine: assessObservation supports matching actual", () => {
  const experiment = { expectedObservation: { key: "value" } };
  const observation = { key: "value" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("AssessmentEngine: assessObservation contradicts mismatch", () => {
  const experiment = { expectedObservation: { key: "value" } };
  const observation = { key: "other" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
});

test("AssessmentEngine: assessObservation inconclusive if no expected", () => {
  const experiment = {};
  const observation = { key: "value" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
});
