/**
 * Context Minimality Test (C07 — context-minimality).
 *
 * Given a selected context set P, determines whether P is minimal w.r.t.
 * the Oracle's required-closure graph. A selected set P is *minimal* iff
 * removing any single node from P∩required makes the oracle verdict
 * insufficient (i.e. every node in P∩required is load-bearing).
 *
 * Two outputs:
 *   - minimalityRatio: |load-bearing ∩ required| / |P ∩ required|
 *                      (1.0 = every required node is load-bearing)
 *   - overInjected:    P \\ requiredClosure (context that contributes
 *                      nothing to oracle sufficiency)
 *
 * Independence: this module only consults the oracle's required-closure
 * computation. It does NOT examine scoring weights or admission classes.
 */

/**
 * @typedef {Object} MinimalityInput
 * @property {string} taskId
 * @property {string[]} selected - selected node IDs (selected set P)
 * @property {Object} oracleGraph - same shape accepted by
 *   `verifySufficiency` (buildOracleGraph-compatible).
 */

/**
 * @typedef {Object} MinimalityNodeVerdict
 * @property {string} id
 * @property {"load-bearing" | "redundant" | "over-injected"} status
 * @property {boolean} sufficientIfRemoved - whether oracle still sufficient
 *   after removing this single node. Undefined for over-injected nodes.
 */

/**
 * @typedef {Object} MinimalityReport
 * @property {string} taskId
 * @property {string[]} requiredClosure - sorted required IDs from oracle
 * @property {string[]} selected       - sorted input selected IDs
 * @property {string[]} overInjected   - selected \\ requiredClosure
 * @property {string[]} loadBearing    - P ∩ required that, removed alone,
 *                                        breaks oracle sufficiency
 * @property {string[]} redundant      - P ∩ required that are NOT load-bearing
 * @property {MinimalityNodeVerdict[]} verdicts - per-node verdicts (selected ∩ required)
 * @property {number} minimalityRatio   - |loadBearing| / |P ∩ required| (0 if no required intersection)
 * @property {boolean} minimal          - true iff redundant.length === 0 AND overInjected.length === 0
 * @property {Object} stats
 */

import {
  computeRequiredClosure,
  verifySufficiency,
} from "./context-sufficiency-oracle.js";

/**
 * Test minimality of a selected set P against the oracle's required closure.
 *
 * Algorithm:
 *   1. Compute requiredClosure = oracle(taskId).
 *   2. Partition selected into over-injected (selected \ required)
 *      and candidate-minimal (selected ∩ required).
 *   3. For each candidate-minimal node n, remove n from selected and
 *      re-run oracle sufficiency. If still sufficient → n is redundant.
 *   4. minimalityRatio = loadBearing.length / candidate-minimal.length.
 *
 * @param {MinimalityInput} input
 * @returns {MinimalityReport}
 */
export function testMinimality(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("testMinimality: input must be an object");
  }
  const { taskId, selected, oracleGraph } = input;
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new TypeError("testMinimality: taskId must be a non-empty string");
  }
  if (!Array.isArray(selected)) {
    throw new TypeError("testMinimality: selected must be an array");
  }
  if (!oracleGraph || typeof oracleGraph.getNode !== "function") {
    throw new TypeError("testMinimality: oracleGraph must be a graph object");
  }

  const requiredClosure = computeRequiredClosure(taskId, oracleGraph);
  const requiredSet = new Set(requiredClosure);

  // Dedup + sort selected
  const selectedSorted = [...new Set(selected)].sort();

  // Partition
  const overInjected = [];
  const candidateMinimal = [];
  for (const id of selectedSorted) {
    if (requiredSet.has(id)) candidateMinimal.push(id);
    else overInjected.push(id);
  }
  overInjected.sort();

  // For each candidate-minimal node, remove and re-test sufficiency
  const loadBearing = [];
  const redundant = [];
  const verdicts = [];

  for (const id of candidateMinimal) {
    const reduced = selectedSorted.filter((x) => x !== id);
    const verdict = verifySufficiency(taskId, oracleGraph, reduced);
    const sufficientIfRemoved = verdict.sufficient;
    if (sufficientIfRemoved) {
      redundant.push(id);
      verdicts.push({ id, status: "redundant", sufficientIfRemoved: true });
    } else {
      loadBearing.push(id);
      verdicts.push({ id, status: "load-bearing", sufficientIfRemoved: false });
    }
  }

  const candidateCount = candidateMinimal.length;
  const minimalityRatio = candidateCount === 0 ? 1 : loadBearing.length / candidateCount;
  const minimal = redundant.length === 0 && overInjected.length === 0;

  return {
    taskId,
    requiredClosure,
    selected: selectedSorted,
    overInjected,
    loadBearing,
    redundant,
    verdicts,
    minimalityRatio,
    minimal,
    stats: {
      selectedCount: selectedSorted.length,
      requiredCount: requiredClosure.length,
      candidateMinimalCount: candidateCount,
      loadBearingCount: loadBearing.length,
      redundantCount: redundant.length,
      overInjectedCount: overInjected.length,
    },
  };
}

/**
 * Convenience: list IDs flagged as over-injected context.
 * Equivalent to `report.overInjected`.
 *
 * @param {MinimalityReport} report
 * @returns {string[]}
 */
export function overInjectedIds(report) {
  if (!report || !Array.isArray(report.overInjected)) return [];
  return [...report.overInjected];
}

/**
 * Convenience: minimality ratio accessor with explicit zero-guard.
 *
 * @param {MinimalityReport} report
 * @returns {number} ratio in [0, 1]
 */
export function minimalityRatio(report) {
  if (!report) return 0;
  if (typeof report.minimalityRatio !== "number") return 0;
  if (report.minimalityRatio < 0) return 0;
  if (report.minimalityRatio > 1) return 1;
  return report.minimalityRatio;
}
