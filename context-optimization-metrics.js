/**
 * WAM Context Optimization Metrics — C06
 *
 * Records and computes the six metrics defined for context optimization:
 *   - CRR (Context Reduction Rate)        : how aggressively we shrink context
 *   - SPR (Sufficiency Preservation Rate) : how much of the required context survived
 *   - COR (Critical Omission Rate)        : whether a critical node was dropped
 *   - CWR (Context Waste Rate)            : how much kept context was actually used
 *   - PFR (Page Fault Rate)               : how often we had to re-fetch after selection
 *   - RPC (Reacquisition Cost)            : total tokens spent reacquiring missed context
 *
 * The module is intentionally framework-free: the recording primitives
 * (`record`, `metrics`) can be invoked by any selector (router, builder,
 * retrieval, promotion) so we get end-to-end observability without coupling.
 */

// -- Types --
// (informative JSDoc only; runtime is plain JS)
//
// @typedef {Object} ContextMetricInput
// @property {string} strategy         selector name (e.g. "full", "semantic-top-k", "wam-router")
// @property {number} requiredTokens   tokens for the *required* ids (SPR/CWR denominator)
// @property {number} selectedTokens   tokens actually selected
// @property {number} [fullTokens]     tokens for the entire candidate graph (CRR denominator).
//                                     Defaults to `requiredTokens` when not supplied.
// @property {string[]} requiredIds    ids the task actually needed
// @property {string[]} selectedIds    ids actually selected
// @property {string[]} criticalIds    subset of requiredIds that MUST be present (COR)
// @property {string[]} usedIds        ids the consumer actually read/used downstream
// @property {number} pageFaults       number of additional fetches triggered by misses
// @property {number} reacquiredTokens tokens spent on those additional fetches
// @property {boolean} [taskSuccess]   did the downstream task succeed? 1 for TSR numerator
// @property {boolean} [verified]      did an independent oracle verify sufficiency? 1 for VSR numerator
// @property {number} [retrievalOverhead] tokens spent on retrieval/lookup overhead (TTC component)
// @property {string[]} [oracleMissing] ids the oracle declared missing (independent ground truth)

/**
 * @typedef {Object} ContextMetrics
 * @property {string} strategy
 * @property {number} CRR  Context Reduction Rate              (0..1, higher = more reduction)
 * @property {number} SPR  Sufficiency Preservation Rate      (0..1, higher = better)
 * @property {number} COR  Critical Omission Rate             (0..1, lower is better)
 * @property {number} CWR  Context Waste Rate                 (0..1, lower = better)
 * @property {number} PFR  Page Fault Rate                    (0..1, lower is better)
 * @property {number} RPC  Reacquisition Cost (tokens)        (>=0, lower is better)
 * @property {number} selectedTokens
 * @property {number} requiredTokens
 * @property {number} usedTokens
 * @property {number} pageFaults
 * @property {number} reacquiredTokens
 */

// -- Token estimation --

/**
 * Cheap, deterministic token estimator (≈ length / 4).
 * @param {string|undefined|null} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

/**
 * Sum tokens across a set of nodes (any object with a `content` field).
 * @param {Iterable<{content: string}>} nodes
 * @returns {number}
 */
export function nodesTokens(nodes) {
  let total = 0;
  for (const n of nodes) total += estimateTokens(n?.content) + 20;
  return total;
}

// -- Recording primitives --

/**
 * Compute all six metrics from a single selection event.
 * Pure function: no side effects, no I/O.
 *
 * @param {ContextMetricInput} input
 * @returns {ContextMetrics}
 */
