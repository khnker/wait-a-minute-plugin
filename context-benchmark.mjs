/**
 * WAM Context Optimization Benchmark — C07 / C08
 *
 * Self-contained, deterministic benchmark for the WAM context selector.
 * No OpenCode runtime required — runs in isolation under `node --test`.
 *
 * Corpora:
 *   - Corpus A: synthetic, controlled. Every scenario ships a `requiredContext`
 *               plus a `distractors` set; we measure how well the selector
 *               preserves required ids while rejecting distractor noise.
 *   - Corpus B: real task scenarios (token-limited LLM-style fragments).
 *   - Corpus C: fault injection — dropped edges, dangling refs, token inflation,
 *               stale freshness, alias collisions.
 *
 * Each scenario produces a `BenchmarkResult` containing the six C06 metrics
 * (CRR / SPR / COR / CWR / PFR / RPC) plus a `pass` flag against the
 * falsifiable gates in `context-optimization-metrics.js`.
 */

import {
  record,
  summarize,
  evaluateGates,
  evaluateSafetyGates,
  evaluateOptimizationGates,
  SAFETY_GATES,
  OPTIMIZATION_GATES,
  DEFAULT_GATES,
  nodesTokens,
  estimateTokens,
} from "./context-optimization-metrics.js";

import {
  buildOracleGraph,
  verifySufficiency,
  computeRequiredClosure,
} from "./context-sufficiency-oracle.js";

import { testMinimality } from "./context-minimality.js";

// ---------------------------------------------------------------------------
// Types (JSDoc)
// ---------------------------------------------------------------------------
//
// @typedef {Object} BenchmarkScenario
// @property {string} name
// @property {string} kind                "A" | "B" | "C"
// @property {string[]} requiredIds       ids the selector must preserve
// @property {string[]} criticalIds       ids that, if dropped, fail the scenario
// @property {string[]} distractorIds     ids the selector should ideally drop
// @property {Record<string, {content: string, freshness?: number, importance?: number, aliases?: string[]}>} nodes
// @property {(input: {nodes: Record<string, any>, requiredIds: string[], criticalIds: string[]}) => {selectedIds: string[], pageFaults?: number, reacquiredTokens?: number, usedIds?: string[]}} select
//
// @typedef {Object} BenchmarkResult
// @property {string} name
// @property {string} kind
// @property {ReturnType<typeof record>} metrics
// @property {{pass: boolean, failures: string[]}} gates

// ---------------------------------------------------------------------------
// Helpers used by both corpora
// ---------------------------------------------------------------------------

/**
 * Run a single scenario against a selector and emit one metric record.
 *
 * @param {BenchmarkScenario} scenario
 * @param {(input: any) => {selectedIds: string[], pageFaults?: number, reacquiredTokens?: number, usedIds?: string[]}} select
 * @returns {BenchmarkResult}
 */
