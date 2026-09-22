/**
 * Unit tests for context-rate-distortion.js (C05 — context-rate-distortion).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRateDistortion,
  crrAt,
  distortionAt,
  aggregateRateDistortion,
} from "./context-rate-distortion.js";
import { buildOracleGraph } from "./context-sufficiency-oracle.js";
import { EDGE_TYPES } from "./context-graph.js";

function graph(nodes, edges) {
  return buildOracleGraph({ nodes, edges });
}

test("RD: full budget yields rate=0 and sufficient=true", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 50, priority: 1 },
      { id: "b", tokens: 30, priority: 1 },
    ],
  });
  assert.equal(report.fullTokens, 80);
  const full = report.curve[report.curve.length - 1];
  assert.equal(full.rate, 0);
  assert.equal(full.distortion, 0);
  assert.equal(full.sufficient, true);
});

test("RD: insufficient budget yields distortion=1 and sufficient=false", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 50, priority: 1 },
      { id: "b", tokens: 30, priority: 2 },
    ],
    budgets: [0, 10, 80],
  });
  const zero = report.curve.find((p) => p.budget === 0);
  assert.equal(zero.sufficient, false);
  assert.equal(zero.distortion, 1);
  assert.equal(zero.rate, 1); // 0 tokens used
  const tiny = report.curve.find((p) => p.budget === 10);
  assert.equal(tiny.sufficient, false);
  const ok = report.curve.find((p) => p.budget === 80);
  assert.equal(ok.sufficient, true);
});

test("RD: operatingPoint is first sufficient point", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 50, priority: 1 },
      { id: "b", tokens: 30, priority: 1 },
    ],
    budgets: [0, 20, 50, 80],
  });
  assert.ok(report.operatingPoint);
  // budget 50 picks only "a" (50 tokens) → still missing b → not sufficient
  // budget 80 picks both → sufficient
  assert.equal(report.operatingPoint.budget, 80);
  assert.equal(report.operatingPoint.sufficient, true);
});

test("RD: rate = 1 - tokensUsed/fullTokens", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [{ from: "task", to: "a", type: "requires" }],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 40, priority: 1 },
      { id: "b", tokens: 60, priority: 1 },
    ],
    budgets: [40], // selects task + a, uses 40 of 100
  });
  const p = report.curve[0];
  assert.equal(p.tokensUsed, 40);
  assert.equal(p.rate, 0.6);
  assert.equal(p.sufficient, true);
  assert.equal(report.crr, 0.6);
});

test("RD: priority ordering picks high-priority first", () => {
  const g = graph(
    [{ id: "task" }, { id: "hi" }, { id: "lo" }],
    [
      { from: "task", to: "hi", type: "requires" },
      { from: "task", to: "lo", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "lo", tokens: 50, priority: 1 },
      { id: "hi", tokens: 50, priority: 10 },
    ],
    budgets: [50],
  });
  const p = report.curve[0];
  assert.ok(p.selected.includes("task"));
  assert.ok(p.selected.includes("hi"));
  assert.equal(p.sufficient, false); // missing "lo"
});

test("RD: tie-break by id is deterministic", () => {
  const g = graph(
    [{ id: "task" }, { id: "x" }, { id: "y" }],
    [{ from: "task", to: "x", type: "requires" }],
  );
  const r1 = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "x", tokens: 10, priority: 0 },
      { id: "y", tokens: 10, priority: 0 },
    ],
    budgets: [10],
  });
  const r2 = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "y", tokens: 10, priority: 0 },
      { id: "x", tokens: 10, priority: 0 },
    ],
    budgets: [10],
  });
  assert.deepEqual(r1.curve[0].selected, r2.curve[0].selected);
});

test("RD: zero fullTokens yields rate=1", () => {
  const g = graph([{ id: "task" }], []);
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [],
    budgets: [0],
  });
  assert.equal(report.fullTokens, 0);
  assert.equal(report.curve[0].rate, 1);
});

test("RD: stats.unreachableRequired tracks required nodes never selected", () => {
  const g = graph(
    [{ id: "task" }, { id: "cheap" }, { id: "huge" }],
    [
      { from: "task", to: "cheap", type: "requires" },
      { from: "task", to: "huge", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "cheap", tokens: 10, priority: 5 },
      { id: "huge", tokens: 10000, priority: 5 },
    ],
    budgets: [10, 100],
  });
  assert.ok(report.stats.unreachableRequired.includes("huge"));
  assert.equal(report.stats.unreachableRequiredCount, 1);
});

test("RD: maxRate is the largest rate where distortion===0", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 10, priority: 1 },
      { id: "b", tokens: 90, priority: 1 },
    ],
    budgets: [0, 10, 100],
  });
  // budget 10 → task + a → still missing b → not sufficient
  // budget 100 → all → sufficient (rate 0)
  // → maxRate should be 0 (only sufficient point is full)
  assert.equal(report.maxRate, 0);
  assert.equal(report.crr, 0);
});

test("crrAt: returns 0 when budget not in curve", () => {
  const g = graph([{ id: "task" }], []);
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [{ id: "a", tokens: 5 }],
    budgets: [5],
  });
  assert.equal(crrAt(report, 9999), 0);
  assert.equal(crrAt(report, 5), report.curve[0].rate);
});

test("distortionAt: returns 1 when budget not in curve", () => {
  const g = graph([{ id: "task" }], []);
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [{ id: "task", tokens: 0, priority: 100 }, { id: "a", tokens: 5 }],
    budgets: [5],
  });
  assert.equal(distortionAt(report, 9999), 1);
  assert.equal(distortionAt(report, 5), 0);
});

test("aggregateRateDistortion: averages over reports", () => {
  const r1 = { crr: 0.5, maxRate: 0.4, curve: [{}, {}] };
  const r2 = { crr: 0.3, maxRate: 0.2, curve: [{}] };
  const out = aggregateRateDistortion([r1, r2]);
  assert.equal(out.meanCrr, 0.4);
  assert.ok(Math.abs(out.meanMaxRate - 0.3) < 1e-10);
  assert.equal(out.pointCount, 3);
  // NaN safety: a report with crr=NaN should not poison the mean
  const r3 = { crr: NaN, maxRate: 0.4, curve: [{}] };
  const out2 = aggregateRateDistortion([r1, r3]);
  assert.equal(out2.meanCrr, 0.25);
});

test("aggregateRateDistortion: empty input", () => {
  const out = aggregateRateDistortion([]);
  assert.deepEqual(out, { meanCrr: 0, meanMaxRate: 0, pointCount: 0 });
  assert.deepEqual(aggregateRateDistortion(null), { meanCrr: 0, meanMaxRate: 0, pointCount: 0 });
});

test("RD: validates inputs", () => {
  assert.throws(() => computeRateDistortion(null), /required/);
  assert.throws(() => computeRateDistortion({}), /taskId/);
  assert.throws(() => computeRateDistortion({ taskId: "t" }), /candidates/);
  assert.throws(
    () => computeRateDistortion({ taskId: "t", candidates: [], oracleGraph: null }),
    /oracleGraph/,
  );
});

test("RD: derived budgets include unique prefix sums", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }, { id: "b" }],
    [
      { from: "task", to: "a", type: "requires" },
      { from: "task", to: "b", type: "requires" },
    ],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 30, priority: 1 },
      { id: "b", tokens: 20, priority: 2 },
    ],
  });
  const budgets = report.curve.map((p) => p.budget);
  assert.ok(budgets.includes(0));
  assert.ok(budgets.includes(20));
  assert.ok(budgets.includes(50));
  assert.ok(!budgets.includes(80)); // no candidates at 80 to derive it
});

test("RD: respects EDGE_TYPES.REQUIRES for closure", () => {
  // Closure computed from a graph where task→req is REQUIRES.
  // When only "task" and "req" are selected (budget=10), closure
  // = {task, req} → sufficient. "noise" fails admission and is
  // not selected.
  const g = {
    getNode: (id) => ({ id }),
    getEdges: () => [{ from: "task", to: "req", type: "requires_completion" }],
    getEdgesFrom: (id) =>
      [{ from: "task", to: "req", type: "requires_completion" }].filter((e) => e.from === id),
    getEdgesTo: () => [],
  };
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "req", tokens: 10, priority: 1 },
    ],
    budgets: [10],
  });
  assert.equal(report.curve[0].sufficient, true);
  assert.equal(report.curve[0].selected.includes("req"), true);
});

test("RD: derived sweep includes a final full budget", () => {
  const g = graph(
    [{ id: "task" }, { id: "a" }],
    [{ from: "task", to: "a", type: "requires" }],
  );
  const report = computeRateDistortion({
    taskId: "task",
    oracleGraph: g,
    candidates: [
      { id: "task", tokens: 0, priority: 100 },
      { id: "a", tokens: 42, priority: 1 },
    ],
  });
  const last = report.curve[report.curve.length - 1];
  assert.equal(last.budget, 42);
  assert.equal(last.rate, 0);
});
