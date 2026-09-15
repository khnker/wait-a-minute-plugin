import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIREMENT_STATES,
  createRequirement,
  isRequirementCompletable,
  canCompleteTask,
  VALID_TRANSITIONS,
  canTransition,
  transitionRequirement
} from "./verification-model.js";

describe("REQUIREMENT_STATES", () => {
  it("defines all expected states", () => {
    assert.deepStrictEqual(Object.values(REQUIREMENT_STATES), [
      "OPEN",
      "IN_PROGRESS",
      "OBSERVED",
      "SUPPORTED",
      "VERIFIED",
      "FAILED",
      "UNKNOWN"
    ]);
  });
});

describe("createRequirement", () => {
  it("crea un requirement válido con valores por defecto", () => {
    const r = createRequirement({ id: "req-1", claim: "El sistema autentica usuarios" });
    assert.strictEqual(r.id, "req-1");
    assert.strictEqual(r.claim, "El sistema autentica usuarios");
    assert.strictEqual(r.status, REQUIREMENT_STATES.OPEN);
    assert.deepStrictEqual(r.evidence, []);
    assert.strictEqual(r.intent, "");
    assert.strictEqual(r.expectedOutcome, "");
    assert.deepStrictEqual(r.acceptanceCriteria, []);
    assert.strictEqual(r.verificationMethod, null);
    assert.ok(r.createdAt > 0);
    assert.ok(r.updatedAt > 0);
    assert.ok(r.createdAt <= r.updatedAt);
  });

  it("acepta todos los campos opcionales", () => {
    const criteria = ["响应时间 < 200ms"];
    const r = createRequirement({
      id: "req-2",
      claim: "La API responde rápido",
      intent: "performance",
      expectedOutcome: "todas las peticiones < 200ms",
      acceptanceCriteria: criteria,
      verificationMethod: "carga-test"
    });
    assert.strictEqual(r.intent, "performance");
    assert.strictEqual(r.expectedOutcome, "todas las peticiones < 200ms");
    assert.deepStrictEqual(r.acceptanceCriteria, criteria);
    assert.strictEqual(r.verificationMethod, "carga-test");
  });

  it("lanza error si falta id", () => {
    assert.throws(() => createRequirement({ claim: "sin id" }), /id and claim are required/);
  });

  it("lanza error si falta claim", () => {
    assert.throws(() => createRequirement({ id: "sin-claim" }), /id and claim are required/);
  });
});

describe("isRequirementCompletable", () => {
  it("retorna true para VERIFIED", () => {
    const r = createRequirement({ id: "r1", claim: "x" });
    r.status = REQUIREMENT_STATES.VERIFIED;
    assert.strictEqual(isRequirementCompletable(r), true);
  });

  it("retorna true para FAILED", () => {
    const r = createRequirement({ id: "r2", claim: "x" });
    r.status = REQUIREMENT_STATES.FAILED;
    assert.strictEqual(isRequirementCompletable(r), true);
  });

  it("retorna false para OPEN", () => {
    const r = createRequirement({ id: "r3", claim: "x" });
    assert.strictEqual(isRequirementCompletable(r), false);
  });

  it("retorna false para IN_PROGRESS", () => {
    const r = createRequirement({ id: "r4", claim: "x" });
    r.status = REQUIREMENT_STATES.IN_PROGRESS;
    assert.strictEqual(isRequirementCompletable(r), false);
  });

  it("retorna false para OBSERVED", () => {
    const r = createRequirement({ id: "r5", claim: "x" });
    r.status = REQUIREMENT_STATES.OBSERVED;
    assert.strictEqual(isRequirementCompletable(r), false);
  });

  it("retorna false para SUPPORTED", () => {
    const r = createRequirement({ id: "r6", claim: "x" });
    r.status = REQUIREMENT_STATES.SUPPORTED;
    assert.strictEqual(isRequirementCompletable(r), false);
  });

  it("retorna false para UNKNOWN", () => {
    const r = createRequirement({ id: "r7", claim: "x" });
    r.status = REQUIREMENT_STATES.UNKNOWN;
    assert.strictEqual(isRequirementCompletable(r), false);
  });
});

