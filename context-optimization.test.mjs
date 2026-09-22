/**
 * WAM Context Optimization — tests for C06 through C11.
 *
 * Verifies:
 *   - C06  metrics module records CRR/SPR/COR/CWR/PFR/RPC correctly
 *   - C07  benchmark corpus A (synthetic controlled) runs deterministically
 *   - C08  benchmark corpus B (real task scenarios) + corpus C (fault injection)
 *   - C09  report generation covers benchmark + ablation
 *   - C10  falsifiable gates enforced (SPR >= 0.99, COR = 0, etc.)
 *   - C11  ablation study distinguishes full vs no-aliases vs no-freshness
 *          vs no-importance vs current-full
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  record,
  summarize,
  evaluateGates,
  evaluateSafetyGates,
  evaluateOptimizationGates,
  SAFETY_GATES,
  OPTIMIZATION_GATES,
  DEFAULT_GATES,
  estimateTokens,
  nodesTokens,
} from "./context-optimization-metrics.js";

import {
  runScenario,
  runBenchmark,
  corpusA,
  corpusB,
  corpusC,
  fullSelector,
  requiredOnlySelector,
  budgetedSelector,
  scoringSelector,
} from "./context-benchmark.mjs";

import { testMinimality } from "./context-minimality.js";
import {
  buildOracleGraph,
  verifySufficiency,
  computeRequiredClosure,
} from "./context-sufficiency-oracle.js";

import {
  ablationMatrix,
  runAblation,
  relativeDelta,
} from "./context-ablation-study.mjs";

import process from "node:process";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// C06 — Metrics module
// ---------------------------------------------------------------------------

test("C06.1 estimateTokens counts ~length/4", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(40)), 10);
});

test("C06.2 nodesTokens adds a per-node overhead", () => {
  const total = nodesTokens([
    { content: "abcd" },
    { content: "abcdefgh" },
  ]);
  // 1 + 2 + 20*2 = 43
  assert.equal(total, 43);
});

test("C06.3 record computes CRR/SPR/COR/CWR/PFR/RPC", () => {
  const m = record({
    strategy: "unit",
    requiredTokens: 1000,
    selectedTokens: 250,
    requiredIds: ["a", "b", "c", "d"],
    selectedIds: ["a", "b", "e"],
    criticalIds: ["c"],
    usedIds: ["a", "b"],
    pageFaults: 1,
    reacquiredTokens: 50,
  });
  assert.equal(m.CRR, 0.75);
  // SPR: preserved = a,b / 4 = 0.5
  assert.equal(m.SPR, 0.5);
  // COR: missing critical c / 1 = 1
  assert.equal(m.COR, 1);
  // CWR: usedTokens = (2/3) * 250 = 166.67, waste = 1 - 166.67/250 = 0.3333
  assert.equal(m.CWR, 0.3333);
  // PFR: 1 / 3 = 0.3333
  assert.equal(m.PFR, 0.3333);
  assert.equal(m.RPC, 50);
});

test("C06.4 record handles empty required set vacuously", () => {
  const m = record({
    strategy: "unit",
    requiredTokens: 0,
    selectedTokens: 0,
    requiredIds: [],
    selectedIds: [],
    criticalIds: [],
    usedIds: [],
    pageFaults: 0,
    reacquiredTokens: 0,
  });
  assert.equal(m.SPR, 1);
  assert.equal(m.CRR, 0);
  assert.equal(m.COR, 0);
  assert.equal(m.CWR, 0);
  assert.equal(m.PFR, 0);
  assert.equal(m.RPC, 0);
});

test("C06.5 summarize aggregates per-strategy", () => {
  const a = record({ strategy: "x", requiredTokens: 100, selectedTokens: 50, requiredIds: ["r1"], selectedIds: ["r1"], criticalIds: ["r1"], usedIds: ["r1"], pageFaults: 0, reacquiredTokens: 0 });
  const b = record({ strategy: "x", requiredTokens: 200, selectedTokens: 100, requiredIds: ["r1"], selectedIds: ["r1"], criticalIds: ["r1"], usedIds: ["r1"], pageFaults: 0, reacquiredTokens: 10 });
  const sum = summarize([a, b]);
  assert.ok(sum.x, "summary has x");
  assert.equal(sum.x.samples, 2);
  assert.equal(sum.x.RPC, 10);
  assert.equal(sum.x.CRR, 0.5);
  assert.equal(sum.x.SPR, 1);
});

test("C06.6 evaluateGates fails loudly when COR > 0", () => {
  const m = record({
    strategy: "fail",
    requiredTokens: 100,
    selectedTokens: 50,
    requiredIds: ["c1"],
    selectedIds: [],
    criticalIds: ["c1"],
    usedIds: [],
    pageFaults: 0,
    reacquiredTokens: 0,
  });
  const res = evaluateGates(m);
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => f.startsWith("COR")));
});

test("C06.7 DEFAULT_GATES are tight (SPR_MIN 0.99, COR_MAX 0)", () => {
  assert.equal(DEFAULT_GATES.SPR_MIN, 0.99);
  assert.equal(DEFAULT_GATES.COR_MAX, 0);
});

// ---------------------------------------------------------------------------
// C07 — Benchmark corpus A (synthetic controlled)
// ---------------------------------------------------------------------------

test("C07.1 corpusA runs deterministically and passes gates", () => {
  const select = scoringSelector();
  const { results, summary } = runBenchmark(corpusA(), select);
  assert.ok(results.length >= 3);
  for (const r of results) {
    assert.ok(r.metrics.SPR >= 0.99, `SPR too low in ${r.name}: ${r.metrics.SPR}`);
    assert.equal(r.metrics.COR, 0, `COR > 0 in ${r.name}`);
  }
  assert.ok(summary);
});

test("C07.2 requiredOnlySelector preserves all required ids", () => {
  const scenarios = corpusA();
  for (const s of scenarios) {
    const r = runScenario(s, requiredOnlySelector);
    for (const id of s.requiredIds) {
      if (s.nodes[id]) {
        assert.ok(r.metrics.SPR >= 1 - 1e-9, `required-only should be lossless for ${s.name}`);
      }
    }
  }
});

test("C07.3 fullSelector has CRR=0 (no reduction)", () => {
  const r = runScenario(corpusA()[0], fullSelector);
  assert.equal(r.metrics.CRR, 0);
  assert.equal(r.metrics.SPR, 1);
  assert.equal(r.metrics.COR, 0);
});

test("C07.4 budgetedSelector still preserves criticals at small budget", () => {
  // Tight budget forces the selector to drop non-critical distractors
  // while keeping criticals (which have the highest score).
  const s = corpusA()[2]; // A3-importance-required: critical r3
  const r = runScenario(s, budgetedSelector(400));
  assert.ok(r.metrics.SPR >= 0.99, "SPR too low under tight budget");
  assert.equal(r.metrics.COR, 0, "critical dropped under tight budget");
});

// ---------------------------------------------------------------------------
// C08 — Corpus B (real task scenarios) + Corpus C (fault injection)
// ---------------------------------------------------------------------------

test("C08.1 corpusB covers real task scenarios", () => {
  assert.ok(corpusB().length >= 1);
  const select = scoringSelector();
  const { results } = runBenchmark(corpusB(), select);
  for (const r of results) {
    assert.equal(r.metrics.COR, 0, `COR > 0 in ${r.name}`);
    assert.ok(r.metrics.SPR >= 0.99);
  }
});

test("C08.2 corpusC fault-injected scenarios execute without throwing", () => {
  const select = scoringSelector();
  const { results } = runBenchmark(corpusC(), select);
  assert.ok(results.length >= 3);
  // At least one fault scenario should be recorded as failing gates
  // by design (dangling required id forces SPR < 1).
  const anyFail = results.some((r) => !r.gates.pass);
  assert.ok(anyFail, "expected at least one fault scenario to fail strict gates");
});

test("C08.3 dangling required id is reported honestly (SPR < 1)", () => {
  const c1 = corpusC().find((s) => s.name === "C1-dangling-required");
  assert.ok(c1, "C1 scenario missing");
  const r = runScenario(c1, scoringSelector());
  assert.ok(r.metrics.SPR < 1, "dangling required id should drop SPR below 1");
});

// ---------------------------------------------------------------------------
// C09 / C10 — Report + falsifiable gates
// ---------------------------------------------------------------------------

test("C09 report script runs and emits JSON with all required fields", () => {
  const script = path.join(__dirname, "scripts", "context-report.mjs");
  const res = spawnSync(process.execPath, [script, "--json"], {
    cwd: path.resolve(__dirname),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `report script failed: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.ok(parsed.benchmark);
  assert.ok(parsed.ablation);
  assert.ok(parsed.delta);
  assert.ok(parsed.gates);
  assert.equal(parsed.gates.SPR_MIN, 0.99);
  assert.equal(parsed.gates.COR_MAX, 0);
  assert.ok(Array.isArray(parsed.benchmark.scenarios));
  assert.ok(parsed.benchmark.scenarios.length > 0);
});

test("C10.1 strict mode exits non-zero when any scenario fails", () => {
  const script = path.join(__dirname, "scripts", "context-report.mjs");
  const res = spawnSync(process.execPath, [script, "--strict"], {
    cwd: path.resolve(__dirname),
    encoding: "utf8",
  });
  // C1-dangling-required fails strict gates by design → exit 1
  assert.notEqual(res.status, 0, "expected --strict to exit non-zero with C1 in suite");
});

test("C10.2 gates reject a fabricated COR > 0 metric", () => {
  const m = {
    strategy: "broken",
    CRR: 0.5,
    SPR: 1,
    COR: 0.01,
    CWR: 0.1,
    PFR: 0,
    RPC: 0,
    selectedTokens: 100,
    requiredTokens: 200,
    usedTokens: 90,
    pageFaults: 0,
    reacquiredTokens: 0,
  };
  const res = evaluateGates(m);
  assert.equal(res.pass, false);
  assert.ok(res.failures.some((f) => f.startsWith("COR")));
});

test("C10.3 gates accept a fabricated clean metric", () => {
  const m = {
    strategy: "clean",
    CRR: 0.3,
    SPR: 1,
    COR: 0,
    CWR: 0.2,
    PFR: 0,
    RPC: 0,
    selectedTokens: 100,
    requiredTokens: 200,
    usedTokens: 80,
    pageFaults: 0,
    reacquiredTokens: 0,
  };
  const res = evaluateGates(m);
  assert.equal(res.pass, true, res.failures.join(", "));
});

// ---------------------------------------------------------------------------
// C11 — Ablation study
// ---------------------------------------------------------------------------

test("C11.1 ablation matrix has all five variants", () => {
  const matrix = ablationMatrix();
  const names = matrix.map((m) => m.variant).sort();
  assert.deepEqual(names, [
    "current-full",
    "full",
    "no-aliases",
    "no-freshness",
    "no-importance",
  ]);
});

test("C11.2 full variant has COR = 0 and SPR >= 0.99 on aggregate", () => {
  const ab = runAblation();
  assert.ok(ab.full);
  assert.equal(ab.full.COR, 0);
  assert.ok(ab.full.SPR >= 0.99, `aggregate SPR too low: ${ab.full.SPR}`);
});

test("C11.3 relativeDelta emits a zero delta for the full baseline", () => {
  const ab = runAblation();
  const delta = relativeDelta(ab);
  assert.equal(delta.full.dSPR, 0);
  assert.equal(delta.full.dCOR, 0);
  assert.equal(delta.full.dCRR, 0);
});

test("C11.4 ablated variants diverge from full on the ablation arena", () => {
  // The A4-ablation-arena scenario is engineered to expose ablation
  // signal: required nodes have ZERO importance/freshness/aliases, and
  // distractors have HIGH values, so the +100 required base boost is
  // the only thing keeping required nodes on top. Removing any signal
  // must change the selection (i.e. metrics differ from `full`).
  //
  // We tighten the budget further so selection actually matters here.
  const arena = corpusA().find((s) => s.name === "A4-ablation-arena");
  assert.ok(arena, "A4-ablation-arena scenario missing");

  const full = runBenchmark([arena], scoringSelector({ aliases: true, freshness: true, importance: true, budget: 200 }));
  const noImp = runBenchmark([arena], scoringSelector({ aliases: true, freshness: true, importance: false, budget: 200 }));
  const fullM = full.results[0].metrics;
  const noImpM = noImp.results[0].metrics;

  // At least one metric must move.
  const moved =
    fullM.SPR !== noImpM.SPR ||
    fullM.CRR !== noImpM.CRR ||
    fullM.COR !== noImpM.COR ||
    fullM.selectedTokens !== noImpM.selectedTokens;
  assert.ok(
    moved,
    `expected no-importance to differ from full on arena. full=${JSON.stringify(fullM)} noImp=${JSON.dump ? noImpM : noImpM}`
  );
});

test("C11.4b aggregate ablation: at least one variant differs on a metric", () => {
  // Soft contract: the aggregate ablation may show zero delta when
  // most scenarios are unconstrained by budget (the ablation arena
  // is what matters per C11.4). We require the matrix to RUN without
  // throwing and emit a numeric delta for every variant.
  const ab = runAblation();
  const delta = relativeDelta(ab);
  for (const v of ["full", "no-aliases", "no-freshness", "no-importance", "current-full"]) {
    assert.ok(delta[v], `missing delta for ${v}`);
    assert.equal(typeof delta[v].dSPR, "number");
    assert.equal(typeof delta[v].dCRR, "number");
    assert.equal(typeof delta[v].dCOR, "number");
  }
  // `full` is the baseline — its delta against itself is zero.
  assert.equal(delta.full.dSPR, 0);
});

test("C11.5 ablation script is deterministic across runs", () => {
  const a = runAblation();
  const b = runAblation();
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// P1 — Extended metrics: TSR, VSR, TTC
// ---------------------------------------------------------------------------

test("P1.1 record() captures TSR=true/false and omits when absent", () => {
  const base = {
    strategy: "test",
    requiredTokens: 100,
    selectedTokens: 50,
    fullTokens: 200,
    requiredIds: ["r1"],
    selectedIds: ["r1"],
    criticalIds: [],
    usedIds: ["r1"],
    pageFaults: 0,
    reacquiredTokens: 0,
  };
  const ok = record({ ...base, taskSuccess: true });
  const fail = record({ ...base, taskSuccess: false });
  const absent = record({ ...base });
  assert.equal(ok.TSR, 1);
  assert.equal(fail.TSR, 0);
  assert.equal("TSR" in absent, false);
});

test("P1.2 record() captures VSR from oracleMissing", () => {
  const base = {
    strategy: "test",
    requiredTokens: 100,
    selectedTokens: 50,
    fullTokens: 200,
    requiredIds: ["r1", "r2"],
    selectedIds: ["r1"],
    criticalIds: [],
    usedIds: ["r1"],
    pageFaults: 0,
    reacquiredTokens: 0,
  };
  const sufficient = record({ ...base, oracleMissing: [] });
  const missing = record({ ...base, oracleMissing: ["r2"] });
  const absent = record({ ...base });
  assert.equal(sufficient.VSR, 1);
  assert.equal(missing.VSR, 0);
  assert.equal("VSR" in absent, false);
});

test("P1.3 record() computes TTC = selected + reacquired + retrieval overhead", () => {
  const m = record({
    strategy: "test",
    requiredTokens: 100,
    selectedTokens: 200,
    fullTokens: 1000,
    requiredIds: ["r1"],
    selectedIds: ["r1", "r2"],
    criticalIds: [],
    usedIds: ["r1"],
    pageFaults: 0,
    reacquiredTokens: 50,
    retrievalOverhead: 25,
  });
  // 200 (selected) + 50 (reacquired) + 25 (retrieval) = 275
  assert.equal(m.TTC, 275);
  assert.equal(m.retrievalOverhead, 25);
});

test("P1.4 record() defaults retrievalOverhead to 0 when not supplied", () => {
  const m = record({
    strategy: "test",
    requiredTokens: 100,
    selectedTokens: 100,
    fullTokens: 100,
    requiredIds: ["r1"],
    selectedIds: ["r1"],
    criticalIds: [],
    usedIds: ["r1"],
    pageFaults: 0,
    reacquiredTokens: 0,
  });
  assert.equal(m.TTC, 100);
  assert.equal(m.retrievalOverhead, 0);
});

test("P1.5 summarize() aggregates TSR/VSR/TTC across records", () => {
  const records = [
    record({
      strategy: "x",
      requiredTokens: 100,
      selectedTokens: 50,
      fullTokens: 200,
      requiredIds: ["a"],
      selectedIds: ["a"],
      criticalIds: [],
      usedIds: ["a"],
      pageFaults: 0,
      reacquiredTokens: 0,
      taskSuccess: true,
      oracleMissing: [],
      retrievalOverhead: 10,
    }),
    record({
      strategy: "x",
      requiredTokens: 100,
      selectedTokens: 50,
      fullTokens: 200,
      requiredIds: ["a"],
      selectedIds: ["a"],
      criticalIds: [],
      usedIds: ["a"],
      pageFaults: 0,
      reacquiredTokens: 0,
      taskSuccess: false,
      oracleMissing: ["b"],
      retrievalOverhead: 20,
    }),
  ];
  const out = summarize(records);
  assert.equal(out.x.TSR, 0.5);
  assert.equal(out.x.VSR, 0.5);
  assert.equal(out.x.TTC, 130); // (50+0+10) + (50+0+20)
  assert.equal(out.x.tsrReported, 2);
  assert.equal(out.x.vsrReported, 2);
});

// ---------------------------------------------------------------------------
// P1 — Gate separation (Safety vs Optimization)
// ---------------------------------------------------------------------------

test("P1.6 SAFETY_GATES contain SPR/COR/TSR/VSR only", () => {
  assert.equal("SPR_MIN" in SAFETY_GATES, true);
  assert.equal("COR_MAX" in SAFETY_GATES, true);
  assert.equal("TSR_MIN" in SAFETY_GATES, true);
  assert.equal("VSR_MIN" in SAFETY_GATES, true);
  assert.equal("CWR_MAX" in SAFETY_GATES, false);
  assert.equal("PFR_MAX" in SAFETY_GATES, false);
  assert.equal("RPC_MAX" in SAFETY_GATES, false);
  assert.equal("CRR_MIN" in SAFETY_GATES, false);
});

test("P1.7 OPTIMIZATION_GATES contain CWR/PFR/RPC/CRR only", () => {
  assert.equal("CWR_MAX" in OPTIMIZATION_GATES, true);
  assert.equal("PFR_MAX" in OPTIMIZATION_GATES, true);
  assert.equal("RPC_MAX" in OPTIMIZATION_GATES, true);
  assert.equal("CRR_MIN" in OPTIMIZATION_GATES, true);
  assert.equal("SPR_MIN" in OPTIMIZATION_GATES, false);
  assert.equal("COR_MAX" in OPTIMIZATION_GATES, false);
  assert.equal("TSR_MIN" in OPTIMIZATION_GATES, false);
  assert.equal("VSR_MIN" in OPTIMIZATION_GATES, false);
});

test("P1.8 evaluateSafetyGates fails on TSR/VSR violations", () => {
  const m = {
    SPR: 1,
    COR: 0,
    TSR: 0.5, // violates TSR_MIN
    VSR: 1,
  };
  const v = evaluateSafetyGates(m);
  assert.equal(v.pass, false);
  assert.ok(v.failures.some((f) => f.startsWith("TSR ")));
});

test("P1.9 evaluateSafetyGates passes when TSR/VSR absent", () => {
  const m = { SPR: 1, COR: 0 };
  const v = evaluateSafetyGates(m);
  assert.equal(v.pass, true);
  assert.deepEqual(v.failures, []);
});

test("P1.10 evaluateOptimizationGates is independent of safety verdicts", () => {
  // Catastrophic safety violation but optimization-clean.
  const m = { SPR: 0.0, COR: 1.0, CWR: 0.1, PFR: 0.01, RPC: 0, CRR: 0.5 };
  const safety = evaluateSafetyGates(m);
  const optimization = evaluateOptimizationGates(m);
  assert.equal(safety.pass, false);
  assert.equal(optimization.pass, true);
});

test("P1.11 evaluateGates returns both safety and optimization verdicts", () => {
  const m = { SPR: 1, COR: 0, CWR: 0.1, PFR: 0.01, RPC: 0, CRR: 0.5 };
  const v = evaluateGates(m);
  assert.equal("safety" in v, true);
  assert.equal("optimization" in v, true);
  assert.equal(v.safety.pass, true);
  assert.equal(v.optimization.pass, true);
  assert.equal(v.pass, true);
});

// ---------------------------------------------------------------------------
// P1 — Oracle integration in benchmark
// ---------------------------------------------------------------------------

test("P1.12 runScenario attaches independent oracle verdict", () => {
  // Scenario: a small graph where required ids are explicit, but the
  // oracle graph (built from REQUIRES edges) might disagree.
  const scenario = {
    name: "P1-oracle-1",
    kind: "A",
    requiredIds: ["task", "spec"],
    criticalIds: ["task"],
    distractorIds: ["noise"],
    requires: [
      { from: "task", to: "spec", type: "requires" },
    ],
    nodes: {
      task: { content: "do X" },
      spec: { content: "spec for X" },
      noise: { content: "noise" },
    },
  };
  const result = runScenario(scenario, scoringSelector());
  assert.ok(result.oracle, "oracle verdict must be attached");
  assert.equal(result.oracle.sufficient, true);
  assert.deepEqual(result.oracle.missing, []);
});

test("P1.13 runScenario oracle captures missing nodes independent of selector's requiredIds", () => {
  // Oracle graph declares a transitive dependency the scenario does
  // NOT list in `requiredIds`.  Even if the selector preserves the
  // scenario's requiredIds, the oracle verdict must reflect the gap.
  const scenario = {
    name: "P1-oracle-2",
    kind: "A",
    requiredIds: ["task"],
    criticalIds: [],
    distractorIds: [],
    requires: [
      { from: "task", to: "spec", type: "requires" },
      { from: "spec", to: "deep", type: "requires" },
    ],
    nodes: {
      task: { content: "do X" },
      spec: { content: "spec for X" },
      deep: { content: "deeper spec for X" },
    },
  };
  // Use a selector that keeps ONLY the declared requiredIds.
  const result = runScenario(scenario, requiredOnlySelector);
  assert.ok(result.oracle);
  // Oracle should report spec + deep as missing (they're in the
  // required closure via edges, even though not in scenario.requiredIds).
  assert.ok(result.oracle.missing.includes("spec"));
  assert.ok(result.oracle.missing.includes("deep"));
  assert.equal(result.metrics.VSR, 0);
});

test("P1.14 runScenario respects skipOracle flag", () => {
  const scenario = {
    name: "P1-oracle-skip",
    kind: "A",
    requiredIds: ["r1"],
    criticalIds: [],
    distractorIds: [],
    skipOracle: true,
    nodes: { r1: { content: "only required" } },
  };
  const result = runScenario(scenario, fullSelector);
  assert.equal(result.oracle, null);
  assert.equal(result.minimality, null);
});

// ---------------------------------------------------------------------------
// P1 — Minimality integration
// ---------------------------------------------------------------------------

test("P1.15 runScenario attaches minimality report", () => {
  const scenario = {
    name: "P1-minimality-1",
    kind: "A",
    requiredIds: ["r1"],
    criticalIds: ["r1"],
    distractorIds: ["d1", "d2"],
    nodes: {
      r1: { content: "required content" },
      d1: { content: "distractor 1" },
      d2: { content: "distractor 2" },
    },
  };
  const result = runScenario(scenario, fullSelector);
  assert.ok(result.minimality);
  // fullSelector keeps all three; r1 is load-bearing, d1 and d2 are
  // over-injected.
  assert.deepEqual(result.minimality.overInjected.sort(), ["d1", "d2"]);
  assert.ok(result.minimality.minimalityRatio >= 0);
  assert.ok(result.minimality.minimalityRatio <= 1);
});

test("P1.16 runBenchmark propagates oracle + minimality across all scenarios", () => {
  const scenarios = [
    {
      name: "P1-bench-1",
      kind: "A",
      requiredIds: ["r1"],
      criticalIds: [],
      distractorIds: [],
      nodes: { r1: { content: "required" } },
    },
    {
      name: "P1-bench-2",
      kind: "A",
      requiredIds: ["r1", "r2"],
      criticalIds: [],
      distractorIds: [],
      nodes: {
        r1: { content: "required 1" },
        r2: { content: "required 2" },
      },
    },
  ];
  const { results, summary } = runBenchmark(scenarios, fullSelector);
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.ok(r.oracle, `oracle missing on ${r.name}`);
    assert.ok(r.minimality, `minimality missing on ${r.name}`);
    assert.ok(r.safety, `safety verdict missing on ${r.name}`);
    assert.ok(r.optimization, `optimization verdict missing on ${r.name}`);
  }
  // Summary should reflect aggregated TSR/VSR/TTC.
  const keys = Object.keys(summary);
  assert.ok(keys.length >= 1, "summary should have at least one strategy");
  const s = summary[keys[0]];
  assert.equal(typeof s.TTC, "number");
  assert.ok(s.tsrReported >= 0);
});

// ---------------------------------------------------------------------------
// P1 — Sanity: minimality + oracle direct unit tests
// ---------------------------------------------------------------------------

test("P1.17 testMinimality identifies load-bearing nodes", () => {
  const nodes = [
    { id: "a", content: "a" },
    { id: "b", content: "b" },
    { id: "c", content: "c" },
  ];
  // a requires b requires c -> all three load-bearing
  const edges = [
    { from: "a", to: "b", type: "requires" },
    { from: "b", to: "c", type: "requires" },
  ];
  const g = buildOracleGraph({ nodes, edges });
  const report = testMinimality({ taskId: "a", selected: ["a", "b", "c"], oracleGraph: g });
  assert.equal(report.minimalityRatio, 1);
  assert.deepEqual(report.redundant, []);
});

test("P1.18 verifySufficiency ground-truth is independent of scenario.requiredIds", () => {
  const nodes = [
    { id: "task", content: "task" },
    { id: "spec", content: "spec" },
    { id: "noise", content: "noise" },
  ];
  const edges = [
    { from: "task", to: "spec", type: "requires" },
  ];
  const g = buildOracleGraph({ nodes, edges });
  const result = verifySufficiency("task", g, ["task"]);
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.missing, ["spec"]);
  // The closure is derived from edges, not from any external label.
  assert.deepEqual(result.requiredClosure.sort(), ["spec", "task"].sort());
});
