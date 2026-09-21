/**
 * WAM Context Routing — Observability
 *
 * Exposes why WAM included, excluded, deferred or rejected context during
 * context routing. Every routing decision must be explainable.
 *
 * Decision types:
 * - included
 * - excluded
 * - dependency-required
 * - evidence-required
 * - superseded
 * - stale
 * - invalidated
 * - budget-exceeded
 * - low-relevance
 * - missing
 */

import { ContextGraph } from "./context-graph.js";
import { getHistoricalCandidates } from "./context-history-relevance.js";
import { getDependencies, detectContextGaps } from "./task-dependencies.js";

/**
 * @typedef {"included"|"excluded"|"dependency-required"|"evidence-required"|"superseded"|"stale"|"invalidated"|"budget-exceeded"|"low-relevance"|"missing"} RoutingDecisionType
 */

/**
 * @typedef {Object} RoutingDecision
 * @property {string} itemId
 * @property {RoutingDecisionType} type
 * @property {string} reason
 * @property {string} [supersededBy]
 * @property {string} [requiredBy]
 */

export function explainRoutingDecision(item, context, graph) {
  const decisions = [];

  // Check if item was included
  if (context.included?.includes(item.id)) {
    const reason = explainInclusion(item, context, graph);
    decisions.push({
      itemId: item.id,
      type: "included",
      reason,
    });
    return decisions;
  }

  // Check various exclusion reasons
  if (item.status === "superseded") {
    decisions.push({
      itemId: item.id,
      type: "superseded",
      reason: `Superseded by ${item.supersededBy || "newer version"}`,
      supersededBy: item.supersededBy,
    });
  } else if (item.status === "stale") {
    decisions.push({
      itemId: item.id,
      type: "stale",
      reason: "No longer relevant to current task",
    });
  } else if (item.status === "invalidated") {
    decisions.push({
      itemId: item.id,
      type: "invalidated",
      reason: item.invalidationReason || "Evidence or output was invalidated",
    });
  } else if (context.excluded?.includes(item.id)) {
    const reason = explainExclusion(item, context, graph);
    decisions.push({
      itemId: item.id,
      type: reason.type,
      reason: reason.description,
    });
  } else if (
    context.missing &&
    context.missing.some(
      (g) =>
        g.requiredBy === item.id ||
        (typeof g.description === "string" && g.description.includes(item.id)) ||
        (g.type === "missing_dependency" && g.requiredBy)
    )
  ) {
    const gap = context.missing.find(
      (g) =>
        g.requiredBy === item.id ||
        (typeof g.description === "string" && g.description.includes(item.id)) ||
        (g.type === "missing_dependency" && g.requiredBy)
    );
    decisions.push({
      itemId: item.id,
      type: "missing",
      reason: gap.description || "Required but missing",
      requiredBy: gap.requiredBy,
    });
  } else if (!context.included?.includes(item.id) && context.included) {
    decisions.push({
      itemId: item.id,
      type: "low-relevance",
      reason: `Relevance score ${item.relevanceScore || 0} below threshold`,
    });
  }

  return decisions;
}

function explainInclusion(item, context, graph) {
  if (item.dependencyOf) {
    return `Required by ${item.dependencyOf}`;
  }
  if (item.supports) {
    return `Supports evidence ${item.supports}`;
  }
  if (item.type === "decision") {
    return "Active decision affecting current task";
  }
  if (item.type === "requirement" && item.status === "unresolved") {
    return "Unresolved requirement from current task";
  }
  if (item.relevanceScore > 0.7) {
    return `High relevance score: ${item.relevanceScore.toFixed(2)}`;
  }
  return "Included based on routing rules";
}

function explainExclusion(item, context, graph) {
  // Check if required but missing
  const gaps = context.missing || [];
  const itemId = item.id;
  const missingGap = gaps.find(
    (g) =>
      g.requiredBy === itemId ||
      (typeof g.description === "string" && g.description.includes(itemId)) ||
      (g.type === "missing_dependency" && g.requiredBy)
  );
  if (missingGap) {
    return { type: "missing", description: missingGap.description };
  }

  // Check budget
  if (context.tokenBudget && context.totalTokens > context.tokenBudget) {
    return { type: "budget-exceeded", description: "Token budget exceeded" };
  }

  // Check if superseded
  if (item.status === "superseded") {
    return { type: "superseded", description: `Superseded by ${item.supersededBy || "newer version"}` };
  }

  // Check if stale
  if (item.status === "stale") {
    return { type: "stale", description: "No longer relevant" };
  }

  // Check if invalidated
  if (item.status === "invalidated") {
    return { type: "invalidated", description: "Content was invalidated" };
  }

  // Default: low relevance
  return { type: "low-relevance", description: `Relevance score below threshold` };
}

export function explainContextRouting(taskId, graph, context, options = {}) {
  const decisions = [];
  const { includeExcluded = true, includeIncluded = true } = options;

  // Process included items
  if (includeIncluded && context.included) {
    for (const itemId of context.included) {
      const item = findItem(itemId, context, graph);
      if (item) {
        decisions.push(...explainRoutingDecision(item, context, graph));
      }
    }
  }

  // Process excluded items
  if (includeExcluded && context.excluded) {
    for (const itemId of context.excluded) {
      const item = findItem(itemId, context, graph);
      if (item) {
        decisions.push(...explainRoutingDecision(item, context, graph));
      }
    }
  }

  // Process missing items
  if (context.missing) {
    for (const gap of context.missing) {
      decisions.push({
        itemId: gap.type,
        type: "missing",
        reason: gap.description,
        requiredBy: gap.requiredBy,
      });
    }
  }

  return decisions;
}

function findItem(itemId, context, graph) {
  // Check included items
  if (context.includedItems) {
    const item = context.includedItems.find((i) => i.id === itemId);
    if (item) return item;
  }

  // Check graph
  if (graph) {
    const node = graph.getNode(itemId);
    if (node) return node;
  }

  // Return minimal object
  return { id: itemId };
}

export function formatRoutingReport(decisions) {
  const byType = {
    included: [],
    excluded: [],
    missing: [],
    superseded: [],
    stale: [],
    invalidated: [],
    budgetExceeded: [],
    lowRelevance: [],
  };

  for (const d of decisions) {
    if (d.type === "included") byType.included.push(d);
    else if (d.type === "missing") byType.missing.push(d);
    else if (d.type === "superseded") byType.superseded.push(d);
    else if (d.type === "stale") byType.stale.push(d);
    else if (d.type === "invalidated") byType.invalidated.push(d);
    else if (d.type === "budget-exceeded") byType.budgetExceeded.push(d);
    else byType.excluded.push(d);
  }

  const lines = ["# Routing Decision Report", ""];

  if (byType.included.length > 0) {
    lines.push("## Included");
    for (const d of byType.included) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  if (byType.missing.length > 0) {
    lines.push("## Missing");
    for (const d of byType.missing) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  if (byType.excluded.length > 0) {
    lines.push("## Excluded");
    for (const d of byType.excluded) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  if (byType.superseded.length > 0) {
    lines.push("## Superseded");
    for (const d of byType.superseded) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  if (byType.stale.length > 0) {
    lines.push("## Stale");
    for (const d of byType.stale) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  if (byType.invalidated.length > 0) {
    lines.push("## Invalidated");
    for (const d of byType.invalidated) {
      lines.push(`- ${d.itemId}: ${d.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
