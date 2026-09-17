import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";
import { invalidateDependentEvidence } from "./evidence-lineage.js";
import { transition as lifecycleTransition } from "./context-lifecycle.js";

export const INVALIDATION_REASONS = Object.freeze({
  REQUIREMENT_CHANGED: "REQUIREMENT_CHANGED",
  STRATEGY_CHANGED: "STRATEGY_CHANGED",
  HYPOTHESIS_CONTRADICTED: "HYPOTHESIS_CONTRADICTED",
  TOOL_RESULT_CONTRADICTS_PREMISE: "TOOL_RESULT_CONTRADICTS_PREMISE",
  DEPENDENCY_CHANGED: "DEPENDENCY_CHANGED",
  CONFIG_CHANGED: "CONFIG_CHANGED",
  USER_DECISION_CHANGED: "USER_DECISION_CHANGED",
  BRANCH_CHANGED: "BRANCH_CHANGED",
  FILE_MODIFIED: "FILE_MODIFIED",
  ENV_CHANGED: "ENV_CHANGED",
});

export function createInvalidationEvent(taskId, reason, options = {}) {
  const event = {
    type: CONTEXT_EVENT_TYPES.CONTEXT_INVALIDATED,
    taskId,
    sessionId: options.sessionId || null,
    executionId: options.executionId || null,
    provenance: options.provenance || "context-invalidation",
    payload: {
      reason,
      invalidatedAt: Date.now(),
      invalidatedBy: options.invalidatedBy || "system",
      scope: options.scope || "TASK",
      invalidatedIds: options.invalidatedIds || [],
      unresolvedCriticalUnknowns: options.unresolvedCriticalUnknowns || [],
      ...options.payload,
    },
  };
  return event;
}

export function applyInvalidation(contextManager, evidenceLineage, event) {
  const { taskId, payload } = event;
  const { reason, invalidatedIds, scope } = payload;

  const affected = [];

  if (invalidatedIds && invalidatedIds.length > 0) {
    for (const itemId of invalidatedIds) {
      const item = contextManager.getSource(itemId);
      if (item) {
        const updated = lifecycleTransition(item, "INVALIDATED", {
          invalidationReason: reason,
          invalidationEventId: event.id,
          invalidatedAt: payload.invalidatedAt,
        });
        contextManager.register(updated);
        affected.push({ itemId, reason, action: "INVALIDATED" });
      }
    }
  }

  if (reason === INVALIDATION_REASONS.HYPOTHESIS_CONTRADICTED) {
    const hypothesisId = invalidatedIds?.[0] || options?.hypothesisId;
    if (hypothesisId && evidenceLineage) {
      const staleEvidence = invalidateDependentEvidence(taskId, hypothesisId, reason);
      for (const ev of staleEvidence) {
        const item = contextManager.getSource(ev.id);
        if (item) {
          const updated = lifecycleTransition(item, "INVALIDATED", {
            invalidationReason: reason,
            invalidationEventId: event.id,
          });
          contextManager.register(updated);
          affected.push({ itemId: ev.id, reason, action: "INVALIDATED_EVIDENCE" });
        }
      }
    }
  }

  return affected;
}

export function createFileModifiedEvent(taskId, path, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.FILE_MODIFIED, {
    sessionId,
    payload: { path, changeType: options.changeType || "modify", affectedItems: options.affectedItems },
  });
}

export function createRequirementChangedEvent(taskId, requirementId, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.REQUIREMENT_CHANGED, {
    sessionId,
    invalidatedIds: [requirementId],
    payload: { requirementId, changeType: options.changeType },
  });
}

export function createStrategyChangedEvent(taskId, strategyId, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.STRATEGY_CHANGED, {
    sessionId,
    payload: { strategyId, changeType: options.changeType },
  });
}

export function createHypothesisContradictedEvent(taskId, hypothesisId, sessionId, executionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.HYPOTHESIS_CONTRADICTED, {
    sessionId,
    executionId,
    invalidatedIds: [hypothesisId],
    payload: { hypothesisId, assessment: options.assessment },
  });
}

export function createDependencyChangedEvent(taskId, dependency, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.DEPENDENCY_CHANGED, {
    sessionId,
    payload: { dependency, changeType: options.changeType },
  });
}

export function createConfigChangedEvent(taskId, configKey, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.CONFIG_CHANGED, {
    sessionId,
    payload: { configKey, changeType: options.changeType },
  });
}

export function createToolResultContradictsPremiseEvent(taskId, premise, executionId, sessionId, options = {}) {
  return createInvalidationEvent(taskId, INVALIDATION_REASONS.TOOL_RESULT_CONTRADICTS_PREMISE, {
    sessionId,
    executionId,
    payload: { premise, toolResult: options.toolResult },
  });
}

export const CONTEXT_INVALIDATION_ACTIONS = Object.freeze({
  INVALIDATE_ITEM: "INVALIDATE_ITEM",
  STALE_ITEM: "STALE_ITEM",
  ARCHIVE_ITEM: "ARCHIVE_ITEM",
  REEVALUATE_ITEM: "REEVALUATE_ITEM",
});

export function determineInvalidationAction(item, reason) {
  if (item.lifecycle === "ARCHIVED" || item.lifecycle === "INVALIDATED") {
    return CONTEXT_INVALIDATION_ACTIONS.REEVALUATE_ITEM;
  }
  if (reason === INVALIDATION_REASONS.HYPOTHESIS_CONTRADICTED) {
    return CONTEXT_INVALIDATION_ACTIONS.INVALIDATE_ITEM;
  }
  if (reason === INVALIDATION_REASONS.FILE_MODIFIED) {
    return CONTEXT_INVALIDATION_ACTIONS.STALE_ITEM;
  }
  if (reason === INVALIDATION_REASONS.CONFIG_CHANGED || reason === INVALIDATION_REASONS.ENV_CHANGED) {
    return CONTEXT_INVALIDATION_ACTIONS.INVALIDATE_ITEM;
  }
  return CONTEXT_INVALIDATION_ACTIONS.INVALIDATE_ITEM;
}