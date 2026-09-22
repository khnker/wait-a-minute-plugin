/**
 * Context Selection Telemetry (C03 — context-observability-v1)
 *
 * Emits one JSONL record per decision made by the context-router / builder.
 * Each record is intended to be appended to `selection-log.jsonl` (or written
 * via the writer injected through `setWriter`).
 *
 * Required fields per decision:
 *   - timestamp (ISO)
 *   - decisionId
 *   - taskId
 *   - per-node admission tier (MANDATORY | CONDITIONAL | OPTIONAL)
 *   - per-node token estimate
 *   - omitted vs selected counts
 *   - budget breakdown (mandatory / conditional / optional)
 *   - sufficiency status (level + decision)
 */

import { ADMISSION } from "./context-router.js";
import { SUFFICIENCY_LEVEL, SUFFICIENCY_DECISIONS } from "./context-sufficiency-gate.js";

const ISO_NOW = () => new Date().toISOString();

let _writer = null;
let _idCounter = 0;

/**
 * Inject a writer used to persist telemetry records.
 * Should accept a complete serialized JSONL string (ending with '\n').
 *
 * @param {(line: string) => void} writer
 */
export function setWriter(writer) {
  _writer = writer;
}

/**
 * Reset internal state. Used in tests.
 */
export function _resetTelemetry() {
  _writer = null;
  _idCounter = 0;
}

/**
 * @typedef {Object} TraceDecisionInput
 * @property {string} taskId
 * @property {string} [decision]
 * @property {Array<{id:string, admission:string, tokenEstimate:number}>} [selected]
 * @property {Array<{id:string, admission:string, reason:string}>} [omitted]
 * @property {Array<{id:string, admission:string, tokenEstimate:number}>} [admitted]   // all nodes considered for admission before budgeting
 * @property {{tokenBudget:number, tokensUsed:number, tokensAvailable:number}} [budget]
 * @property {{level:string, decision?:string, activeItemCount?:number, missing?:Array}} [sufficiency]
 * @property {Object} [extra]
 */

/**
 * Record a selection decision. Emits a JSONL line and returns the structured record.
 *
 * @param {TraceDecisionInput} input
 * @returns {Object} the telemetry record (also persisted to writer)
 */
export function recordDecision(input) {
  const selected = input.selected || [];
  const omitted = input.omitted || [];

  const budgetBreakdown = computeBudgetBreakdown(selected, omitted, input.admitted || []);

  const sufficiencyStatus = {
    level: input.sufficiency?.level || SUFFICIENCY_LEVEL.INSUFFICIENT,
    decision: input.sufficiency?.decision || SUFFICIENCY_DECISIONS.REQUEST_MORE,
    sufficient: input.sufficiency?.level === SUFFICIENCY_LEVEL.SUFFICIENT
      || input.sufficiency?.level === SUFFICIENCY_LEVEL.COMPLETE,
  };

  const record = {
    schema: "context-selection-telemetry/v1",
    timestamp: ISO_NOW(),
    decisionId: `d_${(++_idCounter).toString(36)}`,
    taskId: input.taskId,
    decision: input.decision || "SELECT",
    counts: {
      considered: (input.admitted || []).length,
      selected: selected.length,
      omitted: omitted.length,
    },
    perNodeAdmission: selected.map((n) => ({
      id: n.id,
      tier: n.admission || ADMISSION.OPTIONAL,
      tokenEstimate: n.tokenEstimate || 0,
    })),
    omittedNodes: omitted.map((n) => ({
      id: n.id,
      tier: n.admission || ADMISSION.OPTIONAL,
      reason: n.reason || "BUDGET",
    })),
    budget: {
      tokenBudget: input.budget?.tokenBudget || 0,
      tokensUsed: input.budget?.tokensUsed || 0,
      tokensAvailable: input.budget?.tokensAvailable || 0,
      breakdown: budgetBreakdown,
    },
    sufficiency: sufficiencyStatus,
    ...(input.extra ? { extra: input.extra } : {}),
  };

  if (typeof _writer === "function") {
    try {
      _writer(JSON.stringify(record) + "\n");
    } catch {
      // writer errors must never break selection — telemetry is best-effort.
    }
  }

  return record;
}

/**
 * Compute per-tier token breakdown for a selection decision.
 *
 * Mandatory tokens are reported from `selected` (mandatory nodes are never
 * dropped). Conditional and optional counts aggregate from both selected and
 * omitted lists so we can observe what was cut.
 */
export function computeBudgetBreakdown(selected, omitted, admitted) {
  const init = () => ({
    MANDATORY: { tokens: 0, count: 0 },
    CONDITIONAL: { tokens: 0, count: 0 },
    OPTIONAL: { tokens: 0, count: 0 },
  });

  const breakdown = init();

  for (const n of selected || []) {
    const tier = n.admission || ADMISSION.OPTIONAL;
    breakdown[tier].tokens += n.tokenEstimate || 0;
    breakdown[tier].count += 1;
  }

  for (const n of omitted || []) {
    const tier = n.admission || ADMISSION.OPTIONAL;
    breakdown[tier].count += 1;
  }

  // Record considered-but-either-included-or-cut counts to give observability
  // over nodes that never made it through the admission stage.
  const considered = { total: admitted.length };
  breakdown.considered = considered;

  return breakdown;
}

/**
 * Convenience: persist a record + return it. Mirrors `recordDecision` but
 * requires a writer to be set; throws otherwise. Used by hook-points where
 * silent telemetry is undesirable (e.g. test fixtures asserting wiring).
 */
export function requireRecordDecision(input) {
  if (typeof _writer !== "function") {
    throw new Error("No telemetry writer configured. Call setWriter() first.");
  }
  return recordDecision(input);
}

export const SCHEMA = "context-selection-telemetry/v1";

/**
 * Read & parse a JSONL file. Exposed for tests / debugging. Always returns an
 * array. Malformed lines are skipped (telemetry must never crash consumers).
 */
export function parseLog(text) {
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}
