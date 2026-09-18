import { retrieveContext } from "./context-retrieval.js";
import { retrieveActiveContext, isContextSufficient } from "./active-context-boundary.js";
import { buildContextQuery, matchesQuery, scoreRelevance, retrieveRelevantContext, CONTEXT_PURPOSE } from "./context-query-contract.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";

/**
 * High-level retrieval that integrates ContextManager with query contract and active boundary.
 * @param {Object} manager - ContextManager instance (must have registry.list())
 * @param {Object} query - Output from buildContextQuery() or compatible object
 * @param {Object} options
 * @param {number} [options.maxResults=50]
 * @param {boolean} [options.includeHistory=false] - include INVALIDATED/ARCHIVED
 * @returns {{relevantItems: ManagedItem[], sufficiencyCheck: Object, metadata: Object}}
 */
export function integrateRetrieval(manager, query, options = {}) {
  const { maxResults = 50, includeHistory = false } = options;
  const startTime = Date.now();

  if (!manager || typeof manager.registry?.list !== "function") {
    throw new TypeError("integrateRetrieval requires a manager with registry.list()");
  }

  const allItems = manager.registry.list();

  let relevantItems = retrieveRelevantContext(allItems, query);

  if (!includeHistory) {
    relevantItems = retrieveActiveContext(relevantItems, query.purpose);
  }

  if (maxResults > 0 && relevantItems.length > maxResults) {
    relevantItems = relevantItems.slice(0, maxResults);
  }

  const sufficiencyCheck = isContextSufficient(relevantItems, query.purpose);

  return {
    relevantItems,
    sufficiencyCheck,
    metadata: {
      totalItems: allItems.length,
      retrievedCount: relevantItems.length,
      purpose: query.purpose,
      elapsedMs: Date.now() - startTime,
    },
  };
}

/**
 * Convenience: build query and retrieve in one call.
 * @param {Object} manager - ContextManager instance
 * @param {Object} params - buildContextQuery parameters
 * @param {Object} options - integrateRetrieval options
 */
export function retrieveForContext(manager, params, options = {}) {
  const query = buildContextQuery(params);
  return integrateRetrieval(manager, query, options);
}

export { CONTEXT_PURPOSE, buildContextQuery, matchesQuery, scoreRelevance, retrieveRelevantContext, retrieveActiveContext, isContextSufficient };