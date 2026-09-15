import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_STRENGTH,
  createEvidence,
} from "./evidence.js";
import { detectEvidenceGaps } from "./evidence-gap.js";

describe("detectEvidenceGaps", () => {
  it("detecta requirement sin evidencia (NO_EVIDENCE)", () => {
    const requirements = [{ id: "req-1", claim: "el sistema debe lanzar" }];
    const evidence = [];

    const gaps = detectEvidenceGaps(requirements, evidence);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].requirementId, "req-1");
    assert.equal(gaps[0].gapType, "NO_EVIDENCE");
    assert.deepEqual(gaps[0].missingEvidence, ["Any evidence"]);
    assert.ok(typeof gaps[0].suggestedVerification === "string");
  });

  it("detecta evidencia de fuerza insuficiente (INSUFFICIENT_STRENGTH)", () => {
    const requirements = [
      { id: "req-1", critical: true, claim: "el sistema debe verificar" },
    ];
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs",
        strength: EVIDENCE_STRENGTH.L1_INFERENCE,
      }),
    ];

    const gaps = detectEvidenceGaps(requirements, evidence);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].gapType, "INSUFFICIENT_STRENGTH");
    assert.equal(gaps[0].requirementId, "req-1");
    assert.ok(gaps[0].missingEvidence[0].includes("L3_DIRECT"));
    assert.equal(gaps[0].currentStrength, EVIDENCE_STRENGTH.L1_INFERENCE);
  });

  it("no detecta gap cuando la evidencia cumple la fuerza requerida", () => {
    const requirements = [
      { id: "req-1", critical: true, claim: "el sistema debe verificar" },
    ];
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs",
        strength: EVIDENCE_STRENGTH.L3_DIRECT,
      }),
    ];

    const gaps = detectEvidenceGaps(requirements, evidence);

    assert.equal(gaps.length, 0);
  });

  it("detecta contradicciones entre evidencias (CONTRADICTION)", () => {
    const requirements = [{ id: "req-1", claim: "el sistema corre" }];
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs soporta",
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "NEGATIVE",
        observation: "obs contradice",
        supports: false,
      }),
    ];

    const gaps = detectEvidenceGaps(requirements, evidence);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].gapType, "CONTRADICTION");
    assert.deepEqual(gaps[0].missingEvidence, ["Resolve conflicting evidence"]);
  });

  it("no detecta contradicción cuando solo hay evidencia de soporte", () => {
    const requirements = [{ id: "req-1", claim: "el sistema corre" }];
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs1",
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs2",
        supports: true,
      }),
    ];

    const gaps = detectEvidenceGaps(requirements, evidence);

    assert.equal(gaps.length, 0);
  });

  it("detecta múltiples gaps para un mismo requirement", () => {
    const requirements = [
      { id: "req-1", critical: true, claim: "el sistema debe verificar" },
    ];
    const evidence = [
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "DIRECT",
        observation: "obs1",
        strength: EVIDENCE_STRENGTH.L1_INFERENCE,
        supports: true,
      }),
      createEvidence({
        requirementId: "req-1",
        source: "test",
        type: "NEGATIVE",
        observation: "obs2",
        supports: false,
      }),
    ];

    const gaps = detectEvidenceGaps(requirements, evidence);

    const gapTypes = gaps.map(g => g.gapType);
    assert.ok(gapTypes.includes("INSUFFICIENT_STRENGTH"));
    assert.ok(gapTypes.includes("CONTRADICTION"));
  });

  it("sugiere verificación basada en el claim del requirement", () => {
    const requirements = [
      { id: "req-1", claim: "el sistema debe test" },
      { id: "req-2", claim: "el sistema debe run" },
      { id: "req-3", claim: "el sistema hace algo" },
    ];
    const gaps = detectEvidenceGaps(requirements, []);

    assert.equal(gaps[0].suggestedVerification, "Execute test or verification command");
    assert.equal(gaps[1].suggestedVerification, "Execute and observe actual behavior");
    assert.equal(gaps[2].suggestedVerification, "Gather direct evidence");
  });
});
