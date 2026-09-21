import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIREMENT_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  canTransition,
  transition,
  isRequirementComplete,
  summarizeRequirements,
} from "./requirement-state.js";

describe("REQUIREMENT_STATES", () => {
  it("exposes the six expected states", () => {
    assert.deepEqual(
      Object.values(REQUIREMENT_STATES).sort(),
      [
        "BLOCKED",
        "IN_PROGRESS",
        "INVALIDATED",
        "NEEDS_REPLAN",
        "PENDING",
        "VERIFIED",
      ].sort()
    );
  });

  it("treats VERIFIED as terminal", () => {
    assert.ok(TERMINAL_STATES.has(REQUIREMENT_STATES.VERIFIED));
  });
});

describe("canTransition()", () => {
  it("allows PENDING -> IN_PROGRESS", () => {
    assert.deepEqual(
      canTransition(REQUIREMENT_STATES.PENDING, REQUIREMENT_STATES.IN_PROGRESS),
      { allowed: true }
    );
  });

  it("allows PENDING -> BLOCKED", () => {
    const r = canTransition(REQUIREMENT_STATES.PENDING, REQUIREMENT_STATES.BLOCKED);
    assert.equal(r.allowed, true);
  });

  it("disallows PENDING -> VERIFIED (must pass through IN_PROGRESS)", () => {
    const r = canTransition(REQUIREMENT_STATES.PENDING, REQUIREMENT_STATES.VERIFIED);
    assert.equal(r.allowed, false);
    assert.match(r.reason, /illegal/);
  });

  it("allows IN_PROGRESS -> VERIFIED", () => {
    const r = canTransition(REQUIREMENT_STATES.IN_PROGRESS, REQUIREMENT_STATES.VERIFIED);
    assert.equal(r.allowed, true);
  });

  it("allows IN_PROGRESS -> BLOCKED and NEEDS_REPLAN", () => {
    for (const target of [REQUIREMENT_STATES.BLOCKED, REQUIREMENT_STATES.NEEDS_REPLAN]) {
      const r = canTransition(REQUIREMENT_STATES.IN_PROGRESS, target);
      assert.equal(r.allowed, true);
    }
  });

  it("allows VERIFIED -> INVALIDATED only (evidence contradicted later)", () => {
    const okTargets = Array.from(TRANSITIONS[REQUIREMENT_STATES.VERIFIED]);
    assert.deepEqual(okTargets, [REQUIREMENT_STATES.INVALIDATED]);
  });

  it("disallows VERIFIED -> PENDING (no demotion)", () => {
    const r = canTransition(REQUIREMENT_STATES.VERIFIED, REQUIREMENT_STATES.PENDING);
    assert.equal(r.allowed, false);
  });

  it("rejects unknown target state", () => {
    const r = canTransition(REQUIREMENT_STATES.PENDING, "FROBNICATE");
    assert.equal(r.allowed, false);
    assert.match(r.reason, /unknown target/);
  });

  it("rejects unknown source state", () => {
    const r = canTransition("FROBNICATE", REQUIREMENT_STATES.PENDING);
    assert.equal(r.allowed, false);
    assert.match(r.reason, /unknown source/);
  });

  it("allows BLOCKED -> IN_PROGRESS and NEEDS_REPLAN", () => {
    assert.equal(
      canTransition(REQUIREMENT_STATES.BLOCKED, REQUIREMENT_STATES.IN_PROGRESS).allowed,
      true
    );
    assert.equal(
      canTransition(REQUIREMENT_STATES.BLOCKED, REQUIREMENT_STATES.NEEDS_REPLAN).allowed,
      true
    );
  });

  it("allows NEEDS_REPLAN -> PENDING and IN_PROGRESS", () => {
    for (const target of [REQUIREMENT_STATES.PENDING, REQUIREMENT_STATES.IN_PROGRESS]) {
      const r = canTransition(REQUIREMENT_STATES.NEEDS_REPLAN, target);
      assert.equal(r.allowed, true);
    }
  });

  it("disallows NEEDS_REPLAN -> VERIFIED directly", () => {
    const r = canTransition(REQUIREMENT_STATES.NEEDS_REPLAN, REQUIREMENT_STATES.VERIFIED);
    assert.equal(r.allowed, false);
  });

  it("allows INVALIDATED -> IN_PROGRESS (rework)", () => {
    const r = canTransition(REQUIREMENT_STATES.INVALIDATED, REQUIREMENT_STATES.IN_PROGRESS);
    assert.equal(r.allowed, true);
  });
});

