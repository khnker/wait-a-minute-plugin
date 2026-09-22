/**
 * Unit tests for context-sufficiency-oracle.js (C04 — context-sufficiency-oracle).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRequiredClosure,
  verifySufficiency,
  isSufficient,
  buildOracleGraph,
  ORACLE_CLOSURE_EDGE_TYPES,
} from "./context-sufficiency-oracle.js";
import { EDGE_TYPES } from "./context-graph.js";

function graph(nodes, edges) {
  return buildOracleGraph({ nodes, edges });
}

test("oracle: computeRequiredClosure returns task only when no edges", () => {
  const g = graph([{ id: "task-1" }, { id: "other" }], []);
  assert.deepEqual(computeRequiredClosure("task-1", g), ["task-1"]);
});

test("oracle: walks REQUIRES edges transitively", () => {
  const g = graph(
    [
      { id: "task" },
      { id: "req-1" },
      { id: "req-2" },
      { id: "req-3" },
    ],
    [
      { from: "task", to: "req-1", type: EDGE_TYPES.REQUIRES },
      { from: "req-1", to: "req-2", type: "requires" },
      { from: "req-2", to: "req-3", type: EDGE_TYPES.DEPENDS_ON },
    ],
  );
  const closure = computeRequiredClosure("task", g);
  assert.deepEqual(closure, ["req-1", "req-2", "req-3", "task"]);
});

test("oracle: walks incoming DEPENDS_ON edges (reverse direction)", () => {
  const g = graph(
    [{ id: "task" }, { id: "child" }],
    [{ from: "child", to: "task", type: "depends_on" }],
  );
  const closure = computeRequiredClosure("task", g);
  assert.ok(closure.includes("child"));
  assert.ok(closure.includes("task"));
});

test("oracle: ignores non-closure edges (e.g. REFERENCES)", () => {
  const g = graph(
    [{ id: "task" }, { id: "soft" }, { id: "req" }],
    [
      { from: "task", to: "soft", type: "REFERENCES" },
      { from: "task", to: "req", type: EDGE_TYPES.REQUIRES },
    ],
  );
  const closure = computeRequiredClosure("task", g);
  assert.ok(closure.includes("req"));
  assert.ok(!closure.includes("soft"));
});

test("oracle: handles cycles without infinite loop", () => {
  const g = graph(
    [{ id: "a" }, { id: "b" }],
    [
      { from: "a", to: "b", type: "requires" },
      { from: "b", to: "a", type: "requires" },
    ],
  );
  const closure = computeRequiredClosure("a", g);
  assert.deepEqual(new Set(closure), new Set(["a", "b"]));
});

test("oracle: throws on missing task node", () => {
  const g = graph([{ id: "x" }], []);
  assert.throws(() => computeRequiredClosure("nope", g), /not in graph/);
});

test("oracle: throws on invalid args", () => {
  assert.throws(() => computeRequiredClosure(null, {}), /taskId/);
  assert.throws(() => computeRequiredClosure("x", null), /graph/);
});

test("oracle: verifySufficiency returns sufficient=true when selected ⊇ required", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [{ from: "task", to: "a", type: "requires" }, { from: "task", to: "b", type: "requires" }],
  );
  const result = verifySufficiency("task", g, ["task", "a", "b", "extras-are-ok"]);
  assert.equal(result.sufficient, true);
  assert.equal(result.missing.length, 0);
  assert.deepEqual(result.unused, ["extras-are-ok"]);
  assert.equal(result.stats.selectedCount, 4);
});

test("oracle: verifySufficiency returns sufficient=false when required missing", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }, { id: "c" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
      { from: "task", to: "c", type: "requires" },
    ],
  );
  const result = verifySufficiency("task", g, ["task", "a"]);
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.missing, ["b", "c"]);
  assert.equal(result.stats.missingCount, 2);
});

test("oracle: isSufficient returns boolean shortcut", () => {
  const g = graph(
    [{ id: "task" }, { id: "x" }],
    [{ from: "task", to: "x", type: "requires" }],
  );
  assert.equal(isSufficient("task", g, new Set(["task", "x"])), true);
  assert.equal(isSufficient("task", g, new Set(["task"])), false);
});

test("oracle: independent of admission classes (ground-truth check)", () => {
  const g = graph(
    [{ id: "task" }, { id: "must-have" }],
    [{ from: "task", to: "must-have", type: "requires" }],
  );
  // A router might label 'must-have' OPTIONAL and drop it, but the oracle
  // marks it required regardless.
  const result = verifySufficiency("task", g, new Set(["task"]));
  assert.equal(result.sufficient, false);
  assert.ok(result.missing.includes("must-have"));
});

test("oracle: ORACLE_CLOSURE_EDGE_TYPES exposes required edge types", () => {
  assert.ok(ORACLE_CLOSURE_EDGE_TYPES.includes(EDGE_TYPES.REQUIRES));
  assert.ok(ORACLE_CLOSURE_EDGE_TYPES.includes(EDGE_TYPES.DEPENDS_ON));
});