describe("canCompleteTask", () => {
  it("retorna true cuando todos los requisitos obligatorios están completos", () => {
    const requirements = [
      createRequirement({ id: "req-1", claim: "A", verificationMethod: "test" }),
      createRequirement({ id: "req-2", claim: "B", verificationMethod: "test" })
    ];
    requirements[0].status = REQUIREMENT_STATES.VERIFIED;
    requirements[1].status = REQUIREMENT_STATES.FAILED;

    const result = canCompleteTask(requirements);
    assert.strictEqual(result.canComplete, true);
    assert.deepStrictEqual(result.incompleteRequirements, []);
  });

  it("retorna true cuando solo hay requisitos opcionales incompletos", () => {
    const requirements = [
      createRequirement({ id: "req-1", claim: "A", optional: true }),
      createRequirement({ id: "req-2", claim: "B", optional: true })
    ];
    requirements[0].status = REQUIREMENT_STATES.OPEN;
    requirements[1].status = REQUIREMENT_STATES.OBSERVED;

    const result = canCompleteTask(requirements);
    assert.strictEqual(result.canComplete, true);
    assert.deepStrictEqual(result.incompleteRequirements, []);
  });

  it("retorna false cuando hay un requisito obligatorio incompleto", () => {
    const requirements = [
      createRequirement({ id: "req-1", claim: "A", verificationMethod: "test" }),
      createRequirement({ id: "req-2", claim: "B", verificationMethod: "test" })
    ];
    requirements[0].status = REQUIREMENT_STATES.VERIFIED;
    requirements[1].status = REQUIREMENT_STATES.OBSERVED;

    const result = canCompleteTask(requirements);
    assert.strictEqual(result.canComplete, false);
    assert.deepStrictEqual(result.incompleteRequirements, [{ id: "req-2", status: "OBSERVED" }]);
  });

  it("retorna false con múltiples requisitos obligatorios incompletos", () => {
    const requirements = [
      createRequirement({ id: "req-1", claim: "A" }),
      createRequirement({ id: "req-2", claim: "B" }),
      createRequirement({ id: "req-3", claim: "C", optional: true })
    ];
    requirements[0].status = REQUIREMENT_STATES.OPEN;
    requirements[1].status = REQUIREMENT_STATES.UNKNOWN;

    const result = canCompleteTask(requirements);
    assert.strictEqual(result.canComplete, false);
    assert.strictEqual(result.incompleteRequirements.length, 2);
  });

  it("maneja lista vacía como completable", () => {
    const result = canCompleteTask([]);
    assert.strictEqual(result.canComplete, true);
    assert.deepStrictEqual(result.incompleteRequirements, []);
  });
});

describe("canTransition", () => {
  it("permite transiciones válidas", () => {
    assert.strictEqual(canTransition(REQUIREMENT_STATES.OPEN, REQUIREMENT_STATES.IN_PROGRESS), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.IN_PROGRESS, REQUIREMENT_STATES.OBSERVED), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.IN_PROGRESS, REQUIREMENT_STATES.FAILED), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.IN_PROGRESS, REQUIREMENT_STATES.UNKNOWN), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.OBSERVED, REQUIREMENT_STATES.SUPPORTED), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.SUPPORTED, REQUIREMENT_STATES.VERIFIED), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.UNKNOWN, REQUIREMENT_STATES.IN_PROGRESS), true);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.VERIFIED, REQUIREMENT_STATES.OPEN), true);
  });

  it("rechaza transiciones inválidas", () => {
    assert.strictEqual(canTransition(REQUIREMENT_STATES.OPEN, REQUIREMENT_STATES.VERIFIED), false);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.OPEN, REQUIREMENT_STATES.OBSERVED), false);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.VERIFIED, REQUIREMENT_STATES.SUPPORTED), false);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.SUPPORTED, REQUIREMENT_STATES.OPEN), false);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.FAILED, REQUIREMENT_STATES.OPEN), false);
    assert.strictEqual(canTransition(REQUIREMENT_STATES.FAILED, REQUIREMENT_STATES.IN_PROGRESS), false);
  });
});

describe("transitionRequirement", () => {
  it("lanza error en transición inválida", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    assert.throws(
      () => transitionRequirement(r, REQUIREMENT_STATES.VERIFIED),
      /Invalid transition: OPEN → VERIFIED/
    );
  });

  it("permite transiciones válidas", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    const updated = transitionRequirement(r, REQUIREMENT_STATES.IN_PROGRESS);
    assert.strictEqual(updated.status, REQUIREMENT_STATES.IN_PROGRESS);
    assert.ok(updated.updatedAt >= r.updatedAt);
  });

  it("agrega evidencia en la transición", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    const ev = { source: "test", result: "ok" };
    const updated = transitionRequirement(r, REQUIREMENT_STATES.IN_PROGRESS, ev);
    assert.strictEqual(updated.evidence.length, 1);
    assert.deepStrictEqual(updated.evidence[0], ev);
  });

  it("no modifica evidencia original del requirement", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    const ev = { source: "test" };
    transitionRequirement(r, REQUIREMENT_STATES.IN_PROGRESS, ev);
    assert.strictEqual(r.evidence.length, 0);
  });

  it("VERIFIED → OPEN marca invalidatedAt", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    r.status = REQUIREMENT_STATES.VERIFIED;
    const updated = transitionRequirement(r, REQUIREMENT_STATES.OPEN);
    assert.strictEqual(updated.status, REQUIREMENT_STATES.OPEN);
    assert.ok(updated.invalidatedAt > 0);
  });

  it("VERIFIED → OPEN sin evidencia no agrega invalidatedAt al original", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    r.status = REQUIREMENT_STATES.VERIFIED;
    const updated = transitionRequirement(r, REQUIREMENT_STATES.OPEN);
    assert.strictEqual(r.invalidatedAt, undefined);
    assert.ok(updated.invalidatedAt > 0);
  });

  it("FAILED es terminal — no permite ninguna transición", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    r.status = REQUIREMENT_STATES.FAILED;
    assert.throws(() => transitionRequirement(r, REQUIREMENT_STATES.OPEN));
    assert.throws(() => transitionRequirement(r, REQUIREMENT_STATES.IN_PROGRESS));
  });

  it("UNKNOWN → IN_PROGRESS permite reiniciar", () => {
    const r = createRequirement({ id: "req-1", claim: "x" });
    r.status = REQUIREMENT_STATES.UNKNOWN;
    const updated = transitionRequirement(r, REQUIREMENT_STATES.IN_PROGRESS);
    assert.strictEqual(updated.status, REQUIREMENT_STATES.IN_PROGRESS);
  });
});
