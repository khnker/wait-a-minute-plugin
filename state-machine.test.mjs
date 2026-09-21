import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveHypothesisStatus,
  shouldReplan,
  shouldNoteContradiction,
  deriveExperimentStatus,
  transitionAfterOutcome,
  SEVERITY,
  HYPOTHESIS_STATUS,
  EXPERIMENT_STATUS,
} from "./state-machine.js";
import { AssessmentResult } from "./assessment-engine.js";

test("deriveHypothesisStatus: SUPPORTED → SUPPORTED, no severity", () => {
  const out = deriveHypothesisStatus({
    result: AssessmentResult.SUPPORTED,
    summary: { contradicted: 0, supported: 1 },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.SUPPORTED);
  assert.equal(out.severity, SEVERITY.NONE);
});

test("deriveHypothesisStatus: CONTRADICTED with contradicted > supported → REJECTED high", () => {
  const out = deriveHypothesisStatus({
    result: AssessmentResult.CONTRADICTED,
    summary: { contradicted: 3, supported: 1 },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.REJECTED);
  assert.equal(out.severity, SEVERITY.HIGH);
});

test("deriveHypothesisStatus: CONTRADICTED with contradicted ≤ supported → TESTING low", () => {
  const out = deriveHypothesisStatus({
    result: AssessmentResult.CONTRADICTED,
    summary: { contradicted: 1, supported: 1 },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.severity, SEVERITY.LOW);
});

test("deriveHypothesisStatus: INCONCLUSIVE → TESTING, no severity", () => {
  const out = deriveHypothesisStatus({
    result: AssessmentResult.INCONCLUSIVE,
    summary: { contradicted: 0, supported: 0 },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.severity, SEVERITY.NONE);
});

test("deriveHypothesisStatus: missing summary defaults to zeroed counts", () => {
  const out = deriveHypothesisStatus({
    result: AssessmentResult.CONTRADICTED,
  });
  // contradicted (0) > supported (0) is false → TESTING low
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.severity, SEVERITY.LOW);
});

test("deriveHypothesisStatus: null assessment → TESTING, no severity", () => {
  const out = deriveHypothesisStatus(null);
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.severity, SEVERITY.NONE);
});

test("shouldReplan: CONTRADICTED + REJECTED → true", () => {
  assert.equal(
    shouldReplan({
      assessment: { result: AssessmentResult.CONTRADICTED },
      hypothesisStatus: HYPOTHESIS_STATUS.REJECTED,
    }),
    true,
  );
});

test("shouldReplan: CONTRADICTED + TESTING → false", () => {
  assert.equal(
    shouldReplan({
      assessment: { result: AssessmentResult.CONTRADICTED },
      hypothesisStatus: HYPOTHESIS_STATUS.TESTING,
    }),
    false,
  );
});

test("shouldReplan: SUPPORTED → false", () => {
  assert.equal(
    shouldReplan({
      assessment: { result: AssessmentResult.SUPPORTED },
      hypothesisStatus: HYPOTHESIS_STATUS.SUPPORTED,
    }),
    false,
  );
});

test("shouldReplan: INCONCLUSIVE → false", () => {
  assert.equal(
    shouldReplan({
      assessment: { result: AssessmentResult.INCONCLUSIVE },
      hypothesisStatus: HYPOTHESIS_STATUS.TESTING,
    }),
    false,
  );
});

test("shouldNoteContradiction: CONTRADICTED + not SUPPORTED → true", () => {
  assert.equal(
    shouldNoteContradiction({
      assessment: { result: AssessmentResult.CONTRADICTED },
      hypothesisStatus: HYPOTHESIS_STATUS.REJECTED,
    }),
    true,
  );
  assert.equal(
    shouldNoteContradiction({
      assessment: { result: AssessmentResult.CONTRADICTED },
      hypothesisStatus: HYPOTHESIS_STATUS.TESTING,
    }),
    true,
  );
});

test("shouldNoteContradiction: SUPPORTED outcome → false", () => {
  assert.equal(
    shouldNoteContradiction({
      assessment: { result: AssessmentResult.SUPPORTED },
      hypothesisStatus: HYPOTHESIS_STATUS.SUPPORTED,
    }),
    false,
  );
});

test("deriveExperimentStatus: failure → FAILED", () => {
  assert.equal(deriveExperimentStatus("failure"), EXPERIMENT_STATUS.FAILED);
});

test("deriveExperimentStatus: success → COMPLETED", () => {
  assert.equal(deriveExperimentStatus("success"), EXPERIMENT_STATUS.COMPLETED);
});

test("deriveExperimentStatus: unknown outcome → COMPLETED (default)", () => {
  assert.equal(deriveExperimentStatus("unknown"), EXPERIMENT_STATUS.COMPLETED);
});

test("transitionAfterOutcome: SUPPORTED — no replan", () => {
  const out = transitionAfterOutcome({
    outcome: "success",
    assessment: { result: AssessmentResult.SUPPORTED, summary: { contradicted: 0, supported: 1 } },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.SUPPORTED);
  assert.equal(out.replan, false);
  assert.equal(out.severity, SEVERITY.NONE);
});

test("transitionAfterOutcome: high-severity contradiction — replan true", () => {
  const out = transitionAfterOutcome({
    outcome: "failure",
    assessment: { result: AssessmentResult.CONTRADICTED, summary: { contradicted: 3, supported: 1 } },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.REJECTED);
  assert.equal(out.replan, true);
  assert.equal(out.severity, SEVERITY.HIGH);
});

test("transitionAfterOutcome: low-severity contradiction — replan false", () => {
  const out = transitionAfterOutcome({
    outcome: "failure",
    assessment: { result: AssessmentResult.CONTRADICTED, summary: { contradicted: 1, supported: 1 } },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.replan, false);
  assert.equal(out.severity, SEVERITY.LOW);
});

test("transitionAfterOutcome: INCONCLUSIVE — no replan", () => {
  const out = transitionAfterOutcome({
    outcome: "success",
    assessment: { result: AssessmentResult.INCONCLUSIVE, summary: {} },
  });
  assert.equal(out.status, HYPOTHESIS_STATUS.TESTING);
  assert.equal(out.replan, false);
  assert.equal(out.severity, SEVERITY.NONE);
});

test("HYPOTHESIS_STATUS and EXPERIMENT_STATUS re-exported from state-machine", () => {
  assert.equal(typeof HYPOTHESIS_STATUS, "object");
  assert.equal(HYPOTHESIS_STATUS.PROPOSED, "PROPOSED");
  assert.equal(typeof EXPERIMENT_STATUS, "object");
  assert.equal(EXPERIMENT_STATUS.FAILED, "FAILED");
});
