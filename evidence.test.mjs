/**
 * Evidence model tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_TYPES,
  EVIDENCE_STRENGTH,
  createEvidence,
  canCloseRequirement,
  findConflicts,
} from "./evidence.js";

describe("createEvidence", () => {
  it("creates evidence with all evidence types", () => {
    const typeValues = Object.values(EVIDENCE_TYPES);
    const evidences = typeValues.map((type) =>
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type,
        observation: `obs for ${type}`,
      })
    );

    assert.equal(evidences.length, Object.keys(EVIDENCE_TYPES).length);
    for (const ev of evidences) {
      assert.ok(ev.id.startsWith("ev-"), `id should start with ev-, got ${ev.id}`);
      assert.equal(ev.requirementId, "req-1");
      assert.equal(ev.type, ev.observation.includes("DIRECT") ? "DIRECT" : ev.type); // sanity
      assert.ok(ev.timestamp > 0, "timestamp should be set");
    }
  });

  it("creates evidence with all strength levels", () => {
    const strengthValues = Object.values(EVIDENCE_STRENGTH);
    const evidences = strengthValues.map((strength) =>
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "test",
        strength,
      })
    );

    assert.equal(evidences.length, Object.keys(EVIDENCE_STRENGTH).length);
    for (const ev of evidences) {
      assert.ok(Object.values(EVIDENCE_STRENGTH).includes(ev.strength));
    }
  });

  it("uses custom id when provided", () => {
    const ev = createEvidence({
      id: "custom-ev-id",
      requirementId: "req-1",
      source: "test",
      type: EVIDENCE_TYPES.DIRECT,
      observation: "test",
    });
    assert.equal(ev.id, "custom-ev-id");
  });

  it("defaults strength to L2_OBSERVATION", () => {
    const ev = createEvidence({
      requirementId: "req-1",
      source: "test",
      type: EVIDENCE_TYPES.DIRECT,
      observation: "test",
    });
    assert.equal(ev.strength, EVIDENCE_STRENGTH.L2_OBSERVATION);
  });

  it("defaults supports to true", () => {
    const ev = createEvidence({
      requirementId: "req-1",
      source: "test",
      type: EVIDENCE_TYPES.DIRECT,
      observation: "test",
    });
    assert.equal(ev.supports, true);
  });

  it("accepts actionId parameter", () => {
    const ev = createEvidence({
      requirementId: "req-1",
      source: "test",
      type: EVIDENCE_TYPES.DIRECT,
      observation: "test",
      actionId: "action-42",
    });
    assert.equal(ev.actionId, "action-42");
  });
});

describe("canCloseRequirement", () => {
  it("INFERRED only → false for critical requirement", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.INFERRED,
        observation: "inferred obs",
        strength: EVIDENCE_STRENGTH.L1_INFERENCE,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, true), false);
  });

  it("INFERRED only → false for non-critical requirement too (no L3/L4)", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DERIVED,
        observation: "derived obs",
        strength: EVIDENCE_STRENGTH.L1_INFERENCE,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, false), false);
  });

  it("L3_DIRECT present → true", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "direct obs",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, true), true);
  });

  it("L4_VERIFICATION present → true", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.TEST_RESULT,
        observation: "test passed",
        strength: EVIDENCE_STRENGTH.L4_VERIFICATION,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, true), true);
  });

  it("empty evidence → false", () => {
    assert.equal(canCloseRequirement([], true), false);
    assert.equal(canCloseRequirement(null, true), false);
    assert.equal(canCloseRequirement(undefined, true), false);
  });

  it("contradicting evidence (supports=false) → false", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "direct obs",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.NEGATIVE,
        observation: "contradiction",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: false,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, true), false);
  });

  it("L2_OBSERVATION only → false (not L3/L4)", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DERIVED,
        observation: "obs",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, false), false);
  });

  it("mixed L2 + L3 → true (has L3)", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DERIVED,
        observation: "derived",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "direct",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
      }),
    ];
    assert.equal(canCloseRequirement(evidence, true), true);
  });
});

describe("findConflicts", () => {
  it("detects contradictory evidence for same requirement", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test-a",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "supports req",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test-b",
        type: EVIDENCE_TYPES.NEGATIVE,
        observation: "contradicts req",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: false,
      }),
    ];
    const conflicts = findConflicts(evidence);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].requirementId, "req-1");
    assert.equal(conflicts[0].supports.length, 1);
    assert.equal(conflicts[0].contradicts.length, 1);
  });

  it("no conflicts when all evidence supports", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test-a",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "supports",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test-b",
        type: EVIDENCE_TYPES.DERIVED,
        observation: "also supports",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: true,
      }),
    ];
    const conflicts = findConflicts(evidence);
    assert.equal(conflicts.length, 0);
  });

  it("no conflicts with empty evidence", () => {
    assert.equal(findConflicts([]).length, 0);
    assert.equal(findConflicts(null).length, 0);
  });

  it("detects conflicts across multiple requirements independently", () => {
    const evidence = [
      // req-1 has conflict
      createEvidence({
        requirementId: "req-1",
        source: "a",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "supports",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "b",
        type: EVIDENCE_TYPES.NEGATIVE,
        observation: "contradicts",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: false,
      }),
      // req-2 no conflict
      createEvidence({
        requirementId: "req-2",
        source: "c",
        type: EVIDENCE_TYPES.DIRECT,
        observation: "supports",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-2",
        source: "d",
        type: EVIDENCE_TYPES.TEST_RESULT,
        observation: "confirms",
        strength: EVIDENCE_STRENGTH.L4_VERIFICATION,
        supports: true,
      }),
      // req-3 has conflict
      createEvidence({
        requirementId: "req-3",
        source: "e",
        type: EVIDENCE_TYPES.DERIVED,
        observation: "supports",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-3",
        source: "f",
        type: EVIDENCE_TYPES.USER_CONFIRMATION,
        observation: "denies",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: false,
      }),
    ];
    const conflicts = findConflicts(evidence);
    assert.equal(conflicts.length, 2);
    const reqIds = conflicts.map((c) => c.requirementId).sort();
    assert.deepEqual(reqIds, ["req-1", "req-3"]);
  });

  it("evidence with supports=false only (no supports) → no conflict", () => {
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "a",
        type: EVIDENCE_TYPES.NEGATIVE,
        observation: "contradicts nothing",
        strength: EVIDENCE_STRENGTH.L2_OBSERVATION,
        supports: false,
      }),
    ];
    const conflicts = findConflicts(evidence);
    assert.equal(conflicts.length, 0);
  });
});
