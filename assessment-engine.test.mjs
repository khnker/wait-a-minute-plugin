import { test } from "node:test";
import assert from "node:assert/strict";
import { assessObservation, createAssessment, AssessmentResult } from "./assessment-engine.js";
import { compareValues } from "./assessment/compare-values.js";
import { compareObject } from "./assessment/compare-object.js";
import { compareArray } from "./assessment/compare-array.js";

// ─────────────────────────────────────────────────────────────────────────────
// Existing assessObservation contract (regression coverage)
// ─────────────────────────────────────────────────────────────────────────────

test("AssessmentEngine: assessObservation supports matching actual", () => {
  const experiment = { expectedObservation: { key: "value" } };
  const observation = { key: "value" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.SUPPORTED);
  assert.ok(Array.isArray(assessment.findings));
  assert.ok(assessment.summary);
});

test("AssessmentEngine: assessObservation contradicts mismatch", () => {
  const experiment = { expectedObservation: { key: "value" } };
  const observation = { key: "other" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.CONTRADICTED);
  assert.equal(assessment.summary.contradicted >= 1, true);
});

test("AssessmentEngine: assessObservation inconclusive if no expected", () => {
  const experiment = {};
  const observation = { key: "value" };
  const assessment = assessObservation(experiment, observation);
  assert.equal(assessment.result, AssessmentResult.INCONCLUSIVE);
  assert.equal(assessment.summary.total, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// createAssessment contract — structured { result, summary, findings } shape
// ─────────────────────────────────────────────────────────────────────────────

test("createAssessment: returns { result, summary, findings } shape", () => {
  const a = createAssessment({ a: 1 }, { a: 1 });
  assert.ok("result" in a);
  assert.ok("summary" in a);
  assert.ok("findings" in a);
  assert.deepEqual(Object.keys(a.summary).sort(), [
    "contradicted",
    "inconclusive",
    "supported",
    "total",
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scalar comparison
// ─────────────────────────────────────────────────────────────────────────────

test("compareValues: equal strings are SUPPORTED", () => {
  const findings = compareValues("hello", "hello", "greeting");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].result, AssessmentResult.SUPPORTED);
  assert.equal(findings[0].path, "greeting");
});

test("compareValues: substring containment is SUPPORTED", () => {
  const findings = compareValues("hello", "hello world", "greeting");
  assert.equal(findings[0].result, AssessmentResult.SUPPORTED);
});

test("compareValues: numbers within 10% tolerance are SUPPORTED", () => {
  const findings = compareValues(100, 105, "score");
  assert.equal(findings[0].result, AssessmentResult.SUPPORTED);
});

test("compareValues: numbers outside tolerance are CONTRADICTED", () => {
  const findings = compareValues(100, 200, "score");
  assert.equal(findings[0].result, AssessmentResult.CONTRADICTED);
});

test("compareValues: placeholder actual is INCONCLUSIVE", () => {
  for (const placeholder of ["pending", "unknown", "not applicable"]) {
    const findings = compareValues("expected", placeholder, "field");
    assert.equal(findings[0].result, AssessmentResult.INCONCLUSIVE, placeholder);
  }
});

test("compareValues: missing actual is CONTRADICTED", () => {
  const findings = compareValues("expected", undefined, "field");
  assert.equal(findings[0].result, AssessmentResult.CONTRADICTED);
});

test("compareValues: missing expected is INCONCLUSIVE", () => {
  const findings = compareValues(undefined, "actual", "field");
  assert.equal(findings[0].result, AssessmentResult.INCONCLUSIVE);
});

// ─────────────────────────────────────────────────────────────────────────────
// Object comparison — missing / partial / extra
// ─────────────────────────────────────────────────────────────────────────────

test("compareObject: fully matching objects are SUPPORTED", () => {
  const findings = compareObject({ a: 1, b: "x" }, { a: 1, b: "x" });
  assert.equal(findings.every((f) => f.result === AssessmentResult.SUPPORTED), true);
});

test("compareObject: missing key is CONTRADICTED with path", () => {
  const findings = compareObject({ a: 1, b: 2 }, { a: 1 });
  const missing = findings.find((f) => f.path === "b");
  assert.ok(missing, "missing-key finding must exist");
  assert.equal(missing.result, AssessmentResult.CONTRADICTED);
  assert.equal(missing.reason, "missing key");
});

test("compareObject: extra key is INCONCLUSIVE", () => {
  const findings = compareObject({ a: 1 }, { a: 1, b: "extra" });
  const extra = findings.find((f) => f.path === "b");
  assert.ok(extra, "extra-key finding must exist");
  assert.equal(extra.result, AssessmentResult.INCONCLUSIVE);
  assert.equal(extra.reason, "extra key");
});

test("compareObject: nested mismatch is reported with dotted path", () => {
  const findings = compareObject(
    { user: { name: "alice", age: 30 } },
    { user: { name: "alice", age: 99 } }
  );
  const nested = findings.find((f) => f.path === "user.age");
  assert.ok(nested);
  assert.equal(nested.result, AssessmentResult.CONTRADICTED);
});

test("compareObject: nested objects recurse", () => {
  const findings = compareObject(
    { outer: { inner: { val: "ok" } } },
    { outer: { inner: { val: "ok" } } }
  );
  const deep = findings.find((f) => f.path === "outer.inner.val");
  assert.ok(deep);
  assert.equal(deep.result, AssessmentResult.SUPPORTED);
});

// ─────────────────────────────────────────────────────────────────────────────
// Array comparison
// ─────────────────────────────────────────────────────────────────────────────

test("compareArray: two empty arrays are SUPPORTED", () => {
  const findings = compareArray([], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].result, AssessmentResult.SUPPORTED);
});

test("compareArray: matching elements are SUPPORTED", () => {
  const findings = compareArray([1, 2, 3], [1, 2, 3]);
  assert.equal(findings.every((f) => f.result === AssessmentResult.SUPPORTED), true);
});

test("compareArray: missing elements are CONTRADICTED with index path", () => {
  const findings = compareArray([1, 2, 3], [1, 2]);
  const missing = findings.find((f) => f.path === "[2]");
  assert.ok(missing);
  assert.equal(missing.result, AssessmentResult.CONTRADICTED);
  assert.equal(missing.reason, "missing array element");
});

test("compareArray: extra elements are INCONCLUSIVE", () => {
  const findings = compareArray([1, 2], [1, 2, 3]);
  const extra = findings.find((f) => f.path === "[2]");
  assert.ok(extra);
  assert.equal(extra.result, AssessmentResult.INCONCLUSIVE);
  assert.equal(extra.reason, "extra array element");
});

test("compareArray: array of objects recurses", () => {
  const findings = compareArray(
    [{ id: 1 }, { id: 2 }],
    [{ id: 1 }, { id: 99 }]
  );
  const wrong = findings.find((f) => f.path === "[1].id");
  assert.ok(wrong);
  assert.equal(wrong.result, AssessmentResult.CONTRADICTED);
});

test("compareArray: non-array inputs yield INCONCLUSIVE", () => {
  const findings = compareArray("not-array", "not-array");
  assert.equal(findings[0].result, AssessmentResult.INCONCLUSIVE);
});

// ─────────────────────────────────────────────────────────────────────────────
// Chromium / standard test cases — representative real-world shapes
// ─────────────────────────────────────────────────────────────────────────────

test("Chromium-style: browser fingerprint object", () => {
  // Simulated Chromium UA + viewport snapshot
  const expected = {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome",
    viewport: { width: 1280, height: 720 },
    features: ["webgl", "webrtc", "wasm"],
  };
  const actual = {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome",
    viewport: { width: 1280, height: 720 },
    features: ["webgl", "webrtc", "wasm", "sharedArrayBuffer"], // extra
    colorDepth: 24, // extra
  };
  const a = createAssessment(expected, actual);
  assert.equal(a.result, AssessmentResult.INCONCLUSIVE);
  assert.equal(a.summary.supported >= 5, true); // nested keys + array elements
  assert.equal(a.summary.contradicted, 0);
  assert.equal(a.summary.inconclusive >= 2, true); // extra array element + extra key
});

test("Standard case: empty actual against populated expected is CONTRADICTED", () => {
  const a = createAssessment({ a: 1, b: 2 }, {});
  assert.equal(a.result, AssessmentResult.CONTRADICTED);
  assert.equal(a.summary.contradicted, 2);
});

test("Standard case: missing expected yields INCONCLUSIVE", () => {
  const a = createAssessment(undefined, { a: 1 });
  assert.equal(a.result, AssessmentResult.INCONCLUSIVE);
});

test("Standard case: numeric tolerance works on Chromium score field", () => {
  // 95 within 10% of 100 → SUPPORTED
  const a = createAssessment({ score: 100 }, { score: 95 });
  assert.equal(a.result, AssessmentResult.SUPPORTED);
});

test("Aggregate rule: single CONTRADICTED makes whole result CONTRADICTED", () => {
  // a matches, b doesn't → overall CONTRADICTED
  const a = createAssessment({ a: "ok", b: "ok" }, { a: "ok", b: "WRONG" });
  assert.equal(a.result, AssessmentResult.CONTRADICTED);
  assert.equal(a.summary.supported >= 1, true);
  assert.equal(a.summary.contradicted >= 1, true);
});

test("Aggregate rule: SUPPORTED + extras (INCONCLUSIVE) yields INCONCLUSIVE", () => {
  const a = createAssessment({ x: 1 }, { x: 1, y: 2 });
  assert.equal(a.result, AssessmentResult.INCONCLUSIVE);
});

test("Findings expose path, expected, actual, reason for every entry", () => {
  const findings = compareObject(
    { a: 1, b: 2 },
    { a: 1, b: 99, c: 3 }
  );
  for (const f of findings) {
    assert.ok("result" in f);
    assert.ok("path" in f);
    assert.ok("expected" in f);
    assert.ok("actual" in f);
    assert.ok("reason" in f);
  }
});