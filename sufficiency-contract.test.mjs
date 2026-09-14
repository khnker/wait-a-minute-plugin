/**
 * Sufficiency Contract tests — contract-based context sufficiency.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateContract,
  evaluateContract,
  mergeAssumptions,
  CONDITION_TYPES,
} from "./sufficiency-contract.js";

describe("CONDITION_TYPES", () => {
  it("defines all condition types", () => {
    assert.ok(CONDITION_TYPES.PROJECT_KNOWLEDGE);
    assert.ok(CONDITION_TYPES.DECISION);
    assert.ok(CONDITION_TYPES.CONSTRAINT);
    assert.ok(CONDITION_TYPES.DEPENDENCY);
    assert.ok(CONDITION_TYPES.VERIFICATION);
    assert.ok(CONDITION_TYPES.UNKNOWN_RESOLUTION);
  });
});

describe("generateContract", () => {
  it("generates auth conditions for auth task", () => {
    const contract = generateContract("fix OAuth login flow", "task-1");
    assert.ok(contract.conditions.length > 0);
    const types = contract.conditions.map((c) => c.type);
    assert.ok(types.includes(CONDITION_TYPES.DECISION));
    assert.ok(types.includes(CONDITION_TYPES.PROJECT_KNOWLEDGE));
  });

  it("generates migration conditions for migration task", () => {
    const contract = generateContract("database change to add column", "task-2");
    const types = contract.conditions.map((c) => c.type);
    assert.ok(types.includes(CONDITION_TYPES.CONSTRAINT));
  });

  it("generates security conditions for security task", () => {
    const contract = generateContract("fix XSS vulnerability in comments", "task-3");
    const types = contract.conditions.map((c) => c.type);
    assert.ok(types.includes(CONDITION_TYPES.DECISION));
    assert.ok(types.includes(CONDITION_TYPES.CONSTRAINT));
  });

  it("always includes project knowledge", () => {
    const contract = generateContract("simple bug fix", "task-4");
    const types = contract.conditions.map((c) => c.type);
    assert.ok(types.includes(CONDITION_TYPES.PROJECT_KNOWLEDGE));
  });

  it("starts with all conditions MISSING", () => {
    const contract = generateContract("auth and migration task", "task-5");
    for (const c of contract.conditions) {
      assert.equal(c.status, "MISSING");
    }
  });

  it("starts with sufficient=false when conditions exist", () => {
    const contract = generateContract("auth task", "task-6");
    // Should have at least 2 conditions, so sufficient=false initially
    assert.ok(contract.conditions.length >= 2);
    assert.equal(contract.sufficient, false);
  });

  it("generates unique IDs for conditions", () => {
    const contract = generateContract("auth and security task", "task-7");
    const ids = contract.conditions.map((c) => c.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size);
  });
});

describe("evaluateContract", () => {
  it("satisfies condition when capsule covers auth decision", () => {
    const contract = generateContract("fix OAuth login", "task-10");
    const capsules = [
      {
        context_id: "capsule-auth",
        purpose: "Auth mechanism decision: OAuth2 with JWT",
        scope: "authentication",
        content: "Decision: Use OAuth2 with JWT tokens for auth",
      },
    ];
    const result = evaluateContract(contract, capsules);
    const authDecision = result.conditions.find(
      (c) => c.type === CONDITION_TYPES.DECISION && c.description.includes("Auth")
    );
    assert.ok(authDecision);
    assert.equal(authDecision.status, "SATISFIED");
    assert.equal(authDecision.source, "capsule");
  });

  it("leaves condition MISSING when no capsule covers it", () => {
    const contract = generateContract("fix OAuth login", "task-11");
    const capsules = [
      {
        context_id: "capsule-unrelated",
        purpose: "UI styling",
        scope: "frontend",
        content: "CSS changes for button",
      },
    ];
    const result = evaluateContract(contract, capsules);
    const missingConditions = result.conditions.filter((c) => c.status === "MISSING");
    assert.ok(missingConditions.length > 0);
  });

  it("recalculates sufficient=true when all MANDATORY satisfied", () => {
    // Simple task that only requires project knowledge
    const contract = generateContract("simple fix", "task-12");
    const capsules = [
      {
        context_id: "capsule-project",
        purpose: "Project structure",
        scope: "architecture",
        content: "This is a Node.js project with package.json dependencies",
      },
    ];
    const result = evaluateContract(contract, capsules);
    // All conditions should be satisfied or not MANDATORY
    const mandatoryMissing = result.conditions.filter(
      (c) => c.status === "MISSING" && c.severity === "MANDATORY"
    );
    assert.equal(mandatoryMissing.length, 0);
  });

  it("returns missing descriptions for unsatisfied conditions", () => {
    const contract = generateContract("auth and migration task", "task-13");
    const capsules = [];
    const result = evaluateContract(contract, capsules);
    assert.ok(result.missing.length > 0);
    assert.ok(typeof result.missing[0] === "string");
  });
});

describe("mergeAssumptions", () => {
  it("adds DECISION_CRITICAL assumptions as BLOCKED conditions", () => {
    const contract = generateContract("simple task", "task-20");
    const assumptions = [
      {
        id: "A1",
        statement: "Using PostgreSQL as database",
        classification: "DECISION_CRITICAL",
        status: "active",
      },
    ];
    const result = mergeAssumptions(contract, assumptions);
    const blockedCondition = result.conditions.find(
      (c) => c.type === CONDITION_TYPES.UNKNOWN_RESOLUTION && c.status === "BLOCKED"
    );
    assert.ok(blockedCondition);
    assert.equal(blockedCondition.description, "Using PostgreSQL as database");
  });

  it("does not duplicate existing conditions", () => {
    const contract = generateContract("simple task", "task-21");
    const assumptions = [
      {
        id: "A1",
        statement: "Project structure and dependencies",
        classification: "DECISION_CRITICAL",
        status: "active",
      },
    ];
    const result = mergeAssumptions(contract, assumptions);
    const projectKnowledge = result.conditions.filter(
      (c) => c.type === CONDITION_TYPES.PROJECT_KNOWLEDGE
    );
    assert.equal(projectKnowledge.length, 1);
  });

  it("updates missing list with BLOCKED conditions", () => {
    const contract = generateContract("simple task", "task-22");
    const assumptions = [
      {
        id: "A1",
        statement: "Database choice is critical",
        classification: "DECISION_CRITICAL",
        status: "active",
      },
    ];
    const result = mergeAssumptions(contract, assumptions);
    assert.ok(result.missing.some((m) => m.includes("Database choice")));
  });

  it("handles empty assumptions array", () => {
    const contract = generateContract("simple task", "task-23");
    const result = mergeAssumptions(contract, []);
    assert.ok(result.conditions.length > 0);
  });

  it("handles null assumptions", () => {
    const contract = generateContract("simple task", "task-24");
    const result = mergeAssumptions(contract, null);
    assert.ok(result.conditions.length > 0);
  });
});