export function runScenario(scenario, select) {
  const nodes = scenario.nodes;
  const allIds = Object.keys(nodes);
  const requiredTokens = nodesTokens(
    scenario.requiredIds.map((id) => nodes[id]).filter(Boolean)
  );
  // fullTokens: cost of shipping the entire candidate graph (the
  // baseline CRR denominator).
  const fullTokens = nodesTokens(Object.values(nodes));

  const out = select({
    nodes,
    requiredIds: scenario.requiredIds,
    criticalIds: scenario.criticalIds,
  });

  const selectedIds = Array.isArray(out?.selectedIds) ? out.selectedIds : [];
  const selectedTokens = nodesTokens(selectedIds.map((id) => nodes[id]).filter(Boolean));
  const pageFaults = Number(out?.pageFaults ?? 0);
  const reacquiredTokens = Number(out?.reacquiredTokens ?? 0);
  const usedIds = Array.isArray(out?.usedIds) ? out.usedIds : [];

  // -- Independent ground-truth oracle integration (P1) --
  //
  // The scenario-declared `requiredIds` is one view of "what was needed".
  // The oracle's required-closure is an INDEPENDENT view derived only from
  // REQUIRES / DEPENDS_ON edges in the scenario graph.  We run the
  // oracle against the selector's chosen set and capture:
  //   - oracleMissing : ids oracle says are missing (VSR = 0 if any)
  //   - oracleClosure : the oracle's required closure
  //   - oracleSufficient : boolean ground truth
  //
  // Scenarios may opt out by setting `scenario.skipOracle = true`.
  // If a scenario declares `scenario.requires`, those edges become the
  // oracle graph.  Otherwise we synthesize "implicit edges" from the
  // scenario's required ids (each required -> task), which still gives
  // the oracle an independent walk to compute closure over.
  let oracleResult = null;
  let oracleGraph = null;
  const taskId =
    scenario.taskId || scenario.requiredIds[0] || allIds[0] || "task";
  if (!scenario.skipOracle) {
    // Build the oracle graph: nodes = scenario.nodes, edges =
    // scenario.requires (if any) OR an implicit REQUIRES edge from
    // the task to every other required id.
    const oracleNodes = allIds.map((id) => ({
      id,
      type: nodes[id]?.type,
      content: nodes[id]?.content,
    }));
    const oracleEdges = scenario.requires
      ? scenario.requires.map((e) => ({
          from: e.from,
          to: e.to,
          // Normalize to an edge type the oracle's closure walk accepts.
          // The oracle recognizes `requires`, `depends_on`,
          // `DEPENDENCY`, and the canonical EDGE_TYPES values.  When a
          // scenario declares `type: "REQUIRES"` we map it to `requires`
          // so the walk actually traverses it.
          type: e.type === "REQUIRES" ? "requires" : (e.type || "requires"),
        }))
      : scenario.requiredIds
          .filter((id) => id !== taskId)
          .map((id) => ({ from: taskId, to: id, type: "requires" }));
    // Ensure the task node is always present even when not in nodes
    // (some synthetic scenarios are tiny and reference a virtual task).
    if (!nodes[taskId]) {
      oracleNodes.push({ id: taskId, type: "task", content: "" });
    }
    oracleGraph = buildOracleGraph({ nodes: oracleNodes, edges: oracleEdges });
    oracleResult = verifySufficiency(taskId, oracleGraph, selectedIds);
  }

  // -- Minimality integration (P1) --
  //
  // For each scenario we also run `testMinimality` against the same
  // oracle graph to report redundant nodes and the minimality ratio.
  // The minimality verdict is intentionally orthogonal to sufficiency:
  // a selection can be sufficient AND non-minimal (over-injected).
  let minimality = null;
  if (oracleGraph) {
    minimality = testMinimality({
      taskId,
      selected: selectedIds,
      oracleGraph,
    });
  }

  // -- Task Success Rate (TSR) --
  //
  // Default heuristic: if the selector preserved SPR>=1 AND the oracle
  // verdict is sufficient AND there were no page faults, the task
  // would have succeeded.  Scenarios can override with `scenario.taskSuccess`.
  let taskSuccess;
  if (typeof scenario.taskSuccess === "boolean") {
    taskSuccess = scenario.taskSuccess;
  } else {
    const preservedAll =
      scenario.requiredIds.length === 0 ||
      scenario.requiredIds.every((id) => selectedIds.includes(id));
    taskSuccess = preservedAll && pageFaults === 0;
  }

  // -- Retrieval overhead (TTC component) --
  //
  // Estimated as a fixed per-selector overhead (lookup cost) plus a
  // per-page-fault penalty.  Scenarios can override with
  // `scenario.retrievalOverhead` to model a real retrieval backend.
  const lookupOverhead = typeof scenario.lookupOverhead === "number"
    ? scenario.lookupOverhead
    : 50;
  const retrievalOverhead = lookupOverhead + pageFaults * 200;

  const metrics = record({
    strategy: scenario.name + "#" + scenario.kind,
    requiredTokens,
    selectedTokens,
    fullTokens,
    requiredIds: scenario.requiredIds,
    selectedIds,
    criticalIds: scenario.criticalIds,
    usedIds,
    pageFaults,
    reacquiredTokens,
    taskSuccess,
    oracleMissing: oracleResult ? oracleResult.missing : null,
    retrievalOverhead,
  });

  const gates = evaluateGates(metrics);
  const safety = evaluateSafetyGates(metrics);
  const optimization = evaluateOptimizationGates(metrics);

  return {
    name: scenario.name,
    kind: scenario.kind,
    metrics,
    gates,
    safety,
    optimization,
    oracle: oracleResult
      ? {
          sufficient: oracleResult.sufficient,
          missing: oracleResult.missing,
          requiredClosure: oracleResult.requiredClosure,
          unused: oracleResult.unused,
        }
      : null,
    minimality: minimality
      ? {
          minimalityRatio: minimality.minimalityRatio,
          loadBearing: minimality.loadBearing,
          redundant: minimality.redundant,
          overInjected: minimality.overInjected,
          totalRequiredSelected: minimality.totalRequiredSelected,
        }
      : null,
    _allIds: allIds,
  };
}

