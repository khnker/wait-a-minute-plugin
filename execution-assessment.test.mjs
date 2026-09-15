/**
 * execution-assessment tests — creates assessments comparing expected vs actual observations.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createAssessment, AssessmentResult } from "./execution-assessment.js";

// -- SUPPORTED cases --

test("SUPPORTED: exact string match", () => {
  const assessment = createAssessment({ status: "ready" }, { status: "ready" });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
  assert.equal(assessment.comparisons[0].status, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: boolean match", () => {
  const assessment = createAssessment({ success: true }, { success: true });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: boolean mismatch is CONTRADICTED", () => {
  const assessment = createAssessment({ success: true }, { success: false });
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
});

test("SUPPORTED: number match", () => {
  const assessment = createAssessment({ count: 5 }, { count: 5 });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: number approximately equal", () => {
  const assessment = createAssessment({ count: 100 }, { count: 105 });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: number significantly different is CONTRADICTED", () => {
  const assessment = createAssessment({ count: 10 }, { count: 99 });
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
});

test("SUPPORTED: partial string containment", () => {
  const assessment = createAssessment({ message: "hello" }, { message: "hello world" });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: array subset", () => {
  const assessment = createAssessment({ items: ["a", "b"] }, { items: ["a", "b", "c"] });
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("SUPPORTED: empty expected and empty actual", () => {
  const assessment = createAssessment({}, {});
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

// -- CONTRADICTED cases --

test("CONTRADICTED: string mismatch", () => {
  const assessment = createAssessment({ status: "ready" }, { status: "failed" });
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
  assert.ok(assessment.reasoning.includes("1 of 1"));
});

test("CONTRADICTED: array with no overlap", () => {
  const assessment = createAssessment({ items: ["a", "b"] }, { items: ["c", "d"] });
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
});

test("CONTRADICTED: mixed partial failures", () => {
  const assessment = createAssessment(
    { status: "ready", count: 5 },
    { status: "failed", count: 5 },
  );
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
  assert.equal(assessment.summary.contradicted, 1);
  assert.equal(assessment.summary.supported, 1);
});

test("CONTRADICTED: missing actual values treated as CONTRADICTED", () => {
  const assessment = createAssessment({ a: 1, b: 2 }, { a: 1 });
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
});

// -- INCONCLUSIVE cases --

test("INCONCLUSIVE: null/undefined expected", () => {
  const assessment = createAssessment({ status: null }, { status: "ready" });
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
});

test("INCONCLUSIVE: actual is 'unknown'", () => {
  const assessment = createAssessment({ status: "ready" }, { status: "unknown" });
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
});

test("INCONCLUSIVE: actual is 'pending'", () => {
  const assessment = createAssessment({ status: "ready" }, { status: "pending" });
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
});

test("INCONCLUSIVE: actual is 'not applicable'", () => {
  const assessment = createAssessment({ status: "ready" }, { status: "not applicable" });
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
});

test("INCONCLUSIVE: mixed supported and inconclusive", () => {
  const assessment = createAssessment(
    { a: "hello", b: "world" },
    { a: "hello", b: "unknown" },
  );
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
  assert.equal(assessment.summary.supported, 1);
  assert.equal(assessment.summary.inconclusive, 1);
});

// -- Assessment structure --

test("assessment has correct structure", () => {
  const assessment = createAssessment({ x: 1 }, { x: 1 });
  assert.ok(assessment.result);
  assert.ok(Array.isArray(assessment.comparisons));
  assert.ok(assessment.summary);
  assert.equal(assessment.summary.total, 1);
  assert.equal(assessment.summary.supported, 1);
  assert.ok(assessment.reasoning);
  assert.ok(typeof assessment.reasoning === "string");
  assert.deepStrictEqual(assessment.expected, { x: 1 });
  assert.deepStrictEqual(assessment.actual, { x: 1 });
});

test("assessment reasoning for SUPPORTED is populated", () => {
  const assessment = createAssessment({ a: 1 }, { a: 1 });
  assert.ok(assessment.reasoning.includes("All"));
});

test("assessment comparisons record each field", () => {
  const assessment = createAssessment(
    { a: 1, b: 2, c: 3 },
    { a: 1, b: 99, c: 3 },
  );
  assert.equal(assessment.comparisons.length, 3);
  assert.equal(assessment.comparisons[0].field, "a");
  assert.equal(assessment.comparisons[1].field, "b");
  assert.equal(assessment.comparisons[1].status, AssessmentResult.CONTRADICTED);
  assert.equal(assessment.comparisons[2].field, "c");
});

test("missing fields in actual are tracked", () => {
  const assessment = createAssessment({ a: 1, b: 2 }, { a: 1 });
  assert.ok(assessment.comparisons[1].actual === undefined);
});

// -- assessObservation via execution-engine --

test("assessObservation with expectedObservation", async () => {
  const { assessObservation } = await import("./execution-engine.js");
  const experiment = {
    expectedObservation: { status: "ready" },
  };
  const observation = { status: "ready" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
});

test("assessObservation without expectedObservation", async () => {
  const { assessObservation } = await import("./execution-engine.js");
  const assessment = assessObservation({}, {});
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
  assert.ok(assessment.reasoning.includes("No expectedObservation"));
});
