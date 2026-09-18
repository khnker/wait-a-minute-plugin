import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assembleContextWithQuery,
  CONTEXT_ASSEMBLY_STATUS,
  assembleContext,
} from "./context-assembly-contract.js";
import { CONTEXT_PURPOSE } from "./context-query-contract.js";
import { SUFFICIENCY_LEVEL } from "./context-sufficiency-gate.js";

test("contract: CONTEXT_ASSEMBLY_STATUS has expected values", () => {
  assert.ok(CONTEXT_ASSEMBLY_STATUS.PROCEED);
  assert.ok(CONTEXT_ASSEMBLY_STATUS.BLOCK);
});

test("contract: assembleContextWithQuery returns PROCEED when no items", () => {
  const result = assembleContextWithQuery({
    taskId: "t1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    projectPath: "/tmp",
    budget: 4000,
    items: [],
  });
  assert.equal(result.status, CONTEXT_ASSEMBLY_STATUS.PROCEED);
  assert.ok(result.query);
  assert.ok(result.sufficiency);
  assert.ok(result.context);
});

test("contract: assembleContextWithQuery returns BLOCK when insufficient", () => {
  const items = [{ lifecycle: "INVALIDATED" }];
  const result = assembleContextWithQuery({
    taskId: "t1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    projectPath: "/tmp",
    budget: 4000,
    items,
    minLevel: SUFFICIENCY_LEVEL.COMPLETE,
  });
  assert.equal(result.status, CONTEXT_ASSEMBLY_STATUS.BLOCK);
  assert.equal(result.context, null);
});

test("contract: assembleContextWithQuery passes query to context", () => {
  const result = assembleContextWithQuery({
    taskId: "t1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    projectPath: "/tmp",
    budget: 4000,
    items: [],
    requirementId: "R1",
  });
  assert.equal(result.query.requirementId, "R1");
  assert.ok(result.context);
});

test("contract: assembleContextWithQuery includes unresolvedCriticalUnknowns in taskState", () => {
  const items = [{ lifecycle: "ACTIVE", unresolvedCriticalUnknowns: [{ reason: "missing runtime" }] }];
  const result = assembleContextWithQuery({
    taskId: "t1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    projectPath: "/tmp",
    budget: 4000,
    items,
  });
  assert.equal(result.sufficiency.level, "PARTIAL");
  assert.ok(result.context);
});

test("contract: assembleContextWithQuery respects minLevel option", () => {
  const items = [{ lifecycle: "ACTIVE" }];
  const result = assembleContextWithQuery({
    taskId: "t1",
    purpose: CONTEXT_PURPOSE.PLANNING,
    projectPath: "/tmp",
    budget: 4000,
    items,
    minLevel: SUFFICIENCY_LEVEL.COMPLETE,
  });
  assert.equal(result.status, CONTEXT_ASSEMBLY_STATUS.BLOCK);
});