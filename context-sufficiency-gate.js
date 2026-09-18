import { TERMINAL_STATES } from "./context-lifecycle.js";
import { CONTEXT_PURPOSE } from "./context-query-contract.js";

export const SUFFICIENCY_LEVEL = Object.freeze({
  INSUFFICIENT: "INSUFFICIENT",
  PARTIAL: "PARTIAL",
  SUFFICIENT: "SUFFICIENT",
  COMPLETE: "COMPLETE",
});

export const SUFFICIENCY_DECISIONS = Object.freeze({
  PROCEED: "PROCEED",
  REQUEST_MORE: "REQUEST_MORE",
  BLOCK: "BLOCK",
});

export const MIN_LAYER_COUNTS = Object.freeze({
  [CONTEXT_PURPOSE.PLANNING]: 3,
  [CONTEXT_PURPOSE.IMPLEMENTATION]: 2,
  [CONTEXT_PURPOSE.INVESTIGATION]: 2,
  [CONTEXT_PURPOSE.DEBUGGING]: 1,
  [CONTEXT_PURPOSE.VALIDATION]: 1,
  [CONTEXT_PURPOSE.REVIEW]: 2,
  [CONTEXT_PURPOSE.RESUME]: 1,
});

const INCLUDE_HISTORY_PURPOSES = new Set([
  CONTEXT_PURPOSE.DEBUGGING,
  CONTEXT_PURPOSE.RESUME,
  "REPLAN",
  "AUDIT",
]);

const _isTerminal = (lifecycle) => TERMINAL_STATES.includes(lifecycle);

export function checkSufficiency(items, purpose = CONTEXT_PURPOSE.PLANNING) {
  if (!items || items.length === 0) {
    return {
      level: SUFFICIENCY_LEVEL.INSUFFICIENT,
      missing: [{ reason: "NO_ACTIVE_CONTEXT", type: "context" }],
      unresolvedCriticalUnknowns: [],
      mandatoryIncluded: false,
      activeItemCount: 0,
      sufficient: false,
    };
  }

  const includeHistory = INCLUDE_HISTORY_PURPOSES.has(purpose);
  const activeItems = items.filter((item) => includeHistory || !_isTerminal(item.lifecycle));
  const criticalUnknowns = items.flatMap((item) => item.unresolvedCriticalUnknowns || []);
  const hasMandatory = items.some((item) => item.mandatoryIncluded === true);
  const minCount = MIN_LAYER_COUNTS[purpose] || MIN_LAYER_COUNTS[CONTEXT_PURPOSE.PLANNING];

  let level = SUFFICIENCY_LEVEL.INSUFFICIENT;

  if (activeItems.length === 0) {
    level = SUFFICIENCY_LEVEL.INSUFFICIENT;
  } else if (criticalUnknowns.length > 0) {
    level = SUFFICIENCY_LEVEL.PARTIAL;
  } else if (activeItems.length >= minCount && hasMandatory) {
    level = SUFFICIENCY_LEVEL.COMPLETE;
  } else if (activeItems.length >= 1) {
    level = SUFFICIENCY_LEVEL.SUFFICIENT;
  }

  return {
    level,
    missing: level === SUFFICIENCY_LEVEL.INSUFFICIENT
      ? [{ reason: "INSUFFICIENT_ITEMS", type: "context", count: activeItems.length, required: minCount }]
      : [],
    unresolvedCriticalUnknowns: criticalUnknowns,
    mandatoryIncluded: hasMandatory,
    activeItemCount: activeItems.length,
    sufficient: level !== SUFFICIENCY_LEVEL.INSUFFICIENT,
  };
}

export class SufficiencyGate {
  #purpose;
  #minLevel;
  #requireMandatory;

  constructor(options = {}) {
    this.#purpose = options.purpose || CONTEXT_PURPOSE.PLANNING;
    this.#minLevel = options.minLevel || SUFFICIENCY_LEVEL.SUFFICIENT;
    this.#requireMandatory = options.requireMandatory || false;
  }

  get purpose() { return this.#purpose; }
  get minLevel() { return this.#minLevel; }
  get requireMandatory() { return this.#requireMandatory; }

  evaluate(items) {
    const sufficiency = checkSufficiency(items, this.#purpose);
    const levelOrder = [SUFFICIENCY_LEVEL.INSUFFICIENT, SUFFICIENCY_LEVEL.PARTIAL, SUFFICIENCY_LEVEL.SUFFICIENT, SUFFICIENCY_LEVEL.COMPLETE];
    const actualRank = levelOrder.indexOf(sufficiency.level);
    const minRank = levelOrder.indexOf(this.#minLevel);

    let decision;
    if (actualRank < levelOrder.indexOf(SUFFICIENCY_LEVEL.PARTIAL)) {
      decision = SUFFICIENCY_DECISIONS.REQUEST_MORE;
    } else if (actualRank < minRank) {
      decision = this.#requireMandatory && !sufficiency.mandatoryIncluded
        ? SUFFICIENCY_DECISIONS.BLOCK
        : SUFFICIENCY_DECISIONS.REQUEST_MORE;
    } else {
      decision = SUFFICIENCY_DECISIONS.PROCEED;
    }

    return {
      decision,
      sufficiency,
      metadata: {
        gatePurpose: this.#purpose,
        minLevel: this.#minLevel,
        evaluatedAt: Date.now(),
      },
    };
  }
}