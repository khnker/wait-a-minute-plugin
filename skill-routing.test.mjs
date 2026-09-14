/**
 * Skill Routing Constraints tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectLayer,
  getSkillConstraints,
  canModifyLayer,
  checkDependencies,
  routeWithConstraints,
  DEFAULT_CONSTRAINTS,
} from "./skill-routing.js";

describe("detectLayer", () => {
  it("detects frontend layer for Angular component", () => {
    assert.equal(detectLayer("src/app/user/user.component.ts"), "frontend");
  });

  it("detects frontend layer for React component", () => {
    assert.equal(detectLayer("src/components/Button.tsx"), "frontend");
  });

  it("detects backend layer for NestJS controller", () => {
    assert.equal(detectLayer("src/user/user.controller.ts"), "backend");
  });

  it("detects backend layer for entity", () => {
    assert.equal(detectLayer("src/entities/user.entity.ts"), "backend");
  });

  it("detects infrastructure layer for Docker", () => {
    assert.equal(detectLayer("Dockerfile"), "infrastructure");
  });

  it("detects shared layer for utils", () => {
    assert.equal(detectLayer("src/shared/helpers.ts"), "shared");
  });

  it("returns null for ambiguous files", () => {
    assert.equal(detectLayer("README.md"), null);
  });
});

describe("getSkillConstraints", () => {
  it("returns default constraints for known skills", () => {
    const constraints = getSkillConstraints("angular-developer");
    assert.deepEqual(constraints.allowedLayers, ["frontend"]);
    assert.ok(constraints.conflicts.includes("nestjs-best-practices"));
  });

  it("returns default constraints for NestJS skills", () => {
    const constraints = getSkillConstraints("nestjs-best-practices");
    assert.deepEqual(constraints.allowedLayers, ["backend"]);
  });

  it("allows all layers for unknown skills", () => {
    const constraints = getSkillConstraints("unknown-skill");
    assert.equal(constraints.allowedLayers.length, 4);
  });

  it("uses registry constraints when provided", () => {
    const registry = {
      "custom-skill": {
        constraints: {
          allowedLayers: ["frontend"],
          dependsOn: [],
          conflicts: [],
          reason: "Custom constraint",
        },
      },
    };
    const constraints = getSkillConstraints("custom-skill", registry);
    assert.deepEqual(constraints.allowedLayers, ["frontend"]);
    assert.equal(constraints.reason, "Custom constraint");
  });
});

describe("canModifyLayer", () => {
  it("allows Angular skill to modify frontend", () => {
    const result = canModifyLayer("angular-developer", "frontend");
    assert.equal(result.allowed, true);
  });

  it("rejects Angular skill to modify backend", () => {
    const result = canModifyLayer("angular-developer", "backend");
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes("NOT allowed"));
  });

  it("allows NestJS skill to modify backend", () => {
    const result = canModifyLayer("nestjs-best-practices", "backend");
    assert.equal(result.allowed, true);
  });

  it("rejects NestJS skill to modify frontend", () => {
    const result = canModifyLayer("nestjs-best-practices", "frontend");
    assert.equal(result.allowed, false);
  });
});

describe("checkDependencies", () => {
  it("returns empty when no dependencies", () => {
    const decisions = checkDependencies("angular-developer", []);
    assert.equal(decisions.length, 0);
  });

  it("detects conflict between Angular and NestJS", () => {
    const decisions = checkDependencies("angular-developer", ["nestjs-best-practices"]);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].reasonType, "conflict");
  });

  it("detects missing dependency", () => {
    const registry = {
      "dependent-skill": {
        constraints: {
          allowedLayers: ["frontend"],
          dependsOn: ["base-skill"],
          conflicts: [],
          reason: "Requires base skill",
        },
      },
    };
    const decisions = checkDependencies("dependent-skill", [], registry);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].reasonType, "dependency");
  });
});

describe("routeWithConstraints", () => {
  it("allows Angular skill for frontend files", () => {
    const result = routeWithConstraints(
      ["angular-developer"],
      ["src/app/user.component.ts"]
    );
    assert.equal(result.allowed.length, 1);
    assert.equal(result.rejected.length, 0);
  });

  it("rejects Angular skill for backend files", () => {
    const result = routeWithConstraints(
      ["angular-developer"],
      ["src/user/user.controller.ts"]
    );
    assert.equal(result.allowed.length, 0);
    assert.equal(result.rejected.length, 1);
  });

  it("rejects conflicting skills", () => {
    const result = routeWithConstraints(
      ["angular-developer", "nestjs-best-practices"],
      ["src/app/app.component.ts"]
    );
    assert.equal(result.allowed.length, 1);
    assert.equal(result.rejected.length, 1);
  });

  it("detects target layers", () => {
    const result = routeWithConstraints(
      ["efficient-coding"],
      ["src/app/component.ts", "src/user.controller.ts"]
    );
    assert.ok(result.targetLayers.includes("frontend"));
    assert.ok(result.targetLayers.includes("backend"));
  });
});

describe("DEFAULT_CONSTRAINTS", () => {
  it("has constraints for Angular", () => {
    assert.ok(DEFAULT_CONSTRAINTS["angular-developer"]);
    assert.deepEqual(DEFAULT_CONSTRAINTS["angular-developer"].allowedLayers, ["frontend"]);
  });

  it("has constraints for NestJS", () => {
    assert.ok(DEFAULT_CONSTRAINTS["nestjs-best-practices"]);
    assert.deepEqual(DEFAULT_CONSTRAINTS["nestjs-best-practices"].allowedLayers, ["backend"]);
  });
});
