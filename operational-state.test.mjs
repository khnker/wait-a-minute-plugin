/**
 * Operational State Machine tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveOperationalState,
  canPerformAction,
  generateOperationalReport,
  OPERATIONAL_STATES,
} from "./operational-state.js";

describe("OPERATIONAL_STATES", () => {
  it("defines all operational states", () => {
    assert.ok(OPERATIONAL_STATES.has("PROPOSED"));
    assert.ok(OPERATIONAL_STATES.has("ASKING"));
    assert.ok(OPERATIONAL_STATES.has("IMPLEMENTING"));
    assert.ok(OPERATIONAL_STATES.has("VERIFYING"));
    assert.ok(OPERATIONAL_STATES.has("COMPLETE"));
    assert.ok(OPERATIONAL_STATES.has("BLOCKED"));
    assert.ok(OPERATIONAL_STATES.has("CONFLICTED"));
    assert.ok(OPERATIONAL_STATES.has("DEGRADED"));
  });
});

describe("deriveOperationalState", () => {
  it("derives PROPOSED for initial state", () => {
    const result = deriveOperationalState({});
    assert.equal(result.state, "PROPOSED");
  });

  it("derives COMPLETE for completed task", () => {
    const result = deriveOperationalState({ executionState: "COMPLETED" });
    assert.equal(result.state, "COMPLETE");
  });

  it("derives BLOCKED for failed execution", () => {
    const result = deriveOperationalState({ executionState: "FAILED" });
    assert.equal(result.state, "BLOCKED");
    assert.ok(result.blockers.some((b) => b.includes("failed")));
  });

  it("derives BLOCKED for invalidated evidence", () => {
    const result = deriveOperationalState({ evidenceStatus: "invalidated" });
    assert.equal(result.state, "BLOCKED");
    assert.ok(result.blockers.some((b) => b.includes("invalidated")));
  });

  it("derives CONFLICTED for routing conflicts", () => {
    const result = deriveOperationalState({ routingStatus: "CONFLICTED" });
    assert.equal(result.state, "CONFLICTED");
  });

  it("derives ASKING for waiting authorization", () => {
    const result = deriveOperationalState({ executionState: "WAITING_AUTHORIZATION" });
    assert.equal(result.state, "ASKING");
  });

  it("derives VERIFYING for verification phase", () => {
    const result = deriveOperationalState({ executionState: "VERIFYING" });
    assert.equal(result.state, "VERIFYING");
  });

  it("derives IMPLEMENTING for active execution", () => {
    const result = deriveOperationalState({ executionState: "EXECUTING" });
    assert.equal(result.state, "IMPLEMENTING");
  });

  it("derives DEGRADED for partial context", () => {
    const result = deriveOperationalState({
      executionState: "EXECUTING",
      routingStatus: "PARTIAL",
    });
    assert.equal(result.state, "DEGRADED");
  });

  it("prioritizes BLOCKED over DEGRADED", () => {
    const result = deriveOperationalState({
      executionState: "EXECUTING",
      routingStatus: "PARTIAL",
      evidenceStatus: "invalidated",
    });
    assert.equal(result.state, "BLOCKED");
  });

  it("includes all blockers", () => {
    const result = deriveOperationalState({
      executionState: "FAILED",
      evidenceStatus: "invalidated",
    });
    assert.equal(result.state, "BLOCKED");
    assert.ok(result.blockers.length >= 2);
  });
});

describe("canPerformAction", () => {
  it("allows start in PROPOSED", () => {
    const result = canPerformAction("PROPOSED", "start");
    assert.equal(result.allowed, true);
  });

  it("allows execute in IMPLEMENTING", () => {
    const result = canPerformAction("IMPLEMENTING", "execute");
    assert.equal(result.allowed, true);
  });

  it("allows verify in VERIFYING", () => {
    const result = canPerformAction("VERIFYING", "verify");
    assert.equal(result.allowed, true);
  });

  it("allows resolve in BLOCKED", () => {
    const result = canPerformAction("BLOCKED", "resolve");
    assert.equal(result.allowed, true);
  });

  it("disallows start in IMPLEMENTING", () => {
    const result = canPerformAction("IMPLEMENTING", "start");
    assert.equal(result.allowed, false);
  });

  it("disallows all actions in COMPLETE", () => {
    const result = canPerformAction("COMPLETE", "execute");
    assert.equal(result.allowed, false);
  });
});

describe("generateOperationalReport", () => {
  it("generates complete report", () => {
    const report = generateOperationalReport({
      executionState: "EXECUTING",
      routingStatus: "COMPLETE",
    });
    assert.ok(report.state);
    assert.ok(report.reason);
    assert.ok(Array.isArray(report.blockers));
    assert.ok(Array.isArray(report.allowedActions));
    assert.ok(report.derivedAt);
  });
});
