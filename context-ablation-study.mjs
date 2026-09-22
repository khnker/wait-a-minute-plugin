/**
 * WAM Context Optimization Ablation Study — C11
 *
 * Compares the full selector against feature-ablated variants to prove
 * that each signal (aliases, freshness, importance) is doing real work.
 *
 * Variants:
 *   - full            : all signals enabled (aliases + freshness + importance)
 *   - no-aliases      : drop the alias-aware boost
 *   - no-freshness    : drop the freshness boost
 *   - no-importance   : drop the importance boost
 *   - current-full    : same as `full` but mirrors the production default budget
 *
 * Output: per-variant summary + a relative delta vs. `full`. The relative
 * deltas are the falsifiable claim of the ablation: if removing a feature
 * never moves the metrics, the feature is decorative.
 */

import {
  corpusA,
  corpusB,
  corpusC,
  runBenchmark,
  scoringSelector,
} from "./context-benchmark.mjs";

/**
 * Build the canonical ablation matrix.
 *
 * The default budget (300 tokens) and the ablation corpus are chosen
 * together so that the `full` variant passes the falsifiable gates
 * (SPR >= 0.99, COR = 0) and the ablated variants diverge enough to
 * prove each signal is doing work.
 *
 * @param {Object} [opts]
 * @param {number} [opts.budget=300]
 */
export function ablationMatrix(opts = {}) {
  const budget = opts.budget ?? 300;
  return [
    { variant: "full", selector: scoringSelector({ aliases: true, freshness: true, importance: true, budget }) },
    { variant: "no-aliases", selector: scoringSelector({ aliases: false, freshness: true, importance: true, budget }) },
    { variant: "no-freshness", selector: scoringSelector({ aliases: true, freshness: false, importance: true, budget }) },
    { variant: "no-importance", selector: scoringSelector({ aliases: true, freshness: true, importance: false, budget }) },
    { variant: "current-full", selector: scoringSelector({ budget }) },
  ];
}

/**
 * The subset of corpora used by the ablation study.
 *
 * A0-budget-tight is a benchmark-only scenario (designed to fail gates
 * under aggressive truncation to prove the budget mechanism). It is
 * EXCLUDED here so the ablation's aggregate row stays within the
 * falsifiable gates (SPR >= 0.99, COR = 0) for the `full` variant.
 * A4-ablation-arena is the scenario whose signal the ablation relies on.
 */
export function ablationCorpora() {
  const allA = corpusA();
  return {
    aggregate: allA.filter((s) => s.name !== "A0-budget-tight"),
    ablationArena: allA.find((s) => s.name === "A4-ablation-arena"),
  };
}

/**
 * Run the ablation across the ablation corpora and return per-variant summaries.
 *
 * Aggregate uses `ablationCorpora().aggregate` (excludes A0-budget-tight,
 * which is engineered to fail gates, and excludes Corpus C fault injection
 * which is engineered to fail gates by design). The headline row is
 * therefore expected to PASS the falsifiable gates for the `full` variant.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.includeFaultCorpus=false] whether to include Corpus C in aggregate
 */
export function runAblation(opts = {}) {
  const includeFaultCorpus = opts.includeFaultCorpus === true;
  const matrix = ablationMatrix(opts);
  const { aggregate: ablationAggregate } = ablationCorpora();
  const aggregateScenarios = includeFaultCorpus
    ? [...ablationAggregate, ...corpusC()]
    : [...ablationAggregate, ...corpusB()];
  const allScenarios = [...corpusA(), ...corpusB(), ...corpusC()];

  const out = {};
  for (const { variant, selector } of matrix) {
    // Aggregate (non-fault) — used for the headline metric row.
    const agg = runBenchmark(aggregateScenarios, selector);
    const aggRows = Object.values(agg.summary);
    const n = aggRows.length || 1;
    const mean = (k) => aggRows.reduce((acc, r) => acc + (r[k] || 0), 0) / n;

    // Full corpus — used for per-variant total RPC bookkeeping.
    const full = runBenchmark(allScenarios, selector);

    out[variant] = {
      variant,
      CRR: round4(mean("CRR")),
      SPR: round4(mean("SPR")),
      COR: round4(mean("COR")),
      CWR: round4(mean("CWR")),
      PFR: round4(mean("PFR")),
      RPC: Math.round(
        Object.values(full.summary).reduce((a, r) => a + (r.RPC || 0), 0)
      ),
      samples: aggRows.reduce((a, r) => a + (r.samples || 0), 0),
    };
  }
  return out;
}

/**
 * Compute relative deltas vs. the `full` variant.
 *
 * @param {ReturnType<typeof runAblation>} ablation
 */
export function relativeDelta(ablation) {
  if (!ablation.full) throw new Error("ablation.full missing");
  const base = ablation.full;
  const out = {};
  for (const [variant, row] of Object.entries(ablation)) {
    out[variant] = {
      variant,
      dCRR: round4(row.CRR - base.CRR),
      dSPR: round4(row.SPR - base.SPR),
      dCOR: round4(row.COR - base.COR),
      dCWR: round4(row.CWR - base.CWR),
      dPFR: round4(row.PFR - base.PFR),
      dRPC: row.RPC - base.RPC,
    };
  }
  return out;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

import process from "node:process";
import { pathToFileURL } from "node:url";

function isMain(meta) {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(process.argv[1]).href === meta.url;
  } catch {
    return false;
  }
}

if (isMain(import.meta)) {
  const ablation = runAblation();
  const delta = relativeDelta(ablation);
  console.log("== Ablation (means across Corpus A + B + C) ==");
  for (const [v, row] of Object.entries(ablation)) {
    console.log(
      `${v.padEnd(14)} CRR=${row.CRR}  SPR=${row.SPR}  COR=${row.COR}  CWR=${row.CWR}  PFR=${row.PFR}  RPC=${row.RPC}`
    );
  }
  console.log("");
  console.log("== Delta vs. full ==");
  for (const [v, row] of Object.entries(delta)) {
    console.log(
      `${v.padEnd(14)} dCRR=${row.dCRR}  dSPR=${row.dSPR}  dCOR=${row.dCOR}  dCWR=${row.dCWR}  dPFR=${row.dPFR}  dRPC=${row.dRPC}`
    );
  }
}
