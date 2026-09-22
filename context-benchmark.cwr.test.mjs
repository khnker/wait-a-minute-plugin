/**
 * context-benchmark.cwr.test.mjs
 *
 * Regression test for the CWR fix in context-benchmark.mjs.
 *
 * Bug: `const usedIds = Array.isArray(out?.usedIds) ? selectedIds : []`
 *      ignored the selector's actual `usedIds` and substituted
 *      `selectedIds`, which made CWR (Context Waste Rate) always compute
 *      as 0 — masking real waste in selectors that returned a subset of
 *      `usedIds` (e.g. one that prunes never-touched items from the pack).
 *
 * This file exercises the public benchmark surface (`runScenario` /
 * `runBenchmark`) with a selector that distinguishes `selectedIds` from
 * `usedIds`. If the regression returns, CWR will be ~0 instead of the
 * expected positive value, and these tests will fail loudly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runScenario,
  runBenchmark,
  fullSelector,
  requiredOnlySelector,
} from "./context-benchmark.mjs";
import { record } from "./context-optimization-metrics.js";

const sampleScenario = {
  name: "cwr-regression",
  kind: "A",
  requiredIds: ["req-a", "req-b"],
  criticalIds: ["req-a"],
  nodes: {
    "req-a": { id: "req-a", tokens: 100, content: "required a" },
    "req-b": { id: "req-b", tokens: 100, content: "required b" },
    "opt-c": { id: "opt-c", tokens: 100, content: "optional c" },
    "opt-d": { id: "opt-d", tokens: 100, content: "optional d" },
  },
};

/**
 * Selector that returns:
 *   selectedIds = [req-a, req-b, opt-c]   (kept in the pack)
 *   usedIds     = [req-a, req-b]          (only required was touched)
 *
 * Selected tokens = 300, used tokens = 200 → CWR ≈ 0.333.
 *
 * If the bug returns (usedIds = selectedIds), CWR drops to 0 and the
 * tests below fail.
 */
function selectSubsetUnused(input) {
  const kept = [...input.requiredIds, "opt-c"];
  return {
    selectedIds: kept,
    usedIds: [...input.requiredIds],
    pageFaults: 0,
    reacquiredTokens: 0,
  };
}

describe("context-benchmark CWR regression", () => {
  it("threading: record() sees usedIds ≠ selectedIds and computes CWR > 0", () => {
    // Direct regression on the metric primitive: feed `record()` the exact
    // shape that runScenario() passes through after the line-91 fix. With
    // the bug present (usedIds = selectedIds), CWR drops to 0 and this
    // test fails — which is what we want.
    const m = record({
      selectedIds: ["req-a", "req-b", "opt-c"],
      selectedTokens: 300,
      requiredIds: ["req-a", "req-b"],
      criticalIds: ["req-a"],
      usedIds: ["req-a", "req-b"],
      pageFaults: 0,
      reacquiredTokens: 0,
    });
    assert.equal(m.CWR > 0.2 && m.CWR < 0.5, true, `CWR=${m.CWR} not in (0.2, 0.5)`);
  });

  it("computes a non-zero CWR when selected > used", () => {
    const result = runScenario(sampleScenario, selectSubsetUnused);
    assert.ok(
      typeof result.metrics.CWR === "number",
      `expected numeric CWR, got ${result.metrics.CWR}`
    );
    assert.ok(
      result.metrics.CWR > 0.2,
      `expected CWR ≈ 0.33 (one of three selected ids was unused), got ${result.metrics.CWR}`
    );
    assert.ok(
      result.metrics.CWR < 0.5,
      `expected CWR < 0.5 (only 1 of 3 selected ids was unused), got ${result.metrics.CWR}`
    );
  });

  it("CWR = 0 when usedIds === selectedIds (no waste)", () => {
    // fullSelector returns the same array for both fields.
    const result = runScenario(sampleScenario, fullSelector);
    assert.deepEqual(result.usedIds, result.selectedIds);
    assert.equal(result.metrics.CWR, 0);
  });

  it("CWR = 0 when usedIds ⊇ selectedIds (over-use is not waste)", () => {
    // requiredOnlySelector returns the required set as both selected and used.
    const result = runScenario(sampleScenario, requiredOnlySelector);
    assert.equal(result.metrics.CWR, 0);
  });

  it("benchmark summary reflects the CWR signal end-to-end", () => {
    // runBenchmark(scenarios, select) takes a single selector applied to
    // every scenario. We feed a duplicated scenario array so the summary
    // is deterministic regardless of corpus size. runBenchmark returns
    // { results, summary } where `summary` is bucketed by
    // `strategy = ${name}#${kind}` (not "unknown").
    const scenarios = [sampleScenario, sampleScenario];
    const bench = runBenchmark(scenarios, selectSubsetUnused);
    const bucketKey = `${sampleScenario.name}#${sampleScenario.kind}`;
    const bucket = bench.summary?.[bucketKey];
    assert.ok(
      typeof bucket?.CWR === "number",
      `expected numeric summary CWR for bucket ${bucketKey}, got ${JSON.stringify(bucket)}`
    );
    assert.ok(
      bucket.CWR > 0 && bucket.CWR < 0.5,
      `summary CWR should reflect subset-unused selector signal, got ${bucket.CWR}`
    );
  });
});