export function record(input) {
  const strategy = String(input?.strategy ?? "unknown");
  const requiredTokens = Math.max(0, Number(input?.requiredTokens ?? 0));
  const selectedTokens = Math.max(0, Number(input?.selectedTokens ?? 0));
  const fullTokens = Math.max(
    0,
    Number(input?.fullTokens ?? Math.max(requiredTokens, selectedTokens))
  );
  const requiredIds = Array.isArray(input?.requiredIds) ? input.requiredIds : [];
  const selectedIds = Array.isArray(input?.selectedIds) ? input.selectedIds : [];
  const criticalIds = Array.isArray(input?.criticalIds) ? input.criticalIds : [];
  const usedIds = Array.isArray(input?.usedIds) ? input.usedIds : [];
  const pageFaults = Math.max(0, Number(input?.pageFaults ?? 0));
  const reacquiredTokens = Math.max(0, Number(input?.reacquiredTokens ?? 0));

  const requiredSet = new Set(requiredIds);
  const selectedSet = new Set(selectedIds);
  const criticalSet = new Set(criticalIds);

  // CRR: how much we shrunk relative to the FULL candidate graph
  //     (i.e. shipping everything). This is the metric that justifies
  //     the selector's existence; measured against required it floors
  //     to 0 the moment we add a single distractor.
  //     If full is empty, we report 0 (no reduction happened).
  const CRR =
    fullTokens > 0
      ? clamp01(1 - selectedTokens / fullTokens)
      : 0;

  // SPR: fraction of required ids we still have available.
  //     1.0 when there is nothing required (vacuous truth).
  let preserved = 0;
  for (const id of requiredSet) if (selectedSet.has(id)) preserved++;
  const SPR = requiredSet.size === 0 ? 1 : clamp01(preserved / requiredSet.size);

  // COR: fraction of critical ids that were dropped.
  let missingCritical = 0;
  for (const id of criticalSet) if (!selectedSet.has(id)) missingCritical++;
  const COR = criticalSet.size === 0 ? 0 : clamp01(missingCritical / criticalSet.size);

  // CWR: fraction of selected tokens that ended up unused.
  //     Token-weighted waste is more informative than a raw id ratio.
  //     When `usedTokens` is not supplied, derive from the actual usedIds set
  //     (intersected with selectedIds) rather than defaulting to selectedIds.
  //     This ensures CWR reflects real downstream consumption.
  const usedSet = new Set(usedIds);
  let usedTokens = 0;
  if (typeof input?.usedTokens === "number") {
    usedTokens = Math.max(0, Math.min(selectedTokens, Number(input.usedTokens)));
  } else if (selectedIds.length > 0) {
    // Count usedIds that actually belong to the selected set; estimate
    // used tokens proportionally to selectedTokens.
    let usedInSelection = 0;
    for (const id of usedSet) if (selectedSet.has(id)) usedInSelection++;
    usedTokens = (usedInSelection / selectedIds.length) * selectedTokens;
  } else {
    usedTokens = 0;
  }
  const CWR = selectedTokens > 0 ? clamp01(1 - usedTokens / selectedTokens) : 0;

  // PFR: page faults normalized by total selected ids (avoids div-by-zero).
  const PFR = selectedIds.length > 0 ? clamp01(pageFaults / selectedIds.length) : 0;

  // RPC: raw reacquired tokens. Not normalized; it's a cost, not a rate.
  const RPC = reacquiredTokens;

  // -- Extended metrics (P1) --
  //
  // TSR (Task Success Rate): whether the downstream task succeeded.
  //     Computed as 1 when `taskSuccess` is true, 0 when false.
  //     NaN/undefined -> omitted from output to avoid poisoning summaries.
  //     Boolean per-record; aggregated in summarize() by mean.
  const TSR =
    input?.taskSuccess === true ? 1 : input?.taskSuccess === false ? 0 : null;

  // VSR (Verification/Oracle Success Rate): did an independent oracle
  //     verify the selection as sufficient?  Independent of the selector's
  //     own requiredIds — uses oracleMissing.length === 0 as truth.
  //     Defaults to null when no oracle verdict was supplied.
  const oracleMissing = Array.isArray(input?.oracleMissing)
    ? input.oracleMissing
    : null;
  const VSR = oracleMissing ? (oracleMissing.length === 0 ? 1 : 0) : null;

  // TTC (Total Context Cost) = initial selection tokens + reacquired
  //     tokens + retrieval overhead.  This is the real cost the system
  //     paid to deliver context, not just the bytes we shipped.
  const retrievalOverhead =
    typeof input?.retrievalOverhead === "number" &&
    Number.isFinite(input.retrievalOverhead)
      ? Math.max(0, input.retrievalOverhead)
      : 0;
  const TTC = Math.round(
    Math.max(0, selectedTokens) + Math.max(0, reacquiredTokens) + retrievalOverhead
  );

  const out = {
    strategy: input.strategy,
    CRR: round4(CRR),
    SPR: round4(SPR),
    COR: round4(COR),
    CWR: round4(CWR),
    PFR: round4(PFR),
    RPC: Math.round(RPC),
    selectedTokens: Math.round(selectedTokens),
    requiredTokens: Math.round(requiredTokens),
    usedTokens: Math.round(usedTokens),
    pageFaults,
    reacquiredTokens: Math.round(reacquiredTokens),
    TTC,
    retrievalOverhead: Math.round(retrievalOverhead),
  };
  if (TSR !== null) out.TSR = round4(TSR);
  if (VSR !== null) out.VSR = round4(VSR);
  if (oracleMissing) out.oracleMissing = [...oracleMissing];
  return out;
}

