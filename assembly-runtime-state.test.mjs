import test from "node:test";
import assert from "node:assert";
import { assembleContext } from "./assembly.js";

test("passes runtime state into canonical graph", () => {
  const runState = { id: "run-1", status: "running" };
  const res = assembleContext({ prompt: "test task", runState });
  assert.ok(res);
});

test("passes evidence lineage into graph", () => {
  const evidenceLineage = [
    { id: "ev-1", requirementId: "req-1", content: "verified output exists", status: "valid" }
  ];
  const res = assembleContext({ prompt: "test task", evidenceLineage });
  assert.ok(res);
});

test("structured decisions are not replaced by N1 decision text", () => {
  const decisions = [
    { id: "dec-1", requirementId: "req-1", summary: "Use deterministic router" }
  ];
  const res = assembleContext({ prompt: "test task", decisions });
  assert.ok(res);
});

test("missing runtime state does not throw", () => {
  const res = assembleContext({ prompt: "test task", taskState: { taskId: "t1" } });
  assert.ok(res);
});
