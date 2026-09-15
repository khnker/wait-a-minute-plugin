/**
 * Policy coordination tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  VERIFICATION_STRATEGY,
  selectMinimalVerification,
  validatePolicyFlow,
  getNextPolicy,
} from "./verification-policy.js";

describe("validatePolicyFlow", () => {
  it("validates correct transitions", () => {
    const result = validatePolicyFlow(
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.TARGETED_COMMAND
    );
    assert.equal(result.valid, true);
  });

  it("rejects invalid transitions", () => {
    const result = validatePolicyFlow(
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.MANUAL_VALIDATION
    );
    assert.equal(result.valid, false);
    assert.equal(result.reason, "invalid-transition");
  });

  it("rejects same policy", () => {
    const result = validatePolicyFlow(
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.EXISTING_TEST
    );
    assert.equal(result.valid, false);
    assert.equal(result.reason, "same-policy");
  });

  it("handles unknown policies", () => {
    const result = validatePolicyFlow("unknown", "also-unknown");
    assert.equal(result.valid, false);
  });
});

describe("getNextPolicy", () => {
  it("returns next policy in chain", () => {
    const next = getNextPolicy(VERIFICATION_STRATEGY.EXISTING_TEST);
    assert.equal(next, VERIFICATION_STRATEGY.TARGETED_COMMAND);
  });

  it("returns null for last in chain", () => {
    const next = getNextPolicy(VERIFICATION_STRATEGY.MANUAL_VALIDATION);
    assert.equal(next, null);
  });

  it("returns null for unknown policy", () => {
    const next = getNextPolicy("nonexistent");
    assert.equal(next, null);
  });

  it("follows full escalation chain", () => {
    const chain = [
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.TARGETED_COMMAND,
      VERIFICATION_STRATEGY.TARGETED_INSPECTION,
      VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION,
      VERIFICATION_STRATEGY.BROADER_TEST,
      VERIFICATION_STRATEGY.MANUAL_VALIDATION,
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      const next = getNextPolicy(chain[i]);
      assert.equal(next, chain[i + 1], `Step ${i}: expected ${chain[i + 1]}`);
    }
  });
});
