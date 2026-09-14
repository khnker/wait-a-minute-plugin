/**
 * Context Router Dependency Closure — proper traversal without depth limits.
 *
 * Separates graph traversal from context admission.
 * Traversal finds ALL dependencies; admission decides which enter the pack.
 *
 * Safety limits (for preventing explosion):
 *   - maxNodes: maximum nodes to collect
 *   - maxTraversalCost: maximum operations
 *   - cycle detection via visited set
 *
 * These are SAFETY limits, not semantic limits.
 */

/**
 * @typedef {Object} TraversalOptions
 * @property {number} [maxNodes=100] - Safety limit for node count
 * @property {number} [maxCost=1000] - Safety limit for traversal operations
 * @property {string[]} [edgeTypes] - Edge types to follow (default: all)
 */

/**
 * @typedef {Object} TraversalResult
 * @property {string[]} nodes - Collected node IDs
 * @property {number} cost - Actual traversal cost
 * @property {boolean} limitReached - Whether safety limit was hit
 * @property {string} limitType - Which limit was reached (if any)
 */

/**
 * Traverse upstream dependencies from a node.
 * Follows depends_on and produces edges until:
 *   - no more edges
 *   - cycle detected
 *   - safety limit reached
 *
 * @param {Object} graph - Context graph
 * @param {string} startNodeId - Starting node
 * @param {TraversalOptions} options
 * @returns {TraversalResult}
 */
export function traverseUpstream(graph, startNodeId, options = {}) {
  const { maxNodes = 100, maxCost = 1000, edgeTypes } = options;

  const visited = new Set();
  const nodes = [];
  let cost = 0;

  const queue = [startNodeId];

  while (queue.length > 0) {
    cost++;
    if (cost > maxCost) {
      return {
        nodes,
        cost,
        limitReached: true,
        limitType: "maxCost",
      };
    }

    if (nodes.length >= maxNodes) {
      return {
        nodes,
        cost,
        limitReached: true,
        limitType: "maxNodes",
      };
    }

    const nodeId = queue.shift();

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.getNode(nodeId);
    if (!node) continue;

    nodes.push(nodeId);

    // Follow depends_on edges (upstream)
    const dependsOn = graph.getEdgesFromByType
      ? graph.getEdgesFromByType(nodeId, "depends_on")
      : graph.getEdgesFrom(nodeId).filter((e) => e.type === "depends_on");

    for (const edge of dependsOn) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }

    // Follow produces edges (reverse direction - who produces this node)
    const producesEdges = graph.getEdgesToByType
      ? graph.getEdgesToByType(nodeId, "produces")
      : graph.getEdgesTo(nodeId).filter((e) => e.type === "produces");

    for (const edge of producesEdges) {
      if (!visited.has(edge.from)) {
        queue.push(edge.from);
      }
    }
  }

  return {
    nodes,
    cost,
    limitReached: false,
    limitType: null,
  };
}

/**
 * Traverse downstream effects from a node.
 * Follows produces and depends_on edges in forward direction.
 *
 * @param {Object} graph - Context graph
 * @param {string} startNodeId - Starting node
 * @param {TraversalOptions} options
 * @returns {TraversalResult}
 */
export function traverseDownstream(graph, startNodeId, options = {}) {
  const { maxNodes = 100, maxCost = 1000 } = options;

  const visited = new Set();
  const nodes = [];
  let cost = 0;

  const queue = [startNodeId];

  while (queue.length > 0) {
    cost++;
    if (cost > maxCost) {
      return { nodes, cost, limitReached: true, limitType: "maxCost" };
    }

    if (nodes.length >= maxNodes) {
      return { nodes, cost, limitReached: true, limitType: "maxNodes" };
    }

    const nodeId = queue.shift();

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.getNode(nodeId);
    if (!node) continue;

    nodes.push(nodeId);

    // Follow produces edges (downstream)
    const produces = graph.getEdgesFromByType
      ? graph.getEdgesFromByType(nodeId, "produces")
      : graph.getEdgesFrom(nodeId).filter((e) => e.type === "produces");

    for (const edge of produces) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }

    // Follow depends_on edges (reverse - who depends on this)
    const dependsOnEdges = graph.getEdgesToByType
      ? graph.getEdgesToByType(nodeId, "depends_on")
      : graph.getEdgesTo(nodeId).filter((e) => e.type === "depends_on");

    for (const edge of dependsOnEdges) {
      if (!visited.has(edge.from)) {
        queue.push(edge.from);
      }
    }
  }

  return {
    nodes,
    cost,
    limitReached: false,
    limitType: null,
  };
}

/**
 * Compute full dependency closure for a set of nodes.
 * Combines upstream and downstream traversal.
 *
 * @param {Object} graph - Context graph
 * @param {string[]} nodeIds - Starting nodes
 * @param {TraversalOptions} options
 * @returns {TraversalResult}
 */
export function computeDependencyClosure(graph, nodeIds, options = {}) {
  const visited = new Set();
  const allNodes = [];
  let totalCost = 0;

  for (const nodeId of nodeIds) {
    const upstream = traverseUpstream(graph, nodeId, options);
    const downstream = traverseDownstream(graph, nodeId, options);

    for (const id of [...upstream.nodes, ...downstream.nodes]) {
      if (!visited.has(id)) {
        visited.add(id);
        allNodes.push(id);
      }
    }

    totalCost += upstream.cost + downstream.cost;

    if (upstream.limitReached || downstream.limitReached) {
      return {
        nodes: allNodes,
        cost: totalCost,
        limitReached: true,
        limitType: upstream.limitReached ? upstream.limitType : downstream.limitType,
      };
    }
  }

  return {
    nodes: allNodes,
    cost: totalCost,
    limitReached: false,
    limitType: null,
  };
}

/**
 * Check if traversal would hit safety limits.
 * Useful for pre-flight checks.
 *
 * @param {Object} graph - Context graph
 * @param {string} nodeId - Node to check
 * @param {TraversalOptions} options
 * @returns {{ safe: boolean, reason: string }}
 */
export function checkTraversalSafety(graph, nodeId, options = {}) {
  const result = traverseUpstream(graph, nodeId, { ...options, maxNodes: 10, maxCost: 20 });

  if (result.limitReached) {
    return {
      safe: false,
      reason: `Traversal hits ${result.limitType} limit early (${result.cost} ops, ${result.nodes.length} nodes)`,
    };
  }

  return { safe: true, reason: "Traversal within safety bounds" };
}
