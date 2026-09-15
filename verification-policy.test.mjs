import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VERIFICATION_STRATEGY,
  selectMinimalVerification,
  evaluateCompletionGate,
} from "./verification-policy.js";
import { detectEvidenceGaps } from "./evidence-gap.js";
import { createEvidence, EVIDENCE_STRENGTH } from "./evidence.js";

describe("selectMinimalVerification", () => {
  it("prefere existing_test cuando existe test disponible", () => {
    const gap = { requirementId: "req-1" };
    const checks = [
      { type: "test", value: "run: npm test" },
      { type: "command", value: "curl localhost:3000" },
    ];

    const result = selectMinimalVerification(gap, checks);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.EXISTING_TEST);
    assert.equal(result.check.type, "test");
  });

  it("prefiere targeted_command sobre targeted_inspection", () => {
    const gap = { requirementId: "req-1" };
    const checks = [
      { type: "command", value: "npm run build" },
      { type: "inspection", value: "review logs" },
    ];

    const result = selectMinimalVerification(gap, checks);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.TARGETED_COMMAND);
    assert.equal(result.check.type, "command");
  });

  it("prefiere targeted_inspection sobre broader_test", () => {
    const gap = { requirementId: "req-1" };
    const checks = [
      { type: "inspection", value: "review config" },
      { type: "broader_test", value: "run full suite" },
    ];

    const result = selectMinimalVerification(gap, checks);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.TARGETED_INSPECTION);
    assert.equal(result.check.type, "inspection");
  });

  it("prefiere broader_test sobre manual_validation", () => {
    const gap = { requirementId: "req-1" };
    const checks = [
      { type: "broader_test", value: "run all tests" },
    ];

    const result = selectMinimalVerification(gap, checks);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.BROADER_TEST);
    assert.equal(result.check.type, "broader_test");
  });

  it("retorna manual_validation cuando no hay checks disponibles", () => {
    const gap = { requirementId: "req-1" };

    const result = selectMinimalVerification(gap, []);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.MANUAL_VALIDATION);
    assert.equal(result.check, null);
  });

  it("respeta el orden: test > command > inspection > broader_test > manual", () => {
    const gap = { requirementId: "req-1" };
    const checks = [
      { type: "broader_test", value: "full suite" },
      { type: "test", value: "unit test" },
      { type: "manual", value: "manual check" },
      { type: "command", value: "npm test" },
      { type: "inspection", value: "review code" },
    ];

    const result = selectMinimalVerification(gap, checks);

    assert.equal(result.strategy, VERIFICATION_STRATEGY.EXISTING_TEST);
    assert.equal(result.check.type, "test");
  });
});

describe("evaluateCompletionGate", () => {
  it("bloquea cuando hay requirements no verificados", () => {
    const task = {
      requirements: [
        { id: "req-1", optional: false, status: "VERIFIED" },
        { id: "req-2", optional: false, status: "PENDING" },
      ],
      evidence: [],
    };

    const result = evaluateCompletionGate(task);

    assert.equal(result.blocked, true);
    assert.equal(result.completedRequirements, 1);
    assert.equal(result.totalRequirements, 2);
  });

  it("bloquea cuando hay evidence gaps", () => {
    const task = {
      requirements: [
        { id: "req-1", optional: false, status: "VERIFIED", claim: "debe funcionar" },
      ],
      evidence: [],
    };

    const result = evaluateCompletionGate(task);

    assert.equal(result.blocked, true);
    assert.ok(result.evidenceGaps.length > 0);
    assert.ok(result.unresolvedRequirements.includes("req-1"));
  });

  it("permite el paso cuando todos los requisitos obligatorios están verificados sin gaps", () => {
    const task = {
      requirements: [
        { id: "req-1", optional: false, status: "VERIFIED", claim: "debe funcionar", critical: true },
      ],
      evidence: [
        createEvidence({
          requirementId: "req-1",
          source: "test",
          type: "DIRECT",
          observation: "observación directa",
          strength: EVIDENCE_STRENGTH.L3_DIRECT,
        }),
      ],
    };

    const result = evaluateCompletionGate(task);

    assert.equal(result.blocked, false);
    assert.equal(result.completedRequirements, 1);
    assert.equal(result.totalRequirements, 1);
    assert.equal(result.evidenceGaps.length, 0);
    assert.deepEqual(result.unresolvedRequirements, []);
  });

  it("ignora requisitos opcionales en el conteo", () => {
    const task = {
      requirements: [
        { id: "req-1", optional: false, status: "VERIFIED", claim: "debe funcionar", critical: true },
        { id: "req-2", optional: true, status: "PENDING" },
      ],
      evidence: [
        createEvidence({
          requirementId: "req-1",
          source: "test",
          type: "DIRECT",
          observation: "verificado",
          strength: EVIDENCE_STRENGTH.L3_DIRECT,
        }),
        createEvidence({
          requirementId: "req-2",
          source: "test",
          type: "DIRECT",
          observation: "opcional verificado",
          strength: EVIDENCE_STRENGTH.L3_DIRECT,
        }),
      ],
    };

    const result = evaluateCompletionGate(task);

    assert.equal(result.totalRequirements, 1);
    assert.equal(result.completedRequirements, 1);
    assert.equal(result.blocked, false);
  });

  it("bloquea si hay gap de fuerza de evidencia en requisito obligatorio sin evidencia", () => {
    const task = {
      requirements: [
        { id: "req-1", optional: false, status: "VERIFIED", claim: "crítico", critical: true },
      ],
      evidence: [],
    };

    const result = evaluateCompletionGate(task);

    assert.equal(result.blocked, true);
    assert.ok(result.evidenceGaps.length > 0);
  });
});
