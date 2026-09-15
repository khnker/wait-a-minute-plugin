import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createActionResult,
  createObservation,
  evaluateObservationAgainst,
  verifyTask,
  demoCommandSucceedsNotRequirementSatisfied,
  demoToolOutputExistsNotRequirementVerified,
} from "./action-evaluation.js";

// -- ActionResult tests --

describe("createActionResult", () => {
  it("creates result with all fields", () => {
    const result = createActionResult({
      actionId: "act-1",
      success: true,
      exitCode: 0,
      output: "done",
      durationMs: 100,
    });
    assert.equal(result.actionId, "act-1");
    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "done");
    assert.equal(result.durationMs, 100);
    assert.ok(result.timestamp > 0);
  });

  it("defaults timestamp to Date.now()", () => {
    const before = Date.now();
    const result = createActionResult({
      actionId: "act-2",
      success: false,
      exitCode: 1,
      output: "",
      durationMs: 0,
    });
    const after = Date.now();
    assert.ok(result.timestamp >= before && result.timestamp <= after);
  });
});

// -- Observation tests --

describe("createObservation", () => {
  it("creates observation with required fields", () => {
    const obs = createObservation({
      actionId: "act-1",
      requirementId: "req-1",
      observation: "something happened",
    });
    assert.ok(obs.id.startsWith("obs-act-1-"));
    assert.equal(obs.actionId, "act-1");
    assert.equal(obs.requirementId, "req-1");
    assert.equal(obs.observation, "something happened");
    assert.equal(obs.relevance, "direct");
    assert.ok(obs.timestamp > 0);
  });

  it("accepts custom relevance", () => {
    const obs = createObservation({
      actionId: "act-1",
      requirementId: "req-1",
      observation: "derived thing",
      relevance: "inferred",
    });
    assert.equal(obs.relevance, "inferred");
  });
});

// -- Requirement evaluation tests --

describe("evaluateObservationAgainst", () => {
  it("returns unknown evaluation by default", () => {
    const observation = createObservation({
      actionId: "act-1",
      requirementId: "req-1",
      observation: "test",
    });
    const requirement = { id: "req-1", description: "test req" };
    const result = evaluateObservationAgainst(observation, requirement);
    assert.equal(result.evaluation, "unknown");
    assert.equal(result.reason, "");
    assert.equal(result.requirementId, "req-1");
    assert.equal(result.observationId, observation.id);
    assert.ok(result.timestamp > 0);
  });
});

// -- Task verification tests --

describe("verifyTask", () => {
  it("verified when all evaluations support", () => {
    const evals = [
      {
        requirementId: "r1",
        observationId: "o1",
        evaluation: "supports",
        reason: "ok",
        timestamp: Date.now(),
      },
      {
        requirementId: "r2",
        observationId: "o2",
        evaluation: "supports",
        reason: "ok",
        timestamp: Date.now(),
      },
    ];
    const result = verifyTask({ taskId: "t1", evaluations: evals, summary: "all good" });
    assert.equal(result.verified, true);
    assert.equal(result.evaluations.length, 2);
    assert.ok(result.timestamp > 0);
  });

  it("not verified when any evaluation is not supports", () => {
    const evals = [
      {
        requirementId: "r1",
        observationId: "o1",
        evaluation: "supports",
        reason: "ok",
        timestamp: Date.now(),
      },
      {
        requirementId: "r2",
        observationId: "o2",
        evaluation: "unknown",
        reason: "unclear",
        timestamp: Date.now(),
      },
    ];
    const result = verifyTask({ taskId: "t2", evaluations: evals, summary: "partial" });
    assert.equal(result.verified, false);
  });

  it("not verified when no evaluations", () => {
    const result = verifyTask({ taskId: "t3", evaluations: [], summary: "empty" });
    assert.equal(result.verified, false);
  });
});

// -- Classic bug demos --

describe("BUG DEMOS — action ≠ requirement", () => {
  describe("demoCommandSucceedsNotRequirementSatisfied", () => {
    it("command exits 0 but requirement evaluation is unknown", () => {
      const { actionResult, observation, requirement, evaluation } =
        demoCommandSucceedsNotRequirementSatisfied();

      // Action succeeded
      assert.equal(actionResult.success, true);
      assert.equal(actionResult.exitCode, 0);

      // Observation was made
      assert.equal(observation.observation, "Chromium executable exists");

      // But requirement evaluation is NOT "supports"
      assert.equal(evaluation.evaluation, "unknown");
      assert.ok(evaluation.reason === "" || typeof evaluation.reason === "string");

      // The core bug: success=true does NOT imply evaluation="supports"
      assert.notEqual(evaluation.evaluation, "supports");
    });
  });

  describe("demoToolOutputExistsNotRequirementVerified", () => {
    it("tool produced output but requirement is not verified", () => {
      const { actionResult, observation, evaluation } =
        demoToolOutputExistsNotRequirementVerified();

      // Action produced output
      assert.equal(actionResult.output, "npm install completed with 0 warnings");

      // Observation exists
      assert.ok(observation.observation.length > 0);

      // But task is NOT verified
      const verification = verifyTask({
        taskId: "t-dep",
        evaluations: [evaluation],
        summary: "check deps",
      });
      assert.equal(verification.verified, false);
    });
  });
});
