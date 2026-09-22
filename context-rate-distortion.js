/**
 * Context Rate-Distortion (C05 — context-rate-distortion).
 *
 * Combines Context Reduction Rate (CRR = tokensSaved / tokensFull) with
 * Oracle Sufficiency verification (verifySufficiency) to compute the true
 * rate-distortion curve:
 *
 *   rate(b)        = 1 - tokens(b) / tokensFull       (compression ratio)
 *   distortion(b)  = 1 - sufficient(b)                (sufficiency loss)
 *
 * Where:
 *   tokensFull   = sum of token counts of all candidates
 *   tokens(b)    = sum of token counts of the selected set at budget b
 *   sufficient(b) = verifySufficiency(task, selected(b))
 *
 * The curve answers: "how aggressively can we compress while still being
 * oracle-sufficient?"
 *
 *   - RDReport.curve          - [{rate, distortion, sufficient, budget, selected}]
 *   - RDReport.operatingPoint - first budget where sufficient===true (or null)
 *   - RDReport.maxRate        - largest rate at which distortion===0
 *   - RDReport.crr            - rate at the operating point (or max rate)
 *
 * Independence: uses oracle ground truth; does not consult scoring weights.
 */

import {
  computeRequiredClosure,
  verifySufficiency,
} from "./context-sufficiency-oracle.js";

/**
 * @typedef {Object} ContextItem
 * @property {string} id
 * @property {number} tokens
 * @property {number} [priority] - higher = kept earlier under budget; ties broken by id
 */

/**
 * @typedef {Object} RDPoint
 * @property {number} budget
 * @property {number} rate             - in [0, 1]
 * @property {number} distortion       - in [0, 1] (0 = sufficient)
 * @property {boolean} sufficient
 * @property {string[]} selected
 * @property {number} tokensUsed
 */

/**
 * @typedef {Object} RDReport
 * @property {string} taskId
 * @property {number} fullTokens
 * @property {RDPoint[]} curve
 * @property {RDPoint|null} operatingPoint - first point with sufficient===true
 * @property {number} crr                 - rate at operating point (or maxRate)
 * @property {number} maxRate             - largest rate where distortion===0
 * @property {Object} stats
 */

/**
 * Greedy fill: pick items in priority-descending order until budget exhausted.
 *
 * @param {ContextItem[]} candidates
 * @param {number} budget
 * @returns {string[]} selected ids
 */
function selectByBudget(candidates, budget) {
  if (!Array.isArray(candidates) || budget <= 0) return [];
  const sorted = candidates
    .filter((c) => c && typeof c.id === "string" && typeof c.tokens === "number")
    .slice()
    .sort((a, b) => {
      const pa = typeof a.priority === "number" ? a.priority : 0;
      const pb = typeof b.priority === "number" ? b.priority : 0;
      if (pb !== pa) return pb - pa;
      return a.id.localeCompare(b.id);
    });
  const out = [];
  let used = 0;
  for (const c of sorted) {
    if (used + c.tokens <= budget) {
      out.push(c.id);
      used += c.tokens;
    }
  }
  return out;
}

/**
 * Compute the rate-distortion curve.
 *
 * @param {Object} input
 * @param {string} input.taskId
 * @param {ContextItem[]} input.candidates
 * @param {Object} input.oracleGraph
 * @param {number[]} [input.budgets] - explicit budgets to sweep. If omitted,
 *   sweep is derived from candidates (each unique prefix budget).
 * @returns {RDReport}
 */
