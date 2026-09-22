#!/usr/bin/env node
/**
 * WAM Context Optimization Report — C09 / C10
 *
 * Aggregates the benchmark + ablation outputs into a single human-readable
 * report and enforces the falsifiable gates from C10.
 *
 * Usage:
 *   node scripts/context-report.mjs              # run benchmark + ablation fresh
 *   node scripts/context-report.mjs --json       # machine-readable output
 *   node scripts/context-report.mjs --strict     # non-zero exit if any gate fails
 *
 * Exit codes:
 *   0  every gate passed (or non-strict mode)
 *   1  at least one gate failed (only with --strict)
 */

import process from "node:process";
import { runBenchmark, corpusA, corpusB, corpusC, scoringSelector } from "../context-benchmark.mjs";
import { runAblation, relativeDelta, ablationMatrix } from "../context-ablation-study.mjs";
import { evaluateGates, DEFAULT_GATES } from "../context-optimization-metrics.js";

const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const strictMode = args.has("--strict");

function runFullReport() {
  const scenarios = [...corpusA(), ...corpusB(), ...corpusC()];
  const fullSelector = scoringSelector();

  const benchmark = runBenchmark(scenarios, fullSelector);
  const ablation = runAblation();
  const delta = relativeDelta(ablation);

  // Per-scenario gate evaluation (for the C10 falsifiable gate).
  const gateResults = benchmark.results.map((r) => ({
    name: r.name,
    kind: r.kind,
    pass: r.gates.pass,
    failures: r.gates.failures,
    metrics: r.metrics,
  }));
  const passCount = gateResults.filter((g) => g.pass).length;
  const failCount = gateResults.length - passCount;

  // Evaluate the aggregate ablation row against the same gates
  // (so the report includes a top-level pass/fail).
  const aggregateRow = ablation.full;
  const aggregateGate = evaluateGates({
    strategy: "aggregate-full",
    CRR: aggregateRow.CRR,
    SPR: aggregateRow.SPR,
    COR: aggregateRow.COR,
    CWR: aggregateRow.CWR,
    PFR: aggregateRow.PFR,
    RPC: aggregateRow.RPC,
    selectedTokens: 0,
    requiredTokens: 0,
    usedTokens: 0,
    pageFaults: 0,
    reacquiredTokens: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    gates: DEFAULT_GATES,
    benchmark: {
      scenarios: gateResults,
      summary: benchmark.summary,
      passCount,
      failCount,
      totalCount: gateResults.length,
    },
    ablation,
    delta,
    aggregateGate,
    allGatesPass: failCount === 0 && aggregateGate.pass,
  };
}

function renderText(report) {
  const lines = [];
  lines.push("WAM Context Optimization Report");
  lines.push("Generated: " + report.generatedAt);
  lines.push("");
  lines.push("== Gates ==");
  for (const [k, v] of Object.entries(report.gates)) {
    lines.push(`  ${k} = ${v}`);
  }
  lines.push("");
  lines.push(`== Benchmark (${report.benchmark.passCount}/${report.benchmark.totalCount} scenarios pass) ==`);
  for (const r of report.benchmark.scenarios) {
    const m = r.metrics;
    lines.push(
      `  [${r.kind}] ${r.name.padEnd(30)} ` +
        `CRR=${m.CRR} SPR=${m.SPR} COR=${m.COR} CWR=${m.CWR} PFR=${m.PFR} RPC=${m.RPC} ` +
        `${r.pass ? "PASS" : "FAIL (" + r.failures.join(", ") + ")"}`
    );
  }
  lines.push("");
  lines.push("== Ablation (means) ==");
  for (const [v, row] of Object.entries(report.ablation)) {
    lines.push(
      `  ${v.padEnd(14)} CRR=${row.CRR}  SPR=${row.SPR}  COR=${row.COR}  CWR=${row.CWR}  PFR=${row.PFR}  RPC=${row.RPC}`
    );
  }
  lines.push("");
  lines.push("== Delta vs. full ==");
  for (const [v, row] of Object.entries(report.delta)) {
    lines.push(
      `  ${v.padEnd(14)} dCRR=${row.dCRR}  dSPR=${row.dSPR}  dCOR=${row.dCOR}  dCWR=${row.dCWR}  dPFR=${row.dPFR}  dRPC=${row.dRPC}`
    );
  }
  lines.push("");
  lines.push("== Aggregate gate ==");
  lines.push("  " + (report.aggregateGate.pass ? "PASS" : "FAIL: " + report.aggregateGate.failures.join(", ")));
  lines.push("");
  lines.push("Overall: " + (report.allGatesPass ? "PASS" : "FAIL"));
  return lines.join("\n");
}

function main() {
  const report = runFullReport();
  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(report) + "\n");
  }
  if (strictMode && !report.allGatesPass) {
    process.exit(1);
  }
}

main();
