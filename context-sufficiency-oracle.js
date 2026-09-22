/**
 * Context Sufficiency Oracle (C04 — context-sufficiency-oracle)
 *
 * Independent ground-truth verifier for context selection. Given a task and
 * a selected set of node IDs, computes the *required closure graph* — the
 * minimal set of nodes transitively required via REQUIRES / DEPENDS_ON edges
 * starting from the task — and verifies `selected ⊇ requiredClosure`.
 *
 * Independence: this module does NOT consult router heuristics, scoring
 * weights, or admission classes. It only walks the context-graph via edges
 * labeled REQUIRES or DEPENDS_ON, starting at the task node. Its verdict
 * is an objective ground-truth that the selection-router must satisfy.
 */

import { EDGE_TYPES } from "./context-graph.js";

/**
 * @typedef {Object} OracleNode
 * @property {string} id
 * @property {string} [type]
 * @property {string} [content]
 */

/**
 * @typedef {Object} OracleEdge
 * @property {string} from
 * @property {string} to
 * @property {string} type
 */

/**
 * @typedef {Object} OracleGraph
 * @property {(id: string) => OracleNode|undefined} getNode
 * @property {() => OracleEdge[]} getEdges
 * @property {(id: string) => OracleEdge[]} getEdgesFrom
 * @property {(id: string) => OracleEdge[]} getEdgesTo
 */

/**
 * @typedef {Object} OracleResult
 * @property {string} taskId
 * @property {string[]} requiredClosure - sorted node IDs that must be present
 * @property {string[]} selected       - input selected IDs (deduped, sorted)
 * @property {string[]} missing        - required ⊖ selected
 * @property {string[]} unused         - selected ⊖ required
 * @property {boolean} sufficient      - missing.length === 0
 * @property {Object}  stats
 */

/**
 * Default edge types that participate in the required closure walk.
 * Walking includes both outgoing (node → its requirements) and incoming
 * (other nodes that declare they require this node) so the closure is
 * symmetric under graph direction.
 */
const CLOSURE_EDGE_TYPES = new Set([
  EDGE_TYPES.REQUIRES,
  EDGE_TYPES.DEPENDS_ON,
  "requires",
  "depends_on",
  "DEPENDENCY",
]);

/**
 * Compute the required closure graph for a task — the minimal set of node
 * IDs that any sufficient context MUST include.
 *
 * @param {string} taskId
 * @param {OracleGraph} graph
 * @returns {string[]} sorted node IDs
 */
export function computeRequiredClosure(taskId, graph) {
  if (!taskId || typeof taskId !== "string") {
    throw new TypeError("computeRequiredClosure: taskId must be a non-empty string");
  }
  if (!graph || typeof graph.getNode !== "function") {
    throw new TypeError("computeRequiredClosure: graph with getNode() is required");
  }
  if (!graph.getNode(taskId)) {
    throw new Error(`computeRequiredClosure: task '${taskId}' not in graph`);
  }

  const closure = new Set([taskId]);
  const queue = [taskId];

  while (queue.length > 0) {
    const current = queue.shift();
    const related = [
      ...(graph.getEdgesFrom(current) || []),
      ...(graph.getEdgesTo(current) || []),
    ];

    for (const edge of related) {
      if (!CLOSURE_EDGE_TYPES.has(edge.type)) continue;
      const nextId = edge.from === current ? edge.to : edge.from;
      if (!nextId || closure.has(nextId)) continue;
      closure.add(nextId);
      queue.push(nextId);
    }
  }

  return [...closure].sort();
}

/**
 * Verify a selection against the oracle's required closure.
 *
 * @param {string} taskId
 * @param {OracleGraph} graph
 * @param {string[]|Set<string>} selected
 * @returns {OracleResult}
 */
export function verifySufficiency(taskId, graph, selected) {
  const required = computeRequiredClosure(taskId, graph);
  const selectedSet = new Set(selected || []);
  const requiredSet = new Set(required);

  const missing = required.filter((id) => !selectedSet.has(id));
  const unused = [...selectedSet].filter((id) => !requiredSet.has(id)).sort();

  const nodeCount = (graph.getEdges ? graph.getEdges().length : 0);

  return {
    taskId,
    requiredClosure: required,
    selected: [...selectedSet].sort(),
    missing,
    unused,
    sufficient: missing.length === 0,
    stats: {
      requiredCount: required.length,
      selectedCount: selectedSet.size,
      missingCount: missing.length,
      unusedCount: unused.length,
      graphEdgeCount: nodeCount,
    },
  };
}

/**
 * Convenience: derive sufficiency boolean without constructing the full
 * result object. Useful in test assertions.
 */
export function isSufficient(taskId, graph, selected) {
  return verifySufficiency(taskId, graph, selected).sufficient;
}

/**
 * Build a minimal oracle graph from a plain node/edge list. Helpful for tests
 * and for callers that don't have a full graph instance.
 *
 * @param {{nodes: OracleNode[], edges: OracleEdge[]}} spec
 * @returns {OracleGraph}
 */
export function buildOracleGraph(spec) {
  const nodes = new Map((spec.nodes || []).map((n) => [n.id, n]));
  const edges = spec.edges || [];

  return {
    getNode: (id) => nodes.get(id),
    getEdges: () => edges.slice(),
    getEdgesFrom: (id) => edges.filter((e) => e.from === id),
    getEdgesTo: (id) => edges.filter((e) => e.to === id),
  };
}

export const ORACLE_CLOSURE_EDGE_TYPES = [...CLOSURE_EDGE_TYPES];