export function computeRateDistortion(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("computeRateDistortion: input required");
  }
  const { taskId, candidates, oracleGraph } = input;
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new TypeError("computeRateDistortion: taskId required");
  }
  if (!Array.isArray(candidates)) {
    throw new TypeError("computeRateDistortion: candidates must be an array");
  }
  if (!oracleGraph || typeof oracleGraph.getNode !== "function") {
    throw new TypeError("computeRateDistortion: oracleGraph required");
  }

  const requiredClosure = computeRequiredClosure(taskId, oracleGraph);
  const requiredSet = new Set(requiredClosure);

  const fullTokens = candidates.reduce(
    (acc, c) => acc + (typeof c.tokens === "number" ? c.tokens : 0),
    0,
  );

  let budgets = input.budgets;
  if (!Array.isArray(budgets) || budgets.length === 0) {
    // derive: 0, plus cumulative token sums in priority order
    const sorted = candidates
      .filter((c) => c && typeof c.tokens === "number")
      .slice()
      .sort((a, b) => {
        const pa = typeof a.priority === "number" ? a.priority : 0;
        const pb = typeof b.priority === "number" ? b.priority : 0;
        if (pb !== pa) return pb - pa;
        return a.id.localeCompare(b.id);
      });
    const derived = [0];
    let acc = 0;
    for (const c of sorted) {
      acc += c.tokens;
      if (acc !== derived[derived.length - 1]) derived.push(acc);
    }
    if (derived[derived.length - 1] !== fullTokens) derived.push(fullTokens);
    budgets = derived;
  }
  budgets = [...new Set(budgets.filter((b) => typeof b === "number" && b >= 0))].sort((a, b) => a - b);

  /** @type {RDPoint[]} */
  const curve = [];
  let operatingPoint = null;
  let maxRate = 0;

  for (const budget of budgets) {
    const selected = selectByBudget(candidates, budget);
    const verdict = verifySufficiency(taskId, oracleGraph, selected);
    const tokensUsed = selected.reduce((acc, id) => {
      const c = candidates.find((x) => x.id === id);
      return acc + (c && typeof c.tokens === "number" ? c.tokens : 0);
    }, 0);
    const rate = fullTokens === 0 ? 1 : 1 - tokensUsed / fullTokens;
    const distortion = verdict.sufficient ? 0 : 1;
    const point = {
      budget,
      rate: clamp01(rate),
      distortion: clamp01(distortion),
      sufficient: verdict.sufficient,
      selected,
      tokensUsed,
    };
    curve.push(point);
    if (operatingPoint === null && verdict.sufficient) {
      operatingPoint = point;
    }
    if (verdict.sufficient && point.rate > maxRate) {
      maxRate = point.rate;
    }
  }

  // Track which required nodes were ever included across any point
  const everIncludedRequired = new Set();
  for (const p of curve) {
    for (const id of p.selected) if (requiredSet.has(id)) everIncludedRequired.add(id);
  }
  const unreachableRequired = requiredClosure.filter((id) => !everIncludedRequired.has(id));

  const crr = operatingPoint ? operatingPoint.rate : (curve.length ? curve[curve.length - 1].rate : 0);

  return {
    taskId,
    fullTokens,
    curve,
    operatingPoint,
    crr: clamp01(crr),
    maxRate: clamp01(maxRate),
    stats: {
      pointCount: curve.length,
      requiredCount: requiredClosure.length,
      unreachableRequiredCount: unreachableRequired.length,
      unreachableRequired,
      sufficientPoints: curve.filter((p) => p.sufficient).length,
    },
  };
}

/**
 * Convenience: Context Reduction Rate at a specific budget.
 *
 * @param {RDReport} report
 * @param {number} budget
 * @returns {number} CRR in [0, 1]; 0 if budget not in curve.
 */
export function crrAt(report, budget) {
  if (!report || !Array.isArray(report.curve)) return 0;
  const point = report.curve.find((p) => p.budget === budget);
  if (!point) return 0;
  return point.rate;
}

/**
 * Convenience: distortion at a specific budget.
 *
 * @param {RDReport} report
 * @param {number} budget
 * @returns {number} distortion in [0, 1]; 1 if budget not in curve.
 */
export function distortionAt(report, budget) {
  if (!report || !Array.isArray(report.curve)) return 1;
  const point = report.curve.find((p) => p.budget === budget);
  if (!point) return 1;
  return point.distortion;
}

/**
 * Aggregate rate-distortion across multiple tasks into a mean curve.
 *
 * @param {RDReport[]} reports
 * @returns {{meanCrr: number, meanMaxRate: number, pointCount: number}}
 */
export function aggregateRateDistortion(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return { meanCrr: 0, meanMaxRate: 0, pointCount: 0 };
  }
  let crrSum = 0;
  let maxSum = 0;
  let pts = 0;
  for (const r of reports) {
    if (typeof r.crr === "number" && !Number.isNaN(r.crr)) crrSum += r.crr;
    if (typeof r.maxRate === "number" && !Number.isNaN(r.maxRate)) maxSum += r.maxRate;
    pts += r && Array.isArray(r.curve) ? r.curve.length : 0;
  }
  return {
    meanCrr: crrSum / reports.length,
    meanMaxRate: maxSum / reports.length,
    pointCount: pts,
  };
}

function clamp01(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
