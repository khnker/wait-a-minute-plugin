import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAssumption,
  validateAssumption,
  trackAssumptionBudget,
  DEFAULT_ASSUMPTION_BUDGET,
  checkAssumptionBudget
} from "./assumption-tracking.js";

describe("createAssumption", () => {
  it("crea una suposición con estructura correcta", () => {
    const assumption = createAssumption("The API will respond", "agent", "critical");

    assert.ok(assumption.id, "has id");
    assert.ok(assumption.id.startsWith("assumption-"), "id starts with assumption-");
    assert.equal(assumption.statement, "The API will respond");
    assert.equal(assumption.source, "agent");
    assert.equal(assumption.impact, "critical");
    assert.equal(assumption.validated, false);
    assert.equal(assumption.invalidated, false);
    assert.ok(typeof assumption.createdAt === "number");
    assert.ok(assumption.createdAt > 0);
  });

  it("impact por defecto es unknown", () => {
    const assumption = createAssumption("test", "user");
    assert.equal(assumption.impact, "unknown");
  });

  it("genera ids con formato correcto", () => {
    const a = createAssumption("a", "agent");
    const b = createAssumption("b", "agent");
    assert.ok(a.id.startsWith("assumption-"), "id starts with assumption-");
    assert.ok(b.id.startsWith("assumption-"), "id starts with assumption-");
    // En entornos reales Date.now() difería; verificamos unicidad o estructura
    assert.notEqual(a.id, b.id, "ids should differ in real execution");
  });
});

describe("validateAssumption", () => {
  it("validada si hay evidencia de apoyo", () => {
    const assumption = createAssumption("API responds", "agent");
    assumption.relatedTo = "req-1";

    const evidence = [
      { requirementId: "req-1", supports: true }
    ];

    const result = validateAssumption(assumption, evidence);

    assert.equal(result.assumptionId, assumption.id);
    assert.equal(result.validated, true);
    assert.equal(result.supportingEvidence, 1);
    assert.equal(result.invalidated, false);
  });

  it("no validada sin evidencia", () => {
    const assumption = createAssumption("API responds", "agent");
    assumption.relatedTo = "req-1";

    const result = validateAssumption(assumption, []);

    assert.equal(result.validated, false);
    assert.equal(result.supportingEvidence, 0);
  });

  it("no validada si evidencia dice supports:false", () => {
    const assumption = createAssumption("API responds", "agent");
    assumption.relatedTo = "req-1";

    const evidence = [
      { requirementId: "req-1", supports: false }
    ];

    const result = validateAssumption(assumption, evidence);
    assert.equal(result.validated, false);
  });

  it("incluye assumptionId en el resultado", () => {
    const assumption = createAssumption("test", "agent");
    const result = validateAssumption(assumption, []);
    assert.equal(result.assumptionId, assumption.id);
  });
});

describe("trackAssumptionBudget", () => {
  it("dentro del presupuesto", () => {
    const assumptions = [
      Object.assign(createAssumption("a1", "agent", "minor"), { id: "assumption-1" }),
      Object.assign(createAssumption("a2", "agent", "minor"), { id: "assumption-2" })
    ];

    const result = trackAssumptionBudget(assumptions);

    assert.equal(result.withinBudget, true);
    assert.equal(result.current, 2);
    assert.equal(result.max, 5);
    assert.equal(result.overBudget, 0);
  });

  it("sobrepasa el presupuesto", () => {
    const assumptions = Array.from({ length: 7 }, (_, i) =>
      createAssumption(`a${i}`, "agent", "minor")
    );

    const result = trackAssumptionBudget(assumptions);

    assert.equal(result.withinBudget, false);
    assert.equal(result.current, 7);
    assert.equal(result.overBudget, 2);
  });

  it("ignora validadas e invalidadas", () => {
    const assumptions = [
      Object.assign(createAssumption("v1", "agent"), { validated: true }),
      Object.assign(createAssumption("i1", "agent"), { invalidated: true }),
      createAssumption("u1", "agent"),
      createAssumption("u2", "agent"),
      createAssumption("u3", "agent")
    ];

    const result = trackAssumptionBudget(assumptions);
    assert.equal(result.current, 3);
    assert.equal(result.withinBudget, true);
  });

  it("max personalizado", () => {
    const assumptions = Array.from({ length: 3 }, (_, i) =>
      createAssumption(`a${i}`, "agent")
    );
    const result = trackAssumptionBudget(assumptions, 2);
    assert.equal(result.withinBudget, false);
    assert.equal(result.max, 2);
  });
});

describe("DEFAULT_ASSUMPTION_BUDGET", () => {
  it("tiene los valores por defecto esperados", () => {
    assert.deepEqual(DEFAULT_ASSUMPTION_BUDGET, {
      maxUnvalidated: 5,
      maxCritical: 2,
      maxMaterial: 5
    });
  });
});

describe("checkAssumptionBudget", () => {
  it("válido sin violaciones", () => {
    const assumptions = [
      createAssumption("c1", "agent", "critical"),
      createAssumption("m1", "agent", "material"),
      createAssumption("u1", "agent", "minor")
    ];

    const result = checkAssumptionBudget(assumptions);

    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.counts, { unvalidated: 3, critical: 1, material: 1 });
  });

  it("violación por exceso de no validadas", () => {
    const assumptions = Array.from({ length: 7 }, (_, i) =>
      createAssumption(`u${i}`, "agent", "minor")
    );

    const result = checkAssumptionBudget(assumptions);

    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.ok(result.violations[0].includes("Too many unvalidated assumptions"));
    assert.deepEqual(result.counts, { unvalidated: 7, critical: 0, material: 0 });
  });

  it("violación por exceso de críticas", () => {
    const assumptions = [
      createAssumption("c1", "agent", "critical"),
      createAssumption("c2", "agent", "critical"),
      createAssumption("c3", "agent", "critical")
    ];

    const result = checkAssumptionBudget(assumptions);

    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("critical")));
    assert.deepEqual(result.counts, { unvalidated: 3, critical: 3, material: 0 });
  });

  it("violación por exceso de materiales", () => {
    const assumptions = Array.from({ length: 7 }, (_, i) =>
      createAssumption(`m${i}`, "agent", "material")
    );

    const result = checkAssumptionBudget(assumptions);

    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("material")));
  });

  it("múltiples violaciones simultáneas", () => {
    const assumptions = [
      ...Array.from({ length: 7 }, (_, i) => createAssumption(`u${i}`, "agent", "minor")),
      ...Array.from({ length: 3 }, (_, i) => createAssumption(`c${i}`, "agent", "critical")),
      ...Array.from({ length: 7 }, (_, i) => createAssumption(`m${i}`, "agent", "material"))
    ];

    const result = checkAssumptionBudget(assumptions);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 3);
  });

  it("budget personalizado", () => {
    const assumptions = [
      createAssumption("c1", "agent", "critical"),
      createAssumption("c2", "agent", "critical"),
      createAssumption("c3", "agent", "critical")
    ];

    const result = checkAssumptionBudget(assumptions, { maxUnvalidated: 10, maxCritical: 5, maxMaterial: 5 });
    assert.equal(result.valid, true);
  });

  it("empty: sin supuestos es válido", () => {
    const result = checkAssumptionBudget([]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.counts, { unvalidated: 0, critical: 0, material: 0 });
  });
});
