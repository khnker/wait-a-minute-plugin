/**
 * Real Context Router Selector for Benchmark
 * Bridges benchmark scenarios to the canonical WAM Context Router.
 */

import { ContextGraph, NODE_TYPES, EDGE_TYPES } from "./context-graph.js";
import { resolveContext } from "./context-router.js";
import { estimateTokens } from "./context-optimization-metrics.js";

/**
 * Build a ContextGraph instance from a benchmark scenario object.
 */
export function buildBenchmarkGraph(scenario) {
  const graph = new ContextGraph();

  // Add all scenario nodes
  if (scenario.nodes) {
    for (const [id, node] of Object.entries(scenario.nodes)) {
      graph.addNode({
        id,
        type: node.type && NODE_TYPES.includes(node.type) ? node.type : "requirement",
        content: node.content || "",
        metadata: {
          freshness: node.freshness ?? 1.0,
          importance: node.importance ?? 1.0,
          aliases: node.aliases || [],
          admission: node.admission || "CONDITIONAL",
          ...node.metadata
        }
      });
    }
  }

  // Add explicit requires edges if provided.
  // Change 04: Do not derive additional edges from requiredIds when explicit graph is provided.
  const addedEdges = new Set();
  const hasExplicitGraph = Array.isArray(scenario.requires);

  if (hasExplicitGraph) {
    for (const req of scenario.requires) {
      const requested = req.type || "requires";
      const type = EDGE_TYPES.includes(requested)
        ? requested
        : requested === "requires"
          ? "requires_completion"
          : "related_to";
      const key = `${req.from}->${req.to}:${type}`;
      if (!addedEdges.has(key)) {
        addedEdges.add(key);
        graph.addEdge({
          from: req.from,
          to: req.to,
          type,
          weight: req.weight ?? 1.0
        });
      }
    }
  } else if (scenario.requiredIds) {
    // Legacy synthetic graph derived from requiredIds
    const taskId = scenario.taskId || "task";
    for (const reqId of scenario.requiredIds) {
      const key = `${taskId}->${reqId}:requires_completion`;
      if (!addedEdges.has(key) && graph.getNode(reqId) && graph.getNode(taskId)) {
        addedEdges.add(key);
        graph.addEdge({
          from: taskId,
          to: reqId,
          type: "requires_completion",
          weight: 1.0
        });
      }
    }
  }

  // Attach metadata tag indicating synthetic vs explicit ground truth (Change 04)
  graph.metadata = {
    syntheticGroundTruth: !hasExplicitGraph
  };

  return graph;
}

/**
 * WAM Router selector function conforming to benchmark selector signature.
 * @param {Object} [options]
 * @param {number} [options.budget=4000]
 */
export function wamRouterSelector(options = {}) {
  const tokenBudget = options.budget ?? 4000;
  return function select(scenario) {
    const graph = buildBenchmarkGraph(scenario);
    const taskId = scenario.taskId || "task";

    let result;
    try {
      result = resolveContext(graph, { taskId, maxTokens: tokenBudget });
    } catch (e) {
      // Fallback if router fails on malformed scenario graph
      return {
        selectedIds: [],
        usedIds: [],
        pageFaults: 1,
        reacquiredTokens: 0
      };
    }

    const selectedIds = (result.nodes || []).map(n => n.id);
    const usedIds = selectedIds; // Router-selected nodes are used

    return {
      selectedIds,
      usedIds: undefined, // Change 05: Do not infer usedIds from selectedIds
      pageFaults: result.sufficient ? 0 : 1,
      reacquiredTokens: 0,
      routerResult: result
    };
  };
}