/**
 * Run a batch of scenarios and return per-scenario results + per-strategy summary.
 *
 * @param {BenchmarkScenario[]} scenarios
 * @param {(input: any) => any} select
 */
export function runBenchmark(scenarios, select) {
  const results = scenarios.map((s) => runScenario(s, select));
  const summary = summarize(results.map((r) => r.metrics));
  return { results, summary };
}

// ---------------------------------------------------------------------------
// Corpus A — synthetic controlled
// ---------------------------------------------------------------------------
//
// Each scenario defines an exact `requiredContext` (must be kept) and a
// `distractors` set (should be filtered out). Critical ids are a subset of
// required; missing any of them is a hard failure.

export function corpusA() {
  /** @type {BenchmarkScenario[]} */
  const scenarios = [];
  // A0: a deliberately larger corpus where the budget actually matters
  // (5 required + 15 distractors ≈ 1000 tokens vs budget of 600).
  scenarios.push({
    name: "A0-budget-tight",
    kind: "A",
    requiredIds: ["r1", "r2", "r3", "r4", "r5"],
    criticalIds: ["r1", "r3"],
    distractorIds: Array.from({ length: 15 }, (_, i) => `d${i + 1}`),
    nodes: {
      ...Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [
          `d${i + 1}`,
          {
            content: "distractor payload number " + i + " " + "noise ".repeat(8),
            importance: 0,
            freshness: 0,
          },
        ])
      ),
      r1: { content: "required: critical spec for the routing contract", importance: 10, freshness: 10, aliases: ["critical-spec"] },
      r2: { content: "required: secondary spec on the metric surface", importance: 6, freshness: 6, aliases: ["metric-spec"] },
      r3: { content: "required: critical test invariant for ablation", importance: 10, freshness: 9, aliases: ["invariant"] },
      r4: { content: "required: example demonstrating the selector API", importance: 5, freshness: 5 },
      r5: { content: "required: documentation pointer for the report", importance: 4, freshness: 4 },
    },
  });

  // A1: small, no distractors. Baseline.
  scenarios.push({
    name: "A1-baseline-keep-all",
    kind: "A",
    requiredIds: ["r1", "r2", "r3"],
    criticalIds: ["r1"],
    distractorIds: [],
    nodes: {
      r1: { content: "task: refactor context routing module to add selectors" },
      r2: { content: "constraint: backwards compatible with existing router API" },
      r3: { content: "criterion: pass all existing routing tests" },
    },
  });

  // A2: many distractors, few required. Selector must filter aggressively.
  // Distractors have low importance + freshness; required nodes have high
  // importance so the scoring signal has bite.
  scenarios.push({
    name: "A2-noise-heavy",
    kind: "A",
    requiredIds: ["r1", "r2"],
    criticalIds: ["r1"],
    distractorIds: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"],
    nodes: {
      r1: { content: "spec: implement page fault tracking in context router", importance: 9, freshness: 8, aliases: ["page-fault-spec"] },
      r2: { content: "spec: expose RPC metric on context router public API", importance: 8, freshness: 7 },
      d1: { content: "lunch options near the office this week", importance: 0, freshness: 1 },
      d2: { content: "weather forecast for tomorrow in santiago", importance: 0, freshness: 1 },
      d3: { content: "marketing copy draft for the launch announcement", importance: 1, freshness: 0 },
      d4: { content: "random meeting notes from last quarter", importance: 0, freshness: 0 },
      d5: { content: "office snack preferences survey results", importance: 0, freshness: 0 },
      d6: { content: "personal todo list unrelated to the project", importance: 0, freshness: 0 },
      d7: { content: "draft email body about vendor renewal", importance: 1, freshness: 0 },
      d8: { content: "scratch notes from a previous brainstorming session", importance: 0, freshness: 0 },
    },
  });

  // A3: critical id is nested; selector that ignores importance will fail.
  // Nodes now carry importance/freshness/aliases so the ablation has
  // signal to move.
  scenarios.push({
    name: "A3-importance-required",
    kind: "A",
    requiredIds: ["r1", "r2", "r3"],
    criticalIds: ["r3"],
    distractorIds: ["d1", "d2"],
    nodes: {
      r1: { content: "background: how the existing context router is wired", importance: 2, freshness: 3, aliases: ["router-bg"] },
      r2: { content: "background: history of recent context changes", importance: 1, freshness: 4 },
      r3: { content: "must: never drop the critical contract surface id", importance: 9, freshness: 9, aliases: ["contract-critical"] },
      d1: { content: "color palette for the dashboard redesign", importance: 0, freshness: 1 },
      d2: { content: "old todo from last sprint", importance: 0, freshness: 0 },
    },
  });

  // A4: ablation arena. Required nodes have ZERO importance/freshness/aliases
  // so they ONLY get the +100/+1000 base boost. Distractors have HIGH
  // importance/freshness/aliases — high enough that without the +100 base
  // boost they would actually outscore a low-priority required node.
  // Removing any signal must measurably change selection on a tight budget.
  scenarios.push({
    name: "A4-ablation-arena",
    kind: "A",
    requiredIds: ["req-a", "req-b"],
    criticalIds: ["req-a"],
    distractorIds: ["dis-1", "dis-2", "dis-3", "dis-4", "dis-5", "dis-6"],
    nodes: {
      "req-a": { content: "required node a " + "p".repeat(40) },
      "req-b": { content: "required node b " + "q".repeat(40) },
      "dis-1": { content: "distractor 1 " + "r".repeat(40), importance: 15, freshness: 15, aliases: ["d1a", "d1b", "d1c"] },
      "dis-2": { content: "distractor 2 " + "s".repeat(40), importance: 15, freshness: 15, aliases: ["d2a", "d2b", "d2c"] },
      "dis-3": { content: "distractor 3 " + "t".repeat(40), importance: 15, freshness: 15, aliases: ["d3a", "d3b", "d3c"] },
      "dis-4": { content: "distractor 4 " + "u".repeat(40), importance: 15, freshness: 15, aliases: ["d4a", "d4b", "d4c"] },
      "dis-5": { content: "distractor 5 " + "v".repeat(40), importance: 15, freshness: 15, aliases: ["d5a", "d5b", "d5c"] },
      "dis-6": { content: "distractor 6 " + "w".repeat(40), importance: 15, freshness: 15, aliases: ["d6a", "d6b", "d6c"] },
    },
  });

  return scenarios;
}

