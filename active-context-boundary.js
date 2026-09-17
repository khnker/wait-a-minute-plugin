import { LIFECYCLE_STATES, TERMINAL_STATES } from "./context-lifecycle.js";
import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";

export const ACTIVE_LIFECYCLES = new Set(["CREATED", "ACTIVE"]);
export const SUPPORTING_LIFECYCLES = new Set(["COMPRESSED", "STALE"]);
export const EXCLUDED_LIFECYCLES = new Set(["INVALIDATED", "ARCHIVED"]);

export const PURPOSE_MODES = Object.freeze({
  PLANNING: "PLANNING",
  IMPLEMENTATION: "IMPLEMENTATION",
  INVESTIGATION: "INVESTIGATION",
  DEBUGGING: "DEBUGGING",
  VALIDATION: "VALIDATION",
  REVIEW: "REVIEW",
  RESUME: "RESUME",
});

export function retrieveActiveContext(items, purpose = PURPOSE_MODES.PLANNING) {
  const isDebugOrResume = [PURPOSE_MODES.DEBUGGING, PURPOSE_MODES.RESUME].includes(purpose);
  const includeInvalidated = isDebugOrResume || purpose === PURPOSE_MODES.REPLAN || purpose === PURPOSE_MODES.AUDIT;

  return items.filter((item) => {
    const lc = item.lifecycle;
    if (ACTIVE_LIFECYCLES.has(lc)) return true;
    if (SUPPORTING_LIFECYCLES.has(lc)) return true;
    if (EXCLUDED_LIFECYCLES.has(lc)) return includeInvalidated;
    return true;
  });
}

export function isContextSufficient(items, purpose = PURPOSE_MODES.PLANNING) {
  const active = retrieveActiveContext(items, purpose);
  const activeCount = active.length;
  const hasCriticalMissing = active.some((item) => {
    return item.unresolvedCriticalUnknowns?.length > 0;
  });
  return {
    sufficient: activeCount > 0 && !hasCriticalMissing,
    missing: hasCriticalMissing ? active.flatMap((item) => item.unresolvedCriticalUnknowns || []) : [],
    activeCount,
    mandatoryIncluded: active.some((item) => item.mandatoryIncluded === true),
    unresolvedCriticalUnknowns: hasCriticalMissing ? active.flatMap((item) => item.unresolvedCriticalUnknowns || []) : [],
  };
}

export function invalidateContextItems(items, event) {
  const { reason, invalidatedIds, scope } = event.payload || {};
  const affected = [];

  for (const item of items) {
    if (invalidatedIds?.includes(item.id)) {
      affected.push({ ...item, lifecycle: LIFECYCLE_STATES.INVALIDATED, invalidatedAt: Date.now(), invalidationReason: reason });
    } else if (EXCLUDED_LIFECYCLES.has(item.lifecycle) && !invalidatedIds?.includes(item.id)) {
      continue;
    } else {
      affected.push(item);
    }
  }

  return affected;
}

export function markItemsStale(items, triggerEvent) {
  return items.map((item) => {
    if (EXCLUDED_LIFECYCLES.has(item.lifecycle)) return item;
    return { ...item, lifecycle: LIFECYCLE_STATES.STALE, staleReason: triggerEvent?.payload?.reason || "context-stale" };
  });
}
