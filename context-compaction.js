/**
 * Context Compression — Functions for compacting, deltas, pruning,
 * and reconstructing context state.
 *
 * OpenSpec changes: context-compaction, context-delta, context-pruning,
 * context-reconstruction (Changes 44-47).
 */

/**
 * Change 44 — compactContext
 * Compresses a full taskState into a minimal context object.
 *
 * Change 73 update: Preserves mandatory fields and provenance
 * metadata explicitly so compacted context retains traceability.
 */
export function compactContext(taskState) {
  const mandatory = (taskState.requirements || []).filter((r) => !r.optional);

  return {
    // Core mandatory fields (always preserved)
    currentGoal: taskState.currentGoal || null,
    mandatoryRequirements: mandatory.map((r) => ({
      id: r.id,
      status: r.status,
      provenance: r.provenance || null,
      mandatory: true,
    })),
    currentState: taskState.phase,
    // Evidence
    verifiedFacts: (taskState.requirements || []).filter((r) => r.status === "VERIFIED").map((r) => ({
      id: r.id,
      provenance: r.provenance || null,
    })),
    openQuestions: (taskState.questions || []).filter((q) => q.status === "OPEN").map((q) => q.id),
    evidenceGaps: taskState.evidenceGaps || [],
    contextGaps: taskState.contextGaps || [],
    recentActions: (taskState.actions || []).slice(-5),
    nextConstraint: taskState.nextConstraint || null,
    // Provenance tracking (Change 73)
    _provenance: {
      source: taskState.source || "task_state",
      mandatoryCount: mandatory.length,
      compressedAt: taskState.compressedAt || Date.now(),
      retainedFields: [
        "currentGoal",
        "mandatoryRequirements",
        "currentState",
        "verifiedFacts",
        "openQuestions",
        "evidenceGaps",
        "contextGaps",
        "recentActions",
        "nextConstraint",
      ],
    },
  };
}

/**
 * Change 73 — preserveMandatoryProvenance
 * Explicitly marks which fields in a compacted context are
 * mandatory and must never be stripped by downstream processors.
 */
export function preserveMandatoryProvenance(compacted) {
  return {
    ...compacted,
    _mandatoryFields: [
      "currentGoal",
      "mandatoryRequirements",
      "currentState",
      "verifiedFacts",
    ],
    _provenance: {
      ...(compacted._provenance || {}),
      preservationGuaranteed: true,
    },
  };
}

/**
 * Change 45 — computeContextDelta
 * Computes the delta between two context snapshots.
 */
export function computeContextDelta(previousContext, currentContext) {
  const delta = {
    unchanged: [],
    new: [],
    invalidated: [],
    modified: [],
  };

  const prevKeys = new Set(Object.keys(previousContext));
  const currKeys = new Set(Object.keys(currentContext));

  // New keys
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      delta.new.push(key);
    }
  }

  // Removed/invalidated
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      delta.invalidated.push(key);
    }
  }

  // Modified
  for (const key of currKeys) {
    if (prevKeys.has(key) && JSON.stringify(previousContext[key]) !== JSON.stringify(currentContext[key])) {
      delta.modified.push(key);
    }
  }

  // Unchanged
  for (const key of currKeys) {
    if (prevKeys.has(key) && !delta.modified.includes(key) && !delta.new.includes(key)) {
      delta.unchanged.push(key);
    }
  }

  return delta;
}

/**
 * Change 46 — pruneContext
 * Prunes context based on configurable rules.
 */
export function pruneContext(context, rules = {}) {
  const {
    removeIrrelevant = true,
    removeDuplicate = true,
    removeStale = true,
    removeInvalidated = true,
    keepHistory = true,
  } = rules;

  let pruned = { ...context };

  if (removeStale && pruned.staleItems) {
    pruned.activeItems = (pruned.activeItems || []).filter(i => !pruned.staleItems.includes(i.id));
  }

  if (removeInvalidated && pruned.invalidatedItems) {
    pruned.activeItems = (pruned.activeItems || []).filter(i => !pruned.invalidatedItems.includes(i.id));
  }

  if (removeDuplicate && pruned.activeItems) {
    const seen = new Set();
    pruned.activeItems = (pruned.activeItems || []).filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }

  return pruned;
}

/**
 * Change 47 — reconstructContext
 * Reconstructs a condensed context from WAM state.
 */
export function reconstructContext(wamState) {
  const { requirements = [], evidence = [], gaps = [], tasks = [] } = wamState;

  return {
    requirements: requirements.map(r => ({
      id: r.id,
      status: r.status,
      claim: r.claim,
    })),
    verifiedFacts: requirements.filter(r => r.status === "VERIFIED").map(r => r.id),
    invalidFacts: requirements.filter(r => r.status === "INVALIDATED").map(r => r.id),
    openGaps: gaps.filter(g => g.status === "OPEN"),
    recentTasks: tasks.slice(-3),
  };
}