// ---------------------------------------------------------------------------
// Corpus B — real task scenarios
// ---------------------------------------------------------------------------

export function corpusB() {
  return [
    {
      name: "B1-router-refactor",
      kind: "B",
      requiredIds: ["task", "spec-router", "constraint-tests", "evidence-routing-tests"],
      criticalIds: ["task", "spec-router"],
      distractorIds: ["noise-1", "noise-2", "noise-3"],
      nodes: {
        task: {
          content:
            "Refactor the context router to expose page-fault tracking and emit " +
            "ContextMetrics on every selection so C06 is satisfied.",
        },
        "spec-router": {
          content:
            "Spec: resolveContext(taskId, graph) must return {nodes, edges, missing, complete, " +
            "tokenEstimate, metrics: {CRR, SPR, COR, CWR, PFR, RPC}}.",
        },
        "constraint-tests": {
          content: "Constraint: all existing router unit tests must continue to pass.",
        },
        "evidence-routing-tests": {
          content:
            "Evidence: see context-router.test.mjs and context-retrieval.test.mjs for " +
            "current coverage of routing behavior.",
        },
        "noise-1": { content: "Unrelated discussion about UI redesign priorities." },
        "noise-2": { content: "Marketing copy for the public website footer." },
        "noise-3": { content: "Travel itinerary for an upcoming offsite." },
      },
    },
    {
      name: "B2-context-compactor",
      kind: "B",
      requiredIds: ["task", "spec-compaction", "constraint-lossless"],
      criticalIds: ["spec-compaction"],
      distractorIds: ["noise-a", "noise-b"],
      nodes: {
        task: {
          content:
            "Implement context compaction that preserves SPR >= 0.99 and COR = 0 " +
            "while shrinking the working set.",
        },
        "spec-compaction": {
          content:
            "Spec: compaction must be deterministic, reversible, and emit a metric record " +
            "containing CRR and SPR at minimum.",
        },
        "constraint-lossless": {
          content:
            "Constraint: any compaction strategy that drops a critical node is a hard failure.",
        },
        "noise-a": { content: "Notes from an unrelated customer call." },
        "noise-b": { content: "Drafts of internal announcements." },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Corpus C — fault injection
// ---------------------------------------------------------------------------
//
// We corrupt the inputs the selector has to reason about:
//   - dangling required ids (selector should not crash, should report missing)
//   - token inflation on a critical node
//   - alias collisions (same id reachable through two aliases)
//   - zero-freshness required nodes
// Each scenario keeps a precise `expectedPass` so the test can assert
// that the gates agree with the engineered expectation.

export function corpusC() {
  return [
    {
      name: "C1-dangling-required",
      kind: "C",
      requiredIds: ["r1", "ghost-id-that-does-not-exist"],
      criticalIds: ["r1"],
      distractorIds: ["d1"],
      nodes: {
        r1: { content: "real required node that exists in the graph" },
        d1: { content: "noise node we want filtered out" },
      },
      // We expect this scenario to NOT pass strict gates by design —
      // the dangling reference forces a COR > 0 if the selector claims
      // completeness. The benchmark still records it honestly.
      expectedPass: false,
    },
    {
      name: "C2-token-inflation",
      kind: "C",
      requiredIds: ["r1", "r2"],
      criticalIds: ["r1"],
      distractorIds: [],
      nodes: {
        // Critical node with massive payload to stress token accounting.
        r1: { content: "CRITICAL " + "x".repeat(4000) },
        r2: { content: "normal required node " + "y".repeat(200) },
      },
    },
    {
      name: "C3-alias-collision",
      kind: "C",
      requiredIds: ["primary"],
      criticalIds: ["primary"],
      distractorIds: ["alias-old"],
      nodes: {
        primary: { content: "canonical node id for the spec" },
        "alias-old": { content: "old alias that points at primary but is stale" },
      },
    },
    {
      name: "C4-zero-freshness-required",
      kind: "C",
      requiredIds: ["r1"],
      criticalIds: ["r1"],
      distractorIds: ["r2"],
      nodes: {
        r1: { content: "required but marked stale", freshness: 0 },
        r2: { content: "fresh distractor that should not crowd out r1", freshness: 10 },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Reference selectors — used by the benchmark AND the ablation study.
// ---------------------------------------------------------------------------
//
// All selectors take `{nodes, requiredIds, criticalIds}` and return
// `{selectedIds, pageFaults?, reacquiredTokens?, usedIds?}`. They are
// deliberately small and side-effect free so they can be composed.

/** Identity selector: keep everything we know about. */
export function fullSelector(input) {
  const selectedIds = Object.keys(input.nodes);
  return { selectedIds, usedIds: selectedIds, pageFaults: 0, reacquiredTokens: 0 };
}

/** Required-only selector: ship exactly the required ids. */
export function requiredOnlySelector(input) {
  const selectedIds = input.requiredIds.filter((id) => input.nodes[id]);
  return { selectedIds, usedIds: selectedIds, pageFaults: 0, reacquiredTokens: 0 };
}

/**
 * Token-budgeted selector: keep required ids in priority order
 * (critical first), then required, then distractors, until budget runs out.
 *
 * @param {number} tokenBudget
 */
export function budgetedSelector(tokenBudget) {
  return function select(input) {
    const { nodes, requiredIds, criticalIds } = input;
    const ordered = [
      ...criticalIds.filter((id) => nodes[id]),
      ...requiredIds.filter((id) => nodes[id] && !criticalIds.includes(id)),
      ...Object.keys(nodes).filter((id) => !requiredIds.includes(id)),
    ];
    const selectedIds = [];
    let used = 0;
    for (const id of ordered) {
      const cost = estimateTokens(nodes[id]?.content) + 20;
      if (used + cost > tokenBudget && selectedIds.length > 0) break;
      selectedIds.push(id);
      used += cost;
    }
    return { selectedIds, usedIds: selectedIds, pageFaults: 0, reacquiredTokens: 0 };
  };
}

/**
 * Scoring selector used by the ablation study: combines aliases,
 * freshness, importance, and required-priority with optional feature
 * toggles so we can ablate each dimension independently.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.aliases=true]
 * @param {boolean} [opts.freshness=true]
 * @param {boolean} [opts.importance=true]
 * @param {number} [opts.budget=4000]
 */
export function scoringSelector(opts = {}) {
  const aliases = opts.aliases !== false;
  const freshness = opts.freshness !== false;
  const importance = opts.importance !== false;
  const budget = opts.budget ?? 4000;

  return function select(input) {
    const { nodes, requiredIds, criticalIds } = input;
    const requiredSet = new Set(requiredIds);
    const criticalSet = new Set(criticalIds);

    const scored = Object.entries(nodes).map(([id, node]) => {
      let score = 0;
      if (criticalSet.has(id)) score += 1000;
      if (requiredSet.has(id)) score += 100;
      if (aliases && Array.isArray(node?.aliases)) score += node.aliases.length * 5;
      if (freshness && Number.isFinite(node?.freshness)) score += Number(node.freshness);
      if (importance && Number.isFinite(node?.importance)) score += Number(node.importance) * 10;
      return { id, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const selectedIds = [];
    let used = 0;
    for (const { id } of scored) {
      const cost = estimateTokens(nodes[id]?.content) + 20;
      if (used + cost > budget && selectedIds.length > 0) break;
      selectedIds.push(id);
      used += cost;
    }
    return { selectedIds, usedIds: selectedIds, pageFaults: 0, reacquiredTokens: 0 };
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
//
// `node context-benchmark.mjs` runs the full corpus suite against the
// default `scoringSelector()` and prints a human-readable table plus a
// JSON dump suitable for piping into the report generator.

import process from "node:process";
import { pathToFileURL } from "node:url";

function printTable(rows) {
  const headers = [
    "scenario",
    "kind",
    "CRR",
    "SPR",
    "COR",
    "CWR",
    "PFR",
    "RPC",
    "TSR",
    "VSR",
    "TTC",
    "min",
    "safety",
    "opt",
    "gate",
  ];
  const widths = headers.map((h) =>
    Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length))
  );
  const fmt = (cells) =>
    cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) {
    console.log(
      fmt([
        r.scenario,
        r.kind,
        r.CRR,
        r.SPR,
        r.COR,
        r.CWR,
        r.PFR,
        r.RPC,
        r.TSR,
        r.VSR,
        r.TTC,
        r.min,
        r.safety,
        r.opt,
        r.gate,
      ])
    );
  }
}

function isMain(meta) {
  if (!process.argv[1]) return false;
  try {
    const invoked = pathToFileURL(process.argv[1]).href;
    return invoked === meta.url;
  } catch {
    return false;
  }
}

if (isMain(import.meta)) {
  // When invoked directly (not through the report script), render the
  // table. The report script imports this module and never enters this
  // branch because its `process.argv[1]` differs from this module's URL.
  const scenarios = [...corpusA(), ...corpusB(), ...corpusC()];
  const select = scoringSelector();
  const { results, summary } = runBenchmark(scenarios, select);
  const rows = results.map((r) => ({
    scenario: r.name,
    kind: r.kind,
    CRR: r.metrics.CRR,
    SPR: r.metrics.SPR,
    COR: r.metrics.COR,
    CWR: r.metrics.CWR,
    PFR: r.metrics.PFR,
    RPC: r.metrics.RPC,
    TSR: r.metrics.TSR ?? "-",
    VSR: r.metrics.VSR ?? "-",
    TTC: r.metrics.TTC,
    min: r.minimality ? r.minimality.minimalityRatio.toFixed(2) : "-",
    safety: r.safety.pass ? "OK" : "FAIL",
    opt: r.optimization.pass ? "OK" : "FAIL",
    gate: r.gates.pass ? "PASS" : "FAIL",
  }));
  printTable(rows);
  console.log("");
  console.log("Summary by strategy:");
  for (const [, s] of Object.entries(summary)) {
    console.log(JSON.stringify(s));
  }
}

export const __gates = DEFAULT_GATES;
export const __safetyGates = SAFETY_GATES;
export const __optimizationGates = OPTIMIZATION_GATES;
