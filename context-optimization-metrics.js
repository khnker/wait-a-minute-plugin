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
  const usedSet = new Set(usedIds);
  let usedTokens = 0;
  // We don't know the per-id token cost from the IDs alone; use a relative
  // estimate from the id-set ratio and selectedTokens when no per-id costs
  // are supplied. Callers may pass `usedTokens` directly to override.
  if (typeof input?.usedTokens === "number") {
    usedTokens = Math.max(0, Math.min(selectedTokens, Number(input.usedTokens)));
  } else if (selectedIds.length > 0) {
    usedTokens = (usedSet.size / selectedIds.length) * selectedTokens;
  } else {
    usedTokens = 0;
  }
  const CWR = selectedTokens > 0 ? clamp01(1 - usedTokens / selectedTokens) : 0;

  // PFR: page faults normalized by total selected ids (avoids div-by-zero).
  const PFR = selectedIds.length > 0 ? clamp01(pageFaults / selectedIds.length) : 0;

  // RPC: raw reacquired tokens. Not normalized; it's a cost, not a rate.
  const RPC = reacquiredTokens;

  return {
    strategy,
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
  };
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
    out[strategy] = {
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
      samples: n,
    };
  }
  return out;
}

// -- Falsifiable gates --

/**
 * Default thresholds for the falsifiable gates (C10).
 * Tightened to: SPR must be near-perfect, COR must be zero,
 * waste must stay modest, page faults and reacquisition cost bounded.
 */
export const DEFAULT_GATES = Object.freeze({
  SPR_MIN: 0.99,
  COR_MAX: 0.0,
  CWR_MAX: 0.5,
  PFR_MAX: 0.05,
  RPC_MAX: 0, // any reacquisition cost must be explained, not hidden
  CRR_MIN: 0.0, // any reduction is fine; absence is just honest reporting
});

/**
 * Evaluate a metric against a set of falsifiable gates.
 *
 * @param {ContextMetrics} m
 * @param {Partial<typeof DEFAULT_GATES>} [overrides]
 * @returns {{pass: boolean, failures: string[]}}
 */
export function evaluateGates(m, overrides = {}) {
  const g = { ...DEFAULT_GATES, ...(overrides || {}) };
  const failures = [];
  if (m.SPR < g.SPR_MIN) failures.push(`SPR ${m.SPR} < ${g.SPR_MIN}`);
  if (m.COR > g.COR_MAX) failures.push(`COR ${m.COR} > ${g.COR_MAX}`);
  if (m.CWR > g.CWR_MAX) failures.push(`CWR ${m.CWR} > ${g.CWR_MAX}`);
  if (m.PFR > g.PFR_MAX) failures.push(`PFR ${m.PFR} > ${g.PFR_MAX}`);
  if (m.RPC > g.RPC_MAX) failures.push(`RPC ${m.RPC} > ${g.RPC_MAX}`);
  return { pass: failures.length === 0, failures };
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
