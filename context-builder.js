/**
 * Context Builder.
 * Assembles a context artifact from various sources with freshness, promotion, and budget rules.
 */

import { isStale, updateLastAccess } from "./context-freshness.js";

export function build({ context = [], memory = [], decision = [], query = {}, options = {} }) {
  const { maxItems = 10, ttl = 60000 } = options;
  const now = Date.now();

  // Combine and deduplicate
  const allItems = [...context, ...memory, ...decision];
  const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());

  // Apply freshness / staleness / ttl
  const freshItems = uniqueItems
    .filter(item => !isStale(item, ttl, now))
    .map(item => updateLastAccess(item, now));

  // Promotion rules (e.g., items mentioned in query get promoted)
  const promotedItems = freshItems.map(item => ({
    ...item,
    isPromoted: query.keywords?.some(kw => item.content?.includes(kw)) || false,
  }));

  // Budget enforcement
  // Sort by promoted first, then lastAccess
  const sortedItems = promotedItems.sort((a, b) => {
    if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
    return b.lastAccess - a.lastAccess;
  });

  const finalItems = sortedItems.slice(0, maxItems);

  return {
    structure: "artifact",
    items: finalItems,
    provenance: {
      source: "context-builder",
      timestamp: now,
      method: "build",
    },
    metadata: {
      totalInput: allItems.length,
      finalCount: finalItems.length,
    }
  };
}