// -- Aggregate / summary --

/**
 * Aggregate multiple metric records into a per-strategy summary
 * (mean for rates, sum for RPC/PFR counts).
 *
 * @param {ContextMetrics[]} records
 * @returns {Object<string, ContextMetrics & {samples: number}>}
 */
export function summarize(records) {
  const buckets = new Map();
  for (const r of records || []) {
    const key = r.strategy || "unknown";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const out = {};
  for (const [strategy, items] of buckets) {
    const n = items.length || 1;
    const sum = (k) => items.reduce((acc, x) => acc + (x[k] || 0), 0);
    const mean = (k) => sum(k) / n;
    // TSR / VSR are per-record booleans coerced to 0/1; aggregate by mean
    // over only the records that reported them.  Records that did not
    // report a verdict must not be counted as failures.
    const tsrRecords = items.filter((x) => typeof x.TSR === "number");
    const vsrRecords = items.filter((x) => typeof x.VSR === "number");
    const tsrMean =
      tsrRecords.length === 0
        ? null
        : tsrRecords.reduce((acc, x) => acc + x.TSR, 0) / tsrRecords.length;
    const vsrMean =
      vsrRecords.length === 0
        ? null
        : vsrRecords.reduce((acc, x) => acc + x.VSR, 0) / vsrRecords.length;
    const agg = {
      strategy,
      CRR: round4(mean("CRR")),
      SPR: round4(mean("SPR")),
      COR: round4(mean("COR")),
      CWR: round4(mean("CWR")),
      PFR: round4(mean("PFR")),
      RPC: Math.round(sum("RPC")),
      selectedTokens: Math.round(sum("selectedTokens")),
      requiredTokens: Math.round(sum("requiredTokens")),
      usedTokens: Math.round(sum("usedTokens")),
      pageFaults: Math.round(sum("pageFaults")),
      reacquiredTokens: Math.round(sum("reacquiredTokens")),
      TTC: Math.round(sum("TTC")),
      retrievalOverhead: Math.round(sum("retrievalOverhead")),
      samples: n,
    };
    if (tsrMean !== null) agg.TSR = round4(tsrMean);
    if (vsrMean !== null) agg.VSR = round4(vsrMean);
    agg.tsrReported = tsrRecords.length;
    agg.vsrReported = vsrRecords.length;
    out[strategy] = agg;
  }
  return out;
}

// -- Falsifiable gates --

/**
 * Default thresholds for the falsifiable gates (C10).
 *
 * Gates are split into two explicit categories (P1):
 *
 *   - SAFETY gates: a selector that fails these is fundamentally unsafe;
 *     they cannot be relaxed for "performance" reasons.
 *       SPR_MIN  (>=0.99)        required ids must mostly survive
 *       COR_MAX  (=0.0)          critical ids must NEVER be dropped
 *       TSR_MIN  (>=0.99)        downstream task must mostly succeed
 *       VSR_MIN  (>=0.99)        independent oracle must mostly verify
 *
 *   - OPTIMIZATION gates: a selector that fails these is wasteful but
 *     not unsafe.  They are tunable per-corpus.
 *       CWR_MAX  (0.5)           kept context was actually used
 *       PFR_MAX  (0.05)          additional fetches triggered by misses
 *       RPC_MAX  (0)             reacquisition cost must be explained
 *       CRR_MIN  (0.0)           any reduction is fine
 *
 * `evaluateGates()` evaluates BOTH sets and returns both verdicts.
 * `evaluateSafetyGates()` and `evaluateOptimizationGates()` evaluate
 * one set at a time so callers can reason about each independently.
 */
export const SAFETY_GATES = Object.freeze({
  SPR_MIN: 0.99,
  COR_MAX: 0.0,
  TSR_MIN: 0.99,
  VSR_MIN: 0.99,
});

export const OPTIMIZATION_GATES = Object.freeze({
  CWR_MAX: 0.5,
  PFR_MAX: 0.05,
  RPC_MAX: 0,
  CRR_MIN: 0.0,
});

// Back-compat alias: the historical "DEFAULT_GATES" is the union of both
// sets, with the same numeric thresholds as before.  New code should
// prefer SAFETY_GATES / OPTIMIZATION_GATES directly.
export const DEFAULT_GATES = Object.freeze({
  ...SAFETY_GATES,
  ...OPTIMIZATION_GATES,
});

/**
 * Evaluate ONLY safety gates against a metric record.
 *
 * @param {ContextMetrics} m
 * @param {Partial<typeof SAFETY_GATES>} [overrides]
 * @returns {{pass: boolean, failures: string[]}}
 */
export function evaluateSafetyGates(m, overrides = {}) {
  const g = { ...SAFETY_GATES, ...(overrides || {}) };
  const failures = [];
  if (typeof m.SPR === "number" && m.SPR < g.SPR_MIN) {
    failures.push(`SPR ${m.SPR} < ${g.SPR_MIN}`);
  }
  if (typeof m.COR === "number" && m.COR > g.COR_MAX) {
    failures.push(`COR ${m.COR} > ${g.COR_MAX}`);
  }
  // TSR/VSR may be absent on records that did not report a verdict.
  // We only fail when a verdict WAS reported and it falls below floor.
  if (typeof m.TSR === "number" && m.TSR < g.TSR_MIN) {
    failures.push(`TSR ${m.TSR} < ${g.TSR_MIN}`);
  }
  if (typeof m.VSR === "number" && m.VSR < g.VSR_MIN) {
    failures.push(`VSR ${m.VSR} < ${g.VSR_MIN}`);
  }
  return { pass: failures.length === 0, failures };
}

/**
 * Evaluate ONLY optimization gates against a metric record.
 *
 * @param {ContextMetrics} m
 * @param {Partial<typeof OPTIMIZATION_GATES>} [overrides]
 * @returns {{pass: boolean, failures: string[]}}
 */
export function evaluateOptimizationGates(m, overrides = {}) {
  const g = { ...OPTIMIZATION_GATES, ...(overrides || {}) };
  const failures = [];
  if (typeof m.CWR === "number" && m.CWR > g.CWR_MAX) {
    failures.push(`CWR ${m.CWR} > ${g.CWR_MAX}`);
  }
  if (typeof m.PFR === "number" && m.PFR > g.PFR_MAX) {
    failures.push(`PFR ${m.PFR} > ${g.PFR_MAX}`);
  }
  if (typeof m.RPC === "number" && m.RPC > g.RPC_MAX) {
    failures.push(`RPC ${m.RPC} > ${g.RPC_MAX}`);
  }
  // CRR_MIN: if there is reduction at all, fine. We don't push for more.
  if (typeof m.CRR === "number" && m.CRR < g.CRR_MIN) {
    failures.push(`CRR ${m.CRR} < ${g.CRR_MIN}`);
  }
  return { pass: failures.length === 0, failures };
}

/**
 * Evaluate a metric against the full falsifiable gate set.
 *
 * Returned object splits safety vs optimization verdicts so callers
 * (benchmark, ablation, CI) can act on each independently.  The legacy
 * `pass` and `failures` fields remain the AND of both sets so existing
 * callers keep working unchanged.
 *
 * @param {ContextMetrics} m
 * @param {Partial<typeof DEFAULT_GATES>} [overrides]
 * @returns {{pass: boolean, failures: string[], safety: {pass: boolean, failures: string[]}, optimization: {pass: boolean, failures: string[]}}}
 */
export function evaluateGates(m, overrides = {}) {
  const safety = evaluateSafetyGates(m, overrides);
  const optimization = evaluateOptimizationGates(m, overrides);
  return {
    pass: safety.pass && optimization.pass,
    failures: [...safety.failures, ...optimization.failures],
    safety,
    optimization,
  };
}

// -- Helpers --

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
