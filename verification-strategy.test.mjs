import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VERIFICATION_STRATEGY,
  VERIFICATION_STRATEGY_ORDER,
  rankVerificationStrategies,
  estimateStrategyCost,
} from "./verification-policy.js";

describe("VERIFICATION_STRATEGY_ORDER", () => {
  it("contains all 6 strategies in ascending cost order", () => {
    assert.equal(VERIFICATION_STRATEGY_ORDER.length, 6);
    assert.equal(VERIFICATION_STRATEGY_ORDER[0], VERIFICATION_STRATEGY.EXISTING_TEST);
    assert.equal(VERIFICATION_STRATEGY_ORDER[5], VERIFICATION_STRATEGY.MANUAL_VALIDATION);
  });

  it("includes every strategy constant", () => {
    Object.values(VERIFICATION_STRATEGY).forEach(s => {
      assert.ok(VERIFICATION_STRATEGY_ORDER.includes(s), `missing ${s}`);
    });
  });
});

describe("rankVerificationStrategies", () => {
  it("orders strategies from cheapest to most expensive", () => {
    const input = [
      VERIFICATION_STRATEGY.MANUAL_VALIDATION,
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.BROADER_TEST,
      VERIFICATION_STRATEGY.TARGETED_COMMAND,
    ];
    const result = rankVerificationStrategies(input, {});
    assert.deepEqual(result, [
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.TARGETED_COMMAND,
      VERIFICATION_STRATEGY.BROADER_TEST,
      VERIFICATION_STRATEGY.MANUAL_VALIDATION,
    ]);
  });

  it("ignores unknown strategies", () => {
    const input = [
      VERIFICATION_STRATEGY.EXISTING_TEST,
      "unknown_strategy",
      VERIFICATION_STRATEGY.TARGETED_INSPECTION,
    ];
    const result = rankVerificationStrategies(input, {});
    assert.deepEqual(result, [
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.TARGETED_INSPECTION,
    ]);
  });

  it("returns empty array when all strategies are unknown", () => {
    const result = rankVerificationStrategies(["foo", "bar"], {});
    assert.deepEqual(result, []);
  });

  it("handles single strategy", () => {
    const result = rankVerificationStrategies([VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION], {});
    assert.deepEqual(result, [VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION]);
  });

  it("handles empty input", () => {
    const result = rankVerificationStrategies([], {});
    assert.deepEqual(result, []);
  });

  it("is idempotent on already-sorted input", () => {
    const input = [...VERIFICATION_STRATEGY_ORDER];
    const result = rankVerificationStrategies(input, {});
    assert.deepEqual(result, input);
  });

  it("does not mutate the input array", () => {
    const input = [
      VERIFICATION_STRATEGY.MANUAL_VALIDATION,
      VERIFICATION_STRATEGY.EXISTING_TEST,
    ];
    const copy = [...input];
    rankVerificationStrategies(input, {});
    assert.deepEqual(input, copy);
  });

  it("context parameter is accepted (reserved for future use)", () => {
    const result = rankVerificationStrategies(
      [VERIFICATION_STRATEGY.BROADER_TEST, VERIFICATION_STRATEGY.EXISTING_TEST],
      { preferCheap: true }
    );
    assert.deepEqual(result, [
      VERIFICATION_STRATEGY.EXISTING_TEST,
      VERIFICATION_STRATEGY.BROADER_TEST,
    ]);
  });
});

describe("estimateStrategyCost", () => {
  it("returns cost 1 for existing_test", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.EXISTING_TEST), 1);
  });

  it("returns cost 2 for targeted_command", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.TARGETED_COMMAND), 2);
  });

  it("returns cost 3 for targeted_inspection", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.TARGETED_INSPECTION), 3);
  });

  it("returns cost 4 for minimal_reproduction", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.MINIMAL_REPRODUCTION), 4);
  });

  it("returns cost 5 for broader_test", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.BROADER_TEST), 5);
  });

  it("returns cost 10 for manual_validation", () => {
    assert.equal(estimateStrategyCost(VERIFICATION_STRATEGY.MANUAL_VALIDATION), 10);
  });

  it("returns 10 for unknown strategy (default)", () => {
    assert.equal(estimateStrategyCost("nonexistent"), 10);
  });
});
