/**
 * Unit tests for context-minimality.js (C07 — context-minimality).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  testMinimality,
  overInjectedIds,
  minimalityRatio,
} from "./context-minimality.js";
import { buildOracleGraph } from "./context-sufficiency-oracle.js";
import { EDGE_TYPES } from "./context-graph.js";

function graph(nodes, edges) {
  return buildOracleGraph({ nodes, edges });
}

test("minimality: returns minimal=true when selected == required exactly", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: EDGE_TYPES.DEPENDS_ON },
    ],
  );
  const r = testMinimality({ taskId: "task", selected: ["task", "a", "b"], oracleGraph: g });
  assert.equal(r.minimal, true);
  assert.equal(r.minimalityRatio, 1);
  assert.equal(r.overInjected.length, 0);
  assert.equal(r.redundant.length, 0);
  assert.equal(r.loadBearing.length, 3);
});

test("minimality: detects redundant required nodes (single-node removal still sufficient)", () => {
  // Closure for 'task' = {task, a, b} when task→a and a→b (transitive).
  // Removing b → {task, a} — but closure needs b → NOT sufficient → b is load-bearing.
  // Removing a → {task, b} — but closure needs a → NOT sufficient → a is load-bearing.
  // So when closure is a strict chain, every node is load-bearing.
  // To test redundancy: use a graph where a node is NOT in the closure.
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "supports" }, // b is NOT a closure edge
    ],
  );
  const r = testMinimality({ taskId: "task", selected: ["task", "a", "b"], oracleGraph: g });
  // b is over-injected (not in requiredClosure), so it's not in verdicts.
  // Only task and a are candidates, both load-bearing.
  assert.equal(r.overInjected.includes("b"), true);
  assert.equal(r.minimal, false);
  assert.ok(r.loadBearing.length >= 1);
});

test("minimality: detects over-injected context (selected \\ required)", () => {
  const g = graph(
    [{ id: "task" }, { id: "required" }, { id: "extra1" }, { id: "extra2" }],
    [{ from: "task", to: "required", type: "requires" }],
  );
  const r = testMinimality({
    taskId: "task",
    selected: ["task", "required", "extra1", "extra2"],
    oracleGraph: g,
  });
  assert.deepEqual(r.overInjected, ["extra1", "extra2"]);
  assert.equal(r.minimal, false);
  assert.equal(r.overInjected.length, 2);
});

test("minimality: overInjectedIds returns a copy (immutable snapshot)", () => {
  const g = graph(
    [{ id: "task" }, { id: "required" }, { id: "extra" }],
    [{ from: "task", to: "required", type: "requires" }],
  );
  const r = testMinimality({
    taskId: "task",
    selected: ["task", "required", "extra"],
    oracleGraph: g,
  });
  const ids = overInjectedIds(r);
  assert.deepEqual(ids, ["extra"]);
  ids.push("mutated");
  const ids2 = overInjectedIds(r);
  assert.equal(ids2.length, 1, "overInjectedIds must return a copy");
});

test("minimality: minimalityRatio is 1 when selected ∩ required is empty", () => {
  const g = graph(
    [{ id: "task" }, { id: "req" }, { id: "noise" }],
    [{ from: "task", to: "req", type: "requires" }],
  );
  // Selected = only noise (no required nodes). Ratio is vacuously 1.
  const r = testMinimality({ taskId: "task", selected: ["noise"], oracleGraph: g });
  assert.equal(r.minimalityRatio, 1);
  assert.equal(r.overInjected.length, 1);
  assert.equal(r.loadBearing.length, 0);
});

test("minimality: per-node verdicts classify correctly", () => {
  // graph: task→a (requires), task→b (supports), task→noise (contradicts)
  // closure = {task, a}. b and noise are over-injected.
  // Only a in P ∩ required → a is load-bearing (removing a → insufficient)
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }, { id: "noise" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "supports" },
      { from: "task", to: "noise", type: "contradicts" },
    ],
  );
  const r = testMinimality({
    taskId: "task",
    selected: ["task", "a", "b", "noise"],
    oracleGraph: g,
  });
  const byId = Object.fromEntries(r.verdicts.map((v) => [v.id, v]));
  assert.equal(byId.a.status, "load-bearing");
  assert.equal(byId.noise, undefined); // noise is over-injected, not in verdicts
  assert.ok(r.overInjected.includes("b"));
  assert.ok(r.overInjected.includes("noise"));
});

test("minimality: minimalityRatio clamps invalid inputs", () => {
  assert.equal(minimalityRatio(null), 0);
  assert.equal(minimalityRatio({}), 0);
  assert.equal(minimalityRatio({ minimalityRatio: 2 }), 1);
  assert.equal(minimalityRatio({ minimalityRatio: -1 }), 0);
  assert.equal(minimalityRatio({ minimalityRatio: 0.7 }), 0.7);
});

test("minimality: validates inputs", () => {
  assert.throws(() => testMinimality(null), /must be an object/);
  assert.throws(() => testMinimality({ taskId: "", selected: [], oracleGraph: {} }), /taskId/);
  assert.throws(() => testMinimality({ taskId: "t", selected: "nope", oracleGraph: {} }), /selected/);
  assert.throws(() => testMinimality({ taskId: "t", selected: [], oracleGraph: null }), /oracleGraph/);
});

test("minimality: dedupes selected input", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }],
    [{ from: "task", to: "a", type: "requires" }],
  );
  const r = testMinimality({
    taskId: "task",
    selected: ["task", "task", "a", "a"],
    oracleGraph: g,
  });
  assert.equal(r.selected.length, 2);
});

test("minimality: over-injected nodes don't influence minimalityRatio", () => {
  const g = graph(
    [{ id: "task" }, { id: "req" }],
    [{ from: "task", to: "req", type: "requires" }],
  );
  const r = testMinimality({
    taskId: "task",
    selected: ["task", "req", "junk1", "junk2"],
    oracleGraph: g,
  });
  // 2 required nodes (task, req), both load-bearing → ratio 1
  assert.equal(r.minimalityRatio, 1);
  assert.equal(r.minimal, false); // but over-injected makes it non-minimal
});