describe("transition()", () => {
  it("returns a new requirement with updated status when allowed", () => {
    const req = { id: "req-1", status: REQUIREMENT_STATES.PENDING };
    const next = transition(req, REQUIREMENT_STATES.IN_PROGRESS);
    assert.equal(next.status, REQUIREMENT_STATES.IN_PROGRESS);
    assert.equal(next.id, "req-1");
    assert.equal(next.lastTransitionFrom, REQUIREMENT_STATES.PENDING);
    assert.ok(next.lastTransitionAt);
    // original is not mutated
    assert.equal(req.status, REQUIREMENT_STATES.PENDING);
  });

  it("returns an error object when transition is illegal", () => {
    const req = { id: "req-2", status: REQUIREMENT_STATES.PENDING };
    const result = transition(req, REQUIREMENT_STATES.VERIFIED);
    assert.ok(result.error);
    assert.match(result.error, /illegal/);
    assert.equal(result.from, REQUIREMENT_STATES.PENDING);
    assert.equal(result.to, REQUIREMENT_STATES.VERIFIED);
  });

  it("rejects non-object requirements", () => {
    const result = transition(null, REQUIREMENT_STATES.PENDING);
    assert.ok(result.error);
  });

  it("defaults missing status to PENDING", () => {
    const req = { id: "req-3" };
    const next = transition(req, REQUIREMENT_STATES.IN_PROGRESS);
    assert.equal(next.status, REQUIREMENT_STATES.IN_PROGRESS);
    assert.equal(next.lastTransitionFrom, REQUIREMENT_STATES.PENDING);
  });
});

describe("isRequirementComplete()", () => {
  it("true only for VERIFIED", () => {
    assert.equal(isRequirementComplete({ status: REQUIREMENT_STATES.VERIFIED }), true);
    for (const s of [
      REQUIREMENT_STATES.PENDING,
      REQUIREMENT_STATES.IN_PROGRESS,
      REQUIREMENT_STATES.INVALIDATED,
      REQUIREMENT_STATES.BLOCKED,
      REQUIREMENT_STATES.NEEDS_REPLAN,
    ]) {
      assert.equal(isRequirementComplete({ status: s }), false);
    }
  });

  it("false for missing/null requirement", () => {
    assert.equal(isRequirementComplete(null), false);
    assert.equal(isRequirementComplete(undefined), false);
  });
});

describe("summarizeRequirements()", () => {
  it("reports allComplete=true when every requirement is VERIFIED", () => {
    const result = summarizeRequirements([
      { id: "r1", status: REQUIREMENT_STATES.VERIFIED },
      { id: "r2", status: REQUIREMENT_STATES.VERIFIED },
    ]);
    assert.equal(result.allComplete, true);
    assert.equal(result.summary.complete, 2);
    assert.equal(result.summary.incomplete, 0);
    assert.equal(result.summary.blocked, 0);
  });

  it("reports blocked requirements separately", () => {
    const result = summarizeRequirements([
      { id: "r1", status: REQUIREMENT_STATES.VERIFIED },
      { id: "r2", status: REQUIREMENT_STATES.BLOCKED },
      { id: "r3", status: REQUIREMENT_STATES.NEEDS_REPLAN },
      { id: "r4", status: REQUIREMENT_STATES.PENDING },
    ]);
    assert.equal(result.allComplete, false);
    assert.equal(result.summary.total, 4);
    assert.equal(result.summary.complete, 1);
    assert.equal(result.summary.incomplete, 3);
    assert.equal(result.summary.blocked, 2);
  });

  it("handles empty input gracefully", () => {
    const result = summarizeRequirements([]);
    assert.equal(result.allComplete, true);
    assert.equal(result.summary.total, 0);
  });
});
